export type PlaceResolutionInput = {
  title?: string;
  name?: string;
  address?: string;
  location?: string;
  googleMapsLink?: string;
  googleMapsUrl?: string;
  googleMapsCoordsUrl?: string;
  place_id?: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  type?: string;
  category?: string;
};

const COORDINATE_RE = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/;
const GENERIC_TITLE_RE = /^(breakfast|lunch|dinner|brunch|snack|meal|food|restaurant|cafe|activity|visit|explore|tour|frühstück|mittagessen|abendessen|mahlzeit|essen|repas|déjeuner|dîner|desayuno|almuerzo|cena|comida|وجبة|فطور|غداء|عشاء|طعام|مطعم|مقهى|نشاط|زيارة|استكشاف|جولة)\b.*\b(in|at|bei|en|à|في)\b\s+\S+/i;
const PRECISION_HINT_RE = /\b(st|street|ave|avenue|road|rd|boulevard|blvd|way|drive|dr|lane|ln|suite|ste|level|floor|plaza|mall|stadium|arena|center|centre|museum|park|zoo|theater|theatre|restaurant|cafe|kitchen|bar|hotel|airport|terminal|station|estadio|wy|av\.?|calle|col\.?|jal\.?|nj|ny|ca|tx|usa|uk|mexico|germany|france|spain)\b/i;

const clean = (value?: string | null): string =>
  String(value || "")
    .replace(/\+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

const normalize = (value?: string | null): string => clean(value).toLowerCase();

const hasPreciseSignal = (value?: string | null): boolean => {
  const normalized = clean(value);
  if (!normalized) return false;
  return /,/.test(normalized) || /\d/.test(normalized) || PRECISION_HINT_RE.test(normalized) || normalized.split(/\s+/).length >= 4;
};

const getRawName = (place: PlaceResolutionInput): string => clean(place.title || place.name);

const extractNamedMapsQuery = (url?: string): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const query = parsed.searchParams.get("query") || parsed.searchParams.get("q") || "";
    const decoded = clean(decodeURIComponent(query));
    return decoded && !COORDINATE_RE.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
};

const dedupeRepeatedTokens = (value: string): string => {
  // Collapse "Seattle Seattle" → "Seattle", "East Rutherford East Rutherford" → "East Rutherford"
  if (!value) return value;
  let result = value;
  // Repeat until stable for cases like "X Y X Y"
  for (let i = 0; i < 3; i++) {
    const next = result.replace(/\b([\p{L}][\p{L}\s.'-]{1,40}?)\s+\1\b/giu, "$1").replace(/\s{2,}/g, " ").trim();
    if (next === result) break;
    result = next;
  }
  return result;
};

const parseMapsQuery = (query?: string) => {
  const cleaned = dedupeRepeatedTokens(clean(query));
  if (!cleaned) return { query: "", venueName: undefined as string | undefined, address: undefined as string | undefined };
  const parts = cleaned.split(",").map((part) => dedupeRepeatedTokens(clean(part))).filter(Boolean);
  return {
    query: cleaned,
    venueName: parts[0],
    address: parts.length > 1 ? parts.slice(1).join(", ") : undefined,
  };
};

export const isGenericActivityTitle = (place: PlaceResolutionInput): boolean => {
  const title = getRawName(place);
  const address = clean(place.address || place.location);
  if (!title) return true;
  if (GENERIC_TITLE_RE.test(title)) return true;
  if (normalize(title) === normalize(address) && !hasPreciseSignal(address)) return true;
  return false;
};

const isSpecificQuery = (query: string | undefined, place: PlaceResolutionInput): boolean => {
  const cleaned = clean(query);
  if (!cleaned || COORDINATE_RE.test(cleaned)) return false;
  if (!isGenericActivityTitle(place)) return true;
  return hasPreciseSignal(cleaned);
};

export const getPrecisePlaceData = (place: PlaceResolutionInput) => {
  const rawName = getRawName(place);
  const directUrl = place.googleMapsUrl || place.googleMapsLink;
  const directQuery = extractNamedMapsQuery(directUrl);
  const parsedDirect = parseMapsQuery(directQuery);
  const genericTitle = isGenericActivityTitle(place);

  const preciseAddress = [
    clean(place.address),
    clean(place.location),
    clean(parsedDirect.address),
    clean(parsedDirect.query),
  ].map(dedupeRepeatedTokens).find((candidate) => {
    if (!candidate || COORDINATE_RE.test(candidate)) return false;
    if (genericTitle && !hasPreciseSignal(candidate)) return false;
    if (normalize(candidate) === normalize(rawName) && genericTitle) return false;
    return true;
  });

  const venueName = [
    parsedDirect.venueName && isSpecificQuery(parsedDirect.query, place) ? dedupeRepeatedTokens(clean(parsedDirect.venueName)) : undefined,
    !genericTitle ? dedupeRepeatedTokens(rawName) : undefined,
  ].find(Boolean);

  const preferredQuery = [
    isSpecificQuery(parsedDirect.query, place) ? parsedDirect.query : undefined,
    (place.place_id || place.placeId) && (venueName || rawName || preciseAddress)
      ? [venueName || rawName, preciseAddress].filter(Boolean).join(", ")
      : undefined,
    !genericTitle && rawName && preciseAddress && normalize(rawName) !== normalize(preciseAddress)
      ? `${rawName}, ${preciseAddress}`
      : undefined,
    venueName,
    preciseAddress,
  ].map((q) => (q ? dedupeRepeatedTokens(q) : q)).find((candidate) => isSpecificQuery(candidate, place));

  const hasCoords = Number.isFinite(place.latitude) && Number.isFinite(place.longitude);

  // HIGHEST TRUST: if the backend already produced a pinned URL (cid, query_place_id, /maps/place/),
  // use it as-is. Re-building the query here only adds a noisy "name, address, city" search bar
  // and can drift away from the canonical place card.
  const isPinnedBackendUrl =
    typeof directUrl === "string" &&
    /^https?:\/\//i.test(directUrl) &&
    (
      /[?&]cid=\d+/i.test(directUrl) ||
      /query_place_id=/i.test(directUrl) ||
      /\/maps\/place\//i.test(directUrl) ||
      /place_id:/i.test(directUrl)
    );

  let mapUrl = "#";
  if (isPinnedBackendUrl) {
    mapUrl = directUrl as string;
  } else if (place.place_id || place.placeId) {
    // Canonical 1:1 place URL — opens the EXACT Google Maps place card, never a list view.
    const pid = String(place.place_id || place.placeId || "").trim();
    mapUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(pid)}`;
  } else if (preferredQuery && hasCoords) {
    // Combine name with coords for accurate pinning
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(preferredQuery)}&center=${place.latitude},${place.longitude}`;
  } else if (typeof directUrl === "string" && /^https?:\/\//i.test(directUrl) && (!directQuery || isSpecificQuery(directQuery, place))) {
    mapUrl = directUrl;
  } else if (preferredQuery) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(preferredQuery)}`;
  } else if (typeof place.googleMapsCoordsUrl === "string" && /^https?:\/\//i.test(place.googleMapsCoordsUrl) && !genericTitle) {
    // Only use raw coords URL when we don't have a generic title (avoid linking "Dinner in X" to bare coords)
    mapUrl = place.googleMapsCoordsUrl;
  } else if (hasCoords && !genericTitle) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  }

  return {
    venueName,
    addressLabel: preciseAddress || venueName || undefined,
    mapQuery: preferredQuery,
    mapUrl,
    isPrecise: Boolean((place.place_id || place.placeId) || preciseAddress || directQuery || (hasCoords && !genericTitle)),
  };
};