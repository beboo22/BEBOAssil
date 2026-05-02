export interface StoryTripActivity {
  id?: string;
  name?: string;
  title?: string;
  location?: string;
  address?: string;
  latitude?: number | string;
  longitude?: number | string;
  media?: string[];
  image?: string;
  [key: string]: any;
}

export interface MediaActivityContext {
  mediaUrl: string;
  activityName: string;
  locationName: string | null;
  dayLabel: string;
  dayIndex: number;
}

const normalizeActivityName = (value: string | undefined | null) =>
  (value || "").trim().toLowerCase();

const normalizeMediaUrl = (value?: string | null) => {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return raw.split("?")[0].split("#")[0].toLowerCase();
  }
};

const dedupeMediaUrls = (urls: string[]) => {
  const map = new Map<string, string>();
  urls.forEach((url) => {
    const key = normalizeMediaUrl(url);
    if (!key || map.has(key)) return;
    map.set(key, url);
  });
  return Array.from(map.values());
};

export const getActivityMediaUrls = (activity: StoryTripActivity, tripData: any): string[] => {
  const map = tripData?.activity_media_map;
  const existingMedia = Array.isArray(activity?.media) ? activity.media.filter(Boolean) : [];
  
  // Also include image field
  if (activity?.image && !existingMedia.includes(activity.image)) {
    existingMedia.unshift(activity.image);
  }

  if (!map || typeof map !== "object") {
    return dedupeMediaUrls(existingMedia);
  }

  const rawName = (activity?.name || activity?.title || "").trim();
  const lowerName = normalizeActivityName(rawName);

  const candidates = [
    rawName,
    lowerName,
    Object.keys(map).find((k) => normalizeActivityName(k) === lowerName),
  ].filter(Boolean) as string[];

  const mappedMedia = candidates.flatMap((key) => {
    const urls = map[key];
    return Array.isArray(urls) ? urls.filter(Boolean) : [];
  });

  return dedupeMediaUrls([...existingMedia, ...mappedMedia]);
};

/**
 * Normalize trip data to always have an itinerary array.
 * Supports both `itinerary` and `days` keys from different generators.
 */
const getItineraryArray = (tripData: any): any[] => {
  if (!tripData) return [];
  if (Array.isArray(tripData.itinerary) && tripData.itinerary.length > 0) return tripData.itinerary;
  if (Array.isArray(tripData.days) && tripData.days.length > 0) return tripData.days;
  return [];
};

export const enrichItineraryWithActivityMedia = (tripData: any) => {
  const itinerary = getItineraryArray(tripData);

  return itinerary.map((day: any) => ({
    ...day,
    activities: Array.isArray(day?.activities)
      ? day.activities.map((activity: StoryTripActivity) => ({
          ...activity,
          name: activity?.name || activity?.title || "",
          location: activity?.location || activity?.address || null,
          media: getActivityMediaUrls(activity, tripData),
        }))
      : [],
  }));
};

export const getMediaActivityContext = (
  tripData: any,
  mediaUrl?: string | null,
  isArabic = false
): MediaActivityContext | null => {
  const normalizedTarget = normalizeMediaUrl(mediaUrl);
  if (!normalizedTarget) return null;

  const itinerary = enrichItineraryWithActivityMedia(tripData);

  for (let dayIndex = 0; dayIndex < itinerary.length; dayIndex += 1) {
    const day = itinerary[dayIndex];
    const dayLabel = day?.date
      ? (typeof day.date === "string" ? day.date : new Date(day.date).toLocaleDateString())
      : `${isArabic ? "اليوم" : "Day"} ${dayIndex + 1}`;

    const activities = Array.isArray(day?.activities) ? day.activities : [];
    for (const activity of activities) {
      const mediaUrls = Array.isArray(activity?.media) ? activity.media : [];
      const matchedUrl = mediaUrls.find((url: string) => normalizeMediaUrl(url) === normalizedTarget);
      if (!matchedUrl) continue;

      return {
        mediaUrl: matchedUrl,
        activityName: activity?.name || activity?.title || (isArabic ? "فعالية" : "Activity"),
        locationName: activity?.location || activity?.address || null,
        dayLabel,
        dayIndex,
      };
    }
  }

  return null;
};
