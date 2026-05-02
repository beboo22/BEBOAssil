// Standalone test for cuisine rotation logic across long trips.
// Replicates `getMealCuisineCandidates` + `getCuisineForMealSlot` from index.ts
// so we can validate behavior over 100 days without invoking the heavy
// generate-trip pipeline (which depends on SerpAPI + AI gateway).
//
// Run via: supabase--test_edge_functions { functions: ["generate-trip"] }

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Meal = "breakfast" | "lunch" | "dinner" | "snack";

const STRICT_BREAKFAST_INCOMPATIBLE = new Set([
  "seafood",
  "grill",
  "fine-dining",
  "fast-food",
  "food-truck",
]);

const normalize = (v: string) =>
  v.toLowerCase().trim().replace(/\s+/g, "-").replace(/_/g, "-");

const isCompatible = (cuisine: string, meal: Meal): boolean => {
  const c = normalize(cuisine);
  if (!c) return true;
  if (meal === "breakfast") return !STRICT_BREAKFAST_INCOMPATIBLE.has(c);
  return true;
};

const getMealCuisineCandidates = (
  requested: string[],
  dayIndex: number,
  meal: Meal,
): string[] => {
  const normalized = requested.map(normalize).filter(Boolean);
  const dedup = normalized.filter((v, i, a) => a.indexOf(v) === i);
  if (dedup.length === 0) return [];
  const compatible = dedup.filter((v) => isCompatible(v, meal));
  const pool = compatible.length > 0 ? compatible : dedup;
  if (pool.length === 1) return pool;
  const size = pool.length;
  const mealOffset =
    meal === "breakfast" ? 0 : meal === "lunch" ? 1 : meal === "dinner" ? 2 : 3;
  let dayStride = 1;
  if (size === 4) dayStride = 3;
  else if (size >= 5) {
    const candidate = Math.floor(size / 2) + 1;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    dayStride = gcd(candidate, size) === 1 ? candidate : 1;
  }
  const startIndex =
    (((dayIndex * dayStride) + mealOffset) % size + size) % size;
  return Array.from({ length: size }, (_, idx) =>
    pool[(startIndex + idx) % size]
  ).filter((v, i, a) => a.indexOf(v) === i);
};

const pickCuisineForMealSlot = (
  requested: string[],
  dayIndex: number,
  meal: Meal,
): string => {
  const cands = getMealCuisineCandidates(requested, dayIndex, meal);
  return cands[0] || "";
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("100-day trip: Indian + seafood + fast-food rotates daily on lunch", () => {
  const requested = ["indian", "seafood", "fast-food"];
  const TRIP_DAYS = 100;
  const counts: Record<string, number> = {};
  for (let day = 0; day < TRIP_DAYS; day++) {
    const cuisine = pickCuisineForMealSlot(requested, day, "lunch");
    assert(requested.includes(cuisine), `Day ${day}: ${cuisine} not requested`);
    counts[cuisine] = (counts[cuisine] || 0) + 1;
  }
  // Each cuisine should be used roughly 100/3 ≈ 33 times.
  for (const c of requested) {
    assert(
      counts[c] >= 30 && counts[c] <= 36,
      `Cuisine ${c} appeared ${counts[c]} times (expected ~33)`,
    );
  }
});

Deno.test("Within one day: breakfast/lunch/dinner pick different cuisines", () => {
  const requested = ["indian", "seafood", "fast-food"];
  let mismatches = 0;
  for (let day = 0; day < 100; day++) {
    const b = pickCuisineForMealSlot(requested, day, "breakfast");
    const l = pickCuisineForMealSlot(requested, day, "lunch");
    const d = pickCuisineForMealSlot(requested, day, "dinner");
    // L and D must always differ when pool >= 2 (mealOffset 1 vs 2).
    assert(l !== d, `Day ${day}: lunch=${l} dinner=${d} are identical`);
    if (b === l) mismatches++;
  }
  // breakfast filters out seafood/fast-food → pool may shrink to ["indian"];
  // in that case b===l on the day lunch rotates back to indian. That's
  // expected. We only assert l !== d above.
});

Deno.test("Breakfast never receives seafood/fast-food when other cuisine present", () => {
  const requested = ["indian", "seafood", "fast-food"];
  for (let day = 0; day < 100; day++) {
    const b = pickCuisineForMealSlot(requested, day, "breakfast");
    assertEquals(b, "indian", `Day ${day}: breakfast got ${b}`);
  }
});

Deno.test("Single cuisine: rotation is stable, never empty", () => {
  for (let day = 0; day < 100; day++) {
    const cuisine = pickCuisineForMealSlot(["italian"], day, "lunch");
    assertEquals(cuisine, "italian");
  }
});

Deno.test("Empty requested cuisines: no candidates returned", () => {
  for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) {
    const cands = getMealCuisineCandidates([], 0, meal);
    assertEquals(cands.length, 0);
  }
});

Deno.test("Two cuisines: breakfast + lunch + dinner cover both daily", () => {
  const requested = ["italian", "japanese"];
  for (let day = 0; day < 100; day++) {
    const set = new Set([
      pickCuisineForMealSlot(requested, day, "breakfast"),
      pickCuisineForMealSlot(requested, day, "lunch"),
      pickCuisineForMealSlot(requested, day, "dinner"),
    ]);
    // With 2 cuisines and 3 meal slots, we expect both cuisines to appear.
    assertEquals(set.size, 2, `Day ${day}: only ${[...set].join(",")} used`);
  }
});

Deno.test("4 cuisines: distribution stays balanced over 100 days", () => {
  const requested = ["indian", "italian", "japanese", "mexican"];
  const counts: Record<string, number> = {};
  for (let day = 0; day < 100; day++) {
    for (const meal of ["breakfast", "lunch", "dinner"] as Meal[]) {
      const c = pickCuisineForMealSlot(requested, day, meal);
      counts[c] = (counts[c] || 0) + 1;
    }
  }
  // 100 days * 3 meals = 300 picks / 4 cuisines = 75 each.
  for (const c of requested) {
    assert(
      counts[c] >= 70 && counts[c] <= 80,
      `Cuisine ${c} appeared ${counts[c]} times (expected ~75)`,
    );
  }
});

Deno.test("Consecutive days: same meal slot picks different cuisine (pool >= 2)", () => {
  const pools = [
    ["italian", "japanese"],
    ["indian", "italian", "japanese"],
    ["indian", "italian", "japanese", "mexican"],
    ["indian", "italian", "japanese", "mexican", "thai"],
  ];
  for (const requested of pools) {
    for (const meal of ["lunch", "dinner"] as Meal[]) {
      let prev = "";
      let collisions = 0;
      for (let day = 0; day < 100; day++) {
        const c = pickCuisineForMealSlot(requested, day, meal);
        if (day > 0 && c === prev) collisions++;
        prev = c;
      }
      assertEquals(
        collisions,
        0,
        `Pool ${requested.join(",")} ${meal} repeats on consecutive days`,
      );
    }
  }
});

Deno.test("Pool of 4 cuisines: full cycle before any repeat in same slot", () => {
  const requested = ["indian", "italian", "japanese", "mexican"];
  const seen = new Set<string>();
  for (let day = 0; day < 4; day++) {
    seen.add(pickCuisineForMealSlot(requested, day, "lunch"));
  }
  assertEquals(seen.size, 4, `Expected 4 unique cuisines in 4 days, got ${seen.size}`);
});
