const express = require('express');
const router = express.Router();
const {
  getPrice,
  getCandlesticks,
  createBuyOrder,
  createSellOrder,
  getBalance,
  getRealTimePrice,
  getRealTimeCandlesticks
} = require('../controllers/binanceController');

// Prices.
router.get('/price/:symbol', getPrice);

// Candlesticks
router.get('/candles/:symbol/:interval', getCandlesticks);

router.get('/realtime/price/:symbol', getRealTimePrice);
router.get('/realtime/candles/:symbol/:interval', getRealTimeCandlesticks);

// Orders.
router.post('/order/buy', createBuyOrder);
router.post('/order/sell', createSellOrder);

// Balances.
router.get('/balance/:asset', getBalance);

module.exports = router;