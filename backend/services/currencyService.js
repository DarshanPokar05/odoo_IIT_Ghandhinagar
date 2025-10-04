const axios = require('axios');

class CurrencyService {
  constructor() {
    this.exchangeRateCache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour
  }

  async getExchangeRates(baseCurrency = 'USD') {
    const cacheKey = baseCurrency;
    const cached = this.exchangeRateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.rates;
    }

    try {
      const response = await axios.get(`${process.env.EXCHANGE_RATE_API_URL}/${baseCurrency}`);
      const rates = response.data.rates;
      
      this.exchangeRateCache.set(cacheKey, {
        rates,
        timestamp: Date.now()
      });
      
      return rates;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Return cached data if available, otherwise throw error
      if (cached) {
        return cached.rates;
      }
      throw new Error('Unable to fetch exchange rates');
    }
  }

  async convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    try {
      const rates = await this.getExchangeRates(fromCurrency);
      const rate = rates[toCurrency];
      
      if (!rate) {
        throw new Error(`Exchange rate not found for ${toCurrency}`);
      }
      
      return parseFloat((amount * rate).toFixed(2));
    } catch (error) {
      console.error('Currency conversion error:', error);
      throw error;
    }
  }

  async getSupportedCurrencies() {
    try {
      const response = await axios.get(process.env.COUNTRIES_API_URL);
      const currencies = new Set();
      
      response.data.forEach(country => {
        if (country.currencies) {
          Object.keys(country.currencies).forEach(code => {
            currencies.add(code);
          });
        }
      });
      
      return Array.from(currencies).sort();
    } catch (error) {
      console.error('Error fetching currencies:', error);
      // Return common currencies as fallback
      return ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR'];
    }
  }
}

module.exports = new CurrencyService();