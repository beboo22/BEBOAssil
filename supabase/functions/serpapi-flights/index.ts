// Using built-in Deno.serve (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Plan-based gating: ensure the caller's active subscription allows SerpAPI flights.
// - Service-role calls (server-to-server, e.g. generate-trip orchestrator) bypass the gate.
// - Anonymous / no-token calls are blocked.
// - Authenticated users without an active plan or whose plan has serpapi_flights_enabled = false are blocked.
async function checkSerpapiFlightsAccess(req: Request): Promise<{ allowed: boolean; reason?: string }> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

  // Server-to-server bypass
  if (token && SERVICE_ROLE && token === SERVICE_ROLE) {
    return { allowed: true };
  }

  if (!token || !SUPABASE_URL || !SERVICE_ROLE) {
    return { allowed: false, reason: "authentication required" };
  }

  try {
    // Identify the user from their JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return { allowed: false, reason: "invalid session" };

    // Use service role to read the user's active plan flags
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    if (!SERPAPI_KEY) {
      throw new Error("SERPAPI_KEY is not configured");
    }

    // Plan gating (server-side defense in depth)
    const access = await checkSerpapiFlightsAccess(req);
    if (!access.allowed) {
      console.log("serpapi-flights blocked:", access.reason);
      return new Response(
        JSON.stringify({
          success: false,
          plan_blocked: true,
          error: access.reason || "SerpAPI flights are not enabled for your plan",
          best_flights: [],
          other_flights: [],
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { departure_id, arrival_id, outbound_date, return_date, adults, currency, type } = await req.json();

    if (!departure_id || !arrival_id || !outbound_date) {
      return new Response(
        JSON.stringify({ success: false, error: "departure_id, arrival_id, and outbound_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // type: 1 = round trip, 2 = one way
    const flightType = return_date ? "1" : (type || "2");

    let url = `https://serpapi.com/search.json?engine=google_flights&departure_id=${encodeURIComponent(departure_id)}&arrival_id=${encodeURIComponent(arrival_id)}&outbound_date=${outbound_date}&currency=${currency || "USD"}&hl=en&gl=us&type=${flightType}&api_key=${SERPAPI_KEY}`;

    if (return_date) {
      url += `&return_date=${return_date}`;
    }
    if (adults && adults > 1) {
      url += `&adults=${adults}`;
    }

    console.log("Searching flights:", departure_id, "->", arrival_id, outbound_date);

    const response = await fetch(url);
    if (!response.ok) {
      const errText = await response.text();
      console.error("SerpAPI flights error:", response.status, errText);
      // Return empty results gracefully so client can fall back to Aviasales
      return new Response(
        JSON.stringify({
          success: true,
          best_flights: [],
          other_flights: [],
          price_insights: null,
          airports: [],
          quota_exhausted: response.status === 429,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const googleFlightsUrl = data?.search_metadata?.google_flights_url || "";

    // Parse best_flights and other_flights
    const parseFlights = (flightGroups: any[]) => {
      return (flightGroups || []).map((group: any) => {
        const segments = group.flights || [];
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];

        const layovers = (group.layovers || []).map((l: any) => ({
          airport: l.name,
          code: l.id,
          duration: l.duration,
          overnight: l.overnight,
        }));

        return {
          airline: firstSeg?.airline || "",
          airline_logo: firstSeg?.airline_logo || "",
          flight_number: firstSeg?.flight_number || "",
          departure_airport: firstSeg?.departure_airport?.name || "",
          departure_code: firstSeg?.departure_airport?.id || "",
          departure_time: firstSeg?.departure_airport?.time || "",
          arrival_airport: lastSeg?.arrival_airport?.name || "",
          arrival_code: lastSeg?.arrival_airport?.id || "",
          arrival_time: lastSeg?.arrival_airport?.time || "",
          duration: group.total_duration || 0,
          total_duration: group.total_duration || 0,
          price: group.price || 0,
          type: group.type || "",
          extensions: group.extensions || [],
          booking_token: group.booking_token || group.departure_token || "",
          departure_token: group.departure_token || "",
          booking_url: googleFlightsUrl,
          stops: segments.length - 1,
          layovers,
          travel_class: firstSeg?.travel_class || "Economy",
          airplane: firstSeg?.airplane || "",
          legroom: firstSeg?.legroom || "",
          carbon_emissions: group.carbon_emissions?.this_flight || 0,
          segments: segments.map((s: any) => ({
            airline: s.airline,
            airline_logo: s.airline_logo,
            flight_number: s.flight_number,
            departure: s.departure_airport,
            arrival: s.arrival_airport,
            duration: s.duration,
            airplane: s.airplane,
            travel_class: s.travel_class,
            legroom: s.legroom,
          })),
        };
      });
    };

    const bestFlights = parseFlights(data.best_flights);
    const otherFlights = parseFlights(data.other_flights);

    console.log(`Found ${bestFlights.length} best + ${otherFlights.length} other flights`);

    return new Response(
      JSON.stringify({
        success: true,
        best_flights: bestFlights,
        other_flights: otherFlights,
        price_insights: data.price_insights || null,
        airports: data.airports || [],
          google_flights_url: googleFlightsUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("serpapi-flights error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
