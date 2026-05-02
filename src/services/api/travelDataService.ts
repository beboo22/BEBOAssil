
import axios from 'axios';

// API Keys - Using the existing ones from the project
import { BOOKING_API_KEY } from './config';

// Interfaces for different travel data responses
export interface FlightData {
  arrival?: any;
  departure?: any;
  aircraft?: any;
  number?: string;
  status?: string;
  airline?: any;
}

export interface CarRentalLocation {
  id: string;
  name: string;
  type: string;
}

export interface PropertyData {
  id: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  rating?: number;
  images?: string[];
}

export interface HotelReview {
  id: string;
  title?: string;
  text: string;
  rating: number;
  author: string;
  date: string;
}

// Aerodatabox API - Flights data
export const getAirportFlights = async (iataCode: string, direction: 'Arrival' | 'Departure' | 'Both' = 'Both') => {
  try {
    const response = await axios.get(
      `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${iataCode}`, {
        params: {
          offsetMinutes: -120,
          durationMinutes: 720,
          withLeg: true,
          direction,
          withCancelled: true,
          withCodeshared: true,
          withCargo: false,
          withPrivate: false,
          withLocation: false
        },
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
        }
    });
    
    console.log('Airport flights response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching airport flights:', error);
    return { arrivals: [], departures: [] };
  }
};

// SkyScanner API - Car rental location search
export const searchCarRentalLocations = async (query: string) => {
  try {
    const response = await axios.get(
      'https://sky-scanner3.p.rapidapi.com/cars/auto-complete', {
        params: {
          query
        },
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'sky-scanner3.p.rapidapi.com'
        }
    });
    
    console.log('Car rental locations response:', response.data);
    
    // Transform the response to match our interface
    const locations: CarRentalLocation[] = response.data.data.map((item: any) => ({
      id: item.id || '',
      name: item.name || '',
      type: item.type || ''
    }));
    
    return locations;
  } catch (error) {
    console.error('Error searching car rental locations:', error);
    return [];
  }
};

// Airbnb API - Property search by location
export const searchProperties = async (
  location: string, 
  totalRecords: number = 10, 
  currency: string = 'USD',
  adults: number = 1
) => {
  try {
    const response = await axios.get(
      'https://airbnb19.p.rapidapi.com/api/v1/searchPropertyByLocationV2', {
        params: {
          location,
          totalRecords,
          currency,
          adults
        },
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'airbnb19.p.rapidapi.com'
        }
    });
    
    console.log('Property search response:', response.data);
    
    // Transform the response to match our interface
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      const properties: PropertyData[] = response.data.data.map((item: any) => ({
        id: item.id || item.listingId || '',
        name: item.name || item.title || '',
        location: item.location || item.address || '',
        price: parseFloat(item.price) || 0,
        currency: item.currency || currency,
        rating: parseFloat(item.rating) || 0,
        images: item.images || []
      }));
      
      return properties;
    }
    
    return [];
  } catch (error) {
    console.error('Error searching properties:', error);
    return [];
  }
};

// Skyscanner multi-city flight search
export interface MultiCityFlightParams {
  market?: string;
  locale?: string;
  currency?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  flights: {
    originSkyId: string;
    destinationSkyId: string;
    departDate: string;
  }[];
}

export const searchMultiCityFlights = async (params: MultiCityFlightParams) => {
  try {
    // Set defaults if not provided
    const searchParams = {
      market: params.market || 'US',
      locale: params.locale || 'en-US',
      currency: params.currency || 'USD',
      adults: params.adults || 1,
      children: params.children || 0,
      infants: params.infants || 0,
      cabinClass: params.cabinClass || 'economy',
      stops: [],
      sort: '',
      flights: params.flights
    };
    
    const response = await axios.post(
      'https://blue-scanner.p.rapidapi.com/skyscanner-app/flights/search-multi-city',
      searchParams,
      {
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'blue-scanner.p.rapidapi.com',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Multi-city flight search response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error searching multi-city flights:', error);
    return { itineraries: [] };
  }
};

// Booking.com reviews API
export const getHotelReviews = async (hotelUrl: string) => {
  try {
    const encodedUrl = encodeURIComponent(hotelUrl);
    const response = await axios.get(
      'https://booking-com-scraper-api.p.rapidapi.com/booking_hotels_reviews', {
        params: {
          hotel: encodedUrl
        },
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'booking-com-scraper-api.p.rapidapi.com'
        }
    });
    
    console.log('Hotel reviews response:', response.data);
    
    // Transform the response to match our interface
    if (response.data && response.data.reviews && Array.isArray(response.data.reviews)) {
      const reviews: HotelReview[] = response.data.reviews.map((item: any, index: number) => ({
        id: item.id || `review-${index}`,
        title: item.title || '',
        text: item.text || '',
        rating: parseFloat(item.rating) || 0,
        author: item.author || 'Anonymous',
        date: item.date || new Date().toISOString()
      }));
      
      return {
        reviews,
        totalReviews: reviews.length,
        hotelName: response.data.hotel_name || '',
        hotelRating: response.data.hotel_rating || 0
      };
    }
    
    return { reviews: [], totalReviews: 0, hotelName: '', hotelRating: 0 };
  } catch (error) {
    console.error('Error fetching hotel reviews:', error);
    return { reviews: [], totalReviews: 0, hotelName: '', hotelRating: 0 };
  }
};

// Priceline API - Flight details
export const getFlightDetails = async () => {
  try {
    const response = await axios.get(
      'https://priceline-com2.p.rapidapi.com/flights/details', {
        headers: {
          'X-RapidAPI-Key': BOOKING_API_KEY,
          'X-RapidAPI-Host': 'priceline-com2.p.rapidapi.com'
        }
    });
    
    console.log('Flight details response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching flight details:', error);
    return {};
  }
};
