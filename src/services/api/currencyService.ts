
import axios from 'axios';
import { BOOKING_API_KEY } from './config';
import { CurrencyConversionResponse } from './types';

// Function to convert currency
export const convertCurrency = async (amount: number, from: string, to: string): Promise<number> => {
  try {
    const response = await axios.get(
      'https://currency-converter5.p.rapidapi.com/currency/convert',
      {
        params: {
          format: 'json',
          from: from,
          to: to,
          amount: amount
        },
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'currency-converter5.p.rapidapi.com'
        }
      }
    );
    
    console.log('Currency conversion response:', response.data);
    
    if (response.data && response.data.rates && response.data.rates[to]) {
      return parseFloat(response.data.rates[to].rate_for_amount);
    }
    
    return amount; // Return original amount if conversion fails
  } catch (error) {
    console.error('Error converting currency:', error);
    return amount; // Return original amount if conversion fails
  }
};
