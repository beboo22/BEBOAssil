/**
 * serpapi-hotels/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Edge Function — Google Hotels via SerpAPI  (+ Serper.dev fallback)
 *
 * FEATURES
 * ────────
 *  • Plan-based access gating  (serpapi_hotels_enabled)
 *  • Service-role bypass for server-to-server calls (e.g. generate-trip)
 *  • Stateful Pool Rotation via filterResultsCache.ts
 *    – Stores the full ~25-hotel pool in filter_results_cache
 *    – Serves 5 unique unseen hotels per user per set of filters
 *    – Different users get a cryptoShuffled subset of the same pool
 *    – Pool exhaustion triggers a fresh SerpAPI call
 *  • Serper.dev fallback when SerpAPI fails or has no results
 *  • userId forwarded from generate-trip via x-user-id header so rotation
 *    is consistent across the whole itinerary pipeline
 *  • Rich hotel normalisation (images, amenities, ratings, coords, …)
 *  • Graceful fallback — never crashes the caller
 *
 * REQUEST BODY (JSON)
 * ───────────────────
 *  query            string   Hotel search query, e.g. "hotels in Dubai"   (required)
 *  check_in_date    string   YYYY-MM-DD                                   (required)
 *  check_out_date   string   YYYY-MM-DD                                   (required)
 *  adults?          number   default 2
 *  children?        number   default 0
 *  currency?        string   default "USD"
 *  max_price?       number   Filter by max price per night
 *  hotel_class?     string   "3", "4", or "5"
 *  vacation_rentals? boolean  Include vacation rentals
 *
 * RESPONSE (JSON)
 * ───────────────
 *  success     boolean
 *  hotels      NormalizedHotel[]   (up to 5, unique per user per call)
 *  source      CacheSource
 *  reused_from_cache  boolean
 *
 * INTERNAL HEADER (server-to-server)
 * ───────────────────────────────────
 *  x-user-id   UUID of the authenticated user — forwarded by generate-trip
 *              so pool rotation is consistent even when the Authorization
 *              token is a service-role key.
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

async function checkSerpapiHotelsAccess(
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
      .select("serpapi_hotels_enabled")
      .eq("id", sub.plan_id)
      .maybeSingle();

    if (!plan?.serpapi_hotels_enabled) {
      return { allowed: false, reason: "plan does not include SerpAPI hotels" };
    }
    return { allowed: true };
  } catch (e) {
    console.warn("checkSerpapiHotelsAccess error:", e);
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

// ─── Hotel normalisation ──────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return (
      Number(v.extracted_lowest) ||
      Number(v.extracted_before_taxes_fees) ||
      Number(v.lowest) ||
      Number(v.before_taxes_fees) ||
      0
    );
  }
  return 0;
}

interface NormalizedHotel {
  name: string;
  description: string;
  link: string;
  property_token: string;
  serpapi_property_details_link: string;
  check_in_time: string;
  check_out_time: string;
  rate_per_night: number;
  total_rate: number;
  nearby_places: unknown[];
  hotel_class: number;
  extracted_hotel_class: number;
  images: Array<{ thumbnail: string; original: string }>;
  overall_rating: number;
  reviews: number;
  location_rating: number;
  amenities: string[];
  excluded_amenities: string[];
  health_and_safety: unknown;
  essential_info: unknown[];
  prices: unknown[];
  free_cancellation: boolean;
  free_cancellation_until_date: string;
  free_cancellation_until_time: string;
  type: string;
  gps_coordinates: { latitude: number; longitude: number } | null;
  source_name: string;
  source_icon: string;
  serpapi_google_hotels_reviews_link: string;
  serpapi_google_hotels_photos_link: string;
}

function normalizeHotelEntry(h: any): NormalizedHotel {
  const images: Array<{ thumbnail: string; original: string }> = Array.isArray(h.images)
    ? h.images
        .map((img: any) => ({
          thumbnail: img?.thumbnail || img?.original_image || img?.original || h.thumbnail || "",
          original: img?.original_image || img?.original || img?.thumbnail || h.thumbnail || "",
        }))
        .filter((img: { thumbnail: string; original: string }) => img.thumbnail || img.original)
    : h.thumbnail
    ? [{ thumbnail: h.thumbnail, original: h.thumbnail }]
    : [];

  return {
    name: h.name || "",
    description: h.description || h.snippet || "",
    link: h.link || "",
    property_token: h.property_token || "",
    serpapi_property_details_link: h.serpapi_property_details_link || "",
    check_in_time: h.check_in_time || "",
    check_out_time: h.check_out_time || "",
    rate_per_night: toNumber(h.rate_per_night ?? h.extracted_price ?? h.price),
    total_rate: toNumber(h.total_rate ?? h.rate_per_night ?? h.extracted_price ?? h.price),
    nearby_places: Array.isArray(h.nearby_places) ? h.nearby_places : [],
    hotel_class: Number(h.hotel_class) || 0,
    extracted_hotel_class: Number(h.extracted_hotel_class) || Number(h.hotel_class) || 0,
    images: images.slice(0, 10),
    overall_rating: Number(h.overall_rating) || 0,
    reviews: Number(h.reviews) || 0,
    location_rating: Number(h.location_rating) || 0,
    amenities: Array.isArray(h.amenities) ? h.amenities : [],
    excluded_amenities: Array.isArray(h.excluded_amenities) ? h.excluded_amenities : [],
    health_and_safety: h.health_and_safety || null,
    essential_info: Array.isArray(h.essential_info) ? h.essential_info : [],
    prices: Array.isArray(h.prices) ? h.prices : [],
    free_cancellation: !!h.free_cancellation,
    free_cancellation_until_date: h.free_cancellation_until_date || "",
    free_cancellation_until_time: h.free_cancellation_until_time || "",
    type: h.type || "hotel",
    gps_coordinates:
      h.gps_coordinates?.latitude != null && h.gps_coordinates?.longitude != null
        ? {
            latitude: Number(h.gps_coordinates.latitude),
            longitude: Number(h.gps_coordinates.longitude),
          }
        : null,
    source_name: h.source || "",
    source_icon: h.source_icon || "",
    serpapi_google_hotels_reviews_link: h.serpapi_google_hotels_reviews_link || "",
    serpapi_google_hotels_photos_link: h.serpapi_google_hotels_photos_link || "",
  };
}

// ─── Serper.dev fallback ──────────────────────────────────────────────────────

async function searchHotelsWithSerper(query: string): Promise<NormalizedHotel[]> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return [];

  try {
    const resp = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `hotels in ${query}` }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();

    return (data.places || []).map((place: any): NormalizedHotel => ({
      name: place.title || "",
      description: place.snippet || place.description || "",
      link: "",
      property_token: "",
      serpapi_property_details_link: "",
      check_in_time: "",
      check_out_time: "",
      rate_per_night: place.price
        ? parseInt(String(place.price).replace(/[^0-9]/g, "")) || 0
        : 0,
      total_rate: 0,
      nearby_places: [],
      hotel_class:
        place.rating && place.rating >= 4.5
          ? 5
          : place.rating && place.rating >= 4
          ? 4
          : 3,
      extracted_hotel_class: 0,
      images: place.thumbnailUrl
        ? [{ thumbnail: place.thumbnailUrl, original: place.thumbnailUrl }]
        : [],
      overall_rating: Number(place.rating) || 0,
      reviews: Number(place.ratingCount) || Number(place.reviews) || 0,
      location_rating: 0,
      amenities: [],
      excluded_amenities: [],
      health_and_safety: null,
      essential_info: [],
      prices: [],
      free_cancellation: false,
      free_cancellation_until_date: "",
      free_cancellation_until_time: "",
      type: "hotel",
      gps_coordinates:
        place.latitude != null && place.longitude != null
          ? { latitude: Number(place.latitude), longitude: Number(place.longitude) }
          : null,
      source_name: "serper",
      source_icon: "",
      serpapi_google_hotels_reviews_link: "",
      serpapi_google_hotels_photos_link: "",
    }));
  } catch (e) {
    console.error("[serpapi-hotels] Serper.dev fallback error:", e);
    return [];
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
console.log("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH")

  try {
    // 1. Plan-based access gate
    const access = await checkSerpapiHotelsAccess(req);
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: access.reason }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Parse request body
    const requestData = await req.json();
    const {
      query,
      check_in_date,
      check_out_date,
      adults = 2,
      children = 0,
      currency = "USD",
      max_price,
      hotel_class,
      vacation_rentals,
    } = requestData;

    if (!query || !check_in_date || !check_out_date) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: query, check_in_date, check_out_date",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Resolve effective user ID (supports x-user-id header from generate-trip)
    const currentUserId = resolveUserId(req);

    // 4. Build canonical filters for deterministic cache-key
    const hotelFilters: Filters = {
      query: String(query).toLowerCase().trim(),
      check_in: check_in_date,
      check_out: check_out_date,
      adults: Number(adults) || 2,
      children: Number(children) || 0,
      currency: currency || "USD",
      // Include optional filters in key so different star ratings get separate pools
      ...(max_price ? { max_price: Number(max_price) } : {}),
      ...(hotel_class ? { hotel_class: String(hotel_class) } : {}),
      ...(vacation_rentals ? { vacation_rentals: true } : {}),
    };

    // 5. Define the fresh-data fetcher (called only on pool miss / exhaustion)
    const fetchFreshPool = async (): Promise<NormalizedHotel[]> => {
      console.log(`🏨 [serpapi-hotels] Calling SerpAPI for fresh hotels pool: "${query}"`);
      const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");

      if (SERPAPI_KEY) {
        try {
          let url =
            `https://serpapi.com/search.json` +
            `?engine=google_hotels` +
            `&q=${encodeURIComponent(query)}` +
            `&check_in_date=${encodeURIComponent(check_in_date)}` +
            `&check_out_date=${encodeURIComponent(check_out_date)}` +
            `&currency=${encodeURIComponent(currency || "USD")}` +
            `&api_key=${SERPAPI_KEY}`;
          if (adults && Number(adults) > 1) url += `&adults=${Number(adults)}`;
          if (children && Number(children) > 0) url += `&children=${Number(children)}`;
          if (max_price && Number(max_price) > 0) url += `&max_price=${Number(max_price)}`;
          if (hotel_class) url += `&hotel_class=${encodeURIComponent(String(hotel_class))}`;
          if (vacation_rentals) url += `&vacation_rentals=true`;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          const response = await fetch(url, { signal: controller.signal }).finally(() =>
            clearTimeout(timeoutId),
          );

          if (!response.ok) {
            throw new Error(`SerpAPI hotels HTTP ${response.status}`);
          }

          const data = await response.json();
          // Pool = ads (sponsored) + organic properties, up to 25
          const rawPool: any[] = [
            ...(Array.isArray(data.ads) ? data.ads : []),
            ...(Array.isArray(data.properties) ? data.properties : []),
          ];

          if (rawPool.length > 0) {
            const normalized = rawPool.map(normalizeHotelEntry);
            console.log(`🏨 [serpapi-hotels] Fetched ${normalized.length} hotels from SerpAPI`);
            return normalized;
          }

          // Zero results from SerpAPI — try Serper.dev fallback
          console.warn(`🏨 [serpapi-hotels] SerpAPI returned 0 results for "${query}", trying Serper.dev`);
        } catch (err) {
          console.warn(`🏨 [serpapi-hotels] SerpAPI error: ${String(err)}, trying Serper.dev fallback`);
        }
      }

      // Serper.dev fallback
      const serperResults = await searchHotelsWithSerper(query);
      if (serperResults.length > 0) {
        console.log(`🏨 [serpapi-hotels] Fetched ${serperResults.length} hotels from Serper.dev`);
        return serperResults;
      }

      return [];
    };

    // 6. Execute pool rotation
    let hotelsToShow: NormalizedHotel[];
    let cacheSource = "fresh";

    if (currentUserId) {
      const cacheResult: PoolRotationResult<NormalizedHotel> =
        await resolveWithCache<NormalizedHotel>(
          hotelFilters,
          currentUserId,
          fetchFreshPool,
        );
      hotelsToShow = cacheResult.items || [];
      cacheSource = cacheResult.source;
      console.log(
        `🏨 [serpapi-hotels] source=${cacheSource} user=${currentUserId.slice(0, 8)} ` +
          `query="${query}" count=${hotelsToShow.length}`,
      );
    } else {
      // Guest / unauthenticated: always fresh, no DB writes
      hotelsToShow = await fetchFreshPool();
      cacheSource = "fresh_guest";
    }

    // 7. Respond
    return new Response(
      JSON.stringify({
        success: true,
        hotels: hotelsToShow,
        source: cacheSource,
        reused_from_cache: cacheSource === "pool_rotation",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[serpapi-hotels] Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: "Internal Server Error", detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});