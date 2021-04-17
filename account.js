const { query } = require('./db')

function account (req) {
    if (!(this instanceof account)) {
        return new account(req)
    }
}

account.prototype.getPhase = function() {
    return 0;
}

account.prototype.getTradeAsset = function() {
    return 'USDT';
}

account.prototype.getTradeAmount = function() {
    return 80;
}

account.prototype.getBinanceInfo = k => {
    const info = {
        apiKey: '',
        secretKey: '',
    };
    if (k) {
        return info[k];
    }

    return info;
}

module.exports = account();