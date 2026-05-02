// Final-pass scheduler: enforces three hard rules per day:
//   1) Exactly `perDayTarget` items (meals + activities combined).
//   2) Every item time falls inside [wakeTime, sleepTime].
//   3) Meals are placed at logical hours (breakfast morning, lunch noon,
//      dinner evening, snack afternoon) and non-meal activities are
//      distributed evenly across the remaining slots.
//
// Pure client-side normalization — does not fetch new data; assumes the
// audit/resync chain already populated the day with at least the desired
// item count (extras are trimmed, gaps are left to the resync layer).

const MEAL_KEYS = ["breakfast", "lunch", "dinner", "snacks", "snack"] as const;
type MealKey = "breakfast" | "lunch" | "dinner" | "snacks";

const MEAL_TARGET_HOUR: Record<MealKey, number> = {
  breakfast: 8.5,   // 08:30
  lunch: 13,        // 13:00
  dinner: 19.5,     // 19:30
  snacks: 16.5,     // 16:30
};

const MEAL_BAND: Record<MealKey, { min: number; max: number }> = {
  breakfast: { min: 7, max: 10.5 },
  lunch: { min: 12, max: 14.5 },
  dinner: { min: 18.5, max: 21.5 },
  snacks: { min: 15, max: 17.5 },
};

const TITLE_TOKENS: Record<MealKey, RegExp> = {
  breakfast: /(breakfast|brunch|فطور)/i,
  lunch: /(lunch|غداء)/i,
  dinner: /(dinner|عشاء)/i,
  snacks: /(snack|snacks|وجبة\s*خفيفة)/i,
};

const isMatchAnchor = (act: any): boolean =>
  Boolean(act?.isMatchAnchor) ||
  /طلب خاص|✨\s*vs|\bvs\.?\s/i.test(
    String(act?.matchReason || act?.title || act?.name || ""),
  );

const detectMealKey = (act: any): MealKey | null => {
  const cat = String(act?.category || act?.type || "").toLowerCase().trim();
  if (cat === "snack") return "snacks";
  if (["breakfast", "lunch", "dinner", "snacks"].includes(cat)) {
    return cat as MealKey;
  }
  const haystack = `${act?.title || ""} ${act?.name || ""}`;
  for (const k of ["breakfast", "lunch", "dinner", "snacks"] as MealKey[]) {
    if (TITLE_TOKENS[k].test(haystack)) return k;
  }
  return null;
};

const parseHHMM = (raw: string): number | null => {
  const t = String(raw || "").trim();
  // Try 24h "HH:MM"
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10) + parseInt(m24[2], 10) / 60;
    if (h >= 0 && h < 24) return h;
  }
  // Try 12h "H:MM AM/PM"
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const isPM = m12[3].toUpperCase() === "PM";
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    return h + min / 60;
  }
  return null;
};

// ──────────────────────────────────────────────────────────────────────
// Opening-hours awareness
// ──────────────────────────────────────────────────────────────────────
// Parses a free-form hours string ("9 AM – 5 PM", "10:00-22:00",
// "24 hours", "Mon-Fri 9am-5pm") into a single (open, close) window in
// hours. Returns null when no usable window can be inferred (in which
// case the caller treats the venue as "always open" and uses defaults).
const parseOpeningHoursWindow = (raw: unknown): { open: number; close: number } | null => {
  const str = String(raw || "").toLowerCase().trim();
  if (!str) return null;
  if (/(^|\b)(24\s*hours?|24\/7|always\s+open|open\s+24)/i.test(str)) return { open: 0, close: 24 };
  if (/closed|hours\s+unavailable|check\s+opening|unknown/i.test(str)) return null;
  // Match the FIRST time range we find — most venues use a single window.
  // Supports: 9 AM – 5 PM | 9:30 AM - 5:30 PM | 09:00–22:00 | 9-17
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–—~to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const m = str.match(re);
  if (!m) return null;
  const toHour = (h: string, mm: string | undefined, ap: string | undefined): number => {
    let hh = parseInt(h, 10);
    const mins = mm ? parseInt(mm, 10) : 0;
    if (ap) {
      const isPM = ap.toLowerCase() === "pm";
      if (hh === 12) hh = isPM ? 12 : 0;
      else if (isPM) hh += 12;
    }
    return hh + mins / 60;
  };
  const rawOpenHour = parseInt(m[1], 10);
  let open = toHour(m[1], m[2], m[3]);
  let close = toHour(m[4], m[5], m[6]);
  // Restaurant/place feeds often format afternoon ranges as "4 to 9 PM".
  // Without this, "4" is interpreted as 04:00 and lunch gets scheduled for
  // a dinner-only venue. Only apply to clearly afternoon starts (1–6).
  if (!m[3] && m[6]?.toLowerCase() === "pm" && rawOpenHour >= 1 && rawOpenHour <= 6) {
    open += 12;
  }
  // Heuristic: if AM/PM was missing on close but open was given as small (<8) and
  // close is also small, assume close is PM (e.g. "9-5" → 09:00-17:00).
  if (!m[3] && !m[6] && close <= open && close < 12) close += 12;
  if (close <= open) close = Math.min(24, open + 1);
  if (open < 0) open = 0;
  if (close > 24) close = 24;
  return { open, close };
};

const getActivityHoursWindow = (act: any): { open: number; close: number } | null => {
  // Try both naming conventions used across the codebase.
  return (
    parseOpeningHoursWindow(act?.openingHours) ||
    parseOpeningHoursWindow(act?.operating_hours) ||
    parseOpeningHoursWindow(act?.hours) ||
    parseOpeningHoursWindow(act?._raw?.operating_hours) ||
    null
  );
};

// Clamp a desired hour into [open+0.25, close-1.25] so the activity has at
// least ~1h to be experienced before the venue closes.
const clampHourToOpeningWindow = (
  desired: number,
  win: { open: number; close: number } | null,
  fallbackMin: number,
  fallbackMax: number,
): number => {
  if (!win) return Math.max(fallbackMin, Math.min(fallbackMax, desired));
  const safeOpen = Math.max(fallbackMin, win.open + 0.25);
  const safeClose = Math.min(fallbackMax, Math.max(safeOpen + 0.25, win.close - 1));
  if (safeClose <= safeOpen) return Math.max(fallbackMin, Math.min(fallbackMax, desired));
  return Math.max(safeOpen, Math.min(safeClose, desired));
};

const formatHHMM = (hour: number): string => {
  const clamped = Math.max(0, Math.min(23.99, hour));
  const h = Math.floor(clamped);
  const m = Math.round((clamped - h) * 60);
  const mm = m === 60 ? 0 : m;
  const hh = m === 60 ? h + 1 : h;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export interface StrictDayScheduleOptions {
  perDayTarget: number;
  wakeHour: number;       // e.g. 8
  sleepHour: number;      // e.g. 23
  mealPreferences?: {
    breakfast?: boolean;
    lunch?: boolean;
    dinner?: boolean;
    snacks?: boolean;
  } | null;
}

export interface StrictDayScheduleResult {
  days: any[];
  trimmedCount: number;
  rescheduledCount: number;
}

/**
 * Apply strict rules to every day:
 *   - Sort: required meals (per preferences) first, then match anchors,
 *     then non-meal activities in original order.
 *   - Trim total to exactly `perDayTarget` (preserve required meals + anchors).
 *   - Assign times: meals at their target hour, activities spread across
 *     remaining slots between wakeHour and sleepHour without overlapping
 *     meal bands.
 */
export function applyStrictDaySchedule(
  days: any[],
  options: StrictDayScheduleOptions,
): StrictDayScheduleResult {
  const target = Math.max(1, Math.floor(options.perDayTarget) || 0);
  const wake = Math.max(0, Math.min(23, options.wakeHour ?? 8));
  let sleep = Math.max(wake + 1, Math.min(24, options.sleepHour ?? 23));
  if (sleep <= wake) sleep = wake + 1;

  const requestedMeals: MealKey[] = (
    ["breakfast", "lunch", "dinner", "snacks"] as MealKey[]
  ).filter((k) => Boolean(options.mealPreferences?.[k]));

  let trimmedCount = 0;
  let rescheduledCount = 0;

  const newDays = (days || []).map((day) => {
    const acts: any[] = Array.isArray(day?.activities) ? [...day.activities] : [];
    if (acts.length === 0) return day;

    // 1) Bucket into meals (by requested type), anchors, others.
    const mealBuckets = new Map<MealKey, any>();
    const anchors: any[] = [];
    const others: any[] = [];
    const extraMeals: any[] = []; // meals not in user prefs

    for (const a of acts) {
      const mk = detectMealKey(a);
      if (mk && requestedMeals.includes(mk)) {
        if (!mealBuckets.has(mk)) mealBuckets.set(mk, a);
        else extraMeals.push(a); // duplicate of same meal — drop later
      } else if (mk) {
        extraMeals.push(a); // meal of unrequested type
      } else if (isMatchAnchor(a)) {
        anchors.push(a);
      } else {
        others.push(a);
      }
    }

    // 2) Determine final composition within target.
    const mealsKept: Array<{ key: MealKey; act: any }> = requestedMeals
      .map((k) => ({ key: k, act: mealBuckets.get(k) }))
      .filter((x) => x.act); // only meals we actually have

    const slotsLeft = Math.max(0, target - mealsKept.length);
    const anchorsKept = anchors.slice(0, slotsLeft);
    const slotsForOthers = Math.max(0, slotsLeft - anchorsKept.length);
    const othersKept = others.slice(0, slotsForOthers);

    const removed = acts.length - (mealsKept.length + anchorsKept.length + othersKept.length);
    if (removed > 0) trimmedCount += removed;

    // 3) Keep match anchors at their explicit time, then schedule flexible
    //    non-meal items around meals/anchors. Do not push the first activity
    //    late only because meals exist — that caused visible 18:30 starts.
    const anchoredItems = anchorsKept;
    const flexibleNonMeals = othersKept;

    // Compute meal target hours. Meals must stay in their canonical meal band;
    // if a venue's known hours do NOT overlap that band (e.g. lunch venue only
    // opens 16:00–21:00), keep the lunch slot at noon and let the resync layer
    // replace the venue instead of moving lunch to dinner time.
    const clampToWindow = (h: number) => Math.max(wake, Math.min(sleep - 0.5, h));
    const mealSchedule = mealsKept.map(({ key, act }) => {
      const desired = MEAL_TARGET_HOUR[key];
      const band = MEAL_BAND[key];
      const lo = clampToWindow(Math.max(band.min, wake));
      const hi = clampToWindow(Math.min(band.max, sleep - 0.5));
      const baseHour = clampToWindow(Math.max(lo, Math.min(hi, desired)));
      const venueWin = getActivityHoursWindow(act);
      const venueLo = venueWin ? Math.max(lo, venueWin.open + 0.25) : lo;
      const venueHi = venueWin ? Math.min(hi, venueWin.close - 1) : hi;
      const hour = venueHi >= venueLo
        ? Math.max(venueLo, Math.min(venueHi, baseHour))
        : baseHour;
      return { key, act, hour };
    });

    // 4) Distribute flexible activities chronologically across [wake, sleep),
    //    avoiding a small ±0.75h window around meals and fixed anchors AND
    //    keeping every activity inside its own opening-hours window.
    const mealHoursTaken = mealSchedule.map((m) => m.hour);
    const anchorSchedule = anchoredItems.map((act) => {
      const parsed = parseHHMM(act?.time || act?.startTime || "");
      const hour = parsed == null ? null : Math.max(wake, Math.min(sleep - 0.25, parsed));
      return { act, hour };
    });
    const fixedHoursTaken = [...mealHoursTaken, ...anchorSchedule.map((a) => a.hour).filter((h): h is number => h != null)];

    const isNearMeal = (h: number) =>
      fixedHoursTaken.some((mh) => Math.abs(mh - h) < 0.75);

    // Build candidate slots starting AT wake (not wake+1) so the first
    // activity of the day truly begins at the user's wake hour when no
    // breakfast is scheduled. Step 1.5h gives breathing room between items
    // while still letting the day start early (e.g. 08:00 wake → first
    // candidate is 08:00, not 09:00).
    const nonMealHours: number[] = [];
    const candidateHours: number[] = [];
    for (let probe = wake; probe < sleep; probe += 1.5) {
      if (!isNearMeal(probe)) candidateHours.push(probe);
    }
    // Fallback half-hour grid also starts at wake.
    const fallbackGrid = Array.from(
      { length: Math.max(1, Math.floor((sleep - wake) * 2)) },
      (_, idx) => wake + idx * 0.5,
    );
    const flexibleVenueWindows = flexibleNonMeals.map((a) => getActivityHoursWindow(a));
    for (let i = 0; i < flexibleNonMeals.length; i++) {
      const venueWin = flexibleVenueWindows[i];
      const inVenue = (probe: number): boolean => {
        if (!venueWin) return true;
        // Need at least 1h before the venue closes.
        return probe >= Math.max(wake, venueWin.open) && probe <= Math.min(sleep - 0.25, venueWin.close - 1);
      };
      // STRICT: pick the earliest open slot inside venue hours.
      let h = candidateHours.find((probe) =>
        inVenue(probe) && !nonMealHours.some((p) => Math.abs(p - probe) < 1),
      );
      if (h == null) {
        h = fallbackGrid.find(
          (probe) => probe < sleep && inVenue(probe) && !isNearMeal(probe) && !nonMealHours.some((p) => Math.abs(p - probe) < 0.5),
        );
      }
      if (h == null) {
        // Last resort: walk forward from wake in 15-min increments until we
        // find any non-conflicting slot inside the venue window.
        for (let probe = wake; probe < sleep; probe += 0.25) {
          if (inVenue(probe) && !nonMealHours.some((p) => Math.abs(p - probe) < 0.25) && !isNearMeal(probe)) {
            h = probe;
            break;
          }
        }
      }
      if (h == null) {
        // Venue conflicts with wake/sleep window entirely — clamp the desired
        // start to the venue window even if we have to share a slot. This is
        // better than leaving the activity at "wake" (outside hours).
        h = clampHourToOpeningWindow(wake, venueWin, wake, sleep - 0.25);
      }
      h = Math.max(wake, Math.min(sleep - 0.25, h));
      nonMealHours.push(h);
    }
    // Sort flexible-slot assignments chronologically so the i-th flexible
    // activity gets the i-th earliest slot (stable ordering on the page).
    nonMealHours.sort((a, b) => a - b);

    // 5) Apply times back to activity objects.
    const scheduledMeals = mealSchedule.map(({ act, hour }) => {
      const before = act?.time || act?.startTime;
      const t = formatHHMM(hour);
      const end = formatHHMM(Math.min(23.99, hour + 1));
      if (before !== t) rescheduledCount += 1;
      return { ...act, time: t, startTime: t, endTime: end };
    });

    const scheduledAnchors = anchorSchedule.map(({ act, hour }) => {
      // Match anchors keep their explicit time (kickoff is fixed) — do not
      // rewrite it even if outside venue hours; UI shows the user-facing
      // event time as authoritative.
      const t = formatHHMM(hour ?? wake);
      return { ...act, time: t, startTime: t };
    });

    const scheduledOthers = flexibleNonMeals.map((act, i) => {
      const before = act?.time || act?.startTime;
      const t = formatHHMM(nonMealHours[i] ?? wake);
      if (before !== t) rescheduledCount += 1;
      return { ...act, time: t, startTime: t };
    });

    // 6) Final chronological order.
    const merged = [...scheduledMeals, ...scheduledAnchors, ...scheduledOthers].sort(
      (a, b) => (parseHHMM(a.time) ?? 24) - (parseHHMM(b.time) ?? 24),
    );

    return { ...day, activities: merged };
  });

  return { days: newDays, trimmedCount, rescheduledCount };
}

/**
 * Convenience: parse a "HH:MM" wake/sleep string into a numeric hour.
 * Falls back to defaults when parsing fails. Sleep < wake is treated as
 * "next day" only as a clamp — we cap the schedule at 23:59 to avoid
 * placing activities after midnight.
 */
export function parseWakeSleep(
  wakeTime?: string,
  sleepTime?: string,
): { wakeHour: number; sleepHour: number } {
  const wake = parseHHMM(wakeTime || "08:00") ?? 8;
  let sleep = parseHHMM(sleepTime || "23:00") ?? 23;
  if (sleep <= wake) sleep = Math.min(23.5, wake + 8);
  return { wakeHour: wake, sleepHour: sleep };
}
