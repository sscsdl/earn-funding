const sd = require('silly-datetime');
const Binance = require('./binance');
const account = require('./account');
const utils = require('./utils')

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));
const binance = new Binance(account.getBinanceInfo('apiKey'), account.getBinanceInfo('secretKey'));


(async () => {
    var spotOrderId = null;
    var futuresOrderId = null;
    var spotCloseOrderId = null;
    var futuresCloseOrderId = null;
    var symbol = null;
    var buySpotQuantity = null;
    var buyFuturesQuantity = null;
    var buySpotPrice = null;
    var buyFuturesPrice = null;
    var sellSpotQuantity = null;
    var sellFuturesQuantity = null;

    // 对方当前时间
    var sdate = await binance.getTime();
    utils.log('server:', sd.format(sdate, 'YYYY-MM-DD HH:mm:ss'));
    // 校正后的当前时间
    var date = new Date();
    var timeDiff = date.getTime() - sdate.getTime();
    const getTimestamp = () => new Date().getTime() - timeDiff;
    utils.log(sd.format(new Date(getTimestamp()), 'YYYY-MM-DD HH:mm:ss'));

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
    // utils.log(spotOrderId);
    // var spotBuyRes = await binance.spotBuy(symbol,spotOrderId,null,buySpotQuantity,getTimestamp());
    // utils.log(spotBuyRes);

    // var spotCloseOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // utils.log(spotCloseOrderId);
    // var res = await binance.spotSell(symbol,spotCloseOrderId,null,sellSpotQuantity,getTimestamp());
    // utils.log(res);

    // spotCloseOrderId = '20210417075633833358';
    // res = await binance.getSpotOrder(symbol, spotCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // utils.log(res);
    // utils.log(utils.precision(res.cummulativeQuoteQty / res.executedQty, 6));
    // process.exit(1);

    // var futuresOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // var futuresCloseOrderId = sd.format(new Date(getTimestamp()), 'YYYYMMDDHHmmss');
    // utils.log(futuresOrderId);
    // var res = await binance.futuresLeverage(symbol,1,getTimestamp());
    // utils.log(res);
    // var res = await binance.futuresShort(symbol,futuresOrderId,null,quantity,getTimestamp());
    // utils.log(res);
    // futuresCloseOrderId = '20210417075633171170';
    // res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // utils.log(res);
    // utils.log(Number(res.avgPrice));
    // process.exit(1);

    // res = await binance.futuresShortClose(symbol,futuresCloseOrderId,null,quantity,getTimestamp());
    // utils.log(res);
    // res = await binance.getFuturesOrder(symbol, futuresCloseOrderId, getTimestamp()).catch(err => {
    //     if (err.body.code == -2013) { // 未下单
    //         return;
    //     }
    // });
    // if (!res) {
    //     process.exit(1);
    // }
    // utils.log(res);

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
                utils.log('wait...', hours, minutes);
                await snooze(60000);
                continue;
            }
            phase = 1;

        } else if (phase == 1) { // 获取最高费率且满足条件的交易
            // 按费率倒序排序
            let symbolIndex = 0;
            let list = await binance.getHighFundingFuturesList(0.0011);
            // utils.log('top funding:', list[symbolIndex]);

            while (true) {
                if (symbolIndex >= list.length) {
                    utils.log('symbolIndex >= list.length');
                    break;
                }
                symbol = list[symbolIndex]['symbol'];
                if (symbol == 'SCUSDT' || symbol == 'CHZUSDT') {
                    symbolIndex++;
                    continue;
                }
                utils.log('watch', symbol, list[symbolIndex]['indexPrice'], list[symbolIndex]['lastFundingRate']);

                // 检查余额
                let tradeAsset = account.getTradeAsset();
                let tradeAmount = account.getTradeAmount();
                var balance = await binance.getSpotBalance(tradeAsset, getTimestamp());
                utils.log('balance', balance);
                if (balance < tradeAmount) {
                    utils.log('余额不足', tradeAsset, tradeAmount, balance);
                    process.exit(1);
                }

                // 计算数量
                quantity = tradeAmount / list[symbolIndex]['markPrice'];
                utils.log('quantity', quantity);

                // 整理精度
                quantity = await binance.spotQuantityPrecision(symbol, quantity);
                utils.log('quantity', quantity);
                if (!quantity) {
                    utils.log('err quantity=0');
                    process.exit(1);
                }
                quantity = await binance.futuresQuantityPrecision(symbol, quantity);
                utils.log('quantity', quantity);
                if (!quantity) {
                    utils.log('err quantity=0');
                    process.exit(1);
                }

                // 检查规则
                let res = await binance.checkSpotFilter(symbol, list[symbolIndex]['markPrice'], quantity);
                if (res !== true) {
                    utils.log(res);
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
            utils.log('diffAvg', diffAvg);

            // 生成订单
            spotOrderId = utils.randomNumber();
            futuresOrderId = utils.randomNumber();
            utils.log('spotOrderId', spotOrderId);
            utils.log('futuresOrderId', futuresOrderId);

            // 设置合约倍数
            await binance.futuresLeverage(symbol, 1, getTimestamp());

            // 获取实时现货价格
            var wsSpot = binance.watchSpotPrice(symbol);

            // 获取实时合约价
            var watching = true;
            var gtAvgPrice = false;
            var wsFutures = binance.watchFuturesPrice(symbol, () => {
                if (!watching) return;
                if (binance.dataSpot.length <= 0) return;

                // 检查如果价格大于平均价2次就下单
                var diff = utils.precision(binance.dataFutures[binance.dataFutures.length - 1][1] - binance.dataSpot[binance.dataSpot.length - 1][1], 10);
                if (diff > diffAvg) {
                    if (!gtAvgPrice) {
                        gtAvgPrice = true;
                    } else {
                        gtAvgPrice = false;
                        watching = false;
                        utils.log('buy', binance.dataFutures[binance.dataFutures.length - 1][1], binance.dataSpot[binance.dataSpot.length - 1][1], diffAvg, '<', diff);
                        if (watching) return;
                        // 下合约单
                        binance.futuresShort(symbol, futuresOrderId, null, buyFuturesQuantity, getTimestamp());
                        // 下现货单
                        binance.spotBuy(symbol, spotOrderId, null, buySpotQuantity, getTimestamp());
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
            utils.log('waiting order');

            // 定时输出状态
            if (binance.dataSpot.length > 0 && binance.dataFutures.length > 0) {
                var diff = utils.precision(binance.dataFutures[binance.dataFutures.length - 1][1] - binance.dataSpot[binance.dataSpot.length - 1][1], 10);
                utils.log(binance.dataFutures[binance.dataFutures.length - 1][1], binance.dataSpot[binance.dataSpot.length - 1][1], diff);
            }
            await snooze(3000);

        } else if (phase == 4) { // 等待建仓结果
            utils.log('waiting result');

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
                utils.log('SpotOrder not complete');
                utils.log(res);
                process.exit(1);
            }
            utils.log('spot order');
            utils.log(res);
            buySpotPrice = utils.precision(res.cummulativeQuoteQty / res.executedQty, 6);
            utils.log('buySpotPrice', buySpotPrice);

            var res = await binance.getFuturesOrder(symbol, futuresOrderId, getTimestamp()).catch(err => {
                if (err.body.code == -2013) { // 未下单
                    return;
                }
            });
            if (!res) {
                process.exit(1);
            }
            if (res.status != 'FILLED') {
                utils.log('FuturesOrder not complete');
                utils.log(res);
                process.exit(1);
            }
            utils.log('futures order');
            utils.log(res);
            buyFuturesPrice = Number(res.avgPrice)
            utils.log('buyFuturesPrice', buyFuturesPrice);

            utils.log('order complete');

            if (!buySpotPrice) {
                utils.log('err buySpotPrice');
                process.exit(1);
            }
            if (!buyFuturesPrice) {
                utils.log('err buyFuturesPrice');
                process.exit(1);
            }

            phase = 5;
        } else if (phase == 5) { // 等待平仓

            // 开始前的30-15分钟
            let hours = new Date(getTimestamp()).getHours();
            // let minutes = new Date(getTimestamp()).getMinutes();
            if ((hours >= 23 ||
                (hours >= 7 && hours < 8) ||
                (hours >= 15 && hours < 16))// && 
                // minutes >= 30 && minutes < 45
            ) {
                utils.log('waiting close');
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
                utils.log('still high funding', list[index]['lastFundingRate']);
                await snooze(30000);
                continue;
            }

            // 已经低费率了 卖出和平仓

            var spotCloseOrderId = utils.randomNumber();
            var futuresCloseOrderId = utils.randomNumber();

            // 获取实时现货价格
            var wsSpot = binance.watchSpotPrice(symbol);

            // 获取实时合约价
            var watching = true;
            var confirm = false;
            var wsFutures = binance.watchFuturesPrice(symbol, () => {
                if (!watching) return;
                if (binance.dataSpot.length <= 0) return;

                // 检查如果价格确认2次就下单
                let spotDiff = binance.dataSpot[binance.dataSpot.length - 1][1] - buySpotPrice;
                let futuresDiff = binance.dataFutures[binance.dataFutures.length - 1][1] - buyFuturesPrice;
                if ((spotDiff > 0 && futuresDiff < 0) ||
                    (spotDiff > 0 && futuresDiff > 0 && spotDiff > futuresDiff) ||
                    // (spotDiff < 0 && futuresDiff > 0) ||
                    (spotDiff < 0 && futuresDiff < 0 && spotDiff > futuresDiff)) {

                    if (!confirm) {
                        confirm = true;
                    } else {
                        confirm = false;
                        watching = false;
                        utils.log('sell', binance.dataSpot[binance.dataSpot.length - 1][1], buySpotPrice, spotDiff, binance.dataFutures[binance.dataFutures.length - 1][1], buyFuturesPrice, futuresDiff);
                        if (watching) return;
                        // 现货卖出
                        binance.spotSell(symbol, spotCloseOrderId, null, sellSpotQuantity, getTimestamp());
                        // // 合约平仓
                        binance.futuresShortClose(symbol, futuresCloseOrderId, null, sellFuturesQuantity, getTimestamp());
                        phase = 7;
                        wsSpot.close();
                        wsFutures.close();
                    }
                } else {
                    confirm = false;
                }
            });
            // utils.log('ok');
            // process.exit(1);
            phase = 6

        } else if (phase == 6) { // 等待平仓
            utils.log('waiting close order');

            // 定时输出状态
            if (binance.dataSpot.length > 0 && binance.dataFutures.length > 0) {
                let spotDiff = binance.dataSpot[binance.dataSpot.length - 1][1] - buySpotPrice;
                let futuresDiff = binance.dataFutures[binance.dataFutures.length - 1][1] - buyFuturesPrice
                utils.log(binance.dataSpot[binance.dataSpot.length - 1][1], buySpotPrice, spotDiff, binance.dataFutures[binance.dataFutures.length - 1][1], buyFuturesPrice, futuresDiff);
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
                utils.log('SpotOrder not complete');
                utils.log(res);
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
                utils.log('FuturesOrder not complete');
                utils.log(res);
                process.exit(1);
            }

            utils.log('close complete');
            phase = 0;
        }
        // process.exit(1);
    }
})();