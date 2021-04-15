var sd = require('silly-datetime');
const binance = require('./binance');
const account = require('./account');
const util = require('./util')

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));


Earnfunding
(async () => {
    var spotOrderId = null;
    var futuresOrderId = null;
    var timer = null;
    var symbol = null;
    var quantity = null;

    // 本地当前时间
    var date = new Date();
    console.log('local:', sd.format(date, 'YYYY-MM-DD HH:mm:ss'));
    // 对方当前时间
    var sdate = await binance.getTime();
    console.log('server:', sd.format(sdate, 'YYYY-MM-DD HH:mm:ss'));
    // 校正后的当前时间
    var timeDiff = date.getTime() - sdate.getTime();
    const getTimestamp = () => new Date().getTime() - timeDiff;
    console.log(sd.format(new Date(getTimestamp()), 'YYYY-MM-DD HH:mm:ss'));

    var phase = account.getPhase(); 

    while (true) {

        if (phase == 0) { // 等时间

            // 开始前的15分钟
            let hours = new Date(getTimestamp()).getHours();
            let minutes = new Date(getTimestamp()).getHours();
            if (!((hours >= 23 || 
                (hours >= 7 && hours < 8) ||
                (hours >= 15 && hours < 16)) && 
                minutes >= 45 && minutes < 58)
            ) {
                await snooze(10000);
                console.log('wait...');
                continue;
            }
            phase = 1;

        } else if (phase == 1) { // 监听价格
            // 按费率倒序排序
            let symbolIndex = 0;
            let list = await binance.getHighFundingFuturesList(0.0011);
            console.log('top funding:', list[symbolIndex]);

            while (true) {
                if (symbolIndex >= list.length) {
                    console.log('symbolIndex >= list.length');
                    break;
                }
                symbol = list[symbolIndex]['symbol'];
                console.log('watch', symbol);

                // 检查余额
                let tradeAsset = account.getTradeAsset();
                let tradeAmount = account.getTradeAmount();
                // var balance = await binance.getBalance(tradeAsset, getTimestamp());
                // if (balance < tradeAmount) {
                //     console.log('余额不足', tradeAsset, tradeAmount, balance);
                //     process.exit(1);
                // }

                // 计算数量
                quantity = tradeAmount / list[symbolIndex]['markPrice'];
                console.log('quantity', quantity);

                // 整理精度
                quantity = await binance.spotQuantityPrecision(symbol, tradeAmount / list[symbolIndex]['markPrice']);
                console.log('quantity', quantity);
                if (!quantity) {
                    console.log('err quantity=0');
                    process.exit(1);
                }

                // 检查规则
                let res = await binance.checkSpotFilter(symbol, list[symbolIndex]['markPrice'], quantity);
                if (res !== true) {
                    console.log(res);
                    symbolIndex++;
                    continue;
                }

                break;
            }

            // await snooze(10000);
            // process.exit(1);

            // 过去5小时平均差价
            var diffAvg = await binance.getFundingDiffAvg(symbol, getTimestamp());
            console.log('diffAvg', diffAvg);

            // 获取实时现货价格
            var wsSpot = binance.watchSpotPrice(symbol);
            
            // 获取实时合约价
            var watching = true;
            var gtAvgPrice = false;
            var wsFutures = binance.watchFuturesPrice(symbol, ()=>{
                if (!watching) return;
                if (binance.dataSpot.length<=0) return;
                
                // 检查如果价格大于平均价2次就下单
                var diff = util.precision(binance.dataFutures[binance.dataFutures.length-1][1] - binance.dataSpot[binance.dataSpot.length-1][1],10);
                if (diff > diffAvg) {
                    if (!gtAvgPrice) {
                        gtAvgPrice = true;
                    } else {
                        gtAvgPrice = false;
                        watching = false;
                        console.log('diffAvg', diffAvg);
                        console.log('diff', diff);
                        console.log('buy', binance.dataFutures[binance.dataFutures.length-1][1]);
                        // 生成订单
                        spotOrderId = util.randomNumber();
                        futuresOrderId = util.randomNumber();
                        if (watching) return;
                        // 下现货单
                        // var spotBuyRes = binance.spotBuy(symbol,spotOrderId,null,quantity,getTimestamp());
                        // console.log(spotBuyRes);
                        // 下合约单
                        // var futuresShortRes = binance.futuresShort(symbol,futuresOrderId,null,quantity,getTimestamp());
                        // console.log(futuresShortRes);
                        phase = 3;
                        wsSpot.close();
                        wsFutures.close();
                    }
                } else {
                    gtAvgPrice = false;
                }
            });
            
            phase = 2;
        } else if (phase == 2) { // 等待下单
            console.log('waiting order');

            // 定时输出状态
            if (binance.dataSpot.length > 0 && binance.dataFutures.length > 0) {
                var diff = util.precision(binance.dataFutures[binance.dataFutures.length-1][1] - binance.dataSpot[binance.dataSpot.length-1][1],10);
                console.log(binance.dataFutures[binance.dataFutures.length-1][1], binance.dataSpot[binance.dataSpot.length-1][1], diff);
            }
            await snooze(3000);

        } else if (phase == 3) { // 等待结果
            console.log('waiting result');

            var res = await binance.getSpotOrder(symbol, spotOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            console.log(res);
            var res = await binance.getFuturesOrder(symbol, futuresOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            console.log(res);

            phase = 4;
        } else if (phase == 4) { // 等待平仓

            // 开始前的20-10分钟
            let hours = new Date(getTimestamp()).getHours();
            let minutes = new Date(getTimestamp()).getHours();
            if (!((hours >= 23 || 
                (hours >= 7 && hours < 8) ||
                (hours >= 15 && hours < 16)) && 
                minutes >= 40 && minutes < 50)
            ) {
                await snooze(60000);
                console.log('waiting close');
                continue;
            }
            
            // 获取费率高的
            let list = await binance.getHighFundingFuturesList(0.0011);
            // 看是否还是高费率
            let index = null;
            for (let i = 0; i < list.length; i++) {
                if (list[i]['symbol'] == symbol) {
                    index = i;
                    break;
                }
            }
            // 仍然高费率
            if (index !== null) {
                console.log('still high funding', list[i]['lastFundingRate']);
                await snooze(30000);
                continue;
            }
            // 已经低费率了 卖出和平仓
            let spotCloseOrderId = util.randomNumber();
            let res = binance.spotSell(symbol,closeOrderId,null,quantity,getTimestamp());
            console.log(res);
            let futuresCloseOrderId = util.randomNumber();
            res = binance.futuresShortClose(symbol,closeOrderId,null,quantity,getTimestamp());
            console.log(res);

            let waittingSell = true;
            while (waittingSell) {
                res = await binance.getSpotOrder(symbol, spotCloseOrderId, getTimestamp()).catch(err => {
                    if (err.body.code == -2013) { // 未下单
                        return;
                    }
                });
                if (!res) {
                    process.exit(1);
                }
                console.log(res);
                res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
                    if (err.body.code == -2013) { // 未下单
                        return;
                    }
                });
                if (!res) {
                    process.exit(1);
                }

                await snooze(30000);

                waittingSell = false;
            }

            phase = 0;
        }
        // process.exit(1);
    }
})();