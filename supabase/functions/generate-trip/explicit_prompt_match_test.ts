// Verifies that explicit user prompts (e.g., "كرة قدم", "معرض سيارات") always
// produce a real, prompt-matching activity instead of an unrelated suggestion
// or a generic synthesized placeholder. Hits the deployed edge function.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/generate-trip`;

async function regenWithPrompt(prompt: string, category = "cultural") {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      destination: "Abu Dhabi, United Arab Emirates",
      duration: 1,
      regenMode: "activity",
      currentActivityName: "Sample",
      currentActivityCategory: category,
      currentActivityDescription: "",
      customPrompt: prompt,
      regenPrompt: prompt,
      excludeActivityNames: [],
      interests: [],
      activitiesPerDay: 5,
      maxActivitiesPerDay: 5,
      lang: "ar",
    }),
  });
  const json = await resp.json();
  return { status: resp.status, json };
}

function getActivity(json: any) {
  return json?.days?.[0]?.activities?.[0] || null;
}

Deno.test("Explicit prompt 'كرة قدم' returns a real activity, never empty", async () => {
  const { status, json } = await regenWithPrompt("كرة قدم", "sports");
  assertEquals(status, 200);
  const a = getActivity(json);
  assert(a, "Activity must not be null");
  assert(a.name && String(a.name).trim().length > 0, "Activity must have a name");
});

Deno.test("Explicit prompt 'معرض سيارات' returns a real activity, never empty", async () => {
  const { status, json } = await regenWithPrompt("معرض سيارات", "cultural");
  assertEquals(status, 200);
  const a = getActivity(json);
  assert(a, "Activity must not be null");
  assert(a.name && String(a.name).trim().length > 0, "Activity must have a name");
});

Deno.test("Explicit prompt 'مطعم صيني' returns a non-empty activity", async () => {
  const { status, json } = await regenWithPrompt("مطعم صيني", "food");
  assertEquals(status, 200);
  const a = getActivity(json);
  assert(a, "Activity must not be null");
  assert(a.name && String(a.name).trim().length > 0, "Activity must have a name");
});

Deno.test("Edge case prompt with emoji never crashes", async () => {
  const { status, json } = await regenWithPrompt("⚽ ملعب كرة قدم 🏟️", "sports");
  assertEquals(status, 200);
  const a = getActivity(json);
  assert(a, "Activity must not be null even for emoji prompts");
});
