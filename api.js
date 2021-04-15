const { query } = require('./db')
var express = require('express');
var app = express();


app.get('/hello', function (req, res) {
   res.send('Hello World1');
})

app.all('*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
    // res.header("X-Powered-By",' 3.2.1')
    // res.header("Content-Type", "application/json;charset=utf-8");
    next();
});

app.use(express.static('public'));
app.use(express.static('public/static'));

var server = app.listen(3600, function () {

    var host = server.address().address
    var port = server.address().port

    console.log("api: http://%s:%s", host, port)

})