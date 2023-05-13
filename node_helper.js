const request = require('request')
const moment = require("moment")

var NodeHelper = require("node_helper")
const { reset } = require('module-alias')
const { time } = require('console')

String.prototype.hashCode = function() {
  var hash = 0
  if (this.length == 0) {
    return hash
  }
  for (var i = 0; i < this.length; i++) {
    var char = this.charCodeAt(i)
    hash = ((hash<<5)-hash)+char
    hash = hash & hash
  }
  return hash
}

module.exports = NodeHelper.create({
    start: function() {
        this.config = null;
        this.initial = true;
        this.stocks = {};
        this.isrunning = false;
    },


    socketNotificationReceived: function(noti, payload) {
        if (noti == "INIT" && !this.isRunning) {
            this.config = payload;
            console.log("[AVSTOCK] Initialized.");             
        } else if (noti == "GET_STOCKDATA") {
            this.config = payload;
            if (!this.isRunning) {
                this.config.symbols.forEach(async (stock) => {
                    this.callAPI(stock);
                    await time(1000)
                })
                this.requestTimer(this.config.symbols, 500000);
                this.isRunning = true
            }
        }
    },

    time: function(milliseconds) {
        return new Promise(resolve => setTimeout(() => resolve(), milliseconds));
    },

    requestTimer: function(symbols, interval) {
        this.log("Performing initial 15s calls...");
        var self = this;
        this.rc = setInterval(() => {
            symbols.forEach(async (stock) => {
                self.callAPI(stock);
                await time(1000)
            })
            
        }, interval);
    },
    
    callAPI: function(symbol) {
        const spawn = require("child_process").spawn;
        this.log("Calling API: " + ", stock: " + symbol);
        const pythonProcess = spawn('python3', ["./modules/MMM-AVStock/stocks.py", symbol], {stdio: ['pipe', 'pipe', 'inherit']})

        pythonProcess.stdout.on('data', (data) => {
            const json = JSON.parse(data.toString())
            this.processData(json, symbol);
        });
    },


    processData: function(quote, symbol) {
        this.log("Processing API data...");
        var cfg = this.config;
        var result = {
            symbol: symbol,
            open: parseFloat(quote["02. open"]),
            high: parseFloat(quote["03. high"]),
            low: parseFloat(quote["04. low"]),
            price: parseFloat(quote["05. price"]),
            volume: parseInt(quote["06. volume"]),
            day: quote["07. latest trading day"],
            close: parseFloat(quote["08. previous close"]),
            change: parseFloat(quote["09. change"]),
            changeP: Number(quote["09. change"]*100/quote["08. previous close"]).toFixed(2)+'%',
            up: (parseFloat(quote["09. change"]) > 0),
            requestTime: moment().format(cfg.timeFormat),
            hash: symbol.hashCode()
        };
        this.log(result);
        this.log("Sending socket notification with result: " + JSON.stringify(result));
        this.sendSocketNotification("UPDATE_QUOTE", {
            symbol: symbol, 
            data: result 
        });
    }, 
    
      
    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ": ", (msg));
        }
    },
})
