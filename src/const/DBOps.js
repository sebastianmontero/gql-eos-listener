module.exports = {
    REMOVE: 'rem',
    UPDATE: 'upd',
    INSERT: 'ins',
    isUpdate: function (op) {
        return this._isOp(op, this.UPDATE);
    },
    isInsert: function (op) {
        return this._isOp(op, this.INSERT);
    },
    isRemove: function (op) {
        return this._isOp(op, this.REMOVE);
    },
    _isOp: function (op, opType) {
        return op.toLowerCase() === opType;
    }
};