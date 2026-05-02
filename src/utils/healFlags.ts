// Heals legacy itineraries by re-resolving missing/wrong team flags from
// team names using the centralized TEAM_FLAGS registry. Returns { itinerary, changed }.
import { getTeamFlag, isMissingFlag } from "@/lib/teamFlags";

export const healItineraryFlags = (
  itinerary: any,
): { itinerary: any; changed: boolean } => {
  if (!itinerary || !Array.isArray(itinerary.days)) {
    return { itinerary, changed: false };
  }

  let changed = false;
  const days = itinerary.days.map((day: any) => {
    if (!day || !Array.isArray(day.activities)) return day;
    const activities = day.activities.map((act: any) => {
      const t = act?.matchTeams;
      if (!t || !t.a || !t.b) return act;
      const next = { ...t };
      if (isMissingFlag(t.flagA)) {
        const f = getTeamFlag(t.a);
        if (f && f !== t.flagA) {
          next.flagA = f;
          changed = true;
        }
      }
      if (isMissingFlag(t.flagB)) {
        const f = getTeamFlag(t.b);
        if (f && f !== t.flagB) {
          next.flagB = f;
          changed = true;
        }
      }
      return next === t ? act : { ...act, matchTeams: next };
    });
    return { ...day, activities };
  });

  return changed ? { itinerary: { ...itinerary, days }, changed: true } : { itinerary, changed: false };
};
