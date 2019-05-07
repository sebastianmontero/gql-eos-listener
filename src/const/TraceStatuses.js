module.exports = {
    EXECUTED: "EXECUTED",
    SOFT_FAIL: "SOFT_FAIL",
    HARD_FAIL: "HARD_FAIL",
    DELAYED: "DELAYED",
    EXPIRED: "EXPIRED",
    UNKNOWN: "UNKNOWN",
    wasExecuted(status) {
        return this.EXECUTED == status;
    }
};