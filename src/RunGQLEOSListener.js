const GQLEOSListener = require('./GQLEOSListener');

class RunGQLEOSListener {

    async start() {

        const listener = new GQLEOSListener({
            "apiKey": "server_d34dc9a715ac76a7a0293ee554067628",
            "network": "mainnet",
            "endpoint": "mainnet.eos.dfuse.io",
        });

        const subrs = await listener.actionSubscription({
            query: "account:gftorderbook (db.table:buyorders OR db.table:sellorders)",
            blockNum: 48940000,
            dbOps: [{
                account: "gftorderbook",
                table: "buyorders",
                type: "buyorder"
            },
            {
                account: "gftorderbook",
                table: "sellorders",
                type: "sellorder"
            }],
            receiverEqualToAccountFilter: true,
            serialized: true,
        })
        subrs.subscribe({
            start: subscription => console.log("started", subscription),
            next: async value => {
                console.log(JSON.stringify(value, null, 2));
            },
            error: errorValue => console.log("error:", errorValue),
            complete: () => {
                console.log('Complete');
            }
        });
    }

    /* async start() {

        const listener = new GQLEOSListener({
            "apiKey": "server_d34dc9a715ac76a7a0293ee554067628",
            "network": "mainnet",
            "endpoint": "mainnet.eos.dfuse.io",
        });

        const subrs = await listener.actionSubscription({
            query: "receiver:gyftietokens account:gyftietokens (action:gyft OR action:gyft2)",
            blockNum: 48940000,
            executedActionsData: `
                seq
                receiver
                account
                name
                json
                creatorAction {
                    seq
                    receiver
                    account
                    name
                }
            `,
            searches: {
                transfers: {
                    listName: 'executedActions',
                    search: {
                        receiver: "gyftietokens",
                        account: "gyftietokens",
                        name: 'transfer',
                        creatorAction: {
                            name: ['issue', 'issuetostake']
                        }
                    }
                }
            }
        })
        subrs.subscribe({
            start: subscription => console.log("started", subscription),
            next: async value => {
                console.dir(value);
            },
            error: errorValue => console.log("error:", errorValue),
            complete: () => {
                console.log('Complete');
            }
        });
    } */
}

const listener = new RunGQLEOSListener();
listener.start().then(() => {
    console.log('finished!');
}).catch(error => {
    console.log('Error:', error);
});