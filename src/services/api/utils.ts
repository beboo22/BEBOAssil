import axios from 'axios';
import { AMADEUS_API_KEY, AMADEUS_API_SECRET } from './config';

// Convert city names to IATA codes (simplified mock implementation)
export const cityToIataCode = (cityName: string): string => {
  const cityMap: Record<string, string> = {
    'New York, USA': 'NYC',
    'Los Angeles, USA': 'LAX',
    'Chicago, USA': 'ORD',
    'London, UK': 'LON',
    'Paris, France': 'PAR',
    'Tokyo, Japan': 'TYO',
    'Dubai, UAE': 'DXB',
    'Rome, Italy': 'ROM',
    'Madrid, Spain': 'MAD',
    'Barcelona, Spain': 'BCN',
    'Berlin, Germany': 'BER',
    'Cairo, Egypt': 'CAI',
    'Hong Kong': 'HKG',
    'Singapore': 'SIN'
  };
  
  // Try to match the city exactly
  if (cityMap[cityName]) {
    return cityMap[cityName];
  }
  
  // Try to match part of the city name
  for (const city in cityMap) {
    if (cityName.toLowerCase().includes(city.toLowerCase().split(',')[0])) {
      return cityMap[city];
    }
  }
  
  // Default fallback - in a real app, you'd use an API for this
  return cityName.substring(0, 3).toUpperCase();
};

// Function to get Amadeus access token
let amadeusAccessToken: string | null = null;
let amadeusTokenExpiry: number = 0;

export const getAmadeusToken = async (): Promise<string> => {
  try {
    // Check if we already have a valid token
    if (amadeusAccessToken && amadeusTokenExpiry > Date.now()) {
      return amadeusAccessToken;
    }

    console.log("Getting new Amadeus token...");
    
    // Otherwise, request a new token
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': AMADEUS_API_KEY,
        'client_secret': AMADEUS_API_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log("Amadeus token response:", response.data);

    // Save the token and expiry time
    amadeusAccessToken = response.data.access_token;
    amadeusTokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Subtract 1 minute for safety
    
    return amadeusAccessToken;
  } catch (error) {
    console.error('Error getting Amadeus token:', error);
    throw new Error('Failed to authenticate with Amadeus API');
  }
};
