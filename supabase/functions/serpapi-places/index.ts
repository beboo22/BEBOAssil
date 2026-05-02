// Using built-in Deno.serve (no import needed)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared cache helpers (places_cache + places_usage)
// Goal: avoid duplicate SerpApi calls + power the diversity engine.
// We DO NOT change generation logic — we just intercept search calls.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminDb = SUPABASE_URL && SERVICE_ROLE
  ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

// Normalize Arabic / English / mixed input so the same intent shares a cache row.
function normalizeText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "") // arabic diacritics
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Stable hash → short hex (no crypto subtle to avoid async overhead per call).
function hashKey(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function buildCacheKey(parts: {
  query: string;
  city?: string;
  cuisine?: string;
  interest?: string;
  meal_type?: string;
  type?: string;
  lat?: number;
  lng?: number;
}): string {
  // NOTE: language is intentionally excluded — cache is language-agnostic.
  // Translations are stored inline per result as `_loc[lang]` and resolved at read time.
  const seed = [
    normalizeText(parts.query),
    normalizeText(parts.city || ""),
    normalizeText(parts.cuisine || ""),
    normalizeText(parts.interest || ""),
    normalizeText(parts.meal_type || ""),
    parts.type || "search",
    parts.lat ? parts.lat.toFixed(2) : "",
    parts.lng ? parts.lng.toFixed(2) : "",
  ].join("|");
  return hashKey(seed);
}

async function readCache(cacheKey: string): Promise<{ results: any[]; localizations: Record<string, any[]> } | null> {
  if (!adminDb) return null;
  try {
    const { data, error } = await adminDb
      .from("places_cache")
      .select("results, hit_count, created_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;

    // Never force-refresh by hit count or age while the row is unexpired.
    // Live SerpApi is used only on cache miss/expiry/manual purge.
    const hitCount = Number(data.hit_count || 0);

    // Fire-and-forget: bump hit_count + last_accessed_at
    adminDb
      .from("places_cache")
      .update({
        hit_count: hitCount + 1,
        last_accessed_at: new Date().toISOString(),
      })
      .eq("cache_key", cacheKey)
      .then(() => {});
    const raw = Array.isArray(data.results) ? data.results : null;
    if (!raw) return null;
    // Localizations are stored inline on each result as `_loc: { ar: { title, description } }`
    // Returning the whole bundle so the caller can pick the right language.
    return { results: raw, localizations: {} };
  } catch (e) {
    console.warn("[cache] read failed", e);
    return null;
  }
}

async function writeCache(
  cacheKey: string,
  payload: {
    query: string;
    city?: string;
    cuisine?: string;
    interest?: string;
    meal_type?: string;
    language?: string;
    source: string;
    results: any[];
  },
): Promise<void> {
  if (!adminDb || !payload.results.length) return;
  try {
    await adminDb.from("places_cache").upsert(
      {
        cache_key: cacheKey,
        query: payload.query,
        city: payload.city || null,
        cuisine: payload.cuisine || null,
        interest: payload.interest || null,
        meal_type: payload.meal_type || null,
        language: "en", // storage is language-agnostic; per-language strings live in results[]._loc
        source: payload.source,
        results: payload.results,
        results_count: payload.results.length,
        hit_count: 0,
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch (e) {
    console.warn("[cache] write failed", e);
  }
}

// Diversity ranker: re-orders results so least-used / least-recent items come first.
async function applyDiversity(
  results: any[],
  city: string | undefined,
  userId: string | null,
): Promise<any[]> {
  if (!adminDb || results.length < 2) return results;
  try {
    const keys = results
      .map((r) => String(r.place_id || r.data_id || r.title || "").trim())
      .filter(Boolean);
    if (!keys.length) return results;
    const { data } = await adminDb
      .from("places_usage")
      .select("place_key, usage_count, last_used_at")
      .in("place_key", keys)
      .or(userId ? `user_id.eq.${userId},user_id.is.null` : "user_id.is.null");
    const usageMap = new Map<string, { count: number; last: number }>();
    (data || []).forEach((row: any) => {
      const cur = usageMap.get(row.place_key) || { count: 0, last: 0 };
      const lastTs = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
      usageMap.set(row.place_key, {
        count: cur.count + (row.usage_count || 0),
        last: Math.max(cur.last, lastTs),
      });
    });
    return [...results].sort((a, b) => {
      const ka = String(a.place_id || a.data_id || a.title || "");
      const kb = String(b.place_id || b.data_id || b.title || "");
      const ua = usageMap.get(ka) || { count: 0, last: 0 };
      const ub = usageMap.get(kb) || { count: 0, last: 0 };
      if (ua.count !== ub.count) return ua.count - ub.count; // least used first
      return ua.last - ub.last; // older usage first
    });
  } catch (e) {
    console.warn("[diversity] rank failed", e);
    return results;
  }
}

// Records that a place was selected (called via type:"mark_used")
async function markUsed(
  placeKey: string,
  placeName: string | undefined,
  city: string | undefined,
  category: string | undefined,
  userId: string | null,
): Promise<void> {
  if (!adminDb || !placeKey) return;
  try {
    const { data: existing } = await adminDb
      .from("places_usage")
      .select("id, usage_count")
      .eq("place_key", placeKey)
      .eq("user_id", userId as any)
      .maybeSingle();
    if (existing) {
      await adminDb
        .from("places_usage")
        .update({
          usage_count: (existing.usage_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await adminDb.from("places_usage").insert({
        place_key: placeKey,
        place_name: placeName || null,
        city: city || null,
        category: category || null,
        usage_count: 1,
        user_id: userId,
      });
    }
  } catch (e) {
    console.warn("[usage] mark failed", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Output localization
// Storage stays language-agnostic (English source from SerpApi hl=en).
// On read, we localize titles/descriptions into the requested language and
// persist the translation back onto the cached result as `_loc[lang]` so the
// next request in that language is instant + free.
// ─────────────────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  ar: "Arabic", fr: "French", es: "Spanish", de: "German", tr: "Turkish",
  ru: "Russian", zh: "Chinese", ja: "Japanese", hi: "Hindi", ur: "Urdu",
  fa: "Persian", id: "Indonesian", pt: "Portuguese", it: "Italian",
};

function pickLang(language?: string): string {
  return (language || "en").toLowerCase().slice(0, 2);
}

// Defensive: validate that `_loc` (if present) is a plain object keyed by 2-char
// language codes mapping to { title?, description? }. Anything malformed is dropped
// so a corrupt cache row can never break a future read.
function sanitizeLoc(loc: unknown): Record<string, { title?: string; description?: string }> | undefined {
  if (!loc || typeof loc !== "object" || Array.isArray(loc)) return undefined;
  const out: Record<string, { title?: string; description?: string }> = {};
  for (const [k, v] of Object.entries(loc as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0 || k.length > 5) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const entry = v as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.slice(0, 240) : undefined;
    const description = typeof entry.description === "string" ? entry.description.slice(0, 1000) : undefined;
    if (title || description) out[k.toLowerCase()] = { title, description };
  }
  return Object.keys(out).length ? out : undefined;
}

function applyLocalization(results: any[], lang: string): any[] {
  if (lang === "en") return results;
  return results.map((r) => {
    const safeLoc = sanitizeLoc(r?._loc);
    const loc = safeLoc?.[lang];
    if (loc && (loc.title || loc.description)) {
      return {
        ...r,
        _loc: safeLoc,
        title: loc.title || r.title,
        description: loc.description || r.description,
      };
    }
    // Always strip malformed _loc so downstream consumers see a clean shape
    if (r?._loc && !safeLoc) {
      const { _loc, ...rest } = r;
      return rest;
    }
    return r;
  });
}

async function translateMissing(
  results: any[],
  lang: string,
  cacheKey: string,
): Promise<any[]> {
  if (lang === "en" || !results.length) return results;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_KEY) return results;
  const targetName = LANG_NAMES[lang] || lang;

  // Identify items missing translation for this language (cap to 12 to keep latency low).
  // sanitizeLoc guards against malformed `_loc` shapes from old/corrupt cache rows.
  const missing = results
    .map((r, idx) => ({ r, idx, loc: sanitizeLoc(r?._loc) }))
    .filter(({ r, loc }) => !loc?.[lang] && (r?.title || r?.description))
    .slice(0, 12);
  if (!missing.length) return results;

  try {
    const items = missing.map(({ r, idx }) => ({
      i: idx,
      t: String(r.title || "").slice(0, 120),
      d: String(r.description || "").slice(0, 280),
    }));
    const prompt = `Translate the following place names and short descriptions into ${targetName}. Keep proper nouns natural for ${targetName} speakers. Return STRICT JSON: {"items":[{"i":0,"t":"...","d":"..."}]}.\n\nINPUT:\n${JSON.stringify(items)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You translate short travel labels. Reply with valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });
    if (!resp.ok) {
      console.warn("[localize] gateway error", resp.status);
      return results;
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return results;
    const parsed = JSON.parse(jsonMatch[0]);
    const translations: any[] = Array.isArray(parsed.items) ? parsed.items : [];

    const next = [...results];
    translations.forEach((t: any) => {
      const idx = Number(t.i);
      if (!Number.isFinite(idx) || !next[idx]) return;
      const cleanExisting = sanitizeLoc(next[idx]?._loc) || {};
      const title = typeof t.t === "string" ? t.t.slice(0, 240) : "";
      const description = typeof t.d === "string" ? t.d.slice(0, 1000) : "";
      if (!title && !description) return;
      next[idx] = {
        ...next[idx],
        _loc: {
          ...cleanExisting,
          [lang]: { title, description },
        },
      };
    });

    // Persist translations back onto the cache row (fire-and-forget)
    if (adminDb) {
      adminDb
        .from("places_cache")
        .update({ results: next, last_accessed_at: new Date().toISOString() })
        .eq("cache_key", cacheKey)
        .then(() => {});
    }
    return next;
  } catch (e) {
    console.warn("[localize] failed", e);
    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing Serper.dev fallbacks (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

async function searchWithSerper(query: string, type: string): Promise<any[]> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return [];

  try {
    const endpoint = type === "place_details"
      ? "https://google.serper.dev/maps"
      : "https://google.serper.dev/places";

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    });

    if (!resp.ok) {
      console.error("Serper.dev error:", resp.status);
      return [];
    }

    const data = await resp.json();
    const places = data.places || [];

    return places.map((place: any) => ({
      title: place.title,
      place_id: place.placeId || place.cid,
      rating: place.rating,
      reviews_count: place.ratingCount || place.reviews,
      price_level: place.priceLevel,
      type: place.type || place.category,
      types: place.types || [],
      address: place.address,
      phone: place.phoneNumber,
      website: place.website,
      hours: place.openingHours,
      latitude: place.latitude,
      longitude: place.longitude,
      thumbnail: place.thumbnailUrl || place.imageUrl,
      photos: [],
      description: place.snippet || place.description,
      data_id: place.cid,
    }));
  } catch (e) {
    console.error("Serper.dev places error:", e);
    return [];
  }
}

async function getSerperReviews(query: string): Promise<any[]> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return [];
  try {
    const resp = await fetch("https://google.serper.dev/reviews", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.reviews || []).slice(0, 5).map((r: any) => ({
      author: r.author || r.user || '',
      rating: r.rating,
      text: r.snippet || r.text || '',
      date: r.date || '',
      source: r.source || 'Google',
    }));
  } catch {
    return [];
  }
}

async function getSerperImages(query: string): Promise<string[]> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return [];
  try {
    const resp = await fetch("https://google.serper.dev/images", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 5 }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.images || []).slice(0, 5).map((img: any) => img.imageUrl || img.link).filter(Boolean);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
    const body = await req.json();
    const {
      query,
      latitude,
      longitude,
      type = "search",
      city,
      cuisine,
      interest,
      meal_type,
      language,
      user_id,
      // Mark-used endpoint payload:
      place_key,
      place_name,
      category,
    } = body;

    // ── New endpoint: mark a place as used (for diversity tracking)
    if (type === "mark_used") {
      await markUsed(place_key, place_name, city, category, user_id || null);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: "Query is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 1) Cache lookup (shared across all users; storage stays language-agnostic)
    const cacheKey = buildCacheKey({
      query, city, cuisine, interest, meal_type, type,
      lat: typeof latitude === "number" ? latitude : undefined,
      lng: typeof longitude === "number" ? longitude : undefined,
    });
    const requestedLang = pickLang(language);
    const cached = await readCache(cacheKey);
    if (cached && cached.results.length) {
      // Translate any items missing this language (cached after first hit).
      const translated = await translateMissing(cached.results, requestedLang, cacheKey);
      const localized = applyLocalization(translated, requestedLang);
      const ranked = await applyDiversity(localized, city, user_id || null);
      console.log(`[cache HIT] "${query}" → ${ranked.length} places (lang=${requestedLang})`);
      return new Response(
        JSON.stringify({ success: true, results: ranked, source: "cache", cached: true, language: requestedLang }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── 2) Live fetch (SerpAPI then Serper fallback)
    let results: any[] = [];
    let source = "serpapi";

    if (SERPAPI_KEY) {
      let url: string;
      if (type === "place_details" && latitude && longitude) {
        url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&ll=@${latitude},${longitude},17z&hl=en&api_key=${SERPAPI_KEY}`;
      } else if (type === "search" && latitude && longitude) {
        url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&ll=@${latitude},${longitude},14z&hl=en&api_key=${SERPAPI_KEY}`;
      } else {
        url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&hl=en&api_key=${SERPAPI_KEY}`;
      }

      console.log("SerpAPI request:", type, query);
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        results = (data.local_results || []).map((place: any) => ({
          // Identity
          position: place.position,
          title: place.title,
          place_id: place.place_id,
          data_id: place.data_id,
          data_cid: place.data_cid,
          provider_id: place.provider_id,
          // SerpAPI deep-link helpers
          reviews_link: place.reviews_link,
          photos_link: place.photos_link,
          place_id_search: place.place_id_search,
          // Rating / classification
          rating: place.rating,
          reviews_count: place.reviews,
          price_level: place.price,
          unclaimed_listing: place.unclaimed_listing === true,
          type: place.type,
          types: Array.isArray(place.types) ? place.types : undefined,
          type_id: place.type_id,
          type_ids: Array.isArray(place.type_ids) ? place.type_ids : undefined,
          // Contact / location
          address: place.address,
          phone: place.phone,
          website: place.website,
          open_state: place.open_state,
          hours: place.operating_hours || place.hours,
          latitude: place.gps_coordinates?.latitude,
          longitude: place.gps_coordinates?.longitude,
          // Media
          thumbnail: place.thumbnail,
          serpapi_thumbnail: place.serpapi_thumbnail,
          photos: place.photos?.map((p: any) => p.src || p).filter(Boolean) || [],
          // Rich content (fully preserved for reuse without re-fetching)
          description: place.description || place.snippet,
          user_review: place.user_review,
          extensions: Array.isArray(place.extensions) ? place.extensions : undefined,
          service_options: place.service_options,
          gps_coordinates: place.gps_coordinates,
          operating_hours: place.operating_hours,
          place_key: place.place_id || place.data_id || place.data_cid || place.provider_id || place.title,
          _raw: place,
        }));
      } else {
        console.warn("SerpAPI failed with status:", response.status, "- falling back to Serper.dev");
        source = "serper";
      }
    } else {
      source = "serper";
    }

    if (results.length === 0) {
      console.log("Falling back to Serper.dev for places...");
      source = "serper";
      results = await searchWithSerper(query, type);

      if (results.length > 0) {
        const [images, reviews] = await Promise.all([
          getSerperImages(query),
          getSerperReviews(query),
        ]);

        const needImages = results.filter((r) => !r.thumbnail);
        for (let i = 0; i < Math.min(needImages.length, images.length); i++) {
          needImages[i].thumbnail = images[i];
        }

        if (reviews.length > 0) {
          results.forEach((r) => { r.reviews_data = reviews; });
        }
      }
    }

    console.log(`Found ${results.length} places for "${query}" via ${source}`);

    // ── 3) Persist to shared cache (English/agnostic), then localize for caller
    if (results.length > 0) {
      await writeCache(cacheKey, {
        query, city, cuisine, interest, meal_type,
        source, results,
      });
    }
    const translated = await translateMissing(results, requestedLang, cacheKey);
    const localized = applyLocalization(translated, requestedLang);
    const ranked = await applyDiversity(localized, city, user_id || null);

    return new Response(
      JSON.stringify({ success: true, results: ranked, source, cached: false, language: requestedLang }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("serpapi-places error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to fetch places" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
