
import { HotelSearchParams, HotelSearchResponse } from './types';
import { supabase } from '@/integrations/supabase/client';

export const searchHotels = async (params: HotelSearchParams): Promise<HotelSearchResponse> => {
  try {
    console.log('Searching hotels via SerpAPI:', params);

    const { data, error } = await supabase.functions.invoke('serpapi-hotels', {
      body: {
        query: `${params.location} hotels`,
        check_in_date: params.checkIn,
        check_out_date: params.checkOut,
        adults: params.guests || 2,
        currency: params.currency || 'USD',
      },
    });

    if (error) {
      console.error("Edge function error:", error);
      throw error;
    }

    if (data?.success && data.hotels?.length > 0) {
      const hotels = data.hotels.map((h: any, i: number) => ({
        id: `hotel-${i}`,
        name: h.name,
        location: params.location,
        address: h.nearby_places?.[0]?.name ? `Near ${h.nearby_places[0].name}` : params.location,
        rating: h.overall_rating || 0,
        reviewCount: h.reviews || 0,
        price: typeof h.rate_per_night === 'string' 
          ? parseFloat(h.rate_per_night.replace(/[^0-9.]/g, '')) 
          : (h.rate_per_night || 0),
        currency: params.currency || 'USD',
        imageUrl: h.images?.[0]?.thumbnail || h.images?.[0]?.original || '',
        url: h.link || '',
        description: h.description || '',
        amenities: h.amenities || [],
        distanceFromCenter: '',
        starRating: h.extracted_hotel_class || h.hotel_class || 0,
        images: h.images || [],
        type: h.type || '',
        checkInTime: h.check_in_time || '',
        checkOutTime: h.check_out_time || '',
        totalRate: typeof h.total_rate === 'string'
          ? parseFloat(h.total_rate.replace(/[^0-9.]/g, ''))
          : (h.total_rate || 0),
      }));

      console.log(`Found ${hotels.length} real hotels via SerpAPI`);

      return {
        hotels,
        totalCount: data.total_results || hotels.length,
        page: params.page || 1,
        totalPages: Math.ceil((data.total_results || hotels.length) / 20),
        currency: params.currency || 'USD',
      };
    }

    console.log("No hotels found via SerpAPI");
    return { hotels: [], totalCount: 0, page: 1, totalPages: 0, currency: params.currency || 'USD' };
  } catch (error) {
    console.error('Error searching hotels:', error);
    return { hotels: [], totalCount: 0, page: 1, totalPages: 0, currency: params.currency || 'USD' };
  }
};
