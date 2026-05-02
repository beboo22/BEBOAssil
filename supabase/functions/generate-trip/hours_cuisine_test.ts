// Unit tests for the two regressions we keep being bitten by:
//   1. "ساعات العمل غير متوفرة" appearing on activity cards inside large/dense
//      itineraries because the SerpAPI hours payload arrived in a shape the
//      parser did not recognize, or because the per-activity enrichment loop
//      capped how many venues it processed.
//   2. The meal generator returning a generic restaurant when the user picked
//      a specific cuisine (e.g. "italian") that no candidate matched — the
//      strict policy is to refuse a generic fallback rather than hand the user
//      something off-preference.
//
// We mirror the exact helpers from supabase/functions/generate-trip/index.ts so
// these tests stay pure and offline (the index module boots an HTTP server on
// import, which is unsuitable for `deno test`). If you change the parser or
// the strict-cuisine policy in index.ts, mirror the change here too.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ───────────────────────────────────────────────────────────────────────────
// Hours parser — mirror of extractPlaceOpeningHours / formatOperatingHoursForDate
// ───────────────────────────────────────────────────────────────────────────

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const DAY_ALIASES: Record<string, string> = {
  sun: "sunday", sunday: "sunday", "su": "sunday", "الأحد": "sunday", "الاحد": "sunday",
  mon: "monday", monday: "monday", "mo": "monday", "الإثنين": "monday", "الاثنين": "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday", "tu": "tuesday", "الثلاثاء": "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday", "we": "wednesday", "الأربعاء": "wednesday", "الاربعاء": "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday", "th": "thursday", "الخميس": "thursday",
  fri: "friday", friday: "friday", "fr": "friday", "الجمعة": "friday",
  sat: "saturday", saturday: "saturday", "sa": "saturday", "السبت": "saturday",
};

function normalizeDayKey(raw: string): string | null {
  const k = raw.toLowerCase().trim().replace(/\.$/, "");
  if (DAY_KEYS.includes(k)) return k;
  if (DAY_ALIASES[k]) return DAY_ALIASES[k];
  return null;
}

function expandDayRange(rangeText: string, hoursText: string, out: Record<string, string>) {
  const m = rangeText.match(/^([a-z\u0600-\u06ff]+)\s*[-–—to]+\s*([a-z\u0600-\u06ff]+)$/i);
  if (!m) {
    const single = normalizeDayKey(rangeText);
    if (single) out[single] = hoursText;
    return;
  }
  const a = normalizeDayKey(m[1]);
  const b = normalizeDayKey(m[2]);
  if (!a || !b) return;
  let i = DAY_KEYS.indexOf(a);
  const j = DAY_KEYS.indexOf(b);
  for (let n = 0; n < 7; n++) {
    out[DAY_KEYS[i]] = hoursText;
    if (i === j) break;
    i = (i + 1) % 7;
  }
}

function parseHoursTextBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  const parts = text.split(/[;\n\r]+|(?<=\d)\s*,\s*(?=[A-Za-z\u0600-\u06ff])/g);
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^([A-Za-z\u0600-\u06ff][A-Za-z\u0600-\u06ff\s.\-\–—to]*?)\s*[:\-\–—]\s*(.+)$/);
    if (m) expandDayRange(m[1].trim(), m[2].trim(), out);
  }
  return out;
}

function normalizeHoursString(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/^\s*(hours?|opening\s*hours?|business\s*hours?|today|اليوم|ساعات\s*العمل|مفتوح)\s*[:：\-\–—]?\s*/i, "");
  s = s.replace(/^\s*(open|closed)\s*[·•・]\s*/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (/^(open\s*)?24\s*(\/|\\)?\s*7$/i.test(s) ||
      /open\s*24\s*hours?/i.test(s) ||
      /always\s*open/i.test(s) ||
      /مفتوح\s*24\s*ساعة/.test(s) ||
      /على\s*مدار\s*الساعة/.test(s)) return "Open 24 hours";
  if (/^closed$/i.test(s) || /^مغلق$/i.test(s)) return "Closed";
  s = s.replace(/\s*(?:to|–|—|-|−|~|الى|إلى)\s*/gi, " – ");
  s = s.replace(/(\d)\s*([ap])\.?\s*m\.?/gi, (_m, d, p) => `${d} ${p.toUpperCase()}M`);
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function pickDayFromMap(map: Record<string, string>, targetDay: string): string {
  if (map[targetDay]) return map[targetDay];
  for (const k of DAY_KEYS) {
    const v = map[k];
    if (v && !/closed|مغلق/i.test(v)) return v;
  }
  for (const v of Object.values(map)) if (v) return v;
  return "";
}

function todayDayKey(): string { return DAY_KEYS[new Date().getDay()]; }

function dayKeyForDate(targetDate?: string): string {
  if (!targetDate) return todayDayKey();
  const parsed = new Date(`${String(targetDate).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? todayDayKey() : DAY_KEYS[parsed.getUTCDay()];
}

function formatOperatingHoursForDate(hours: any, targetDate?: string): string {
  if (hours == null) return "";
  const targetDay = dayKeyForDate(targetDate);
  if (typeof hours === "string") {
    const text = hours.trim();
    if (!text) return "";
    const todayMatch = text.match(/^(today|اليوم)\s*[:\-\–—]\s*(.+)$/i);
    if (todayMatch) return normalizeHoursString(todayMatch[2]);
    const tomorrowMatch = text.match(/^(tomorrow|غداً|غدا)\s*[:\-\–—]\s*(.+)$/i);
    if (tomorrowMatch) return normalizeHoursString(tomorrowMatch[2]);
    if (/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)/i.test(text)) {
      const map = parseHoursTextBlock(text);
      const picked = pickDayFromMap(map, targetDay);
      if (picked) return normalizeHoursString(picked);
    }
    return normalizeHoursString(text);
  }
  if (Array.isArray(hours)) {
    const merged: Record<string, string> = {};
    for (const entry of hours) {
      if (typeof entry === "string") {
        Object.assign(merged, parseHoursTextBlock(entry));
      } else if (entry && typeof entry === "object") {
        for (const [k, v] of Object.entries(entry)) {
          if (typeof v !== "string") continue;
          const dk = normalizeDayKey(k);
          if (dk) merged[dk] = v;
          else Object.assign(merged, parseHoursTextBlock(`${k}: ${v}`));
        }
      }
    }
    const picked = pickDayFromMap(merged, targetDay);
    return picked ? normalizeHoursString(picked) : "";
  }
  if (typeof hours === "object") {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(hours)) {
      if (typeof v !== "string") continue;
      const dk = normalizeDayKey(k);
      if (dk) map[dk] = v;
      else Object.assign(map, parseHoursTextBlock(`${k}: ${v}`));
    }
    const picked = pickDayFromMap(map, targetDay);
    return picked ? normalizeHoursString(picked) : "";
  }
  return "";
}

function hasValidOpeningHours(value: unknown): boolean {
  const hours = String(value || "").trim();
  if (!hours) return false;
  return !/(تحقق\s*من\s*ساعات\s*العمل|check\s*opening\s*hours|unknown|n\/a|غير\s*متوفر)/i.test(hours);
}

function extractPlaceOpeningHours(place: any, targetDate?: string): string | undefined {
  if (!place || typeof place !== "object") return undefined;
  const candidates = [
    place?.operating_hours,
    place?.openingHours,
    place?.opening_hours,
    place?.currentOpeningHours?.weekdayDescriptions,
    place?.currentOpeningHours,
    place?.regularOpeningHours?.weekdayDescriptions,
    place?.regularOpeningHours,
    place?.hours,
    place?.workingHours,
    place?.business_hours,
    place?.businessHours,
    place?.weekdayText,
    place?.weekday_text,
    place?.place_details?.hours,
    place?.place_details?.opening_hours,
    place?.openingHoursText,
    place?.openHours,
  ];
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const formatted = formatOperatingHoursForDate(candidate, targetDate);
    if (formatted && hasValidOpeningHours(formatted)) return formatted;
  }
  const stringFields = [place?.snippet, place?.description, place?.subtitle, place?.status, place?.openClose];
  for (const field of stringFields) {
    if (typeof field !== "string") continue;
    const m = field.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|ص|م)?)\s*[-–—~]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|ص|م)?)/);
    if (m) return `${m[1]} – ${m[2]}`;
    if (/24\s*\/?\s*7|open\s*24|24\s*hours|مفتوح\s*24/i.test(field)) return "Open 24 hours";
  }
  return undefined;
}

function needsOpeningHours(activity: any) {
  const category = String(activity?.category || activity?.type || "").toLowerCase();
  if (!category) return true;
  if (["hotel", "flight", "transport", "transfer", "car_rental", "car", "route"].includes(category)) return false;
  return true;
}

async function enrichMissingOpeningHoursOffline(
  itinerary: { days: { activities: any[] }[] },
  seedByName: Map<string, any>,
): Promise<number> {
  let fixed = 0;
  const tasks: Promise<void>[] = [];
  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (!needsOpeningHours(activity)) continue;
      if (hasValidOpeningHours(activity?.openingHours)) continue;
      const place = seedByName.get(String(activity?.name || ""));
      tasks.push(Promise.resolve().then(() => {
        const hours = place ? extractPlaceOpeningHours(place, activity?.date) : undefined;
        if (hours) {
          activity.openingHours = hours;
          fixed++;
        }
      }));
    }
  }
  await Promise.allSettled(tasks);
  return fixed;
}

function seedSamplePayloads(): { name: string; payload: any }[] {
  return [
    { name: "Stumptown Coffee Roasters", payload: { operating_hours: {
        sunday: "11:30 AM–9 PM", monday: "7:30–10:30 AM, 12–10:30 PM",
        tuesday: "7:30–10:30 AM, 12–10:30 PM", wednesday: "7:30–10:30 AM, 12–10:30 PM",
        thursday: "7:30–10:30 AM, 12–10:30 PM", friday: "7:30–10:30 AM, 12–10:30 PM",
        saturday: "9 AM–10:30 PM",
      } } },
    { name: "Pike Place Market", payload: { operating_hours: [
        { monday: "9 AM–6 PM" }, { tuesday: "9 AM–6 PM" }, { wednesday: "9 AM–6 PM" },
        { thursday: "9 AM–6 PM" }, { friday: "9 AM–6 PM" }, { saturday: "9 AM–6 PM" },
        { sunday: "9 AM–5 PM" },
      ] } },
    { name: "Museum of Pop Culture", payload: { weekday_text: [
        "Monday: 10 AM – 5 PM", "Tuesday: 10 AM – 5 PM", "Wednesday: 10 AM – 5 PM",
        "Thursday: 10 AM – 5 PM", "Friday: 10 AM – 5 PM", "Saturday: 10 AM – 6 PM",
        "Sunday: 10 AM – 6 PM",
      ] } },
    { name: "Space Needle", payload: { hours: "Mon-Fri: 10 AM – 8 PM; Sat-Sun: 9 AM – 9 PM" } },
    { name: "Chihuly Garden", payload: { hours: "Today: 9 AM – 8 PM" } },
    { name: "متحف الفن الحديث", payload: { hours: "اليوم: 10 ص – 6 م" } },
    { name: "24/7 Diner", payload: { snippet: "Open 24 hours · Casual diner" } },
    { name: "Seattle Aquarium", payload: { currentOpeningHours: { weekdayDescriptions: [
        "Monday: 9:30 AM – 6:00 PM", "Tuesday: 9:30 AM – 6:00 PM",
        "Wednesday: 9:30 AM – 6:00 PM", "Thursday: 9:30 AM – 6:00 PM",
        "Friday: 9:30 AM – 6:00 PM", "Saturday: 9:00 AM – 7:00 PM",
        "Sunday: 9:00 AM – 7:00 PM",
      ] } } },
    { name: "Kerry Park", payload: { place_details: { hours: { monday: "Open 24 hours" } } } },
    { name: "Discovery Park", payload: { openingHoursText: "Sun-Sat: 4 AM – 11:30 PM" } },
  ];
}

Deno.test("hours parser handles every SerpAPI / Google payload shape we ship", () => {
  for (const { name, payload } of seedSamplePayloads()) {
    const out = extractPlaceOpeningHours(payload);
    assert(out, `Failed to extract hours for "${name}" → got ${JSON.stringify(out)}`);
    assert(hasValidOpeningHours(out), `Hours for "${name}" failed validity gate: "${out}"`);
  }
});

Deno.test("targetDate picks the correct weekday from a per-day map", () => {
  const place = { operating_hours: {
    sunday: "11:30 AM–9 PM", monday: "7:30 AM – 5 PM", saturday: "9 AM–10:30 PM",
  } };
  assertEquals(extractPlaceOpeningHours(place, "2026-06-07"), "11:30 AM – 9 PM");
  assertEquals(extractPlaceOpeningHours(place, "2026-06-08"), "7:30 AM – 5 PM");
  assertEquals(extractPlaceOpeningHours(place, "2026-06-13"), "9 AM – 10:30 PM");
});

Deno.test("hotels / flights / transport are skipped (no hours expected)", () => {
  for (const cat of ["hotel", "flight", "transport", "transfer", "car_rental", "car", "route"]) {
    assertEquals(needsOpeningHours({ category: cat }), false, `${cat} should be skipped`);
  }
  for (const cat of ["restaurant", "attraction", "museum", "cafe", "entertainment", ""]) {
    assertEquals(needsOpeningHours({ category: cat }), true, `${cat} should require hours`);
  }
});

Deno.test("large itinerary (14 days × 12 venues) reaches 100% hours coverage after enrichment", async () => {
  const samples = seedSamplePayloads();
  const seedByName = new Map(samples.map((s) => [s.name, s.payload]));
  const days: any[] = [];
  for (let d = 0; d < 14; d++) {
    const activities: any[] = [];
    for (let a = 0; a < 12; a++) {
      const seed = samples[(d * 12 + a) % samples.length];
      activities.push({
        name: seed.name,
        category: a === 0 ? "hotel" : (a % 3 === 0 ? "restaurant" : "attraction"),
        openingHours: "",
      });
    }
    days.push({ activities });
  }
  const itinerary = { days };
  const fixed = await enrichMissingOpeningHoursOffline(itinerary, seedByName);
  let venuesNeedingHours = 0;
  let venuesWithHours = 0;
  let hotelsTouched = 0;
  for (const day of itinerary.days) {
    for (const act of day.activities) {
      if (!needsOpeningHours(act)) {
        if (act.openingHours) hotelsTouched++;
        continue;
      }
      venuesNeedingHours++;
      if (hasValidOpeningHours(act.openingHours)) venuesWithHours++;
    }
  }
  assertEquals(hotelsTouched, 0, "hotels must NOT receive opening hours");
  assertEquals(
    venuesWithHours,
    venuesNeedingHours,
    `Expected 100% hours coverage. Got ${venuesWithHours}/${venuesNeedingHours}. fixed=${fixed}`,
  );
  assertEquals(venuesNeedingHours, 14 * 11);
});

Deno.test("activities that already have valid hours are not overwritten", async () => {
  const seedByName = new Map([["Pre-filled Café", { hours: "Mon-Sun: 9 AM – 5 PM" }]]);
  const itinerary = { days: [{ activities: [
    { name: "Pre-filled Café", category: "cafe", openingHours: "8 AM – 10 PM" },
  ] }] };
  const fixed = await enrichMissingOpeningHoursOffline(itinerary, seedByName);
  assertEquals(fixed, 0);
  assertEquals(itinerary.days[0].activities[0].openingHours, "8 AM – 10 PM");
});

Deno.test("invalid-hours strings (e.g. 'check opening hours') are treated as missing and refilled", async () => {
  const seedByName = new Map([["Place X", { hours: "Mon-Sun: 9 AM – 5 PM" }]]);
  const itinerary = { days: [{ activities: [
    { name: "Place X", category: "attraction", openingHours: "ساعات العمل غير متوفرة" },
  ] }] };
  assertEquals(hasValidOpeningHours("ساعات العمل غير متوفرة"), false);
  const fixed = await enrichMissingOpeningHoursOffline(itinerary, seedByName);
  assertEquals(fixed, 1);
  assert(hasValidOpeningHours(itinerary.days[0].activities[0].openingHours));
});

type Meal = "breakfast" | "lunch" | "dinner";
type RestaurantInfo = { name: string; cuisine?: string };

function makeResolver(opts: {
  exact?: (cuisine: string | null) => RestaurantInfo | null;
  relaxed?: (cuisine: string | null) => RestaurantInfo | null;
  curated?: (cuisine: string | null) => RestaurantInfo | null;
}) {
  return async function resolve(
    _meal: Meal,
    _city: string,
    cuisine: string | null,
  ): Promise<RestaurantInfo | null> {
    if (cuisine) {
      const a = opts.exact?.(cuisine);
      if (a) return a;
      const b = opts.relaxed?.(cuisine);
      if (b) return b;
      const c = opts.curated?.(cuisine);
      if (c) return c;
      return null;
    }
    const g1 = opts.exact?.(null);
    if (g1) return g1;
    const g2 = opts.relaxed?.(null);
    if (g2) return g2;
    return opts.curated?.(null) ?? null;
  };
}

Deno.test("strict cuisine: exact tier match returned immediately", async () => {
  const resolve = makeResolver({
    exact: (c) => c === "italian" ? { name: "Trattoria Vera", cuisine: "italian" } : null,
    relaxed: () => ({ name: "Generic Diner", cuisine: "american" }),
    curated: () => ({ name: "Curated Italian", cuisine: "italian" }),
  });
  const r = await resolve("dinner", "Rome", "italian");
  assertEquals(r?.name, "Trattoria Vera");
});

Deno.test("strict cuisine: relaxed tier used when exact tier misses", async () => {
  const resolve = makeResolver({
    exact: () => null,
    relaxed: (c) => c === "italian" ? { name: "Pasta Place", cuisine: "italian" } : null,
    curated: () => ({ name: "Curated Italian", cuisine: "italian" }),
  });
  const r = await resolve("lunch", "Athens", "italian");
  assertEquals(r?.name, "Pasta Place");
});

Deno.test("strict cuisine: curated tier used when both SerpAPI tiers miss", async () => {
  const resolve = makeResolver({
    exact: () => null,
    relaxed: () => null,
    curated: (c) => c === "italian" ? { name: "Curated Italian", cuisine: "italian" } : null,
  });
  const r = await resolve("dinner", "Helsinki", "italian");
  assertEquals(r?.name, "Curated Italian");
});

Deno.test("strict cuisine: REFUSE generic fallback when no tier matches the requested cuisine", async () => {
  const resolve = makeResolver({
    exact: (c) => c === "italian" ? null : { name: "Generic American", cuisine: "american" },
    relaxed: (c) => c === "italian" ? null : { name: "Generic Mediterranean", cuisine: "mediterranean" },
    curated: (c) => c === "italian" ? null : { name: "Generic Cafe", cuisine: "cafe" },
  });
  const r = await resolve("dinner", "Reykjavik", "italian");
  assertEquals(r, null, `Expected null (strict refusal); got ${JSON.stringify(r)}`);
});

Deno.test("no cuisine requested: generic fallback chain is allowed", async () => {
  const resolve = makeResolver({
    exact: () => null,
    relaxed: () => null,
    curated: () => ({ name: "Local Bistro", cuisine: "local" }),
  });
  const r = await resolve("lunch", "Paris", null);
  assertEquals(r?.name, "Local Bistro");
});

async function resolveWithCandidates(
  candidates: string[],
  resolveOne: (cuisine: string | null) => Promise<RestaurantInfo | null>,
): Promise<{ restaurant: RestaurantInfo | null; matchedCuisine: string | null }> {
  for (const c of candidates.filter(Boolean)) {
    const r = await resolveOne(c);
    if (r) return { restaurant: r, matchedCuisine: c };
  }
  const fallback = candidates.length === 0 ? await resolveOne(null) : null;
  return { restaurant: fallback, matchedCuisine: null };
}

Deno.test("multi-cuisine: tries each candidate in order, returns first match", async () => {
  const fakeResolve = async (cuisine: string | null) => {
    if (cuisine === "italian") return null;
    if (cuisine === "indian") return { name: "Saffron", cuisine: "indian" };
    return null;
  };
  const r = await resolveWithCandidates(["italian", "indian"], fakeResolve);
  assertEquals(r.matchedCuisine, "indian");
  assertEquals(r.restaurant?.name, "Saffron");
});

Deno.test("multi-cuisine: when ALL user-selected cuisines miss → refuse generic (matchedCuisine=null, restaurant=null)", async () => {
  const fakeResolve = async (_c: string | null) => null;
  const r = await resolveWithCandidates(["italian", "indian"], fakeResolve);
  assertEquals(r.matchedCuisine, null);
  assertEquals(r.restaurant, null);
});

Deno.test("multi-cuisine: empty candidate list → falls back to generic resolve(null)", async () => {
  const fakeResolve = async (cuisine: string | null) =>
    cuisine === null ? { name: "Any Place", cuisine: "any" } : null;
  const r = await resolveWithCandidates([], fakeResolve);
  assertEquals(r.matchedCuisine, null);
  assertEquals(r.restaurant?.name, "Any Place");
});
