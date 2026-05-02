import { format } from "date-fns";

export type CalendarPreference = "auto" | "native" | "google";

export interface CalendarEventInput {
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  address?: string;
  location?: string;
  date?: Date | string;
  startTime?: string;
  time?: string;
  endTime?: string;
  startISO?: string;
  endISO?: string;
}

const DEFAULT_DURATION_HOURS = 2;

const parseTimeToParts = (value?: string, fallbackHour = 9) => {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/);

  if (!match) {
    return { hour: fallbackHour, minute: 0 };
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || "").toUpperCase();

  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  return { hour, minute };
};

const toEventDates = (event: CalendarEventInput) => {
  if (event.startISO && event.endISO) {
    const start = new Date(event.startISO);
    const end = new Date(event.endISO);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
      return { start, end };
    }
  }

  const baseDate = event.date ? new Date(event.date) : new Date();
  const safeDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

  const startParts = parseTimeToParts(event.startTime || event.time, 9);
  const endParts = parseTimeToParts(event.endTime, startParts.hour + DEFAULT_DURATION_HOURS);

  const start = new Date(safeDate);
  start.setHours(startParts.hour, startParts.minute, 0, 0);

  const end = new Date(safeDate);
  end.setHours(endParts.hour, endParts.minute, 0, 0);

  if (end <= start) {
    end.setHours(start.getHours() + DEFAULT_DURATION_HOURS, start.getMinutes(), 0, 0);
  }

  return { start, end };
};

const escapeIcsText = (value = "") =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const formatIcsDate = (date: Date) => format(date, "yyyyMMdd'T'HHmmss");

const getOrigin = () => {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://aseelaitrip.com";
};

export const normalizeCalendarPreference = (value?: string | null): CalendarPreference => {
  if (value === "native" || value === "google" || value === "auto") return value;
  return "auto";
};

export const generateGoogleCalendarUrl = (event: CalendarEventInput, extraLinks?: { mapUrl?: string; itineraryUrl?: string; activityUrl?: string }): string => {
  const title = event.title || event.name || "Activity";
  const location = event.address || event.location || "";
  const baseDesc = event.description || "";
  const descParts = [baseDesc];
  if (extraLinks?.mapUrl) descParts.push(`🗺️ Google Maps: ${extraLinks.mapUrl}`);
  if (extraLinks?.itineraryUrl) descParts.push(`📋 الخطة الكاملة | Full Itinerary: ${extraLinks.itineraryUrl}`);
  if (extraLinks?.activityUrl) descParts.push(`🎯 تفاصيل الفعالية | Activity Details: ${extraLinks.activityUrl}`);
  const description = descParts.filter(Boolean).join('\n');
  const { start, end } = toEventDates(event);

  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(description)}&dates=${format(start, "yyyyMMdd'T'HHmmss")}/${format(end, "yyyyMMdd'T'HHmmss")}`;
};

export const generateIcsContent = (event: CalendarEventInput, extraLinks?: { mapUrl?: string; itineraryUrl?: string; activityUrl?: string }): string => {
  const title = event.title || event.name || "Activity";
  const location = event.address || event.location || "";
  const baseDesc = event.description || "";
  
  // Build rich description with links
  const descParts = [baseDesc];
  if (extraLinks?.mapUrl) descParts.push(`🗺️ Google Maps: ${extraLinks.mapUrl}`);
  if (extraLinks?.itineraryUrl) descParts.push(`📋 الخطة الكاملة | Full Itinerary: ${extraLinks.itineraryUrl}`);
  if (extraLinks?.activityUrl) descParts.push(`🎯 تفاصيل الفعالية | Activity Details: ${extraLinks.activityUrl}`);
  const description = descParts.filter(Boolean).join('\\n');
  
  const { start, end } = toEventDates(event);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `SUMMARY:${escapeIcsText(title)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    extraLinks?.mapUrl ? `URL:${extraLinks.mapUrl}` : '',
    `UID:${event.id || Date.now()}@aseelaitrip`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
};

export const downloadIcsFile = (icsContent: string, fileName: string) => {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const buildCalendarBridgeUrl = (
  event: CalendarEventInput,
  preference: CalendarPreference = "auto",
  language = "en",
  origin = getOrigin()
) => {
  const title = event.title || event.name || "Activity";
  const location = event.address || event.location || "";
  const description = event.description || "";
  const { start, end } = toEventDates(event);

  const url = new URL("/calendar/add", origin);
  url.searchParams.set("title", title);
  if (location) url.searchParams.set("location", location);
  if (description) url.searchParams.set("details", description);
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());
  url.searchParams.set("pref", preference);
  url.searchParams.set("lang", language);

  return url.toString();
};

export const getCalendarActionLinks = (
  event: CalendarEventInput,
  preference: CalendarPreference = "auto",
  language = "en",
  origin?: string
) => {
  const nativeUrl = buildCalendarBridgeUrl(event, "native", language, origin);
  const googleUrl = buildCalendarBridgeUrl(event, "google", language, origin);
  const chooserUrl = buildCalendarBridgeUrl(event, "auto", language, origin);
  const preferredMode = preference === "google" ? "google" : "native";

  return {
    nativeUrl,
    googleUrl,
    chooserUrl,
    preferredMode,
    preferredUrl: preferredMode === "google" ? googleUrl : nativeUrl,
  };
};
