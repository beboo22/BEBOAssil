// Strict client-side validator: trims each day to exactly the requested
// per-day target (meals + attractions). Meals and match anchors are preserved
// first; remaining slots are filled with non-meal attractions in time order.
// Anything beyond the target is removed — no extra activities are kept.

const MEAL_CATEGORIES = new Set([
  "breakfast", "lunch", "dinner", "snack", "snacks", "meal", "food",
  "فطور", "غداء", "عشاء", "وجبة", "وجبات", "طعام",
]);

const isMealActivity = (act: any): boolean => {
  const cat = String(act?.category || act?.type || "").toLowerCase().trim();
  if (MEAL_CATEGORIES.has(cat)) return true;
  // Some generators tag with title prefixes like "Lunch in ..."
  const title = String(act?.title || act?.name || "").toLowerCase();
  return /\b(breakfast|lunch|dinner|brunch|snack)\b/.test(title)
      || /(فطور|غداء|عشاء|وجبة)/.test(title);
};

const isMatchAnchor = (act: any): boolean =>
  Boolean(act?.isMatchAnchor) || /طلب خاص|✨\s*vs|\bvs\.?\s/i.test(String(act?.matchReason || act?.title || act?.name || ""));

const isSpecialRequestActivity = (act: any): boolean =>
  Boolean(act?.isSpecialRequest || act?.specialRequestQuery) || /طلب خاص|special request|✨/i.test(String(act?.matchReason || ""));

const parseStartMinutes = (act: any): number => {
  const t = String(act?.startTime || act?.time || "00:00").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 60;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export interface EnforceResult {
  days: any[];
  trimmedCount: number;
  perDayTarget: number;
}

export const getRequestedMealCount = (mealPreferences?: {
  breakfast?: boolean;
  lunch?: boolean;
  dinner?: boolean;
  snacks?: boolean;
} | null): number => {
  if (!mealPreferences) return 0;
  return [mealPreferences.breakfast, mealPreferences.lunch, mealPreferences.dinner, mealPreferences.snacks]
    .filter(Boolean)
    .length;
};

const buildActivitySignature = (act: any): string => {
  const title = String(act?.title || act?.name || "").toLowerCase().trim();
  const address = String(act?.address || act?.location || "").toLowerCase().trim();
  const placeId = String(act?.place_id || act?.placeId || "").toLowerCase().trim();
  return placeId || [title, address].filter(Boolean).join("|") || title;
};

const dedupeActivities = (activities: any[]): any[] => {
  const seen = new Set<string>();
  return activities.filter((activity) => {
    const signature = buildActivitySignature(activity) || String(activity?.id || "");
    if (!signature) return true;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

/**
 * Enforce an exact per-day item target on an itinerary.
 * @param days        Array of itinerary days (each with `activities`)
 * @param perDayTarget Total items allowed per day (meals + attractions)
 */
export function enforceDailyItemLimit(
  days: any[],
  perDayTarget: number,
  mealPreferences?: {
    breakfast?: boolean;
    lunch?: boolean;
    dinner?: boolean;
    snacks?: boolean;
  } | null,
): EnforceResult {
  const target = Math.max(1, Math.floor(Number(perDayTarget) || 0));
  const expectedMeals = Math.min(target, Math.max(0, getRequestedMealCount(mealPreferences)));
  let trimmed = 0;

  const newDays = (days || []).map((day) => {
    const acts: any[] = dedupeActivities(Array.isArray(day?.activities) ? [...day.activities] : []);
    if (acts.length <= target) return { ...day, activities: acts.sort((a, b) => parseStartMinutes(a) - parseStartMinutes(b)) };

    // Sort by start time so morning items take precedence in ties.
    acts.sort((a, b) => parseStartMinutes(a) - parseStartMinutes(b));

    // Priority buckets: match anchors → special requests → meals → attractions (time-ordered).
    const anchors = dedupeActivities(acts.filter(isMatchAnchor));
    const specials = dedupeActivities(acts.filter((a) => !isMatchAnchor(a) && isSpecialRequestActivity(a)));
    const meals = dedupeActivities(acts.filter((a) => !isMatchAnchor(a) && !isSpecialRequestActivity(a) && isMealActivity(a)));
    const others = dedupeActivities(acts.filter((a) => !isMatchAnchor(a) && !isSpecialRequestActivity(a) && !isMealActivity(a)));

    const kept: any[] = [];
    const pushUnique = (a: any) => {
      if (kept.length >= target) return;
      if (!kept.includes(a)) kept.push(a);
    };

    meals.slice(0, expectedMeals).forEach(pushUnique);
    anchors.forEach(pushUnique);
    specials.forEach(pushUnique);
    others.forEach(pushUnique);
    meals.slice(expectedMeals).forEach(pushUnique);

    // Re-sort kept items chronologically for clean display.
    kept.sort((a, b) => parseStartMinutes(a) - parseStartMinutes(b));

    trimmed += acts.length - kept.length;
    return { ...day, activities: kept };
  });

  return { days: newDays, trimmedCount: trimmed, perDayTarget: target };
}
