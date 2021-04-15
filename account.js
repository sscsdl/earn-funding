const { query } = require('./db')

function account (req) {
    if (!(this instanceof account)) {
        return new account(req)
    }
}

account.prototype.getPhase = function() {
    return 1;
}

account.prototype.getTradeAsset = function() {
    return 'USDT';
}

account.prototype.getTradeAmount = function() {
    return 100;
}

module.exports = account();