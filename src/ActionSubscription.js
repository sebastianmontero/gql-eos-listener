const { gql } = require('apollo-boost');
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
        receiverEqualToAccountFilter = false,
        searches,
    }) {

        this.query = query;
        this.blockNum = blockNum;
        this.cursor = cursor;
        this.irreversible = irreversible;
        this.dbOps = dbOps;
        this.receiverEqualToAccountFilter = receiverEqualToAccountFilter;
        this.serialized = serialized;
        this.matchingActionsData = this._getMatchingActionsData(matchingActionsData);
        this.executedActionsData = this._getActionsData('executedActions', executedActionsData);
        this.searches = this._preprocessSearches(searches);
    }

    hasDBOps() {
        return !!this.dbOps;
    }

    shouldFilterDBOps() {
        return Array.isArray(this.dbOps);
    }

    getGQL() {
        const query = ` subscription {
            searchTransactionsForward(
                    query: "${this.query}" 
                    lowBlockNum:${this.blockNum}
                    irreversibleOnly:${this.irreversible}
                    ${this.cursor ? `cursor:"${this.cursor}"` : ''}
            ) {
                cursor
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
        }`
        console.log('Final query: ', query);
        return gql(query);
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
                    oldJSON{
                        object
                    }
                    newJSON{
                        object
                    }
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

    filterActions(actions) {
        if (this.receiverEqualToAccountFilter) {
            let filteredActions = [];
            for (let action of actions) {
                const { account, receiver } = action;
                if (account === receiver) {
                    filteredActions.push(action);
                }
            }
            return filteredActions;
        }
        return actions;
    }

}

module.exports = ActionSubscription;
