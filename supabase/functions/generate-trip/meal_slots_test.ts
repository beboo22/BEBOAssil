// Tests that every meal slot (breakfast / lunch / dinner / snack) iterates
// the COMPLETE list of user-selected cuisines (in order), accepts only a
// strictly matching restaurant, and that the chosen restaurant exposes valid
// opening hours via the same parser used by the rest of the planner.
//
// These tests are pure / offline. They mirror the strict-cuisine policy and
// the hours parser used in supabase/functions/generate-trip/index.ts. Keep
// them in sync if either of those change.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ───────────────────────────── shared types ─────────────────────────────
type Meal = "breakfast" | "lunch" | "dinner" | "snack";
type RestaurantInfo = {
  name: string;
  cuisine: string;
  // raw payload as it would arrive from SerpAPI/Google
  payload: any;
};

// minimal mirror of the hours parser (only what we need to assert on)
const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
function normalizeHoursString(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  s = s.replace(/\s*(?:to|–|—|-|−|~|الى|إلى)\s*/gi, " – ").replace(/\s{2,}/g, " ").trim();
  return s;
}
function extractHours(payload: any, dateISO?: string): string {
  if (!payload) return "";
  const dayIdx = dateISO ? new Date(`${dateISO.slice(0,10)}T12:00:00Z`).getUTCDay() : new Date().getDay();
  const dayKey = DAY_KEYS[dayIdx];
  const oh = payload.operating_hours ?? payload.opening_hours ?? payload.hours ?? null;
  if (!oh) return "";
  if (typeof oh === "string") return normalizeHoursString(oh);
  if (typeof oh === "object" && !Array.isArray(oh)) {
    return normalizeHoursString(oh[dayKey] ?? Object.values(oh)[0] as string ?? "");
  }
  return "";
}
function hasValidHours(s: string): boolean {
  return !!s && !/غير\s*متوفر|n\/a|unknown|check/i.test(s);
}

// ───────────────── strict per-slot resolver (mirror of index.ts) ─────────────────
// Tries each candidate cuisine in order. Returns the first restaurant whose
// declared cuisine matches AND whose payload yields valid opening hours.
// Refuses generic / off-preference fallbacks when candidates were supplied.
async function resolveSlotWithCandidates(
  meal: Meal,
  city: string,
  candidates: string[],
  pool: RestaurantInfo[],
  dateISO?: string,
): Promise<{ restaurant: RestaurantInfo | null; matchedCuisine: string | null; hours: string }> {
  const filtered = candidates.filter(Boolean).map((c) => c.toLowerCase());
  for (const cuisine of filtered) {
    const match = pool.find((r) => r.cuisine.toLowerCase() === cuisine);
    if (!match) continue;
    const hours = extractHours(match.payload, dateISO);
    if (!hasValidHours(hours)) continue;
    return { restaurant: match, matchedCuisine: cuisine, hours };
  }
  // strict refusal: do not return off-preference items
  if (filtered.length > 0) return { restaurant: null, matchedCuisine: null, hours: "" };
  // no candidates → allow first available
  const any = pool[0] ?? null;
  return {
    restaurant: any,
    matchedCuisine: null,
    hours: any ? extractHours(any.payload, dateISO) : "",
  };
}

// ───────────────────────────── fixtures ─────────────────────────────
const RICH_POOL: RestaurantInfo[] = [
  { name: "Trattoria Vera", cuisine: "italian",
    payload: { operating_hours: { monday: "12 PM–11 PM", tuesday: "12 PM–11 PM", wednesday: "12 PM–11 PM",
      thursday: "12 PM–11 PM", friday: "12 PM–12 AM", saturday: "12 PM–12 AM", sunday: "12 PM–10 PM" } } },
  { name: "Saffron House", cuisine: "indian",
    payload: { hours: "Mon-Sun: 11 AM – 11 PM" } },
  { name: "Sakura Sushi", cuisine: "japanese",
    payload: { operating_hours: "11:30 AM–10 PM" } },
  { name: "Beirut Garden", cuisine: "lebanese",
    payload: { opening_hours: { monday: "8 AM–11 PM", tuesday: "8 AM–11 PM", wednesday: "8 AM–11 PM",
      thursday: "8 AM–11 PM", friday: "8 AM–12 AM", saturday: "8 AM–12 AM", sunday: "8 AM–11 PM" } } },
  { name: "Mariscos del Puerto", cuisine: "seafood",
    payload: { hours: "Tue-Sun: 12 PM – 10 PM" } },
  { name: "Brunch & Co.", cuisine: "brunch",
    payload: { hours: "Mon-Sun: 8 AM – 3 PM" } },
  { name: "Sweet Spoon", cuisine: "desserts",
    payload: { hours: "Mon-Sun: 10 AM – 11 PM" } },
];

// ───────────────────────────── tests ─────────────────────────────

Deno.test("each meal slot uses ALL selected cuisines (in order) and returns a strict match with hours", async () => {
  const slots: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
  const cuisines = ["italian", "indian", "japanese", "lebanese"];
  for (const slot of slots) {
    const r = await resolveSlotWithCandidates(slot, "Rome", cuisines, RICH_POOL, "2026-06-08");
    assert(r.restaurant, `slot ${slot} returned null`);
    assertEquals(cuisines.includes(r.matchedCuisine!), true,
      `slot ${slot} matched cuisine "${r.matchedCuisine}" not in user list`);
    assert(hasValidHours(r.hours), `slot ${slot} returned without valid hours: "${r.hours}"`);
  }
});

Deno.test("slot iterates candidates in order: prefers earlier cuisine when both available", async () => {
  const r = await resolveSlotWithCandidates("dinner", "Rome",
    ["indian", "italian"], RICH_POOL, "2026-06-08");
  assertEquals(r.matchedCuisine, "indian");
  assertEquals(r.restaurant?.name, "Saffron House");
});

Deno.test("slot falls through to next candidate when first cuisine has no match", async () => {
  const r = await resolveSlotWithCandidates("lunch", "Rome",
    ["mexican", "korean", "japanese", "italian"], RICH_POOL, "2026-06-08");
  assertEquals(r.matchedCuisine, "japanese");
  assertEquals(r.restaurant?.name, "Sakura Sushi");
});

Deno.test("slot REFUSES generic fallback when none of the user's cuisines match", async () => {
  const r = await resolveSlotWithCandidates("dinner", "Reykjavik",
    ["mexican", "korean", "thai"], RICH_POOL, "2026-06-08");
  assertEquals(r.restaurant, null,
    `expected strict refusal; got ${JSON.stringify(r.restaurant)}`);
  assertEquals(r.matchedCuisine, null);
});

Deno.test("slot skips a matching cuisine whose payload has invalid/missing hours and tries next candidate", async () => {
  const pool: RestaurantInfo[] = [
    { name: "Bad Italian", cuisine: "italian", payload: { hours: "ساعات العمل غير متوفرة" } },
    { name: "Good Indian", cuisine: "indian", payload: { hours: "Mon-Sun: 11 AM – 11 PM" } },
  ];
  const r = await resolveSlotWithCandidates("lunch", "Doha", ["italian", "indian"], pool, "2026-06-08");
  assertEquals(r.matchedCuisine, "indian");
  assertEquals(r.restaurant?.name, "Good Indian");
  assert(hasValidHours(r.hours));
});

Deno.test("snack slot honors snack-friendly cuisines (desserts, brunch)", async () => {
  const r1 = await resolveSlotWithCandidates("snack", "Paris",
    ["desserts"], RICH_POOL, "2026-06-08");
  assertEquals(r1.restaurant?.name, "Sweet Spoon");
  assert(hasValidHours(r1.hours));

  const r2 = await resolveSlotWithCandidates("breakfast", "Paris",
    ["brunch"], RICH_POOL, "2026-06-08");
  assertEquals(r2.restaurant?.name, "Brunch & Co.");
  assert(hasValidHours(r2.hours));
});

Deno.test("empty candidate list (user picked no cuisine) → generic fallback allowed AND must include hours", async () => {
  const r = await resolveSlotWithCandidates("dinner", "Athens", [], RICH_POOL, "2026-06-08");
  assert(r.restaurant, "expected a generic fallback when no cuisines specified");
  assertEquals(r.matchedCuisine, null);
  assert(hasValidHours(r.hours), `generic fallback missing hours: "${r.hours}"`);
});

Deno.test("end-to-end: 4-day plan with 4 meals/day always picks from user cuisines and always has hours", async () => {
  const userCuisines = ["italian", "indian", "japanese", "lebanese", "seafood", "brunch", "desserts"];
  const slotsPerDay: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
  const days = 4;
  const dateBase = new Date("2026-06-01T12:00:00Z");

  let total = 0;
  let refusedOffPreference = 0;
  let withHours = 0;

  for (let d = 0; d < days; d++) {
    const dateISO = new Date(dateBase.getTime() + d * 86400000).toISOString().slice(0, 10);
    for (const slot of slotsPerDay) {
      total++;
      const r = await resolveSlotWithCandidates(slot, "Rome", userCuisines, RICH_POOL, dateISO);
      assert(r.restaurant, `day ${d + 1} ${slot}: expected strict match, got null`);
      assertEquals(userCuisines.includes(r.matchedCuisine!), true,
        `day ${d + 1} ${slot}: matched off-preference cuisine "${r.matchedCuisine}"`);
      if (r.matchedCuisine && userCuisines.includes(r.matchedCuisine)) refusedOffPreference++;
      if (hasValidHours(r.hours)) withHours++;
    }
  }
  assertEquals(total, days * slotsPerDay.length);
  assertEquals(withHours, total, `expected 100% hours coverage, got ${withHours}/${total}`);
  assertEquals(refusedOffPreference, total, "every slot must be strictly on-preference");
});

Deno.test("end-to-end: when user cuisines are entirely unavailable, ALL slots refuse rather than substitute", async () => {
  const userCuisines = ["mexican", "korean", "thai"]; // none in RICH_POOL
  const slotsPerDay: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
  for (let d = 0; d < 3; d++) {
    for (const slot of slotsPerDay) {
      const r = await resolveSlotWithCandidates(slot, "Reykjavik", userCuisines, RICH_POOL, "2026-06-08");
      assertEquals(r.restaurant, null, `day ${d + 1} ${slot} returned an off-preference restaurant`);
    }
  }
});
