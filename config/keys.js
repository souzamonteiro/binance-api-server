require('dotenv').config();

const isTestnet = process.env.BINANCE_TESTNET === 'true';

module.exports = {
  binance: {
    apiKey: isTestnet ? process.env.BINANCE_TESTNET_API_KEY : process.env.BINANCE_API_KEY,
    apiSecret: isTestnet ? process.env.BINANCE_TESTNET_API_SECRET : process.env.BINANCE_API_SECRET,
    testnet: isTestnet
  }
};
