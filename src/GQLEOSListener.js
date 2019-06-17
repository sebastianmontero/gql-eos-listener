const ws = require('ws');
const fetch = require('node-fetch');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { createDfuseClient } = require('@dfuse/client');
const { HexDecoder } = require('./service');
const { EOSUtil } = require('./util');
const { Observable } = require('rxjs');
const ActionSubscription = require('./ActionSubscription');
const { TraceStatuses } = require('./const');


class GQLEOSListener {

    constructor(config) {
        this.config = config;
        const {
            apiKey,
            network,
            endpoint,
        } = config;

        console.log(config);
        this.decoder = new HexDecoder(`https://${endpoint}`);
        this.dfuseClient = this._createDfuseClient(apiKey, network);
        this.apolloClient = null;
        this.actionSubscriptions = [];

    }


    _createDfuseClient(apiKey, network) {
        return createDfuseClient({
            apiKey,
            network,
            httpClientOptions: {
                fetch: fetch
            },
            streamClientOptions: {
                socketOptions: {
                    webSocketFactory: async (url) => {

                        /**
                        * The factory receives the full resolved URL, API token included,
                        * of the remote endpoint to connect to.
                        *
                        * It's here also, when using the Node.js enviroment, in your own
                        * factory, that you can customize the WebSocket client instance.
                        * In the factory below, we jump the `maxPayload` size to 200M,
                        * this can be useful when streaming really big tables like the
                        * `voters` table on EOS.
                        *
                        * We also add an error logging of errors occurring at the HTTP Upgrade
                        * level before turning the connection into a WebSocket connection. This
                        * can happens when authorization happens with your API token.
                        *
                        * **Note** Don't try to override the `onopen`, `onclose`, `onerror`
                        * and `onmessage` handler, they are overwritten by the `Socket` instance
                        * for its own usage.
                        *
                        * **Important Web Browser Usage Notice**
                        * We are in a Node.js context here, the `WebSocketClient` is a
                        * Node.js implementation of WebSocket Protocol. It does not have
                        * quite the same API interface, the configuration done below
                        * will not work in a Browser environment! Check W3C Browser
                        * WebSocket API to see what is accepted as it's second argument.
                        *
                        * @see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#Parameters
                        */
                        const webSocket = new WebSocketClient(url, {
                            handshakeTimeout: 30 * 1000, // 30s
                            maxPayload: 200 * 1024 * 1000 * 1000 // 200Mb
                        })

                        const onUpgrade = (response) => {
                            console.log("Socket upgrade response status code.", response.statusCode)
                            // You need to remove the listener at some point since this factory
                            // is called at each re-connection with the remote endpoint!
                            webSocket.removeListener("upgrade", onUpgrade)
                        }
                        webSocket.on("upgrade", onUpgrade)

                        return webSocket
                    }
                }
            }
        });
    }

    async _getApolloClient() {

        if (!this.apolloClient) {
            console.log('Getting token...');
            const tokenInfo = await this.dfuseClient.getTokenInfo();;

            console.log('Creating subscription client...');
            const subscriptionClient = new SubscriptionClient(`wss://${this.config.endpoint}/graphql`, {
                lazy: true,
                reconnect: true,
                connectionParams: () => {
                    return { Authorization: `Bearer ${tokenInfo.token}` };
                },
                connectionCallback: (error, result) => {
                    if (error) {
                        console.log("Error connecting to graphQL endpoint", error);
                    } else {
                        console.log("Connected to the graphQL endpoint!");
                    }
                }
            }, ws);

            subscriptionClient.onReconnected(() => {
                console.log('Reconnected!');
            });

            subscriptionClient.onError(() => {
                console.log('Connection Error');
            });

            subscriptionClient.onDisconnected(() => {
                console.log('Disconnected!');
            });

            console.log('Creating WebSocketLink...');
            const wsLink = new WebSocketLink(subscriptionClient);
            console.log('Creating apollo client...');
            this.apolloClient = new ApolloClient({ link: wsLink, cache: new InMemoryCache() });
        }
        return this.apolloClient;
    }

    async actionSubscription({
        query,
        matchingActionsData,
        executedActionsData,
        blockNum = 0,
        cursor,
        irreversible = true,
        dbOps,
        serialized = false,
        searches,
    }) {
        console.log('Subscription Data:');
        console.dir({
            query,
            matchingActionsData,
            executedActionsData,
            blockNum,
            cursor,
            irreversible,
            dbOps,
            serialized,
            searches,
        });
        let actionSubscription = new ActionSubscription({
            query,
            matchingActionsData,
            executedActionsData,
            blockNum,
            cursor,
            irreversible,
            dbOps,
            serialized,
            searches,
        });

        if (actionSubscription.hasDBOps()) {
            actionSubscription.pDbOps = await this._preprocessDBOps(actionSubscription.dbOps);
        }

        const client = await this._getApolloClient();
        const _this = this;
        console.log('Subscribing...');

        return Observable.create(function (observer) {
            client.subscribe({
                query: actionSubscription.getGQL(),
            }).subscribe({
                next: async value => {
                    //console.dir(value);
                    const { searchTransactionsForward } = value.data;

                    const {
                        cursor,
                        undo,
                        trace,
                        trace: {
                            status,
                            block: {
                                num: blockNum,
                                timestamp: blockTime,
                            },
                            executedActions,
                        }
                    } = searchTransactionsForward;

                    let { matchingActions } = trace;

                    if (!TraceStatuses.wasExecuted(status)) {
                        return;
                    }

                    matchingActions = actionSubscription.filterActions(matchingActions);

                    if (actionSubscription.hasDBOps()) {
                        for (let action of matchingActions) {
                            action.dbOps = await _this._extractDBOps(action.dbOps, actionSubscription.pDbOps);
                        }
                    }

                    let queryResults = actionSubscription.search(trace);

                    if (actionSubscription.serialized) {
                        for (let matchingAction of matchingActions) {
                            observer.next({
                                cursor,
                                undo,
                                blockNum,
                                blockTime,
                                actionSeq: matchingAction.seq,
                                actionData: matchingAction,
                            });
                        }
                    } else {
                        let payload = {
                            cursor,
                            undo,
                            blockNum,
                            blockTime,
                            matchingActions,
                        };
                        if (executedActions) {
                            payload.executedActions = executedActions;
                        }
                        if (queryResults) {
                            payload.queryResults = queryResults;
                        }
                        observer.next(payload);
                    }


                },
                error: error => observer.error(error),
                complete: error => observer.complete(error),
            });

        });

    }

    async stop() {
        if (this.apolloClient) {
            return await this.apolloClient.stop();
        }
    }

    async _extractDBOps(dbOps, requestedTables) {
        let results = {};
        if (requestedTables && dbOps) {
            for (let dbOp of dbOps) {
                const { key: { code, table } } = dbOp;
                const tablePath = EOSUtil.getTypePath(code, table);
                let typePath = requestedTables[tablePath];
                if (typePath) {
                    let result = { ...dbOp };
                    if (dbOp.oldData) {
                        result.oldData = await this.decoder.hexToJson(typePath, dbOp.oldData);
                    }
                    if (dbOp.newData) {
                        result.newData = await this.decoder.hexToJson(typePath, dbOp.newData);
                    }
                    if (!results[tablePath]) {
                        results[tablePath] = [];
                    }
                    results[tablePath].push(result);
                }
            }
        }
        return results;
    }

    async _preprocessDBOps(dbOps) {

        dbOps = dbOps || [];
        let pDbOps = {};

        for (let dbOp of dbOps) {
            const typePath = EOSUtil.getTypePath(dbOp.account, dbOp.type);
            const tablePath = EOSUtil.getTypePath(dbOp.account, dbOp.table);
            pDbOps[tablePath] = typePath;
            await this.decoder.addType(typePath);

        }
        return pDbOps;
    }

}

module.exports = GQLEOSListener;