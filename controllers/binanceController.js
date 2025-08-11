const Binance = require('node-binance-api');
const { binance } = require('../config/keys');

// Dynamic configuration for testnet or production.
const binanceClient = new Binance().options({
  APIKEY: binance.apiKey,
  APISECRET: binance.apiSecret,
  urls: binance.testnet ? {
    base: 'https://testnet.binance.vision/api/',
    stream: 'wss://testnet.binance.vision/ws/',
    combinedStream: 'wss://testnet.binance.vision/stream?streams='
  } : undefined
});

// Get price for a pair.
exports.getPrice = async (req, res) => {
  try {
    const { symbol } = req.params;
    const ticker = await binanceClient.prices(symbol);
    res.json({ price: ticker[symbol] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get candlesticks - versão corrigida.
exports.getCandlesticks = async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const limit = req.query.limit || 100;

    // Obter candles da Binance com limite de 100.
    const candles = await binanceClient.candlesticks(symbol, interval, { limit: parseInt(limit) });
    
    if (!candles || candles.length === 0) {
      throw new Error('No candle data received from Binance');
    }

    // Formatar os dados corretamente.
    const formatted = candles.map(c => ({
      time: new Date(c.openTime),  // Usar openTime em vez de [0].
      open: parseFloat(c.open),    // Usar c.open em vez de [1].
      high: parseFloat(c.high),    // Usar c.high em vez de [2].
      low: parseFloat(c.low),      // Usar c.low em vez de [3].
      close: parseFloat(c.close),  // Usar c.close em vez de [4].
      volume: parseFloat(c.volume) // Usar c.volume em vez de [5].
    }));

    res.json(formatted);
    
  } catch (error) {
    console.error('Error fetching candles:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch candle data from Binance API'
    });
  }
};

// Create purchase order.
exports.createBuyOrder = async (req, res) => {
  try {
    const { symbol, quantity, price } = req.body;
    const response = await binanceClient.buy(symbol, quantity, price, { type: 'LIMIT' });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Criar ordem de venda
exports.createSellOrder = async (req, res) => {
  try {
    const { symbol, quantity, price } = req.body;
    const response = await binanceClient.sell(symbol, quantity, price, { type: 'LIMIT' });
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Obter saldo da conta
exports.getBalance = async (req, res) => {
  try {
    const { asset } = req.params;
    const balances = await binanceClient.balance();
    res.json({ balance: balances[asset] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// WebSocket connections map to track active connections.
const activeConnections = new Map();

// Get real-time price via WebSocket.
exports.getRealTimePrice = async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // If we already have a connection for this symbol, return it.
    if (activeConnections.has(symbol)) {
      return res.json({ price: activeConnections.get(symbol) });
    }
    
    // Create new WebSocket connection.
    binanceClient.websockets.ticker(symbol, (ticker) => {
      const price = parseFloat(ticker.close);
      activeConnections.set(symbol, price);
    });
    
    // Return current price (will be updated via WebSocket).
    const ticker = await binanceClient.prices(symbol);
    res.json({ price: ticker[symbol] });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get real-time candlesticks via WebSocket.
exports.getRealTimeCandlesticks = async (req, res) => {
  try {
    const { symbol, interval } = req.params;
    const cacheKey = `${symbol}_${interval}`;
    
    // If we already have a connection, return cached data.
    if (activeConnections.has(cacheKey)) {
      return res.json(activeConnections.get(cacheKey));
    }
    
    // Get initial candles.
    const initialCandles = await binanceClient.candlesticks(symbol, interval);
    const formatted = formatCandles(initialCandles);
    activeConnections.set(cacheKey, formatted);
    
    // Set up WebSocket for updates.
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
};

// Helper function to format candles.
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
