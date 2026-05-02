import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Plane, Hotel, Star, DollarSign, MapPin, Shield, Car, Bus,
  Search, Loader2, Clock, Calendar, ExternalLink, Luggage, Briefcase, ArrowUpDown, X, Users, Globe,
  Filter, Wifi, Coffee, Dumbbell, Waves, ParkingCircle, Utensils, ChevronDown, ChevronUp,
  Sun, SunMedium, Moon, Zap, Fuel, ArrowRight, ArrowLeftRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import CurrencySelector from "@/components/CurrencySelector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// Components and helpers
import { travelpayoutsService } from "@/services/api/travelpayoutsService";
import HotelImageCarousel from "@/components/booking/HotelImageCarousel";
import TravelpayoutsWL from "@/components/booking/TravelpayoutsWL";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { evaluatePriceVariance } from "@/services/priceVarianceMonitor";
import { getHotelCacheName, normalizeHotelCacheResult } from "@/utils/hotelBookingCards";


// Affiliate params
const AFFILIATE = { marker: "688262", trs: "477988" };

// City to IATA mapping
const cityIataMap: Record<string, string> = {
  'jeddah': 'JED', 'dubai': 'DXB', 'cairo': 'CAI', 'riyadh': 'RUH',
  'abu dhabi': 'AUH', 'doha': 'DOH', 'muscat': 'MCT', 'manama': 'BAH',
  'kuwait city': 'KWI', 'amman': 'AMM', 'beirut': 'BEY', 'istanbul': 'IST',
  'paris': 'CDG', 'london': 'LHR', 'rome': 'FCO', 'barcelona': 'BCN',
  'amsterdam': 'AMS', 'berlin': 'BER', 'vienna': 'VIE', 'prague': 'PRG',
  'athens': 'ATH', 'lisbon': 'LIS', 'madrid': 'MAD', 'zurich': 'ZRH',
  'munich': 'MUC', 'milan': 'MXP', 'frankfurt': 'FRA', 'copenhagen': 'CPH',
  'oslo': 'OSL', 'stockholm': 'ARN', 'helsinki': 'HEL', 'warsaw': 'WAW',
  'moscow': 'SVO', 'tokyo': 'NRT', 'singapore': 'SIN', 'hong kong': 'HKG',
  'beijing': 'PEK', 'shanghai': 'PVG', 'seoul': 'ICN', 'bangkok': 'BKK',
  'kuala lumpur': 'KUL', 'jakarta': 'CGK', 'manila': 'MNL', 'mumbai': 'BOM',
  'delhi': 'DEL', 'new york': 'JFK', 'los angeles': 'LAX', 'chicago': 'ORD',
  'miami': 'MIA', 'boston': 'BOS', 'foxborough': 'BOS', 'foxboro': 'BOS', 'foxborough ma': 'BOS', 'san francisco': 'SFO', 'san jose': 'SJC', 'santa clara': 'SJC',
  'santa clara ca': 'SJC', 'santa clara california': 'SJC', 'toronto': 'YYZ', 'vancouver': 'YVR',
  'sydney': 'SYD', 'melbourne': 'MEL', 'casablanca': 'CMN', 'nairobi': 'NBO',
  'johannesburg': 'JNB', 'sao paulo': 'GRU', 'mexico city': 'MEX',
  'buenos aires': 'EZE', 'lima': 'LIM', 'bogota': 'BOG',
  'الرياض': 'RUH', 'جدة': 'JED', 'دبي': 'DXB', 'القاهرة': 'CAI',
  'أبوظبي': 'AUH', 'الدوحة': 'DOH', 'مسقط': 'MCT', 'عمان': 'AMM',
  'بيروت': 'BEY', 'اسطنبول': 'IST', 'لندن': 'LHR', 'باريس': 'CDG',
  'نيويورك': 'JFK', 'الكويت': 'KWI', 'المنامة': 'BAH', 'طوكيو': 'NRT',
  'سانتا كلارا': 'SJC', 'سان خوسيه': 'SJC',
};

// Airport (IATA) -> IANA timezone for accurate local time/duration display
const airportTimezones: Record<string, string> = {
  RUH: "Asia/Riyadh", JED: "Asia/Riyadh", DMM: "Asia/Riyadh", MED: "Asia/Riyadh",
  DXB: "Asia/Dubai", AUH: "Asia/Dubai", DOH: "Asia/Qatar", BAH: "Asia/Bahrain",
  KWI: "Asia/Kuwait", MCT: "Asia/Muscat", AMM: "Asia/Amman", BEY: "Asia/Beirut",
  CAI: "Africa/Cairo", IST: "Europe/Istanbul",
  LHR: "Europe/London", CDG: "Europe/Paris", FCO: "Europe/Rome",
  BCN: "Europe/Madrid", MAD: "Europe/Madrid", AMS: "Europe/Amsterdam",
  BER: "Europe/Berlin", MUC: "Europe/Berlin", FRA: "Europe/Berlin",
  VIE: "Europe/Vienna", ZRH: "Europe/Zurich", PRG: "Europe/Prague",
  ATH: "Europe/Athens", LIS: "Europe/Lisbon", MXP: "Europe/Rome",
  CPH: "Europe/Copenhagen", OSL: "Europe/Oslo", ARN: "Europe/Stockholm",
  HEL: "Europe/Helsinki", WAW: "Europe/Warsaw", SVO: "Europe/Moscow",
  JFK: "America/New_York", BOS: "America/New_York", LAX: "America/Los_Angeles", SFO: "America/Los_Angeles",
  SJC: "America/Los_Angeles", ORD: "America/Chicago", MIA: "America/New_York",
  YYZ: "America/Toronto", YVR: "America/Vancouver",
  GRU: "America/Sao_Paulo", MEX: "America/Mexico_City", EZE: "America/Argentina/Buenos_Aires",
  LIM: "America/Lima", BOG: "America/Bogota",
  NRT: "Asia/Tokyo", HND: "Asia/Tokyo", ICN: "Asia/Seoul", PEK: "Asia/Shanghai",
  PVG: "Asia/Shanghai", HKG: "Asia/Hong_Kong", SIN: "Asia/Singapore",
  BKK: "Asia/Bangkok", KUL: "Asia/Kuala_Lumpur", CGK: "Asia/Jakarta",
  MNL: "Asia/Manila", BOM: "Asia/Kolkata", DEL: "Asia/Kolkata",
  SYD: "Australia/Sydney", MEL: "Australia/Melbourne",
  CMN: "Africa/Casablanca", NBO: "Africa/Nairobi", JNB: "Africa/Johannesburg",
};

function getAirportTimezone(iata?: string): string | undefined {
  if (!iata) return undefined;
  return airportTimezones[iata.toUpperCase()];
}

// Format an ISO/datetime string in a specific airport's local time zone
function formatTimeInAirportTz(value: string | undefined, iata?: string): string {
  if (!value) return "";
  // If value is just HH:MM (no date), it's already local — return as-is
  if (/^\d{1,2}:\d{2}$/.test(value.trim())) return value.trim();
  const tz = getAirportTimezone(iata);
  // Need a parseable timestamp (ISO or with date+time)
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: tz,
    }).format(d);
  } catch {
    return "";
  }
}

// Compute total flight duration in minutes from depart/arrive ISO timestamps + their timezones.
// If timestamps include offsets, Date already gives correct UTC instants — TZ map is only used
// to *render* local clock times. The instant difference equals the true flight duration.
function computeFlightDurationFromInstants(depIso?: string, arrIso?: string): number | null {
  if (!depIso || !arrIso) return null;
  const dep = new Date(depIso);
  const arr = new Date(arrIso);
  if (Number.isNaN(dep.getTime()) || Number.isNaN(arr.getTime())) return null;
  const diff = Math.round((arr.getTime() - dep.getTime()) / 60000);
  return diff > 0 && diff < 60 * 36 ? diff : null;
}

// Strict matcher: does a hotel result actually belong to the requested city?
function hotelMatchesCity(hotel: any, requestedCity: string, requestedIata?: string): boolean {
  if (!requestedCity) return true;
  const haystack = [
    hotel?.location, hotel?.address, hotel?.city, hotel?.name,
    hotel?.location_name, hotel?.full_address,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return true; // no metadata — don't drop blindly
  const needles = [requestedCity.toLowerCase()];
  if (requestedIata) needles.push(requestedIata.toLowerCase());
  // Add Arabic + English aliases from cityList
  const norm = requestedCity.toLowerCase().trim();
  for (const c of cityList) {
    if (
      c.nameEn.toLowerCase() === norm ||
      c.name.toLowerCase() === norm ||
      c.code.toLowerCase() === (requestedIata || "").toLowerCase()
    ) {
      needles.push(c.nameEn.toLowerCase(), c.name.toLowerCase());
    }
  }
  return needles.some(n => n && haystack.includes(n));
}

const cityList = [
  { name: 'الرياض', nameEn: 'Riyadh', code: 'RUH', country: 'السعودية' },
  { name: 'جدة', nameEn: 'Jeddah', code: 'JED', country: 'السعودية' },
  { name: 'دبي', nameEn: 'Dubai', code: 'DXB', country: 'الإمارات' },
  { name: 'أبوظبي', nameEn: 'Abu Dhabi', code: 'AUH', country: 'الإمارات' },
  { name: 'الدوحة', nameEn: 'Doha', code: 'DOH', country: 'قطر' },
  { name: 'القاهرة', nameEn: 'Cairo', code: 'CAI', country: 'مصر' },
  { name: 'عمان', nameEn: 'Amman', code: 'AMM', country: 'الأردن' },
  { name: 'بيروت', nameEn: 'Beirut', code: 'BEY', country: 'لبنان' },
  { name: 'الكويت', nameEn: 'Kuwait City', code: 'KWI', country: 'الكويت' },
  { name: 'المنامة', nameEn: 'Manama', code: 'BAH', country: 'البحرين' },
  { name: 'مسقط', nameEn: 'Muscat', code: 'MCT', country: 'عُمان' },
  { name: 'اسطنبول', nameEn: 'Istanbul', code: 'IST', country: 'تركيا' },
  { name: 'لندن', nameEn: 'London', code: 'LHR', country: 'بريطانيا' },
  { name: 'باريس', nameEn: 'Paris', code: 'CDG', country: 'فرنسا' },
  { name: 'روما', nameEn: 'Rome', code: 'FCO', country: 'إيطاليا' },
  { name: 'برشلونة', nameEn: 'Barcelona', code: 'BCN', country: 'إسبانيا' },
  { name: 'أمستردام', nameEn: 'Amsterdam', code: 'AMS', country: 'هولندا' },
  { name: 'برلين', nameEn: 'Berlin', code: 'BER', country: 'ألمانيا' },
  { name: 'ميونخ', nameEn: 'Munich', code: 'MUC', country: 'ألمانيا' },
  { name: 'فيينا', nameEn: 'Vienna', code: 'VIE', country: 'النمسا' },
  { name: 'زيوريخ', nameEn: 'Zurich', code: 'ZRH', country: 'سويسرا' },
  { name: 'نيويورك', nameEn: 'New York', code: 'JFK', country: 'أمريكا' },
  { name: 'لوس أنجلوس', nameEn: 'Los Angeles', code: 'LAX', country: 'أمريكا' },
  { name: 'ميامي', nameEn: 'Miami', code: 'MIA', country: 'أمريكا' },
  { name: 'سان خوسيه', nameEn: 'San Jose', code: 'SJC', country: 'أمريكا' },
  { name: 'سانتا كلارا', nameEn: 'Santa Clara', code: 'SJC', country: 'أمريكا' },
  { name: 'شيكاغو', nameEn: 'Chicago', code: 'ORD', country: 'أمريكا' },
  { name: 'طوكيو', nameEn: 'Tokyo', code: 'NRT', country: 'اليابان' },
  { name: 'سنغافورة', nameEn: 'Singapore', code: 'SIN', country: 'سنغافورة' },
  { name: 'بانكوك', nameEn: 'Bangkok', code: 'BKK', country: 'تايلاند' },
  { name: 'سيول', nameEn: 'Seoul', code: 'ICN', country: 'كوريا' },
  { name: 'كوالالمبور', nameEn: 'Kuala Lumpur', code: 'KUL', country: 'ماليزيا' },
  { name: 'سيدني', nameEn: 'Sydney', code: 'SYD', country: 'أستراليا' },
  { name: 'تورنتو', nameEn: 'Toronto', code: 'YYZ', country: 'كندا' },
  { name: 'مدريد', nameEn: 'Madrid', code: 'MAD', country: 'إسبانيا' },
  { name: 'لشبونة', nameEn: 'Lisbon', code: 'LIS', country: 'البرتغال' },
  { name: 'أثينا', nameEn: 'Athens', code: 'ATH', country: 'اليونان' },
  { name: 'الدار البيضاء', nameEn: 'Casablanca', code: 'CMN', country: 'المغرب' },
];

function getIataCode(input: string): string {
  const embeddedCode = input.match(/[()（）]([A-Z]{3})[()（）]?/i)?.[1];
  if (embeddedCode) return embeddedCode.toUpperCase();
  if (/^[A-Z]{3}$/i.test(input.trim())) return input.trim().toUpperCase();
  const normalized = input.replace(/\s*[（(][A-Z]{3}[)）]\s*$/i, '').split(/[،,]/)[0].toLowerCase().trim();
  if (cityIataMap[normalized]) return cityIataMap[normalized];
  for (const [key, code] of Object.entries(cityIataMap)) {
    if (normalized.includes(key) || key.includes(normalized)) return code;
  }
  return normalized.toUpperCase().substring(0, 3);
}

// Cities that do NOT have their own commercial airport. When the user
// searches flights for these cities we redirect to the nearest hub and
// surface a friendly notice so they understand why the airport code is
// different from the city name.
const NEAREST_AIRPORT_NOTICE: Record<string, { airportName: string; iata: string; cityEn: string }> = {
  'foxborough': { airportName: 'Boston Logan International (BOS)', iata: 'BOS', cityEn: 'Boston' },
  'foxboro': { airportName: 'Boston Logan International (BOS)', iata: 'BOS', cityEn: 'Boston' },
  'foxborough ma': { airportName: 'Boston Logan International (BOS)', iata: 'BOS', cityEn: 'Boston' },
  'santa clara': { airportName: 'San Jose International (SJC)', iata: 'SJC', cityEn: 'San Jose' },
  'santa clara ca': { airportName: 'San Jose International (SJC)', iata: 'SJC', cityEn: 'San Jose' },
  'santa clara california': { airportName: 'San Jose International (SJC)', iata: 'SJC', cityEn: 'San Jose' },
  'سانتا كلارا': { airportName: 'San Jose International (SJC)', iata: 'SJC', cityEn: 'San Jose' },
  'wrentham': { airportName: 'Boston Logan International (BOS)', iata: 'BOS', cityEn: 'Boston' },
};

export function getNearestAirportNotice(input?: string): { airportName: string; iata: string; cityEn: string } | null {
  if (!input) return null;
  const normalized = input.replace(/\s*[（(][A-Z]{3}[)）]\s*$/i, '').split(/[،,]/)[0].toLowerCase().trim();
  if (NEAREST_AIRPORT_NOTICE[normalized]) return NEAREST_AIRPORT_NOTICE[normalized];
  for (const [key, info] of Object.entries(NEAREST_AIRPORT_NOTICE)) {
    if (normalized.includes(key) || key.includes(normalized)) return info;
  }
  return null;
}

function normalizeLocationInput(input: string): string {
  return input.replace(/\s*[（(][A-Z]{3}[)）]\s*$/i, '').split(/[،,]/)[0].trim();
}

// Trip.com affiliate constants
const TRIP_ALLIANCE_ID = "7384441";
const TRIP_SID = "279474539";
const TRIP_SUB3 = "D14625004";
const TRIP_CAR_SUB3 = "D14995017";

// Generate booking URLs
function getFlightBookingUrl(from: string, to: string, departDate: Date, returnDate?: Date, adults = 1) {
  const dd = format(departDate, "ddMM");
  const ret = returnDate ? format(returnDate, "ddMM") : "";
  return `https://www.aviasales.com/search/${from}${dd}${to}${ret}${adults}?marker=${AFFILIATE.marker}`;
}

function getCityDisplayName(input: string): string {
  if (!input) return "";
  const embeddedCode = input.match(/[()（）]([A-Z]{3})[()（）]?/i)?.[1]?.toLowerCase();
  const normalized = normalizeLocationInput(input).toLowerCase();
  const match = cityList.find((city) =>
    city.nameEn.toLowerCase() === normalized ||
    city.name.toLowerCase() === normalized ||
    normalized.includes(city.nameEn.toLowerCase()) ||
    normalized.includes(city.name.toLowerCase())
  ) || cityList.find((city) =>
    city.code.toLowerCase() === normalized ||
    city.code.toLowerCase() === embeddedCode
  );
  return match?.nameEn || normalizeLocationInput(input);
}

function getHotelDestinationName(input: string): string {
  const normalized = normalizeLocationInput(input).toLowerCase();
  const code = getIataCode(input);
  if (code === "SJC") return normalized.includes("santa") || normalized.includes("كلارا")
    ? "Santa Clara, California, United States"
    : "San Jose, California, United States";
  return getCityDisplayName(input);
}

// Map our internal language to Booking.com supported locale codes
const BOOKING_LANG_MAP: Record<string, string> = {
  ar: "ar", en: "en-us", fr: "fr", es: "es", de: "de", it: "it",
  pt: "pt-pt", tr: "tr", ru: "ru", zh: "zh-cn", ja: "ja", ko: "ko",
  hi: "en-us", ur: "ar", id: "id", nl: "nl", pl: "pl",
};
function getBookingLocale(lang?: string): string {
  const base = String(lang || "en").toLowerCase().split("-")[0];
  return BOOKING_LANG_MAP[base] || "en-us";
}

function getHotelBookingUrl(cityName: string, checkIn: Date, checkOut: Date, adults = 2, lang?: string) {
  const normalizedCity = getHotelDestinationName(cityName) || cityName;
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", normalizedCity);
  url.searchParams.set("dest_type", "city");
  url.searchParams.set("checkin", format(checkIn, "yyyy-MM-dd"));
  url.searchParams.set("checkout", format(checkOut, "yyyy-MM-dd"));
  url.searchParams.set("group_adults", String(Math.max(1, adults || 1)));
  url.searchParams.set("no_rooms", "1");
  url.searchParams.set("group_children", "0");
  url.searchParams.set("sb_travel_purpose", "leisure");
  url.searchParams.set("src", "searchresults");
  url.searchParams.set("lang", getBookingLocale(lang));
  return url.toString();
}

// Build a Hotellook deep-link that searches the EXACT hotel by name in the right city/dates.
// Hotellook supports a /hotels search query, redirecting to the matching property page.
function getHotelDirectLink(
  hotelName: string,
  cityName: string,
  checkIn: Date,
  checkOut: Date,
  adults = 2,
  currency = "USD",
  lang?: string,
) {
  const cleanCity = getHotelDestinationName(cityName) || cityName;
  const fullQuery = `${hotelName} ${cleanCity}`.trim();
  const url = new URL("https://search.hotellook.com/");
  url.searchParams.set("destination", fullQuery);
  url.searchParams.set("checkIn", format(checkIn, "yyyy-MM-dd"));
  url.searchParams.set("checkOut", format(checkOut, "yyyy-MM-dd"));
  url.searchParams.set("adults", String(Math.max(1, adults || 1)));
  url.searchParams.set("currency", String(currency || "USD").toLowerCase());
  const baseLang = String(lang || "en").toLowerCase().split("-")[0];
  url.searchParams.set("language", baseLang === "ar" ? "ar" : baseLang);
  url.searchParams.set("marker", AFFILIATE.marker);
  return url.toString();
}


function getTripCarUrl(pickupLocation: string, pickupDate?: Date, returnDate?: Date, dropoffLocation?: string) {
  const pickupName = getCityDisplayName(pickupLocation);
  const dropoffName = getCityDisplayName(dropoffLocation || pickupLocation);
  const url = new URL("https://www.trip.com/carhire/");
  url.searchParams.set("Allianceid", TRIP_ALLIANCE_ID);
  url.searchParams.set("SID", TRIP_SID);
  url.searchParams.set("trip_sub1", "");
  url.searchParams.set("trip_sub3", TRIP_CAR_SUB3);
  if (pickupName) {
    url.searchParams.set("keyword", pickupName);
    url.searchParams.set("pickupKeyword", pickupName);
  }
  if (dropoffName) url.searchParams.set("dropoffKeyword", dropoffName);
  if (pickupDate) {
    url.searchParams.set("pickupDate", format(pickupDate, "yyyy-MM-dd"));
    url.searchParams.set("pickupDateTime", `${format(pickupDate, "yyyy-MM-dd")} 10:00:00`);
  }
  if (returnDate) {
    url.searchParams.set("returnDate", format(returnDate, "yyyy-MM-dd"));
    url.searchParams.set("dropOffDateTime", `${format(returnDate, "yyyy-MM-dd")} 10:00:00`);
  }
  return url.toString();
}

function getTripTransferUrl(from: string, to?: string, date?: Date) {
  const url = new URL("https://www.trip.com/airport-transfers/index/");
  url.searchParams.set("Allianceid", TRIP_ALLIANCE_ID);
  url.searchParams.set("SID", TRIP_SID);
  url.searchParams.set("trip_sub1", "");
  url.searchParams.set("trip_sub3", TRIP_SUB3);
  if (from) url.searchParams.set("fromName", getCityDisplayName(from));
  if (to) url.searchParams.set("toName", getCityDisplayName(to));
  if (date) url.searchParams.set("date", format(date, 'yyyy-MM-dd'));
  return url.toString();
}

function parseDateTimeValue(value?: string, fallbackDate?: Date): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00`);
  }

  if (/^\d{1,2}:\d{2}$/.test(trimmed) && fallbackDate) {
    return new Date(`${format(fallbackDate, 'yyyy-MM-dd')}T${trimmed}:00`);
  }

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const timeMatch = trimmed.match(/\b(\d{1,2}:\d{2})\b/);
  if (timeMatch && fallbackDate) {
    return new Date(`${format(fallbackDate, 'yyyy-MM-dd')}T${timeMatch[1]}:00`);
  }

  return null;
}

function formatTimeValue(value?: string, fallbackDate?: Date): string {
  if (!value) return "--:--";
  const trimmed = value.trim();
  // Pure date string (no time component) - return placeholder
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "--:--";

  // Direct HH:MM match
  const timeMatch = trimmed.match(/\b(\d{1,2}:\d{2})\b/);
  if (timeMatch) {
    const parts = timeMatch[1].split(':');
    const h = parseInt(parts[0]);
    const m = parts[1];
    // Reject invalid hours (like 50:00)
    if (h < 0 || h > 23) return "--:--";
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  const parsed = parseDateTimeValue(trimmed, fallbackDate);
  if (parsed && !isNaN(parsed.getTime())) {
    const hours = parsed.getHours();
    const mins = parsed.getMinutes();
    // If parsed date has midnight time AND original string was date-only, treat as no time
    if (hours === 0 && mins === 0 && !trimmed.includes('T') && !trimmed.includes(':')) return "--:--";
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  return "--:--";
}

function formatDateValue(value?: string, fallbackDate?: Date): string {
  const parsed = parseDateTimeValue(value, fallbackDate);
  if (parsed) return format(parsed, 'eee, dd MMM');
  return fallbackDate ? format(fallbackDate, 'eee, dd MMM') : '—';
}

function hasClockTime(value?: string): boolean {
  return /\b\d{1,2}:\d{2}\b/.test(String(value || ''));
}

// Calculate arrival time from departure + duration
function calcArrivalTime(depTimeStr: string, durationMins: number, fallbackDate?: Date): string {
  if (!depTimeStr || !durationMins) return "";
  try {
    const dep = parseDateTimeValue(depTimeStr, fallbackDate);
    if (!dep || isNaN(dep.getTime())) return "";
    const arr = new Date(dep.getTime() + durationMins * 60 * 1000);
    return `${String(arr.getHours()).padStart(2, '0')}:${String(arr.getMinutes()).padStart(2, '0')}`;
  } catch { return ""; }
}

function mapSerpFlightLeg(f: any, fallbackOrigin: string, fallbackDestination: string) {
  return {
    airline: f.airline || "",
    airline_logo: f.airline_logo || (f.airline ? `https://pics.avs.io/200/80/${f.airline}.png` : ""),
    flight_number: f.flight_number || "",
    departure_time: f.departure_time || "",
    arrival_time: f.arrival_time || "",
    departure_code: f.departure_code || fallbackOrigin,
    arrival_code: f.arrival_code || fallbackDestination,
    departure_airport: f.departure_airport || "",
    arrival_airport: f.arrival_airport || "",
    duration: f.duration || 0,
    stops: f.stops || 0,
    layovers: f.layovers || [],
    travel_class: f.travel_class || "Economy",
    airplane: f.airplane || "",
    segments: f.segments || [],
    price: f.price || 0,
    currency: f.currency || "USD",
    total_duration: f.total_duration || f.duration || 0,
    type: f.type || "",
    extensions: f.extensions || [],
    booking_token: f.booking_token || f.departure_token || "",
    bookingUrl: f.booking_url || f.google_flights_url || "",
    googleFlightsUrl: f.google_flights_url || f.booking_url || "",
  };
}

function mergeRoundTripFlightsWithSerpTimings(priceFlights: any[], outboundLegs: any[], returnLegs: any[], bookingUrl: string) {
  if (outboundLegs.length === 0 || returnLegs.length === 0) return priceFlights;

  const targetLength = Math.max(
    priceFlights.length,
    Math.min(outboundLegs.length, returnLegs.length, 8)
  );

  return Array.from({ length: targetLength }, (_, index) => {
    const outbound = outboundLegs[index % outboundLegs.length];
    const inbound = returnLegs[index % returnLegs.length];
    const priced = priceFlights[index];
    const mergedCurrency = priced?.currency || outbound.currency || inbound.currency || "USD";
    const mergedPrice = priced?.price ?? ((outbound.price || 0) + (inbound.price || 0));

    return {
      ...(priced || outbound),
      airline: outbound?.airline && inbound?.airline && outbound.airline !== inbound.airline
        ? `${outbound.airline} + ${inbound.airline}`
        : outbound?.airline || priced?.airline,
      airline_logo: outbound?.airline_logo || priced?.airline_logo || "",
      flight_number: inbound?.flight_number
        ? `${outbound?.flight_number || ""}${outbound?.flight_number ? " / " : ""}${inbound.flight_number}`
        : outbound?.flight_number || priced?.flight_number,
      departure_time: outbound?.departure_time || priced?.departure_time,
      arrival_time: outbound?.arrival_time || priced?.arrival_time,
      departure_code: outbound?.departure_code || priced?.departure_code,
      arrival_code: outbound?.arrival_code || priced?.arrival_code,
      duration: (outbound?.duration || 0) + (inbound?.duration || 0),
      duration_to: outbound?.duration || priced?.duration_to || priced?.duration || 0,
      duration_back: inbound?.duration || priced?.duration_back || priced?.duration || 0,
      stops: outbound?.stops ?? priced?.stops ?? priced?.transfers ?? 0,
      transfers: outbound?.stops ?? priced?.transfers ?? 0,
      price: mergedPrice,
      currency: mergedCurrency,
      link: bookingUrl,
      bookingUrl,
      googleFlightsUrl: bookingUrl,
      outbound_leg: {
        ...outbound,
        currency: mergedCurrency,
      },
      return_leg: {
        ...inbound,
        currency: mergedCurrency,
      },
      fallback: priced?.fallback ?? false,
      source: priced?.price ? "aviasales" : "serpapi-roundtrip",
      timingSource: "serpapi",
    };
  });
}

// City autocomplete
const CityAutocomplete = ({ value, onChange, placeholder }: { value: string; onChange: (val: string) => void; placeholder: string }) => {
  const [displayQuery, setDisplayQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Map IATA code back to display name on mount / value change
  useEffect(() => {
    if (!value) { setDisplayQuery(''); return; }
    const normalizedValue = normalizeLocationInput(value);
    const embeddedCode = value.match(/[()（）]([A-Z]{3})[()（）]?/i)?.[1]?.toUpperCase();
    const match = cityList.find(c =>
      c.code === value ||
      c.code === normalizedValue.toUpperCase() ||
      c.code === embeddedCode ||
      c.nameEn.toLowerCase() === normalizedValue.toLowerCase() ||
      c.name.toLowerCase() === normalizedValue.toLowerCase()
    );
    if (match) {
      setDisplayQuery(`${match.nameEn} (${match.code})`);
    } else if (value.length <= 3 && /^[A-Z]+$/i.test(value)) {
      setDisplayQuery(value);
    } else {
      setDisplayQuery(value);
    }
  }, [value]);

  const filtered = useMemo(() => {
    if (!displayQuery || displayQuery.length < 1) return cityList.slice(0, 10);
    const q = displayQuery.toLowerCase();
    return cityList.filter(c =>
      c.name.includes(q) || c.nameEn.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.country.includes(q)
    );
  }, [displayQuery]);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
        <Input
          value={displayQuery}
          onChange={(e) => { const next = e.target.value; setDisplayQuery(next); onChange(next); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 250)}
          placeholder={placeholder}
          className="pl-9 pr-8"
        />
        {displayQuery && (
          <button type="button" onClick={() => { setDisplayQuery(''); onChange(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </div>
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-auto">
            {filtered.map((c) => (
              <div key={`${c.code}-${c.nameEn}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const display = `${c.nameEn} (${c.code})`;
                  setDisplayQuery(display);
                  onChange(display);
                  setOpen(false);
                }}
                className="px-3 py-2.5 text-sm cursor-pointer hover:bg-accent flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-primary shrink-0" />
                  <span className="text-foreground">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.nameEn}</span>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{c.code}</Badge>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Hotel amenity icons
const amenityIcons: Record<string, any> = {
  'Free Wi-Fi': Wifi, 'Pool': Waves, 'Gym': Dumbbell, 'Restaurant': Utensils,
  'Parking': ParkingCircle, 'Breakfast': Coffee, 'Spa': Waves,
};

type FlightSort = 'price-asc' | 'price-desc' | 'duration-asc' | 'stops-asc';
type HotelSort = 'price-asc' | 'price-desc' | 'rating-desc' | 'class-desc';

const parseNumericValue = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const hMatch = value.match(/(\d+)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:in)?)?/i);
    if (hMatch) return Number(hMatch[1]) * 60 + Number(hMatch[2] || 0);
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const clampStars = (value: unknown): number => {
  const numeric = Math.round(parseNumericValue(value));
  return Math.max(0, Math.min(5, numeric));
};

const parseISODateLocal = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
};

const firstTextValue = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const nested = firstTextValue(obj.city, obj.name, obj.label, obj.value, obj.code, obj.iata);
      if (nested) return nested;
    }
  }
  return "";
};

const normalizeTravelersCount = (...values: unknown[]): number => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string") {
      const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const nested = normalizeTravelersCount(obj.adults, obj.count, obj.total, obj.guests, obj.travelers);
      if (nested > 0) return nested;
    }
  }
  return 0;
};

const airlineNameByCode: Record<string, string> = {
  SV: "Saudia",
  XY: "flynas",
  F3: "flyadeal",
  EK: "Emirates",
  FZ: "flydubai",
  QR: "Qatar Airways",
  EY: "Etihad Airways",
  GF: "Gulf Air",
  KU: "Kuwait Airways",
  MS: "EgyptAir",
  TK: "Turkish Airlines",
};

const preferredAirlineForRoute = (origin: string, destination: string): { code: string; name: string } => {
  const route = `${origin}-${destination}`;
  if (route.includes("JED-") || route.includes("-JED") || route.includes("RUH-") || route.includes("-RUH")) {
    return { code: "SV", name: "Saudia" };
  }
  if (route.includes("DXB-") || route.includes("-DXB")) return { code: "EK", name: "Emirates" };
  if (route.includes("DOH-") || route.includes("-DOH")) return { code: "QR", name: "Qatar Airways" };
  if (route.includes("IST-") || route.includes("-IST")) return { code: "TK", name: "Turkish Airlines" };
  return { code: "XY", name: "flynas" };
};

const estimateFlightPriceUsd = (origin: string, destination: string, adults: number, isRoundTrip: boolean): number => {
  const regionalCodes = new Set(["JED", "RUH", "DMM", "MED", "DXB", "AUH", "DOH", "BAH", "KWI", "MCT", "CAI", "AMM"]);
  const europeCodes = new Set(["IST", "LHR", "CDG", "FCO", "MAD", "BCN", "AMS", "BER", "MUC", "ZRH"]);
  const longHaulCodes = new Set(["JFK", "LAX", "YYZ", "NRT", "SIN", "BKK", "KUL"]);
  let base = 180;
  if (regionalCodes.has(origin) && regionalCodes.has(destination)) base = 145;
  else if (europeCodes.has(origin) || europeCodes.has(destination)) base = 330;
  else if (longHaulCodes.has(origin) || longHaulCodes.has(destination)) base = 720;
  return Math.round(base * Math.max(1, adults || 1) * (isRoundTrip ? 1.72 : 1));
};

const isExactFlightResult = (flight: any, origin: string, destination: string, departDate: string, returnDate?: string): boolean => {
  const flightOrigin = String(flight.origin || flight.departure_code || "").toUpperCase();
  const flightDestination = String(flight.destination || flight.arrival_code || "").toUpperCase();
  if (flightOrigin && flightOrigin !== origin) return false;
  if (flightDestination && flightDestination !== destination) return false;
  const dep = String(flight.departure_at || flight.departure_time || "");
  if (!dep.startsWith(departDate)) return false;
  if (returnDate) {
    const ret = String(flight.return_at || flight.return_leg?.departure_time || "");
    if (!ret || !ret.startsWith(returnDate)) return false;
  }
  return true;
};

const sanitizeFlightTime = (value?: string, expectedDate?: string): string => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  if (expectedDate && /^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.startsWith(expectedDate)) return "";
  return hasClockTime(raw) ? raw : "";
};

const reliablePrice = (value: unknown): number => {
  const parsed = parseNumericValue(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const hotelSeedByCity: Record<string, string[]> = {
  dubai: ["Rove Downtown Dubai", "JW Marriott Marquis Dubai", "Hilton Dubai Creek"],
  dxb: ["Rove Downtown Dubai", "JW Marriott Marquis Dubai", "Hilton Dubai Creek"],
  riyadh: ["Hilton Riyadh Hotel & Residences", "Four Seasons Riyadh", "Novotel Riyadh Al Anoud"],
  ruh: ["Hilton Riyadh Hotel & Residences", "Four Seasons Riyadh", "Novotel Riyadh Al Anoud"],
  jeddah: ["Park Hyatt Jeddah", "Hilton Jeddah", "Radisson Blu Jeddah"],
  jed: ["Park Hyatt Jeddah", "Hilton Jeddah", "Radisson Blu Jeddah"],
  "santa clara": ["Hyatt Regency Santa Clara", "Avatar Hotel Santa Clara", "Delta Hotels Santa Clara Silicon Valley", "AC Hotel San Jose Santa Clara"],
  "santaclara": ["Hyatt Regency Santa Clara", "Avatar Hotel Santa Clara", "Delta Hotels Santa Clara Silicon Valley", "AC Hotel San Jose Santa Clara"],
  sjc: ["Hyatt Regency Santa Clara", "Avatar Hotel Santa Clara", "Delta Hotels Santa Clara Silicon Valley", "AC Hotel San Jose Santa Clara"],
  cairo: ["Steigenberger Hotel El Tahrir", "Kempinski Nile Hotel", "Marriott Mena House Cairo"],
  cai: ["Steigenberger Hotel El Tahrir", "Kempinski Nile Hotel", "Marriott Mena House Cairo"],
  istanbul: ["Hilton Istanbul Bosphorus", "Hotel Amira Istanbul", "Ibis Istanbul Taksim"],
  ist: ["Hilton Istanbul Bosphorus", "Hotel Amira Istanbul", "Ibis Istanbul Taksim"],
};

const BookingsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatPrice, currency } = useCurrency();
  const autoSearchKeyRef = useRef("");
  const { user } = useAuth();
  const {
    canUseSerpapiFlights,
    canUseSerpapiHotels,
    serpapiFlightsEnabled,
    serpapiHotelsEnabled,
    maxSerpapiFlightSearches,
    maxSerpapiHotelSearches,
    remainingSerpapiFlights,
    remainingSerpapiHotels,
    maxFlightResultsPerSearch,
    maxHotelResultsPerSearch,
    trackSerpapiUsage,
    hasPlan,
    planName,
  } = useSubscriptionLimits();

  const formatCount = useCallback((value: number) => {
    return new Intl.NumberFormat(i18n.language?.startsWith("ar") ? "ar-u-nu-latn" : i18n.language || "en-US", {
      numberingSystem: "latn",
      maximumFractionDigits: 0,
    }).format(value);
  }, [i18n.language, currency]);

  const appendSubIds = useCallback((rawUrl: string, subId?: string) => {
    if (!subId) return rawUrl;
    try {
      const u = new URL(rawUrl);
      // Use the actual subId passed (which is the booking record ID)
      u.searchParams.set("subid", subId);
      u.searchParams.set("sub_id", subId);
      return u.toString();
    } catch {
      const separator = rawUrl.includes("?") ? "&" : "?";
      const s = encodeURIComponent(subId);
      return `${rawUrl}${separator}subid=${s}&sub_id=${s}`;
    }
  }, []);

  // Track booking in database for user profile
  const trackBooking = async (data: any, existingId?: string) => {
    if (!user) return null;
    try {
      const recordId = existingId || crypto.randomUUID();
      await (supabase as any).from('bookings').insert({
        id: recordId,
        user_id: user.id,
        subid: recordId,
        ...data,
        status: 'clicked',
      });
      return recordId;
    } catch (err) {
      console.warn('[bookings] Failed to track booking:', err);
      return null;
    }
  };

  const resolveCityName = useCallback((value?: string) => {
    if (!value) return "";
    return getCityDisplayName(value);
  }, []);

  const openTrackedLink = useCallback((url: string, bookingData: any) => {
    const bookingId = crypto.randomUUID();
    const trackedUrl = appendSubIds(url, bookingId);
    window.open(trackedUrl, '_blank', 'noopener,noreferrer');
    void trackBooking({ ...bookingData, provider_link: trackedUrl }, bookingId);
  }, [appendSubIds]);

  const [pendingRedirect, setPendingRedirect] = useState<any>(null);
  const [generatedItinerary, setGeneratedItinerary] = useState<any | null>(null);

  const confirmPendingRedirect = useCallback(() => {
    if (!pendingRedirect) return;
    openTrackedLink(pendingRedirect.url, pendingRedirect.bookingData);
    setPendingRedirect(null);
  }, [pendingRedirect, openTrackedLink]);

  // Helper: split a "City A → City B → City C" string into individual cities
  const splitDestinationChain = useCallback((raw: string): string[] => {
    if (!raw) return [];
    return String(raw)
      .split(/\s*(?:→|->|—|–|\||\/| to | إلى )\s*/i)
      .map(s => s.trim())
      .filter(Boolean);
  }, []);
  // Use only the FIRST city when destination is a chain like "Santorini → Amalfi Coast"
  const cleanFirstCity = useCallback((raw: string): string => {
    const parts = splitDestinationChain(raw);
    return parts[0] || raw || "";
  }, [splitDestinationChain]);

  const prefillFrom = searchParams.get("from") || "";
  const prefillToRaw = searchParams.get("to") || "";
  const prefillTo = cleanFirstCity(prefillToRaw);
  const prefillDate = searchParams.get("date") || "";
  const prefillReturn = searchParams.get("returnDate") || "";
  const prefillGuests = parseInt(searchParams.get("guests") || "2");
  const prefillTab = searchParams.get("tab") || "flights";
  const itineraryRef = searchParams.get("itineraryId") || "";

  // Pick whichever itinerary copy carries the most enrichment (SerpAPI suggestions)
  const getSuggestionCount = useCallback((it: any) => {
    if (!it) return -1;
    const f = Array.isArray(it.suggestedFlights) ? it.suggestedFlights.length : 0;
    const h = Array.isArray(it.suggestedHotels) ? it.suggestedHotels.length : 0;
    const sf = Array.isArray(it.selectedFlights) ? it.selectedFlights.length : 0;
    const sh = Array.isArray(it.selectedHotels) ? it.selectedHotels.length : 0;
    return f + h + sf + sh;
  }, []);

  const pickRicherItinerary = useCallback((a: any, b: any) => {
    if (!a) return b;
    if (!b) return a;
    return getSuggestionCount(b) > getSuggestionCount(a) ? b : a;
  }, [getSuggestionCount]);

  useEffect(() => {
    if (!itineraryRef) {
      setGeneratedItinerary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let local: any = null;
      try {
        const raw = localStorage.getItem(`itinerary-${itineraryRef}`);
        local = raw ? JSON.parse(raw) : null;
      } catch {
        local = null;
      }
      if (!cancelled) setGeneratedItinerary(local);

      // Pull richer copy from Supabase saved_trips if available
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data: row } = await (supabase as any)
          .from("saved_trips")
          .select("trip_data")
          .eq("user_id", session.user.id)
          .eq("trip_id", itineraryRef)
          .maybeSingle();
        const remote = row?.trip_data || null;
        if (cancelled || !remote) return;
        const richer = pickRicherItinerary(local, remote);
        if (richer && richer !== local) {
          setGeneratedItinerary(richer);
          try {
            localStorage.setItem(`itinerary-${itineraryRef}`, JSON.stringify(richer));
          } catch { /* storage full */ }
        }
      } catch (err) {
        console.warn("[bookings] Failed to load saved_trips copy", err);
      }
    })();
    return () => { cancelled = true; };
  }, [itineraryRef, pickRicherItinerary]);

  // Live SerpAPI enrichment: if itinerary lacks multiple suggestions, fetch them now.
  // Supports SINGLE-destination AND MULTI-CITY itineraries (auto-derives legs from
  // tripDetails.cities / .legs / .multiCityLegs / .citiesVisited).
  useEffect(() => {
    if (!itineraryRef) return;
    const existingFlights: any[] = Array.isArray(generatedItinerary?.suggestedFlights) ? generatedItinerary.suggestedFlights : [];
    const existingHotels: any[] = Array.isArray(generatedItinerary?.suggestedHotels) ? generatedItinerary.suggestedHotels : [];
    const flightsCount = existingFlights.length;
    const hotelsCount = existingHotels.length;

    let cancelled = false;
    (async () => {
      const updates: Record<string, any> = {};
      const tripDetails = generatedItinerary?.tripDetails || {};
      const rawDestination = generatedItinerary?.destination || tripDetails.destination || prefillTo;
      // CRITICAL: Strip "City A → City B" chains — use only the first city for single searches
      const destination = cleanFirstCity(rawDestination);
      const origin = tripDetails.from || prefillFrom;
      const checkIn = tripDetails.startDate || prefillDate;
      const checkOut = tripDetails.endDate || prefillReturn;
      const adults = tripDetails.travelers || prefillGuests || 2;

      // Read user accommodation/budget preferences (persisted by TripWizard)
      const prefAccommodationType = String(
        tripDetails.accommodationType || generatedItinerary?.accommodationType || "any"
      ).toLowerCase();
      const prefMaxBudgetPerNight = Number(
        tripDetails.maxBudgetPerNight || generatedItinerary?.maxBudgetPerNight || 0
      );
      const prefMinStars = Number(
        tripDetails.hotelStarRating || generatedItinerary?.hotelStarRating || 0
      );

      // ── Detect multi-city legs ────────────────────────────────────────────
      const rawLegs = (tripDetails.legs || tripDetails.multiCityLegs || tripDetails.multiCity || []) as any[];
      // Cities can come as array OR as a "A → B" string in destination
      let cityChain: string[] = (tripDetails.cities || generatedItinerary?.cities || generatedItinerary?.citiesVisited || []) as string[];
      if ((!Array.isArray(cityChain) || cityChain.length < 2) && rawDestination) {
        const split = splitDestinationChain(String(rawDestination));
        if (split.length >= 2) cityChain = split;
      }
      const detectedLegs: Array<{ from: string; to: string; date: string }> = [];
      if (Array.isArray(rawLegs) && rawLegs.length >= 2) {
        rawLegs.forEach((l) => {
          if (l?.from && l?.to) detectedLegs.push({ from: l.from, to: l.to, date: l.date || checkIn });
        });
      } else if (Array.isArray(cityChain) && cityChain.length >= 2) {
        const chain = origin && cityChain[0] !== origin ? [origin, ...cityChain] : cityChain;
        for (let i = 0; i < chain.length - 1; i++) {
          detectedLegs.push({ from: chain[i], to: chain[i + 1], date: checkIn });
        }
      }
      const isMultiCity = detectedLegs.length >= 2;

      // ── Per-leg / per-city coverage check ────────────────────────────────
      // For multi-city: ensure every destination city has at least 1 flight AND 1 hotel.
      // For single-city: fall back to total counts >=3.
      const normCity = (s: any) => String(s || "").trim().toLowerCase();
      const flightCityKeys = new Set(existingFlights.map((f) => normCity(f?.to || f?.toCity || f?.destination)));
      const hotelCityKeys = new Set(existingHotels.map((h) => normCity(h?.city || h?.location || h?.destination)));
      const missingFlightLegs = isMultiCity
        ? detectedLegs.filter((l) => !Array.from(flightCityKeys).some((k) => k && (k.includes(normCity(l.to)) || normCity(l.to).includes(k))))
        : (flightsCount < 3 ? [{ from: origin, to: destination, date: checkIn }] : []);
      const missingHotelCities = isMultiCity
        ? Array.from(new Set(detectedLegs.map((l) => l.to))).filter((c) => !Array.from(hotelCityKeys).some((k) => k && (k.includes(normCity(c)) || normCity(c).includes(k))))
        : (hotelsCount < 3 && destination ? [destination] : []);

      // Skip work entirely only if everything is covered
      if (missingFlightLegs.length === 0 && missingHotelCities.length === 0) return;

      console.log("[bookings] live enrichment start", {
        itineraryRef, flightsCount, hotelsCount, origin, destination, checkIn, checkOut,
        isMultiCity, legsCount: detectedLegs.length,
        missingFlightLegs: missingFlightLegs.length, missingHotelCities: missingHotelCities.length,
      });

      // ── FLIGHTS ──────────────────────────────────────────────────────────
      if (missingFlightLegs.length > 0) {
        // Plan-level gating: skip SerpAPI if not allowed/quota exhausted
        if (!canUseSerpapiFlights) {
          if (hasPlan && serpapiFlightsEnabled && remainingSerpapiFlights === 0) {
            console.info("[bookings] SerpAPI flights quota exhausted for plan:", planName);
          } else if (hasPlan && !serpapiFlightsEnabled) {
            console.info("[bookings] SerpAPI flights not included in plan:", planName);
          }
          // Silent fallback to alternative providers (handled elsewhere)
        } else try {
          const allFlights: any[] = [];
          const flightSliceLimit = Math.max(1, maxFlightResultsPerSearch || 8);

          if (isMultiCity) {
            for (let i = 0; i < missingFlightLegs.length; i++) {
              // Re-check quota inside loop (each leg consumes one search)
              if (!canUseSerpapiFlights) break;
              const leg = missingFlightLegs[i] as { from: string; to: string; date: string };
              const fromCode = getIataCode(leg.from);
              const toCode = getIataCode(leg.to);
              if (!fromCode || !toCode || fromCode === toCode) continue;
              try {
                const { data } = await supabase.functions.invoke("serpapi-flights", {
                  body: {
                    departure_id: fromCode, arrival_id: toCode,
                    outbound_date: leg.date || checkIn,
                    adults, currency: "USD", type: "2",
                  },
                });
                await trackSerpapiUsage('serpapi_flight');
                const all = [...(data?.best_flights || []), ...(data?.other_flights || [])];
                all.slice(0, flightSliceLimit).forEach((f: any) => {
                  allFlights.push({
                    from: leg.from, to: leg.to, fromCode, toCode,
                    date: leg.date || checkIn,
                    multiCityLegIndex: i,
                    multiCityLegLabel: `${fromCode} → ${toCode}`,
                    airline: f.airline, airlineLogo: f.airline_logo,
                    flightNumber: f.flight_number,
                    departureAirport: f.departure_airport,
                    arrivalAirport: f.arrival_airport,
                    departureTime: f.departure_time,
                    arrivalTime: f.arrival_time,
                    duration: f.duration,
                    totalDuration: f.total_duration || f.duration,
                    stops: f.stops || 0, layovers: f.layovers || [],
                    price: f.price || 0, currency: "USD",
                    travelClass: f.travel_class,
                    airlineLogoUrl: f.airline_logo,
                    extensions: f.extensions || [],
                    segments: f.segments || [],
                    type: "Multi-city",
                    bookingToken: f.booking_token || "",
                    bookingUrl: f.booking_url || data?.google_flights_url || "",
                    googleFlightsUrl: f.booking_url || data?.google_flights_url || "",
                    externalLink: f.booking_url || data?.google_flights_url || "",
                    source: "serpapi",
                  });
                });
              } catch (legErr) {
                console.warn(`[bookings] multi-city leg ${i} failed`, legErr);
              }
            }
          } else if (origin && destination && checkIn) {
            const fromCode = getIataCode(origin);
            const toCode = getIataCode(destination);
            if (fromCode && toCode && fromCode !== toCode) {
              const { data } = await supabase.functions.invoke("serpapi-flights", {
                body: {
                  departure_id: fromCode, arrival_id: toCode,
                  outbound_date: checkIn,
                  return_date: checkOut || undefined,
                  adults, currency: "USD",
                  type: checkOut ? "1" : "2",
                },
              });
              await trackSerpapiUsage('serpapi_flight');
              const all = [...(data?.best_flights || []), ...(data?.other_flights || [])];
              all.slice(0, flightSliceLimit).forEach((f: any) => {
                allFlights.push({
                  from: origin, to: destination, fromCode, toCode,
                  date: checkIn,
                  airline: f.airline, airlineLogo: f.airline_logo,
                  flightNumber: f.flight_number,
                  departureAirport: f.departure_airport,
                  arrivalAirport: f.arrival_airport,
                  departureTime: f.departure_time,
                  arrivalTime: f.arrival_time,
                  duration: f.duration,
                  totalDuration: f.total_duration || f.duration,
                  stops: f.stops || 0, layovers: f.layovers || [],
                  price: f.price || 0, currency: "USD",
                  travelClass: f.travel_class,
                  airlineLogoUrl: f.airline_logo,
                  extensions: f.extensions || [],
                  segments: f.segments || [],
                  type: f.type || "",
                  bookingToken: f.booking_token || "",
                  bookingUrl: f.booking_url || data?.google_flights_url || "",
                  googleFlightsUrl: f.booking_url || data?.google_flights_url || "",
                  externalLink: f.booking_url || data?.google_flights_url || "",
                  source: "serpapi",
                });
              });
            }
          }

          if (allFlights.length > 0) {
            // MERGE with existing flights instead of overwriting (preserves other legs)
            updates.suggestedFlights = [...existingFlights, ...allFlights];
          }
        } catch (e) {
          console.warn("[bookings] live flight enrichment failed", e);
        }
      }

      // ── HOTELS ───────────────────────────────────────────────────────────
      if (missingHotelCities.length > 0 && checkIn && checkOut && canUseSerpapiHotels) {
        try {
          const allHotels: any[] = [];
          const hotelCities: string[] = missingHotelCities;

          for (let ci = 0; ci < hotelCities.length; ci++) {
            const city = hotelCities[ci];
            let cityCheckIn = checkIn;
            let cityCheckOut = checkOut;
            if (isMultiCity) {
              const legIdx = detectedLegs.findIndex((l) => l.to === city);
              if (legIdx >= 0) {
                cityCheckIn = detectedLegs[legIdx].date || checkIn;
                const nextLeg = detectedLegs[legIdx + 1];
                cityCheckOut = nextLeg?.date || checkOut;
              }
            }
            try {
              // Build query that respects accommodation type preference
              const typeKeyword = (() => {
                switch (prefAccommodationType) {
                  case "apartment": return "apartments";
                  case "resort": return "resorts";
                  case "villa": return "villas";
                  case "hostel": return "hostels";
                  case "hotel": return "hotels";
                  default: return "hotels";
                }
              })();
              // SerpAPI google_hotels property_types numeric IDs
              // 12=Apartment, 14=Bed & breakfast, 15=Cabin, 17=Hostel, 18=Hotel,
              // 19=Inn, 20=Lodge, 21=Motel, 22=Resort, 23=Vacation rental, 24=Villa
              const propertyTypeId = (() => {
                switch (prefAccommodationType) {
                  case "apartment": return "12";
                  case "hostel": return "17";
                  case "hotel": return "18";
                  case "resort": return "22";
                  case "villa": return "24";
                  default: return "";
                }
              })();
              const useVacationRentals = prefAccommodationType === "apartment" || prefAccommodationType === "villa";
              const { data } = await supabase.functions.invoke("serpapi-hotels", {
                body: {
                  query: `${city} ${typeKeyword}`,
                  check_in_date: cityCheckIn,
                  check_out_date: cityCheckOut,
                  adults, currency: "USD",
                  ...(prefMaxBudgetPerNight > 0 ? { max_price: prefMaxBudgetPerNight } : {}),
                  ...(propertyTypeId ? { property_types: propertyTypeId } : {}),
                  ...(useVacationRentals ? { vacation_rentals: true } : {}),
                  ...(prefMinStars > 0 && !useVacationRentals
                    ? { hotel_class: String(prefMinStars) }
                    : {}),
                },
              });
              await trackSerpapiUsage('serpapi_hotel');
              if (Array.isArray(data?.hotels) && data.hotels.length > 0) {
                // Local filter: enforce accommodation type & budget on the returned set
                const matchType = (h: any) => {
                  if (prefAccommodationType === "any") return true;
                  const t = String(h.type || h.property_type || "").toLowerCase();
                  if (prefAccommodationType === "hotel") {
                    return !t.includes("apartment") && !t.includes("hostel") && !t.includes("villa");
                  }
                  return t.includes(prefAccommodationType);
                };
                const matchBudget = (h: any) => {
                  if (!prefMaxBudgetPerNight) return true;
                  const p = Number(h.rate_per_night) || 0;
                  return p === 0 || p <= prefMaxBudgetPerNight;
                };
                const matchStars = (h: any) => {
                  if (!prefMinStars) return true;
                  const s = Number(h.hotel_class || h.extracted_hotel_class) || 0;
                  return s === 0 || s >= prefMinStars;
                };
                const filtered = data.hotels.filter((h: any) => matchType(h) && matchBudget(h) && matchStars(h));
                const finalSet = filtered.length > 0 ? filtered : data.hotels;
                const limit = Math.max(1, maxHotelResultsPerSearch || (isMultiCity ? 8 : 12));
                finalSet.slice(0, limit).forEach((h: any) => {
                  const imgs = Array.isArray(h.images) ? h.images : [];
                  const imageList = imgs
                    .map((im: any) => im?.original || im?.thumbnail)
                    .filter((u: any) => typeof u === "string" && u.length > 0)
                    .slice(0, 16);
                  allHotels.push({
                    name: h.name, city, type: h.type || prefAccommodationType || "hotel",
                    description: h.description || "",
                    stars: h.hotel_class || h.extracted_hotel_class || 0,
                    rating: ((): number => {
                      const r = Number(h.overall_rating) || 0;
                      // Normalize to 0–5 scale (some sources return 0–10)
                      return r > 5 ? Math.round((r / 2) * 10) / 10 : r;
                    })(),
                    reviews: h.reviews || 0,
                    locationRating: h.location_rating || 0,
                    pricePerNight: h.rate_per_night || 0,
                    totalPrice: h.total_rate || 0, currency: "USD",
                    image: imageList[0] || null,
                    images: imageList,
                    amenities: Array.isArray(h.amenities) ? h.amenities.slice(0, 12) : [],
                    nearbyPlaces: h.nearby_places || [],
                    prices: h.prices || [],
                    excludedAmenities: h.excluded_amenities || [],
                    healthAndSafety: h.health_and_safety || null,
                    essentialInfo: h.essential_info || [],
                    sourceName: h.source_name || "",
                    sourceIcon: h.source_icon || "",
                    freeCancellation: !!h.free_cancellation,
                    checkInTime: h.check_in_time || "",
                    checkOutTime: h.check_out_time || "",
                    gpsCoordinates: h.gps_coordinates || null,
                    checkInDate: cityCheckIn,
                    checkOutDate: cityCheckOut,
                    bookingUrl: h.link || h.serpapi_property_details_link || "",
                    externalLink: h.link || "",
                    source: "serpapi",
                  });
                });
              }
            } catch (cityErr) {
              console.warn(`[bookings] hotel fetch failed for ${city}`, cityErr);
            }
          }

          if (allHotels.length > 0) {
            // MERGE with existing hotels instead of overwriting (preserves other cities)
            updates.suggestedHotels = [...existingHotels, ...allHotels];
          }
        } catch (e) {
          console.warn("[bookings] live hotel enrichment failed", e);
        }
      }

      if (cancelled || Object.keys(updates).length === 0) return;

      // CRITICAL: Never overwrite a valid itinerary with an empty stub.
      // If generatedItinerary hasn't loaded yet, re-read from localStorage to preserve days.
      let baseItinerary: any = generatedItinerary;
      if (!baseItinerary || !Array.isArray(baseItinerary.days) || baseItinerary.days.length === 0) {
        try {
          const raw = localStorage.getItem(`itinerary-${itineraryRef}`);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
            baseItinerary = parsed;
          }
        } catch { /* ignore */ }
      }
      // Still no real itinerary with days? Skip the write entirely — do NOT clobber storage.
      if (!baseItinerary || !Array.isArray(baseItinerary.days) || baseItinerary.days.length === 0) {
        console.warn("[bookings] Skipping enrichment merge — no base itinerary with days available");
        return;
      }
      const merged = { ...baseItinerary, ...updates };
      console.log("[bookings] live enrichment done", {
        flights: updates.suggestedFlights?.length || 0,
        hotels: updates.suggestedHotels?.length || 0,
        isMultiCity,
        preservedDays: merged.days?.length,
      });
      setGeneratedItinerary(merged);
      try {
        localStorage.setItem(`itinerary-${itineraryRef}`, JSON.stringify(merged));
      } catch { /* ignore */ }
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await (supabase as any).from("saved_trips").upsert(
            {
              user_id: session.user.id,
              trip_id: itineraryRef,
              destination: merged.destination || destination || "Trip",
              trip_data: merged,
            },
            { onConflict: "user_id,trip_id" }
          );
        }
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryRef, generatedItinerary?.suggestedFlights?.length, generatedItinerary?.suggestedHotels?.length, prefillFrom, prefillTo, prefillDate, prefillReturn]);

  // Auto-scroll to suggested results when navigating from itinerary
  useEffect(() => {
    if (!itineraryRef) return;
    const tab = prefillTab;
    const targetId = tab === "hotels" ? "generated-hotel-suggestions" : "generated-flight-suggestions";
    // Wait a frame for cards to render
    const timer = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
    return () => clearTimeout(timer);
  }, [itineraryRef, prefillTab, generatedItinerary]);

  const persistItinerarySelection = useCallback((updates: Record<string, any>) => {
    if (!itineraryRef) return;
    let next: any = null;
    try {
      const raw = localStorage.getItem(`itinerary-${itineraryRef}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      next = { ...parsed, ...updates };
      localStorage.setItem(`itinerary-${itineraryRef}`, JSON.stringify(next));
      setGeneratedItinerary(next);
    } catch (error) {
      console.warn("[bookings] Failed to persist itinerary selection", error);
      return;
    }

    // Sync to Supabase saved_trips so the choice persists across devices
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || !next) return;
        const destination = next.destination || next.tripDetails?.destination || "Trip";
        await (supabase as any)
          .from("saved_trips")
          .upsert(
            {
              user_id: session.user.id,
              trip_id: itineraryRef,
              destination,
              trip_data: next,
            },
            { onConflict: "user_id,trip_id" }
          );
      } catch (err) {
        console.warn("[bookings] Failed to sync selection to saved_trips", err);
      }
    })();
  }, [itineraryRef]);

  // handleSelectGeneratedFlight & handleSelectGeneratedHotel are defined later, after state & displayPrice are available

  const generatedFlights = useMemo(() => {
    const suggestions = generatedItinerary?.suggestedFlights;
    if (Array.isArray(suggestions) && suggestions.length > 0) return suggestions.filter(Boolean);
    if (!Array.isArray(generatedItinerary?.selectedFlights)) return [];
    return generatedItinerary.selectedFlights.filter(Boolean);
  }, [generatedItinerary?.suggestedFlights, generatedItinerary?.selectedFlights]);

  const generatedHotels = useMemo(() => {
    const suggestions = generatedItinerary?.suggestedHotels;
    if (Array.isArray(suggestions) && suggestions.length > 0) return suggestions.filter(Boolean);
    if (!Array.isArray(generatedItinerary?.selectedHotels)) return [];
    return generatedItinerary.selectedHotels.filter(Boolean);
  }, [generatedItinerary?.suggestedHotels, generatedItinerary?.selectedHotels]);

  // Multi-city: derive ordered city list from itinerary metadata
  const itineraryCities = useMemo<string[]>(() => {
    const det = generatedItinerary?.tripDetails || {};
    const sources: any[] = [
      det.cities, det.citiesVisited, det.legs, det.cityLegs, det.multiCityLegs,
      generatedItinerary?.cities, generatedItinerary?.citiesVisited,
      generatedItinerary?.cityLegs, generatedItinerary?.legs,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const src of sources) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        const name = typeof item === "string"
          ? item
          : (item?.city || item?.name || item?.to || item?.destination || "");
        if (!name || typeof name !== "string") continue;
        const key = name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(name.trim());
      }
    }
    return out;
  }, [generatedItinerary]);

  const isMultiCity = itineraryCities.length >= 2;

  // Group generated flights by destination city
  const flightsByCity = useMemo(() => {
    if (!isMultiCity) return null;
    const groups: Record<string, any[]> = {};
    const norm = (s: string) => s?.trim().toLowerCase() || "";
    const cityKeys = itineraryCities.map(norm);
    for (const f of generatedFlights) {
      const candidate = (f?.to || f?.toCity || f?.destination || f?.toCode || "").toString();
      const ck = norm(candidate);
      let matched = itineraryCities.find((c, i) => ck && (ck.includes(cityKeys[i]) || cityKeys[i].includes(ck)));
      if (!matched) matched = itineraryCities[itineraryCities.length - 1];
      (groups[matched] ||= []).push(f);
    }
    return groups;
  }, [generatedFlights, itineraryCities, isMultiCity]);

  const hotelsByCity = useMemo(() => {
    if (!isMultiCity) return null;
    const groups: Record<string, any[]> = {};
    const norm = (s: string) => s?.trim().toLowerCase() || "";
    const cityKeys = itineraryCities.map(norm);
    for (const h of generatedHotels) {
      const candidate = (h?.city || h?.location || h?.destination || "").toString();
      const ck = norm(candidate);
      let matched = itineraryCities.find((c, i) => ck && (ck.includes(cityKeys[i]) || cityKeys[i].includes(ck)));
      if (!matched) matched = itineraryCities[0];
      (groups[matched] ||= []).push(h);
    }
    return groups;
  }, [generatedHotels, itineraryCities, isMultiCity]);

  const [flightCityTab, setFlightCityTab] = useState<string>("");
  const [hotelCityTab, setHotelCityTab] = useState<string>("");
  useEffect(() => {
    if (isMultiCity && itineraryCities.length > 0) {
      if (!flightCityTab || !itineraryCities.includes(flightCityTab)) setFlightCityTab(itineraryCities[0]);
      if (!hotelCityTab || !itineraryCities.includes(hotelCityTab)) setHotelCityTab(itineraryCities[0]);
    }
  }, [isMultiCity, itineraryCities, flightCityTab, hotelCityTab]);

  // Per-city approximate cost summary (cheapest flight + cheapest hotel total) for multi-city trips
  const cityCostSummary = useMemo(() => {
    if (!isMultiCity || !flightsByCity || !hotelsByCity) return null;
    const cheapest = (arr: any[], getter: (x: any) => number) => {
      const vals = (arr || []).map(getter).filter((v) => Number.isFinite(v) && v > 0);
      return vals.length ? Math.min(...vals) : 0;
    };
    const rows = itineraryCities.map((city) => {
      const fList = flightsByCity[city] || [];
      const hList = hotelsByCity[city] || [];
      const flightMin = cheapest(fList, (f) => parseNumericValue(f?.price));
      const hotelMin = cheapest(hList, (h) =>
        parseNumericValue(h?.totalPrice) || parseNumericValue(h?.pricePerNight ?? h?.rate_per_night ?? h?.price)
      );
      return {
        city,
        flightMin,
        hotelMin,
        total: flightMin + hotelMin,
        flightsCount: fList.length,
        hotelsCount: hList.length,
      };
    });
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return { rows, grandTotal };
  }, [isMultiCity, flightsByCity, hotelsByCity, itineraryCities]);

  // Reusable renderer for a generated flight row (kept inline so it can access closures)
  const renderGeneratedFlight = (f: any, key: string | number) => {
    const layovers: any[] = Array.isArray(f.layovers) ? f.layovers : [];
    const totalDur = parseNumericValue(f.totalDuration ?? f.duration);
    const hours = Math.floor(totalDur / 60);
    const mins = totalDur % 60;
    const durStr = totalDur > 0 ? `${hours}h ${mins}m` : "";
    return (
      <div key={`generated-flight-${key}`} className={`relative rounded-2xl border bg-background p-4 transition-all ${isFlightSelected(f) ? "border-primary ring-2 ring-primary/40 shadow-md" : "border-border"}`}>
        {isFlightSelected(f) && (
          <span className="absolute -top-2 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow">
            {i18n.language?.startsWith("ar") ? "مختار" : "Selected"}
          </span>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {f.airlineLogo && (
              <img src={f.airlineLogo} alt={f.airline || ""} className="w-10 h-10 rounded-lg object-contain bg-muted/40 p-1 shrink-0" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-black text-foreground text-sm sm:text-base">
                  {(f.fromCode || f.from)} → {(f.toCode || f.to)}
                </p>
                {f.travelClass && (
                  <Badge variant="outline" className="text-[9px] font-black border-primary/20 text-primary">{f.travelClass}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {f.airline || "—"}{f.flightNumber ? ` · ${f.flightNumber}` : ""}{f.date ? ` · ${f.date}` : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {(f.departureTime || "—")} → {(f.arrivalTime || "—")}
                {durStr ? ` · ${durStr}` : ""}
                {typeof f.stops === "number" ? ` · ${f.stops === 0 ? (i18n.language?.startsWith("ar") ? "مباشر" : "Direct") : `${f.stops} ${i18n.language?.startsWith("ar") ? "توقف" : "stops"}`}` : ""}
              </p>
              {layovers.length > 0 && (
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  {i18n.language?.startsWith("ar") ? "توقف في" : "Via"}: {layovers.map((l: any) => l.name || l.airport || l.id).filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            <div className="text-right">
              <p className="text-lg font-black text-primary">{displayPrice(parseNumericValue(f.price), f)}</p>
            </div>
            {isFlightSelected(f) ? (
              <Button variant="outline" size="sm" className="rounded-xl border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleClearGeneratedSelection("flight")}>
                {i18n.language?.startsWith("ar") ? "إلغاء الاختيار" : "Clear selection"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleSelectGeneratedFlight(f)}>
                {i18n.language?.startsWith("ar") ? "إضافة للخطة" : "Add to plan"}
              </Button>
            )}
            <Button size="sm" className="rounded-xl" onClick={() => handleBookFlight({
              ...f,
              price: parseNumericValue(f.price),
              currency: f.currency || "USD",
              airline: f.airline,
              flight_number: f.flightNumber || f.flight_number,
            })}>
              {t('travel.bookNow')}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Reusable renderer for a generated hotel card
  const renderGeneratedHotel = (h: any, key: string | number) => {
    const nightly = parseNumericValue(h.pricePerNight ?? h.rate_per_night ?? h.price);
    const total = parseNumericValue(h.totalPrice);
    const stars = clampStars(h.stars ?? h.extracted_hotel_class ?? h.hotel_class);
    const gallery: string[] = Array.isArray(h.images)
      ? h.images.map((img: any) => typeof img === "string" ? img : (img?.original || img?.thumbnail)).filter(Boolean)
      : (h.image ? [h.image] : []);
    const heroImg = gallery[0] || h.image;
    const thumbs = gallery.slice(1, 5);
    const amenities: string[] = Array.isArray(h.amenities) ? h.amenities.slice(0, 6) : [];
    const reviewsCount = parseNumericValue(h.reviews);
    return (
      <div key={`generated-hotel-${key}`} className={`relative rounded-2xl border bg-background overflow-hidden transition-all group ${isHotelSelected(h) ? "border-primary ring-2 ring-primary/40 shadow-md" : "border-border"}`}>
        {isHotelSelected(h) && (
          <span className="absolute top-3 left-3 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow">
            {i18n.language?.startsWith("ar") ? "مختار" : "Selected"}
          </span>
        )}
        <div className="relative aspect-[16/10] overflow-hidden">
          <HotelImageCarousel images={gallery.length > 0 ? gallery : (heroImg ? [heroImg] : [])} alt={h.name} fallbackQuery={`${h.name} ${h.location || h.city || ""}`.trim()} />
          {h.type && h.type !== "hotel" && (
            <Badge className="absolute top-3 right-3 z-20 bg-background/90 text-foreground border-none rounded-full px-2 py-0.5 text-[10px] font-black capitalize">{h.type}</Badge>
          )}
        </div>
        <div className="p-4">
          <h4 className="font-black text-foreground text-sm sm:text-base line-clamp-2">{h.name}</h4>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin size={11} /> {h.city || hotelLocationName || hotelLocation}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {stars > 0 && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: stars }).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
              </div>
            )}
            {parseNumericValue(h.rating) > 0 && (
              <span className="text-xs text-muted-foreground font-bold">
                {parseNumericValue(h.rating).toFixed(1)}/5
                {reviewsCount > 0 && <span className="text-muted-foreground/60"> · {reviewsCount.toLocaleString()} {i18n.language?.startsWith("ar") ? "تقييم" : "reviews"}</span>}
              </span>
            )}
          </div>
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {amenities.map((a, i) => (
                <span key={i} className="text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-bold">{a}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <p className="text-lg font-black text-primary">{displayPrice(nightly, h)}</p>
              <p className="text-[10px] text-muted-foreground">/ {i18n.language?.startsWith("ar") ? "ليلة" : "night"}{total > 0 ? ` · ${displayPrice(total, h)} ${i18n.language?.startsWith("ar") ? "إجمالي" : "total"}` : ""}</p>
            </div>
            {(h.checkInTime || h.checkOutTime) && (
              <div className="text-right text-[10px] text-muted-foreground">
                {h.checkInTime && <p>{i18n.language?.startsWith("ar") ? "دخول" : "Check-in"}: {h.checkInTime}</p>}
                {h.checkOutTime && <p>{i18n.language?.startsWith("ar") ? "خروج" : "Check-out"}: {h.checkOutTime}</p>}
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
            {isHotelSelected(h) ? (
              <Button variant="outline" size="sm" className="rounded-xl border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleClearGeneratedSelection("hotel")}>
                {i18n.language?.startsWith("ar") ? "إلغاء الاختيار" : "Clear selection"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleSelectGeneratedHotel(h)}>
                {i18n.language?.startsWith("ar") ? "إضافة للخطة" : "Add to plan"}
              </Button>
            )}
            <Button size="sm" className="rounded-xl" onClick={() => handleBookHotel({
              ...h,
              name: h.name,
              rate_per_night: nightly,
              link: h.bookingUrl || h.externalLink || h.link,
            })}>
              {t('travel.bookNow')}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Flight state
  const [flights, setFlights] = useState<any[]>([]);
  const [flightFrom, setFlightFrom] = useState(prefillFrom);
  const [flightTo, setFlightTo] = useState(prefillTo);
  const [flightDate, setFlightDate] = useState<Date | undefined>(parseISODateLocal(prefillDate));
  const [flightReturn, setFlightReturn] = useState<Date | undefined>(parseISODateLocal(prefillReturn));
  const [flightAdults, setFlightAdults] = useState(prefillGuests);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [flightSort, setFlightSort] = useState<FlightSort>('price-asc');
  const [searchId, setSearchId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [stopsFilter, setStopsFilter] = useState<number[]>([]);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [timeFilter, setTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [nearbyPrices, setNearbyPrices] = useState<{ date: Date; price: number | null }[]>([]);
  const [flightTripType, setFlightTripType] = useState<'round' | 'oneway' | 'multi'>('round');
  const [showFlightsWL, setShowFlightsWL] = useState(false);
  const [flightDiagnostics, setFlightDiagnostics] = useState<string[]>([]);
  const [hotelDiagnostics, setHotelDiagnostics] = useState<string[]>([]);
  const [multiCityLegs, setMultiCityLegs] = useState<Array<{ from: string; to: string; date: Date | undefined }>>([
    { from: '', to: '', date: undefined },
    { from: '', to: '', date: undefined },
  ]);

  // Hotel state
  const [hotelLocation, setHotelLocation] = useState(prefillTo || "");
  const [hotelLocationName, setHotelLocationName] = useState(getCityDisplayName(prefillTo || ""));
  const [hotelCheckIn, setHotelCheckIn] = useState<Date | undefined>(parseISODateLocal(prefillDate));
  const [hotelCheckOut, setHotelCheckOut] = useState<Date | undefined>(parseISODateLocal(prefillReturn));
  const [hotelGuests, setHotelGuests] = useState(prefillGuests);
  const [hotels, setHotels] = useState<any[]>([]);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [hotelSort, setHotelSort] = useState<HotelSort>('price-asc');

  const queueHotelRedirect = useCallback((cityName: string, hotelName?: string) => {
    if (!hotelCheckIn || !hotelCheckOut) return;
    const url = getHotelBookingUrl(cityName, hotelCheckIn, hotelCheckOut, hotelGuests);
    const isAr = i18n.language?.startsWith('ar');
    setPendingRedirect({
      title: isAr ? 'تأكيد فتح نتائج الفنادق' : 'Confirm opening hotel results',
      description: isAr ? 'سيتم فتح صفحة بحث الفنادق بنفس المدينة والتواريخ.' : 'The hotel search page will open with the same city and dates.',
      actionLabel: isAr ? 'فتح نتائج الفنادق' : 'Open hotel results',
      url,
      summary: [
        { label: isAr ? 'المدينة' : 'City', value: cityName },
        { label: isAr ? 'الإقامة' : 'Stay', value: `${format(hotelCheckIn, 'yyyy-MM-dd')} → ${format(hotelCheckOut, 'yyyy-MM-dd')}` },
        { label: isAr ? 'الضيوف' : 'Guests', value: String(hotelGuests) },
      ],
      bookingData: {
        booking_type: 'hotel',
        destination: cityName,
        hotel_name: hotelName,
        departure_date: format(hotelCheckIn, 'yyyy-MM-dd'),
        return_date: format(hotelCheckOut, 'yyyy-MM-dd'),
        guests: hotelGuests,
        provider: 'Booking search',
      },
    });
  }, [hotelCheckIn, hotelCheckOut, hotelGuests, i18n.language]);

  // Hotel filters
  const [hotelStarFilter, setHotelStarFilter] = useState<number[]>([]);
  const [hotelPriceRange, setHotelPriceRange] = useState<[number, number]>([0, 2000]);
  const [hotelAmenityFilter, setHotelAmenityFilter] = useState<string[]>([]);
  const [showHotelFilters, setShowHotelFilters] = useState(false);

  // Car rental state
  const [carPickup, setCarPickup] = useState(prefillTo || "");
  const [carDropoff, setCarDropoff] = useState("");
  const [carPickupDate, setCarPickupDate] = useState<Date | undefined>(parseISODateLocal(prefillDate));
  const [carDropoffDate, setCarDropoffDate] = useState<Date | undefined>(parseISODateLocal(prefillReturn));
  const [carType, setCarType] = useState("all");
  const [carResults, setCarResults] = useState<any[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [carFallbackUrl, setCarFallbackUrl] = useState<string | null>(null);

  // Transfer state
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferDate, setTransferDate] = useState<Date | undefined>();
  const [transferPassengers, setTransferPassengers] = useState(2);
  const [transferResults, setTransferResults] = useState<any[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [transferWidgetUrl, setTransferWidgetUrl] = useState<string | null>(null);

  // Active tab for car/transfer sub-tabs
  const [carSubTab, setCarSubTab] = useState<'rental' | 'transfer'>('rental');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Date auto-correction
  useEffect(() => {
    if (flightDate && flightReturn && flightReturn <= flightDate) {
      setFlightReturn(addDays(flightDate, 1));
    }
  }, [flightDate]);

  // Auto-fill flight/hotel form fields from the generated itinerary so that the
  // Travelpayouts widgets always have a valid context (origin/destination/dates)
  // — without this, the live results never appear because the widget needs them.
  useEffect(() => {
    const det: any = generatedItinerary?.tripDetails || {};
    const itinOrigin = firstTextValue(
      det.from,
      det.origin,
      det.departureCity,
      det.departure,
      det.startCity,
      generatedItinerary?.origin,
      generatedItinerary?.from,
      generatedItinerary?.departureCity,
    );
    const itinDest = cleanFirstCity(
      firstTextValue(
        generatedItinerary?.destination,
        det.destination,
        det.to,
        det.arrival,
        det.arrivalCity,
        generatedItinerary?.to,
        generatedItinerary?.arrivalCity,
        itineraryCities[0] || "",
      )
    );
    const itinStart = firstTextValue(det.startDate, det.departureDate, det.date, generatedItinerary?.startDate, generatedItinerary?.departureDate);
    const itinEnd = firstTextValue(det.endDate, det.returnDate, generatedItinerary?.endDate, generatedItinerary?.returnDate);
    const itinAdults = normalizeTravelersCount(det.adults, det.travelers, det.guests, generatedItinerary?.adults, generatedItinerary?.travelers, generatedItinerary?.guests);

    if (!flightFrom && itinOrigin) setFlightFrom(itinOrigin);
    if (!flightTo && itinDest) setFlightTo(itinDest);
    if (!flightDate && itinStart) {
      const d = parseISODateLocal(itinStart);
      if (d) setFlightDate(d);
    }
    if (!flightReturn && itinEnd) {
      const d = parseISODateLocal(itinEnd);
      if (d) setFlightReturn(d);
    }
    if ((!flightAdults || flightAdults < 1) && itinAdults > 0) setFlightAdults(itinAdults);

    if (!hotelLocation && itinDest) {
      setHotelLocation(itinDest);
      setHotelLocationName(getHotelDestinationName(itinDest) || itinDest);
    }
    if (!hotelCheckIn && itinStart) {
      const d = parseISODateLocal(itinStart);
      if (d) setHotelCheckIn(d);
    }
    if (!hotelCheckOut && itinEnd) {
      const d = parseISODateLocal(itinEnd);
      if (d) setHotelCheckOut(d);
    }
    if ((!hotelGuests || hotelGuests < 1) && itinAdults > 0) setHotelGuests(itinAdults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedItinerary, itineraryCities.join("|")]);

  useEffect(() => {
    if (hotelCheckIn && hotelCheckOut && hotelCheckOut <= hotelCheckIn) {
      setHotelCheckOut(addDays(hotelCheckIn, 1));
    }
  }, [hotelCheckIn]);

  // Auto-correct car dates
  useEffect(() => {
    if (carPickupDate && carDropoffDate && carDropoffDate <= carPickupDate) {
      setCarDropoffDate(addDays(carPickupDate, 1));
    }
  }, [carPickupDate]);

  // Car rental search cards + Trip.com deep links
  const handleSearchCars = async () => {
    if (!carPickup || !carPickupDate || !carDropoffDate) {
      toast.error(t('travel.fillRequired'));
      return;
    }
    setLoadingCars(true);
    setCarResults([]);
    const city = cityList.find(c => c.code === carPickup || c.nameEn === carPickup);
    const cityName = city ? city.nameEn : carPickup;
    
    // Car results are sourced directly from Trip.com – redirect the user
    const dropoffName = resolveCityName(carDropoff || cityName);
    const tripUrl = getTripCarUrl(carPickup, carPickupDate, carDropoffDate, carDropoff || undefined);
    setCarFallbackUrl(tripUrl);
    setCarResults([]); // No fake results
    setLoadingCars(false);

    const isAr = i18n.language?.startsWith('ar');
    const pickupIata = getIataCode(carPickup);
    setPendingRedirect({
      title: isAr ? 'تأكيد التحويل إلى Trip.com للسيارات' : 'Confirm redirect to Trip.com Cars',
      description: isAr
        ? `سيتم فتح Trip.com مع نتائج إيجار السيارات في ${cityName} بالتواريخ المحددة. الأسعار والتفاصيل النهائية تظهر هناك.`
        : `Trip.com will open with car rental results in ${cityName} for your selected dates. Final prices and details are shown there.`,
      actionLabel: isAr ? 'فتح Trip.com' : 'Open Trip.com',
      url: tripUrl,
      summary: [
        { label: isAr ? 'الاستلام' : 'Pickup', value: `${cityName} (${pickupIata}) • ${format(carPickupDate, 'yyyy-MM-dd')}` },
        { label: isAr ? 'التسليم' : 'Dropoff', value: `${dropoffName} • ${format(carDropoffDate, 'yyyy-MM-dd')}` },
      ],
      bookingData: {
        booking_type: 'car',
        destination: cityName,
        departure_date: format(carPickupDate, 'yyyy-MM-dd'),
        return_date: format(carDropoffDate, 'yyyy-MM-dd'),
        provider: 'Trip.com',
      },
    });
  };

  // Transfers – get widget URL from Edge Function
  const handleSearchTransfers = async () => {
    if (!transferFrom || !transferTo) {
      toast.error(t('travel.fillRequiredDepartDestination'));
      return;
    }
    setLoadingTransfers(true);
    setTransferResults([]);
    const fromCity = cityList.find(c => c.code === transferFrom || c.nameEn === transferFrom);
    const toCity = cityList.find(c => c.code === transferTo || c.nameEn === transferTo);
    const fromName = fromCity ? fromCity.nameEn : transferFrom;
    const toName = toCity ? toCity.nameEn : transferTo;
    
    try {
      const { transfers, widgetUrl } = await travelpayoutsService.searchTransfers({
        from: fromName,
        to: toName,
        date: transferDate ? format(transferDate, "yyyy-MM-dd") : undefined,
      });
      
      setTransferResults(transfers);
      // Silent - no toast
      setTransferWidgetUrl(widgetUrl);
    } catch (e) {
      console.error("Transfer search error:", e);
      toast.error(t('travel.transferSearchError'));
    } finally {
      setLoadingTransfers(false);
    }
  };


  useEffect(() => {
    if (!searchId) return;
    setIsPolling(true);
    const pollInterval = setInterval(async () => {
      try {
        const { flights: newFlights, finished } = await travelpayoutsService.getFlightResults(searchId);
        if (newFlights.length > 0) {
          setFlights(prev => {
            const existing = new Set(prev.map(f => `${f.airline}-${f.flight_number}-${f.departure_time}`));
            const filtered = newFlights.filter(f => !existing.has(`${f.airline}-${f.flight_number}-${f.departure_at}`));
            const transformed = filtered.map(f => ({
              ...f,
              airline_logo: `https://pics.avs.io/64/64/${f.airline}.png`,
              departure_time: f.departure_at, // Mapping for UI
              arrival_time: f.return_at || "",
              stops: f.transfers,
              fallback: false
            }));
            return [...prev, ...transformed];
          });
        }
        if (finished) {
          setIsPolling(false);
          setSearchId(null);
          clearInterval(pollInterval);
        }
      } catch (e) {
        console.error("Polling error:", e);
        clearInterval(pollInterval);
        setIsPolling(false);
      }
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [searchId]);

  useEffect(() => {
    if (prefillTab === "flights" && prefillFrom && prefillTo && prefillDate) {
      handleSearchFlights();
    } else if (prefillTab === "hotels" && prefillTo && prefillDate) {
      handleSearchHotels();
    } else if (prefillTab === "cars" && prefillTo && prefillDate) {
      handleSearchCars();
    }
  }, []);

  const handleSearchFlights = async () => {
    if (!flightFrom || !flightTo || !flightDate) {
      toast.error(t('travel.fillRequired'));
      return;
    }
    const departCode = getIataCode(flightFrom);
    const arriveCode = getIataCode(flightTo);
    const outDate = format(flightDate, "yyyy-MM-dd");
    const retDate = flightReturn ? format(flightReturn, "yyyy-MM-dd") : undefined;
    if (retDate && retDate <= outDate) {
      toast.error(t('travel.returnAfterDepart'));
      return;
    }
    if (departCode === arriveCode) {
      toast.error(t('travel.sameOriginDestination', { defaultValue: 'Origin and destination must be different' }));
      return;
    }

    setLoadingFlights(true);
    setFlights([]);
    setShowFlightsWL(false);
    setFlightDiagnostics([
      `search:${departCode}-${arriveCode}-${outDate}${retDate ? `-${retDate}` : ''}`,
      `currency:${currency}`,
    ]);
    try {
      const fallbackFlightUrl = getFlightBookingUrl(departCode, arriveCode, flightDate, flightTripType === 'round' ? flightReturn : undefined, flightAdults);
      let transformed: any[] = [];
      if (!canUseSerpapiFlights) {
        setFlightDiagnostics(prev => [...prev, "SerpAPI disabled for this plan; using Travelpayouts background search"]);
      }

      if (canUseSerpapiFlights) {
      const flightSliceLimit = Math.max(1, maxFlightResultsPerSearch || 8);

      const fetchSerpFlights = async (origin: string, destination: string, date: string, returnDate?: string) => {
        const { data: serpData } = await supabase.functions.invoke("serpapi-flights", {
          body: {
            departure_id: origin,
            arrival_id: destination,
            outbound_date: date,
            return_date: returnDate,
            adults: flightAdults,
            currency: "USD",
            type: returnDate ? "1" : "2",
          }
        });
        await trackSerpapiUsage('serpapi_flight');

        if (!serpData?.success) return { flights: [], googleFlightsUrl: "" };
        const merged = [...(serpData.best_flights || []), ...(serpData.other_flights || [])]
          .slice(0, flightSliceLimit)
          .map((f: any) => mapSerpFlightLeg({ ...f, google_flights_url: serpData.google_flights_url }, origin, destination));
        return {
          flights: merged,
          googleFlightsUrl: serpData.google_flights_url || "",
        };
      };

      try {
        if (flightTripType === 'round' && retDate) {
          const roundtrip = await fetchSerpFlights(departCode, arriveCode, outDate, retDate);
          const [outboundLegs, returnLegs] = await Promise.all([
            fetchSerpFlights(departCode, arriveCode, outDate),
            fetchSerpFlights(arriveCode, departCode, retDate),
          ]);

          if (outboundLegs.flights.length > 0 && returnLegs.flights.length > 0) {
            transformed = mergeRoundTripFlightsWithSerpTimings(
              roundtrip.flights,
              outboundLegs.flights,
              returnLegs.flights,
              roundtrip.googleFlightsUrl || fallbackFlightUrl,
            ).map((flight: any) => ({ ...flight, source: "direct-search", fallback: false, priceSource: "SerpAPI / Google Flights", priceFetchedAt: Date.now() }));
          } else if (roundtrip.flights.length > 0) {
            transformed = roundtrip.flights.map((flight: any) => ({
              ...flight,
              link: roundtrip.googleFlightsUrl || fallbackFlightUrl,
              bookingUrl: roundtrip.googleFlightsUrl || fallbackFlightUrl,
              googleFlightsUrl: roundtrip.googleFlightsUrl || fallbackFlightUrl,
              source: "direct-search",
              fallback: false,
              priceSource: "SerpAPI / Google Flights",
              priceFetchedAt: Date.now(),
            }));
          }
        } else {
          const direct = await fetchSerpFlights(departCode, arriveCode, outDate);
          if (direct.flights.length > 0) {
            transformed = direct.flights.map((outbound: any) => ({
              ...outbound,
              link: direct.googleFlightsUrl || fallbackFlightUrl,
              bookingUrl: direct.googleFlightsUrl || fallbackFlightUrl,
              googleFlightsUrl: direct.googleFlightsUrl || fallbackFlightUrl,
              outbound_leg: outbound,
              fallback: false,
              source: "direct-search",
              priceSource: "SerpAPI / Google Flights",
              priceFetchedAt: Date.now(),
            }));
          }
        }
      } catch (serpErr) {
        console.warn("[flights] Direct flight search failed:", serpErr);
        setFlightDiagnostics(prev => [...prev, `SerpAPI failed: ${serpErr instanceof Error ? serpErr.message : String(serpErr)}`]);
      }
      }

      if (transformed.length === 0) {
        try {
          const cached = await travelpayoutsService.searchFlights({
            origin: departCode,
            destination: arriveCode,
            departDate: outDate,
            returnDate: retDate,
            adults: flightAdults,
            currency: currency || "USD"
          });
          setFlightDiagnostics(prev => [...prev, `Travelpayouts returned ${(cached.flights || []).length} flights${cached.fallback ? ' (deeplink fallback)' : ''}`]);

          const tpFetchedAt = Date.now();
          const rawFlights = cached.flights || [];
          const exactMatches = rawFlights.filter((f: any) => isExactFlightResult(f, departCode, arriveCode, outDate, retDate));
          const droppedNonExact = rawFlights.length - exactMatches.length;
          if (droppedNonExact > 0) {
            setFlightDiagnostics(prev => [...prev, `⚠ تم استبعاد ${droppedNonExact} نتيجة لا تطابق ${departCode} → ${arriveCode} أو التاريخ المطلوب`]);
          }
          transformed = exactMatches.map(f => {
            const cachedFlight = f as any;
            const durationToMins = cachedFlight.duration_to || f.duration || 0;
            const durationBackMins = cachedFlight.duration_back || f.duration || 0;
            const safeDeparture = sanitizeFlightTime(f.departure_at, outDate);
            const safeReturn = sanitizeFlightTime(f.return_at, retDate);
            const outArrival = safeDeparture ? calcArrivalTime(safeDeparture, durationToMins, flightDate) : "";
            const retArrival = (flightTripType === 'round' && retDate && safeReturn)
              ? calcArrivalTime(safeReturn, durationBackMins, flightReturn)
              : "";
            return {
              ...f,
              airline_logo: `https://pics.avs.io/200/80/${f.airline}.png`,
              departure_time: safeDeparture,
              arrival_time: outArrival,
              departure_code: departCode,
              arrival_code: arriveCode,
              stops: f.transfers,
              duration_to: durationToMins,
              duration_back: durationBackMins,
              price: reliablePrice(f.price),
              link: f.link || f.deepLink || cached.deepLink || fallbackFlightUrl,
              bookingUrl: f.link || f.deepLink || cached.deepLink || fallbackFlightUrl,
              googleFlightsUrl: f.link || f.deepLink || cached.deepLink || fallbackFlightUrl,
              return_leg: flightTripType === 'round' && retDate ? {
                airline: f.airline,
                airline_logo: `https://pics.avs.io/200/80/${f.airline}.png`,
                flight_number: f.flight_number,
                departure_time: safeReturn,
                arrival_time: retArrival,
                departure_code: arriveCode,
                arrival_code: departCode,
                duration: durationBackMins,
              } : undefined,
              outbound_leg: {
                airline: f.airline,
                airline_logo: `https://pics.avs.io/200/80/${f.airline}.png`,
                flight_number: f.flight_number,
                departure_time: safeDeparture,
                arrival_time: outArrival,
                departure_code: departCode,
                arrival_code: arriveCode,
                duration: durationToMins,
              },
              fallback: cached.fallback ?? false,
              source: "fallback-search",
              priceSource: "Travelpayouts (cache)",
              priceFetchedAt: tpFetchedAt,
            };
          });
        } catch (cachedErr) {
          console.warn("[flights] Fallback flight search failed:", cachedErr);
          setFlightDiagnostics(prev => [...prev, `Travelpayouts failed: ${cachedErr instanceof Error ? cachedErr.message : String(cachedErr)}`]);
        }
      }

      if (transformed.length === 0) {
        transformed = buildFlightFallbackCards(departCode, arriveCode, flightDate, flightTripType === 'round' ? flightReturn : undefined, flightAdults);
        setFlightDiagnostics(prev => [...prev, "No cached API fares returned; showing Aviasales route cards with exact search links"]);
      } else if (transformed.length < 4) {
        transformed = transformed.slice(0, Math.max(1, transformed.length));
      }
      setFlights(transformed);
      // Silent - no toast for results
    } catch (e) {
      console.error("Flight search error:", e);
      toast.error(t('travel.flightSearchError'));
    } finally {
      setLoadingFlights(false);
    }
  };

  const buildFlightFallbackCards = useCallback((fromCode: string, toCode: string, depart: Date, ret?: Date, adults = 1) => {
    const clockOptions = ["07:30", "10:45", "15:20", "21:10"];
    const estimateDuration = (origin: string, destination: string, offset: number) => {
      const regional = new Set(["JED", "RUH", "DMM", "MED", "DXB", "AUH", "DOH", "BAH", "KWI", "MCT", "CAI", "AMM"]);
      const northAmerica = new Set(["JFK", "LAX", "SFO", "SJC", "ORD", "MIA", "YYZ", "YVR"]);
      let mins = 150;
      if (northAmerica.has(origin) || northAmerica.has(destination)) mins = 16 * 60 + 20;
      else if (!regional.has(origin) || !regional.has(destination)) mins = 6 * 60 + 35;
      return mins + offset * 25;
    };
    const addClockMinutes = (time: string, mins: number) => {
      const [h, m] = time.split(":").map(Number);
      const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const primaryAirline = preferredAirlineForRoute(fromCode, toCode);
    const airlinePool = [
      primaryAirline,
      { code: "EK", name: "Emirates" },
      { code: "QR", name: "Qatar Airways" },
      { code: "TK", name: "Turkish Airlines" },
      { code: "XY", name: "flynas" },
    ].filter((airline, index, all) => all.findIndex((a) => a.code === airline.code) === index).slice(0, 4);
    const departDateStr = format(depart, "yyyy-MM-dd");
    const returnDateStr = ret ? format(ret, "yyyy-MM-dd") : undefined;
    const bookingUrl = getFlightBookingUrl(fromCode, toCode, depart, ret, adults);
    return airlinePool.map((airline, index) => {
      const flightNo = `${airline.code} search`;
      const depClock = clockOptions[index] || "09:00";
      const retClock = clockOptions[(index + 2) % clockOptions.length] || "18:00";
      const durationTo = estimateDuration(fromCode, toCode, index);
      const durationBack = estimateDuration(toCode, fromCode, index);
      return {
        airline: `${airline.name} ${t("bookingsPage.liveLabels.searchSuffix", { defaultValue: "Search" })}`,
        airline_logo: `https://pics.avs.io/200/80/${airline.code}.png`,
        flight_number: flightNo,
        departure_at: departDateStr,
        departure_time: depClock,
        arrival_time: addClockMinutes(depClock, durationTo),
        return_at: returnDateStr,
        departure_code: fromCode,
        arrival_code: toCode,
        origin: fromCode,
        destination: toCode,
        transfers: index === 0 ? 0 : 1,
        stops: index === 0 ? 0 : 1,
        duration: durationTo + (ret ? durationBack : 0),
        duration_to: durationTo,
        duration_back: ret ? durationBack : 0,
        price: 0,
        currency: currency || "USD",
        link: bookingUrl,
        bookingUrl,
        googleFlightsUrl: bookingUrl,
        fallback: true,
        source: "deeplink-search",
        priceSource: "Aviasales exact search link",
        priceFetchedAt: Date.now(),
        outbound_leg: {
          airline: `${airline.name} ${t("bookingsPage.liveLabels.searchSuffix", { defaultValue: "Search" })}`,
          airline_logo: `https://pics.avs.io/200/80/${airline.code}.png`,
          flight_number: flightNo,
          departure_time: depClock,
          arrival_time: addClockMinutes(depClock, durationTo),
          departure_code: fromCode,
          arrival_code: toCode,
          duration: durationTo,
        },
        return_leg: returnDateStr ? {
          airline: `${airline.name} ${t("bookingsPage.liveLabels.searchSuffix", { defaultValue: "Search" })}`,
          airline_logo: `https://pics.avs.io/200/80/${airline.code}.png`,
          flight_number: `${airline.code} search`,
          departure_time: retClock,
          arrival_time: addClockMinutes(retClock, durationBack),
          departure_code: toCode,
          arrival_code: fromCode,
          duration: durationBack,
        } : undefined,
      };
    });
  }, [i18n.language]);

  const buildHotelFallbackCards = useCallback((cityName: string, checkIn: Date, checkOut: Date, guests = 2) => {
    const cityKey = cityName.trim().toLowerCase().replace(/\s+/g, " ");
    const compactKey = cityKey.replace(/\s+/g, "");
    const names = hotelSeedByCity[cityKey] || hotelSeedByCity[compactKey] || hotelSeedByCity[getIataCode(cityName).toLowerCase()] || [
      `${cityName} Central Hotel`,
      `${cityName} City Suites`,
      `${cityName} Grand Hotel`,
      `${cityName} Boutique Stay`,
    ];
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
    const base = compactKey.includes("santaclara") || compactKey === "sjc" ? 135 : compactKey.includes("dubai") || compactKey === "dxb" ? 110 : compactKey.includes("riyadh") || compactKey === "ruh" ? 95 : compactKey.includes("jeddah") || compactKey === "jed" ? 85 : 75;
    return names.slice(0, 4).map((name, index) => {
      const nightly = base + index * 35;
      const link = getHotelBookingUrl(cityName, checkIn, checkOut, guests);
      return {
        name,
        rate_per_night: nightly,
        total_rate: nightly * nights,
        overall_rating: Math.max(7.8, 9.1 - index * 0.3),
        extracted_hotel_class: index === 0 ? 5 : index === 1 ? 4 : 3,
        images: [],
        image: "",
        link,
        bookingUrl: link,
        externalLink: link,
        amenities: ["WiFi", "Restaurant", index === 0 ? "Pool" : "Breakfast"],
        free_cancellation: index !== 2,
        reviews: 800 + index * 450,
        nearby_places: [],
        location: getHotelDestinationName(cityName),
        fallback: true,
        source: "deeplink-search",
        currency: "USD",
      };
    });
  }, []);

  const handleSearchMultiCity = async () => {
    const validLegs = multiCityLegs.filter(l => l.from && l.to && l.date);
    if (validLegs.length < 2) {
      toast.error(i18n.language?.startsWith('ar') ? 'يرجى ملء قطاعين على الأقل' : 'Please fill at least 2 legs');
      return;
    }
    setLoadingFlights(true);
    setFlights([]);
    try {
      const allLegsResults: any[] = [];
      for (let i = 0; i < validLegs.length; i++) {
        const leg = validLegs[i];
        const fromCode = getIataCode(leg.from);
        const toCode = getIataCode(leg.to);
        const dateStr = format(leg.date!, "yyyy-MM-dd");
        const bookingUrl = getFlightBookingUrl(fromCode, toCode, leg.date!);
        
        try {
          const cached = await travelpayoutsService.searchFlights({
            origin: fromCode, destination: toCode, departDate: dateStr, adults: flightAdults, currency: "USD"
          });
          const legFlights = (cached.flights || []).slice(0, 4).map(f => {
            const dur = (f as any).duration_to || f.duration || 0;
            const arrival = calcArrivalTime(f.departure_at, dur, leg.date);
            return {
              ...f,
              airline_logo: `https://pics.avs.io/200/80/${f.airline}.png`,
              departure_time: f.departure_at,
              arrival_time: arrival,
              departure_code: fromCode,
              arrival_code: toCode,
              stops: f.transfers,
              duration_to: dur,
              link: bookingUrl,
              outbound_leg: {
                airline: f.airline,
                airline_logo: `https://pics.avs.io/200/80/${f.airline}.png`,
                flight_number: f.flight_number,
                departure_time: f.departure_at,
                arrival_time: arrival,
                departure_code: fromCode,
                arrival_code: toCode,
                duration: dur,
                stops: f.transfers ?? 0,
                price: f.price || 0,
                currency: f.currency || "USD",
              },
              multiCityLegIndex: i,
              multiCityLegLabel: `${fromCode} → ${toCode}`,
              fallback: cached.fallback ?? false,
              source: "aviasales",
            };
          });
          allLegsResults.push(...legFlights);
        } catch (err) {
          console.warn(`Multi-city leg ${i} search failed:`, err);
        }
      }
      setFlights(allLegsResults);
      // Silent - no toast for results
    } catch (e) {
      console.error("Multi-city search error:", e);
      toast.error(t('travel.flightSearchError'));
    } finally {
      setLoadingFlights(false);
    }
  };

  const handleSearchHotels = async () => {
    if (!hotelLocation || !hotelCheckIn || !hotelCheckOut) {
      toast.error(t('travel.fillRequired'));
      return;
    }
    setLoadingHotels(true);
    setHotels([]);
    const searchQuery = getCityDisplayName(hotelLocation);
    setHotelLocationName(getHotelDestinationName(hotelLocation) || searchQuery);
    const checkInStr = format(hotelCheckIn, "yyyy-MM-dd");
    const checkOutStr = format(hotelCheckOut, "yyyy-MM-dd");
    if (checkOutStr <= checkInStr) {
      toast.error(t('travel.returnAfterDepart'));
      setLoadingHotels(false);
      return;
    }
    setHotelDiagnostics([`search:${searchQuery}-${checkInStr}-${checkOutStr}`, `currency:${currency}`]);
    try {
      let transformed: any[] = [];
      if (!canUseSerpapiHotels) {
        setHotelDiagnostics(prev => [...prev, "SerpAPI disabled for this plan; using Hotellook background search"]);
      }
      if (canUseSerpapiHotels) {
      const hotelSliceLimit = Math.max(1, maxHotelResultsPerSearch || 12);
      const { data: serpData } = await supabase.functions.invoke("serpapi-hotels", {
        body: {
          query: `${searchQuery} hotels`,
          check_in_date: checkInStr,
          check_out_date: checkOutStr,
          adults: hotelGuests,
          currency: "USD"
        }
      });
      await trackSerpapiUsage('serpapi_hotel');

      transformed = serpData?.success && serpData.hotels?.length > 0
        ? serpData.hotels.slice(0, hotelSliceLimit).map((h: any) => ({
            name: h.name || "",
            rate_per_night: typeof h.rate_per_night === 'string' ? parseFloat(h.rate_per_night.replace(/[^0-9.]/g, '')) : (h.rate_per_night || 0),
            total_rate: typeof h.total_rate === 'string' ? parseFloat(h.total_rate.replace(/[^0-9.]/g, '')) : (h.total_rate || 0),
            overall_rating: h.overall_rating || 0,
            extracted_hotel_class: h.extracted_hotel_class || h.hotel_class || 0,
            images: (h.images || []).slice(0, 8).map((img: any) => ({
              thumbnail: img.thumbnail || img.original,
              original: img.original || img.thumbnail,
            })),
            image: h.images?.[0]?.original || h.images?.[0]?.thumbnail || "",
            link: h.link || h.serpapi_property_details_link || "",
            bookingUrl: h.link || h.serpapi_property_details_link || "",
            externalLink: h.link || h.serpapi_property_details_link || "",
            amenities: h.amenities || [],
            excluded_amenities: h.excluded_amenities || [],
            health_and_safety: h.health_and_safety || null,
            essential_info: h.essential_info || [],
            prices: h.prices || [],
            free_cancellation: h.free_cancellation || false,
            reviews: h.reviews || 0,
            nearby_places: h.nearby_places || [],
            location: h.location || searchQuery,
            address: h.address || "",
            location_rating: h.location_rating || 0,
            fallback: false,
            source: "direct-search",
            priceSource: "SerpAPI / Google Hotels",
            priceFetchedAt: Date.now(),
          }))
        : [];
      setHotelDiagnostics(prev => [...prev, `SerpAPI returned ${transformed.length} hotels`]);
      }

      if (transformed.length === 0) {
        try {
          const cached = await travelpayoutsService.searchHotels({
            city: searchQuery,
            iata: getIataCode(hotelLocation),
            checkIn: checkInStr,
            checkOut: checkOutStr,
            adults: hotelGuests,
            currency: currency || "USD",
          });
          setHotelDiagnostics(prev => [...prev, `Hotellook returned ${(cached.hotels || []).length} hotels${cached.fallback ? ' (deeplink fallback)' : ''}`]);
          const cityFallbackUrl = getHotelBookingUrl(hotelLocation, hotelCheckIn, hotelCheckOut, hotelGuests, i18n.language);
          const fetchedAt = Date.now();
          transformed = (cached.hotels || []).map((h: any) => {
            const hName = getHotelCacheName(h, searchQuery);
            // Per-hotel direct deep-link by name → opens the actual property page when matched
            const directHotelLink = (hotelCheckIn && hotelCheckOut)
              ? getHotelDirectLink(hName, hotelLocation, hotelCheckIn, hotelCheckOut, hotelGuests, currency || "USD", i18n.language)
              : cityFallbackUrl;
            return normalizeHotelCacheResult(h, {
              bookingLink: directHotelLink,
              currency: currency || "USD",
              fetchedAt,
              locationName: getHotelDestinationName(hotelLocation) || h.location || searchQuery,
              name: hName,
              searchQuery,
              source: "hotellook",
            });
          });
        } catch (cachedErr) {
          console.warn("[hotels] Hotellook fallback search failed:", cachedErr);
          setHotelDiagnostics(prev => [...prev, `Hotellook failed: ${cachedErr instanceof Error ? cachedErr.message : String(cachedErr)}`]);
        }
      }

      // STRICT city-match filter — drop results that don't reference the requested city
      if (transformed.length > 0) {
        const requestedIata = getIataCode(hotelLocation);
        const before = transformed.length;
        const filtered = transformed.filter(h => hotelMatchesCity(h, searchQuery, requestedIata));
        const dropped = before - filtered.length;
        if (dropped > 0) {
          setHotelDiagnostics(prev => [...prev, `⚠ تم استبعاد ${dropped} نتيجة لا تطابق ${searchQuery} (${requestedIata})`]);
        }
        if (filtered.length === 0 && before > 0) {
          setHotelDiagnostics(prev => [...prev, `⚠ لم تتطابق أي نتيجة مع المدينة المطلوبة — سيتم عرض روابط بحث مطابقة فقط`]);
        }
        transformed = filtered;
      }

      if (transformed.length === 0) {
        transformed = [];
        setHotelDiagnostics(prev => [...prev, "No verified hotel API cards returned"]);
      }
      setHotels(transformed);
    } catch (e) {
      console.error("Hotel search error:", e);
      toast.error(t('travel.hotelSearchError'));
    } finally {
      setLoadingHotels(false);
    }
  };

  useEffect(() => {
    const flightKey = flightFrom && flightTo && flightDate
      ? `f:${getIataCode(flightFrom)}-${getIataCode(flightTo)}-${format(flightDate, "yyyy-MM-dd")}-${flightReturn ? format(flightReturn, "yyyy-MM-dd") : "oneway"}-${flightAdults}-${currency}`
      : "";
    const hotelKey = hotelLocation && hotelCheckIn && hotelCheckOut
      ? `h:${getCityDisplayName(hotelLocation)}-${format(hotelCheckIn, "yyyy-MM-dd")}-${format(hotelCheckOut, "yyyy-MM-dd")}-${hotelGuests}-${currency}`
      : "";
    const key = `${flightKey}|${hotelKey}`;
    if (!key || key === autoSearchKeyRef.current) return;
    if (!flightKey && !hotelKey) return;
    autoSearchKeyRef.current = key;

    const timer = window.setTimeout(() => {
      if (flightKey && flights.length === 0 && !loadingFlights) void handleSearchFlights();
      if (hotelKey && hotels.length === 0 && !loadingHotels) void handleSearchHotels();
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightFrom, flightTo, flightDate, flightReturn, flightAdults, hotelLocation, hotelCheckIn, hotelCheckOut, hotelGuests, currency]);

  // ---- Booking-link validators -------------------------------------------------
  // Make sure a direct provider URL (from SerpAPI / itinerary enrichment) actually
  // refers to the SAME route + dates the user is searching right now. Otherwise we
  // discard it and rebuild a fresh URL — protects users from stale deep links.
  const flightLinkMatchesContext = (rawUrl: string, fromCode: string, toCode: string, depart: Date, ret?: Date) => {
    try {
      const u = new URL(rawUrl);
      const hay = (u.search + " " + u.pathname).toUpperCase();
      const dd = format(depart, "ddMM");
      const ymd = format(depart, "yyyy-MM-dd");
      const hasOrigin = !!fromCode && hay.includes(fromCode.toUpperCase());
      const hasDest = !!toCode && hay.includes(toCode.toUpperCase());
      const hasDate = hay.includes(dd) || hay.includes(ymd);
      // Aviasales-style "AAADDMMBBB" segment also counts as a match.
      const compact = fromCode && toCode ? `${fromCode}${dd}${toCode}`.toUpperCase() : "";
      const hasCompact = compact && hay.includes(compact);
      if (ret) {
        const rdd = format(ret, "ddMM");
        const rymd = format(ret, "yyyy-MM-dd");
        const hasReturn = hay.includes(rdd) || hay.includes(rymd);
        return (hasCompact || (hasOrigin && hasDest && hasDate)) && hasReturn;
      }
      return hasCompact || (hasOrigin && hasDest && hasDate);
    } catch {
      return false;
    }
  };

  const hotelLinkMatchesContext = (rawUrl: string, cityName: string, ci?: Date, co?: Date) => {
    try {
      const u = new URL(rawUrl);
      const hay = decodeURIComponent(u.search + " " + u.pathname).replace(/\+/g, " ").toLowerCase();
      const cityKey = (cityName || "").trim().toLowerCase();
      const hasCity = !!cityKey && hay.includes(cityKey);
      const hasCi = ci ? hay.includes(format(ci, "yyyy-MM-dd")) : true;
      const hasCo = co ? hay.includes(format(co, "yyyy-MM-dd")) : true;
      // Accept Hotellook deep-links built by `getHotelDirectLink` (they include city + dates).
      // Older stale Hotellook links without city/date are still rejected by hasCity/hasCi/hasCo.
      return hasCity && hasCi && hasCo;
    } catch {
      return false;
    }
  };

  const handleBookFlight = (flight: any) => {
    const fromCode = getIataCode(flightFrom);
    const toCode = getIataCode(flightTo);
    const isAr = i18n.language?.startsWith('ar');
    // Prefer the direct provider URL coming from SerpAPI / itinerary enrichment,
    // BUT only if it matches the user's current route + dates. Otherwise rebuild.
    const candidate: string | undefined =
      flight?.bookingUrl || flight?.googleFlightsUrl || flight?.externalLink || flight?.link;
    const useDirect = !!candidate && !!flightDate && flightLinkMatchesContext(
      candidate,
      fromCode,
      toCode,
      flightDate,
      flightTripType === 'round' ? flightReturn : undefined,
    );
    const url = useDirect
      ? candidate
      : (flightDate
          ? getFlightBookingUrl(fromCode, toCode, flightDate, flightTripType === 'round' ? flightReturn : undefined, flightAdults)
          : null);
    if (!url) {
      toast.error(isAr ? "لا يوجد رابط حجز متاح" : "No booking link available");
      return;
    }
    if (candidate && !useDirect) {
      // Tell the user we replaced a stale link so they know why the URL differs.
      toast.message(isAr
        ? "تم استبدال الرابط بآخر مطابق لمدينتك وتواريخك"
        : "Link replaced with one matching your route & dates");
    }

    setPendingRedirect({
      title: isAr ? 'تأكيد فتح صفحة الحجز' : 'Confirm opening booking page',
      description: isAr
        ? 'سيتم فتح صفحة الحجز بنفس المسار والتواريخ. يرجى تأكيد السعر والحقائب هناك.'
        : 'The booking page will open with the same route & dates. Confirm price & baggage there.',
      actionLabel: isAr ? 'فتح صفحة الحجز' : 'Open booking page',
      url,
      summary: [
        { label: isAr ? 'المسار' : 'Route', value: `${flight?.fromCode || fromCode} → ${flight?.toCode || toCode}` },
        { label: isAr ? 'التواريخ' : 'Dates', value: `${flight?.date || (flightDate ? format(flightDate, 'yyyy-MM-dd') : '—')}${flightTripType === 'round' && flightReturn ? ` → ${format(flightReturn, 'yyyy-MM-dd')}` : ''}` },
        { label: isAr ? 'المسافرون' : 'Travelers', value: String(flightAdults) },
        { label: isAr ? 'مصدر الرابط' : 'Link source', value: useDirect ? (isAr ? 'مباشر (مطابق)' : 'Direct (verified)') : (isAr ? 'مُعاد بناؤه' : 'Rebuilt') },
      ],
      bookingData: {
        booking_type: 'flight',
        origin: flight?.fromCode || fromCode,
        destination: flight?.toCode || toCode,
        departure_date: flight?.date || (flightDate ? format(flightDate, 'yyyy-MM-dd') : undefined),
        return_date: flightReturn ? format(flightReturn, 'yyyy-MM-dd') : undefined,
        guests: flightAdults,
        provider: useDirect ? 'Direct' : 'Aviasales',
        price: flight.price || undefined,
        currency: flight.currency || 'USD',
        airline: flight.airline,
        flight_number: flight.flight_number || flight.flightNumber,
      },
    });
  };

  const handleBookCar = (car: any) => {
    const url = getTripCarUrl(carPickup || '', carPickupDate, carDropoffDate, carDropoff || undefined);
    if (!url) {
      toast.error("لا يوجد رابط حجز متاح");
      return;
    }

    const cityName = resolveCityName(carPickup || '');
    const dropoffName = resolveCityName(carDropoff || cityName);
    const isAr = i18n.language?.startsWith('ar');
    setPendingRedirect({
      title: isAr ? 'تأكيد التحويل إلى Trip.com للسيارات' : 'Confirm redirect to Trip.com Cars',
      description: isAr ? 'سيتم فتح Trip.com بنفس مدينة الاستلام والتسليم والتواريخ. الأسعار النهائية تظهر هناك.' : 'Trip.com will open with your selected pickup/dropoff city and dates. Final prices are shown there.',
      actionLabel: isAr ? 'فتح Trip.com' : 'Open Trip.com',
      url,
      summary: [
        { label: isAr ? 'الاستلام' : 'Pickup', value: `${cityName}${carPickupDate ? ` • ${format(carPickupDate, 'yyyy-MM-dd')}` : ''}` },
        { label: isAr ? 'التسليم' : 'Dropoff', value: `${dropoffName}${carDropoffDate ? ` • ${format(carDropoffDate, 'yyyy-MM-dd')}` : ''}` },
      ],
      bookingData: {
        booking_type: 'car',
        destination: cityName,
        departure_date: carPickupDate ? format(carPickupDate, 'yyyy-MM-dd') : undefined,
        return_date: carDropoffDate ? format(carDropoffDate, 'yyyy-MM-dd') : undefined,
        provider: 'Trip.com',
        price: car.price,
        currency: car.currency || 'USD',
        metadata: { car_name: car.name, pickup_city: cityName, dropoff_city: dropoffName }
      },
    });
  };

  const handleBookTransfer = (transfer: any) => {
    const fromName = resolveCityName(transferFrom || '');
    const toName = resolveCityName(transferTo || '');
    const url = getTripTransferUrl(fromName, toName, transferDate);
    if (!url) {
      toast.error("لا يوجد رابط حجز متاح");
      return;
    }

    const isAr = i18n.language?.startsWith('ar');
    setPendingRedirect({
      title: isAr ? 'تأكيد التحويل إلى Trip.com للتوصيل' : 'Confirm redirect to Trip.com Transfers',
      description: isAr ? 'سيتم فتح Trip.com بنقطة الانطلاق والوجهة والتاريخ.' : 'Trip.com will open with your origin, destination, and date.',
      actionLabel: isAr ? 'فتح Trip.com' : 'Open Trip.com',
      url,
      summary: [
        { label: isAr ? 'من' : 'From', value: fromName || '—' },
        { label: isAr ? 'إلى' : 'To', value: toName || '—' },
      ],
      bookingData: {
        booking_type: 'transfer',
        origin: fromName,
        destination: toName,
        departure_date: transferDate ? format(transferDate, 'yyyy-MM-dd') : undefined,
        provider: 'Trip.com',
        price: transfer.price,
        currency: transfer.currency || 'USD',
        guests: transferPassengers,
        metadata: { vehicle: transfer.name, type: transfer.type }
      },
    });
  };

  const handleBookHotel = (hotel: any) => {
    const cityName = resolveCityName(hotelLocationName || hotelLocation || hotel?.city || 'Dubai');
    const isAr = i18n.language?.startsWith('ar');
    // Direct provider URL is preferred ONLY if it actually points at the same
    // city + date range the user selected; stale SerpAPI links are discarded.
    const candidate: string | undefined =
      hotel?.bookingUrl || hotel?.externalLink || hotel?.link || hotel?.serpapi_property_details_link;
    const useDirect = !!candidate && hotelLinkMatchesContext(candidate, cityName, hotelCheckIn, hotelCheckOut);
    const url = useDirect
      ? candidate
      : (hotelCheckIn && hotelCheckOut
          ? getHotelBookingUrl(cityName, hotelCheckIn, hotelCheckOut, hotelGuests, i18n.language)
          : null);
    if (!url) {
      toast.error(isAr ? "لا يوجد رابط حجز متاح" : "No booking link available");
      return;
    }
    if (candidate && !useDirect) {
      toast.message(isAr
        ? "تم استبدال الرابط بآخر مطابق لمدينتك وتواريخك"
        : "Link replaced with one matching your city & dates");
    }

    setPendingRedirect({
      title: isAr ? 'تأكيد فتح صفحة الحجز' : 'Confirm opening booking page',
      description: isAr
        ? 'الصور والأسعار تقريبية. سيتم فتح صفحة الحجز بنفس المدينة والتواريخ.'
        : 'Images & prices are approximate. The booking page will open with same city, dates, and guests.',
      actionLabel: isAr ? 'فتح صفحة الحجز' : 'Open booking page',
      url,
      summary: [
        { label: isAr ? 'الفندق' : 'Hotel', value: hotel.name || cityName },
        { label: isAr ? 'المدينة' : 'City', value: cityName },
        { label: isAr ? 'الإقامة' : 'Stay', value: `${hotel?.checkInDate || (hotelCheckIn ? format(hotelCheckIn, 'yyyy-MM-dd') : '—')} → ${hotel?.checkOutDate || (hotelCheckOut ? format(hotelCheckOut, 'yyyy-MM-dd') : '—')}` },
        { label: isAr ? 'الضيوف' : 'Guests', value: String(hotelGuests) },
        { label: isAr ? 'مصدر الرابط' : 'Link source', value: useDirect ? (isAr ? 'مباشر (مطابق)' : 'Direct (verified)') : (isAr ? 'مُعاد بناؤه' : 'Rebuilt') },
      ],
      bookingData: {
        booking_type: 'hotel',
        destination: cityName,
        hotel_name: hotel.name,
        departure_date: hotel?.checkInDate || (hotelCheckIn ? format(hotelCheckIn, 'yyyy-MM-dd') : undefined),
        return_date: hotel?.checkOutDate || (hotelCheckOut ? format(hotelCheckOut, 'yyyy-MM-dd') : undefined),
        guests: hotelGuests,
        provider: useDirect ? 'Direct' : 'Hotellook',
        price: typeof hotel.pricePerNight === 'number' ? hotel.pricePerNight : (typeof hotel.rate_per_night === 'number' ? hotel.rate_per_night : undefined),
        currency: hotel.currency || 'USD',
      },
    });
  };

  const displayPrice = (amount: number, f?: any): string => {
    if (!amount || amount <= 0) return "—";
    // Always pass source currency so the user-selected currency conversion is applied consistently.
    const sourceCurrency = (f?.currency || "USD").toUpperCase();
    return formatPrice(amount, sourceCurrency);
  };

  const renderDiagnostics = (items: string[], type: "flight" | "hotel") => {
    return null;
  };

  const parseHotelPrice = (h: any): number => {
    const raw = h.rate_per_night ?? h.pricePerNight ?? h.price;
    if (typeof raw === 'string') return parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
    if (typeof raw === 'object' && raw !== null) return raw.extracted_lowest || raw.lowest || 0;
    return raw || 0;
  };

  const handleSelectGeneratedFlight = (flight: any) => {
    const fromCode = flight.fromCode || flight.departure_code || getIataCode(flight.from || flightFrom || "");
    const toCode = flight.toCode || flight.arrival_code || getIataCode(flight.to || flightTo || "");
    const selectedFlight = {
      airline: flight.airline || "",
      airline_logo: flight.airlineLogo || flight.airline_logo || "",
      flight_number: flight.flightNumber || flight.flight_number || "",
      departure_time: flight.departureTime || flight.departure_time || "",
      arrival_time: flight.arrivalTime || flight.arrival_time || "",
      departure_code: fromCode,
      arrival_code: toCode,
      origin: flight.from || flight.fromCode || flightFrom,
      destination: flight.to || flight.toCode || flightTo,
      duration: parseNumericValue(flight.duration),
      duration_to: parseNumericValue(flight.duration),
      transfers: typeof flight.stops === "number" ? flight.stops : 0,
      stops: typeof flight.stops === "number" ? flight.stops : 0,
      price: parseNumericValue(flight.price),
      currency: flight.currency || "USD",
      link: flight.bookingUrl || flight.link || getFlightBookingUrl(
        fromCode,
        toCode,
        parseISODateLocal(flight.date) || flightDate || new Date(),
      ),
      source: flight.source || "serpapi",
    };

    persistItinerarySelection({
      selectedFlights: [flight],
      bookingSelections: {
        ...(generatedItinerary?.bookingSelections || {}),
        flight: {
          status: "selected",
          details: `${selectedFlight.airline} ${selectedFlight.flight_number} - ${displayPrice(selectedFlight.price, selectedFlight)}`,
          data: selectedFlight,
        },
      },
    });
    toast.success(i18n.language?.startsWith("ar") ? "تمت إضافة الرحلة إلى الخطة" : "Flight added to itinerary");
  };

  const handleSelectGeneratedHotel = (hotel: any) => {
    const nightlyPrice = parseNumericValue(hotel.pricePerNight ?? hotel.rate_per_night);
    const totalPrice = parseNumericValue(hotel.totalPrice);
    const selectedHotel = {
      hotelName: hotel.name || hotel.hotelName || "",
      city: hotel.city || hotelLocationName || resolveCityName(hotelLocation),
      image: hotel.image || hotel.images?.[0]?.thumbnail || hotel.images?.[0]?.original || "",
      stars: clampStars(hotel.stars ?? hotel.extracted_hotel_class ?? hotel.hotel_class),
      rating: parseNumericValue(hotel.rating ?? hotel.overall_rating),
      reviews: parseNumericValue(hotel.reviews),
      price: nightlyPrice,
      totalPrice,
      currency: hotel.currency || "USD",
      checkInDate: hotel.checkInDate || (hotelCheckIn ? format(hotelCheckIn, "yyyy-MM-dd") : undefined),
      checkOutDate: hotel.checkOutDate || (hotelCheckOut ? format(hotelCheckOut, "yyyy-MM-dd") : undefined),
      link: hotel.bookingUrl || hotel.link || (hotelCheckIn && hotelCheckOut ? getHotelBookingUrl(resolveCityName(hotel.city || hotelLocationName || hotelLocation), hotelCheckIn, hotelCheckOut, hotelGuests, i18n.language) : undefined),
      amenities: hotel.amenities || [],
    };

    persistItinerarySelection({
      selectedHotels: [hotel],
      bookingSelections: {
        ...(generatedItinerary?.bookingSelections || {}),
        hotel: {
          status: "selected",
          details: `${selectedHotel.hotelName} - ${displayPrice(selectedHotel.price, selectedHotel)}`,
          data: selectedHotel,
        },
      },
    });
    toast.success(i18n.language?.startsWith("ar") ? "تمت إضافة الفندق إلى الخطة" : "Hotel added to itinerary");
  };

  const handleClearGeneratedSelection = (kind: "flight" | "hotel") => {
    const currentSelections = { ...(generatedItinerary?.bookingSelections || {}) };
    delete currentSelections[kind];
    const updates: any = { bookingSelections: currentSelections };
    if (kind === "flight") updates.selectedFlights = [];
    if (kind === "hotel") updates.selectedHotels = [];
    persistItinerarySelection(updates);
    toast.success(
      i18n.language?.startsWith("ar")
        ? (kind === "flight" ? "تم إلغاء اختيار الرحلة" : "تم إلغاء اختيار الفندق")
        : (kind === "flight" ? "Flight selection cleared" : "Hotel selection cleared")
    );
  };

  const isFlightSelected = (f: any): boolean => {
    const sel = generatedItinerary?.bookingSelections?.flight;
    if (!sel || sel.status !== "selected") return false;
    const d = sel.data || {};
    const fNum = f.flightNumber || f.flight_number;
    if (fNum && d.flight_number && fNum === d.flight_number) return true;
    if (f.airline && d.airline && f.airline === d.airline && parseNumericValue(f.price) === parseNumericValue(d.price)) return true;
    return false;
  };

  const isHotelSelected = (h: any): boolean => {
    const sel = generatedItinerary?.bookingSelections?.hotel;
    if (!sel || sel.status !== "selected") return false;
    const d = sel.data || {};
    const name = h.name || h.hotelName;
    return !!(name && d.hotelName && name === d.hotelName);
  };


  const sortedFlights = useMemo(() => {
    let arr = [...flights];

    // Filter first
    if (stopsFilter.length > 0) {
      arr = arr.filter(f => stopsFilter.includes(f.stops));
    }
    if (selectedAirlines.length > 0) {
      arr = arr.filter(f => selectedAirlines.includes(f.airline));
    }
    if (timeFilter !== 'all') {
      arr = arr.filter(f => {
        const hour = parseInt(f.departure_time?.split('T')?.[1]?.split(':')?.[0] || '12');
        if (timeFilter === 'morning') return hour >= 6 && hour < 12;
        if (timeFilter === 'afternoon') return hour >= 12 && hour < 18;
        if (timeFilter === 'evening') return hour >= 18 && hour < 24;
        return true;
      });
    }

    const priceVal = (f: any) => (f.price || 0) === 0 ? Infinity : f.price;
    switch (flightSort) {
      case 'price-asc': return arr.sort((a, b) => priceVal(a) - priceVal(b));
      case 'price-desc': return arr.sort((a, b) => { 
        const ap = a.price || 0, bp = b.price || 0; 
        if (ap === 0) return 1; if (bp === 0) return -1; 
        return bp - ap; 
      });
      case 'duration-asc': return arr.sort((a, b) => (a.duration || 0) - (b.duration || 0));
      case 'stops-asc': return arr.sort((a, b) => (a.stops || 0) - (b.stops || 0));
      default: return arr;
    }
  }, [flights, flightSort, stopsFilter, selectedAirlines, timeFilter]);

  // Sorted & filtered hotels
  const sortedHotels = useMemo(() => {
    let arr = [...hotels];

    // Filter by stars
    if (hotelStarFilter.length > 0) {
      arr = arr.filter(h => hotelStarFilter.includes(h.extracted_hotel_class || 0));
    }

    // Filter by price range
    arr = arr.filter(h => {
      const price = parseHotelPrice(h);
      if (price === 0) return true; // Show hotels with no price
      return price >= hotelPriceRange[0] && price <= hotelPriceRange[1];
    });

    // Filter by amenities
    if (hotelAmenityFilter.length > 0) {
      arr = arr.filter(h => {
        const hotelAmenities = (h.amenities || []).map((a: string) => a.toLowerCase());
        return hotelAmenityFilter.every(af => hotelAmenities.some((ha: string) => ha.includes(af.toLowerCase())));
      });
    }

    switch (hotelSort) {
      case 'price-asc': return arr.sort((a, b) => parseHotelPrice(a) - parseHotelPrice(b));
      case 'price-desc': return arr.sort((a, b) => parseHotelPrice(b) - parseHotelPrice(a));
      case 'rating-desc': return arr.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
      case 'class-desc': return arr.sort((a, b) => (b.extracted_hotel_class || 0) - (a.extracted_hotel_class || 0));
      default: return arr;
    }
  }, [hotels, hotelSort, hotelStarFilter, hotelPriceRange, hotelAmenityFilter]);

  // All unique amenities from results
  const allAmenities = useMemo(() => {
    const set = new Set<string>();
    hotels.forEach(h => (h.amenities || []).forEach((a: string) => set.add(a)));
    return Array.from(set).slice(0, 12);
  }, [hotels]);

  const formatDuration = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}س ${m > 0 ? m + 'د' : ''}`.trim();
  };

  const toggleStarFilter = (star: number) => {
    setHotelStarFilter(prev => prev.includes(star) ? prev.filter(s => s !== star) : [...prev, star]);
  };

  const toggleAmenityFilter = (amenity: string) => {
    setHotelAmenityFilter(prev => prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]);
  };

  const features = [
    { icon: <DollarSign className="w-5 h-5" />, title: t('bookingsPage.features.bestPrices'), desc: t('bookingsPage.features.bestPricesDesc') },
    { icon: <Star className="w-5 h-5" />, title: t('bookingsPage.features.realReviews'), desc: t('bookingsPage.features.realReviewsDesc') },
    { icon: <Globe className="w-5 h-5" />, title: t('bookingsPage.features.currencyConv'), desc: t('bookingsPage.features.currencyConvDesc') },
    { icon: <Shield className="w-5 h-5" />, title: t('bookingsPage.features.directBooking'), desc: t('bookingsPage.features.directBookingDesc') },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background">
      {/* Header */}
      <div className="relative bg-primary/5 py-16 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            {t('bookingsPage.heroTitle')}
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            {t('bookingsPage.heroSubtitle')}
          </motion.p>
          {itineraryRef && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="mb-6 max-w-xl mx-auto"
            >
              <div className="relative rounded-3xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-6 shadow-xl shadow-primary/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                <div className="relative z-10 text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-2">
                    <MapPin className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-base font-bold text-foreground leading-relaxed">
                    {i18n.language?.startsWith('ar') ? '✨ خطتك جاهزة! راجع الحجوزات ثم اعرض الخطة كاملة' : '✨ Your plan is ready! Review bookings then view the full itinerary'}
                  </p>
                  <Button
                    size="lg"
                    className="rounded-2xl w-full sm:w-auto px-10 h-14 text-base font-black bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => navigate(`/itinerary/${itineraryRef}`, { state: { itinerary: generatedItinerary } })}
                  >
                    <ArrowRight className="mr-2 rtl:ml-2 rtl:mr-0 rtl:rotate-180" size={20} />
                    {i18n.language?.startsWith('ar') ? 'عرض الخطة الكاملة' : 'View Full Itinerary'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-background border border-border rounded-full px-4 py-2 shadow-sm">
            <Globe size={16} className="text-primary" />
            <span className="text-sm text-muted-foreground">{t('bookingsPage.currencyLabel')}</span>
            <CurrencySelector />
          </motion.div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 -mt-8 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className="bg-background border border-border rounded-xl p-4 text-center shadow-sm">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2 text-primary">{f.icon}</div>
              <h3 className="font-semibold text-sm text-foreground">{f.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tabs */}
        <div className="max-w-6xl mx-auto px-2 sm:px-4 pb-12">
          <div className="bg-background border border-border rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-8 shadow-xl">
          <Tabs defaultValue={prefillTab} className="w-full">
            <TabsList className="mb-6 w-full justify-start overflow-x-auto bg-muted border border-border p-1 rounded-xl">
              <TabsTrigger value="flights" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
                <Plane className="w-4 h-4" /> {t('bookingsPage.tabs.flights')}
              </TabsTrigger>
              <TabsTrigger value="hotels" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
                <Hotel className="w-4 h-4" /> {t('bookingsPage.tabs.hotels')}
              </TabsTrigger>
              <TabsTrigger value="cars" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
                <Car className="w-4 h-4" /> {t('bookingsPage.tabs.cars')}
              </TabsTrigger>
              <TabsTrigger value="transfers" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-white whitespace-nowrap">
                <Bus className="w-4 h-4" /> {t('bookingsPage.tabs.transfers')}
              </TabsTrigger>
            </TabsList>

            {/* ===== FLIGHTS ===== */}
            <TabsContent value="flights" className="mt-0 outline-none">
              <div className="space-y-6">
                {/* 1. Search Form Header */}
                <div className="bg-background border border-border rounded-xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm">
                  {flightTripType === "multi" ? (
                    <div className="space-y-4">
                      {multiCityLegs.map((leg, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                              {i18n.language?.startsWith("ar") ? `قطاع ${idx + 1} - من` : `Leg ${idx + 1} - From`}
                            </Label>
                            <CityAutocomplete value={leg.from} onChange={(val) => {
                              const updated = [...multiCityLegs];
                              updated[idx] = { ...updated[idx], from: val };
                              setMultiCityLegs(updated);
                            }} placeholder={t('bookingsPage.searchFields.from')} />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                              {i18n.language?.startsWith("ar") ? "إلى" : "To"}
                            </Label>
                            <CityAutocomplete value={leg.to} onChange={(val) => {
                              const updated = [...multiCityLegs];
                              updated[idx] = { ...updated[idx], to: val };
                              if (idx < updated.length - 1 && !updated[idx + 1].from) {
                                updated[idx + 1] = { ...updated[idx + 1], from: val };
                              }
                              setMultiCityLegs(updated);
                            }} placeholder={t('bookingsPage.searchFields.to')} />
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="space-y-2 flex-1">
                              <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                {i18n.language?.startsWith("ar") ? "التاريخ" : "Date"}
                              </Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl", !leg.date && "text-muted-foreground")}>
                                    <Calendar className="mr-2 h-4 w-4 text-primary" />
                                    {leg.date ? format(leg.date, "yyyy-MM-dd") : "-"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                                  <CalendarPicker mode="single" selected={leg.date} onSelect={(d) => {
                                    const updated = [...multiCityLegs];
                                    updated[idx] = { ...updated[idx], date: d };
                                    setMultiCityLegs(updated);
                                  }} disabled={(date) => date < today} className="pointer-events-auto" />
                                </PopoverContent>
                              </Popover>
                            </div>
                            {multiCityLegs.length > 2 && (
                              <Button variant="ghost" size="icon" className="h-12 w-12 text-destructive" onClick={() => {
                                setMultiCityLegs(prev => prev.filter((_, i) => i !== idx));
                              }}><X size={16} /></Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {multiCityLegs.length < 6 && (
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => {
                          const lastLeg = multiCityLegs[multiCityLegs.length - 1];
                          setMultiCityLegs(prev => [...prev, { from: lastLeg?.to || '', to: '', date: undefined }]);
                        }}>
                          + {i18n.language?.startsWith("ar") ? "إضافة قطاع" : "Add Leg"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.from')}</Label>
                      <CityAutocomplete value={flightFrom} onChange={setFlightFrom} placeholder={t('bookingsPage.searchFields.from')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.to')}</Label>
                      <CityAutocomplete value={flightTo} onChange={setFlightTo} placeholder={t('bookingsPage.searchFields.to')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.departDate')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !flightDate && "text-muted-foreground")}>
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {flightDate ? format(flightDate, "yyyy-MM-dd") : t('travel.selectDates', { defaultValue: 'Select dates' })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                          <CalendarPicker mode="single" selected={flightDate} onSelect={setFlightDate}
                            disabled={(date) => date < today} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {flightTripType === "round" && (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.returnDate')}</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !flightReturn && "text-muted-foreground")}>
                              <Calendar className="mr-2 h-4 w-4 text-primary" />
                              {flightReturn ? format(flightReturn, "yyyy-MM-dd") : "-"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                            <CalendarPicker mode="single" selected={flightReturn} onSelect={setFlightReturn}
                              disabled={(date) => date < (flightDate ? addDays(flightDate, 1) : today)} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                  {(() => {
                    const fromNotice = getNearestAirportNotice(flightFrom);
                    const toNotice = getNearestAirportNotice(flightTo);
                    if (!fromNotice && !toNotice) return null;
                    const isAr = i18n.language?.startsWith("ar");
                    return (
                      <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-50/60 dark:bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                        <div className="font-bold mb-1">
                          {isAr ? "ℹ️ تنبيه عن أقرب مطار" : "ℹ️ Nearest airport selected"}
                        </div>
                        {fromNotice && (
                          <div>
                            {isAr
                              ? `لا يوجد مطار في "${flightFrom}". سنبحث عن رحلات من ${fromNotice.airportName} (${fromNotice.cityEn}) — أقرب مطار.`
                              : `"${flightFrom}" has no commercial airport. We'll search flights from ${fromNotice.airportName} (${fromNotice.cityEn}) — the nearest hub.`}
                          </div>
                        )}
                        {toNotice && (
                          <div>
                            {isAr
                              ? `لا يوجد مطار في "${flightTo}". سنبحث عن رحلات إلى ${toNotice.airportName} (${toNotice.cityEn}) — أقرب مطار.`
                              : `"${flightTo}" has no commercial airport. We'll search flights to ${toNotice.airportName} (${toNotice.cityEn}) — the nearest hub.`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  </>
                  )}

                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-4 mt-6 pt-6 border-t border-border/50">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
                      {/* Trip Type Toggle */}
                      <div className="flex items-center bg-muted border border-border rounded-xl p-1">
                        <button
                          onClick={() => setFlightTripType("round")}
                          className={cn("px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all whitespace-nowrap", flightTripType === "round" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                        >
                          {i18n.language?.startsWith("ar") ? "ذهاب وعودة" : "Round Trip"}
                        </button>
                        <button
                          onClick={() => { setFlightTripType("oneway"); setFlightReturn(undefined); }}
                          className={cn("px-3 sm:px-4 py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all whitespace-nowrap", flightTripType === "oneway" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                        >
                          {i18n.language?.startsWith("ar") ? "ذهاب فقط" : "One Way"}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('bookingsPage.searchFields.guests')}:</span>
                        <div className="flex items-center bg-muted border border-border rounded-xl p-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-background rounded-lg" onClick={() => setFlightAdults(Math.max(1, flightAdults - 1))}>-</Button>
                          <span className="w-10 text-center text-sm font-black text-foreground">{flightAdults}</span>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-background rounded-lg" onClick={() => setFlightAdults(Math.min(9, flightAdults + 1))}>+</Button>
                        </div>
                      </div>
                    </div>
                    <Button 
                      onClick={flightTripType === 'multi' ? handleSearchMultiCity : handleSearchFlights} 
                      disabled={loadingFlights} 
                      className="gap-2 px-6 sm:px-14 w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-12 font-black shadow-xl shadow-primary/20 transition-all active:scale-95 text-base sm:text-lg"
                    >
                      {loadingFlights ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                      {i18n.language?.startsWith("ar") ? "بحث الرحلات المتاحة" : "Search Flights"}
                    </Button>
                  </div>

                  {/* Multi-City Toggle - Separate Section */}
                  <div className="mt-4 pt-4 border-t border-dashed border-border/40 flex items-center justify-center">
                    <button
                      onClick={() => { setFlightTripType(flightTripType === "multi" ? "round" : "multi"); if (flightTripType !== "multi") setFlightReturn(undefined); }}
                      className={cn("flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-2xl border-2 transition-all", flightTripType === "multi" ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/30")}
                    >
                      <ArrowLeftRight size={14} />
                      {t("bookingsPage.liveLabels.multiCityToggle", { defaultValue: "Multi-City Trip" })}
                    </button>
                  </div>
                </div>

                {/* 2. Content: Filter Sidebar + Results List */}
                <div className="grid grid-cols-12 gap-4 lg:gap-8 items-start relative">
                  {/* Left Sidebar - Filters (Desktop) */}
                  <div className="hidden lg:block lg:col-span-3 space-y-6">
                    <Card className="p-8 bg-background border border-border/50 shadow-sm rounded-[32px] sticky top-24">
                      <div className="flex items-center justify-between mb-10">
                        <h3 className="font-black text-foreground text-xl tracking-tight">الفلاتر</h3>
                        <Button variant="ghost" size="sm" className="text-[11px] text-primary font-black h-7 px-3 hover:bg-primary/5 rounded-lg transition-colors" 
                          onClick={() => { setStopsFilter([]); setSelectedAirlines([]); setTimeFilter('all'); }}>
                          إعادة ضبط
                        </Button>
                      </div>

                      {/* Stops */}
                      <div className="mb-12">
                        <p className="text-[10px] font-black text-muted-foreground mb-6 uppercase tracking-[0.2em]">عدد التوقفات</p>
                        <div className="space-y-5">
                          {[0, 1, 2].map(s => {
                            const stopFlights = flights.filter(f => f.stops === s);
                            const minPrice = stopFlights.length > 0 ? Math.min(...stopFlights.map(f => f.price)) : 0;
                            return (
                              <div key={s} className="flex items-center justify-between group cursor-pointer" 
                                onClick={() => setStopsFilter(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}>
                                <div className="flex items-center gap-4">
                                  <Checkbox checked={stopsFilter.includes(s)} className="w-6 h-6 border-border rounded-lg data-[state=checked]:bg-primary data-[state=checked]:border-primary shadow-none" />
                                  <span className={cn("text-sm font-bold transition-colors", stopsFilter.includes(s) ? "text-foreground" : "text-muted-foreground group-hover:text-gray-800")}>
                                    {s === 0 ? "رحلات مباشرة" : s === 1 ? "توقف واحد" : "أكثر من توقف"}
                                  </span>
                                </div>
                                {minPrice > 0 && (
                                  <span className="text-[10px] text-muted-foreground/60 font-bold group-hover:text-primary/50 transition-colors">
                                    {displayPrice(minPrice)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Time */}
                      <div className="mb-12">
                        <p className="text-[10px] font-black text-muted-foreground mb-6 uppercase tracking-[0.2em]">{t('bookingsPage.flightResults.departureTime')}</p>
                        <div className="grid grid-cols-1 gap-2.5">
                          <Button variant={timeFilter === 'morning' ? 'default' : 'outline'} size="sm" 
                            className={cn("h-12 rounded-2xl text-[11px] font-bold justify-start px-5 transition-all outline-none", timeFilter === 'morning' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-background border-border/50 text-muted-foreground hover:text-muted-foreground hover:bg-muted")}
                            onClick={() => setTimeFilter(timeFilter === 'morning' ? 'all' : 'morning')}>
                            <Sun size={16} className="mr-3 opacity-60" /> 06:00 – 12:00
                          </Button>
                          <Button variant={timeFilter === 'afternoon' ? 'default' : 'outline'} size="sm" 
                            className={cn("h-12 rounded-2xl text-[11px] font-bold justify-start px-5 transition-all outline-none", timeFilter === 'afternoon' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-background border-border/50 text-muted-foreground hover:text-muted-foreground hover:bg-muted")}
                            onClick={() => setTimeFilter(timeFilter === 'afternoon' ? 'all' : 'afternoon')}>
                            <SunMedium size={16} className="mr-3 opacity-60" /> 12:00 – 18:00
                          </Button>
                          <Button variant={timeFilter === 'evening' ? 'default' : 'outline'} size="sm" 
                            className={cn("h-12 rounded-2xl text-[11px] font-bold justify-start px-5 transition-all outline-none", timeFilter === 'evening' ? "bg-primary text-white shadow-lg shadow-primary/20" : "bg-background border-border/50 text-muted-foreground hover:text-muted-foreground hover:bg-muted")}
                            onClick={() => setTimeFilter(timeFilter === 'evening' ? 'all' : 'evening')}>
                            <Moon size={16} className="mr-3 opacity-60" /> 18:00 – 00:00
                          </Button>
                        </div>
                      </div>

                      {/* Airlines */}
                      <div>
                        <p className="text-[10px] font-black text-muted-foreground mb-6 uppercase tracking-[0.2em]">{t('bookingsPage.flightResults.airlines')}</p>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-3 custom-scrollbar">
                          {Array.from(new Set(flights.map((f: any) => f.airline))).filter(Boolean).map((a: any, idx) => (
                            <div key={idx} className="flex items-center gap-4 group cursor-pointer"
                              onClick={() => setSelectedAirlines(prev => prev.includes(a) ? prev.filter((x: string) => x !== a) : [...prev, a])}>
                              <Checkbox checked={selectedAirlines.includes(a)} className="w-6 h-6 border-border rounded-lg data-[state=checked]:bg-primary shadow-none" />
                              <span className={cn("text-sm font-bold truncate transition-colors", selectedAirlines.includes(a) ? "text-foreground" : "text-muted-foreground group-hover:text-gray-800")}>{a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Right Content Area */}
                  <div className="col-span-12 lg:col-span-9 space-y-8">
                    {isMultiCity && cityCostSummary && cityCostSummary.grandTotal > 0 && (
                      <Card className="p-4 sm:p-6 rounded-[28px] border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary flex items-center gap-2">
                              <Globe className="w-3.5 h-3.5" />
                              {i18n.language?.startsWith("ar") ? `ملخص التكلفة · ${itineraryCities.length} مدن` : `Cost Summary · ${itineraryCities.length} Cities`}
                            </p>
                            <h3 className="text-base sm:text-lg font-black text-foreground mt-0.5">
                              {i18n.language?.startsWith("ar") ? "إجمالي تقريبي لكل مدينة (طيران + فندق)" : "Approximate total per city (flight + hotel)"}
                            </h3>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              {i18n.language?.startsWith("ar") ? "الإجمالي التقريبي" : "Grand Total"}
                            </p>
                            <p className="text-xl sm:text-2xl font-black text-primary">{formatPrice(cityCostSummary.grandTotal)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {cityCostSummary.rows.map((row) => (
                            <div key={row.city} className="rounded-2xl border border-border bg-background/80 backdrop-blur p-3 hover:border-primary/40 transition-colors">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                                  <span className="text-sm font-black text-foreground truncate">{row.city}</span>
                                </div>
                                <span className="text-sm font-black text-primary whitespace-nowrap">
                                  {row.total > 0 ? formatPrice(row.total) : "—"}
                                </span>
                              </div>
                              <div className="space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1"><Plane className="w-3 h-3" />{i18n.language?.startsWith("ar") ? "طيران" : "Flight"}</span>
                                  <span className="font-bold text-foreground">{row.flightMin > 0 ? formatPrice(row.flightMin) : (i18n.language?.startsWith("ar") ? "—" : "—")}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1"><Hotel className="w-3 h-3" />{i18n.language?.startsWith("ar") ? "فندق" : "Hotel"}</span>
                                  <span className="font-bold text-foreground">{row.hotelMin > 0 ? formatPrice(row.hotelMin) : "—"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-3 italic">
                          {i18n.language?.startsWith("ar") ? "* أسعار تقريبية مبنية على أرخص خيار متاح لكل مدينة" : "* Approximate prices based on the cheapest available option per city"}
                        </p>
                      </Card>
                    )}
                    {generatedFlights.length > 0 && (
                      <Card id="generated-flight-suggestions" className="p-4 sm:p-6 rounded-[28px] border-primary/20 bg-primary/5 scroll-mt-24">
                        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary flex items-center gap-2 flex-wrap">
                              {i18n.language?.startsWith("ar") ? "نتائج الخطة المولدة" : "Generated itinerary results"}
                              {isMultiCity && (
                                <Badge className="bg-primary/15 text-primary border-primary/30 rounded-full font-black uppercase tracking-wider text-[10px]">
                                  <Globe className="w-3 h-3 mr-1" />
                                  {i18n.language?.startsWith("ar") ? `متعدد المدن · ${itineraryCities.length}` : `Multi-City · ${itineraryCities.length}`}
                                </Badge>
                              )}
                            </p>
                            <h3 className="text-lg sm:text-xl font-black text-foreground">
                              {i18n.language?.startsWith("ar") ? "رحلات الطيران المقترحة لخطتك" : "Suggested flights for your trip"}
                            </h3>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {i18n.language?.startsWith("ar")
                                ? `${generatedFlights.length} خيار مرتّب حسب أفضل سعر`
                                : `${generatedFlights.length} options ranked by best price`}
                            </p>
                          </div>
                        </div>

                        {isMultiCity && flightsByCity ? (
                          <Tabs value={flightCityTab} onValueChange={setFlightCityTab} className="w-full">
                            <TabsList className="mb-4 w-full justify-start overflow-x-auto bg-background border border-border p-1 rounded-xl">
                              {itineraryCities.map((city) => (
                                <TabsTrigger key={city} value={city} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg whitespace-nowrap text-xs font-black">
                                  <MapPin className="w-3 h-3 mr-1" />
                                  {city}
                                  <Badge variant="outline" className="ml-2 text-[9px] px-1.5 py-0 border-current">
                                    {(flightsByCity[city] || []).length}
                                  </Badge>
                                </TabsTrigger>
                              ))}
                            </TabsList>
                            {itineraryCities.map((city) => (
                              <TabsContent key={city} value={city} className="mt-0">
                                <div className="space-y-3">
                                  {(flightsByCity[city] || []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-6">
                                      {i18n.language?.startsWith("ar") ? "لا توجد رحلات متاحة لهذه المدينة بعد" : "No flights available for this city yet"}
                                    </p>
                                  ) : (
                                    (flightsByCity[city] || []).map((f: any, index: number) => renderGeneratedFlight(f, `${city}-${index}`))
                                  )}
                                </div>
                              </TabsContent>
                            ))}
                          </Tabs>
                        ) : (
                          <div className="space-y-3">
                            {generatedFlights.map((f: any, index: number) => renderGeneratedFlight(f, index))}
                          </div>
                        )}
                      </Card>
                    )}
                    {/* Nearby Dates Carousel */}
                    {nearbyPrices.length > 0 && (
                      <div className="bg-background border border-border rounded-[32px] p-2 flex items-center overflow-x-auto no-scrollbar shadow-sm gap-1.5 touch-pan-x">
                        {nearbyPrices.map((p, idx) => (
                          <div key={idx} 
                            onClick={() => {
                              setFlightDate(p.date);
                              handleSearchFlights();
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center min-w-[120px] h-20 rounded-[24px] cursor-pointer transition-all px-4 select-none",
                              format(p.date, 'yyyy-MM-dd') === format(flightDate, 'yyyy-MM-dd') 
                                ? "bg-primary text-white shadow-xl shadow-primary/25 transform scale-[1.03] z-10" 
                                : "hover:bg-muted text-muted-foreground"
                            )}>
                            <p className="text-[9px] font-black uppercase tracking-[0.15em] opacity-80 mb-2">{format(p.date, 'eee, dd MMM')}</p>
                            <p className="text-sm font-black tracking-tight">{p.price ? displayPrice(p.price) : '—'}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {loadingFlights && (
                      <div className="grid gap-8">
                        {[1, 2, 3].map(i => (
                          <div key={i} className="h-56 w-full bg-muted animate-pulse rounded-[40px] border border-border/50" />
                        ))}
                      </div>
                    )}
                    {!loadingFlights && renderDiagnostics(flightDiagnostics, "flight")}
                    {/* Final Results Container */}
                    {sortedFlights.length > 0 && (
                      <div className="space-y-8 pb-10">
                        <div className="flex items-center justify-between px-3">
                          <p className="text-lg font-black text-foreground tracking-tight">{t('bookingsPage.flightResults.foundFlights', { count: sortedFlights.length })}</p>
                          <Select value={flightSort} onValueChange={(v) => setFlightSort(v as FlightSort)}>
                            <SelectTrigger className="w-48 h-11 bg-background border border-border rounded-2xl text-xs font-black text-muted-foreground shadow-none outline-none">
                              <ArrowUpDown size={14} className="mr-3 text-primary" />
                              <SelectValue placeholder={t('bookingsPage.flightResults.sortResults')} />
                            </SelectTrigger>
                            <SelectContent className="rounded-[24px] border-border shadow-2xl p-2 font-black">
                              <SelectItem value="price-asc" className="rounded-xl">{t('bookingsPage.flightResults.cheapest')}</SelectItem>
                              <SelectItem value="duration-asc" className="rounded-xl">{t('bookingsPage.flightResults.fastest')}</SelectItem>
                              <SelectItem value="stops-asc" className="rounded-xl">{t('bookingsPage.flightResults.fewestStops')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {isPolling && (
                          <div className="mb-6 bg-primary/5 border border-primary/10 rounded-[32px] p-6 flex items-center gap-6 animate-pulse">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                              <Loader2 className="animate-spin text-primary" size={24} />
                            </div>
                            <div className="flex-1">
                              <p className="font-black text-primary text-lg mb-1">{t('bookingsPage.flightResults.pollingTitle')}</p>
                              <p className="text-sm text-primary/60 font-bold">{t('bookingsPage.flightResults.pollingDesc')}</p>
                            </div>
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
                            </div>
                          </div>
                        )}

                        {sortedFlights.map((f, i) => {
                          const outboundDepartureValue = f.outbound_leg?.departure_time || f.departure_time;
                          const outboundArrivalValue = f.outbound_leg?.arrival_time || f.arrival_time;
                          const originIata = f.outbound_leg?.departure_code || f.departure_code || f.origin;
                          const destIata = f.outbound_leg?.arrival_code || f.arrival_code || f.destination;
                          // Prefer airport-local time if value carries date/offset, else fall back to raw HH:MM
                          const depTime = formatTimeInAirportTz(outboundDepartureValue, originIata) || formatTimeValue(outboundDepartureValue, flightDate);
                          const hasOutboundTime = hasClockTime(outboundDepartureValue);
                          let arrTimeStr = formatTimeInAirportTz(outboundArrivalValue, destIata) || formatTimeValue(outboundArrivalValue, flightDate);
                          if ((!arrTimeStr || arrTimeStr === "--:--") && hasOutboundTime && outboundDepartureValue && (f.duration_to || f.duration)) {
                            arrTimeStr = calcArrivalTime(outboundDepartureValue, f.duration_to || f.duration, flightDate) || "--:--";
                          }
                          const depDateStr = formatDateValue(outboundDepartureValue, flightDate);

                          const returnDepartureValue = f.return_leg?.departure_time || f.return_at;
                          const returnArrivalValue = f.return_leg?.arrival_time;
                          const retOriginIata = f.return_leg?.departure_code || destIata;
                          const retDestIata = f.return_leg?.arrival_code || originIata;
                          const retTime = formatTimeInAirportTz(returnDepartureValue, retOriginIata) || formatTimeValue(returnDepartureValue, flightReturn);
                          const retDateStr = formatDateValue(returnDepartureValue, flightReturn);
                          const hasReturn = flightTripType === 'round' && flightReturn;
                          const isMultiCity = flightTripType === 'multi' && f.multiCityLegLabel;
                          const isSearchOnlyCard = f.fallback && f.source === "deeplink-search";
                          // Compute true total duration from instants when both timestamps include date/offset
                          const computedOutMins = computeFlightDurationFromInstants(outboundDepartureValue, outboundArrivalValue);
                          const effectiveOutMins = computedOutMins ?? (f.duration_to || f.duration || 0);
                          const displayedDepTime = depTime && depTime !== "--:--" ? depTime : "—";
                          const displayedArrTime = arrTimeStr && arrTimeStr !== "--:--" ? arrTimeStr : "—";
                          const displayedDuration = effectiveOutMins > 0
                            ? formatDuration(effectiveOutMins)
                            : (t("bookingsPage.liveLabels.shownByProvider", { defaultValue: "Shown by provider" }));

                          // Automatic price variance check: compare API price vs internal estimate.
                          // If they diverge significantly, hide the displayed price and log a warning for admins.
                          const _apiPrice = Number(f.price) || 0;
                          const _estimateRef = (!isSearchOnlyCard && _apiPrice > 0)
                            ? estimateFlightPriceUsd(
                                originIata || f.departure_code || "",
                                destIata || f.arrival_code || "",
                                flightAdults || 1,
                                flightTripType === 'round',
                              )
                            : 0;
                          const _variance = (_apiPrice > 0 && _estimateRef > 0)
                            ? evaluatePriceVariance({
                                resourceType: "flight",
                                origin: originIata || f.departure_code || "",
                                destination: destIata || f.arrival_code || "",
                                provider: f.priceSource || f.source || "unknown",
                                estimatedPrice: _estimateRef,
                                apiPrice: _apiPrice,
                                currency: (f.currency || "USD"),
                                metadata: {
                                  airline: f.airline,
                                  flight_number: f.flight_number,
                                  trip_type: flightTripType,
                                  adults: flightAdults,
                                },
                              })
                            : { variancePct: 0, exceedsThreshold: false, hideEstimate: false, severity: "info" as const };
                          // Only hide when the source is a fallback/estimate. Live API prices are trusted.
                          const _isLiveSource = f.source === "direct-search";
                          const hidePriceDueToVariance = !_isLiveSource && _variance.hideEstimate;


                          return (
                          <Card key={i} className="overflow-hidden border border-border hover:border-primary/30 transition-all shadow-xl shadow-muted/20 rounded-2xl sm:rounded-[40px] group bg-background active:scale-[0.995]">
                            <div className="flex flex-col lg:flex-row items-stretch">
                              <div className="flex-1 p-4 sm:p-8 md:p-10 space-y-4 sm:space-y-6">
                                {/* Outbound Leg */}
                                <div>
                                  <div className="flex items-center gap-2 mb-4">
                                    <Badge variant="outline" className="text-[10px] font-black text-primary border-primary/20 bg-primary/5 rounded-full px-3 py-1">
                                      <Plane size={10} className="mr-1 rotate-45" /> {isMultiCity ? f.multiCityLegLabel : (i18n.language?.startsWith("ar") ? "رحلة الذهاب" : "Outbound")}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground font-bold">{depDateStr}</span>
                                  </div>
                                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 sm:gap-8 lg:gap-12">
                                    <div className="flex items-center lg:flex-col lg:items-center gap-3 sm:gap-5 min-w-0 lg:min-w-[140px]">
                                      <div className="w-10 h-10 sm:w-16 sm:h-16 bg-muted/50 rounded-xl sm:rounded-[28px] flex items-center justify-center p-2 sm:p-4 border border-border/50 group-hover:border-primary/10 transition-all shrink-0">
                                        {f.airline_logo ? (
                                          <img src={f.airline_logo} alt={f.airline} className="w-full h-full object-contain" />
                                        ) : (
                                          <Plane className="text-gray-200 w-5 h-5 sm:w-8 sm:h-8" />
                                        )}
                                      </div>
                                      <div className="lg:text-center min-w-0">
                                        <p className="font-black text-foreground text-sm sm:text-base leading-tight tracking-tight truncate">{f.airline}</p>
                                        <p className="text-[9px] sm:text-[10px] text-muted-foreground font-black tracking-[0.2em] uppercase mt-1">{f.flight_number}</p>
                                      </div>
                                    </div>
                                    <div className="flex-1 flex items-center gap-3 sm:gap-6 lg:gap-10 w-full">
                                      <div className="text-right min-w-0">
                                        <p className="font-black text-2xl sm:text-4xl text-foreground tracking-tighter leading-none mb-1">{displayedDepTime}</p>
                                        <p className="text-xs sm:text-sm text-muted-foreground font-black tracking-[0.1em] uppercase">{f.departure_code || f.origin}</p>
                                      </div>
                                      <div className="flex-1 flex flex-col items-center min-w-0">
                                        <div className="flex items-center gap-1.5 sm:gap-2.5 mb-2 sm:mb-4 px-2 sm:px-4 py-1 sm:py-1.5 bg-muted rounded-full">
                                          <Clock size={10} className="text-primary opacity-70 shrink-0" />
                                          <p className="text-[9px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-widest whitespace-nowrap">{displayedDuration}</p>
                                        </div>
                                        <div className="w-full h-[2px] sm:h-[3px] bg-muted relative rounded-full">
                                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 sm:px-5 border-2 border-border/50 rounded-full py-1 sm:py-1.5 shadow-sm">
                                            <Plane size={12} className="sm:hidden text-primary transform rotate-90 opacity-90" />
                                            <Plane size={16} className="hidden sm:block text-primary transform rotate-90 opacity-90" />
                                          </div>
                                        </div>
                                        <div className={cn("mt-2 sm:mt-4 font-black flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-[11px] tracking-tight", f.stops === 0 ? "bg-[#22C55E]/5 text-[#22C55E]" : "bg-amber-50 text-amber-500")}>
                                          <div className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shadow-sm", f.stops === 0 ? "bg-[#22C55E]" : "bg-amber-500")} />
                                          {f.fallback ? t('bookingsPage.flightResults.viewDirectOptions') : (f.stops === 0 ? t('bookingsPage.flightResults.directFlight') : t('bookingsPage.flightResults.stopsCount', { count: f.stops }))}
                                        </div>
                                      </div>
                                      <div className="text-left min-w-0">
                                        <p className="font-black text-2xl sm:text-4xl text-foreground tracking-tighter leading-none mb-1">{displayedArrTime}</p>
                                        <p className="text-xs sm:text-sm text-muted-foreground font-black tracking-[0.1em] uppercase">{f.arrival_code || f.destination}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Return Leg */}
                                {hasReturn && (() => {
                                  const computedRetMins = computeFlightDurationFromInstants(returnDepartureValue, returnArrivalValue);
                                  const retDurationMins = computedRetMins ?? (f.duration_back || f.duration || 0);
                                  const hasReturnTime = hasClockTime(returnDepartureValue);
                                  const retDepTime = retTime && retTime !== "--:--" ? retTime : "—";
                                  let retArrTime = formatTimeInAirportTz(returnArrivalValue, retDestIata) || formatTimeValue(returnArrivalValue, flightReturn);
                                  if ((!retArrTime || retArrTime === "--:--") && hasReturnTime && returnDepartureValue && retDurationMins > 0) {
                                    retArrTime = calcArrivalTime(returnDepartureValue, retDurationMins, flightReturn) || "—";
                                  }
                                  if (!retArrTime || retArrTime === "--:--") retArrTime = "—";
                                  const retDurationLabel = retDurationMins > 0
                                    ? formatDuration(retDurationMins)
                                    : (t("bookingsPage.liveLabels.shownByProvider", { defaultValue: "Shown by provider" }));
                                  
                                  return (
                                  <div className="pt-6 border-t border-dashed border-border/50">
                                    <div className="flex items-center gap-2 mb-4">
                                      <Badge variant="outline" className="text-[10px] font-black text-orange-600 border-orange-200 bg-orange-50 rounded-full px-3 py-1">
                                        <Plane size={10} className="mr-1 -rotate-[135deg]" /> {i18n.language?.startsWith("ar") ? "رحلة العودة" : "Return"}
                                      </Badge>
                                      <span className="text-[10px] text-muted-foreground font-bold">{retDateStr}</span>
                                    </div>
                                    <div className="flex items-center gap-3 sm:gap-6 lg:gap-10 w-full pl-0 lg:pl-[180px]">
                                      <div className="text-right min-w-0">
                                        <p className="font-black text-xl sm:text-3xl text-foreground tracking-tighter leading-none mb-1">{retDepTime}</p>
                                        <p className="text-xs sm:text-sm text-muted-foreground font-black tracking-[0.1em] uppercase">{f.arrival_code || f.destination}</p>
                                      </div>
                                      <div className="flex-1 flex flex-col items-center">
                                        <div className="flex items-center gap-2.5 mb-3 px-4 py-1.5 bg-muted rounded-full">
                                          <Clock size={12} className="text-orange-500 opacity-70" />
                                          <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{retDurationLabel}</p>
                                        </div>
                                        <div className="w-full h-[2px] bg-orange-100 relative rounded-full">
                                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-4 border-2 border-orange-200/50 rounded-full py-1 shadow-sm">
                                            <Plane size={14} className="text-orange-500 transform -rotate-90 opacity-90" />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-left min-w-0">
                                        <p className="font-black text-xl sm:text-3xl text-foreground tracking-tighter leading-none mb-1">{retArrTime}</p>
                                        <p className="text-xs sm:text-sm text-muted-foreground font-black tracking-[0.1em] uppercase">{f.departure_code || f.origin}</p>
                                      </div>
                                    </div>
                                  </div>
                                  );
                                })()}
                              </div>
                              <div className="bg-muted/40 lg:w-[280px] border-t lg:border-t-0 lg:border-r border-border/50 p-4 sm:p-6 lg:p-10 flex flex-col items-center justify-center text-center">
                                {i === 0 && !f.fallback && (
                                  <Badge className="bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 sm:px-5 py-1.5 sm:py-2 rounded-full mb-4 sm:mb-6 shadow-xl shadow-primary/25 border-none">{t('travel.bestOption')}</Badge>
                                )}
                                <div className="space-y-2 mb-4 sm:mb-8">
                                  <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                                    {(isSearchOnlyCard || hidePriceDueToVariance) ? t("bookingsPage.liveLabels.livePrice", { defaultValue: "Live price" }) : t('travel.finalPrice')}
                                  </p>
                                  <p className="text-2xl sm:text-4xl font-black text-foreground tracking-tighter">
                                    {(isSearchOnlyCard || hidePriceDueToVariance)
                                      ? t("bookingsPage.liveLabels.openAviasales", { defaultValue: "Open Aviasales" })
                                      : displayPrice(f.price, f)}
                                  </p>
                                  {/* Price source label */}
                                   <Badge variant="outline" className={cn(
                                     "text-[9px] font-bold rounded-full px-2.5 py-0.5 border",
                                     hidePriceDueToVariance
                                       ? "text-rose-600 border-rose-200 bg-rose-50"
                                       : f.source === "direct-search" ? "text-primary border-primary/20 bg-primary/5" : "text-amber-600 border-amber-200 bg-amber-50"
                                   )}>
                                      {hidePriceDueToVariance
                                        ? t("bookingsPage.liveLabels.largeVariance", { pct: _variance.variancePct, defaultValue: `Large price variance (${_variance.variancePct}%) — verify on source` })
                                        : isSearchOnlyCard
                                        ? t("bookingsPage.liveLabels.exactSearchLink", { defaultValue: "Exact search link" })
                                        : f.source === "direct-search"
                                       ? t("bookingsPage.liveLabels.liveDirectResult", { defaultValue: "Live direct result" })
                                        : t("bookingsPage.liveLabels.fallbackEstimate", { defaultValue: "Fallback estimate" })}
                                   </Badge>
                                   <p className="text-[9px] text-muted-foreground/70 font-medium">{(isSearchOnlyCard || hidePriceDueToVariance) ? t("bookingsPage.liveLabels.noEstimateNotice", { defaultValue: "* No estimated price is shown here to avoid mismatch with the provider" }) : t("bookingsPage.liveLabels.approxNotice", { defaultValue: "* Approximate - verify final price at booking" })}</p>
                                   {!isSearchOnlyCard && !hidePriceDueToVariance && (f.priceSource || f.priceFetchedAt) && (
                                     <p className="text-[8px] text-muted-foreground/60 font-medium">
                                       {i18n.language?.startsWith("ar") ? "المصدر: " : "Source: "}
                                       {f.priceSource || (f.source === "direct-search" ? "Live API" : "Cache")}
                                       {f.priceFetchedAt ? ` • ${i18n.language?.startsWith("ar") ? "جلب " : "fetched "}${new Date(f.priceFetchedAt).toLocaleTimeString(i18n.language?.startsWith("ar") ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
                                     </p>
                                   )}
                                  {hasReturn && (
                                    <p className="text-[10px] text-muted-foreground font-bold">{i18n.language?.startsWith("ar") ? "ذهاب وعودة" : "Round trip"}</p>
                                  )}
                                  {!hasReturn && flightTripType === 'oneway' && (
                                    <p className="text-[10px] text-muted-foreground font-bold">{i18n.language?.startsWith("ar") ? "ذهاب فقط" : "One way"}</p>
                                  )}
                                  <div className="flex items-center justify-center gap-2.5 mt-4">
                                    <Badge variant="outline" className="bg-background text-[10px] font-black text-muted-foreground border-border py-1.5 px-3 rounded-xl">
                                      <Luggage size={12} className="mr-1.5 inline opacity-50" /> 23KG
                                    </Badge>
                                    <Badge variant="outline" className="bg-background text-[10px] font-black text-muted-foreground border-border py-1.5 px-3 rounded-xl">
                                      <Briefcase size={12} className="mr-1.5 inline opacity-50" /> 7KG
                                    </Badge>
                                  </div>
                                  <p className="text-[8px] text-muted-foreground/50 font-medium mt-1">{t("bookingsPage.liveLabels.verifyBaggage", { defaultValue: "Please verify baggage & pricing details at booking" })}</p>
                                </div>
                                <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-white font-black rounded-[24px] h-12 sm:h-16 shadow-2xl shadow-primary/30 transition-all hover:scale-[1.04] active:scale-95 text-base sm:text-xl" onClick={() => handleBookFlight(f)}>
                                  {t('travel.bookNow')} <ExternalLink size={18} className="ml-2 sm:ml-3 opacity-40 shadow-none border-none" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                          );
                        })}
                      </div>
                    )}

                    {!loadingFlights && flights.length === 0 && !showFlightsWL && (
                      <div className="text-center py-12 sm:py-32 bg-muted/30 rounded-2xl sm:rounded-[64px] border-2 sm:border-4 border-dashed border-border/50 flex flex-col items-center px-4 sm:px-10">
                        <div className="w-20 h-20 sm:w-32 sm:h-32 bg-background rounded-2xl sm:rounded-[40px] flex items-center justify-center shadow-2xl shadow-muted mb-6 sm:mb-10 transform -rotate-6">
                          <Plane size={36} className="sm:hidden text-primary rotate-45 opacity-30" />
                          <Plane size={56} className="hidden sm:block text-primary rotate-45 opacity-30" />
                        </div>
                        <h3 className="text-2xl sm:text-4xl font-black text-foreground mb-4 sm:mb-6 tracking-tight">{t('travel.whereNext')}</h3>
                        <p className="text-muted-foreground max-w-md mx-auto mb-8 sm:mb-14 text-sm sm:text-base font-medium leading-relaxed">{t('travel.searchDesc')}</p>
                        <Button
                          variant="secondary"
                          className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl sm:rounded-[28px] h-12 sm:h-16 px-6 sm:px-10 transition-all font-black text-sm sm:text-lg w-full sm:w-auto shadow-xl shadow-primary/20"
                          onClick={() => setShowFlightsWL(true)}
                        >
                          <Search size={20} className="mr-3" /> {i18n.language?.startsWith("ar") ? 'فتح نتائج الرحلات' : 'Open flight results'}
                        </Button>
                      </div>
                    )}

                    {/* Live metasearch widget (Travelpayouts). On-demand via toggle. */}
                    {showFlightsWL && (() => {
                      const isAr = i18n.language?.startsWith('ar');
                      // Build segments in chronological order.
                      const wlSegments = (() => {
                        // 1. Manual multi-city tab takes priority
                        if (flightTripType === 'multi') {
                          return multiCityLegs
                            .filter(l => l.from && l.to && l.date)
                            .map(l => ({
                              origin: getIataCode(l.from),
                              destination: getIataCode(l.to),
                              date: format(l.date!, 'yyyy-MM-dd'),
                            }));
                        }
                        // 2. If a multi-city itinerary was generated, derive segments from it
                        if (isMultiCity && itineraryCities.length >= 2) {
                          const det: any = generatedItinerary?.tripDetails || {};
                          const startStr = (det.startDate || generatedItinerary?.startDate || (flightDate ? format(flightDate, 'yyyy-MM-dd') : '')) as string;
                          const startDate = parseISODateLocal(startStr) || flightDate || new Date();
                          const totalDays = Number(det.duration || generatedItinerary?.duration || itineraryCities.length * 3) || (itineraryCities.length * 3);
                          const perCity = Math.max(1, Math.floor(totalDays / itineraryCities.length));
                          const originCode = getIataCode(flightFrom || (det.origin || '') as string) || getIataCode(itineraryCities[0]);
                          const segs: { origin: string; destination: string; date: string }[] = [];
                          let cursor = new Date(startDate);
                          let prev = originCode;
                          for (let i = 0; i < itineraryCities.length; i++) {
                            const dest = getIataCode(itineraryCities[i]);
                            if (!dest || !prev || dest === prev) { prev = dest || prev; continue; }
                            segs.push({ origin: prev, destination: dest, date: format(cursor, 'yyyy-MM-dd') });
                            cursor = addDays(cursor, perCity);
                            prev = dest;
                          }
                          return segs;
                        }
                        return [];
                      })();

                      const hasMulti = wlSegments.length >= 2;
                      const originCode = getIataCode(flightFrom);
                      const destCode = getIataCode(flightTo);

                      // Validate & format dates: only valid future-or-today ISO strings are forwarded.
                      const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
                      const safeFmt = (d?: Date) => {
                        if (!d || isNaN(d.getTime())) return undefined;
                        const s = format(d, 'yyyy-MM-dd');
                        return isoDateRe.test(s) ? s : undefined;
                      };
                      const departStr = safeFmt(flightDate);
                      const rawReturnStr = safeFmt(flightReturn);
                      // Return date is OPTIONAL: only include for round-trip AND when strictly after depart.
                      const returnStr = (flightTripType === 'round' && rawReturnStr && departStr && rawReturnStr > departStr)
                        ? rawReturnStr
                        : undefined;
                      const effectiveTripType: 'round' | 'oneway' | 'multi' =
                        flightTripType === 'multi' ? 'multi'
                        : (flightTripType === 'round' && returnStr) ? 'round'
                        : 'oneway';

                      const hasContext = hasMulti || (originCode && destCode && departStr);
                      if (!hasContext) {
                        return (
                          <div className="mt-6 p-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 text-center">
                            <Plane size={32} className="text-primary/50 mx-auto mb-3" />
                            <p className="text-sm font-black text-foreground mb-2">
                              {isAr ? 'يرجى تعبئة المغادرة والوجهة وتاريخ السفر لعرض النتائج' : 'Please fill departure, destination and travel date to view results'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isAr ? 'املأ الحقول أعلاه ثم اضغط "بحث الرحلات المتاحة"' : 'Fill the fields above then press "Search available flights"'}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="mt-8 space-y-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                                {isAr ? 'بحث مباشر متقدم' : 'Live metasearch'}
                              </p>
                              <h3 className="text-base sm:text-lg font-black text-foreground">
                                {hasMulti
                                  ? (isAr ? `نتائج الطيران لجميع المدن (${wlSegments.length} قطاع)` : `Flights for all cities (${wlSegments.length} segments)`)
                                  : (isAr ? 'نتائج الطيران المتاحة' : 'Available flight results')}
                              </h3>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {isAr ? 'مقارنة فورية من 700+ مصدر بأفضل الأسعار المتاحة' : 'Instant comparison from 700+ sources at the best available prices'}
                              </p>
                            </div>
                            {hasMulti && (
                              <Badge variant="outline" className="text-[10px] font-black rounded-full border-primary/30 text-primary bg-primary/5">
                                <Globe className="w-3 h-3 mr-1" />
                                {isAr ? `${wlSegments.length} مدن بالترتيب` : `${wlSegments.length} cities in order`}
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-[11px] font-black text-muted-foreground hover:text-foreground rounded-xl"
                              onClick={() => setShowFlightsWL(false)}
                            >
                              <X size={14} className="mr-1" /> {isAr ? 'إغلاق النتائج' : 'Close results'}
                            </Button>
                          </div>


                          <TravelpayoutsWL
                            origin={originCode}
                            destination={destCode}
                            departDate={departStr}
                            returnDate={returnStr}
                            adults={Math.max(1, flightAdults || 1)}
                            tripType={hasMulti ? 'multicity' : (effectiveTripType === 'round' ? 'round' : 'oneway')}
                            segments={hasMulti ? wlSegments : undefined}
                            onStatus={(status) => setFlightDiagnostics(prev => [...prev, `iframe:${status.state}:${status.message}`].slice(-8))}
                          />
                        </div>
                      );
                    })()}

                    {/* Toggle to expand WL when flight cards exist but user wants more options */}
                    {!showFlightsWL && flights.length > 0 && (
                      <div className="mt-6 flex justify-center">
                        <Button
                          variant="outline"
                          className="rounded-2xl h-12 px-6 font-black text-sm border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => setShowFlightsWL(true)}
                        >
                          <Search size={16} className="mr-2" />
                          {i18n.language?.startsWith('ar') ? 'فتح نتائج الرحلات الكاملة' : 'Open full flight results'}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>


            {/* ===== HOTELS ===== */}
            <TabsContent value="hotels">
              <div className="space-y-6">
                <div className="bg-background border border-border rounded-3xl p-6 md:p-8 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.hotelLocation')}</Label>
                      <CityAutocomplete value={hotelLocation} onChange={(code) => {
                        setHotelLocation(code);
                        setHotelLocationName(getCityDisplayName(code));
                      }} placeholder={t('travel.enterDestination')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.hotelCheckIn')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !hotelCheckIn && "text-muted-foreground")}>
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {hotelCheckIn ? format(hotelCheckIn, "yyyy-MM-dd") : t('travel.selectDates', { defaultValue: 'Select' })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                          <CalendarPicker mode="single" selected={hotelCheckIn} onSelect={setHotelCheckIn}
                            disabled={(date) => date < today} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.hotelCheckOut')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !hotelCheckOut && "text-muted-foreground")}>
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {hotelCheckOut ? format(hotelCheckOut, "yyyy-MM-dd") : t('travel.selectDates', { defaultValue: 'Select' })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                          <CalendarPicker mode="single" selected={hotelCheckOut} onSelect={setHotelCheckOut}
                            disabled={(date) => date < (hotelCheckIn ? addDays(hotelCheckIn, 1) : today)} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('bookingsPage.searchFields.guests')}</Label>
                      <div className="flex items-center bg-muted/50 border border-border rounded-2xl h-12 px-4">
                        <Users size={14} className="text-primary mr-3" />
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-background rounded-lg" onClick={() => setHotelGuests(Math.max(1, hotelGuests - 1))}>-</Button>
                        <span className="w-10 text-center text-sm font-black text-foreground">{hotelGuests}</span>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-background rounded-lg" onClick={() => setHotelGuests(Math.min(10, hotelGuests + 1))}>+</Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-6 mt-8 pt-8 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      {hotels.length > 0 && (
                        <Button variant="outline" size="sm" className="gap-1 rounded-xl" onClick={() => setShowHotelFilters(!showHotelFilters)}>
                          <Filter size={14} />
                          {t('common.filter')}
                          {showHotelFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </Button>
                      )}
                    </div>
                    <Button
                      onClick={handleSearchHotels}
                      disabled={loadingHotels}
                      className="gap-3 px-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-12 font-black shadow-xl shadow-primary/20 transition-all active:scale-95 text-lg"
                    >
                      {loadingHotels ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                      {i18n.language?.startsWith("ar") ? "بحث الفنادق المتاحة" : "Search Hotels"}
                    </Button>
                  </div>
                </div>

                {/* Hotel Filters */}
                <AnimatePresence>
                  {showHotelFilters && hotels.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden">
                      <Card className="p-4 space-y-4">
                        {/* Star Rating Filter */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">{t('travel.starRating')}</Label>
                          <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Button key={star} size="sm" variant={hotelStarFilter.includes(star) ? "default" : "outline"}
                                className="gap-1 h-8 text-xs" onClick={() => toggleStarFilter(star)}>
                                {star} <Star size={10} className={hotelStarFilter.includes(star) ? "fill-primary-foreground" : "fill-warning text-warning"} />
                              </Button>
                            ))}
                            {hotelStarFilter.length > 0 && (
                              <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => setHotelStarFilter([])}>
                                {t('common.clear')}
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Price Range */}
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            {t('travel.priceRange')}: {displayPrice(hotelPriceRange[0])} - {displayPrice(hotelPriceRange[1])}
                          </Label>
                          <Slider
                            min={0}
                            max={Math.max(hotelPriceRange[1], 2000)}
                            step={10}
                            value={hotelPriceRange}
                            onValueChange={(v) => setHotelPriceRange(v as [number, number])}
                            className="mt-2"
                          />
                        </div>

                        {/* Amenities Filter */}
                        {allAmenities.length > 0 && (
                          <div>
                            <Label className="text-sm font-medium mb-2 block">{t('travel.amenities')}</Label>
                            <div className="flex flex-wrap gap-2">
                              {allAmenities.map(amenity => (
                                <Button key={amenity} size="sm"
                                  variant={hotelAmenityFilter.includes(amenity) ? "default" : "outline"}
                                  className="h-7 text-[11px] gap-1" onClick={() => toggleAmenityFilter(amenity)}>
                                  {amenity}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Hotel Results / Widget */}

                {generatedHotels.length > 0 && (
                  <Card id="generated-hotel-suggestions" className="p-4 sm:p-6 rounded-[28px] border-primary/20 bg-primary/5 scroll-mt-24">
                    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary flex items-center gap-2 flex-wrap">
                          {i18n.language?.startsWith("ar") ? "نتائج الخطة المولدة" : "Generated itinerary results"}
                          {isMultiCity && (
                            <Badge className="bg-primary/15 text-primary border-primary/30 rounded-full font-black uppercase tracking-wider text-[10px]">
                              <Globe className="w-3 h-3 mr-1" />
                              {i18n.language?.startsWith("ar") ? `متعدد المدن · ${itineraryCities.length}` : `Multi-City · ${itineraryCities.length}`}
                            </Badge>
                          )}
                        </p>
                        <h3 className="text-lg sm:text-xl font-black text-foreground">
                          {i18n.language?.startsWith("ar") ? "الفنادق المقترحة لخطتك" : "Suggested hotels for your trip"}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {i18n.language?.startsWith("ar")
                            ? `${generatedHotels.length} خيار ضمن ميزانيتك مرتّبة حسب التقييم`
                            : `${generatedHotels.length} options within your budget ranked by rating`}
                        </p>
                      </div>
                    </div>

                    {isMultiCity && hotelsByCity ? (
                      <Tabs value={hotelCityTab} onValueChange={setHotelCityTab} className="w-full">
                        <TabsList className="mb-4 w-full justify-start overflow-x-auto bg-background border border-border p-1 rounded-xl">
                          {itineraryCities.map((city) => (
                            <TabsTrigger key={city} value={city} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg whitespace-nowrap text-xs font-black">
                              <MapPin className="w-3 h-3 mr-1" />
                              {city}
                              <Badge variant="outline" className="ml-2 text-[9px] px-1.5 py-0 border-current">
                                {(hotelsByCity[city] || []).length}
                              </Badge>
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {itineraryCities.map((city) => (
                          <TabsContent key={city} value={city} className="mt-0">
                            {(hotelsByCity[city] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-6">
                                {i18n.language?.startsWith("ar") ? "لا توجد فنادق متاحة لهذه المدينة بعد" : "No hotels available for this city yet"}
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(hotelsByCity[city] || []).map((h: any, index: number) => renderGeneratedHotel(h, `${city}-${index}`))}
                              </div>
                            )}
                          </TabsContent>
                        ))}
                      </Tabs>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {generatedHotels.map((h: any, index: number) => renderGeneratedHotel(h, index))}
                      </div>
                    )}
                  </Card>
                )}


                {loadingHotels && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
                  </div>
                )}

                {!loadingHotels && renderDiagnostics(hotelDiagnostics, "hotel")}

                {sortedHotels.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className="text-sm text-muted-foreground">
                        {sortedHotels.length} {t('nav.hotels')} {sortedHotels.length < hotels.length ? `(${t('common.from')} ${hotels.length})` : t('common.available')}
                      </p>
                      <Select value={hotelSort} onValueChange={(v) => setHotelSort(v as HotelSort)}>
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <ArrowUpDown size={12} className="mr-1" />
                          <SelectValue placeholder={t('travel.sortBy')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="price-asc">{t('travel.priceLowHigh')}</SelectItem>
                          <SelectItem value="price-desc">{t('travel.priceHighLow')}</SelectItem>
                          <SelectItem value="rating-desc">{t('travel.ratingHighLow')}</SelectItem>
                          <SelectItem value="class-desc">{t('travel.classHighest')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {sortedHotels.map((h, i) => {
                        const rawPrice = parseHotelPrice(h);
                        return (
                          <Card key={i} className="overflow-hidden border-none shadow-xl shadow-muted/50 bg-background group hover:shadow-2xl transition-all duration-500 rounded-[32px]">
                            <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                              <HotelImageCarousel
                                images={Array.isArray(h.images) ? h.images : (h.image ? [h.image] : [])}
                                alt={h.name}
                                fallbackQuery={`${h.name} ${h.location || hotelLocationName || hotelLocation || ""}`.trim()}
                              />
                              <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-none">
                                {h.extracted_hotel_class > 0 && (
                                  <div className="bg-background/90 backdrop-blur-md rounded-full px-3 py-1 flex gap-1 shadow-sm">
                                    {Array.from({ length: h.extracted_hotel_class }).map((_, j) => (
                                      <Star key={j} size={10} className="fill-amber-400 text-amber-400" />
                                    ))}
                                  </div>
                                )}
                                {h.overall_rating > 0 && (
                                  <Badge className="bg-primary text-primary-foreground border-none shadow-lg shadow-primary/20 rounded-full px-3 py-1 text-[10px] font-black w-fit">
                                    <Star size={10} className="fill-current mr-1" /> {h.overall_rating} / 10
                                  </Badge>
                                )}
                              </div>
                              {h.fallback && (
                                <div className="absolute top-4 right-4 animate-pulse">
                                  <Badge variant="secondary" className="bg-orange-500 text-white border-none rounded-full px-3 py-1 text-[10px] font-black shadow-lg shadow-orange-500/20">{t('common.externalView')}</Badge>
                                </div>
                              )}
                            </div>
                            <div className="p-6">
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                  <h3 className="text-lg font-black text-foreground leading-tight group-hover:text-primary transition-colors">{h.name}</h3>
                                  <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
                                    <MapPin size={10} />
                                    <span className="text-[10px] font-bold truncate">{h.location}</span>
                                  </div>
                                </div>
                                <div className="text-left">
                                  {rawPrice > 0 && (h.priceTrustworthy !== false) ? (
                                    <>
                                      <span className="text-2xl font-black text-primary">{displayPrice(rawPrice, h)}</span>
                                      <p className="text-[10px] font-bold text-muted-foreground">/ {t('travel.night')}</p>
                                      <p className="text-[8px] text-muted-foreground/50">* {i18n.language?.startsWith("ar") ? "سعر تقريبي - يُرجى التحقق عند الحجز" : "Approximate — verify at booking"}</p>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-base font-black text-amber-600">
                                        {i18n.language?.startsWith("ar") ? "السعر عند الحجز" : "Price at booking"}
                                      </span>
                                      <p className="text-[8px] text-muted-foreground/60 mt-1">
                                        {i18n.language?.startsWith("ar") ? "سيُعرض السعر النهائي على صفحة الفندق" : "Final price shown on the hotel page"}
                                      </p>
                                    </>
                                  )}
                                  {(h.priceSource || h.priceFetchedAt) && (
                                    <p className="text-[8px] text-muted-foreground/60">
                                      {i18n.language?.startsWith("ar") ? "المصدر: " : "Source: "}
                                      {h.priceSource || (h.source === "direct-search" ? "Live API" : "Cache")}
                                      {h.priceFetchedAt ? ` • ${new Date(h.priceFetchedAt).toLocaleTimeString(i18n.language?.startsWith("ar") ? "ar-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Amenities */}
                              {h.amenities?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-6">
                                  {h.amenities.slice(0, 4).map((a: string, j: number) => (
                                    <Badge key={j} variant="secondary" className="bg-muted text-muted-foreground border-none text-[10px] py-1 px-3 rounded-full font-bold">
                                      {a}
                                    </Badge>
                                  ))}
                                  {h.amenities.length > 4 && (
                                    <span className="text-[10px] text-muted-foreground/60 font-bold self-center">+{h.amenities.length - 4}</span>
                                  )}
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                <p className="text-[10px] font-bold text-muted-foreground">{h.reviews > 0 ? `${formatCount(h.reviews)} ${t('travel.guestReviews')}` : t('travel.noReviewsYet')}</p>
                                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white font-black rounded-xl h-10 px-6 shadow-lg shadow-primary/10 transition-all" onClick={() => handleBookHotel(h)}>
                                  {t('travel.bookNow')}
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No results after search */}
                {!loadingHotels && hotels.length === 0 && hotelLocation && hotelCheckIn && hotelCheckOut && (
                  <div className="text-center py-12 bg-muted/30 rounded-[32px] border-2 border-dashed border-border/50 flex flex-col items-center px-6">
                    <Hotel size={40} className="text-primary opacity-30 mb-4" />
                    <p className="text-muted-foreground font-medium mb-5">
                      {i18n.language?.startsWith("ar")
                        ? "لم نجد نتائج مباشرة. تابع البحث على المنصات الموثوقة:"
                        : "No direct results. Continue your search on trusted platforms:"}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                      <Button
                        size="lg"
                        className="flex-1 bg-[#003580] hover:bg-[#003580]/90 text-white font-black rounded-2xl h-12 shadow-lg"
                        onClick={() => {
                          const url = getHotelBookingUrl(hotelLocation, hotelCheckIn, hotelCheckOut, hotelGuests, i18n.language);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        {i18n.language?.startsWith("ar") ? "🏨 البحث في Booking.com" : "🏨 Search on Booking.com"}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1 border-2 border-primary/40 hover:bg-primary/5 text-primary font-black rounded-2xl h-12"
                        onClick={() => {
                          const url = getHotelDirectLink(getHotelDestinationName(hotelLocation) || hotelLocation, hotelLocation, hotelCheckIn, hotelCheckOut, hotelGuests, currency || "USD", i18n.language);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        {i18n.language?.startsWith("ar") ? "🌐 البحث في Hotellook" : "🌐 Search on Hotellook"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 mt-4">
                      {hotelLocation} · {format(hotelCheckIn, "yyyy-MM-dd")} → {format(hotelCheckOut, "yyyy-MM-dd")} · {hotelGuests} {i18n.language?.startsWith("ar") ? "ضيوف" : "guests"}
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ===== CAR RENTALS ===== */}
            <TabsContent value="cars">
              <div className="space-y-6">
                <div className="bg-background border border-border rounded-3xl p-6 md:p-8 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('travel.pickupCity')}</Label>
                      <CityAutocomplete value={carPickup} onChange={setCarPickup} placeholder={t('travel.pickupCityPlaceholder')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('travel.dropoffCityOptional')}</Label>
                      <CityAutocomplete value={carDropoff} onChange={(v) => setCarDropoff(v)} placeholder={t('travel.sameAsPickup')} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('travel.pickupDate')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !carPickupDate && "text-muted-foreground")}>
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {carPickupDate ? format(carPickupDate, "yyyy-MM-dd") : t('wizard.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                          <CalendarPicker mode="single" selected={carPickupDate} onSelect={setCarPickupDate}
                            disabled={(date) => date < today} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-1">{t('travel.dropoffDate')}</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start h-12 bg-muted/50 border-border rounded-2xl hover:bg-background hover:border-primary/30 transition-all shadow-none", !carDropoffDate && "text-muted-foreground")}>
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {carDropoffDate ? format(carDropoffDate, "yyyy-MM-dd") : t('wizard.selectDate')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-3xl overflow-hidden">
                          <CalendarPicker mode="single" selected={carDropoffDate} onSelect={setCarDropoffDate}
                            disabled={(date) => date < (carPickupDate ? addDays(carPickupDate, 1) : today)} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-6 mt-8 pt-8 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('travel.carType')}:</Label>
                      <Select value={carType} onValueChange={setCarType}>
                        <SelectTrigger className="w-40 h-10 bg-muted border border-border rounded-xl text-xs font-bold">
                          <SelectValue placeholder={t('travel.allTypes')} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all">{t('travel.allTypes')}</SelectItem>
                          <SelectItem value="economy">{t('travel.economy')}</SelectItem>
                          <SelectItem value="compact">{t('travel.compact')}</SelectItem>
                          <SelectItem value="sedan">{t('travel.sedan')}</SelectItem>
                          <SelectItem value="suv">{t('travel.suv')}</SelectItem>
                          <SelectItem value="luxury">{t('travel.luxury')}</SelectItem>
                          <SelectItem value="van">{t('travel.van')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleSearchCars}
                      disabled={loadingCars}
                      className="gap-3 px-14 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl h-12 font-black shadow-xl shadow-primary/20 transition-all active:scale-95 text-lg"
                    >
                      {loadingCars ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
                      {i18n.language?.startsWith("ar") ? "بحث السيارات المتاحة" : "Search Cars"}
                    </Button>
                  </div>
                </div>

                {/* Native Car Results */}
                {loadingCars && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-3xl" />)}
                  </div>
                )}

                {carResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6 mt-8">
                    {carResults.map((car) => (
                      <Card key={car.id} className="overflow-hidden border-none shadow-xl shadow-muted/50 bg-background group hover:shadow-2xl transition-all duration-500 rounded-[32px]">
                        <div className="relative aspect-[16/10] overflow-hidden">
                          <img src={car.image} alt={car.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                          <div className="absolute top-4 left-4 flex gap-2">
                            <Badge className="bg-background/90 backdrop-blur-md text-foreground border-none shadow-sm rounded-full px-3 py-1 text-[10px] font-black">{car.className}</Badge>
                            <Badge className="bg-primary text-white border-none shadow-lg shadow-primary/20 rounded-full px-3 py-1 text-[10px] font-black">{car.vendor}</Badge>
                          </div>
                          {car.vendorLogo && (
                             <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-md p-2 rounded-xl shadow-sm">
                               <img src={car.vendorLogo} alt={car.vendor} className="h-4 object-contain opacity-80" />
                             </div>
                          )}
                        </div>
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-black text-foreground leading-tight">{car.name}</h3>
                              <div className="flex items-center gap-3 mt-2 text-muted-foreground">
                                <span className="flex items-center gap-1 text-[11px] font-bold"><Users size={12} /> {car.seats} {t('travel.passengers')}</span>
                                <span className="flex items-center gap-1 text-[11px] font-bold"><Zap size={12} className="text-orange-400" /> {car.transmission}</span>
                                <span className="flex items-center gap-1 text-[11px] font-bold"><Fuel size={12} /> {car.fuel}</span>
                              </div>
                            </div>
                            <div className="text-left">
                              <span className="text-2xl font-black text-primary">{displayPrice(car.price)}</span>
                              <p className="text-[10px] font-bold text-muted-foreground">/ {t('travel.day')}</p>
                              <p className="text-[8px] text-muted-foreground/50">* {i18n.language?.startsWith("ar") ? "سعر تقريبي" : "Approx."}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 mb-6">
                            {car.features?.map((f: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="bg-muted text-muted-foreground border-none text-[10px] py-1 px-3 rounded-full font-bold">
                                {f}
                              </Badge>
                            ))}
                          </div>

                          <Button className="w-full bg-primary hover:bg-primary/90 text-white font-black rounded-2xl h-12 shadow-lg shadow-primary/20 group/btn transition-all" onClick={() => handleBookCar(car)}>
                            {t('travel.bookNow')} <ArrowRight size={16} className="mr-2 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Car Rental Widgets */}
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-foreground">{i18n.language?.startsWith("ar") ? "استئجار سيارات - عروض حصرية" : "Car Rentals - Exclusive Deals"}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/><style>*{margin:0;padding:0}body{background:transparent}</style></head><body><script async src="https://tpscr.com/content?trs=477988&shmarker=688262&locale=en&powered_by=true&border_radius=5&plain=true&show_logo=true&color_background=%23ffca28&color_button=%2355a539&color_text=%23000000&color_input_text=%23000000&color_button_text=%23ffffff&promo_id=4480&campaign_id=10" charset="utf-8"><\/script></body></html>`}
                        style={{ width: '100%', height: '400px', border: 'none' }}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
                        title="Car Rental Search Widget"
                        loading="lazy"
                      />
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-border shadow-sm flex justify-center">
                      <iframe
                        src={`https://www.trip.com/partners/ad/S14625543?Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}&trip_sub1=`}
                        style={{ width: '320px', height: '320px', border: 'none' }}
                        scrolling="no"
                        title="Trip.com Car Rental Widget"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <Button variant="secondary" className="bg-background border border-border rounded-2xl h-12 px-8 hover:border-primary/30 transition-all font-black" onClick={() => {
                      const url = getTripCarUrl(carPickup || '', carPickupDate, carDropoffDate, carDropoff || undefined);
                      const cityName = resolveCityName(carPickup || '');
                      const dropoffName = resolveCityName(carDropoff || cityName);
                      const isAr = i18n.language?.startsWith('ar');
                      setPendingRedirect({
                        title: isAr ? 'تأكيد التحويل إلى Trip.com' : 'Confirm redirect to Trip.com',
                        description: isAr ? 'سيتم فتح البحث المباشر بنفس المدينة والتواريخ. الأسعار النهائية تظهر هناك.' : 'Trip.com will open with your city and dates. Final prices are shown there.',
                        actionLabel: isAr ? 'فتح Trip.com' : 'Open Trip.com',
                        url,
                        summary: [
                          { label: isAr ? 'الاستلام' : 'Pickup', value: `${cityName}${carPickupDate ? ` • ${format(carPickupDate, 'yyyy-MM-dd')}` : ''}` },
                          { label: isAr ? 'التسليم' : 'Dropoff', value: `${dropoffName}${carDropoffDate ? ` • ${format(carDropoffDate, 'yyyy-MM-dd')}` : ''}` },
                        ],
                        bookingData: { booking_type: 'car', destination: cityName, provider: 'Trip.com' },
                      });
                    }}>
                      <Car size={16} className="mr-2" /> {i18n.language?.startsWith("ar") ? "استئجار سيارة على Trip.com" : "Rent a Car on Trip.com"}
                    </Button>
                  </div>
                  <p className="text-[9px] text-center text-muted-foreground/50">{t("bookingsPage.liveLabels.pricesApproxNote", { defaultValue: "* Prices are approximate. Please verify final details at booking." })}</p>
                </div>

                {/* Empty State placeholder */}
                {!loadingCars && carResults.length === 0 && !carPickup && (
                  <div className="text-center py-16 bg-muted/30 rounded-[32px] border-2 border-dashed border-border/50 flex flex-col items-center px-10">
                    <Car size={40} className="text-primary opacity-30 mb-4" />
                    <h3 className="text-xl font-black text-foreground mb-2">{t('travel.rentACar')}</h3>
                    <p className="text-muted-foreground text-sm">{t('travel.carSearchDesc')}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ===== TRANSFERS ===== */}
            <TabsContent value="transfers">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm mb-1.5 block text-gray-700 font-medium">{t('travel.from')} ({t('travel.pickupCityPlaceholder')})</Label>
                    <CityAutocomplete value={transferFrom} onChange={setTransferFrom} placeholder={t('travel.pickupCityPlaceholder')} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block text-gray-700 font-medium">{t('travel.to')}</Label>
                    <CityAutocomplete value={transferTo} onChange={setTransferTo} placeholder={t('travel.enterDestination')} />
                  </div>
                  <div>
                    <Label className="text-sm mb-1.5 block text-gray-700 font-medium">{t('travel.date')}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start font-normal", !transferDate && "text-muted-foreground")}>
                          <Calendar className="mr-2 h-4 w-4" />
                          {transferDate ? format(transferDate, "yyyy-MM-dd") : t('wizard.selectDate')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarPicker mode="single" selected={transferDate} onSelect={setTransferDate}
                          disabled={(date) => date < today} className="pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-gray-700">{t('travel.travelers')}:</Label>
                    <Input type="number" min={1} max={20} value={transferPassengers} onChange={(e) => setTransferPassengers(parseInt(e.target.value) || 1)} className="w-20" />
                  </div>
                  <Button onClick={handleSearchTransfers} disabled={loadingTransfers} className="gap-2 px-8 bg-primary hover:bg-primary/90 text-white">
                    {loadingTransfers ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    {t('travel.searchTransfers')}
                  </Button>
                </div>

                {/* Transfer Loading */}
                {loadingTransfers && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 rounded-3xl" />)}
                  </div>
                )}

                {/* Transfer Results */}
                {transferResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
                    {transferResults.map((tr: any) => (
                      <Card key={tr.id} className="overflow-hidden border-none shadow-xl shadow-muted/50 bg-background group hover:shadow-2xl transition-all duration-500 rounded-[32px]">
                        <div className="relative aspect-[16/10] overflow-hidden">
                          <img src={tr.image} alt={tr.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                            onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }} />
                          <div className="absolute top-4 left-4 flex gap-2">
                            <Badge className="bg-background/90 backdrop-blur-md text-foreground border-none shadow-sm rounded-full px-3 py-1 text-[10px] font-black">{tr.className}</Badge>
                          </div>
                        </div>
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-black text-foreground leading-tight">{tr.name}</h3>
                              <div className="flex items-center gap-3 mt-2 text-muted-foreground">
                                <span className="flex items-center gap-1 text-[11px] font-bold"><Users size={12} /> {tr.passengers} {t('travel.passengers')}</span>
                                <span className="flex items-center gap-1 text-[11px] font-bold"><Luggage size={12} /> {tr.luggage} {t('travel.luggage', { defaultValue: 'حقائب' })}</span>
                              </div>
                            </div>
                            <div className="text-left">
                              <span className="text-2xl font-black text-primary">{displayPrice(tr.price)}</span>
                              <p className="text-[10px] font-bold text-muted-foreground">/ {t('travel.trip', { defaultValue: 'رحلة' })}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-6">
                            {tr.features?.map((f: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="bg-muted text-muted-foreground border-none text-[10px] py-1 px-3 rounded-full font-bold">
                                {f}
                              </Badge>
                            ))}
                          </div>
                          <Button className="w-full bg-primary hover:bg-primary/90 text-white font-black rounded-2xl h-12 shadow-lg shadow-primary/20 transition-all" onClick={() => handleBookTransfer(tr)}>
                            {t('travel.bookNow')} <ExternalLink size={16} className="mr-2" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Trip.com Transfer Widgets */}
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-foreground">{i18n.language?.startsWith("ar") ? "خدمات التوصيل عبر Trip.com" : "Transfer Services via Trip.com"}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl overflow-hidden border border-border shadow-sm flex justify-center">
                      <iframe
                        src={`https://www.trip.com/partners/ad/S14625543?Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}&trip_sub1=`}
                        style={{ width: '320px', height: '320px', border: 'none' }}
                        scrolling="no"
                        title="Trip.com Transfers Widget"
                      />
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-border shadow-sm flex justify-center">
                      <iframe
                        src={`https://www.trip.com/partners/ad/DB14625242?Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}&trip_sub1=`}
                        style={{ width: '300px', height: '250px', border: 'none' }}
                        scrolling="no"
                        title="Trip.com Deals Widget"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center mt-4">
                    <Button variant="secondary" className="bg-background border border-border rounded-2xl h-12 px-8 hover:border-primary/30 transition-all font-black" onClick={() => {
                      const fromName = resolveCityName(transferFrom || '');
                      const toName = resolveCityName(transferTo || '');
                      const url = getTripTransferUrl(fromName, toName, transferDate);
                      const isAr = i18n.language?.startsWith('ar');
                      setPendingRedirect({
                        title: isAr ? 'تأكيد التحويل إلى Trip.com' : 'Confirm redirect to Trip.com',
                        description: isAr ? 'سيتم فتح التوصيل بنفس بياناتك.' : 'Trip.com will open with your transfer details.',
                        actionLabel: isAr ? 'فتح Trip.com' : 'Open Trip.com',
                        url,
                        summary: [
                          { label: isAr ? 'من' : 'From', value: fromName || '—' },
                          { label: isAr ? 'إلى' : 'To', value: toName || '—' },
                        ],
                        bookingData: { booking_type: 'transfer', origin: fromName, destination: toName, provider: 'Trip.com' },
                      });
                    }}>
                      <Bus size={16} className="mr-2" /> {i18n.language?.startsWith("ar") ? "حجز توصيل على Trip.com" : "Book Transfer on Trip.com"}
                    </Button>
                    <Button variant="outline" className="rounded-2xl h-12 px-8 font-black" onClick={() => {
                      const url = `https://www.trip.com/things-to-do/?Allianceid=${TRIP_ALLIANCE_ID}&SID=${TRIP_SID}&trip_sub1=&trip_sub3=${TRIP_SUB3}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                    }}>
                      <MapPin size={16} className="mr-2 opacity-50" /> {i18n.language?.startsWith("ar") ? "أنشطة وتجارب" : "Activities"}
                    </Button>
                  </div>
                </div>

                {/* Empty State placeholder */}
                {!loadingTransfers && transferResults.length === 0 && !transferFrom && (
                  <div className="text-center py-12">
                    <Bus className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" />
                    <h3 className="text-lg font-bold text-foreground">{t('travel.bookPrivateTransfer')}</h3>
                    <p className="text-muted-foreground max-w-xs mx-auto mt-2">{t('travel.transferSearchDesc')}</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {/* Redirect Confirmation Dialog */}
      <AlertDialog open={Boolean(pendingRedirect)} onOpenChange={(open) => !open && setPendingRedirect(null)}>
        <AlertDialogContent className="border-border bg-background rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRedirect?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingRedirect?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            {pendingRedirect?.summary?.map((item: any) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-muted-foreground">{item.label}</span>
                <span className="font-black text-foreground text-right">{item.value}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18n.language?.startsWith("ar") ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingRedirect}>{pendingRedirect?.actionLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sticky floating View Plan button */}
      <AnimatePresence>
        {itineraryRef && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4"
          >
            <Button
              size="lg"
              className="rounded-full px-6 sm:px-8 h-12 sm:h-14 text-sm sm:text-base font-black bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl shadow-primary/40 transition-all hover:shadow-xl hover:scale-105 active:scale-95 gap-2"
              onClick={() => navigate(`/itinerary/${itineraryRef}`, { state: { itinerary: generatedItinerary } })}
            >
              <MapPin size={18} />
              {i18n.language?.startsWith('ar') ? '🗺️ عرض الخطة الكاملة' : '🗺️ View Full Itinerary'}
              <ArrowRight size={16} className="rtl:rotate-180" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BookingsPage;
