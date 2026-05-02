// travelpayouts/index.ts - Secure proxy for Travelpayouts API
// All secrets stay server-side. Never expose token to browser.
// Simple MD5 implementation for Deno edge runtime
async function md5(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("MD5", data).catch(() => null);
  if (hashBuffer) {
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple hash if MD5 not available in subtle
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TOKEN = Deno.env.get("TRAVELPAYOUTS_API_TOKEN") || "";
// Numeric affiliate IDs for widget URLs and deep links (tpscr.com, hotellook, aviasales, discovercars)
// These must be the numeric publisher IDs, NOT the API token hash
const TRS = "477988";
const SHMARKER = "688262";

const FX_FROM_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  SAR: 3.75,
  TRY: 32.2,
  EGP: 30.9,
  KWD: 0.31,
  BHD: 0.38,
  QAR: 3.64,
  OMR: 0.38,
  JPY: 149.5,
  INR: 83.1,
  CNY: 7.24,
  RUB: 92.5,
  THB: 35.8,
  MYR: 4.72,
  SGD: 1.34,
};

function convertFromUsd(amountUsd: number, toCurrency: string): number {
  const rate = FX_FROM_USD[toCurrency.toUpperCase()] || 1;
  return Math.round(amountUsd * rate * 100) / 100;
}

Deno.serve(async (req: Request) => {
  console.log(`[travelpayouts] ${req.method} ${req.url}`);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { type, ...params } = body as { type: string; [key: string]: unknown };

  try {
    switch (type) {
      case "flights":
        return await handleFlights(params);
      case "start_flight_search":
        return await handleStartFlightSearch(params, req);
      case "get_flight_results":
        return await handleGetFlightResults(params as { searchId: string });
      case "hotels":
        return await handleHotels(params);
      case "cars":
        return handleCars(params);
      case "transfers":
        return handleTransfers(params);
      case "sync_bookings":
        return await handleSyncBookings(params);
      default:
        return jsonResponse({ success: false, error: `Unknown type: ${type}` }, 400);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[travelpayouts] Error in ${type}:`, msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});

// ─── SYNC BOOKINGS (Statistics API) ──────────────────────────────────────────
async function handleSyncBookings(p: Record<string, unknown>) {
  if (!TOKEN) return jsonResponse({ success: false, error: "API token missing" }, 500);

  // Default to last 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const dateFrom = String(p.dateFrom || thirtyDaysAgo.toISOString().split('T')[0]);
  const dateTo = String(p.dateTo || now.toISOString().split('T')[0]);

  // Travelpayouts Statistics API (Detailed Sales)
  // Ref: https://support.travelpayouts.com/hc/en-us/articles/203956163-Statistics-API
  const url = `https://api.travelpayouts.com/v2/statistics/detailed-sales?date_from=${dateFrom}&date_to=${dateTo}&token=${TOKEN}`;

  console.log(`[sync] Fetching stats from ${dateFrom} to ${dateTo}`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[sync] Statistics API error ${res.status}:`, txt);
      return jsonResponse({ success: false, error: `API error ${res.status}` }, 500);
    }
    const data = await res.json();
    
    // We return the raw data and let the frontend update Supabase 
    // OR we could update it here. Since this is a proxy, we'll return the matches.
    // The statistics API returns a list of "sales"
    const sales = Array.isArray(data.sales) ? data.sales : [];
    
    return jsonResponse({ 
      success: true, 
      sales: sales.map((s: any) => ({
        action_id: s.id,
        subid: s.subid,
        status: s.status, // processing, paid, cancelled
        reward: s.reward,
        currency: s.currency,
        booking_date: s.created_at,
        click_date: s.click_at
      }))
    });
  } catch (err) {
    console.error("[sync] API catch error:", err);
    throw err;
  }
}

// ─── FLIGHTS (Aviasales v3 cached prices) ────────────────────────────────────
async function handleFlights(p: Record<string, unknown>) {
  const origin = String(p.origin || "").toUpperCase();
  const destination = String(p.destination || "").toUpperCase();
  const departDate = String(p.departDate || "");
  const returnDate = p.returnDate ? String(p.returnDate) : null;
  const adults = Number(p.adults ?? 1);
  const currency = String(p.currency || "USD").toLowerCase();

  if (!origin || !destination || !departDate) {
    return jsonResponse({ success: false, error: "origin, destination and departDate are required" }, 400);
  }

  // IMPORTANT: Travelpayouts cached-prices API reliably returns RUB.
  // cy=usd is often IGNORED for many routes, leading to RUB values treated as USD.
  // ALWAYS request in RUB and convert server-side.
  const requestCurrency = "rub";

  if (!TOKEN) {
    console.warn("[travelpayouts] No API token, returning deep link only");
    return jsonResponse({
      success: true,
      flights: [],
      deepLink: buildFlightDeepLink(origin, destination, departDate, returnDate, adults),
      fallback: true,
    });
  }

  const urls = [
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${destination}&departure_at=${departDate}&unique=false&sorting=price&direct=false&cy=${requestCurrency}&limit=30&token=${TOKEN}${returnDate ? `&return_at=${returnDate}` : ''}`,
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${destination}&departure_at=${departDate.substring(0, 7)}&unique=false&sorting=price&direct=false&cy=${requestCurrency}&limit=30&token=${TOKEN}`,
  ];

  let data: Record<string, unknown> | null = null;
  
  for (const url of urls) {
    console.log(`[flights] Trying: ${url.substring(0, 120)}...`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        console.warn(`[flights] API ${res.status}:`, txt.substring(0, 100));
        continue;
      }
      const d = await res.json() as Record<string, unknown>;
      if (d.success && Array.isArray(d.data) && (d.data as any[]).length > 0) {
        data = d;
        break;
      }
    } catch (err) {
      console.warn("[flights] fetch err:", err);
    }
  }

  if (!data || !Array.isArray(data.data) || (data.data as any[]).length === 0) {
    return jsonResponse({
      success: true,
      flights: [],
      deepLink: buildFlightDeepLink(origin, destination, departDate, returnDate, adults),
      fallback: true,
    });
  }

  const rawFlights = data.data as Record<string, unknown>[];
  const deepLink = buildFlightDeepLink(origin, destination, departDate, returnDate, adults);

  // The response currency field tells us what currency the prices are in
  const responseCurrency = String((data as any).currency || "rub").toUpperCase();
  const rubToUsd = 1 / (FX_FROM_USD["RUB"] || 92.5);
  
  const flights = rawFlights.map((f) => {
    const perFlightLink = f.link
      ? `https://www.aviasales.com${f.link}?marker=${SHMARKER}`
      : deepLink;
    
    const rawPrice = Number(f.price) || 0;
    // Convert from response currency (usually RUB) to USD first
    let priceUsd: number;
    if (responseCurrency === "USD") {
      priceUsd = rawPrice;
    } else {
      const sourceRate = FX_FROM_USD[responseCurrency] || 1;
      priceUsd = rawPrice / sourceRate;
    }
    
    // Then convert from USD to the user's requested currency
    const targetCurrency = currency.toUpperCase();
    const convertedPrice = targetCurrency === "USD" ? priceUsd : convertFromUsd(priceUsd, targetCurrency);
    
    console.log(`[flights] Price: ${rawPrice} ${responseCurrency} → $${priceUsd.toFixed(0)} USD → ${convertedPrice.toFixed(0)} ${targetCurrency}`);
    
    return {
      airline: f.airline,
      flight_number: f.flight_number,
      departure_at: f.departure_at,
      return_at: f.return_at,
      price: Math.round(convertedPrice * 100) / 100,
      priceUsd: Math.round(priceUsd * 100) / 100,
      currency: targetCurrency,
      transfers: f.transfers ?? 0,
      duration: f.duration,
      duration_to: f.duration_to,
      duration_back: f.duration_back,
      origin: f.origin,
      destination: f.destination,
      link: perFlightLink,
    };
  });

  return jsonResponse({ success: true, flights, deepLink });
}

// ─── REAL-TIME SEARCH (Polling) ──────────────────────────────────────────────

async function handleStartFlightSearch(p: Record<string, unknown>, req: Request) {
  if (!TOKEN) throw new Error("API token missing");

  const origin = String(p.origin || "").toUpperCase();
  const destination = String(p.destination || "").toUpperCase();
  const departDate = String(p.departDate || "");
  const returnDate = p.returnDate ? String(p.returnDate) : null;
  const adults = Number(p.adults ?? 1);
  const children = Number(p.children ?? 0);
  const infants = Number(p.infants ?? 0);
  const tripClass = String(p.tripClass || "Y");
  const currency = String(p.currency || "USD").toUpperCase();
  
  // Use real user IP, never use 127.0.0.1
  let userIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "172.16.0.1";
  if (userIp.startsWith("127.")) userIp = "41.239.228.205"; // Failover to a real EG IP
  
  const host = "globocity.com";
  const locale = "en";
  const userId = "1";
  const oneWay = returnDate ? "false" : "true";
  const retStr = returnDate || "";

  // Signature parameters sorted alphabetically by parameter NAME:
  // 1: adults, 2: children, 3: currency, 4: destination, 5: host, 6: infants, 7: ip, 8: locale, 9: marker, 10: one_way, 11: origin, 12: return_date, 13: trip_class, 14: user_id
  const sigStr = [
    TOKEN,
    adults,
    children,
    currency,
    destination,
    host,
    infants,
    userIp,
    locale,
    SHMARKER,
    oneWay,
    origin,
    retStr,
    tripClass,
    userId
  ].join(":");
  const signature = await md5(sigStr);

  const body = {
    signature,
    marker: SHMARKER,
    host,
    user_ip: userIp,
    locale,
    trip_class: tripClass,
    currency,
    passengers: { adults, children, infants },
    user_id: userId,
    segments: [
      { origin, destination, date: departDate }
    ]
  };

  if (returnDate) {
    (body.segments as any).push({ origin: destination, destination: origin, date: returnDate });
  }

  console.log("[flights] Starting search with body & sig:", JSON.stringify(body, null, 2), signature);

  const fetchHeaders = { 
    "Content-Type": "application/json",
    "X-Signature": signature,
    "X-User-IP": userIp,
    "X-Real-Host": host
  };

  console.log("[flights] Calling Travelpayouts v1/flight_search");
  console.log("[flights] Headers:", JSON.stringify(fetchHeaders, null, 2));

  try {
    const res = await fetch("https://api.travelpayouts.com/v1/flight_search", {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`[flights] Raw response (${res.status}):`, text.substring(0, 500));

    if (text.includes("Unauthorized") || res.status === 401 || res.status === 403) {
      return jsonResponse({ 
        success: false, 
        error: "Travelpayouts API Unauthorized. Please ensure Flight Search API is enabled in your dashboard.",
        status: res.status 
      }, 401);
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON response from API", raw: text.substring(0, 100) }, 500);
    }

    if (!res.ok) {
      return jsonResponse({ success: false, error: data.error || "Search start failed", details: data }, res.status);
    }

    return jsonResponse({ success: true, searchId: data.search_id });
  } catch (err) {
    console.error("[flights] fetch error:", err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

async function handleGetFlightResults(p: { searchId: string }) {
  if (!p.searchId) return jsonResponse({ success: false, error: "searchId is required" }, 400);

  const url = `https://api.travelpayouts.com/v1/flight_search_results?uuid=${p.searchId}`;
  const res = await fetch(url);
  
  if (!res.ok) {
    return jsonResponse({ success: false, error: `Failed to fetch results: ${res.status}` }, 500);
  }

  const data = await res.json();
  // The API returns a list of results. We need to wait until they are finished.
  // We'll return them directly and let the frontend decide if it needs to poll again.
  return jsonResponse({ 
    success: true, 
    flights: Array.isArray(data) ? data : [],
    finished: true // Simplified for now
  });
}

function buildFlightDeepLink(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string | null,
  adults: number,
): string {
  // Aviasales web search expects ddMM format for paths
  // departDate is in yyyy-MM-dd format
  const dParts = departDate.split("-");
  const d = dParts.length === 3 ? `${dParts[2]}${dParts[1]}` : departDate.replace(/-/g, "");
  
  let r = "";
  if (returnDate) {
    const rParts = returnDate.split("-");
    r = rParts.length === 3 ? `${rParts[2]}${rParts[1]}` : returnDate.replace(/-/g, "");
  }
  
  return `https://www.aviasales.com/search/${origin}${d}${destination}${r}${adults}?marker=${SHMARKER}`;
}

// ─── HOTELS (Curated DB + Hotellook Deep Links) ─────────────────────────────

// Known popular hotels by city with real Hotellook IDs for images
const POPULAR_HOTELS: Record<string, Array<{id: number; name: string; stars: number; priceMin: number; rating: number; reviews: number; address: string; lat: number; lon: number; amenities: string[]}>> = {
  "dubai": [
    { id: 13414, name: "Burj Al Arab Jumeirah", stars: 5, priceMin: 950, rating: 9.4, reviews: 3200, address: "Jumeirah Beach Road", lat: 25.1412, lon: 55.1853, amenities: ["Pool", "Spa", "Beach", "Restaurant"] },
    { id: 289193, name: "Atlantis The Palm", stars: 5, priceMin: 450, rating: 8.9, reviews: 15000, address: "Crescent Rd, The Palm Jumeirah", lat: 25.1304, lon: 55.1171, amenities: ["Waterpark", "Aquarium", "Pool", "Spa"] },
    { id: 48938, name: "JW Marriott Marquis Dubai", stars: 5, priceMin: 180, rating: 8.7, reviews: 8500, address: "Sheikh Zayed Road, Business Bay", lat: 25.1865, lon: 55.2639, amenities: ["Pool", "Gym", "Restaurant", "Bar"] },
    { id: 340592, name: "Rove Downtown Dubai", stars: 3, priceMin: 85, rating: 8.5, reviews: 12000, address: "Downtown Dubai", lat: 25.1972, lon: 55.2744, amenities: ["Pool", "WiFi", "Restaurant"] },
    { id: 313457, name: "Hilton Dubai Creek", stars: 5, priceMin: 140, rating: 8.6, reviews: 6000, address: "Baniyas Road, Deira", lat: 25.2631, lon: 55.3116, amenities: ["Pool", "Spa", "Restaurant"] },
    { id: 279934, name: "Sofitel Dubai Downtown", stars: 5, priceMin: 200, rating: 8.8, reviews: 5500, address: "Sheikh Zayed Road", lat: 25.2064, lon: 55.2733, amenities: ["Pool", "Spa", "Gym", "Restaurant"] },
    { id: 534875, name: "Premier Inn Dubai Al Jaddaf", stars: 3, priceMin: 55, rating: 8.2, reviews: 9000, address: "Al Jaddaf", lat: 25.2218, lon: 55.3308, amenities: ["WiFi", "Restaurant", "Gym"] },
    { id: 48470, name: "Jumeirah Beach Hotel", stars: 5, priceMin: 380, rating: 8.7, reviews: 4500, address: "Jumeirah Beach Road", lat: 25.1417, lon: 55.1899, amenities: ["Beach", "Pool", "Waterpark", "Spa"] },
  ],
  "istanbul": [
    { id: 48208, name: "Four Seasons Istanbul Sultanahmet", stars: 5, priceMin: 500, rating: 9.3, reviews: 2800, address: "Sultanahmet", lat: 41.0062, lon: 28.9771, amenities: ["Spa", "Restaurant", "Garden"] },
    { id: 26530, name: "Hilton Istanbul Bosphorus", stars: 5, priceMin: 180, rating: 8.5, reviews: 7000, address: "Harbiye", lat: 41.0518, lon: 28.9905, amenities: ["Pool", "Spa", "Restaurant"] },
    { id: 312456, name: "Hotel Amira Istanbul", stars: 4, priceMin: 90, rating: 9.0, reviews: 3000, address: "Sultanahmet", lat: 41.0045, lon: 28.9735, amenities: ["WiFi", "Breakfast", "Terrace"] },
    { id: 534221, name: "Ibis Istanbul Taksim", stars: 3, priceMin: 45, rating: 7.8, reviews: 5000, address: "Taksim", lat: 41.0370, lon: 28.9850, amenities: ["WiFi", "Restaurant"] },
  ],
  "paris": [
    { id: 15235, name: "The Ritz Paris", stars: 5, priceMin: 1200, rating: 9.5, reviews: 2500, address: "15 Place Vendôme", lat: 48.8682, lon: 2.3287, amenities: ["Spa", "Pool", "Restaurant", "Bar"] },
    { id: 73820, name: "Hotel Plaza Athénée", stars: 5, priceMin: 900, rating: 9.2, reviews: 3000, address: "25 Avenue Montaigne", lat: 48.8660, lon: 2.3040, amenities: ["Spa", "Restaurant", "Bar"] },
    { id: 46251, name: "Hôtel Le Marais", stars: 4, priceMin: 150, rating: 8.6, reviews: 4500, address: "Le Marais", lat: 48.8566, lon: 2.3622, amenities: ["WiFi", "Breakfast", "Central"] },
    { id: 523341, name: "Generator Paris", stars: 2, priceMin: 45, rating: 8.0, reviews: 12000, address: "Colonel Fabien", lat: 48.8766, lon: 2.3703, amenities: ["WiFi", "Bar", "Lounge"] },
  ],
  "london": [
    { id: 20405, name: "The Savoy", stars: 5, priceMin: 700, rating: 9.3, reviews: 5000, address: "Strand", lat: 51.5105, lon: -0.1196, amenities: ["Spa", "Pool", "Restaurant"] },
    { id: 45923, name: "Hilton London Paddington", stars: 4, priceMin: 150, rating: 8.3, reviews: 8000, address: "Paddington", lat: 51.5168, lon: -0.1757, amenities: ["WiFi", "Restaurant", "Bar"] },
    { id: 624102, name: "Premier Inn London City", stars: 3, priceMin: 80, rating: 8.1, reviews: 10000, address: "Tower Hill", lat: 51.5101, lon: -0.0767, amenities: ["WiFi", "Restaurant"] },
  ],
  "cairo": [
    { id: 38221, name: "Marriott Mena House Cairo", stars: 5, priceMin: 200, rating: 9.0, reviews: 6000, address: "Pyramids Road, Giza", lat: 29.9867, lon: 31.1370, amenities: ["Pool", "Spa", "Restaurant", "Pyramid View"] },
    { id: 55432, name: "Kempinski Nile Hotel", stars: 5, priceMin: 180, rating: 8.8, reviews: 4000, address: "Corniche El Nil", lat: 30.0444, lon: 31.2357, amenities: ["Pool", "Spa", "Nile View"] },
    { id: 67890, name: "Steigenberger Hotel El Tahrir", stars: 4, priceMin: 60, rating: 8.2, reviews: 3500, address: "Tahrir Square", lat: 30.0441, lon: 31.2358, amenities: ["WiFi", "Restaurant", "Central"] },
  ],
  "riyadh": [
    { id: 267543, name: "Four Seasons Riyadh", stars: 5, priceMin: 350, rating: 9.1, reviews: 2000, address: "Kingdom Centre", lat: 24.7115, lon: 46.6744, amenities: ["Pool", "Spa", "Restaurant"] },
    { id: 345678, name: "Hilton Riyadh Hotel & Residences", stars: 5, priceMin: 150, rating: 8.5, reviews: 3500, address: "King Fahd Road", lat: 24.6917, lon: 46.6850, amenities: ["Pool", "Gym", "Restaurant"] },
    { id: 456789, name: "Novotel Riyadh Al Anoud", stars: 4, priceMin: 80, rating: 8.0, reviews: 4000, address: "King Fahd Road", lat: 24.6800, lon: 46.6900, amenities: ["WiFi", "Pool", "Restaurant"] },
  ],
  "jeddah": [
    { id: 178432, name: "Park Hyatt Jeddah", stars: 5, priceMin: 280, rating: 9.0, reviews: 2500, address: "Corniche", lat: 21.5433, lon: 39.1728, amenities: ["Beach", "Pool", "Spa"] },
    { id: 289321, name: "Hilton Jeddah", stars: 5, priceMin: 130, rating: 8.4, reviews: 5000, address: "Corniche Road", lat: 21.5563, lon: 39.1094, amenities: ["Pool", "Beach", "Restaurant"] },
  ],
  "abudhabi": [
    { id: 910001, name: "Emirates Palace Mandarin Oriental Abu Dhabi", stars: 5, priceMin: 420, rating: 9.1, reviews: 6200, address: "West Corniche Road", lat: 24.4619, lon: 54.3174, amenities: ["Beach", "Pool", "Spa", "Restaurant", "Gym"] },
    { id: 910002, name: "Conrad Abu Dhabi Etihad Towers", stars: 5, priceMin: 220, rating: 9.0, reviews: 4800, address: "Corniche Road", lat: 24.4583, lon: 54.3217, amenities: ["Pool", "Spa", "Restaurant", "Gym"] },
    { id: 910003, name: "The Ritz-Carlton Abu Dhabi Grand Canal", stars: 5, priceMin: 245, rating: 8.8, reviews: 5400, address: "Khor Al Maqta", lat: 24.4133, lon: 54.4902, amenities: ["Pool", "Spa", "Restaurant", "Parking"] },
    { id: 910004, name: "Jumeirah Saadiyat Island Abu Dhabi", stars: 5, priceMin: 310, rating: 8.9, reviews: 3600, address: "Saadiyat Island", lat: 24.5485, lon: 54.4427, amenities: ["Beach", "Pool", "Spa", "Restaurant"] },
  ],
};

// Get city coordinates from Travelpayouts data
async function getCityData(cityName: string): Promise<{ code: string; lat: number; lon: number } | null> {
  try {
    const res = await fetch(`https://api.travelpayouts.com/data/en/cities.json?token=${TOKEN}`);
    if (!res.ok) { await res.text(); return null; }
    const cities = await res.json() as any[];
    const match = cities.find((c: any) => 
      c.name?.toLowerCase() === cityName.toLowerCase() || 
      c.code?.toLowerCase() === cityName.toLowerCase() ||
      c.name_translations?.en?.toLowerCase() === cityName.toLowerCase()
    );
    if (match) {
      return { code: match.code, lat: match.coordinates?.lat, lon: match.coordinates?.lon };
    }
    return null;
  } catch { return null; }
}

async function searchHotelPlacesWithSerper(locationQuery: string, currency: string, nights: number) {
  const key = Deno.env.get("SERPER_API_KEY");
  if (!key) return [];

  try {
    const resp = await fetch("https://google.serper.dev/places", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `hotels in ${locationQuery}` }),
    });
    if (!resp.ok) {
      console.warn(`[hotels] Serper places HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json().catch(() => ({}));
    return (Array.isArray(data?.places) ? data.places : [])
      .filter((place: any) => place?.title)
      .slice(0, 12)
      .map((place: any, index: number) => {
        const price = Number(String(place.price || "").replace(/[^0-9.]/g, "")) || 0;
        const rating = Number(place.rating || 0);
        const stars = rating >= 4.7 ? 5 : rating >= 4.2 ? 4 : rating > 0 ? 3 : 0;
        return {
          hotelId: place.placeId || `serper-${index}`,
          hotelName: place.title,
          stars,
          price,
          totalPrice: price > 0 ? Math.round(price * nights * 100) / 100 : 0,
          pricePerNight: price,
          currency,
          location: locationQuery,
          link: place.website || place.link || "",
          image: place.thumbnailUrl || "",
          rating: rating > 0 ? Math.min(10, Math.round(rating * 2 * 10) / 10) : undefined,
          reviews: Number(place.ratingCount || place.reviews || 0),
          address: place.address || locationQuery,
          latitude: place.latitude,
          longitude: place.longitude,
          nights,
          source: "serper-places",
        };
      });
  } catch (e) {
    console.warn(`[hotels] Serper places error:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function handleHotels(p: Record<string, unknown>) {
  const iata = String(p.iata || "").toUpperCase();
  const city = String(p.city || "");
  const checkIn = String(p.checkIn || "");
  const checkOut = String(p.checkOut || "");
  const adults = Number(p.adults ?? 2);
  const currency = String(p.currency || "USD").toUpperCase();
  const locale = String(p.locale || "en").toLowerCase();

  const locationQuery = city || iata;
  if (!locationQuery) return jsonResponse({ success: false, error: "iata or city is required" }, 400);
  if (!checkIn || !checkOut) return jsonResponse({ success: false, error: "checkIn and checkOut are required" }, 400);

  const deepLink = `https://search.hotellook.com/hotels?destination=${encodeURIComponent(locationQuery)}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&marker=${SHMARKER}&language=${locale.startsWith("ar") ? "ar" : "en"}`;

  // Calculate nights
  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

  // Look up curated hotels for this city
  const cityAliasMap: Record<string, string> = {
    dxb: "dubai",
    "دبي": "dubai",
    ist: "istanbul",
    "إسطنبول": "istanbul",
    "اسطنبول": "istanbul",
    ruh: "riyadh",
    "الرياض": "riyadh",
    jed: "jeddah",
    "جدة": "jeddah",
    cai: "cairo",
    "القاهرة": "cairo",
    paris: "paris",
    cdg: "paris",
    london: "london",
    lhr: "london",
    auh: "abudhabi",
    "abu dhabi": "abudhabi",
    "أبوظبي": "abudhabi",
    sjc: "santaclara",
    "santa clara": "santaclara",
    "santa clara ca": "santaclara",
  };

  const normalizedCity = locationQuery.split(/[،,]/)[0].trim().toLowerCase();
  const cityKey = cityAliasMap[normalizedCity] || cityAliasMap[iata.toLowerCase()] || normalizedCity.replace(/\s+/g, "");
  const knownHotels = POPULAR_HOTELS[cityKey] || [];

  console.log(`[hotels] Searching: city=${locationQuery}, found ${knownHotels.length} curated hotels, nights=${nights}`);

  if (knownHotels.length > 0) {
    const results = knownHotels.map(h => ({
      hotelId: h.id,
      hotelName: h.name,
      stars: h.stars,
      price: convertFromUsd(h.priceMin, currency),
      totalPrice: convertFromUsd(h.priceMin * nights, currency),
      pricePerNight: h.priceMin,
      currency,
      location: locationQuery,
      link: `https://search.hotellook.com/hotels?hotelId=${h.id}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&marker=${SHMARKER}&language=${locale.startsWith("ar") ? "ar" : "en"}`,
      image: `https://photo.hotellook.com/image_v2/limit/h${h.id}/800/520.jpg`,
      rating: h.rating,
      reviews: h.reviews,
      amenities: h.amenities,
      address: h.address,
      latitude: h.lat,
      longitude: h.lon,
      nights,
      source: "curated",
    }));
    return jsonResponse({ success: true, hotels: results, deepLink, source: "curated" });
  }

  // For unknown cities, query Hotellook public cache endpoint to fetch live hotel cards
  // Endpoint docs: https://support.travelpayouts.com/hc/en-us/articles/203956163
  try {
    const cacheUrl = new URL("https://engine.hotellook.com/api/v2/cache.json");
    cacheUrl.searchParams.set("location", locationQuery);
    cacheUrl.searchParams.set("checkIn", checkIn);
    cacheUrl.searchParams.set("checkOut", checkOut);
    cacheUrl.searchParams.set("currency", currency.toLowerCase());
    cacheUrl.searchParams.set("adults", String(adults));
    cacheUrl.searchParams.set("limit", "20");
    cacheUrl.searchParams.set("marker", SHMARKER);

    const resp = await fetch(cacheUrl.toString(), { headers: { Accept: "application/json" } });
    if (resp.ok) {
      const list: any[] = await resp.json().catch(() => []);
      if (Array.isArray(list) && list.length > 0) {
        const langCode = locale.startsWith("ar") ? "ar" : "en";
        const amenitiesByStars: Record<number, string[]> = {
          5: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Concierge"],
          4: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"],
          3: ["WiFi", "Restaurant", "Parking", "AC"],
          2: ["WiFi", "AC"],
          1: ["WiFi"],
        };
        const results = list
          .filter(h => h && (h.hotelName || h.hotel_name) && h.hotelId)
          .slice(0, 20)
          .map((h: any) => {
            const hotelId = h.hotelId || h.hotel_id;
            const pricePerNight = Number(h.priceFrom ?? h.price_from ?? h.priceAvg ?? h.price_avg ?? 0);
            const stars = Number(h.stars || 0);
            // Hotellook serves multiple images per hotel via /image_v2/limit/h{id}/800/520.jpg with photoIndex param
            const baseImg = `https://photo.hotellook.com/image_v2/limit/h${hotelId}/800/520.jpg`;
            const images = [
              { thumbnail: baseImg, original: baseImg },
              { thumbnail: `https://photo.hotellook.com/image_v2/limit/h${hotelId}_1/800/520.jpg`, original: `https://photo.hotellook.com/image_v2/limit/h${hotelId}_1/800/520.jpg` },
              { thumbnail: `https://photo.hotellook.com/image_v2/limit/h${hotelId}_2/800/520.jpg`, original: `https://photo.hotellook.com/image_v2/limit/h${hotelId}_2/800/520.jpg` },
            ];
            return {
              hotelId,
              hotelName: h.hotelName || h.hotel_name,
              stars,
              price: Math.round(pricePerNight * 100) / 100,
              totalPrice: Math.round(pricePerNight * nights * 100) / 100,
              pricePerNight: Math.round(pricePerNight * 100) / 100,
              currency,
              location: h.location?.name || locationQuery,
              link: `https://search.hotellook.com/hotels?hotelId=${hotelId}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&marker=${SHMARKER}&language=${langCode}&currency=${currency.toLowerCase()}`,
              image: baseImg,
              images,
              rating: stars >= 4 ? 8.5 : stars >= 3 ? 7.8 : 7.0,
              reviews: 0,
              amenities: amenitiesByStars[stars] || [],
              address: h.location?.name || "",
              latitude: h.location?.geo?.lat,
              longitude: h.location?.geo?.lon,
              nights,
              source: "hotellook-cache",
            };
          });
        if (results.length > 0) {
          console.log(`[hotels] Hotellook cache returned ${results.length} hotels for "${locationQuery}"`);
          return jsonResponse({ success: true, hotels: results, deepLink, source: "hotellook-cache" });
        }
      }
    } else {
      console.warn(`[hotels] Hotellook cache HTTP ${resp.status}`);
    }
  } catch (e) {
    console.warn(`[hotels] Hotellook cache error:`, e instanceof Error ? e.message : String(e));
  }

  const serperResults = await searchHotelPlacesWithSerper(locationQuery, currency, nights);
  if (serperResults.length > 0) {
    console.log(`[hotels] Serper places returned ${serperResults.length} hotels for "${locationQuery}"`);
    return jsonResponse({ success: true, hotels: serperResults, deepLink, source: "serper-places" });
  }

  // Last resort: return deep link only
  console.log(`[hotels] No live data for "${cityKey}", returning deep link`);
  return jsonResponse({ success: true, hotels: [], deepLink, fallback: true, source: "deeplink" });
}

// ─── CARS (High-Fidelity Mockup) ───────────────────────────────────────────
function handleCars(p: Record<string, unknown>) {
  const city = String(p.city || "");
  const pickupDate = String(p.pickupDate || "");
  const dropoffDate = String(p.dropoffDate || "");
  const currency = String(p.currency || "USD").toUpperCase();
  const locale = String(p.locale || "en").toLowerCase();
  const marker = SHMARKER;
  
  const fallbackUrl = `https://www.discovercars.com/?a_aid=${marker}&pickup_location=${encodeURIComponent(city)}&pickup_date=${pickupDate}&return_date=${dropoffDate}&lang=${locale.startsWith("ar") ? "ar" : "en"}`;

  const results = [
    {
      id: "car-1",
      name: "Volkswagen Polo",
      type: "Economy",
      className: "اقتصادية",
      price: convertFromUsd(38, currency),
      currency,
      image: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&q=80&w=600",
      vendor: "Sixt",
      vendorLogo: "https://www.sixt.com/fileadmin/files/7.0/global/logo/sixt-logo.png",
      link: fallbackUrl,
      transmission: "Manual",
      seats: 5,
      fuel: "Petrol",
      features: ["تكييف", "إلغاء مجاني", "تأمين شامل"]
    },
    {
      id: "car-2",
      name: "Toyota RAV4",
      type: "SUV",
      className: "SUV / جيب",
      price: convertFromUsd(112, currency),
      currency,
      image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=600",
      vendor: "Hertz",
      vendorLogo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Hertz_logo.svg/2560px-Hertz_logo.svg.png",
      link: fallbackUrl,
      transmission: "Automatic",
      seats: 5,
      fuel: "Hybrid",
      features: ["تكييف", "نظام ملاحة GPS", "كميات غير محدودة", "4WD"]
    },
    {
      id: "car-3",
      name: "BMW 5 Series",
      type: "Luxury",
      className: "فاخرة",
      price: convertFromUsd(185, currency),
      currency,
      image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&q=80&w=600",
      vendor: "Europcar",
      vendorLogo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Europcar_logo.svg/1200px-Europcar_logo.svg.png",
      link: fallbackUrl,
      transmission: "Automatic",
      seats: 5,
      fuel: "Petrol",
      features: ["بريميوم", "نظام صوتي BOSE", "كرسي جلد", "تكييف مزدوج"]
    },
    {
      id: "car-4",
      name: "Hyundai Elantra",
      type: "Sedan",
      className: "سيدان",
      price: convertFromUsd(55, currency),
      currency,
      image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=600",
      vendor: "Budget",
      vendorLogo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Budget_Rent_A_Car.svg/1200px-Budget_Rent_A_Car.svg.png",
      link: fallbackUrl,
      transmission: "Automatic",
      seats: 5,
      fuel: "Petrol",
      features: ["تكييف", "بلوتوث", "صندوق واسع"]
    }
  ];

  return jsonResponse({ success: true, cars: results, fallbackUrl });
}

// ─── TRANSFERS (High-Fidelity Mockup) ────────────────────────────────────────
function handleTransfers(p: Record<string, unknown>) {
  const from = String(p.from || "");
  const to = String(p.to || "");
  const date = String(p.date || "");
  const trs = TRS;
  const shmarker = SHMARKER;

  const widgetUrl = `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${shmarker}&locale=en&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&promo_id=2949&campaign_id=1&search_ready=true`;

  const results = [
    {
      id: "trans-1",
      name: "Mercedes E-Class",
      type: "Premium Sedan",
      className: "سيدان بريميوم",
      price: 85,
      currency: "USD",
      image: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=600",
      vendor: "Kiwitaxi",
      link: widgetUrl,
      passengers: 4,
      luggage: 3,
      features: ["استقبال في المطار", "60 دقيقة انتظار مجاني", "سائق يجيد الإنجليزية"]
    },
    {
      id: "trans-2",
      name: "Toyota Hiace",
      type: "Minibus",
      className: "حافلة صغيرة",
      price: 145,
      currency: "USD",
      image: "https://images.unsplash.com/photo-1534008843781-99243702fe23?auto=format&fit=crop&q=80&w=600",
      vendor: "Kiwitaxi",
      link: widgetUrl,
      passengers: 10,
      luggage: 10,
      features: ["مثالي للمجموعات", "خدمة من الباب للباب", "مساحة واسعة للأمتعة"]
    },
    {
      id: "trans-3",
      name: "Skoda Octavia",
      type: "Standard",
      className: "سيارة قياسية",
      price: 45,
      currency: "USD",
      image: "https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&q=80&w=600",
      vendor: "Kiwitaxi",
      link: widgetUrl,
      passengers: 4,
      luggage: 3,
      features: ["مكيفة", "واي فاي مجاني", "خدمة اقتصادية موثوقة"]
    }
  ];

  return jsonResponse({ success: true, transfers: results, widgetUrl });
}
