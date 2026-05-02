export type ActivityLike = {
  title?: string;
  name?: string;
  type?: string;
  category?: string;
  description?: string;
  address?: string;
  location?: string;
  imageUrl?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  googleMapsLink?: string;
  /** Coordinate-based fallback URL (lat,lng). Internal-only — used when name/place_id lookups fail. */
  googleMapsCoordsUrl?: string;
  /** Stable Google place_id — guarantees the link opens the same venue across all languages. */
  place_id?: string;
  placeId?: string;
};

// Multiple curated images per category — picked deterministically per activity so cards look distinct.
const CATEGORY_FALLBACK_IMAGES: Record<string, string[]> = {
  food: [
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1592861956120-e524fc739696?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  breakfast: [
    "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  lunch: [
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  dinner: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1579684947550-22e945225d9a?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  snacks: ["https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&q=80&w=1200&h=800"],
  cafe: [
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  attraction: [
    "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  cultural: [
    "https://images.unsplash.com/photo-1524492514790-831f5b7fb4d1?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1555661530-68c8e98db4e6?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  museum: [
    "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1565060169187-5284745bf722?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  shopping: [
    "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1481437156560-3205f6a55735?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  nature: [
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  beach: [
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  entertainment: [
    "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&q=80&w=1200&h=800",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&q=80&w=1200&h=800",
  ],
  hotel: ["https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1200&h=800"],
  transport: ["https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&q=80&w=1200&h=800"],
};

const GENERIC_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&q=80&w=1200&h=800",
  "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=1200&h=800",
  "https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&q=80&w=1200&h=800",
];

const hashString = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const normalizeWebsiteUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isCoordinateOnlyMapsUrl = (url?: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // A url with query_place_id is NOT coordinate-only — it's a stable place link.
    if (parsed.searchParams.get("query_place_id")) return false;
    const query = parsed.searchParams.get("query") || parsed.searchParams.get("q") || "";
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(decodeURIComponent(query).trim());
  } catch {
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(String(url).trim());
  }
};

export const getActivityMapLink = (activity: ActivityLike, destination = ""): string => {
  const placeId = activity.place_id || activity.placeId;
  const placeName = String(activity.title || activity.name || "").trim();
  const address = String(activity.address || activity.location || destination || "").trim();

  // 1) Stable place_id link — opens the same venue card in every language.
  if (placeId && placeName) {
    const query = address ? `${placeName}, ${address}` : placeName;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
  }

  const explicit = activity.googleMapsUrl || activity.googleMapsLink;
  const namedQuery = `${placeName} ${address}`.trim();

  // 2) Reuse explicit pre-built URL when it isn't a coordinate-only link.
  if (explicit && (!isCoordinateOnlyMapsUrl(explicit) || !namedQuery.replace(/\s+/g, ""))) return explicit;

  // 3) Build a name-based search URL.
  if (namedQuery.replace(/\s+/g, "")) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(namedQuery)}`;
  }

  // 4) Internal coordinate fallback (never displayed as text to the user).
  if (activity.googleMapsCoordsUrl) return activity.googleMapsCoordsUrl;
  if (Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination || "location")}`;
};

const resolveCategory = (activity: ActivityLike): string =>
  String(activity.type || activity.category || "attraction").toLowerCase();

export const getFallbackActivityImage = (activity: ActivityLike, _destination = ""): string => {
  const category = resolveCategory(activity);
  const pool = CATEGORY_FALLBACK_IMAGES[category] || GENERIC_FALLBACK_IMAGES;
  const seed = String(activity.title || activity.name || activity.address || category);
  return pool[hashString(seed) % pool.length];
};

export const getActivityImage = (activity: ActivityLike, destination = ""): string => {
  if (activity.imageUrl && activity.imageUrl !== "/placeholder.svg") return activity.imageUrl;
  return getFallbackActivityImage(activity, destination);
};
