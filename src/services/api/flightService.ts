
import { FlightSearchParams, FlightSearchResponse } from './types';
import { supabase } from '@/integrations/supabase/client';

// Common IATA code mapping
const cityToIata: Record<string, string> = {
  'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD', 'miami': 'MIA',
  'san jose': 'SJC', 'santa clara': 'SJC', 'santa clara ca': 'SJC',
  'london': 'LHR', 'paris': 'CDG', 'dubai': 'DXB', 'tokyo': 'NRT',
  'istanbul': 'IST', 'rome': 'FCO', 'barcelona': 'BCN', 'amsterdam': 'AMS',
  'berlin': 'BER', 'munich': 'MUC', 'zurich': 'ZRH', 'vienna': 'VIE',
  'singapore': 'SIN', 'hong kong': 'HKG', 'bangkok': 'BKK', 'seoul': 'ICN',
  'beijing': 'PEK', 'shanghai': 'PVG', 'sydney': 'SYD', 'melbourne': 'MEL',
  'toronto': 'YYZ', 'vancouver': 'YVR', 'cairo': 'CAI', 'riyadh': 'RUH',
  'jeddah': 'JED', 'doha': 'DOH', 'abu dhabi': 'AUH', 'muscat': 'MCT',
  'kuwait': 'KWI', 'bahrain': 'BAH', 'amman': 'AMM', 'beirut': 'BEY',
  'casablanca': 'CMN', 'tunis': 'TUN', 'algiers': 'ALG', 'delhi': 'DEL',
  'mumbai': 'BOM', 'kuala lumpur': 'KUL', 'jakarta': 'CGK', 'manila': 'MNL',
  'sao paulo': 'GRU', 'mexico city': 'MEX', 'buenos aires': 'EZE',
  'johannesburg': 'JNB', 'nairobi': 'NBO', 'lisbon': 'LIS', 'madrid': 'MAD',
  'athens': 'ATH', 'prague': 'PRG', 'warsaw': 'WAW', 'moscow': 'SVO',
  'الرياض': 'RUH', 'جدة': 'JED', 'دبي': 'DXB', 'القاهرة': 'CAI',
  'لندن': 'LHR', 'باريس': 'CDG', 'نيويورك': 'JFK', 'اسطنبول': 'IST',
  'الدوحة': 'DOH', 'أبوظبي': 'AUH', 'عمان': 'AMM', 'بيروت': 'BEY',
  'الكويت': 'KWI', 'المنامة': 'BAH', 'مسقط': 'MCT', 'طوكيو': 'NRT',
  'سانتا كلارا': 'SJC', 'سان خوسيه': 'SJC',
};

function getIataCode(city: string): string {
  const normalized = city.toLowerCase().trim();
  if (cityToIata[normalized]) return cityToIata[normalized];
  // If already looks like an IATA code
  if (/^[A-Z]{3}$/i.test(normalized)) return normalized.toUpperCase();
  // Try partial match
  for (const [key, code] of Object.entries(cityToIata)) {
    if (normalized.includes(key) || key.includes(normalized)) return code;
  }
  return normalized.toUpperCase().substring(0, 3);
}

export const searchFlights = async (params: FlightSearchParams): Promise<FlightSearchResponse> => {
  try {
    console.log("Searching flights via SerpAPI:", params);

    const departureCode = getIataCode(params.departure);
    const arrivalCode = getIataCode(params.destination);

    const { data, error } = await supabase.functions.invoke('serpapi-flights', {
      body: {
        departure_id: departureCode,
        arrival_id: arrivalCode,
        outbound_date: params.departDate,
        return_date: params.returnDate,
        adults: params.adults || 1,
        currency: 'USD',
      },
    });

    if (error) {
      console.error("Edge function error:", error);
      throw error;
    }

    if (data?.success && (data.best_flights?.length > 0 || data.other_flights?.length > 0)) {
      const allFlights = [...(data.best_flights || []), ...(data.other_flights || [])];
      
      const flights = allFlights.map((f: any) => {
        const durationHours = Math.floor(f.duration / 60);
        const durationMins = f.duration % 60;

        return {
          airline: f.airline,
          airline_logo: f.airline_logo,
          flight_number: f.flight_number,
          departure_time: f.departure_time?.split(' ')?.[1] || f.departure_time,
          arrival_time: f.arrival_time?.split(' ')?.[1] || f.arrival_time,
          departure_airport: f.departure_airport,
          departure_code: f.departure_code,
          arrival_airport: f.arrival_airport,
          arrival_code: f.arrival_code,
          duration: `${durationHours}h ${durationMins > 0 ? durationMins + 'm' : ''}`.trim(),
          price: f.price,
          stops: f.stops,
          layovers: f.layovers?.map((l: any) => `${l.code} (${Math.floor(l.duration/60)}h${l.duration%60 > 0 ? ` ${l.duration%60}m` : ''})`) || [],
          travel_class: f.travel_class,
          airplane: f.airplane,
          segments: f.segments,
        };
      });

      console.log(`Found ${flights.length} real flights via SerpAPI`);
      return { flights };
    }

    console.log("No flights found via SerpAPI, returning empty");
    return { flights: [] };
  } catch (error) {
    console.error('Error searching flights:', error);
    return { flights: [] };
  }
};
