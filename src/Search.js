const { Util } = require('./util');

class Search {

    constructor(search) {
        this.listName = search.listName;
        this.search = this._preprocessSearch(search.search);
    }

    runSearch(data) {
        let results = [];
        for (let obj of data[this.listName]) {
            if (this.matches(obj)) {
                results.push(obj);
            }
        }
        return results;
    }

    matches(obj) {
        return this._matches(obj, this.search);
    }

    _preprocessSearch(search) {
        for (let prop in search) {
            search[prop] = this._processSearchTerm(search[prop]);
        }
        return search;
    }

    _processSearchTerm(term) {

        if (Util.isObject(term)) {
            return this._preprocessSearch(term);
        }

        return Array.isArray(term) ? term : [term];
    }

    _matches(obj, search) {
        if (!obj) {
            return false;
        }
        for (const prop in search) {
            const searchTerm = search[prop];
            if (Array.isArray(searchTerm)) {
                if (!this._leafMatches(searchTerm, obj[prop])) {
                    return false;
                }
            } else {
                if (!this._matches(obj[prop], searchTerm)) {
                    return false;
                }
            }
        }
        return true;
    }
    _leafMatches(searchTerm, value) {
        for (const searchValue of searchTerm) {
            if (searchValue === value) {
                return true;
            }
        }
        return false;
    }
}

module.exports = Search;