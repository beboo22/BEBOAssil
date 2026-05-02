// Tests that the "add new activity" failure path NEVER crashes and ALWAYS
// returns a valid, usable activity — regardless of how the prompt is phrased
// or whether downstream services (AI / SerpAPI) fail.
//
// These tests mirror the final-safety-net synthesizer added to
// supabase/functions/generate-trip/index.ts. Keep them in sync if that
// synthesizer changes shape.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Activity = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  category: string;
  type?: string;
  time: string;
  startTime?: string;
  duration?: string;
  address?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  cost?: number;
  rating?: number;
  openingHours?: string;
  matchReason?: string;
  isSynthesizedFallback?: boolean;
};

// Mirror of the final synthesizer in index.ts (regenMode === 'activity').
function synthesizeFallbackActivity(input: {
  explicitUserPrompt?: string;
  currentActivityName?: string;
  categoryHint?: string;
  destination: string;
  startTime?: string;
  lang?: string;
}): Activity {
  const isAr = String(input.lang || "").toLowerCase().startsWith("ar");
  const rawSeed = (
    (input.explicitUserPrompt || "").trim() ||
    (input.currentActivityName || "").trim() ||
    (input.categoryHint || "").trim() ||
    (isAr ? "نشاط مقترح" : "Suggested activity")
  );
  const safeName = rawSeed.length > 80 ? rawSeed.slice(0, 80) : rawSeed;
  const startTime = (typeof input.startTime === "string" && input.startTime.trim()) || "10:00";
  return {
    id: "regen-1",
    name: safeName,
    title: safeName,
    description: input.explicitUserPrompt
      ? (isAr ? `اقتراح مبني على طلبك: ${input.explicitUserPrompt}` : `Suggested based on your request: ${input.explicitUserPrompt}`)
      : (isAr ? `نشاط مقترح في ${input.destination}` : `A suggested activity in ${input.destination}`),
    category: input.categoryHint || "attraction",
    type: input.categoryHint || "attraction",
    time: startTime,
    startTime,
    duration: "2 hours",
    address: input.destination,
    location: input.destination,
    latitude: 0,
    longitude: 0,
    cost: 0,
    rating: 4.3,
    openingHours: "",
    matchReason: input.explicitUserPrompt
      ? `Synthesized from explicit prompt: ${input.explicitUserPrompt}`
      : `Synthesized fallback for category ${input.categoryHint}`,
    isSynthesizedFallback: true,
  };
}

// Mirror of the resilient handler: tries AI/SerpAPI then falls back.
async function safeRegenActivity(
  input: Parameters<typeof synthesizeFallbackActivity>[0],
  upstream: { ai?: () => Promise<Activity | null>; search?: () => Promise<Activity | null> },
): Promise<{ days: { dayNumber: number; activities: Activity[] }[] }> {
  const tryStep = async (fn?: () => Promise<Activity | null>) => {
    if (!fn) return null;
    try { return await fn(); } catch { return null; }
  };
  const aiResult = await tryStep(upstream.ai);
  if (aiResult) return { days: [{ dayNumber: 1, activities: [aiResult] }] };
  const searchResult = await tryStep(upstream.search);
  if (searchResult) return { days: [{ dayNumber: 1, activities: [searchResult] }] };
  // FINAL SAFETY NET — must never throw, must never return empty.
  const synth = synthesizeFallbackActivity(input);
  return { days: [{ dayNumber: 1, activities: [synth] }] };
}

function assertValidActivity(a: Activity, ctx: string) {
  assert(a, `${ctx}: activity is null`);
  assert(a.id, `${ctx}: missing id`);
  assert(a.name && a.name.length > 0, `${ctx}: missing name`);
  assert(a.category, `${ctx}: missing category`);
  assert(a.time, `${ctx}: missing time`);
  assert(typeof a.cost === "number", `${ctx}: cost not a number`);
}

// ─────────────────────────── tests ───────────────────────────

Deno.test("add-activity: AI failure + search failure → still returns 1 valid synthesized activity", async () => {
  const out = await safeRegenActivity(
    { explicitUserPrompt: "كرة قدم", categoryHint: "attraction", destination: "Dubai", lang: "ar" },
    { ai: async () => { throw new Error("AI timed out"); }, search: async () => { throw new Error("SerpAPI 429"); } },
  );
  assertEquals(out.days.length, 1);
  assertEquals(out.days[0].activities.length, 1);
  const a = out.days[0].activities[0];
  assertValidActivity(a, "AI+search fail");
  assertEquals(a.isSynthesizedFallback, true);
  assert(a.name.includes("كرة قدم") || a.description?.includes("كرة قدم"), "must reflect user prompt");
});

Deno.test("add-activity: AI throws ReferenceError (the original crash) → never propagates", async () => {
  const out = await safeRegenActivity(
    { explicitUserPrompt: "مطعم صيني", categoryHint: "restaurant", destination: "Riyadh", lang: "ar" },
    { ai: async () => { throw new ReferenceError("promptDrivenCategory is not defined"); }, search: async () => null },
  );
  assertValidActivity(out.days[0].activities[0], "ReferenceError path");
  assertEquals(out.days[0].activities[0].isSynthesizedFallback, true);
});

Deno.test("add-activity: empty prompt + no category → still returns a valid generic activity", async () => {
  const out = await safeRegenActivity(
    { destination: "Paris", lang: "en" },
    { ai: async () => null, search: async () => null },
  );
  const a = out.days[0].activities[0];
  assertValidActivity(a, "empty prompt");
  assertEquals(a.isSynthesizedFallback, true);
  assertEquals(a.category, "attraction");
});

Deno.test("add-activity: bizarre prompts never crash and always produce an activity", async () => {
  const weirdPrompts = [
    "🚀🚀🚀",
    "..........",
    "select * from users",
    "<script>alert(1)</script>",
    "كرة قدم في الفضاء مع التماسيح",
    "a".repeat(500),
    "null",
    "undefined",
    "{}",
    "    ",
  ];
  for (const p of weirdPrompts) {
    const out = await safeRegenActivity(
      { explicitUserPrompt: p, categoryHint: "attraction", destination: "Tokyo", lang: "en" },
      { ai: async () => { throw new Error("boom"); }, search: async () => { throw new Error("boom"); } },
    );
    const a = out.days[0].activities[0];
    assertValidActivity(a, `weird prompt: ${JSON.stringify(p)}`);
    assert(a.name.length <= 80, "name must be truncated to 80 chars");
  }
});

Deno.test("add-activity: AI succeeds → returns AI result, NOT the synthesized fallback", async () => {
  const aiActivity: Activity = {
    id: "ai-1",
    name: "Real AI Place",
    category: "attraction",
    time: "11:00",
    cost: 0,
  };
  const out = await safeRegenActivity(
    { explicitUserPrompt: "anything", categoryHint: "attraction", destination: "Dubai" },
    { ai: async () => aiActivity, search: async () => null },
  );
  assertEquals(out.days[0].activities[0].name, "Real AI Place");
  assertEquals(out.days[0].activities[0].isSynthesizedFallback, undefined);
});

Deno.test("add-activity: AI fails but search succeeds → returns search result", async () => {
  const sr: Activity = { id: "s-1", name: "Search Place", category: "restaurant", time: "13:00", cost: 0 };
  const out = await safeRegenActivity(
    { explicitUserPrompt: "italian", categoryHint: "restaurant", destination: "Rome" },
    { ai: async () => { throw new Error("nope"); }, search: async () => sr },
  );
  assertEquals(out.days[0].activities[0].name, "Search Place");
});

Deno.test("add-activity: 50 random failure scenarios all return valid activities — zero crashes", async () => {
  const cities = ["Dubai", "Riyadh", "Jeddah", "Cairo", "Istanbul", "Paris", "Tokyo", "London", "NY", "ريكيافيك"];
  const cats = ["attraction", "restaurant", "cafe", "park", "museum", undefined as any];
  const langs = ["ar", "en", "fr", undefined as any];
  let crashes = 0;
  let valid = 0;
  for (let i = 0; i < 50; i++) {
    const city = cities[i % cities.length];
    const cat = cats[i % cats.length];
    const lang = langs[i % langs.length];
    try {
      const out = await safeRegenActivity(
        { explicitUserPrompt: `random ${i}`, categoryHint: cat, destination: city, lang },
        { ai: async () => { if (i % 2) throw new Error("ai-fail"); return null; },
          search: async () => { if (i % 3) throw new Error("search-fail"); return null; } },
      );
      assertValidActivity(out.days[0].activities[0], `iter ${i}`);
      valid++;
    } catch { crashes++; }
  }
  assertEquals(crashes, 0, `expected 0 crashes, got ${crashes}`);
  assertEquals(valid, 50);
});

Deno.test("add-activity: synthesized fallback honors language (Arabic vs English)", () => {
  const ar = synthesizeFallbackActivity({ explicitUserPrompt: "كرة قدم", destination: "Dubai", lang: "ar" });
  assert(ar.description?.includes("اقتراح"), "Arabic description expected");
  const en = synthesizeFallbackActivity({ explicitUserPrompt: "football", destination: "Dubai", lang: "en" });
  assert(en.description?.includes("Suggested"), "English description expected");
});

Deno.test("add-activity: synthesized fallback uses provided start time when present", () => {
  const a = synthesizeFallbackActivity({ destination: "Dubai", startTime: "15:30" });
  assertEquals(a.time, "15:30");
  assertEquals(a.startTime, "15:30");
});
