/**
 * serpapi-flights/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — Google Flights via SerpAPI
 *
 * FEATURES
 * ────────
 *  • Plan-based access gating  (serpapi_flights_enabled)
 *  • Service-role bypass for server-to-server calls (e.g. generate-trip)
 *  • Stateful Pool Rotation via filterResultsCache.ts
 *    – Stores the full ~25-flight pool in filter_results_cache
 *    – Serves 5 unique unseen flights per user per set of filters
 *    – Different users get a cryptoShuffled subset of the same pool
 *    – Pool exhaustion triggers a fresh SerpAPI call
 *  • userId forwarded from generate-trip via x-user-id header so rotation
 *    is consistent across the whole itinerary pipeline
 *  • Booking-URL generation (Google Flights deep link)
 *  • Graceful fallback — never crashes the caller
 *
 * REQUEST BODY (JSON)
 * ───────────────────
 *  departure_id   string   IATA code of departure airport/city   (required)
 *  arrival_id     string   IATA code of arrival airport/city     (required)
 *  outbound_date  string   YYYY-MM-DD                            (required)
 *  return_date?   string   YYYY-MM-DD  (omit for one-way)
 *  adults?        number   default 1
 *  currency?      string   default "USD"
 *  type?          string   "1" = round-trip, "2" = one-way  (default "2")
 *
 * RESPONSE (JSON)
 * ───────────────
 *  success        boolean
 *  best_flights   FlightResult[]  (up to 2)
 *  other_flights  FlightResult[]  (up to 3)
 *  source         CacheSource
 *  reused_from_cache  boolean
 *
 * INTERNAL HEADER (server-to-server)
 * ───────────────────────────────────
 *  x-user-id    UUID of the authenticated user — forwarded by generate-trip
 *               so pool rotation is consistent even when the Authorization
 *               token is a service-role key.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveWithCache,
  type Filters,
  type PoolRotationResult,
} from "../generate-trip/filterResultsCache.ts";

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version, " +
    "x-user-id",
};

// ─── Plan-based access gate ───────────────────────────────────────────────────

async function checkSerpapiFlightsAccess(
  req: Request,
): Promise<{ allowed: boolean; reason?: string }> {
  const authHeader =
    req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

  // Server-to-server bypass (generate-trip uses the service-role key).
  if (token && SERVICE_ROLE && token === SERVICE_ROLE) {
    return { allowed: true };
  }

  if (!token || !SUPABASE_URL || !SERVICE_ROLE) {
    return { allowed: false, reason: "authentication required" };
  }

  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return { allowed: false, reason: "invalid session" };

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("plan_id, expires_at, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.plan_id) return { allowed: false, reason: "no active plan" };

    const { data: plan } = await admin
      .from("subscription_plans")
      .select("serpapi_flights_enabled")
      .eq("id", sub.plan_id)
      .maybeSingle();

    if (!plan?.serpapi_flights_enabled) {
      return { allowed: false, reason: "plan does not include SerpAPI flights" };
    }
    return { allowed: true };
  } catch (e) {
    console.warn("checkSerpapiFlightsAccess error:", e);
    return { allowed: false, reason: "access check failed" };
  }
}

// ─── User-ID extraction ───────────────────────────────────────────────────────

/**
 * Resolve the effective user ID for pool-rotation tracking.
 *
 * Priority:
 *  1. x-user-id header (set by generate-trip when calling server-to-server)
 *  2. JWT sub claim from the Authorization Bearer token
 *
 * This ensures the rotation cursor is always tied to the *real* user even when
 * the HTTP request uses the service-role key.
 */
function resolveUserId(req: Request): string | null {
  // 1. Explicit forwarded header (server-to-server path)
  const forwarded = req.headers.get("x-user-id");
  if (forwarded && forwarded.trim()) return forwarded.trim();

  // 2. JWT decode
  try {
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// ─── Flight parsing ───────────────────────────────────────────────────────────

/**
 * Build a Google Flights deep-link booking URL.
 * Falls back to the generic search URL when parameters are incomplete.
 */
function buildFlightBookingUrl(
  departureId: string,
  arrivalId: string,
  outboundDate: string,
  returnDate?: string,
  adults = 1,
  currency = "USD",
): string {
  try {
    // Google Flights search URL
    const from = encodeURIComponent(departureId.toUpperCase());
    const to = encodeURIComponent(arrivalId.toUpperCase());
    const date = encodeURIComponent(outboundDate);
    if (returnDate) {
      return `https://www.google.com/travel/flights/search?tfs=CBwQARoaagcIARIDJHt7from}%2Cw%2F2A&dep=${date}&ret=${encodeURIComponent(returnDate)}`;
    }
    return `https://www.google.com/travel/flights/search?q=Flights+from+${from}+to+${to}+on+${date}`;
  } catch {
    return `https://www.google.com/flights`;
  }
}

/** Parse a single SerpAPI flight-group object into a flat FlightResult. */
function parseSingleFlight(
  group: any,
  googleFlightsUrl: string,
  departureId: string,
  arrivalId: string,
  outboundDate: string,
  returnDate?: string,
  adults = 1,
  currency = "USD",
): Record<string, unknown> {
  const segments: any[] = Array.isArray(group.flights) ? group.flights : [];
  const firstSeg = segments[0] ?? {};
  const lastSeg = segments[segments.length - 1] ?? {};

  // Build rich layover info
  const layovers = Array.isArray(group.layovers)
    ? group.layovers.map((l: any) => ({
        airport: l?.name || l?.id || "",
        duration: l?.duration || 0,
        overnight: l?.overnight || false,
      }))
    : [];

  return {
    airline: firstSeg?.airline || "",
    airline_logo: firstSeg?.airline_logo || "",
    flight_number: firstSeg?.flight_number || "",
    departure_airport: firstSeg?.departure_airport?.name || "",
    departure_code: firstSeg?.departure_airport?.id || departureId,
    departure_time: firstSeg?.departure_airport?.time || "",
    arrival_airport: lastSeg?.arrival_airport?.name || "",
    arrival_code: lastSeg?.arrival_airport?.id || arrivalId,
    arrival_time: lastSeg?.arrival_airport?.time || "",
    price: group.price || 0,
    currency,
    duration: group.total_duration || 0,
    total_duration: group.total_duration || 0,
    stops: segments.length - 1,
    layovers,
    segments: segments.map((s: any) => ({
      airline: s?.airline || "",
      airline_logo: s?.airline_logo || "",
      flight_number: s?.flight_number || "",
      airplane: s?.airplane || "",
      travel_class: s?.travel_class || "",
      legroom: s?.legroom || "",
      departure_airport: s?.departure_airport?.name || "",
      departure_code: s?.departure_airport?.id || "",
      departure_time: s?.departure_airport?.time || "",
      arrival_airport: s?.arrival_airport?.name || "",
      arrival_code: s?.arrival_airport?.id || "",
      arrival_time: s?.arrival_airport?.time || "",
      duration: s?.duration || 0,
      extensions: Array.isArray(s?.extensions) ? s.extensions.slice(0, 6) : [],
    })),
    travel_class: firstSeg?.travel_class || "",
    airplane: firstSeg?.airplane || "",
    legroom: firstSeg?.legroom || "",
    extensions: Array.isArray(firstSeg?.extensions) ? firstSeg.extensions.slice(0, 6) : [],
    carbon_emissions: group.carbon_emissions || null,
    booking_url: googleFlightsUrl ||
      buildFlightBookingUrl(departureId, arrivalId, outboundDate, returnDate, adults, currency),
    // Keep google_flights_url for backward compatibility
    google_flights_url: googleFlightsUrl || "",
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
console.log("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")
  try {
    // 1. Plan-based access gate
    const access = await checkSerpapiFlightsAccess(req);
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ success: false, plan_blocked: true, error: access.reason }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Parse request body
    const requestData = await req.json();
    const {
      departure_id,
      arrival_id,
      outbound_date,
      return_date,
      adults = 1,
      currency = "USD",
      type,
    } = requestData;

    if (!departure_id || !arrival_id || !outbound_date) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: departure_id, arrival_id, outbound_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Resolve effective user ID (supports x-user-id header from generate-trip)
    const currentUserId = resolveUserId(req);

    // 4. Build canonical filters for deterministic cache-key
    const flightFilters: Filters = {
      route: `${String(departure_id).toUpperCase()}-${String(arrival_id).toUpperCase()}`,
      outbound: outbound_date,
      return: return_date || null,
      passengers: Number(adults) || 1,
      currency: currency || "USD",
      trip_type: return_date ? "1" : (type || "2"),
    };

    // 5. Define the fresh-data fetcher (called only on pool miss / exhaustion)
    const fetchFreshFlights = async (): Promise<Record<string, unknown>[]> => {
      console.log("✈️ [serpapi-flights] Calling SerpAPI for fresh flights pool...");
      const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
      if (!SERPAPI_KEY) throw new Error("SERPAPI_KEY not configured");

      const flightType = return_date ? "1" : (type || "2");
      let url =
        `https://serpapi.com/search.json` +
        `?engine=google_flights` +
        `&departure_id=${encodeURIComponent(departure_id)}` +
        `&arrival_id=${encodeURIComponent(arrival_id)}` +
        `&outbound_date=${encodeURIComponent(outbound_date)}` +
        `&currency=${encodeURIComponent(currency || "USD")}` +
        `&hl=en&gl=us` +
        `&type=${flightType}` +
        `&api_key=${SERPAPI_KEY}`;
      if (return_date) url += `&return_date=${encodeURIComponent(return_date)}`;
      if (adults && Number(adults) > 1) url += `&adults=${Number(adults)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal }).finally(() =>
        clearTimeout(timeoutId),
      );

      if (!response.ok) {
        throw new Error(`SerpAPI flights HTTP ${response.status}`);
      }

      const data = await response.json();
      const googleFlightsUrl = data?.search_metadata?.google_flights_url || "";

      // Merge best + other flights into a single pool (~10-25 items)
      const allFlights: any[] = [
        ...(Array.isArray(data.best_flights) ? data.best_flights : []),
        ...(Array.isArray(data.other_flights) ? data.other_flights : []),
      ];

      console.log(`✈️ [serpapi-flights] Fetched ${allFlights.length} flights from SerpAPI`);

      return allFlights.map((f) =>
        parseSingleFlight(
          f,
          googleFlightsUrl,
          departure_id,
          arrival_id,
          outbound_date,
          return_date,
          Number(adults) || 1,
          currency || "USD",
        ),
      );
    };

    // 6. Execute pool rotation
    let flightsToShow: Record<string, unknown>[];
    let cacheSource = "fresh";

    if (currentUserId) {
      const cacheResult: PoolRotationResult<Record<string, unknown>> =
        await resolveWithCache<Record<string, unknown>>(
          flightFilters,
          currentUserId,
          fetchFreshFlights,
        );
      flightsToShow = cacheResult.items || [];
      cacheSource = cacheResult.source;
      console.log(
        `✈️ [serpapi-flights] source=${cacheSource} user=${currentUserId.slice(0, 8)} ` +
          `route=${departure_id}-${arrival_id} count=${flightsToShow.length}`,
      );
    } else {
      // Guest / unauthenticated: always fresh, no DB writes
      flightsToShow = await fetchFreshFlights();
      cacheSource = "fresh_guest";
    }

    // 7. Respond — split into best (first 2) and other (next 3) for UI compat
    return new Response(
      JSON.stringify({
        success: true,
        best_flights: flightsToShow.slice(0, 2),
        other_flights: flightsToShow.slice(2, 5),
        source: cacheSource,
        reused_from_cache: cacheSource === "pool_rotation",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[serpapi-flights] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: "Internal Server Error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});