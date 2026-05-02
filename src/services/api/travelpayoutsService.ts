/**
 * travelpayoutsService.ts
 *
 * Secure frontend-layer for Travelpayouts searches.
 * Calls the `travelpayouts` Supabase Edge Function — never talks directly to Travelpayouts API.
 * API token lives ONLY on the backend.
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FlightResult {
  airline: string;
  flight_number: string;
  departure_at: string;
  return_at?: string;
  price: number;
  currency: string;
  transfers: number;
  duration: number;
  link: string;
  origin: string;
  destination: string;
  fallback?: boolean;
  deepLink?: string;
}

export interface HotelResult {
  hotelId?: string;
  hotelName: string;
  stars: number;
  price: number;
  currency: string;
  location?: string;
  link: string;
  image: string;
  fallback?: boolean;
  deepLink?: string;
  rating?: number;
  amenities?: string[];
  reviews?: number;
}

export interface CarResult {
  name: string;
  price: number;
  currency: string;
  link: string;
  image?: string;
  type?: string;
}

export interface TransferResult {
  name: string;
  price: number;
  currency: string;
  link: string;
  type?: string;
  duration?: string;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
  currency?: string;
}

export interface HotelSearchParams {
  iata?: string;
  city?: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  currency?: string;
}

export interface CarSearchParams {
  city: string;
  pickupDate: string;
  dropoffDate: string;
}

export interface TransferSearchParams {
  from: string;
  to: string;
  date?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function invoke<T>(type: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("travelpayouts", {
    body: { type, ...params },
  });

  if (error) {
    console.error(`[travelpayoutsService] ${type} function error:`, error);
    throw error;
  }

  if (!data) {
    throw new Error("Empty response from travelpayouts function");
  }

  if (!data.success) {
    const err = new Error(data.error || `travelpayouts ${type} failed`);
    (err as any).status = data.status;
    throw err;
  }

  return data as T;
}

export const travelpayoutsService = {
  /**
   * Search flights using Aviasales v3 cached prices.
   * Falls back to deep link when API quota is exhausted or no results.
   */
  async searchFlights(params: FlightSearchParams): Promise<{
    flights: FlightResult[];
    deepLink: string;
    fallback?: boolean;
  }> {
    const result = await invoke<{
      success: boolean;
      flights: FlightResult[];
      deepLink: string;
      fallback?: boolean;
    }>("flights", params as unknown as Record<string, unknown>);

    return {
      flights: result.flights || [],
      deepLink: result.deepLink || "",
      fallback: result.fallback,
    };
  },

  /**
   * Search hotels using Hotellook cached prices.
   * Falls back to deep link when API quota is exhausted or no results.
   */
  async searchHotels(params: HotelSearchParams): Promise<{
    hotels: HotelResult[];
    deepLink: string;
    fallback?: boolean;
  }> {
    const result = await invoke<{
      success: boolean;
      hotels: HotelResult[];
      deepLink: string;
      fallback?: boolean;
    }>("hotels", params as unknown as Record<string, unknown>);

    return {
      hotels: result.hotels || [],
      deepLink: result.deepLink || "",
      fallback: result.fallback,
    };
  },

  /**
   * Search car rentals using high-fidelity mockup API.
   */
  async searchCars(params: CarSearchParams): Promise<{
    cars: CarResult[];
    fallbackUrl: string;
  }> {
    const result = await invoke<{ success: boolean; cars: CarResult[]; fallbackUrl: string }>("cars", params as unknown as Record<string, unknown>);
    return {
      cars: result.cars || [],
      fallbackUrl: result.fallbackUrl || "",
    };
  },

  /**
   * Search transfers using high-fidelity mockup API.
   */
  async searchTransfers(params: TransferSearchParams): Promise<{
    transfers: TransferResult[];
    widgetUrl: string;
  }> {
    const result = await invoke<{ success: boolean; transfers: TransferResult[]; widgetUrl: string }>("transfers", params as unknown as Record<string, unknown>);
    return {
      transfers: result.transfers || [],
      widgetUrl: result.widgetUrl || "",
    };
  },

  /**
   * Start a real-time flight search in the background.
   */
  async startFlightSearch(params: FlightSearchParams): Promise<string> {
    const result = await invoke<{ success: boolean; searchId: string }>("start_flight_search", params as unknown as Record<string, unknown>);
    return result.searchId;
  },

  /**
   * Get results for a started flight search.
   */
  async getFlightResults(searchId: string): Promise<{ flights: FlightResult[]; finished: boolean }> {
    const result = await invoke<{ success: boolean; flights: any[]; finished: boolean }>("get_flight_results", { searchId });
    return {
      flights: (result.flights || []).map(f => ({
        airline: f.airline,
        flight_number: f.flight_number,
        departure_at: f.departure_at,
        return_at: f.return_at,
        price: f.price,
        currency: f.currency || "USD",
        transfers: f.transfers || 0,
        duration: f.duration || 0,
        link: f.link,
        origin: f.origin,
        destination: f.destination
      })),
      finished: result.finished
    };
  },

  /**
   * Get car rental deep link (DiscoverCars).
   */
  async getCarLink(params: CarSearchParams): Promise<string> {
    const result = await invoke<{ success: boolean; type: string; url: string }>(
      "cars",
      params as unknown as Record<string, unknown>,
    );
    return result.url;
  },

  /**
   * Get transfer widget URL (Travelpayouts Transfers widget).
   */
  async getTransferWidget(params: TransferSearchParams): Promise<{ widgetUrl: string }> {
    const result = await invoke<{
      success: boolean;
      type: string;
      widgetUrl: string;
    }>("transfers", params as unknown as Record<string, unknown>);
    return { widgetUrl: result.widgetUrl };
  },

  /**
   * Sync booking statuses from Travelpayouts Statistics API.
   * Fetches sales data and returns it for updating local DB.
   */
  async syncBookings(params: { dateFrom?: string; dateTo?: string }): Promise<{
    sales: Array<{
      action_id: string;
      subid: string;
      status: string;
      reward: number;
      currency: string;
      booking_date: string;
    }>;
  }> {
    const result = await invoke<{
      success: boolean;
      sales: any[];
    }>("sync_bookings", params);
    
    return { sales: result.sales || [] };
  },
};
