// Type definitions for API responses and parameters

// Flight related types
export interface FlightSearchParams {
  departure: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
}

export interface FlightSearchResponse {
  flights: FlightResult[];
  // Add other properties that might come from the API
}

export interface FlightResult {
  airline: string;
  airline_logo?: string;
  flight_number: string;
  departure_time: string;
  arrival_time: string;
  departure_airport?: string;
  departure_code?: string;
  arrival_airport?: string;
  arrival_code?: string;
  duration: string;
  price: number;
  stops: number;
  layovers?: string[];
  travel_class?: string;
  airplane?: string;
  segments?: any[];
}

// Hotel related types
export interface HotelSearchParams {
  location: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  page?: number;
  currency?: string;
}

export interface HotelSearchResponse {
  hotels: HotelResult[];
  totalCount: number;
  page: number;
  totalPages: number;
  currency: string;
}

export interface HotelResult {
  id: string;
  name: string;
  location: string;
  address: string;
  rating: number;
  reviewCount: number;
  price: number;
  currency: string;
  imageUrl: string;
  url: string;
  description?: string;
  amenities?: string[];
  distanceFromCenter?: string;
  starRating?: number;
}

// Transportation related types
export interface TransportationCostParams {
  origin: string;
  destination: string;
  transportType: 'car' | 'taxi' | 'uber' | 'bus' | 'train';
  distance?: number; // in kilometers
  fuelEfficiency?: number; // liters per 100km (for car)
  fuelPrice?: number; // price per liter (for car)
}

// Attraction related types
export interface AttractionReview {
  id: string;
  title: string;
  text: string;
  rating: number;
  author: string;
  date: string;
  // Add other properties as needed
}

export interface AttractionReviewsResponse {
  reviews: AttractionReview[];
  totalReviews: number;
  page: number;
  totalPages: number;
}

// Add more currency related types
export interface CurrencyConversionResponse {
  status: string;
  rates: Record<string, {
    rate: string;
    rate_for_amount: string;
  }>;
}
export interface CarResult {
  id: string;
  name: string;
  type: string;
  price: number;
  currency: string;
  image: string;
  vendor: string;
  link: string;
  transmission?: string;
  seats?: number;
  fuel?: string;
}

export interface TransferResult {
  id: string;
  name: string;
  type: string;
  price: number;
  currency: string;
  image: string;
  vendor: string;
  link: string;
  passengers?: number;
  luggage?: number;
}
