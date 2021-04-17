const sd = require('silly-datetime');

function setTimeDateFmt(s) {  // 个位数补齐十位数
    return s < 10 ? '0' + s : s;
}

/**
 * Module exports.
 * @public
 */
module.exports = {

    randomNumber: () => {
        const now = new Date()
        let month = now.getMonth() + 1
        let day = now.getDate()
        let hour = now.getHours()
        let minutes = now.getMinutes()
        let seconds = now.getSeconds()
        month = setTimeDateFmt(month)
        day = setTimeDateFmt(day)
        hour = setTimeDateFmt(hour)
        minutes = setTimeDateFmt(minutes)
        seconds = setTimeDateFmt(seconds)
        let orderCode = now.getFullYear().toString() + month.toString() + day + hour + minutes + seconds + (Math.round(Math.random() * 1000000)).toString();
        return orderCode;
    },

    log: (...msg) => {
        console.log('[' + sd.format(new Date(), 'MM-DD HH:mm:ss') + ']', ...msg);
    },

    precision: (num, pre) => {
        return Number(num.toFixed(pre + 1).slice(0, -1));
    }
};