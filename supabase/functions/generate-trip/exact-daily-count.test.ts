import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const isMeal = (category: string) => ["breakfast", "lunch", "dinner", "snack"].includes(category);
const keys = (a: any) => [String(a.place_id || ""), `${a.name || a.title}|${a.address || ""}`.toLowerCase()].filter(Boolean);
const basketballLike = (value: string) => /basketball|arena|court|sports|كرة\s*السلة|كره\s*السله|ملعب|صالة/i.test(value);

function isVerifiedSpecificPlace(activity: any, destination: string) {
  const name = String(activity?.name || activity?.title || "").trim();
  const address = String(activity?.address || activity?.location || "").trim();
  const lat = Number(activity?.latitude);
  const lng = Number(activity?.longitude);
  const hours = String(activity?.openingHours || activity?.openState || activity?.hours || "").trim();
  return Boolean(
    name &&
    address &&
    address.toLowerCase() !== String(destination).toLowerCase() &&
    Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) &&
    hours &&
    !activity?.isSynthesizedFallback,
  );
}

function preserveExactDailyCountWithMeals(activities: any[], targetCount: number, requestedMeals: string[] = [], backupCandidates: any[] = []) {
  const finalActivities: any[] = [];
  const seen = new Set<string>();
  const all = [...activities, ...backupCandidates].filter(Boolean);
  const add = (candidate: any) => {
    if (!candidate) return false;
    const ids = keys(candidate);
    if (ids.some((k) => seen.has(k))) return false;
    ids.forEach((k) => seen.add(k));
    finalActivities.push(candidate);
    return true;
  };
  all.filter((a) => a.isMatchAnchor || a.isSpecialRequest || a.specialRequestQuery).forEach(add);
  for (const meal of requestedMeals) if (finalActivities.length < targetCount) add(all.find((a) => a.category === meal));
  for (const a of all.filter((a) => !isMeal(a.category))) if (finalActivities.length < targetCount) add(a);
  for (const a of all) if (finalActivities.length < targetCount) add(a);
  const locked = finalActivities.filter((a) => a.isMatchAnchor || a.isSpecialRequest || a.specialRequestQuery);
  const others = finalActivities.filter((a) => !locked.includes(a));
  return [...locked, ...others.slice(0, Math.max(0, targetCount - locked.length))]
    .sort((a, b) => String(a.time || "12:00").localeCompare(String(b.time || "12:00")));
}

Deno.test("exact daily target: keeps exactly 5 items and preserves basketball special request", () => {
  const day = [
    { name: "Breakfast", category: "breakfast", time: "08:00" },
    { name: "Basketball arena", category: "sports", time: "10:00", isSpecialRequest: true, specialRequestQuery: "كرة السلة" },
    { name: "Museum", category: "museum", time: "11:00" },
    { name: "Lunch", category: "lunch", time: "13:00" },
    { name: "Park", category: "nature", time: "15:00" },
    { name: "Extra generic", category: "attraction", time: "17:00" },
  ];
  const out = preserveExactDailyCountWithMeals(day, 5, ["breakfast", "lunch"], day);
  assertEquals(out.length, 5);
  assert(out.some((a) => /basketball|كرة السلة/i.test(`${a.name} ${a.specialRequestQuery}`)));
});

Deno.test("exact daily target: fills shortage to exactly 5 from backup candidates", () => {
  const base = [
    { name: "Basketball court", category: "sports", time: "10:00", isSpecialRequest: true, specialRequestQuery: "basketball" },
    { name: "Lunch", category: "lunch", time: "13:00" },
  ];
  const backups = ["A", "B", "C", "D"].map((name, i) => ({ name, category: "attraction", time: `${14 + i}:00` }));
  const out = preserveExactDailyCountWithMeals(base, 5, ["lunch"], backups);
  assertEquals(out.length, 5);
  assert(out.some((a) => a.isSpecialRequest));
});

Deno.test("exact daily target: every generated day keeps exactly 5 items", () => {
  const days = Array.from({ length: 4 }, (_, day) => {
    const base = [
      { name: `Basketball venue ${day + 1}`, category: "sports", time: "10:00", isSpecialRequest: true, specialRequestQuery: "كرة السلة" },
      { name: `Lunch ${day + 1}`, category: "lunch", time: "13:00" },
    ];
    const backups = ["Museum", "Park", "Mall", "Gallery", "Arena"].map((name, i) => ({
      name: `${name} ${day + 1}`,
      category: i === 4 ? "sports" : "attraction",
      time: `${14 + i}:00`,
    }));
    return preserveExactDailyCountWithMeals(base, 5, ["lunch"], backups);
  });
  days.forEach((activities, index) => {
    assertEquals(activities.length, 5, `Day ${index + 1} should have exactly 5 items`);
    assert(activities.some((a) => basketballLike(`${a.name} ${a.specialRequestQuery || ""}`)), `Day ${index + 1} lost basketball request`);
  });
});

Deno.test("quality gate: AI-added activities must be specific verified places, not generic placeholders", () => {
  const destination = "Foxborough";
  const verified = {
    name: "Putnam Club at Gillette Stadium",
    address: "1 Patriot Pl, Foxborough, MA 02035",
    latitude: 42.0909,
    longitude: -71.2643,
    openingHours: "10 AM–5 PM",
  };
  const generic = {
    name: "Basketball activity",
    address: "Foxborough",
    latitude: 0,
    longitude: 0,
    openingHours: "",
    isSynthesizedFallback: true,
  };
  assert(isVerifiedSpecificPlace(verified, destination));
  assert(!isVerifiedSpecificPlace(generic, destination));
});