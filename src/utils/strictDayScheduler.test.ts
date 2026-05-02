import { describe, it, expect } from "vitest";
import { applyStrictDaySchedule, parseWakeSleep } from "./strictDayScheduler";

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

describe("strictDayScheduler — wake/sleep boundaries", () => {
  it("first non-meal activity starts at or after wake time (not 18:30)", () => {
    const days = [
      {
        activities: [
          { title: "Museum Visit", category: "cultural" },
          { title: "Park Walk", category: "nature" },
          { title: "Shopping Mall", category: "shopping" },
        ],
      },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 3,
      wakeHour: 8,
      sleepHour: 23,
      mealPreferences: null,
    });
    const times = out[0].activities.map((a: any) => a.time);
    const firstMin = toMinutes(times[0]);
    expect(firstMin).toBeGreaterThanOrEqual(toMinutes("08:00"));
    expect(firstMin).toBeLessThanOrEqual(toMinutes("11:00"));
    // No activity should default to the legacy 18:30 anchor when wake is 08:00
    // and we have plenty of room earlier in the day.
    expect(times[0]).not.toBe("18:30");
  });

  it("every activity falls strictly inside [wake, sleep)", () => {
    const days = [
      {
        activities: [
          { title: "A", category: "cultural" },
          { title: "B", category: "nature" },
          { title: "C", category: "shopping" },
          { title: "D", category: "entertainment" },
        ],
      },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 4,
      wakeHour: 9,
      sleepHour: 22,
      mealPreferences: null,
    });
    for (const a of out[0].activities) {
      const m = toMinutes(a.time);
      expect(m).toBeGreaterThanOrEqual(toMinutes("09:00"));
      expect(m).toBeLessThan(toMinutes("22:00"));
    }
  });

  it("activities are returned in chronological order", () => {
    const days = [
      {
        activities: [
          { title: "A", category: "cultural" },
          { title: "B", category: "nature" },
          { title: "C", category: "shopping" },
        ],
      },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 3,
      wakeHour: 8,
      sleepHour: 22,
      mealPreferences: null,
    });
    const minutes = out[0].activities.map((a: any) => toMinutes(a.time));
    for (let i = 1; i < minutes.length; i++) {
      expect(minutes[i]).toBeGreaterThanOrEqual(minutes[i - 1]);
    }
  });

  it("meals are placed in their natural bands; non-meals fill earlier slots", () => {
    const days = [
      {
        activities: [
          { title: "Breakfast at X", category: "breakfast" },
          { title: "Lunch at Y", category: "lunch" },
          { title: "Museum", category: "cultural" },
          { title: "Park", category: "nature" },
        ],
      },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 4,
      wakeHour: 8,
      sleepHour: 22,
      mealPreferences: { breakfast: true, lunch: true, dinner: false, snacks: false },
    });
    const byCat: Record<string, string> = {};
    for (const a of out[0].activities) byCat[a.category] = a.time;
    expect(toMinutes(byCat.breakfast)).toBeGreaterThanOrEqual(toMinutes("07:00"));
    expect(toMinutes(byCat.breakfast)).toBeLessThanOrEqual(toMinutes("10:30"));
    expect(toMinutes(byCat.lunch)).toBeGreaterThanOrEqual(toMinutes("12:00"));
    expect(toMinutes(byCat.lunch)).toBeLessThanOrEqual(toMinutes("14:30"));
  });

  it("respects late wake / early sleep window", () => {
    const days = [
      { activities: [{ title: "A", category: "cultural" }, { title: "B", category: "nature" }] },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 2,
      wakeHour: 11,
      sleepHour: 18,
      mealPreferences: null,
    });
    for (const a of out[0].activities) {
      const m = toMinutes(a.time);
      expect(m).toBeGreaterThanOrEqual(toMinutes("11:00"));
      expect(m).toBeLessThan(toMinutes("18:00"));
    }
  });

  it("trims to exactly perDayTarget", () => {
    const days = [
      {
        activities: Array.from({ length: 8 }, (_, i) => ({
          title: `Activity ${i}`,
          category: "cultural",
        })),
      },
    ];
    const { days: out } = applyStrictDaySchedule(days, {
      perDayTarget: 3,
      wakeHour: 8,
      sleepHour: 22,
      mealPreferences: null,
    });
    expect(out[0].activities).toHaveLength(3);
  });
});

describe("parseWakeSleep", () => {
  it("parses HH:MM format", () => {
    expect(parseWakeSleep("07:30", "22:00")).toEqual({ wakeHour: 7.5, sleepHour: 22 });
  });
  it("falls back to defaults for bad input", () => {
    expect(parseWakeSleep("garbage", "also bad")).toEqual({ wakeHour: 8, sleepHour: 23 });
  });
  it("ensures sleep > wake", () => {
    const { wakeHour, sleepHour } = parseWakeSleep("20:00", "08:00");
    expect(sleepHour).toBeGreaterThan(wakeHour);
  });
});
