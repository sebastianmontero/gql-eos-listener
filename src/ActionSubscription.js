const { gql } = require('apollo-boost');

class ActionSubscription {

    constructor({
        query,
        matchingActionsData,
        blockNum = 0,
        cursor,
        irreversible = true,
        dbOps,
    }) {

        this.query = query;
        this.blockNum = blockNum;
        this.cursor = cursor;
        this.irreversible = irreversible;
        this.dbOps = dbOps;
        this.matchingActionsData = this._getMatchingActionsData(matchingActionsData);
    }

    hasDBOps() {
        return !!this.dbOps;
    }

    getGQL() {
        return gql` subscription {
            searchTransactionsForward(
                    query: "${this.query}" 
                    lowBlockNum:${this.blockNum}
                    irreversibleOnly:${this.irreversible}
                    ${this.cursor ? `cursor:"${this.cursor}"` : ''}
            ) {
                cursor
                undo
                trace {
                    id
                    block{
                        num
                        timestamp
                    }
                    ${this.matchingActionsData}
                }
            }
        }`;
    }

    _getMatchingActionsData(matchingActionsData) {

        if (!matchingActionsData) {
            matchingActionsData = `receiver
                                    account
                                    name
                                    json`;
        }

        if (this.hasDBOps()) {
            matchingActionsData += `
                dbOps {
                        operation
                        oldPayer
                        newPayer
                        key {
                            code
                            table
                            scope
                            key
                        }
                    oldData
                    newData
                }`;
        }

        matchingActionsData = `
            matchingActions { 
                ${matchingActionsData}
            }`;

        return matchingActionsData;
    }

    updateProgress(blockNum, cursor) {
        this.blockNum = blockNum;
        this.cursor = cursor;
    }

}

module.exports = ActionSubscription;
