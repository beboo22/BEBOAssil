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

import { 
  resolveWithCache, 
  type Filters, 
  type PoolRotationResult 
} from "../generate-trip/filterResultsCache.ts"; // تأكد من صحة المسار


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. التحقق من صلاحية الخطة[cite: 16]
    const access = await checkSerpapiFlightsAccess(req);
    if (!access.allowed) {
      return new Response(
        JSON.stringify({ success: false, plan_blocked: true, error: access.reason }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestData = await req.json();
    const { departure_id, arrival_id, outbound_date, return_date, adults, currency, type } = requestData;
    const authHeader = req.headers.get("authorization");
    const currentUserId = getUserIdFromAuthHeader(authHeader);

    if (!departure_id || !arrival_id || !outbound_date) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), { status: 400 });
    }

    // 2. تجهيز فلاتر الرحلة لمفتاح الكاش
    const flightFilters: Filters = {
      route: `${departure_id.toUpperCase()}-${arrival_id.toUpperCase()}`,
      outbound: outbound_date,
      return: return_date || null,
      passengers: adults || 1,
      currency: currency || "USD",
      trip_type: return_date ? "1" : (type || "2")
    };

    // 3. تعريف دالة جلب البيانات الأصلية من SerpAPI (Invoker)[cite: 16]
    const fetchFreshFlights = async () => {
      console.log("✈️ Calling SerpAPI for fresh flights pool...");
      const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
      const flightType = return_date ? "1" : (type || "2");
      let url = `https://serpapi.com/search.json?engine=google_flights&departure_id=${encodeURIComponent(departure_id)}&arrival_id=${encodeURIComponent(arrival_id)}&outbound_date=${outbound_date}&currency=${currency || "USD"}&hl=en&gl=us&type=${flightType}&api_key=${SERPAPI_KEY}`;
      if (return_date) url += `&return_date=${return_date}`;
      if (adults && adults > 1) url += `&adults=${adults}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("SerpAPI flights failed");
      
      const data = await response.json();
      // دمج وتجهيز كافة الرحلات (Best + Other) لتكوين المخزن (Pool)[cite: 16]
      const allFlights = [...(data.best_flights || []), ...(data.other_flights || [])];
      return allFlights.map(f => parseSingleFlight(f, data?.search_metadata?.google_flights_url));
    };

    // 4. تنفيذ منطق التدوير (إرسال 5 رحلات فريدة في كل مرة)
    let flightsToShow;
    let cacheSource = "fresh";

    if (currentUserId) {
      const cacheResult = await resolveWithCache(
        flightFilters,
        currentUserId,
        fetchFreshFlights
      );
      flightsToShow = cacheResult.items || []; // جلب الـ 5 عناصر التالية[cite: 10]
      cacheSource = cacheResult.source;
    } else {
      flightsToShow = await fetchFreshFlights();
    }

    // 5. الرد النهائي[cite: 16]
    return new Response(
      JSON.stringify({
        success: true,
        best_flights: flightsToShow.slice(0, 2), // نعرض أول 2 كـ "Best"
        other_flights: flightsToShow.slice(2),   // الباقي كـ "Other"
        source: cacheSource,
        reused_from_cache: cacheSource === "pool_rotation"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Flight Function Error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), { status: 500 });
  }
});

// --- وظائف مساعدة مستخرجة من كودك الأصلي لتنظيف البيانات ---[cite: 16]

function parseSingleFlight(group: any, googleFlightsUrl: string) {
  const segments = group.flights || [];
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  return {
    airline: firstSeg?.airline || "",
    airline_logo: firstSeg?.airline_logo || "",
    flight_number: firstSeg?.flight_number || "",
    departure_airport: firstSeg?.departure_airport?.name || "",
    departure_code: firstSeg?.departure_airport?.id || "",
    arrival_code: lastSeg?.arrival_airport?.id || "",
    price: group.price || 0,
    duration: group.total_duration || 0,
    booking_url: googleFlightsUrl,
    stops: segments.length - 1,
    // ... يمكن إضافة بقية الحقول هنا حسب الحاجة
  };
}

function getUserIdFromAuthHeader(authHeader: string | null): string | null {
  try {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload?.sub || null;
  } catch { return null; }
}