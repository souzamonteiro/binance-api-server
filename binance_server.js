#!/usr/bin/env node

/**
 * Binance Trading API Server
 * @module Server
 * @description Server implementation for Binance trading interface.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Binance = require('node-binance-api');

/**
 * Binance API Configuration.
 * @type {Object}
 */
const binanceConfig = {
  apiKey: process.env.BINANCE_TESTNET === 'true' 
    ? process.env.BINANCE_TESTNET_API_KEY 
    : process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_TESTNET === 'true' 
    ? process.env.BINANCE_TESTNET_API_SECRET 
    : process.env.BINANCE_API_SECRET,
  testnet: process.env.BINANCE_TESTNET === 'true'
};

/**
 * Binance Client Instance.
 * @type {Binance}
 */
const binanceClient = new Binance().options({
  APIKEY: binanceConfig.apiKey,
  APISECRET: binanceConfig.apiSecret,
  urls: binanceConfig.testnet ? {
    base: 'https://testnet.binance.vision/api/',
    stream: 'wss://testnet.binance.vision/ws/',
    combinedStream: 'wss://testnet.binance.vision/stream?streams='
  } : undefined
});

/**
 * Active WebSocket Connections Map.
 * @type {Map<string, any>}
 */
const activeConnections = new Map();

/**
 * Formats candle data from Binance API.
 * @param {Array<Array<number>>} candles - Raw candle data from Binance.
 * @returns {Array<Object>} Formatted candle data.
 */
function formatCandles(candles) {
  return candles.map(c => ({
    time: new Date(c[0]),
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5])
  }));
}

/**
 * Gets current price for a trading pair.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function getPrice(req, res) {
  try {
    const { symbol } = req.params;
    const ticker = await binanceClient.prices(symbol);
    res.json({ price: ticker[symbol] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Gets candlestick data for a trading pair with outlier detection and correction.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function getCandlesticks(req, res) {
  try {
    const { symbol, interval } = req.params;
    const limit = req.query.limit || 100;

    const candles = await binanceClient.candlesticks(symbol, interval, { 
      limit: parseInt(limit) 
    });
    
    if (!candles || candles.length === 0) {
      throw new Error('No candle data received from Binance');
    }
    
    // First pass: parse all candles.
    let formatted = candles.map(c => ({
      time: new Date(c.openTime),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
      original: true // flag to identify original data.
    }));

    // Function to detect outliers based on median and median absolute deviation.
    const detectOutliers = (candles) => {
      const multiplier = 5;

      // Calculate typical prices for all candles.
      const typicalPrices = candles.map(c => (c.high + c.low + c.close) / 3);
      
      // Calculate median of typical prices.
      const sorted = [...typicalPrices].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      
      // Calculate Median Absolute Deviation (MAD).
      const deviations = sorted.map(p => Math.abs(p - median));
      deviations.sort((a, b) => a - b);
      const mad = deviations[Math.floor(deviations.length / 2)];
      
      // Threshold for outlier detection (adjust multiplier as needed).
      const threshold = median + (multiplier * 1.4826 * mad); // 1.4826 is a scaling factor for MAD to SD.
      const lowerThreshold = median - (multiplier * 1.4826 * mad);
      
      return { median, mad, threshold, lowerThreshold };
    };

    // Second pass: detect and replace outliers.
    const { median, threshold, lowerThreshold } = detectOutliers(formatted);
    
    let cleanedCandles = [];
    let previousValidCandle = null;
    
    for (let i = 0; i < formatted.length; i++) {
      const current = formatted[i];
      let candleToAdd = current;
      
      // Check if current candle has outliers.
      const isOutlierHigh = current.high > threshold || current.high < lowerThreshold;
      const isOutlierLow = current.low > threshold || current.low < lowerThreshold;
      
      // If we have a previous valid candle and current has outliers, use previous.
      if (previousValidCandle && (isOutlierHigh || isOutlierLow)) {
        candleToAdd = {
          ...previousValidCandle,
          time: current.time, // keep the original timestamp.
          volume: current.volume, // keep the original volume.
          original: false // mark as corrected.
        };
      } else {
        previousValidCandle = current;
      }
      
      cleanedCandles.push(candleToAdd);
    }

    // Remove the 'original' flag before sending response.
    const finalCandles = cleanedCandles.map(({ original, ...rest }) => rest);
    
    res.json(finalCandles);
  } catch (error) {
    console.error('Error fetching candles:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch candle data from Binance API'
    });
  }
}

/**
 * Creates a buy order.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function createBuyOrder(req, res) {
  try {
    const { symbol, quantity, price } = req.body;
    const response = await binanceClient.buy(symbol, quantity, price, { 
      type: 'LIMIT' 
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Creates a sell order.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function createSellOrder(req, res) {
  try {
    const { symbol, quantity, price } = req.body;
    const response = await binanceClient.sell(symbol, quantity, price, { 
      type: 'LIMIT' 
    });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Gets account balance for an asset.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function getBalance(req, res) {
  try {
    const { asset } = req.params;
    const balances = await binanceClient.balance();
    res.json({ balance: balances[asset] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Gets real-time price via WebSocket.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function getRealTimePrice(req, res) {
  try {
    const { symbol } = req.params;
    
    if (activeConnections.has(symbol)) {
      return res.json({ price: activeConnections.get(symbol) });
    }
    
    binanceClient.websockets.ticker(symbol, (ticker) => {
      const price = parseFloat(ticker.close);
      activeConnections.set(symbol, price);
    });
    
    const ticker = await binanceClient.prices(symbol);
    res.json({ price: ticker[symbol] });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Gets real-time candlesticks via WebSocket.
 * @param {express.Request} req - Express request object.
 * @param {express.Response} res - Express response object.
 */
async function getRealTimeCandlesticks(req, res) {
  try {
    const { symbol, interval } = req.params;
    const cacheKey = `${symbol}_${interval}`;
    
    if (activeConnections.has(cacheKey)) {
      return res.json(activeConnections.get(cacheKey));
    }
    
    const initialCandles = await binanceClient.candlesticks(symbol, interval);
    const formatted = formatCandles(initialCandles);
    activeConnections.set(cacheKey, formatted);
    
    binanceClient.websockets.chart(symbol, interval, (symbol, interval, chart) => {
      const candles = Object.values(chart).map(c => [
        c.openTime, c.open, c.high, c.low, c.close, c.volume
      ]);
      activeConnections.set(cacheKey, formatCandles(candles));
    });
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Express Application Setup.
 */
const app = express();

// Middleware Configuration.
app.use(cors({
  origin: 'http://maia.maiascript.com',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Static Files.
const publicDir = path.join(__dirname, 'www');
app.use(express.static(publicDir));

// API Routes.
app.get('/api/price/:symbol', getPrice);
app.get('/api/candles/:symbol/:interval', getCandlesticks);
app.get('/api/realtime/price/:symbol', getRealTimePrice);
app.get('/api/realtime/candles/:symbol/:interval', getRealTimeCandlesticks);
app.post('/api/order/buy', createBuyOrder);
app.post('/api/order/sell', createSellOrder);
app.get('/api/balance/:asset', getBalance);

// Fallback Route.
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Server Startup.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;