/**
 * Module dependencies.
 * @private
 */
const request = require('request');
const crypto = require('crypto');
const WebSocket = require('ws');
const tunnel = require('tunnel');
const util = require('./util')

function binance (req) {
    if (!(this instanceof binance)) {
        return new binance(req)
    }

    this.spotUrl = 'https://api.binance.com';
    this.spotWSUrl = 'wss://stream.binance.com:9443/ws/';
    this.futuresUrl = 'https://fapi.binance.com';
    this.futuresWSUrl = 'wss://fstream.binance.com/ws/';
    this.deliveryUrl = 'https://dapi.binance.com';
    this.deliveryWSUrl = 'wss://dstream.binance.com/ws/';
    this.apiKey = '';
    this.secretKey = '';

    this.proxy = null;
    let match;
    if (process.env.http_proxy != null) {
        match = process.env.http_proxy.match(/^(http:\/\/)?([^:\/]+)(:([0-9]+))?/i);
        if (match) {
            this.proxy = {
                scheme: 'http',
                host: match[2],
                port: (match[4] != null ? match[4] : 80),
            }
        }
    }

    this.dataSpot = []; 
    this.dataFutures = [];
    // this.spotExchangeInfo = [];
    this.spotExchangeInfo = new Map();
    this.getSpotExchangeInfoAlready = false;
}

binance.prototype.getTime = async function() {
    let url = this.spotUrl + '/api/v3/time';
    let data = await this.get(url);
    return new Date(data.serverTime);
}


// [
//     {
//         "symbol": "BTCUSDT",                 // 交易对
//         "markPrice": "11793.63104562",       // 标记价格
//         "indexPrice": "11781.80495970",      // 指数价格
//         "estimatedSettlePrice": "11781.16138815",  // 预估结算价,仅在交割开始前最后一小时有意义
//         "lastFundingRate": "0.00038246",     // 最近更新的资金费率
//         "nextFundingTime": 1597392000000,    // 下次资金费时间
//         "interestRate": "0.00010000",        // 标的资产基础利率
//         "time": 1597370495002                // 更新时间
//     }
// ]
binance.prototype.getHighFundingFuturesList = async function(least) {
    let url = this.futuresUrl + '/fapi/v1/premiumIndex';
    let data = await this.get(url);
    data.sort(function(m,n){return n['lastFundingRate']-m['lastFundingRate'];});
    if (least) {
        let index = 0;
        for(var i in data) {
            index = i;
            // console.log(index, Number(data[i]['lastFundingRate']));
            if (Number(data[i]['lastFundingRate']) < least) break;
        }
        return data.slice(0, index);
    }
    return data;
}

// {
//     makerCommission: 10,
//     takerCommission: 10,
//     buyerCommission: 0,
//     sellerCommission: 0,
//     canTrade: true,
//     canWithdraw: true,
//     canDeposit: true,
//     updateTime: 1618363188173,
//     accountType: 'SPOT',
//     balances: [
//       { asset: 'BTC', free: '0.00168000', locked: '0.00000000' },
//       { asset: 'LTC', free: '0.00000000', locked: '0.00000000' },
//       { asset: 'ETH', free: '0.04715000', locked: '0.00000000' },
//     ]
// }
binance.prototype.getSpotBalance = async function(asset, timestamp) {
    let url = this.spotUrl + '/api/v3/account';
    let data = await this.get(url, {
        timestamp: timestamp,
    }, true);
    for (let i = 0; i < data['balances'].length; i++) {
        if (data['balances'][i]['asset'] == asset) return Number(data['balances'][i]['free']);
    }
    return 0;
}

binance.prototype.transfer = async function(type, asset, amount, timestamp) {
    let url = this.spotUrl + '/sapi/v1/asset/transfer';
    let data = await this.post(url, {
        // MAIN_C2C 现货钱包转向C2C钱包
        // MAIN_UMFUTURE 现货钱包转向U本位合约钱包
        // MAIN_CMFUTURE 现货钱包转向币本位合约钱包
        // MAIN_MARGIN 现货钱包转向杠杆全仓钱包
        // MAIN_MINING 现货钱包转向矿池钱包
        // C2C_MAIN C2C钱包转向现货钱包
        // C2C_UMFUTURE C2C钱包转向U本位合约钱包
        // C2C_MINING C2C钱包转向矿池钱包
        // UMFUTURE_MAIN U本位合约钱包转向现货钱包
        // UMFUTURE_C2C U本位合约钱包转向C2C钱包
        // UMFUTURE_MARGIN U本位合约钱包转向杠杆全仓钱包
        // CMFUTURE_MAIN 币本位合约钱包转向现货钱包
        // MARGIN_MAIN 杠杆全仓钱包转向现货钱包
        // MARGIN_UMFUTURE 杠杆全仓钱包转向U本位合约钱包
        // MINING_MAIN 矿池钱包转向现货钱包
        // MINING_UMFUTURE 矿池钱包转向U本位合约钱包
        // MINING_C2C 矿池钱包转向C2C钱包
        // MARGIN_CMFUTURE 杠杆全仓钱包转向币本位合约钱包
        // CMFUTURE_MARGIN 币本位合约钱包转向杠杆全仓钱包
        // MARGIN_C2C 杠杆全仓钱包转向C2C钱包
        // C2C_MARGIN C2C钱包转向杠杆全仓钱包
        // MARGIN_MINING 杠杆全仓钱包转向矿池钱包
        // MINING_MARGIN 矿池钱包转向杠杆全仓钱包
        type: type,
        asset: asset,
        amount:	amount,
        // recvWindow:	LONG	NO	
        timestamp: timestamp,
    }, true);
    return 0;
}

// {
//     "timezone": "UTC",
//     "serverTime": 1565246363776,
//     "rateLimits": [
//         {
//             //这些在"限制种类 (rateLimitType)"下的"枚举定义"部分中定义
//             //所有限制都是可选的
//         }
//     ],
//     "exchangeFilters": [
//             //这些是"过滤器"部分中定义的过滤器
//             //所有限制都是可选的
//     ],
//     "symbols": [
//         {
//             "symbol": "ETHBTC",
//             "status": "TRADING",
//             "baseAsset": "ETH",
//             "baseAssetPrecision": 8, // 标的资产精度
//             "quoteAsset": "BTC",
//             "quotePrecision": 8, // 报价资产精度
//             "quoteAssetPrecision": 8, // 即将废除
//             "orderTypes": [
//                 "LIMIT",
//                 "LIMIT_MAKER",
//                 "MARKET",
//                 "STOP_LOSS",
//                 "STOP_LOSS_LIMIT",
//                 "TAKE_PROFIT",
//                 "TAKE_PROFIT_LIMIT"
//             ],
//             "icebergAllowed": true,
//             "ocoAllowed": true,
//             "isSpotTradingAllowed": true,
//             "isMarginTradingAllowed": true,
//             "filters": [
//                 //这些在"过滤器"部分中定义
//                 //所有限制都是可选的
                    // {                            
                    //     filterType: 'MIN_NOTIONAL',
                    //     minNotional: '10.00000000',
                    //     applyToMarket: true,       
                    //     avgPriceMins: 5            
                    // },        
                    // {                             
                    //     filterType: 'LOT_SIZE',     
                    //     minQty: '1.00000000',       
                    //     maxQty: '90000000.00000000',
                    //     stepSize: '1.00000000'      
                    // },                                               
//             ],
//             "permissions": [
//               "SPOT",
//               "MARGIN"
//             ]
//         }
//     ]
// }
binance.prototype.getSpotExchangeInfo = async function() {
    let url = this.spotUrl + '/api/v3/exchangeInfo';
    let data = await this.get(url);
    for (let i = 0; i < data['symbols'].length; i++) {
        this.spotExchangeInfo.set(data['symbols'][i]['symbol'], data['symbols'][i]);
    }
    this.getSpotExchangeInfoAlready = true;
    return this.spotExchangeInfo;
}

binance.prototype.checkSpotFilter = async function(symbol, price, count) {
    if (!this.getSpotExchangeInfoAlready) {
        await this.getSpotExchangeInfo();
    }
    let item = this.spotExchangeInfo.get(symbol);
    if (!item) return {status: false, msg: 'no spotExchangeInfo', symbol: symbol, price: price, count: count}

    for (let j = 0; j < item['filters'].length; j++) {
        // console.log(item['filters'][j]['filterType']);
        switch (item['filters'][j]['filterType']) {
            case 'MIN_NOTIONAL':
                // console.log(item['filters'][j]['filterType'], price, count, item['filters'][j]['minNotional']);
                // 过滤器定义了交易对订单所允许的最小名义价值(成交额)。 订单的名义价值是价格*数量。 由于MARKET订单没有价格，因此会使用 mark price 计算。
                if (price * count < item['filters'][j]['minNotional']) {
                    return {status: false, data: item['filters'][j], price: price, count: count};
                }
                break;
            case 'LOT_SIZE':
                let times = count / item['filters'][j]['stepSize'];
                if (count > item['filters'][j]['maxQty'] || 
                    count < item['filters'][j]['minQty'] || 
                    times != parseInt(times)) { // count % item['filters'][j]['stepSize'] != 0
                    return {status: false, data: item['filters'][j], price: price, count: count}
                }
                break;
            default:
                break;
        }
    }

    return true;
}

// quantity
binance.prototype.spotQuantityPrecision = async function(symbol, quantity) {
    if (!this.getSpotExchangeInfoAlready) {
        await this.getSpotExchangeInfo();
    }

    let item = this.spotExchangeInfo.get(symbol);
    if (!item) return {status: false, msg: 'no spotExchangeInfo', symbol: symbol, price: price, count: count}

    quantity = util.precision(quantity, item['quotePrecision']);
    console.log('quantity', quantity);

    for (let j = 0; j < item['filters'].length; j++) {
        switch (item['filters'][j]['filterType']) {
            case 'LOT_SIZE':
                // console.log(item['filters'][j]['stepSize']);
                let tmp = String(Number(item['filters'][j]['stepSize'])).split(".");
                if (tmp.length != 2) {
                    quantity = util.precision(quantity, 0);
                } else {
                    quantity = util.precision(quantity, tmp[1].length);
                }
                break;
            default:
                break;
        }
    }
    return quantity;
}

// { symbol: 'TRXUSDT',
//   orderId: 815354740,
//   orderListId: -1,
//   clientOrderId: '20210415231506',
//   transactTime: 1618499707305 }
binance.prototype.spotBuy = async function(symbol,orderId,price,quantity,timestamp) {
    // let url = this.spotUrl + '/api/v3/order/test';
    let url = this.spotUrl + '/api/v3/order';
    let option = {
        // LTCBTC
        symbol: symbol, 
        // 订单方向 
        // BUY 买入 SELL 卖出
        side: 'BUY',
        // 订单类型 (orderTypes, type):
        // LIMIT 限价单 timeInForce, quantity, price
        // MARKET 市价单 STOP_LOSS 止损单 STOP_LOSS_LIMIT 限价止损单 TAKE_PROFIT 止盈单 TAKE_PROFIT_LIMIT 限价止盈单 LIMIT_MAKER 限价只挂单
        type: 'MARKET',
        // 有效方式
        // GTC	成交为止 订单会一直有效，直到被成交或者取消。
        // IOC	无法立即成交的部分就撤销
        // 订单在失效前会尽量多的成交。
        // FOK	无法全部立即成交就撤销
        // 如果无法全部成交，订单会失效。
        // timeInForce: 'GTC', 
        // 下单数量
        quantity: quantity,
        // quoteOrderQty: '',
        // price: price,
        newClientOrderId: orderId, // 自定义的唯一订单ID
        // stopPrice: '', // 仅 STOP_LOSS, STOP_LOSS_LIMIT, TAKE_PROFIT, 和TAKE_PROFIT_LIMIT 需要此参数。
        // icebergQty: '', // 仅使用 LIMIT, STOP_LOSS_LIMIT, 和 TAKE_PROFIT_LIMIT 创建新的 iceberg 订单时需要此参数
        newOrderRespType: 'ACK', // 设置响应JSON。 ACK，RESULT或FULL； "MARKET"和" LIMIT"订单类型默认为"FULL"，所有其他订单默认为"ACK"。
        // recvWindow: '', // 交易时效性 赋值不能大于 60000 60秒
        timestamp: timestamp,//new Date().getTime(),
    };
    if (price) {
        option.price = price;
    }
    let data = await this.post(url, option).catch (error => console.log('err', error));
    return data;
}

// { symbol: 'TRXUSDT',
//   orderId: 815354825,
//   orderListId: -1,
//   clientOrderId: '20210415231507',
//   transactTime: 1618499708081 }
binance.prototype.spotSell = async function(symbol,orderId,price,quantity,timestamp) {
    // let url = this.spotUrl + '/api/v3/order/test';
    let url = this.spotUrl + '/api/v3/order';
    let option = {
        // LTCBTC
        symbol: symbol, 
        // 订单方向 
        // BUY 买入 SELL 卖出
        side: 'SELL',
        // 订单类型 (orderTypes, type):
        // LIMIT 限价单 timeInForce, quantity, price
        // MARKET 市价单 STOP_LOSS 止损单 STOP_LOSS_LIMIT 限价止损单 TAKE_PROFIT 止盈单 TAKE_PROFIT_LIMIT 限价止盈单 LIMIT_MAKER 限价只挂单
        type: 'MARKET',
        // 有效方式
        // GTC	成交为止 订单会一直有效，直到被成交或者取消。
        // IOC	无法立即成交的部分就撤销
        // 订单在失效前会尽量多的成交。
        // FOK	无法全部立即成交就撤销
        // 如果无法全部成交，订单会失效。
        // timeInForce: 'GTC', 
        // 下单数量
        quantity: quantity,
        // quoteOrderQty: '',
        // price: price,
        newClientOrderId: orderId, // 自定义的唯一订单ID
        // stopPrice: '', // 仅 STOP_LOSS, STOP_LOSS_LIMIT, TAKE_PROFIT, 和TAKE_PROFIT_LIMIT 需要此参数。
        // icebergQty: '', // 仅使用 LIMIT, STOP_LOSS_LIMIT, 和 TAKE_PROFIT_LIMIT 创建新的 iceberg 订单时需要此参数
        newOrderRespType: 'ACK', // 设置响应JSON。 ACK，RESULT或FULL； "MARKET"和" LIMIT"订单类型默认为"FULL"，所有其他订单默认为"ACK"。
        // recvWindow: '', // 交易时效性 赋值不能大于 60000 60秒
        timestamp: timestamp,//new Date().getTime(),
    };
    if (price) {
        option.price = price;
    }
    let data = await this.post(url, option).catch (error => console.log('err', error));
    return data;
}

// { symbol: 'TRXUSDT',
//   orderId: 815354740,
//   orderListId: -1,
//   clientOrderId: '20210415231506',
//   price: '0.00000000',
//   origQty: '80.00000000',
//   executedQty: '80.00000000',
//   cummulativeQuoteQty: '12.93840000',
//   status: 'FILLED',
//   timeInForce: 'GTC',
//   type: 'MARKET',
//   side: 'BUY',
//   stopPrice: '0.00000000',
//   icebergQty: '0.00000000',
//   time: 1618499707305,
//   updateTime: 1618499707305,
//   isWorking: true,
//   origQuoteOrderQty: '0.00000000' }
binance.prototype.getSpotOrder = async function(symbol,orderId,timestamp) {
    var data = await this.get(this.spotUrl + '/api/v3/order', {
        // symbol	STRING	YES	
        symbol: symbol,
        // orderId	LONG	NO	
        // origClientOrderId	STRING	NO	
        origClientOrderId: orderId,
        // recvWindow	LONG	NO	赋值不得大于 60000
        // timestamp	LONG	YES	
        timestamp: timestamp,
    }, true);
    return data;
}

binance.prototype.futuresLeverage = async function(symbol,leverage,timestamp) {
    let url = this.futuresUrl + '/fapi/v1/leverage';
    let option = {
        // symbol	STRING	YES	交易对
        symbol: symbol, 
        // leverage	INT	YES	目标杠杆倍数：1 到 125 整数
        leverage: leverage,
        // recvWindow	LONG	NO	
        // timestamp	LONG	YES
        timestamp: timestamp,//new Date().getTime(),
    };
    let data = await this.post(url, option).catch (error => console.log('err', error));
    return data;
}

// { orderId: 3139736775,
//     symbol: 'TRXUSDT',  
//     status: 'NEW',      
            // NEW 新建订单
            // PARTIALLY_FILLED 部分成交
            // FILLED 全部成交
            // CANCELED 已撤销
            // REJECTED 订单被拒绝
            // EXPIRED 订单过期(根据timeInForce参数规则)
//     clientOrderId: '20210415225110',
//     price: '0',         
//     avgPrice: '0.00000',
//     origQty: '50',      
//     executedQty: '0',   
//     cumQty: '0',        
//     cumQuote: '0',      
//     timeInForce: 'GTC', 
//     type: 'MARKET',     
//     reduceOnly: false,  
//     closePosition: false,           
//     side: 'SELL',       
//     positionSide: 'SHORT',          
//     stopPrice: '0',     
//     workingType: 'CONTRACT_PRICE',  
//     priceProtect: false,
//     origType: 'MARKET', 
//     updateTime: 1618498270832 }     
binance.prototype.futuresShort = async function(symbol,orderId,price,quantity,timestamp) {
    // let url = this.futuresUrl + '/fapi/v1/order/test';
    let url = this.futuresUrl + '/fapi/v1/order';
    let option = {
        // LTCBTC
        symbol: symbol, 
        // 订单方向 
        // BUY 买入 SELL 卖出
        side: 'SELL',
        // 持仓方向
        // 单向持仓模式下非必填，默认且仅可填BOTH;
        // 在双向持仓模式下必填,且仅可选择 LONG 或 SHORT,LONG方向上不支持BUY; SHORT 方向上不支持SELL
        positionSide: 'SHORT',
        // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
        type: 'MARKET',
        // true, false; 非双开模式下默认false；双开模式下不接受此参数； 使用closePosition不支持此参数。
        // reduceOnly: false,
        // quantity	DECIMAL	NO	下单数量,使用closePosition不支持此参数。
        quantity: quantity,
        // price	DECIMAL	NO	委托价格
        // price: price,
        // newClientOrderId	STRING	NO	用户自定义的订单号，不可以重复出现在挂单中。如空缺系统会自动赋值。必须满足正则规则 ^[\.A-Z\:/a-z0-9_-]{1,36}$
        newClientOrderId: orderId,
        // stopPrice	DECIMAL	NO	触发价, 仅 STOP, STOP_MARKET, TAKE_PROFIT, TAKE_PROFIT_MARKET 需要此参数
        // closePosition	STRING	NO	true, false；触发后全部平仓，仅支持STOP_MARKET和TAKE_PROFIT_MARKET；不与quantity合用；自带只平仓效果，不与reduceOnly 合用
        // activationPrice	DECIMAL	NO	追踪止损激活价格，仅TRAILING_STOP_MARKET 需要此参数, 默认为下单当前市场价格(支持不同workingType)
        // callbackRate	DECIMAL	NO	追踪止损回调比例，可取值范围[0.1, 5],其中 1代表1% ,仅TRAILING_STOP_MARKET 需要此参数
        // timeInForce	ENUM	NO	有效方法
        // workingType	ENUM	NO	stopPrice 触发类型: MARK_PRICE(标记价格), CONTRACT_PRICE(合约最新价). 默认 CONTRACT_PRICE
        // priceProtect	STRING	NO	条件单触发保护："TRUE","FALSE", 默认"FALSE". 仅 STOP, STOP_MARKET, TAKE_PROFIT, TAKE_PROFIT_MARKET 需要此参数
        // newOrderRespType	ENUM	NO	"ACK", "RESULT", 默认 "ACK"
        newOrderRespType: 'ACK',
        // recvWindow	LONG	NO	交易时效性
        
        timestamp: timestamp,//new Date().getTime(),
    };
    if (price) {
        option.price = price;
    }
    let data = await this.post(url, option).catch (error => console.log('err', error));
    return data;
}

binance.prototype.futuresShortClose = async function(symbol,orderId,price,quantity,timestamp) {
    // let url = this.futuresUrl + '/fapi/v1/order/test';
    let url = this.futuresUrl + '/fapi/v1/order';
    let option = {
        // LTCBTC
        symbol: symbol, 
        // 订单方向 
        // BUY 买入 SELL 卖出
        side: 'BUY',
        // 持仓方向
        // 单向持仓模式下非必填，默认且仅可填BOTH;
        // 在双向持仓模式下必填,且仅可选择 LONG 或 SHORT,LONG方向上不支持BUY; SHORT 方向上不支持SELL
        positionSide: 'SHORT',
        // 订单类型 LIMIT, MARKET, STOP, TAKE_PROFIT, STOP_MARKET, TAKE_PROFIT_MARKET, TRAILING_STOP_MARKET
        type: 'MARKET',
        // true, false; 非双开模式下默认false；双开模式下不接受此参数； 使用closePosition不支持此参数。
        // reduceOnly: true,
        // quantity	DECIMAL	NO	下单数量,使用closePosition不支持此参数。
        quantity: quantity,
        // price	DECIMAL	NO	委托价格
        // price: price,
        // newClientOrderId	STRING	NO	用户自定义的订单号，不可以重复出现在挂单中。如空缺系统会自动赋值。必须满足正则规则 ^[\.A-Z\:/a-z0-9_-]{1,36}$
        newClientOrderId: orderId,
        // stopPrice	DECIMAL	NO	触发价, 仅 STOP, STOP_MARKET, TAKE_PROFIT, TAKE_PROFIT_MARKET 需要此参数
        // stopPrice: 0.00001,
        // closePosition	STRING	NO	true, false；触发后全部平仓，仅支持STOP_MARKET和TAKE_PROFIT_MARKET；不与quantity合用；自带只平仓效果，不与reduceOnly 合用
        // closePosition: true,
        // activationPrice	DECIMAL	NO	追踪止损激活价格，仅TRAILING_STOP_MARKET 需要此参数, 默认为下单当前市场价格(支持不同workingType)
        // callbackRate	DECIMAL	NO	追踪止损回调比例，可取值范围[0.1, 5],其中 1代表1% ,仅TRAILING_STOP_MARKET 需要此参数
        // timeInForce	ENUM	NO	有效方法
        // workingType	ENUM	NO	stopPrice 触发类型: MARK_PRICE(标记价格), CONTRACT_PRICE(合约最新价). 默认 CONTRACT_PRICE
        // priceProtect	STRING	NO	条件单触发保护："TRUE","FALSE", 默认"FALSE". 仅 STOP, STOP_MARKET, TAKE_PROFIT, TAKE_PROFIT_MARKET 需要此参数
        // newOrderRespType	ENUM	NO	"ACK", "RESULT", 默认 "ACK"
        newOrderRespType: 'ACK',
        // recvWindow	LONG	NO	交易时效性
        
        timestamp: timestamp,//new Date().getTime(),
    };
    if (price !== null) {
        option.price = price;
    }
    let data = await this.post(url, option).catch (error => console.log('err', error));
    return data;
}

binance.prototype.getFuturesOrder = async function(symbol,orderId,timestamp) {
    var data = await this.get(this.futuresUrl + '/fapi/v1/order', {
        // symbol	STRING	YES	
        symbol: symbol,
        // orderId	LONG	NO	
        // origClientOrderId	STRING	NO	
        origClientOrderId: orderId,
        // recvWindow	LONG	NO	赋值不得大于 60000
        // timestamp	LONG	YES	
        timestamp: timestamp,
    }, true);
    return data;
}

binance.prototype.getFundingDiffAvg = async function (symbol,timestamp) {
    var tmp_spot = [];
    var tmp_futures = [];
    var interval = '1m';
    var num = 300;
    // spot
    var data = await this.get(this.spotUrl + '/api/v3/klines', {
        symbol: symbol,
        interval: interval,
        limit: num
    }).catch(error => {
        console.log(error);
    });
    if (!data || data.length <= 0) {
        console.log('err spot data', tmp_spot);
        return null;
    }
    for(let i in data) {
        tmp_spot.push(Number(data[i][4]));
    }

    // // futures
    var data = await this.get(this.futuresUrl + '/fapi/v1/klines', {
        symbol: symbol,
        interval: interval,
        limit: num,
    })
    for(let i in data) {
        tmp_futures.push(Number(data[i][4]));
    }

    // diff
    if (tmp_futures[0][0] != tmp_spot[0][0]) {
        console.log('err: spot time != futures time');
        return;
    }
    var tmp_sum = 0;
    for(let i in tmp_futures) {
        tmp_sum+=util.precision(tmp_futures[i] - tmp_spot[i], 10)
    }
    var diff_avg = util.precision(tmp_sum / num, 10);
    // if (diff_avg < 0.01) diff_avg = diff_avg * 1000;
    return diff_avg;
}

// {
//   "e": "aggTrade",  // 事件类型
//   "E": 123456789,   // 事件时间
//   "s": "BNBBTC",    // 交易对
//   "a": 12345,       // 归集交易ID
//   "p": "0.001",     // 成交价格
//   "q": "100",       // 成交笔数
//   "f": 100,         // 被归集的首个交易ID
//   "l": 105,         // 被归集的末次交易ID
//   "T": 123456785,   // 成交时间
//   "m": true,        // 买方是否是做市方。如true，则此次成交是一个主动卖出单，否则是一个主动买入单。
//   "M": true         // 请忽略该字段
// }
binance.prototype.watchSpotPrice = function (symbol, callback) {
    var bin = this;
    var tunnelingAgent = tunnel.httpsOverHttp({
        proxy: this.proxy
    });

    var ws = new WebSocket(this.spotWSUrl+symbol.toLowerCase()+'@aggTrade', {
        agent: tunnelingAgent
    });

    ws.on('message', function incoming(data) {
        // console.log(data);
        var data = JSON.parse(data);
        if (data['e'] != 'aggTrade') {
            console.log(data);
            return;
        }
        if (bin.dataSpot.length > 100) {
            bin.dataSpot.shift();
        }
        if (bin.dataSpot.length>0 && ~~(bin.dataSpot[bin.dataSpot.length-1][0]/1000) == ~~(data['E']/1000)) {
            bin.dataSpot.pop();
        }
        bin.dataSpot.push([data['E'], data['p']]);
        // console.log([data['E'], data['p']]);

        callback && callback();
    });
    return ws;
}

// {
// "e": "aggTrade",  // 事件类型
// "E": 123456789,   // 事件时间
// "s": "BNBUSDT",    // 交易对
// "a": 5933014,     // 归集成交 ID
// "p": "0.001",     // 成交价格
// "q": "100",       // 成交量
// "f": 100,         // 被归集的首个交易ID
// "l": 105,         // 被归集的末次交易ID
// "T": 123456785,   // 成交时间
// "m": true         // 买方是否是做市方。如true，则此次成交是一个主动卖出单，否则是一个主动买入单。
// }
binance.prototype.watchFuturesPrice = function (symbol, callback) {
    var bin = this;
    var tunnelingAgent = tunnel.httpsOverHttp({
        proxy: this.proxy
    });

    var ws = new WebSocket(this.futuresWSUrl+symbol.toLowerCase()+'@aggTrade', {
        agent: tunnelingAgent
    });

    ws.on('message', function incoming(data) {
        // console.log(data);
        var data = JSON.parse(data);
        if (data['e'] != 'aggTrade') {
            console.log(data);
            return;
        }
        if (bin.dataFutures.length > 100) {
            bin.dataFutures.shift();
        }
        if (bin.dataFutures.length>0 && ~~(bin.dataFutures[bin.dataFutures.length-1][0]/1000) == ~~(data['E']/1000)) {
            bin.dataFutures.pop();
        }
        bin.dataFutures.push([data['E'], data['p']]);
        // console.log([data['E'], data['p']]);

        callback && callback();
    });
    return ws;
}

// binance.prototype.stopWatchFuturesPrice = function (symbol, ws) {
//     ws.send('{"method": "UNSUBSCRIBE","params":["'+symbol.toLowerCase()+'@aggTrade"],"id": 1}}');
// }

binance.prototype.get = async function (url, data, signature) {
    if (signature) {
        data['signature'] = crypto
            .createHmac('sha256', this.secretKey)
            .update(this.makeQueryString(data).substr(1))
            .digest('hex')
    }
    if (data) url = url + '?' + this.makeQueryString(data).substr(1)
    return new Promise((resolve, reject) => {
        var l = null;
        let requestSent = request.get({
            method: 'GET',
            url: url,
            headers:{
                'X-MBX-APIKEY': this.apiKey,
            }, 
            // form: data,
            proxy: this.proxy ? this.proxy.scheme + '://' + this.proxy.host + ':' + this.proxy.port : {},
        }, (error, response, body) => {
            if (error) reject(error)
            if (response.statusCode != 200) {
                if (response.statusCode == 400) {
                    body = JSON.parse(body)
                }
                console.log({code: response.statusCode, msg: 'Invalid status code <' + response.statusCode + '>', url: url, data: data, body: body});
                reject({code: response.statusCode, msg: 'Invalid status code <' + response.statusCode + '>', url: url, data: data, body: body});
                return;
            }
            resolve(JSON.parse(body));
            clearTimeout(l);
        }).on('error', function(e) {
            console.log('req err', e);
            clearTimeout(l);
        });
        l = setTimeout(() => {
            requestSent.abort()
        }, 10000);
    });
}
binance.prototype.makeQueryString = q =>
  q
    ? `?${Object.keys(q)
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`)
        .join('&')}`
    : '';

binance.prototype.post = async function (url, data) {
    data['signature'] = crypto
        .createHmac('sha256', this.secretKey)
        .update(this.makeQueryString(data).substr(1))
        .digest('hex')
    return new Promise((resolve, reject) => {
        let requestSent = request.post({
            method:'post',
            url: url,
            headers: {
                'X-MBX-APIKEY': this.apiKey,
            }, 
            form: data,
            // json: true,
            proxy: this.proxy.scheme + '://' + this.proxy.host + ':' + this.proxy.port,
        }, (error, response, body) => {
            if (error) reject(error);
            if (response.statusCode != 200) {
                if (response.statusCode == 400) {
                    body = JSON.parse(body)
                }
                console.log({code: response.statusCode, msg: 'Invalid status code <' + response.statusCode + '>', url: url, data: data, body: body});
                reject({code: response.statusCode, msg: 'Invalid status code <' + response.statusCode + '>', url: url, data: data, body: body});
                return;
            }
            resolve(JSON.parse(body));
            clearTimeout(l);
        }).on('error', function(e) {
            console.log(e);
            clearTimeout(l);
        });
        var l = setTimeout(() => {
            requestSent.abort()
        }, 10000);
    });
}

/**
 * Module exports.
 * @public
 */
module.exports = binance();