const { gql } = require('apollo-boost');
const { Util } = require('./util');
const Search = require('./Search');

class ActionSubscription {

    constructor({
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

        this.query = query;
        this.blockNum = blockNum;
        this.cursor = cursor;
        this.irreversible = irreversible;
        this.dbOps = dbOps;
        this.serialized = serialized;
        this.matchingActionsData = this._getMatchingActionsData(matchingActionsData);
        this.executedActionsData = this._getActionsData('executedActions', executedActionsData);
        this.searches = this._preprocessSearches(searches);
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
                    status
                    block{
                        num
                        timestamp
                    }
                    ${this.matchingActionsData}
                    ${this.executedActionsData}
                }
            }
        }`;
    }

    _getMatchingActionsData(matchingActionsData) {

        if (!matchingActionsData) {
            matchingActionsData = ` seq
                                    receiver
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

        return this._getActionsData('matchingActions', matchingActionsData);
    }

    _getActionsData(actionType, data) {

        return data ? `
                ${actionType} { 
                ${data}
            }`:
            '';
    }

    _preprocessSearches(searches) {

        if (searches) {
            for (let key in searches) {
                searches[key] = new Search(searches[key]);
            }
        }
        return searches;
    }

    search(data) {
        if (!this.searches) {
            return null;
        }
        let searchResults = {};
        for (let key in this.searches) {
            searchResults[key] = this.searches[key].runSearch(data);
        }
        return searchResults;
    }

    updateProgress(blockNum, cursor) {
        this.blockNum = blockNum;
        this.cursor = cursor;
    }

}

module.exports = ActionSubscription;
