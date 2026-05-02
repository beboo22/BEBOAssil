// Strict client-side audit: verifies the final itinerary obeys user preferences
// (meals included, per-day item count, chronological ordering) and patches any
// missing meals as visible fallback cards so nothing is silently dropped.

const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;
type MealKey = typeof MEAL_KEYS[number];

const MEAL_LABELS_AR: Record<MealKey, string> = {
  breakfast: "فطور",
  lunch: "غداء",
  dinner: "عشاء",
  snacks: "وجبة خفيفة",
};

const MEAL_LABELS_EN: Record<MealKey, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snack",
};

const MEAL_HOURS: Record<MealKey, number> = {
  breakfast: 8,
  lunch: 13,
  dinner: 19,
  snacks: 16,
};

const MEAL_TOKENS: Record<MealKey, RegExp> = {
  breakfast: /(breakfast|brunch|فطور)/i,
  lunch: /(lunch|غداء)/i,
  dinner: /(dinner|عشاء)/i,
  snacks: /(snack|snacks|وجبة\s*خفيفة)/i,
};

export interface MealPreferencesShape {
  breakfast?: boolean;
  lunch?: boolean;
  dinner?: boolean;
  snacks?: boolean;
}

export interface AuditIssue {
  dayIndex: number;
  type: "missing_meal" | "under_count" | "out_of_order";
  detail: string;
}

export interface AuditResult {
  days: any[];
  issues: AuditIssue[];
  patchedMeals: number;
  reorderedDays: number;
}

const parseMinutes = (act: any): number => {
  const t = String(act?.startTime || act?.time || "00:00").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 24 * 60;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

const fmtTime = (hour: number) =>
  `${String(hour).padStart(2, "0")}:00`;

const detectMealKey = (act: any): MealKey | null => {
  const cat = String(act?.category || act?.type || "").toLowerCase().trim();
  if ((MEAL_KEYS as readonly string[]).includes(cat)) return cat as MealKey;
  const haystack = `${act?.title || ""} ${act?.name || ""}`;
  for (const key of MEAL_KEYS) {
    if (MEAL_TOKENS[key].test(haystack)) return key;
  }
  return null;
};

const buildFallbackMeal = (
  meal: MealKey,
  dayNumber: number,
  cityName: string,
  isArabic: boolean,
) => {
  const labels = isArabic ? MEAL_LABELS_AR : MEAL_LABELS_EN;
  const hour = MEAL_HOURS[meal];
  const title = isArabic
    ? `${labels[meal]} في ${cityName}`
    : `${labels[meal]} in ${cityName}`;
  return {
    id: `d${dayNumber}-audit-${meal}-${Date.now()}`,
    title,
    name: title,
    category: meal,
    type: meal,
    time: fmtTime(hour),
    startTime: fmtTime(hour),
    endTime: fmtTime(hour + 1),
    description: isArabic
      ? "اقتراح وجبة من تفضيلاتك — اختر مطعمًا قريبًا يناسبك."
      : "Suggested meal from your preferences — pick a nearby restaurant you like.",
    isUserRequestedFallback: true,
    isAuditPatched: true,
  };
};

const reorderChronologically = (acts: any[]): { sorted: any[]; changed: boolean } => {
  const indexed = acts.map((a, i) => ({ a, i, m: parseMinutes(a) }));
  const sorted = [...indexed].sort((x, y) => x.m - y.m || x.i - y.i);
  const changed = sorted.some((s, idx) => s.i !== indexed[idx].i);
  return { sorted: sorted.map((s) => s.a), changed };
};

export function auditItineraryPreferences(
  days: any[],
  options: {
    mealPreferences?: MealPreferencesShape | null;
    perDayTarget?: number;
    destination?: string;
    language?: string;
  },
): AuditResult {
  const issues: AuditIssue[] = [];
  let patchedMeals = 0;
  let reorderedDays = 0;

  const isArabic = String(options.language || "").toLowerCase().startsWith("ar");
  const cityName = String(options.destination || "")
    .split(",")[0]
    .trim() || (isArabic ? "المدينة" : "the city");

  const requestedMeals = MEAL_KEYS.filter((k) => Boolean(options.mealPreferences?.[k]));
  const target = Math.max(0, Math.floor(Number(options.perDayTarget) || 0));

  const safeDays = Array.isArray(days) ? days : [];
  const newDays = safeDays.map((day, dayIndex) => {
    const acts: any[] = Array.isArray(day?.activities) ? [...day.activities] : [];

    // 1) Meal coverage check + patch
    const presentMeals = new Set<MealKey>();
    for (const a of acts) {
      const k = detectMealKey(a);
      if (k) presentMeals.add(k);
    }
    for (const meal of requestedMeals) {
      if (!presentMeals.has(meal)) {
        const fallback = buildFallbackMeal(meal, dayIndex + 1, cityName, isArabic);
        acts.push(fallback);
        patchedMeals += 1;
        issues.push({
          dayIndex,
          type: "missing_meal",
          detail: `Patched missing ${meal} on day ${dayIndex + 1}`,
        });
      }
    }

    // 2) Count check (informational; we never trim here — enforcement does that)
    if (target > 0 && acts.length < target) {
      issues.push({
        dayIndex,
        type: "under_count",
        detail: `Day ${dayIndex + 1} has ${acts.length}/${target} items`,
      });
    }

    // 3) Chronological order
    const { sorted, changed } = reorderChronologically(acts);
    if (changed) {
      reorderedDays += 1;
      issues.push({
        dayIndex,
        type: "out_of_order",
        detail: `Day ${dayIndex + 1} re-sorted by start time`,
      });
    }

    return { ...day, activities: sorted };
  });

  if (issues.length > 0) {
    console.info("[itinerary-audit]", {
      patchedMeals,
      reorderedDays,
      issues: issues.slice(0, 12),
    });
  }

  return { days: newDays, issues, patchedMeals, reorderedDays };
}
