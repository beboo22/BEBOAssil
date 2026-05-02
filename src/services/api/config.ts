
// API configuration constants

// API Keys - In a real production app, these would be env variables
export const SERPAPI_KEY = "YOUR_SERPAPI_KEY"; // This should be replaced with environment variable
export const BOOKING_API_KEY = "05c2796e87msh59d6895da06b1dep1e73fejsn0ffd9d9e446a";
export const BOOKING_API_HOST = "booking-com15.p.rapidapi.com";
export const AMADEUS_API_KEY = "EWBKKQcP9qHT81PAolrzwd1SAES7xPEj";
export const AMADEUS_API_SECRET = "H5Qdz2OefbWmzPqb"; // Adding the secret needed for Amadeus authentication

// Amadeus token management
let amadeusAccessToken: string | null = null;
let amadeusTokenExpiry: number = 0;

export { amadeusAccessToken, amadeusTokenExpiry };
