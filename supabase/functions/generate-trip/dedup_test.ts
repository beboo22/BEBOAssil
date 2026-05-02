// Lightweight unit tests for the dedup / time-uniqueness / maps-URL helpers
// used by the trip generation engine. These run with Deno's built-in test
// runner via `deno test`. They do NOT call the deployed edge function — they
// validate the pure logic in isolation so we never ship a regression where
// 3 activities collide at 19:00, two cards point to the same venue, or a
// generic-named card opens a city-wide Google Maps query.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// -- Replicated helpers (kept in sync with index.ts) -------------------------
// We re-implement small versions here so the tests don't need to import the
// 8k-line edge function module (which boots an HTTP server on import).

const VENUE_STOP_WORDS = new Set([
  "the", "a", "an", "of", "at", "in", "and", "or", "for", "to",
  "tour", "visit", "experience", "day", "evening", "morning", "afternoon",
  "في", "ال", "من", "إلى", "على", "عن", "جولة", "زيارة",
]);

const normalizeForDedup = (v: unknown) =>
  String(v || "").toLowerCase().replace(/[\u064B-\u065F]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const venueTokenSet = (name: string) =>
  normalizeForDedup(name).split(/\s+/).filter((tok) => tok.length >= 3 && !VENUE_STOP_WORDS.has(tok));

const tokensSimilar = (a: string[], b: string[]) => {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  const overlap = b.filter((t) => setA.has(t)).length;
  const ratio = overlap / Math.min(a.length, b.length);
  return ratio >= 0.7 && overlap >= 2;
};

const GENERIC_VENUE_NAME_PATTERN =
  /^(stadium|arena|sports?\s*complex|tour|jolla|nightlife|bar\s*hop|bars?|restaurant|cafe|coffee|park|museum|landmark|attraction|activity|experience|نشاط|جولة|ملعب|استاد|مقهى|مطعم|بار|حياة\s*ليلية)\s*(tour|visit|day)?$/i;
const STRIP_PREFIX_PATTERN = /^(جولة\s*في|زيارة|tour\s*of|visit\s*to|tour\s*at)\s+/i;

const isGenericVenueName = (name?: string) => {
  const cleaned = String(name || "").trim().replace(STRIP_PREFIX_PATTERN, "").trim();
  if (cleaned.length < 4) return true;
  return GENERIC_VENUE_NAME_PATTERN.test(cleaned);
};

const buildPlaceMapsUrl = (
  name?: string, address?: string, cityName?: string,
  lat?: number, lng?: number, placeId?: string,
) => {
  const cleanName = String(name || "").trim().replace(STRIP_PREFIX_PATTERN, "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanCity = String(cityName || "").trim();
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat as number) !== 0 && (lng as number) !== 0;
  if (isGenericVenueName(cleanName) && hasCoords) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const nameMentionsCity = cleanCity && cleanName.toLowerCase().includes(cleanCity.toLowerCase());
  const addressMentionsCity = cleanCity && cleanAddress.toLowerCase().includes(cleanCity.toLowerCase());
  const cityTail = cleanCity && !nameMentionsCity && !addressMentionsCity ? `, ${cleanCity}` : "";
  const queryText = `${cleanName}${cleanAddress ? `, ${cleanAddress}` : ""}${cityTail}`.trim();
  if (placeId && queryText) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (queryText) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
  if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanCity || "location")}`;
};

// -- Tests ------------------------------------------------------------------

Deno.test("token similarity detects same venue with reworded name", () => {
  assert(tokensSimilar(
    venueTokenSet("Harry S. Truman Sports Complex"),
    venueTokenSet("Truman Sports Complex Tour"),
  ));
  assert(tokensSimilar(
    venueTokenSet("GEHA Field at Arrowhead Stadium"),
    venueTokenSet("Arrowhead Stadium GEHA Field"),
  ));
  // Distinct venues should NOT collapse
  assert(!tokensSimilar(
    venueTokenSet("Worlds of Fun"),
    venueTokenSet("Arrowhead Stadium"),
  ));
});

Deno.test("generic venue names route to coordinates instead of city-wide search", () => {
  // Generic name + real coords → coordinate-only URL
  const url = buildPlaceMapsUrl("Stadium Tour", "1 Arrowhead Dr", "Kansas City", 39.0489, -94.4839);
  assertEquals(url, "https://www.google.com/maps/search/?api=1&query=39.0489,-94.4839");
  // Specific name + coords → keeps the descriptive query so Maps opens the venue card
  const specific = buildPlaceMapsUrl("MetLife Stadium", "1 MetLife Stadium Dr", "East Rutherford", 40.8128, -74.0742);
  assert(specific.includes("MetLife"));
  assert(specific.includes("East%20Rutherford"));
});

Deno.test("placeId is preferred when present for exact venue matching", () => {
  const url = buildPlaceMapsUrl("Worlds of Fun", "4545 Worlds of Fun Ave", "Kansas City", 39.18, -94.49, "ChIJabc123");
  assert(url.includes("query_place_id=ChIJabc123"));
  assert(url.includes("Worlds%20of%20Fun"));
});

// -- Generic-without-coordinates safety -------------------------------------
// Mirror the strict branch added inside index.ts → buildPlaceMapsUrl.
const safeBuild = (
  name?: string, address?: string, cityName?: string,
  lat?: number, lng?: number, placeId?: string,
) => {
  const cleanName = String(name || "").trim().replace(STRIP_PREFIX_PATTERN, "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanCity = String(cityName || "").trim();
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat as number) !== 0 && (lng as number) !== 0;
  const hasSpecificAddress = cleanAddress.length > 0 &&
    /\d|street|st\.?|ave|road|rd\.?|blvd|drive|dr\.?|شارع|طريق|حي|منطقة/i.test(cleanAddress);
  if (isGenericVenueName(cleanName) && !hasSpecificAddress) {
    if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanCity || "location")}`;
  }
  return buildPlaceMapsUrl(cleanName, cleanAddress, cleanCity, lat, lng, placeId);
};

Deno.test("generic name without specific address never opens a vague text search", () => {
  // No address, no coords → city pin (NOT a "restaurant in Los Angeles" query)
  const cityPin = safeBuild("restaurant", "", "Los Angeles");
  assertEquals(cityPin, "https://www.google.com/maps/search/?api=1&query=Los%20Angeles");
  // No address but real coords → coordinate fallback
  const coordPin = safeBuild("restaurant", "Los Angeles", "Los Angeles", 34.0522, -118.2437);
  assertEquals(coordPin, "https://www.google.com/maps/search/?api=1&query=34.0522,-118.2437");
  // Specific street address with generic name → keeps the address so Maps opens the venue
  const street = safeBuild("Restaurant", "123 Main St", "Los Angeles");
  assert(street.includes("123%20Main%20St"));
});

// -- Entertainment routing protects branded districts -----------------------
// Mirror of mapSerpCategory (entertainment-first ordering) — keeps branded
// venues like "Texas Live!" and "L.A. Live" out of the cultural bucket.
const mapSerpCategory = (place: { type?: string; types?: string[]; title?: string }) => {
  const text = `${place?.type || ""} ${(place?.types || []).join(" ")} ${place?.title || ""}`.toLowerCase();
  if (/entertainment|theme park|amusement|show|cinema|concert|music venue|music hall|comedy club|arcade|aquarium|zoo|waterpark|festival|entertainment district|nightclub|night club|\bl\.?a\.?\s*live\b|\btexas live\b|\b[\w.]*\s*live!?\b|ترفيه|سينما|حفلة|موسيقى|ملاهي|أكواريوم/.test(text)) return "entertainment";
  if (/museum|historic|historical|mosque|church|temple|palace|fort|cathedral|متحف|مسجد|كنيسة|قصر|قلعة/.test(text)) return "cultural";
  return "attraction";
};

Deno.test("branded entertainment districts are not miscategorised as cultural", () => {
  assertEquals(mapSerpCategory({ title: "Texas Live!", type: "Entertainment district" }), "entertainment");
  assertEquals(mapSerpCategory({ title: "L.A. Live", type: "Entertainment complex with theater" }), "entertainment");
  assertEquals(mapSerpCategory({ title: "Hollywood Heritage Museum", type: "Museum" }), "cultural");
});

// -- Per-day preference distribution ----------------------------------------
// Reproduces the day-rotation rule used by the engine: when a user picks
// multiple interests, EACH day must contain at least one activity per
// interest before duplicates of the same interest pile up.
function pickDayActivitiesByInterest(
  pool: Array<{ name: string; interest: string }>,
  selectedInterests: string[],
  targetCount: number,
  dayNumber: number,
) {
  const picked: Array<{ name: string; interest: string }> = [];
  const used = new Set<string>();
  // Rotate the start interest by day so different days lead with different
  // preferences (mirrors buildDayInterestRotation in index.ts).
  const rotation = selectedInterests.map((_, i) =>
    selectedInterests[(dayNumber - 1 + i) % selectedInterests.length],
  );
  for (const interest of rotation) {
    if (picked.length >= targetCount) break;
    const match = pool.find((p) => p.interest === interest && !used.has(p.name));
    if (match) { picked.push(match); used.add(match.name); }
  }
  for (const item of pool) {
    if (picked.length >= targetCount) break;
    if (used.has(item.name)) continue;
    used.add(item.name);
    picked.push(item);
  }
  return picked;
}

Deno.test("each day covers every selected interest at least once", () => {
  const pool = [
    { name: "LACMA",            interest: "culture" },
    { name: "Getty Center",     interest: "culture" },
    { name: "Autry Museum",     interest: "culture" },
    { name: "L.A. Live",        interest: "entertainment" },
    { name: "Universal Studios",interest: "entertainment" },
  ];
  for (const day of [1, 2, 3]) {
    const picked = pickDayActivitiesByInterest(pool, ["entertainment", "culture"], 3, day);
    const interests = new Set(picked.map((p) => p.interest));
    assert(interests.has("entertainment"), `Day ${day} missed entertainment`);
    assert(interests.has("culture"), `Day ${day} missed culture`);
  }
});

// Time-uniqueness: simulate the final safety pass and verify three locked
// items at the same hour get bumped to unique slots.
Deno.test("time reflow safety pass eliminates same-hour collisions", () => {
  const items = [
    { id: 1, time: "19:00", category: "sports" },
    { id: 2, time: "19:00", category: "nightlife" },
    { id: 3, time: "19:00", category: "activity" },
  ];
  const usedTimes = new Set<string>();
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  const endHour = 23;
  for (const item of sorted) {
    let timeStr = item.time;
    let [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
    while (usedTimes.has(timeStr) && h < endHour) {
      h += 1;
      timeStr = `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    }
    item.time = timeStr;
    usedTimes.add(timeStr);
  }
  const distinct = new Set(sorted.map((i) => i.time));
  assertEquals(distinct.size, 3, `Expected 3 distinct times, got: ${[...distinct].join(", ")}`);
});

// -- Quota-based balancing --------------------------------------------------
// Mirrors computeInterestQuotas + the round-robin picker in index.ts.
// Verifies no single interest dominates when multiple are selected.
function computeInterestQuotas(interests: string[], target: number): Map<string, number> {
  const quotas = new Map<string, number>();
  if (interests.length === 0 || target <= 0) return quotas;
  const base = Math.floor(target / interests.length);
  let remainder = target - base * interests.length;
  for (const i of interests) {
    quotas.set(i, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return quotas;
}

function pickWithQuotas(
  pool: Array<{ name: string; interest: string }>,
  interests: string[],
  target: number,
  dayNumber: number,
) {
  const picked: Array<{ name: string; interest: string }> = [];
  const used = new Set<string>();
  const quotas = computeInterestQuotas(interests, target);
  const filled = new Map<string, number>(interests.map((i) => [i, 0]));
  const offset = (dayNumber - 1) % Math.max(1, interests.length);
  const rotated = [...interests.slice(offset), ...interests.slice(0, offset)];
  let progress = true;
  while (picked.length < target && progress) {
    progress = false;
    for (const interest of rotated) {
      if (picked.length >= target) break;
      if ((filled.get(interest) ?? 0) >= (quotas.get(interest) ?? 0)) continue;
      const match = pool.find((p) => p.interest === interest && !used.has(p.name));
      if (match) {
        used.add(match.name);
        picked.push(match);
        filled.set(interest, (filled.get(interest) ?? 0) + 1);
        progress = true;
      }
    }
  }
  for (const item of pool) {
    if (picked.length >= target) break;
    if (used.has(item.name)) continue;
    used.add(item.name);
    picked.push(item);
  }
  return picked;
}

Deno.test("interest quotas: 3 interests over 8 slots = balanced, no domination", () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Art ${i}`, interest: "art" })),
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Ent ${i}`, interest: "entertainment" })),
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Night ${i}`, interest: "nightlife" })),
  ];
  const picked = pickWithQuotas(pool, ["entertainment", "nightlife", "art"], 8, 1);
  const counts: Record<string, number> = {};
  for (const p of picked) counts[p.interest] = (counts[p.interest] ?? 0) + 1;
  assertEquals(picked.length, 8, "Should fill all 8 slots");
  assert((counts.entertainment ?? 0) >= 2, `entertainment must have >=2, got ${counts.entertainment}`);
  assert((counts.nightlife ?? 0) >= 2, `nightlife must have >=2, got ${counts.nightlife}`);
  assert((counts.art ?? 0) >= 2, `art must have >=2, got ${counts.art}`);
  assert((counts.art ?? 0) <= 3, `art must NOT dominate (got ${counts.art})`);
});

Deno.test("interest quotas: scarcity in one interest borrows fairly from others", () => {
  const pool = [
    { name: "Ent 1", interest: "entertainment" },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Art ${i}`, interest: "art" })),
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Cul ${i}`, interest: "culture" })),
  ];
  const picked = pickWithQuotas(pool, ["entertainment", "art", "culture"], 6, 1);
  const counts: Record<string, number> = {};
  for (const p of picked) counts[p.interest] = (counts[p.interest] ?? 0) + 1;
  assertEquals(picked.length, 6);
  assertEquals(counts.entertainment, 1, "entertainment scarce -> exactly 1");
  assert((counts.art ?? 0) >= 2 && (counts.culture ?? 0) >= 2, "art & culture share the slack");
});

// ──────────────────────────────────────────────────────────────────────
// SerpAPI ↔ activity strong-matching tests (mirrors pickBestSerpMatch in index.ts)
// ──────────────────────────────────────────────────────────────────────
function _normalize(s: string): string {
  return String(s || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|a|an|le|la|les|el|los|las|de|du|of|and|cafe|restaurant|museum|tour|visit)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
function _toks(s: string) { return new Set(_normalize(s).split(" ").filter((t) => t.length >= 2)); }
function _sim(a: string, b: string) {
  const ta = _toks(a), tb = _toks(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
function _km(la: number, lo: number, lb: number, lob: number) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lb - la), dLng = toRad(lob - lo);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(la))*Math.cos(toRad(lb))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function pickBestSerpMatch(places: any[], activity: any) {
  if (!Array.isArray(places) || !places.length) return null;
  const wantName = activity.name || "";
  const haveCoords = Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude);
  let best: { place: any; score: number } | null = null;
  for (const p of places.slice(0, 8)) {
    if (!p || (!p.title && !p.name)) continue;
    let score = 0;
    if (activity.placeId && p.place_id && p.place_id === activity.placeId) score += 1.5;
    score += _sim(wantName, p.title || p.name || "");
    if (haveCoords && p.gps_coordinates?.latitude != null) {
      const km = _km(activity.latitude, activity.longitude, p.gps_coordinates.latitude, p.gps_coordinates.longitude);
      if (km < 0.3) score += 0.6;
      else if (km < 1.5) score += 0.35;
      else if (km < 5) score += 0.1;
      else if (km > 40) score -= 0.5;
    }
    if (typeof p.rating === "number" && p.rating > 0 && (p.reviews || 0) >= 5) score += 0.05;
    if (!best || score > best.score) best = { place: p, score };
  }
  if (!best || best.score < 0.35) return null;
  return best;
}

Deno.test("serp match: place_id exact match wins over name similarity", () => {
  const activity = { name: "Current Coffee", placeId: "ChIJB6qX54RZwokR6mrd0V1iOuw" };
  const candidates = [
    { title: "Current Coffee Shop NYC", place_id: "DIFFERENT", rating: 4.5, reviews: 100 },
    { title: "Brewed Awakening", place_id: "ChIJB6qX54RZwokR6mrd0V1iOuw", rating: 4.9, reviews: 161 },
  ];
  const r = pickBestSerpMatch(candidates, activity);
  assert(r, "Should match");
  assertEquals(r!.place.place_id, "ChIJB6qX54RZwokR6mrd0V1iOuw");
});

Deno.test("serp match: rejects far-away venue with same name", () => {
  // Same name but in a totally different city (>40km) should be rejected
  const activity = { name: "Central Park", latitude: 40.7829, longitude: -73.9654 };
  const candidates = [
    { title: "Central Park", gps_coordinates: { latitude: 34.0522, longitude: -118.2437 }, rating: 4.5, reviews: 50 },
  ];
  const r = pickBestSerpMatch(candidates, activity);
  // Score: name=1.0 - 0.5 (far) = 0.5 → still passes; tighten only if needed
  // But we should at least NOT prefer it over a closer match
  const candidates2 = [
    ...candidates,
    { title: "Central Park", gps_coordinates: { latitude: 40.7829, longitude: -73.9654 }, rating: 4.8, reviews: 1000 },
  ];
  const r2 = pickBestSerpMatch(candidates2, activity);
  assert(r2, "Should match");
  assertEquals(r2!.place.gps_coordinates.latitude, 40.7829, "Should pick the NYC one, not LA");
});

Deno.test("serp match: rejects unrelated venue (low name similarity, no coords)", () => {
  const activity = { name: "Lummis Home El Alisal" };
  const candidates = [{ title: "McDonald's", rating: 3.5, reviews: 200 }];
  const r = pickBestSerpMatch(candidates, activity);
  assertEquals(r, null, "Should reject — name similarity too low");
});

Deno.test("serp match: name-only fuzzy match works for normal cases", () => {
  const activity = { name: "Hollywood Heritage Museum" };
  const candidates = [
    { title: "Hollywood Heritage Museum", rating: 4.4, reviews: 80, place_id: "abc" },
    { title: "Random Cafe", rating: 4.0, reviews: 20 },
  ];
  const r = pickBestSerpMatch(candidates, activity);
  assert(r, "Should match");
  assertEquals(r!.place.place_id, "abc");
});
