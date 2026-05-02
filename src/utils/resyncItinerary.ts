// Auto-resync: when the post-generation audit detects missing meals, fetch real
// restaurants from the same data sources used for activities (SerpAPI / Serper)
// via the `serpapi-places` edge function — instead of leaving generic
// placeholder cards like "Breakfast in Vancouver".
//
// Each replacement is enriched with: real venue name, address, opening hours,
// rating, photo, phone, and a precise Google Maps link — matching the look and
// fidelity of regular activity cards.

import { supabase } from "@/integrations/supabase/client";
import { auditItineraryPreferences } from "@/utils/auditItineraryPreferences";

interface ResyncResult {
  days: any[];
  resyncedCount: number;
  attempted: number;
}

const PLACES_TIMEOUT_MS = 9000;

const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;
type MealKey = typeof MEAL_KEYS[number];

const MEAL_QUERY: Record<MealKey, string> = {
  breakfast: "breakfast restaurants",
  lunch: "lunch restaurants",
  dinner: "dinner restaurants",
  snacks: "cafe snacks",
};

const MEAL_LABELS_AR: Record<MealKey, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  snacks: "وجبة خفيفة",
};

const MEAL_HOUR: Record<MealKey, number> = {
  breakfast: 8,
  lunch: 13,
  dinner: 19,
  snacks: 16,
};

const RESTAURANT_HINTS = /\b(restaurant|restaurants|cafe|café|bistro|diner|grill|bar\s*&\s*grill|kitchen|eatery|pizzeria|pizza|trattoria|steakhouse|seafood|sushi|ramen|bbq|burger|taqueria|taco|bakery|brunch|breakfast|lunch|dinner|food|مطعم|مقهى|كافيه|غداء|عشاء|فطور)\b/i;
const NON_RESTAURANT_HINTS = /\b(stadium|arena|museum|park|place|mall|shopping|cinema|theater|bowling|golf|zoo|aquarium|monument|library|store|shop|market|patriot\s+place|gillette)\b/i;

const isLikelyRestaurant = (place: any): boolean => {
  const blob = [
    place?.title,
    place?.name,
    place?.type,
    Array.isArray(place?.types) ? place.types.join(" ") : "",
    Array.isArray(place?.categories) ? place.categories.join(" ") : "",
    place?.description,
    place?.snippet,
  ].filter(Boolean).join(" ");
  return RESTAURANT_HINTS.test(blob) && !NON_RESTAURANT_HINTS.test(blob);
};

const getMealKey = (activity: any): MealKey | null => {
  const raw = `${activity?.category || ""} ${activity?.type || ""} ${activity?.title || ""} ${activity?.name || ""}`.toLowerCase();
  if (/\bbreakfast\b|فطور/.test(raw)) return "breakfast";
  if (/\blunch\b|غداء/.test(raw)) return "lunch";
  if (/\bdinner\b|عشاء/.test(raw)) return "dinner";
  if (/\bsnacks?\b|وجبة\s*خفيفة/.test(raw)) return "snacks";
  return null;
};

const parseHoursWindow = (raw: unknown): { open: number; close: number } | null => {
  const str = String(raw || "").toLowerCase().trim();
  if (!str || /hours\s+unavailable|unknown|check\s+opening|closed/i.test(str)) return null;
  if (/24\s*hours?|24\/7|always\s+open|open\s+24/i.test(str)) return { open: 0, close: 24 };
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|~|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const m = str.match(re);
  if (!m) return null;
  const toHour = (h: string, mm?: string, ap?: string) => {
    let hour = Number(h);
    const minute = Number(mm || 0);
    if (ap) {
      const pm = ap.toLowerCase() === "pm";
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    }
    return hour + minute / 60;
  };
  const rawOpenHour = Number(m[1]);
  let open = toHour(m[1], m[2], m[3]);
  let close = toHour(m[4], m[5], m[6]);
  if (!m[3] && m[6]?.toLowerCase() === "pm" && rawOpenHour >= 1 && rawOpenHour <= 6) {
    open += 12;
  }
  if (!m[3] && !m[6] && close <= open && close < 12) close += 12;
  if (close <= open) close = Math.min(24, open + 1);
  return { open: Math.max(0, open), close: Math.min(24, close) };
};

const mealBand: Record<MealKey, { min: number; max: number }> = {
  breakfast: { min: 7, max: 10.5 },
  lunch: { min: 12, max: 14.5 },
  dinner: { min: 18.5, max: 21.5 },
  snacks: { min: 15, max: 17.5 },
};

const restaurantOpenForMeal = (placeOrActivity: any, meal: MealKey): boolean => {
  const win = parseHoursWindow(placeOrActivity?.hours || placeOrActivity?.openingHours || placeOrActivity?.operatingHours);
  if (!win) return true;
  const band = mealBand[meal];
  return Math.max(win.open, band.min) <= Math.min(win.close - 1, band.max);
};

const isMatchAnchor = (activity: any): boolean => Boolean(activity?.isMatchAnchor)
  || /\bvs\.?\b|match anchor|طلب خاص/i.test(String(activity?.matchReason || activity?.title || activity?.name || ""));

const dedupeKeyForActivity = (activity: any): string => {
  const pid = String(activity?.placeId || activity?.place_id || activity?.dataId || activity?.data_id || "").trim().toLowerCase();
  if (pid) return `pid:${pid}`;
  const title = String(activity?.title || activity?.name || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
  const address = String(activity?.address || activity?.location || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
  return title || address ? `txt:${title}|${address}` : "";
};

// Synonyms used to broaden the search AND validate that returned venues truly
// match the requested cuisine (e.g. an "italian" search should also accept
// venues described as pizzeria / trattoria / pasta).
const CUISINE_SYNONYMS: Record<string, string[]> = {
  italian: ["italian", "pizza", "pizzeria", "pasta", "trattoria", "ristorante"],
  indian: ["indian", "curry", "tandoor", "biryani", "masala", "punjabi"],
  chinese: ["chinese", "dim sum", "wok", "szechuan", "cantonese", "noodle"],
  japanese: ["japanese", "sushi", "ramen", "izakaya", "tempura", "udon"],
  korean: ["korean", "kbbq", "bibimbap", "bulgogi"],
  thai: ["thai", "pad thai", "tom yum"],
  mexican: ["mexican", "taco", "burrito", "taqueria"],
  french: ["french", "bistro", "brasserie", "patisserie"],
  greek: ["greek", "souvlaki", "gyros", "taverna"],
  turkish: ["turkish", "kebab", "doner", "meze"],
  arabic: ["arabic", "arabian", "lebanese", "syrian", "shawarma", "mezze", "عربي", "لبناني"],
  lebanese: ["lebanese", "shawarma", "mezze", "falafel"],
  seafood: ["seafood", "fish", "oyster", "lobster"],
  steakhouse: ["steakhouse", "steak", "grill", "bbq"],
  vegan: ["vegan", "plant-based", "plant based"],
  vegetarian: ["vegetarian", "veggie", "plant-based"],
  halal: ["halal", "حلال"],
  kosher: ["kosher"],
  american: ["american", "burger", "diner"],
  mediterranean: ["mediterranean", "med ", "greek", "lebanese"],
};

const STRICT_DIETARY = new Set(["halal", "kosher", "vegan", "vegetarian", "gluten-free", "gluten free"]);

function getCuisineSynonyms(cuisine: string): string[] {
  const key = cuisine.toLowerCase().trim();
  return CUISINE_SYNONYMS[key] || [key];
}

function placeMatchesCuisine(place: any, cuisine: string): boolean {
  const synonyms = getCuisineSynonyms(cuisine);
  const blob = [
    place?.title,
    place?.name,
    place?.address,
    place?.type,
    Array.isArray(place?.types) ? place.types.join(" ") : "",
    Array.isArray(place?.categories) ? place.categories.join(" ") : "",
    place?.description,
    place?.snippet,
  ].filter(Boolean).join(" ").toLowerCase();
  return synonyms.some((s) => blob.includes(s.toLowerCase()));
}

const fmtTime = (h: number, m = 0) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

async function searchPlaces(query: string, latitude?: number, longitude?: number): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PLACES_TIMEOUT_MS);
    const { data, error } = await supabase.functions.invoke("serpapi-places", {
      body: { query, latitude, longitude, type: "search" },
    });
    clearTimeout(timer);
    if (error) throw error;
    if (!data?.success || !Array.isArray(data?.results)) return [];
    return data.results;
  } catch (e) {
    console.warn("[resync] serpapi-places failed", e);
    return [];
  }
}

function buildRestaurantActivity(
  meal: MealKey,
  place: any,
  isArabic: boolean,
  destination: string,
  dayNumber: number,
): any {
  const hour = MEAL_HOUR[meal];
  const venueName = String(place?.title || "").trim() || destination;
  const photo = place?.thumbnail || (Array.isArray(place?.photos) && place.photos[0]) || undefined;
  const placeId = place?.place_id || place?.placeId;
  const dataCid = place?.data_cid || place?.dataCid;
  const lat = typeof place?.latitude === "number" ? place.latitude : typeof place?.gps_coordinates?.latitude === "number" ? place.gps_coordinates.latitude : undefined;
  const lng = typeof place?.longitude === "number" ? place.longitude : typeof place?.gps_coordinates?.longitude === "number" ? place.gps_coordinates.longitude : undefined;
  const mapUrl = dataCid
    ? `https://maps.google.com/?cid=${dataCid}`
    : placeId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}&query_place_id=${encodeURIComponent(placeId)}`
      : Number.isFinite(lat) && Number.isFinite(lng)
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venueName} ${place?.address || destination}`.trim())}`;

  return {
    id: `d${dayNumber}-resync-${meal}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: venueName,
    name: venueName,
    nameAr: venueName,
    category: meal,
    type: meal,
    time: fmtTime(hour),
    startTime: fmtTime(hour),
    endTime: fmtTime(hour + 1),
    address: place?.address || undefined,
    location: place?.address || destination,
    phone: place?.phone || undefined,
    website: place?.website || undefined,
    rating: typeof place?.rating === "number" ? place.rating : undefined,
    reviewsCount: place?.reviews_count || undefined,
    priceLevel: place?.price_level || undefined,
    placeId: placeId || undefined,
    place_id: placeId || undefined,
    dataId: place?.data_id || undefined,
    dataCid: dataCid || undefined,
    latitude: lat,
    longitude: lng,
    imageUrl: photo,
    image: photo,
    thumbnailUrl: photo,
    openingHours: typeof place?.hours === "string" ? place.hours : undefined,
    operatingHours: place?.hours && typeof place.hours === "object" ? place.hours : undefined,
    googleMapsUrl: mapUrl,
    googleMapsLinkReason: dataCid ? `CID: ${dataCid}` : placeId ? `place_id: ${String(placeId).slice(0, 18)}${String(placeId).length > 18 ? "…" : ""}` : Number.isFinite(lat) && Number.isFinite(lng) ? `lat/lng: ${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : "text query",
    description: isArabic
      ? `${MEAL_LABELS_AR[meal]} في ${venueName}`
      : `${meal.charAt(0).toUpperCase() + meal.slice(1)} at ${venueName}`,
    enriched: true,
    enrichmentSource: "resync:serpapi-places",
    isResyncedMeal: true,
  };
}

function buildAttractionActivity(place: any, destination: string, dayNumber: number, slot: number): any {
  const venueName = String(place?.title || place?.name || "").trim() || destination;
  const lat = typeof place?.latitude === "number" ? place.latitude : typeof place?.gps_coordinates?.latitude === "number" ? place.gps_coordinates.latitude : undefined;
  const lng = typeof place?.longitude === "number" ? place.longitude : typeof place?.gps_coordinates?.longitude === "number" ? place.gps_coordinates.longitude : undefined;
  const placeId = place?.place_id || place?.placeId;
  const dataCid = place?.data_cid || place?.dataCid;
  const mapUrl = dataCid
    ? `https://maps.google.com/?cid=${dataCid}`
    : placeId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName)}&query_place_id=${encodeURIComponent(placeId)}`
      : Number.isFinite(lat) && Number.isFinite(lng)
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venueName} ${destination}`.trim())}`;
  const hour = Math.min(21, 10 + slot * 2);
  return {
    id: `d${dayNumber}-resync-activity-${Date.now()}-${slot}`,
    title: venueName,
    name: venueName,
    category: "attraction",
    type: "attraction",
    time: fmtTime(hour),
    startTime: fmtTime(hour),
    endTime: fmtTime(hour + 1),
    description: place?.description || place?.snippet || `Recommended place in ${destination}`,
    address: place?.address || destination,
    location: place?.address || destination,
    latitude: lat,
    longitude: lng,
    rating: typeof place?.rating === "number" ? place.rating : 4.3,
    cost: 20,
    imageUrl: place?.thumbnail || (Array.isArray(place?.photos) && place.photos[0]) || undefined,
    openingHours: typeof place?.hours === "string" ? place.hours : undefined,
    operatingHours: place?.hours && typeof place.hours === "object" ? place.hours : undefined,
    googleMapsUrl: mapUrl,
    googleMapsLink: mapUrl,
    matchReason: "Exact daily count refill",
    enriched: true,
    enrichmentSource: "resync:under-count",
  };
}

export async function resyncMissingItems(itinerary: any): Promise<ResyncResult> {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  if (!days.length) return { days, resyncedCount: 0, attempted: 0 };

  const audit = auditItineraryPreferences(days, {
    mealPreferences: itinerary?.mealPreferences,
    perDayTarget: Number(itinerary?.totalDailyItemsTarget) || Number(itinerary?.maxActivitiesPerDay) || 0,
    destination: itinerary?.destination,
    language: itinerary?.language,
  });

  // Gather every fallback or invalid meal to replace with a real restaurant.
  const targets: { dayIndex: number; activityIndex: number; meal: MealKey }[] = [];
  audit.days.forEach((day, di) => {
    const acts: any[] = Array.isArray(day?.activities) ? day.activities : [];
    acts.forEach((a, ai) => {
      const meal = getMealKey(a);
      if (!meal) return;
      const mustReplace = Boolean(a?.isAuditPatched) || !isLikelyRestaurant(a) || !restaurantOpenForMeal(a, meal);
      if (mustReplace) {
        targets.push({ dayIndex: di, activityIndex: ai, meal });
      }
    });
  });

  const isArabic = String(itinerary?.language || "").toLowerCase().startsWith("ar");
  const destination = String(itinerary?.destination || "").trim();
  const cityName = destination.split(",")[0].trim() || destination;
  const cuisines: string[] = Array.isArray(itinerary?.mealPreferences?.cuisineTypes)
    ? itinerary.mealPreferences.cuisineTypes.filter(Boolean)
    : Array.isArray(itinerary?.cuisineTypes)
      ? itinerary.cuisineTypes.filter(Boolean)
      : [];
  const cuisineToken = cuisines[0] || "";

  // Use the first day's coordinates as a search bias if available.
  const firstAct = (audit.days[0]?.activities || []).find((a: any) =>
    Number.isFinite(a?.latitude) && Number.isFinite(a?.longitude),
  );
  const lat = firstAct?.latitude;
  const lng = firstAct?.longitude;

  // Cache per (meal+cuisine) to avoid duplicate API calls and dedupe across days.
  const cache = new Map<MealKey, any[]>();
  const usedPlaceIds = new Set<string>();
  const isStrictDietary = !!cuisineToken && STRICT_DIETARY.has(cuisineToken.toLowerCase());

  // Pre-collect already-shown restaurant place_ids so resync doesn't repeat.
  audit.days.forEach((day: any) => {
    (day?.activities || []).forEach((a: any) => {
      const pid = a?.placeId || a?.place_id;
      if (pid) usedPlaceIds.add(String(pid));
    });
  });

  const newDays = audit.days.map((d) => ({
    ...d,
    activities: Array.isArray(d?.activities) ? [...d.activities] : [],
  }));

  let resyncedCount = 0;
  const seenActivityKeys = new Set<string>();
  for (const day of newDays) {
    const deduped: any[] = [];
    for (const activity of day.activities || []) {
      const meal = getMealKey(activity);
      const key = dedupeKeyForActivity(activity);
      if (!meal && !isMatchAnchor(activity) && key && seenActivityKeys.has(key)) {
        continue;
      }
      if (!meal && !isMatchAnchor(activity) && key) seenActivityKeys.add(key);
      deduped.push(activity);
    }
    if (deduped.length !== (day.activities || []).length) {
      resyncedCount += (day.activities || []).length - deduped.length;
    }
    day.activities = deduped;
  }

  // Rebuild targets after cross-day dedupe so indices point to the current
  // activity arrays, not the pre-dedupe audit arrays.
  targets.length = 0;
  newDays.forEach((day, di) => {
    const acts: any[] = Array.isArray(day?.activities) ? day.activities : [];
    acts.forEach((a, ai) => {
      const meal = getMealKey(a);
      if (!meal) return;
      const mustReplace = Boolean(a?.isAuditPatched) || !isLikelyRestaurant(a) || !restaurantOpenForMeal(a, meal);
      if (mustReplace) targets.push({ dayIndex: di, activityIndex: ai, meal });
    });
  });

  // Build the cuisine-aware query list. We try multiple synonym variants
  // (e.g. italian → pizza/pasta/trattoria) so the SerpAPI result pool truly
  // matches the user's exact food preference, not a generic restaurant.
  const buildQueries = (meal: MealKey): string[] => {
    const phrase = MEAL_QUERY[meal];
    if (!cuisineToken) return [`best ${phrase} in ${cityName}`, `${phrase} in ${cityName}`];
    const variants = getCuisineSynonyms(cuisineToken).slice(0, 3);
    return [
      ...variants.map((v) => `best ${v} ${phrase} in ${cityName}`),
      ...variants.map((v) => `${v} ${phrase} in ${cityName}`),
      // last-resort generic fallback (only used if cuisine search yields nothing)
      `best ${phrase} in ${cityName}`,
    ];
  };

  for (const t of targets) {
    let pool = cache.get(t.meal);
    if (!pool || pool.length === 0) {
      pool = [];
      const queries = buildQueries(t.meal);
      for (const q of queries) {
        const results = await searchPlaces(q, lat, lng);
        // When a cuisine is requested, ONLY accept candidates whose text
        // confirms the cuisine. Strict dietary preferences (halal, vegan, …)
        // never accept un-confirmed results. Non-cuisine searches accept all.
        const filtered = (cuisineToken
          ? results.filter((p) => placeMatchesCuisine(p, cuisineToken))
          : results
        ).filter((p) => isLikelyRestaurant(p) && restaurantOpenForMeal(p, t.meal));
        for (const p of filtered) {
          if (!pool.some((existing) => (existing.place_id || existing.data_id || existing.title) === (p.place_id || p.data_id || p.title))) {
            pool.push(p);
          }
        }
        // Stop early once we have enough viable matches
        if (pool.length >= 6) break;
      }
      // Generic fallback only when NOT a strict dietary preference
      if (pool.length === 0 && cuisineToken && !isStrictDietary) {
        const generic = await searchPlaces(`best ${MEAL_QUERY[t.meal]} in ${cityName}`, lat, lng);
        pool = generic.filter((p) => isLikelyRestaurant(p) && restaurantOpenForMeal(p, t.meal));
      }
      cache.set(t.meal, pool);
    }

    const candidate = pool.find((p) => {
      const pid = String(p?.place_id || p?.data_id || "");
      return p?.title && isLikelyRestaurant(p) && restaurantOpenForMeal(p, t.meal) && (!pid || !usedPlaceIds.has(pid));
    });
    if (!candidate) continue;

    const pid = String(candidate?.place_id || candidate?.data_id || "");
    if (pid) usedPlaceIds.add(pid);

    const replacement = buildRestaurantActivity(
      t.meal,
      candidate,
      isArabic,
      cityName,
      t.dayIndex + 1,
    );

    // Preserve the original placeholder's start time so the strict scheduler
    // can re-clamp it within the wake/sleep window after the swap.
    const original = newDays[t.dayIndex].activities[t.activityIndex];
    if (original?.startTime) replacement.startTime = original.startTime;
    if (original?.time) replacement.time = original.time;
    if (original?.endTime) replacement.endTime = original.endTime;

    newDays[t.dayIndex].activities[t.activityIndex] = replacement;
    resyncedCount += 1;
  }

  const targetCount = Math.max(0, Number(itinerary?.totalDailyItemsTarget) || Number(itinerary?.maxActivitiesPerDay) || 0);
  if (targetCount > 0) {
    // Build a GLOBAL key set across every day so refilled activities never
    // duplicate names/addresses already shown on another day. This was the
    // source of "Patriot Place / Gillette Stadium / XtremeCraze" appearing
    // on both Day 1 and Day 2.
    const globalUsedKeys = new Set<string>();
    const globalUsedPlaceIds = new Set<string>(usedPlaceIds);
    for (const d of newDays) {
      for (const a of (d?.activities || [])) {
        const k = `${String(a?.title || a?.name || "").toLowerCase().trim()}|${String(a?.address || "").toLowerCase().trim()}`;
        if (k.replace("|", "")) globalUsedKeys.add(k);
        const pid = a?.placeId || a?.place_id;
        if (pid) globalUsedPlaceIds.add(String(pid));
      }
    }

    for (let di = 0; di < newDays.length; di++) {
      const acts = Array.isArray(newDays[di]?.activities) ? newDays[di].activities : [];
      if (acts.length >= targetCount) continue;
      const city = String(newDays[di]?.cityName || destination || "").split(",")[0].trim() || destination;
      const pool = await searchPlaces(`top attractions and activities in ${city}`, lat, lng);
      for (const p of pool) {
        if (acts.length >= targetCount) break;
        const key = `${String(p?.title || p?.name || "").toLowerCase().trim()}|${String(p?.address || "").toLowerCase().trim()}`;
        const pid = String(p?.place_id || p?.data_id || "");
        if (!p?.title) continue;
        if (globalUsedKeys.has(key)) continue;
        if (pid && globalUsedPlaceIds.has(pid)) continue;
        globalUsedKeys.add(key);
        if (pid) globalUsedPlaceIds.add(pid);
        acts.push(buildAttractionActivity(p, city, di + 1, acts.length));
        resyncedCount += 1;
      }
      newDays[di].activities = acts;
    }
  }

  console.info("[resync] real restaurants/activities applied", {
    resyncedCount,
    attempted: targets.length,
    cuisine: cuisineToken || "any",
  });

  return { days: newDays, resyncedCount, attempted: targets.length };
}
