const { Api, JsonRpc } = require('eosjs');
const fetch = require('node-fetch');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const { getTypesFromAbi, createInitialTypes, hexToUint8Array, SerialBuffer } = require('eosjs/dist/eosjs-serialize');
const { TextEncoder, TextDecoder } = require('util');
const { EOSUtil } = require('../util');


class HexDecoder {

    constructor(endpoint) {
        this._abiMap = {};
        this._typeMap = {};
        this._eosJsApi = new Api({
            rpc: new JsonRpc(endpoint, { fetch, }),
            signatureProvider: new JsSignatureProvider([]),
            textDecoder: new TextDecoder(),
            textEncoder: new TextEncoder()
        });
    }

    async addType(typePath) {
        this.getType(typePath);
    }

    async getType(typePath) {

        if (!this._typeMap[typePath]) {
            const { account, type } = EOSUtil.parseTypePath(typePath);
            let abiTypes = await this._getAbiTypes(account);
            let abiType = abiTypes.get(type);
            if (!abiType) {
                throw new Error(`Non existant type: ${account}/${type}`);
            }
            this._typeMap[typePath] = abiType;
        }
        return this._typeMap[typePath];

    }

    async _getAbiTypes(codeAccount) {
        if (!this._abiMap[codeAccount]) {
            const abi = await this._eosJsApi.getAbi(codeAccount);
            const builtinTypes = createInitialTypes();
            this._abiMap[codeAccount] = getTypesFromAbi(builtinTypes, abi);
        }
        return this._abiMap[codeAccount];
    }

    async hexToJson(typePath, hexData) {
        let abiType = await this.getType(typePath);
        const data = hexToUint8Array(hexData);

        const buffer = new SerialBuffer({
            textDecoder: new TextDecoder(),
            textEncoder: new TextEncoder()
        });
        buffer.pushArray(data);
        return abiType.deserialize(buffer);
    }

}

module.exports = HexDecoder;