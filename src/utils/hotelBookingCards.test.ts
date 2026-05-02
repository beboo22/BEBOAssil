import { describe, expect, it } from "vitest";
import { normalizeHotelCacheResult } from "./hotelBookingCards";

const context = {
  bookingLink: "https://search.hotellook.com/?destination=Test%20Hotel%20Abu%20Dhabi",
  currency: "USD",
  fetchedAt: 1777495085000,
  locationName: "Abu Dhabi",
  searchQuery: "Abu Dhabi",
};

describe("hotel booking cards cache normalization", () => {
  it("keeps booking hotel cards render-safe when cache misses rating and amenities", () => {
    const hotel = normalizeHotelCacheResult({
      hotelName: "Cache Hotel Abu Dhabi",
      stars: 4,
      price: 145,
      reviews: 321,
      images: [{ thumbnail: "https://example.com/hotel.jpg" }],
    }, context);

    expect(hotel.name).toBe("Cache Hotel Abu Dhabi");
    expect(hotel.overall_rating).toBeGreaterThan(0);
    expect(hotel.rating).toBe(hotel.overall_rating);
    expect(hotel.amenities.length).toBeGreaterThan(0);
    expect(hotel.extracted_hotel_class).toBe(4);
    expect(hotel.stars).toBe(4);
    expect(hotel.images).toHaveLength(1);
    expect(hotel.bookingUrl).toBe(context.bookingLink);
    expect(hotel.priceTrustworthy).toBe(true);
  });

  it("hides untrusted cache prices but preserves details and direct link", () => {
    const hotel = normalizeHotelCacheResult({
      hotel_name: "No Price Resort",
      stars: 5,
      price: 3,
    }, context);

    expect(hotel.rate_per_night).toBe(0);
    expect(hotel.priceTrustworthy).toBe(false);
    expect(hotel.amenities).toContain("Spa");
    expect(hotel.overall_rating).toBeGreaterThan(0);
    expect(hotel.link).toBe(context.bookingLink);
  });
});