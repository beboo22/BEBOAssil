export interface HotelCardContext {
  bookingLink: string;
  currency: string;
  fetchedAt: number;
  locationName: string;
  name?: string;
  searchQuery: string;
  source?: string;
}

const AMENITIES_BY_STARS: Record<number, string[]> = {
  5: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Concierge"],
  4: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"],
  3: ["WiFi", "Restaurant", "Parking", "AC"],
  2: ["WiFi", "AC"],
  1: ["WiFi"],
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return Number(value.replace(/[^0-9.]/g, "")) || 0;
  return 0;
};

const clampStars = (value: unknown): number => {
  const stars = Math.round(toNumber(value));
  return stars >= 1 && stars <= 5 ? stars : 0;
};

const inferRating = (stars: number): number => {
  if (stars >= 5) return 8.6;
  if (stars === 4) return 8.1;
  if (stars === 3) return 7.6;
  if (stars > 0) return 7.0;
  return 0;
};

const normalizeImages = (hotel: any): Array<string | { thumbnail?: string; original?: string }> => {
  if (Array.isArray(hotel?.images)) {
    return hotel.images
      .map((img: any) => typeof img === "string" ? img : { thumbnail: img?.thumbnail || img?.original, original: img?.original || img?.thumbnail })
      .filter((img: any) => typeof img === "string" ? Boolean(img) : Boolean(img.original || img.thumbnail));
  }
  return hotel?.image ? [{ thumbnail: hotel.image, original: hotel.image }] : [];
};

export const getHotelCacheName = (hotel: any, fallbackName: string): string => (
  hotel?.hotelName || hotel?.hotel_name || hotel?.name || fallbackName || "Hotel"
);

export const normalizeHotelCacheResult = (hotel: any, context: HotelCardContext) => {
  const name = context.name || getHotelCacheName(hotel, context.searchQuery);
  const rawPrice = toNumber(hotel?.price ?? hotel?.pricePerNight ?? hotel?.priceFrom ?? hotel?.priceAvg);
  const priceTrustworthy = rawPrice >= 10 && rawPrice <= 5000;
  const stars = clampStars(hotel?.stars ?? hotel?.hotel_class ?? hotel?.extracted_hotel_class);
  const rating = toNumber(hotel?.rating ?? hotel?.overall_rating) || inferRating(stars);
  const amenities = Array.isArray(hotel?.amenities) && hotel.amenities.length > 0
    ? hotel.amenities
    : (AMENITIES_BY_STARS[stars] || []);
  const images = normalizeImages(hotel);
  const image = hotel?.image || (typeof images[0] === "string" ? images[0] : images[0]?.original || images[0]?.thumbnail || "");

  return {
    name,
    rate_per_night: priceTrustworthy ? rawPrice : 0,
    total_rate: toNumber(hotel?.totalPrice ?? hotel?.total_rate),
    overall_rating: rating,
    rating,
    extracted_hotel_class: stars,
    stars,
    images,
    image,
    link: context.bookingLink,
    bookingUrl: context.bookingLink,
    externalLink: context.bookingLink,
    amenities,
    free_cancellation: Boolean(hotel?.free_cancellation),
    reviews: toNumber(hotel?.reviews),
    nearby_places: Array.isArray(hotel?.nearby_places) ? hotel.nearby_places : [],
    location: context.locationName || hotel?.location || context.searchQuery,
    address: hotel?.address || hotel?.location || "",
    fallback: Boolean(hotel?.fallback),
    source: context.source || hotel?.source || "hotellook-cache",
    priceSource: priceTrustworthy ? "Hotellook" : "Hotellook (price unverified)",
    priceTrustworthy,
    priceFetchedAt: context.fetchedAt,
    currency: hotel?.currency || context.currency || "USD",
  };
};