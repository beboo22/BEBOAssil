// Using built-in Deno.serve (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan-based gating: ensure the caller's active subscription allows SerpAPI hotels.
async function checkSerpapiHotelsAccess(req: Request): Promise<{ allowed: boolean; reason?: string }> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

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

// Serper.dev fallback for hotel search
async function searchHotelsWithSerper(query: string): Promise<any[]> {
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
    
    return (data.places || []).map((place: any) => ({
      name: place.title || "",
      description: place.snippet || place.description || "",
      link: "",
      check_in_time: "",
      check_out_time: "",
      rate_per_night: place.price ? parseInt(String(place.price).replace(/[^0-9]/g, "")) || 0 : 0,
      total_rate: 0,
      nearby_places: [],
      hotel_class: place.rating && place.rating >= 4.5 ? 5 : place.rating && place.rating >= 4 ? 4 : 3,
      extracted_hotel_class: 0,
      images: place.thumbnailUrl ? [{ thumbnail: place.thumbnailUrl, original: place.thumbnailUrl }] : [],
      overall_rating: place.rating || 0,
      reviews: place.ratingCount || place.reviews || 0,
      location_rating: 0,
      amenities: [],
      type: "hotel",
      gps_coordinates: place.latitude && place.longitude ? { latitude: place.latitude, longitude: place.longitude } : null,
    }));
  } catch (e) {
    console.error("Serper.dev hotels fallback error:", e);
    return [];
  }
}

function toNumber(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
  if (value && typeof value === "object") {
    return value.extracted_lowest || value.extracted_before_taxes_fees || value.lowest || value.before_taxes_fees || 0;
  }
  return 0;
}

function normalizeHotelEntry(h: any) {
  const images = Array.isArray(h.images)
    ? h.images
        .map((img: any) => ({
          thumbnail: img?.thumbnail || img?.original_image || img?.original || h.thumbnail || "",
          original: img?.original_image || img?.original || img?.thumbnail || h.thumbnail || "",
        }))
        .filter((img: any) => img.thumbnail || img.original)
    : (h.thumbnail ? [{ thumbnail: h.thumbnail, original: h.thumbnail }] : []);

  return {
    name: h.name || "",
    description: h.description || h.snippet || "",
    link: h.link || "",
    property_token: h.property_token || "",
    serpapi_property_details_link: h.serpapi_property_details_link || "",
    check_in_time: h.check_in_time || "",
    check_out_time: h.check_out_time || "",
    rate_per_night: toNumber(h.rate_per_night || h.extracted_price || h.price),
    total_rate: toNumber(h.total_rate || h.rate_per_night || h.extracted_price || h.price),
    nearby_places: h.nearby_places || [],
    hotel_class: h.hotel_class || 0,
    extracted_hotel_class: h.extracted_hotel_class || h.hotel_class || 0,
    images: images.slice(0, 10),
    overall_rating: h.overall_rating || 0,
    reviews: h.reviews || 0,
    location_rating: h.location_rating || 0,
    amenities: h.amenities || [],
    excluded_amenities: h.excluded_amenities || [],
    health_and_safety: h.health_and_safety || null,
    essential_info: h.essential_info || [],
    prices: h.prices || [],
    free_cancellation: h.free_cancellation || false,
    free_cancellation_until_date: h.free_cancellation_until_date || "",
    free_cancellation_until_time: h.free_cancellation_until_time || "",
    type: h.type || "hotel",
    gps_coordinates: h.gps_coordinates || null,
    source_name: h.source || "",
    source_icon: h.source_icon || "",
    serpapi_google_hotels_reviews_link: h.serpapi_google_hotels_reviews_link || "",
    serpapi_google_hotels_photos_link: h.serpapi_google_hotels_photos_link || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Plan gating (server-side defense in depth)
    const access = await checkSerpapiHotelsAccess(req);
    if (!access.allowed) {
      console.log("serpapi-hotels blocked:", access.reason);
      return new Response(
        JSON.stringify({
          success: false,
          plan_blocked: true,
          error: access.reason || "SerpAPI hotels are not enabled for your plan",
          hotels: [],
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    const { query, check_in_date, check_out_date, adults, children, currency, sort_by, max_price, min_price, hotel_class, property_types, vacation_rentals } = await req.json();

    if (!query || !check_in_date || !check_out_date) {
      return new Response(
        JSON.stringify({ success: false, error: "query, check_in_date, and check_out_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let hotels: any[] = [];
    let source = "serpapi";

    // Try SerpAPI first
    if (SERPAPI_KEY) {
      let url = `https://serpapi.com/search.json?engine=google_hotels&q=${encodeURIComponent(query)}&check_in_date=${check_in_date}&check_out_date=${check_out_date}&currency=${currency || "USD"}&hl=en&gl=us&api_key=${SERPAPI_KEY}`;
      if (adults) url += `&adults=${adults}`;
      if (children) url += `&children=${children}`;
      if (sort_by) url += `&sort_by=${sort_by}`;
      if (max_price && Number(max_price) > 0) url += `&max_price=${Number(max_price)}`;
      if (min_price && Number(min_price) > 0) url += `&min_price=${Number(min_price)}`;
      if (hotel_class) url += `&hotel_class=${encodeURIComponent(String(hotel_class))}`;
      if (property_types) url += `&property_types=${encodeURIComponent(String(property_types))}`;
      if (vacation_rentals) url += `&vacation_rentals=true`;

      console.log("Searching hotels via SerpAPI:", query, check_in_date, "to", check_out_date);
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        const seen = new Set<string>();
        hotels = [...(data.ads || []), ...(data.properties || [])]
          .map((h: any) => normalizeHotelEntry(h))
          .filter((h: any) => {
            const key = h.property_token || `${h.name}-${h.link}-${h.rate_per_night}`;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        return new Response(
          JSON.stringify({
            success: true,
            hotels,
            total_results: data?.search_information?.total_results || hotels.length,
            brands: data?.brands || [],
            source,
            quota_exhausted: false,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        console.warn("SerpAPI hotels failed:", response.status, "- falling back to Serper.dev");
        source = "serper";
      }
    } else {
      source = "serper";
    }

    // Fallback to Serper.dev
    if (hotels.length === 0) {
      console.log("Falling back to Serper.dev for hotels...");
      source = "serper";
      hotels = await searchHotelsWithSerper(query);
    }

    console.log(`Found ${hotels.length} hotels via ${source}`);

    return new Response(
      JSON.stringify({
        success: true,
        hotels,
        total_results: hotels.length,
        brands: [],
        source,
        quota_exhausted: source === "serper",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("serpapi-hotels error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
