/**
 * bookingUtils.ts
 * Utility to generate pre-filled Trip.com booking URLs for Flights, Hotels, and Cars.
 */

const TRIP_ALLIANCE_ID = "7384441";
const TRIP_SID = "279474539";

export const cityIataMap: Record<string, string> = {
  'jeddah': 'JED', 'dubai': 'DXB', 'cairo': 'CAI', 'riyadh': 'RUH',
  'abu dhabi': 'AUH', 'doha': 'DOH', 'paris': 'CDG', 'london': 'LHR',
  'istanbul': 'IST', 'rome': 'FCO', 'barcelona': 'BCN', 'amsterdam': 'AMS',
  'tokyo': 'NRT', 'new york': 'JFK', 'los angeles': 'LAX', 'bangkok': 'BKK',
  'singapore': 'SIN', 'kuala lumpur': 'KUL', 'madrid': 'MAD', 'berlin': 'BER',
  'miami': 'MIA', 'sydney': 'SYD', 'seoul': 'ICN', 'hong kong': 'HKG',
  'الرياض': 'RUH', 'جدة': 'JED', 'دبي': 'DXB', 'القاهرة': 'CAI',
  'اسطنبول': 'IST', 'لندن': 'LHR', 'باريس': 'CDG',
};

function getIata(city: string): string {
  if (!city) return '';
  const clean = city.toLowerCase().split(',')[0].trim();
  return cityIataMap[clean] || clean.substring(0, 3).toUpperCase();
}

/**
 * Generate Trip.com Flight Search URL
 */
export function getTripFlightUrl(from: string, to: string, date: string, tripType: "oneway" | "round" = "round", returnDate?: string) {
  const fromIata = getIata(from);
  const toIata = getIata(to);
  const type = tripType === "oneway" ? "S" : "D";
  
  let url = `https://www.trip.com/flights/list?SearchType=${type}&dcity=${fromIata}&acity=${toIata}&ddate=${date}`;
  if (tripType === "round" && returnDate) {
    url += `&rdate=${returnDate}`;
  }
  url += `&adult=1&children=0&infant=0&class=y&Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}`;
  return url;
}

/**
 * Generate Trip.com Hotel Search URL
 */
export function getTripHotelUrl(city: string, checkIn: string, checkOut: string, guests: string = "2") {
  // Trip.com hotels usually work better with city names in the URL or city IDs
  // Since we don't have city IDs, we'll use a deep search link
  const cleanCity = city.split(',')[0].trim();
  return `https://www.trip.com/hotels/list?cityname=${encodeURIComponent(cleanCity)}&checkIn=${checkIn}&checkOut=${checkOut}&adult=${guests}&Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}`;
}

/**
 * Generate Trip.com Car Rental URL
 */
export function getTripCarUrl(location: string, pickupDate: string, returnDate: string) {
  const iata = getIata(location);
  return `https://www.trip.com/carhire/list?pickupCityIATA=${iata}&pickupDate=${pickupDate}&returnDate=${returnDate}&Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}`;
}

/**
 * Generate Trip.com Airport Transfer URL
 */
export function getTripTransferUrl(location: string, date: string) {
  const cleanLoc = location.split(',')[0].trim();
  return `https://www.trip.com/airport-transfers/index?fromName=${encodeURIComponent(cleanLoc)}&date=${date}&Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}`;
}
