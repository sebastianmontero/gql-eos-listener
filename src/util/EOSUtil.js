const General = require('../const/General');


const parseAssetRegex = /^\s*(-?\d+.?\d*)\s*([a-zA-Z]+)\s*$/;

class EOSUtil {

    static normalizeStaked(amount) {
        return amount / General.STAKED_MULTIPLIER;
    }

    static getTypePath(account, type) {
        return `${account}/${type}`;
    }

    static parseTypePath(typePath) {
        const parts = typePath.split('/');
        return {
            account: parts[0],
            type: parts[1],
        };
    }

    static parseTablePath(fullPath) {
        const parts = fullPath.split('/');
        return {
            account: parts[0],
            scope: parts[1],
            table: parts[2],
            index: parts[3],
        };
    }

    static getShortTablePath(fullPath) {
        const { account, table } = EOSUtil.parseTablePath(fullPath);
        return `${account}/${table}`;
    }

    static parseAsset(value) {
        const result = parseAssetRegex.exec(value);
        if (result) {
            return {
                amount: Number(result[1]),
                symbol: result[2],
            };
        }
        return null;
    }

}

EOSUtil.blocksPerDay = (2 * 60 * 60 * 24);

module.exports = EOSUtil;