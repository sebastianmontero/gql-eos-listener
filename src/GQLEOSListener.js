const { isNode } = require('browser-or-node');
const ws = isNode && require('ws');
const fetch = isNode ? require('node-fetch') : undefined;
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const { ApolloClient } = require('apollo-client');
const { InMemoryCache } = require('apollo-cache-inmemory');
const { createDfuseClient } = require('@dfuse/client');
const { EventEmitter } = require('events');
const { EOSUtil } = require('./util');
const { Observable } = require('rxjs');
const ActionSubscription = require('./ActionSubscription');
const { TraceStatuses } = require('./const');


class GQLEOSListener extends EventEmitter {

    constructor(config) {
        super();
        this.config = config;
        const {
            apiKey,
            network,
        } = config;

        console.log(config);
        this.dfuseClient = this._createDfuseClient(apiKey, network);
        this.apolloClient = null;
        this.actionSubscriptions = [];

    }


    _createDfuseClient(apiKey, network) {

        return createDfuseClient({
            apiKey,
            network,
            httpClientOptions: {
                fetch,
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
                        let webSocket = null;
                        if (isNode) {
                            webSocket = new WebSocketClient(url, {
                                handshakeTimeout: 30 * 1000, // 30s
                                maxPayload: 200 * 1024 * 1000 * 1000 // 200Mb
                            });
                        } else {
                            webSocket = new WebSocket(url);
                        }

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
                this.emit('reconnected');
            });

            subscriptionClient.onError(() => {
                console.log('Connection Error');
                this.emit('error');
            });

            subscriptionClient.onDisconnected(() => {
                console.log('Disconnected!');
                this.emit('disconnected');
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
        receiverEqualToAccountFilter = false,
        serialized = false,
        searches,
        raw = false,
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
            receiverEqualToAccountFilter,
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
            receiverEqualToAccountFilter,
            serialized,
            searches,
        });

        if (actionSubscription.shouldFilterDBOps()) {
            actionSubscription.pDbOps = await this._preprocessDBOps(actionSubscription.dbOps);
        }

        const client = await this._getApolloClient();
        const _this = this;
        console.log('Subscribing...');

        return Observable.create(function (observer) {
            const query = actionSubscription.getGQL();
            client.subscribe({
                query,
            }).subscribe({
                next: async value => {
                    //console.dir(value);
                    const { searchTransactionsForward } = value.data;
                    if (raw) {
                        return observer.next(searchTransactionsForward);
                    }
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

                    if (actionSubscription.shouldFilterDBOps()) {
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
                    if (dbOp.oldJSON.object) {
                        result.oldData = dbOp.oldJSON.object;
                        delete result.oldJSON;
                    }
                    if (dbOp.oldJSON.object) {
                        result.newData = dbOp.oldJSON.object;
                        delete result.newJSON;
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
        }
        return pDbOps;
    }

}

module.exports = GQLEOSListener;