
import axios from 'axios';
import { BOOKING_API_KEY, BOOKING_API_HOST } from './config';
import { AttractionReviewsResponse } from './types';

// Function to get attraction details
export const getAttractionDetails = async (attractionId: string): Promise<any> => {
  try {
    const response = await axios.get(
      `https://booking-com15.p.rapidapi.com/api/v1/attraction/getAttractionDetails`,
      {
        params: {
          id: attractionId
        },
        headers: {
          'x-rapidapi-host': BOOKING_API_HOST,
          'x-rapidapi-key': BOOKING_API_KEY
        }
      }
    );
    
    console.log('Attraction details response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching attraction details:', error);
    // Return empty response on error
    return {};
  }
};

// Function to fetch attraction reviews from Booking.com API
export const getAttractionReviews = async (attractionId: string, page: number = 1): Promise<AttractionReviewsResponse> => {
  try {
    const response = await axios.get(
      `https://booking-com15.p.rapidapi.com/api/v1/attraction/getAttractionReviews`,
      {
        params: {
          id: attractionId,
          page: page
        },
        headers: {
          'x-rapidapi-host': BOOKING_API_HOST,
          'x-rapidapi-key': BOOKING_API_KEY
        }
      }
    );
    
    console.log('Attraction reviews response:', response.data);
    
    // Process and return the data
    return {
      reviews: response.data.reviews || [],
      totalReviews: response.data.total_reviews || 0,
      page: page,
      totalPages: response.data.total_pages || 1
    };
  } catch (error) {
    console.error('Error fetching attraction reviews:', error);
    // Return empty response on error
    return {
      reviews: [],
      totalReviews: 0,
      page: page,
      totalPages: 0
    };
  }
};

// Function to search attractions
export const searchAttractions = async (location: string, page: number = 1): Promise<any> => {
  try {
    const response = await axios.get(
      `https://booking-com15.p.rapidapi.com/api/v1/attraction/searchAttractions`,
      {
        params: {
          location: location,
          page: page
        },
        headers: {
          'x-rapidapi-host': BOOKING_API_HOST,
          'x-rapidapi-key': BOOKING_API_KEY
        }
      }
    );
    
    console.log('Attractions search response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error searching attractions:', error);
    // Return empty response on error
    return { attractions: [] };
  }
};
