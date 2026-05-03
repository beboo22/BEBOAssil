// Using built-in Deno.serve (no import needed)
    import {
      buildCacheIdentifiers,
      canonicalJson,
      cryptoShuffle,
      resolveWithCache,
      type Filters,
      type PoolRotationResult,
      type CacheLookupResult,
    } from "./filterResultsCache.ts";
    
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Real-time progress streaming ─────────────────────────────────────────
// We broadcast progress checkpoints to a Supabase Realtime channel keyed by
// the per-request `progressToken`. The frontend subscribes to the same
// channel BEFORE invoking the function, so the loading bar advances in
// lockstep with actual backend work — never ahead, never stuck.
let __progressToken: string | null = null;
const __progressBroadcastUrl = (() => {
  const url = Deno.env.get("SUPABASE_URL");
  return url ? `${url}/realtime/v1/api/broadcast` : null;
})();
const __progressApiKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

function setProgressToken(token: string | null | undefined) {
  __progressToken = (typeof token === "string" && token.length > 0) ? token : null;
}

// Fire-and-forget. Never await — we never want progress emission to slow the
// actual generation work.
function emitProgress(step: string, progress: number, detail?: string) {
  try {
    if (!__progressToken || !__progressBroadcastUrl || !__progressApiKey) return;
    const payload = {
      messages: [{
        topic: `trip-progress:${__progressToken}`,
        event: "progress",
        payload: {
          step,
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          detail: detail || null,
          ts: Date.now(),
        },
        private: false,
      }],
    };
    fetch(__progressBroadcastUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": __progressApiKey,
        "Authorization": `Bearer ${__progressApiKey}`,
      },
      body: JSON.stringify(payload),
    }).catch(() => { /* best-effort */ });
  } catch { /* noop */ }
}

// Defensive deep-clone helper. CRITICAL: must be available everywhere.
// Use `var` so it hoists across the entire module and survives any scoping quirk.
// Also bind to globalThis so even cross-scope references resolve.
var safeCloneJson: <T = any>(value: T) => T = function <T = any>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return value as T;
  }
};
try { (globalThis as any).safeCloneJson = safeCloneJson; } catch { /* noop */ }

function getUserIdFromAuthHeader(authHeader: string | null): string | null {
  try {
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function extractAndRepairJson(raw: string): any {
  if (!raw) return null;
  let cleaned = raw
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) return null;
  cleaned = cleaned.substring(jsonStart);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, "").replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
  try { return JSON.parse(cleaned); } catch {}
  let braces = 0, brackets = 0, inString = false, escape = false, lastValidIdx = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
    if (braces === 0 && brackets === 0) lastValidIdx = i;
    if (braces < 0 || brackets < 0) break;
  }
  if (lastValidIdx !== -1) {
    try { return JSON.parse(cleaned.substring(0, lastValidIdx + 1)); } catch {}
  }
  const repaired = cleaned + ']'.repeat(Math.max(0, brackets)) + '}'.repeat(Math.max(0, braces));
  try { return JSON.parse(repaired); } catch { return null; }
}

// ──────────────────────────────────────────────────────────────────────
// Helpers: name normalization + fuzzy match between activity ↔ SerpAPI place.
// Used to guarantee that the rating / hours / address we attach actually
// belong to the SAME venue we asked about (no cross-contamination).
// ──────────────────────────────────────────────────────────────────────
function normalizePlaceName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|a|an|le|la|les|el|los|las|de|du|of|and|cafe|restaurant|museum|tour|visit)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function _tokenSet(s: string): Set<string> {
  return new Set(normalizePlaceName(s).split(" ").filter((t) => t.length >= 2));
}
function nameSimilarity(a: string, b: string): number {
  const ta = _tokenSet(a);
  const tb = _tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
function _haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function pickBestSerpMatch(places: any[], activity: any): { place: any; score: number } | null {
  if (!Array.isArray(places) || places.length === 0) return null;
  const wantName = activity.name || activity.title || "";
  const haveCoords = Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude);
  const wantPlaceId = activity.placeId || activity.place_id;
  let best: { place: any; score: number } | null = null;
  for (const p of places.slice(0, 8)) {
    if (!p || (!p.title && !p.name)) continue;
    let score = 0;
    if (wantPlaceId && p.place_id && p.place_id === wantPlaceId) score += 1.5;
    const sim = nameSimilarity(wantName, p.title || p.name || "");
    score += sim;
    if (haveCoords && p.gps_coordinates?.latitude != null && p.gps_coordinates?.longitude != null) {
      const km = _haversineKm(activity.latitude, activity.longitude, p.gps_coordinates.latitude, p.gps_coordinates.longitude);
      if (km < 0.3) score += 0.6;
      else if (km < 1.5) score += 0.35;
      else if (km < 5) score += 0.1;
      else if (km > 40) score -= 0.5;
    }
    if (typeof p.rating === "number" && p.rating > 0 && (p.reviews || 0) >= 5) score += 0.05;
    if (!best || score > best.score) best = { place: p, score };
  }
  // Lowered threshold: when name similarity alone is ≥ 0.25 we still accept the top
  // candidate so we can pull image/hours/place_id. Without coords most AI-named
  // activities scored 0.3–0.5 and were being rejected, leaving cards blank.
  if (!best || best.score < 0.22) return null;
  return best;
}

// =============================================================
// Opening Hours: robust extraction & normalization
// =============================================================
// Goals:
//  - Accept strings, arrays, or objects from SerpAPI / Serper / Google.
//  - Recognize day aliases (Today, Tomorrow, Mon, Tue, Mon-Fri, Mon–Sun,
//    Sunday–Thursday, Arabic الأحد..السبت, اليوم, الجمعة..., etc.).
//  - Recognize "Open 24 hours", "24/7", "Always open", "مفتوح 24 ساعة".
//  - Strip noise prefixes ("Hours:", "Today:", "Open ·", weekday labels).
//  - Output a clean, consistent "9:00 AM – 10:00 PM" style string.

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const DAY_ALIASES: Record<string, string> = {
  sun: "sunday", sunday: "sunday", "su": "sunday", "الأحد": "sunday", "الاحد": "sunday",
  mon: "monday", monday: "monday", "mo": "monday", "الإثنين": "monday", "الاثنين": "monday", "الإثنين ": "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday", "tu": "tuesday", "الثلاثاء": "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday", "we": "wednesday", "الأربعاء": "wednesday", "الاربعاء": "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday", "th": "thursday", "الخميس": "thursday",
  fri: "friday", friday: "friday", "fr": "friday", "الجمعة": "friday",
  sat: "saturday", saturday: "saturday", "sa": "saturday", "السبت": "saturday",
};

function normalizeDayKey(raw: string): string | null {
  const k = raw.toLowerCase().trim().replace(/\.$/, "");
  if (DAY_KEYS.includes(k)) return k;
  if (DAY_ALIASES[k]) return DAY_ALIASES[k];
  return null;
}

// Expand "Mon-Fri: 9-5" / "Sun–Thu 10am–10pm" / "Mon to Sat ..." into per-day map.
function expandDayRange(rangeText: string, hoursText: string, out: Record<string, string>) {
  const m = rangeText.match(/^([a-z\u0600-\u06ff]+)\s*[-–—to]+\s*([a-z\u0600-\u06ff]+)$/i);
  if (!m) {
    const single = normalizeDayKey(rangeText);
    if (single) out[single] = hoursText;
    return;
  }
  const a = normalizeDayKey(m[1]);
  const b = normalizeDayKey(m[2]);
  if (!a || !b) return;
  let i = DAY_KEYS.indexOf(a);
  const j = DAY_KEYS.indexOf(b);
  // wrap-around (e.g. Fri–Mon)
  for (let n = 0; n < 7; n++) {
    out[DAY_KEYS[i]] = hoursText;
    if (i === j) break;
    i = (i + 1) % 7;
  }
}

// Parse a free-form text block into a per-day map. Supports lines like:
//   "Monday: 9 AM–10 PM"
//   "Mon-Fri 9am-5pm; Sat-Sun 10am-4pm"
//   "Today: Open · Closes 10 PM"
function parseHoursTextBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  // Split on common separators while keeping per-day tokens.
  const parts = text.split(/[;\n\r]+|(?<=\d)\s*,\s*(?=[A-Za-z\u0600-\u06ff])/g);
  for (const part of parts) {
    const seg = part.trim();
    if (!seg) continue;
    const m = seg.match(/^([A-Za-z\u0600-\u06ff][A-Za-z\u0600-\u06ff\s.\-–—to]*?)\s*[:\-–—]\s*(.+)$/);
    if (m) {
      expandDayRange(m[1].trim(), m[2].trim(), out);
    }
  }
  return out;
}

// Clean a single time-window string for display.
function normalizeHoursString(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim();
  // Strip common prefixes/labels.
  s = s.replace(/^\s*(hours?|opening\s*hours?|business\s*hours?|today|اليوم|ساعات\s*العمل|مفتوح)\s*[:：\-–—]?\s*/i, "");
  s = s.replace(/^\s*(open|closed)\s*[·•・]\s*/i, "");
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return "";

  // 24h variants.
  if (/^(open\s*)?24\s*(\/|\\)?\s*7$/i.test(s) ||
      /open\s*24\s*hours?/i.test(s) ||
      /always\s*open/i.test(s) ||
      /مفتوح\s*24\s*ساعة/.test(s) ||
      /على\s*مدار\s*الساعة/.test(s)) {
    return "Open 24 hours";
  }

  if (/^closed$/i.test(s) || /^مغلق$/i.test(s)) return "Closed";

  // Normalize various dashes between a time range to en-dash.
  s = s.replace(/\s*(?:to|–|—|-|−|~|الى|إلى)\s*/gi, " – ");

  // Normalize am/pm spacing & casing for display.
  s = s.replace(/(\d)\s*([ap])\.?\s*m\.?/gi, (_m, d, p) => `${d} ${p.toUpperCase()}M`);

  // Collapse repeated spaces.
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

function pickDayFromMap(map: Record<string, string>, targetDay: string): string {
  if (map[targetDay]) return map[targetDay];
  // Today's value preferred, then any non-closed day.
  for (const k of DAY_KEYS) {
    const v = map[k];
    if (v && !/closed|مغلق/i.test(v)) return v;
  }
  for (const v of Object.values(map)) if (v) return v;
  return "";
}

function todayDayKey(): string {
  return DAY_KEYS[new Date().getDay()];
}

function dayKeyForDate(targetDate?: string): string {
  if (!targetDate) return todayDayKey();
  const parsed = new Date(`${String(targetDate).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? todayDayKey() : DAY_KEYS[parsed.getUTCDay()];
}

function formatOperatingHoursToString(hours: any): string {
  return formatOperatingHoursForDate(hours, undefined);
}

function formatOperatingHoursForDate(hours: any, targetDate?: string): string {
  if (hours == null) return "";
  const targetDay = dayKeyForDate(targetDate);

  // Strings: may be a clean range, may include weekday labels/ranges.
  if (typeof hours === "string") {
    const text = hours.trim();
    if (!text) return "";
    // Detect "Today" / "اليوم" prefixes — strip and use as-is.
    const todayMatch = text.match(/^(today|اليوم)\s*[:\-–—]\s*(.+)$/i);
    if (todayMatch) return normalizeHoursString(todayMatch[2]);
    // Detect "Tomorrow"
    const tomorrowMatch = text.match(/^(tomorrow|غداً|غدا)\s*[:\-–—]\s*(.+)$/i);
    if (tomorrowMatch) return normalizeHoursString(tomorrowMatch[2]);
    // If string contains weekday tokens, parse into per-day map.
    if (/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت)/i.test(text)) {
      const map = parseHoursTextBlock(text);
      const picked = pickDayFromMap(map, targetDay);
      if (picked) return normalizeHoursString(picked);
    }
    return normalizeHoursString(text);
  }

  if (Array.isArray(hours)) {
    const merged: Record<string, string> = {};
    for (const entry of hours) {
      if (typeof entry === "string") {
        const map = parseHoursTextBlock(entry);
        Object.assign(merged, map);
      } else if (entry && typeof entry === "object") {
        for (const [k, v] of Object.entries(entry)) {
          if (typeof v !== "string") continue;
          const dk = normalizeDayKey(k);
          if (dk) merged[dk] = v;
          else Object.assign(merged, parseHoursTextBlock(`${k}: ${v}`));
        }
      }
    }
    const picked = pickDayFromMap(merged, targetDay);
    return picked ? normalizeHoursString(picked) : "";
  }

  if (typeof hours === "object") {
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(hours)) {
      if (typeof v !== "string") continue;
      const dk = normalizeDayKey(k);
      if (dk) map[dk] = v;
      else Object.assign(map, parseHoursTextBlock(`${k}: ${v}`));
    }
    const picked = pickDayFromMap(map, targetDay);
    return picked ? normalizeHoursString(picked) : "";
  }

  return "";
}

// Targeted fallback: pull rich place_results (hours, photos, rating, posts) by place_id.
// Uses the documented `type=place` form so SerpAPI returns the full place_results payload
// rather than a list of local_results.
async function fetchSerpPlaceDetails(placeId: string, apiKey: string): Promise<any | null> {
  try {
    const cached = await __readSharedSerpCache(`place_id:${placeId}`, "place_details", null);
    if (Array.isArray(cached) && cached[0]) {
      console.log(`[SerpAPI place_details cache HIT] ${placeId}`);
      return cached[0]?.place_results || cached[0];
    }

    const url = `https://serpapi.com/search.json?engine=google_maps&type=place&place_id=${encodeURIComponent(placeId)}&hl=en&api_key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
    if (!resp.ok) return null;
    const data = await resp.json();
    const details = data?.place_results || null;
    if (details) __writeSharedSerpCache(`place_id:${placeId}`, "place_details", null, [details]).catch(() => {});
    return details;
  } catch {
    return null;
  }
}

// Extract "From the owner" posts (media, CTA, links) from a SerpAPI place_results payload.
function extractOwnerPosts(place: any): any[] {
  const raw = Array.isArray(place?.posts) ? place.posts
    : Array.isArray(place?.from_the_owner) ? place.from_the_owner
    : Array.isArray(place?.owner_posts) ? place.owner_posts
    : [];
  return raw.slice(0, 5).map((p: any) => ({
    title: p?.title || p?.heading || undefined,
    description: p?.description || p?.snippet || undefined,
    media: p?.media || p?.image || p?.imageUrl || undefined,
    cta: p?.cta || p?.action || undefined,
    link: p?.link || p?.url || undefined,
    postLink: p?.post_link || p?.postLink || undefined,
    date: p?.date || undefined,
    duration: p?.duration || undefined,
  })).filter((p: any) => p.title || p.description || p.media || p.link);
}

// Verify Google Maps place match against expected name & coordinates.
// Returns confidence: "high" (place_id match or strong name+coords), "medium", or "low".
function verifyPlaceConfidence(place: any, activity: any): "high" | "medium" | "low" {
  if (!place) return "low";
  const wantPlaceId = activity?.placeId || activity?.place_id;
  if (wantPlaceId && place.place_id && place.place_id === wantPlaceId) return "high";
  const sim = nameSimilarity(activity?.name || "", place?.title || place?.name || "");
  const haveCoords = Number.isFinite(activity?.latitude) && Number.isFinite(activity?.longitude);
  const placeHasCoords = place?.gps_coordinates?.latitude != null && place?.gps_coordinates?.longitude != null;
  let coordsKm = Infinity;
  if (haveCoords && placeHasCoords) {
    coordsKm = _haversineKm(activity.latitude, activity.longitude, place.gps_coordinates.latitude, place.gps_coordinates.longitude);
  }
  if (sim >= 0.55 && coordsKm <= 1.5) return "high";
  if (sim >= 0.55 || (sim >= 0.35 && coordsKm <= 5)) return "medium";
  if (sim >= 0.25) return "low";
  return "low";
}

// Debug: log when a venue is missing critical fields after enrichment.
function logMissingFields(activity: any, source: string) {
  const missing: string[] = [];
  if (!activity?.imageUrl || /placeholder|unsplash/i.test(String(activity.imageUrl))) missing.push("image");
  if (!activity?.openingHours || !hasValidOpeningHours(activity.openingHours)) missing.push("hours");
  if (!(typeof activity?.rating === "number" && activity.rating > 0)) missing.push("rating");
  if (!(Number.isFinite(activity?.latitude) && Number.isFinite(activity?.longitude))) missing.push("coords");
  if (missing.length) {
    console.log(`[enrich-missing] "${activity?.name || "?"}" via ${source}: missing=${missing.join(",")}`);
  }
}

/**
 * Upgrade Google-served photo URLs (lh3/lh4/lh5/geougc) to a higher resolution
 * by rewriting the size suffix (=w160-h120, =s100, =h400-no, etc.) to a
 * larger width. This dramatically improves card image quality without any
 * extra API calls.
 */
function upgradeImageQuality(url: string): string {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  // Google user-content / Maps photo CDN
  if (/(googleusercontent\.com|ggpht\.com|gstatic\.com)/i.test(trimmed)) {
    // Strip any existing size suffix after the last "="
    const cleaned = trimmed.replace(/=[whs]\d+(-[whs]\d+)?(-[a-z0-9]+)*$/i, "");
    return `${cleaned}=w1280-h720-no`;
  }
  // SerpAPI thumbnails (serpapi.com/.../thumb...) — upgrade size param
  if (/serpapi\.com.*thumbnail/i.test(trimmed)) {
    return trimmed.replace(/[?&]size=\d+/i, "").concat(trimmed.includes("?") ? "&size=1280" : "?size=1280");
  }
  return trimmed;
}

function extractPlaceImageUrl(place: any): string | undefined {
  const direct = [
    place?.thumbnail,
    place?.thumbnailUrl,
    place?.image,
    place?.imageUrl,
    place?.photo,
    place?.photoUrl,
    place?.serpapi_thumbnail,
  ].find((value) => typeof value === "string" && value.trim());
  if (direct) return upgradeImageQuality(String(direct).trim());

  if (Array.isArray(place?.photos)) {
    for (const photo of place.photos) {
      if (typeof photo === "string" && photo.trim()) return upgradeImageQuality(photo.trim());
      const nested = [
        photo?.image,
        photo?.src,
        photo?.thumbnail,
        photo?.url,
        photo?.photo_url,
      ].find((value) => typeof value === "string" && value.trim());
      if (nested) return upgradeImageQuality(String(nested).trim());
    }
  }

  return undefined;
}

/**
 * صمام أمان للتحقق من أن النص المستخرج يمثل ساعات عمل حقيقية.
 * يمنع ظهور جمل مثل "ساعات العمل غير متوفرة" في واجهة المستخدم.
 */
function hasValidOpeningHours(value: unknown): boolean {
  const hours = String(value || "").trim();
  if (!hours) return false;

  // قائمة بالأنماط غير الصالحة التي يجب رفضها[cite: 6, 7]
  const invalidPatterns = [
    /تحقق\s*من\s*ساعات\s*العمل/i,
    /check\s*opening\s*hours/i,
    /ساعات\s*العمل\s*غير\s*متوفرة/i,
    /unknown/i,
    /n\/a/i,
    /غير\s*متوفر/i,
    /غير\s*معروف/i
  ];

  // إذا طابق النص أي نمط من القائمة، نعتبره غير صالح[cite: 6, 7]
  return !invalidPatterns.some((pattern) => pattern.test(hours));
}

/**
 * الدالة الرئيسية لاستخراج وتنسيق ساعات العمل من مصادر بيانات متنوعة.
 */
function extractPlaceOpeningHours(place: any, targetDate?: string): string | undefined {
  if (!place || typeof place !== "object") return undefined;

  // قائمة الحقول المرشحة التي قد تحتوي على توقيت العمل
  const candidates = [
    place?.operating_hours,
    place?.openingHours,
    place?.opening_hours,
    place?.currentOpeningHours?.weekdayDescriptions,
    place?.currentOpeningHours,
    place?.regularOpeningHours?.weekdayDescriptions,
    place?.regularOpeningHours,
    place?.hours,
    place?.workingHours,
    place?.business_hours,
    place?.businessHours,
    place?.weekdayText,
    place?.weekday_text,
    // حقول SerpAPI المباشرة
    place?.open_state,
    place?.openState,
    // حقول التفاصيل العميقة
    place?.place_details?.hours,
    place?.place_details?.opening_hours,
    place?.place_results?.operating_hours,
    place?.place_results?.hours,
    place?.place_results?.open_state,
    // مخرجات أدوات الكشط (Scrapers)
    place?.openingHoursText,
    place?.openHours,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    // محاولة التنسيق بناءً على تاريخ محدد أو بشكل عام[cite: 7]
    const formatted = targetDate
      ? formatOperatingHoursForDate(candidate, targetDate)
      : formatOperatingHoursToString(candidate);

    // التحقق من صلاحية التوقيت المنسق قبل إرجاعه[cite: 7]
    if (formatted && hasValidOpeningHours(formatted)) return formatted;
  }

  // محاولة أخيرة: البحث عن أنماط الوقت داخل النصوص الوصفية إذا كانت الحقول السابقة فارغة[cite: 7]
  const stringFields = [
    place?.snippet,
    place?.description,
    place?.subtitle,
    place?.status,
    place?.openClose,
  ];

  for (const field of stringFields) {
    if (typeof field !== "string") continue;

    // البحث عن نمط الوقت (مثل 09:00 ص - 05:00 م)[cite: 7]
    const m = field.match(
      /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|ص|م)?)\s*[-–—~]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|ص|م)?)/
    );
    if (m) return `${m[1]} – ${m[2]}`;

    // التحقق من الأماكن المفتوحة 24 ساعة[cite: 7]
    if (/24\s*\/?\s*7|open\s*24|24\s*hours|مفتوح\s*24/i.test(field)) {
      return "Open 24 hours";
    }
  }

  return undefined;
}

function extractSourceOpeningHours(place: any, targetDate?: string): string {
  return extractPlaceOpeningHours(place, targetDate) || "";
}

function extractSourceOperatingHours(place: any): any | undefined {
  const raw = place?._raw && typeof place._raw === "object" ? place._raw : place;
  const value = raw?.operating_hours ?? raw?.opening_hours;
  return value && typeof value === "object" ? value : undefined;
}

async function enrichWithSerpAPI(itinerary: any, destination: string): Promise<boolean> {
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  if (!SERPAPI_KEY) return false;
  let enrichedCount = 0;
  try {
    const daysToEnrich = (itinerary.days || []).slice(0, 14);
    const promises: Promise<void>[] = [];
    for (const day of daysToEnrich) {
      for (const activity of (day.activities || []).slice(0, 12)) {
        if (activity.enriched) continue;
        // Skip already-anchored matches: their venue/time are user-defined.
        if (activity.isMatchAnchor || activity.matchTeams) continue;
        promises.push((async () => {
          try {
            const q = `${activity.name} ${destination}`;
            const anchor = getCitySearchAnchor(destination);
            // 1) Try shared cache first (15-25 variants per query, 30-day TTL).
            let candidates: any[] = [];
            const sharedHit = await __readSharedSerpCache(q, destination, anchor);
            if (sharedHit && sharedHit.length) {
              candidates = __rotateVariantsExcluding(sharedHit);
              logSerpUsage({ query: q, city: destination, cacheHit: true, resultsCount: candidates.length, context: "enrichWithSerpAPI:shared_cache" });
            } else {
              const url = `https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(q)}&hl=en&api_key=${SERPAPI_KEY}`;
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 6000);
              const resp = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
              if (!resp.ok) { logSerpUsage({ query: q, city: destination, cacheHit: false, resultsCount: 0, context: "enrichWithSerpAPI:http_error" }); return; }
              const data = await resp.json();
              candidates = Array.isArray(data?.local_results) ? data.local_results : (data?.place_results ? [data.place_results] : []);
              logSerpUsage({ query: q, city: destination, cacheHit: false, resultsCount: candidates.length, context: "enrichWithSerpAPI" });
              // 2) Persist results to shared cache for other users/requests.
              if (candidates.length) {
                __writeSharedSerpCache(q, destination, anchor, candidates).catch(() => {});
              }
            }

            // Pick best candidate, then verify confidence (place_id + name + coords).
            let matched = pickBestSerpMatch(candidates, activity);
            let confidence: "high" | "medium" | "low" = matched ? verifyPlaceConfidence(matched.place, activity) : "low";
            // Top-match fallback ONLY when confidence is at least medium.
            if (!matched && candidates.length > 0) {
              const top = candidates[0];
              const topConf = verifyPlaceConfidence(top, activity);
              if (topConf === "high" || topConf === "medium") {
                matched = { place: top, score: nameSimilarity(activity.name || "", top?.title || top?.name || "") };
                confidence = topConf;
                console.log(`[SerpAPI top-match accept] "${activity.name}" → "${top?.title}" (confidence=${topConf})`);
              } else {
                console.log(`[SerpAPI match-reject] "${activity.name}" → top "${top?.title}" confidence=low`);
                return;
              }
            }
            if (!matched) return;
            let place = matched.place;
            // Track this place_id so subsequent rotations within this run skip it.
            const __pid = __placeIdentity(place);
            if (__pid) __usedPlaceIdsThisRun.add(__pid);
            const isLowConfidence = confidence === "low";

            // Pull rich place_details when image / hours / rating / posts are missing.
            const missingRating = !(typeof place.rating === "number" && place.rating > 0);
            const missingHours = !(place.operating_hours && typeof place.operating_hours === "object") && !place.hours;
            const missingImage = !extractPlaceImageUrl(place);
            const missingPosts = !Array.isArray(place.posts) && !Array.isArray(place.from_the_owner);
            if (place.place_id && (missingRating || missingHours || missingImage || missingPosts)) {
              const details = await fetchSerpPlaceDetails(place.place_id, SERPAPI_KEY);
              logSerpUsage({ query: `place_id:${place.place_id}`, city: destination, cacheHit: false, resultsCount: details ? 1 : 0, context: "enrichWithSerpAPI:place_details_fallback" });
              if (details) place = { ...place, ...details };
            }

            if (!isLowConfidence && place.gps_coordinates?.latitude != null && place.gps_coordinates?.longitude != null) {
              activity.latitude = place.gps_coordinates.latitude;
              activity.longitude = place.gps_coordinates.longitude;
            }
            if (!isLowConfidence && place.title) activity.name = place.title;
            if (place.place_id) activity.placeId = place.place_id;
            if (place.data_id) activity.dataId = place.data_id;
            if (place.data_cid) activity.dataCid = place.data_cid;
            if (place.provider_id) activity.providerId = place.provider_id;
            if (typeof place.rating === "number" && place.rating > 0 && (place.reviews ?? 0) >= 3) {
              activity.rating = place.rating;
              activity.reviewsCount = place.reviews;
              activity.ratingSource = "serpapi";
            } else if (typeof place.rating === "number" && place.rating > 0) {
              activity.rating = place.rating;
              activity.reviewsCount = place.reviews ?? 0;
              activity.ratingSource = "serpapi:low_confidence";
            }
            if (place.price) activity.priceLevel = place.price;
            if (place.type) activity.placeType = place.type;
            if (Array.isArray(place.types)) activity.placeTypes = place.types;
            if (place.type_id) activity.placeTypeId = place.type_id;
            if (place.address) activity.address = place.address;
            if (place.phone) activity.phone = place.phone;
            if (place.website) activity.website = place.website;
            if (place.open_state) {
              activity.openState = place.open_state;
              activity.open_state = place.open_state;
            }
            const extractedImageUrl = extractPlaceImageUrl(place);
            if (extractedImageUrl) activity.imageUrl = extractedImageUrl;
            if (place.serpapi_thumbnail) activity.thumbnailUrl = place.serpapi_thumbnail;
            if (place.operating_hours && typeof place.operating_hours === "object") {
              activity.operatingHours = place.operating_hours;
              // Also expose under snake_case so the frontend (which reads
              // `activity.operating_hours`) can render the per-day schedule.
              activity.operating_hours = place.operating_hours;
              activity.hoursSource = "serpapi";
            }
            const extractedHours = extractPlaceOpeningHours(place, activity?.date);
            if (extractedHours) {
              activity.openingHours = extractedHours;
            } else if (place.hours) {
              activity.openingHours = String(place.hours);
              activity.hours = String(place.hours);
              activity.hoursSource = "serpapi:summary";
            }
            if (Array.isArray(place.extensions) && place.extensions.length > 0) {
              activity.extensions = place.extensions.slice(0, 8);
              const tags: string[] = [];
              for (const ext of place.extensions) {
                if (!ext || typeof ext !== "object") continue;
                for (const arr of Object.values(ext)) {
                  if (Array.isArray(arr)) tags.push(...arr.map(String));
                }
              }
              if (tags.length) activity.tags = Array.from(new Set(tags)).slice(0, 8);
            }
            if (place.service_options && typeof place.service_options === "object") {
              activity.serviceOptions = place.service_options;
            }
            // "From the owner" posts (media, CTA, booking/order links)
            const ownerPosts = extractOwnerPosts(place);
            if (ownerPosts.length) {
              activity.ownerPosts = ownerPosts;
              const bookingPost = ownerPosts.find((p: any) =>
                p.link && /book|order|reserve|buy|ticket|menu/i.test(`${p.cta || ""} ${p.title || ""}`));
              if (bookingPost) {
                activity.bookingUrl = bookingPost.link;
                activity.bookingCta = bookingPost.cta || "Book";
              }
            }
            const venueName = String(place.title || activity.name || "").trim();
            const queryText = `${venueName} ${place.address || destination}`.trim();
            // Prefer data_cid (canonical place card) > place_id (anchored to exact place card)
            // > coords > raw text. Both CID and place_id formats below open the EXACT Google Maps
            // place card 1:1 (no generic results, no list view).
            if (place.data_cid && /^\d+$/.test(String(place.data_cid))) {
              activity.googleMapsUrl = `https://www.google.com/maps?cid=${place.data_cid}`;
              activity.googleMapsLinkReason = `CID: ${place.data_cid}`;
            } else if (place.place_id) {
              // Canonical 1:1 place URL — opens the place card directly, never a list/search.
              activity.googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`;
              activity.googleMapsLinkReason = getGoogleMapsLinkReason(place.place_id, undefined, place.gps_coordinates?.latitude, place.gps_coordinates?.longitude);
            } else if (place.gps_coordinates?.latitude != null && place.gps_coordinates?.longitude != null) {
              activity.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${place.gps_coordinates.latitude},${place.gps_coordinates.longitude}`;
              activity.googleMapsLinkReason = getGoogleMapsLinkReason(undefined, undefined, place.gps_coordinates.latitude, place.gps_coordinates.longitude);
            } else {
              activity.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
              activity.googleMapsLinkReason = "text query";
            }
            activity.enriched = true;
            activity.enrichmentSource = "serpapi";
            activity.matchConfidence = confidence;
            activity.matchScore = Number(matched.score.toFixed(2));
            logMissingFields(activity, "serpapi");
            enrichedCount++;
          } catch {}
        })());
      }
    }
    await Promise.race([Promise.all(promises), new Promise(r => setTimeout(r, 18000))]);
  } catch {}
  console.log(`SerpAPI enriched ${enrichedCount} activities`);
  return enrichedCount > 0;
}

// Serper.dev enrichment (fallback after SerpAPI)
async function enrichWithSerperDev(itinerary: any, destination: string): Promise<boolean> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return false;
  let enrichedCount = 0;
  try {
    const daysToEnrich = (itinerary.days || []).slice(0, 14);
    const promises: Promise<void>[] = [];
    for (const day of daysToEnrich) {
      for (const activity of (day.activities || []).slice(0, 6)) {
        if (activity.enriched) continue;
        promises.push((async () => {
          try {
            const q = `${activity.name} ${destination}`;
            // Try /maps first for better accuracy, fallback to /places
            let place: any = null;
            for (const endpoint of ["https://google.serper.dev/maps", "https://google.serper.dev/places"]) {
              const ctrl = new AbortController();
              const tid = setTimeout(() => ctrl.abort(), 5000);
              try {
                const resp = await fetch(endpoint, {
                  method: "POST",
                  headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
                  body: JSON.stringify({ q }),
                  signal: ctrl.signal,
                }).finally(() => clearTimeout(tid));
                if (!resp.ok) continue;
                const data = await resp.json();
                place = data.places?.[0];
                if (place) break;
              } catch { /* abort/network */ }
            }
            if (!place) return;
            if (place.latitude && place.longitude) { activity.latitude = place.latitude; activity.longitude = place.longitude; }
            if (place.title) activity.name = place.title;
            if (place.rating) activity.rating = place.rating;
            if (place.address) activity.address = place.address;
            if (place.phoneNumber) activity.phone = place.phoneNumber;
            if (place.website) activity.website = place.website;
            const extractedImageUrl = extractPlaceImageUrl(place);
            if (extractedImageUrl) activity.imageUrl = extractedImageUrl;
            const extractedHours = extractPlaceOpeningHours({
              openingHours: place?.openingHours,
              currentOpeningHours: place?.currentOpeningHours,
              hours: place?.hours,
            }, activity?.date);
            if (extractedHours) activity.openingHours = extractedHours;
            const venueName = String(place.title || activity.name || "").trim();
            const queryText = `${venueName} ${place.address || destination}`.trim();
            activity.googleMapsUrl = place.placeId
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueName || queryText)}&query_place_id=${encodeURIComponent(place.placeId)}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
            activity.enriched = true;
            enrichedCount++;
          } catch {}
        })());
      }
    }
    await Promise.race([Promise.all(promises), new Promise(r => setTimeout(r, 12000))]);
  } catch {}
  console.log(`Serper.dev enriched ${enrichedCount} activities`);
  return enrichedCount > 0;
}

// RapidAPI Google Map Places enrichment (3rd fallback)
async function enrichWithRapidAPI(itinerary: any, destination: string): Promise<boolean> {
  const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
  if (!RAPIDAPI_KEY) return false;
  let enrichedCount = 0;
  try {
    const daysToEnrich = (itinerary.days || []).slice(0, 14);
    const promises: Promise<void>[] = [];
    for (const day of daysToEnrich) {
      for (const activity of (day.activities || []).slice(0, 6)) {
        if (activity.enriched) continue;
        promises.push((async () => {
          try {
            const q = `${activity.name} ${destination}`;
            // Use Text Search to find places
            const resp = await fetch("https://google-map-places-new-v2.p.rapidapi.com/v1/places:searchText", {
              method: "POST",
              headers: {
                "x-rapidapi-key": RAPIDAPI_KEY,
                "x-rapidapi-host": "google-map-places-new-v2.p.rapidapi.com",
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours,places.internationalPhoneNumber,places.websiteUri,places.photos,places.googleMapsUri",
              },
              body: JSON.stringify({ textQuery: q, languageCode: "en", maxResultCount: 1 }),
            });
            if (!resp.ok) return;
            const data = await resp.json();
            const place = data.places?.[0];
            if (place) {
              if (place.location) {
                activity.latitude = place.location.latitude;
                activity.longitude = place.location.longitude;
              }
              if (place.displayName?.text) activity.name = place.displayName.text;
              if (place.rating) activity.rating = place.rating;
              if (place.formattedAddress) activity.address = place.formattedAddress;
              if (place.internationalPhoneNumber) activity.phone = place.internationalPhoneNumber;
              if (place.websiteUri) activity.website = place.websiteUri;
              if (place.currentOpeningHours?.weekdayDescriptions) {
                activity.openingHours = place.currentOpeningHours.weekdayDescriptions.join(", ");
              }
              if (place.googleMapsUri) {
                activity.googleMapsUrl = place.googleMapsUri;
              } else {
                const queryText = `${place.displayName?.text || activity.name} ${place.formattedAddress || destination}`.trim();
                activity.googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
              }
              activity.enriched = true;
              enrichedCount++;
            }
          } catch {}
        })());
      }
    }
    await Promise.race([Promise.all(promises), new Promise(r => setTimeout(r, 8000))]);
  } catch {}
  console.log(`RapidAPI enriched ${enrichedCount} activities`);
  return enrichedCount > 0;
}

// AI-based enrichment (last resort - 4th fallback)
async function enrichWithAI(itinerary: any, destination: string): Promise<boolean> {
  const unenriched = [];
  for (const day of (itinerary.days || [])) {
    for (const act of (day.activities || [])) {
      if (!act.enriched && (!act.latitude || act.latitude === 0)) {
        unenriched.push(act);
      }
    }
  }
  if (unenriched.length === 0) return true;
  
  const names = unenriched.slice(0, 20).map((a: any) => a.name);
  try {
    const sysPrompt = "Return ONLY valid JSON array. No markdown.";
    const userPrompt = `For each place in ${destination}, return real coordinates, address, rating, and hours.
Places: ${JSON.stringify(names)}
Format: [{"name":"...","latitude":0.0,"longitude":0.0,"address":"...","rating":4.5,"hours":"9AM-10PM","googleMapsUrl":"https://www.google.com/maps/search/?api=1&query=..."}]`;
    
    const response = await withTimeout(callAI(sysPrompt, userPrompt), 15000, "AI enrichment");
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = extractAndRepairJson(content);
    
    if (Array.isArray(parsed)) {
      const enrichMap = new Map(parsed.map((p: any) => [p.name?.toLowerCase(), p]));
      for (const act of unenriched) {
        const match = enrichMap.get(act.name?.toLowerCase());
        if (match) {
          if (match.latitude) act.latitude = match.latitude;
          if (match.longitude) act.longitude = match.longitude;
          if (match.address) act.address = match.address;
          if (match.rating) act.rating = match.rating;
          if (match.hours) act.openingHours = match.hours;
          if (match.openingHours) act.openingHours = match.openingHours;
          if (match.googleMapsUrl) act.googleMapsUrl = match.googleMapsUrl;
          act.enriched = true;
        }
      }
      console.log(`AI enriched ${parsed.length} activities`);
      return true;
    }
  } catch (e) { console.warn("AI enrichment failed:", e); }
  return false;
}

async function enrichMissingOpeningHours(itinerary: any, destination: string): Promise<number> {
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let fixed = 0;
  let cacheHits = 0;

  const needsOpeningHours = (activity: any) => {
    const category = String(activity?.category || activity?.type || "").toLowerCase();
    if (!category) return true;
    if (["hotel", "flight", "transport", "transfer", "car_rental", "car", "route"].includes(category)) return false;
    return true;
  };

  // ── Per-venue hours/image cache (keyed on placeId or name+address signature).
  // Reuses places_cache table with a dedicated source tag so it never collides
  // with the search-result bank. Hours rarely change → 30-day TTL is safe and
  // makes repeated generations of the same venue effectively free.
  const venueCacheKey = (activity: any): string | null => {
    const pid = String(activity?.placeId || activity?.place_id || activity?.dataId || "").trim();
    if (pid) return `venue_hours:pid:${pid.toLowerCase()}`;
    const name = String(activity?.name || activity?.title || "").trim().toLowerCase();
    const addr = String(activity?.address || "").trim().toLowerCase();
    if (!name) return null;
    // Short FNV-1a hash to keep cache_key compact
    const sig = `${name}|${addr}|${String(destination || "").toLowerCase()}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < sig.length; i++) {
      h ^= sig.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return `venue_hours:nm:${h.toString(36)}`;
  };

  type VenueCacheValue = { hours?: string; image?: string; latitude?: number; longitude?: number; address?: string };

  const readVenueCache = async (key: string): Promise<VenueCacheValue | null> => {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 1200);
      const resp = await fetch(
        `${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(key)}&select=results,expires_at,venue_latitude,venue_longitude,venue_address&limit=1`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }, signal: ctrl.signal },
      ).finally(() => clearTimeout(tid));
      if (!resp.ok) return null;
      const rows = await resp.json();
      const row = Array.isArray(rows) && rows[0];
      if (!row) return null;
      if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
      const payload = Array.isArray(row.results) ? row.results[0] : row.results;
      if (!payload || typeof payload !== "object") return null;
      const hours = typeof payload.hours === "string" ? payload.hours : undefined;
      const image = typeof payload.image === "string" ? payload.image : undefined;
      const latitude = typeof row.venue_latitude === "number" ? row.venue_latitude : (typeof payload.latitude === "number" ? payload.latitude : undefined);
      const longitude = typeof row.venue_longitude === "number" ? row.venue_longitude : (typeof payload.longitude === "number" ? payload.longitude : undefined);
      const address = typeof row.venue_address === "string" ? row.venue_address : (typeof payload.address === "string" ? payload.address : undefined);
      if (!hours && !image && latitude == null && !address) return null;
      return { hours, image, latitude, longitude, address };
    } catch { return null; }
  };

  const writeVenueCache = async (key: string, value: VenueCacheValue) => {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    if (!value || (!value.hours && !value.image && value.latitude == null && !value.address)) return;
    try {
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 1500);
      await fetch(`${SUPABASE_URL}/rest/v1/places_cache`, {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          cache_key: key,
          query: key,
          source: "venue_hours_cache",
          city: String(destination || "").slice(0, 80),
          results: [{
            hours: value.hours || null,
            image: value.image || null,
            latitude: value.latitude ?? null,
            longitude: value.longitude ?? null,
            address: value.address || null,
          }],
          results_count: 1,
          expires_at: expires,
          venue_latitude: value.latitude ?? null,
          venue_longitude: value.longitude ?? null,
          venue_address: value.address || null,
        }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));
    } catch { /* noop */ }
  };

  // ── Request coalescing: if another worker is already fetching this venue,
  // we wait briefly and re-read the cache instead of hitting SerpAPI again.
  // This means N concurrent users requesting the same city only pay 1× SerpAPI cost.
  const WORKER_ID = (globalThis as any).crypto?.randomUUID?.() || `w_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tryAcquireLock = async (key: string): Promise<boolean> => {
    if (!SUPABASE_URL || !SERVICE_KEY) return true;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 800);
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/try_acquire_lookup_lock`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ _cache_key: key, _worker_id: WORKER_ID, _ttl_seconds: 20 }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));
      if (!resp.ok) return true; // fail-open: never block real work
      const v = await resp.json();
      return v === true || v === "true";
    } catch { return true; }
  };
  const releaseLock = async (key: string) => {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 600);
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_lookup_lock`, {
        method: "POST",
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ _cache_key: key, _worker_id: WORKER_ID }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));
    } catch { /* noop */ }
  };
  const waitForPeerResult = async (key: string, maxWaitMs = 1800): Promise<VenueCacheValue | null> => {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 300));
      const c = await readVenueCache(key);
      if (c) return c;
    }
    return null;
  };

  const extractCoords = (place: any): { latitude?: number; longitude?: number; address?: string } => {
    const lat = Number(place?.gps_coordinates?.latitude ?? place?.latitude ?? place?.coordinates?.lat ?? place?.location?.lat);
    const lng = Number(place?.gps_coordinates?.longitude ?? place?.longitude ?? place?.coordinates?.lng ?? place?.location?.lng);
    const address = (typeof place?.address === "string" ? place.address : (typeof place?.formatted_address === "string" ? place.formatted_address : undefined));
    return {
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lng) ? lng : undefined,
      address: address || undefined,
    };
  };

  const trySerpApi = async (q: string, targetDate?: string): Promise<VenueCacheValue | undefined> => {
    if (!SERPAPI_KEY) return undefined;
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(q)}&hl=en&api_key=${SERPAPI_KEY}`;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2500);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
    } catch { return undefined; }
    if (!resp.ok) return undefined;
    const data = await resp.json();
    let place = data?.local_results?.[0] || data?.place_results;
    logSerpUsage({ query: q, city: destination, cacheHit: false, resultsCount: Array.isArray(data?.local_results) ? data.local_results.length : 0, context: "enrichMissingOpeningHours" });
    if (!place) return undefined;
    let hours = extractPlaceOpeningHours(place, targetDate);
    let image = extractPlaceImageUrl(place);
    if (!hours && place.place_id) {
      const details = await fetchSerpPlaceDetails(place.place_id, SERPAPI_KEY);
      if (details) {
        place = { ...place, ...details };
        hours = extractPlaceOpeningHours(details, targetDate) || extractPlaceOpeningHours(place, targetDate);
        if (!image) image = extractPlaceImageUrl(details);
      }
    }
    const coords = extractCoords(place);
    if (!hours && !image && coords.latitude == null && !coords.address) return undefined;
    return { hours, image, ...coords };
  };

  const trySerper = async (q: string, targetDate?: string): Promise<VenueCacheValue | undefined> => {
    if (!SERPER_KEY) return undefined;
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 2500);
    let resp: Response;
    try {
      resp = await fetch("https://google.serper.dev/places", {
        method: "POST",
        headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(tid));
    } catch { return undefined; }
    if (!resp.ok) return undefined;
    const data = await resp.json();
    const place = data?.places?.[0];
    if (!place) return undefined;
    const hours = extractPlaceOpeningHours(place, targetDate);
    const image = extractPlaceImageUrl(place);
    const coords = extractCoords(place);
    if (!hours && !image && coords.latitude == null && !coords.address) return undefined;
    return { hours, image, ...coords };
  };

  const tasks: Promise<void>[] = [];
  // Run more lookups concurrently — they all share the outer budget below.
  // Raised from 16 → 40 so every activity in a 5-day × 5-item plan gets a
  // SerpAPI lookup attempt; previously the last ~9 venues silently fell back
  // to "Hours unavailable" in the UI even though SerpAPI had real data.
  const MAX_OPENING_HOURS_BACKFILL = 40;
  const isPlaceholderImage = (url?: string) =>
    !url || /placeholder|unsplash|via\.placeholder|lorempicsum/i.test(String(url));
  scanDays:
  for (const day of (itinerary.days || [])) {
    for (const activity of (day.activities || [])) {
      if (tasks.length >= MAX_OPENING_HOURS_BACKFILL) break scanDays;
      const needsHours = needsOpeningHours(activity) && !hasValidOpeningHours(activity?.openingHours);
      const needsImage = isPlaceholderImage(activity?.imageUrl);
      if (!needsHours && !needsImage) continue;

      const name = String(activity?.name || activity?.title || "").trim();
      if (!name) continue;
      const addr = String(activity?.address || "").trim();
      const queries = [
        addr ? `${name} ${addr}` : "",
        `${name} ${destination}`,
      ].filter(Boolean);

      const cKey = venueCacheKey(activity);
      tasks.push((async () => {
        const applyCached = (c: VenueCacheValue): boolean => {
          let any = false;
          if (needsHours && c.hours) { activity.openingHours = c.hours; fixed++; any = true; }
          if (needsImage && c.image) { activity.imageUrl = c.image; any = true; }
          if (c.latitude != null && c.longitude != null && (activity.latitude == null || activity.longitude == null)) {
            activity.latitude = c.latitude;
            activity.longitude = c.longitude;
            any = true;
          }
          if (c.address && !activity.address) { activity.address = c.address; any = true; }
          return any;
        };

        // 1. Try venue-level cache first (sub-200ms; no SerpAPI cost)
        if (cKey) {
          const cached = await readVenueCache(cKey);
          if (cached) {
            applyCached(cached);
            cacheHits++;
            if ((!needsHours || activity?.openingHours) && (!needsImage || activity?.imageUrl)) return;
          }

          // 2. Coalesce concurrent identical lookups: if another worker is already
          // fetching this venue, wait briefly and re-read the cache instead of
          // duplicating the SerpAPI call.
          const gotLock = await tryAcquireLock(cKey);
          if (!gotLock) {
            const peer = await waitForPeerResult(cKey);
            if (peer) { applyCached(peer); cacheHits++; return; }
            // Peer didn't finish in time → fall through and try ourselves.
          }
          try {
            for (const q of queries) {
              try {
                const r = (await trySerpApi(q, activity?.date)) || (await trySerper(q, activity?.date));
                if (!r) continue;
                applyCached(r);
                // Persist the full venue snapshot (hours/image/coords/address) for 30 days.
                writeVenueCache(cKey, r).catch(() => {});
                if ((!needsHours || activity?.openingHours) && (!needsImage || activity?.imageUrl)) break;
              } catch { /* noop */ }
            }
          } finally {
            if (gotLock) releaseLock(cKey).catch(() => {});
          }
          return;
        }

        // No stable cache key → fall back to live lookup without coalescing.
        for (const q of queries) {
          try {
            const r = (await trySerpApi(q, activity?.date)) || (await trySerper(q, activity?.date));
            if (!r) continue;
            applyCached(r);
            if ((!needsHours || activity?.openingHours) && (!needsImage || activity?.imageUrl)) break;
          } catch { /* noop */ }
        }
      })());
    }
  }
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, 9500)),
  ]);

  // Final coalesce pass — guarantees the UI never shows "Hours unavailable"
  // when SerpAPI returned ANY usable signal (operating_hours object, hours
  // string, or open_state summary). Runs offline (no API calls).
  let coalesced = 0;
  for (const day of (itinerary.days || [])) {
    for (const act of (day.activities || [])) {
      // Always mirror operatingHours ↔ operating_hours so the frontend (which
      // reads `activity.operating_hours`) always sees the rich per-day object
      // when one exists, regardless of which casing the upstream code wrote.
      if (act?.operatingHours && typeof act.operatingHours === "object" && !act.operating_hours) {
        act.operating_hours = act.operatingHours;
      } else if (act?.operating_hours && typeof act.operating_hours === "object" && !act.operatingHours) {
        act.operatingHours = act.operating_hours;
      }
      if (typeof act?.openState === "string" && !act.open_state) act.open_state = act.openState;
      else if (typeof act?.open_state === "string" && !act.openState) act.openState = act.open_state;

      if (!needsOpeningHours(act)) continue;
      if (hasValidOpeningHours(act?.openingHours)) continue;
    const fallback = extractPlaceOpeningHours(act, act?.date)
        || extractPlaceOpeningHours(act?._raw, act?.date)
        || formatOperatingHoursForDate(act?.operatingHours || act?.operating_hours, act?.date)
        || (typeof act?.openState === "string" && act.openState.trim() ? act.openState.trim() : "")
        || (typeof act?.hours === "string" && act.hours.trim() ? act.hours.trim() : "");
      if (fallback && hasValidOpeningHours(fallback)) {
        act.openingHours = fallback;
        act.hoursSource = act.hoursSource || "coalesce";
        coalesced++;
      }
    }
  }

  console.log(`Filled opening hours for ${fixed} activities (cache hits: ${cacheHits}, coalesced: ${coalesced})`);
  return fixed + coalesced;
}

/**
 * Post-enrichment validation: ensure each activity's scheduled time falls
 * inside the venue's actual opening hours. If not, nudge the time into the
 * nearest open slot (preserving locked items + match anchors). Marks each
 * activity with `hoursVerified` so the UI can trust the displayed hours.
 *
 * Heuristic: parses the same free-text hours format the scheduler already
 * uses (`HH(:MM)?\s*(am|pm)?\s*-\s*HH(:MM)?\s*(am|pm)?`, plus 24/7).
 * No additional SerpAPI calls — runs purely on the data fetched by
 * `enrichMissingOpeningHours` to keep token usage flat.
 */
function validateActivityTimesAgainstHours(itinerary: any): { adjusted: number; verified: number } {
  let adjusted = 0;
  let verified = 0;

  const parseWindow = (raw: unknown): [number, number] | null => {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/24\s*\/?\s*7|open\s*24\s*hours|24\s*ساعة/i.test(s)) return [0, 24];
    const norm = s.replace(/[–—−]/g, "-").replace(/\u200f|\u200e/g, "").replace(/\s+/g, " ");
    const m = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?/i);
    if (!m) return null;
    const toH = (h: string, mer?: string) => {
      let n = parseInt(h, 10);
      const mm = (mer || "").toLowerCase();
      if ((mm === "pm" || mm === "م") && n < 12) n += 12;
      if ((mm === "am" || mm === "ص") && n === 12) n = 0;
      return Number.isFinite(n) ? n : NaN;
    };
    const o = toH(m[1], m[3]);
    let c = toH(m[4], m[6]);
    if (!Number.isFinite(o) || !Number.isFinite(c)) return null;
    if (c <= o) c += 24;
    return [o, c];
  };

  const fmt = (h: number) => `${String(Math.floor(h % 24)).padStart(2, "0")}:00`;

  for (const day of (itinerary?.days || [])) {
    const acts: any[] = day?.activities || [];
    // Collect taken windows so nudges don't collide with locked items
    const taken: Array<{ start: number; end: number }> = [];
    for (const a of acts) {
      const h = parseInt(String(a?.time || "").split(":")[0] || "", 10);
      if (Number.isFinite(h)) {
        const dur = a?.isMatchAnchor ? 3 : 2;
        if (a?.timeLocked || a?.isMatchAnchor) taken.push({ start: h, end: h + dur });
      }
    }

    for (const act of acts) {
      if (!act || act.timeLocked || act.isMatchAnchor) continue;
      const win = parseWindow(act?.openingHours);
      if (!win) continue; // unknown hours → nothing to validate against

      const [open, close] = win;
      const cur = parseInt(String(act?.time || "").split(":")[0] || "", 10);
      const dur = Number(act?.durationHours) > 0 ? Math.min(6, Number(act.durationHours)) : 2;

      if (Number.isFinite(cur) && cur >= open && cur + dur <= close) {
        act.hoursVerified = true;
        verified++;
        continue;
      }

      // Nudge into open window. Prefer keeping near current hour.
      const candidates: number[] = [];
      for (let h = Math.max(open, 8); h + dur <= Math.min(close, 23); h++) candidates.push(h);
      if (candidates.length === 0) continue;
      const collidesTaken = (h: number) =>
        taken.some((w) => h < w.end && h + dur > w.start);
      candidates.sort((a, b) => Math.abs(a - (Number.isFinite(cur) ? cur : open)) - Math.abs(b - (Number.isFinite(cur) ? cur : open)));
      const pick = candidates.find((h) => !collidesTaken(h)) ?? candidates[0];
      act.time = fmt(pick);
      act.startTime = act.time;
      act.hoursVerified = true;
      taken.push({ start: pick, end: pick + dur });
      adjusted++;
      verified++;
    }

    // Re-sort by time to keep UI consistent
    if (Array.isArray(day?.activities)) {
      day.activities.sort((a: any, b: any) =>
        String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")),
      );
    }
  }

  console.log(`[hours-validate] verified=${verified} adjusted=${adjusted}`);
  return { adjusted, verified };
}

// Serper.dev dynamic city data builder (fallback after SerpAPI)
async function buildDynamicCityDataSerper(destination: string, requestedCuisine: string | null, userInterests: string[] = []): Promise<CityData | null> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  if (!SERPER_KEY) return null;

  const cuisine = requestedCuisine ? `${requestedCuisine} ` : "";
  const interestSet = buildSelectedInterestSet(userInterests, "");
  const fallbackPrefs = extractPreferences(userInterests, "", requestedCuisine ? [requestedCuisine] : []);
  const landmarkQueryStrings = buildInterestSearchSeeds(destination, interestSet, fallbackPrefs).map((seed) => seed.query);
  
  const cuisineVariantsSerper = getCuisineSearchVariants(requestedCuisine, 2);
  const mealQueries = (["breakfast", "lunch", "dinner"] as const).flatMap((meal) => {
    if (cuisineVariantsSerper.length === 0) {
      return [{ q: `best ${meal} restaurants in ${destination}`, type: meal }];
    }
    return cuisineVariantsSerper.map((variant) => ({
      q: `best ${variant} ${meal} restaurants in ${destination}`,
      type: meal,
    }));
  });
  const queries = [
    ...landmarkQueryStrings.slice(0, 4).map(q => ({ q, type: "landmark" })),
    ...mealQueries,
  ];

  try {
    const results = await Promise.all(queries.map(async (qObj) => {
      try {
        const resp = await fetch("https://google.serper.dev/places", {
          method: "POST",
          headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ q: qObj.q }),
        });
        if (!resp.ok) return { type: qObj.type, places: [] };
        const data = await resp.json();
        return { type: qObj.type, places: data.places || [] };
      } catch { return { type: qObj.type, places: [] }; }
    }));

    const landmarkMap = new Map<string, PlaceInfo>();
    const restaurantMap = new Map<string, RestaurantInfo>();

    for (const r of results) {
      for (const p of r.places) {
        const name = (p?.title || "").trim();
        if (!name) continue;
        const lat = Number(p?.latitude);
        const lng = Number(p?.longitude);
        
        if (r.type === "landmark") {
          if (landmarkMap.has(name.toLowerCase())) continue;
          landmarkMap.set(name.toLowerCase(), {
            name, nameAr: name,
            lat: Number.isFinite(lat) ? lat : 0,
            lng: Number.isFinite(lng) ? lng : 0,
            address: p?.address || destination,
            category: "attraction",
            openingHours: extractPlaceOpeningHours(p),
            openState: p?.open_state || p?.openState || undefined,
          });
        } else {
          const combinedRestaurantText = `${name} ${p?.address || ""} ${p?.type || ""} ${Array.isArray(p?.types) ? p.types.join(" ") : ""} ${p?.description || ""}`;
          if (requestedCuisine && !matchesRequestedCuisineText(combinedRestaurantText, requestedCuisine)) continue;
          const key = `${r.type}:${name.toLowerCase()}`;
          if (restaurantMap.has(key)) continue;
          restaurantMap.set(key, {
            name, nameAr: name,
            lat: Number.isFinite(lat) ? lat : 0,
            lng: Number.isFinite(lng) ? lng : 0,
            address: p?.address || destination,
            type: r.type,
            cuisine: requestedCuisine || undefined,
          });
        }
      }
    }

    const landmarks = Array.from(landmarkMap.values()).slice(0, 18);
    const restaurants = Array.from(restaurantMap.values()).slice(0, 24);
    if (landmarks.length === 0) return null;
    console.log(`Serper.dev built city data: ${landmarks.length} landmarks, ${restaurants.length} restaurants (cuisine: ${requestedCuisine || 'any'}, interests: ${Array.from(interestSet).join(',') || 'general'})`);
    return { landmarks, restaurants };
  } catch { return null; }
}

function sanitizeKey(v: string | undefined | null) { return (v || "").trim(); }

type PreferenceFlags = {
  allText: string;
  requestedCuisine: string | null;
  requestedCuisines: string[];
  hasMealMention: boolean;
  wantBreakfast: boolean;
  wantLunch: boolean;
  wantDinner: boolean;
  wantSnacks: boolean;
  isRomantic: boolean;
  isAdventure: boolean;
  isFamily: boolean;
  isEconomic: boolean;
  isLuxury: boolean;
  isSolo: boolean;
  wantsSwimming: boolean;
  startHour: number;
  endHour: number;
};

type MatchAnchor = {
  teamA: string;
  teamB: string;
  venue: string;
  isoDate: string;
  kickoff?: string;
};

type SpecialRequestInjection = {
  query: string;
  category: string;
  forDay?: number;
  anchor?: MatchAnchor;
  preferredTime?: string; // HH:MM extracted by AI from user prompt
  aiEnhanced?: boolean;   // True if produced/refined by AIML analysis
};

function logSpecialRequestDecision(action: "keep" | "drop" | "inject" | "miss", request: Partial<SpecialRequestInjection> | string, reason: string, extra: Record<string, unknown> = {}) {
  const query = typeof request === "string" ? request : String(request?.query || request?.anchor?.venue || "").trim();
  console.log(`[special-request:${action}] ${query || "(empty)"} — ${reason}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`);
}

function buildExcludedNameList(baseNames: string[] = [], usedNames?: Set<string>, currentActivities: any[] = []): string[] {
  return Array.from(new Set([
    ...baseNames.filter(Boolean),
    ...(usedNames ? Array.from(usedNames).filter(Boolean) : []),
    ...currentActivities.map((activity) => getActivityName(activity)).filter(Boolean),
  ]));
}

function buildMeaningfulSpecialRequestSource(rawText = "", explicitText = "") {
  // STRICT MODE: Only extract content the user explicitly typed in the
  // "Special requests" field. Never infer from generic preference instructions
  // (Activity preferences, Trip type, Diversity rules, etc.) — that caused
  // false-positive injections like "shopping mall or market" whenever
  // "Shopping" appeared as an activity-preference category.
  const chunks: string[] = [];
  const pushChunk = (value: unknown) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    chunks.push(clean);
  };

  pushChunk(explicitText);

  // Capture the user's actual special-requests block (may span multiple lines)
  // until the next known section header.
  const block = String(rawText || "").match(
    /(?:CRITICAL SPECIAL REQUESTS \(MUST FOLLOW\)|Special requests?|الطلبات الخاصة)\s*:?\s*([\s\S]+?)(?:\n\s*(?:Trip type|Travel style|Activity preferences|Activities per day|Preferred cuisines|Dietary restrictions|Food preferences|Wake up|Sleep|Budget|Intercity transport|Local transport|MANDATORY MEAL REQUIREMENTS|DIVERSITY RULES|Pace|Minimum place rating|Include hotel|Include flight)|$)/i,
  );
  pushChunk(block?.[1]);

  // Prompt-only generation sends the user's free text as "USER PROMPT:".
  // Treat that as explicit special-request source too, otherwise only
  // structured match anchors are reliably applied and requests like gaming / RC
  // cars can be ignored.
  const userPromptBlock = String(rawText || "").match(
    /USER\s+PROMPT\s*:\s*([\s\S]+?)(?:\n\s*(?:MANDATORY MEAL REQUIREMENTS|Preferred cuisines|Meal budget|Total budget|Budget|CRITICAL|Trip type)|$)/i,
  );
  pushChunk(userPromptBlock?.[1]);

  return Array.from(new Set(chunks.map((item) => item.trim()).filter(Boolean))).join("\n");
}

const INTEREST_KEYWORDS: Record<string, RegExp> = {
  nature: /nature|park|garden|forest|wadi|mountain|lake|botanical|scenic|حديقة|طبيعة|جبل|وادي|بحيرة|منتزه|منظر طبيعي/i,
  shopping: /shopping|mall|market|bazaar|souq|souk|retail|outlet|سوق|مول|بازار|تسوق/i,
  culture: /culture|cultural|history|historic|museum|heritage|mosque|temple|church|fort|palace|gallery|theater|ثقاف|تاريخ|متحف|تراث|مسجد|كنيسة|قلعة|قصر/i,
  beach: /beach|sea|coast|marina|waterfront|island|seafront|شاطئ|ساحل|مارينا|واجهة بحرية|جزيرة|مطل على البحر|على البحر/i,
  adventure: /adventure|hiking|camp|desert|safari|zipline|kayak|boat|snorkel|diving|climb|trail|مغامر|هايكنج|تخييم|سفاري|قارب|غطس|تسلق/i,
  art: /art|gallery|museum|design|exhibition|theater|opera|فن|معرض|متحف|تصميم|مسرح|أوبرا/i,
  entertainment: /entertainment|theme park|amusement|show|cinema|arcade|aquarium|zoo|waterpark|festival|music venue|comedy club|immersive|entertainment district|l\.?a\.?\s*live|texas live|\blive\b|ترفيه|ملاهي|عرض|سينما|أكواريوم|حديقة حيوان|مهرجان|حفلة|موسيقى/i,
  relaxation: /relax|spa|wellness|resort|garden|cafe|tea|sunset|استرخاء|سبا|عافية|منتجع|مقهى|غروب/i,
  nightlife: /nightlife|night club|club|bar|lounge|rooftop|late night|حياة ليلية|بار|لاونج|سطح|سهر/i,
  sports: /sport|stadium|arena|football|soccer|basketball|tennis|golf|race|circuit|رياض|ملعب|كرة قدم|كرة سلة|تنس|جولف|حلبة/i,
};

// Adult-only venue heuristic: matches places that should be EXCLUDED from
// "entertainment" results unless the user has explicitly opted in to nightlife.
// Used to keep family/all-ages entertainment plans free of bars/clubs/lounges.
const ADULT_VENUE_PATTERN = /\b(night\s*club|nightclub|cocktail\s+(?:bar|lounge)|hookah|shisha|liquor|whiskey\s+bar|wine\s+bar|sports\s+bar|gentlemen'?s?\s+club|adults?[\s-]only|strip\s+club|casino|brewery|gastropub|speakeasy)\b|\b(?:bar|lounge|pub|club)\s*(?:&|and|\/)\s*(?:grill|kitchen|restaurant)?\b|\bbars?\b|\blounges?\b/i;

function isAdultOnlyVenue(activity: any): boolean {
  const text = `${activity?.name || ""} ${activity?.title || ""} ${activity?.description || ""} ${activity?.category || ""} ${activity?.address || ""}`;
  if (!text.trim()) return false;
  // Exempt obvious family venues
  if (/family|kids|children|theme\s*park|amusement|aquarium|zoo|museum|theater|theatre|concert|comedy|arcade|bowling|cinema|planetarium|عائل|أطفال/i.test(text)) return false;
  return ADULT_VENUE_PATTERN.test(text);
}

function normalizeInterestTag(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["nature", "طبيعة"].includes(raw)) return "nature";
  if (["shopping", "تسوق"].includes(raw)) return "shopping";
  if (["culture", "cultural", "history", "ثقافة", "ثقافة وتاريخ", "تاريخ"].includes(raw)) return "culture";
  if (["beach", "beaches", "شاطئ", "شواطئ"].includes(raw)) return "beach";
  if (["adventure", "مغامرة", "مغامرات"].includes(raw)) return "adventure";
  if (["art", "arts", "فن", "فن ومتاحف", "museum", "museums", "متاحف"].includes(raw)) return "art";
  if (["entertainment", "ترفيه"].includes(raw)) return "entertainment";
  if (["relaxation", "relax", "استرخاء"].includes(raw)) return "relaxation";
  if (["nightlife", "حياة ليلية"].includes(raw)) return "nightlife";
  if (["sports", "sport", "رياضة", "رياضات"].includes(raw)) return "sports";
  if (raw === "cultural") return "culture";
  if (raw === "activity") return "adventure";
  return raw;
}

function normalizeTripTypeTag(value: unknown): string {
  const raw = normalizeForDedup(value);
  if (!raw) return "";
  if (["family", "عائلية", "عائلي"].includes(raw)) return "family";
  if (["economic", "economy", "budget", "اقتصادية", "اقتصادي"].includes(raw)) return "economic";
  if (["luxury", "فاخرة", "فاخر"].includes(raw)) return "luxury";
  if (["adventure", "مغامرة", "مغامرات"].includes(raw)) return "adventure";
  if (["romantic", "رومانسية", "رومانسي"].includes(raw)) return "romantic";
  if (["solo", "فردية", "فردي"].includes(raw)) return "solo";
  return raw;
}

const CUISINE_TERMS: Record<string, string[]> = {
  local: ["local", "محلي"],
  italian: ["italian", "إيطالي", "ايطالي", "pasta"],
  asian: ["asian", "آسيوي", "اسيوي"],
  seafood: ["seafood", "مأكولات بحرية"],
  "fast-food": ["fast food", "وجبات سريعة", "burger"],
  vegetarian: ["vegetarian", "نباتي"],
  vegan: ["vegan", "نباتي صرف"],
  halal: ["halal", "حلال"],
  kosher: ["kosher", "كوشر"],
  "street-food": ["street food", "طعام الشارع"],
  desserts: ["dessert", "desserts", "حلويات"],
  cafes: ["cafe", "cafes", "coffee", "مقهى", "كوفي"],
  arabic: ["arabic", "arab", "عربي"],
  indian: ["indian", "هندي", "biryani", "tandoori", "curry"],
  american: ["american", "أمريكي", "امريكي"],
  russian: ["russian", "روسي"],
  pizza: ["pizza", "بيتزا"],
  healthy: ["healthy", "صحي", "salad"],
  sushi: ["sushi", "سوشي"],
  mexican: ["mexican", "مكسيكي"],
  chinese: ["chinese", "صيني"],
  turkish: ["turkish", "تركي"],
  korean: ["korean", "كوري"],
  grill: ["grill", "bbq", "مشويات"],
  french: ["french", "فرنسي"],
  japanese: ["japanese", "ياباني", "ramen"],
  thai: ["thai", "تايلندي"],
  mediterranean: ["mediterranean", "متوسطي"],
  lebanese: ["lebanese", "لبناني"],
  persian: ["persian", "iranian", "فارسي", "إيراني"],
  ethiopian: ["ethiopian", "إثيوبي"],
  vietnamese: ["vietnamese", "فيتنامي"],
  "gluten-free": ["gluten free", "gluten-free", "خالي من الغلوتين"],
  brunch: ["brunch", "برانش"],
  buffet: ["buffet", "بوفيه"],
  "fine-dining": ["fine dining", "مطاعم فاخرة"],
  "food-truck": ["food truck", "عربات طعام"],
};

// English-only synonym variations used to broaden SerpAPI coverage when the user
// selects a specific cuisine/preference. Each entry produces multiple search
// queries so we never miss results because one phrase didn't match the index.
// Source: keyword set provided by product team (Arabic + English variations).
const CUISINE_SEARCH_VARIANTS: Record<string, string[]> = {
  local: ["local food", "traditional food", "regional cuisine", "authentic food", "native dishes"],
  italian: ["italian food", "italian cuisine", "pasta restaurant", "trattoria", "italian pizza"],
  asian: ["asian food", "asian cuisine", "oriental food", "pan asian restaurant"],
  seafood: ["seafood", "fish restaurant", "seafood grill", "fresh seafood"],
  "fast-food": ["fast food", "quick bites", "takeaway food", "burgers and fries", "street fast food"],
  vegetarian: ["vegetarian food", "veggie restaurant", "plant based food"],
  vegan: ["vegan food", "vegan restaurant", "dairy free food", "cruelty free food"],
  halal: ["halal food", "halal restaurant", "islamic compliant food"],
  kosher: ["kosher food", "kosher restaurant", "jewish dietary food"],
  "street-food": ["street food", "food stalls", "street eats", "local street vendors"],
  desserts: ["desserts", "sweets", "pastry shop", "bakery desserts"],
  cafes: ["cafes", "coffee shop", "espresso bar", "specialty coffee"],
  arabic: ["arabic food", "middle eastern food", "levant cuisine"],
  indian: ["indian food", "curry restaurant", "indian cuisine"],
  american: ["american food", "burgers restaurant", "diner food"],
  russian: ["russian cuisine", "eastern european food"],
  pizza: ["pizza restaurant", "italian pizza", "pizzeria"],
  healthy: ["healthy food", "clean eating", "diet food", "low calorie meals"],
  sushi: ["sushi", "sushi bar", "japanese sushi"],
  mexican: ["mexican food", "tacos", "burritos", "tex mex"],
  chinese: ["chinese food", "dim sum", "chinese restaurant"],
  turkish: ["turkish food", "kebab restaurant", "anatolian cuisine"],
  korean: ["korean food", "bbq korean", "kimchi dishes"],
  grill: ["grill restaurant", "bbq", "steakhouse", "charcoal grill"],
  french: ["french cuisine", "fine french dining", "bistro"],
  japanese: ["japanese food", "ramen", "japanese restaurant"],
  thai: ["thai food", "thai cuisine", "spicy thai"],
  mediterranean: ["mediterranean food", "greek food", "mediterranean diet"],
  lebanese: ["lebanese food", "mezze", "shawarma"],
  persian: ["persian food", "iranian cuisine", "kebab persian"],
  ethiopian: ["ethiopian food", "injera dishes"],
  vietnamese: ["vietnamese food", "pho", "banh mi"],
  "gluten-free": ["gluten free food", "gluten free restaurant", "celiac friendly"],
  brunch: ["brunch", "breakfast and lunch", "late breakfast"],
  buffet: ["buffet", "all you can eat", "open buffet"],
  "fine-dining": ["fine dining", "luxury restaurant", "upscale dining", "gourmet restaurant"],
  "food-truck": ["food trucks", "mobile food", "street trucks"],
};

// Returns up to `max` distinct English query phrases for a given cuisine selection.
function getCuisineSearchVariants(requestedCuisine: string | null | undefined, max = 3): string[] {
  if (!requestedCuisine) return [];
  const normalized = normalizeCuisineTag(requestedCuisine);
  const variants = CUISINE_SEARCH_VARIANTS[normalized] || [normalized];
  return variants.slice(0, Math.max(1, max));
}

// Dietary cuisines are NON-NEGOTIABLE — a "halal" or "vegan" user cannot be
// served a generic restaurant just because SerpAPI returned one. For these we
// require strict text-confirmation on every candidate and never fall back to
// "trust the first result" mode.
const STRICT_DIETARY_CUISINES = new Set([
  "halal", "kosher", "vegan", "vegetarian", "gluten-free",
]);

function isStrictDietaryCuisine(requestedCuisine: string | null | undefined): boolean {
  if (!requestedCuisine) return false;
  return STRICT_DIETARY_CUISINES.has(normalizeCuisineTag(requestedCuisine));
}

function normalizeCuisineTag(value: unknown): string {
  const raw = normalizeForDedup(value);
  if (!raw) return "";
  for (const [key, terms] of Object.entries(CUISINE_TERMS)) {
    if (key === raw || terms.some((term) => normalizeForDedup(term) === raw)) return key;
  }
  if (raw === "fast_food") return "fast-food";
  if (raw === "street_food") return "street-food";
  if (raw === "gluten_free") return "gluten-free";
  if (raw === "food_truck") return "food-truck";
  if (raw === "fine_dining") return "fine-dining";
  if (raw === "coffee") return "cafes";
  if (raw === "bbq") return "grill";
  if (raw === "fast food") return "fast-food";
  if (raw === "street food") return "street-food";
  if (raw === "gluten free") return "gluten-free";
  if (raw === "food truck") return "food-truck";
  if (raw === "fine dining") return "fine-dining";
  return raw;
}

function matchesRequestedCuisineText(text: unknown, requestedCuisine: string): boolean {
  const normalizedCuisine = normalizeCuisineTag(requestedCuisine);
  if (!normalizedCuisine) return true;
  const normalizedText = normalizeForDedup(text);
  if (!normalizedText) return false;
  const terms = CUISINE_TERMS[normalizedCuisine] || [normalizedCuisine];
  return terms.some((term) => normalizedText.includes(normalizeForDedup(term)));
}

function matchesAnyRequestedCuisineText(text: unknown, requestedCuisines: string[] = []): boolean {
  const cuisines = requestedCuisines.map(normalizeCuisineTag).filter(Boolean);
  if (cuisines.length === 0) return true;
  return cuisines.some((cuisine) => matchesRequestedCuisineText(text, cuisine));
}

function activityMatchesRequestedCuisines(activity: any, requestedCuisines: string[] = []): boolean {
  if (requestedCuisines.length === 0) return true;
  const combined = `${getActivityName(activity)} ${activity?.description || ""} ${activity?.matchReason || ""} ${activity?.category || ""} ${activity?.address || ""}`;
  return matchesAnyRequestedCuisineText(combined, requestedCuisines);
}

/**
 * Detects when a candidate restaurant is clearly tagged for a DIFFERENT meal
 * period than the one we're searching for (e.g. a "breakfast café" returned
 * for a "dinner" search). Used to prevent meal-period mixing in SerpAPI/Serper
 * results. Returns true when the candidate conflicts and should be rejected.
 *
 * Conservative: only rejects when there is a STRONG signal of a different
 * meal period in the candidate text (name/address/types). Ambiguous results
 * (no meal-period words) are accepted so we don't drop generic restaurants.
 */
function candidateConflictsWithMealSlot(
  candidateText: unknown,
  meal: "breakfast" | "lunch" | "dinner" | "snack",
): boolean {
  const text = String(candidateText || "").toLowerCase();
  if (!text) return false;
  const hasBreakfast = /(breakfast|brunch|فطور|برانش|كافيه فطور|breakfast cafe|breakfast spot)/i.test(text);
  const hasDinner = /(dinner|fine dining|steakhouse|عشاء|مطعم عشاء|dinner only)/i.test(text);
  const hasNight = /(night club|nightclub|late night|after hours|سهرة)/i.test(text);
  if (meal === "breakfast") {
    // A pure dinner/steakhouse/nightclub spot is almost never a good breakfast pick.
    if ((hasDinner || hasNight) && !hasBreakfast) return true;
  } else if (meal === "dinner") {
    // A spot explicitly tagged as breakfast/brunch only is a conflict for dinner.
    if (hasBreakfast && !hasDinner && /only|exclusively|فقط/i.test(text)) return true;
  }
  // Snack and lunch are flexible — accept any restaurant.
  return false;
}

function buildSelectedInterestSet(interests: string[] = [], extraText = ""): Set<string> {
  const explicitSelections = interests.map(normalizeInterestTag).filter(Boolean);
  if (explicitSelections.length > 0) {
    return new Set(explicitSelections);
  }

  const detected = new Set<string>();
  const source = String(extraText || "");
  if (!source.trim()) return detected;

  const structuredBlocks: string[] = [];
  const inlineMatches = source.matchAll(/(?:activity\s*preferences?|interests?)\s*[:=]\s*([^\n]+)/gi);
  for (const match of inlineMatches) {
    if (match[1]) structuredBlocks.push(match[1]);
  }

  const sectionMatch = source.match(/(?:^|\n)\s*(?:activity\s*preferences?|interests?)\s*\n([\s\S]*?)(?=\n\s*(?:trip\s*type|food\s*preferences?|preferred?\s*cuisines?|mandatory meal requirements|critical rules|special requests?|$))/i);
  if (sectionMatch?.[1]) structuredBlocks.push(sectionMatch[1]);

  structuredBlocks
    .join("\n")
    .split(/[\n,،•]+/)
    .map((item) => item.replace(/^[-*\s]+/, "").trim())
    .forEach((item) => {
      const normalized = normalizeInterestTag(item);
      if (normalized && INTEREST_KEYWORDS[normalized]) {
        detected.add(normalized);
      }
    });

  return detected;
}

// Runtime registry of anchor coordinates for cities NOT in CITY_PLACES.
// Populated from request payload (frontend sends destination lat/lng) and from
// confirmed match-anchor activities so radius filtering still works for global
// cities like Monterrey, Orlando, etc.
const dynamicCityAnchors: Map<string, { lat: number; lng: number }> = new Map();

function registerDynamicCityAnchor(cityName: string, lat: number, lng: number): void {
  if (!cityName || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
  const key = String(cityName).toLowerCase().trim();
  if (!key) return;
  // Only set first valid coords per city; later updates overwrite if previous was 0
  const existing = dynamicCityAnchors.get(key);
  if (existing && Number.isFinite(existing.lat) && existing.lat !== 0) return;
  dynamicCityAnchors.set(key, { lat, lng });
}

function getCitySearchAnchor(cityName: string): { lat: number; lng: number; zoom: number } | null {
  const cityKey = getCityKey(cityName);
  const landmarks = cityKey ? CITY_PLACES[cityKey]?.landmarks : null;
  if (landmarks?.length) {
    const sample = landmarks.slice(0, Math.min(5, landmarks.length));
    const lat = sample.reduce((sum, place) => sum + (Number(place?.lat) || 0), 0) / sample.length;
    const lng = sample.reduce((sum, place) => sum + (Number(place?.lng) || 0), 0) / sample.length;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, zoom: cityKey === "dubai" || cityKey === "abudhabi" ? 11 : 12 };
    }
  }

  // Dynamic fallback for cities not in CITY_PLACES (Monterrey, Orlando, etc.)
  const dynKey = String(cityName || "").toLowerCase().trim();
  if (dynKey) {
    const dyn = dynamicCityAnchors.get(dynKey)
      || dynamicCityAnchors.get(dynKey.split(/[,،]/)[0].trim())
      || dynamicCityAnchors.get(dynKey.split(/\s+/)[0]);
    if (dyn && Number.isFinite(dyn.lat) && Number.isFinite(dyn.lng)) {
      return { lat: dyn.lat, lng: dyn.lng, zoom: 11 };
    }
  }
  return null;
}


function mergeCityData(primary: CityData | null, secondary: CityData | null): CityData | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const landmarkMap = new Map<string, PlaceInfo>();
  for (const place of [...primary.landmarks, ...secondary.landmarks]) {
    const key = normalizeForDedup(`${place?.nameAr || place?.name}|${place?.address || ""}`);
    if (!key || landmarkMap.has(key)) continue;
    landmarkMap.set(key, place);
  }

  const restaurantMap = new Map<string, RestaurantInfo>();
  for (const restaurant of [...primary.restaurants, ...secondary.restaurants]) {
    const key = normalizeForDedup(`${restaurant?.type || ""}|${restaurant?.nameAr || restaurant?.name}|${restaurant?.address || ""}`);
    if (!key || restaurantMap.has(key)) continue;
    restaurantMap.set(key, restaurant);
  }

  return {
    landmarks: Array.from(landmarkMap.values()),
    restaurants: Array.from(restaurantMap.values()),
  };
}

function mapInterestToActivityCategory(interest: string): string {
  switch (normalizeInterestTag(interest)) {
    case "culture":
      return "cultural";
    case "art":
      return "art";
    case "shopping":
      return "shopping";
    case "nature":
      return "nature";
    case "beach":
      return "beach";
    case "relaxation":
      return "relaxation";
    case "sports":
      return "sports";
    case "adventure":
      return "adventure";
    case "entertainment":
      return "entertainment";
    case "nightlife":
      return "nightlife";
    default:
      return "attraction";
  }
}

function categoryToInterestKey(category: unknown): string {
  const normalized = normalizeInterestTag(category);
  if (normalized === "cultural") return "culture";
  if (["nature", "shopping", "culture", "beach", "adventure", "art", "entertainment", "relaxation", "nightlife", "sports"].includes(normalized)) {
    return normalized;
  }
  return "";
}

function inferDataDrivenInterestKey(activity: any): string {
  if (!activity || isMealCategory(activity?.category) || isFoodLikePlace(activity)) return "meal";
  const raw = activity?._raw && typeof activity._raw === "object" ? activity._raw : activity;
  const mapped = mapSerpCategory(raw);
  const mappedInterest = categoryToInterestKey(mapped);
  if (mappedInterest) return mappedInterest;
  const rawTag = categoryToInterestKey(raw?.category || raw?.type);
  return rawTag;
}

function getInterestMatchDetails(activity: any, selectedInterests: Set<string>): { matchedInterests: string[]; primaryInterest: string } {
  if (!selectedInterests || selectedInterests.size === 0) return { matchedInterests: [], primaryInterest: "" };
  const matchedInterests = Array.from(selectedInterests).filter((interest) => activityMatchesSelectedInterests(activity, new Set([interest])));
  return {
    matchedInterests,
    primaryInterest: matchedInterests[0] || "",
  };
}

function attachPreferenceMetadata(activity: any, selectedInterests: Set<string>, isArabic = false): any {
  if (isMealCategory(activity?.category) || isMealCategory(activity?.type)) {
    return {
      ...activity,
      preferenceMatch: {
        matchedInterests: [],
        primaryInterest: "",
        sourceCategory: String(activity?.category || activity?.type || "meal"),
        alignedCategory: String(activity?.category || activity?.type || "meal"),
        reason: isArabic ? "وجبة مطلوبة ضمن الخطة" : "Required meal included in plan",
        matched: false,
      },
    };
  }

  const details = getInterestMatchDetails(activity, selectedInterests);
  const categoryFallback = String(activity?.category || activity?.type || "attraction");
  const alignedCategory = details.primaryInterest
    ? mapInterestToActivityCategory(details.primaryInterest)
    : categoryFallback;
  const preferenceMatch = {
    matchedInterests: details.matchedInterests,
    primaryInterest: details.primaryInterest,
    sourceCategory: categoryFallback,
    alignedCategory,
    reason: details.primaryInterest
      ? (isArabic ? `مطابق لتفضيل ${interestToArabicLabel(details.primaryInterest)}` : `Matches ${details.primaryInterest}`)
      : (isArabic ? "تمت إضافته كخيار احتياطي" : "Added as fallback option"),
    matched: details.matchedInterests.length > 0,
  };

  return {
    ...activity,
    category: alignedCategory,
    matchReason: activity?.matchReason || (preferenceMatch.matched ? preferenceMatch.reason : activity?.matchReason),
    preferenceMatch,
  };
}

function interestToArabicLabel(interest: string): string {
  const map: Record<string, string> = {
    nature: "طبيعة",
    shopping: "تسوق",
    culture: "ثقافة وتاريخ",
    beach: "شواطئ",
    adventure: "مغامرات",
    art: "فن ومتاحف",
    entertainment: "ترفيه",
    relaxation: "استرخاء",
    nightlife: "حياة ليلية",
    sports: "رياضة",
  };
  return map[normalizeInterestTag(interest)] || interest;
}

function detectActivityInterestTag(activity: any, selectedInterests: Set<string>): string {
  if (selectedInterests.size === 0) return "";
  for (const interest of selectedInterests) {
    if (activityMatchesSelectedInterests(activity, new Set([interest]))) {
      return interestToArabicLabel(interest);
    }
  }
  return "";
}

// Returns the matched interest tag (English) for an activity, or "" if none.
function detectMatchedInterestKey(activity: any, selectedInterests: Set<string>): string {
  if (selectedInterests.size === 0) return "";
  for (const interest of selectedInterests) {
    if (activityMatchesSelectedInterests(activity, new Set([interest]))) {
      return interest;
    }
  }
  return "";
}

// When a user explicitly selected interests, override the activity's display
// category to align with the matched interest (e.g. "adventure" instead of "nature"
// for a theme park selected because the user chose Adventure). Falls back to the
// activity's original category when no interest match is found.
function getInterestAlignedCategory(activity: any, selectedInterests: Set<string>, fallback: string): string {
  if (!selectedInterests || selectedInterests.size === 0) return fallback || "attraction";
  const matched = detectMatchedInterestKey(activity, selectedInterests);
  if (!matched) return fallback || "attraction";
  // Map the matched interest to a display category bucket
  return mapInterestToActivityCategory(matched) || fallback || "attraction";
}

function activityMatchesSelectedInterests(activity: any, selectedInterests: Set<string>): boolean {
  if (selectedInterests.size === 0) return true;
  if (isMealCategory(activity?.category)) return false;
  // Restaurants/food venues are valid only for meal slots. Never let the AI or
  // keyword matcher relabel a restaurant as nature/culture/shopping/etc.
  if (isFoodLikePlace(activity)) return false;

  const dataInterest = inferDataDrivenInterestKey(activity);
  if (dataInterest && dataInterest !== "meal") {
    return selectedInterests.has(dataInterest);
  }

  const matchedInterests = Array.isArray(activity?.preferenceMatch?.matchedInterests)
    ? activity.preferenceMatch.matchedInterests.map((item: string) => normalizeInterestTag(item)).filter(Boolean)
    : [];
  const primaryInterest = normalizeInterestTag(
    activity?.preferenceMatch?.primaryInterest
    || activity?.preferenceMatch?.alignedCategory
    || activity?.preferenceMatch?.sourceCategory,
  );
  if (matchedInterests.some((interest: string) => selectedInterests.has(interest)) || (primaryInterest && selectedInterests.has(primaryInterest))) {
    return true;
  }

  const cat = categoryToInterestKey(activity?.category || activity?.type);
  if (cat && selectedInterests.has(cat)) return true;

  const combined = `${getActivityName(activity)} ${activity?.description || ""} ${activity?.address || activity?.location || ""} ${activity?.category || activity?.type || ""}`;
  return Array.from(selectedInterests).some((interest) => INTEREST_KEYWORDS[interest]?.test(combined));
}

function filterLandmarksBySelectedInterests(landmarks: PlaceInfo[], selectedInterests: Set<string>) {
  if (selectedInterests.size === 0) return landmarks;
  return landmarks.filter((landmark) => activityMatchesSelectedInterests(landmark, selectedInterests));
}

type InterestSearchSeed = {
  query: string;
  category: string;
  description: string;
  interestKey: string;
};

function buildInterestSearchSeeds(destination: string, selectedInterests: Set<string>, prefs: PreferenceFlags): InterestSearchSeed[] {
  const seeds: InterestSearchSeed[] = [];
  const seen = new Set<string>();
  const addSeed = (query: string, category: string, description: string, interestKey: string) => {
    const key = normalizeForDedup(`${query}|${category}|${interestKey}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    seeds.push({ query, category, description, interestKey });
  };

  // Each interest contributes 2-3 high-signal queries that mirror how users
  // actually phrase Google Maps searches. Different phrasings surface different
  // result clusters (e.g. "live music venues" vs "comedy clubs" return very
  // different lists). The request-scoped cache de-dupes identical (q|city)
  // pairs so we never pay twice for the same query in one trip generation.
  // Expanded keyword bank per interest: combines [intent] + [activity] + [place type]
  // with synonyms and near-keywords so SerpAPI returns richer, more diverse clusters.
  if (selectedInterests.has("nature")) {
    addSeed(`best parks and national parks in ${destination}`, "nature", `parks in ${destination}`, "nature");
    addSeed(`botanical gardens nature reserves in ${destination}`, "nature", `gardens & reserves in ${destination}`, "nature");
    addSeed(`scenic viewpoints natural landscapes in ${destination}`, "nature", `scenic spots in ${destination}`, "nature");
    addSeed(`hiking trails forests waterfalls in ${destination}`, "nature", `outdoor nature in ${destination}`, "nature");
    addSeed(`lakes rivers wildlife eco tourism in ${destination}`, "nature", `eco tourism in ${destination}`, "nature");
  }
  if (selectedInterests.has("shopping")) {
    addSeed(`best shopping malls retail stores in ${destination}`, "shopping", `malls in ${destination}`, "shopping");
    addSeed(`outlet centers luxury shopping boutiques in ${destination}`, "shopping", `luxury shopping in ${destination}`, "shopping");
    addSeed(`local markets souks bazaars traditional markets in ${destination}`, "shopping", `markets in ${destination}`, "shopping");
    addSeed(`fashion stores lifestyle shopping districts in ${destination}`, "shopping", `shopping districts in ${destination}`, "shopping");
  }
  if (selectedInterests.has("culture")) {
    addSeed(`best museums cultural centers in ${destination}`, "cultural", `museums in ${destination}`, "culture");
    addSeed(`historic landmarks heritage sites monuments in ${destination}`, "cultural", `landmarks in ${destination}`, "culture");
    addSeed(`old town historic district ancient ruins in ${destination}`, "cultural", `historic district in ${destination}`, "culture");
    addSeed(`unesco heritage archaeology sites in ${destination}`, "cultural", `heritage in ${destination}`, "culture");
    addSeed(`local culture traditions heritage villages in ${destination}`, "cultural", `local culture in ${destination}`, "culture");
  }
  if (selectedInterests.has("beach")) {
    addSeed(`best beaches coastline seaside in ${destination}`, "beach", `beaches in ${destination}`, "beach");
    addSeed(`beach clubs beach resorts coastal attractions in ${destination}`, "beach", `beach clubs in ${destination}`, "beach");
    addSeed(`marina waterfront promenade boardwalk in ${destination}`, "beach", `waterfront in ${destination}`, "beach");
    addSeed(`snorkeling diving swimming spots in ${destination}`, "beach", `water activities in ${destination}`, "beach");
    addSeed(`hidden beaches island beaches marine life in ${destination}`, "beach", `hidden beaches in ${destination}`, "beach");
  }
  if (selectedInterests.has("adventure")) {
    addSeed(`adventure tours outdoor adventure activities in ${destination}`, "activity", `adventure tours in ${destination}`, "adventure");
    addSeed(`zipline rock climbing rappelling in ${destination}`, "activity", `extreme sports in ${destination}`, "adventure");
    addSeed(`desert safari dune bashing off road in ${destination}`, "activity", `safari in ${destination}`, "adventure");
    addSeed(`scuba diving skydiving paragliding in ${destination}`, "activity", `adrenaline activities in ${destination}`, "adventure");
    addSeed(`hiking trekking exploration adventure in ${destination}`, "activity", `outdoor adventure in ${destination}`, "adventure");
  }
  if (selectedInterests.has("art")) {
    addSeed(`art galleries exhibitions in ${destination}`, "museum", `art galleries in ${destination}`, "art");
    addSeed(`contemporary modern art museums in ${destination}`, "museum", `art museums in ${destination}`, "art");
    addSeed(`sculpture gardens public art installations in ${destination}`, "museum", `public art in ${destination}`, "art");
    addSeed(`photography galleries design museums in ${destination}`, "museum", `design & photo in ${destination}`, "art");
    addSeed(`fine arts visual arts creative spaces in ${destination}`, "museum", `creative spaces in ${destination}`, "art");
  }
  if (selectedInterests.has("entertainment")) {
    // FAMILY-FRIENDLY entertainment ONLY — adult-only venues (bars, lounges,
    // nightclubs) require the user to explicitly select "nightlife".
    addSeed(`family entertainment center fun activities in ${destination}`, "entertainment", `family entertainment in ${destination}`, "entertainment");
    addSeed(`theme park amusement park attractions in ${destination}`, "entertainment", `theme parks in ${destination}`, "entertainment");
    addSeed(`indoor activities arcades games for families in ${destination}`, "entertainment", `indoor activities in ${destination}`, "entertainment");
    addSeed(`family friendly shows theaters cinemas in ${destination}`, "entertainment", `family shows in ${destination}`, "entertainment");
    addSeed(`aquarium zoo planetarium science center in ${destination}`, "entertainment", `family attractions in ${destination}`, "entertainment");
    addSeed(`festivals events family attractions in ${destination}`, "entertainment", `festivals & events in ${destination}`, "entertainment");
  }
  if (selectedInterests.has("relaxation")) {
    addSeed(`best spa wellness centers massage in ${destination}`, "activity", `spa in ${destination}`, "relaxation");
    addSeed(`yoga meditation mindfulness retreat in ${destination}`, "activity", `wellness retreat in ${destination}`, "relaxation");
    addSeed(`peaceful quiet calm scenic places in ${destination}`, "activity", `calm spots in ${destination}`, "relaxation");
    addSeed(`cozy tea house lounge garden chill spots in ${destination}`, "activity", `cozy spots in ${destination}`, "relaxation");
    addSeed(`sunset viewpoints rooftop nature escape in ${destination}`, "activity", `relaxing views in ${destination}`, "relaxation");
  }
  if (selectedInterests.has("nightlife")) {
    addSeed(`rooftop bars lounges in ${destination}`, "entertainment", `rooftop bars in ${destination}`, "nightlife");
    addSeed(`cocktail lounges nightclubs night entertainment in ${destination}`, "entertainment", `nightclubs in ${destination}`, "nightlife");
    addSeed(`live music venues night cafes in ${destination}`, "entertainment", `live music nights in ${destination}`, "nightlife");
    addSeed(`evening activities night events social spots in ${destination}`, "entertainment", `evening activities in ${destination}`, "nightlife");
    addSeed(`late night hangouts night vibes in ${destination}`, "entertainment", `late night spots in ${destination}`, "nightlife");
  }
  if (selectedInterests.has("sports")) {
    addSeed(`stadium arena sports venue facilities in ${destination}`, "activity", `sports venues in ${destination}`, "sports");
    addSeed(`fitness centers gyms training in ${destination}`, "activity", `fitness in ${destination}`, "sports");
    addSeed(`football basketball tennis games in ${destination}`, "activity", `sports events in ${destination}`, "sports");
    addSeed(`water sports swimming cycling running in ${destination}`, "activity", `physical activities in ${destination}`, "sports");
    addSeed(`sports complex tour stadium experience in ${destination}`, "activity", `sports tour in ${destination}`, "sports");
  }

  if (selectedInterests.size === 0) {
    if (prefs.isRomantic) addSeed(`best romantic viewpoints waterfront sunset spots in ${destination}`, "activity", `romantic experience in ${destination}`, "relaxation");
    if (prefs.isFamily) addSeed(`best family friendly aquarium zoo theme park in ${destination}`, "activity", `family experience in ${destination}`, "entertainment");
    if (prefs.isAdventure) addSeed(`best adventure tours hiking outdoor activities in ${destination}`, "activity", `adventure experience in ${destination}`, "adventure");
    if (prefs.isLuxury) addSeed(`best luxury iconic observation decks experiences in ${destination}`, "attraction", `luxury experience in ${destination}`, "culture");
    if (prefs.isEconomic) addSeed(`best free budget friendly museums parks landmarks in ${destination}`, "cultural", `budget friendly experience in ${destination}`, "culture");
    if (prefs.isSolo) addSeed(`best solo traveler safe museums cafes viewpoints in ${destination}`, "activity", `solo experience in ${destination}`, "culture");
  }

  if (seeds.length === 0) {
    addSeed(`top rated landmark heritage site in ${destination}`, "cultural", `cultural experience in ${destination}`, "culture");
    addSeed(`scenic park waterfront viewpoint in ${destination}`, "nature", `outdoor experience in ${destination}`, "nature");
    addSeed(`popular market shopping district in ${destination}`, "shopping", `shopping experience in ${destination}`, "shopping");
  }

  return seeds;
}

// Balance search seeds across selected interests so each interest gets at
// least one query before duplicates of the same interest are considered.
// Mirrors the round-robin used for activity selection — keeps SerpAPI cost
// flat (we cap at maxQueries) while guaranteeing coverage.
function balanceSerpSeedsByInterest(
  seeds: InterestSearchSeed[],
  selectedInterests: Set<string>,
  maxQueries: number,
): InterestSearchSeed[] {
  if (!Array.isArray(seeds) || seeds.length === 0 || maxQueries <= 0) return [];
  if (selectedInterests.size === 0) return seeds.slice(0, maxQueries);

  const interestToSeeds = new Map<string, InterestSearchSeed[]>();
  const ordered = Array.from(selectedInterests);
  for (const interest of ordered) interestToSeeds.set(interest, []);

  for (const seed of seeds) {
    const interestKey = normalizeInterestTag(seed.interestKey);
    if (interestKey && interestToSeeds.has(interestKey)) interestToSeeds.get(interestKey)!.push(seed);
  }

  // Round-robin: take one seed from each interest, then loop back for seconds.
  const result: typeof seeds = [];
  const cursors = new Map<string, number>(ordered.map((i) => [i, 0]));
  let progress = true;
  while (result.length < maxQueries && progress) {
    progress = false;
    for (const interest of ordered) {
      if (result.length >= maxQueries) break;
      const list = interestToSeeds.get(interest) || [];
      const cursor = cursors.get(interest) ?? 0;
      if (cursor < list.length) {
        result.push(list[cursor]);
        cursors.set(interest, cursor + 1);
        progress = true;
      }
    }
  }

  // Fallback: if interests had no matched seeds (shouldn't happen), backfill from raw list.
  if (result.length < Math.min(maxQueries, seeds.length)) {
    for (const seed of seeds) {
      if (result.length >= maxQueries) break;
      if (!result.includes(seed)) result.push(seed);
    }
  }
  return result;
}

function collectUsedSearchQueriesByInterest(
  cities: string[],
  selectedInterests: Set<string>,
  prefs: PreferenceFlags,
  maxQueriesPerCity: number,
) {
  const grouped = new Map<string, Set<string>>();
  for (const interest of selectedInterests) grouped.set(interest, new Set<string>());

  for (const city of Array.from(new Set(cities.filter(Boolean)))) {
    const balanced = balanceSerpSeedsByInterest(
      buildInterestSearchSeeds(city, selectedInterests, prefs),
      selectedInterests,
      maxQueriesPerCity,
    );
    for (const seed of balanced) {
      const key = normalizeInterestTag(seed.interestKey);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, new Set<string>());
      grouped.get(key)!.add(seed.query);
    }
  }

  return Array.from(grouped.entries()).map(([key, values]) => ({
    key,
    queries: Array.from(values),
  }));
}

function prioritizeActivitiesByInterests(
  activities: any[] = [],
  selectedInterests: Set<string>,
  dayNumber: number,
  daySpecialRequests: SpecialRequestInjection[] = [],
) {
  if (!Array.isArray(activities) || activities.length <= 1) return Array.isArray(activities) ? activities : [];

  const buildIdentity = (activity: any) =>
    activityDedupKey(activity) || `name:${normalizeForDedup(getActivityName(activity))}`;

  const specialRequestActivities = activities.filter((activity) =>
    daySpecialRequests.some((request) => activityMatchesSpecialRequest(activity, request.query)),
  );
  // Tag matched activities so they survive later count-preserving trims.
  for (const activity of specialRequestActivities) {
    const match = daySpecialRequests.find((request) => activityMatchesSpecialRequest(activity, request.query));
    (activity as any).isSpecialRequest = true;
    (activity as any).specialRequestQuery = match?.query || (activity as any).specialRequestQuery;
    if (match?.aiEnhanced) {
      (activity as any).aiEnhanced = true;
      (activity as any).aiSourceQuery = match.query;
    }
    if (match?.preferredTime && !(activity as any).timeLocked) {
      (activity as any).time = match.preferredTime;
      (activity as any).timeLocked = true;
    }
  }
  const remainingActivities = activities.filter((activity) => !specialRequestActivities.includes(activity));
  const prioritized: any[] = [...specialRequestActivities];
  const usedIds = new Set(prioritized.map(buildIdentity).filter(Boolean));

  const orderedInterests = Array.from(selectedInterests).filter(Boolean);
  if (orderedInterests.length > 0) {
    const rotatedInterests = orderedInterests.map((_, index) => orderedInterests[(dayNumber - 1 + index) % orderedInterests.length]);

    for (const interest of rotatedInterests) {
      const match = remainingActivities.find((activity) => {
        const identity = buildIdentity(activity);
        if (!identity || usedIds.has(identity)) return false;
        return activityMatchesSelectedInterests(activity, new Set([interest]));
      });

      if (!match) continue;
      const identity = buildIdentity(match);
      if (identity) usedIds.add(identity);
      prioritized.push(match);
    }
  }

  for (const activity of remainingActivities) {
    const identity = buildIdentity(activity);
    if (!identity || usedIds.has(identity)) continue;
    usedIds.add(identity);
    prioritized.push(activity);
  }

  return prioritized;
}

function capActivitiesToDailyLimit(activities: any[], maxActivitiesPerDay: number) {
  if (!Array.isArray(activities) || maxActivitiesPerDay <= 0) return [];
  return [...activities]
    .sort((a: any, b: any) => {
      const tA = String(a?.time || "12:00").replace(/[^0-9:]/g, "");
      const tB = String(b?.time || "12:00").replace(/[^0-9:]/g, "");
      return tA.localeCompare(tB);
    })
    .slice(0, maxActivitiesPerDay);
}

function buildDayInterestRotation(selectedInterests: Set<string>, dayNumber: number, targetCount: number): string[] {
  const ordered = Array.from(selectedInterests).filter(Boolean);
  if (ordered.length === 0 || targetCount <= 0) return [];
  // Rotate starting interest by day so different days lead with different interests.
  const offset = (dayNumber - 1) % ordered.length;
  const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];
  // Round-robin: cycle through ALL interests before repeating any one.
  // e.g. interests=[ent,night,art], target=8 -> ent,night,art,ent,night,art,ent,night
  return Array.from({ length: targetCount }, (_, index) => rotated[index % rotated.length]);
}

// Compute minimum quota each selected interest should receive given a target count.
// Ensures fair distribution: e.g. 3 interests, target=8 -> floor(8/3)=2 each, +remainder.
function computeInterestQuotas(selectedInterests: Set<string>, targetCount: number): Map<string, number> {
  const quotas = new Map<string, number>();
  const ordered = Array.from(selectedInterests).filter(Boolean);
  if (ordered.length === 0 || targetCount <= 0) return quotas;
  const base = Math.floor(targetCount / ordered.length);
  let remainder = targetCount - base * ordered.length;
  for (const interest of ordered) {
    quotas.set(interest, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return quotas;
}

function enrichActivityMatchReasonForInterest(activity: any, preferredInterest: string, isArabic: boolean) {
  const currentReason = String(activity?.matchReason || "").trim();
  if (currentReason) return currentReason;
  return isArabic ? `مطابق لتفضيل ${interestToArabicLabel(preferredInterest)}` : `Matches ${preferredInterest}`;
}

function forceInterestTaggedActivity(activity: any, preferredInterest: string, isArabic: boolean) {
  const normalizedInterest = normalizeInterestTag(preferredInterest);
  const sourceCategory = String(activity?.category || activity?.type || "attraction");

  // SAFETY: never relabel a clearly food/restaurant venue as a non-meal interest
  // (this caused restaurants to be displayed as "Beach", "Nature", etc.).
  // If the venue is food-like, keep its meal/restaurant category and skip the
  // forced interest tagging entirely — the meal-slot logic will handle it.
  if (isFoodLikePlace(activity) || isMealCategory(sourceCategory)) {
    const safeCategory = isMealCategory(sourceCategory) ? sourceCategory : "restaurant";
    return {
      ...activity,
      category: safeCategory,
      categoryReason: describeCategoryReason(activity, safeCategory, isArabic),
      preferenceMatch: {
        matchedInterests: [],
        primaryInterest: "",
        sourceCategory,
        alignedCategory: safeCategory,
        reason: isArabic ? "خيار مطعم" : "Restaurant choice",
        matched: false,
      },
    };
  }

  // SAFETY: only force a category when the activity actually matches the
  // requested interest by data signals (Serp type / keywords). Otherwise keep
  // the original mapped category — this prevents shopping malls from being
  // labelled as "nature" or museums from being labelled as "beach".
  const dataInterest = inferDataDrivenInterestKey(activity);
  const keywordMatch = normalizedInterest && INTEREST_KEYWORDS[normalizedInterest]?.test(
    `${getActivityName(activity)} ${activity?.description || ""} ${activity?.address || ""} ${sourceCategory}`,
  );
  const honestlyMatches = dataInterest === normalizedInterest || Boolean(keywordMatch);
  const alignedCategory = honestlyMatches
    ? (mapInterestToActivityCategory(normalizedInterest) || sourceCategory)
    : sourceCategory;
  const reason = enrichActivityMatchReasonForInterest(activity, normalizedInterest, isArabic);

  return {
    ...activity,
    category: alignedCategory,
    matchReason: reason,
    categoryReason: describeCategoryReason(activity, alignedCategory, isArabic),
    preferenceMatch: {
      matchedInterests: honestlyMatches && normalizedInterest ? [normalizedInterest] : [],
      primaryInterest: honestlyMatches ? normalizedInterest : "",
      sourceCategory,
      alignedCategory,
      reason,
      matched: honestlyMatches && Boolean(normalizedInterest),
    },
  };
}

function selectActivitiesForExactDailyCount(
  activities: any[],
  targetCount: number,
  selectedInterests: Set<string>,
  dayNumber: number,
  daySpecialRequests: SpecialRequestInjection[] = [],
  isArabic = false,
  requestedCuisines: string[] = [],
) {
  if (!Array.isArray(activities) || targetCount <= 0) return [];

  const normalizedSpecials = new Set(daySpecialRequests.map((request) => normalizeForDedup(request.query)).filter(Boolean));
  // STRICT cuisine guard: when the user picked specific cuisines, every meal
  // must match at least ONE of them. Non-matching restaurants are dropped
  // entirely instead of being silently inserted into the day.
  const cuisineNorms = (requestedCuisines || []).map(normalizeCuisineTag).filter(Boolean);
  const mealPassesCuisine = (activity: any) => {
    if (cuisineNorms.length === 0) return true;
    if (!isMealCategory(activity?.category)) return true;
    return activityMatchesRequestedCuisines(activity, cuisineNorms);
  };
  const allMealsRaw = activities.filter((activity: any) => isMealCategory(activity?.category));
  const meals = allMealsRaw.filter(mealPassesCuisine);
  const droppedForCuisine = allMealsRaw.length - meals.length;
  if (droppedForCuisine > 0) {
    console.log(`[strict-cuisine] day ${dayNumber}: rejected ${droppedForCuisine} meal(s) — did not match cuisines [${cuisineNorms.join(",")}]`);
  }
  const nonMeals = activities.filter((activity: any) => !isMealCategory(activity?.category));
  const picked: any[] = [];
  const used = new Set<string>();

  const addUnique = (activity: any, preferredInterest?: string) => {
    const key = activityDedupKey(activity) || activityNameSeenKey(activity);
    if (!key || used.has(key)) return false;
    used.add(key);
    const withReason = preferredInterest
      ? { ...activity, matchReason: enrichActivityMatchReasonForInterest(activity, preferredInterest, isArabic) }
      : activity;
    const nextActivity = attachPreferenceMetadata(withReason, selectedInterests, isArabic);
    picked.push(nextActivity);
    return true;
  };

  for (const meal of meals) addUnique(meal);
  if (picked.length >= targetCount) return capActivitiesToDailyLimit(picked, targetCount);

  const specialMatches = nonMeals.filter((activity: any) =>
    activity?.isSpecialRequest || activity?.specialRequestQuery ||
    daySpecialRequests.some((request) => activityMatchesSpecialRequest(activity, request.query)),
  );
  for (const activity of specialMatches) {
    if (picked.length >= targetCount) break;
    addUnique(activity);
  }

  // PHASE 1: Enforce per-interest quotas using round-robin so no single interest dominates.
  // We pick (1 from interest A, 1 from B, 1 from C, ...) and repeat until quotas are filled.
  if (selectedInterests.size > 0) {
    const quotas = computeInterestQuotas(selectedInterests, Math.max(0, targetCount - picked.length));
    const filled = new Map<string, number>();
    for (const interest of quotas.keys()) filled.set(interest, 0);
    // Rotate starting interest based on day number for variety across days.
    const orderedInterests = Array.from(quotas.keys());
    const offset = (dayNumber - 1) % Math.max(1, orderedInterests.length);
    const rotated = [...orderedInterests.slice(offset), ...orderedInterests.slice(0, offset)];

    let progress = true;
    while (picked.length < targetCount && progress) {
      progress = false;
      for (const interest of rotated) {
        if (picked.length >= targetCount) break;
        const quota = quotas.get(interest) ?? 0;
        if ((filled.get(interest) ?? 0) >= quota) continue;
        const match = nonMeals.find((activity: any) => {
          const key = activityDedupKey(activity) || activityNameSeenKey(activity);
          if (!key || used.has(key)) return false;
          return activityMatchesSelectedInterests(activity, new Set([interest]));
        });
        if (match) {
          addUnique(match, interest);
          filled.set(interest, (filled.get(interest) ?? 0) + 1);
          progress = true;
        }
      }
    }
  }

  // PHASE 2: Backfill any remaining slots with anything matching ANY selected interest
  // (interests that ran out of pool will leave their quota unfilled — borrow from others).
  const remainingByInterest = nonMeals.filter((activity: any) => {
    const key = activityDedupKey(activity) || activityNameSeenKey(activity);
    if (!key || used.has(key)) return false;
    return selectedInterests.size === 0 || activityMatchesSelectedInterests(activity, selectedInterests);
  });
  for (const activity of remainingByInterest) {
    if (picked.length >= targetCount) break;
    const preferredInterest = Array.from(selectedInterests).find((interest) => activityMatchesSelectedInterests(activity, new Set([interest])));
    addUnique(activity, preferredInterest);
  }

  const otherSpecials = nonMeals.filter((activity: any) => {
    const key = activityDedupKey(activity) || activityNameSeenKey(activity);
    if (!key || used.has(key)) return false;
    const normalizedName = normalizeForDedup(getActivityName(activity));
    return normalizedSpecials.has(normalizedName) || daySpecialRequests.some((request) => activityMatchesSpecialRequest(activity, request.query));
  });
  for (const activity of otherSpecials) {
    if (picked.length >= targetCount) break;
    addUnique(activity);
  }

  for (const activity of nonMeals) {
    if (picked.length >= targetCount) break;
    addUnique(activity);
  }

  return capActivitiesToDailyLimit(picked, targetCount);
}

function matchActivityIdentity(activity: any): string {
  const teamA = normalizeForDedup(activity?.matchTeams?.a || "");
  const teamB = normalizeForDedup(activity?.matchTeams?.b || "");
  if (!teamA || !teamB) return "";
  const kickoff = normalizeForDedup(activity?.matchKickoff || activity?.startTime || activity?.time || "");
  const venue = normalizeForDedup(activity?.matchVenue || activity?.address || activity?.location || getActivityName(activity));
  return `match:${teamA}|${teamB}|${kickoff || venue}`;
}

function getActivitySelectionPriority(activity: any): number {
  if (activity?.isMatchAnchor) return 0;
  if (matchActivityIdentity(activity)) return 1;
  if (activity?.isSpecialRequest || activity?.specialRequestQuery) return 2;
  if (isMealCategory(activity?.category)) return 3;
  return 4;
}

function dedupeActivitiesByPriority(activities: any[] = []): any[] {
  const seen = new Set<string>();
  const unique: any[] = [];

  const ordered = [...activities]
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const priorityDelta = getActivitySelectionPriority(a) - getActivitySelectionPriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      const timeA = String(a?.time || a?.startTime || "12:00");
      const timeB = String(b?.time || b?.startTime || "12:00");
      return timeA.localeCompare(timeB);
    });

  for (const activity of ordered) {
    const keys = activityIdentityKeys(activity);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    unique.push(activity);
  }

  return unique;
}

function dedupeActivitiesForDisplay(activities: any[] = [], scope = "day"): { activities: any[]; removed: number } {
  const seen = new Set<string>();
  const out: any[] = [];
  let removed = 0;
  for (const activity of dedupeActivitiesByPriority(activities)) {
    const keys = activityIdentityKeys(activity);
    const compactTime = String(activity?.time || activity?.startTime || "").replace(/\s+/g, "").toLowerCase();
    const compactHours = normalizeForDedup(activity?.openingHours || activity?.hours || "");
    const displayKeys = [
      ...keys,
      compactTime && compactHours ? `time-hours:${compactTime}|${compactHours}` : "",
    ].filter(Boolean);
    if (displayKeys.some((key) => seen.has(key))) {
      removed++;
      console.log(`[dedupe:${scope}] Removed duplicate display item "${getActivityName(activity)}"`, { time: activity?.time, category: activity?.category });
      continue;
    }
    displayKeys.forEach((key) => seen.add(key));
    out.push(activity);
  }
  return { activities: out, removed };
}

function preserveExactDailyCountWithMeals(
  activities: any[],
  targetCount: number,
  requestedMeals: Array<"breakfast" | "lunch" | "dinner" | "snack"> = [],
  backupCandidates: any[] = [],
  requestedCuisines: string[] = [],
) {
  if (targetCount <= 0) return [];

  const cuisineNorms = (requestedCuisines || []).map(normalizeCuisineTag).filter(Boolean);
  const passesCuisineGuard = (candidate: any) => {
    if (cuisineNorms.length === 0) return true;
    if (!isMealCategory(candidate?.category)) return true;
    return activityMatchesRequestedCuisines(candidate, cuisineNorms);
  };

  const finalActivities: any[] = [];
  const seen = new Set<string>();
  const rawAll = dedupeActivitiesByPriority([
    ...(Array.isArray(activities) ? activities : []),
    ...(Array.isArray(backupCandidates) ? backupCandidates : []),
  ]);
  const allCandidates = rawAll.filter(passesCuisineGuard);

  const addUnique = (candidate: any) => {
    if (!candidate) return false;
    const keys = activityIdentityKeys(candidate);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    finalActivities.push(candidate);
    return true;
  };

  // Match anchors are user-selected fixed events, so they must survive any
  // count-preserving trim before meals or generic attractions.
  for (const matchAnchor of allCandidates.filter((activity: any) => activity?.isMatchAnchor || !!matchActivityIdentity(activity))) {
    if (finalActivities.length >= targetCount) break;
    addUnique(matchAnchor);
  }

  // Special requests (e.g. basketball) are LOCKED - never pruned
  for (const special of allCandidates.filter((activity: any) => activity?.isSpecialRequest || activity?.specialRequestQuery)) {
    addUnique(special); // do not break on targetCount - we'll trim non-locked later
  }

  for (const meal of requestedMeals) {
    const match = allCandidates.find((activity: any) => String(activity?.category || "").toLowerCase() === meal);
    if (finalActivities.length >= targetCount) break;
    addUnique(match);
  }

  const nonMeals = allCandidates.filter((activity: any) => !isMealCategory(activity?.category));
  for (const activity of nonMeals) {
    if (finalActivities.length >= targetCount) break;
    addUnique(activity);
  }

  if (finalActivities.length < targetCount) {
    for (const activity of allCandidates) {
      if (finalActivities.length >= targetCount) break;
      addUnique(activity);
    }
  }

  // Last-resort fill: relax cuisine guard rather than return fewer than target
  if (finalActivities.length < targetCount) {
    for (const activity of rawAll) {
      if (finalActivities.length >= targetCount) break;
      addUnique(activity);
    }
  }

  // If we exceeded target due to locked specials, drop lowest-priority non-locked
  if (finalActivities.length > targetCount) {
    const isLocked = (a: any) => a?.isMatchAnchor || a?.isSpecialRequest || a?.specialRequestQuery;
    const locked = finalActivities.filter(isLocked);
    const others = finalActivities.filter((a) => !isLocked(a));
    const keepOthers = Math.max(0, targetCount - locked.length);
    const trimmed = [...locked, ...others.slice(0, keepOthers)];
    return trimmed
      .sort((a: any, b: any) => String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")))
      .slice(0, Math.max(targetCount, locked.length));
  }

  return finalActivities
    .sort((a: any, b: any) => String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")))
    .slice(0, targetCount);
}


function _reshapeToActivity(p: any, day: any, idx: number, destination: string, isArabic: boolean, interestSet?: Set<string>): any {
  if (p.__serpSource === "bank") {
    return {
      id: `d${day?.dayNumber || 0}-res-${idx}`,
      name: p.title,
      description: p.description || (isArabic ? `زيارة ${p.title}` : `Visit ${p.title}`),
      category: mapSerpCategory(p),
      address: p.address,
      latitude: p.gps_coordinates?.latitude,
      longitude: p.gps_coordinates?.longitude,
      rating: p.rating,
      openingHours: extractSourceOpeningHours(p),
      googleMapsUrl: buildPlaceMapsUrl(p.title, p.address)
    };
  }
  return {
    id: `d${day?.dayNumber || 0}-res-${idx}`,
    name: p.nameAr || p.name,
    description: isArabic ? `زيارة ${p.nameAr || p.name}` : `Visit ${p.name}`,
    category: getInterestAlignedCategory(p, interestSet || new Set(), p.category || "attraction"),
    address: p.address,
    latitude: p.lat,
    longitude: p.lng,
    rating: p.rating || 4.5,
    openingHours: extractSourceOpeningHours(p),
    googleMapsUrl: buildPlaceMapsUrl(p.name, p.address)
  };
}

function buildDayPreferenceSummary(dayActivities: any[], selectedInterests: Set<string>, requestedMeals: Array<"breakfast" | "lunch" | "dinner" | "snack"> = [], isArabic = false) {
  const nonMealActivities = (dayActivities || []).filter((activity: any) => !isMealCategory(activity?.category));
  const interestBreakdown = Array.from(selectedInterests).map((interest) => {
    const matchedItems = nonMealActivities.filter((activity: any) => {
      const matchedInterests = Array.isArray(activity?.preferenceMatch?.matchedInterests)
        ? activity.preferenceMatch.matchedInterests.map((item: string) => normalizeInterestTag(item)).filter(Boolean)
        : [];
      const primaryInterest = normalizeInterestTag(activity?.preferenceMatch?.primaryInterest || activity?.preferenceMatch?.alignedCategory || activity?.category);

      if (matchedInterests.includes(interest) || primaryInterest === interest) {
        return true;
      }

      return activityMatchesSelectedInterests(activity, new Set([interest]));
    });
    return {
      key: interest,
      requested: true,
      matched: matchedItems.length > 0,
      matchedCount: matchedItems.length,
      totalItems: nonMealActivities.length,
      drivers: matchedItems
        .map((activity: any) => String(getActivityName(activity) || activity?.title || "").trim())
        .filter(Boolean)
        .slice(0, 4),
      reason: matchedItems.length > 0
        ? (isArabic ? `تم العثور على ${matchedItems.length} نشاط يطابق ${interestToArabicLabel(interest)}` : `${matchedItems.length} matching item(s) found for ${interest}`)
        : (isArabic ? `لم يتم العثور على نشاط يطابق ${interestToArabicLabel(interest)}` : `No items matched ${interest}`),
    };
  });

  const mealBreakdown = requestedMeals.map((meal) => {
    const matchedCount = (dayActivities || []).filter((activity: any) => String(activity?.category || "").toLowerCase() === meal).length;
    return {
      key: meal,
      requested: true,
      matched: matchedCount > 0,
      matchedCount,
      totalItems: 1,
      reason: matchedCount > 0
        ? (isArabic ? `تمت إضافة ${meal}` : `${meal} added`)
        : (isArabic ? `لم تتم إضافة ${meal}` : `${meal} missing`),
    };
  });

  const matchedCount = interestBreakdown.filter((item) => item.matched).length + mealBreakdown.filter((item) => item.matched).length;
  const totalRequested = interestBreakdown.length + mealBreakdown.length;

  return {
    matchedCount,
    totalRequested,
    coverage: totalRequested > 0 ? Math.round((matchedCount / totalRequested) * 100) : 100,
    interests: interestBreakdown,
    meals: mealBreakdown,
    failedReasons: [...interestBreakdown, ...mealBreakdown].filter((item) => !item.matched).map((item) => item.reason),
  };
}

function extractSpecialRequestInjections(additionalPreferences = "", prefs: PreferenceFlags, startDate?: string): SpecialRequestInjection[] {
  const injections: SpecialRequestInjection[] = [];
  const seen = new Set<string>();
  const rawText = String(additionalPreferences || "");
  const srText = rawText.toLowerCase();
  const defaultMealCategory = prefs.wantLunch ? "lunch" : prefs.wantDinner ? "dinner" : prefs.wantBreakfast ? "breakfast" : "lunch";

  const addInjection = (query: string, category: string, forDay?: number, anchor?: MatchAnchor, preferredTime?: string) => {
    const cleanQuery = query.trim().replace(/^[:\-\s]+|["'،,.\s]+$/g, "");
    if (!cleanQuery || cleanQuery.length < 3 || cleanQuery.length > 160) { logSpecialRequestDecision("drop", query, "invalid length"); return; }
    if (/(real address|opening hours|google maps|daily limit|subscription|quota|activities per day|exactly\s+\d+\s+activities|excluding meals|must include|must follow|all activities|travelers|departure city|wake up|sleep|budget)/i.test(cleanQuery)) { logSpecialRequestDecision("drop", cleanQuery, "system/planning instruction, not user condition"); return; }
    const key = `${normalizeForDedup(cleanQuery)}|${category}|${forDay || 0}`;
    if (seen.has(key)) { logSpecialRequestDecision("drop", cleanQuery, "duplicate extracted condition", { category, forDay }); return; }
    seen.add(key);
    logSpecialRequestDecision("keep", cleanQuery, "accepted for injection", { category, forDay, preferredTime });
    injections.push({ query: cleanQuery, category, forDay, anchor, preferredTime });
  };

  // Convert "3:00 PM", "3 PM", "15:00", "3:00 PM UTC-4" → "HH:MM" (24h, treats stated time as local event time)
  const kickoffTo24h = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    const cleaned = raw.replace(/\s*UTC[+\-]?\d*\s*/gi, "").trim();
    const ampm = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
      const isPM = ampm[3].toLowerCase() === "pm";
      if (h === 12) h = isPM ? 12 : 0;
      else if (isPM) h += 12;
      if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    const h24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
    if (h24) {
      const h = parseInt(h24[1], 10);
      const m = parseInt(h24[2], 10);
      if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    return undefined;
  };

  // ============================================================
  // HIGH-PRIORITY: Detect match/event anchors like
  //   "Match: A vs B at <venue> on YYYY-MM-DD at HH:MM ..."
  //   "Match schedule: A vs B at <venue> on YYYY-MM-DD at HH:MM ..."
  //   Multi-line "Match schedule:" blocks with several entries.
  // Anchor each as a precise activity tied to the correct day.
  // ============================================================
  const computeForDay = (isoDate?: string): number | undefined => {
    if (!isoDate || !startDate) return undefined;
    const start = new Date(startDate);
    const target = new Date(isoDate);
    if (isNaN(start.getTime()) || isNaN(target.getTime())) return undefined;
    const diffMs = target.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
    const day = Math.floor(diffMs / 86400000) + 1;
    return day >= 1 ? day : undefined;
  };
  // Strip known prefixes (e.g. "MANDATORY EVENT:") so the team-A capture isn't polluted.
  // We support: Match:, Match schedule:, MANDATORY EVENT:, EVENT:, الحدث:, مباراة:, موعد:.
  const matchPattern = /(?:Match(?:\s+schedule)?|MANDATORY\s+EVENT|EVENT|Event\s+schedule|الحدث|مباراة|موعد)\s*:?\s*([\p{L}\p{M}.\s'’\-]{2,80})\s+vs\.?\s+([\p{L}\p{M}.\s'’\-]{2,80})\s+at\s+([^,;\n]+?)\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s+at\s+([0-9:apmAPM\s]+(?:UTC[+-]?\d*)?))?/giu;
  // Fallback pattern also scans after semicolons/commas so every item in
  // "Match schedule: A vs B ...; C vs D ..." becomes its own match card.
  const matchPatternFallback = /(?:^|[\n.;،,])\s*([\p{L}\p{M}.\s'’\-]{2,80})\s+vs\.?\s+([\p{L}\p{M}.\s'’\-]{2,80})\s+at\s+([^,;\n]+?)\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s+at\s+([0-9:apmAPM\s]+(?:UTC[+-]?\d*)?))?/giu;
  let mm: RegExpExecArray | null;
  while ((mm = matchPattern.exec(rawText)) !== null) {
    const teamA = (mm[1] || "").trim();
    const teamB = (mm[2] || "").trim();
    const venue = (mm[3] || "").trim();
    const isoDate = (mm[4] || "").trim();
    const kickoff = (mm[5] || "").trim();
    if (!teamA || !teamB || !venue) continue;
    const forDay = computeForDay(isoDate);
    const venueQuery = venue.length > 4 ? venue : `${venue} stadium`;
    const anchor: MatchAnchor = { teamA, teamB, venue, isoDate, kickoff };
    const preferredTime = kickoffTo24h(kickoff);
    addInjection(venueQuery, "sports", forDay, anchor, preferredTime);
    addInjection(`${teamA} vs ${teamB}`, "sports", forDay, anchor, preferredTime);
  }
  while ((mm = matchPatternFallback.exec(rawText)) !== null) {
    const teamA = (mm[1] || "").trim();
    const teamB = (mm[2] || "").trim();
    const venue = (mm[3] || "").trim();
    const isoDate = (mm[4] || "").trim();
    const kickoff = (mm[5] || "").trim();
    if (!teamA || !teamB || !venue) continue;
    const forDay = computeForDay(isoDate);
    const venueQuery = venue.length > 4 ? venue : `${venue} stadium`;
    const anchor: MatchAnchor = { teamA, teamB, venue, isoDate, kickoff };
    const preferredTime = kickoffTo24h(kickoff);
    addInjection(venueQuery, "sports", forDay, anchor, preferredTime);
    addInjection(`${teamA} vs ${teamB}`, "sports", forDay, anchor, preferredTime);
  }

  const venuePatterns = [
    /(?:أريد|اريد|أبغى|ابغى|ابي|أبي)\s+(?:أكل|اكل|زيارة|الذهاب)\s+(?:في|إلى|الى|ب)?\s*(.+?)(?:\.|$|،)/gi,
    /(?:i\s*want\s*to\s*(?:eat|visit|go)\s*(?:at|to|in))\s+(.+?)(?:\.|$|,)/gi,
    /(?:include|add|ضمّن|اضف|أضف)\s+(.+?)(?:\s+(?:في|in|on)\s+(?:اليوم|day)\s*(\d+))?(?:\.|$|،|,)/gi,
    /(?:أحب|احب|أفضل|افضل|مهتم\s*ب|مهتمة\s*ب)\s+(.+?)(?:\.|$|،|,)/gi,
    /(?:i\s*(?:love|like|prefer|am\s+interested\s+in))\s+(.+?)(?:\.|$|,)/gi,
  ];

  for (const pattern of venuePatterns) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const raw = (match[1] || "").trim();
      const dayNum = match[2] ? parseInt(match[2], 10) : undefined;
      const isRestaurant = /(restaurant|مطعم|cafe|café|مقهى|eat|أكل|اكل|breakfast|lunch|dinner|فطور|غداء|عشاء)/i.test(raw) || /(eat|أكل|اكل)/i.test(match[0] || "");
      const category = /breakfast|فطور/i.test(raw) || /breakfast|فطور/i.test(match[0] || "")
        ? "breakfast"
        : /dinner|عشاء/i.test(raw) || /dinner|عشاء/i.test(match[0] || "")
          ? "dinner"
          : /lunch|غداء/i.test(raw) || /lunch|غداء/i.test(match[0] || "")
            ? "lunch"
            : isRestaurant
              ? defaultMealCategory
              : "attraction";
      addInjection(raw, category, dayNum);
    }
  }

  const activityTypePatterns: [RegExp, string, string][] = [
    [/فندق|فنادق|منتجع|نزل|hotel|hôtel|otel|resort|hostel|lodge|accommodation|stay\s*at|酒店|宾馆|住宿|отель|гостиниц|ہوٹل|رہائش|unterkunft/i, "top rated hotel resort or accommodation", "hotel"],
    [/كرة\s*(?:ال)?قدم|football|soccer/i, "football stadium or football museum or live football experience", "activity"],
    [/كرة\s*(?:ال)?سلة|basketball/i, "basketball game or court", "activity"],
    [/gaming|video\s*games?|esports?|arcade|ألعاب|العاب|قيم(?:نق|نج)|قيمنق|جيمينج/i, "gaming arcade or esports venue", "entertainment"],
    [/\brc\b|remote\s*control(?:led)?|radio\s*control(?:led)?|rc\s*car|سيارات\s*(?:تحكم|ريموت)|ريموت\s*كنترول/i, "RC car hobby shop or remote control car track", "shopping"],
    [/مطاعم|restaurants?|food\s*spots?|اكل|أكل/i, "top rated local restaurant or food street", defaultMealCategory],
    [/تسوق|shopping/i, "shopping mall or market", "shopping"],
    [/سبا|spa|مساج|massage/i, "spa or wellness center", "activity"],
    [/حديقة\s*(?:حيوان|ال)|zoo/i, "zoo", "nature"],
    [/ملاهي|theme\s*park|amusement/i, "theme park or amusement park", "activity"],
    [/متحف|museum/i, "museum or cultural exhibition", "cultural"],
    [/شاطئ|beach/i, "beach or waterfront", "nature"],
    [/تجول|explore|walk|stroll|مشي/i, "walking tour or scenic neighborhood walk", "activity"],
    [/ضواحي|outskirts|suburbs|أطراف|ريف|countryside|rural|قري(?:ة|ى)|بعيد(?:ا|اً)?\s*عن\s*(?:الزحام|المدينة)|away\s+from\s+(?:the\s+)?(?:crowd|city|center)/i, "scenic countryside village or quiet suburb away from city crowds", "nature"],
    [/(?:هدوء|هادئ|quiet|peaceful|tranquil|serene|relaxing\s*nature)/i, "quiet peaceful nature spot away from crowds", "nature"],
    [/مكان\s*محدد|specific\s*place/i, "specific landmark", "attraction"],
    [/حلويات|dessert|sweet/i, "dessert shop or bakery", "lunch"],
    [/مقهى|cafe|coffee|كوفي/i, "popular cafe or coffee shop", "lunch"],
    [/سينما|cinema|movie/i, "cinema or movie theater", "entertainment"],
    [/حديقة|garden|park/i, "public garden or park", "nature"],
    [/جولة\s*بحرية|boat\s*tour|cruise/i, "boat tour or cruise", "activity"],
  ];

  for (const [pattern, query, category] of activityTypePatterns) {
    if (pattern.test(srText)) addInjection(query, category);
  }

  const inferCategoryFromFragment = (fragment: string): string | null => {
    if (/(hotel|hôtel|otel|resort|hostel|lodge|accommodation|فندق|فنادق|منتجع|نزل|إقامة|اقامة|酒店|宾馆|住宿|отель|гостиниц|ہوٹل|رہائش|unterkunft)/i.test(fragment)) return "hotel";
    if (/breakfast|فطور/i.test(fragment)) return "breakfast";
    if (/lunch|غداء/i.test(fragment)) return "lunch";
    if (/dinner|عشاء/i.test(fragment)) return "dinner";
    if (/restaurant|مطعم|cafe|café|مقهى|coffee|كوفي/i.test(fragment)) return defaultMealCategory;
    if (/restaurants|مطاعم|food|eat|أكل|اكل/i.test(fragment)) return defaultMealCategory;
    if (/shopping|تسوق|mall|market|bazaar|souq|مول|سوق/i.test(fragment)) return "shopping";
    if (/museum|متحف|gallery|معرض/i.test(fragment)) return "cultural";
    if (/beach|شاطئ|swim|swimming|pool|water|سباحة|مسبح|بحر/i.test(fragment)) return "nature";
    if (/park|garden|trail|nature|حديقة|طبيعة|جبل|mountain/i.test(fragment)) return "nature";
    if (/gaming|video\s*games?|esports?|arcade|ألعاب|العاب|قيم(?:نق|نج)|قيمنق|جيمينج/i.test(fragment)) return "entertainment";
    if (/\brc\b|remote\s*control(?:led)?|radio\s*control(?:led)?|rc\s*car|سيارات\s*(?:تحكم|ريموت)|ريموت\s*كنترول/i.test(fragment)) return "shopping";
    if (/football|soccer|كرة قدم|stadium|ملعب|spa|massage|theme park|ملاهي/i.test(fragment)) return "activity";
    if (/تجول|explore|walk|stroll|مشي|جولة|tour|ضواحي|outskirts|أطراف/i.test(fragment)) return "activity";
    if (/cinema|سينما|movie|film/i.test(fragment)) return "entertainment";
    if (/مقهى|cafe|coffee|كوفي/i.test(fragment)) return "lunch";
    if (/حلويات|dessert|sweet|bakery/i.test(fragment)) return "lunch";
    if (fragment.length >= 6 && !/^(mandatory|critical|activity|trip|wake|sleep|budget|food|preferred)/i.test(fragment)) return "attraction";
    return null;
  };

  const stripKnownSpecialRequestPrefix = (fragment: string) =>
    fragment
      .replace(/^\s*[-•*]+\s*/, "")
      .replace(/^(?:match(?:\s+schedule)?|special requests?|الطلبات الخاصة|include|add|أضف|اضف)\s*:\s*/i, "")
      .trim();

  const rawFragments = rawText
    .split(/[\n،;,]+/)
    .map((fragment) => stripKnownSpecialRequestPrefix(fragment))
    .filter((fragment) => fragment.length >= 4 && fragment.length <= 160);

  for (const fragment of rawFragments) {
    if (/^(mandatory meal requirements|critical rules|activity preferences|trip type|wake up|sleep|budget|food preferences|preferred cuisines?)$/i.test(fragment)) continue;
    const category = inferCategoryFromFragment(fragment);
    if (category) addInjection(fragment, category);
  }

  return injections;
}

function normalizeSpecialRequestCategory(category: unknown, prefs: PreferenceFlags): string {
  const raw = normalizeForDedup(category);
  const defaultMealCategory = prefs.wantLunch ? "lunch" : prefs.wantDinner ? "dinner" : prefs.wantBreakfast ? "breakfast" : "lunch";
  if (["breakfast", "فطور"].includes(raw)) return "breakfast";
  if (["lunch", "غداء"].includes(raw)) return "lunch";
  if (["dinner", "عشاء"].includes(raw)) return "dinner";
  if (["hotel", "hotels", "resort", "hostel", "accommodation", "فندق", "فنادق", "منتجع", "نزل", "إقامة", "اقامة"].includes(raw)) return "hotel";
  if (["restaurant", "restaurants", "food", "meal", "مطعم", "مطاعم", "اكل", "أكل"].includes(raw)) return defaultMealCategory;
  if (["shopping", "تسوق"].includes(raw)) return "shopping";
  if (["cultural", "culture", "museum", "art", "متحف", "ثقافي"].includes(raw)) return "cultural";
  if (["nature", "beach", "park", "طبيعة", "شاطئ"].includes(raw)) return "nature";
  if (["entertainment", "ترفيه"].includes(raw)) return "entertainment";
  if (["activity", "sports", "football", "walk", "tour", "نشاط", "رياضة", "كرة قدم", "تجول"].includes(raw)) return "activity";
  return "attraction";
}

function isMeaningfulSpecialRequestQuery(query: unknown): boolean {
  const clean = String(query || "").trim().replace(/^[:\-\s]+|["'،,.\s]+$/g, "");
  if (!clean || clean.length < 3 || clean.length > 160) return false;
  if (/^(?:\d{1,2}|\d{1,2}:\d{2}|am|pm|utc(?:[+-]?\d+)?)$/i.test(clean)) return false;
  if (/^(?:day\s*\d+|اليوم\s*\d+)$/i.test(clean)) return false;
  const alphaCount = (clean.match(/[\p{L}\p{M}]/gu) || []).length;
  return alphaCount >= 2;
}

function mergeSpecialRequestInjections(...groups: SpecialRequestInjection[][]): SpecialRequestInjection[] {
  const merged: SpecialRequestInjection[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const item of group || []) {
      const query = String(item?.query || "").trim().replace(/^[:\-\s]+|["'،,.\s]+$/g, "");
      const category = String(item?.category || "attraction").trim() || "attraction";
      const forDay = Number.isFinite(Number(item?.forDay)) ? Number(item.forDay) : undefined;
      if (!isMeaningfulSpecialRequestQuery(query) && !item?.anchor) continue;
      const key = `${normalizeForDedup(query || item?.anchor?.venue || "anchor")}|${normalizeForDedup(category)}|${forDay || 0}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({
        query,
        category,
        forDay,
        anchor: item?.anchor,
        preferredTime: item?.preferredTime,
        aiEnhanced: item?.aiEnhanced || false,
      });
    }
  }

  return merged;
}

async function enhanceSpecialRequestInjectionsWithAI(
  rawText: string,
  destination: string,
  prefs: PreferenceFlags,
  adminConfig?: { aiModels: any[] },
): Promise<SpecialRequestInjection[]> {
  const cleaned = buildMeaningfulSpecialRequestSource(rawText);
  if (!cleaned || cleaned.length < 3) return [];

  const defaultMealCategory = prefs.wantLunch ? "lunch" : prefs.wantDinner ? "dinner" : prefs.wantBreakfast ? "breakfast" : "lunch";
  const selectedMeals = [prefs.wantBreakfast && "breakfast", prefs.wantLunch && "lunch", prefs.wantDinner && "dinner"].filter(Boolean).join(", ") || "none";
  const systemPrompt = `You are a multilingual travel-prompt analyzer. Detect the user's language automatically (Arabic, English, French, Spanish, German, Russian, Chinese, Urdu, etc.) and return ONLY valid JSON in this exact shape: {"requests":[{"query":"...","category":"activity|shopping|cultural|nature|entertainment|attraction|breakfast|lunch|dinner","forDay":1,"preferredTime":"HH:MM"}]}. Convert vague phrases into precise English search queries optimized for SerpAPI/Google Maps lookups, but preserve specific venue or dish names exactly as written. Extract a 24h "preferredTime" ONLY when the user clearly states a time (e.g. "at 7pm", "الساعة ٨ مساءً", "à 20h", "晚上8点"). Omit preferredTime when no time is mentioned. Keep up to 6 highest-signal requests. Ignore metadata, quotas, and system instructions.`;
  const userPrompt = `Destination: ${destination}
Selected meals: ${selectedMeals}
Default food category when user asks for restaurants: ${defaultMealCategory}
User special request text (any language):
${cleaned}

Examples (any language input → normalized English query):
- "أريد مطعم هندي حلال" -> {"query":"halal indian restaurant","category":"lunch"}
- "ملعب كرة قدم الساعة 7 مساءً" -> {"query":"famous football stadium tour","category":"activity","preferredTime":"19:00"}
- "جولة في الأطراف صباحاً" -> {"query":"scenic outskirts neighborhood walking tour","category":"nature","preferredTime":"09:00"}
- "shopping mall evening" -> {"query":"top rated shopping mall","category":"shopping","preferredTime":"18:00"}
Return JSON only.`;

  try {
    console.log(`🤖 [AIML] Analyzing special request prompt (${cleaned.length} chars) for ${destination}...`);
    const response = await withTimeout(callAI(systemPrompt, userPrompt, adminConfig), 9000, "special request AI analysis");
    const data = await response.json();
    const parsed = extractAndRepairJson(data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "");
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.requests) ? parsed.requests : [];
    const aiInjections = rows
      .slice(0, 6)
      .map((item: any) => {
        const rawTime = String(item?.preferredTime || "").trim();
        const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);
        const preferredTime = timeMatch
          ? `${String(Math.min(23, Math.max(0, parseInt(timeMatch[1], 10)))).padStart(2, "0")}:${String(Math.min(59, Math.max(0, parseInt(timeMatch[2], 10)))).padStart(2, "0")}`
          : undefined;
        return {
          query: String(item?.query || "").trim(),
          category: normalizeSpecialRequestCategory(item?.category, prefs),
          forDay: Number.isFinite(Number(item?.forDay)) ? Number(item.forDay) : undefined,
          preferredTime,
          aiEnhanced: true,
        };
      })
      .filter((item: SpecialRequestInjection) => isMeaningfulSpecialRequestQuery(item.query));

    console.log(`✅ [AIML] Extracted ${aiInjections.length} structured request(s) → forwarding to SerpAPI: ${aiInjections.map((i: SpecialRequestInjection) => `"${i.query}"${i.preferredTime ? `@${i.preferredTime}` : ""}`).join(", ")}`);
    return mergeSpecialRequestInjections(aiInjections);
  } catch (error) {
    console.warn("⚠️ [AIML] special request analysis failed, falling back to regex parsing:", error);
    return [];
  }
}

function activityMatchesSpecialRequest(activity: any, query: string): boolean {
  const fold = (value: unknown) => String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  const normalizedQuery = normalizeForDedup(query);
  if (!normalizedQuery) return false;
  const combinedRaw = `${getActivityName(activity)} ${activity?.address || ""} ${activity?.description || ""} ${activity?.matchReason || ""}`;
  const combined = normalizeForDedup(combinedRaw);
  const foldedCombined = fold(combinedRaw);
  const foldedQuery = fold(query);
  if (!combined) return false;
  if (combined.includes(normalizedQuery) || foldedCombined.includes(foldedQuery)) return true;

  const tokens = normalizedQuery.split(" ").filter((token) => token.length > 2);
  const foldedTokens = foldedQuery.split(/\s+/).filter((token) => token.length > 2);
  if (/\bvs\b/i.test(query)) {
    const vsParts = normalizedQuery.split(/\bvs\b/).map((part) => part.trim()).filter(Boolean);
    if (vsParts.length >= 2) {
      return vsParts.every((part) => part.split(" ").filter((token) => token.length > 2).every((token) => combined.includes(token)));
    }
  }
  if (tokens.length > 1 && tokens.every((token) => combined.includes(token))) return true;
  if (foldedTokens.length > 1 && foldedTokens.every((token) => foldedCombined.includes(token))) return true;

  const semanticAliases: Array<{ pattern: RegExp; aliases: string[] }> = [
    { pattern: /football|soccer|basketball|كرة\s*ال?قدم|كره\s*ال?قدم|كوره|كورة|كرة\s*السلة|كره\s*السله|stadium|arena|court|ملعب|صالة/i, aliases: ["football", "soccer", "basketball", "stadium", "arena", "court", "match", "club", "sports", "كرة", "كره", "كورة", "كوره", "ملعب", "صالة"] },
    { pattern: /restaurants?|مطاعم|food|eat|اكل|أكل|restaurant|restaurante|resto|مطعم|餐厅|comida|essen/i, aliases: ["restaurant", "restaurants", "food", "eatery", "bistro", "food street", "مطعم", "مطاعم", "غداء", "عشاء", "فطور", "餐厅", "美食"] },
    { pattern: /shopping|mall|market|souq|bazaar|تسوق|مول|سوق/i, aliases: ["shopping", "mall", "market", "souq", "bazaar", "retail", "تسوق", "سوق", "مول"] },
    { pattern: /museum|gallery|ثقاف|تاريخ|متحف|تراث/i, aliases: ["museum", "gallery", "heritage", "cultural", "history", "متحف", "ثقاف", "تاريخ"] },
    { pattern: /outskirts|suburbs|neighborhood|promenade|walk|stroll|ضواحي|أطراف|تجول|مشي/i, aliases: ["walk", "stroll", "neighborhood", "suburb", "outskirts", "promenade", "viewpoint", "تجول", "مشي", "ضواحي"] },
    { pattern: /breakfast|فطور|desayuno|petit\s*déjeuner|frühstück|早餐/i, aliases: ["breakfast", "brunch", "cafe", "bakery", "فطور", "برانش", "مقهى", "desayuno", "早餐"] },
    { pattern: /lunch|غداء|almuerzo|déjeuner|mittagessen|午餐/i, aliases: ["lunch", "restaurant", "bistro", "غداء", "مطعم", "almuerzo", "déjeuner", "午餐"] },
    { pattern: /dinner|عشاء|cena|dîner|abendessen|晚餐/i, aliases: ["dinner", "fine dining", "steakhouse", "عشاء", "مطعم", "cena", "dîner", "晚餐"] },
  ];

  for (const entry of semanticAliases) {
    if (!entry.pattern.test(query)) continue;
    if (entry.aliases.some((alias) => combined.includes(normalizeForDedup(alias)) || foldedCombined.includes(fold(alias)))) return true;
  }

  return false;
}

function explicitPromptMatchesResolvedPlace(place: any, query: string): boolean {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return true;
  if (activityMatchesSpecialRequest(place, cleanQuery)) return true;

  const requestedSubtype = inferRequestedActivitySubtype({
    name: cleanQuery,
    title: cleanQuery,
    description: cleanQuery,
    matchReason: cleanQuery,
  });
  if (requestedSubtype && requestedSubtype !== "attraction") {
    return activityMatchesRequestedSubtype(place, requestedSubtype);
  }

  const qTokens = normalizeForDedup(cleanQuery).split(" ").filter((token) => token.length > 2);
  if (qTokens.length === 0) return true;
  const haystack = normalizeForDedup(`${place?.name || place?.title || ""} ${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""} ${place?.category || ""} ${place?.description || ""}`);
  return qTokens.every((token) => haystack.includes(token));
}

function extractPreferences(interests: string[] = [], additionalPreferences = "", cuisineTypesParam?: string[]): PreferenceFlags {
  const allText = `${interests.join(" ")} ${additionalPreferences}`.toLowerCase();

  const allCuisines: string[] = [];
  const cuisinePatterns: [RegExp, string][] = [
    [/هند|indian/i, "indian"], [/إيطال|italian/i, "italian"], [/صين|chinese/i, "chinese"],
    [/تركي|turkish/i, "turkish"], [/ياباني|japanese|sushi/i, "japanese"], [/كوري|korean/i, "korean"],
    [/مكسيك|mexican/i, "mexican"], [/تايل|thai/i, "thai"], [/لبنان|lebanese/i, "lebanese"],
    [/عربي|arabic|arab/i, "arabic"], [/فرنس|french/i, "french"], [/مأكولات بحر|seafood/i, "seafood"],
    [/حلال|halal/i, "halal"], [/نباتي|vegan|vegetarian/i, "vegetarian"],
    [/بيتزا|pizza/i, "pizza"], [/مشويات|grill|bbq/i, "grill"],
    [/أمريك|american|burger/i, "american"], [/روس|russian/i, "russian"], [/فارس|persian|iranian/i, "persian"],
    [/إثيوب|ethiopian/i, "ethiopian"], [/فيتنام|vietnamese/i, "vietnamese"],
  ];
  
  // 1. Use explicitly passed cuisineTypes array first (from frontend)
  if (cuisineTypesParam && cuisineTypesParam.length > 0) {
    allCuisines.push(...cuisineTypesParam);
  }
  
  // 2. Also check "Food preferences: indian, american" or "Preferred cuisines: indian, chinese"
  if (allCuisines.length === 0) {
    const cuisineMatch = allText.match(/(?:food\s*preferences?|preferred?\s*cuisines?|cuisine\s*types?)\s*[:=]\s*([^\n.]+)/i);
    if (cuisineMatch) {
      const cuisineText = cuisineMatch[1].trim();
      const parts = cuisineText.split(/[,،]/);
      for (const part of parts) {
        const trimmed = part.trim();
        for (const [pattern, cuisine] of cuisinePatterns) {
          if (pattern.test(trimmed)) { allCuisines.push(cuisine); break; }
        }
        if (allCuisines.length === 0 && trimmed.length > 1) allCuisines.push(trimmed);
      }
    }
  }
  
  // 3. Fallback: scan the full text for cuisine keywords
  if (allCuisines.length === 0) {
    for (const [pattern, cuisine] of cuisinePatterns) {
      if (pattern.test(allText)) { allCuisines.push(cuisine); }
    }
  }
  
  const requestedCuisine = allCuisines.length > 0 ? allCuisines[0] : null;

  // Parse meal preferences from structured format "MANDATORY MEAL REQUIREMENTS"
  const hasMandatoryMeals = allText.includes("mandatory meal requirements") || allText.includes("must include these meals");
  
  // Extract only the mandatory meals section to avoid false positives from other text
  const mandatorySection = allText.match(/mandatory meal requirements[^]*?(?=critical rules|activity preferences|$)/i)?.[0]?.toLowerCase() || "";
  
  const mandatoryBreakfast = hasMandatoryMeals 
    ? /^\s*-\s*breakfast\b/im.test(mandatorySection)
    : false;
  const mandatoryLunch = hasMandatoryMeals 
    ? /^\s*-\s*lunch\b/im.test(mandatorySection)
    : false;
  const mandatoryDinner = hasMandatoryMeals 
    ? /^\s*-\s*dinner\b/im.test(mandatorySection)
    : false;
  const mandatorySnacks = hasMandatoryMeals
    ? /^\s*-\s*snacks?\b/im.test(mandatorySection)
    : false;

  const hasMealMention = hasMandatoryMeals ||
    allText.includes("فطور") || allText.includes("غداء") || allText.includes("عشاء") ||
    allText.includes("breakfast") || allText.includes("lunch") || allText.includes("dinner") || allText.includes("snack") ||
    allText.includes("meals") || allText.includes("وجب");

  // When MANDATORY MEAL REQUIREMENTS exists, STRICTLY follow it - only include specified meals
  const wantBreakfast = hasMandatoryMeals
    ? mandatoryBreakfast
    : (hasMealMention
      ? (allText.includes("فطور") || allText.includes("breakfast") || allText.includes("all meals") || allText.includes("كل الوجب"))
      : true);
  const wantLunch = hasMandatoryMeals
    ? mandatoryLunch
    : (hasMealMention
      ? (allText.includes("غداء") || allText.includes("lunch") || allText.includes("all meals") || allText.includes("كل الوجب"))
      : true);
  const wantDinner = hasMandatoryMeals
    ? mandatoryDinner
    : (hasMealMention
      ? (allText.includes("عشاء") || allText.includes("dinner") || allText.includes("all meals") || allText.includes("كل الوجب"))
      : true);
  const wantSnacks = hasMandatoryMeals
    ? mandatorySnacks
    : (hasMealMention
      ? (allText.includes("snack") || allText.includes("سناك") || allText.includes("وجبة خفيفة") || allText.includes("وجبات خفيفة"))
      : false);

  // Parse trip type from "Trip type: romantic" format
  const tripTypeMatch = allText.match(/trip\s*type\s*[:=]\s*(\w+)/i);
  const tripTypeValue = tripTypeMatch?.[1]?.toLowerCase() || "";

  const isRomantic = tripTypeValue === "romantic" || allText.includes("رومانس") || allText.includes("رومنس") || allText.includes("romantic") || allText.includes("حب") || allText.includes("honeymoon") || allText.includes("شهر عسل") || allText.includes("زوج");
  const isAdventure = tripTypeValue === "adventure" || allText.includes("مغامر") || allText.includes("adventure") || allText.includes("hiking") || allText.includes("تسلق");
  const isFamily = tripTypeValue === "family" || allText.includes("عائل") || allText.includes("أطفال") || allText.includes("family") || allText.includes("children") || allText.includes("kids");
  const isSolo = tripTypeValue === "solo" || allText.includes("فرد") || allText.includes("لوحد") || allText.includes("solo") || allText.includes("alone");
  const isEconomic = tripTypeValue === "economic" || tripTypeValue === "budget" || allText.includes("اقتصادي") || allText.includes("اقتصادية") || allText.includes("economy") || allText.includes("budget") || allText.includes("cheap");
  const isLuxury = tripTypeValue === "luxury" || allText.includes("فاخر") || allText.includes("فاخرة") || allText.includes("luxury") || allText.includes("premium") || allText.includes("vip");
  const wantsSwimming = /(swim|swimming|pool|beach|waterpark|water\s*activit|snorkel|diving|سباحة|شاطئ|مسبح|غطس|بحر|أنشطة مائية)/i.test(allText);

  // Parse wake/sleep times from multiple formats
  let startHour = 9;
  let endHour = 22;

  // Format: "Wake up: 08:00" or "الاستيقاظ: 08:00"
  const wakeMatch = allText.match(/(?:wake\s*(?:up)?|استيقاظ|وقت الاستيقاظ)\s*[:=]?\s*(\d{1,2}):?(\d{2})?/i);
  const sleepMatch = allText.match(/(?:sleep|نوم|وقت النوم)\s*[:=]?\s*(\d{1,2}):?(\d{2})?/i);
  
  if (wakeMatch) startHour = parseInt(wakeMatch[1]);
  if (sleepMatch) {
    endHour = parseInt(sleepMatch[1]);
    if (endHour < 12) endHour += 12;
  }

  // "ALL activities MUST be scheduled between HH:MM and HH:MM"
  const betweenMatch = allText.match(/between\s+(\d{1,2}):(\d{2})\s+and\s+(\d{1,2}):(\d{2})/i);
  if (betweenMatch) {
    startHour = parseInt(betweenMatch[1]);
    endHour = parseInt(betweenMatch[3]);
  }

  // Legacy format: "08:00 - 23:00"
  if (!wakeMatch && !sleepMatch && !betweenMatch) {
    const timeMatch = allText.match(/(\d{1,2})\s*(?:صباح|ص|am|morning)?\s*(?:إلى|الى|to|-)\s*(\d{1,2})\s*(?:مساء|م|pm|evening|night)?/);
    if (timeMatch) {
      startHour = parseInt(timeMatch[1]);
      endHour = parseInt(timeMatch[2]);
      if (endHour <= 12 && (allText.includes("مساء") || allText.includes("pm"))) endHour += 12;
    }
  }

  startHour = Math.max(5, Math.min(22, startHour));
  endHour = Math.max(startHour + 1, Math.min(23, endHour));

  console.log(`Preferences parsed: cuisines=[${allCuisines.join(',')}], romantic=${isRomantic}, adventure=${isAdventure}, family=${isFamily}, economic=${isEconomic}, luxury=${isLuxury}, swimming=${wantsSwimming}, meals=[${wantBreakfast?'B':''}${wantLunch?'L':''}${wantDinner?'D':''}${wantSnacks?'S':''}], hours=${startHour}-${endHour}`);

  return {
    allText,
    requestedCuisine,
    requestedCuisines: allCuisines,
    hasMealMention,
    wantBreakfast,
    wantLunch,
    wantDinner,
    wantSnacks,
    isRomantic,
    isAdventure,
    isFamily,
    isEconomic,
    isLuxury,
    isSolo,
    wantsSwimming,
    startHour,
    endHour,
  };
}

function getActivityName(activity: any): string {
  return String(activity?.name || activity?.title || "").trim();
}

function parseTimeHour(value: unknown): number | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  if (raw.includes("pm") && h < 12) h += 12;
  if (raw.includes("am") && h === 12) h = 0;
  if (/(مساء|ليل)/.test(raw) && h < 12) h += 12;
  if (/صباح/.test(raw) && h === 12) h = 0;
  return h + (minutes / 60);
}

function activitySortMinutes(activity: any, fallbackHour = 12): number {
  const parsed = parseTimeHour(activity?.time || activity?.startTime);
  const safeHour = parsed == null || !Number.isFinite(parsed) ? fallbackHour : parsed;
  return Math.round(safeHour * 60);
}

function sortActivitiesByTimeInPlace(activities: any[] = []): any[] {
  return activities.sort((a: any, b: any) => activitySortMinutes(a) - activitySortMinutes(b));
}

function parseExactKickoffTime(value: unknown): { hour: number; minute: number; display24h: string } {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return { hour: 19, minute: 0, display24h: "19:00" };
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const suffix = (match[3] || "").toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  hour = Math.max(0, Math.min(23, hour));
  const safeMinute = Math.max(0, Math.min(59, minute));
  return {
    hour,
    minute: safeMinute,
    display24h: `${String(hour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`,
  };
}

function countryToFlagEmoji(country: string): string {
  const normalized = normalizeForDedup(country).replace(/\s+/g, "");
  const codeMap: Record<string, string> = {
    southkorea: "KR", korea: "KR", republicofkorea: "KR", northkorea: "KP",
    czechrepublic: "CZ", czechia: "CZ",
    canada: "CA",
    bosniaandherzegovina: "BA", bosnia: "BA", bih: "BA",
    saudiarabia: "SA", ksa: "SA",
    unitedstates: "US", usa: "US", us: "US", america: "US",
    unitedkingdom: "GB", uk: "GB", england: "GB", britain: "GB", greatbritain: "GB",
    scotland: "GB", wales: "GB", northernireland: "GB",
    france: "FR", germany: "DE", spain: "ES", italy: "IT", portugal: "PT",
    netherlands: "NL", holland: "NL", belgium: "BE", switzerland: "CH",
    austria: "AT", denmark: "DK", sweden: "SE", norway: "NO", finland: "FI",
    poland: "PL", ireland: "IE", greece: "GR", turkey: "TR", türkiye: "TR", russia: "RU",
    ukraine: "UA", croatia: "HR", serbia: "RS", iceland: "IS",
    hungary: "HU", romania: "RO", bulgaria: "BG", slovakia: "SK", slovenia: "SI",
    albania: "AL", northmacedonia: "MK", montenegro: "ME",
    brazil: "BR", argentina: "AR", uruguay: "UY", chile: "CL", colombia: "CO",
    mexico: "MX", peru: "PE", ecuador: "EC", paraguay: "PY", venezuela: "VE",
    bolivia: "BO", curacao: "CW", curaçao: "CW",
    // CONCACAF / Caribbean (FIFA WC 2026 includes many of these)
    panama: "PA", costarica: "CR", honduras: "HN", jamaica: "JM",
    elsalvador: "SV", guatemala: "GT", nicaragua: "NI",
    trinidadandtobago: "TT", trinidad: "TT", haiti: "HT", cuba: "CU",
    dominicanrepublic: "DO", suriname: "SR", guyana: "GY",
    japan: "JP", china: "CN", prchina: "CN", india: "IN", indonesia: "ID", thailand: "TH",
    vietnam: "VN", malaysia: "MY", singapore: "SG", philippines: "PH",
    australia: "AU", newzealand: "NZ",
    egypt: "EG", morocco: "MA", algeria: "DZ", tunisia: "TN", libya: "LY",
    nigeria: "NG", southafrica: "ZA", senegal: "SN", ghana: "GH", cameroon: "CM",
    kenya: "KE", ethiopia: "ET", ivorycoast: "CI", cotedivoire: "CI",
    mali: "ML", burkinafaso: "BF", drcongo: "CD", congodr: "CD", congo: "CG",
    capeverde: "CV", caboverde: "CV",
    iran: "IR", iraq: "IQ", syria: "SY", lebanon: "LB", jordan: "JO",
    palestine: "PS", israel: "IL", qatar: "QA", uae: "AE", unitedarabemirates: "AE",
    kuwait: "KW", bahrain: "BH", oman: "OM", yemen: "YE",
    pakistan: "PK", bangladesh: "BD", afghanistan: "AF", uzbekistan: "UZ",
    // Arabic names
    "بنما": "PA", "كوستاريكا": "CR", "هندوراس": "HN", "جامايكا": "JM",
    "السلفادور": "SV", "غواتيمالا": "GT", "نيكاراغوا": "NI",
    "هايتي": "HT", "كوبا": "CU", "كوراساو": "CW",
    "غانا": "GH", "السنغال": "SN", "نيجيريا": "NG", "الكاميرون": "CM",
    "المغرب": "MA", "تونس": "TN", "مصر": "EG", "الجزائر": "DZ",
    "جنوبأفريقيا": "ZA", "جنوبافريقيا": "ZA",
    "البرازيل": "BR", "الأرجنتين": "AR", "الأوروغواي": "UY", "تشيلي": "CL",
    "كولومبيا": "CO", "المكسيك": "MX", "بيرو": "PE", "الإكوادور": "EC",
    "باراغواي": "PY", "فنزويلا": "VE", "بوليفيا": "BO",
    "أمريكا": "US", "الولاياتالمتحدة": "US", "كندا": "CA",
    "اليابان": "JP", "كورياالجنوبية": "KR", "إيران": "IR", "العراق": "IQ",
    "السعودية": "SA", "قطر": "QA", "الإمارات": "AE", "الكويت": "KW",
    "البحرين": "BH", "عمان": "OM", "الأردن": "JO", "لبنان": "LB",
    "أستراليا": "AU", "نيوزيلندا": "NZ",
    "فرنسا": "FR", "ألمانيا": "DE", "إسبانيا": "ES", "اسبانيا": "ES",
    "إيطاليا": "IT", "البرتغال": "PT", "هولندا": "NL", "بلجيكا": "BE",
    "إنجلترا": "GB", "كرواتيا": "HR", "صربيا": "RS", "سويسرا": "CH",
    "النمسا": "AT", "الدنمارك": "DK", "السويد": "SE", "النرويج": "NO",
    "بولندا": "PL", "أوكرانيا": "UA", "روسيا": "RU", "تركيا": "TR",
    "اليونان": "GR", "أيسلندا": "IS", "المجر": "HU", "رومانيا": "RO",
  };
  const code = codeMap[normalized];
  if (!code) return "🏳️";
  return code.toUpperCase().split("").map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function buildMatchAnchorTitle(teamA: string, teamB: string, venue: string): string {
  return `${countryToFlagEmoji(teamA)} ${teamA} vs ${countryToFlagEmoji(teamB)} ${teamB} — ${venue}`;
}

// Arabic / common transliteration aliases for country names so that
// AI-generated activity titles in Arabic still match the anchor's English
// team names (e.g. "الإكوادور" → "ecuador", "كوراساو" → "curacao").
const TEAM_NAME_ALIASES: Record<string, string[]> = {
  ecuador: ["الإكوادور", "الاكوادور", "إكوادور", "اكوادور"],
  curacao: ["كوراساو", "كوراكاو", "كوراساو", "كوراساوا"],
  uruguay: ["الأوروغواي", "الاوروغواي", "أوروغواي", "اوروغواي", "أوروجواي"],
  brazil: ["البرازيل", "برازيل"],
  argentina: ["الأرجنتين", "الارجنتين", "أرجنتين"],
  mexico: ["المكسيك", "مكسيك"],
  spain: ["إسبانيا", "اسبانيا", "أسبانيا"],
  germany: ["ألمانيا", "المانيا"],
  france: ["فرنسا"],
  england: ["إنجلترا", "انجلترا", "انكلترا"],
  italy: ["إيطاليا", "ايطاليا"],
  portugal: ["البرتغال", "برتغال"],
  netherlands: ["هولندا"],
  belgium: ["بلجيكا"],
  croatia: ["كرواتيا"],
  serbia: ["صربيا"],
  morocco: ["المغرب"],
  tunisia: ["تونس"],
  algeria: ["الجزائر"],
  egypt: ["مصر"],
  saudiarabia: ["السعودية", "المملكة العربية السعودية"],
  qatar: ["قطر"],
  iran: ["إيران", "ايران"],
  japan: ["اليابان", "يابان"],
  southkorea: ["كوريا الجنوبية", "كوريا"],
  australia: ["أستراليا", "استراليا"],
  canada: ["كندا"],
  usa: ["الولايات المتحدة", "أمريكا", "امريكا"],
  unitedstates: ["الولايات المتحدة", "أمريكا", "امريكا"],
  senegal: ["السنغال"],
  ghana: ["غانا"],
  cameroon: ["الكاميرون", "كاميرون"],
  nigeria: ["نيجيريا"],
  southafrica: ["جنوب إفريقيا", "جنوب افريقيا"],
};

function getTeamNameVariants(name: string): string[] {
  const norm = normalizeForDedup(name).replace(/\s+/g, "");
  const variants = new Set<string>();
  variants.add(normalizeForDedup(name));
  const aliases = TEAM_NAME_ALIASES[norm];
  if (aliases) for (const a of aliases) variants.add(normalizeForDedup(a));
  return Array.from(variants).filter(Boolean);
}

function activityMentionsTeam(combinedNorm: string, team: string): boolean {
  return getTeamNameVariants(team).some((v) => v.length > 1 && combinedNorm.includes(v));
}

function getPreferredMatchVenueLabel(venue: string): string {
  const raw = String(venue || "").trim();
  const parenMatch = raw.match(/\(([^()]{2,120})\)/);
  if (parenMatch?.[1]) return parenMatch[1].trim();
  return raw;
}

function shouldUseActivitiesOnlyMode(interests: string[] = [], additionalPreferences = ""): boolean {
  const text = `${interests.join(" ")} ${additionalPreferences}`.toLowerCase();
  return (
    /(فقط\s*(فعاليات|أنشطة).*(مطاعم|وجبات))/.test(text) ||
    /(بدون\s*(فندق|طيران|رحلات|سيارة|ايجار|إيجار))/.test(text) ||
    /(only\s*(activities|events).*(restaurants|meals))/.test(text) ||
    /(no\s*(flight|hotel|car|rental|transport))/.test(text)
  );
}

function normalizeForDedup(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type MatchVenueReference = {
  tournamentName: string;
  officialName: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  aliases: string[];
};

const MATCH_VENUE_REFERENCES: MatchVenueReference[] = [
  { tournamentName: "New York New Jersey Stadium", officialName: "MetLife Stadium", city: "East Rutherford, NJ", country: "USA", lat: 40.8128, lng: -74.0742, aliases: ["New York New Jersey Stadium", "MetLife Stadium"] },
  { tournamentName: "Dallas Stadium", officialName: "AT&T Stadium", city: "Arlington, TX", country: "USA", lat: 32.7473, lng: -97.0945, aliases: ["Dallas Stadium", "AT&T Stadium"] },
  { tournamentName: "Mexico City Stadium", officialName: "Estadio Azteca", city: "Mexico City", country: "Mexico", lat: 19.3029, lng: -99.1505, aliases: ["Mexico City Stadium", "Estadio Azteca", "Mexico City Stadium (Estadio Azteca)", "Estadio Banorte", "Banorte Stadium"] },
  { tournamentName: "Atlanta Stadium", officialName: "Mercedes-Benz Stadium", city: "Atlanta, GA", country: "USA", lat: 33.7554, lng: -84.4010, aliases: ["Atlanta Stadium", "Mercedes-Benz Stadium"] },
  { tournamentName: "Los Angeles Stadium", officialName: "SoFi Stadium", city: "Inglewood, CA", country: "USA", lat: 33.9535, lng: -118.3392, aliases: ["Los Angeles Stadium", "SoFi Stadium"] },
  { tournamentName: "Miami Stadium", officialName: "Hard Rock Stadium", city: "Miami, FL", country: "USA", lat: 25.958, lng: -80.2389, aliases: ["Miami Stadium", "Hard Rock Stadium"] },
  { tournamentName: "Houston Stadium", officialName: "NRG Stadium", city: "Houston, TX", country: "USA", lat: 29.6847, lng: -95.4107, aliases: ["Houston Stadium", "NRG Stadium"] },
  { tournamentName: "Seattle Stadium", officialName: "Lumen Field", city: "Seattle, WA", country: "USA", lat: 47.5952, lng: -122.3316, aliases: ["Seattle Stadium", "Lumen Field"] },
  { tournamentName: "Philadelphia Stadium", officialName: "Lincoln Financial Field", city: "Philadelphia, PA", country: "USA", lat: 39.9008, lng: -75.1675, aliases: ["Philadelphia Stadium", "Lincoln Financial Field"] },
  { tournamentName: "San Francisco Bay Area Stadium", officialName: "Levi's Stadium", city: "Santa Clara, CA", country: "USA", lat: 37.4033, lng: -121.9694, aliases: ["San Francisco Bay Area Stadium", "Levi's Stadium"] },
  { tournamentName: "Boston Stadium", officialName: "Gillette Stadium", city: "Foxborough, MA", country: "USA", lat: 42.0909, lng: -71.2643, aliases: ["Boston Stadium", "Gillette Stadium"] },
  { tournamentName: "Kansas City Stadium", officialName: "Arrowhead Stadium", city: "Kansas City, MO", country: "USA", lat: 39.0489, lng: -94.4839, aliases: ["Kansas City Stadium", "Arrowhead Stadium"] },
  { tournamentName: "BC Place Vancouver", officialName: "BC Place", city: "Vancouver, BC", country: "Canada", lat: 49.2768, lng: -123.1118, aliases: ["BC Place Vancouver", "BC Place"] },
  { tournamentName: "Toronto Stadium", officialName: "BMO Field", city: "Toronto, ON", country: "Canada", lat: 43.6335, lng: -79.4186, aliases: ["Toronto Stadium", "BMO Field"] },
  { tournamentName: "Estadio Monterrey", officialName: "Estadio BBVA", city: "Monterrey", country: "Mexico", lat: 25.6697, lng: -100.2447, aliases: ["Estadio Monterrey", "Estadio BBVA"] },
  { tournamentName: "Estadio Guadalajara", officialName: "Estadio Akron", city: "Guadalajara (Zapopan)", country: "Mexico", lat: 20.6821, lng: -103.4625, aliases: ["Estadio Guadalajara", "Estadio Akron"] },
];

function buildCanonicalMatchVenueLabel(anchorVenue: string, venueRef: MatchVenueReference | null): string {
  const raw = String(anchorVenue || "").trim();
  if (raw) return raw;
  if (!venueRef) return "";
  return venueRef.tournamentName !== venueRef.officialName
    ? `${venueRef.tournamentName} (${venueRef.officialName})`
    : venueRef.officialName;
}

function resolveMatchVenueReference(venue: string, cityName = ""): MatchVenueReference | null {
  const venueNorm = normalizeForDedup(venue);
  const cityNorm = normalizeForDedup(cityName);
  if (!venueNorm) return null;

  let best: { ref: MatchVenueReference; score: number } | null = null;
  for (const ref of MATCH_VENUE_REFERENCES) {
    const aliases = Array.from(new Set([ref.tournamentName, ref.officialName, ...ref.aliases].filter(Boolean)));
    const normalizedAliases = aliases.map((alias) => normalizeForDedup(alias)).filter(Boolean);

    let score = 0;
    if (normalizedAliases.includes(venueNorm)) score = 100;
    else if (normalizedAliases.some((alias) => alias.length > 5 && (venueNorm.includes(alias) || alias.includes(venueNorm)))) score = 80;
    if (cityNorm && normalizeForDedup(ref.city).includes(cityNorm)) score += 10;
    if (cityNorm && cityNorm.includes(normalizeForDedup(ref.city))) score += 10;

    if (score > 0 && (!best || score > best.score)) best = { ref, score };
  }

  return best?.ref || null;
}

function resolvedVenueMatchesAnchor(activity: any, anchorVenue: string, venueRef: MatchVenueReference | null): boolean {
  const combined = normalizeForDedup(`${getActivityName(activity)} ${activity?.address || ""}`);
  if (!combined) return false;

  const aliases = Array.from(new Set([
    anchorVenue,
    getPreferredMatchVenueLabel(anchorVenue),
    venueRef?.officialName,
    venueRef?.tournamentName,
    ...(venueRef?.aliases || []),
  ].filter(Boolean).map((value) => normalizeForDedup(value))));

  return aliases.some((alias) => alias.length > 5 && combined.includes(alias));
}

function matchAnchorIdentity(anchor: MatchAnchor): string {
  const teamA = normalizeForDedup(anchor.teamA);
  const teamB = normalizeForDedup(anchor.teamB);
  const kickoffOrDate = normalizeForDedup(anchor.kickoff || anchor.isoDate || "");
  return `${teamA}|${teamB}|${kickoffOrDate || normalizeForDedup(anchor.venue)}`;
}

function enforceSingleMatchActivitiesForDay(activities: any[], dayMatchAnchors: MatchAnchor[], cityName = ""): any[] {
  if (!Array.isArray(activities) || dayMatchAnchors.length === 0) return Array.isArray(activities) ? activities : [];

  const anchorLookups = dayMatchAnchors.map((anchor) => {
    const venueRef = resolveMatchVenueReference(anchor.venue, cityName);
    const venueAliases = Array.from(new Set([
      anchor.venue,
      getPreferredMatchVenueLabel(anchor.venue),
      venueRef?.officialName,
      venueRef?.tournamentName,
      ...(venueRef?.aliases || []),
    ].filter(Boolean).map((value) => normalizeForDedup(value))));
    return {
      anchor,
      key: matchAnchorIdentity(anchor),
      teams: [anchor.teamA, anchor.teamB].filter(Boolean),
      venues: venueAliases.filter((alias) => alias.length > 4),
    };
  });

  const sportsVenuePattern = /\b(stadium|arena|ballpark|coliseum|colosseum|football\s+ground|soccer\s+field|sports?\s+complex|sports?\s+park|fieldhouse|athletic\s+park|training\s+ground|field)\b/i;
  const keptAnchors = new Set<string>();
  return activities.filter((activity: any) => {
    const rawCombined = `${getActivityName(activity)} ${activity?.address || ""} ${activity?.description || ""} ${activity?.matchReason || ""} ${activity?.category || ""}`;
    const combined = normalizeForDedup(rawCombined);
    const matchedAnchor = anchorLookups.find((lookup) => {
      const hasBothTeams = lookup.teams.length >= 2 && lookup.teams.every((team) => activityMentionsTeam(combined, team));
      const hasVenue = lookup.venues.some((venue) => combined.includes(venue));
      return hasBothTeams || hasVenue;
    });

    if (activity?.isMatchAnchor) {
      // Build key from the activity's OWN teams+kickoff first so two
      // distinct user-requested matches on the same day are both retained.
      // Falling back to a venue-based anchor key would collapse different
      // matches whose venue strings partially overlap into a single entry.
      const ownKey = activity?.matchTeams
        ? `${normalizeForDedup(activity.matchTeams.a || "")}|${normalizeForDedup(activity.matchTeams.b || "")}|${normalizeForDedup(activity.matchKickoff || activity.time || activity.matchVenue || "")}`
        : "";
      const key = ownKey || matchedAnchor?.key || `anchor|${normalizeForDedup(getActivityName(activity))}`;
      if (keptAnchors.has(key)) return false;
      keptAnchors.add(key);
      return true;
    }

    // Drop duplicate/nearby stadium suggestions when a selected match exists.
    // The match itself is the fixed sports anchor; generic stadium lookups can
    // otherwise replace it visually with the wrong venue (e.g. another Atlanta stadium).
    if (matchedAnchor) return false;
    // Strict: ANY activity whose name/address mentions a stadium/arena/football venue
    // must be dropped on a match day, regardless of category. The selected match is
    // already the day's sports anchor — extra stadium entries are always duplicates.
    const nameAddr = `${getActivityName(activity)} ${activity?.address || ""} ${activity?.description || ""}`;
    if (sportsVenuePattern.test(nameAddr) || /ملعب|استاد|مجمع\s*رياضي|منش[aأ]ة\s*رياضية|كرة\s*قدم|كرة\s*سلة|مركب\s*رياضي/i.test(nameAddr)) return false;
    return true;
  });
}

function activityDedupKey(activity: any): string {
  const placeIdentity = String(
    activity?.placeId || activity?.place_id || activity?.googlePlaceId || activity?.dataId || activity?.data_id || activity?.dataCid || activity?.data_cid || activity?.providerId || activity?.provider_id || ""
  ).trim();
  const category = String(activity?.category || "").toLowerCase();
  const mealDiscriminator = isMealCategory(category) ? `|meal:${category}` : "";
  if (placeIdentity) return `place:${placeIdentity}${mealDiscriminator}`;
  const name = normalizeForDedup(getActivityName(activity));
  const address = normalizeForDedup(activity?.address || activity?.location);
  const lat = Number(activity?.latitude);
  const lng = Number(activity?.longitude);
  const geo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
    ? `${lat.toFixed(4)},${lng.toFixed(4)}`
    : "";
  return `${name}|${address}|${geo}${mealDiscriminator}`;
}

function activityNameSeenKey(activity: any): string {
  const name = normalizeForDedup(getActivityName(activity));
  const category = String(activity?.category || "").toLowerCase();
  const mealDiscriminator = isMealCategory(category) ? `|meal:${category}` : "";
  return name ? `name:${name}${mealDiscriminator}` : "";
}

function activityAddressSeenKey(activity: any): string {
  const address = normalizeForDedup(activity?.address || activity?.location || activity?.matchVenue || "");
  if (!address || address.length < 8) return "";
  const category = String(activity?.category || "").toLowerCase();
  const mealDiscriminator = isMealCategory(category) ? `|meal:${category}` : "";
  return `addr:${address}${mealDiscriminator}`;
}

function activityIdentityKeys(activity: any): string[] {
  return Array.from(new Set([
    matchActivityIdentity(activity),
    activityDedupKey(activity),
    activityNameSeenKey(activity),
    activityAddressSeenKey(activity),
    activityGeoKey(activity),
    activityVenueGeoKey(activity),
    ...__placeIdentities(activity),
  ].filter(Boolean)));
}

function isMealCategory(category: unknown): boolean {
  // Snacks are also meals — they count toward the daily meal slot budget so the strict cap stays honest.
  return ["breakfast", "lunch", "dinner", "snack", "snacks"].includes(String(category || "").toLowerCase());
}

function isFoodLikePlace(place: any): boolean {
  const raw = place?._raw && typeof place._raw === "object" ? place._raw : place;
  const text = [
    raw?.type,
    Array.isArray(raw?.types) ? raw.types.join(" ") : "",
    Array.isArray(raw?.type_ids) ? raw.type_ids.join(" ") : "",
    raw?.title,
    raw?.name,
    raw?.category,
    raw?.description,
    raw?.address,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return false;
  return /(restaurant|restaurants|cafe|caf[eé]|coffee|food|eatery|bistro|brasserie|trattoria|osteria|ristorante|forno|grill|steakhouse|pizzeria|pizza|kitchen|dining|diner|bakery|dessert|sweets|ice\s*cream|shawarma|burger|brunch|breakfast|lunch|dinner|مطعم|مطاعم|مقهى|كوفي|اكل|أكل|طعام|غداء|عشاء|فطور|حلويات|مشويات)/i.test(text);
}

function inferDominantPlaceCategory(place: any): string {
  const raw = place?._raw && typeof place._raw === "object" ? place._raw : place;
  const sourceTypeText = [
    raw?.type,
    raw?.type_id,
    raw?.placeType,
    raw?.placeTypeId,
    Array.isArray(raw?.types) ? raw.types.join(" ") : "",
    Array.isArray(raw?.type_ids) ? raw.type_ids.join(" ") : "",
    Array.isArray(raw?.placeTypes) ? raw.placeTypes.join(" ") : "",
  ].filter(Boolean).join(" ").toLowerCase();
  if (isFoodLikePlace(raw)) return "meal";
  if (/amusement_park|amusement park|theme park|water park|waterpark|aquarium|zoo|movie_theater|cinema|bowling|arcade|entertainment|night_club|night club/.test(sourceTypeText)) return "entertainment";
  if (/beach|campground|rv_park/.test(sourceTypeText)) return "beach";
  if (/park|national_park|natural_feature|botanical|garden|hiking|trail|wildlife|nature/.test(sourceTypeText)) return "nature";
  if (/shopping_mall|store|market|souq|souk|department_store|clothing_store|jewelry_store|book_store/.test(sourceTypeText)) return "shopping";
  if (/museum|mosque|church|hindu_temple|synagogue|tourist_attraction|art_gallery|library|historical|heritage|palace|castle/.test(sourceTypeText)) return "culture";
  if (/stadium|gym|sports|arena|golf|tennis|race|circuit/.test(sourceTypeText)) return "sports";
  const text = [
    raw?.type,
    raw?.type_id,
    raw?.placeType,
    raw?.placeTypeId,
    Array.isArray(raw?.types) ? raw.types.join(" ") : "",
    Array.isArray(raw?.type_ids) ? raw.type_ids.join(" ") : "",
    Array.isArray(raw?.placeTypes) ? raw.placeTypes.join(" ") : "",
    raw?.title,
    raw?.name,
    raw?.category,
    raw?.description,
    raw?.address,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return "";
  if (/\b(mall|market|bazaar|souq|souk|shopping|retail|outlet|fashion|boutique|store|shop)\b|سوق|مول|بازار|تسوق|متجر|أزياء/.test(text)) return "shopping";
  if (/\bbeach(es)?\b|\bcorniche\b|\bseaside\b|\bseafront\b|\bwaterfront\b|\bcoast(?:al)?\b|شاطئ|كورنيش|واجهة بحرية|ساحل/.test(text)) return "beach";
  if (/entertainment|theme park|amusement|amusement_park|show|cinema|movie_theater|concert|music venue|music hall|comedy club|arcade|aquarium|zoo|waterpark|festival|playground|indoor play|tourist_attraction|ترفيه|سينما|حفلة|موسيقى|ملاهي|أكواريوم|حديقة حيوان/.test(text)) return "entertainment";
  if (/museum|historic|historical|mosque|church|temple|palace|fort|cathedral|heritage|archaeolog|gallery|متحف|مسجد|كنيسة|قصر|قلعة|تراث|معرض/.test(text)) return "culture";
  if (/sport|stadium|arena|football|soccer|basketball|tennis|golf|race|circuit|رياض|ملعب|كرة قدم|كرة سلة|تنس|جولف|حلبة/.test(text)) return "sports";
  if (/\b(park|garden|botanical|forest|trail|mountain|lake|wadi|nature)\b|حديقة|طبيعة|جبل|وادي|بحيرة|منتزه/.test(text)) return "nature";
  return "";
}

// Returns the canonical category that matches an activity's actual data
// (place type / name / description). Used as a final correctness pass so the
// UI never shows a restaurant tagged as "nature" or a museum tagged as
// "shopping". Restaurants/cafes always become a meal slot.
//
// When `selectedInterests` is provided (the user picked specific preferences
// like "culture" or "nature"), the function gives priority to a category that
// matches one of those preferences — so a museum picked under the "Culture"
// preference is shown as "cultural", not "attraction". This guarantees the
// displayed tag always matches the preference the activity was chosen for.
function inferCanonicalCategory(activity: any, selectedInterests?: Set<string>): string {
  if (!activity) return "attraction";
  const currentCat = String(activity?.category || activity?.type || "").toLowerCase().trim();

  // Food venues are ALWAYS meal slots — never nature/culture/shopping/etc.
  if (isFoodLikePlace(activity)) {
    if (isMealCategory(currentCat)) return currentCat;
    return "lunch";
  }

  const dominant = inferDominantPlaceCategory(activity);
  if (dominant && dominant !== "meal") return mapInterestToActivityCategory(dominant) || dominant;
  // If no concrete source type exists, only then align to the matched user
  // interest. Concrete SerpAPI `type/type_id/types` must win to avoid labeling
  // entertainment venues as nature just because a keyword overlapped.
  if (selectedInterests && selectedInterests.size > 0) {
    const matchedKey = detectMatchedInterestKey(activity, selectedInterests);
    if (matchedKey) return mapInterestToActivityCategory(matchedKey) || matchedKey;
  }
  const inferred = mapSerpCategory(activity?._raw || activity) || currentCat || "attraction";
  if (isMealCategory(currentCat)) return inferred;
  if (inferred && inferred !== "attraction") return inferred;
  return currentCat || inferred;
}

// Human-readable explanation of WHY a category was assigned to an activity.
// Surfaced on the frontend (categoryReason field) so users — and QA — can
// audit misclassifications quickly. Bilingual.
function describeCategoryReason(activity: any, finalCategory: string, isArabic = false): string {
  const cat = String(finalCategory || "").toLowerCase();
  const name = getActivityName(activity) || (isArabic ? "النشاط" : "activity");
  if (isFoodLikePlace(activity) || isMealCategory(cat)) {
    return isArabic
      ? `صُنّف كوجبة لأن "${name}" يحتوي على كلمات طعام (مطعم/مقهى/cuisine)`
      : `Tagged as meal because "${name}" matches food keywords (restaurant/cafe/cuisine)`;
  }
  const dominant = inferDominantPlaceCategory(activity);
  if (dominant && dominant === cat) {
    return isArabic
      ? `صُنّف ${cat} بناءً على نوع المكان من المصدر (Google/Serp types)`
      : `Tagged ${cat} based on place type from source (Google/Serp types)`;
  }
  if (dominant && dominant !== cat && dominant !== "meal") {
    return isArabic
      ? `صُنّف ${cat} لمطابقة تفضيل المستخدم رغم أن النوع الأصلي كان ${dominant}`
      : `Tagged ${cat} to match user preference (raw type was ${dominant})`;
  }
  const mapped = mapSerpCategory(activity?._raw || activity);
  if (mapped) {
    return isArabic
      ? `صُنّف ${cat} عبر تحليل الكلمات المفتاحية (نوع المصدر: ${mapped})`
      : `Tagged ${cat} via keyword analysis (source type: ${mapped})`;
  }
  return isArabic
    ? `صُنّف ${cat} كقيمة افتراضية (لم يكتشف نوع محدد)`
    : `Tagged ${cat} as fallback (no specific type detected)`;
}

// Coarse geo bucket (~150m) used to detect "same venue, different name"
// duplicates where two AI suggestions resolve to identical or near-identical
// coordinates (e.g. "Sports Complex" + "Stadium Tour" at the same address).
function activityGeoKey(activity: any): string {
  const lat = Number(activity?.latitude);
  const lng = Number(activity?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return "";
  const cat = String(activity?.category || "").toLowerCase();
  const mealDiscriminator = isMealCategory(cat) ? `|meal:${cat}` : "";
  return `geo:${lat.toFixed(3)},${lng.toFixed(3)}${mealDiscriminator}`;
}

// Coarser geo identity (~110m at the equator) that ignores the activity
// category/name. Used to catch "same venue, different label" across days
// (e.g. "Marina Walk" vs "Sunset at the Marina" pointing at the same coords).
// Meals are excluded because the same restaurant address may legitimately host
// different meal types on the same day; the per-day meal logic handles that.
function activityVenueGeoKey(activity: any): string {
  const lat = Number(activity?.latitude);
  const lng = Number(activity?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return "";
  if (isMealCategory(activity?.category)) return "";
  // ~110m precision — tight enough to identify the same landmark, loose enough
  // to tolerate minor coordinate rounding from different providers.
  return `venue-geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
}

// Token-overlap based identity. Two names with >=70% shared significant
// tokens (length >=3, ignoring common stop words) are treated as the same
// venue even when the wording differs.
const VENUE_STOP_WORDS = new Set([
  "the", "a", "an", "of", "at", "in", "and", "or", "for", "to",
  "tour", "visit", "experience", "day", "evening", "morning", "afternoon",
  "في", "ال", "من", "إلى", "على", "عن", "جولة", "زيارة",
]);

function venueTokenSet(name: string): string[] {
  return normalizeForDedup(name)
    .split(/\s+/)
    .filter((tok) => tok.length >= 3 && !VENUE_STOP_WORDS.has(tok));
}

function tokensSimilar(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setA = new Set(a);
  const overlap = b.filter((t) => setA.has(t)).length;
  const ratio = overlap / Math.min(a.length, b.length);
  return ratio >= 0.7 && overlap >= 2;
}

function isActivityUnseen(activity: any, seen: Set<string>): boolean {
  const key = activityDedupKey(activity);
  const nameKey = activityNameSeenKey(activity);
  const geoKey = activityGeoKey(activity);
  if (!key) return false;
  if (seen.has(key)) return false;
  if (nameKey && seen.has(nameKey)) return false;
  if (geoKey && seen.has(geoKey)) return false;
  return true;
}

function markActivitySeen(activity: any, seen: Set<string>) {
  const key = activityDedupKey(activity);
  const nameKey = activityNameSeenKey(activity);
  const geoKey = activityGeoKey(activity);
  if (key) seen.add(key);
  if (nameKey) seen.add(nameKey);
  if (geoKey) seen.add(geoKey);
}

function hasActivityInCollection(activities: any[] = [], activity: any): boolean {
  const key = activityDedupKey(activity);
  const nameKey = activityNameSeenKey(activity);
  const addressKey = activityAddressSeenKey(activity);
  const geoKey = activityGeoKey(activity);
  const tokens = venueTokenSet(getActivityName(activity));
  const cat = String(activity?.category || "").toLowerCase();
  return activities.some((entry: any) => {
    if (key && activityDedupKey(entry) === key) return true;
    if (nameKey && activityNameSeenKey(entry) === nameKey) return true;
    if (addressKey && activityAddressSeenKey(entry) === addressKey) return true;
    if (geoKey && activityGeoKey(entry) === geoKey) return true;
    // Token-set overlap inside the same category catches "Sports Complex" vs
    // "Stadium Tour" when their coords are missing but names share most words.
    const entryCat = String(entry?.category || "").toLowerCase();
    if (cat && entryCat && cat === entryCat) {
      if (tokensSimilar(tokens, venueTokenSet(getActivityName(entry)))) return true;
    }
    return false;
  });
}

// function hasValidOpeningHours(value: unknown): boolean {
//   const hours = String(value || "").trim();
//   if (!hours) return false;
//   return !/(تحقق\s*من\s*ساعات\s*العمل|check\s*opening\s*hours|unknown|n\/a|غير\s*متوفر)/i.test(hours);
// }

function looksGenericActivity(activity: any, destination: string): boolean {
  const destinationText = String(destination || "").toLowerCase().trim();
  const name = getActivityName(activity);
  const address = String(activity?.address || "").trim();
  const combined = `${name} ${activity?.description || ""} ${activity?.category || ""}`.toLowerCase();

  if (!name) return true;
  // Only require address for non-restaurant activities
  const cat = String(activity?.category || "").toLowerCase();
  const isFood = ["food", "restaurant", "meal", "breakfast", "lunch", "dinner", "cafe", "مطعم"].some(m => cat.includes(m));
  if (!isFood && (!address || /^(unknown|n\/a|غير معروف|غير متوفر|-|\.\.\.)$/i.test(address))) return true;

  const genericPatterns = [
    /main\s*(landmark|attraction|place)/,
    /\blandmark\s*\d*\b/,
    /\battraction\s*\d*\b/,
    /\brestaurant\s*(in|at|of)?\s*[a-z\u0600-\u06ff\s-]*$/,
    /\bcity\s*(center|tour|landmark)/,
    /\btop\s*(attractions?|places?)\b/,
    /\bhistorical\s*center\b/,
    /\bculinary\s*experience\b/,
    /\bevening\s*walk\b/,
    /\bcuisine\s*preference\b/,
    /\bexplore\s*central\s*attractions\b/,
    /\bevening\s*city\s*activity\b/,
    /\b\w+\s+(breakfast|lunch|dinner)\s+spot\s*[-–]\s*/i,
    /\b(indian|chinese|italian|french|mexican|thai|japanese|korean)\s+(breakfast|lunch|dinner)\s+spot\b/i,
    /معلم\s*(رئيسي|شهير|عام|مميز)?/,
    /مطعم\s*(في|بـ|ال)?\s*[\u0600-\u06ff\s-]*$/,
    /نشاط\s*(عام|مميز)?/,
    /مطعم\s*(فطور|غداء|عشاء)\s*موصى\s*به/,
  ];

  if (genericPatterns.some((r) => r.test(combined))) return true;

  const loweredName = name.toLowerCase();
  const loweredAddress = address.toLowerCase();
  if (destinationText) {
    if (loweredName === destinationText || loweredAddress === destinationText) return true;
    if ((/^(restaurant|landmark|attraction|activity|مطعم|معلم|نشاط)/i).test(loweredName) && loweredName.includes(destinationText)) return true;
  }

  return false;
}

// Detect invalid results: medical facilities, clinics, etc. that AI confuses with restaurants
function isInvalidActivityResult(activity: any): boolean {
  const name = String(getActivityName(activity) || "").trim();
  const address = String(activity?.address || "").trim();
  const combined = `${name} ${activity?.description || ""} ${activity?.category || ""} ${address}`.toLowerCase();
  // Reject medical/clinical results
  if (/(clinic|hospital|medical|dental|doctor|pharmacy|عيادة|مستشفى|طبيب|صيدلية|مختبر|أسنان|علاج|تشخيص)/i.test(combined)) return true;
  // STRICT: Reject empty or near-empty names
  if (!name || name.length < 2) return true;
  // STRICT: Reject coordinate-only addresses (e.g. "47.5952,-122.3316")
  if (address && /^[-+]?\d{1,3}\.\d+\s*[,،]\s*[-+]?\d{1,3}\.\d+$/.test(address)) return true;
  // STRICT: Reject names that are pure coordinates
  if (/^[-+]?\d{1,3}\.\d+\s*[,،]\s*[-+]?\d{1,3}\.\d+$/.test(name)) return true;
  // STRICT: Reject self-repeating city tokens like "Seattle Seattle" with no real venue
  const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 3 && new Set(tokens).size === 1) return true;
  return false;
}

function itineraryViolatesPreferences(
  itinerary: any,
  destination: string,
  prefs: PreferenceFlags,
  selectedInterests: Set<string> = new Set<string>(),
  specialRequests: SpecialRequestInjection[] = [],
  expectedDailyCount?: number,
): boolean {
  if (!Array.isArray(itinerary?.days) || itinerary.days.length === 0) return true;

  let totalActivities = 0;
  let genericCount = 0;
  const mealCats = new Set(["breakfast", "lunch", "dinner"]);
  const requiredSpecialRequests = new Set(specialRequests.map((request) => normalizeForDedup(request.query)).filter(Boolean));
  const matchedSpecialRequests = new Set<string>();

  for (const day of itinerary.days) {
    const activities = Array.isArray(day?.activities) ? day.activities : [];
    if (activities.length === 0) return true;
    // Strict: missing activities below target invalidates the day; over-count is post-trimmed
    if (expectedDailyCount && activities.length < expectedDailyCount) return true;

    const dayMealCounts = { breakfast: 0, lunch: 0, dinner: 0 };
    let nonMealActivities = 0;
    let dayInterestMatches = 0;
    let daySpecialMatches = 0;

    for (const act of activities) {
      totalActivities++;
      if (looksGenericActivity(act, destination)) genericCount++;
      if (looksOutOfCityContext(act, destination)) return true;
      const category = String(act?.category || "").toLowerCase();
      if (prefs.hasMealMention && mealCats.has(category) && looksGenericActivity(act, destination)) {
        return true;
      }
      if (category in dayMealCounts) {
        (dayMealCounts as any)[category] += 1;
      } else if (!["hotel", "transport", "snack"].includes(category)) {
        nonMealActivities++;
        if (selectedInterests.size > 0 && activityMatchesSelectedInterests(act, selectedInterests)) {
          dayInterestMatches++;
        }
        for (const request of specialRequests) {
          if (activityMatchesSpecialRequest(act, request.query)) {
            matchedSpecialRequests.add(normalizeForDedup(request.query));
            daySpecialMatches++;
          }
        }
      }
    }

    if (prefs.hasMealMention) {
      if (!prefs.wantBreakfast && dayMealCounts.breakfast > 0) return true;
      if (!prefs.wantLunch && dayMealCounts.lunch > 0) return true;
      if (!prefs.wantDinner && dayMealCounts.dinner > 0) return true;
      if (prefs.wantBreakfast && dayMealCounts.breakfast === 0) return true;
      if (prefs.wantLunch && dayMealCounts.lunch === 0) return true;
      if (prefs.wantDinner && dayMealCounts.dinner === 0) return true;
    }

    // Reject restaurant-only plans (only if daily cap allows non-meals)
    if (nonMealActivities === 0 && activities.length > 0) {
      return true;
    }

    // Soft check: log but don't fail validation when no interest match found
    if (selectedInterests.size > 0 && nonMealActivities > 0 && dayInterestMatches === 0 && daySpecialMatches === 0) {
      console.warn("Day has no interest matches (soft warning, not failing validation)");
    }
  }

  // Only reject if MORE than 40% of activities are generic
  if (totalActivities > 0 && (genericCount / totalActivities) > 0.4) {
    console.warn(`Quality: ${genericCount}/${totalActivities} activities look generic (>${Math.round(0.4*100)}%)`);
    return true;
  }

  // Swimming enforcement: if user requested swimming, at least one activity must be water-related
  if (prefs.wantsSwimming) {
    const waterRegex = /swim|pool|beach|water|aqua|snorkel|diving|surf|marina|island|سباحة|شاطئ|مسبح|غطس|بحر|جزيرة|أكوا/i;
    let hasWaterActivity = false;
    for (const day of itinerary.days) {
      for (const act of (day?.activities || [])) {
        const combined = `${act?.name || ""} ${act?.description || ""} ${act?.category || ""}`;
        if (waterRegex.test(combined)) { hasWaterActivity = true; break; }
      }
      if (hasWaterActivity) break;
    }
    if (!hasWaterActivity) {
      console.warn("Swimming requested but no water activities found in itinerary");
      return true;
    }
  }

  // STRICT: any unmatched user special request is a hard violation. The
  // caller (post-validation block) will then trigger a targeted refill so
  // only the unrelated slots get swapped — matched activities are kept.
  if (requiredSpecialRequests.size > 0 && matchedSpecialRequests.size < requiredSpecialRequests.size) {
    const unmatched = Array.from(requiredSpecialRequests).filter((q) => !matchedSpecialRequests.has(q));
    console.warn(`[STRICT] Unmatched special requests (${matchedSpecialRequests.size}/${requiredSpecialRequests.size}): ${unmatched.join(" | ")} — flagging for slot refill`);
    return true;
  }

  return false;
}

interface PlaceInfo {
  name: string; nameAr: string; lat: number; lng: number; address: string; category: string; googleMapsUrl?: string; googleMapsCoordsUrl?: string; googleMapsLinkReason?: string; placeId?: string; dataId?: string; dataCid?: string; providerId?: string; rating?: number; imageUrl?: string; placeTypes?: string[]; placeType?: string; placeTypeId?: string; openingHours?: string; openState?: string; hours?: string; operating_hours?: any;
}
interface RestaurantInfo {
  name: string; nameAr: string; lat: number; lng: number; address: string; type: string; cuisine?: string; rating?: number; phone?: string; website?: string; openingHours?: string; openState?: string; hours?: string; operating_hours?: any; googleMapsUrl?: string; googleMapsCoordsUrl?: string; googleMapsLinkReason?: string; placeId?: string; dataId?: string; dataCid?: string; providerId?: string; imageUrl?: string; placeTypes?: string[]; placeType?: string; placeTypeId?: string;
}
interface CityData {
  landmarks: PlaceInfo[];
  restaurants: RestaurantInfo[];
}

const CITY_PLACES: Record<string, CityData> = {
  istanbul: {
    landmarks: [
      { name: "Hagia Sophia", nameAr: "آيا صوفيا", lat: 41.0086, lng: 28.9802, address: "Sultan Ahmet, Ayasofya Meydanı No:1, Fatih", category: "attraction" },
      { name: "Blue Mosque", nameAr: "المسجد الأزرق (جامع السلطان أحمد)", lat: 41.0054, lng: 28.9768, address: "Sultan Ahmet, At Meydanı No:7, Fatih", category: "cultural" },
      { name: "Topkapi Palace", nameAr: "قصر توبكابي", lat: 41.0115, lng: 28.9834, address: "Cankurtaran, 34122 Fatih", category: "attraction" },
      { name: "Grand Bazaar", nameAr: "البازار الكبير (كابالي تشارشي)", lat: 41.0108, lng: 28.9680, address: "Beyazıt, Kalpakçılar Cd. No:22, Fatih", category: "shopping" },
      { name: "Galata Tower", nameAr: "برج غلطة", lat: 41.0256, lng: 28.9741, address: "Bereketzade, Galata Kulesi, Beyoğlu", category: "attraction" },
      { name: "Basilica Cistern", nameAr: "صهريج البازيليكا", lat: 41.0084, lng: 28.9779, address: "Alemdar, Yerebatan Cd. 1/3, Fatih", category: "attraction" },
      { name: "Dolmabahce Palace", nameAr: "قصر دولما بهتشه", lat: 41.0391, lng: 29.0004, address: "Vişnezade, Dolmabahçe Cd., Beşiktaş", category: "attraction" },
      { name: "Bosphorus Cruise", nameAr: "رحلة بحرية في البوسفور", lat: 41.0235, lng: 29.0139, address: "Eminönü Ferry Port, Fatih", category: "activity" },
      { name: "Spice Bazaar", nameAr: "سوق التوابل (البازار المصري)", lat: 41.0164, lng: 28.9707, address: "Rüstem Paşa, Erzak Ambarı Sok. No:92, Fatih", category: "shopping" },
      { name: "Istiklal Avenue", nameAr: "شارع الاستقلال", lat: 41.0340, lng: 28.9777, address: "İstiklal Cd., Beyoğlu", category: "activity" },
      { name: "Suleymaniye Mosque", nameAr: "جامع السليمانية", lat: 41.0161, lng: 28.9637, address: "Süleymaniye, Prof. Sıddık Sami Onar Cd. No:1, Fatih", category: "cultural" },
      { name: "Princes' Islands", nameAr: "جزر الأميرات", lat: 40.8695, lng: 29.0907, address: "Büyükada, Adalar", category: "nature" },
      { name: "Ortaköy Mosque", nameAr: "مسجد أورتاكوي", lat: 41.0476, lng: 29.0274, address: "Mecidiye, Mecidiye Köprüsü Sk. No:1, Beşiktaş", category: "cultural" },
      { name: "Maiden's Tower", nameAr: "برج الفتاة (كيز كوليسي)", lat: 41.0211, lng: 29.0041, address: "Salacak, Üsküdar", category: "attraction" },
      { name: "Pierre Loti Hill", nameAr: "تلة بيير لوتي", lat: 41.0530, lng: 28.9390, address: "Eyüp Sultan, İdris Köşkü Cd., Eyüpsultan", category: "nature" },
    ],
    restaurants: [
      { name: "Hafiz Mustafa 1864", nameAr: "حافظ مصطفى 1864", lat: 41.0112, lng: 28.9751, address: "Hobyar, Hamidiye Cd. No:84, Fatih", type: "breakfast", cuisine: "turkish" },
      { name: "Simit Sarayı Sultanahmet", nameAr: "قصر السميت - السلطان أحمد", lat: 41.0070, lng: 28.9765, address: "Sultanahmet, Divanyolu Cd., Fatih", type: "breakfast", cuisine: "turkish" },
      { name: "Van Kahvaltı Evi", nameAr: "فان كاهفالتي إيفي (بيت فطور وان)", lat: 41.0337, lng: 28.9810, address: "Kılıçali Paşa, Defterdar Yokuşu No:52, Beyoğlu", type: "breakfast", cuisine: "turkish" },
      { name: "Nusr-Et Steakhouse", nameAr: "نصرت ستيك هاوس", lat: 41.0434, lng: 29.0087, address: "Etiler, Nispetiye Cd., Beşiktaş", type: "lunch", cuisine: "turkish" },
      { name: "Pandeli Restaurant", nameAr: "مطعم بانديلي", lat: 41.0167, lng: 28.9710, address: "Rüstem Paşa, Mısır Çarşısı No:1, Fatih", type: "lunch", cuisine: "turkish" },
      { name: "Karaköy Lokantası", nameAr: "مطعم كاراكوي لوكانتاسي", lat: 41.0222, lng: 28.9772, address: "Kemankeş Karamustafa Paşa, Kemankeş Cd. No:37, Beyoğlu", type: "lunch", cuisine: "turkish" },
      { name: "Mikla Restaurant", nameAr: "مطعم ميكلا", lat: 41.0319, lng: 28.9770, address: "Asmalı Mescit, The Marmara Pera, Beyoğlu", type: "dinner", cuisine: "turkish" },
      { name: "Çiya Sofrası", nameAr: "مطعم تشيا صوفراسي", lat: 40.9929, lng: 29.0234, address: "Caferağa, Güneşli Bahçe Sk. No:43, Kadıköy", type: "dinner", cuisine: "turkish" },
      { name: "Balıkçı Sabahattin", nameAr: "مطعم باليكجي صباح الدين", lat: 41.0045, lng: 28.9802, address: "Cankurtaran, Seyit Hasan Kuyu Sk. No:1, Fatih", type: "dinner", cuisine: "turkish" },
      { name: "Karaköy Güllüoğlu", nameAr: "كاراكوي غولوغلو للبقلاوة", lat: 41.0220, lng: 28.9770, address: "Kemankeş Karamustafa Paşa, Mumhane Cd. No:171, Beyoğlu", type: "snack", cuisine: "turkish" },
      { name: "Dubb Indian Restaurant", nameAr: "مطعم دوب الهندي", lat: 41.0060, lng: 28.9770, address: "Sultanahmet, Hocapaşa, Hüdavendigar Cd. No:14, Fatih", type: "lunch", cuisine: "indian" },
      { name: "Tandoori Restaurant Istanbul", nameAr: "مطعم تندوري إسطنبول", lat: 41.0350, lng: 28.9790, address: "Asmalı Mescit, İstiklal Cd., Beyoğlu", type: "dinner", cuisine: "indian" },
      { name: "Shalimar Indian Restaurant", nameAr: "مطعم شاليمار الهندي", lat: 41.0420, lng: 29.0060, address: "Levazım, Zorlu Center, Beşiktaş", type: "lunch", cuisine: "indian" },
      { name: "Mumbai Masala Istanbul", nameAr: "مومباي ماسالا إسطنبول", lat: 41.0310, lng: 28.9760, address: "Asmalı Mescit, Sofyalı Sk. No:7, Beyoğlu", type: "dinner", cuisine: "indian" },
      { name: "Taj Mahal Indian Restaurant", nameAr: "مطعم تاج محل الهندي", lat: 41.0440, lng: 29.0090, address: "Etiler, Nispetiye Cd., Beşiktaş", type: "lunch", cuisine: "indian" },
    ],
  },
  cairo: {
    landmarks: [
      { name: "Pyramids of Giza", nameAr: "أهرامات الجيزة", lat: 29.9792, lng: 31.1342, address: "Al Haram, Giza", category: "attraction" },
      { name: "Egyptian Museum", nameAr: "المتحف المصري", lat: 30.0478, lng: 31.2336, address: "Tahrir Square, Downtown Cairo", category: "cultural" },
      { name: "Khan El Khalili", nameAr: "خان الخليلي", lat: 30.0477, lng: 31.2625, address: "El-Gamaleya, Old Cairo", category: "shopping" },
      { name: "Al-Azhar Mosque", nameAr: "الجامع الأزهر", lat: 30.0459, lng: 31.2627, address: "El-Darb El-Ahmar, Cairo", category: "cultural" },
      { name: "Cairo Tower", nameAr: "برج القاهرة", lat: 30.0459, lng: 31.2243, address: "Gezira Island, Zamalek", category: "attraction" },
      { name: "Citadel of Saladin", nameAr: "قلعة صلاح الدين الأيوبي", lat: 30.0288, lng: 31.2599, address: "Al Abageyah, El Khalifa", category: "attraction" },
      { name: "Grand Egyptian Museum", nameAr: "المتحف المصري الكبير", lat: 29.9949, lng: 31.1171, address: "Al Remaya Square, Giza", category: "cultural" },
      { name: "Al-Muizz Street", nameAr: "شارع المعز لدين الله", lat: 30.0510, lng: 31.2618, address: "El-Gamaleya, Islamic Cairo", category: "activity" },
      { name: "Nile Felucca Ride", nameAr: "رحلة فلوكة في النيل", lat: 30.0444, lng: 31.2272, address: "Corniche El Nil, Garden City", category: "activity" },
    ],
    restaurants: [
      { name: "Zooba", nameAr: "مطعم زووبا", lat: 30.0615, lng: 31.2200, address: "26 July St., Zamalek", type: "breakfast", cuisine: "egyptian" },
      { name: "Felfela Restaurant", nameAr: "مطعم فلفلة", lat: 30.0453, lng: 31.2367, address: "15 Hoda Shaarawi St., Downtown", type: "lunch", cuisine: "egyptian" },
      { name: "Abou El Sid", nameAr: "مطعم أبو السيد", lat: 30.0612, lng: 31.2191, address: "157 26th of July St., Zamalek", type: "dinner", cuisine: "egyptian" },
      { name: "Andrea El Mariouteya", nameAr: "مطعم أندريا المريوطية", lat: 30.0128, lng: 31.1600, address: "59 Mariouteya Canal Rd., Giza", type: "dinner", cuisine: "egyptian" },
      { name: "Naguib Mahfouz Cafe", nameAr: "مقهى نجيب محفوظ", lat: 30.0480, lng: 31.2620, address: "5 El Badistan Lane, Khan El Khalili", type: "snack", cuisine: "egyptian" },
    ],
  },
  riyadh: {
    landmarks: [
      { name: "Kingdom Centre Tower", nameAr: "برج المملكة", lat: 24.7112, lng: 46.6742, address: "King Fahd Rd, Al Olaya, Riyadh", category: "attraction" },
      { name: "Al Masmak Fortress", nameAr: "قصر المصمك", lat: 24.6310, lng: 46.7130, address: "Al Thumairi St, Dirah, Riyadh", category: "cultural" },
      { name: "Boulevard Riyadh City", nameAr: "بوليفارد رياض سيتي", lat: 24.7683, lng: 46.6050, address: "Hittin, Riyadh", category: "activity" },
      { name: "National Museum of Saudi Arabia", nameAr: "المتحف الوطني السعودي", lat: 24.6466, lng: 46.7101, address: "King Abdulaziz Historical Center, Riyadh", category: "cultural" },
      { name: "Diriyah (At-Turaif)", nameAr: "الدرعية (حي الطريف)", lat: 24.7379, lng: 46.5733, address: "At-Turaif District, Diriyah", category: "cultural" },
      { name: "Wadi Hanifa", nameAr: "وادي حنيفة", lat: 24.6439, lng: 46.5750, address: "Wadi Hanifa, Riyadh", category: "nature" },
      { name: "Riyadh Front", nameAr: "واجهة الرياض", lat: 24.8510, lng: 46.7242, address: "Airport Road, Riyadh", category: "shopping" },
      { name: "Al Faisaliah Tower", nameAr: "برج الفيصلية", lat: 24.6907, lng: 46.6858, address: "King Fahd Rd, Al Olaya, Riyadh", category: "attraction" },
    ],
    restaurants: [
      { name: "Urth Caffé Riyadh", nameAr: "أرث كافيه الرياض", lat: 24.7115, lng: 46.6748, address: "Al Olaya, Riyadh", type: "breakfast", cuisine: "international" },
      { name: "Najd Village", nameAr: "قرية نجد", lat: 24.7015, lng: 46.6668, address: "Takhassusi St, Riyadh", type: "lunch", cuisine: "saudi" },
      { name: "Bujairi Terrace", nameAr: "بجيري تيراس", lat: 24.7332, lng: 46.5768, address: "Diriyah, Riyadh", type: "dinner", cuisine: "saudi" },
      { name: "Spazio 77", nameAr: "سبازيو 77", lat: 24.7112, lng: 46.6742, address: "Kingdom Centre, Riyadh", type: "dinner", cuisine: "international" },
      { name: "Sholay Indian Restaurant", nameAr: "مطعم شولاي الهندي", lat: 24.6887, lng: 46.6839, address: "Olaya Street, Riyadh", type: "lunch", cuisine: "indian" },
      { name: "Golden Dragon Indian", nameAr: "جولدن دراجون الهندي", lat: 24.7042, lng: 46.6769, address: "Al Sulimaniyah, Riyadh", type: "dinner", cuisine: "indian" },
    ],
  },
  jeddah: {
    landmarks: [
      { name: "Al-Balad Historic District", nameAr: "حي البلد التاريخي", lat: 21.4851, lng: 39.1862, address: "Al-Balad, Jeddah", category: "cultural" },
      { name: "King Fahd Fountain", nameAr: "نافورة الملك فهد", lat: 21.4956, lng: 39.1510, address: "Jeddah Corniche", category: "attraction" },
      { name: "Jeddah Corniche", nameAr: "كورنيش جدة", lat: 21.5433, lng: 39.1282, address: "Corniche Road, Jeddah", category: "activity" },
      { name: "Floating Mosque", nameAr: "مسجد الرحمة العائم", lat: 21.5160, lng: 39.1380, address: "Corniche Road, Jeddah", category: "cultural" },
      { name: "Red Sea Mall", nameAr: "رد سي مول", lat: 21.6177, lng: 39.1162, address: "King Abdullah Road, Jeddah", category: "shopping" },
      { name: "Jeddah Waterfront", nameAr: "واجهة جدة البحرية", lat: 21.5305, lng: 39.1427, address: "New Jeddah Corniche", category: "activity" },
    ],
    restaurants: [
      { name: "Al Nakheel Restaurant", nameAr: "مطعم النخيل", lat: 21.4844, lng: 39.1868, address: "Al-Balad, Jeddah", type: "lunch", cuisine: "saudi" },
      { name: "Twina Restaurant", nameAr: "مطعم توينا", lat: 21.5750, lng: 39.1200, address: "Al Zahra District, Jeddah", type: "dinner", cuisine: "international" },
      { name: "Beit Misk", nameAr: "بيت مسك", lat: 21.5582, lng: 39.1268, address: "Al Shati District, Jeddah", type: "dinner", cuisine: "lebanese" },
      { name: "The Butcher Shop & Grill", nameAr: "ذا بوتشر شوب آند غريل", lat: 21.5788, lng: 39.1191, address: "Al Hamra District, Jeddah", type: "lunch", cuisine: "international" },
    ],
  },
  dubai: {
    landmarks: [
      { name: "Burj Khalifa", nameAr: "برج خليفة", lat: 25.1972, lng: 55.2744, address: "1 Sheikh Mohammed bin Rashid Blvd, Downtown Dubai", category: "attraction" },
      { name: "Dubai Mall", nameAr: "دبي مول", lat: 25.1985, lng: 55.2796, address: "Financial Center Rd, Downtown Dubai", category: "shopping" },
      { name: "Palm Jumeirah", nameAr: "نخلة جميرا", lat: 25.1124, lng: 55.1390, address: "Palm Jumeirah, Dubai", category: "attraction" },
      { name: "Dubai Frame", nameAr: "برواز دبي", lat: 25.2350, lng: 55.3004, address: "Zabeel Park, Dubai", category: "attraction" },
      { name: "Museum of the Future", nameAr: "متحف المستقبل", lat: 25.2199, lng: 55.2806, address: "Sheikh Zayed Rd, Trade Centre", category: "attraction" },
      { name: "Gold Souk", nameAr: "سوق الذهب", lat: 25.2867, lng: 55.2972, address: "Gold Souk, Deira, Dubai", category: "shopping" },
    ],
    restaurants: [
      { name: "Arabian Tea House", nameAr: "بيت الشاي العربي", lat: 25.2635, lng: 55.2970, address: "Al Fahidi Historical District, Bur Dubai", type: "breakfast", cuisine: "emirati" },
      { name: "Ravi Restaurant", nameAr: "مطعم رافي", lat: 25.2240, lng: 55.2670, address: "Near Satwa Roundabout, Al Satwa", type: "lunch", cuisine: "pakistani" },
      { name: "Al Mahara", nameAr: "مطعم المحارة", lat: 25.1413, lng: 55.1851, address: "Burj Al Arab, Jumeirah Beach Rd", type: "dinner", cuisine: "seafood" },
      { name: "Comptoir 102", nameAr: "كومتوار 102", lat: 25.2100, lng: 55.2530, address: "102 Beach Rd, Jumeirah 1", type: "breakfast", cuisine: "french" },
    ],
  },
  abudhabi: {
    landmarks: [
      { name: "Sheikh Zayed Grand Mosque", nameAr: "جامع الشيخ زايد الكبير", lat: 24.4128, lng: 54.4750, address: "Sheikh Rashid Bin Saeed St, Abu Dhabi", category: "cultural" },
      { name: "Louvre Abu Dhabi", nameAr: "متحف اللوفر أبوظبي", lat: 24.5339, lng: 54.3983, address: "Saadiyat Cultural District, Abu Dhabi", category: "cultural" },
      { name: "Emirates Palace", nameAr: "قصر الإمارات", lat: 24.4615, lng: 54.3178, address: "West Corniche Rd, Abu Dhabi", category: "attraction" },
      { name: "Qasr Al Watan", nameAr: "قصر الوطن", lat: 24.4627, lng: 54.3060, address: "Al Ras Al Akhdar, Abu Dhabi", category: "cultural" },
      { name: "Yas Island", nameAr: "جزيرة ياس", lat: 24.4889, lng: 54.6024, address: "Yas Island, Abu Dhabi", category: "activity" },
      { name: "Ferrari World Abu Dhabi", nameAr: "عالم فيراري أبوظبي", lat: 24.4838, lng: 54.6073, address: "Yas Island, Abu Dhabi", category: "entertainment" },
      { name: "Corniche Beach", nameAr: "شاطئ الكورنيش", lat: 24.4734, lng: 54.3437, address: "Corniche Rd, Abu Dhabi", category: "beach" },
      { name: "Mangrove National Park", nameAr: "محمية القرم الوطنية", lat: 24.4537, lng: 54.4339, address: "Al Reem Island, Abu Dhabi", category: "nature" },
      { name: "Heritage Village", nameAr: "القرية التراثية", lat: 24.4760, lng: 54.3370, address: "Breakwater, Near Marina Mall, Abu Dhabi", category: "cultural" },
      { name: "Yas Waterworld", nameAr: "ياس ووتروورلد", lat: 24.4878, lng: 54.6020, address: "Yas Island, Abu Dhabi", category: "activity" },
      { name: "Warner Bros. World Abu Dhabi", nameAr: "عالم وارنر براذرز أبوظبي", lat: 24.4892, lng: 54.6080, address: "Yas Island, Abu Dhabi", category: "entertainment" },
      { name: "Saadiyat Island Beach", nameAr: "شاطئ جزيرة السعديات", lat: 24.5400, lng: 54.4200, address: "Saadiyat Island, Abu Dhabi", category: "beach" },
    ],
    restaurants: [
      { name: "Li Beirut", nameAr: "لي بيروت", lat: 24.4610, lng: 54.3180, address: "Jumeirah at Etihad Towers, Abu Dhabi", type: "lunch", cuisine: "lebanese" },
      { name: "Hakkasan Abu Dhabi", nameAr: "هاكاسان أبوظبي", lat: 24.4612, lng: 54.3175, address: "Emirates Palace, Abu Dhabi", type: "dinner", cuisine: "chinese" },
      { name: "Café Arabia", nameAr: "كافيه أرابيا", lat: 24.4530, lng: 54.3790, address: "Al Bateen, Abu Dhabi", type: "breakfast", cuisine: "emirati" },
      { name: "Al Fanar Restaurant", nameAr: "مطعم الفنر", lat: 24.4962, lng: 54.6110, address: "Yas Mall, Abu Dhabi", type: "lunch", cuisine: "emirati" },
      { name: "Zuma Abu Dhabi", nameAr: "زوما أبوظبي", lat: 24.4530, lng: 54.3940, address: "The Galleria Al Maryah Island, Abu Dhabi", type: "dinner", cuisine: "japanese" },
      { name: "Verso", nameAr: "فيرسو", lat: 24.4540, lng: 54.3945, address: "The Galleria Al Maryah Island, Abu Dhabi", type: "breakfast", cuisine: "italian" },
      { name: "India Palace", nameAr: "قصر الهند", lat: 24.4870, lng: 54.3560, address: "Hamdan Street, Abu Dhabi", type: "lunch", cuisine: "indian" },
      { name: "Rangoli Restaurant", nameAr: "مطعم رانجولي", lat: 24.4535, lng: 54.3780, address: "Yas Island, Abu Dhabi", type: "dinner", cuisine: "indian" },
      { name: "Zafran Indian Bistro", nameAr: "زعفران بيسترو الهندي", lat: 24.4540, lng: 54.3940, address: "The Galleria Al Maryah Island, Abu Dhabi", type: "lunch", cuisine: "indian" },
    ],
  },
  paris: {
    landmarks: [
      { name: "Eiffel Tower", nameAr: "برج إيفل", lat: 48.8584, lng: 2.2945, address: "Champ de Mars, 5 Avenue Anatole France, 75007", category: "attraction" },
      { name: "Louvre Museum", nameAr: "متحف اللوفر", lat: 48.8606, lng: 2.3376, address: "Rue de Rivoli, 75001 Paris", category: "cultural" },
      { name: "Notre-Dame Cathedral", nameAr: "كاتدرائية نوتردام", lat: 48.8530, lng: 2.3499, address: "6 Parvis Notre-Dame, 75004", category: "cultural" },
      { name: "Sacré-Cœur Basilica", nameAr: "كنيسة القلب المقدس", lat: 48.8867, lng: 2.3431, address: "35 Rue du Chevalier de la Barre, 75018", category: "cultural" },
      { name: "Champs-Élysées", nameAr: "شارع الشانزليزيه", lat: 48.8698, lng: 2.3075, address: "Av. des Champs-Élysées, 75008", category: "activity" },
    ],
    restaurants: [
      { name: "Café de Flore", nameAr: "مقهى دو فلور", lat: 48.8540, lng: 2.3326, address: "172 Bd Saint-Germain, 75006", type: "breakfast", cuisine: "french" },
      { name: "Le Comptoir du Panthéon", nameAr: "لو كومتوار دو بانتيون", lat: 48.8462, lng: 2.3462, address: "5 Rue Soufflot, 75005", type: "lunch", cuisine: "french" },
      { name: "Le Jules Verne", nameAr: "مطعم جول فيرن", lat: 48.8584, lng: 2.2945, address: "Eiffel Tower, 2nd floor, 75007", type: "dinner", cuisine: "french" },
      { name: "Ladurée", nameAr: "لادوريه", lat: 48.8694, lng: 2.3072, address: "75 Av. des Champs-Élysées, 75008", type: "snack", cuisine: "french" },
    ],
  },
  london: {
    landmarks: [
      { name: "Tower of London", nameAr: "برج لندن", lat: 51.5081, lng: -0.0759, address: "London EC3N 4AB", category: "attraction" },
      { name: "British Museum", nameAr: "المتحف البريطاني", lat: 51.5194, lng: -0.1270, address: "Great Russell St, London WC1B 3DG", category: "cultural" },
      { name: "Buckingham Palace", nameAr: "قصر باكنغهام", lat: 51.5014, lng: -0.1419, address: "London SW1A 1AA", category: "attraction" },
      { name: "Big Ben & Westminster", nameAr: "ساعة بيغ بن وقصر وستمنستر", lat: 51.5007, lng: -0.1246, address: "London SW1A 0AA", category: "attraction" },
      { name: "London Eye", nameAr: "عين لندن", lat: 51.5033, lng: -0.1196, address: "Riverside Building, County Hall, SE1 7PB", category: "attraction" },
      { name: "Hyde Park", nameAr: "هايد بارك", lat: 51.5073, lng: -0.1657, address: "London W2 2UH", category: "nature" },
    ],
    restaurants: [
      { name: "Dishoom King's Cross", nameAr: "ديشوم كينغز كروس", lat: 51.5358, lng: -0.1249, address: "5 Stable St, London N1C 4AB", type: "breakfast", cuisine: "indian" },
      { name: "Borough Market", nameAr: "سوق بورو", lat: 51.5055, lng: -0.0910, address: "8 Southwark St, London SE1 1TL", type: "lunch", cuisine: "international" },
      { name: "The Ivy", nameAr: "ذا آيفي", lat: 51.5122, lng: -0.1284, address: "1-5 West St, London WC2H 9NQ", type: "dinner", cuisine: "british" },
    ],
  },
  amman: {
    landmarks: [
      { name: "Roman Theatre", nameAr: "المدرج الروماني", lat: 31.9522, lng: 35.9380, address: "Hashemi St, Downtown Amman", category: "cultural" },
      { name: "Amman Citadel (Jabal al-Qal'a)", nameAr: "قلعة عمّان (جبل القلعة)", lat: 31.9539, lng: 35.9340, address: "K. Ali Ben Al-Hussein St, Jabal al-Qal'a", category: "attraction" },
      { name: "Rainbow Street", nameAr: "شارع الرينبو", lat: 31.9530, lng: 35.9290, address: "Rainbow St, Jabal Amman", category: "activity" },
      { name: "King Abdullah I Mosque", nameAr: "مسجد الملك عبدالله الأول", lat: 31.9545, lng: 35.9115, address: "Sulayman Al Nabulsi St, Abdali", category: "cultural" },
      { name: "Jordan Museum", nameAr: "متحف الأردن", lat: 31.9560, lng: 35.9175, address: "Ali bin Abi Taleb St, Ras al-Ain", category: "cultural" },
      { name: "Boulevard Abdali", nameAr: "بوليفارد العبدلي", lat: 31.9575, lng: 35.9090, address: "Abdali, Amman", category: "shopping" },
      { name: "Wild Jordan Center", nameAr: "مركز الأردن البرية", lat: 31.9535, lng: 35.9275, address: "Othman Bin Affan St, Jabal Amman", category: "nature" },
      { name: "Darat al-Funun", nameAr: "دارة الفنون", lat: 31.9527, lng: 35.9305, address: "Nadeem al-Mallah St, Jabal al-Weibdeh", category: "cultural" },
      { name: "Duke's Diwan", nameAr: "ديوان الدوق", lat: 31.9525, lng: 35.9355, address: "King Faisal St, Downtown Amman", category: "cultural" },
      { name: "Wadi Rum Day Trip", nameAr: "رحلة يوم إلى وادي رم", lat: 29.5872, lng: 35.4208, address: "Wadi Rum, Aqaba", category: "nature" },
      { name: "Dead Sea", nameAr: "البحر الميت", lat: 31.5300, lng: 35.4700, address: "Dead Sea, Jordan Valley", category: "nature" },
      { name: "Jerash Ancient Ruins", nameAr: "آثار جرش", lat: 32.2747, lng: 35.8913, address: "Jerash, Jordan", category: "cultural" },
    ],
    restaurants: [
      { name: "Hashem Restaurant", nameAr: "مطعم هاشم", lat: 31.9530, lng: 35.9355, address: "King Faisal St, Downtown Amman", type: "breakfast", cuisine: "jordanian" },
      { name: "Shawarma Reem", nameAr: "شاورما ريم", lat: 31.9555, lng: 35.8995, address: "Gardens St, Amman", type: "lunch", cuisine: "jordanian" },
      { name: "Sufra Restaurant", nameAr: "مطعم سفرة", lat: 31.9530, lng: 35.9285, address: "Rainbow St, Jabal Amman", type: "lunch", cuisine: "jordanian" },
      { name: "Tannoureen Restaurant", nameAr: "مطعم تنورين", lat: 31.9555, lng: 35.8680, address: "Zahran St, Um Uthaina, Amman", type: "dinner", cuisine: "lebanese" },
      { name: "Fakhreldin Restaurant", nameAr: "مطعم فخر الدين", lat: 31.9520, lng: 35.9265, address: "Taha Hussein St, Jabal Amman", type: "dinner", cuisine: "lebanese" },
      { name: "Jafra Cafe & Restaurant", nameAr: "مقهى ومطعم جفرا", lat: 31.9532, lng: 35.9290, address: "Rainbow St, Jabal Amman", type: "dinner", cuisine: "jordanian" },
      { name: "Habibah Sweets", nameAr: "حلويات حبيبة", lat: 31.9528, lng: 35.9375, address: "Al-Malek Faisal St, Downtown", type: "snack", cuisine: "jordanian" },
      { name: "Vinaigrette", nameAr: "فيناغريت", lat: 31.9540, lng: 35.8700, address: "Abdoun, Amman", type: "breakfast", cuisine: "international" },
    ],
  },
  bangkok: {
    landmarks: [
      { name: "Grand Palace", nameAr: "القصر الكبير", lat: 13.7500, lng: 100.4913, address: "Na Phra Lan Rd, Phra Borom Maha Ratchawang", category: "attraction" },
      { name: "Wat Pho (Temple of Reclining Buddha)", nameAr: "معبد وات فو (بوذا المتكئ)", lat: 13.7465, lng: 100.4930, address: "2 Sanam Chai Rd, Phra Borom Maha Ratchawang", category: "cultural" },
      { name: "Wat Arun (Temple of Dawn)", nameAr: "معبد وات أرون (معبد الفجر)", lat: 13.7437, lng: 100.4888, address: "158 Wang Doem Rd, Bangkok Yai", category: "cultural" },
      { name: "Chatuchak Weekend Market", nameAr: "سوق تشاتوتشاك", lat: 13.7999, lng: 100.5504, address: "Kamphaeng Phet 2 Rd, Chatuchak", category: "shopping" },
      { name: "Khao San Road", nameAr: "طريق خاو سان", lat: 13.7589, lng: 100.4974, address: "Khao San Rd, Phra Nakhon", category: "activity" },
      { name: "Lumphini Park", nameAr: "حديقة لومبيني", lat: 13.7310, lng: 100.5418, address: "Rama IV Rd, Lumphini", category: "nature" },
    ],
    restaurants: [
      { name: "Jay Fai", nameAr: "جاي فاي", lat: 13.7536, lng: 100.5057, address: "327 Maha Chai Rd, Samran Rat", type: "lunch", cuisine: "thai" },
      { name: "Thip Samai (Pad Thai)", nameAr: "ثيب ساماي (باد تاي)", lat: 13.7530, lng: 100.5050, address: "313 Maha Chai Rd, Samran Rat", type: "dinner", cuisine: "thai" },
      { name: "Som Tam Nua", nameAr: "سوم تام نوا", lat: 13.7447, lng: 100.5346, address: "392/14 Siam Sq Soi 5", type: "lunch", cuisine: "thai" },
      { name: "After You Dessert Café", nameAr: "أفتر يو ديزيرت كافيه", lat: 13.7460, lng: 100.5340, address: "Siam Paragon, Pathum Wan", type: "snack", cuisine: "thai" },
      { name: "Or Tor Kor Market", nameAr: "سوق أور تور كور", lat: 13.8010, lng: 100.5515, address: "Kamphaeng Phet Rd, Chatuchak", type: "breakfast", cuisine: "thai" },
    ],
  },
  tokyo: {
    landmarks: [
      { name: "Senso-ji Temple", nameAr: "معبد سينسو-جي", lat: 35.7147, lng: 139.7966, address: "2 Chome-3-1 Asakusa, Taito City", category: "cultural" },
      { name: "Meiji Shrine", nameAr: "ضريح ميجي", lat: 35.6764, lng: 139.6993, address: "1-1 Yoyogikamizonocho, Shibuya City", category: "cultural" },
      { name: "Shibuya Crossing", nameAr: "تقاطع شيبويا", lat: 35.6595, lng: 139.7005, address: "Shibuya, Shibuya City", category: "attraction" },
      { name: "Tokyo Tower", nameAr: "برج طوكيو", lat: 35.6586, lng: 139.7454, address: "4 Chome-2-8 Shibakoen, Minato City", category: "attraction" },
      { name: "Akihabara Electric Town", nameAr: "أكيهابارا (مدينة الإلكترونيات)", lat: 35.7023, lng: 139.7745, address: "Sotokanda, Chiyoda City", category: "shopping" },
      { name: "Shinjuku Gyoen National Garden", nameAr: "حديقة شينجوكو غيوئن", lat: 35.6852, lng: 139.7100, address: "11 Naitomachi, Shinjuku City", category: "nature" },
    ],
    restaurants: [
      { name: "Ichiran Ramen Shibuya", nameAr: "إيشيران رامن شيبويا", lat: 35.6614, lng: 139.6989, address: "1-22-7 Jinnan, Shibuya City", type: "lunch", cuisine: "japanese" },
      { name: "Tsukiji Outer Market", nameAr: "سوق تسوكيجي الخارجي", lat: 35.6654, lng: 139.7707, address: "4 Chome-16-2 Tsukiji, Chuo City", type: "breakfast", cuisine: "japanese" },
      { name: "Gonpachi Nishi-Azabu", nameAr: "غونباتشي نيشي-أزابو", lat: 35.6545, lng: 139.7265, address: "1-13-11 Nishi-Azabu, Minato City", type: "dinner", cuisine: "japanese" },
      { name: "Afuri Ramen", nameAr: "أفوري رامن", lat: 35.6495, lng: 139.7105, address: "1-1-7 Ebisu-Minami, Shibuya City", type: "dinner", cuisine: "japanese" },
    ],
  },
  barcelona: {
    landmarks: [
      { name: "Sagrada Família", nameAr: "كنيسة ساغرادا فاميليا", lat: 41.4036, lng: 2.1744, address: "C/ de Mallorca, 401, L'Eixample", category: "cultural" },
      { name: "Park Güell", nameAr: "حديقة غويل", lat: 41.4145, lng: 2.1527, address: "08024 Barcelona", category: "nature" },
      { name: "La Rambla", nameAr: "شارع لا رامبلا", lat: 41.3809, lng: 2.1734, address: "La Rambla, Ciutat Vella", category: "activity" },
      { name: "Casa Batlló", nameAr: "كازا باتلو", lat: 41.3916, lng: 2.1650, address: "Passeig de Gràcia, 43, L'Eixample", category: "attraction" },
      { name: "Gothic Quarter", nameAr: "الحي القوطي", lat: 41.3825, lng: 2.1769, address: "Barri Gòtic, Ciutat Vella", category: "cultural" },
      { name: "Barceloneta Beach", nameAr: "شاطئ بارسلونيتا", lat: 41.3811, lng: 2.1925, address: "Passeig Marítim de la Barceloneta", category: "beach" },
    ],
    restaurants: [
      { name: "La Boqueria Market", nameAr: "سوق لا بوكيريا", lat: 41.3816, lng: 2.1718, address: "La Rambla, 91, Ciutat Vella", type: "breakfast", cuisine: "spanish" },
      { name: "Cal Pep", nameAr: "كال بيب", lat: 41.3835, lng: 2.1823, address: "Plaça de les Olles, 8, Ciutat Vella", type: "lunch", cuisine: "spanish" },
      { name: "Can Culleretes", nameAr: "كان كوليريتيس", lat: 41.3815, lng: 2.1754, address: "Carrer d'en Quintana, 5, Ciutat Vella", type: "dinner", cuisine: "spanish" },
    ],
  },
  rome: {
    landmarks: [
      { name: "Colosseum", nameAr: "الكولوسيوم", lat: 41.8902, lng: 12.4922, address: "Piazza del Colosseo, 1, Roma", category: "cultural" },
      { name: "Vatican Museums & Sistine Chapel", nameAr: "متاحف الفاتيكان", lat: 41.9065, lng: 12.4536, address: "Viale Vaticano, Città del Vaticano", category: "cultural" },
      { name: "Trevi Fountain", nameAr: "نافورة تريفي", lat: 41.9009, lng: 12.4833, address: "Piazza di Trevi, Roma", category: "attraction" },
      { name: "Pantheon", nameAr: "البانثيون", lat: 41.8986, lng: 12.4769, address: "Piazza della Rotonda, Roma", category: "cultural" },
      { name: "Roman Forum", nameAr: "المنتدى الروماني", lat: 41.8925, lng: 12.4853, address: "Via della Salara Vecchia, Roma", category: "cultural" },
      { name: "Spanish Steps", nameAr: "الدرج الإسباني", lat: 41.9060, lng: 12.4828, address: "Piazza di Spagna, Roma", category: "attraction" },
    ],
    restaurants: [
      { name: "Roscioli Caffè", nameAr: "روشولي كافيه", lat: 41.8942, lng: 12.4745, address: "Piazza Benedetto Cairoli, 16, Roma", type: "breakfast", cuisine: "italian" },
      { name: "Da Enzo al 29", nameAr: "دا إنزو 29", lat: 41.8860, lng: 12.4713, address: "Via dei Vascellari, 29, Trastevere", type: "lunch", cuisine: "italian" },
      { name: "Armando al Pantheon", nameAr: "أرماندو البانثيون", lat: 41.8990, lng: 12.4762, address: "Salita de' Crescenzi, 31, Roma", type: "dinner", cuisine: "italian" },
    ],
  },
  doha: {
    landmarks: [
      { name: "Museum of Islamic Art", nameAr: "متحف الفن الإسلامي", lat: 25.2959, lng: 51.5396, address: "MIA Park, Doha", category: "cultural" },
      { name: "Souq Waqif", nameAr: "سوق واقف", lat: 25.2882, lng: 51.5336, address: "Al Souq, Doha", category: "shopping" },
      { name: "The Pearl-Qatar", nameAr: "لؤلؤة قطر", lat: 25.3684, lng: 51.5510, address: "The Pearl, Doha", category: "attraction" },
      { name: "Katara Cultural Village", nameAr: "الحي الثقافي كتارا", lat: 25.3590, lng: 51.5279, address: "Katara, Doha", category: "cultural" },
      { name: "National Museum of Qatar", nameAr: "متحف قطر الوطني", lat: 25.2867, lng: 51.5490, address: "Museum Park Street, Doha", category: "cultural" },
    ],
    restaurants: [
      { name: "Shay Al Shomous", nameAr: "شاي الشموس", lat: 25.2890, lng: 51.5340, address: "Souq Waqif, Doha", type: "breakfast", cuisine: "qatari" },
      { name: "Damascus Restaurant", nameAr: "مطعم دمشق", lat: 25.2885, lng: 51.5332, address: "Souq Waqif, Doha", type: "lunch", cuisine: "syrian" },
      { name: "Al Mourjan Restaurant", nameAr: "مطعم المرجان", lat: 25.2880, lng: 51.5338, address: "Souq Waqif, Doha", type: "dinner", cuisine: "qatari" },
    ],
  },
  newyork: {
    landmarks: [
      { name: "Statue of Liberty", nameAr: "تمثال الحرية", lat: 40.6892, lng: -74.0445, address: "Liberty Island, New York", category: "attraction" },
      { name: "Times Square", nameAr: "تايمز سكوير", lat: 40.7580, lng: -73.9855, address: "Manhattan, NY 10036", category: "attraction" },
      { name: "Central Park", nameAr: "سنترال بارك", lat: 40.7829, lng: -73.9654, address: "Central Park, New York", category: "nature" },
      { name: "Empire State Building", nameAr: "مبنى إمباير ستيت", lat: 40.7484, lng: -73.9857, address: "20 W 34th St, New York", category: "attraction" },
      { name: "Brooklyn Bridge", nameAr: "جسر بروكلين", lat: 40.7061, lng: -73.9969, address: "Brooklyn Bridge, New York", category: "attraction" },
      { name: "Metropolitan Museum of Art", nameAr: "متحف المتروبوليتان", lat: 40.7794, lng: -73.9632, address: "1000 5th Ave, New York", category: "cultural" },
    ],
    restaurants: [
      { name: "Katz's Delicatessen", nameAr: "كاتز ديلي", lat: 40.7223, lng: -73.9874, address: "205 E Houston St, New York", type: "breakfast", cuisine: "american" },
      { name: "Joe's Pizza", nameAr: "جوز بيتزا", lat: 40.7305, lng: -74.0020, address: "7 Carmine St, New York", type: "lunch", cuisine: "italian" },
      { name: "Peter Luger Steak House", nameAr: "بيتر لوغر ستيك", lat: 40.7099, lng: -73.9624, address: "178 Broadway, Brooklyn", type: "dinner", cuisine: "american" },
    ],
  },
  makkah: {
    landmarks: [
      { name: "Masjid al-Haram (Grand Mosque)", nameAr: "المسجد الحرام", lat: 21.4225, lng: 39.8262, address: "Al Haram, Makkah", category: "cultural" },
      { name: "Abraj Al-Bait Clock Tower", nameAr: "أبراج البيت", lat: 21.4187, lng: 39.8253, address: "King Abdulaziz Endowment, Makkah", category: "attraction" },
      { name: "Jabal al-Nour (Cave of Hira)", nameAr: "جبل النور (غار حراء)", lat: 21.4575, lng: 39.8583, address: "Jabal al-Nour, Makkah", category: "cultural" },
    ],
    restaurants: [
      { name: "Al Baik", nameAr: "البيك", lat: 21.4230, lng: 39.8260, address: "Al Haram, Makkah", type: "lunch", cuisine: "saudi" },
      { name: "Hanini Restaurant", nameAr: "مطعم حنيني", lat: 21.4185, lng: 39.8250, address: "Abraj Al-Bait, Makkah", type: "dinner", cuisine: "saudi" },
    ],
  },
  kualalumpur: {
    landmarks: [
      { name: "Petronas Twin Towers", nameAr: "أبراج بتروناس التوأم", lat: 3.1578, lng: 101.7117, address: "Kuala Lumpur City Centre", category: "attraction" },
      { name: "Batu Caves", nameAr: "كهوف باتو", lat: 3.2379, lng: 101.6840, address: "Gombak, Selangor", category: "cultural" },
      { name: "KL Tower", nameAr: "برج كوالالمبور", lat: 3.1529, lng: 101.7007, address: "2 Jalan Puncak, KL", category: "attraction" },
      { name: "Central Market", nameAr: "السوق المركزي", lat: 3.1457, lng: 101.6951, address: "Jalan Hang Kasturi, KL", category: "shopping" },
      { name: "Islamic Arts Museum", nameAr: "متحف الفنون الإسلامية", lat: 3.1427, lng: 101.6874, address: "Jalan Lembah Perdana, KL", category: "cultural" },
    ],
    restaurants: [
      { name: "Village Park Restaurant", nameAr: "فيلج بارك", lat: 3.1555, lng: 101.6563, address: "5 Jalan SS 21/37, Damansara", type: "breakfast", cuisine: "malaysian" },
      { name: "Jalan Alor Food Street", nameAr: "شارع جالان ألور", lat: 3.1458, lng: 101.7095, address: "Jalan Alor, Bukit Bintang", type: "dinner", cuisine: "malaysian" },
      { name: "Nasi Kandar Pelita", nameAr: "ناسي كاندار بيليتا", lat: 3.1564, lng: 101.7121, address: "149 Jalan Ampang, KL", type: "lunch", cuisine: "malaysian" },
    ],
  },
  manama: {
    landmarks: [
      { name: "Bahrain National Museum", nameAr: "متحف البحرين الوطني", lat: 26.2375, lng: 50.5457, address: "Al Fatih Highway, Manama", category: "cultural" },
      { name: "Al Fateh Grand Mosque", nameAr: "مسجد الفاتح الكبير", lat: 26.2148, lng: 50.5936, address: "Al Fatih Highway, Manama", category: "cultural" },
      { name: "Bahrain Fort (Qal'at al-Bahrain)", nameAr: "قلعة البحرين", lat: 26.2333, lng: 50.5200, address: "Karbabad, Northern Governorate", category: "cultural" },
      { name: "Bab Al Bahrain", nameAr: "باب البحرين", lat: 26.2297, lng: 50.5787, address: "Government Ave, Manama", category: "attraction" },
      { name: "The Avenues – Bahrain", nameAr: "الأفنيوز – البحرين", lat: 26.2190, lng: 50.4910, address: "Bahrain Bay, Manama", category: "shopping" },
      { name: "Tree of Life", nameAr: "شجرة الحياة", lat: 25.9940, lng: 50.5832, address: "Southern Governorate", category: "nature" },
      { name: "Manama Souq", nameAr: "سوق المنامة", lat: 26.2290, lng: 50.5800, address: "Bab Al Bahrain Ave, Manama", category: "shopping" },
      { name: "Al Areen Wildlife Park", nameAr: "محمية العرين", lat: 25.9670, lng: 50.5050, address: "Sakhir, Southern Governorate", category: "nature" },
      { name: "Bahrain International Circuit", nameAr: "حلبة البحرين الدولية", lat: 26.0325, lng: 50.5106, address: "Umm Jidar, Sakhir", category: "activity" },
      { name: "La Fontaine Centre of Contemporary Art", nameAr: "لا فونتين للفنون المعاصرة", lat: 26.2170, lng: 50.5880, address: "Hoora, Manama", category: "cultural" },
    ],
    restaurants: [
      { name: "Haji's Café", nameAr: "مقهى حاجي", lat: 26.2290, lng: 50.5795, address: "Manama Souq, Manama", type: "breakfast", cuisine: "bahraini" },
      { name: "Saffron by Jena", nameAr: "زعفران من جنى", lat: 26.2210, lng: 50.5890, address: "Adliya, Manama", type: "lunch", cuisine: "bahraini" },
      { name: "Masso Italian Restaurant", nameAr: "مطعم ماسو الإيطالي", lat: 26.2175, lng: 50.4940, address: "Four Seasons Hotel, Bahrain Bay", type: "dinner", cuisine: "italian" },
      { name: "Mirai Japanese Restaurant", nameAr: "مطعم ميراي الياباني", lat: 26.2200, lng: 50.5870, address: "Adliya, Manama", type: "dinner", cuisine: "japanese" },
      { name: "Lilou's Café", nameAr: "مقهى ليلو", lat: 26.2205, lng: 50.5875, address: "Adliya, Manama", type: "breakfast", cuisine: "french" },
      { name: "Lanterns Restaurant", nameAr: "مطعم فوانيس", lat: 26.2285, lng: 50.5800, address: "Manama Souq, Manama", type: "lunch", cuisine: "bahraini" },
      { name: "Zafran Indian Bistro", nameAr: "بيسترو زعفران الهندي", lat: 26.2195, lng: 50.5885, address: "Adliya, Manama", type: "lunch", cuisine: "indian" },
      { name: "Rasoi by Vineet", nameAr: "راسوي من فينيت", lat: 26.2270, lng: 50.5450, address: "Gulf Hotel, Manama", type: "dinner", cuisine: "indian" },
    ],
  },
  munich: {
    landmarks: [
      { name: "Marienplatz & New Town Hall", nameAr: "ماريان بلاتز وقاعة المدينة الجديدة", lat: 48.1374, lng: 11.5755, address: "Marienplatz 8, München", category: "attraction" },
      { name: "English Garden (Englischer Garten)", nameAr: "الحديقة الإنجليزية", lat: 48.1642, lng: 11.6054, address: "Englischer Garten, München", category: "nature" },
      { name: "Nymphenburg Palace", nameAr: "قصر نيمفنبورغ", lat: 48.1583, lng: 11.5033, address: "Schloß Nymphenburg 1, München", category: "cultural" },
      { name: "BMW Welt & Museum", nameAr: "عالم ومتحف بي إم دبليو", lat: 48.1770, lng: 11.5563, address: "Am Olympiapark 1, München", category: "attraction" },
      { name: "Viktualienmarkt", nameAr: "سوق فيكتوالين", lat: 48.1351, lng: 11.5763, address: "Viktualienmarkt 3, München", category: "shopping" },
      { name: "Allianz Arena", nameAr: "ملعب أليانز أرينا", lat: 48.2188, lng: 11.6247, address: "Werner-Heisenberg-Allee 25, München", category: "activity" },
    ],
    restaurants: [
      { name: "Café Luitpold", nameAr: "كافيه لويتبولد", lat: 48.1427, lng: 11.5760, address: "Brienner Str. 11, München", type: "breakfast", cuisine: "german" },
      { name: "Augustiner-Keller", nameAr: "أوغوستينر كيلر", lat: 48.1448, lng: 11.5533, address: "Arnulfstraße 52, München", type: "lunch", cuisine: "german" },
      { name: "Hofbräuhaus München", nameAr: "هوفبراوهاوس ميونخ", lat: 48.1376, lng: 11.5798, address: "Platzl 9, München", type: "dinner", cuisine: "german" },
    ],
  },
  muscat: {
    landmarks: [
      { name: "Sultan Qaboos Grand Mosque", nameAr: "جامع السلطان قابوس الأكبر", lat: 23.5862, lng: 58.4398, address: "Sultan Qaboos St, Muscat", category: "cultural" },
      { name: "Royal Opera House Muscat", nameAr: "دار الأوبرا السلطانية", lat: 23.5858, lng: 58.4028, address: "Al Kharjiyah St, Muscat", category: "cultural" },
      { name: "Muttrah Souq", nameAr: "سوق مطرح", lat: 23.6168, lng: 58.5711, address: "Muttrah Corniche, Muscat", category: "shopping" },
      { name: "Al Jalali & Al Mirani Forts", nameAr: "قلعتا الجلالي والميراني", lat: 23.6158, lng: 58.5943, address: "Old Muscat", category: "cultural" },
      { name: "Wadi Shab", nameAr: "وادي شاب", lat: 23.1630, lng: 59.2310, address: "Sur Highway, Al Sharqiyah", category: "nature" },
    ],
    restaurants: [
      { name: "Kargeen Café", nameAr: "مقهى كارجين", lat: 23.5880, lng: 58.4440, address: "Madinat Al Sultan Qaboos, Muscat", type: "breakfast", cuisine: "omani" },
      { name: "Bait Al Luban", nameAr: "بيت اللبان", lat: 23.6170, lng: 58.5710, address: "Muttrah Corniche, Muscat", type: "lunch", cuisine: "omani" },
      { name: "The Restaurant at The Chedi Muscat", nameAr: "مطعم ذا شيدي مسقط", lat: 23.6030, lng: 58.4950, address: "Al Khuwair, Muscat", type: "dinner", cuisine: "international" },
    ],
  },
  kuwait: {
    landmarks: [
      { name: "Kuwait Towers", nameAr: "أبراج الكويت", lat: 29.3905, lng: 47.9890, address: "Arabian Gulf St, Kuwait City", category: "attraction" },
      { name: "Grand Mosque of Kuwait", nameAr: "المسجد الكبير", lat: 29.3772, lng: 47.9753, address: "Al Safat, Kuwait City", category: "cultural" },
      { name: "The Avenues Mall", nameAr: "مجمع الأفنيوز", lat: 29.3123, lng: 47.9375, address: "Al Rai, Kuwait", category: "shopping" },
      { name: "Souq Al-Mubarakiya", nameAr: "سوق المباركية", lat: 29.3782, lng: 47.9790, address: "Al Mirqab, Kuwait City", category: "shopping" },
      { name: "Scientific Center Kuwait", nameAr: "المركز العلمي", lat: 29.3591, lng: 48.0014, address: "Salmiya, Kuwait", category: "attraction" },
    ],
    restaurants: [
      { name: "Mais Alghanim", nameAr: "ميس الغنيم", lat: 29.3370, lng: 48.0010, address: "Salmiya, Kuwait", type: "lunch", cuisine: "kuwaiti" },
      { name: "Freej Swalef", nameAr: "فريج صوالف", lat: 29.3400, lng: 47.9950, address: "Salmiya, Kuwait", type: "dinner", cuisine: "kuwaiti" },
      { name: "The Early Bird", nameAr: "ذا إيرلي بيرد", lat: 29.3390, lng: 48.0000, address: "Salmiya, Kuwait", type: "breakfast", cuisine: "international" },
    ],
  },
  berlin: {
    landmarks: [
      { name: "Brandenburg Gate", nameAr: "بوابة براندنبورغ", lat: 52.5163, lng: 13.3777, address: "Pariser Platz, Berlin", category: "attraction" },
      { name: "Berlin Wall Memorial", nameAr: "نصب جدار برلين", lat: 52.5351, lng: 13.3901, address: "Bernauer Str. 111, Berlin", category: "cultural" },
      { name: "Museum Island", nameAr: "جزيرة المتاحف", lat: 52.5169, lng: 13.4019, address: "Museumsinsel, Berlin", category: "cultural" },
      { name: "Reichstag Building", nameAr: "مبنى الرايخستاغ", lat: 52.5186, lng: 13.3761, address: "Platz der Republik 1, Berlin", category: "attraction" },
      { name: "Checkpoint Charlie", nameAr: "نقطة تفتيش تشارلي", lat: 52.5075, lng: 13.3904, address: "Friedrichstraße 43-45, Berlin", category: "cultural" },
    ],
    restaurants: [
      { name: "Café Einstein Stammhaus", nameAr: "كافيه أينشتاين", lat: 52.5030, lng: 13.3540, address: "Kurfürstenstraße 58, Berlin", type: "breakfast", cuisine: "german" },
      { name: "Mustafa's Gemüse Kebap", nameAr: "كباب مصطفى", lat: 52.4900, lng: 13.4270, address: "Mehringdamm 32, Berlin", type: "lunch", cuisine: "turkish" },
      { name: "Restaurant Tim Raue", nameAr: "مطعم تيم راوه", lat: 52.5070, lng: 13.3910, address: "Rudi-Dutschke-Str. 26, Berlin", type: "dinner", cuisine: "asian" },
    ],
  },
  marrakech: {
    landmarks: [
      { name: "Jemaa el-Fna Square", nameAr: "ساحة جامع الفنا", lat: 31.6258, lng: -7.9891, address: "Place Jemaa el-Fna, Marrakech", category: "attraction" },
      { name: "Majorelle Garden", nameAr: "حديقة ماجوريل", lat: 31.6415, lng: -8.0033, address: "Rue Yves Saint Laurent, Marrakech", category: "nature" },
      { name: "Bahia Palace", nameAr: "قصر الباهية", lat: 31.6216, lng: -7.9832, address: "Rue Riad Zitoun el Jdid, Marrakech", category: "cultural" },
      { name: "Koutoubia Mosque", nameAr: "مسجد الكتبية", lat: 31.6237, lng: -7.9935, address: "Avenue Mohammed V, Marrakech", category: "cultural" },
      { name: "Medina Souks", nameAr: "أسواق المدينة القديمة", lat: 31.6310, lng: -7.9870, address: "Medina, Marrakech", category: "shopping" },
    ],
    restaurants: [
      { name: "Café des Épices", nameAr: "مقهى التوابل", lat: 31.6313, lng: -7.9845, address: "Place Rahba Kedima, Medina", type: "breakfast", cuisine: "moroccan" },
      { name: "Al Fassia", nameAr: "الفاسية", lat: 31.6350, lng: -8.0100, address: "55 Boulevard Mohammed Zerktouni, Guéliz", type: "lunch", cuisine: "moroccan" },
      { name: "Le Jardin Restaurant", nameAr: "مطعم الحديقة", lat: 31.6300, lng: -7.9830, address: "32 Souk Sidi Abdelaziz, Medina", type: "dinner", cuisine: "moroccan" },
    ],
  },
};

const COUNTRY_CITY_MAP: Record<string, string> = {
  "saudi arabia": "riyadh", "السعودية": "riyadh", "المملكة العربية السعودية": "riyadh",
  "turkey": "istanbul", "تركيا": "istanbul",
  "egypt": "cairo", "مصر": "cairo",
  "uae": "dubai", "united arab emirates": "dubai", "الإمارات": "dubai",
  "france": "paris", "فرنسا": "paris",
  "uk": "london", "united kingdom": "london", "بريطانيا": "london",
  "jordan": "amman", "الأردن": "amman",
  "thailand": "bangkok", "تايلاند": "bangkok",
  "japan": "tokyo", "اليابان": "tokyo",
  "spain": "barcelona", "إسبانيا": "barcelona",
  "italy": "rome", "إيطاليا": "rome",
  "qatar": "doha", "قطر": "doha",
  "usa": "newyork", "united states": "newyork", "أمريكا": "newyork", "الولايات المتحدة": "newyork",
  "malaysia": "kualalumpur", "ماليزيا": "kualalumpur",
  "bahrain": "manama", "البحرين": "manama",
  "germany": "berlin", "ألمانيا": "berlin",
  "oman": "muscat", "عمان": "muscat", "سلطنة عمان": "muscat",
  "kuwait": "kuwait", "الكويت": "kuwait",
  "morocco": "marrakech", "المغرب": "marrakech",
};

function getCityKey(destination: string | null | undefined): string | null {
  if (!destination || typeof destination !== "string") return null;
  const d = destination.toLowerCase().trim();
  if (!d) return null;
  if (d.includes("east rutherford")) return "eastrutherford";
  if (d.includes("orlando")) return "orlando";
  if (d.includes("monterrey")) return "monterrey";
  if (d.includes("istanbul") || d.includes("اسطنبول") || d.includes("إسطنبول")) return "istanbul";
  if (d.includes("cairo") || d.includes("القاهرة")) return "cairo";
  if (d.includes("riyadh") || d.includes("الرياض")) return "riyadh";
  // IMPORTANT: Check "abu dhabi" BEFORE "dubai" to avoid false match
  if (d.includes("abu dhabi") || d.includes("أبوظبي") || d.includes("ابوظبي") || d.includes("أبو ظبي") || d.includes("ابو ظبي")) return "abudhabi";
  if (d.includes("dubai") || d.includes("دبي")) return "dubai";
  if (d.includes("paris") || d.includes("باريس")) return "paris";
  if (d.includes("london") || d.includes("لندن")) return "london";
  if (d.includes("jeddah") || d.includes("جدة")) return "jeddah";
  if (d.includes("amman") || d.includes("عمّان")) return "amman";
  if (d.includes("bangkok") || d.includes("بانكوك")) return "bangkok";
  if (d.includes("tokyo") || d.includes("طوكيو")) return "tokyo";
  if (d.includes("barcelona") || d.includes("برشلونة")) return "barcelona";
  if (d.includes("rome") || d.includes("roma") || d.includes("روما")) return "rome";
  if (d.includes("doha") || d.includes("الدوحة")) return "doha";
  if (d.includes("new york") || d.includes("نيويورك")) return "newyork";
  if (d.includes("makkah") || d.includes("mecca") || d.includes("مكة")) return "makkah";
  if (d.includes("kuala lumpur") || d.includes("كوالالمبور")) return "kualalumpur";
  if (d.includes("manama") || d.includes("المنامة") || d.includes("bahrain") || d.includes("البحرين")) return "manama";
  if (d.includes("munich") || d.includes("münchen") || d.includes("ميونخ")) return "munich";
  if (d.includes("muscat") || d.includes("مسقط")) return "muscat";
  if (d.includes("kuwait") || d.includes("الكويت")) return "kuwait";
  if (d.includes("berlin") || d.includes("برلين")) return "berlin";
  if (d.includes("marrakech") || d.includes("مراكش")) return "marrakech";
  for (const [country, cityKey] of Object.entries(COUNTRY_CITY_MAP)) {
    if (d === country || d.includes(country)) return cityKey;
  }
  return null;
}

const IATA_MAP: Record<string, string> = {
  istanbul: "IST", cairo: "CAI", dubai: "DXB", paris: "CDG", london: "LHR",
  jeddah: "JED", riyadh: "RUH", doha: "DOH", "abu dhabi": "AUH",
  foxborough: "BOS", foxboro: "BOS", boston: "BOS", "foxborough ma": "BOS", "foxborough massachusetts": "BOS",
  amman: "AMM", "عمان": "AMM", "عمّان": "AMM",
  "new york": "JFK", "los angeles": "LAX", tokyo: "NRT", bangkok: "BKK",
  singapore: "SIN", "kuala lumpur": "KUL", seoul: "ICN", berlin: "BER",
  munich: "MUC", rome: "FCO", barcelona: "BCN", madrid: "MAD",
  amsterdam: "AMS", miami: "MIA", "hong kong": "HKG",
  makkah: "JED", mecca: "JED", manama: "BAH", muscat: "MCT", kuwait: "KWI",
  marrakech: "RAK", abudhabi: "AUH",
  "الرياض": "RUH", "جدة": "JED", "دبي": "DXB", "القاهرة": "CAI",
  "أبوظبي": "AUH", "ابوظبي": "AUH", "أبو ظبي": "AUH",
  "اسطنبول": "IST", "إسطنبول": "IST", "باريس": "CDG", "لندن": "LHR",
  "بانكوك": "BKK", "طوكيو": "NRT", "برشلونة": "BCN",
  "روما": "FCO", "الدوحة": "DOH", "نيويورك": "JFK", "مكة": "JED", "كوالالمبور": "KUL",
  "المنامة": "BAH", "البحرين": "BAH", "مسقط": "MCT", "الكويت": "KWI",
  "ميونخ": "MUC", "برلين": "BER", "مراكش": "RAK",
  "saudi arabia": "RUH", "turkey": "IST", "egypt": "CAI", "uae": "DXB",
  "france": "CDG", "uk": "LHR", "germany": "BER", "japan": "NRT",
  "jordan": "AMM", "الأردن": "AMM", "thailand": "BKK", "تايلاند": "BKK",
  "spain": "BCN", "إسبانيا": "BCN", "italy": "FCO", "qatar": "DOH",
  "usa": "JFK", "أمريكا": "JFK", "malaysia": "KUL",
  "bahrain": "BAH", "oman": "MCT", "morocco": "RAK",
};

function formatTime(h: number) {
  const hh = Math.max(0, Math.min(23, Math.floor(h)));
  const mm = h % 1 >= 0.5 ? "30" : "00";
  return `${String(hh).padStart(2, "0")}:${mm}`;
}

// =================================================================
// LOCALIZATION HELPERS for backend-generated phrases
// Used by the final post-processing pass to ensure UI strings (meal
// labels, generic descriptions, "Check opening hours…", etc.) match
// the user's selected interface language. Proper nouns (place/venue
// names) stay in their original local language.
// =================================================================
type SupportedLang = "ar" | "en" | "fr" | "es" | "de" | "ru" | "zh" | "ur" | "tr" | "pt" | "it" | "id" | "hi" | "ja" | "ko";

const MEAL_LABELS: Record<string, Record<string, string>> = {
  breakfast: {
    ar: "فطور", en: "Breakfast", fr: "Petit-déjeuner", es: "Desayuno", de: "Frühstück", ru: "Завтрак",
    zh: "早餐", ur: "ناشتہ", tr: "Kahvaltı", pt: "Café da manhã", it: "Colazione", id: "Sarapan", hi: "नाश्ता", ja: "朝食", ko: "아침",
  },
  lunch: {
    ar: "غداء", en: "Lunch", fr: "Déjeuner", es: "Almuerzo", de: "Mittagessen", ru: "Обед",
    zh: "午餐", ur: "دوپہر کا کھانا", tr: "Öğle yemeği", pt: "Almoço", it: "Pranzo", id: "Makan siang", hi: "दोपहर का भोजन", ja: "昼食", ko: "점심",
  },
  dinner: {
    ar: "عشاء", en: "Dinner", fr: "Dîner", es: "Cena", de: "Abendessen", ru: "Ужин",
    zh: "晚餐", ur: "رات کا کھانا", tr: "Akşam yemeği", pt: "Jantar", it: "Cena", id: "Makan malam", hi: "रात का भोजन", ja: "夕食", ko: "저녁",
  },
  snack: {
    ar: "وجبة خفيفة", en: "Snack", fr: "Collation", es: "Aperitivo", de: "Snack", ru: "Закуска",
    zh: "小吃", ur: "ہلکا کھانا", tr: "Atıştırmalık", pt: "Lanche", it: "Spuntino", id: "Camilan", hi: "नाश्ता", ja: "軽食", ko: "간식",
  },
};

const MEAL_AT_PHRASES: Record<string, Record<string, string>> = {
  // "{Meal} at {Place}" template per language. {meal} {place}
  ar: { breakfast: "فطور في", lunch: "غداء في", dinner: "عشاء في", snack: "وجبة خفيفة في" },
  en: { breakfast: "Breakfast at", lunch: "Lunch at", dinner: "Dinner at", snack: "Snack at" },
  fr: { breakfast: "Petit-déjeuner à", lunch: "Déjeuner à", dinner: "Dîner à", snack: "Collation à" },
  es: { breakfast: "Desayuno en", lunch: "Almuerzo en", dinner: "Cena en", snack: "Aperitivo en" },
  de: { breakfast: "Frühstück bei", lunch: "Mittagessen bei", dinner: "Abendessen bei", snack: "Snack bei" },
  ru: { breakfast: "Завтрак в", lunch: "Обед в", dinner: "Ужин в", snack: "Закуска в" },
  zh: { breakfast: "早餐于", lunch: "午餐于", dinner: "晚餐于", snack: "小吃于" },
  ur: { breakfast: "ناشتہ بمقام", lunch: "دوپہر کا کھانا بمقام", dinner: "رات کا کھانا بمقام", snack: "ہلکا کھانا بمقام" },
  tr: { breakfast: "Kahvaltı:", lunch: "Öğle yemeği:", dinner: "Akşam yemeği:", snack: "Atıştırmalık:" },
  pt: { breakfast: "Café da manhã em", lunch: "Almoço em", dinner: "Jantar em", snack: "Lanche em" },
  it: { breakfast: "Colazione presso", lunch: "Pranzo presso", dinner: "Cena presso", snack: "Spuntino presso" },
  id: { breakfast: "Sarapan di", lunch: "Makan siang di", dinner: "Makan malam di", snack: "Camilan di" },
  hi: { breakfast: "नाश्ता", lunch: "दोपहर का भोजन", dinner: "रात का भोजन", snack: "नाश्ता" },
  ja: { breakfast: "朝食:", lunch: "昼食:", dinner: "夕食:", snack: "軽食:" },
  ko: { breakfast: "아침 식사:", lunch: "점심 식사:", dinner: "저녁 식사:", snack: "간식:" },
};

const OPEN_HOURS_HINT: Record<string, string> = {
  ar: "تحقق من ساعات العمل قبل الزيارة",
  en: "Check opening hours before visiting",
  fr: "Vérifiez les horaires avant la visite",
  es: "Consulta los horarios antes de visitar",
  de: "Öffnungszeiten vor dem Besuch prüfen",
  ru: "Уточните часы работы перед посещением",
  zh: "参观前请查看营业时间",
  ur: "دورے سے پہلے اوقات کار چیک کریں",
  tr: "Ziyaretten önce açılış saatlerini kontrol edin",
  pt: "Verifique o horário antes de visitar",
  it: "Verifica gli orari prima della visita",
  id: "Periksa jam buka sebelum mengunjungi",
  hi: "जाने से पहले खुलने का समय जांचें",
  ja: "訪問前に営業時間を確認してください",
  ko: "방문 전에 영업시간을 확인하세요",
};

const BOOK_AHEAD_HINT: Record<string, string> = {
  ar: "احجز مسبقاً خاصة في أوقات الذروة",
  en: "Book in advance especially during peak hours",
  fr: "Réservez à l'avance, surtout aux heures de pointe",
  es: "Reserva con antelación, especialmente en horas pico",
  de: "Im Voraus buchen, besonders zu Stoßzeiten",
  ru: "Бронируйте заранее, особенно в часы пик",
  zh: "请提前预订,尤其在高峰时段",
  ur: "پہلے سے بکنگ کریں، خاص طور پر مصروف اوقات میں",
  tr: "Özellikle yoğun saatlerde önceden rezervasyon yapın",
  pt: "Reserve com antecedência, especialmente em horários de pico",
  it: "Prenota in anticipo, specialmente nelle ore di punta",
  id: "Pesan sebelumnya terutama di jam sibuk",
  hi: "व्यस्त समय में पहले से बुक करें",
  ja: "特にピーク時には事前予約をお勧めします",
  ko: "특히 피크 시간대에는 미리 예약하세요",
};

function localizeMealName(meal: string, place: string, lang: string): string {
  const l = (lang || "en").toLowerCase().split("-")[0];
  const cat = (meal || "lunch").toLowerCase();
  const tmpl = MEAL_AT_PHRASES[l]?.[cat] || MEAL_AT_PHRASES.en[cat];
  return `${tmpl} ${place}`.trim();
}

function localizeMealLabel(meal: string, lang: string): string {
  const l = (lang || "en").toLowerCase().split("-")[0];
  return MEAL_LABELS[(meal || "lunch").toLowerCase()]?.[l] || MEAL_LABELS[(meal || "lunch").toLowerCase()]?.en || meal;
}

function containsArabicChars(s: unknown): boolean {
  return typeof s === "string" && /[\u0600-\u06FF]/.test(s);
}

function extractPreferredMealPlaceName(activity: any): string {
  const clean = (value: unknown) => String(value || "")
    .replace(/[\u0600-\u06FF]+/g, " ")
    .replace(/\((?:\s*[A-Za-z\u00C0-\u024F0-9][^)]*)\)/g, " $1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sources = [activity?.description, activity?.name, activity?.title, activity?.address, activity?.location];
  for (const source of sources) {
    const raw = String(source || "").trim();
    if (!raw) continue;
    const afterArabic = raw.split(/\s+في\s+/).slice(1).join(" في ").trim();
    const fromArabic = clean(afterArabic);
    if (fromArabic && /[A-Za-z\u00C0-\u024F]/.test(fromArabic)) return fromArabic;
    const paren = Array.from(raw.matchAll(/\(([^)]+)\)/g)).map((m) => clean(m[1])).find((v) => v && /[A-Za-z\u00C0-\u024F]/.test(v));
    if (paren) return paren;
    const latin = clean(raw.match(/[A-Za-z\u00C0-\u024F0-9][A-Za-z\u00C0-\u024F0-9 '&./-]{2,120}/g)?.[0]);
    if (latin && !/^(breakfast|lunch|dinner|snack|meal|restaurant|food|book|check|hours|open|closed)$/i.test(latin)) return latin;
  }
  return "";
}

function getMapsVenueName(activity: any, fallback?: string): string {
  const raw = String(fallback || activity?.name || activity?.title || "").trim();
  if (!isMealCategory(activity?.category || activity?.type)) return raw;
  const preferred = extractPreferredMealPlaceName(activity);
  if (preferred) return preferred;
  return raw
    .replace(/^(breakfast|lunch|dinner|brunch|snack|meal)\s+(at|in|near)\s+/i, "")
    .replace(/^(فطور|إفطار|غداء|عشاء|وجبة\s*خفيفة)\s+(في|عند)\s+/i, "")
    .trim() || raw;
}

function containsCJK(s: unknown): boolean {
  return typeof s === "string" && /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

/**
 * Strip backend-generated boilerplate strings in a non-target language and
 * replace them with localized versions. Preserves proper nouns (venue names)
 * by only rewriting recognized templates ("breakfast at X", "X في Y", etc.).
 */
function localizeActivityText(activity: any, lang: string): void {
  if (!activity || typeof activity !== "object") return;
  const l = (lang || "en").toLowerCase().split("-")[0];
  const cat = String(activity.category || "").toLowerCase();
  const isMeal = ["breakfast", "lunch", "dinner", "snack", "snacks"].includes(cat);

  // STEP 1: Localize the meal NAME first ("فطور في City" → "Breakfast at City")
  // so subsequent description rewrite uses a clean place name.
  if (isMeal && l !== "ar" && containsArabicChars(activity.name)) {
    const place = extractPreferredMealPlaceName(activity);
    if (place) activity.name = localizeMealName(cat, place, l);
  }

  // STEP 2: Localize the description using the now-clean name as the place.
  if (isMeal && l !== "ar" && containsArabicChars(activity.description)) {
    const placeName = String(activity.name || "")
      .replace(new RegExp(`^${MEAL_AT_PHRASES[l]?.[cat] || ""}\\s*`, "i"), "")
      .trim() || extractPreferredMealPlaceName(activity) || String(activity.address || "").replace(/[\u0600-\u06FF]+/g, "").trim();
    if (placeName) activity.description = localizeMealName(cat, placeName, l);
  }

  // STEP 3: Generic Arabic scrub for non-meal activities — strip Arabic-only
  // boilerplate like "زيارة X" / "استكشاف X" when target lang is not Arabic.
  if (!isMeal && l !== "ar" && containsArabicChars(activity.description)) {
    // Remove Arabic words but keep Latin venue names + parens content
    const cleaned = String(activity.description)
      .replace(/[\u0600-\u06FF]+/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*[-–—•·]+\s*/, "")
      .trim();
    if (cleaned) activity.description = cleaned;
  }
  if (!isMeal && l !== "ar" && containsArabicChars(activity.name)) {
    const cleaned = String(activity.name)
      .replace(/[\u0600-\u06FF]+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned) activity.name = cleaned;
  }

  // Localize hardcoded "Check opening hours" / "Book in advance" tips
  const tip = String(activity.tip || activity.tips || "").trim();
  if (tip) {
    if (/check\s+opening\s+hours/i.test(tip) || containsArabicChars(tip)) {
      activity.tip = isMeal ? BOOK_AHEAD_HINT[l] || BOOK_AHEAD_HINT.en : OPEN_HOURS_HINT[l] || OPEN_HOURS_HINT.en;
    }
  }
}

/**
 * Build a Google Maps URL that opens the actual named venue (not a generic pin).
 * Prefers: place_id > name+address (with optional lat/lng as center hint) > lat/lng only.
 */
// Generic / vague venue names that would return broad city-wide results in
// Google Maps if used as a search query. We fall back to coordinates for these.
const GENERIC_VENUE_NAME_PATTERN = /^(stadium|arena|sports?\s*complex|tour|jolla|nightlife|bar\s*hop|bars?|restaurant|cafe|coffee|park|museum|landmark|attraction|activity|experience|نشاط|جولة|ملعب|استاد|مقهى|مطعم|بار|حياة\s*ليلية)\s*(tour|visit|day)?$/i;
const STRIP_PREFIX_PATTERN = /^(جولة\s*في|زيارة|tour\s*of|visit\s*to|tour\s*at)\s+/i;

function isGenericVenueName(name?: string): boolean {
  const cleaned = String(name || "").trim().replace(STRIP_PREFIX_PATTERN, "").trim();
  if (cleaned.length < 4) return true;
  return GENERIC_VENUE_NAME_PATTERN.test(cleaned);
}

function getGoogleMapsLinkReason(placeId?: string, dataCid?: string, lat?: number, lng?: number): string {
  const cleanCid = String(dataCid || "").trim();
  if (cleanCid && /^\d+$/.test(cleanCid)) return `CID: ${cleanCid}`;
  if (placeId) return `place_id: ${String(placeId).slice(0, 18)}${String(placeId).length > 18 ? "…" : ""}`;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat as number) !== 0 && (lng as number) !== 0;
  if (hasCoords) return `lat/lng: ${(lat as number).toFixed(5)}, ${(lng as number).toFixed(5)}`;
  return "text query";
}

function buildPlaceMapsUrl(
  name?: string,
  address?: string,
  cityName?: string,
  lat?: number,
  lng?: number,
  placeId?: string,
  dataCid?: string,
): string {
  const cleanName = String(name || "").trim().replace(STRIP_PREFIX_PATTERN, "").trim();
  const cleanAddress = String(address || "").trim();
  const cleanCity = String(cityName || "").trim();
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat as number) !== 0 && (lng as number) !== 0;
  const hasSpecificAddress = cleanAddress.length > 0 && /\d|street|st\.?|ave|road|rd\.?|blvd|drive|dr\.?|شارع|طريق|حي|منطقة/i.test(cleanAddress);

  // BEST: data_cid opens the canonical Google Maps place card directly (no search bar clutter).
  const cleanCid = String(dataCid || "").trim().replace(/^0x/i, "").replace(/[^0-9a-f]/gi, "");
  if (cleanCid && /^[0-9a-f]+$/i.test(cleanCid)) {
    // cid expects a decimal number; Google accepts hex via 0x prefix on https://maps.google.com/?cid=
    try {
      // SerpAPI returns data_cid as a decimal string already in most cases.
      const decimal = /^\d+$/.test(String(dataCid)) ? String(dataCid) : BigInt("0x" + cleanCid).toString();
      return `https://maps.google.com/?cid=${decimal}`;
    } catch { /* fall through */ }
  }

  // STRONG: place_id with the venue NAME ONLY as query — Google Maps anchors on the place_id
  // and the search bar shows just the venue name, not a long address string.
  if (placeId && cleanName) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanName)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  if (placeId) {
    return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
  }

  const nameMentionsCity = cleanCity && cleanName.toLowerCase().includes(cleanCity.toLowerCase());
  const addressMentionsCity = cleanCity && cleanAddress.toLowerCase().includes(cleanCity.toLowerCase());
  const cityTail = cleanCity && !nameMentionsCity && !addressMentionsCity ? `, ${cleanCity}` : "";
  const queryText = `${cleanName}${cleanAddress ? `, ${cleanAddress}` : ""}${cityTail}`.trim();

  // STRICT: when the name is too generic AND we have real coordinates, prefer
  // coordinate search — otherwise Google Maps returns broad city-wide results.
  if (isGenericVenueName(cleanName) && hasCoords) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  // STRICT: a generic name with NO coordinates AND NO real address would open
  // a city-wide search ("restaurant in Los Angeles"). Force the coordinate
  // fallback or the city pin, never that vague text query.
  if (isGenericVenueName(cleanName) && !hasSpecificAddress) {
    if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanCity || "location")}`;
  }
  if (queryText) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
  }
  if (hasCoords) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanCity || "location")}`;
}

function buildPlaceMapsPayload(name?: string, address?: string, cityName?: string, lat?: number, lng?: number, placeId?: string, dataCid?: string) {
  return {
    url: buildPlaceMapsUrl(name, address, cityName, lat, lng, placeId, dataCid),
    reason: getGoogleMapsLinkReason(placeId, dataCid, lat, lng),
  };
}

function buildCoordsMapsUrl(lat?: number, lng?: number): string | undefined {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat as number) !== 0 && (lng as number) !== 0;
  return hasCoords ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : undefined;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Detects when the user explicitly asked for places in the city's outskirts /
// suburbs / nearby area. When true, the radius filter is relaxed so we don't
// strip those legitimate suggestions.
function specialRequestAllowsOutskirts(specialRequestText = ""): boolean {
  if (!specialRequestText) return false;
  return /outskirt|suburb|nearby|outside\s+(?:the\s+)?city|day\s*trip|excursion|on the way|countryside|rural|near\s+\w+|الضواحي|ضواحي|أطراف|خارج\s+المدينة|قريب من|بالقرب|رحلة\s+يوم|قري|ريف/i.test(specialRequestText);
}

function isOutsideCityRadius(activity: any, cityContext: string, opts?: { specialRequestText?: string; radiusOverrideKm?: number }): boolean {
  const lat = Number(activity?.latitude);
  const lng = Number(activity?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return false;
  const anchor = getCitySearchAnchor(cityContext);
  if (!anchor) return false;
  const category = String(activity?.category || "").toLowerCase();
  const baseRadius = isMealCategory(category) ? 30 : 45;
  // Special-request override: when the user asks for suburbs/outskirts/nearby,
  // expand the radius so out-of-core but legitimately requested places stay.
  const allowsOutskirts = specialRequestAllowsOutskirts(opts?.specialRequestText || "");
  const overrideRadius = Number.isFinite(opts?.radiusOverrideKm as number) ? Number(opts?.radiusOverrideKm) : 0;
  const maxRadiusKm = Math.max(baseRadius, overrideRadius, allowsOutskirts ? 120 : 0);
  return haversineKm(anchor.lat, anchor.lng, lat, lng) > maxRadiusKm;
}

/**
 * Reflow activity times within a day so meals land in their proper windows
 * (breakfast 08:00-09:30, lunch 12:30-14:00, dinner 19:00-20:30) and other
 * activities fill the remaining slots in order. Honors timeLocked entries
 * (e.g. match kickoff, AI preferred time).
 */
function reflowDayActivityTimes(
  activities: any[],
  startHour = 9,
  endHour = 22,
): any[] {
  if (!Array.isArray(activities) || activities.length === 0) return activities || [];

  const isMeal = (cat: unknown) => {
    const c = String(cat || "").toLowerCase();
    return c === "breakfast" || c === "lunch" || c === "dinner" || c === "snack" || c === "snacks";
  };

  const mealSlots: Record<string, { ideal: number; min: number; max: number }> = {
    breakfast: { ideal: Math.max(8, Math.min(9, startHour + 1 > 9 ? 9 : Math.max(8, startHour))), min: Math.max(startHour, 7), max: Math.min(endHour, 11) },
    lunch: { ideal: 13, min: Math.max(startHour, 12), max: Math.min(endHour, 15) },
    dinner: { ideal: 19, min: Math.max(startHour, 18), max: Math.min(endHour, 22) },
    snack: { ideal: 16, min: Math.max(startHour, 15), max: Math.min(endHour, 18) },
    snacks: { ideal: 16, min: Math.max(startHour, 15), max: Math.min(endHour, 18) },
  };

  // Estimate occupied window for an activity (in hours).
  const estimateDuration = (act: any): number => {
    const cat = String(act?.category || "").toLowerCase();
    if (act?.isMatchAnchor) return 3;
    if (cat === "sports" || cat === "match") return 3;
    if (isMeal(cat)) return 1;
    const d = Number(act?.durationHours);
    if (Number.isFinite(d) && d > 0) return Math.min(6, d);
    return 2;
  };

  // Locked items keep their times. Match anchors are also treated as locked.
  const locked: any[] = [];
  const flexible: any[] = [];
  for (const act of activities) {
    if (act?.timeLocked || act?.isMatchAnchor) locked.push(act);
    else flexible.push(act);
  }

  const BUFFER_HOURS = 1; // travel/prep buffer around locked events
  type Window = { start: number; end: number };
  const lockedWindows: Window[] = locked
    .map((a) => {
      const h = parseInt(String(a?.time || "").split(":")[0] || "", 10);
      if (!Number.isFinite(h)) return null;
      const dur = estimateDuration(a);
      return { start: Math.max(0, h - BUFFER_HOURS), end: Math.min(24, h + dur + BUFFER_HOURS) };
    })
    .filter(Boolean) as Window[];

  const conflicts = (h: number, dur: number, extra: Window[]): boolean => {
    const s = h, e = h + dur;
    return [...lockedWindows, ...extra].some((w) => s < w.end && e > w.start);
  };

  const takenWindows: Window[] = [];

  // Assign meal times first (priority: breakfast → lunch → dinner)
  const mealOrder = ["breakfast", "lunch", "dinner", "snack", "snacks"];
  const meals = flexible
    .filter((a) => isMeal(a?.category))
    .sort((a, b) => mealOrder.indexOf(String(a.category).toLowerCase()) - mealOrder.indexOf(String(b.category).toLowerCase()));
  const nonMeals = flexible.filter((a) => !isMeal(a?.category));

  for (const meal of meals) {
    const cat = String(meal?.category || "").toLowerCase();
    const slot = mealSlots[cat] ?? { ideal: 13, min: Math.max(startHour, 12), max: Math.min(endHour, 15) };
    const dur = estimateDuration(meal);
    const minHour = Math.max(startHour, slot.min);
    const maxHour = Math.max(minHour, Math.min(endHour - dur, slot.max - dur));
    let chosen = Math.max(minHour, Math.min(maxHour, slot.ideal));
    if (conflicts(chosen, dur, takenWindows)) {
      const candidates: number[] = [];
      for (let step = 1; step <= 5; step++) candidates.push(chosen - step, chosen + step);
      const ok = candidates.filter((h) => h >= minHour && h <= maxHour && !conflicts(h, dur, takenWindows));
      if (ok.length > 0) chosen = ok[0];
      else {
        const past = lockedWindows
          .map((w) => w.end)
          .filter((h) => h >= minHour && h <= maxHour && h + dur <= endHour && !conflicts(h, dur, takenWindows))
          .sort((a, b) => Math.abs(a - slot.ideal) - Math.abs(b - slot.ideal));
        if (past.length > 0) chosen = past[0];
      }
    }
    meal.time = formatTime(chosen);
    meal.startTime = meal.time;
    takenWindows.push({ start: chosen, end: chosen + dur });
  }

  // Distribute non-meal activities from the user's wake window forward using
  // unique increments. Never bias the first flexible activity to evening (e.g.
  // 18:30) just because meals exist; late slots are only used after earlier
  // valid wake/sleep slots are exhausted.
  const slots: number[] = [];
  for (let h = Math.max(startHour, 9); h < endHour; h += 1.5) slots.push(h);
  for (let h = Math.max(startHour, 9.5); h < endHour; h += 1.5) slots.push(h);

  // Helper: parse a free-text "opening hours" string into a [open, close] hour
  // window. Returns null when the input can't be confidently parsed.
  const parseHoursWindow = (raw: unknown): [number, number] | null => {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/24\s*\/?\s*7|open\s*24\s*hours|24\s*ساعة/i.test(s)) return [0, 24];
    const norm = s.replace(/[–—−]/g, "-").replace(/\u200f|\u200e/g, "").replace(/\s+/g, " ");
    const m = norm.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|ص|م)?/i);
    if (!m) return null;
    const toH = (h: string, mer?: string) => {
      let n = parseInt(h, 10);
      const mm = (mer || "").toLowerCase();
      if ((mm === "pm" || mm === "م") && n < 12) n += 12;
      if ((mm === "am" || mm === "ص") && n === 12) n = 0;
      return Number.isFinite(n) ? n : NaN;
    };
    const o = toH(m[1], m[3]);
    let c = toH(m[4], m[6]);
    if (!Number.isFinite(o) || !Number.isFinite(c)) return null;
    if (c <= o) c += 24;
    return [o, c];
  };

  const fitsOpeningHours = (act: any, h: number, dur: number): boolean => {
    const win = parseHoursWindow(act?.openingHours);
    if (!win) return true; // unknown hours → don't penalize
    const [open, close] = win;
    // Allow visit to start at/after open and finish at/before close (overnight ok)
    return h >= open && h + dur <= close;
  };

  nonMeals.forEach((act) => {
    const dur = estimateDuration(act);
    // First pass: respect locked windows + already-taken non-meal windows AND opening hours
    let chosen = slots.find((h) => h + dur <= endHour && !conflicts(h, dur, takenWindows) && fitsOpeningHours(act, h, dur));
    // Second pass: drop the opening-hours preference but keep collision check
    if (chosen === undefined) {
      chosen = slots.find((h) => h + dur <= endHour && !conflicts(h, dur, takenWindows));
    }
    if (chosen === undefined) {
      // Third pass: ignore other non-meals (only avoid locked) and pick the
      // first hour that isn't already used by another scheduled item.
      const usedHours = new Set(takenWindows.map((w) => w.start));
      chosen = slots.find((h) => h + dur <= endHour && !usedHours.has(h) && !conflicts(h, dur, []));
    }
    if (chosen === undefined) {
      // Last resort: keep it inside the user's wake/sleep window and choose
      // the earliest remaining visible slot instead of collapsing to evening.
      chosen = Math.max(startHour, Math.min(endHour - dur, Math.max(startHour, 9)));
    }
    act.time = formatTime(Math.max(startHour, Math.min(endHour - dur, chosen)));
    act.startTime = act.time;
    const safeStart = parseTimeHour(act.time) ?? chosen;
    takenWindows.push({ start: safeStart, end: safeStart + dur });
  });

  const all = [...locked, ...meals, ...nonMeals];
  // Final safety: if any two items still share the exact same start time, bump
  // the later occurrences forward by 1 hour each so the schedule never shows
  // duplicate timestamps.
  const sortedByTime = [...all].sort((a, b) => String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")));
  const usedTimes = new Set<string>();
  for (const item of sortedByTime) {
    if (item?.timeLocked || item?.isMatchAnchor) {
      usedTimes.add(String(item?.time || ""));
      continue;
    }
    let timeStr = String(item?.time || "12:00");
    let [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
    while (usedTimes.has(timeStr) && h + 1 < endHour) {
      h += 1;
      timeStr = `${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
    }
    if (usedTimes.has(timeStr)) {
      for (let probe = startHour; probe < endHour; probe += 0.5) {
        const candidate = formatTime(probe);
        if (!usedTimes.has(candidate)) { timeStr = candidate; break; }
      }
    }
    item.time = timeStr;
    item.startTime = timeStr;
    usedTimes.add(timeStr);
  }
  sortedByTime.sort((a, b) => String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")));
  return sortedByTime;
}

function resolveIataFallback(city: string): string {
  if (!city) return "XXX";
  const c = city.split(/[،,]/)[0].trim().toLowerCase();
  if (/^(fox|foxborough|foxboro)$/i.test(c)) return "BOS";
  return IATA_MAP[c] || c.slice(0, 3).toUpperCase();
}

function mapSerpCategory(place: any): string {
  const raw = place?._raw && typeof place._raw === "object" ? place._raw : place;
  const sourceTypeText = `${raw?.type || ""} ${raw?.placeType || ""} ${raw?.type_id || ""} ${raw?.placeTypeId || ""} ${(raw?.types || raw?.placeTypes || []).join(" ")} ${(raw?.type_ids || raw?.typeIds || []).join(" ")}`.toLowerCase();
  if (isFoodLikePlace(place)) return "restaurant";
  if (/amusement_park|amusement park|theme park|water park|waterpark|aquarium|zoo|movie_theater|cinema|bowling|arcade|entertainment|night_club|night club/.test(sourceTypeText)) return "entertainment";
  if (/beach|campground|rv_park/.test(sourceTypeText)) return "beach";
  if (/park|national_park|natural_feature|botanical|garden|hiking|trail|wildlife|nature/.test(sourceTypeText)) return "nature";
  if (/shopping_mall|store|market|souq|souk|department_store|clothing_store|jewelry_store|book_store/.test(sourceTypeText)) return "shopping";
  if (/museum|mosque|church|hindu_temple|synagogue|tourist_attraction|art_gallery|library|historical|heritage|palace|castle/.test(sourceTypeText)) return "cultural";
  if (/stadium|gym|sports|arena|golf|tennis|race|circuit/.test(sourceTypeText)) return "sports";
  const text = `${raw?.type || ""} ${raw?.placeType || ""} ${raw?.type_id || ""} ${raw?.placeTypeId || ""} ${(raw?.types || raw?.placeTypes || []).join(" ")} ${(raw?.type_ids || raw?.typeIds || []).join(" ")} ${raw?.title || ""} ${raw?.name || ""} ${raw?.category || ""} ${raw?.description || ""} ${raw?.address || ""}`.toLowerCase();
  if (/\b(mall|market|bazaar|souq|souk|shopping|retail|outlet|fashion|boutique|store|shop)\b|سوق|مول|بازار|تسوق|متجر|أزياء/.test(text)) return "shopping";
  // Order matters: branded entertainment districts (e.g. "L.A. Live", "Texas
  // Live!") often include words like "theater" or "music hall" that would
  // otherwise be miscategorised as cultural. Match entertainment FIRST.
  if (/entertainment|theme park|amusement|show|cinema|concert|music venue|music hall|comedy club|arcade|aquarium|zoo|waterpark|festival|entertainment district|nightclub|night club|children'?s amusement|kids play|family entertainment|playground|indoor play|fun works|\bl\.?a\.?\s*live\b|\btexas live\b|\b[\w.]*\s*live!?\b|ترفيه|سينما|حفلة|موسيقى|ملاهي|أكواريوم/.test(text)) return "entertainment";
  if (/museum|historic|historical|mosque|church|temple|palace|fort|cathedral|heritage|archaeolog|متحف|مسجد|كنيسة|قصر|قلعة|تراث/.test(text)) return "cultural";
  // Beach must be matched BEFORE the generic "nature" bucket so that beaches are
  // not silently relabelled as nature (which broke beach-interest matching).
  if (/\bbeach(es)?\b|\bcorniche\b|\bseaside\b|\bseafront\b|\bwaterfront\b|شاطئ|كورنيش|واجهة بحرية/.test(text)) return "beach";
  if (/\b(park|garden|island|nature|mountain|forest|trail|lake|botanical|national_park|natural_feature)\b|حديقة|جزيرة|جبل/.test(text)) return "nature";
  if (/cruise|tour|activity|boat|ferry|رحلة|جولة|نشاط/.test(text)) return "activity";
  return "attraction";
}

// ── REQUEST-SCOPED SERPAPI CACHE & FETCH GATING ───────────────────────────
// These module-level structures are reset at the start of every request
// (see `resetSerpRequestState` called inside the serve handler) so two
// concurrent requests never share state. Goals:
//   1. NEVER call SerpAPI twice for the same (query|city) inside one request.
//   2. NEVER call SerpAPI for an interest the user did not select.
const __serpRequestCache: Map<string, any[]> = new Map();
const __serpRequestCanonicalCache: Map<string, any[]> = new Map();
const __serpRequestInflight: Map<string, Promise<any[]>> = new Map();
let __serpAllowedInterests: Set<string> | null = null; // null = no gating yet
// Per-request user context for SerpAPI usage analytics.
let __serpCurrentUserId: string | null = null;
let __serpCurrentGuestId: string | null = null;
// Per-request variation seed → rotates which subset of cached variants we expose
// to the planner (15-25 variants stored per query; we surface a different window
// per request so two regenerations of the same trip see different items first).
let __serpVariationSeed: number = 0;
// Estimated SerpAPI cost per live (non-cached) Google-Maps search.
// Free plan = 100 searches/mo; paid plans average ~$0.005 per search at the
// $50/10k tier. Override via the SERPAPI_COST_PER_CALL env var if needed.
const SERPAPI_COST_PER_CALL: number = (() => {
  const raw = Number(Deno.env.get("SERPAPI_COST_PER_CALL"));
  return Number.isFinite(raw) && raw > 0 ? raw : 0.005;
})();

function resetSerpRequestState(
  allowedInterests?: Iterable<string> | null,
  userId?: string | null,
  guestId?: string | null,
  variationSeed?: number | null,
) {
  __serpRequestCache.clear();
  __serpRequestCanonicalCache.clear();
  __serpRequestInflight.clear();
  __serpAllowedInterests = allowedInterests
    ? new Set(Array.from(allowedInterests, (s) => String(s).toLowerCase().trim()).filter(Boolean))
    : null;
  __serpCurrentUserId = userId || null;
  __serpCurrentGuestId = guestId || null;
  const seed = Number(variationSeed);
  const runSalt = crypto.getRandomValues(new Uint32Array(1))[0] ^ (Date.now() >>> 0);
  __serpVariationSeed = ((Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 0) ^ runSalt) >>> 0;
  // Reset per-run rotation state and validation log budget.
  __usedPlaceIdsThisRun.clear();
  __recentlyUsedPlaceIds.clear();
  __specialRequestAllowList.clear();
  __validationLogBudget = 8;
  __prefilterCtx = null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function __tryAcquireSharedLookupLock(cacheKey: string, ttlSeconds = 18): Promise<{ acquired: boolean; workerId: string | null }> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !cacheKey) return { acquired: true, workerId: null };
  const workerId = crypto.randomUUID?.() || `serp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 900);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/try_acquire_lookup_lock`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ _cache_key: cacheKey, _worker_id: workerId, _ttl_seconds: ttlSeconds }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) return { acquired: true, workerId };
    const value = await resp.json();
    return { acquired: value === true || value === "true", workerId };
  } catch {
    return { acquired: true, workerId };
  }
}

function __releaseSharedLookupLock(cacheKey: string, workerId: string | null): void {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !cacheKey || !workerId) return;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/release_lookup_lock`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _cache_key: cacheKey, _worker_id: workerId }),
  }).catch(() => {});
}

// Fire-and-forget logger — never blocks request flow, never throws.
function logSerpUsage(entry: {
  endpoint?: string;
  query: string;
  city?: string;
  cacheHit: boolean;
  blockedByGate?: boolean;
  resultsCount?: number;
  context?: string;
}): void {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const payload = {
      user_id: __serpCurrentUserId || null,
      guest_id: __serpCurrentUserId ? null : __serpCurrentGuestId,
      endpoint: entry.endpoint || "google_maps",
      query: String(entry.query || "").slice(0, 500),
      city: entry.city ? String(entry.city).slice(0, 120) : null,
      cache_hit: !!entry.cacheHit,
      blocked_by_gate: !!entry.blockedByGate,
      results_count: Math.max(0, Number(entry.resultsCount) || 0),
      cost_usd: entry.cacheHit || entry.blockedByGate ? 0 : SERPAPI_COST_PER_CALL,
      context: entry.context ? String(entry.context).slice(0, 80) : null,
    };
    // Fire-and-forget: do not await, do not throw.
    fetch(`${SUPABASE_URL}/rest/v1/serpapi_usage`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

// Map a synthetic activity's inferred subtype to the user-facing interest key.
// Returns null when the call is not interest-gated (meals, special requests,
// match-anchors, sports stadium lookups, generic attractions).
function subtypeToInterestKey(subtype: string): string | null {
  switch (subtype) {
    case "museum":
    case "cultural":
      return "culture"; // also covers "art" via fallback below
    case "shopping": return "shopping";
    case "nature": return "nature";
    case "beach": return "beach";
    case "entertainment": return "entertainment";
    case "sports": return "sports";
    default: return null;
  }
}

function isSerpFetchAllowedForInterest(activity: any): boolean {
  // No gating configured → allow (defensive default for early bootstrap calls).
  if (!__serpAllowedInterests || __serpAllowedInterests.size === 0) return true;
  // Always allow meal lookups, special-request injections, match-anchor venue
  // resolution, and any activity explicitly tagged as a special request.
  if (activity?.isMatchAnchor || activity?.isSpecialRequest) return true;
  const cat = String(activity?.category || "").toLowerCase();
  if (["breakfast", "lunch", "dinner", "snack", "cafe", "restaurant"].includes(cat)) return true;
  const id = String(activity?.id || "");
  if (/-sr-|-match-|-special-/.test(id)) return true;

  const subtype = inferRequestedActivitySubtype(activity);
  const interestKey = subtypeToInterestKey(subtype);
  if (!interestKey) return true; // generic / non-interest-tied → allow
  // "art" maps to museum subtype too — accept either selected key.
  if (interestKey === "culture") {
    if (__serpAllowedInterests.has("culture") || __serpAllowedInterests.has("art")) return true;
    return false;
  }
  return __serpAllowedInterests.has(interestKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CACHE BRIDGE (places_cache table — written by serpapi-places fn)
// Goal: reuse the cross-user, language-agnostic cache that already stores
// 15-25 variants per query. We rotate the result window using the per-request
// variation seed so two regenerations of the same trip see DIFFERENT items
// first — even when both hits resolve from the same cached row.
// We DO NOT change generation logic — we only change WHERE results come from.
// ─────────────────────────────────────────────────────────────────────────────
function __normalizeCacheText(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function __hashCacheKey(input: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
// ─────────────────────────────────────────────────────────────────────────────
// MULTI-LANGUAGE SYNONYM MAP
// Collapses cuisine + category + meal terms across all 8 site languages
// (en, ar, es, fr, de, it, tr, ru) onto a single canonical English token so
// that:
//   • "café" / "coffee shop" / "مقهى" / "kahve" → "cafe"
//   • "ristorante italiano" / "مطعم ايطالي" → "italian"
// This keeps the shared cache key stable across languages and lets the
// cross-user partial-match fallback recognize peers even when their query
// was issued in a different language.
// ─────────────────────────────────────────────────────────────────────────────
const __SYN_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canon: string, words: string[]) => {
    m[canon] = canon;
    for (const w of words) m[__normalizeCacheText(w)] = canon;
  };
  // Cuisines (canonical → all-language synonyms)
  add("italian",     ["italian","italiano","italienne","italienisch","italiana","ايطالي","إيطالي","итальянская","italyan"]);
  add("french",      ["french","francaise","française","francese","französisch","فرنسي","французская","fransiz","fransız"]);
  add("japanese",    ["japanese","japonais","japonesa","giapponese","japanisch","ياباني","японская","japon"]);
  add("chinese",     ["chinese","chinois","china","cinese","chinesisch","صيني","китайская","cin","çin"]);
  add("korean",      ["korean","coreen","coreano","koreanisch","kore","كوري","корейская"]);
  add("thai",        ["thai","thailandais","tailandesa","thailaendisch","تايلاندي","تايلندي","тайская"]);
  add("indian",      ["indian","indien","indiana","indisch","indiano","هندي","индийская","hint"]);
  add("mexican",     ["mexican","mexicain","mexicana","messicano","mexikanisch","مكسيكي","мексиканская","meksika"]);
  add("lebanese",    ["lebanese","libanais","libanesa","libanese","libanesisch","لبناني","ливанская","lubnan"]);
  add("turkish",     ["turkish","turc","turca","turco","tuerkisch","تركي","турецкая","turk","türk"]);
  add("greek",       ["greek","grec","griega","greco","griechisch","يوناني","греческая","yunan"]);
  add("spanish",     ["spanish","espagnol","espanola","spagnola","spanisch","اسباني","إسباني","испанская","ispanyol"]);
  add("arabic",      ["arabic","arabe","arabica","araba","arabisch","عربي","عربية","арабская","arap"]);
  add("seafood",     ["seafood","fruits de mer","mariscos","frutti di mare","meeresfruechte","مأكولات بحرية","морепродукты","deniz urunleri","deniz ürünleri","fish","سمك","poisson","pesce"]);
  add("vegan",       ["vegan","végan","vegano","نباتي صرف","веганская","vejetaryen vegan"]);
  add("vegetarian",  ["vegetarian","vegetarien","vegetariano","vegetarisch","نباتي","вегетарианская","vejetaryen"]);
  add("halal",       ["halal","حلال","халяль"]);
  add("sushi",       ["sushi","سوشي","суши"]);
  add("pizza",       ["pizza","بيتزا","пицца"]);
  add("burger",      ["burger","burgers","hamburger","برغر","برجر","бургер"]);
  add("steak",       ["steak","steakhouse","ستيك","стейк","steak ev","et restoranı"]);
  add("grill",       ["grill","grilled","grillé","parrilla","grigliata","مشوي","mangal","шашлык"]);
  add("bbq",         ["bbq","barbecue","barbacoa","شواء","grill bbq"]);
  add("bakery",      ["bakery","bakeries","boulangerie","panaderia","panificio","baeckerei","مخبز","bocchi","pekarnya","fırın","firin","пекарня"]);
  add("dessert",     ["dessert","desserts","postre","dolci","nachtisch","حلويات","tatli","tatlı","десерт","sweet","sweets"]);
  // Meal slots — collapsed across languages
  add("breakfast",   ["breakfast","petit dejeuner","desayuno","colazione","fruehstueck","فطور","افطار","kahvalti","kahvaltı","завтрак"]);
  add("lunch",       ["lunch","dejeuner","almuerzo","pranzo","mittagessen","غداء","ogle","öğle","обед"]);
  add("dinner",      ["dinner","diner","cena","abendessen","عشاء","aksam","akşam","ужин"]);
  add("brunch",      ["brunch","برانش","бранч"]);
  // Categories / venue types
  add("cafe",        ["cafe","café","coffee","coffee shop","coffeeshop","cafeteria","kaffee","caffe","caffè","مقهى","مقاهي","قهوة","kahve","kahveci","кофейня","кафе"]);
  add("restaurant",  ["restaurant","restaurants","restaurante","ristorante","gaststaette","مطعم","مطاعم","lokanta","ресторан"]);
  add("museum",      ["museum","museums","musee","musée","museo","متحف","متاحف","muze","müze","музей"]);
  add("park",        ["park","parc","parque","parco","حديقة","حدائق","حديقه","bahce","bahçe","парк"]);
  add("beach",       ["beach","plage","playa","spiaggia","strand","شاطئ","شاطىء","plaj","пляж"]);
  add("mall",        ["mall","shopping mall","centre commercial","centro comercial","centro commerciale","einkaufszentrum","مول","تسوق","alisveris","alışveriş","торговый центр"]);
  add("market",      ["market","marche","mercado","mercato","markt","سوق","pazar","рынок","souk"]);
  add("garden",      ["garden","jardin","giardino","garten","حديقة نباتية","bahce","сад"]);
  add("trail",       ["trail","sentier","sendero","sentiero","wanderweg","ممر مشي","yuruyus","yürüyüş","тропа"]);
  add("viewpoint",   ["viewpoint","mirador","belvedere","aussichtspunkt","نقطة مشاهدة","seyir","смотровая"]);
  add("nightlife",   ["nightlife","vie nocturne","vida nocturna","vita notturna","nachtleben","حياة ليلية","gece hayati","ночная жизнь","bar","club","disco","pub"]);
  add("entertainment",["entertainment","divertissement","entretenimiento","divertimento","unterhaltung","ترفيه","eglence","eğlence","развлечения","amusement","theme park"]);
  add("shopping",    ["shopping","achats","compras","shopping mall","تسوق","alisveris","шопинг"]);
  add("nature",      ["nature","naturaleza","natur","natura","طبيعة","doga","doğa","природа"]);
  add("sports",      ["sports","sport","deportes","sportivo","رياضة","رياضي","spor","спорт"]);
  add("culture",     ["culture","cultural","cultura","kulture","kultur","ثقافة","ثقافي","kultur","kültür","культура"]);
  add("history",     ["history","historic","historical","historico","storico","تاريخي","تاريخ","tarih","tarihi","история"]);
  add("art",         ["art","arte","kunst","sanat","فن","فني","искусство","gallery","galleria","galerie"]);
  return m;
})();

// Map any single token (already cache-normalized) to its canonical synonym, or
// return it unchanged if no synonym is known.
function __canonSynonym(token: string): string {
  if (!token) return token;
  const direct = __SYN_MAP[token];
  if (direct) return direct;
  // Plural trim ("restaurants" → "restaurant", "cafes" → "cafe")
  if (token.endsWith("s") && token.length > 3) {
    const sing = token.slice(0, -1);
    if (__SYN_MAP[sing]) return __SYN_MAP[sing];
  }
  return token;
}

// Scan a multi-word normalized phrase for known synonyms (handles bigrams like
// "coffee shop" → cafe, "shopping mall" → mall, "theme park" → entertainment).
function __extractCanonPhrases(normText: string): string[] {
  const out = new Set<string>();
  if (!normText) return [];
  const words = normText.split(" ").filter(Boolean);
  // Bigram pass first (longest match wins so single-word pass can skip used).
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i + 1]}`;
    if (__SYN_MAP[bi]) out.add(__SYN_MAP[bi]);
  }
  // Single-token pass with synonym + plural normalization.
  for (const w of words) {
    const c = __canonSynonym(w);
    if (c && c.length >= 3) out.add(c);
  }
  return [...out];
}

// Collapse synonyms so trivial query wording differences hash to the same key.
// e.g. "italian restaurant" and "best italian food" both → "italian|food".
function __extractPrefTokensFromQuery(query: string): string[] {
  const norm = __normalizeCacheText(query);
  const stop = new Set([
    "the","a","an","in","at","near","to","for","of","and","or","with","best",
    "top","good","great","place","places","spot","spots","real","local","authentic",
    "food","eatery","dining","cuisine","shop","shops","store","stores",
    "things","do","see","visit","tour","tours","real",
  ]);
  const tokens = new Set<string>();
  // Phrase-level synonyms (handles café/coffee shop and other multi-language hits).
  for (const c of __extractCanonPhrases(norm)) tokens.add(c);
  // Remaining standalone tokens (already canonicalized) — preserves city tokens
  // and uncategorized but meaningful words.
  for (const w of norm.split(" ")) {
    if (!w || stop.has(w) || w.length < 3) continue;
    tokens.add(__canonSynonym(w));
  }
  return [...tokens].sort().slice(0, 8);
}

// Normalize an arbitrary preference string (cuisine name, category) to a
// canonical synonym token so two languages of the same intent collapse.
function __canonPrefValue(v: string): string {
  if (!v) return "";
  const norm = __normalizeCacheText(v);
  const phrases = __extractCanonPhrases(norm);
  return phrases[0] || norm;
}

// Normalize a site language code to one of the 8 supported buckets so cache
// keys stay stable across regional variants ("en-US" → "en", "ar-SA" → "ar").
function __canonLang(lang?: string | null): string {
  if (!lang) return "en";
  const base = String(lang).toLowerCase().split(/[-_]/)[0];
  return ["en","ar","es","fr","de","it","tr","ru"].includes(base) ? base : "en";
}

function __buildSharedCacheKey(query: string, city: string, lat?: number, lng?: number): string {
  // Keep the bank key stable for the SAME intent even if query wording changes.
  // IMPORTANT: do NOT include the full preference set in every key. A shopping
  // query should reuse the shopping bank for users who selected shopping+nature,
  // while restaurant queries use cuisine tokens. This enables partial sharing
  // across users before any new SerpApi call.
  const queryTokens = __extractPrefTokensFromQuery(query);
  const foodTokens = new Set([
    "restaurant", "cafe", "breakfast", "lunch", "dinner", "brunch", "dessert", "bakery",
    "italian", "french", "japanese", "chinese", "korean", "thai", "indian", "mexican",
    "lebanese", "turkish", "greek", "spanish", "arabic", "seafood", "vegan", "vegetarian",
    "halal", "sushi", "pizza", "burger", "steak", "grill", "bbq",
  ]);
  const categoryTokens = new Set([
    "shopping", "mall", "market", "nature", "park", "garden", "trail", "viewpoint", "beach",
    "entertainment", "sports", "culture", "history", "art", "museum", "nightlife",
  ]);
  const scopedTokens = queryTokens.filter((token) => foodTokens.has(token) || categoryTokens.has(token));
  const seed = [
    (scopedTokens.length ? scopedTokens : queryTokens).sort().join(","),
    __normalizeCacheText(city || ""),
    "search",
    Number.isFinite(lat as number) ? (lat as number).toFixed(2) : "",
    Number.isFinite(lng as number) ? (lng as number).toFixed(2) : "",
  ].join("|");
  return __hashCacheKey(seed);
}

function __buildSerpIntentCacheKey(query: string, city: string): string {
  const tokens = __extractPrefTokensFromQuery(query).filter((token) => {
    const cityNorm = __normalizeCacheText(city || "");
    return token && token.length >= 3 && !cityNorm.split(" ").includes(token);
  });
  const cuisines = new Set(["italian","french","japanese","chinese","korean","thai","indian","mexican","lebanese","turkish","greek","spanish","arabic","seafood","vegan","vegetarian","halal","sushi","pizza","burger","steak","grill","bbq"]);
  const meals = new Set(["breakfast","lunch","dinner","brunch","restaurant","cafe"]);
  const categories = new Set(["shopping","mall","market","nature","park","garden","trail","viewpoint","beach","entertainment","sports","culture","history","art","museum","nightlife"]);
  const scoped = tokens.filter((t) => cuisines.has(t) || meals.has(t) || categories.has(t));
  const isFood = scoped.some((t) => cuisines.has(t) || meals.has(t));
  const collapsed = isFood
    ? scoped.filter((t) => cuisines.has(t) || ["breakfast","lunch","dinner","brunch","restaurant","cafe"].includes(t))
    : scoped.filter((t) => categories.has(t));
  return `${__normalizeCacheText(city || "")}|${(collapsed.length ? collapsed : tokens).sort().join(",") || "general"}`;
}

// Cross-user partial-match fallback: when the named bank key misses or its
// contents are fully exhausted (all items already used by this run), scan
// other users' cached banks for the SAME CITY and reuse any items that match
// at least part of the current preferences AND have not been shown yet.
// Returns SerpAPI-shaped places ready to ingest.
async function __queryCrossUserBanks(
  city: string,
  anchor: { lat: number; lng: number } | null,
  excludeIds: Set<string>,
  opts?: { tier?: "exact" | "parent" | "synonym"; debug?: { tiersTried: string[]; matched: number } },
): Promise<any[]> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return [];
  const cityNorm = __normalizeCacheText(city || "");
  if (!cityNorm) return [];
  const tier = opts?.tier || "exact";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const url = `${SUPABASE_URL}/rest/v1/places_cache?city=ilike.${encodeURIComponent("%" + city.slice(0, 40) + "%")}&source=eq.serpapi&select=results,city,query&order=last_accessed_at.desc&limit=40`;
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    }).finally(() => clearTimeout(timer));
    if (!resp.ok) return [];
    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return [];
    const ctx = __prefilterCtx;
    const aggregate: any[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const items = Array.isArray(row?.results) ? row.results : [];
      for (const it of items) {
        const ids = __placeIdentities(it);
        const sig = ids[0] || normalizeForDedup(it?.title || it?.name || "");
        if (!sig || seen.has(sig)) continue;
        if (ids.some((id) => excludeIds.has(id))) continue;
        if (anchor) {
          const lat = Number(it?.gps_coordinates?.latitude ?? it?.latitude);
          const lng = Number(it?.gps_coordinates?.longitude ?? it?.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            if (haversineKm(anchor.lat, anchor.lng, lat, lng) > 60) continue;
          }
        }
        seen.add(sig);
        aggregate.push(it);
      }
    }
    if (opts?.debug) {
      opts.debug.tiersTried.push(tier);
    }
    if (!aggregate.length) return [];
    const reshaped = __cachedToSerpShape(aggregate);
    // TIER STRATEGY:
    //   exact   → strict prefilter (cuisines + categories + hours + distance)
    //   parent  → loosen by dropping the cuisine constraint (categories only)
    //   synonym → no prefilter at all (text/synonym match was the matching pass)
    let filtered: any[];
    if (tier === "exact") {
      filtered = ctx ? __prefilterByExplicitTags(reshaped, "auto") : reshaped;
    } else if (tier === "parent") {
      const savedCuisines = ctx?.cuisines;
      try {
        if (ctx) ctx.cuisines = []; // drop cuisine, keep category
        filtered = ctx ? __prefilterByExplicitTags(reshaped, "auto") : reshaped;
      } finally {
        if (ctx) ctx.cuisines = savedCuisines as any;
      }
    } else {
      filtered = reshaped;
    }
    if (opts?.debug && filtered.length) opts.debug.matched = filtered.length;
    return filtered;
  } catch {
    return [];
  }
}

// Run the tiered partial-match scan: exact → parent (drop cuisine) → synonym.
// Returns the first non-empty tier and records which tiers were tried so the
// SerpApi-call logger can explain WHY it ultimately had to call SerpApi.
async function __queryCrossUserBanksTiered(
  city: string,
  anchor: { lat: number; lng: number } | null,
  excludeIds: Set<string>,
): Promise<{ items: any[]; tier: string | null; tiersTried: string[] }> {
  const debug = { tiersTried: [] as string[], matched: 0 };
  for (const tier of ["exact", "parent", "synonym"] as const) {
    const items = await __queryCrossUserBanks(city, anchor, excludeIds, { tier, debug });
    if (items.length) return { items, tier, tiersTried: debug.tiersTried };
  }
  return { items: [], tier: null, tiersTried: debug.tiersTried };
}
// Map a cached row (as stored by serpapi-places after normalization) back to the
// raw SerpAPI `local_results` shape that this engine expects downstream.
function __cachedToSerpShape(items: any[]): any[] {
  return items.map((p: any) => {
    // If we stored the full raw SerpAPI payload for this place, return it
    // verbatim — zero-loss reconstruction, no missing fields possible.
    if (p && typeof p === "object" && p._raw && typeof p._raw === "object") {
      return p._raw;
    }
    return {
      position: p?.position,
      title: p?.title,
      place_id: p?.place_id,
      data_id: p?.data_id,
      data_cid: p?.data_cid,
      provider_id: p?.provider_id,
      reviews_link: p?.reviews_link,
      photos_link: p?.photos_link,
      place_id_search: p?.place_id_search,
      rating: p?.rating,
      reviews: p?.reviews_count ?? p?.reviews,
      price: p?.price_level ?? p?.price,
      unclaimed_listing: p?.unclaimed_listing,
      type: p?.type,
      types: p?.types,
      type_id: p?.type_id,
      type_ids: p?.type_ids,
      address: p?.address,
      phone: p?.phone,
      website: p?.website,
      open_state: p?.open_state,
      operating_hours: p?.operating_hours || p?.hours,
      hours: p?.operating_hours || p?.hours,
      gps_coordinates: (Number.isFinite(p?.latitude) || Number.isFinite(p?.longitude))
        ? { latitude: p?.latitude, longitude: p?.longitude }
        : p?.gps_coordinates,
      thumbnail: p?.thumbnail,
      serpapi_thumbnail: p?.serpapi_thumbnail || p?.thumbnail,
      photos: p?.photos,
      description: p?.description,
      user_review: p?.user_review,
      extensions: p?.extensions,
      service_options: p?.service_options,
    };
  });
}
// Rotate the array using __serpVariationSeed so different requests see a
// different first window of the same 15-25 cached variants.
function __rotateVariants(items: any[]): any[] {
  if (items.length <= 1) return items;
  const offset = __serpVariationSeed % items.length;
  if (offset === 0) return items;
  return items.slice(offset).concat(items.slice(0, offset));
}

// DIVERSITY MODE: rotate by runSalt AND push recently-used place IDs to the
// back of the list so the SERP bank surfaces fresh items first on every
// regeneration. Falls back to plain rotation when nothing is recently used.
function __rotateBankByRecency(items: any[]): any[] {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const rotated = __rotateVariants(items);
  if (__recentlyUsedPlaceIds.size === 0 && __usedPlaceIdsThisRun.size === 0) {
    return rotated;
  }
  const fresh: any[] = [];
  const stale: any[] = [];
  for (const it of rotated) {
    const ids = __placeIdentities(it);
    const isStale = ids.some((id) => __recentlyUsedPlaceIds.has(id) || __usedPlaceIdsThisRun.has(id));
    (isStale ? stale : fresh).push(it);
  }
  return fresh.concat(stale);
}


// ── Per-request "used place" set: tracks place_id/data_id chosen during THIS
// generation so that a regeneration with the same fingerprint promotes
// previously-unused variants to the top. Populated by markPlacesUsedFromItinerary
// and consulted by __rotateVariantsExcluding.
const __usedPlaceIdsThisRun = new Set<string>();
const __recentlyUsedPlaceIds = new Set<string>(); // pre-loaded from places_usage on regen
// Names/keywords explicitly mentioned by the user in special requests.
// Items matching any of these phrases bypass the anti-repeat blocklist so
// "I want to eat at مطعم الطازج" still works after a previous trip used it.
const __specialRequestAllowList = new Set<string>();

function __isAllowedBySpecialRequest(p: any): boolean {
  if (__specialRequestAllowList.size === 0) return false;
  const haystack = `${p?.name || p?.title || ""} ${p?._raw?.title || ""} ${p?.address || p?._raw?.address || ""}`.toLowerCase();
  if (!haystack.trim()) return false;
  for (const phrase of __specialRequestAllowList) {
    if (phrase && haystack.includes(phrase)) return true;
  }
  return false;
}

function __placeIdentities(p: any): string[] {
  const raw = p?._raw && typeof p._raw === "object" ? p._raw : p;
  const ids = [
    raw?.place_id, raw?.placeId, raw?.googlePlaceId,
    raw?.data_id, raw?.dataId, raw?.data_cid, raw?.dataCid,
    raw?.provider_id, raw?.providerId, raw?.place_key,
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const title = normalizeForDedup(raw?.title || raw?.name || "");
  if (title) ids.push(`name:${title}`);
  // Treat the postal address as a hard identity too: two activities at the
  // exact same address must be rejected as duplicates even when their times
  // or categories differ ("lunch at X" + "shop at X" => same place).
  const address = normalizeForDedup(raw?.address || raw?.formatted_address || p?.address || "");
  if (address && address.length >= 8) ids.push(`addr:${address}`);
  const lat = Number(raw?.gps_coordinates?.latitude ?? raw?.latitude ?? raw?.lat);
  const lng = Number(raw?.gps_coordinates?.longitude ?? raw?.longitude ?? raw?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) ids.push(`geo:${lat.toFixed(3)},${lng.toFixed(3)}`);
  return Array.from(new Set(ids));
}

function __placeIdentity(p: any): string | null {
  return __placeIdentities(p)[0] || null;
}

// Smarter rotation: keep the variation seed offset, but additionally push any
// place that was already used (this run OR recently per places_usage) to the
// END of the list. Guarantees regenerations surface fresh items first while
// still allowing fallback to repeats when nothing new exists.
function __rotateVariantsExcluding(items: any[]): any[] {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const rotated = __rotateVariants(items);
  if (__usedPlaceIdsThisRun.size === 0 && __recentlyUsedPlaceIds.size === 0) return rotated;
  const fresh: any[] = [];
  const stale: any[] = [];
  for (const it of rotated) {
    const ids = __placeIdentities(it);
    const wasUsed = ids.some((id) => __usedPlaceIdsThisRun.has(id) || __recentlyUsedPlaceIds.has(id));
    if (wasUsed) stale.push(it);
    else fresh.push(it);
  }
  return fresh.concat(stale);
}

// ── EXPLICIT TAG PRE-FILTER + STRICT NON-REPEAT MODE ──
// Request-scoped tags applied BEFORE scheduling so the planner only sees
// candidates that match the user's explicit preferences (cuisine, category,
// hours, distance). Set from the request handler via __setPrefilterContext.
type PrefilterCtx = {
  cuisines: string[];          // e.g. ["italian","seafood"] — empty = no cuisine constraint
  categories: Set<string>;     // normalized interest tags (museums, beaches, ...)
  requireOpenHours: boolean;   // drop items whose payload exposes no parseable hours
  anchor: { lat: number; lng: number } | null;
  maxRadiusKm: number;         // 0 = disabled
  strictNoRepeat: boolean;     // drop items already seen this run OR recently used
  strictMatch: boolean;        // when true, NEVER return items that don't match selected categories — even as fallback
};
let __prefilterCtx: PrefilterCtx | null = null;
function __setPrefilterContext(ctx: Partial<PrefilterCtx> | null): void {
  if (!ctx) { __prefilterCtx = null; return; }
  __prefilterCtx = {
    cuisines: Array.isArray(ctx.cuisines) ? ctx.cuisines.map((c) => String(c || "").toLowerCase().trim()).filter(Boolean) : [],
    categories: ctx.categories instanceof Set ? ctx.categories : new Set<string>(),
    requireOpenHours: !!ctx.requireOpenHours,
    anchor: ctx.anchor && Number.isFinite(ctx.anchor.lat) && Number.isFinite(ctx.anchor.lng) ? ctx.anchor : null,
    maxRadiusKm: Number.isFinite(ctx.maxRadiusKm as number) && (ctx.maxRadiusKm as number) > 0 ? (ctx.maxRadiusKm as number) : 0,
    strictNoRepeat: ctx.strictNoRepeat !== false, // default ON
    strictMatch: !!ctx.strictMatch,
  };
}

function __itemHasParseableHours(p: any): boolean {
  const oh = p?.operating_hours ?? p?.opening_hours ?? p?.hours ?? p?.open_state ?? p?.openState ?? p?._raw?.operating_hours ?? p?._raw?.opening_hours ?? p?._raw?.hours ?? p?._raw?.open_state ?? p?._raw?.openState;
  if (!oh) return false;
  if (typeof oh === "string") return oh.trim().length > 0 && !/غير\s*متوفر|n\/a|unknown/i.test(oh);
  if (typeof oh === "object") return Object.keys(oh).length > 0;
  return false;
}

function __itemMatchesCuisines(p: any, cuisines: string[]): boolean {
  if (!cuisines.length) return true;
  const raw = p?._raw || p;
  const hay = [
    raw?.title, raw?.name, raw?.description, raw?.cuisine,
    raw?.type, Array.isArray(raw?.types) ? raw.types.join(" ") : "",
    Array.isArray(raw?.extensions) ? JSON.stringify(raw.extensions) : "",
  ].filter(Boolean).join(" ").toLowerCase();
  if (!hay) return false;
  // any-match with synonym support: at least one requested cuisine must appear.
  return matchesAnyRequestedCuisineText(hay, cuisines);
}

function __itemMatchesCategories(p: any, categories: Set<string>): boolean {
  if (!categories || categories.size === 0) return true;
  if (isFoodLikePlace(p)) return false;

  const inferredInterest = inferDataDrivenInterestKey(p);
  if (inferredInterest && inferredInterest !== "meal") {
    return categories.has(inferredInterest);
  }

  const raw = p?._raw || p;
  const hay = [
    raw?.type, Array.isArray(raw?.types) ? raw.types.join(" ") : "",
    Array.isArray(raw?.type_ids) ? raw.type_ids.join(" ") : "",
    raw?.title, raw?.description,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!hay) return false;
  for (const c of categories) {
    if (c && hay.includes(c)) return true;
  }
  return false;
}

function __itemWithinRadius(p: any, anchor: { lat: number; lng: number } | null, maxKm: number): boolean {
  if (!anchor || !maxKm) return true;
  const raw = p?._raw || p;
  const lat = Number(raw?.gps_coordinates?.latitude ?? raw?.latitude ?? raw?.lat);
  const lng = Number(raw?.gps_coordinates?.longitude ?? raw?.longitude ?? raw?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true; // unknown → don't drop
  return haversineKm(anchor.lat, anchor.lng, lat, lng) <= maxKm;
}

// Apply the request-scoped pre-filter. `mode` controls cuisine/category gating:
//   - "auto": apply cuisine filter only when the item looks like food
//   - "restaurants": always apply cuisine filter
//   - "activities": apply category filter only
function __prefilterByExplicitTags(items: any[], mode: "auto" | "restaurants" | "activities" = "auto"): any[] {
  if (!Array.isArray(items) || items.length === 0) return items;
  const ctx = __prefilterCtx;
  if (!ctx) return items;
  let droppedCuisine = 0, droppedCategory = 0, droppedHours = 0, droppedDistance = 0, droppedRepeat = 0;
  const kept: any[] = [];
  for (const it of items) {
    const raw = it?._raw || it;
    const looksLikeFood = isFoodLikePlace(raw);
    const applyCuisine = mode === "restaurants" || (mode === "auto" && looksLikeFood);
    const applyCategory = mode === "activities" || (mode === "auto" && !looksLikeFood);

    if (mode === "activities" && looksLikeFood) { droppedCategory++; continue; }
    if (applyCuisine && ctx.cuisines.length && !__itemMatchesCuisines(it, ctx.cuisines)) { droppedCuisine++; continue; }
    if (applyCategory && ctx.categories.size && !__itemMatchesCategories(it, ctx.categories)) { droppedCategory++; continue; }
    if (ctx.requireOpenHours && !__itemHasParseableHours(it)) { droppedHours++; continue; }
    if (ctx.anchor && ctx.maxRadiusKm > 0 && !__itemWithinRadius(it, ctx.anchor, ctx.maxRadiusKm)) { droppedDistance++; continue; }
    if (ctx.strictNoRepeat) {
      const ids = __placeIdentities(it);
      const wasUsed = ids.some((id) => __usedPlaceIdsThisRun.has(id) || __recentlyUsedPlaceIds.has(id));
      if (wasUsed) { droppedRepeat++; continue; }
    }
    kept.push(it);
  }
  if (kept.length !== items.length) {
    console.log(`[prefilter:${mode}] kept=${kept.length}/${items.length} drop(cuisine=${droppedCuisine},category=${droppedCategory},hours=${droppedHours},distance=${droppedDistance},repeat=${droppedRepeat})`);
  }
  // Safety net: if strict filters wiped everything, relax ONLY the repeat
  // check. Never relax the activity-vs-food boundary; restaurants must remain
  // meal candidates, not nature/culture/shopping activities.
  if (kept.length === 0 && items.length > 0) {
    // STRICT MATCH MODE: never return non-matching items, even when the pool
    // is empty. The caller is responsible for handling an empty result (e.g.
    // by widening the search query rather than mixing in unrelated places).
    if (ctx.strictMatch && ctx.categories.size > 0 && mode !== "restaurants") {
      console.warn(`[prefilter:${mode}] strict-match: returning empty pool — no item matched ${Array.from(ctx.categories).join(",")}`);
      return [];
    }
    if (ctx.strictNoRepeat) {
      const relaxed = items.filter((it) => {
        if (mode === "activities" && isFoodLikePlace(it)) return false;
        // In strict-match mode the relaxed pool must STILL respect the
        // category filter — only the repeat constraint is loosened.
        if (ctx.strictMatch && ctx.categories.size > 0 && mode !== "restaurants" && !__itemMatchesCategories(it, ctx.categories)) return false;
        const ids = __placeIdentities(it);
        if (__isAllowedBySpecialRequest(it)) return true;
        return !ids.some((id) => __usedPlaceIdsThisRun.has(id) || __recentlyUsedPlaceIds.has(id));
      });
      if (relaxed.length) {
        console.warn(`[prefilter:${mode}] strict filters emptied pool — relaxed to non-repeat (${relaxed.length})`);
        return relaxed;
      }
    }
    if (mode === "activities") {
      console.warn(`[prefilter:${mode}] all activity candidates filtered — returning empty pool rather than misclassified restaurants`);
      return [];
    }
    if (mode === "restaurants" && ctx.cuisines.length > 0) {
      console.warn(`[prefilter:${mode}] all cuisine candidates filtered — returning empty pool rather than unrelated restaurants`);
      return [];
    }
    console.warn(`[prefilter:${mode}] all candidates filtered — returning original set to avoid empty plan`);
    return items;
  }
  return kept;
}


// ── COMPLETENESS VALIDATOR
// Compares a stored cached place against the canonical SerpAPI local_results
// schema and logs any missing-but-expected fields. Pure observability — never
// throws, never mutates the place. Sampled to keep logs sane.
const __EXPECTED_SERP_KEYS = [
  "position", "title", "place_id", "data_id", "data_cid", "provider_id",
  "reviews_link", "photos_link", "place_id_search",
  "rating", "reviews", "type", "types", "type_id", "type_ids",
  "address", "phone", "website", "open_state", "operating_hours",
  "gps_coordinates", "thumbnail", "serpapi_thumbnail",
  "description", "user_review", "extensions", "service_options",
] as const;
// Subset that, if missing, signals the cached row is unusable for itinerary
// generation (no identity, no location, or no classification). Triggers an
// auto re-fetch from SerpAPI and overwrites the stale cache entry.
const __CRITICAL_SERP_KEYS = new Set<string>([
  "title", "place_id", "gps_coordinates", "address", "type",
]);
function __isCriticallyIncomplete(missing: string[]): boolean {
  if (!missing || !missing.length) return false;
  let critical = 0;
  for (const k of missing) if (__CRITICAL_SERP_KEYS.has(k)) critical++;
  return critical >= 2; // 2+ critical fields missing → unusable
}
let __validationLogBudget = 8; // cap log noise per request
function __validateCachedPlace(place: any, ctx: { cacheKey?: string; query?: string; city?: string }): string[] {
  if (!place || typeof place !== "object") return [];
  const missing: string[] = [];
  for (const k of __EXPECTED_SERP_KEYS) {
    const v = (place as any)[k];
    const empty =
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "") ||
      (Array.isArray(v) && v.length === 0);
    // Identity and coordinates can exist under equivalent cached/raw fields.
    if ((k === "place_id" || k === "data_id") && empty) {
      if (place?.placeId || place?.dataId || place?.data_cid || place?.dataCid || place?.provider_id || place?.providerId) continue;
    }
    if (k === "gps_coordinates" && empty) {
      if ((Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude)) || (Number.isFinite(place?.lat) && Number.isFinite(place?.lng))) continue;
    }
    if (k === "operating_hours" && empty) {
      if (place?.hours || place?.openingHours || place?.opening_hours) continue;
    }
    if (empty) missing.push(k);
  }
  if (missing.length && __validationLogBudget > 0) {
    __validationLogBudget--;
    try {
      console.warn("[places_cache:validation] incomplete record", {
        place_id: place?.place_id || place?.data_id,
        title: place?.title,
        city: ctx.city,
        query: ctx.query?.slice(0, 80),
        cache_key: ctx.cacheKey,
        missing,
      });
    } catch { /* ignore */ }
  }
  return missing;
}

// Pull recently-used place ids for this user/city (and optionally categories
// matching the user's current preferences) to bias rotation away from repeats
// across separate generation runs (regeneration UX).
//
// When `preferredCategories` is provided we also issue a second prioritised
// fetch for usage rows whose `category` matches the user's current
// preferences. Those rows are loaded FIRST so they always make it into the
// (limited) recently-used set even when the city has thousands of total
// usage rows — guaranteeing that "same user + same preferences" never
// surfaces an already-shown matching place if any unused alternative exists.
async function __loadRecentlyUsedPlaceIds(
  userId: string | null,
  city: string | null,
  preferredCategories?: string[] | null,
): Promise<void> {
  __recentlyUsedPlaceIds.clear();
  if (!city) return; // city is required, but userId may be null for guests (we'll fall back to global usage)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  // For logged-in users: load ONLY their personal history. Global rows are
  // shared popularity signals and must NOT block new users from receiving bank
  // items they have never seen. Guests are tracked through a stable UUID stored
  // in the user_id column, so they also get personal non-repeat behavior.
  const filter = userId
    ? `user_id=eq.${encodeURIComponent(userId)}`
    : `user_id=is.null`;
  const baseUrl = `${SUPABASE_URL}/rest/v1/places_usage?${filter}&city=eq.${encodeURIComponent(city)}`;
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } as const;
  const ingestRows = (rows: any) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      const k = String(r?.place_key || "").trim();
      const n = normalizeForDedup(r?.place_name || "");
      if (k) __recentlyUsedPlaceIds.add(k);
      if (n) __recentlyUsedPlaceIds.add(`name:${n}`);
    }
  };
  try {
    // ── PASS 1 (priority): preference-matching rows. Ensures that when the
    // same user re-runs the same query (e.g. "Italian restaurants in Rome"),
    // every previously-shown Italian place is in the block-list regardless
    // of how many other rows exist for that city.
    const cats = (preferredCategories || [])
      .map((s) => String(s || "").toLowerCase().trim())
      .filter(Boolean);
    if (cats.length) {
      const ctrlA = new AbortController();
      const tA = setTimeout(() => ctrlA.abort(), 1500);
      const inList = cats.map((c) => `"${c}"`).join(",");
      const respA = await fetch(
        `${baseUrl}&category=in.(${encodeURIComponent(inList)})&select=place_key,place_name&order=last_used_at.desc&limit=2000`,
        { signal: ctrlA.signal, headers },
      ).finally(() => clearTimeout(tA));
      if (respA.ok) ingestRows(await respA.json());
    }
    // ── PASS 2: general recent usage for the same user/city (fills remaining
    // capacity up to the same 2000-row cap; duplicates are deduped by Set semantics).
    const ctrlB = new AbortController();
    const tB = setTimeout(() => ctrlB.abort(), 1500);
    const respB = await fetch(
      `${baseUrl}&select=place_key,place_name&order=last_used_at.desc&limit=2000`,
      { signal: ctrlB.signal, headers },
    ).finally(() => clearTimeout(tB));
    if (respB.ok) ingestRows(await respB.json());
  } catch { /* ignore */ }
}
async function __readSharedSerpCache(query: string, city: string, anchor: { lat: number; lng: number } | null): Promise<any[] | null> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const cacheKey = __buildSharedCacheKey(query, city, anchor?.lat, anchor?.lng);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=results,hit_count,created_at,expires_at&limit=1`,
      {
        signal: ctrl.signal,
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      },
    ).finally(() => clearTimeout(timer));
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = rows[0];
    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now()) return null;
    const hits = Number(row?.hit_count || 0);
    const createdAt = row?.created_at ? new Date(row.created_at).getTime() : 0;
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    
    // LIBRARY REFRESH RULE: 
    // Force a fresh fetch if the entry is > 30 days old OR has been used >= 25 times.
    if (hits >= 25 || ageDays >= 30) {
      console.log(`[Library:Refresh] Cache entry "${cacheKey}" expired due to rule: hits=${hits}, ageDays=${ageDays.toFixed(1)}`);
      return null;
    }
    
    const raw = Array.isArray(row?.results) ? row.results : [];
    // Bump hit_count fire-and-forget (don't block).
    fetch(`${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(cacheKey)}`, {
      method: "PATCH",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ hit_count: hits + 1, last_accessed_at: new Date().toISOString() }),
    }).catch(() => {});
    // Validate completeness vs expected SerpAPI keys. We INTENTIONALLY do
    // NOT delete the row when records look incomplete — the bank is a shared
    // long-lived resource that may still serve other users with looser
    // requirements. Instead we log a warning and ADD fresh items to the bank
    // (handled downstream when SerpApi is called for genuine misses).
    try {
      const sampleSize = Math.min(raw.length, 5);
      let badRecords = 0;
      for (let i = 0; i < sampleSize; i++) {
        const missing = __validateCachedPlace(raw[i], { cacheKey, query, city });
        if (__isCriticallyIncomplete(missing)) badRecords++;
      }
      if (sampleSize > 0 && badRecords / sampleSize >= 0.5) {
        console.warn("[places_cache:quality_warning] bank has incomplete records but will be kept", {
          cache_key: cacheKey, city, query: query.slice(0, 80),
          bad: badRecords, sampled: sampleSize,
          policy: "additive_refresh_on_exhaust",
        });
      }
    } catch { /* ignore */ }
    return __cachedToSerpShape(raw);
  } catch {
    return null;
  }
}

async function __touchSharedSerpCache(query: string, city: string, anchor: { lat: number; lng: number } | null): Promise<void> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const cacheKey = __buildSharedCacheKey(query, city, anchor?.lat, anchor?.lng);
    let existingResults: any[] = [];
    let existingHits = 0;
    try {
      const prev = await fetch(`${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=results,hit_count&limit=1`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (prev.ok) {
        const rows = await prev.json();
        existingResults = Array.isArray(rows?.[0]?.results) ? rows[0].results : [];
        existingHits = Number(rows?.[0]?.hit_count || 0);
      }
    } catch { /* keep empty marker */ }
    await fetch(`${SUPABASE_URL}/rest/v1/places_cache`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        query: String(query).slice(0, 500),
        city: city || null,
        language: "en",
        source: "serpapi",
        results: existingResults,
        results_count: existingResults.length,
        hit_count: existingHits,
        last_accessed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }),
    });
  } catch { /* swallow */ }
}

async function __writeSharedSerpCache(query: string, city: string, anchor: { lat: number; lng: number } | null, results: any[]): Promise<void> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  if (!results.length) return await __touchSharedSerpCache(query, city, anchor);
  try {
    const cacheKey = __buildSharedCacheKey(query, city, anchor?.lat, anchor?.lng);

    // Shape the new items into the persisted form.
    const shape = (p: any) => ({
      position: p?.position,
      title: p?.title,
      place_id: p?.place_id,
      data_id: p?.data_id,
      data_cid: p?.data_cid,
      provider_id: p?.provider_id,
      reviews_link: p?.reviews_link,
      photos_link: p?.photos_link,
      place_id_search: p?.place_id_search,
      rating: p?.rating,
      reviews_count: p?.reviews,
      price_level: p?.price,
      unclaimed_listing: p?.unclaimed_listing === true,
      type: p?.type,
      types: Array.isArray(p?.types) ? p.types : undefined,
      type_id: p?.type_id,
      type_ids: Array.isArray(p?.type_ids) ? p.type_ids : undefined,
      address: p?.address,
      phone: p?.phone,
      website: p?.website,
      open_state: p?.open_state,
      hours: p?.operating_hours || p?.hours,
      latitude: p?.gps_coordinates?.latitude,
      longitude: p?.gps_coordinates?.longitude,
      thumbnail: p?.thumbnail,
      serpapi_thumbnail: p?.serpapi_thumbnail,
      photos: Array.isArray(p?.photos) ? p.photos.map((x: any) => x?.src || x).filter(Boolean) : [],
      description: p?.description || p?.snippet,
      user_review: p?.user_review,
      extensions: Array.isArray(p?.extensions) ? p.extensions : undefined,
      service_options: p?.service_options,
      gps_coordinates: p?.gps_coordinates,
      operating_hours: p?.operating_hours,
      place_key: p?.place_id || p?.data_id || p?.data_cid || p?.provider_id || p?.title,
      _raw: (() => { try { return safeCloneJson(p?._raw || p); } catch { return p; } })(),
    });
    const incoming = results.slice(0, 25).map(shape);

    // ── ADDITIVE MERGE: read the existing bank (if any) and union by identity
    // so we PRESERVE everything previously cached and only ADD fresh items.
    // The bank only ever grows (capped at 60 entries to keep rows compact).
    let merged: any[] = incoming;
    let existingHits = 0;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const respPrev = await fetch(
        `${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=results,hit_count&limit=1`,
        { signal: ctrl.signal, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
      ).finally(() => clearTimeout(timer));
      if (respPrev.ok) {
        const rows = await respPrev.json();
        const prevRaw = Array.isArray(rows?.[0]?.results) ? rows[0].results : [];
        existingHits = Number(rows?.[0]?.hit_count || 0);
        if (prevRaw.length) {
          const seen = new Set<string>();
          merged = [];
          // Keep existing items first (preserve insertion order for stability).
          for (const it of [...prevRaw, ...incoming]) {
            const id = String(
              it?.place_id || it?.data_id || it?.data_cid || it?.provider_id || it?.title || "",
            ).toLowerCase().trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            merged.push(it);
            if (merged.length >= 60) break;
          }
          console.log("[places_cache:additive_merge]", {
            cache_key: cacheKey, prev: prevRaw.length, incoming: incoming.length, merged: merged.length,
          });
        }
      }
    } catch { /* ignore — fall back to incoming only */ }

    await fetch(`${SUPABASE_URL}/rest/v1/places_cache`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: cacheKey,
        query: String(query).slice(0, 500),
        city: city || null,
        language: "en",
        source: "serpapi",
        results: merged,
        results_count: merged.length,
        hit_count: existingHits, // preserve hit_count across merges
        // created_at: leave existing (we don't include it on merge to avoid resetting).
        last_accessed_at: new Date().toISOString(),
        // Extended TTL — bank is meant to live as long as possible.
        expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  } catch {
    /* swallow */
  }
}

// ============================================================
// TRIP RECOVERY CACHE
// ----------------------------------------------------------------
// Persists the FINAL itinerary keyed by a stable fingerprint of the
// request body. If a generation later FAILS (timeout / 504 / busy LLM)
// after SerpAPI credits were already consumed, a quick retry with the
// same parameters will serve the recovered itinerary instead of
// hitting SerpAPI again. TTL: 30 minutes — only protects retry storms.
// ============================================================
function __buildTripRecoveryFingerprint(req: any): string {
  try {
    const norm = (v: any) => String(v ?? "").trim().toLowerCase();
    const arr = (v: any) => Array.isArray(v) ? v.map(norm).sort() : [];
    const meals = req?.mealPreferences && typeof req.mealPreferences === "object"
      ? {
          b: !!req.mealPreferences.breakfast,
          l: !!req.mealPreferences.lunch,
          d: !!req.mealPreferences.dinner,
          s: !!req.mealPreferences.snacks,
        }
      : null;
    const legs = Array.isArray(req?.cityLegs)
      ? req.cityLegs.map((l: any) => `${norm(l?.city)}:${Number(l?.days) || 1}`).join(">")
      : "";
    const fp = JSON.stringify({
      d: norm(req?.destination),
      dc: norm(req?.departureCity),
      sd: norm(req?.startDate),
      du: Number(req?.duration) || 0,
      tr: Number(req?.travelers) || 0,
      ch: Number(req?.children) || 0,
      it: arr(req?.interests),
      cu: arr(req?.cuisineTypes || req?.cuisinePreferences),
      sp: norm(req?.specialRequests).slice(0, 200),
      tt: norm(req?.tripType),
      apd: Number(req?.activitiesPerDay) || Number(req?.maxActivitiesPerDay) || 0,
      m: meals,
      lg: legs,
      ln: norm(req?.lang),
      vs: Number(req?.variationSeed) || 0,
      rm: norm(req?.regenMode),
    });
    // Simple deterministic hash (FNV-1a, base36) — keeps cache_key short.
    let h = 2166136261 >>> 0;
    for (let i = 0; i < fp.length; i++) {
      h ^= fp.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return `recover:${h.toString(36)}`;
  } catch {
    return "";
  }
}

async function __readTripRecoveryCache(fingerprint: string): Promise<any | null> {
  if (!fingerprint) return null;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/places_cache?cache_key=eq.${encodeURIComponent(fingerprint)}&select=results,created_at,expires_at&limit=1`,
      { signal: ctrl.signal, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    ).finally(() => clearTimeout(timer));
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const row = rows[0];
    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expiresAt && expiresAt < Date.now()) return null;
    // Recovery payload is wrapped as a single-element array under `results`.
    const raw = Array.isArray(row?.results) ? row.results : [];
    if (!raw.length || typeof raw[0] !== "object") return null;
    return raw[0];
  } catch {
    return null;
  }
}

function __writeTripRecoveryCache(fingerprint: string, itinerary: any): void {
  if (!fingerprint || !itinerary) return;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const ttlMs = 30 * 60 * 1000; // 30 min — only protects fast retries.
    fetch(`${SUPABASE_URL}/rest/v1/places_cache`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        cache_key: fingerprint,
        query: fingerprint,
        city: null,
        language: "recovery",
        source: "trip_recovery",
        results: [itinerary],
        results_count: 1,
        hit_count: 0,
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      }),
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

async function fetchSerpLocalResults(query: string, apiKey: string, cityName = "", mode: "auto" | "restaurants" | "activities" = "auto"): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const anchor = getCitySearchAnchor(cityName);
    // STRICT: append city to query when not already present, to bias Google Maps results
    const cityToken = String(cityName || "").trim();
    const queryHasCity = cityToken && query.toLowerCase().includes(cityToken.toLowerCase());
    const finalQuery = cityToken && !queryHasCity ? `${query} ${cityToken}` : query;
    // Request-scoped cache: identical (query|city) → reuse first result set.
    // CRITICAL: store the FULL unfiltered bank so subsequent refill passes can
    // pull additional variants when the strict prefilter empties the visible set.
    const cacheKey = `${finalQuery.toLowerCase()}|${cityToken.toLowerCase()}`;
    const intentCacheKey = __buildSerpIntentCacheKey(finalQuery, cityToken);
    const sharedCacheKey = __buildSharedCacheKey(finalQuery, cityToken, anchor?.lat, anchor?.lng);
    const cached = __serpRequestCache.get(cacheKey);
    if (cached) {
      const rotatedCached = __rotateVariantsExcluding(cached);
      const filteredCached = __prefilterByExplicitTags(rotatedCached, mode);
      console.log(`[SerpAPI cache HIT] ${cacheKey} → ${filteredCached.length}/${rotatedCached.length} variants (bank=${cached.length}, re-rotated + tag-filtered)`);
      logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: filteredCached.length, context: "fetchSerpLocalResults" });
      return filteredCached;
    }
    const intentCached = __serpRequestCanonicalCache.get(intentCacheKey);
    if (intentCached) {
      const rotatedCached = __rotateVariantsExcluding(intentCached);
      const filteredCached = __prefilterByExplicitTags(rotatedCached, mode);
      __serpRequestCache.set(cacheKey, intentCached);
      console.log(`[SerpAPI intent cache HIT] ${intentCacheKey} → ${filteredCached.length}/${rotatedCached.length} variants`);
      logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: filteredCached.length, context: "fetchSerpLocalResults:intent_cache" });
      return filteredCached;
    }

    // ── Shared persistent cache (places_cache) — cross-user, 15-25 variants
    // per query, 30-day TTL with 25-hit refresh. Rotate window per request.
    const sharedHit = await __readSharedSerpCache(finalQuery, cityToken, anchor);
    let results: any[] | null = null;
    // Helper: count how many items in a bank are still "fresh" (not used by
    // this run AND not in the recently-used global history). We use this to
    // decide whether the named bank is genuinely exhausted for this user.
    const countFresh = (bank: any[]): number => {
      let n = 0;
      for (const it of bank) {
        const ids = __placeIdentities(it);
        if (!ids.length) { n++; continue; }
        const used = ids.some((id) => __usedPlaceIdsThisRun.has(id) || __recentlyUsedPlaceIds.has(id));
        if (!used) n++;
      }
      return n;
    };
    if (sharedHit && sharedHit.length === 0) {
      results = [];
      console.log(`[SerpAPI shared cache EMPTY-HIT] ${finalQuery} → skipping SerpApi until bank marker expires`);
      logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: 0, context: "fetchSerpLocalResults:empty_bank_marker" });
    } else if (sharedHit && sharedHit.length && countFresh(sharedHit) > 0) {
      results = __rotateVariantsExcluding(sharedHit);
      console.log(`[SerpAPI shared cache HIT] ${finalQuery} → ${results.length} variants (${countFresh(sharedHit)} fresh)`);
      logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: results.length, context: "fetchSerpLocalResults:shared_cache" });
    } else {
      // ── Cross-user partial-match (tiered): exact prefs → parent (drop
      // cuisine) → synonym-only. We only call SerpApi if all three tiers
      // come up empty.
      const excludeIds = new Set<string>([...__usedPlaceIdsThisRun, ...__recentlyUsedPlaceIds]);
      const tiered = await __queryCrossUserBanksTiered(cityToken, anchor, excludeIds);
      if (tiered.items.length) {
        console.log(`[SerpAPI cross-user bank HIT] tier=${tiered.tier} ${finalQuery} → reused ${tiered.items.length} unseen items (tiers tried: ${tiered.tiersTried.join(",")})`);
        results = tiered.items;
        // Persist into the named key so subsequent identical lookups within
        // this request resolve instantly from the in-memory bank.
        __writeSharedSerpCache(finalQuery, cityToken, anchor, results);
        logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: results.length, context: `fetchSerpLocalResults:cross_user:${tiered.tier}` });
      } else {
        // ── Last resort: actually hit SerpApi. All tiers exhausted.
        const existingInflight = __serpRequestInflight.get(sharedCacheKey);
        if (existingInflight) {
          const inflightResults = await existingInflight.catch(() => []);
          if (inflightResults.length) {
            results = inflightResults;
            logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: results.length, context: "fetchSerpLocalResults:inflight_join" });
          } else {
            results = [];
          }
        } else {
        const lock = await __tryAcquireSharedLookupLock(sharedCacheKey, 18);
        if (!lock.acquired) {
          const started = Date.now();
          while (Date.now() - started < 2200) {
            await new Promise((resolve) => setTimeout(resolve, 350));
            const peerHit = await __readSharedSerpCache(finalQuery, cityToken, anchor);
            if (peerHit && peerHit.length) {
              results = peerHit;
              logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: true, resultsCount: results.length, context: "fetchSerpLocalResults:lock_wait_cache" });
              break;
            }
          }
        }
        if (!results) {
        const liveFetchPromise = (async (): Promise<any[]> => {
        // Detailed diagnostic so you can troubleshoot WHY SerpApi was called.
        const tokens = __extractPrefTokensFromQuery(finalQuery);
        const reason = sharedHit && sharedHit.length
          ? "primary_bank_exhausted"
          : "no_primary_bank";
        console.log("[SerpAPI miss → calling SerpApi]", {
          reason,
          query: finalQuery.slice(0, 120),
          city: cityToken,
          query_tokens: tokens,
          pref_cuisines: (__prefilterCtx?.cuisines || []).map(__canonPrefValue),
          pref_categories: __prefilterCtx?.categories ? [...__prefilterCtx.categories].map(__canonPrefValue) : [],
          excluded_place_ids: excludeIds.size,
          primary_bank_size: sharedHit?.length || 0,
          tiers_tried: tiered.tiersTried,
          partial_match_attempts: tiered.tiersTried.length,
        });
        // PAGINATION LOOP: when the primary bank is exhausted for this user,
        // walk through SerpApi pages (start=20, 40, 60, …) until we find at
        // least one NEW place_id that's not already in the bank, or until we
        // hit the max-page budget. This grows the shared bank for everyone.
        const bankCfg = await fetchSerpBankConfig();
        const MAX_SERP_PAGES = bankCfg.maxPages;
        const PAGE_SIZE = bankCfg.pageSize;
        const FRESH_THRESHOLD = bankCfg.freshThreshold;
        const useNextPage = reason === "primary_bank_exhausted";
        const knownIds = new Set<string>();
        for (const it of (sharedHit || [])) {
          for (const id of __placeIdentities(it)) knownIds.add(id);
        }
        const baseStart = useNextPage ? Math.min(120, (sharedHit?.length || PAGE_SIZE)) : 0;
        const aggregated: any[] = [];
        let pagesFetched = 0;
        let lastReason = "ok";
        console.log(`[SerpBank cfg] maxPages=${MAX_SERP_PAGES} pageSize=${PAGE_SIZE} freshThreshold=${FRESH_THRESHOLD} refreshMode=${bankCfg.refreshMode}`);
        for (let page = 0; page < (useNextPage ? MAX_SERP_PAGES : 1); page++) {
          const startVal = baseStart + (page * PAGE_SIZE);
          const startParam = startVal > 0 ? `&start=${Math.min(180, startVal)}` : "";
          const url = `https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(finalQuery)}&hl=en${anchor ? `&ll=@${anchor.lat},${anchor.lng},${anchor.zoom}z` : ""}${startParam}&api_key=${apiKey}`;
          const pageController = new AbortController();
          const pageTimeout = setTimeout(() => pageController.abort(), 8000);
          let pageResp: Response;
          try {
            pageResp = await fetch(url, { signal: pageController.signal });
          } catch (e) {
            lastReason = `fetch_error:${e instanceof Error ? e.message : "unknown"}`;
            break;
          } finally {
            clearTimeout(pageTimeout);
          }
          pagesFetched++;
          if (!pageResp.ok) {
            lastReason = `http_${pageResp.status}`;
            break;
          }
          const pageData = await pageResp.json().catch(() => null);
          const pageItems: any[] = Array.isArray(pageData?.local_results) ? pageData.local_results : [];
          if (!pageItems.length) {
            lastReason = `empty_page_${page + 1}`;
            break;
          }
          // Detect fresh items by place identity vs already-known bank IDs
          let freshOnPage = 0;
          for (const it of pageItems) {
            const ids = __placeIdentities(it);
            const isNew = ids.length === 0 || ids.some((id) => !knownIds.has(id));
            if (isNew) {
              aggregated.push(it);
              for (const id of ids) knownIds.add(id);
              freshOnPage++;
            }
          }
          console.log(`[SerpAPI page ${page + 1}/${useNextPage ? MAX_SERP_PAGES : 1}] start=${startVal} → ${pageItems.length} items, ${freshOnPage} fresh (total fresh: ${aggregated.length})`);
          // Stop early once we have enough new place IDs to fill schedule
          if (aggregated.length >= FRESH_THRESHOLD) break;
          // If a later page returns nothing fresh, no point paging deeper.
          // Page 1 may be the same top results, so still try start=20 next.
          if (freshOnPage === 0 && page > 0) {
            lastReason = `no_fresh_after_page_${page + 1}`;
            break;
          }
        }
        clearTimeout(timeoutId);
        results = aggregated;
        // MANDATORY persist: write whatever we got into the bank against the
        // city/preferences/date key BEFORE returning. Even when fresh count is
        // zero we still call the write helper so the cache row's
        // last_accessed_at + hit counter advance — this prevents redundant
        // SerpApi calls for the same key in the next 5 minutes.
        if (results.length) {
          await __writeSharedSerpCache(finalQuery, cityToken, anchor, results);
          console.log(`[SerpBank persist] ${finalQuery.slice(0, 80)} → wrote ${results.length} fresh item(s) across ${pagesFetched} page(s), reason=${lastReason}`);
        } else {
          // Touch the existing key so we don't re-page in the next ~5 min for
          // the same user/preferences. Pass the existing bank to the writer so
          // the additive merge is a no-op but last_accessed_at refreshes.
          await __writeSharedSerpCache(finalQuery, cityToken, anchor, sharedHit || []).catch(() => {});
          console.log(`[SerpBank persist] ${finalQuery.slice(0, 80)} → SerpApi exhausted (${pagesFetched} page(s), reason=${lastReason}), bank unchanged`);
        }
        return results;
        })();
        __serpRequestInflight.set(sharedCacheKey, liveFetchPromise);
        try {
          results = await liveFetchPromise;
        } finally {
          __serpRequestInflight.delete(sharedCacheKey);
          __releaseSharedLookupLock(sharedCacheKey, lock.workerId);
        }
        }
        }
      }
    }

    results = results || [];
    if (!cityName) {
      const tagFilteredNoCity = __prefilterByExplicitTags(results, mode);
      // Store the FULL bank (not filtered) so future refills can mine more.
      __serpRequestCache.set(cacheKey, results);
      __serpRequestCanonicalCache.set(intentCacheKey, results);
      logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: !!sharedHit, resultsCount: tagFilteredNoCity.length, context: "fetchSerpLocalResults:no_city" });
      return tagFilteredNoCity;
    }
    // STRICT: max distance from city center (km). Tighter for Dubai/Abu Dhabi clusters.
    const maxDistanceKm = 45;
    const filtered = results.filter((place: any) => {
      const lat = Number(place?.gps_coordinates?.latitude);
      const lng = Number(place?.gps_coordinates?.longitude);
      const candidate = {
        name: place?.title,
        address: place?.address,
        latitude: lat,
        longitude: lng,
        description: `${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""}`,
        category: mapSerpCategory(place),
      };
      // Hard reject: invalid name/address or known out-of-city context
      if (isInvalidActivityResult(candidate)) return false;
      if (looksOutOfCityContext(candidate, cityName)) return false;
      // STRICT GEOFENCE: when we know city anchor + result has GPS, enforce radius
      if (anchor && Number.isFinite(lat) && Number.isFinite(lng)) {
        const distance = haversineKm(anchor.lat, anchor.lng, lat, lng);
        if (distance > maxDistanceKm) {
          console.log(`[SerpAPI strict] Rejected "${place?.title}" — ${distance.toFixed(1)}km from ${cityName} center (>${maxDistanceKm}km)`);
          return false;
        }
      }
      // STRICT: address must mention the city OR a country/state token, not be a pure coordinate
      const addr = String(place?.address || "").trim();
      if (!addr) return false;
      return true;
    });
    const tagFiltered = __prefilterByExplicitTags(filtered, mode);
    // Store the FULL geo-filtered bank (pre-tagfilter) — preserves all 20 SerpAPI
    // results minus only the obvious out-of-city ones, so refill can mine deeper.
    __serpRequestCache.set(cacheKey, filtered);
    __serpRequestCanonicalCache.set(intentCacheKey, filtered);
    logSerpUsage({ query: finalQuery, city: cityToken, cacheHit: !!sharedHit, resultsCount: tagFiltered.length, context: `fetchSerpLocalResults bank=${filtered.length}` });
    // DIVERSITY MODE: tag every SERP-bank item so downstream code can report
    // bank-vs-fallback provenance and the runSalt rotation can deprioritise
    // previously-used IDs without losing the source signal.
    const tagged = __rotateBankByRecency(tagFiltered).map((p) => ({ ...p, __serpSource: "bank" as const }));
    return tagged;
  } catch {
    return [];
  }
}

async function buildDynamicCityData(destination: string, requestedCuisine: string | null, userInterests: string[] = []): Promise<CityData | null> {
  const serpKey = sanitizeKey(Deno.env.get("SERPAPI_KEY"));
  if (!serpKey) return null;

  const cuisine = requestedCuisine ? `${requestedCuisine} ` : "";
  const interestSet = buildSelectedInterestSet(userInterests, "");
  const fallbackPrefs = extractPreferences(userInterests, "", requestedCuisine ? [requestedCuisine] : []);
  // BALANCED COVERAGE: ensure each selected interest gets ≥1 query before any
  // single interest hogs the budget. We round-robin one query per interest, then
  // a second pass for the remaining synonyms — capped at 8 calls per city.
  const allSeeds = buildInterestSearchSeeds(destination, interestSet, fallbackPrefs);
  const balancedQueries = balanceSerpSeedsByInterest(allSeeds, interestSet, 8);
  const finalLandmarkQueries = balancedQueries.map((seed) => seed.query);

  const cuisineVariants = getCuisineSearchVariants(requestedCuisine, 2);
  const restaurantQueries = (["breakfast", "lunch", "dinner"] as const).flatMap((meal) => {
    if (cuisineVariants.length === 0) {
      return [{ type: meal, query: `best ${meal} restaurants in ${destination}` }];
    }
    return cuisineVariants.map((variant) => ({
      type: meal,
      query: `best ${variant} ${meal} restaurants in ${destination}`,
    }));
  });

  const [landmarkResults, restaurantResults] = await Promise.all([
    mapWithConcurrency(finalLandmarkQueries, 3, (q) => fetchSerpLocalResults(q, serpKey, destination, "activities")),
    mapWithConcurrency(restaurantQueries, 2, (q) => fetchSerpLocalResults(q.query, serpKey, destination, "restaurants")),
  ]);

  const landmarkMap = new Map<string, PlaceInfo>();
  landmarkResults.forEach((group, idx) => {
    const seed = balancedQueries[idx];
    const seedInterest = normalizeInterestTag(seed?.interestKey || "");
    const seedSet = seedInterest ? new Set([seedInterest]) : interestSet;
    group.forEach((p: any) => {
      const name = (p?.title || "").trim();
      if (!name) return;
      const lat = Number(p?.gps_coordinates?.latitude);
      const lng = Number(p?.gps_coordinates?.longitude);
      const category = mapSerpCategory(p);
      const candidateShape = {
        name,
        title: name,
        category,
        type: p?.type,
        types: Array.isArray(p?.types) ? p.types : [],
        description: `${p?.description || ""} ${p?.user_review || ""} ${Array.isArray(p?.extensions) ? JSON.stringify(p.extensions) : ""}`,
        address: p?.address || destination,
      };
      if (seedSet.size > 0 && !activityMatchesSelectedInterests(candidateShape, seedSet)) return;
      const key = String(p?.place_id || p?.data_id || p?.data_cid || name).toLowerCase();
      if (landmarkMap.has(key)) return;
      const mapsPayload = buildPlaceMapsPayload(name, p?.address || destination, destination, Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0, p?.place_id, p?.data_cid);
      landmarkMap.set(key, {
        name,
        nameAr: name,
        lat: Number.isFinite(lat) ? lat : 0,
        lng: Number.isFinite(lng) ? lng : 0,
        address: p?.address || destination,
        category,
        googleMapsUrl: mapsPayload.url,
        googleMapsCoordsUrl: buildCoordsMapsUrl(Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0),
        googleMapsLinkReason: mapsPayload.reason,
        placeId: p?.place_id,
        dataId: p?.data_id,
        dataCid: p?.data_cid,
        providerId: p?.provider_id,
        rating: p?.rating,
        imageUrl: extractPlaceImageUrl(p),
        placeTypes: Array.isArray(p?.types) ? p.types : undefined,
        placeType: p?.type,
        placeTypeId: p?.type_id,
        openingHours: extractPlaceOpeningHours(p),
        openState: p?.open_state || undefined,
        hours: typeof p?.hours === "string" ? p.hours : undefined,
        operating_hours: p?.operating_hours,
      });
    });
  });

  const restaurantMap = new Map<string, RestaurantInfo>();
  restaurantResults.forEach((group, idx) => {
    const mealType = restaurantQueries[idx].type;
    // When the search query contains the cuisine keyword, TRUST SerpAPI results
    // (the search itself filtered for that cuisine - don't double-filter)
    const queryHasCuisine = !!requestedCuisine;
    group.forEach((p: any) => {
      const name = (p?.title || "").trim();
      if (!name) return;
      // Cuisine preferences are strict: never accept a restaurant unless the stored
      // SerpAPI fields confirm the requested cuisine, even when the query included it.
      if (requestedCuisine) {
        const combinedRestaurantText = `${name} ${p?.address || ""} ${p?.type || ""} ${Array.isArray(p?.types) ? p.types.join(" ") : ""} ${p?.description || ""}`;
        if (!matchesRequestedCuisineText(combinedRestaurantText, requestedCuisine)) return;
      }
      const key = `${mealType}:${p?.place_id || p?.data_id || p?.data_cid || name.toLowerCase()}`;
      if (restaurantMap.has(key)) return;
      const lat = Number(p?.gps_coordinates?.latitude);
      const lng = Number(p?.gps_coordinates?.longitude);
      const detectedCuisine = String(p?.type || "").toLowerCase();
      const mapsPayload = buildPlaceMapsPayload(name, p?.address || destination, destination, Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0, p?.place_id, p?.data_cid);
      restaurantMap.set(key, {
        name,
        nameAr: name,
        lat: Number.isFinite(lat) ? lat : 0,
        lng: Number.isFinite(lng) ? lng : 0,
        address: p?.address || destination,
        type: mealType,
        cuisine: requestedCuisine || detectedCuisine || undefined,
        rating: Number(p?.rating) || undefined,
        phone: p?.phone,
        website: p?.website,
        openingHours: extractPlaceOpeningHours(p),
        imageUrl: extractPlaceImageUrl(p),
        googleMapsUrl: mapsPayload.url,
        googleMapsCoordsUrl: buildCoordsMapsUrl(Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0),
        googleMapsLinkReason: mapsPayload.reason,
        placeId: p?.place_id,
        dataId: p?.data_id,
        dataCid: p?.data_cid,
        providerId: p?.provider_id,
        placeTypes: Array.isArray(p?.types) ? p.types : undefined,
        placeType: p?.type,
        placeTypeId: p?.type_id,
        openState: p?.open_state || undefined,
        hours: typeof p?.hours === "string" ? p.hours : undefined,
        operating_hours: p?.operating_hours,
      });
    });
  });

  const landmarks = Array.from(landmarkMap.values()).slice(0, 18);
  const restaurants = Array.from(restaurantMap.values()).slice(0, 24);
  if (landmarks.length === 0) return null;
  console.log(`SerpAPI built city data: ${landmarks.length} landmarks, ${restaurants.length} restaurants (cuisine: ${requestedCuisine || 'any'}, interests: ${Array.from(interestSet).join(',') || 'general'})`);
  return { landmarks, restaurants };
}

const mealRestaurantSearchCache = new Map<string, Promise<RestaurantInfo | null>>();

function candidateNameVariants(candidate: any): string[] {
  return Array.from(new Set(
    [candidate?.nameAr, candidate?.name]
      .map((value) => normalizeForDedup(value))
      .filter(Boolean),
  ));
}

function candidateDedupKey(candidate: any): string {
  return activityDedupKey({
    name: candidate?.nameAr || candidate?.name,
    address: candidate?.address || candidate?.location,
    latitude: candidate?.latitude ?? candidate?.lat,
    longitude: candidate?.longitude ?? candidate?.lng,
    placeId: candidate?.placeId || candidate?.place_id,
    dataId: candidate?.dataId || candidate?.data_id,
    dataCid: candidate?.dataCid || candidate?.data_cid,
    providerId: candidate?.providerId || candidate?.provider_id,
  });
}

function isCandidateUnused(candidate: any, usedKeys: Set<string>, usedNames: Set<string>): boolean {
  const key = candidateDedupKey(candidate);
  if (key && usedKeys.has(key)) return false;
  return !candidateNameVariants(candidate).some((name) => usedNames.has(name));
}

function markCandidateUsed(candidate: any, usedKeys: Set<string>, usedNames: Set<string>) {
  const key = candidateDedupKey(candidate);
  if (key) usedKeys.add(key);
  candidateNameVariants(candidate).forEach((name) => usedNames.add(name));
}

function pickUniqueCandidate<T>(items: T[] = [], usedKeys: Set<string>, usedNames: Set<string>, startIndex = 0): T | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  // Shuffle candidates to avoid deterministic picks across regenerations
  const indices = Array.from({ length: items.length }, (_, i) => i);
  // Fisher-Yates shuffle seeded by startIndex + random
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  for (const idx of indices) {
    const candidate = items[idx] as any;
    if (candidate && isCandidateUnused(candidate, usedKeys, usedNames)) {
      return candidate as T;
    }
  }
  return null;
}

function buildMealMapsUrl(name: string, address: string, cityName: string, lat?: number, lng?: number, placeId?: string, dataCid?: string) {
  // Always prefer name+address so the URL opens the actual venue card,
  // regardless of UI language. Only fall back to lat/lng when there is no name.
  return buildPlaceMapsUrl(name, address, cityName, lat, lng, placeId, dataCid);
}

function isSpecificRestaurantCandidate(name: string, address: string, cityName: string) {
  if (!name) return false;
  // Address can be empty for some API results — don't require it
  const combined = `${name} ${address || ""}`.toLowerCase();
  if (/(museum|gallery|park|beach|mosque|church|temple|clinic|hospital|attraction|landmark|متحف|حديقة|شاطئ|مسجد|كنيسة|عيادة|مستشفى|معلم)/i.test(combined)) {
    return false;
  }
  return !looksGenericActivity({ name, address: address || cityName, category: "restaurant", description: "restaurant" }, cityName);
}

/**
 * STRICT ADDRESS PRECISION VALIDATOR.
 *
 * Rejects results whose address is just an island / district / city label
 * (e.g. "The Galleria Al Maryah Island, Abu Dhabi" or "Yas Island, Abu Dhabi"
 * or "Hamdan Street, Abu Dhabi" with no venue marker) — i.e. anything that
 * would NOT pin the user to the actual venue when opened in Google Maps.
 *
 * Requirements:
 *   1. Address contains a STREET / NUMBER / BUILDING / SUITE / FLOOR token,
 *      OR the venue NAME (or a meaningful token of it) appears inside the
 *      address itself (proves the address points at the venue, not the area).
 *   2. The address is not equal to (or a trivial subset of) just the city /
 *      island label.
 *
 * Returns { ok, reason } so callers can log WHY a candidate was rejected.
 */
function validatePreciseAddress(
  name: string,
  address: string,
  cityName: string,
): { ok: boolean; reason?: string } {
  const cleanName = String(name || "").trim();
  const cleanAddr = String(address || "").trim();
  if (!cleanName) return { ok: false, reason: "missing name" };
  if (!cleanAddr) return { ok: false, reason: "missing address" };

  const lowerAddr = cleanAddr.toLowerCase();
  const lowerCity = String(cityName || "").trim().toLowerCase();

  // Reject when address is literally just the city / area label.
  const trimmedAddr = lowerAddr.replace(/[,،.\s]+/g, " ").trim();
  if (lowerCity && (trimmedAddr === lowerCity || trimmedAddr === `${lowerCity}`)) {
    return { ok: false, reason: `address equals city "${cityName}"` };
  }

  // Generic-area-only patterns (island/district + city, no venue/street).
  // Examples: "Yas Island, Abu Dhabi", "The Galleria Al Maryah Island, Abu Dhabi"
  const onlyAreaAndCity = /^(the\s+)?[\w\s\-'\u0600-\u06FF]+(island|district|area|zone|quarter|neighborhood|neighbourhood|جزيرة|منطقة|حي)[\s,،]+[\w\s\-'\u0600-\u06FF]+$/i;

  // Strong precision signals: street numbers, street types, suites, floors,
  // building names, postcodes, named landmarks.
  const STREET_RE = /\b(\d{1,5}\s+\w|street|st\.?|road|rd\.?|ave\.?|avenue|blvd\.?|boulevard|lane|ln\.?|drive|dr\.?|way|highway|hwy|route|rte|plaza|square|terrace|court|circle|crescent|parkway|pkwy|suite|ste\.?|floor|fl\.?|level|lvl|building|bldg|tower|wing|gate|exit|km|p\.?o\.?\s*box|po\s*box|شارع|طريق|جادة|شار\.?|ميدان|دوار|برج|مبنى|عمارة|طابق|دور|بوابة)\b/i;
  // Numeric postcode / unit / kilometer markers
  const NUMERIC_RE = /\b\d{2,}\b/;

  const hasStreet = STREET_RE.test(lowerAddr) || NUMERIC_RE.test(lowerAddr);

  // Tokens of the venue name we expect inside the address. We strip very
  // generic tokens ("restaurant", "hotel", "the", "café" …) so a venue called
  // "Verso" still requires "verso" to appear in the address.
  const STOP_TOKENS = new Set([
    "the","a","an","of","at","in","on","de","la","el","by","for","and","or",
    "restaurant","cafe","café","bistro","grill","kitchen","bar","lounge","hotel",
    "resort","mall","plaza","center","centre","park","beach","museum","tower",
    "مطعم","مقهى","كافيه","فندق","منتجع","مول","مركز","حديقة","شاطئ","متحف","برج",
  ]);
  const nameTokens = cleanName
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));

  const venueInAddress = nameTokens.some((tok) => lowerAddr.includes(tok));

  if (onlyAreaAndCity.test(cleanAddr) && !venueInAddress && !hasStreet) {
    return { ok: false, reason: `address is generic area "${cleanAddr}"` };
  }
  if (!hasStreet && !venueInAddress) {
    return { ok: false, reason: `address lacks street/landmark and venue name: "${cleanAddr}"` };
  }

  return { ok: true };
}

function inferRequestedCuisine(...values: unknown[]): string | null {
  // Scan values IN ORDER and return the FIRST cuisine match. This guarantees
  // that an explicit user prompt (passed first) wins over background trip
  // preferences. Previously we joined all values and scanned once, which
  // caused background cuisinePreferences="indian" to override an explicit
  // user prompt like "مطعم صيني" because indian appeared earlier in the
  // pattern list.
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const found = extractPreferences([], text).requestedCuisine;
    if (found) return found;
  }
  return null;
}

function inferMealTypeFromCategory(category: string): "breakfast" | "lunch" | "dinner" {
  const lower = String(category || "").toLowerCase();
  if (/(breakfast|فطور)/i.test(lower)) return "breakfast";
  if (/(dinner|عشاء)/i.test(lower)) return "dinner";
  return "lunch";
}

function inferRequestedActivitySubtype(activity: any): string {
  const combined = `${activity?.category || ""} ${activity?.type || ""} ${activity?.name || activity?.title || ""} ${activity?.description || ""} ${activity?.matchReason || ""}`.toLowerCase();
  // Hotel/accommodation detection — multi-language (en/ar/es/fr/de/ur/zh/ru)
  if (/(hotel|hôtel|otel|resort|motel|hostel|inn|lodge|guest\s*house|guesthouse|bed\s*and\s*breakfast|b&b|accommodation|stay|booking|فندق|فنادق|منتجع|نزل|اقامة|إقامة|سكن|مبيت|hotel|hotell|отель|гостиниц|酒店|宾馆|住宿|ہوٹل|رہائش|قیام|unterkunft|aufenthalt)/i.test(combined)) return "hotel";
  if (/(breakfast|فطور|إفطار|افطار|desayuno|petit\s*déjeuner|frühstück|早餐|завтрак|صبحانه|ناشتا)/i.test(combined)) return "breakfast";
  if (/(dinner|عشاء|cena|dîner|abendessen|晚餐|ужин|رات\s*کا\s*کھانا)/i.test(combined)) return "dinner";
  if (/(lunch|غداء|almuerzo|déjeuner|mittagessen|午餐|обед|دوپہر\s*کا\s*کھانا)/i.test(combined)) return "lunch";
  if (/(cafe|café|coffee|مقهى|كوفي|cafetería|kaffee|咖啡|кафе|кофейн|قہوہ)/i.test(combined)) return "cafe";
  if (/(restaurant|food|meal|مطعم|مطاعم|بيتزا|italian|japanese|indian|burger|steak|seafood|sushi|pasta|restaurante|comida|cocina|essen|küche|餐厅|美食|ресторан|еда|кухня|کھانا|食物)/i.test(combined)) return "restaurant";
  if (/(football|soccer|basketball|tennis|golf|stadium|arena|match|sports?|كرة\s*ال?قدم|كره\s*ال?قدم|كورة|كوره|كرة سلة|تنس|جولف|ملعب|مباراة|رياض)/i.test(combined)) return "sports";
  if (/(walk|stroll|promenade|corniche|outskirts|suburb|suburbs|neighborhood|scenic walk|مشي|تجول|جولة|كورنيش|ضواحي|أطراف)/i.test(combined)) return "walk";
  if (/(museum|gallery|exhibit|متحف|معرض)/i.test(combined)) return "museum";
  if (/(beach|شاطئ|coast|seaside|sea|snorkel|diving|island|marina|سباحة|غوص|جزيرة|بحر)/i.test(combined)) return "beach";
  if (/(park|garden|trail|mountain|forest|lake|nature|حديقة|طبيعة|جبل|بحيرة)/i.test(combined)) return "nature";
  if (/(mall|market|bazaar|souq|shopping|سوق|مول|بازار|تسوق)/i.test(combined)) return "shopping";
  if (/(historic|history|cultural|temple|mosque|church|palace|fort|castle|heritage|ثقاف|تاريخ|مسجد|كنيسة|قصر|قلعة)/i.test(combined)) return "cultural";
  if (/(entertainment|show|theater|cinema|concert|theme park|arcade|music venue|comedy club|immersive|entertainment district|l\.?a\.?\s*live|texas live|\blive\b|ترفيه|مسرح|سينما|حفلة|موسيقى)/i.test(combined)) return "entertainment";
  if (/(activity|tour|boat|cruise|adventure|جولة|نشاط|مغامر|رحلة)/i.test(combined)) return "activity";
  return String(activity?.category || activity?.type || "attraction").toLowerCase() || "attraction";
}

function activityMatchesRequestedSubtype(activity: any, requestedSubtype: string): boolean {
  const combined = `${activity?.category || ""} ${activity?.type || ""} ${getActivityName(activity)} ${activity?.matchReason || ""} ${activity?.address || activity?.location || ""}`.toLowerCase();
  const mappedCategory = mapSerpCategory({
    type: `${activity?.category || ""} ${activity?.type || ""}`,
    types: Array.isArray(activity?.types) ? activity.types : [],
    title: `${getActivityName(activity)}`,
  });

  if (isInvalidActivityResult(activity)) return false;

  switch (requestedSubtype) {
    case "hotel":
      return /(hotel|hôtel|otel|resort|motel|hostel|inn|lodge|guest\s*house|accommodation|stay|فندق|منتجع|نزل|اقامة|إقامة|酒店|宾馆|住宿|отель|гостиниц|ہوٹل|رہائش|unterkunft)/i.test(combined);
    case "breakfast":
      return /(breakfast|فطور|bakery|cafe|café|coffee|مقهى)/i.test(combined);
    case "lunch":
      return /(lunch|غداء|restaurant|food|meal|مطعم|cuisine)/i.test(combined);
    case "dinner":
      return /(dinner|عشاء|restaurant|food|meal|مطعم|fine dining|steak|seafood)/i.test(combined);
    case "cafe":
      return /(cafe|café|coffee|مقهى|كوفي|espresso)/i.test(combined);
    case "restaurant":
      return /(restaurant|food|meal|مطعم|cuisine|eatery|bistro|grill|pizzeria|pizza|sushi|burger|steak|pasta)/i.test(combined)
        && !/(museum|gallery|park|beach|mosque|church|clinic|hospital|متحف|حديقة|شاطئ|عيادة|مستشفى)/i.test(combined);
    case "sports":
      return /(sport|stadium|arena|football|soccer|basketball|tennis|golf|club|match|tour|كرة\s*ال?قدم|كره\s*ال?قدم|كورة|كوره|رياض|ملعب|مباراة|نادي)/i.test(combined);
    case "walk":
      return mappedCategory === "nature" || mappedCategory === "activity" || /(walk|stroll|promenade|corniche|trail|outskirts|suburb|neighborhood|scenic|جولة|مشي|كورنيش|ضواحي|أطراف)/i.test(combined);
    case "museum":
      return /(museum|gallery|exhibit|متحف|معرض)/i.test(combined);
    case "beach":
      return /(beach|شاطئ|coast|seaside|sea|snorkel|diving|island|marina|سباحة|غوص|جزيرة|بحر)/i.test(combined);
    case "nature":
      return mappedCategory === "nature" || /(park|garden|trail|mountain|forest|lake|nature|حديقة|طبيعة|جبل|بحيرة)/i.test(combined);
    case "shopping":
      return mappedCategory === "shopping" || /(mall|market|bazaar|souq|shopping|سوق|مول|بازار|تسوق)/i.test(combined);
    case "cultural":
      return mappedCategory === "cultural" || /(historic|history|cultural|temple|mosque|church|palace|fort|castle|heritage|ثقاف|تاريخ|مسجد|كنيسة|قصر|قلعة)/i.test(combined);
    case "entertainment":
      return mappedCategory === "entertainment" || /(entertainment|show|theater|cinema|concert|theme park|arcade|music venue|comedy club|immersive|entertainment district|l\.?a\.?\s*live|texas live|\blive\b|ترفيه|مسرح|سينما|حفلة|موسيقى)/i.test(combined);
    case "activity":
      return mappedCategory === "activity" || /(activity|tour|boat|cruise|adventure|جولة|نشاط|مغامر|رحلة)/i.test(combined);
    default:
      return mappedCategory === requestedSubtype || !/(restaurant|food|meal|مطعم|clinic|hospital|عيادة|مستشفى)/i.test(combined);
  }
}

function buildStrictReplacementRule(requestedSubtype: string, destination: string, categoryHint: string, inferredCuisine?: string | null): string {
  switch (requestedSubtype) {
    case "hotel":
      return `CRITICAL: The replacement MUST be a REAL hotel, resort, lodge, hostel or accommodation in ${destination}. Do NOT suggest restaurants, museums, parks, attractions, or any non-lodging place.`;
    case "restaurant":
    case "lunch":
    case "dinner":
    case "breakfast":
      return `CRITICAL: The replacement MUST be a REAL ${requestedSubtype === "restaurant" ? "restaurant or food place" : requestedSubtype} place in ${destination}. Do NOT suggest museums, attractions, parks, clinics, hospitals, or any non-food place.${inferredCuisine ? ` It MUST specifically match ${inferredCuisine} cuisine or be clearly described as ${inferredCuisine}.` : ""}`;
    case "cafe":
      return `CRITICAL: The replacement MUST be a REAL cafe or coffee place in ${destination}. Do NOT suggest restaurants, museums, parks, or generic attractions.`;
    case "museum":
      return `CRITICAL: The replacement MUST be a REAL museum or gallery in ${destination}. Do NOT suggest restaurants, beaches, parks, shopping, or generic attractions.`;
    case "beach":
      return `CRITICAL: The replacement MUST be a REAL beach or seaside/water activity in ${destination}. Do NOT suggest museums, restaurants, malls, or generic landmarks.`;
    case "shopping":
      return `CRITICAL: The replacement MUST be a REAL shopping place in ${destination} such as a mall, market, bazaar, or souq. Do NOT suggest museums, beaches, or restaurants.`;
    case "nature":
      return `CRITICAL: The replacement MUST be a REAL nature place in ${destination} such as a park, garden, trail, island, or mountain viewpoint. Do NOT suggest restaurants, museums, or shopping.`;
    case "cultural":
      return `CRITICAL: The replacement MUST be a REAL cultural or historical place in ${destination}. Do NOT suggest restaurants, beaches, malls, or generic activities.`;
    case "entertainment":
      return `CRITICAL: The replacement MUST be a REAL entertainment venue or experience in ${destination}. Do NOT suggest restaurants, museums, beaches, or shopping.`;
    case "activity":
      return `CRITICAL: The replacement MUST be a REAL activity or tour in ${destination}. Do NOT suggest restaurants, museums, or generic attractions.`;
    default:
      return `The replacement must be the same type as the original (${categoryHint}) in ${destination}.`;
  }
}

function buildSubtypeSearchQuery(requestedSubtype: string, cityName: string, tripTypeHint = "") {
  const base = requestedSubtype === "hotel"
    ? `top rated hotel resort or accommodation in ${cityName}`
    : requestedSubtype === "museum"
    ? `real museum or gallery in ${cityName}`
    : requestedSubtype === "sports"
      ? `real football stadium sports venue or match experience in ${cityName}`
      : requestedSubtype === "walk"
        ? `real scenic walk promenade outskirts or neighborhood experience in ${cityName}`
    : requestedSubtype === "beach"
      ? `real beach or waterfront place in ${cityName}`
      : requestedSubtype === "shopping"
        ? `real mall market or souq in ${cityName}`
        : requestedSubtype === "cultural"
          ? `real cultural historical site in ${cityName}`
          : requestedSubtype === "nature"
            ? `real park garden trail or viewpoint in ${cityName}`
            : requestedSubtype === "entertainment"
              ? `real entertainment venue, live district, music venue, show place or theme park in ${cityName}`
              : requestedSubtype === "activity"
                ? `real tour or activity venue in ${cityName}`
                : requestedSubtype === "breakfast"
                  ? `real breakfast cafe or restaurant in ${cityName}`
                  : requestedSubtype === "lunch"
                    ? `real lunch restaurant in ${cityName}`
                    : requestedSubtype === "dinner"
                      ? `real dinner restaurant in ${cityName}`
                      : requestedSubtype === "cafe"
                        ? `real cafe or coffee shop in ${cityName}`
                        : requestedSubtype === "restaurant"
                          ? `real restaurant in ${cityName}`
                          : `real specific attraction in ${cityName}`;

  return `${tripTypeHint} ${base}`.trim();
}

function looksOutOfCityContext(activity: any, cityContext: string): boolean {
  if (!cityContext) return false;
  const cityNorm = normalizeForDedup(cityContext);
  const cityAliases = cityNorm ? [cityNorm] : [];
  const ck = getCityKey(cityContext);
  if (ck) cityAliases.push(normalizeForDedup(ck));
  
  // Add common name variants for the city
  const cityLower = cityContext.toLowerCase().trim();
  const cityFirstWord = cityLower.split(/[,،\s-]+/)[0];
  if (cityFirstWord && cityFirstWord.length > 2) cityAliases.push(normalizeForDedup(cityFirstWord));

  const actAddress = normalizeForDedup(activity?.address);
  const actName = normalizeForDedup(getActivityName(activity));
  const combined = `${actName} ${actAddress}`.trim();
  if (!combined) return false;
  if (cityAliases.some((alias) => alias && combined.includes(alias))) return false;

  // Check against ALL known city names (not just CITY_PLACES keys but also display names)
  const KNOWN_CITY_NAMES = [
    "dubai", "دبي", "abu dhabi", "أبوظبي", "riyadh", "الرياض", "jeddah", "جدة",
    "istanbul", "اسطنبول", "cairo", "القاهرة", "paris", "باريس", "london", "لندن",
    "doha", "الدوحة", "bangkok", "بانكوك", "tokyo", "طوكيو", "rome", "روما",
    "barcelona", "برشلونة", "amman", "عمّان", "makkah", "مكة", "kuala lumpur",
    "manama", "المنامة", "muscat", "مسقط", "kuwait", "الكويت", "berlin", "برلين",
    "munich", "ميونخ", "marrakech", "مراكش", "new york", "نيويورك",
    "east rutherford", "orlando", "monterrey",
  ];
  
  const otherCityNames = KNOWN_CITY_NAMES.filter((name) => !cityAliases.includes(normalizeForDedup(name)));
  const otherCityKeys = Object.keys(CITY_PLACES).filter((key) => key !== ck);
  const allOtherNames = [...new Set([...otherCityKeys.map(normalizeForDedup), ...otherCityNames.map(normalizeForDedup)])].filter(Boolean);
  
  return allOtherNames.some((otherNorm) => Boolean(otherNorm) && otherNorm.length > 2 && combined.includes(otherNorm));
}

function buildMealActivityFromRestaurant(
  restaurant: RestaurantInfo,
  meal: "breakfast" | "lunch" | "dinner" | "snack",
  dayNum: number,
  cityName: string,
  timeHour: number,
  startHour: number,
  endHour: number,
) {
  const displayName = restaurant.nameAr || restaurant.name;
  return {
    id: `d${dayNum}-required-${meal}`,
    name: displayName,
    description: restaurant.name && restaurant.name !== displayName
      ? `${displayName} (${restaurant.name})`
      : displayName,
    category: meal,
    time: formatTime(Math.max(startHour, Math.min(endHour, timeHour))),
    duration: meal === "breakfast" ? "1 hour" : "1.5 hours",
    address: restaurant.address || cityName,
    latitude: restaurant.lat,
    longitude: restaurant.lng,
    cost: meal === "dinner" ? 40 : meal === "lunch" ? 30 : 20,
    rating: restaurant.rating || 4.5,
    openingHours: restaurant.openingHours,
    openState: restaurant.openState,
    phone: restaurant.phone,
    website: restaurant.website,
    imageUrl: restaurant.imageUrl,
    googleMapsUrl: restaurant.googleMapsUrl || buildMealMapsUrl(displayName, restaurant.address || cityName, cityName, restaurant.lat, restaurant.lng),
    googleMapsCoordsUrl: restaurant.googleMapsCoordsUrl || buildCoordsMapsUrl(restaurant.lat, restaurant.lng),
    googleMapsLinkReason: restaurant.googleMapsLinkReason || getGoogleMapsLinkReason(restaurant.placeId, restaurant.dataCid, restaurant.lat, restaurant.lng),
    placeId: restaurant.placeId,
    dataId: restaurant.dataId,
    dataCid: restaurant.dataCid,
    providerId: restaurant.providerId,
    enriched: true,
  };
}

async function searchSpecificMealRestaurant(
  meal: "breakfast" | "lunch" | "dinner" | "snack",
  cityName: string,
  cuisine?: string | null,
  excludeNames: string[] = [],
  excludeKeys: string[] = [],
): Promise<RestaurantInfo | null> {
  const exclusionSignature = excludeNames
    .map((name) => normalizeForDedup(name))
    .filter(Boolean)
    .sort()
    .slice(0, 40)
    .join("|");
  const exclusionKeySignature = (excludeKeys || [])
    .filter(Boolean)
    .sort()
    .slice(0, 40)
    .join("|");
  const cacheKey = `${meal}|${cityName.toLowerCase()}|${String(cuisine || "").toLowerCase()}|${exclusionSignature}|${exclusionKeySignature}`;
  if (!mealRestaurantSearchCache.has(cacheKey)) {
    mealRestaurantSearchCache.set(cacheKey, (async () => {
      const excluded = new Set(excludeNames.map((name) => normalizeForDedup(name)));
      const excludedKeys = new Set((excludeKeys || []).filter(Boolean));
      const serpKey = sanitizeKey(Deno.env.get("SERPAPI_KEY"));
      const serperKey = sanitizeKey(Deno.env.get("SERPER_API_KEY"));
      // Queries with cuisine keyword come first — we TRUST SerpAPI results for these.
      // Use the synonym variants table so e.g. "italian" also searches for
      // "pasta restaurant", "trattoria"; "halal" also searches for "halal restaurant"; etc.
      // CREDIT-SAVING: we issue queries ONE AT A TIME and stop as soon as we
      // get a viable match. Variants are only tried when the previous query
      // returned ZERO usable results, so we never burn SerpAPI quota on
      // duplicate searches that already succeeded.
      const cuisineVariantList = getCuisineSearchVariants(cuisine || null, 2);
      const mealQueryPhrases = meal === "breakfast"
        ? {
            primary: ["breakfast cafe", "brunch cafe", "breakfast spot"],
            generic: ["breakfast cafe", "breakfast place", "brunch cafe"],
          }
        : meal === "lunch"
          ? {
              primary: ["lunch restaurant", "restaurant", "lunch spot"],
              generic: ["lunch restaurant", "restaurant"],
            }
          : meal === "dinner"
            ? {
                primary: ["dinner restaurant", "restaurant", "dinner spot"],
                generic: ["dinner restaurant", "restaurant"],
              }
            : {
                primary: ["snack shop", "cafe", "bakery"],
                generic: ["snack shop", "cafe", "bakery"],
              };

      const cuisineQueries = cuisineVariantList.length > 0
        ? mealQueryPhrases.primary.flatMap((phrase) => [
            ...cuisineVariantList.map((variant) => `best ${variant} ${phrase} in ${cityName}`),
            ...cuisineVariantList.map((variant) => `${variant} ${phrase} in ${cityName}`),
          ])
        : [];
      const genericQueries = mealQueryPhrases.generic.flatMap((phrase) => [
        `best ${phrase} in ${cityName}`,
        `${phrase} in ${cityName}`,
      ]);

      // Strict dietary preferences (halal, vegan, kosher, vegetarian, gluten-free)
      // MUST be confirmed in candidate text — we never blindly trust SerpAPI ranking.
      const strictDietary = isStrictDietaryCuisine(cuisine);

      // STRICT VALIDATOR: blocks generic/empty meal results.
      // Requires: real specific name, valid coordinates, place_id (so we can pin
      // an exact map link) AND either opening hours present OR fetchable details.
      const isValidMealRestaurant = (r: RestaurantInfo | null, placeId: unknown): r is RestaurantInfo => {
        if (!r) return false;
        if (!r.name || r.name.trim().length < 2) return false;
        // Reject generic names like "Restaurant", "Cafe", "Breakfast Place"
        const genericNameRe = /^(restaurant|cafe|caf[eé]|diner|breakfast|lunch|dinner|food|eatery|bistro|kitchen|مطعم|مقهى|كافيه|فطور|غداء|عشاء)\s*\.?$/i;
        if (genericNameRe.test(r.name.trim())) return false;
        // Must have real coordinates (not 0,0)
        if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng) || (r.lat === 0 && r.lng === 0)) return false;
        // Must have a usable map link — either a place_id-pinned URL or a coords-pinned URL
        const hasPinnedMap = typeof r.googleMapsUrl === "string"
          && r.googleMapsUrl.length > 0
          && r.googleMapsUrl !== "#"
          && (/query_place_id=/i.test(r.googleMapsUrl) || /[?&]center=-?\d/i.test(r.googleMapsUrl) || /\/maps\/place\//i.test(r.googleMapsUrl));
        if (!hasPinnedMap && !placeId) return false;
        // Must have an address OR a place_id we can resolve later
        if ((!r.address || r.address.trim().length < 3) && !placeId) return false;
        // STRICT ADDRESS PRECISION: reject results whose address is just an
        // island/area/city label (e.g. "Yas Island, Abu Dhabi") OR whose
        // address does not include the venue name nor a street/landmark
        // marker. This is the gate that prevents results like
        // "Breakfast at Verso → The Galleria Al Maryah Island, Abu Dhabi"
        // from passing through with a misleading map link.
        const precise = validatePreciseAddress(r.name, r.address || "", cityName);
        if (!precise.ok) {
          console.log(`[address-precision] Rejected meal "${r.name}" — ${precise.reason}`);
          return false;
        }
        return true;
      };

      const toRestaurant = (place: any, source: "serpapi" | "serper", trustCuisine: boolean): RestaurantInfo | null => {
        const name = String(source === "serpapi" ? place?.title : place?.title || place?.name || "").trim();
        const address = String(source === "serpapi" ? place?.address : place?.address || "").trim();
        const lat = Number(source === "serpapi" ? place?.gps_coordinates?.latitude : place?.latitude);
        const lng = Number(source === "serpapi" ? place?.gps_coordinates?.longitude : place?.longitude);
        const normalized = normalizeForDedup(name);
        const dedupKey = candidateDedupKey({ name, address, lat, lng });
        if (!name || excluded.has(normalized) || excludedKeys.has(dedupKey) || !isSpecificRestaurantCandidate(name, address, cityName)) return null;
        if (looksOutOfCityContext({ name, address, latitude: lat, longitude: lng, category: meal }, cityName)) return null;
        // STRICT MEAL-PERIOD MATCHING: reject candidates clearly tagged for a
        // different meal period (e.g. a breakfast-only café returned for dinner).
        const mealSlotText = `${name} ${address} ${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""} ${place?.description || ""}`;
        if (candidateConflictsWithMealSlot(mealSlotText, meal)) {
          console.log(`[meal-slot guard] Rejected "${name}" — conflicts with ${meal} slot`);
          return null;
        }
        // STRICT MATCHING: For dietary preferences (halal/vegan/etc.) we ALWAYS
        // require the candidate text to mention the cuisine, even when the
        // search query targeted it. For non-dietary cuisines we trust the query.
        if (cuisine) {
          const combinedText = `${name} ${address} ${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""} ${place?.description || ""}`;
          if (!matchesRequestedCuisineText(combinedText, cuisine)) return null;
        }
        const placeIdRaw = source === "serpapi" ? place?.place_id : place?.placeId;
        const mapsPayload = buildPlaceMapsPayload(
          name,
          address,
          cityName,
          Number.isFinite(lat) ? lat : 0,
          Number.isFinite(lng) ? lng : 0,
          placeIdRaw,
          source === "serpapi" ? place?.data_cid : place?.dataCid,
        );
        const candidate: RestaurantInfo = {
          name,
          nameAr: name,
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lng) ? lng : 0,
          address,
          type: meal,
          cuisine: cuisine || undefined,
          rating: Number(source === "serpapi" ? place?.rating : place?.rating) || 4.4,
          phone: source === "serpapi" ? place?.phone : place?.phoneNumber,
          website: place?.website,
          openingHours: extractPlaceOpeningHours(source === "serpapi" ? place : {
            openingHours: place?.openingHours,
            currentOpeningHours: place?.currentOpeningHours,
            hours: place?.hours,
          }),
          imageUrl: extractPlaceImageUrl(place),
          googleMapsUrl: mapsPayload.url,
          googleMapsCoordsUrl: buildCoordsMapsUrl(Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0),
          googleMapsLinkReason: mapsPayload.reason,
          placeId: placeIdRaw,
          dataId: source === "serpapi" ? place?.data_id : place?.dataId,
          dataCid: source === "serpapi" ? place?.data_cid : place?.dataCid,
          providerId: source === "serpapi" ? place?.provider_id : place?.providerId,
          placeTypes: Array.isArray(place?.types) ? place.types : undefined,
          openState: place?.open_state || place?.openState || undefined,
        };
        if (!isValidMealRestaurant(candidate, placeIdRaw)) {
          console.log(`[meal-validator] Rejected "${name || "(no name)"}" — missing pinned map / coords / specific name`);
          return null;
        }
        return candidate;
      };

      // Phase 1: Cuisine-specific queries — PARALLEL prefetch to avoid 504 timeouts.
      // Previously we issued ~18 queries one-at-a-time, each requiring a DB cache
      // round-trip even on HIT (~30-80ms each = 2-5s pure overhead per meal).
      // Now we Promise.all the SerpAPI lookups (cache HITs are free, live calls
      // share the existing per-key dedup), then iterate the resolved buckets in
      // priority order. Result: same credit usage, ~10x faster wall time.
      const serpBuckets: Array<{ query: string; places: any[] }> = serpKey
        ? await mapWithConcurrency(cuisineQueries.slice(0, 6), 2, async (query) => ({
            query,
            places: await fetchSerpLocalResults(query, serpKey, cityName, "restaurants").catch(() => []),
          }))
        : [];

      for (let qi = 0; qi < Math.min(cuisineQueries.length, serpBuckets.length); qi++) {
        const query = cuisineQueries[qi];
        if (serpKey) {
          const serpPlaces = serpBuckets[qi]?.places || [];
          // Pass A — strict cuisine confirmation in candidate text
          for (const place of serpPlaces) {
            const combinedText = `${place?.title || ""} ${place?.address || ""} ${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""}`;
            if (!matchesRequestedCuisineText(combinedText, cuisine!)) continue;
            const restaurant = toRestaurant(place, "serpapi", true);
            if (restaurant) {
              if (!restaurant.openingHours && restaurant.placeId) {
                try {
                  const details = await fetchSerpPlaceDetails(restaurant.placeId, serpKey);
                  const formatted = extractPlaceOpeningHours(details);
                  if (formatted) restaurant.openingHours = formatted;
                  if (!restaurant.phone && details?.phone) restaurant.phone = details.phone;
                  if (!restaurant.imageUrl) restaurant.imageUrl = extractPlaceImageUrl(details);
                } catch { /* noop */ }
              }
              console.log(`Found ${cuisine} restaurant via SerpAPI [confirmed]: ${restaurant.name} (hours=${restaurant.openingHours ? "yes" : "no"})`);
              return restaurant;
            }
          }
          // No blind trusted pass for cuisine requests: every accepted place must
          // confirm the requested cuisine in stored SerpAPI fields.
          // SerpAPI returned data but nothing matched — only fall through to Serper
          // if SerpAPI gave us literally zero places (avoid double-spending).
          if (serpPlaces.length > 0) continue;
        }

        if (serperKey) {
          for (const endpoint of ["https://google.serper.dev/maps", "https://google.serper.dev/places"]) {
            try {
              const resp = await fetch(endpoint, {
                method: "POST",
                headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
                body: JSON.stringify({ q: query }),
              });
              if (!resp.ok) continue;
              const data = await resp.json();
              const places = data?.places || [];
              // Pass A — confirmed
              for (const place of places) {
                const combinedText = `${place?.title || place?.name || ""} ${place?.address || ""} ${place?.type || ""} ${Array.isArray(place?.types) ? place.types.join(" ") : ""}`;
                if (!matchesRequestedCuisineText(combinedText, cuisine!)) continue;
                const restaurant = toRestaurant(place, "serper", true);
                if (restaurant) {
                  console.log(`Found ${cuisine} restaurant via Serper [confirmed]: ${restaurant.name}`);
                  return restaurant;
                }
              }
              // No blind trusted pass for cuisine requests.
              // If Serper returned places, stop probing this query — move to next variant
              if (places.length > 0) break;
            } catch {
              // noop
            }
          }
        }
      }

      // Phase 2: generic fallback is only allowed when there is NO cuisine preference.
      // If a cuisine was requested, returning a generic restaurant is worse than returning null.
      if (cuisine) {
        console.log(`No confirmed ${cuisine} ${meal} restaurant found in ${cityName}; skipping generic fallback`);
        return null;
      }

      const genericSerpBuckets: Array<{ query: string; places: any[] }> = serpKey
        ? await mapWithConcurrency(genericQueries.slice(0, 3), 2, async (query) => ({
            query,
            places: await fetchSerpLocalResults(query, serpKey, cityName, "restaurants").catch(() => []),
          }))
        : [];

      for (let qi = 0; qi < Math.min(genericQueries.length, genericSerpBuckets.length); qi++) {
        const query = genericQueries[qi];
        if (serpKey) {
          const serpPlaces = genericSerpBuckets[qi]?.places || [];
          for (const place of serpPlaces) {
            const restaurant = toRestaurant(place, "serpapi", true);
            if (restaurant) {
              if (!restaurant.openingHours && restaurant.placeId) {
                try {
                  const details = await fetchSerpPlaceDetails(restaurant.placeId, serpKey);
                  const formatted = extractPlaceOpeningHours(details);
                  if (formatted) restaurant.openingHours = formatted;
                  if (!restaurant.phone && details?.phone) restaurant.phone = details.phone;
                  if (!restaurant.imageUrl) restaurant.imageUrl = extractPlaceImageUrl(details);
                } catch { /* noop */ }
              }
              if (cuisine) console.log(`Cuisine fallback for ${meal} in ${cityName}: ${restaurant.name}`);
              return restaurant;
            }
          }
          // SerpAPI gave results but nothing usable — don't double-spend on Serper for the same query
          if (serpPlaces.length > 0) continue;
        }

        if (serperKey) {
          for (const endpoint of ["https://google.serper.dev/maps", "https://google.serper.dev/places"]) {
            try {
              const resp = await fetch(endpoint, {
                method: "POST",
                headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
                body: JSON.stringify({ q: query }),
              });
              if (!resp.ok) continue;
              const data = await resp.json();
              const places = data?.places || [];
              for (const place of places) {
                const restaurant = toRestaurant(place, "serper", true);
                if (restaurant) {
                  if (cuisine) console.log(`Cuisine fallback for ${meal} in ${cityName}: ${restaurant.name}`);
                  return restaurant;
                }
              }
              if (places.length > 0) break;
            } catch {
              // noop
            }
          }
        }
      }

      console.log(`No ${cuisine || ""} ${meal} restaurant found for ${cityName}`);
      return null;
    })());
  }

  return await mealRestaurantSearchCache.get(cacheKey)!;
}

function pickCuratedMealRestaurant(
  meal: "breakfast" | "lunch" | "dinner",
  cityName: string,
  cuisine: string | null | undefined,
  excludeNames: string[] = [],
  seed = 0,
): RestaurantInfo | null {
  const cityKey = getCityKey(cityName);
  const curatedRestaurants = cityKey ? CITY_PLACES[cityKey]?.restaurants || [] : [];
  if (!curatedRestaurants.length) return null;

  const excluded = new Set(excludeNames.map((name) => normalizeForDedup(name)).filter(Boolean));
  const requestedCuisine = String(cuisine || "").toLowerCase().trim();
  const pickRotated = (items: RestaurantInfo[]) => items.length ? items[((seed % items.length) + items.length) % items.length] : null;

  const mealMatches = curatedRestaurants.filter((restaurant) => restaurant.type === meal);
  const cuisineMatches = requestedCuisine
    ? mealMatches.filter((restaurant) => matchesRequestedCuisineText(`${restaurant.name} ${restaurant.address} ${restaurant.cuisine || ""}`, requestedCuisine))
    : mealMatches;
  const allCuisineMatches = requestedCuisine
    ? curatedRestaurants.filter((restaurant) => matchesRequestedCuisineText(`${restaurant.name} ${restaurant.address} ${restaurant.cuisine || ""}`, requestedCuisine))
    : curatedRestaurants;

  const unseenCuisineMatches = cuisineMatches.filter((restaurant) => !excluded.has(normalizeForDedup(restaurant.nameAr || restaurant.name)));
  if (unseenCuisineMatches.length) return pickRotated(unseenCuisineMatches);

  const unseenAllCuisineMatches = allCuisineMatches.filter((restaurant) => !excluded.has(normalizeForDedup(restaurant.nameAr || restaurant.name)));
  if (unseenAllCuisineMatches.length) return pickRotated(unseenAllCuisineMatches);

  // STRICT: when a cuisine was explicitly requested by the user, NEVER fall back
  // to a restaurant of a different cuisine — returning null is better than mismatching
  // (e.g. serving "indian" when the user asked for "fast-food").
  if (requestedCuisine) {
    if (cuisineMatches.length) return pickRotated(cuisineMatches);
    if (allCuisineMatches.length) return pickRotated(allCuisineMatches);
    return null;
  }

  const unseenMealMatches = mealMatches.filter((restaurant) => !excluded.has(normalizeForDedup(restaurant.nameAr || restaurant.name)));
  if (unseenMealMatches.length) return pickRotated(unseenMealMatches);

  const unseenAnyRestaurant = curatedRestaurants.filter((restaurant) => !excluded.has(normalizeForDedup(restaurant.nameAr || restaurant.name)));
  if (unseenAnyRestaurant.length) return pickRotated(unseenAnyRestaurant);

  if (mealMatches.length) return pickRotated(mealMatches);
  if (curatedRestaurants.length) return pickRotated(curatedRestaurants);
  return null;
}

async function resolveRequiredMealRestaurant(
  meal: "breakfast" | "lunch" | "dinner",
  cityName: string,
  cuisine: string | null | undefined,
  strictExcludeNames: string[] = [],
  relaxedExcludeNames: string[] = [],
  excludeKeys: string[] = [],
  seed = 0,
): Promise<RestaurantInfo | null> {
  const requestedCuisine = String(cuisine || "").trim() || null;

  if (requestedCuisine) {
    // STRICT: When a cuisine is explicitly requested, keep trying cuisine-specific lookups
    // BEFORE falling back to generic restaurants. Only use generic as a last resort to avoid
    // breaking the plan, and prefer curated cuisine matches over arbitrary generic ones.
    const exact = await searchSpecificMealRestaurant(meal, cityName, requestedCuisine, strictExcludeNames, excludeKeys);
    if (exact) return exact;

    const relaxedExact = await searchSpecificMealRestaurant(meal, cityName, requestedCuisine, relaxedExcludeNames, []);
    if (relaxedExact) return relaxedExact;

    // Try curated cuisine matches before falling back to generic restaurants
    const curatedCuisine = pickCuratedMealRestaurant(meal, cityName, requestedCuisine, relaxedExcludeNames, seed);
    if (curatedCuisine) return curatedCuisine;

    console.log(`No strict ${requestedCuisine} match found for ${meal} in ${cityName}; refusing generic fallback`);
    return null;
  }

  const generic = await searchSpecificMealRestaurant(meal, cityName, null, strictExcludeNames, excludeKeys);
  if (generic) return generic;

  const relaxedGeneric = await searchSpecificMealRestaurant(meal, cityName, null, relaxedExcludeNames, []);
  if (relaxedGeneric) return relaxedGeneric;

  return pickCuratedMealRestaurant(meal, cityName, null, relaxedExcludeNames, seed);
}

function isCuisineMealSlotCompatible(
  cuisineValue: string | null | undefined,
  meal: "breakfast" | "lunch" | "dinner" | "snack",
): boolean {
  const normalized = normalizeCuisineTag(cuisineValue);
  if (!normalized) return true;
  if (meal === "breakfast") {
    return !["seafood", "grill", "fine-dining", "fast-food", "food-truck"].includes(normalized);
  }
  return true;
}

function getMealCuisineCandidates(
  requestedCuisines: string[] = [],
  dayIndex: number,
  meal: "breakfast" | "lunch" | "dinner" | "snack",
): string[] {
  const normalized = requestedCuisines.map(normalizeCuisineTag).filter(Boolean);
  // Deduplicate while preserving order
  const dedup = normalized.filter((v, i, a) => a.indexOf(v) === i);
  if (dedup.length === 0) return [];
  const compatible = dedup.filter((value) => isCuisineMealSlotCompatible(value, meal));
  const pool = compatible.length > 0 ? compatible : dedup;
  if (pool.length === 1) return pool;

  // Strategy:
  //  - Within a single day, rotate by meal slot so breakfast/lunch/dinner
  //    pick DIFFERENT cuisines whenever the pool has ≥2 options.
  //  - Across consecutive days, shift the starting cuisine for the same
  //    meal slot so day N+1 breakfast ≠ day N breakfast (when pool ≥ 2).
  //  - Use a stride that is coprime with pool size whenever possible
  //    (stride = 1 for size 2, stride = 1 for size 3, stride = 3 for size 4)
  //    to guarantee a full cycle through the pool before repeating.
  const size = pool.length;
  const mealOffset = meal === "breakfast" ? 0 : meal === "lunch" ? 1 : meal === "dinner" ? 2 : 3;

  // Day stride: ensure consecutive days don't repeat the same meal-slot cuisine.
  // For size 2: stride=1 -> day 0 B=0, day 1 B=1, day 2 B=0 (alternates).
  // For size 3: stride=1 -> 0,1,2,0,1,2 (full cycle).
  // For size 4: stride=3 (≡ -1 mod 4) -> 0,3,2,1 (full cycle, no repeats).
  // For size ≥5: stride = floor(size/2)+1 if coprime, else stride=1.
  let dayStride = 1;
  if (size === 4) dayStride = 3;
  else if (size >= 5) {
    const candidate = Math.floor(size / 2) + 1;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    dayStride = gcd(candidate, size) === 1 ? candidate : 1;
  }

  // Intra-day stride: each meal slot moves by 1 within the day so
  // breakfast/lunch/dinner are different cuisines (when size ≥ 2).
  const startIndex = (((dayIndex * dayStride) + mealOffset) % size + size) % size;

  // Return the full pool ordered starting from the chosen cuisine,
  // so callers can fall back to the next candidate if the first has no result.
  return Array.from({ length: size }, (_, idx) => pool[(startIndex + idx) % size])
    .filter((value, idx, arr) => arr.indexOf(value) === idx);
}

async function resolveRequiredMealRestaurantWithCuisineCandidates(
  meal: "breakfast" | "lunch" | "dinner",
  cityName: string,
  cuisineCandidates: string[] = [],
  strictExcludeNames: string[] = [],
  relaxedExcludeNames: string[] = [],
  excludeKeys: string[] = [],
  seed = 0,
): Promise<{ restaurant: RestaurantInfo | null; matchedCuisine: string | null }> {
  // PERFORMANCE: try up to 2 cuisine candidates concurrently and accept the
  // FIRST valid restaurant (in priority order). Previously we ran them
  // sequentially, which meant ~3× latency per meal slot. Running in parallel
  // with bounded concurrency (2) keeps per-trip latency low even when
  // hundreds of users hit SerpAPI simultaneously, while still honouring
  // cuisine preference order via the priority sort below.
  const MAX_CUISINE_ATTEMPTS = 2;
  const trimmedCandidates = cuisineCandidates.filter(Boolean).slice(0, MAX_CUISINE_ATTEMPTS);

  if (trimmedCandidates.length > 1) {
    const results = await Promise.all(trimmedCandidates.map(async (cuisine, idx) => {
      try {
        const r = await resolveRequiredMealRestaurant(
          meal, cityName, cuisine,
          strictExcludeNames, relaxedExcludeNames, excludeKeys, seed,
        );
        return { restaurant: r, cuisine, idx };
      } catch {
        return { restaurant: null, cuisine, idx };
      }
    }));
    // Pick the first non-null result by candidate priority.
    const firstHit = results.filter(r => r.restaurant).sort((a, b) => a.idx - b.idx)[0];
    if (firstHit) return { restaurant: firstHit.restaurant, matchedCuisine: firstHit.cuisine };
  } else if (trimmedCandidates.length === 1) {
    const r = await resolveRequiredMealRestaurant(
      meal, cityName, trimmedCandidates[0],
      strictExcludeNames, relaxedExcludeNames, excludeKeys, seed,
    );
    if (r) return { restaurant: r, matchedCuisine: trimmedCandidates[0] };
  }

  const fallbackRestaurant = trimmedCandidates.length === 0
    ? await resolveRequiredMealRestaurant(meal, cityName, null, strictExcludeNames, relaxedExcludeNames, excludeKeys, seed)
    : null;

  return { restaurant: fallbackRestaurant, matchedCuisine: null };
}

async function searchSpecificActivityPlace(
  activity: any,
  cityName: string,
  prefs: PreferenceFlags,
  excludeNames: string[] = [],
): Promise<any | null> {
  const serpKey = sanitizeKey(Deno.env.get("SERPAPI_KEY"));
  const serperKey = sanitizeKey(Deno.env.get("SERPER_API_KEY"));
  if (!serpKey && !serperKey) return null;

  // INTEREST GATE: refuse to spend a SerpAPI call on a category the user did
  // not select. Meals, special requests and match-anchor lookups are exempt
  // (see `isSerpFetchAllowedForInterest`).
  if (!isSerpFetchAllowedForInterest(activity)) {
    console.log(`[SerpAPI gate] Skipped fetch for "${activity?.name || activity?.category}" — interest not selected by user`);
    logSerpUsage({
      query: String(activity?.name || activity?.category || "(unknown)"),
      city: cityName,
      cacheHit: false,
      blockedByGate: true,
      resultsCount: 0,
      context: "searchSpecificActivityPlace:gated",
    });
    return null;
  }

  const category = String(activity?.category || "attraction").toLowerCase();
  const rawName = String(activity?.name || "").trim();
  const rawDescription = String(activity?.description || "").trim();
  const excluded = new Set(excludeNames.map((name) => normalizeForDedup(name)));
  const requestedSubtype = inferRequestedActivitySubtype(activity);
  const enforcedSubtypeCategory = requestedSubtype === "sports" || requestedSubtype === "walk" ? "activity" : requestedSubtype;

  const categoryHint = requestedSubtype === "hotel"
    ? "hotel or accommodation"
    : requestedSubtype === "museum"
    ? "museum"
    : requestedSubtype === "sports"
      ? "sports venue or football experience"
      : requestedSubtype === "walk"
        ? "scenic walk or outskirts experience"
    : requestedSubtype === "beach"
      ? "beach or seaside activity"
      : requestedSubtype === "shopping"
        ? "shopping destination"
        : requestedSubtype === "cultural"
          ? "cultural attraction"
          : requestedSubtype === "nature"
            ? "nature attraction"
            : requestedSubtype === "entertainment"
              ? "entertainment venue"
              : requestedSubtype === "activity"
                ? "popular activity"
                : category === "shopping"
    ? "shopping destination"
    : category === "cultural"
      ? "cultural attraction"
      : category === "nature"
        ? "nature attraction"
        : category === "activity"
          ? "popular activity"
          : "tourist attraction";

  const tripTypeHint = prefs.isRomantic
    ? "romantic"
    : prefs.isAdventure
      ? "adventure"
      : prefs.isFamily
        ? "family-friendly"
        : prefs.isSolo
          ? "top rated"
          : "";

  const subtypeQuery = buildSubtypeSearchQuery(requestedSubtype, cityName, tripTypeHint);
  const isPromptDrivenSearch = Boolean(
    activity?.isSpecialRequest ||
    activity?.specialRequestQuery ||
    activity?.__specialRequestQuery ||
    /explicit\s+prompt|special[_\s-]?request|طلب\s+خاص/i.test(String(activity?.matchReason || "")),
  );
  const rawPromptQuery = isPromptDrivenSearch ? [rawName, rawDescription].filter(Boolean).join(" ").trim() : "";
  const queryCandidates = Array.from(new Set([
    rawPromptQuery ? `${rawPromptQuery} ${cityName}` : "",
    rawName && (isPromptDrivenSearch || !looksGenericActivity(activity, cityName)) ? `${rawName} ${cityName}` : "",
    rawDescription && (isPromptDrivenSearch || !looksGenericActivity({ name: rawDescription, address: cityName, category, description: rawDescription }, cityName))
      ? `${rawDescription} ${cityName}`
      : "",
    subtypeQuery,
    !isPromptDrivenSearch ? buildSubtypeSearchQuery(requestedSubtype, cityName) : "",
  ].filter(Boolean))).slice(0, isPromptDrivenSearch ? 4 : 3);

  const toResolvedActivity = (place: any, source: "serpapi" | "serper") => {
    const name = String(source === "serpapi" ? place?.title : place?.title || place?.name || "").trim();
    const address = String(source === "serpapi" ? place?.address : place?.address || "").trim();
    const lat = Number(source === "serpapi" ? place?.gps_coordinates?.latitude : place?.latitude);
    const lng = Number(source === "serpapi" ? place?.gps_coordinates?.longitude : place?.longitude);
    const normalized = normalizeForDedup(name);
    if (!name || !address || excluded.has(normalized)) return null;
    if (looksGenericActivity({ name, address, category, description: rawDescription }, cityName)) return null;
    if (looksOutOfCityContext({ name, address, latitude: lat, longitude: lng, category }, cityName)) return null;
    if (isInvalidActivityResult({ name, address, category, description: rawDescription })) return null;
    // STRICT ADDRESS PRECISION (same gate as meals): no generic island/area
    // labels, no addresses without a street/landmark or venue token.
    const precise = validatePreciseAddress(name, address, cityName);
    if (!precise.ok) {
      console.log(`[address-precision] Rejected activity "${name}" — ${precise.reason}`);
      return null;
    }

    const discoveredCategory = mapSerpCategory(source === "serpapi" ? place : { ...place, type: categoryHint });
    const rawResolvedActivity = {
      ...activity,
      name,
      description: `${discoveredCategory === "shopping" ? "تسوق في" : discoveredCategory === "cultural" || discoveredCategory === "museum" ? "زيارة" : discoveredCategory === "nature" || discoveredCategory === "beach" ? "استكشاف" : "جولة في"} ${name}`,
      category: discoveredCategory,
      address,
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lng) ? lng : 0,
      rating: Number(source === "serpapi" ? place?.rating : place?.rating) || activity?.rating || 4.4,
      phone: source === "serpapi" ? place?.phone : place?.phoneNumber,
      website: place?.website,
      openingHours: extractPlaceOpeningHours(source === "serpapi" ? place : {
        openingHours: place?.openingHours,
        currentOpeningHours: place?.currentOpeningHours,
        hours: place?.hours,
      }, activity?.date) || (hasValidOpeningHours(activity?.openingHours) ? activity?.openingHours : undefined),
      imageUrl: extractPlaceImageUrl(place) || activity?.imageUrl,
      googleMapsUrl: buildMealMapsUrl(
        name,
        address,
        cityName,
        Number.isFinite(lat) ? lat : 0,
        Number.isFinite(lng) ? lng : 0,
        source === "serpapi" ? place?.place_id : place?.placeId,
      ),
      googleMapsCoordsUrl: buildCoordsMapsUrl(Number.isFinite(lat) ? lat : 0, Number.isFinite(lng) ? lng : 0),
      placeId: source === "serpapi" ? place?.place_id : place?.placeId,
      enriched: true,
    };

    const sourceOnlyForSubtype = {
      name,
      title: name,
      description: source === "serpapi" ? (place?.description || place?.snippet || "") : (place?.description || ""),
      category: discoveredCategory,
      type: source === "serpapi" ? place?.type : place?.type,
      types: source === "serpapi" ? place?.types : place?.types,
      type_id: source === "serpapi" ? place?.type_id : place?.type_id,
      type_ids: source === "serpapi" ? place?.type_ids : place?.type_ids,
      address,
    };
    if (!activityMatchesRequestedSubtype(sourceOnlyForSubtype, requestedSubtype)) return null;
    if (["breakfast", "lunch", "dinner", "restaurant", "cafe"].includes(requestedSubtype) && prefs.requestedCuisines?.length > 0) {
      if (!activityMatchesRequestedCuisines(rawResolvedActivity, prefs.requestedCuisines)) return null;
    }

    let mappedCategory = discoveredCategory;
    if (["museum", "beach", "shopping", "cultural", "nature", "entertainment", "activity"].includes(enforcedSubtypeCategory)) {
      mappedCategory = enforcedSubtypeCategory;
    }

    const resolvedActivity = {
      ...rawResolvedActivity,
      description: `${mappedCategory === "shopping" ? "تسوق في" : mappedCategory === "cultural" || mappedCategory === "museum" ? "زيارة" : mappedCategory === "nature" || mappedCategory === "beach" ? "استكشاف" : "جولة في"} ${name}`,
      category: mappedCategory,
      sourceCategory: discoveredCategory,
    };

    return resolvedActivity;
  };

  // Backfill missing coordinates / opening hours by fetching the rich
  // SerpAPI place_details payload (engine=google_maps&type=place&place_id=…).
  // Search-tier responses often omit the full `hours` array and sometimes
  // lack precise gps_coordinates — calling place_details once per resolved
  // activity gives us the same fidelity as the regular trip-generation path
  // (real address, exact lat/lng, full weekly hours, phone, website).
  const enrichResolvedActivity = async (resolved: any) => {
    if (!resolved || !serpKey) return resolved;
    const needsHours = !hasValidOpeningHours(resolved.openingHours);
    const needsCoords = !(Number.isFinite(resolved.latitude) && Number.isFinite(resolved.longitude) && resolved.latitude !== 0 && resolved.longitude !== 0);
    const placeId = resolved.placeId || resolved.place_id;
    if (!placeId || (!needsHours && !needsCoords && resolved.imageUrl)) return resolved;
    try {
      const details = await fetchSerpPlaceDetails(placeId, serpKey);
      if (!details) return resolved;
      if (needsHours) {
        const hours = extractPlaceOpeningHours(details, resolved?.date);
        if (hours) resolved.openingHours = hours;
        if (details.operating_hours && typeof details.operating_hours === "object") {
          resolved.operatingHours = details.operating_hours;
          resolved.operating_hours = details.operating_hours;
        }
        if (details.open_state && !resolved.openState) {
          resolved.openState = details.open_state;
          resolved.open_state = details.open_state;
        }
      }
      if (needsCoords) {
        const lat = Number(details?.gps_coordinates?.latitude);
        const lng = Number(details?.gps_coordinates?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          resolved.latitude = lat;
          resolved.longitude = lng;
          resolved.googleMapsCoordsUrl = buildCoordsMapsUrl(lat, lng);
        }
      }
      if (!resolved.imageUrl) {
        const img = extractPlaceImageUrl(details);
        if (img) resolved.imageUrl = img;
      }
      if (!resolved.phone && details?.phone) resolved.phone = details.phone;
      if (!resolved.website && details?.website) resolved.website = details.website;
    } catch {
      // best-effort enrichment, never fail the whole resolve
    }
    return resolved;
  };

  // Issue queries ONE AT A TIME (credit-saving). For each query we try SerpAPI
  // first; if SerpAPI returns places but none pass the strict subtype/cuisine
  // filters we skip Serper for the same query (avoid double-spending). Only when
  // SerpAPI returns ZERO places do we fall through to Serper. Variants are only
  // tried when the previous query yielded no usable match.
  for (const query of queryCandidates) {
    if (serpKey) {
      const serpPlaces = await fetchSerpLocalResults(query, serpKey, cityName);
      for (const place of serpPlaces) {
        const resolved = toResolvedActivity(place, "serpapi");
        if (resolved) return await enrichResolvedActivity(resolved);
      }
      // SerpAPI returned data but nothing matched our preferences — don't pay
      // Serper for the exact same query, move on to the next variant instead.
      if (serpPlaces.length > 0) continue;
    }

    if (serperKey) {
      for (const endpoint of ["https://google.serper.dev/maps", "https://google.serper.dev/places"]) {
        try {
          const resp = await fetch(endpoint, {
            method: "POST",
            headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
            body: JSON.stringify({ q: query }),
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          const places = data?.places || [];
          for (const place of places) {
            const resolved = toResolvedActivity(place, "serper");
            if (resolved) return await enrichResolvedActivity(resolved);
          }
          // Same logic — if Serper returned places, stop probing endpoints
          // for this query and move to the next variant.
          if (places.length > 0) break;
        } catch {
          // noop
        }
      }
    }
  }

  return null;
}

function filterLandmarksByTripType(
  landmarks: PlaceInfo[],
  flags: { isRomantic: boolean; isFamily: boolean; isAdventure: boolean; isSolo: boolean; wantsSwimming?: boolean },
) {
  const byKeyword = (items: PlaceInfo[], regex: RegExp) =>
    items.filter((p) => regex.test(`${p.name} ${p.nameAr} ${p.category}`.toLowerCase()));

  // Swimming/water activities take priority when requested
  if (flags.wantsSwimming) {
    const filtered = byKeyword(landmarks, /swim|pool|beach|water|aqua|snorkel|diving|surf|marina|island|سباحة|شاطئ|مسبح|غطس|بحر|جزيرة|أكوا/);
    if (filtered.length >= 1) {
      // Mix water activities with other landmarks
      const others = landmarks.filter((l) => !filtered.includes(l));
      return [...filtered, ...others];
    }
  }

  if (flags.isRomantic) {
    const filtered = byKeyword(landmarks, /nature|cultural|attraction|cruise|sunset|view|beach|island|garden|bridge|tower|romantic|شاطئ|حديقة|غروب|رومان/);
    if (filtered.length >= 3) return filtered;
  }
  if (flags.isFamily) {
    const filtered = byKeyword(landmarks, /activity|nature|cultural|shopping|park|museum|aquarium|zoo|family|kids|حديقة|متحف|عائل/);
    if (filtered.length >= 3) return filtered;
  }
  if (flags.isAdventure) {
    const filtered = byKeyword(landmarks, /nature|activity|mountain|trail|hiking|adventure|boat|forest|beach|مغامر|جبل|طبيعة/);
    if (filtered.length >= 3) return filtered;
  }
  if (flags.isSolo) {
    const filtered = byKeyword(landmarks, /activity|cultural|shopping|walk|museum|market|explore|جولة|ثقاف|سوق/);
    if (filtered.length >= 3) return filtered;
  }
  return landmarks;
}

async function createFallbackItinerary(params: {
  destination: string; departureCity?: string; duration: number; startDate: string;
  interests?: string[]; additionalPreferences?: string; travelers?: number;
  cityLegs?: { city: string; days: number; transport?: string }[];
  cuisineTypes?: string[];
  maxActivitiesPerDay?: number;
  excludeActivityNames?: string[];
  preferenceFlags?: PreferenceFlags;
  selectedInterestSet?: Set<string> | string[];
  specialRequestInjections?: SpecialRequestInjection[];
  lang?: string;
}) {
  const {
    destination,
    departureCity,
    duration,
    startDate,
    interests = [],
    additionalPreferences = "",
    travelers,
    cityLegs,
    cuisineTypes,
    maxActivitiesPerDay = 7,
    excludeActivityNames = [],
    preferenceFlags: providedPreferenceFlags,
    selectedInterestSet: providedSelectedInterestSet,
    specialRequestInjections: providedSpecialRequestInjections = [],
    lang: explicitLang,
  } = params;
  // Explicit UI language passed by caller — used to localize backend-generated
  // boilerplate (meal names, tips, descriptions). Defaults to "en" when absent.
  const targetLang = String(explicitLang || "en").toLowerCase().split("-")[0];
  const prefs = providedPreferenceFlags || extractPreferences(interests, additionalPreferences, cuisineTypes);
  const {
    allText,
    requestedCuisine,
    requestedCuisines,
    wantBreakfast,
    wantLunch,
    wantDinner,
    isRomantic,
    isAdventure,
    isFamily,
    isSolo,
    startHour,
    endHour,
  } = prefs;

  const activitiesOnlyMode = shouldUseActivitiesOnlyMode(interests, additionalPreferences);
  const selectedInterestSet = providedSelectedInterestSet instanceof Set
    ? new Set(Array.from(providedSelectedInterestSet).map(normalizeInterestTag).filter(Boolean))
    : Array.isArray(providedSelectedInterestSet)
      ? new Set(providedSelectedInterestSet.map(normalizeInterestTag).filter(Boolean))
      : buildSelectedInterestSet(interests, additionalPreferences);
  const previousNameSet = new Set(excludeActivityNames.map((name) => normalizeForDedup(name)).filter(Boolean));

  // GLOBAL dedup sets — shared across ALL days to prevent cross-day repeats
  const globalUsedKeys = new Set<string>();
  const globalUsedNames = new Set<string>();
  // Pre-seed with excluded names from prior generations
  excludeActivityNames.forEach((n) => {
    const norm = normalizeForDedup(n);
    if (norm) globalUsedNames.add(norm);
  });

  const specialRequestSource = buildMeaningfulSpecialRequestSource(additionalPreferences);
    const specialRequestInjections = providedSpecialRequestInjections.length > 0
      ? providedSpecialRequestInjections
      : extractSpecialRequestInjections(specialRequestSource, prefs, startDate);
  // 🛡️ Clamp out-of-range forDay values to valid trip days so injections are
  // never silently dropped (e.g. when a user-extracted date like June 24 maps
  // to "day 24" but the trip is only 3 days long).
  const safeDuration = Math.max(1, duration || 1);
  for (const sr of specialRequestInjections) {
    if (typeof sr.forDay === "number" && (sr.forDay < 1 || sr.forDay > safeDuration)) {
      const original = sr.forDay;
      sr.forDay = Math.min(safeDuration, Math.max(1, sr.forDay));
      console.log(`🛠️ Clamped special request "${sr.query}" forDay ${original} → ${sr.forDay} (trip duration: ${safeDuration})`);
    }
  }
  // 🛡️ CROSS-DAY ANCHOR INTEGRITY: a match anchor (sports event with teams)
  // must NEVER be injected on more than one day. If forDay is missing, pin it
  // to day 1 so it fires exactly once. Also dedupe anchors globally by
  // teamA|teamB|isoDate so the same match isn't repeated across multiple days.
  const seenAnchorKeys = new Set<string>();
  for (const sr of specialRequestInjections) {
    if (!sr.anchor) continue;
    const aKey = `${normalizeForDedup(sr.anchor.teamA)}|${normalizeForDedup(sr.anchor.teamB)}|${normalizeForDedup(sr.anchor.isoDate || sr.anchor.kickoff || sr.anchor.venue)}`;
    if (seenAnchorKeys.has(aKey)) {
      // duplicate match anchor entry — neutralize so it never injects again
      (sr as any).__suppressed = true;
      continue;
    }
    seenAnchorKeys.add(aKey);
    if (!sr.forDay || sr.forDay < 1 || sr.forDay > safeDuration) {
      sr.forDay = 1;
      console.log(`🛠️ Pinned match anchor "${sr.anchor.teamA} vs ${sr.anchor.teamB}" to day 1 (no valid date)`);
    }
  }
  // Strip suppressed entries
  for (let i = specialRequestInjections.length - 1; i >= 0; i--) {
    if ((specialRequestInjections[i] as any).__suppressed) specialRequestInjections.splice(i, 1);
  }
  if (specialRequestInjections.length > 0) {
    console.log(`Special request injections: ${specialRequestInjections.map(s => `${s.query}${s.forDay ? ` (day ${s.forDay})` : ""}${s.preferredTime ? ` @ ${s.preferredTime}` : ""}`).join(", ")}`);
  }

  const preferUnseenByName = <T extends { name?: string; nameAr?: string }>(items: T[]): T[] => {
    if (previousNameSet.size === 0) return items;
    const unseen = items.filter((item) => !previousNameSet.has(normalizeForDedup(item?.nameAr || item?.name)));
    // Soft preference: if every candidate has been seen before, fall back to
    // the original list so the user still gets a result that matches their
    // preferences instead of an empty plan. The user explicitly asked for
    // novelty-by-default but allowed reuse when no alternative matches.
    return unseen.length > 0 ? unseen : items;
  };

  const mergeExcludedNames = (names: string[] = []) => [...excludeActivityNames, ...names];

  const wantsFlight = !activitiesOnlyMode && (allText.includes("include flight") || allText.includes("حجز طيران") || allText.includes("flight: نعم") || allText.includes("flight recommendations") || allText.includes("intercity transport: flight"));
  const wantsHotel = !activitiesOnlyMode && (allText.includes("include hotel") || allText.includes("حجز فندق") || allText.includes("hotel: نعم") || allText.includes("hotel recommendations"));
  const wantsCar = !activitiesOnlyMode && (allText.includes("include car") || allText.includes("rental_car") || allText.includes("car rental") || allText.includes("ايجار") || allText.includes("استئجار") || allText.includes("مكتب ايجار"));

  const isCuisineCompatibleWithMealSlot = (
    cuisineValue: string | null | undefined,
    meal: "breakfast" | "lunch" | "dinner" | "snack",
  ): boolean => {
    const normalized = normalizeCuisineTag(cuisineValue);
    if (!normalized) return true;
    if (meal === "breakfast") {
      return !["seafood", "grill", "fine-dining", "fast-food", "food-truck"].includes(normalized);
    }
    return true;
  };

  // Support multi-cuisine rotation: pick cuisine based on day index
  const getCuisineForDay = (dayIndex: number): string | null => {
    if (requestedCuisines.length > 1) {
      return requestedCuisines[dayIndex % requestedCuisines.length];
    }
    return requestedCuisine;
  };

  const getCuisineForMealSlot = (
    dayIndex: number,
    meal: "breakfast" | "lunch" | "dinner" | "snack",
  ): string | null => {
    if (requestedCuisines.length === 0) return requestedCuisine;
    // Delegate to the centralized rotation so intra-day AND inter-day
    // variety stay consistent across every callsite.
    const candidates = getMealCuisineCandidates(requestedCuisines, dayIndex, meal);
    if (candidates.length > 0) return candidates[0];
    const compatibleCuisines = requestedCuisines.filter((value) => isCuisineCompatibleWithMealSlot(value, meal));
    return (compatibleCuisines[0] || requestedCuisines[0]) ?? null;
  };

  const getRotatedInterestsForDay = (dayIndex: number): string[] => {
    const ordered = Array.from(selectedInterestSet).filter(Boolean);
    if (ordered.length === 0) return [];
    return ordered.map((_, idx) => ordered[(dayIndex + idx) % ordered.length]);
  };

  // Global tracker for match anchors that have been injected. Belt-and-braces
  // safeguard: prevents the same match (teamA vs teamB) from appearing on more
  // than one day even if upstream logic mistakenly flags multiple days.
  const globallyInjectedMatchKeys = new Set<string>();

  const finalizeExactDayActivities = async (
    rawActivities: any[],
    cityName: string,
    dayNumber: number,
    dayIndex: number,
  ): Promise<any[]> => {
    let activities = Array.isArray(rawActivities) ? [...rawActivities] : [];
    // Strip any activity that mentions teams from a match already injected on
    // a previous day (covers both flagged anchors AND generic AI/SerpAPI items
    // that happened to reference the same fixture, e.g. "Qatar vs Switzerland"
    // appearing as a generic stadium tour on Day 2).
    activities = activities.filter((act: any) => {
      const teams = act?.matchTeams;
      if (teams?.a && teams?.b) {
        const k = `${normalizeForDedup(teams.a)}|${normalizeForDedup(teams.b)}`;
        if (globallyInjectedMatchKeys.has(k)) return false;
      }
      // Heuristic for un-flagged duplicates: search the activity text for any
      // already-injected (teamA, teamB) pair.
      const blob = normalizeForDedup(`${getActivityName(act)} ${act?.description || ""} ${act?.matchReason || ""} ${act?.title || ""}`);
      for (const k of globallyInjectedMatchKeys) {
        const [a, b] = k.split("|");
        if (!a || !b) continue;
        if (activityMentionsTeam(blob, a) && activityMentionsTeam(blob, b)) {
          console.log(`[match-dedup] Dropped "${getActivityName(act)}" — duplicates already-injected match ${a} vs ${b}`);
          return false;
        }
      }
      return true;
    });
    const daySpecialRequests = specialRequestInjections.filter((sr) => !sr.forDay || sr.forDay === dayNumber);

    // ============================================================
    // GUARANTEED MATCH ANCHOR: For sports match anchors tied to this
    // exact day, force-inject a fully-formed activity (teams + venue +
    // kickoff time) so the user-requested match always appears, even
    // when SerpAPI/Serper enrichment fails to surface it.
    // ============================================================
    const dayMatchAnchors = daySpecialRequests
      .map((sr) => sr.anchor)
      .filter((a): a is MatchAnchor => !!a && !!a.teamA && !!a.teamB);
    const seenAnchors = new Set<string>();
    for (const anchor of dayMatchAnchors) {
      const anchorKey = `${normalizeForDedup(anchor.teamA)}|${normalizeForDedup(anchor.teamB)}|${normalizeForDedup(anchor.venue)}`;
      if (seenAnchors.has(anchorKey)) continue;
      seenAnchors.add(anchorKey);
      const venueRef = resolveMatchVenueReference(anchor.venue, cityName);
      const preferredVenueLabel = venueRef?.officialName || getPreferredMatchVenueLabel(anchor.venue);
      const canonicalVenueLabel = buildCanonicalMatchVenueLabel(anchor.venue, venueRef);
      const alreadyPresent = activities.some((act: any) => {
        const combined = normalizeForDedup(`${getActivityName(act)} ${act?.description || ""} ${act?.matchReason || ""}`);
        return activityMentionsTeam(combined, anchor.teamA) && activityMentionsTeam(combined, anchor.teamB);
      });
      if (alreadyPresent) {
        // Tag the existing one as a match anchor AND overwrite its time
        // with the user's exact kickoff so the schedule shows the right hour.
        const kickoffPre = parseExactKickoffTime(anchor.kickoff);
        const flagAPre = countryToFlagEmoji(anchor.teamA);
        const flagBPre = countryToFlagEmoji(anchor.teamB);
        for (const act of activities) {
          const combined = normalizeForDedup(`${getActivityName(act)} ${act?.description || ""} ${act?.matchReason || ""}`);
          if (activityMentionsTeam(combined, anchor.teamA) && activityMentionsTeam(combined, anchor.teamB)) {
            act.isMatchAnchor = true;
            // Embed flags directly in the title/name so the activity card shows
            // the country flags exactly like the promotions/events page.
            const matchTitlePre = `${flagAPre} ${anchor.teamA} vs ${flagBPre} ${anchor.teamB}`;
            act.title = matchTitlePre;
            act.name = matchTitlePre;
            act.matchVenueDisplay = venueRef?.officialName || preferredVenueLabel || act.matchVenue || "";
            act.description = `${flagAPre} ${anchor.teamA} vs ${flagBPre} ${anchor.teamB} • ${kickoffPre.display24h}`;
            act.startTime = kickoffPre.display24h;
            act.time = kickoffPre.display24h;
            act.endTime = `${String((kickoffPre.hour + 3) % 24).padStart(2, "0")}:${String(kickoffPre.minute).padStart(2, "0")}`;
            act.openingHours = kickoffPre.display24h;
            act.matchKickoff = kickoffPre.display24h;
            act.matchTeams = { a: anchor.teamA, b: anchor.teamB, flagA: flagAPre, flagB: flagBPre };
            act.matchVenue = canonicalVenueLabel || act.matchVenue || preferredVenueLabel;
            if (venueRef) {
              act.address = `${venueRef.officialName}, ${venueRef.city}, ${venueRef.country}`;
              act.latitude = venueRef.lat;
              act.longitude = venueRef.lng;
              act.googleMapsUrl = buildPlaceMapsUrl(act.name || venueRef.officialName, act.address, undefined, venueRef.lat, venueRef.lng);
            }
            break;
          }
        }
        globallyInjectedMatchKeys.add(`${normalizeForDedup(anchor.teamA)}|${normalizeForDedup(anchor.teamB)}`);
        continue;
      }
      // Parse exact kickoff time (preserves PM/AM and 24h precisely)
      const kickoff = parseExactKickoffTime(anchor.kickoff);
      const kickoffHour = kickoff.hour;
      const kickoffDisplay = kickoff.display24h;
      const flagA = countryToFlagEmoji(anchor.teamA);
      const flagB = countryToFlagEmoji(anchor.teamB);

      // Try to enrich venue location via SerpAPI/Serper to get real coords + address
      let venueLat = venueRef?.lat || 0;
      let venueLng = venueRef?.lng || 0;
      let venueAddress = venueRef ? `${venueRef.officialName}, ${venueRef.city}, ${venueRef.country}` : (canonicalVenueLabel || preferredVenueLabel);
      let venueResolvedName = venueRef?.officialName || preferredVenueLabel;
      const venueLookupCity = venueRef?.city || cityName;
      const venueSearchQueries = Array.from(new Set([
        anchor.venue,
        `${anchor.venue} ${venueLookupCity}`,
        `${preferredVenueLabel} ${venueLookupCity}`,
        venueRef?.officialName ? `${venueRef.officialName} ${venueRef.city}` : "",
        venueRef?.tournamentName ? `${venueRef.tournamentName} ${venueRef.city}` : "",
      ].map((value) => String(value || "").trim()).filter(Boolean)));
      for (const venueQuery of venueSearchQueries) {
        try {
          const resolvedVenue = await searchSpecificActivityPlace(
            {
              id: `d${dayNumber}-match-venue-lookup`,
              name: venueQuery,
              description: `${venueQuery} stadium ${venueLookupCity}`,
              category: "sports",
              time: kickoffDisplay,
              duration: "3 hours",
              address: venueLookupCity,
              latitude: 0,
              longitude: 0,
              cost: 0,
              rating: 4.7,
            },
            venueLookupCity,
            prefs,
            buildExcludedNameList(excludeActivityNames, globalUsedNames, activities),
          );
          if (!resolvedVenue || !resolvedVenueMatchesAnchor(resolvedVenue, anchor.venue, venueRef)) continue;
          if (Number.isFinite(resolvedVenue.latitude) && resolvedVenue.latitude !== 0) venueLat = resolvedVenue.latitude;
          if (Number.isFinite(resolvedVenue.longitude) && resolvedVenue.longitude !== 0) venueLng = resolvedVenue.longitude;
          if (resolvedVenue.address && String(resolvedVenue.address).length > preferredVenueLabel.length) {
            venueAddress = resolvedVenue.address;
          }
          if (resolvedVenue.name && String(resolvedVenue.name).length > 2) {
            venueResolvedName = venueRef?.officialName || resolvedVenue.name;
          }
          break;
        } catch {
          // ignore — fall back to the exact anchored venue reference
        }
      }

      const matchActivity: any = {
        id: `d${dayNumber}-match-anchor-${seenAnchors.size}`,
        // Embed flags directly in the title/name so the activity card shows
        // the country flags exactly like the promotions/events page.
        title: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB}`,
        name: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB}`,
        matchVenueDisplay: venueRef?.officialName || venueResolvedName,
        description: `${flagA} ${anchor.teamA} vs ${flagB} ${anchor.teamB} • ${kickoffDisplay}`,
        category: "sports",
        startTime: kickoffDisplay,
        time: kickoffDisplay,
        endTime: `${String((kickoffHour + 3) % 24).padStart(2, "0")}:${String(kickoff.minute).padStart(2, "0")}`,
        duration: "3 hours",
        address: venueAddress,
        latitude: venueLat,
        longitude: venueLng,
        cost: 80,
        rating: 4.8,
        openingHours: kickoffDisplay,
        isMatchAnchor: true,
        matchTeams: { a: anchor.teamA, b: anchor.teamB, flagA, flagB },
        matchKickoff: kickoffDisplay,
        matchVenue: canonicalVenueLabel || venueResolvedName,
        googleMapsUrl: buildPlaceMapsUrl(
          canonicalVenueLabel || venueResolvedName || preferredVenueLabel,
          venueAddress,
          venueLookupCity,
          venueLat,
          venueLng,
        ),
      };
      activities.unshift(matchActivity);
      markCandidateUsed(matchActivity, globalUsedKeys, globalUsedNames);
      // Record this match globally so subsequent days can't re-inject it.
      globallyInjectedMatchKeys.add(`${normalizeForDedup(anchor.teamA)}|${normalizeForDedup(anchor.teamB)}`);
    }

    if (dayMatchAnchors.length > 0) {
      activities = enforceSingleMatchActivitiesForDay(activities, dayMatchAnchors, cityName);
    }

    // ============================================================
    // GUARANTEED SPECIAL REQUEST INJECTION (non-match anchors):
    // For every other special request the user typed (venues,
    // restaurants, themes, activities), force-include a resolved
    // activity if it isn't already present. Uses SerpAPI/Serper to
    // pull real address + coordinates.
    // ============================================================
    const nonAnchorRequests = daySpecialRequests.filter((sr) => !sr.anchor && !/\bvs\b/i.test(String(sr.query || "")));
    for (const sr of nonAnchorRequests) {
      const alreadyExists = activities.some((act: any) => activityMatchesSpecialRequest(act, sr.query));
      if (alreadyExists) continue;
      try {
        const srHour = sr.preferredTime
          ? parseInt(String(sr.preferredTime).split(":")[0] || "12", 10)
          : sr.category === "breakfast"
            ? Math.max(startHour + 1, 8)
            : sr.category === "dinner"
              ? Math.min(endHour - 1, 19)
              : sr.category === "lunch"
                ? Math.max(startHour + 4, 12)
                : Math.max(startHour + 2, 10);
        const srTime = sr.preferredTime || formatTime(srHour);
        const resolved = await searchSpecificActivityPlace(
          {
            id: `d${dayNumber}-sr-guard-${activities.length + 1}`,
            name: sr.query,
            description: sr.query,
            category: sr.category,
            time: srTime,
            duration: ["breakfast", "lunch", "dinner"].includes(sr.category) ? "1.5 hours" : "2 hours",
            address: cityName,
            latitude: 0,
            longitude: 0,
            cost: 20,
            rating: 4.5,
          },
          cityName,
          prefs,
          buildExcludedNameList(excludeActivityNames, globalUsedNames, activities),
        );
        if (resolved && !looksGenericActivity(resolved, cityName) && !looksOutOfCityContext(resolved, cityName) && !hasActivityInCollection(activities, resolved)) {
          resolved.matchReason = `✨ ${sr.query}`;
          if (sr.preferredTime) {
            resolved.time = sr.preferredTime;
            resolved.startTime = sr.preferredTime;
          }
          activities.unshift(resolved);
          markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
          continue;
        }

        const fallbackSpecialActivity = {
          id: `d${dayNumber}-sr-fallback-${activities.length + 1}`,
          name: sr.query,
          title: sr.query,
          description: sr.query,
          category: sr.category || "activity",
          time: srTime,
          startTime: srTime,
          duration: ["breakfast", "lunch", "dinner"].includes(sr.category) ? "1.5 hours" : "2 hours",
          address: cityName,
          latitude: 0,
          longitude: 0,
          cost: ["breakfast", "lunch", "dinner"].includes(sr.category) ? 30 : 20,
          rating: 4.4,
          openingHours: sr.preferredTime ? sr.preferredTime : undefined,
          matchReason: `✨ ${sr.query}`,
          isUserRequestedFallback: true,
        };
        if (!hasActivityInCollection(activities, fallbackSpecialActivity)) {
          activities.unshift(fallbackSpecialActivity);
          markCandidateUsed(fallbackSpecialActivity, globalUsedKeys, globalUsedNames);
          console.log(`🛡️ Forced fallback special request activity into plan: ${sr.query} (day ${dayNumber})`);
        }
      } catch {
        const fallbackSpecialActivity = {
          id: `d${dayNumber}-sr-fallback-${activities.length + 1}`,
          name: sr.query,
          title: sr.query,
          description: sr.query,
          category: sr.category || "activity",
          time: sr.preferredTime || formatTime(Math.max(startHour + 2, 10)),
          startTime: sr.preferredTime || formatTime(Math.max(startHour + 2, 10)),
          duration: ["breakfast", "lunch", "dinner"].includes(sr.category) ? "1.5 hours" : "2 hours",
          address: cityName,
          latitude: 0,
          longitude: 0,
          cost: ["breakfast", "lunch", "dinner"].includes(sr.category) ? 30 : 20,
          rating: 4.4,
          matchReason: `✨ ${sr.query}`,
          isUserRequestedFallback: true,
        };
        if (!hasActivityInCollection(activities, fallbackSpecialActivity)) {
          activities.unshift(fallbackSpecialActivity);
          markCandidateUsed(fallbackSpecialActivity, globalUsedKeys, globalUsedNames);
          console.log(`🛡️ Forced fallback special request activity after lookup failure: ${sr.query} (day ${dayNumber})`);
        }
      }
    }

    const requestedMeals: Array<"breakfast" | "lunch" | "dinner"> = [];
    if (wantBreakfast) requestedMeals.push("breakfast");
    if (wantLunch) requestedMeals.push("lunch");
    if (wantDinner) requestedMeals.push("dinner");

    for (const meal of requestedMeals) {
      if (activities.some((activity: any) => String(activity?.category || "").toLowerCase() === meal)) continue;
      const mealHour = meal === "breakfast"
        ? Math.max(startHour + 1, 8)
        : meal === "lunch"
          ? Math.max(startHour + 4, 12)
          : Math.min(endHour - 1, 19);
      const mealCandidates = getMealCuisineCandidates(requestedCuisines, dayIndex, meal);
      const restaurant = (await resolveRequiredMealRestaurantWithCuisineCandidates(
        meal,
        cityName,
        mealCandidates.length > 0 ? mealCandidates : (getCuisineForMealSlot(dayIndex, meal) ? [getCuisineForMealSlot(dayIndex, meal) as string] : []),
        buildExcludedNameList(excludeActivityNames, globalUsedNames, activities),
        activities.map((activity: any) => getActivityName(activity)).filter(Boolean),
        [],
        dayNumber,
      )).restaurant;
      let mealActivity = restaurant
        ? buildMealActivityFromRestaurant(restaurant, meal, dayNumber, cityName, mealHour, startHour, endHour)
        : null;

      // 🛡️ GUARANTEE: If lookup STILL failed (SerpAPI returned nothing for the city),
      // skip the synthetic text placeholder entirely — emitting cards like
      // "indian breakfast in Santa Clara" with no image/hours degrades the experience.
      // The downstream meal-fill loop (line ~10353) will retry with a broader strategy
      // and only injects a labelled note if every real-place lookup truly fails.
      if (!mealActivity) {
        console.log(`🛡️ Meal slot ${meal} day ${dayNumber}: no real venue resolved; deferring to meal-fill pass`);
      }

      if (mealActivity && !hasActivityInCollection(activities, mealActivity)) {
        activities.push(mealActivity);
        markCandidateUsed(mealActivity, globalUsedKeys, globalUsedNames);
      }
    }


    // 🛡️ MATCH-DAY GUARANTEE: When this day has a confirmed match anchor (e.g.
    // user picked a match from /promotions), enforce a minimum of 3 items so the
    // user always sees: Match + at least 2 more activities (meals/preferences).
    // This applies even in "auto" activity-count mode so picking a match never
    // shrinks the day to just (Match + 1 meal).
    // The user-selected daily count is strict and already includes meals.
    // A selected match must consume one of those slots, not expand the day.
    const dayMaxActivities = Math.max(1, maxActivitiesPerDay);

    let selected = selectActivitiesForExactDailyCount(
      activities,
      Math.max(1, dayMaxActivities),
      selectedInterestSet,
      dayNumber,
      daySpecialRequests,
      true,
    );

    let padAttempts = 0;
    while (selected.length < dayMaxActivities && padAttempts < Math.max(8, dayMaxActivities * 3)) {
      const interestRotation = buildDayInterestRotation(selectedInterestSet, dayNumber, Math.max(1, dayMaxActivities - selected.length));
      const preferredInterest = interestRotation[padAttempts % Math.max(1, interestRotation.length)] || "";
      const category = preferredInterest ? mapInterestToActivityCategory(preferredInterest) : "attraction";
      const placeholder = {
        id: `d${dayNumber}-exact-fill-${selected.length + 1}`,
        name: preferredInterest
          ? `top ${category} in ${cityName}`
          : `popular attraction in ${cityName}`,
        description: preferredInterest
          ? `${preferredInterest} activity in ${cityName}`
          : `top attraction in ${cityName}`,
        category,
        time: formatTime(Math.max(startHour + 2 + selected.length * 2, 10 + selected.length * 2)),
        duration: "1.5 hours",
        address: cityName,
        latitude: 0,
        longitude: 0,
        cost: 20,
        rating: 4.4,
      };
      const resolved = await searchSpecificActivityPlace(
        placeholder,
        cityName,
        prefs,
        buildExcludedNameList(excludeActivityNames, globalUsedNames, selected),
      );
      if (resolved && !looksGenericActivity(resolved, cityName) && !looksOutOfCityContext(resolved, cityName) && !hasActivityInCollection(selected, resolved)) {
        markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
        selected.push(resolved);
        selected = selectActivitiesForExactDailyCount(
          selected,
          Math.max(1, maxActivitiesPerDay),
          selectedInterestSet,
          dayNumber,
          daySpecialRequests,
          true,
        );
      }
      padAttempts++;
    }

    if (selected.length < dayMaxActivities) {
      const cityKey = getCityKey(cityName);
      const curatedPool = cityKey
        ? filterLandmarksBySelectedInterests(
            filterLandmarksByTripType(CITY_PLACES[cityKey]?.landmarks || [], {
              isRomantic,
              isFamily,
              isAdventure,
              isSolo,
              wantsSwimming: prefs.wantsSwimming,
            }),
            selectedInterestSet,
          )
        : [];
      const fallbackPool = curatedPool.length > 0 ? curatedPool : (cityKey ? CITY_PLACES[cityKey]?.landmarks || [] : []);
      // Vary the rotation per generation so identical inputs don't always
      // surface the same landmarks first. __serpVariationSeed is randomised
      // on every run inside resetSerpRequestState.
      const variationOffset = (__serpVariationSeed >>> 0) % Math.max(1, fallbackPool.length);
      for (let i = 0; selected.length < dayMaxActivities && i < fallbackPool.length * 2; i++) {
        const landmark = fallbackPool[(dayNumber * 7 + i + selected.length + variationOffset) % fallbackPool.length];
        if (!landmark) break;
        const candidate = {
          id: `d${dayNumber}-curated-fill-${selected.length + 1}`,
          name: landmark.nameAr || landmark.name,
          description: `زيارة ${landmark.nameAr || landmark.name} (${landmark.name})`,
          category: getInterestAlignedCategory(landmark, selectedInterestSet, landmark.category || "attraction"),
          time: formatTime(Math.max(startHour + 2 + selected.length * 2, 10 + selected.length * 2)),
          duration: "1.5 hours",
          address: landmark.address,
          latitude: landmark.lat,
          longitude: landmark.lng,
          cost: 20,
          rating: 4.5,
          // Prefer the landmark's own openingHours when our curated bank has
          // them; otherwise leave it empty so enrichMissingOpeningHours can
          // backfill from SerpAPI/Serper. Hard-coding "10 AM - 10 PM" caused
          // the UI to display incorrect hours for places that aren't open
          // those exact times.
          openingHours: (landmark as any).openingHours || "",
          matchReason: detectActivityInterestTag(landmark, selectedInterestSet) || undefined,
          googleMapsUrl: buildPlaceMapsUrl(landmark.name, landmark.address, undefined, landmark.lat, landmark.lng, landmark.placeId, landmark.dataCid),
        };
        if (hasActivityInCollection(selected, candidate)) continue;
        markCandidateUsed(candidate, globalUsedKeys, globalUsedNames);
        selected.push(candidate);
        selected = selectActivitiesForExactDailyCount(
          selected,
          Math.max(1, dayMaxActivities),
          selectedInterestSet,
          dayNumber,
          daySpecialRequests,
          true,
        );
      }
    }

    const selectedMeals = new Set(
      selected
        .map((activity: any) => String(activity?.category || "").toLowerCase())
        .filter((category) => isMealCategory(category))
    );

    for (const meal of requestedMeals) {
      if (selectedMeals.has(meal)) continue;
      const sourceMeal = activities.find((activity: any) => String(activity?.category || "").toLowerCase() === meal);
      if (sourceMeal && !hasActivityInCollection(selected, sourceMeal)) {
        selected.push(sourceMeal);
        selectedMeals.add(meal);
      }
    }

    if (selected.length < dayMaxActivities) {
      const relaxedCityKey = getCityKey(cityName);
      const relaxedPool = relaxedCityKey ? (CITY_PLACES[relaxedCityKey]?.landmarks || []) : [];
      const relaxedVariationOffset = (__serpVariationSeed >>> 0) % Math.max(1, relaxedPool.length);
      for (let i = 0; selected.length < dayMaxActivities && i < relaxedPool.length * 3; i++) {
        const landmark = relaxedPool[(dayNumber * 19 + i + selected.length + relaxedVariationOffset) % relaxedPool.length];
        if (!landmark) break;
        const candidate = {
          id: `d${dayNumber}-relaxed-fill-${selected.length + 1}`,
          name: landmark.nameAr || landmark.name,
          description: `زيارة ${landmark.nameAr || landmark.name} (${landmark.name})`,
          category: landmark.category || "attraction",
          time: formatTime(Math.max(startHour + 2 + selected.length * 2, 10 + selected.length * 2)),
          duration: "1.5 hours",
          address: landmark.address,
          latitude: landmark.lat,
          longitude: landmark.lng,
          cost: 20,
          rating: 4.5,
          openingHours: (landmark as any).openingHours || "",
          googleMapsUrl: buildPlaceMapsUrl(landmark.name, landmark.address, undefined, landmark.lat, landmark.lng, landmark.placeId, landmark.dataCid),
        };
        if (!hasActivityInCollection(selected, candidate)) {
          selected.push(candidate);
        }
      }
    }

    selected = selectActivitiesForExactDailyCount(
      selected,
      Math.max(1, dayMaxActivities),
      selectedInterestSet,
      dayNumber,
      daySpecialRequests,
      true,
    );

    const requiredMatchAnchors = activities.filter((activity: any) => activity?.isMatchAnchor);
    const reinjectedAnchorKeys = new Set<string>(
      selected
        .filter((a: any) => a?.isMatchAnchor)
        .map((a: any) => a?.matchTeams
          ? `${normalizeForDedup(a.matchTeams.a || "")}|${normalizeForDedup(a.matchTeams.b || "")}|${normalizeForDedup(a.matchVenue || "")}`
          : `anchor|${normalizeForDedup(getActivityName(a))}`),
    );
    for (const matchActivity of requiredMatchAnchors) {
      const anchorKey = matchActivity?.matchTeams
        ? `${normalizeForDedup(matchActivity.matchTeams.a || "")}|${normalizeForDedup(matchActivity.matchTeams.b || "")}|${normalizeForDedup(matchActivity.matchVenue || "")}`
        : `anchor|${normalizeForDedup(getActivityName(matchActivity))}`;
      if (reinjectedAnchorKeys.has(anchorKey)) continue;
      if (hasActivityInCollection(selected, matchActivity)) {
        reinjectedAnchorKeys.add(anchorKey);
        continue;
      }
      if (selected.length >= Math.max(1, dayMaxActivities)) {
        let removableIndex = selected.findIndex((activity: any) => !activity?.isMatchAnchor && !isMealCategory(activity?.category));
        if (removableIndex === -1) removableIndex = selected.findIndex((activity: any) => !activity?.isMatchAnchor);
        if (removableIndex !== -1) selected.splice(removableIndex, 1);
      }
      if (selected.length < Math.max(1, dayMaxActivities)) {
        selected.unshift(matchActivity);
        reinjectedAnchorKeys.add(anchorKey);
      }
    }
    selected.sort((a: any, b: any) => String(a?.time || "12:00").localeCompare(String(b?.time || "12:00")));

    const finalSelectedKeys = new Set(selected.map((activity: any) => activityDedupKey(activity)).filter(Boolean));
    const finalSelectedNames = new Set(selected.map((activity: any) => activityNameSeenKey(activity)).filter(Boolean));
    const pushFinalUnique = (candidate: any) => {
      if (!candidate) return false;
      const key = activityDedupKey(candidate);
      const nameKey = activityNameSeenKey(candidate);
      if ((key && finalSelectedKeys.has(key)) || (nameKey && finalSelectedNames.has(nameKey))) return false;
      if (key) finalSelectedKeys.add(key);
      if (nameKey) finalSelectedNames.add(nameKey);
      selected.push(candidate);
      return true;
    };

    for (const meal of requestedMeals) {
      if (selected.some((activity: any) => String(activity?.category || "").toLowerCase() === meal)) continue;
      const sourceMeal = activities.find((activity: any) => String(activity?.category || "").toLowerCase() === meal);
      pushFinalUnique(sourceMeal);
    }

    if (selected.length < dayMaxActivities) {
      const finalCityKey = getCityKey(cityName);
      const finalPool = finalCityKey ? (CITY_PLACES[finalCityKey]?.landmarks || []) : [];
      const finalVariationOffset = (__serpVariationSeed >>> 0) % Math.max(1, finalPool.length);
      for (let i = 0; selected.length < dayMaxActivities && i < finalPool.length * 3; i++) {
        const landmark = finalPool[(dayNumber * 23 + i + selected.length + finalVariationOffset) % finalPool.length];
        if (!landmark) break;
        pushFinalUnique({
          id: `d${dayNumber}-final-exact-fill-${selected.length + 1}`,
          name: landmark.nameAr || landmark.name,
          description: `زيارة ${landmark.nameAr || landmark.name} (${landmark.name})`,
          category: landmark.category || "attraction",
          time: formatTime(Math.max(startHour + 2 + selected.length * 2, 10 + selected.length * 2)),
          duration: "1.5 hours",
          address: landmark.address,
          latitude: landmark.lat,
          longitude: landmark.lng,
          cost: 20,
          rating: 4.5,
          openingHours: (landmark as any).openingHours || "",
          googleMapsUrl: buildPlaceMapsUrl(landmark.name, landmark.address, undefined, landmark.lat, landmark.lng, landmark.placeId, landmark.dataCid),
        });
      }
    }

    return preserveExactDailyCountWithMeals(
      selected,
      Math.max(1, dayMaxActivities),
      requestedMeals,
      activities,
    );
  };

  const pickLandmarkByPreference = (
    candidates: PlaceInfo[],
    dayIndex: number,
    slotIndex: number,
    usedKeys: Set<string>,
    usedNames: Set<string>,
  ): PlaceInfo | null => {
    const rotatedInterests = getRotatedInterestsForDay(dayIndex);
    const focusedInterest = rotatedInterests.length > 0
      ? rotatedInterests[slotIndex % rotatedInterests.length]
      : "";

    if (focusedInterest) {
      const matchingCandidates = candidates.filter((candidate) => {
        if (!isCandidateUnused(candidate, usedKeys, usedNames)) return false;
        return activityMatchesSelectedInterests({
          name: candidate.nameAr || candidate.name,
          description: "",
          category: candidate.category,
          address: candidate.address,
        }, new Set([focusedInterest]));
      });

      const focusedPick = pickUniqueCandidate(matchingCandidates, usedKeys, usedNames, dayIndex * 7 + slotIndex);
      if (focusedPick) return focusedPick;
    }

    return pickUniqueCandidate(candidates, usedKeys, usedNames, dayIndex * 7 + slotIndex);
  };

  const strictMealRestaurants = (restaurants: RestaurantInfo[], mealType: string, cityName: string, dayIndex: number = 0): RestaurantInfo[] => {
    const byMeal = restaurants.filter((r) => r.type === mealType);
    const dayCuisine = getCuisineForDay(dayIndex);
    if (!dayCuisine) return byMeal.length > 0 ? byMeal : restaurants.filter(r => r.type === mealType || !r.type).slice(0, 3);
    const matched = byMeal.filter((r) => String(r.cuisine || "").toLowerCase().includes(dayCuisine));
    if (matched.length > 0) return matched;
    const byName = byMeal.filter((r) => String(r.name || "").toLowerCase().includes(dayCuisine));
    if (byName.length > 0) return byName;
    return [];
  };

  // Parse multi-city: either from cityLegs param or from destination string like "Gulf (Dubai, Abu Dhabi, Doha)"
  let resolvedCityLegs: { city: string; days: number; transport?: string }[] = [];
  if (cityLegs && cityLegs.length > 0) {
    resolvedCityLegs = cityLegs;
  } else {
    // Try to parse from destination string
    const parenMatch = destination.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const cities = parenMatch[1].split(',').map(c => c.trim()).filter(Boolean);
      if (cities.length > 1) {
        const daysPerCity = Math.max(1, Math.floor(duration / cities.length));
        let remainingDays = duration;
        resolvedCityLegs = cities.map((city, idx) => {
          const d = idx === cities.length - 1 ? remainingDays : Math.min(daysPerCity, remainingDays);
          remainingDays -= d;
          return { city, days: d, transport: 'flight' };
        });
      }
    }
  }

  const isMultiCity = resolvedCityLegs.length > 1;

  // For multi-city, generate days for each city
  if (isMultiCity) {
    const allDays: any[] = [];
    let dayOffset = 0;

    // SAFETY: Cap city count to prevent edge function timeout (each city ~10-15s of API calls).
    // Beyond 8 cities we skip the heavy SerpAPI enrichment and rely on AI + curated data only.
    const HEAVY_ENRICH_CAP = 8;
    const useHeavyEnrich = resolvedCityLegs.length <= HEAVY_ENRICH_CAP;

    // Pre-fetch all city data in parallel (with concurrency limit) to avoid sequential timeouts
    const cityDataMap = new Map<string, any>();
    if (useHeavyEnrich) {
      const fetchOne = async (cityName: string) => {
        try {
          let live = await Promise.race([
            buildDynamicCityData(cityName, requestedCuisine, interests),
            new Promise(res => setTimeout(() => res(null), 8000)),
          ]) as any;
          if (!live) {
            live = await Promise.race([
              buildDynamicCityDataSerper(cityName, requestedCuisine, interests),
              new Promise(res => setTimeout(() => res(null), 6000)),
            ]) as any;
          }
          cityDataMap.set(cityName, live);
        } catch { cityDataMap.set(cityName, null); }
      };
      // Run in batches of 3 to balance speed vs API rate limits
      const uniqueCities = Array.from(new Set(resolvedCityLegs.map(l => l.city)));
      for (let i = 0; i < uniqueCities.length; i += 3) {
        await Promise.all(uniqueCities.slice(i, i + 3).map(fetchOne));
      }
    }

    for (let legIdx = 0; legIdx < resolvedCityLegs.length; legIdx++) {
      const leg = resolvedCityLegs[legIdx];
      const cityKey = getCityKey(leg.city);
      const liveCityData = useHeavyEnrich ? cityDataMap.get(leg.city) : null;
      const cityData = mergeCityData(liveCityData, cityKey ? CITY_PLACES[cityKey] : null);

      const tripLandmarks = cityData
        ? preferUnseenByName(filterLandmarksBySelectedInterests(
            filterLandmarksByTripType(cityData.landmarks, { isRomantic, isFamily, isAdventure, isSolo, wantsSwimming: prefs.wantsSwimming }),
            selectedInterestSet,
          ))
        : [];

      for (let i = 0; i < leg.days; i++) {
        const globalDayIndex = dayOffset + i;
        const date = new Date(startDate);
        date.setDate(date.getDate() + globalDayIndex);
        const dayNumber = globalDayIndex + 1;
        const activities: any[] = [];

        const isFirstOverall = legIdx === 0 && i === 0;
        const isLastOverall = legIdx === resolvedCityLegs.length - 1 && i === leg.days - 1;

        // NOTE: Transport/hotel/car activities are handled in booking section,
        // NOT as daily activities. They get stripped in post-processing anyway.
        // Skipping them here to preserve activity count.

        if (cityData && tripLandmarks.length > 0) {
          const breakfasts = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "breakfast", leg.city, globalDayIndex));
          const lunches = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "lunch", leg.city, globalDayIndex));
          const dinners = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "dinner", leg.city, globalDayIndex));
          const snacks = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "snack", leg.city, globalDayIndex));

          let currentHour = i === 0 && legIdx > 0 ? startHour + 3 : startHour; // After transit

          // Hotel/car activities removed - handled in booking section

          const pushScheduled = (act: any, durationHours: number, forceHour?: number) => {
            const h = forceHour ?? currentHour;
            if (h > endHour) return;
            act.time = formatTime(h);
            activities.push(act);
            currentHour = h + durationHours + 0.25;
          };

          if (wantBreakfast) {
            let breakfastAdded = false;
            if (breakfasts.length > 0 && currentHour <= 10) {
              const br = pickUniqueCandidate(breakfasts, globalUsedKeys, globalUsedNames, globalDayIndex);
              if (br) {
                markCandidateUsed(br, globalUsedKeys, globalUsedNames);
                pushScheduled({
                  id: `d${dayNumber}-b`, name: br.nameAr || br.name,
                  description: `فطور في ${br.nameAr || br.name} (${br.name}) - ${leg.city}`,
                  category: "breakfast", duration: "1 hour", address: br.address,
                  latitude: br.lat, longitude: br.lng, cost: 15, rating: 4.5,
                  googleMapsUrl: buildPlaceMapsUrl(br.name, br.address, undefined, br.lat, br.lng, br.placeId, br.dataCid),
                }, 1);
                breakfastAdded = true;
              }
            }
            if (!breakfastAdded) {
              const dayCuisine = getCuisineForMealSlot(globalDayIndex, "breakfast");
              const serpBr = await searchSpecificMealRestaurant("breakfast", leg.city, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
              if (serpBr) {
                const breakfastActivity = buildMealActivityFromRestaurant(serpBr, "breakfast", dayNumber, leg.city, Math.max(startHour + 1, 8), startHour, endHour);
                markCandidateUsed(breakfastActivity, globalUsedKeys, globalUsedNames);
                pushScheduled(breakfastActivity, 1);
              }
            }
          }

          const daySpecialRequests = specialRequestInjections.filter((sr) => !sr.forDay || sr.forDay === dayNumber);
          for (const sr of daySpecialRequests) {
            if (sr.anchor) continue;
            if (activities.length >= maxActivitiesPerDay) break;
            if (activities.some((activity: any) => activityMatchesSpecialRequest(activity, sr.query))) continue;
            // Honor user-specified time exactly when provided (e.g. match at 12:00 stays at 12:00)
            const srForceHour = (() => {
              if (!sr.preferredTime) return undefined;
              const m = String(sr.preferredTime).match(/^(\d{1,2}):(\d{2})$/);
              if (!m) return undefined;
              const h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
              return Number.isFinite(h) ? h : undefined;
            })();
            try {
              const srActivity = {
                id: `d${dayNumber}-sr-${activities.length + 1}`,
                name: `${sr.query} in ${leg.city}`,
                description: sr.query,
                category: sr.category,
                time: sr.preferredTime || formatTime(Math.max(currentHour, sr.category === "dinner" ? 19 : sr.category === "breakfast" ? 8 : 11)),
                duration: ["breakfast", "lunch", "dinner", "snack"].includes(sr.category) ? "1.5 hours" : "2 hours",
                address: leg.city,
                latitude: 0,
                longitude: 0,
                cost: 20,
                rating: 4.5,
              };
              const resolved = await searchSpecificActivityPlace(srActivity, leg.city, prefs, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
              if (resolved && !looksGenericActivity(resolved, leg.city) && !looksOutOfCityContext(resolved, leg.city) && isCandidateUnused(resolved, globalUsedKeys, globalUsedNames)) {
                resolved.matchReason = `طلب خاص: ${sr.query}`;
                if (sr.preferredTime) {
                  (resolved as any).timeLocked = true;
                  (resolved as any).startTime = sr.preferredTime;
                }
                markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
                pushScheduled(resolved, ["breakfast", "lunch", "dinner", "snack"].includes(String(resolved?.category || "").toLowerCase()) ? 1.5 : 2, srForceHour);
              }
            } catch {
              // noop
            }
          }

          // Generate landmarks per day: maxActivitiesPerDay minus meals (incl. snack)
          const mealSlotsMulti = (wantBreakfast ? 1 : 0) + (wantLunch ? 1 : 0) + (wantDinner ? 1 : 0) + (prefs.wantSnacks ? 1 : 0);
          const existingSpecialSlots = activities.filter((activity: any) => !["breakfast", "lunch", "dinner", "snack"].includes(String(activity?.category || "").toLowerCase()) && String(activity?.matchReason || "").includes("طلب خاص")).length;
          const availableNonMealSlots = Math.max(0, maxActivitiesPerDay - mealSlotsMulti - existingSpecialSlots);
          const landmarksPerDay = Math.min(availableNonMealSlots, tripLandmarks.length);
          for (let lIdx = 0; lIdx < landmarksPerDay; lIdx++) {
            if (currentHour > endHour - 1) break;
            if (activities.length >= maxActivitiesPerDay) break;
            const lm = pickLandmarkByPreference(tripLandmarks, globalDayIndex, lIdx, globalUsedKeys, globalUsedNames);
            if (!lm) continue;
            markCandidateUsed(lm, globalUsedKeys, globalUsedNames);

            // Insert lunch after 2nd landmark
            if (lIdx === 2 && wantLunch && !activities.some((a: any) => a.category === "lunch")) {
              let lunchAdded = false;
              if (lunches.length > 0) {
                const lu = pickUniqueCandidate(lunches, globalUsedKeys, globalUsedNames, globalDayIndex);
                if (lu) {
                  markCandidateUsed(lu, globalUsedKeys, globalUsedNames);
                  pushScheduled({
                    id: `d${dayNumber}-l`, name: lu.nameAr || lu.name,
                    description: `غداء في ${lu.nameAr || lu.name} (${lu.name}) - ${leg.city}`,
                    category: "lunch", duration: "1.5 hours", address: lu.address,
                    latitude: lu.lat, longitude: lu.lng, cost: 30, rating: 4.5,
                    googleMapsUrl: buildPlaceMapsUrl(lu.name, lu.address, undefined, lu.lat, lu.lng, lu.placeId, lu.dataCid),
                  }, 1.5, Math.max(currentHour, 12));
                  lunchAdded = true;
                }
              }
              if (!lunchAdded) {
                const dayCuisine = getCuisineForMealSlot(globalDayIndex, "lunch");
                const serpLu = await searchSpecificMealRestaurant("lunch", leg.city, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
                if (serpLu) {
                  const lunchActivity = buildMealActivityFromRestaurant(serpLu, "lunch", dayNumber, leg.city, Math.max(currentHour, 12), startHour, endHour);
                  markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
                  pushScheduled(lunchActivity, 1.5, Math.max(currentHour, 12));
                }
              }
            }

            const multiLmShape = { name: lm.nameAr || lm.name, category: lm.category, address: lm.address };
            const multiInterestTag = detectActivityInterestTag(multiLmShape, selectedInterestSet);
            pushScheduled({
              id: `d${dayNumber}-a${lIdx + 1}`, name: lm.nameAr || lm.name,
              description: `${lIdx === 0 ? 'زيارة' : lIdx === 1 ? 'استكشاف' : 'جولة في'} ${lm.nameAr || lm.name} (${lm.name}) في ${leg.city}`,
              category: getInterestAlignedCategory(multiLmShape, selectedInterestSet, lm.category),
              duration: "1.5 hours", address: lm.address,
              latitude: lm.lat, longitude: lm.lng, cost: 15 + lIdx * 5, rating: 4.4 + (lIdx === 0 ? 0.2 : 0),
              matchReason: multiInterestTag || undefined,
              googleMapsUrl: buildPlaceMapsUrl(lm.name, lm.address, undefined, lm.lat, lm.lng, lm.placeId, lm.dataCid),
            }, 1.5);
          }

          // Insert lunch if not yet added
          if (wantLunch && !activities.some((a: any) => a.category === "lunch")) {
            let lunchAdded = false;
            if (lunches.length > 0) {
              const lu = pickUniqueCandidate(lunches, globalUsedKeys, globalUsedNames, globalDayIndex);
              if (lu) {
                markCandidateUsed(lu, globalUsedKeys, globalUsedNames);
                pushScheduled({
                  id: `d${dayNumber}-l`, name: lu.nameAr || lu.name,
                  description: `غداء في ${lu.nameAr || lu.name} (${lu.name}) - ${leg.city}`,
                  category: "lunch", duration: "1.5 hours", address: lu.address,
                  latitude: lu.lat, longitude: lu.lng, cost: 30, rating: 4.5,
                  googleMapsUrl: buildPlaceMapsUrl(lu.name, lu.address, undefined, lu.lat, lu.lng, lu.placeId, lu.dataCid),
                }, 1.5, Math.max(currentHour, 12));
                lunchAdded = true;
              }
            }
            if (!lunchAdded) {
              const dayCuisine = getCuisineForMealSlot(globalDayIndex, "lunch");
              const serpLu = await searchSpecificMealRestaurant("lunch", leg.city, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
              if (serpLu) {
                const lunchActivity = buildMealActivityFromRestaurant(serpLu, "lunch", dayNumber, leg.city, Math.max(currentHour, 12), startHour, endHour);
                markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
                pushScheduled(lunchActivity, 1.5, Math.max(currentHour, 12));
              }
            }
          }

          if (wantDinner) {
            let dinnerAdded = false;
            if (dinners.length > 0) {
              const di = pickUniqueCandidate(dinners, globalUsedKeys, globalUsedNames, globalDayIndex);
              if (di) {
                markCandidateUsed(di, globalUsedKeys, globalUsedNames);
                pushScheduled({
                  id: `d${dayNumber}-d`, name: di.nameAr || di.name,
                  description: `عشاء في ${di.nameAr || di.name} (${di.name}) - ${leg.city}`,
                  category: "dinner", duration: "1.5 hours", address: di.address,
                  latitude: di.lat, longitude: di.lng, cost: 50, rating: 4.6,
                  googleMapsUrl: buildPlaceMapsUrl(di.name, di.address, undefined, di.lat, di.lng, di.placeId, di.dataCid),
                }, 1.5, Math.max(currentHour, 19));
                dinnerAdded = true;
              }
            }
            if (!dinnerAdded) {
              const dayCuisine = getCuisineForMealSlot(globalDayIndex, "dinner");
              const serpDi = await searchSpecificMealRestaurant("dinner", leg.city, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
              if (serpDi) {
                const dinnerActivity = buildMealActivityFromRestaurant(serpDi, "dinner", dayNumber, leg.city, Math.min(endHour - 1, 19), startHour, endHour);
                markCandidateUsed(dinnerActivity, globalUsedKeys, globalUsedNames);
                pushScheduled(dinnerActivity, 1.5, Math.max(currentHour, 19));
              }
            }
          }

          if (prefs.wantSnacks) {
            let snackAdded = false;
            if (snacks.length > 0) {
              const sn = pickUniqueCandidate(snacks, globalUsedKeys, globalUsedNames, globalDayIndex);
              if (sn) {
                markCandidateUsed(sn, globalUsedKeys, globalUsedNames);
                pushScheduled({
                  id: `d${dayNumber}-s`, name: sn.nameAr || sn.name,
                  description: `وجبة خفيفة في ${sn.nameAr || sn.name} (${sn.name}) - ${leg.city}`,
                  category: "snack", duration: "1 hour", address: sn.address,
                  latitude: sn.lat, longitude: sn.lng, cost: 15, rating: 4.4,
                  googleMapsUrl: buildPlaceMapsUrl(sn.name, sn.address, undefined, sn.lat, sn.lng, sn.placeId, sn.dataCid),
                }, 1, Math.max(currentHour, 16));
                snackAdded = true;
              }
            }
            if (!snackAdded) {
              const dayCuisine = getCuisineForMealSlot(globalDayIndex, "snack");
              const serpSnack = await searchSpecificMealRestaurant("snack", leg.city, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
              if (serpSnack) {
                const snackActivity = buildMealActivityFromRestaurant(serpSnack, "snack", dayNumber, leg.city, Math.max(currentHour, 16), startHour, endHour);
                markCandidateUsed(snackActivity, globalUsedKeys, globalUsedNames);
                pushScheduled(snackActivity, 1, Math.max(currentHour, 16));
              }
            }
          }
          
          // STRICT DAILY CAP — meals (incl. snack) count toward total
          if (activities.length > maxActivitiesPerDay) {
            const meals = activities.filter((a: any) => ["breakfast","lunch","dinner","snack"].includes(String(a?.category||"").toLowerCase()));
            const nonMeals = activities.filter((a: any) => !["breakfast","lunch","dinner","snack"].includes(String(a?.category||"").toLowerCase()));
            const nonMealSlotsCap = Math.max(0, maxActivitiesPerDay - meals.length);
            activities.length = 0;
            activities.push(...meals, ...nonMeals.slice(0, nonMealSlotsCap));
            activities.sort((a: any, b: any) => {
              const tA = (a.time || "12:00").replace(/[^0-9:]/g, "");
              const tB = (b.time || "12:00").replace(/[^0-9:]/g, "");
              return tA.localeCompare(tB);
            });
          }
        } else {
            const mealBudget = (wantBreakfast ? 1 : 0) + (wantLunch ? 1 : 0) + (wantDinner ? 1 : 0) + (prefs.wantSnacks ? 1 : 0);
          const nonMealSlots = Math.max(0, maxActivitiesPerDay - mealBudget);
          const interestSeeds = buildInterestSearchSeeds(leg.city, selectedInterestSet, prefs);
          const baseTime = startHour + (i === 0 && legIdx > 0 ? 3 : 0);

          if (wantBreakfast) {
            const breakfast = await searchSpecificMealRestaurant("breakfast", leg.city, getCuisineForMealSlot(globalDayIndex, "breakfast"), excludeActivityNames);
            if (breakfast) {
              activities.push(buildMealActivityFromRestaurant(breakfast, "breakfast", dayNumber, leg.city, Math.max(startHour + 1, 8), startHour, endHour));
            }
          }

          const seedOffset = globalDayIndex * Math.max(nonMealSlots, 3);
          for (let slot = 0; slot < nonMealSlots; slot++) {
            const seed = interestSeeds[(seedOffset + slot) % Math.max(interestSeeds.length, 1)] || {
              query: `real specific attraction in ${leg.city}`,
              category: "attraction",
              description: `specific attraction in ${leg.city}`,
            };
            const seededActivity = {
              id: `d${dayNumber}-dynamic-a${slot + 1}`,
              name: seed.query,
              description: seed.description,
              category: seed.category,
              time: formatTime(Math.max(baseTime + slot * 2, 10 + slot * 2)),
              duration: "1.5 hours",
              address: leg.city,
              latitude: 0,
              longitude: 0,
              cost: 20,
              rating: 4.4,
            };
            const resolvedActivity = await searchSpecificActivityPlace(seededActivity, leg.city, prefs, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
            if (resolvedActivity) activities.push(resolvedActivity);
          }

          if (wantLunch) {
            const lunch = await searchSpecificMealRestaurant("lunch", leg.city, getCuisineForMealSlot(globalDayIndex, "lunch"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
            if (lunch) {
              const lunchActivity = buildMealActivityFromRestaurant(lunch, "lunch", dayNumber, leg.city, Math.max(startHour + 4, 12), startHour, endHour);
              markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
              activities.push(lunchActivity);
            }
          }

          if (wantDinner) {
            const dinner = await searchSpecificMealRestaurant("dinner", leg.city, getCuisineForMealSlot(globalDayIndex, "dinner"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
            if (dinner) {
              const dinnerActivity = buildMealActivityFromRestaurant(dinner, "dinner", dayNumber, leg.city, Math.min(endHour - 1, 19), startHour, endHour);
              markCandidateUsed(dinnerActivity, globalUsedKeys, globalUsedNames);
              activities.push(dinnerActivity);
            }
          }

          if (prefs.wantSnacks) {
            const snack = await searchSpecificMealRestaurant("snack", leg.city, getCuisineForMealSlot(globalDayIndex, "snack"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
            if (snack) {
              const snackActivity = buildMealActivityFromRestaurant(snack, "snack", dayNumber, leg.city, Math.max(startHour + 6, 16), startHour, endHour);
              markCandidateUsed(snackActivity, globalUsedKeys, globalUsedNames);
              activities.push(snackActivity);
            }
          }
        }

        // Hotel checkout, car dropoff, return flight - all handled in booking section, not as activities

        const finalizedActivities = await finalizeExactDayActivities(activities, leg.city, dayNumber, globalDayIndex);
        allDays.push({ dayNumber, date: date.toISOString().split("T")[0], activities: finalizedActivities, cityName: leg.city });
      }
      dayOffset += leg.days;
    }

    const firstCity = resolvedCityLegs[0].city;
    const lastCity = resolvedCityLegs[resolvedCityLegs.length - 1].city;
    const origIata = resolveIataFallback(departureCity || "Riyadh");
    const destIata = resolveIataFallback(firstCity);
    const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + Math.max(0, duration - 1));

    return {
      destination: resolvedCityLegs.map(l => l.city).join(' → '),
      cityOverview: {
        description: `جولة متعددة المدن تشمل: ${resolvedCityLegs.map(l => `${l.city} (${l.days} أيام)`).join('، ')}`,
        country: destination.replace(/\s*\([^)]*\)\s*/, ''),
        language: "", currency: "", timezone: "",
        bestTimeToVisit: "الربيع والخريف",
        highlights: resolvedCityLegs.map(l => `${l.city} - ${l.days} أيام`),
        customs: ["احترم العادات المحلية", "احمل بطاقة الهوية دائماً"],
        emergencyNumbers: { police: "112", ambulance: "112", fire: "112" },
        usefulPhrases: [],
        transportation: "طيران بين المدن، مواصلات محلية داخل كل مدينة",
        safety: "استخدم وسائل النقل الرسمية",
      },
      travelMetadata: { originIATA: origIata, destinationIATA: destIata, startDate, endDate: endDate.toISOString().split("T")[0], adults: Math.max(1, Number(travelers) || 1) },
      days: allDays,
      estimatedTotalCost: allDays.reduce((s: number, d: any) => s + (d.activities || []).reduce((a: number, act: any) => a + (Number(act.cost) || 0), 0), 0),
      tips: [
        "احجز رحلات الطيران بين المدن مبكراً للحصول على أفضل الأسعار.",
        "خصص وقتاً كافياً للتنقل بين المدن.",
        "جرّب المأكولات المحلية في كل مدينة.",
        "تحقق من متطلبات التأشيرة لكل دولة.",
        "احتفظ بنسخة من جواز السفر في مكان آمن.",
      ],
    };
  }

  // Single city fallback (original logic)
  const cityKey = getCityKey(destination);
  const baseCityData = cityKey ? CITY_PLACES[cityKey] : null;
  let dynamicCityData: CityData | null = await buildDynamicCityData(destination, requestedCuisine, interests);
  if (!dynamicCityData) {
    dynamicCityData = await buildDynamicCityDataSerper(destination, requestedCuisine, interests);
  }
  const cityData = mergeCityData(dynamicCityData, baseCityData);

  const tripLandmarks = cityData
    ? preferUnseenByName(filterLandmarksBySelectedInterests(
        filterLandmarksByTripType(cityData.landmarks, { isRomantic, isFamily, isAdventure, isSolo, wantsSwimming: prefs.wantsSwimming }),
        selectedInterestSet,
      ))
    : [];

  // Sequential loop to prevent race conditions with globalUsedKeys/globalUsedNames
  const days: any[] = [];
  for (let index = 0; index < duration; index++) {
    const dayResult = await (async () => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + index);
    const dayNumber = index + 1;
    const activities: any[] = [];
    const isFirstDay = index === 0;
    const isLastDay = index === duration - 1;

    // NOTE: Flights, hotels, and car rentals are handled in the booking section,
    // NOT as daily activities. Only activities + restaurants go here.

    if (cityData && tripLandmarks.length > 0) {
      const breakfasts = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "breakfast", destination, index));
      const lunches = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "lunch", destination, index));
      const dinners = preferUnseenByName(strictMealRestaurants(cityData.restaurants, "dinner", destination, index));
      let currentHour = startHour;

      const pushScheduled = (act: any, durationHours: number, forceHour?: number) => {
        const h = forceHour ?? currentHour;
        if (h > endHour) return;
        act.time = formatTime(h);
        activities.push(act);
        currentHour = h + durationHours + 0.25;
      };

      // Breakfast - only if user selected it
      // FIX: When curated cuisine doesn't match, fall back to SerpAPI live search
      if (wantBreakfast) {
        let breakfastAdded = false;
        if (breakfasts.length > 0) {
          const br = pickUniqueCandidate(breakfasts, globalUsedKeys, globalUsedNames, index);
          if (br) {
            markCandidateUsed(br, globalUsedKeys, globalUsedNames);
            pushScheduled({
              id: `d${dayNumber}-b`, name: br.nameAr || br.name,
              description: `فطور في ${br.nameAr || br.name} (${br.name})`,
              category: "breakfast", duration: "1 hour", address: br.address,
              latitude: br.lat, longitude: br.lng, cost: 15, rating: 4.5,
              googleMapsUrl: buildPlaceMapsUrl(br.name, br.address, undefined, br.lat, br.lng, br.placeId, br.dataCid),
            }, 1);
            breakfastAdded = true;
          }
        }
        // SerpAPI fallback when curated data has no matching cuisine
        if (!breakfastAdded) {
          const dayCuisine = getCuisineForMealSlot(index, "breakfast");
          const serpBreakfast = await searchSpecificMealRestaurant("breakfast", destination, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (serpBreakfast) {
            const breakfastActivity = buildMealActivityFromRestaurant(serpBreakfast, "breakfast", dayNumber, destination, Math.max(startHour + 1, 8), startHour, endHour);
            markCandidateUsed(breakfastActivity, globalUsedKeys, globalUsedNames);
            pushScheduled(breakfastActivity, 1);
          }
        }
      }

      // ── INJECT SPECIAL REQUESTS as activities (main city-data path) ──
      const daySpecialRequests = specialRequestInjections.filter(sr => !sr.forDay || sr.forDay === dayNumber);
      const srStartIdx = index % Math.max(daySpecialRequests.length, 1);
      const rotatedSRs = [...daySpecialRequests.slice(srStartIdx), ...daySpecialRequests.slice(0, srStartIdx)];
      for (const sr of rotatedSRs) {
        if (sr.anchor) continue;
        if (activities.length >= maxActivitiesPerDay) break;
        // Honor user-specified time exactly when provided (e.g. match at 12:00 stays at 12:00)
        const srForceHour = (() => {
          if (!sr.preferredTime) return undefined;
          const m = String(sr.preferredTime).match(/^(\d{1,2}):(\d{2})$/);
          if (!m) return undefined;
          const h = parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
          return Number.isFinite(h) ? h : undefined;
        })();
        // Allow user-pinned time even if currentHour has passed normal cutoff
        if (srForceHour === undefined && currentHour > endHour - 1) break;
        try {
          const citySpecificQuery = `${sr.query} in ${destination}`;
          const srActivity = {
            id: `d${dayNumber}-sr-${activities.length + 1}`,
            name: citySpecificQuery,
            description: sr.query,
            category: sr.category,
            time: sr.preferredTime || formatTime(currentHour),
            duration: "1.5 hours",
            address: destination,
            latitude: 0, longitude: 0,
            cost: 20, rating: 4.5,
          };
          const resolved = await searchSpecificActivityPlace(srActivity, destination, prefs, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (resolved && !looksGenericActivity(resolved, destination) && isCandidateUnused(resolved, globalUsedKeys, globalUsedNames)) {
            resolved.matchReason = `طلب خاص: ${sr.query}`;
            if (sr.preferredTime) {
              (resolved as any).timeLocked = true;
              (resolved as any).startTime = sr.preferredTime;
            }
            markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
            pushScheduled(resolved, 1.5, srForceHour);
          }
        } catch {}
      }

      // Determine how many landmarks to schedule: maxActivitiesPerDay minus meals minus special requests
      const mealSlots = (wantBreakfast ? 1 : 0) + (wantLunch ? 1 : 0) + (wantDinner ? 1 : 0);
      const existingSRCount = activities.filter((a: any) => String(a?.matchReason || "").includes("طلب خاص")).length;
      const availableNonMealSlots = Math.max(0, maxActivitiesPerDay - mealSlots - existingSRCount);
      const landmarksPerDay = Math.min(availableNonMealSlots, tripLandmarks.length);

      const interestSearchSeeds = balanceSerpSeedsByInterest(
        buildInterestSearchSeeds(destination, selectedInterestSet, prefs),
        selectedInterestSet,
        Math.max(Math.max(availableNonMealSlots, 1) * Math.max(duration, 1), selectedInterestSet.size * 2, 6),
      );
      
      for (let lIdx = 0; lIdx < landmarksPerDay; lIdx++) {
        if (currentHour > endHour - 1) break;
        if (activities.length >= maxActivitiesPerDay) break; // STRICT daily cap check
        
        let lm = pickLandmarkByPreference(tripLandmarks, index, lIdx, globalUsedKeys, globalUsedNames);
        
        // If curated landmarks exhausted but interests remain, search SerpAPI dynamically
        if (!lm && interestSearchSeeds.length > 0) {
          const seedOffset = index * Math.max(landmarksPerDay, 3);
          const queryIdx = (seedOffset + lIdx) % interestSearchSeeds.length;
          const seed = interestSearchSeeds[queryIdx];
          const placeholder = {
            id: `d${dayNumber}-interest-${lIdx + 1}`,
            name: seed.query,
            description: seed.description,
            category: seed.category,
            time: formatTime(currentHour),
            duration: "1.5 hours",
            address: destination,
            latitude: 0, longitude: 0, cost: 20, rating: 4.4,
          };
          const resolved = await searchSpecificActivityPlace(placeholder, destination, prefs, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (resolved && !looksGenericActivity(resolved, destination) && !looksOutOfCityContext(resolved, destination)) {
            resolved.matchReason = resolved.matchReason || detectActivityInterestTag(resolved, selectedInterestSet);
            resolved.category = getInterestAlignedCategory(resolved, selectedInterestSet, resolved.category);
            pushScheduled(resolved, 1.5);
            markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
            continue;
          }
        }
        
        if (!lm) continue;
        markCandidateUsed(lm, globalUsedKeys, globalUsedNames);

        // Insert lunch after 2nd landmark - only if user selected lunch
        if (lIdx === 2 && wantLunch && !activities.some((a: any) => a.category === "lunch")) {
          let lunchAdded = false;
          if (lunches.length > 0) {
            const lu = pickUniqueCandidate(lunches, globalUsedKeys, globalUsedNames, index);
            if (lu) {
              markCandidateUsed(lu, globalUsedKeys, globalUsedNames);
              pushScheduled({
                id: `d${dayNumber}-l`, name: lu.nameAr || lu.name,
                description: `غداء في ${lu.nameAr || lu.name} (${lu.name})`,
                category: "lunch", duration: "1.5 hours", address: lu.address,
                latitude: lu.lat, longitude: lu.lng, cost: 30, rating: 4.5,
                googleMapsUrl: buildPlaceMapsUrl(lu.name, lu.address, undefined, lu.lat, lu.lng, lu.placeId, lu.dataCid),
              }, 1.5, Math.max(currentHour, 12));
              lunchAdded = true;
            }
          }
          // SerpAPI fallback for lunch
          if (!lunchAdded) {
            const dayCuisine = getCuisineForMealSlot(index, "lunch");
            const serpLunch = await searchSpecificMealRestaurant("lunch", destination, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
            if (serpLunch) {
              const lunchActivity = buildMealActivityFromRestaurant(serpLunch, "lunch", dayNumber, destination, Math.max(currentHour, 12), startHour, endHour);
              markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
              pushScheduled(lunchActivity, 1.5, Math.max(currentHour, 12));
            }
          }
        }

        const lmShape = { name: lm.nameAr || lm.name, category: lm.category, address: lm.address };
        const interestTag = detectActivityInterestTag(lmShape, selectedInterestSet);
        pushScheduled({
          id: `d${dayNumber}-a${lIdx + 1}`, name: lm.nameAr || lm.name,
          description: `${lIdx === 0 ? 'زيارة' : lIdx === 1 ? 'استكشاف' : 'جولة في'} ${lm.nameAr || lm.name} (${lm.name})`,
          category: getInterestAlignedCategory(lmShape, selectedInterestSet, lm.category),
          duration: "1.5 hours", address: lm.address,
          latitude: lm.lat, longitude: lm.lng, cost: 15 + lIdx * 5, rating: 4.4 + (lIdx === 0 ? 0.2 : 0),
          matchReason: interestTag || undefined,
          googleMapsUrl: buildPlaceMapsUrl(lm.name, lm.address, undefined, lm.lat, lm.lng, lm.placeId, lm.dataCid),
        }, 1.5);
      }

      // Insert lunch if not yet added and user wants it
      if (wantLunch && !activities.some((a: any) => a.category === "lunch")) {
        let lunchAdded = false;
        if (lunches.length > 0) {
          const lu = pickUniqueCandidate(lunches, globalUsedKeys, globalUsedNames, index);
          if (lu) {
            markCandidateUsed(lu, globalUsedKeys, globalUsedNames);
            pushScheduled({
              id: `d${dayNumber}-l`, name: lu.nameAr || lu.name,
              description: `غداء في ${lu.nameAr || lu.name} (${lu.name})`,
              category: "lunch", duration: "1.5 hours", address: lu.address,
              latitude: lu.lat, longitude: lu.lng, cost: 30, rating: 4.5,
              googleMapsUrl: buildPlaceMapsUrl(lu.name, lu.address, undefined, lu.lat, lu.lng, lu.placeId, lu.dataCid),
            }, 1.5, Math.max(currentHour, 12));
            lunchAdded = true;
          }
        }
        // SerpAPI fallback for lunch
        if (!lunchAdded) {
          const dayCuisine = getCuisineForMealSlot(index, "lunch");
          const serpLunch = await searchSpecificMealRestaurant("lunch", destination, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (serpLunch) {
            const lunchActivity = buildMealActivityFromRestaurant(serpLunch, "lunch", dayNumber, destination, Math.max(currentHour, 12), startHour, endHour);
            markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
            pushScheduled(lunchActivity, 1.5, Math.max(currentHour, 12));
          }
        }
      }

      // Dinner - only if user selected it
      if (wantDinner) {
        let dinnerAdded = false;
        if (dinners.length > 0) {
          const di = pickUniqueCandidate(dinners, globalUsedKeys, globalUsedNames, index);
          if (di) {
            markCandidateUsed(di, globalUsedKeys, globalUsedNames);
            pushScheduled({
              id: `d${dayNumber}-d`, name: di.nameAr || di.name,
              description: `عشاء في ${di.nameAr || di.name} (${di.name})`,
              category: "dinner", duration: "1.5 hours", address: di.address,
              latitude: di.lat, longitude: di.lng, cost: 50, rating: 4.6,
              googleMapsUrl: buildPlaceMapsUrl(di.name, di.address, undefined, di.lat, di.lng, di.placeId, di.dataCid),
            }, 1.5, Math.max(currentHour, 18));
            dinnerAdded = true;
          }
        }
        // SerpAPI fallback for dinner
        if (!dinnerAdded) {
          const dayCuisine = getCuisineForMealSlot(index, "dinner");
          const serpDinner = await searchSpecificMealRestaurant("dinner", destination, dayCuisine, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (serpDinner) {
            const dinnerActivity = buildMealActivityFromRestaurant(serpDinner, "dinner", dayNumber, destination, Math.min(endHour - 1, 19), startHour, endHour);
            markCandidateUsed(dinnerActivity, globalUsedKeys, globalUsedNames);
            pushScheduled(dinnerActivity, 1.5, Math.max(currentHour, 18));
          }
        }
      }
      
      // STRICT DAILY CAP: Final enforcement during generation (snack included as meal slot)
      if (activities.length > maxActivitiesPerDay) {
        const meals = activities.filter((a: any) => ["breakfast","lunch","dinner","snack"].includes(String(a?.category||"").toLowerCase()));
        const nonMeals = activities.filter((a: any) => !["breakfast","lunch","dinner","snack"].includes(String(a?.category||"").toLowerCase()));
        const nonMealSlotsCap = Math.max(0, maxActivitiesPerDay - meals.length);
        activities.length = 0;
        activities.push(...meals, ...nonMeals.slice(0, nonMealSlotsCap));
        activities.sort((a: any, b: any) => {
          const tA = (a.time || "12:00").replace(/[^0-9:]/g, "");
          const tB = (b.time || "12:00").replace(/[^0-9:]/g, "");
          return tA.localeCompare(tB);
        });
      }
    } else {
      // Inject special request activities - distribute across days (rotate which SR gets priority)
      const daySpecialRequests = specialRequestInjections.filter(sr => !sr.forDay || sr.forDay === dayNumber);
      // On each day, pick a different subset of special requests to ensure variety
      const srStartIdx = index % Math.max(daySpecialRequests.length, 1);
      const rotatedSRs = [...daySpecialRequests.slice(srStartIdx), ...daySpecialRequests.slice(0, srStartIdx)];
      
      for (const sr of rotatedSRs) {
        if (sr.anchor) continue;
        if (activities.length >= maxActivitiesPerDay) break;
        try {
          // Make the search query city-specific for better results
          const citySpecificQuery = `${sr.query} in ${destination}`;
          const srActivity = {
            id: `d${dayNumber}-sr-${activities.length + 1}`,
            name: citySpecificQuery,
            description: sr.query,
            category: sr.category,
            time: formatTime(Math.max(startHour + 2, 10)),
            duration: "2 hours",
            address: destination,
            latitude: 0, longitude: 0,
            cost: 20, rating: 4.5,
          };
          const resolved = await searchSpecificActivityPlace(srActivity, destination, prefs, buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
          if (resolved && !looksGenericActivity(resolved, destination)) {
            resolved.matchReason = `✨ ${sr.query}`;
            activities.push(resolved);
            markCandidateUsed(resolved, globalUsedKeys, globalUsedNames);
          }
        } catch {}
      }

      const mealBudget = (wantBreakfast ? 1 : 0) + (wantLunch ? 1 : 0) + (wantDinner ? 1 : 0) + (prefs.wantSnacks ? 1 : 0);
      const existingNonMeal = activities.filter((a: any) => !["breakfast","lunch","dinner","snack"].includes(String(a?.category||"").toLowerCase())).length;
      const nonMealSlots = Math.max(0, maxActivitiesPerDay - mealBudget - existingNonMeal);

      if (wantBreakfast) {
        const breakfast = await searchSpecificMealRestaurant("breakfast", destination, getCuisineForMealSlot(index, "breakfast"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
        if (breakfast) {
          const breakfastActivity = buildMealActivityFromRestaurant(breakfast, "breakfast", dayNumber, destination, Math.max(startHour + 1, 8), startHour, endHour);
          markCandidateUsed(breakfastActivity, globalUsedKeys, globalUsedNames);
          activities.push(breakfastActivity);
        }
      }

      const interestSeeds = balanceSerpSeedsByInterest(
        buildInterestSearchSeeds(destination, selectedInterestSet, prefs),
        selectedInterestSet,
        Math.max(Math.max(nonMealSlots, 1) * Math.max(duration, 1), selectedInterestSet.size * 2, 6),
      );
      // Offset seed index by day number to avoid repeating same activities across days
      const seedOffset = index * Math.max(nonMealSlots, 3);
      for (let slot = 0; slot < nonMealSlots; slot++) {
        const seedIdx = (seedOffset + slot) % Math.max(interestSeeds.length, 1);
        const seed = interestSeeds[seedIdx] || {
          query: `real specific attraction in ${destination}`,
          category: "attraction",
          description: `specific attraction in ${destination}`,
        };
        const seededActivity = {
          id: `d${dayNumber}-dynamic-a${slot + 1}`,
          name: seed.query,
          description: seed.description,
          category: seed.category,
          time: formatTime(Math.max(startHour + slot * 2, 10 + slot * 2)),
          duration: "1.5 hours",
          address: destination,
          latitude: 0,
          longitude: 0,
          cost: 20,
          rating: 4.4,
        };
        const excludeAll = mergeExcludedNames([...activities.map((act: any) => act?.name || ""), ...Array.from(globalUsedNames)]);
        const resolvedActivity = await searchSpecificActivityPlace(seededActivity, destination, prefs, excludeAll);
        if (resolvedActivity && isCandidateUnused(resolvedActivity, globalUsedKeys, globalUsedNames)) {
          markCandidateUsed(resolvedActivity, globalUsedKeys, globalUsedNames);
          activities.push(resolvedActivity);
        }
      }

      if (wantLunch) {
        const lunch = await searchSpecificMealRestaurant("lunch", destination, getCuisineForMealSlot(index, "lunch"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
        if (lunch) {
          const lunchActivity = buildMealActivityFromRestaurant(lunch, "lunch", dayNumber, destination, Math.min(endHour - 1, Math.max(startHour + 3, 12)), startHour, endHour);
          markCandidateUsed(lunchActivity, globalUsedKeys, globalUsedNames);
          activities.push(lunchActivity);
        }
      }

      if (wantDinner) {
        const dinner = await searchSpecificMealRestaurant("dinner", destination, getCuisineForMealSlot(index, "dinner"), buildExcludedNameList(excludeActivityNames, globalUsedNames, activities));
        if (dinner) {
          const dinnerActivity = buildMealActivityFromRestaurant(dinner, "dinner", dayNumber, destination, Math.min(endHour - 1, 19), startHour, endHour);
          markCandidateUsed(dinnerActivity, globalUsedKeys, globalUsedNames);
          activities.push(dinnerActivity);
        }
      }
    }

    const finalizedActivities = await finalizeExactDayActivities(activities, destination, dayNumber, index);
    return { dayNumber, date: date.toISOString().split("T")[0], activities: finalizedActivities };
    })();
    days.push(dayResult);
  }

  const destIata = resolveIataFallback(destination);
  const origIata = resolveIataFallback(departureCity || "Riyadh");
  const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + Math.max(0, duration - 1));

  return {
    destination,
    cityOverview: {
      description: cityKey === "istanbul" ? "إسطنبول، المدينة التي تجمع بين عراقة التاريخ وروعة الحداثة." :
        cityKey === "cairo" ? "القاهرة، عاصمة مصر وأكبر مدنها، مدينة الألف مئذنة." :
        cityKey === "dubai" ? "دبي، مدينة الأحلام والأبراج الشاهقة." :
        `خطة سفر إلى ${destination}`,
      country: "",
      language: "",
      currency: "",
      timezone: "",
      bestTimeToVisit: "الربيع والخريف",
      highlights: [`أبرز معالم ${destination}`],
      customs: ["احترم العادات المحلية", "احمل بطاقة الهوية دائماً"],
      emergencyNumbers: { police: "112", ambulance: "112", fire: "112" },
      usefulPhrases: [],
      transportation: "وسائل نقل متنوعة متاحة.",
      safety: "استخدم وسائل النقل الرسمية.",
    },
    travelMetadata: { originIATA: origIata, destinationIATA: destIata, startDate, endDate: endDate.toISOString().split("T")[0], adults: Math.max(1, Number(travelers) || 1) },
    days,
    estimatedTotalCost: days.reduce((s: number, d: any) => s + (d.activities || []).reduce((a: number, act: any) => a + (Number(act.cost) || 0), 0), 0),
    tips: [
      "احجز التذاكر مبكراً لتفادي الازدحام.",
      "استخدم النقل العام لتوفير المال.",
      "جرّب المأكولات المحلية.",
      "احتفظ بنسخة من جواز السفر في مكان آمن.",
      "تحقق من الطقس قبل السفر.",
    ],
    _targetLang: targetLang,
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

const AIML_MODELS = ["gpt-4o-mini"];
const OPENROUTER_MODELS = ["google/gemini-2.5-flash"];
const LOVABLE_MODELS = ["google/gemini-2.5-flash"];

// SerpApi Bank tunables (cached for 60s to avoid hot DB reads)
type SerpBankConfig = {
  maxPages: number;
  pageSize: number;
  freshThreshold: number;
  refreshMode: "manual" | "interval" | "generations";
  refreshIntervalDays: number;
  refreshAfterGenerations: number;
  lastRefreshedAt: string | null;
  generationsSinceRefresh: number;
};
const __DEFAULT_SERP_BANK_CONFIG: SerpBankConfig = {
  maxPages: 3,
  pageSize: 20,
  freshThreshold: 30,
  refreshMode: "manual",
  refreshIntervalDays: 7,
  refreshAfterGenerations: 100,
  lastRefreshedAt: null,
  generationsSinceRefresh: 0,
};
let __serpBankConfigCache: { value: SerpBankConfig; ts: number } | null = null;
async function fetchSerpBankConfig(): Promise<SerpBankConfig> {
  const now = Date.now();
  if (__serpBankConfigCache && (now - __serpBankConfigCache.ts) < 60_000) {
    return __serpBankConfigCache.value;
  }
  // ENV overrides take precedence (so devs can hot-tune in Lovable secrets)
  const envOverride: Partial<SerpBankConfig> = {
    maxPages: Number(Deno.env.get("SERPAPI_MAX_PAGES")) || undefined as any,
    pageSize: Number(Deno.env.get("SERPAPI_PAGE_SIZE")) || undefined as any,
    freshThreshold: Number(Deno.env.get("SERPAPI_FRESH_THRESHOLD")) || undefined as any,
  };
  let dbValue: Partial<SerpBankConfig> = {};
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (SUPABASE_URL && SERVICE_KEY) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?id=eq.default&select=serpapi_bank_config`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      });
      if (resp.ok) {
        const rows = await resp.json();
        const row = rows?.[0]?.serpapi_bank_config;
        if (row && typeof row === "object") dbValue = row as Partial<SerpBankConfig>;
      }
    }
  } catch { /* ignore — fall back to defaults */ }
  const merged: SerpBankConfig = {
    ...__DEFAULT_SERP_BANK_CONFIG,
    ...dbValue,
    ...Object.fromEntries(Object.entries(envOverride).filter(([_, v]) => Number.isFinite(v as number))),
  } as SerpBankConfig;
  // Clamp to safe ranges so a misconfigured value can't burn budget
  merged.maxPages = Math.max(1, Math.min(10, Number(merged.maxPages) || 3));
  merged.pageSize = Math.max(5, Math.min(20, Number(merged.pageSize) || 20));
  merged.freshThreshold = Math.max(1, Math.min(50, Number(merged.freshThreshold) || 10));
  __serpBankConfigCache = { value: merged, ts: now };
  return merged;
}

// Fetch admin config from site_settings
async function fetchAdminConfig(): Promise<{ dataSources: any[]; aiModels: any[] }> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return { dataSources: [], aiModels: [] };
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?id=eq.default&select=data_sources_config,ai_models_config`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (!resp.ok) return { dataSources: [], aiModels: [] };
    const rows = await resp.json();
    const row = rows?.[0];
    return {
      dataSources: Array.isArray(row?.data_sources_config) ? row.data_sources_config : [],
      aiModels: Array.isArray(row?.ai_models_config) ? row.ai_models_config : [],
    };
  } catch { return { dataSources: [], aiModels: [] }; }
}

// Image backfill — for activities missing a real venue photo, fetch one via Serper Images.
// Runs AFTER the main enrichment chain so we never overwrite a real SerpAPI/Serper place photo.
async function backfillActivityImages(itinerary: any, destination: string): Promise<number> {
  const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  const isPlaceholderImg = (u: any): boolean => {
    if (!u || typeof u !== "string") return true;
    const s = u.trim().toLowerCase();
    if (!s) return true;
    if (s.includes("placeholder")) return true;
    if (s.includes("unsplash.com")) return true; // generic stock fallback
    return false;
  };

  const isUsableUrl = (u: any) =>
    typeof u === "string" && /^https?:\/\//i.test(u) && !/placeholder|unsplash\.com/i.test(u);

  const fetchFromSerper = async (query: string): Promise<string | undefined> => {
    if (!SERPER_KEY) return undefined;
    try {
      const resp = await fetch("https://google.serper.dev/images", {
        method: "POST",
        headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      if (!resp.ok) return undefined;
      const data = await resp.json();
      const first = (data.images || [])
        .map((img: any) => img?.imageUrl || img?.link || img?.thumbnailUrl)
        .find(isUsableUrl);
      return first ? String(first) : undefined;
    } catch {
      return undefined;
    }
  };

  const fetchFromSerpApi = async (query: string): Promise<string | undefined> => {
    if (!SERPAPI_KEY) return undefined;
    try {
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) return undefined;
      const data = await resp.json();
      const first = (data?.images_results || [])
        .map((img: any) => img?.original || img?.thumbnail || img?.link)
        .find(isUsableUrl);
      return first ? String(first) : undefined;
    } catch {
      return undefined;
    }
  };

  // SerpAPI Google Maps lookup — returns the venue's actual `thumbnail`/`photos`
  // (the same image you see on the place's Google Maps card). Most reliable source.
  const fetchFromGoogleMaps = async (query: string): Promise<string | undefined> => {
    if (!SERPAPI_KEY) return undefined;
    try {
      const url = `https://serpapi.com/search.json?engine=google_maps&type=search&q=${encodeURIComponent(query)}&hl=en&api_key=${SERPAPI_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) return undefined;
      const data = await resp.json();
      const place = data?.place_results || data?.local_results?.[0];
      const candidate =
        place?.thumbnail ||
        (Array.isArray(place?.photos) && place.photos[0]?.image) ||
        (Array.isArray(place?.images) && place.images[0]?.thumbnail);
      return isUsableUrl(candidate) ? String(candidate) : undefined;
    } catch {
      return undefined;
    }
  };

  // Try Google Maps thumbnail (most accurate), then Serper Images, then SerpAPI Google Images.
  const fetchImageFor = async (name: string, addr: string): Promise<string | undefined> => {
    const queries = [
      addr ? `${name} ${addr}` : "",
      `${name} ${destination}`,
      name,
    ].filter(Boolean);
    for (const q of queries) {
      const fromMaps = await fetchFromGoogleMaps(q);
      if (fromMaps) return fromMaps;
    }
    for (const q of queries) {
      const fromSerper = await fetchFromSerper(q);
      if (fromSerper) return fromSerper;
    }
    for (const q of queries) {
      const fromSerpApi = await fetchFromSerpApi(q);
      if (fromSerpApi) return fromSerpApi;
    }
    return undefined;
  };

  let backfilled = 0;
  let scanned = 0;
  let alreadyReal = 0;
  const tasks: Promise<void>[] = [];
  for (const day of (itinerary.days || [])) {
    for (const act of (day.activities || [])) {
      scanned++;
      const name = String(act?.name || act?.title || "").trim();
      if (!name) continue;
      const addr = String(act?.address || "").trim();
      const currentIsPlaceholder = isPlaceholderImg(act?.imageUrl);

      // Always try Google Maps lookup first — even when imageUrl exists — because
      // the place's official Maps thumbnail/geo photo is more accurate than
      // anything else. Only fall back to keeping the existing image if Maps
      // returns nothing AND the current image is already a real (non-stock) URL.
      tasks.push((async () => {
        const url = await fetchImageFor(name, addr);
        if (url) {
          act.imageUrl = url;
          act.imageSource = currentIsPlaceholder ? "image_backfill" : "image_upgrade_maps";
          backfilled++;
        } else if (!currentIsPlaceholder) {
          alreadyReal++;
        }
      })());
    }
  }
  // Await all (with a generous global cap) so slow lookups still resolve before response.
  await Promise.race([Promise.all(tasks), new Promise((r) => setTimeout(r, 15000))]);
  console.log(`Image backfill: scanned=${scanned}, replaced=${backfilled} (kept_existing_real=${alreadyReal})`);
  return backfilled;
}

// Dynamic enrichment chain based on admin config
async function runEnrichmentChain(itinerary: any, destination: string, adminConfig: { dataSources: any[] }) {
  const enrichFunctions: Record<string, (it: any, dest: string) => Promise<boolean>> = {
    serpapi: enrichWithSerpAPI,
    serper: enrichWithSerperDev,
    rapidapi: enrichWithRapidAPI,
    ai: enrichWithAI,
  };

  const sources = adminConfig.dataSources.length > 0
    ? adminConfig.dataSources.filter((s: any) => s.enabled).sort((a: any, b: any) => a.priority - b.priority)
    : [{ id: 'serpapi' }, { id: 'serper' }, { id: 'rapidapi' }, { id: 'ai' }];

  console.log(`Enrichment chain order: ${sources.map((s: any) => s.id).join(" -> ")}`);

  // SerpAPI is the primary, highest-quality source. Run it first; if ≥70% of
  // activities are enriched after SerpAPI, skip the other sources entirely
  // (each adds 15-25s of latency and rarely improves quality once SerpAPI succeeded).
  const countActivities = () => {
    let total = 0, done = 0;
    for (const day of (itinerary.days || [])) {
      for (const act of (day.activities || [])) {
        total++;
        if (act.enriched) done++;
      }
    }
    return { total, done };
  };

  for (const source of sources) {
    const fn = enrichFunctions[source.id];
    if (!fn) { console.log(`Unknown source: ${source.id}, skipping`); continue; }
    const before = countActivities();
    if (before.total > 0 && before.done / before.total >= 0.7) {
      console.log(`Skipping ${source.id}: already ${before.done}/${before.total} enriched (≥70%)`);
      continue;
    }
    console.log(`Trying enrichment: ${source.id} (${before.done}/${before.total} done)...`);
    await fn(itinerary, destination);
    const after = countActivities();
    console.log(`${source.id} done: ${after.done}/${after.total} enriched`);
    if (after.total > 0 && after.done === after.total) { console.log("All activities enriched"); break; }
  }

  // Image backfill is expensive (~15-30s). Skip when ≥80% already have real images.
  try {
    let withRealImg = 0, total = 0;
    for (const day of (itinerary.days || [])) {
      for (const act of (day.activities || [])) {
        total++;
        if (act?.imageUrl && !/placeholder|unsplash|via\.placeholder|lorempicsum/i.test(String(act.imageUrl))) withRealImg++;
      }
    }
    if (total > 0 && withRealImg / total < 0.8) {
      await backfillActivityImages(itinerary, destination);
    } else {
      console.log(`Skipping image backfill: ${withRealImg}/${total} already have real images (≥80%)`);
    }
  } catch (e) { console.warn("Image backfill failed:", e); }
}

async function callAI(systemPrompt: string, userPrompt: string, adminConfig?: { aiModels: any[] }) {
  const LOVABLE_KEY = sanitizeKey(Deno.env.get("LOVABLE_API_KEY"));
  const OR_KEY = sanitizeKey(Deno.env.get("OPENROUTER_API_KEY"));
  const AIML_KEY = sanitizeKey(Deno.env.get("AIML_API_KEY"));

  const providerDefs: Record<string, { url: string; key: string; models: string[] }> = {};
  if (AIML_KEY) providerDefs['aiml'] = { url: "https://api.aimlapi.com/v1/chat/completions", key: AIML_KEY, models: AIML_MODELS };
  if (OR_KEY) providerDefs['openrouter'] = { url: "https://openrouter.ai/api/v1/chat/completions", key: OR_KEY, models: OPENROUTER_MODELS };
  if (LOVABLE_KEY) providerDefs['lovable'] = { url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: LOVABLE_KEY, models: LOVABLE_MODELS };

  const aiModels = adminConfig?.aiModels?.length
    ? adminConfig.aiModels.filter((m: any) => m.enabled).sort((a: any, b: any) => a.priority - b.priority)
    : [{ id: 'lovable' }, { id: 'aiml' }, { id: 'openrouter' }];

  const providers: { url: string; key: string; models: string[] }[] = [];
  for (const m of aiModels) {
    const def = providerDefs[m.id];
    if (def) providers.push(def);
  }

  if (providers.length === 0) throw new Error("No AI API keys configured.");
  console.log(`AI priority: ${aiModels.map((m: any) => m.id).join(" -> ")}`);

  let attempts = 0;
  const maxAttempts = providers.length * 2; // more generous retry budget
  for (const provider of providers) {
    for (const model of provider.models) {
      if (attempts >= maxAttempts) break;
      attempts++;
      try {
        const providerName = provider.url.includes('aiml') ? 'AIML' : provider.url.includes('openrouter') ? 'OpenRouter' : 'Lovable';
        console.log(`Trying ${model} at ${providerName} (attempt ${attempts}/${maxAttempts})`);
        
        const headers: Record<string, string> = {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        };
        if (provider.url.includes("openrouter.ai")) {
          headers["HTTP-Referer"] = "https://lovable.dev";
        }

        const controller = new AbortController();
        const timeoutMs = providerName === 'Lovable' ? 18000 : 15000;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const resp = await fetch(provider.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (resp.ok) return resp;
        const errText = await resp.text();
        console.warn(`Model ${model} failed (${resp.status}):`, errText.substring(0, 200));
        if (resp.status === 401 || resp.status === 403) {
          console.warn(`Auth failed for ${providerName}, skipping provider`);
          break; // skip to next provider
        }
      } catch (err) {
        console.warn(`Model ${model} error:`, String(err));
      }
    }
    if (attempts >= maxAttempts) break;
  }
  throw new Error("All AI providers failed.");
}

// ────────────────────────────────────────────────────────────────────────
// BOOKING ENRICHMENT (Hotels & Flights via SerpAPI) — Stage 1+2
// Auto-pick best hotel per city + best flight between consecutive cities,
// honor accommodation type / star rating / max budget per night, attach
// direct booking links.
// ────────────────────────────────────────────────────────────────────────

type BookingPrefs = {
  wantHotel: boolean;
  wantFlight: boolean;
  accommodationType?: string;
  hotelStarRating?: number;
  maxBudgetPerNight?: number;
  maxBudgetPerFlight?: number;
  currency?: string;
  travelers?: number;
  children?: number;
  flightTripType?: "round" | "oneway";
  startDate: string;
  endDate?: string;
};

const TRIP_ALLIANCE_ID = "1100072";
const TRIP_SID = "5566655";

function buildHotelBookingUrl(hotel: any, city: string, checkIn: string, checkOut: string): string {
  if (hotel?.link && /^https?:\/\//.test(hotel.link)) return hotel.link;
  if (hotel?.serpapi_property_details_link) return hotel.serpapi_property_details_link;
  const q = encodeURIComponent(`${hotel?.name || ""} ${city}`.trim());
  return `https://www.trip.com/hotels/list?city=${q}&checkin=${checkIn}&checkout=${checkOut}&Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}`;
}

function buildFlightBookingUrl(from: string, to: string, date: string, returnDate?: string): string {
  const seg = returnDate
    ? `${date.replace(/-/g, "").slice(2)}${from}${to}${returnDate.replace(/-/g, "").slice(2)}${to}${from}`
    : `${date.replace(/-/g, "").slice(2)}${from}${to}1`;
  return `https://www.aviasales.com/search/${seg}?marker=688262`;
}

function matchesAccommodationType(hotel: any, pref?: string): boolean {
  if (!pref || pref === "any") return true;
  const t = String(hotel?.type || "").toLowerCase();
  const name = String(hotel?.name || "").toLowerCase();
  switch (pref) {
    case "hotel": return t.includes("hotel") || (!t.includes("apartment") && !t.includes("villa") && !t.includes("rental") && !t.includes("hostel"));
    case "apartment": return t.includes("apartment") || t.includes("rental") || name.includes("apartment");
    case "resort": return t.includes("resort") || name.includes("resort");
    case "villa": return t.includes("villa") || name.includes("villa");
    case "hostel": return t.includes("hostel") || name.includes("hostel");
    default: return true;
  }
}

// Extract numeric value from "$347" / "347.50 USD" / number
function extractNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }
  return 0;
}

function getHotelStars(h: any): number {
  const direct = extractNum(h?.extracted_hotel_class) || extractNum(h?.hotel_class);
  if (direct > 0) return direct;
  // Try to parse "5-star hotel" from text class
  const txt = String(h?.hotel_class || h?.type || "").toLowerCase();
  const m = txt.match(/(\d)\s*[- ]?star/);
  return m ? parseInt(m[1]) : 0;
}

function rankHotels(hotels: any[], prefs: BookingPrefs): any[] {
  if (!Array.isArray(hotels) || hotels.length === 0) return [];
  const minStars = prefs.hotelStarRating || 0;
  const maxPrice = prefs.maxBudgetPerNight || 0;

  const filtered = hotels.filter((h) => {
    if (!matchesAccommodationType(h, prefs.accommodationType)) return false;
    const stars = getHotelStars(h);
    if (minStars > 0 && stars > 0 && stars < minStars) return false;
    const price = extractNum(h?.rate_per_night);
    if (maxPrice > 0 && price > 0 && price > maxPrice) return false;
    return true;
  });

  const candidates = filtered.length > 0 ? filtered : hotels;
  const scored = candidates.map((h) => {
    const rating = extractNum(h?.overall_rating);
    const reviews = extractNum(h?.reviews);
    const price = extractNum(h?.rate_per_night);
    const overBudget = maxPrice > 0 && price > maxPrice ? (price - maxPrice) / Math.max(maxPrice, 1) : 0;
    const score = rating * Math.log(reviews + 2) - overBudget * 2;
    return { h, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.h);
}

function mapHotel(best: any, city: string, checkIn: string, checkOut: string, prefs: BookingPrefs, source: string) {
  const imgs = Array.isArray(best.images) ? best.images : [];
  const imageList = imgs
    .map((img: any) => img?.original || img?.thumbnail)
    .filter((u: any) => typeof u === "string" && u.length > 0)
    .slice(0, 8);
  return {
    name: best.name,
    city,
    type: best.type || "hotel",
    description: best.description || "",
    stars: getHotelStars(best),
    rating: extractNum(best.overall_rating),
    reviews: extractNum(best.reviews),
    locationRating: extractNum(best.location_rating),
    pricePerNight: extractNum(best.rate_per_night),
    totalPrice: extractNum(best.total_rate),
    currency: prefs.currency || "USD",
    image: imageList[0] || null,
    images: imageList,
    amenities: Array.isArray(best.amenities) ? best.amenities.slice(0, 12) : [],
    nearbyPlaces: Array.isArray(best.nearby_places) ? best.nearby_places.slice(0, 4) : [],
    checkInTime: best.check_in_time || "",
    checkOutTime: best.check_out_time || "",
    gpsCoordinates: best.gps_coordinates || null,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    bookingUrl: buildHotelBookingUrl(best, city, checkIn, checkOut),
    externalLink: best.link || "",
    source,
  };
}

async function fetchHotelsForCity(
  supabaseUrl: string,
  serviceKey: string,
  city: string,
  checkIn: string,
  checkOut: string,
  prefs: BookingPrefs,
  limit = 6,
  currentUserId?: string | null,   // ← NEW optional parameter
): Promise<any[]> {
  try {
    // Map accommodationType to SerpAPI Google Hotels filters
    const accomRaw = String(prefs.accommodationType || "").toLowerCase();
    let queryWithType = city;
    let vacationRentals = false;
    if (accomRaw.includes("apartment") || accomRaw.includes("شقة") || accomRaw.includes("شقه")) {
      queryWithType = `apartments in ${city}`;
      vacationRentals = true;
    } else if (accomRaw.includes("villa") || accomRaw.includes("فيلا")) {
      queryWithType = `villas in ${city}`;
      vacationRentals = true;
    } else if (accomRaw.includes("resort") || accomRaw.includes("منتجع")) {
      queryWithType = `resorts in ${city}`;
    } else if (accomRaw.includes("hostel") || accomRaw.includes("نزل")) {
      queryWithType = `hostels in ${city}`;
    } else {
      queryWithType = `hotels in ${city}`;
    }
 
    const body: any = {
      query: queryWithType,
      check_in_date: checkIn,
      check_out_date: checkOut,
      adults: Math.max(1, (prefs.travelers || 2)),
      children: prefs.children || 0,
      currency: prefs.currency || "USD",
    };
    if (prefs.maxBudgetPerNight && prefs.maxBudgetPerNight > 0)
      body.max_price = prefs.maxBudgetPerNight;
    if (prefs.hotelStarRating && prefs.hotelStarRating > 0)
      body.hotel_class = String(prefs.hotelStarRating);
    if (vacationRentals) body.vacation_rentals = true;
 
    // Build request headers — forward the real user's ID so pool rotation
    // inside serpapi-hotels stays consistent with the rest of the itinerary.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    };
    if (currentUserId) {
      headers["x-user-id"] = currentUserId;
    }
 
    const resp = await fetch(`${supabaseUrl}/functions/v1/serpapi-hotels`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.warn(`serpapi-hotels failed for ${city}: ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    if (!data?.success || !Array.isArray(data?.hotels)) return [];
    const ranked = rankHotels(data.hotels, prefs).slice(0, limit);
    const source = data.source || "serpapi";
    return ranked.map((h) => mapHotel(h, city, checkIn, checkOut, prefs, source));
  } catch (e) {
    console.warn(`Hotel fetch error for ${city}:`, String(e));
    return [];
  }
}

function mapFlight(best: any, fromCity: string, toCity: string, fromIata: string, toIata: string, date: string, prefs: BookingPrefs) {
  return {
    from: fromCity,
    to: toCity,
    fromCode: fromIata,
    toCode: toIata,
    date,
    airline: best.airline,
    airlineLogo: best.airline_logo,
    flightNumber: best.flight_number,
    departureAirport: best.departure_airport || "",
    arrivalAirport: best.arrival_airport || "",
    departureTime: best.departure_time,
    arrivalTime: best.arrival_time,
    duration: best.duration,
    totalDuration: best.total_duration || best.duration,
    stops: best.stops || 0,
    layovers: Array.isArray(best.layovers) ? best.layovers : [],
    segments: Array.isArray(best.segments) ? best.segments : [],
    price: best.price || 0,
    currency: prefs.currency || "USD",
    travelClass: best.travel_class,
    airplane: best.airplane || "",
    legroom: best.legroom || "",
    extensions: Array.isArray(best.extensions) ? best.extensions.slice(0, 6) : [],
    bookingUrl: buildFlightBookingUrl(fromIata, toIata, date),
    source: "serpapi",
  };
}

async function fetchFlightsBetweenCities(
  supabaseUrl: string,
  serviceKey: string,
  fromCity: string,
  toCity: string,
  date: string,
  prefs: BookingPrefs,
  limit = 6,
  currentUserId?: string | null,   // ← NEW optional parameter
): Promise<any[]> {
  try {
    const fromIata = resolveIataFallback(fromCity);
    const toIata = resolveIataFallback(toCity);
    if (
      !fromIata || !toIata ||
      fromIata === toIata ||
      fromIata === "XXX" || toIata === "XXX"
    ) return [];
 
    // Build request headers — forward the real user's ID so pool rotation
    // inside serpapi-flights stays consistent with the rest of the itinerary.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    };
    if (currentUserId) {
      headers["x-user-id"] = currentUserId;
    }
 
    const resp = await fetch(`${supabaseUrl}/functions/v1/serpapi-flights`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        departure_id: fromIata,
        arrival_id: toIata,
        outbound_date: date,
        adults: Math.max(1, (prefs.travelers || 2)),
        currency: prefs.currency || "USD",
        type: "2",
      }),
    });
 
    const fallbackOne = [{
      from: fromCity, to: toCity, fromCode: fromIata, toCode: toIata, date,
      bookingUrl: buildFlightBookingUrl(fromIata, toIata, date),
      source: "fallback",
    }];
    if (!resp.ok) return fallbackOne;
    const data = await resp.json();
    const flights = [
      ...(Array.isArray(data?.best_flights) ? data.best_flights : []),
      ...(Array.isArray(data?.other_flights) ? data.other_flights : []),
    ];
    if (flights.length === 0) return fallbackOne;
 
    const maxBudget = prefs.maxBudgetPerFlight || 0;
    const filtered = maxBudget > 0
      ? flights.filter((f: any) => !f.price || f.price <= maxBudget)
      : flights;
    const candidates = filtered.length > 0 ? filtered : flights;
 
    candidates.sort((a: any, b: any) => {
      const sa = (a.stops || 0) - (b.stops || 0);
      if (sa !== 0) return sa;
      return (a.price || 0) - (b.price || 0);
    });
 
    return candidates.slice(0, limit).map((best: any) =>
      mapFlight(best, fromCity, toCity, fromIata, toIata, date, prefs)
    );
  } catch (e) {
    console.warn(`Flight fetch error ${fromCity}->${toCity}:`, String(e));
    return [];
  }
}

async function enrichItineraryWithBookings(
  itinerary: any,
  resolvedCityLegs: { city: string; days: number; transport?: string }[],
  prefs: BookingPrefs,
  primaryDestination: string,
  departureCity?: string,
  finalArrivalCity?: string,
  currentUserId?: string | null,   // ← NEW optional parameter
): Promise<void> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn("Booking enrichment skipped: missing SUPABASE env");
    return;
  }
  if (!prefs.wantHotel && !prefs.wantFlight) return;
 
  const startDate = new Date(prefs.startDate);
  if (isNaN(startDate.getTime())) return;
 
  const legs = resolvedCityLegs.length > 0
    ? resolvedCityLegs
    : [{ city: primaryDestination, days: itinerary.days?.length || 1, transport: "flight" }];
 
  const hotels: any[] = [];
  const flights: any[] = [];
  const tasks: Promise<void>[] = [];
 
  if (prefs.wantHotel) {
    let dayCursor = 0;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const checkIn = new Date(startDate);
      checkIn.setDate(checkIn.getDate() + dayCursor);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkOut.getDate() + Math.max(1, leg.days));
      const ci = checkIn.toISOString().split("T")[0];
      const co = checkOut.toISOString().split("T")[0];
      tasks.push(
        Promise.race([
          fetchHotelsForCity(SUPABASE_URL, SERVICE_KEY, leg.city, ci, co, prefs, 6, currentUserId),
          new Promise<any[]>((r) => setTimeout(() => r([]), 12000)),
        ]).then((cityHotels) => {
          if (Array.isArray(cityHotels) && cityHotels.length > 0) {
            for (const h of cityHotels) hotels.push(h);
          }
        }),
      );
      dayCursor += leg.days;
    }
  }
 
  if (prefs.wantFlight) {
    if (departureCity && legs[0]?.city) {
      const fd = startDate.toISOString().split("T")[0];
      tasks.push(
        Promise.race([
          fetchFlightsBetweenCities(SUPABASE_URL, SERVICE_KEY, departureCity, legs[0].city, fd, prefs, 6, currentUserId),
          new Promise<any[]>((r) => setTimeout(() => r([]), 12000)),
        ]).then((legFlights) => {
          if (Array.isArray(legFlights)) {
            for (const f of legFlights) flights.push(f);
          }
        }),
      );
    }
 
    let dayCursor = 0;
    for (let i = 0; i < legs.length - 1; i++) {
      const fromLeg = legs[i];
      const toLeg = legs[i + 1];
      dayCursor += fromLeg.days;
      const flightDate = new Date(startDate);
      flightDate.setDate(flightDate.getDate() + dayCursor);
      const fd = flightDate.toISOString().split("T")[0];
      const transport = (toLeg.transport || "flight").toLowerCase();
      if (!transport.includes("flight")) continue;
      tasks.push(
        Promise.race([
          fetchFlightsBetweenCities(SUPABASE_URL, SERVICE_KEY, fromLeg.city, toLeg.city, fd, prefs, 4, currentUserId),
          new Promise<any[]>((r) => setTimeout(() => r([]), 12000)),
        ]).then((legFlights) => {
          if (Array.isArray(legFlights)) {
            for (const f of legFlights) flights.push(f);
          }
        }),
      );
    }
 
    // Return flight: last city → finalArrivalCity (or back to origin)
    if (legs.length > 0) {
      const lastLeg = legs[legs.length - 1];
      const returnTarget = (finalArrivalCity && finalArrivalCity.trim()) || departureCity;
      if (returnTarget && lastLeg.city) {
        const totalDaysAll = legs.reduce((s, l) => s + Math.max(1, l.days), 0);
        const returnDate = new Date(startDate);
        returnDate.setDate(returnDate.getDate() + totalDaysAll);
        const rd = returnDate.toISOString().split("T")[0];
        if (lastLeg.city.toLowerCase().trim() !== String(returnTarget).toLowerCase().trim()) {
          tasks.push(
            Promise.race([
              fetchFlightsBetweenCities(SUPABASE_URL, SERVICE_KEY, lastLeg.city, returnTarget, rd, prefs, 4, currentUserId),
              new Promise<any[]>((r) => setTimeout(() => r([]), 12000)),
            ]).then((legFlights) => {
              if (Array.isArray(legFlights)) {
                for (const f of legFlights) flights.push(f);
              }
            }),
          );
        }
      }
    }
  }
 
  await Promise.all(tasks);
 
  if (prefs.wantHotel) {
    itinerary.suggestedHotels = hotels.filter(Boolean);
    if (!Array.isArray(itinerary.selectedHotels)) itinerary.selectedHotels = [];
  }
  if (prefs.wantFlight) {
    itinerary.suggestedFlights = flights.filter(Boolean);
    if (!Array.isArray(itinerary.selectedFlights)) itinerary.selectedFlights = [];
  }
  console.log(
    `Booking enrichment: ${itinerary.suggestedHotels?.length || 0} hotel suggestions, ` +
    `${itinerary.suggestedFlights?.length || 0} flight suggestions`,
  );
}

// أضف هذا السطر في أعلى الملف مع باقي الـ imports



// ════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Deno.serve handler
// (replaces the entire Deno.serve block at the bottom of index.ts)
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // ── CORS pre-flight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
 console.log("TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT");
 
  let requestData: any = {};
  let __tripFingerprint = "";
  let __generationSucceeded = false;
 
  try {
    requestData = await req.json();
 
    const {
      destination,
      departureCity,
      finalArrivalCity,
      duration,
      travelers,
      interests,
      additionalPreferences,
      startDate,
      endDate,
      cuisineTypes,
      regenMode,
    } = requestData;
 
    const authHeader = req.headers.get("authorization");
    const currentUserId = getUserIdFromAuthHeader(authHeader);
 
    // ── 1. Progress + Recovery setup ──────────────────────────────────────────
    __tripFingerprint = __buildTripRecoveryFingerprint(requestData);
    resetSerpRequestState(
      Array.isArray(interests) ? interests : [],
      currentUserId || null,
      typeof requestData?.guestId === "string" ? requestData.guestId : null,
      Number((requestData as any)?.variationSeed) || null,
    );
    setProgressToken((requestData as any)?.progressToken);
    emitProgress("prepare", 5, "request_received");
 
    // ── 2. "activity regen" fast path (unchanged from original) ───────────────
    if (regenMode === "activity") {
      emitProgress("generate", 30, "regen_activity");
      const result = await handleRegenActivity(requestData);
      emitProgress("save", 100, "ready");
      return jsonResponse(result);
    }
 
    // ── 3. Build normalised Filters for deterministic cache-key ───────────────
    //
    //  Rules:
    //    ✓ Include semantically meaningful trip parameters.
    //    ✗ Exclude ephemeral / UX-only fields:
    //        progressToken, variationSeed, guestId, regenMode, lang, …
    //
    const subApiFilters: Filters = {
      destination:      destination,
      duration:         duration ?? null,
      // Sort arrays so {interests:["art","food"]} ≡ {interests:["food","art"]}
      interests:        [...(Array.isArray(interests) ? interests : [])].sort(),
      cuisineTypes:     [...(Array.isArray(cuisineTypes) ? cuisineTypes : [])].sort(),
      tripType:         requestData.tripType ?? null,
      activitiesPerDay: requestData.activitiesPerDay ?? requestData.maxActivitiesPerDay ?? null,
      meals: {
        breakfast: !!(requestData.wantBreakfast ?? requestData.mealPreferences?.breakfast),
        lunch:     !!(requestData.wantLunch     ?? requestData.mealPreferences?.lunch),
        dinner:    !!(requestData.wantDinner    ?? requestData.mealPreferences?.dinner),
        snack:     !!(requestData.wantSnacks    ?? requestData.mealPreferences?.snacks),
      },
      multiCity: !!(requestData.multiCity),
      cities: Array.isArray(requestData.cities)
        ? requestData.cities.map((c: any) => ({ name: c.name, days: c.days }))
        : [],
    };
 
    const activitiesPerDay: number =
      Number(requestData.activitiesPerDay ?? requestData.maxActivitiesPerDay) || 5;
    const pageSize = activitiesPerDay;
 
    // ── 4. Resolve pool (Stateful Pool Rotation) ───────────────────────────────
    const fetcher = async (): Promise<unknown[]> => {
      emitProgress("generate", 18, "calling_sub_api");
      const pool = await buildDynamicCityData(
        destination,
        Array.isArray(cuisineTypes) && cuisineTypes.length > 0 ? cuisineTypes[0] : undefined,
        Array.isArray(interests) ? interests : [],
      );
      return Array.isArray(pool) ? pool : [];
    };
 
    emitProgress("prepare", 10, "checking_pool");
 
    let cacheResult: PoolRotationResult<unknown>;
 
    if (currentUserId) {
      cacheResult = await resolveWithCache<unknown>(subApiFilters, currentUserId, fetcher, { pageSize });
    } else {
      // Guest / unauthenticated: always call the Sub-API fresh; no DB writes.
      const freshPool = await fetcher();
      cacheResult = {
        source: "fresh_pool_miss",
        items: freshPool.slice(0, pageSize),
        remainingUnseen: Math.max(0, freshPool.length - pageSize),
        filtersHash: "",
      };
    }
 
    console.log(
      `[PoolRotation] source=${cacheResult.source} ` +
      `user=${currentUserId?.slice(0, 8) ?? "guest"} ` +
      `dest=${destination} ` +
      `items=${cacheResult.items.length} ` +
      `remaining=${cacheResult.remainingUnseen}`,
    );
 
    emitProgress("generate", 30, "building_itinerary");
 
    // ── 5. Build the full itinerary using the page of results ──────────────────
    const preferenceFlags = extractPreferences(interests, additionalPreferences, cuisineTypes);
 
    let finalItinerary = await createFallbackItinerary({
      ...requestData,
      dynamicCityData: cacheResult.items,
      preferenceFlags,
    });
 
    emitProgress("enrich", 65, "enriching_activities");
 
    // ── 6. Booking enrichment (hotels + flights) ───────────────────────────────
    //       Now forwards currentUserId so pool rotation works per-user.
    const bookingPrefs: BookingPrefs = {
      wantHotel:          !!(requestData.wantHotel),
      wantFlight:         !!(requestData.wantFlight),
      accommodationType:  requestData.accommodationType,
      hotelStarRating:    Number(requestData.hotelStarRating) || 0,
      maxBudgetPerNight:  Number(requestData.maxBudgetPerNight) || 0,
      maxBudgetPerFlight: Number(requestData.maxBudgetPerFlight) || 0,
      currency:           requestData.currency || "USD",
      travelers:          Number(requestData.travelers) || 2,
      children:           Number(requestData.children) || 0,
      flightTripType:     requestData.flightTripType || "round",
      startDate:          startDate || "",
      endDate:            endDate,
    };
 
    if (!shouldUseActivitiesOnlyMode(interests, additionalPreferences)) {
      await enrichItineraryWithBookings(
        finalItinerary,
        Array.isArray(requestData.cityLegs) ? requestData.cityLegs : [],
        bookingPrefs,
        destination,
        departureCity,
        finalArrivalCity,
        currentUserId,   // ← forwarded so x-user-id header is set on sub-API calls
      );
    }
 
    // ── 7. Success — persist recovery snapshot and respond ────────────────────
    __generationSucceeded = true;
    if (__tripFingerprint) __writeTripRecoveryCache(__tripFingerprint, finalItinerary).catch(() => {});
 
    emitProgress("save", 100, "ready");
 
    return jsonResponse({
      ...finalItinerary,
      // Expose cache metadata so the frontend can surface messaging if desired.
      _cacheSource:     cacheResult.source,
      _remainingUnseen: cacheResult.remainingUnseen,
    });
 
  } catch (err) {
    console.error("[generate-trip] unhandled error:", String(err));
 
    // Last-resort: try to serve the most recent successful snapshot.
    if (__tripFingerprint && !__generationSucceeded) {
      try {
        const recovered = await __readTripRecoveryCache(__tripFingerprint);
        if (recovered) {
          console.log("[generate-trip] serving recovery snapshot");
          return jsonResponse({ ...recovered, _recovered: true });
        }
      } catch { /* noop */ }
    }
 
    return jsonResponse({ error: String(err) }, 500);
  }
});
 
