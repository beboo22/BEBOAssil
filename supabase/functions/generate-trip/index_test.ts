import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

const FN_URL = `${SUPABASE_URL}/functions/v1/generate-trip`;

// Multi-city, 3 activities/day, lunch only, indian+italian cuisine,
// interests: relaxation, art, shopping, nightlife.
const tripRequest = {
  destination: "Mediterranean",
  startingCity: "Jeddah, Saudi Arabia",
  startDate: "2026-06-01",
  endDate: "2026-06-04",
  duration: 4,
  travelers: 2,
  budget: 5000,
  currency: "USD",
  language: "en",
  tripType: "luxury",
  interests: ["relaxation", "art", "shopping", "nightlife"],
  cuisineTypes: ["indian", "italian"],
  meals: { breakfast: false, lunch: true, dinner: false, snack: false },
  wantBreakfast: false,
  wantLunch: true,
  wantDinner: false,
  wantSnacks: false,
  maxActivitiesPerDay: 3,
  activitiesPerDay: 3,
  multiCity: true,
  cities: [
    { name: "Santorini", days: 2, transportFromPrev: "flight" },
    { name: "Amalfi Coast", days: 2, transportFromPrev: "flight" },
  ],
  specialRequests: "luxury 4-star hotels, scenic spots, museums",
};

Deno.test("generate-trip returns 200 with up to 3 items per day", async () => {
  const resp = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(tripRequest),
  });

  const text = await resp.text();
  assertEquals(resp.status, 200, `Non-2xx (${resp.status}): ${text.slice(0, 500)}`);

  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 300)}`);
  }

  // Find the itinerary regardless of envelope shape
  const itinerary =
    json?.itinerary ?? json?.data?.itinerary ?? json?.data ?? json;
  const days: any[] = itinerary?.days ?? itinerary?.itinerary ?? [];
  assert(Array.isArray(days) && days.length > 0, `No days in response: ${text.slice(0, 300)}`);

  for (const [i, day] of days.entries()) {
    const items = day.activities ?? day.items ?? [];
    assert(
      items.length >= 1 && items.length <= 3,
      `Day ${i + 1} has ${items.length} items, expected 1-3 (cap=3). Names: ${items.map((a: any) => a?.name).join(" | ")}`,
    );
  }

  // Soft check: lunch present at least once across the trip
  const allItems = days.flatMap((d: any) => d.activities ?? d.items ?? []);
  const hasLunch = allItems.some((a: any) =>
    /lunch|غداء|restaurant|مطعم/i.test(`${a?.category ?? ""} ${a?.name ?? ""} ${a?.type ?? ""}`),
  );
  assert(hasLunch, "Expected at least one lunch/restaurant item in the itinerary");
});
