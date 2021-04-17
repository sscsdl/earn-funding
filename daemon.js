var sd = require('silly-datetime');
const binance = require('./binance');
const account = require('./account');
const util = require('./util')

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    var spotOrderId = null;
    var futuresOrderId = null;
    var spotCloseOrderId = null;
    var futuresCloseOrderId = null;
    var timer = null;
    var symbol = null;
    var buySpotQuantity = null;
    var buyFuturesQuantity = null;
    var buySpotPrice = null;
    var buyFuturesPrice = null;
    var sellSpotQuantity = null;
    var sellFuturesQuantity = null;

    // 对方当前时间
    var sdate = await binance.getTime();
    console.log('server:', sd.format(sdate, 'YYYY-MM-DD HH:mm:ss'));
    // 本地当前时间
    var date = new Date();
    console.log('local:', sd.format(date, 'YYYY-MM-DD HH:mm:ss'));
    // 校正后的当前时间
    var timeDiff = date.getTime() - sdate.getTime();
    const getTimestamp = () => new Date().getTime() - timeDiff;
    console.log(sd.format(new Date(getTimestamp()), 'YYYY-MM-DD HH:mm:ss'));

    var phase = account.getPhase(); 

    // var phase = 5;
    // var symbol = 'CHZUSDT';
    // var buySpotQuantity = buyFuturesQuantity = 20;
    // var buySpotPrice = 0;
    // var sellSpotQuantity = sellFuturesQuantity = 20;
    // var diffAvg = 0.0015959;

    // var spotOrderId = '20210415231506';
    // var futuresOrderId = '20210415225110';

    // var spotOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // console.log(spotOrderId);
    // var spotBuyRes = await binance.spotBuy(symbol,spotOrderId,null,buySpotQuantity,getTimestamp());
    // console.log(spotBuyRes);

    // var spotCloseOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // console.log(spotCloseOrderId);
    // var res = await binance.spotSell(symbol,spotCloseOrderId,null,sellSpotQuantity,getTimestamp());
    // console.log(res);

    // spotCloseOrderId = '20210417075633833358';
    // res = await binance.getSpotOrder(symbol, spotCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // console.log(res);
    // console.log(util.precision(res.cummulativeQuoteQty / res.executedQty, 6));
    // process.exit(1);

    // var futuresOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // var futuresCloseOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // console.log(futuresOrderId);
    // var res = await binance.futuresLeverage(symbol,1,getTimestamp());
    // console.log(res);
    // var res = await binance.futuresShort(symbol,futuresOrderId,null,quantity,getTimestamp());
    // console.log(res);
    // futuresCloseOrderId = '20210417075633171170';
    // res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // console.log(res);
    // console.log(Number(res.avgPrice));
    // process.exit(1);

    // res = await binance.futuresShortClose(symbol,futuresCloseOrderId,null,quantity,getTimestamp());
    // console.log(res);
    // res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // console.log(res);

    // process.exit(1);

    while (true) {

        if (phase == 0) { // 等时间

            // 开始前的15分钟
            let hours = new Date(getTimestamp()).getHours();
            let minutes = new Date(getTimestamp()).getMinutes();
            if (!((hours >= 23 || 
                (hours >= 7 && hours < 8) ||
                (hours >= 15 && hours < 16)) && 
                minutes >= 45 && minutes <= 59)
            ) {
                await snooze(10000);
                console.log('wait...', hours, minutes);
                continue;
            }
            phase = 1;

        } else if (phase == 1) { // 获取最高资金费率且满足条件的交易
            // 按费率倒序排序
            let symbolIndex = 0;
            let list = await binance.getHighFundingFuturesList(0.0011);
            // console.log('top funding:', list[symbolIndex]);

            while (true) {
                if (symbolIndex >= list.length) {
                    console.log('symbolIndex >= list.length');
                    break;
                }
                symbol = list[symbolIndex]['symbol'];
                console.log('watch', symbol, list[symbolIndex]['indexPrice'], list[symbolIndex]['lastFundingRate']);

                // 检查余额
                let tradeAsset = account.getTradeAsset();
                let tradeAmount = account.getTradeAmount();
                var balance = await binance.getSpotBalance(tradeAsset, getTimestamp());
                console.log('balance', balance);
                if (balance < tradeAmount) {
                    console.log('余额不足', tradeAsset, tradeAmount, balance);
                    process.exit(1);
                }

                // 计算数量
                quantity = tradeAmount / list[symbolIndex]['markPrice'];
                console.log('quantity', quantity);

                // 整理精度
                quantity = await binance.spotQuantityPrecision(symbol, quantity);
                console.log('quantity', quantity);
                if (!quantity) {
                    console.log('err quantity=0');
                    process.exit(1);
                }
                quantity = await binance.futuresQuantityPrecision(symbol, quantity);
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
                
                buySpotQuantity = buyFuturesQuantity = quantity;
                sellSpotQuantity = sellFuturesQuantity = quantity

                phase = 2;
                break;
            }

            if (phase == 1) {
                await snooze(10000);
            }
            // process.exit(1);

        } else if (phase == 2) { // 监听价差准备下单

            // 过去5小时平均差价
            var diffAvg = await binance.getFundingDiffAvg(symbol, getTimestamp());
            console.log('diffAvg', diffAvg);
            
            // 生成订单
            spotOrderId = util.randomNumber();
            futuresOrderId = util.randomNumber();
            console.log('spotOrderId', spotOrderId);
            console.log('futuresOrderId', futuresOrderId);

            // 设置合约倍数
            await binance.futuresLeverage(symbol,1,getTimestamp());

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
                        console.log('buy', binance.dataFutures[binance.dataFutures.length-1][1], binance.dataSpot[binance.dataSpot.length-1][1], diffAvg, '<', diff);
                        if (watching) return;
                        // 下合约单
                        binance.futuresShort(symbol,futuresOrderId,null,buyFuturesQuantity,getTimestamp());
                        // console.log(futuresShortRes);
                        // 下现货单
                        binance.spotBuy(symbol,spotOrderId,null,buySpotQuantity,getTimestamp());
                        // console.log(spotBuyRes);
                        phase = 4;
                        wsSpot.close();
                        wsFutures.close();
                    }
                } else {
                    gtAvgPrice = false;
                }
            });
            
            phase = 3;
        } else if (phase == 3) { // 等待下单
            console.log('waiting order');

            // 定时输出状态
            if (binance.dataSpot.length > 0 && binance.dataFutures.length > 0) {
                var diff = util.precision(binance.dataFutures[binance.dataFutures.length-1][1] - binance.dataSpot[binance.dataSpot.length-1][1],10);
                console.log(binance.dataFutures[binance.dataFutures.length-1][1], binance.dataSpot[binance.dataSpot.length-1][1], diff);
            }
            await snooze(3000);

        } else if (phase == 4) { // 等待建仓结果
            console.log('waiting result');

            await snooze(5000);
            
            var res = await binance.getSpotOrder(symbol, spotOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            if (res.status != 'FILLED') {
                console.log('SpotOrder not complete');
                console.log(res);
                process.exit(1);
            }
            console.log('spot order');
            console.log(res);
            buySpotPrice = util.precision(res.cummulativeQuoteQty / res.executedQty, 6);
            console.log('buySpotPrice', buySpotPrice);
            
            var res = await binance.getFuturesOrder(symbol, futuresOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            if (res.status != 'FILLED') {
                console.log('FuturesOrder not complete');
                console.log(res);
                process.exit(1);
            }
            console.log('futures order');
            console.log(res);
            buyFuturesPrice = Number(res.avgPrice)
            console.log('buyFuturesPrice', buyFuturesPrice);

            console.log('order complete');
            
            if (!buySpotPrice) {
                console.log('err buySpotPrice');
                process.exit(1);
            }
            if (!buyFuturesPrice) {
                console.log('err buyFuturesPrice');
                process.exit(1);
            }

            phase = 5;
        } else if (phase == 5) { // 等待平仓

            // 开始前的30-15分钟
            let hours = new Date(getTimestamp()).getHours();
            let minutes = new Date(getTimestamp()).getMinutes();
            if (!(hours >= 23 || 
                (hours >= 7 && hours < 8) ||
                (hours >= 15 && hours < 16))// && 
                // minutes >= 30 && minutes < 45
            ) {
                console.log('waiting close');
                await snooze(60000);
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
                console.log('still high funding', list[index]['lastFundingRate']);
                await snooze(30000);
                continue;
            }

            // 已经低费率了 卖出和平仓

            var spotCloseOrderId = util.randomNumber();
            var futuresCloseOrderId = util.randomNumber();
            
            // 获取实时现货价格
            var wsSpot = binance.watchSpotPrice(symbol);
            
            // 获取实时合约价
            var watching = true;
            var ltAvgPrice = false;
            var wsFutures = binance.watchFuturesPrice(symbol, ()=>{
                if (!watching) return;
                if (binance.dataSpot.length<=0) return;
                
                // 检查如果价格大于平均价2次就下单
                // var diff = util.precision(binance.dataFutures[binance.dataFutures.length-1][1] - binance.dataSpot[binance.dataSpot.length-1][1],10);
                let spotDiff = binance.dataSpot[binance.dataSpot.length-1][1] - buySpotPrice;
                let futuresDiff = binance.dataFutures[binance.dataFutures.length-1] - buyFuturesPrice
                if ((spotDiff > 0 && futuresDiff < 0) ||
                    (spotDiff > 0 && futuresDiff > 0 && spotDiff > futuresDiff * -1) ||
                    // (spotDiff < 0 && futuresDiff > 0) ||
                    (spotDiff < 0 && futuresDiff < 0 && spotDiff * -1 > futuresDiff)) {

                    // }
                // if (buyFuturesPrice - binance.dataFutures[binance.dataFutures.length-1] > binance.dataSpot[binance.dataSpot.length-1][1] - buySpotPrice)
                // if (diff < diffAvg) {
                    if (!ltAvgPrice) {
                        ltAvgPrice = true;
                    } else {
                        ltAvgPrice = false;
                        watching = false;
                        console.log('sell', binance.dataSpot[binance.dataSpot.length-1][1], buySpotPrice, binance.dataFutures[binance.dataFutures.length-1][1], buyFuturesPrice);
                        // 生成订单
                        spotOrderId = util.randomNumber();
                        futuresOrderId = util.randomNumber();
                        if (watching) return;
                        // 现货卖出
                        binance.spotSell(symbol,spotCloseOrderId,null,sellSpotQuantity,getTimestamp());
                        // // 合约平仓
                        binance.futuresShortClose(symbol,futuresCloseOrderId,null,sellFuturesQuantity,getTimestamp());
                        phase = 7;
                        wsSpot.close();
                        wsFutures.close();
                    }
                } else {
                    ltAvgPrice = false;
                }
            });
            // console.log('ok');
            // process.exit(1);
            phase = 6

        } else if (phase == 6) { // 等待平仓
            console.log('waiting order');

            // 定时输出状态
            if (binance.dataSpot.length > 0 && binance.dataFutures.length > 0) {
                var diff = util.precision(binance.dataFutures[binance.dataFutures.length-1][1] - binance.dataSpot[binance.dataSpot.length-1][1],10);
                console.log(binance.dataFutures[binance.dataFutures.length-1][1], binance.dataSpot[binance.dataSpot.length-1][1], diff);
            }
            await snooze(3000);
        } else if (phase == 7) { // 等待平仓结果

            await snooze(3000);
            res = await binance.getSpotOrder(symbol, spotCloseOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            if (res.status != 'FILLED') {
                console.log('SpotOrder not complete');
                console.log(res);
                process.exit(1);
            }
            
            res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            if (res.status != 'FILLED') {
                console.log('FuturesOrder not complete');
                console.log(res);
                process.exit(1);
            }

            console.log('close complete');
            phase = 0;
        }
        // process.exit(1);
    }
})();