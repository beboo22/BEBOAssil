import ActivityReviews from "@/components/ActivityReviews";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { 
  Calendar, Clock, MapPin, ExternalLink, Star, DollarSign, Phone, Globe, 
  Navigation, Edit3, Trash2, GripVertical, Plus, Fuel, Route, ChevronDown, ChevronUp,
  ArrowLeftRight, Check, X, MessageSquare, Lightbulb, Image as ImageIcon, Users,
  QrCode, CheckCircle2, Palette, Share2, Printer, Wallet, Bell, Heart, Camera as CameraIcon, Upload,
  Download, FileText, Loader2, RefreshCw, Sparkles, UtensilsCrossed, MapPinned, Facebook, Link2, Send, MessageCircle, AlertTriangle, ShieldCheck, AlertCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getPrecisePlaceData, isGenericActivityTitle } from "@/utils/placeResolution";
import { format } from "date-fns";
import { ar, enUS, zhCN, ru } from "date-fns/locale";
import { toast } from "sonner";
import { calculateDayTripStats } from "@/utils/itineraryUtils";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CameraCapture } from "@/components/stories/CameraCapture";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildActivityShareNode, buildDayShareNode, getActivityShareText, getDayShareText, shareNodeAsImage } from "@/utils/shareAsImage";
import { ShareSocialDialog } from "@/components/ShareSocialDialog";
import { localizeInterest, localizeMeal, localizePreferenceReason, isMealKey } from "@/lib/preferenceLabels";
import { getFriendlyGenerationError } from "@/lib/generationErrors";
import { upgradeImageQuality } from "@/utils/upgradeImageQuality";
import { TravelLegBadge } from "@/components/itinerary/TravelLegBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Stable identity for an activity — used to detect when a regeneration
// returned the SAME place (so we can skip silently replacing it and warn the
// user instead). Prefers canonical Google identifiers, then coords, then name.
function activityFingerprint(act: any): string {
  if (!act) return "";
  const cid = act.dataCid || act.data_cid;
  if (cid) return `cid:${String(cid).trim()}`;
  const pid = act.placeId || act.place_id || act.googlePlaceId;
  if (pid) return `pid:${String(pid).trim()}`;
  const did = act.dataId || act.data_id;
  if (did) return `did:${String(did).trim()}`;
  if (Number.isFinite(act.latitude) && Number.isFinite(act.longitude)) {
    return `geo:${Number(act.latitude).toFixed(4)},${Number(act.longitude).toFixed(4)}`;
  }
  const nm = (act.title || act.name || "").toString().toLowerCase().trim();
  const addr = (act.address || act.location || "").toString().toLowerCase().trim();
  return nm ? `nm:${nm}|${addr}` : "";
}

async function invokeGenerateTripWithRetry(
  body: any,
  opts: { maxRetries?: number; perAttemptTimeoutMs?: number; timeoutMessage?: string } = {},
): Promise<{ data: any; error: any }> {
  // Bumped retries to 3 (4 total attempts) and a longer per-attempt budget
  // so the user almost never sees the "service was busy" toast for transient
  // edge-runtime / gateway / AI-upstream timeouts on single-activity regen.
  const maxRetries = opts.maxRetries ?? 3;
  const perAttemptTimeoutMs = opts.perAttemptTimeoutMs ?? 45000;
  const timeoutMessage = opts.timeoutMessage || "Request timed out. Please try again.";
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const callPromise = supabase.functions.invoke('generate-trip', { body });
      const result = await Promise.race([
        callPromise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), perAttemptTimeoutMs)),
      ]) as any;

      const err = result?.error;
      const retryable = err && (/504|timeout|gateway|fetch|network|abort|failed to send/i.test(String(err?.message || err)) || [502, 503, 504].includes(err?.status));
      if (retryable && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1500));
        lastError = err;
        continue;
      }
      return result;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || error || '');
      const retryable = /timeout|fetch|network|abort|failed to send|504|502|503/i.test(message);
      if (retryable && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1500));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(timeoutMessage);
}

interface Activity {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  startTime?: string;
  time?: string;
  endTime?: string;
  address?: string;
  location?: string;
  type?: string;
  category?: string;
  cost?: number;
  rating?: number;
  reviewsCount?: number;
  openingHours?: string;
  openState?: string;
  open_state?: string;
  hours?: string;
  operating_hours?: Record<string, string> | string;
  latitude?: number;
  longitude?: number;
  googleMapsLink?: string;
  googleMapsUrl?: string;
  /** Internal-only coordinate fallback. Never shown to the user; only used if the named lookup fails. */
  googleMapsCoordsUrl?: string;
  /** Stable Google place_id — guarantees the link opens the same venue across all languages. */
  place_id?: string;
  placeId?: string;
  dataId?: string;
  data_id?: string;
  dataCid?: string;
  data_cid?: string;
  googleMapsLinkReason?: string;
  phone?: string;
  website?: string;
  imageUrl?: string;
  placeType?: string;
  priceLevel?: string;
  serpDescription?: string;
  enriched?: boolean;
  tips?: string[];
  reviews?: Array<{ user: string; text: string; rating: number }>;
  completed?: boolean;
  cardColor?: string;
  bookingStatus?: "selected" | "booked" | "skipped";
  bookingLink?: string;
  bookingData?: any;
  matchReason?: string;
  isMatchAnchor?: boolean;
  matchTeams?: { a: string; b: string; flagA: string; flagB: string };
  matchKickoff?: string;
  matchVenue?: string;
  aiEnhanced?: boolean;
  aiSourceQuery?: string;
  preferenceMatch?: {
    matchedInterests?: string[];
    primaryInterest?: string;
    sourceCategory?: string;
    alignedCategory?: string;
    reason?: string;
    matched?: boolean;
  };
}

// Country/team -> flag emoji map is centralized in src/lib/teamFlags.ts.
// We re-export the lookup helpers locally so existing call sites keep working.
import { getTeamFlag as lookupTeamFlag, isMissingFlag } from '@/lib/teamFlags';

// Try to extract { teamA, teamB, venue, kickoff } from any free-text fields on the activity.
// Triggered when an activity is a match (matchReason / name mentions "match"/"vs"/"مباراة")
// but the structured matchTeams field wasn't populated by the planner.
const inferMatchInfoFromActivity = (activity: Activity): {
  teams?: { a: string; b: string; flagA: string; flagB: string };
  venue?: string;
  kickoff?: string;
} => {
  const sources = [
    activity.matchReason,
    activity.description,
    activity.name,
    activity.title,
    activity.isMatchAnchor ? activity.aiSourceQuery : "",
  ].filter(Boolean).join(" \n ");

  if (!sources) return {};

  // Match "TeamA vs TeamB" or "TeamA ضد TeamB" — capture both team names.
  // Trailing context is OPTIONAL (we accept end-of-string / newline) so plain
  // strings like "Mexico vs South Korea" still match.
  // Trailing context now also accepts bullets (• ·), em-dashes, pipes, and slashes
  // so descriptions like "South Africa vs South Korea • 19:00" still match.
  const vsRegex = /([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)\s+(?:vs\.?|v\.?|ضد|مع)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF .'-]{1,40}?)(?=\s+(?:at|@|في|on|بتاريخ)\b|\s*[،,\-—–•·\|\/\(\n]|\s*$)/i;
  const m = sources.match(vsRegex);
  let teams: { a: string; b: string; flagA: string; flagB: string } | undefined;
  if (m) {
    const a = m[1].trim().replace(/[.,;:]+$/, "");
    const b = m[2].trim().replace(/[.,;:]+$/, "");
    teams = { a, b, flagA: lookupTeamFlag(a), flagB: lookupTeamFlag(b) };
  }

  // Venue: "at <Venue>" or "@ <Venue>" or "في <Venue>"
  let venue: string | undefined;
  const venueMatch = sources.match(/(?:\bat\s+|@\s*|\bفي\s+)([A-Za-z\u0600-\u06FF][^\n,–—]{2,80}?)(?=\s+(?:on|بتاريخ|at\s+\d|في\s+\d|—|–|\(|$))/i);
  if (venueMatch) venue = venueMatch[1].trim().replace(/[.,;:]+$/, "");

  // Kickoff time: "12:00 PM" or "8:00" possibly with UTC offset
  let kickoff: string | undefined;
  const timeMatch = sources.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?(?:\s*UTC[+-]?\d{0,2})?)\b/);
  if (timeMatch) kickoff = timeMatch[1].trim();

  return { teams, venue, kickoff };
};

const isLikelyMatchActivity = (activity: Activity): boolean => {
  if (activity.isMatchAnchor) return true;
  const blob = `${activity.matchReason || ""} ${activity.description || ""} ${activity.name || ""} ${activity.title || ""}`.toLowerCase();
  return /\b(?:vs\.?|v\.?)\b|\bmatch schedule\b|\bمباراة\b|\bضد\b|\bkickoff\b|\bworld cup\b/i.test(blob);
};


// Translations for the "Analyzed by AI" badge across all supported languages
const AI_ANALYZED_LABELS: Record<string, string> = {
  ar: 'تحليل بالذكاء الاصطناعي',
  en: 'AI-Analyzed',
  ur: 'AI کے ذریعے تجزیہ',
  de: 'KI-analysiert',
  fr: 'Analysé par IA',
  es: 'Analizado por IA',
  zh: 'AI 已分析',
  ru: 'Анализ ИИ',
};
const getAiAnalyzedLabel = (lang: string) => {
  const key = (lang || 'en').slice(0, 2).toLowerCase();
  return AI_ANALYZED_LABELS[key] || AI_ANALYZED_LABELS.en;
}

const UI_CARD_I18N: Record<string, {
  activities: (n: number) => string;
  meals: (n: number) => string;
  publishDayStory: (day: number) => string;
  selectActivities: string;
  includePhotos: string;
  includeDescriptions: string;
  publishStory: string;
  loginRequired: string;
  selectOneActivity: string;
  publishFailed: string;
  dayActivitiesDeducted: string;
  completed: string;
}> = {
  ar: {
    activities: (n) => `${n} فعالية`, meals: (n) => `${n} ${n === 1 ? 'وجبة' : 'وجبات'}`,
    publishDayStory: (day) => `نشر يوم ${day} كقصة`, selectActivities: 'اختر الفعاليات', includePhotos: 'تضمين الصور', includeDescriptions: 'تضمين الوصف',
    publishStory: 'نشر القصة', loginRequired: 'سجّل الدخول أولاً', selectOneActivity: 'اختر فعالية واحدة على الأقل', publishFailed: 'فشل النشر',
    dayActivitiesDeducted: 'سيتم خصم أنشطة اليوم من رصيدك', completed: 'مكتمل'
  },
  en: {
    activities: (n) => `${n} ${n === 1 ? 'activity' : 'activities'}`, meals: (n) => `${n} ${n === 1 ? 'meal' : 'meals'}`,
    publishDayStory: (day) => `Publish Day ${day} as Story`, selectActivities: 'Select Activities', includePhotos: 'Include Photos', includeDescriptions: 'Include Descriptions',
    publishStory: 'Publish Story', loginRequired: 'Login required', selectOneActivity: 'Select at least one activity', publishFailed: 'Publish failed',
    dayActivitiesDeducted: 'Day activities will be deducted', completed: 'completed'
  },
  fr: {
    activities: (n) => `${n} ${n === 1 ? 'activité' : 'activités'}`, meals: (n) => `${n} ${n === 1 ? 'repas' : 'repas'}`,
    publishDayStory: (day) => `Publier le jour ${day} en story`, selectActivities: 'Sélectionner les activités', includePhotos: 'Inclure les photos', includeDescriptions: 'Inclure les descriptions',
    publishStory: 'Publier la story', loginRequired: 'Connexion requise', selectOneActivity: 'Sélectionnez au moins une activité', publishFailed: 'Échec de publication',
    dayActivitiesDeducted: 'Les activités du jour seront déduites', completed: 'terminé'
  },
  es: {
    activities: (n) => `${n} ${n === 1 ? 'actividad' : 'actividades'}`, meals: (n) => `${n} ${n === 1 ? 'comida' : 'comidas'}`,
    publishDayStory: (day) => `Publicar día ${day} como historia`, selectActivities: 'Seleccionar actividades', includePhotos: 'Incluir fotos', includeDescriptions: 'Incluir descripciones',
    publishStory: 'Publicar historia', loginRequired: 'Se requiere iniciar sesión', selectOneActivity: 'Selecciona al menos una actividad', publishFailed: 'Error al publicar',
    dayActivitiesDeducted: 'Se descontarán las actividades del día', completed: 'completado'
  },
  de: {
    activities: (n) => `${n} ${n === 1 ? 'Aktivität' : 'Aktivitäten'}`, meals: (n) => `${n} ${n === 1 ? 'Mahlzeit' : 'Mahlzeiten'}`,
    publishDayStory: (day) => `Tag ${day} als Story teilen`, selectActivities: 'Aktivitäten auswählen', includePhotos: 'Fotos einbeziehen', includeDescriptions: 'Beschreibungen einbeziehen',
    publishStory: 'Story veröffentlichen', loginRequired: 'Anmeldung erforderlich', selectOneActivity: 'Mindestens eine Aktivität auswählen', publishFailed: 'Veröffentlichung fehlgeschlagen',
    dayActivitiesDeducted: 'Tagesaktivitäten werden abgezogen', completed: 'abgeschlossen'
  },
  ru: {
    activities: (n) => `${n} ${n === 1 ? 'активность' : n < 5 ? 'активности' : 'активностей'}`, meals: (n) => `${n} ${n === 1 ? 'приём пищи' : n < 5 ? 'приёма пищи' : 'приёмов пищи'}`,
    publishDayStory: (day) => `Опубликовать день ${day} как сторис`, selectActivities: 'Выбрать активности', includePhotos: 'Добавить фото', includeDescriptions: 'Добавить описания',
    publishStory: 'Опубликовать сторис', loginRequired: 'Требуется вход', selectOneActivity: 'Выберите хотя бы одну активность', publishFailed: 'Не удалось опубликовать',
    dayActivitiesDeducted: 'Активности дня будут списаны', completed: 'завершено'
  },
  zh: {
    activities: (n) => `${n} 项活动`, meals: (n) => `${n} 餐`,
    publishDayStory: (day) => `发布第 ${day} 天为动态`, selectActivities: '选择活动', includePhotos: '包含照片', includeDescriptions: '包含描述',
    publishStory: '发布动态', loginRequired: '请先登录', selectOneActivity: '请至少选择一个活动', publishFailed: '发布失败',
    dayActivitiesDeducted: '将扣除当天活动额度', completed: '已完成'
  },
  ur: {
    activities: (n) => `${n} سرگرمیاں`, meals: (n) => `${n} ${n === 1 ? 'کھانا' : 'کھانے'}`,
    publishDayStory: (day) => `دن ${day} کو اسٹوری کے طور پر شائع کریں`, selectActivities: 'سرگرمیاں منتخب کریں', includePhotos: 'تصاویر شامل کریں', includeDescriptions: 'تفصیل شامل کریں',
    publishStory: 'اسٹوری شائع کریں', loginRequired: 'پہلے لاگ اِن کریں', selectOneActivity: 'کم از کم ایک سرگرمی منتخب کریں', publishFailed: 'اشاعت ناکام ہوگئی',
    dayActivitiesDeducted: 'دن کی سرگرمیاں آپ کے بیلنس سے کاٹی جائیں گی', completed: 'مکمل'
  },
};

const getCardUiText = (lang?: string) => UI_CARD_I18N[(lang || 'en').slice(0, 2).toLowerCase()] || UI_CARD_I18N.en;

const getShareMenuText = (isArabic?: boolean) => ({
  social: isArabic ? 'مشاركة اجتماعية' : 'Social Share',
  whatsapp: 'WhatsApp',
  twitter: 'X',
  facebook: 'Facebook',
  telegram: 'Telegram',
  copy: isArabic ? 'نسخ الرابط' : 'Copy Link',
  instantShare: isArabic ? 'مشاركة فورية' : 'Instant Share',
});


const getLocalizedActivityCopy = (activity: Activity, lang?: string) => {
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  const isArabic = code === 'ar';
  const hasArabic = (value?: string | null) => /[\u0600-\u06FF]/.test(String(value || ''));
  const scrubArabic = (value?: string | null) => String(value || '').replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const rawDescription = String(activity.description || '').trim();
  const rawReason = String(activity.matchReason || '').trim();
  const tips = getActivityTips(activity, isArabic);
  const rawTip = String(tips[0] || '').trim();
  const rawName = String(activity.title || activity.name || '').trim();
  const name = !isArabic && hasArabic(rawName)
    ? (scrubArabic(rawName.split(/\s+في\s+/).slice(1).join(' في ')) || scrubArabic(activity.address || activity.location) || scrubArabic(rawName) || rawName)
    : rawName;
  const cat = String(activity.type || activity.category || '').toLowerCase();
  const text = getCardUiText(code);
  const cleanedDescription = !isArabic && hasArabic(rawDescription) ? scrubArabic(rawDescription) : rawDescription;
  const cleanedReason = !isArabic && hasArabic(rawReason) ? scrubArabic(rawReason) : rawReason;
  const cleanedTip = !isArabic && hasArabic(rawTip) ? scrubArabic(rawTip) : rawTip;
  const localizedDescription = cleanedDescription && (isArabic ? hasArabic(cleanedDescription) : !hasArabic(cleanedDescription))
    ? cleanedDescription
    : cleanedReason && (isArabic ? hasArabic(cleanedReason) : !hasArabic(cleanedReason))
      ? cleanedReason
      : ['food', 'restaurant', 'cafe', 'breakfast', 'lunch', 'dinner', 'snack'].includes(cat)
        ? (code === 'fr' ? `Repas à ${name}` : code === 'es' ? `Comida en ${name}` : code === 'de' ? `Essen bei ${name}` : code === 'ru' ? `Поесть в ${name}` : code === 'zh' ? `在 ${name} 用餐` : code === 'ur' ? `${name} میں کھانا` : isArabic ? `وجبة في ${name}` : `Meal at ${name}`)
        : cat === 'entertainment'
          ? (code === 'fr' ? `Profiter de ${name}` : code === 'es' ? `Disfrutar de ${name}` : code === 'de' ? `${name} genießen` : code === 'ru' ? `Насладитесь ${name}` : code === 'zh' ? `畅玩 ${name}` : code === 'ur' ? `${name} سے لطف اٹھائیں` : isArabic ? `الاستمتاع بـ ${name}` : `Enjoy ${name}`)
          : (code === 'fr' ? `Découvrir ${name}` : code === 'es' ? `Explorar ${name}` : code === 'de' ? `${name} entdecken` : code === 'ru' ? `Исследуйте ${name}` : code === 'zh' ? `探索 ${name}` : code === 'ur' ? `${name} دریافت کریں` : isArabic ? `استكشاف ${name}` : `Explore ${name}`);
  const localizedTip = cleanedTip && (isArabic ? hasArabic(cleanedTip) : !hasArabic(cleanedTip))
    ? cleanedTip
    : ['food', 'restaurant', 'cafe', 'breakfast', 'lunch', 'dinner', 'snack'].includes(cat)
      ? (code === 'fr' ? `Réservez à l'avance surtout aux heures de pointe` : code === 'es' ? `Reserva con antelación, especialmente en horas punta` : code === 'de' ? `Besonders zu Stoßzeiten im Voraus reservieren` : code === 'ru' ? `Лучше бронировать заранее, особенно в часы пик` : code === 'zh' ? `高峰时段建议提前预订` : code === 'ur' ? `خاص طور پر مصروف اوقات میں پہلے سے بک کریں` : isArabic ? `احجز مسبقاً خاصة في أوقات الذروة` : `Book in advance especially during peak hours`)
      : (code === 'fr' ? `Vérifiez les horaires d'ouverture avant la visite` : code === 'es' ? `Verifica el horario antes de visitar` : code === 'de' ? `Öffnungszeiten vor dem Besuch prüfen` : code === 'ru' ? `Проверьте часы работы перед посещением` : code === 'zh' ? `前往前请确认营业时间` : code === 'ur' ? `دورے سے پہلے اوقات کار چیک کریں` : isArabic ? `تحقق من ساعات العمل قبل الزيارة` : `Check opening hours before visiting`);
  return { text, description: localizedDescription, tip: localizedTip };
};

// Frontend safety net: scrub Arabic from displayed activity names when the
// UI language is not Arabic. Handles legacy/cached itineraries whose backend
// generation pre-dated the localization fix (e.g. names like "عشاء في Monterrey").
const getLocalizedActivityName = (activity: Activity, lang?: string): string => {
  let raw = String(activity.title || activity.name || '').trim();
  // ALWAYS prefix match activities with country flags so the card title looks
  // like the promotions/events page — even after normalization/regen passes
  // overwrote the title with a plain "Match X vs Y" string.
  if (activity.matchTeams?.a && activity.matchTeams?.b) {
    const teamA = activity.matchTeams.a;
    const teamB = activity.matchTeams.b;
    const flagA = isMissingFlag(activity.matchTeams.flagA) ? lookupTeamFlag(teamA) : (activity.matchTeams.flagA || '');
    const flagB = isMissingFlag(activity.matchTeams.flagB) ? lookupTeamFlag(teamB) : (activity.matchTeams.flagB || '');
    const hasFlagsAlready = (flagA && raw.includes(flagA)) || (flagB && raw.includes(flagB));
    if (!hasFlagsAlready) {
      raw = `${flagA} ${teamA} vs ${flagB} ${teamB}`.replace(/\s+/g, ' ').trim();
    }
  }
  if (!raw) return raw;
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  if (code === 'ar') return raw;
  const hasArabic = /[\u0600-\u06FF]/.test(raw);
  if (!hasArabic) return raw;

  const cat = String(activity.type || activity.category || '').toLowerCase();
  const isMeal = ['breakfast', 'lunch', 'dinner', 'snack', 'food', 'restaurant', 'cafe'].includes(cat);

  // Extract place name after Arabic preposition "في" if present
  const parts = raw.split(/\s+في\s+/);
  let place = parts.length > 1 ? parts.slice(1).join(' في ').trim() : raw;
  // Strip any remaining Arabic glyphs from the place name
  place = place.replace(/[\u0600-\u06FF]+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!place) place = String(activity.address || activity.location || '').replace(/[\u0600-\u06FF]+/g, '').trim();
  if (!place) return raw; // give up — keep original

  if (isMeal) {
    const mealCat = ['breakfast', 'lunch', 'dinner', 'snack'].includes(cat) ? cat : 'lunch';
    const tmpl: Record<string, Record<string, string>> = {
      en: { breakfast: 'Breakfast at', lunch: 'Lunch at', dinner: 'Dinner at', snack: 'Snack at' },
      fr: { breakfast: 'Petit-déjeuner à', lunch: 'Déjeuner à', dinner: 'Dîner à', snack: 'Collation à' },
      es: { breakfast: 'Desayuno en', lunch: 'Almuerzo en', dinner: 'Cena en', snack: 'Aperitivo en' },
      de: { breakfast: 'Frühstück bei', lunch: 'Mittagessen bei', dinner: 'Abendessen bei', snack: 'Snack bei' },
      ru: { breakfast: 'Завтрак в', lunch: 'Обед в', dinner: 'Ужин в', snack: 'Закуска в' },
      zh: { breakfast: '早餐于', lunch: '午餐于', dinner: '晚餐于', snack: '小吃于' },
      ur: { breakfast: 'ناشتہ بمقام', lunch: 'دوپہر کا کھانا بمقام', dinner: 'رات کا کھانا بمقام', snack: 'ہلکا کھانا بمقام' },
      tr: { breakfast: 'Kahvaltı:', lunch: 'Öğle yemeği:', dinner: 'Akşam yemeği:', snack: 'Atıştırmalık:' },
      pt: { breakfast: 'Café da manhã em', lunch: 'Almoço em', dinner: 'Jantar em', snack: 'Lanche em' },
      it: { breakfast: 'Colazione presso', lunch: 'Pranzo presso', dinner: 'Cena presso', snack: 'Spuntino presso' },
      id: { breakfast: 'Sarapan di', lunch: 'Makan siang di', dinner: 'Makan malam di', snack: 'Camilan di' },
      ja: { breakfast: '朝食:', lunch: '昼食:', dinner: '夕食:', snack: '軽食:' },
      ko: { breakfast: '아침 식사:', lunch: '점심 식사:', dinner: '저녁 식사:', snack: '간식:' },
    };
    const prefix = tmpl[code]?.[mealCat] || tmpl.en[mealCat];
    return `${prefix} ${place}`;
  }
  return place;
};

interface DayData {
  date: Date | string;
  activities: Activity[];
  preferenceSummary?: {
    matchedCount?: number;
    totalRequested?: number;
    coverage?: number;
    interests?: Array<{ key: string; requested: boolean; matched: boolean; matchedCount: number; totalItems: number; reason: string }>;
    meals?: Array<{ key: string; requested: boolean; matched: boolean; matchedCount: number; totalItems: number; reason: string }>;
    failedReasons?: string[];
  };
}

interface ItineraryScheduleProps {
  destination?: string;
  itinerary?: DayData[];
  day?: DayData;
  onMapClick?: (googleMapsLink: string) => void;
  onUpdateDay?: (updatedDay: DayData) => void;
  onMoveActivity?: (activityId: string, fromDayIndex: number, toDayIndex: number) => void;
  onRegenerateActivity?: (activityId: string, dayIndex: number, prompt?: string) => Promise<Activity | null>;
  onRegenerateDay?: (dayIndex: number, prompt?: string) => Promise<Activity[] | null>;
  regenerating?: boolean;
  dayIndex?: number;
  totalDays?: number;
  fuelSettings?: { efficiency: number; price: number };
  regenCosts?: { activity: number; day: number; full: number };
  tripMeta?: {
    tripType?: string;
    interests?: string[];
    cuisinePreferences?: string[] | string;
    activitiesPerDay?: number;
    mealPreferences?: {
      breakfast?: boolean;
      lunch?: boolean;
      dinner?: boolean;
      snacks?: boolean;
      cuisineTypes?: string[];
    } | null;
    specialRequests?: string;
    travelStyle?: string;
    budget?: string | number;
    maxActivitiesPerDay?: number;
    totalDailyItemsTarget?: number;
    remainingActivities?: number | null;
    preferenceMatchSummary?: {
      interests?: string[];
      requestedMeals?: string[];
      usedSearchQueries?: Array<{ key: string; queries: string[] }>;
      days?: Array<{ dayNumber: number; cityName?: string; matchedCount?: number; totalRequested?: number; coverage?: number; interests?: Array<{ key: string; matched: boolean; matchedCount: number; totalItems: number; reason: string; drivers?: string[] }>; meals?: Array<{ key: string; matched: boolean; matchedCount: number; totalItems: number; reason: string }>; failedReasons?: string[] }>;
    };
  };
  remainingActivities?: number | null; // null = unlimited, 0 = exhausted
}

const getCategoryStyle = (category: string) => {
  const styles: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    attraction: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800", icon: "🏛️" },
    food: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", icon: "🍽️" },
    activity: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-800", icon: "🎯" },
    entertainment: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800", icon: "🎭" },
    shopping: { bg: "bg-pink-50 dark:bg-pink-950/30", text: "text-pink-700 dark:text-pink-300", border: "border-pink-200 dark:border-pink-800", icon: "🛍️" },
    cultural: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", icon: "🎨" },
    nature: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800", icon: "🌿" },
    adventure: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", border: "border-green-200 dark:border-green-800", icon: "🧗" },
    nightlife: { bg: "bg-fuchsia-50 dark:bg-fuchsia-950/30", text: "text-fuchsia-700 dark:text-fuchsia-300", border: "border-fuchsia-200 dark:border-fuchsia-800", icon: "🌃" },
    sports: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800", icon: "⚽" },
    relaxation: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800", icon: "🧘" },
    beach: { bg: "bg-cyan-50 dark:bg-cyan-950/30", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-800", icon: "🏖️" },
    art: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", icon: "🎨" },
    museum: { bg: "bg-indigo-50 dark:bg-indigo-950/30", text: "text-indigo-700 dark:text-indigo-300", border: "border-indigo-200 dark:border-indigo-800", icon: "🏛️" },
    restaurant: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", icon: "🍽️" },
    cafe: { bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-200 dark:border-yellow-800", icon: "☕" },
    hotel: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", icon: "🏨" },
    transport: { bg: "bg-slate-50 dark:bg-slate-950/30", text: "text-slate-700 dark:text-slate-300", border: "border-slate-200 dark:border-slate-800", icon: "🚗" },
    breakfast: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800", icon: "☕" },
    lunch: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300", border: "border-orange-200 dark:border-orange-800", icon: "🥗" },
    dinner: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800", icon: "🍲" },
    snack: { bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300", border: "border-yellow-200 dark:border-yellow-800", icon: "🍿" },
    flight_arrival: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800", icon: "🛬" },
    flight_departure: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800", icon: "🛫" },
    airport_transfer: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200 dark:border-sky-800", icon: "🛬" },
    hotel_checkin: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", icon: "🏨" },
    hotel_checkout: { bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", border: "border-violet-200 dark:border-violet-800", icon: "🏨" },
    car_pickup: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800", icon: "🚗" },
    car_return: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-300", border: "border-teal-200 dark:border-teal-800", icon: "🚗" },
  };
  return styles[category?.toLowerCase()] || styles.attraction;
};

const CARD_COLORS = [
  { value: "default", label: "Default", class: "" },
  { value: "red", label: "🔴", class: "border-l-4 border-l-red-500" },
  { value: "blue", label: "🔵", class: "border-l-4 border-l-blue-500" },
  { value: "green", label: "🟢", class: "border-l-4 border-l-green-500" },
  { value: "yellow", label: "🟡", class: "border-l-4 border-l-yellow-500" },
  { value: "purple", label: "🟣", class: "border-l-4 border-l-purple-500" },
  { value: "pink", label: "💗", class: "border-l-4 border-l-pink-500" },
];

const getCardColorClass = (color?: string) => CARD_COLORS.find(c => c.value === color)?.class || "";

const CATEGORY_FALLBACK_IMAGES: Record<string, string[]> = {
  cultural: [
    "https://images.unsplash.com/photo-1564399580075-5dfe19c205f0?auto=format&fit=crop&q=80&w=400&h=300", // Grand museum hall
    "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?auto=format&fit=crop&q=80&w=400&h=300", // Heritage site
  ],
  museum: [
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&q=80&w=400&h=300", // Art gallery interior
    "https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?auto=format&fit=crop&q=80&w=400&h=300", // Modern museum
  ],
  nature: [
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=400&h=300", // Forest
    "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80&w=400&h=300", // Tropical beach
  ],
  shopping: [
    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?auto=format&fit=crop&q=80&w=400&h=300", // Shopping district
    "https://images.unsplash.com/photo-1519567241046-7f570ab3f7e4?auto=format&fit=crop&q=80&w=400&h=300", // Market
  ],
  activity: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&q=80&w=400&h=300", // Hiking adventure
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&q=80&w=400&h=300", // Sports activity
  ],
  entertainment: [
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=400&h=300", // Entertainment lights
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400&h=300", // Fun park
  ],
  nightlife: [
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&q=80&w=400&h=300",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&q=80&w=400&h=300",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=400&h=300",
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=400&h=300",
  ],
  food: [
    "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=400&h=300",
    "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&q=80&w=400&h=300",
  ],
  adventure: [
    "https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&q=80&w=400&h=300",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&q=80&w=400&h=300",
  ],
  sports: [
    "https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&q=80&w=400&h=300",
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=400&h=300",
  ],
  breakfast: [
    "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&q=80&w=400&h=300", // Breakfast spread
  ],
  lunch: [
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=400&h=300", // Lunch dish
  ],
  dinner: [
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=400&h=300", // Fine dining
  ],
  beach: [
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400&h=300", // Beautiful beach
  ],
};

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1522083111425-6cb3b9a12c8b?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1502602898657-3e907609ee35?auto=format&fit=crop&q=80&w=400&h=300",
  "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&q=80&w=400&h=300",
];

const getPlaceImage = (activity: Activity, destination?: string): string => {
  if (activity.imageUrl && activity.imageUrl !== '/placeholder.svg') return upgradeImageQuality(activity.imageUrl, { width: 1600, height: 900 });
  
  // Try category-specific fallback first
  const cat = (activity.type || activity.category || '').toLowerCase();
  const categoryImages = CATEGORY_FALLBACK_IMAGES[cat];
  if (categoryImages && categoryImages.length > 0) {
    const hashString = activity.title || activity.name || activity.id || "travel";
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      hash = hashString.charCodeAt(i) + ((hash << 5) - hash);
    }
    return categoryImages[Math.abs(hash) % categoryImages.length];
  }
  
  // Generic fallback
  const hashString = activity.title || activity.name || activity.id || "travel";
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    hash = hashString.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACK_IMAGES.length;
  
  return FALLBACK_IMAGES[index];
};

// No fake reviews - only show real user-uploaded reviews from the database
const generateSampleReviews = (activity: Activity) => {
  if (activity.reviews?.length) return activity.reviews;
  return []; // Return empty - real reviews come from user comments/photos
};

const getActivityTips = (activity: Activity, isArabic: boolean): string[] => {
  if (activity.tips?.length) return activity.tips;
  const cat = (activity.type || activity.category || '').toLowerCase();
  if (cat === 'food' || cat === 'restaurant' || cat === 'cafe' || cat === 'breakfast' || cat === 'lunch' || cat === 'dinner' || cat === 'snack') {
    return isArabic
      ? ["احجز مسبقاً خاصة في أوقات الذروة", "اسأل عن عروض اليوم"]
      : ["Book in advance especially during peak hours", "Ask about today's specials"];
  } else if (cat === 'attraction' || cat === 'museum') {
    return isArabic
      ? ["اشترِ التذاكر عبر الإنترنت لتجنب الطوابير", "خصص وقتاً كافياً للاستمتاع بالمكان"]
      : ["Buy tickets online in advance to avoid queues", "Allow enough time to enjoy the place"];
  } else if (cat === 'shopping') {
    return isArabic
      ? ["قارن الأسعار قبل الشراء", "اسأل عن الخصومات والعروض الخاصة"]
      : ["Compare prices before buying", "Ask about discounts and special offers"];
  }
  return isArabic
    ? ["تحقق من ساعات العمل قبل الزيارة", "احمل ماءً كافياً خاصة في الطقس الحار"]
    : ["Check opening hours before visiting", "Carry enough water especially in hot weather"];
};

// Detect the generic AI placeholder so we don't show fake hours to the user.
const isPlaceholderHours = (raw: string): boolean => {
  // Treat as placeholder ONLY when the backend explicitly sends nothing useful
  // (empty string, "n/a", "unknown", or known "not available" tokens). Generic
  // ranges like "10:00 AM - 10:00 PM" are still surfaced — many curated places
  // genuinely operate on those hours, and hiding them caused the UI to display
  // "Hours unavailable" for every fallback activity even when the backend had
  // provided a usable range.
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return true;
  return /^(n\/a|unknown|unavailable|tbd|غير\s*متوفر|غير\s*متوفرة|غير\s*معروف)$/i.test(s);
};

// Localize AM/PM and common opening-hours phrases to the active language.
const localizeHoursText = (text: string, code: string): string => {
  if (!text) return '';
  let out = text;
  const tr: Record<string, { am: string; pm: string; open24: string; closed: string; to: string }> = {
    ar: { am: 'ص', pm: 'م', open24: 'مفتوح 24 ساعة', closed: 'مغلق', to: 'إلى' },
    en: { am: 'AM', pm: 'PM', open24: 'Open 24 hours', closed: 'Closed', to: 'to' },
    fr: { am: 'AM', pm: 'PM', open24: 'Ouvert 24h/24', closed: 'Fermé', to: 'à' },
    es: { am: 'AM', pm: 'PM', open24: 'Abierto 24 horas', closed: 'Cerrado', to: 'a' },
    de: { am: 'AM', pm: 'PM', open24: '24 Stunden geöffnet', closed: 'Geschlossen', to: 'bis' },
    ru: { am: 'AM', pm: 'PM', open24: 'Открыто круглосуточно', closed: 'Закрыто', to: 'до' },
    zh: { am: '上午', pm: '下午', open24: '24小时营业', closed: '已关闭', to: '至' },
    ur: { am: 'AM', pm: 'PM', open24: '24 گھنٹے کھلا', closed: 'بند', to: 'سے' },
    tr: { am: 'ÖÖ', pm: 'ÖS', open24: '24 saat açık', closed: 'Kapalı', to: '-' },
    hi: { am: 'AM', pm: 'PM', open24: '24 घंटे खुला', closed: 'बंद', to: 'से' },
    id: { am: 'AM', pm: 'PM', open24: 'Buka 24 jam', closed: 'Tutup', to: 'sampai' },
    pt: { am: 'AM', pm: 'PM', open24: 'Aberto 24 horas', closed: 'Fechado', to: 'às' },
    it: { am: 'AM', pm: 'PM', open24: 'Aperto 24 ore', closed: 'Chiuso', to: 'alle' },
    ja: { am: '午前', pm: '午後', open24: '24時間営業', closed: '休業', to: '〜' },
    ko: { am: '오전', pm: '오후', open24: '24시간 영업', closed: '영업종료', to: '~' },
  };
  const dict = tr[code] || tr.en;
  out = out.replace(/open\s*24\s*hours/gi, dict.open24);
  out = out.replace(/\b24\s*\/\s*7\b/g, dict.open24);
  out = out.replace(/\bclosed\b/gi, dict.closed);
  out = out.replace(/\bAM\b/g, dict.am);
  out = out.replace(/\bPM\b/g, dict.pm);
  // Locale-aware hour-range separator: replace ASCII "-" between two HH(:MM)
  // tokens with the language-specific "to" word so each locale reads naturally
  // (e.g. EN "9:00 to 17:00", AR "9:00 إلى 17:00", ZH "9:00 至 17:00").
  // Western digits are preserved per project convention.
  out = out.replace(
    /(\d{1,2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?)/g,
    (_m, a, b) => `${a} ${dict.to} ${b}`,
  );
  return out;
};

// Normalize SerpAPI / AI shapes (string | object | array of {day:value}) into a single string.
const normalizeHoursInput = (raw: any): string => {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  // Array of { dayName: "10 AM-11:30 AM" } entries (SerpAPI Places shape)
  if (Array.isArray(raw)) {
    const parts: string[] = [];
    for (const item of raw) {
      if (!item) continue;
      if (typeof item === 'string') { parts.push(item); continue; }
      if (typeof item === 'object') {
        for (const [k, v] of Object.entries(item)) {
          if (v == null) continue;
          if (typeof v === 'string' || typeof v === 'number') parts.push(`${k}: ${v}`);
        }
      }
    }
    return parts.join(', ');
  }
  if (typeof raw === 'object') {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(raw)) {
      if (v == null) continue;
      if (typeof v === 'string' || typeof v === 'number') parts.push(`${k}: ${v}`);
    }
    return parts.join(', ');
  }
  return String(raw);
};

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const formatOperatingHoursObject = (raw: Record<string, any>, lang: string): string => {
  const lowerMap = new Map<string, string>();
  Object.entries(raw || {}).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) lowerMap.set(key.toLowerCase().trim(), value.trim());
  });
  const todayKey = WEEKDAY_KEYS[new Date().getDay()];
  const today = lowerMap.get(todayKey);
  if (today) return localizeHoursText(today, lang);
  const compact = WEEKDAY_KEYS
    .map((key) => lowerMap.get(key) ? `${key.slice(0, 3)}: ${lowerMap.get(key)}` : '')
    .filter(Boolean)
    .slice(0, 3)
    .join(' / ');
  return compact ? localizeHoursText(compact, lang) : '';
};

// Format opening hours - handle raw JSON-like strings from AI
const formatOpeningHours = (hours: any, lang: string = 'en'): string => {
  if (hours && typeof hours === 'object' && !Array.isArray(hours)) {
    const operating = formatOperatingHoursObject(hours as Record<string, any>, lang);
    if (operating) return operating;
  }
  const hoursStr = normalizeHoursInput(hours);
  if (!hoursStr) return '';
  if (isPlaceholderHours(hoursStr)) return '';
  // If it looks like JSON or contains day:value pairs, parse it
  const cleaned = hoursStr.replace(/[{}]/g, '').trim();
  // Check for "Open 24 hours" patterns
  if (/open\s*24\s*hours/i.test(cleaned) || cleaned === '24/7') {
    return localizeHoursText('Open 24 hours', lang);
  }
  // Check for JSON-like day patterns: "monday":"Open 24 hours","tuesday":"9:00-17:00"
  if (cleaned.includes('"') && cleaned.includes(':')) {
    try {
      // Try parsing as JSON
      const parsed = JSON.parse(`{${cleaned.replace(/'/g, '"')}}`);
      if (typeof parsed === 'object') {
        const values = Object.values(parsed) as string[];
        const unique = [...new Set(values.map((v: string) => v.trim()))];
        if (unique.length === 1) return localizeHoursText(unique[0], lang);
        // Show abbreviated
        return localizeHoursText(unique.slice(0, 2).join(' / '), lang);
      }
    } catch {
      // Not valid JSON, try manual extraction
    }
    // Extract the value after the first colon
    const match = cleaned.match(/"?\w+"?\s*:\s*"?([^",}]+)/);
    if (match) {
      const val = match[1].trim();
      if (/open\s*24\s*hours/i.test(val)) return localizeHoursText('Open 24 hours', lang);
      return localizeHoursText(val, lang);
    }
  }
  // Remove excessive whitespace and line breaks
  return localizeHoursText(cleaned.replace(/\s+/g, ' ').substring(0, 50), lang);
};

const getUnifiedOpeningHours = (activity: any, lang: string = 'en'): string => {
  // Check ALL known field name variants (camelCase + snake_case + nested raw)
  // because the backend writes the rich object to `operatingHours` (camelCase)
  // while the SerpAPI passthrough lives on `operating_hours` (snake_case).
  const candidates = [
    activity?.operating_hours,
    (activity as any)?.operatingHours,
    activity?.openingHours,
    activity?.hours,
    activity?.open_state,
    activity?.openState,
    (activity as any)?._raw?.operating_hours,
    (activity as any)?._raw?.hours,
    (activity as any)?._raw?.open_state,
  ];
  for (const candidate of candidates) {
    const formatted = formatOpeningHours(candidate, lang);
    if (formatted) return formatted;
  }
  return '';
};

// ─────────────────────────────────────────────────────────────────────────────
// Open/Closed status detector — compares the activity's scheduled time with
// its opening hours window so the card can show a live "Open / Closed" badge.
// Returns 'open' | 'closed' | 'unknown' (when the hours can't be parsed or are
// 24/7, in which case we treat the place as always open).
// ─────────────────────────────────────────────────────────────────────────────
type OpenStatus = 'open' | 'closed' | 'unknown';

const parseHourToken = (raw: string): number | null => {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  // Arabic AM/PM markers ص / م
  const isArAm = /ص$/.test(s);
  const isArPm = /م$/.test(s);
  const cleaned = s.replace(/[صم]$/u, '');
  const m = cleaned.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2] || '0', 10);
  const meridiem = m[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (isArPm && hour < 12) hour += 12;
  if (isArAm && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return null;
  return hour + (Number.isFinite(minute) ? minute / 60 : 0);
};

const getOpenStatus = (rawHours: string | undefined, scheduledTime: string | undefined): OpenStatus => {
  const hoursStr = String(rawHours || '').trim();
  const timeStr = String(scheduledTime || '').trim();
  if (!hoursStr || !timeStr) return 'unknown';
  // 24/7 → always open
  if (/24\s*\/?\s*7|open\s*24\s*hours|24\s*ساعة/i.test(hoursStr)) return 'open';
  if (/^closed$|^مغلق$/i.test(hoursStr)) return 'closed';
  // Pull all hour tokens from the hours string (supports "9 AM - 10 PM",
  // "9:00-22:00", "10 ص–9 م", "12–11 م", etc.). We only consider the FIRST
  // open/close pair we find — that covers the majority of real cases.
  const normalized = hoursStr
    .replace(/[–—−]/g, '-')
    .replace(/\u200f|\u200e/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const pairMatch = normalized.match(/([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|ص|م)?)\s*-\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:am|pm|ص|م)?)/i);
  if (!pairMatch) return 'unknown';
  const openH = parseHourToken(pairMatch[1]);
  let closeH = parseHourToken(pairMatch[2]);
  if (openH === null || closeH === null) return 'unknown';
  // Overnight (e.g. 11 AM – 1 AM) — push close past 24 so comparison works.
  if (closeH <= openH) closeH += 24;
  const sched = parseActivityTime(timeStr, NaN);
  if (!Number.isFinite(sched.hour)) return 'unknown';
  const schedH = sched.hour + sched.minute / 60;
  const schedNorm = schedH < openH ? schedH + 24 : schedH;
  return schedNorm >= openH && schedNorm < closeH ? 'open' : 'closed';
};

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate / address sanity check — guards against silently rendering map
// links that point to a different place than the card. Returns true when the
// activity has either resolvable coordinates OR a real (non-generic) address
// AND the resolved map URL matches the same place reference.
// ─────────────────────────────────────────────────────────────────────────────
const hasReliableLocation = (activity: Activity): boolean => {
  const lat = Number(activity.latitude);
  const lng = Number(activity.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const addr = String(activity.address || activity.location || '').trim();
  return hasCoords || (addr.length > 3 && !isGenericActivityTitle(activity));
};

const formatDisplayTime = (hour24: number, minute = 0): string => {
  const normalizedHour = ((hour24 % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? 'PM' : 'AM';
  const hour12 = normalizedHour > 12 ? normalizedHour - 12 : normalizedHour === 0 ? 12 : normalizedHour;
  return `${hour12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
};

const normalizeActivityTimeRange = (activity: Activity, fallbackHour = 9): Activity => {
  const rawStart = String(activity.startTime || activity.time || '').trim();
  const rawEnd = String(activity.endTime || '').trim();
  const startParts = parseActivityTime(rawStart || undefined, fallbackHour);
  const endParts = parseActivityTime(rawEnd || undefined, startParts.hour + 2);
  const endIsBeforeOrEqual = endParts.hour < startParts.hour || (endParts.hour === startParts.hour && endParts.minute <= startParts.minute);
  const normalizedEndHour = endIsBeforeOrEqual ? startParts.hour + 2 : endParts.hour;
  const normalizedEndMinute = endIsBeforeOrEqual ? startParts.minute : endParts.minute;
  const normalizedStart = formatDisplayTime(startParts.hour, startParts.minute);
  const normalizedEnd = formatDisplayTime(normalizedEndHour, normalizedEndMinute);

  return {
    ...activity,
    startTime: normalizedStart,
    time: normalizedStart,
    endTime: normalizedEnd,
  };
};

const sortActivitiesChronologically = (items: Activity[]): Activity[] =>
  [...items].sort((a, b) => {
    const ap = parseActivityTime(a.startTime || a.time, 99);
    const bp = parseActivityTime(b.startTime || b.time, 99);
    return (ap.hour * 60 + ap.minute) - (bp.hour * 60 + bp.minute);
  });

// Auto-recalculate times based on order — chains each activity start to the
// previous activity's end, while preserving each activity's original duration
// (defaulting to 2h when unknown). Match anchors keep their fixed kickoff time.
const recalculateTimes = (activities: Activity[]): Activity[] => {
  const baseHour = 9;
  let cursorHour = baseHour;
  let cursorMinute = 0;

  return activities.map((act, i) => {
    if (act.isMatchAnchor) {
      // Sync cursor to the anchor's end so subsequent activities follow it
      const anchorStart = parseActivityTime(act.startTime || act.time, baseHour + i * 2);
      const anchorEnd = parseActivityTime(act.endTime, anchorStart.hour + 2);
      cursorHour = anchorEnd.hour;
      cursorMinute = anchorEnd.minute;
      return act;
    }

    // Preserve original duration when both times are valid; otherwise default to 2h.
    const rawStart = String(act.startTime || act.time || '').trim();
    const rawEnd = String(act.endTime || '').trim();
    const origStart = parseActivityTime(rawStart || undefined, NaN);
    const origEnd = parseActivityTime(rawEnd || undefined, NaN);
    let durationMinutes = 120;
    if (Number.isFinite(origStart.hour) && Number.isFinite(origEnd.hour)) {
      const startTotal = origStart.hour * 60 + origStart.minute;
      let endTotal = origEnd.hour * 60 + origEnd.minute;
      if (endTotal <= startTotal) endTotal += 24 * 60; // overnight
      const diff = endTotal - startTotal;
      if (diff > 0 && diff <= 12 * 60) durationMinutes = diff;
    }

    const startTotal = cursorHour * 60 + cursorMinute;
    const endTotal = startTotal + durationMinutes;
    const endHour = Math.floor(endTotal / 60);
    const endMinute = endTotal % 60;

    const newStart = formatDisplayTime(cursorHour, cursorMinute);
    const newEnd = formatDisplayTime(endHour, endMinute);

    cursorHour = endHour;
    cursorMinute = endMinute;

    return {
      ...act,
      startTime: newStart,
      time: newStart,
      endTime: newEnd,
    };
  });
};

// Build rich description with all links for calendar events
const buildCalendarDescription = (activity: Activity, date: Date, destination?: string, lang?: string): string => {
  const mapUrl = getMapUrl(activity);
  // Extract the itinerary ID from the current URL path (e.g. /itinerary/abc123)
  const pathMatch = window.location.pathname.match(/\/itinerary\/([^/]+)/);
  const itineraryId = pathMatch ? pathMatch[1] : '';
  // Always build the link from origin + itinerary path to ensure correct trip
  const itineraryLink = itineraryId 
    ? `${window.location.origin}/itinerary/${itineraryId}`
    : window.location.href.split('#')[0];
  const activityDetailLink = `${itineraryLink}#activity-${activity.id}`;
  
  const isAr = lang?.startsWith('ar');
  const isZh = lang?.startsWith('zh');
  const isRu = lang?.startsWith('ru');
  
  const labels = isAr
    ? { location: 'الموقع', phone: 'الهاتف', website: 'الموقع الإلكتروني', maps: 'خرائط جوجل', fullPlan: 'الخطة الكاملة', activityDetails: 'تفاصيل الفعالية' }
    : isZh
    ? { location: '位置', phone: '电话', website: '网站', maps: '谷歌地图', fullPlan: '完整行程', activityDetails: '活动详情' }
    : isRu
    ? { location: 'Адрес', phone: 'Телефон', website: 'Сайт', maps: 'Google Карты', fullPlan: 'Полный маршрут', activityDetails: 'Детали активности' }
    : { location: 'Location', phone: 'Phone', website: 'Website', maps: 'Google Maps', fullPlan: 'Full Itinerary', activityDetails: 'Activity Details' };

  const lines = [
    activity.description || '',
    '',
    `📍 ${labels.location}: ${activity.address || activity.location || ''}`,
    activity.phone ? `📞 ${labels.phone}: ${activity.phone}` : '',
    activity.website ? `🌐 ${labels.website}: ${activity.website}` : '',
    '',
    `🗺️ ${labels.maps}: ${mapUrl}`,
    `📋 ${labels.fullPlan}: ${itineraryLink}`,
    `🎯 ${labels.activityDetails}: ${activityDetailLink}`,
  ].filter(Boolean);
  return lines.join('\\n');
};

// Parse actual activity time to hours/minutes
const parseActivityTime = (timeStr?: string, fallbackHour = 9): { hour: number; minute: number } => {
  const raw = String(timeStr || '').trim();
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (!match) return { hour: fallbackHour, minute: 0 };
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || '').toUpperCase();
  const hasMeridiem = Boolean(meridiem);

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return { hour: fallbackHour, minute: 0 };
  }
  if (hasMeridiem) {
    if (hour < 1 || hour > 12) return { hour: fallbackHour, minute: 0 };
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return { hour, minute };
  }
  if (hour < 0 || hour > 23) return { hour: fallbackHour, minute: 0 };
  return { hour, minute };
};

const getActivityStartEnd = (activity: Activity, date: Date): { start: Date; end: Date } => {
  const startParts = parseActivityTime(activity.startTime || activity.time, 9);
  const endParts = parseActivityTime(activity.endTime, startParts.hour + 2);
  const start = new Date(date);
  start.setHours(startParts.hour, startParts.minute, 0, 0);
  const end = new Date(date);
  end.setHours(endParts.hour, endParts.minute, 0, 0);
  if (end <= start) end.setHours(start.getHours() + 2, start.getMinutes(), 0, 0);
  return { start, end };
};

const fmtIcsDate = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");

// Generate calendar event URL - uses ICS for native calendar on both iOS and Android
const generateCalendarUrl = (activity: Activity, date: Date, destination?: string, lang?: string): string => {
  const title = encodeURIComponent(activity.title || activity.name || 'Activity');
  const location = encodeURIComponent(activity.address || activity.location || '');
  const details = encodeURIComponent(buildCalendarDescription(activity, date, destination, lang));
  const { start, end } = getActivityStartEnd(activity, date);
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&location=${location}&details=${details}&dates=${fmtIcsDate(start)}/${fmtIcsDate(end)}`;
};

// Generate ICS data URI - works natively with Apple Calendar on iOS and Google Calendar on Android
const generateIcsDataUri = (activity: Activity, date: Date, destination?: string, lang?: string): string => {
  const title = activity.title || activity.name || 'Activity';
  const location = activity.address || activity.location || '';
  const description = buildCalendarDescription(activity, date, destination, lang);
  const mapUrl = getMapUrl(activity);
  const { start, end } = getActivityStartEnd(activity, date);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `SUMMARY:${title}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    `URL:${mapUrl}`,
    `UID:${activity.id || Date.now()}@aseelaitrip`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
};

// Generate downloadable .ics file content
const generateICSContent = (activity: Activity, date: Date, destination?: string, lang?: string): string => {
  const title = activity.title || activity.name || 'Activity';
  const location = activity.address || activity.location || '';
  const description = buildCalendarDescription(activity, date, destination, lang);
  const mapUrl = getMapUrl(activity);
  const { start, end } = getActivityStartEnd(activity, date);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `SUMMARY:${title}`,
    `DTSTART:${fmtIcsDate(start)}`,
    `DTEND:${fmtIcsDate(end)}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    `URL:${mapUrl}`,
    `UID:${activity.id}@aseel-trip`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join('\r\n');
};

const downloadICS = (activity: Activity, date: Date, lang?: string) => {
  const icsContent = generateICSContent(activity, date, undefined, lang);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(activity.title || activity.name || 'event').replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const escapeHtml = (value: string = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// Export a single activity as PDF
const exportActivityPDF = async (activity: Activity, date: Date, photos: string[], destination?: string) => {
  const jsPDF = (await import('jspdf')).default;
  const html2canvas = (await import('html2canvas')).default;

  const mapUrl = getMapUrl(activity);
  const calendarBridgeUrl = `${window.location.origin}/calendar/add?title=${encodeURIComponent(activity.title || activity.name || 'Activity')}&location=${encodeURIComponent(activity.address || activity.location || '')}&details=${encodeURIComponent(activity.description || '')}&start=${new Date(date).toISOString()}&end=${new Date(new Date(date).getTime() + 2 * 3600000).toISOString()}&pref=auto`;
  const title = activity.title || activity.name || 'Activity';
  const address = activity.address || activity.location || '';
  const visitTime = `${activity.startTime || activity.time || ''}${activity.endTime ? ` - ${activity.endTime}` : ''}`;
  const hours = getUnifiedOpeningHours(activity, 'en');
  const websiteUrl = activity.website ? (activity.website.startsWith('http') ? activity.website : `https://${activity.website}`) : '';

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '794px';
  host.style.background = '#ffffff';
  host.style.padding = '24px';
  host.style.direction = 'rtl';
  host.style.fontFamily = 'Arial, "Segoe UI", sans-serif';
  host.style.color = '#0f172a';
  host.style.lineHeight = '1.7';

  // Build QR code SVGs as data URIs using canvas
  const renderQR = (value: string, size: number): string => {
    // We'll use a placeholder - the actual QR will be rendered by the component
    return '';
  };

  host.innerHTML = `
    <div style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <div style="padding:18px 18px 12px;background:#f0fdfa;border-bottom:1px solid #ccfbf1;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:12px;color:#0f766e;font-weight:700;letter-spacing:.08em;">✈️ ASEEL AI TRIP</div>
            <h1 style="margin:6px 0 0;font-size:24px;line-height:1.4;color:#0f172a;">${escapeHtml(title)}</h1>
            <p style="margin:6px 0 0;font-size:13px;color:#64748b;">${escapeHtml(destination || '')} · ${escapeHtml(format(date, 'EEEE, MMM d, yyyy'))}</p>
          </div>
        </div>
      </div>

      <div style="padding:16px 18px;display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#fff;">
        ${address ? `<div style="background:#f8fafc;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#64748b;">📍 الموقع</div><div style="font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(address)}</div></div>` : ''}
        ${visitTime ? `<div style="background:#f8fafc;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#64748b;">🕐 وقت الزيارة</div><div style="font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(visitTime)}</div></div>` : ''}
        ${hours ? `<div style="background:#f8fafc;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#64748b;">🏪 ساعات العمل</div><div style="font-size:12px;font-weight:600;color:#0f172a;">${escapeHtml(hours)}</div></div>` : ''}
        ${activity.cost !== undefined ? `<div style="background:#f8fafc;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#64748b;">💰 التكلفة</div><div style="font-size:13px;font-weight:700;color:#0f172a;">${activity.cost === 0 ? 'مجاني' : `$${activity.cost}`}</div></div>` : ''}
        ${activity.rating ? `<div style="background:#fef3c7;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#92400e;">⭐ التقييم</div><div style="font-size:13px;font-weight:700;color:#92400e;">${activity.rating} / 5</div></div>` : ''}
        ${activity.phone ? `<div style="background:#f8fafc;padding:10px;border-radius:10px;"><div style="font-size:11px;color:#64748b;">📞 الهاتف</div><a href="tel:${escapeHtml(activity.phone.replace(/\s+/g, ''))}" style="font-size:13px;font-weight:600;color:#0d9488;text-decoration:none;">${escapeHtml(activity.phone)}</a></div>` : ''}
      </div>

      ${activity.description ? `<div style="padding:0 18px 14px;"><p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">${escapeHtml(activity.description)}</p></div>` : ''}

      <div style="padding:0 18px 14px;display:flex;gap:14px;flex-wrap:wrap;font-size:13px;">
        ${mapUrl !== '#' ? `<a href="${escapeHtml(mapUrl)}" style="color:#0d9488;text-decoration:none;font-weight:700;">📍 فتح الخريطة</a>` : ''}
        <a href="${escapeHtml(calendarBridgeUrl)}" style="color:#0d9488;text-decoration:none;font-weight:700;">📅 إضافة للتقويم</a>
        ${activity.phone ? `<a href="tel:${escapeHtml(activity.phone.replace(/\s+/g, ''))}" style="color:#0d9488;text-decoration:none;font-weight:700;">📞 اتصال</a>` : ''}
        ${websiteUrl ? `<a href="${escapeHtml(websiteUrl)}" style="color:#0d9488;text-decoration:none;font-weight:700;">🌐 الموقع الإلكتروني</a>` : ''}
      </div>

      ${photos.length > 0 ? `
        <div style="padding:0 18px 18px;">
          <h3 style="margin:0 0 8px;font-size:14px;color:#0f172a;">📸 الصور والفيديو</h3>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">
            ${photos.slice(0, 9).map((p) => {
              const isVideo = p.includes('.mp4') || p.includes('.webm') || p.includes('video');
              return isVideo
                ? `<div style="height:110px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#64748b;">🎬 فيديو</div>`
                : `<img src="${escapeHtml(p)}" alt="photo" style="width:100%;height:110px;object-fit:cover;border-radius:8px;" />`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- QR Codes Section -->
      <div style="padding:0 18px 18px;display:flex;gap:20px;justify-content:center;flex-wrap:wrap;" id="qr-section">
        <div style="text-align:center;">
          <div id="qr-map" style="width:100px;height:100px;"></div>
          <div style="font-size:10px;color:#64748b;margin-top:4px;">📍 الموقع</div>
        </div>
        <div style="text-align:center;">
          <div id="qr-calendar" style="width:100px;height:100px;"></div>
          <div style="font-size:10px;color:#64748b;margin-top:4px;">📅 التقويم</div>
        </div>
        ${websiteUrl ? `<div style="text-align:center;"><div id="qr-website" style="width:100px;height:100px;"></div><div style="font-size:10px;color:#64748b;margin-top:4px;">🌐 الموقع الإلكتروني</div></div>` : ''}
      </div>

      <div style="text-align:center;padding:12px 18px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;">
        ✈️ ASEEL AI TRIP · ${escapeHtml(destination || '')}
      </div>
    </div>
  `;

  document.body.appendChild(host);

  // Render QR codes using the QRCodeSVG from react
  try {
    const { createRoot } = await import('react-dom/client');
    const React = await import('react');
    const { QRCodeSVG: QR } = await import('qrcode.react');
    
    const qrTargets = [
      { id: 'qr-map', value: mapUrl },
      { id: 'qr-calendar', value: calendarBridgeUrl },
      ...(websiteUrl ? [{ id: 'qr-website', value: websiteUrl }] : []),
    ];

    for (const { id, value } of qrTargets) {
      const el = host.querySelector(`#${id}`);
      if (el && value && value !== '#') {
        const root = createRoot(el);
        root.render(React.createElement(QR, { value, size: 100 }));
      }
    }

    // Wait for QRs to render
    await new Promise(r => setTimeout(r, 300));

    const images = host.querySelectorAll('img');
    await Promise.all(
      Array.from(images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 2500);
            })
      )
    );

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: host.scrollWidth,
      windowWidth: host.scrollWidth,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 10;
    const pageWidth = 210 - margin * 2;
    const pageHeight = 297 - margin * 2;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'PNG', margin, margin, pageWidth, imgHeight, undefined, 'FAST');
    } else {
      let offset = 0;
      let remaining = imgHeight;
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', margin, margin - offset, pageWidth, imgHeight, undefined, 'FAST');
        remaining -= pageHeight;
        offset += pageHeight;
        if (remaining > 0) pdf.addPage();
      }
    }

    // Add clickable links to PDF
    const hostRect = host.getBoundingClientRect();
    const scaleX = pageWidth / hostRect.width;
    const scaleY = imgHeight / hostRect.height;
    
    const allLinks = host.querySelectorAll<HTMLAnchorElement>('a[href]');
    allLinks.forEach(link => {
      const href = (link.getAttribute('href') || '').trim();
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('data:')) return;
      const rect = link.getBoundingClientRect();
      const x = margin + (rect.left - hostRect.left) * scaleX;
      const y = margin + (rect.top - hostRect.top) * scaleY;
      const w = Math.max(rect.width * scaleX, 4);
      const h = Math.max(rect.height * scaleY, 4);
      if (y >= 0 && y + h <= 297) {
        pdf.link(x, y, w, h, { url: href });
      }
    });

    const fileName = `${(title || 'activity').replace(/\s+/g, '_')}.pdf`;
    pdf.save(fileName);
  } finally {
    document.body.removeChild(host);
  }
};

// Export single activity as HTML
const exportActivityHTML = (activity: Activity, date: Date, photos: string[], destination?: string) => {
  const mapUrl = getMapUrl(activity);
  const calendarBridgeUrl = `${window.location.origin}/calendar/add?title=${encodeURIComponent(activity.title || activity.name || 'Activity')}&location=${encodeURIComponent(activity.address || activity.location || '')}&details=${encodeURIComponent(activity.description || '')}&start=${new Date(date).toISOString()}&end=${new Date(new Date(date).getTime() + 2 * 3600000).toISOString()}&pref=auto`;
  const websiteUrl = activity.website ? (activity.website.startsWith('http') ? activity.website : `https://${activity.website}`) : '';
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${activity.title || activity.name}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;direction:rtl;color:#1a1a1a;background:#f8fafc}
h1{color:#0d9488;margin-bottom:8px}a{color:#0d9488}.info{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0;font-size:14px;color:#64748b}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin:16px 0}
.photos img,.photos video{width:100%;border-radius:8px;object-fit:cover;max-height:250px}
.tip{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:8px 0;font-size:13px;color:#78350f}
</style></head><body>
<div style="text-align:center;font-size:12px;color:#0f766e;font-weight:700;letter-spacing:.08em;margin-bottom:12px;">✈️ ASEEL AI TRIP</div>
<h1>${activity.title || activity.name}</h1>
<div class="info">
${activity.address ? `<span>📍 <a href="${mapUrl}" target="_blank">${activity.address || activity.location}</a></span>` : ''}
<span>🕐 ${activity.startTime || activity.time || ''}${activity.endTime ? ' - ' + activity.endTime : ''}</span>
${getUnifiedOpeningHours(activity, 'en') ? `<span>🏪 ${getUnifiedOpeningHours(activity, 'en')}</span>` : ''}
${activity.cost !== undefined ? `<span>💰 ${activity.cost === 0 ? 'مجاني' : '$' + activity.cost}</span>` : ''}
${activity.rating ? `<span>⭐ ${activity.rating}</span>` : ''}
</div>
${activity.description ? `<p style="color:#475569;line-height:1.7">${activity.description}</p>` : ''}
<div class="info">
${websiteUrl ? `<a href="${websiteUrl}" target="_blank">🌐 الموقع الرسمي</a>` : ''}
${activity.phone ? `<a href="tel:${activity.phone}">📞 ${activity.phone}</a>` : ''}
<a href="${mapUrl}" target="_blank">📍 فتح في الخريطة</a>
<a href="${calendarBridgeUrl}" target="_blank">📅 إضافة للتقويم</a>
</div>
${photos.length > 0 ? `<h3>📸 الصور والوسائط</h3><div class="photos">${photos.map(p => p.includes('video') || p.includes('.mp4') || p.includes('.webm') ? `<video src="${p}" controls></video>` : `<img src="${p}" alt="">`).join('')}</div>` : ''}
<footer style="text-align:center;color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">
${destination || ''} · ✈️ ASEEL AI TRIP
</footer></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(activity.title || activity.name || 'activity').replace(/\s+/g, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

// Detects placeholder/generic activity titles like "Lunch in Los Angeles" or
const getResolvedPlace = (activity: Activity) => getPrecisePlaceData(activity);

// "غداء في Guadalajara" without a venue/address is treated as generic and must
// never be shown as if it were a precise place.
const isGenericPlaceholder = (activity: Activity): boolean =>
  isGenericActivityTitle(activity) && !getResolvedPlace(activity).addressLabel;

const getMapUrl = (activity: Activity): string => getResolvedPlace(activity).mapUrl;

const getMapLinkReason = (activity: Activity, resolved?: ReturnType<typeof getPrecisePlaceData>): string => {
  if (activity.googleMapsLinkReason) return activity.googleMapsLinkReason;
  const mapUrl = resolved?.mapUrl || getMapUrl(activity);
  const cid = activity.dataCid || activity.data_cid || mapUrl.match(/[?&]cid=(\d+)/i)?.[1];
  if (cid) return `CID: ${cid}`;
  const placeId = activity.placeId || activity.place_id || mapUrl.match(/[?&]query_place_id=([^&]+)/i)?.[1];
  if (placeId) {
    const decoded = decodeURIComponent(String(placeId));
    return `place_id: ${decoded.slice(0, 18)}${decoded.length > 18 ? "…" : ""}`;
  }
  if (Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude)) {
    return `lat/lng: ${activity.latitude!.toFixed(5)}, ${activity.longitude!.toFixed(5)}`;
  }
  return "text query";
};

const getLocationLabel = (activity: Activity): string =>
  getResolvedPlace(activity).addressLabel || String(activity.address || activity.location || '').trim();

// QR Code & Actions Dialog
const QRCodeDialog = ({ activity, date, isOpen, onClose }: { activity: Activity; date: Date; isOpen: boolean; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const mapUrl = getMapUrl(activity);
  const calendarUrl = generateCalendarUrl(activity, date, undefined, lang);
  
  const actionItems = [
    { label: t('itinerary.locationMap', { defaultValue: 'Open in Maps' }), data: mapUrl, icon: <MapPin size={14} />, action: () => window.open(mapUrl, '_blank') },
    { label: t('itinerary.addToCalendar', { defaultValue: 'Add to Calendar' }), data: generateIcsDataUri(activity, date, undefined, lang), icon: <Calendar size={14} />, action: () => downloadICS(activity, date, lang) },
    ...(activity.website ? [{ label: t('itinerary.website', { defaultValue: 'Website' }), data: activity.website, icon: <Globe size={14} />, action: () => window.open(activity.website!, '_blank') }] : []),
    ...(activity.phone ? [{ label: t('itinerary.contact', { defaultValue: 'Call' }), data: `tel:${activity.phone}`, icon: <Phone size={14} />, action: () => window.open(`tel:${activity.phone}`, '_self') }] : []),
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode size={18} /> {getLocalizedActivityName(activity, lang)}
          </DialogTitle>
        </DialogHeader>
        {/* Direct action buttons */}
        <div className="grid grid-cols-2 gap-2 py-2">
          {actionItems.map((item, i) => (
            <Button key={i} variant="outline" className="flex items-center gap-2 h-auto py-3" onClick={item.action}>
              {item.icon} <span className="text-sm">{item.label}</span>
            </Button>
          ))}
        </div>
        {/* QR codes */}
        <div className="border-t border-border pt-3 mt-1">
          <p className="text-xs text-muted-foreground mb-3">{t('itinerary.scanQR', { defaultValue: 'Or scan QR codes:' })}</p>
          <div className="grid grid-cols-2 gap-4">
            {actionItems.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-3 bg-muted/50 rounded-xl">
                <QRCodeSVG value={item.data} size={90} />
                <span className="text-[10px] font-medium text-foreground flex items-center gap-1">{item.icon} {item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Time slot picker (every 30 min, 24h coverage) for consistent time selection
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(formatDisplayTime(h, m));
    }
  }
  return out;
})();

const TimeSlotSelect = ({
  value, onChange, placeholder, minTime,
}: { value: string; onChange: (v: string) => void; placeholder?: string; minTime?: string }) => {
  const minParts = minTime ? parseActivityTime(minTime, NaN) : null;
  const minTotal = minParts && Number.isFinite(minParts.hour) ? minParts.hour * 60 + minParts.minute : -1;
  const slots = TIME_SLOTS.filter((slot) => {
    if (minTotal < 0) return true;
    const p = parseActivityTime(slot, NaN);
    return p.hour * 60 + p.minute > minTotal;
  });
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="h-11">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="z-[9999] max-h-[260px] overflow-y-auto" sideOffset={4}>
        {value && !slots.includes(value) && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
        {slots.map((slot) => (
          <SelectItem key={slot} value={slot}>{slot}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// Edit Activity Modal with Auto-Generate option
const EditActivityModal = ({ 
  activity, isOpen, onClose, onSave, isNew, destination, onAutoGenerate, suggestedStartTime
}: { 
  activity: Activity | null; isOpen: boolean; onClose: () => void; onSave: (updated: Activity) => void; isNew?: boolean;
  destination?: string; onAutoGenerate?: (draft: Partial<Activity> & { customPrompt?: string }) => Promise<Activity | null>;
  suggestedStartTime?: string;
}) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [form, setForm] = useState<Activity>({} as Activity);
  const [generating, setGenerating] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  useEffect(() => {
    if (activity) {
      // Pre-fill suggested start time for new activities (inherits from previous activity)
      const startSeed = String(activity.startTime || activity.time || '').trim() || (isNew ? (suggestedStartTime || '') : '');
      setForm({ ...activity, startTime: startSeed, time: startSeed });
      setCustomPrompt('');
    }
  }, [activity, isNew, suggestedStartTime]);

  // Infer a category from a free-text prompt across the site's supported languages
  const inferCategoryFromPrompt = (text: string): string | null => {
    const s = (text || '').toLowerCase().trim();
    if (!s) return null;
    const rules: Array<[RegExp, string]> = [
      [/(breakfast|فطور|إفطار|افطار|desayuno|petit\s*déjeuner|frühstück|صبحانه|早餐|завтрак)/i, 'breakfast'],
      [/(lunch|غداء|غدا|almuerzo|déjeuner|mittagessen|دوپہر\s*کا\s*کھانا|午餐|обед)/i, 'lunch'],
      [/(dinner|عشاء|عشا|cena|dîner|abendessen|رات\s*کا\s*کھانا|晚餐|ужин)/i, 'dinner'],
      [/(cafe|café|coffee|كافيه|قهوة|مقهى|cafetería|café|kaffee|قہوہ|咖啡馆|кафе|кофейня)/i, 'cafe'],
      [/(restaurant|مطعم|مطاعم|food|أكل|طعام|cuisine|بيتزا|برجر|سوشي|شاورما|كباب|pizza|burger|sushi|ramen|indian|italian|chinese|thai|mexican|arab|lebanese|turkish|seafood|steak|restaurante|comida|cocina|restaurant|essen|küche|مطعم|کھانا|餐厅|美食|ресторан|еда|кухня)/i, 'food'],
      [/(shop|mall|سوق|تسوق|أسواق|متجر|store|shopping|tienda|compras|centre\s*commercial|magasin|einkaufen|laden|خریداری|商场|购物|магазин|торговый\s*центр|шопинг)/i, 'shopping'],
      [/(museum|متحف|art|فن|gallery|معرض|cultural|ثقاف|تراث|heritage|museo|arte|cultura|musée|culturel|kunst|museum|kultur|میوزیم|ثقافت|博物馆|艺术|文化|музей|искусство|культура)/i, 'cultural'],
      [/(park|حديقة|نزهة|nature|طبيعة|جبل|بحيرة|شاطئ|beach|hike|hiking|جزيرة|island|garden|بستان|parque|naturaleza|playa|jardín|parc|nature|plage|garten|natur|strand|فطرت|ساحل|自然|海滩|公园|парк|природа|пляж|сад)/i, 'nature'],
      [/(show|عرض|theater|مسرح|cinema|سينما|concert|حفلة|entertainment|ترفيه|ملاهي|amusement|park\s*ride|ألعاب|nightlife|club|نادي\s*ليلي|espectáculo|cine|concierto|diversión|théâtre|cinéma|concert|unterhaltung|kino|konzert|تفریح|سنیما|娱乐|电影院|演出|шоу|театр|кино|концерт|развлечени)/i, 'entertainment'],
      [/(hotel|فندق|resort|منتجع|stay|إقامة|booking|hotel|hôtel|unterkunft|aufenthalt|ہوٹل|رہائش|酒店|住宿|отель|гостиница)/i, 'hotel'],
      [/(landmark|معلم|سياحي|attraction|tower|برج|قلعة|قصر|palace|monument|نصب|tourist|atracción|monumento|sitio\s*turístico|attraction|monument|sehenswürdigkeit|touristenattraktion|سیاحتی\s*مقام|地标|景点|достопримечательность|памятник|туристическ)/i, 'attraction'],
    ];
    for (const [re, cat] of rules) if (re.test(s)) return cat;
    return null;
  };

  const inferredCategory = inferCategoryFromPrompt(customPrompt);
  const currentCategory = form.type || form.category || 'attraction';
  const hasCategoryConflict = !!(inferredCategory && customPrompt.trim() && inferredCategory !== currentCategory);

  const switchCategoryToPrompt = () => {
    if (!inferredCategory) return;
    setForm(prev => ({ ...prev, type: inferredCategory, category: inferredCategory }));
    toast.success(isArabic
      ? `تم تحديث التصنيف إلى "${inferredCategory}" بناءً على وصفك`
      : `Category updated to "${inferredCategory}" based on your description`);
  };

  const handleSave = () => { onSave(form); onClose(); };
  
  const handleAutoGenerate = async () => {
    if (!onAutoGenerate) return;
    setGenerating(true);
    try {
      const effectiveCategory = customPrompt.trim() && inferredCategory ? inferredCategory : (form.type || form.category);
      const result = await onAutoGenerate({
        title: form.title || form.name,
        type: effectiveCategory,
        startTime: form.startTime || form.time || suggestedStartTime,
        description: form.description,
        customPrompt: customPrompt.trim() || undefined,
      });
      if (result) {
        const normalizedResult = normalizeActivityTimeRange(
          {
            ...result,
            startTime: String(result.startTime || result.time || '').trim() || String(form.startTime || form.time || '').trim() || suggestedStartTime || '',
            endTime: String(result.endTime || '').trim(),
          },
          parseActivityTime(String(form.startTime || form.time || '').trim() || suggestedStartTime || '', 9).hour,
        );
        setForm(prev => ({
          ...prev,
          ...normalizedResult,
          id: prev.id,
          startTime: normalizedResult.startTime,
          time: normalizedResult.time,
          endTime: normalizedResult.endTime,
        }));
      } else {
        toast.error(getFriendlyGenerationError('Auto-generation failed', isArabic));
      }
    } catch (error) {
      toast.error(getFriendlyGenerationError(error, isArabic));
    }
    setGenerating(false);
  };
  
  if (!activity) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            {isNew ? (
              <>
                <div className="bg-primary/10 p-2 rounded-xl"><Plus size={18} className="text-primary" /></div>
                {t('itinerary.addActivity', { defaultValue: 'Add New Activity' })}
              </>
            ) : (
              <>
                <div className="bg-primary/10 p-2 rounded-xl"><Edit3 size={18} className="text-primary" /></div>
                {t('itinerary.editActivity', { defaultValue: 'Edit Activity' })}
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Prompt-driven AI generation for new activities */}
          {isNew && onAutoGenerate && (
            <div className="space-y-2 p-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
              <Label className="text-sm font-medium flex items-center gap-1.5 text-primary">
                <Sparkles size={14} /> {t('itinerary.describeActivity', { defaultValue: 'Describe the activity you want (optional)' })}
              </Label>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={2}
                placeholder={t('itinerary.describeActivityPlaceholder', { defaultValue: 'e.g. A quiet Italian restaurant near the hotel, or an adventure for two' })}
                className="resize-none text-sm bg-background/50"
              />
              {suggestedStartTime && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={10} /> {t('itinerary.suggestedTime', { defaultValue: 'Suggested time:' })} <span className="font-semibold text-foreground">{suggestedStartTime}</span>
                </p>
              )}
              {hasCategoryConflict && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs">
                  <AlertCircle size={14} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <p className="text-foreground font-medium leading-snug">
                      {t('itinerary.categoryConflict', {
                        defaultValue: 'Your prompt looks like "{{inferred}}" but the selected category is "{{current}}". Switch category?',
                        inferred: inferredCategory,
                        current: currentCategory,
                      })}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={switchCategoryToPrompt}
                      className="h-7 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                    >
                      <Sparkles size={11} />
                      {t('itinerary.useCategory', { defaultValue: 'Use "{{category}}"', category: inferredCategory })}
                    </Button>
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                className="w-full gap-2 h-11 rounded-xl border-primary/30 bg-background text-primary hover:bg-primary hover:text-primary-foreground font-medium"
                onClick={handleAutoGenerate}
                disabled={generating}
              >
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {t('itinerary.generateWithAI', { defaultValue: 'Generate with AI' })}
              </Button>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('itinerary.activityName', { defaultValue: 'Name' })}</Label>
            <Input value={form.title || form.name || ''} onChange={(e) => setForm({ ...form, title: e.target.value, name: e.target.value })} placeholder={t('itinerary.activityNamePlaceholder', { defaultValue: 'e.g. Burj Khalifa Visit' })} className="h-11" />
          </div>

          {/* Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><Clock size={12} className="text-primary" /> {t('itinerary.startTime', { defaultValue: 'Start Time' })}</Label>
              <TimeSlotSelect
                value={form.startTime || form.time || ''}
                onChange={(v) => {
                  // When start changes, preserve duration if end exists; else default +2h
                  const startParts = parseActivityTime(v, 9);
                  const endRaw = String(form.endTime || '').trim();
                  const endParts = parseActivityTime(endRaw || undefined, NaN);
                  let durationMin = 120;
                  if (endRaw && Number.isFinite(endParts.hour)) {
                    const prevStart = parseActivityTime(form.startTime || form.time, NaN);
                    if (Number.isFinite(prevStart.hour)) {
                      let diff = (endParts.hour * 60 + endParts.minute) - (prevStart.hour * 60 + prevStart.minute);
                      if (diff <= 0) diff += 24 * 60;
                      if (diff > 0 && diff <= 12 * 60) durationMin = diff;
                    }
                  }
                  const total = startParts.hour * 60 + startParts.minute + durationMin;
                  const newEnd = formatDisplayTime(Math.floor(total / 60), total % 60);
                  setForm({ ...form, startTime: v, time: v, endTime: newEnd });
                }}
                placeholder="09:00 AM"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><Clock size={12} className="text-muted-foreground" /> {t('itinerary.endTime', { defaultValue: 'End Time' })}</Label>
              <TimeSlotSelect
                value={form.endTime || ''}
                onChange={(v) => setForm({ ...form, endTime: v })}
                placeholder="11:00 AM"
                minTime={form.startTime || form.time || ''}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><MapPin size={12} className="text-primary" /> {t('itinerary.address', { defaultValue: 'Address' })}</Label>
            <Input value={form.address || form.location || ''} onChange={(e) => setForm({ ...form, address: e.target.value, location: e.target.value })} placeholder={t('itinerary.addressPlaceholder', { defaultValue: 'e.g. Downtown Dubai' })} className="h-11" />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('itinerary.type', { defaultValue: 'Type' })}</Label>
            <Select value={form.type || form.category || 'attraction'} onValueChange={(v) => setForm({ ...form, type: v, category: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" className="z-[9999] max-h-[200px] overflow-y-auto" sideOffset={4}>
                <SelectItem value="attraction">🏛️ {t('itinerary.catAttraction', { defaultValue: 'Attraction' })}</SelectItem>
                <SelectItem value="food">🍽️ {t('itinerary.catFood', { defaultValue: 'Restaurant' })}</SelectItem>
                <SelectItem value="breakfast">☕ {t('itinerary.catBreakfast', { defaultValue: 'Breakfast' })}</SelectItem>
                <SelectItem value="lunch">🥗 {t('itinerary.catLunch', { defaultValue: 'Lunch' })}</SelectItem>
                <SelectItem value="dinner">🍲 {t('itinerary.catDinner', { defaultValue: 'Dinner' })}</SelectItem>
                <SelectItem value="shopping">🛍️ {t('itinerary.catShopping', { defaultValue: 'Shopping' })}</SelectItem>
                <SelectItem value="entertainment">🎭 {t('itinerary.catEntertainment', { defaultValue: 'Entertainment' })}</SelectItem>
                <SelectItem value="cultural">🎨 {t('itinerary.catCultural', { defaultValue: 'Cultural' })}</SelectItem>
                <SelectItem value="nature">🌿 {t('itinerary.catNature', { defaultValue: 'Nature' })}</SelectItem>
                <SelectItem value="cafe">☕ {t('itinerary.catCafe', { defaultValue: 'Cafe' })}</SelectItem>
                <SelectItem value="hotel">🏨 {t('itinerary.catHotel', { defaultValue: 'Hotel' })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cost & Rating */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><DollarSign size={12} className="text-primary" /> {t('itinerary.cost', { defaultValue: 'Cost ($)' })}</Label>
              <Input type="number" value={form.cost || 0} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><Star size={12} className="text-yellow-500" /> {t('itinerary.rating', { defaultValue: 'Rating' })}</Label>
              <Input type="number" step="0.1" min="1" max="5" value={form.rating || ''} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} className="h-11" />
            </div>
          </div>

          {/* Phone & Website */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><Phone size={12} className="text-primary" /> {t('itinerary.phone', { defaultValue: 'Phone' })}</Label>
              <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1"><Globe size={12} className="text-primary" /> {t('itinerary.websiteUrl', { defaultValue: 'Website' })}</Label>
              <Input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="h-11" />
            </div>
          </div>

          {/* Opening Hours */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('itinerary.openingHours', { defaultValue: 'Opening Hours' })}</Label>
            <Input value={form.openingHours || ''} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} placeholder="09:00 AM - 10:00 PM" className="h-11" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t('itinerary.description', { defaultValue: 'Description' })}</Label>
            <Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="resize-none" />
          </div>

          {/* Card Color */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('itinerary.cardColor', { defaultValue: 'Card Color' })}</Label>
            <div className="flex gap-2.5">
              {CARD_COLORS.map(c => (
                <button key={c.value} type="button" onClick={() => setForm({ ...form, cardColor: c.value })}
                  className={cn("w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm transition-all", 
                    form.cardColor === c.value ? "border-primary ring-2 ring-primary/30 scale-110" : "border-border hover:scale-105"
                  )}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button onClick={handleSave} className="rounded-xl gap-1.5">
            {isNew ? <Plus size={14} /> : <Check size={14} />}
            {isNew ? t('itinerary.addActivity', { defaultValue: 'Add Activity' }) : t('common.save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Move Activity Modal
const MoveActivityModal = ({ 
  isOpen, onClose, onMove, currentDay, totalDays
}: { 
  isOpen: boolean; onClose: () => void; onMove: (toDay: number) => void; currentDay: number; totalDays: number;
}) => {
  const { t } = useTranslation();
  const [selectedDay, setSelectedDay] = useState<number>(currentDay);
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('itinerary.moveToDay', { defaultValue: 'Move Activity to Another Day' })}</DialogTitle></DialogHeader>
        <div className="py-4">
          <Label>{t('itinerary.selectDay', { defaultValue: 'Select Day' })}</Label>
          <Select value={String(selectedDay)} onValueChange={(v) => setSelectedDay(Number(v))}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: totalDays }, (_, i) => (
                <SelectItem key={i} value={String(i)} disabled={i === currentDay}>
                  {t('itinerary.day', { defaultValue: 'Day' })} {i + 1} {i === currentDay && `(${t('itinerary.current', { defaultValue: 'Current' })})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button onClick={() => { onMove(selectedDay); onClose(); }} disabled={selectedDay === currentDay}>{t('itinerary.moveActivity', { defaultValue: 'Move Activity' })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Activity Card
const ActivityCard = ({ 
  activity, index, onMapClick, date, onEdit, onDelete, onMove, onToggleComplete, onChangeColor, isEditing, dayIndex, totalDays, destination, regenButton
}: { 
  activity: Activity; index: number; onMapClick?: (url: string) => void; date: Date;
  onEdit?: (activity: Activity) => void; onDelete?: (activityId: string) => void;
  onMove?: (activityId: string) => void; onToggleComplete?: (activityId: string) => void;
  onChangeColor?: (activityId: string, color: string) => void;
  isEditing?: boolean; dayIndex?: number; totalDays?: number; destination?: string;
  regenButton?: React.ReactNode;
}) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const localizedCopy = getLocalizedActivityCopy(activity, i18n.language);
  const localizedName = getLocalizedActivityName(activity, i18n.language);
  const inferredMatchInfo = inferMatchInfoFromActivity(activity);
  // Heal missing/white flags on already-saved trips by re-resolving from team names
  // using the centralized TEAM_FLAGS registry.
  const rawTeams = activity.matchTeams || inferredMatchInfo.teams;
  const effectiveTeams = rawTeams
    ? {
        a: rawTeams.a,
        b: rawTeams.b,
        flagA: isMissingFlag(rawTeams.flagA) ? lookupTeamFlag(rawTeams.a) : rawTeams.flagA,
        flagB: isMissingFlag(rawTeams.flagB) ? lookupTeamFlag(rawTeams.b) : rawTeams.flagB,
      }
    : undefined;
  const effectiveVenue = activity.matchVenue || inferredMatchInfo.venue;
  const effectiveKickoff = activity.matchKickoff || inferredMatchInfo.kickoff || activity.time;
  const isMatchCard = !!effectiveTeams && (activity.isMatchAnchor || isLikelyMatchActivity(activity));
  const matchDateLabel = format(date, "EEE • d MMM", { locale: i18n.language?.startsWith('ar') ? ar : i18n.language?.startsWith('zh') ? zhCN : i18n.language?.startsWith('ru') ? ru : enUS }).toUpperCase();
  const locationLabel = getLocationLabel(activity);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [activityPhotos, setActivityPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTouchOpenRef = useRef(0);

  // Load saved media from DB
  useEffect(() => {
    const loadSavedMedia = async () => {
      const { data } = await supabase
        .from('activity_media')
        .select('media_url')
        .eq('activity_id', activity.id);
      if (data && data.length > 0) {
        setActivityPhotos(data.map((d: any) => d.media_url));
      }
    };
    loadSavedMedia();
  }, [activity.id]);
  const cat = getCategoryStyle(activity.type || activity.category || 'attraction');
  const imageUrl = getPlaceImage(activity, destination);
  const reviews = generateSampleReviews(activity);
  const tips = localizedCopy.tip ? [localizedCopy.tip] : [];
  const resolvedPlace = getResolvedPlace(activity);
  const mapUrl = resolvedPlace.mapUrl;
  const mapLinkReason = getMapLinkReason(activity, resolvedPlace);
  const mapQuery = resolvedPlace.mapQuery || locationLabel || localizedName;
  const hasMapPreview = mapUrl && mapUrl !== '#' && (
    (Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude) && activity.latitude !== 0 && activity.longitude !== 0)
    || Boolean(mapQuery)
  );
  const previewSrc = (Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude) && activity.latitude !== 0 && activity.longitude !== 0)
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${activity.longitude!-0.006},${activity.latitude!-0.006},${activity.longitude!+0.006},${activity.latitude!+0.006}&layer=mapnik&marker=${activity.latitude},${activity.longitude}`
    : mapQuery
      ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`
      : '';
  const isCompleted = activity.completed;

  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(target.closest("button, a, input, textarea, select, [role='button'], [data-no-card-open='true']"));

  const handleCardOpen = (event: React.MouseEvent | React.TouchEvent) => {
    if (isEditing || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();

    if ("type" in event && event.type === "touchend") {
      lastTouchOpenRef.current = Date.now();
      setShowDetails(true);
      return;
    }

    if (Date.now() - lastTouchOpenRef.current < 450) return;
    setShowDetails(true);
  };

  // Check if already favorited
  useEffect(() => {
    if (!user) return;
    supabase.from("favorites").select("id").eq("user_id", user.id).eq("place_name", activity.title || activity.name || "").maybeSingle()
      .then(({ data }) => { if (data) setIsFavorited(true); });
  }, [user, activity.title, activity.name]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { toast.info(t("auth.signInToSave", { defaultValue: "Sign in to save favorites" })); return; }
    setFavLoading(true);
    const placeName = activity.title || activity.name || "";
    if (isFavorited) {
      await supabase.from("favorites").delete().eq("user_id", user.id).eq("place_name", placeName);
      setIsFavorited(false);
      toast.success(t("profile.favoriteRemoved", { defaultValue: "Removed from favorites" }));
    } else {
      await supabase.from("favorites").insert([{
        user_id: user.id,
        place_name: placeName,
        place_type: activity.type || activity.category || "attraction",
        destination: destination || "",
        image_url: activity.imageUrl || "",
        metadata: { address: activity.address, rating: activity.rating, cost: activity.cost } as any,
      }]);
      setIsFavorited(true);
      toast.success(t("profile.favoriteAdded", { defaultValue: "Added to favorites!" }));
    }
    setFavLoading(false);
  };

  return (
    <Reorder.Item
      value={activity}
      id={activity.id}
      className="list-none max-w-full overflow-hidden"
      dragListener={isEditing}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
       <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.97 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, delay: index * 0.06, type: "spring", stiffness: 120 }} 
        whileHover={{ y: -2 }}
        className="group max-w-full overflow-hidden">
        <div className="flex gap-2 sm:gap-4 max-w-full overflow-hidden">
          {/* Timeline */}
          <div className="flex flex-col items-center pt-1">
            {isEditing && (
              <motion.div whileTap={{ scale: 0.9 }} className="cursor-grab active:cursor-grabbing p-1 mb-1 rounded bg-muted hover:bg-muted/80">
                <GripVertical size={14} className="text-muted-foreground" />
              </motion.div>
            )}
            <motion.div 
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className={cn("w-8 h-8 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-sm sm:text-base shadow-md relative border-2 border-background", cat.bg, isCompleted && "opacity-60")}>
              {cat.icon}
              {isCompleted && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 shadow-sm">
                  <Check size={8} className="text-white" />
                </motion.div>
              )}
            </motion.div>
            {index < 20 && <div className="w-0.5 flex-1 bg-gradient-to-b from-border to-transparent mt-1.5 min-h-[16px]" />}
          </div>

          {/* Content */}
          <motion.div 
            className={cn(
              "flex-1 min-w-0 max-w-full bg-card border rounded-xl mb-2.5 transition-all duration-300 overflow-hidden shadow-sm",
              "hover:shadow-md hover:border-primary/30", cat.border,
              getCardColorClass(activity.cardColor),
              isCompleted && "opacity-70",
              !isEditing && "cursor-pointer active:scale-[0.98] touch-manipulation"
            )} 
            onClick={handleCardOpen}
            onTouchEnd={handleCardOpen}>
            
            {/* Place Image / Match Banner */}
              <div className={cn("relative overflow-hidden bg-muted", isMatchCard ? "min-h-[170px] sm:min-h-[200px]" : "h-24 sm:h-36")}>
              {isMatchCard && effectiveTeams ? (
                <div
                  data-match-banner={activity.id}
                  className="relative h-full min-h-[170px] sm:min-h-[200px] bg-gradient-to-br from-card via-card to-card/70"
                >
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/30 via-primary/70 to-primary/30" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-primary/10" />
                  <div className="relative p-3 sm:p-4 pt-4 sm:pt-5 h-full flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap pr-11">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                          <Calendar size={11} className="text-primary" />
                          <span className="text-[11px] font-bold text-primary tracking-wide">{matchDateLabel}</span>
                        </div>
                        {effectiveKickoff && (
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-background/80 border border-border">
                            <Clock size={10} className="text-muted-foreground" />
                            <span className="text-[11px] font-bold text-foreground whitespace-nowrap tabular-nums">
                              {String(effectiveKickoff).replace(/\s*UTC.*/i, "")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                        {effectiveTeams.flagA && <span className="text-4xl sm:text-5xl leading-none drop-shadow-sm">{effectiveTeams.flagA}</span>}
                        <span className="text-lg sm:text-xl font-bold text-foreground w-full leading-tight break-words">{effectiveTeams.a}</span>
                      </div>
                      <div className="shrink-0 flex flex-col items-center gap-1 px-1 sm:px-2">
                        <span className="text-xs sm:text-sm uppercase tracking-widest text-muted-foreground font-bold">vs</span>
                        <div className="w-8 sm:w-10 h-px bg-border" />
                      </div>
                      <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                        {effectiveTeams.flagB && <span className="text-4xl sm:text-5xl leading-none drop-shadow-sm">{effectiveTeams.flagB}</span>}
                        <span className="text-lg sm:text-xl font-bold text-foreground w-full leading-tight break-words">{effectiveTeams.b}</span>
                      </div>
                    </div>

                    {effectiveVenue && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-background/75 border border-border/60 backdrop-blur-sm">
                        <MapPin size={12} className="text-primary shrink-0" />
                        <span className="text-[11px] sm:text-xs text-foreground/85 font-medium truncate">{effectiveVenue}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <motion.img 
                    src={imageUrl} alt={localizedName} 
                    loading="lazy" decoding="async"
                    className="w-full h-full object-cover"
                    style={{ imageRendering: 'auto' }}
                    whileHover={{ scale: 1.08 }}
                    transition={{ duration: 0.6 }}
                    onError={(e) => { (e.target as HTMLImageElement).src = getPlaceImage({ ...activity, imageUrl: '/placeholder.svg' }, destination); }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                </>
              )}
              
              {/* Favorite button */}
              <button
                onClick={(e) => toggleFavorite(e)}
                disabled={favLoading}
                className="absolute top-2.5 right-2.5 z-10 p-2 rounded-full bg-black/30 backdrop-blur-md hover:bg-black/50 transition-all hover:scale-110"
              >
                <Heart size={16} className={cn("transition-colors", isFavorited ? "fill-red-500 text-red-500" : "text-white")} />
              </button>
              
              {isCompleted && (
                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 size={48} className="text-white/80" />
                </div>
              )}
              
              {/* Bottom overlay with time, rating, price */}
              {!isMatchCard && <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3">
                <div className="flex items-end justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                        <span dir="ltr" className="text-[11px] sm:text-xs font-bold text-white bg-primary/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm" style={{ unicodeBidi: 'isolate' }}>
                      <Clock size={10} className="inline mr-1" />{activity.startTime || activity.time}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {activity.rating && (
                        <div className="flex items-center gap-0.5 bg-amber-500/90 backdrop-blur-sm text-white rounded-full px-2 py-1 shadow-sm">
                        <Star size={11} className="fill-white" />
                        <span className="text-xs font-bold">{activity.rating}</span>
                      </div>
                    )}
                    {activity.cost !== undefined && activity.cost > 0 && (
                      <span className="text-xs font-bold text-white bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">~${Number(activity.cost).toFixed(0)}</span>
                    )}
                    {activity.cost === 0 && (
                      <span className="text-xs font-bold text-white bg-emerald-500/90 backdrop-blur-sm px-2 py-1 rounded-full">{t('itinerary.free', { defaultValue: 'Free' })}</span>
                    )}
                  </div>
                </div>
              </div>}
            </div>

            <div className="p-3 sm:p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                     <Badge variant="outline" className={cn("text-[10px] h-5 font-semibold", cat.bg, cat.text, cat.border)}>
                       {(() => {
                         const catKey = (activity.type || activity.category || 'attraction').toLowerCase();
                         const catLabels: Record<string, { ar: string; en: string }> = {
                           breakfast: { ar: 'فطور', en: 'Breakfast' }, lunch: { ar: 'غداء', en: 'Lunch' }, dinner: { ar: 'عشاء', en: 'Dinner' }, snack: { ar: 'وجبة خفيفة', en: 'Snack' },
                           food: { ar: 'مطعم', en: 'Restaurant' }, restaurant: { ar: 'مطعم', en: 'Restaurant' }, cafe: { ar: 'مقهى', en: 'Cafe' }, attraction: { ar: 'معلم سياحي', en: 'Attraction' },
                           cultural: { ar: 'ثقافي', en: 'Cultural' }, nature: { ar: 'طبيعة', en: 'Nature' }, shopping: { ar: 'تسوق', en: 'Shopping' }, entertainment: { ar: 'ترفيه', en: 'Entertainment' },
                           activity: { ar: 'نشاط', en: 'Activity' }, museum: { ar: 'متحف', en: 'Museum' }, hotel: { ar: 'فندق', en: 'Hotel' }, transport: { ar: 'مواصلات', en: 'Transport' },
                           relaxation: { ar: 'استرخاء', en: 'Relaxation' }, art: { ar: 'فن', en: 'Art' }, beach: { ar: 'شاطئ', en: 'Beach' },
                           flight_arrival: { ar: '✈️ رحلة وصول', en: '✈️ Arrival' }, flight_departure: { ar: '✈️ رحلة مغادرة', en: '✈️ Departure' },
                           airport_transfer: { ar: '🛬 نقل المطار', en: '🛬 Transfer' }, hotel_checkin: { ar: '🏨 تسجيل دخول', en: '🏨 Check-in' },
                           hotel_checkout: { ar: '🏨 مغادرة', en: '🏨 Check-out' }, car_pickup: { ar: '🚗 استلام سيارة', en: '🚗 Car Pickup' }, car_return: { ar: '🚗 تسليم سيارة', en: '🚗 Car Return' },
                         };
                         const label = catLabels[catKey];
                         return label ? (isArabic ? label.ar : label.en) : catKey.charAt(0).toUpperCase() + catKey.slice(1);
                       })()}
                     </Badge>
                    {isCompleted && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px] h-5">
                        <Check size={10} className="mr-0.5" /> {t('itinerary.completed', { defaultValue: 'Done' })}
                      </Badge>
                    )}
                    {activity.bookingStatus === "booked" && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-200 text-[10px] h-5">✅ {isArabic ? "مؤكد" : "Confirmed"}</Badge>
                    )}
                    {activity.bookingStatus === "selected" && (
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px] h-5">⏳ {isArabic ? "غير مؤكد" : "Pending"}</Badge>
                    )}
                    {activity.isMatchAnchor && (
                      <Badge className="bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 text-[10px] h-5 shadow-md">
                        ⚽ {isArabic ? "مباراة من جدولك" : "Match Anchor"}
                      </Badge>
                    )}
                    {activity.matchReason && !activity.isMatchAnchor && (
                      <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 text-[9px] h-auto py-0.5 px-1.5 max-w-[140px] sm:max-w-[200px] md:max-w-[280px] whitespace-normal leading-tight break-words">
                        ✨ {localizedCopy.description.length > 40 ? localizedCopy.description.slice(0, 40) + '…' : localizedCopy.description}
                      </Badge>
                    )}
                    {activity.aiEnhanced && (
                      <Badge
                        title={activity.aiSourceQuery ? `${getAiAnalyzedLabel(i18n.language)} → "${activity.aiSourceQuery}"` : getAiAnalyzedLabel(i18n.language)}
                        className="bg-gradient-to-r from-indigo-500/15 via-purple-500/15 to-pink-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-300/60 dark:border-indigo-500/40 text-[9px] h-auto py-0.5 px-1.5 font-semibold whitespace-nowrap shadow-sm"
                      >
                        🧠 {getAiAnalyzedLabel(i18n.language)}
                      </Badge>
                    )}
                  </div>
                    {!isMatchCard && (
                      <h3 className={cn("font-bold text-[13px] sm:text-base leading-tight line-clamp-2", isCompleted && "line-through text-muted-foreground")}>
                        {getLocalizedActivityName(activity, i18n.language)}
                      </h3>
                    )}
                   <div className="flex flex-col gap-1 mt-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
                       <MapPin size={12} className="shrink-0 text-primary/70" />
                        <span className="truncate">{locationLabel}</span>
                     </p>
                       {(() => {
                        const _formatted = getUnifiedOpeningHours(activity, i18n.language || 'en');
                        const _openState = (activity as any).openState || (activity as any).open_state || '';
                        const _displayText = _formatted
                          || (typeof _openState === 'string' && _openState.trim() ? _openState.trim() : '')
                          || (isArabic ? 'ساعات العمل غير متوفرة' : 'Hours unavailable');
                        return (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0 flex-wrap">
                            <Clock size={12} className="shrink-0 text-primary/70" />
                            <span className="truncate">{_displayText}</span>
                          </p>
                        );
                      })()}
                     {activity.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
                         <Phone size={12} className="shrink-0 text-primary/70" />
                          <a href={`tel:${activity.phone}`} className="hover:text-primary transition-colors truncate" onClick={e => e.stopPropagation()}>{activity.phone}</a>
                       </p>
                     )}
                   </div>
                 </div>
                 {regenButton}
                </div>

               {!isMatchCard && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{localizedCopy.description}</p>}

              {/* Booking action link */}
              {activity.bookingLink && activity.bookingStatus === "selected" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs w-full border-primary/30 text-primary hover:bg-primary/5"
                  onClick={(e) => { e.stopPropagation(); window.open(activity.bookingLink, '_blank'); }}
                >
                  <ExternalLink size={12} /> {isArabic ? "أكمل الحجز الآن" : "Complete Booking Now"}
                </Button>
              )}

              {tips[0] && (
                <div className="flex items-start gap-1.5 mt-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                  <Lightbulb size={12} className="text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">{tips[0]}</span>
                </div>
              )}

              {/* Actions */}
               <div className="flex items-start gap-1.5 mt-3 pt-2 border-t border-border/50 flex-wrap max-w-full">
                {getUnifiedOpeningHours(activity, i18n.language || 'en') && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0 basis-full sm:basis-auto sm:mr-auto">
                    <Clock size={10} /> {getUnifiedOpeningHours(activity, i18n.language || 'en')}
                  </span>
                )}
                {!getUnifiedOpeningHours(activity, i18n.language || 'en') && <div className="flex-1" />}
                
                {isEditing ? (
                  <div className="flex flex-wrap gap-1 flex-shrink min-w-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onToggleComplete?.(activity.id); }}>
                      <CheckCircle2 size={14} className={isCompleted ? "text-green-600" : "text-muted-foreground"} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onEdit?.(activity); }}>
                      <Edit3 size={14} className="text-blue-600" />
                    </Button>
                    {totalDays && totalDays > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onMove?.(activity.id); }}>
                        <ArrowLeftRight size={14} className="text-purple-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onDelete?.(activity.id); }}>
                      <Trash2 size={14} className="text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-0.5 flex-shrink min-w-0 max-w-full">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onToggleComplete?.(activity.id); }} title={t('itinerary.markComplete', { defaultValue: 'Mark as Complete' })}>
                      <CheckCircle2 size={14} className={isCompleted ? "text-green-600" : "text-muted-foreground"} />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setShowQR(true); }} title={t('itinerary.qrCodes', { defaultValue: 'QR Codes' })}>
                      <QrCode size={14} className="text-primary" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setShowCamera(true); }} title={t('itinerary.addPhoto', { defaultValue: 'Add Photo/Video' })}>
                      <CameraIcon size={14} className="text-accent" />
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      for (const file of files) {
                        if (user) {
                          setIsUploading(true);
                          try {
                            const ext = file.type.includes('video') ? 'webm' : 'jpg';
                            const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                            const { error: upErr } = await supabase.storage.from('story-media').upload(path, file);
                            if (upErr) throw upErr;
                            const { data: urlData } = supabase.storage.from('story-media').getPublicUrl(path);
                            const publicUrl = urlData.publicUrl;
                            await supabase.from('activity_media').insert({
                              user_id: user.id,
                              trip_id: destination || 'unknown',
                              day_index: dayIndex || 0,
                              activity_id: activity.id,
                              activity_name: activity.title || activity.name || '',
                              location_name: activity.location || activity.address || '',
                              media_url: publicUrl,
                              media_type: file.type.includes('video') ? 'video' : 'image',
                            });
                            setActivityPhotos(prev => [...prev, publicUrl]);
                          } catch (err) { console.error(err); toast.error(isArabic ? 'فشل الرفع' : 'Upload failed'); }
                          setIsUploading(false);
                        } else {
                          const url = URL.createObjectURL(file);
                          setActivityPhotos(prev => [...prev, url]);
                        }
                      }
                      if (files.length > 0) {
                        toast.success(isArabic ? `تم رفع ${files.length} ملف! 📸` : `${files.length} file(s) uploaded! 📸`);
                        if (!user) toast.info(isArabic ? 'سجّل الدخول لحفظ الصور بشكل دائم' : 'Sign in to save photos permanently');
                      }
                    }} />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} title={t('itinerary.uploadPhoto', { defaultValue: 'Upload' })}>
                      <Upload size={14} className="text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] sm:text-xs px-2 text-primary max-w-full" onClick={(e) => { e.stopPropagation(); navigate(`/place/${activity.id}`); }}>
                      {t('itinerary.details', { defaultValue: 'Details' })}
                    </Button>
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] sm:text-xs px-2 text-primary max-w-full" onClick={(e) => { e.stopPropagation(); window.open(mapUrl, '_blank'); }}>
                            <Navigation size={12} className="mr-1" /> {t('itinerary.maps', { defaultValue: 'Maps' })}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px] text-xs">
                          {isArabic ? 'سبب رابط الخرائط' : 'Maps link source'}: {mapLinkReason}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>

              {/* Activity media gallery with full controls */}
              {activityPhotos.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <ImageIcon size={10} /> {activityPhotos.length} {isArabic ? 'وسائط' : 'media'}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-primary" onClick={(e) => { e.stopPropagation(); setShowCamera(true); }}>
                        <CameraIcon size={9} className="mr-0.5" /> {isArabic ? 'إضافة' : 'Add'}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 text-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        <Upload size={9} className="mr-0.5" /> {isArabic ? 'رفع' : 'Upload'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {activityPhotos.map((photo, pi) => {
                      const isVideo = photo.includes('video') || photo.includes('.webm') || photo.includes('.mp4');
                      return (
                        <div key={pi} className="shrink-0 relative group">
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-border cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); window.open(photo, '_blank'); }}>
                            {isVideo ? (
                              <video src={photo} className="w-full h-full object-cover" />
                            ) : (
                              <img src={photo} alt="" className="w-full h-full object-cover" />
                            )}
                            {isVideo && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                <div className="w-5 h-5 rounded-full bg-white/80 flex items-center justify-center">
                                  <span className="text-[8px] ml-0.5">▶</span>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Delete & Replace buttons on hover */}
                          <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                            {/* Replace */}
                            <button
                              className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center shadow-sm"
                              title={isArabic ? 'استبدال' : 'Replace'}
                              onClick={async (e) => {
                                e.stopPropagation();
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*,video/*';
                                input.onchange = async () => {
                                  const file = input.files?.[0];
                                  if (!file) return;
                                  if (user) {
                                    try {
                                      // Delete old from DB
                                      await supabase.from('activity_media').delete().eq('media_url', photo).eq('user_id', user.id);
                                      // Upload new
                                      const ext = file.type.includes('video') ? 'webm' : 'jpg';
                                      const path = `${user.id}/${Date.now()}.${ext}`;
                                      await supabase.storage.from('story-media').upload(path, file);
                                      const { data: urlData } = supabase.storage.from('story-media').getPublicUrl(path);
                                      const newUrl = urlData.publicUrl;
                                      await supabase.from('activity_media').insert({
                                        user_id: user.id, trip_id: destination || 'unknown', day_index: dayIndex || 0,
                                        activity_id: activity.id, activity_name: activity.title || activity.name || '',
                                        location_name: activity.location || activity.address || '', media_url: newUrl,
                                        media_type: file.type.includes('video') ? 'video' : 'image',
                                      });
                                      setActivityPhotos(prev => prev.map((p, i) => i === pi ? newUrl : p));
                                      toast.success(isArabic ? 'تم الاستبدال ✅' : 'Replaced ✅');
                                    } catch (err) { console.error(err); }
                                  } else {
                                    const url = URL.createObjectURL(file);
                                    setActivityPhotos(prev => prev.map((p, i) => i === pi ? url : p));
                                  }
                                };
                                input.click();
                              }}>
                              <Edit3 size={8} className="text-white" />
                            </button>
                            {/* Delete */}
                            <button
                              className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shadow-sm"
                              title={isArabic ? 'حذف' : 'Delete'}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (user && photo.startsWith('http')) {
                                  await supabase.from('activity_media').delete().eq('media_url', photo).eq('user_id', user.id);
                                }
                                setActivityPhotos(prev => prev.filter((_, i) => i !== pi));
                                toast.success(isArabic ? 'تم الحذف' : 'Deleted');
                              }}>
                              <X size={8} className="text-white" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick location & share actions under photos */}
              {activityPhotos.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); window.open(mapUrl, '_blank'); }}>
                    <MapPin size={10} /> {isArabic ? 'الموقع' : 'Location'}
                  </Button>
                  {activity.phone && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); window.open(`tel:${activity.phone}`, '_self'); }}>
                      <Phone size={10} /> {isArabic ? 'اتصل' : 'Call'}
                    </Button>
                  )}
                  {activity.website && (
                    <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); window.open(activity.website!, '_blank'); }}>
                      <Globe size={10} /> {isArabic ? 'الموقع الإلكتروني' : 'Website'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      const nearbyUrl = `https://www.google.com/maps/search/nearby+${encodeURIComponent(activity.title || activity.name || '')}+${encodeURIComponent(activity.address || '')}`;
                      window.open(nearbyUrl, '_blank');
                    }}>
                    <Navigation size={10} /> {isArabic ? 'أماكن قريبة' : 'Nearby'}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Publish as story button - always visible when there are photos */}
      {activityPhotos.length > 0 && (
        <div className="mt-1 ml-11 sm:ml-14 flex flex-wrap gap-1 max-w-full">
          <Button variant="outline" size="sm" className="h-7 text-[10px] sm:text-[11px] px-2.5 sm:px-3 gap-1.5 rounded-full border-accent/40 text-accent hover:bg-accent/10 max-w-full"
            onClick={async (e) => {
              e.stopPropagation();
              if (!user) { toast.error(isArabic ? 'سجّل الدخول أولاً' : 'Login required'); navigate('/auth'); return; }
              try {
                const actName = activity.title || activity.name || '';
                const { error } = await supabase.from('travel_stories').insert({
                  user_id: user.id,
                  title: `${actName} - ${destination || ''}`.trim(),
                  content: activity.description || actName,
                  location_name: activity.location || activity.address || destination || '',
                  media_urls: activityPhotos.filter(u => u.startsWith('http')),
                  latitude: activity.latitude,
                  longitude: activity.longitude,
                  trip_data: { category: activity.type || activity.category || 'attraction', hashtags: [destination?.toLowerCase(), (activity.type || 'travel')].filter(Boolean) },
                });
                if (error) throw error;
                toast.success(isArabic ? 'تم نشر القصة بنجاح! ✨' : 'Story published! ✨');
              } catch (err) { toast.error(isArabic ? 'فشل النشر' : 'Failed to publish'); console.error(err); }
            }}>
            <Share2 size={12} /> {isArabic ? 'نشر كقصة' : 'Publish as Story'}
          </Button>
        </div>
      )}

      {/* Camera overlay for this activity */}
      <AnimatePresence>
        {showCamera && (
          <CameraCapture
            onCapture={async (file) => {
              setShowCamera(false);
              if (user) {
                setIsUploading(true);
                try {
                  const ext = file.type.includes('video') ? 'webm' : 'jpg';
                  const path = `${user.id}/${Date.now()}.${ext}`;
                  await supabase.storage.from('story-media').upload(path, file);
                  const { data: urlData } = supabase.storage.from('story-media').getPublicUrl(path);
                  const publicUrl = urlData.publicUrl;
                  await supabase.from('activity_media').insert({
                    user_id: user.id,
                    trip_id: destination || 'unknown',
                    day_index: dayIndex || 0,
                    activity_id: activity.id,
                    activity_name: activity.title || activity.name || '',
                    location_name: locationLabel,
                    media_url: publicUrl,
                    media_type: file.type.includes('video') ? 'video' : 'image',
                  });
                  setActivityPhotos(prev => [...prev, publicUrl]);
                  toast.success(isArabic ? 'تم حفظ الصورة! 📸' : 'Photo saved! 📸');
                } catch (err) { console.error('Failed to save media:', err); toast.error(isArabic ? 'فشل الحفظ' : 'Save failed'); }
                setIsUploading(false);
              } else {
                const localUrl = URL.createObjectURL(file);
                setActivityPhotos(prev => [...prev, localUrl]);
                toast.info(isArabic ? 'سجّل الدخول لحفظ الصور' : 'Sign in to save photos');
              }
            }}
            onClose={() => setShowCamera(false)}
          />
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="z-[80] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[90dvh] overflow-y-auto p-0 sm:max-w-lg sm:max-h-[90vh] rounded-xl [&>button.absolute]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">{localizedName}</DialogTitle>
          <div className="relative h-44 sm:h-56 overflow-hidden rounded-t-lg">
            <img src={imageUrl} alt={localizedName} className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = getPlaceImage({ ...activity, imageUrl: '/placeholder.svg' }, destination); }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute top-3 left-3 h-8 w-8 rounded-full bg-black/45 text-white hover:bg-black/65 z-10"
              onClick={() => setShowDetails(false)}
            >
              <X size={14} />
            </Button>
            <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4">
              <h2 className="text-lg sm:text-xl font-bold text-white leading-tight line-clamp-2">{localizedName}</h2>
              <div className="flex items-center gap-1.5 mt-1.5 text-white/80 text-xs sm:text-sm">
                <MapPin size={12} className="shrink-0" /><span className="truncate">{locationLabel}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {activity.rating && (
                  <div className="flex items-center bg-yellow-500/90 rounded-full px-2 py-0.5">
                    <Star size={12} className="text-white fill-white mr-0.5" />
                    <span className="font-bold text-white text-xs">{activity.rating}</span>
                  </div>
                )}
                {activity.cost !== undefined && (
                  <div className="bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-white text-xs font-semibold">
                    {activity.cost === 0 ? t('itinerary.free', { defaultValue: 'Free' }) : `$${activity.cost}`}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            {(() => {
              const inferred = inferMatchInfoFromActivity(activity);
              const rawT = activity.matchTeams || inferred.teams;
              const teams = rawT
                ? {
                    a: rawT.a,
                    b: rawT.b,
                    flagA: isMissingFlag(rawT.flagA) ? lookupTeamFlag(rawT.a) : rawT.flagA,
                    flagB: isMissingFlag(rawT.flagB) ? lookupTeamFlag(rawT.b) : rawT.flagB,
                  }
                : undefined;
              const venue = activity.matchVenue || inferred.venue;
              const kickoff = activity.matchKickoff || inferred.kickoff || activity.startTime || activity.time;
              const show = !!teams && (activity.isMatchAnchor || isLikelyMatchActivity(activity));
              if (!show || !teams) return null;
              return (
                <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-card to-card/60 shadow-md p-4 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary/30 via-primary/70 to-primary/30" />
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 text-[10px] h-5">
                      ⚽ {isArabic ? "مباراة" : "Match"}
                    </Badge>
                    {kickoff && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/80 border border-border">
                        <Clock size={10} className="text-muted-foreground" />
                        <span className="text-[11px] font-bold text-foreground tabular-nums">{String(kickoff).replace(/\s*UTC.*/i, "")}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                      {teams.flagA && <span className="text-3xl leading-none drop-shadow-sm">{teams.flagA}</span>}
                      <span className="text-sm font-bold text-foreground w-full leading-tight break-words">{teams.a}</span>
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-0.5 px-2">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">vs</span>
                      <div className="w-6 h-px bg-border mt-0.5" />
                    </div>
                    <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                      {teams.flagB && <span className="text-3xl leading-none drop-shadow-sm">{teams.flagB}</span>}
                      <span className="text-sm font-bold text-foreground w-full leading-tight break-words">{teams.b}</span>
                    </div>
                  </div>
                  {venue && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/50">
                      <MapPin size={12} className="text-primary shrink-0" />
                      <span className="text-[11px] text-foreground/80 font-medium truncate">{venue}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            <p className="text-muted-foreground text-sm leading-relaxed">{localizedCopy.description}</p>
            
            {/* Website & Booking links */}
            {activity.website && (
              <a href={activity.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary hover:bg-primary/10 transition-colors">
                <Globe size={16} /> 
                <span className="flex-1 font-medium">{isArabic ? 'الموقع الرسمي / حجز التذاكر' : 'Official Website / Book Tickets'}</span>
                <ExternalLink size={14} />
              </a>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 rounded-xl p-2.5 sm:p-3">
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mb-0.5"><Clock size={11} /> {t('itinerary.openingHours', { defaultValue: 'Opening Hours' })}</div>
                <p dir="ltr" className="text-xs sm:text-sm font-medium text-foreground text-left rtl:text-right" style={{ unicodeBidi: 'isolate' }}>
                  {(() => {
                    const _f = getUnifiedOpeningHours(activity, i18n.language || 'en');
                    const _openState = (activity as any).openState || (activity as any).open_state || '';
                    return _f
                      || (typeof _openState === 'string' && _openState.trim() ? _openState.trim() : '')
                      || (isArabic ? 'ساعات العمل غير متوفرة' : 'Hours unavailable');
                  })()}
                </p>
              </div>
              {(activity.startTime || activity.time) && (
                <div className="bg-muted/50 rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mb-0.5"><Calendar size={11} /> {t('itinerary.visitTime', { defaultValue: 'Visit Time' })}</div>
                  <p dir="ltr" className="text-xs sm:text-sm font-medium text-foreground text-left rtl:text-right" style={{ unicodeBidi: 'isolate' }}>
                    {activity.startTime || activity.time}{activity.endTime ? ` – ${activity.endTime}` : ""}
                  </p>
                </div>
              )}
              {activity.phone && (
                <div className="bg-muted/50 rounded-xl p-2.5 sm:p-3">
                  <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mb-0.5"><Phone size={11} /> {t('itinerary.phone', { defaultValue: 'Phone' })}</div>
                  <a href={`tel:${activity.phone}`} className="text-xs sm:text-sm font-medium text-primary hover:underline">{activity.phone}</a>
                </div>
              )}
              {activity.cost !== undefined && (
                <div className="bg-muted/50 rounded-xl p-2.5 sm:p-3">
                   <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground mb-0.5"><DollarSign size={11} /> {t('itinerary.cost', { defaultValue: 'Cost' })}</div>
                   <p className="text-xs sm:text-sm font-medium text-foreground">{activity.cost === 0 ? t('itinerary.free', { defaultValue: 'Free' }) : `$${activity.cost}`}</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-3">
                <QrCode size={16} className="text-primary" /> {t('itinerary.quickAccess', { defaultValue: 'Quick Access' })}
              </h3>
              {hasMapPreview && previewSrc && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-3 rounded-xl overflow-hidden border border-border bg-muted relative group"
                  aria-label={t('itinerary.openInMaps', { defaultValue: 'Open in Google Maps' })}
                >
                  <iframe
                    title={`map-${activity.id}`}
                    src={previewSrc}
                    width="100%"
                    height="160"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    style={{ border: 0, pointerEvents: 'none' }}
                  />
                  <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between text-[11px] text-white">
                    <span className="flex items-center gap-1 truncate">
                      <MapPin size={11} className="shrink-0" />
                      <span className="truncate">{locationLabel || localizedName}</span>
                    </span>
                    <span className="flex items-center gap-1 font-semibold opacity-90 group-hover:opacity-100">
                      <Navigation size={11} /> {t('itinerary.openInMaps', { defaultValue: 'Open in Maps' })}
                    </span>
                  </div>
                </a>
              )}
              {/* Opening hours badge — always shown with a fallback */}
              {(() => {
                const _formatted = getUnifiedOpeningHours(activity, i18n.language || 'en');
                // Fallback to SerpAPI's `open_state` ("Open now", "Open · Closes 12 AM")
                // when the full per-day schedule isn't available — better UX than
                // a blanket "Hours unavailable".
                const _openState = (activity as any).openState || (activity as any).open_state || '';
                const _displayText = _formatted
                  || (typeof _openState === 'string' && _openState.trim() ? _openState.trim() : '')
                  || (isArabic ? 'ساعات العمل غير متوفرة' : 'Hours unavailable');
                return (
                  <div className="mb-3 flex items-center gap-2 flex-wrap rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                    <Clock size={14} className="text-primary shrink-0" />
                    <span className="text-xs font-medium text-foreground">
                      {t('itinerary.openingHours', { defaultValue: 'Opening Hours' })}:
                    </span>
                    <span className="text-xs text-foreground/90 font-semibold">
                      {_displayText}
                    </span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(mapUrl, '_blank')}>
                        <MapPin size={12} /> {t('itinerary.openInMaps', { defaultValue: 'Open in Maps' })}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      {isArabic ? 'سبب رابط الخرائط' : 'Maps link source'}: {mapLinkReason}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  const calDesc = buildCalendarDescription(activity, date, destination);
                  const { start: calStart, end: calEnd } = getActivityStartEnd(activity, date);
                  const calBridgeUrl = `${window.location.origin}/calendar/add?title=${encodeURIComponent(activity.title || activity.name || 'Activity')}&location=${encodeURIComponent(activity.address || activity.location || '')}&details=${encodeURIComponent(calDesc)}&start=${calStart.toISOString()}&end=${calEnd.toISOString()}&pref=auto`;
                  window.open(calBridgeUrl, '_blank');
                }}>
                  <Calendar size={12} /> {t('itinerary.addToCalendar', { defaultValue: 'Add to Calendar' })}
                </Button>
                {activity.website && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(activity.website!, '_blank')}>
                    <Globe size={12} /> {t('itinerary.website', { defaultValue: 'Website' })}
                  </Button>
                )}
                {activity.phone && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`tel:${activity.phone}`, '_self')}>
                    <Phone size={12} /> {t('itinerary.call', { defaultValue: 'Call' })}
                  </Button>
                )}
              </div>

              {/* Nearby Places Search */}
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">{isArabic ? 'أماكن قريبة' : 'Nearby Places'}</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: isArabic ? 'مطاعم' : 'Restaurants', icon: '🍽️', query: 'restaurants' },
                    { label: isArabic ? 'صيدلية' : 'Pharmacy', icon: '💊', query: 'pharmacy' },
                    { label: isArabic ? 'صرافة' : 'Exchange', icon: '💱', query: 'currency exchange' },
                    { label: isArabic ? 'صراف آلي' : 'ATM', icon: '🏧', query: 'ATM' },
                    { label: isArabic ? 'مقهى' : 'Cafe', icon: '☕', query: 'cafe' },
                    { label: isArabic ? 'سوبرماركت' : 'Market', icon: '🛒', query: 'supermarket' },
                  ].map((item) => {
                    const nearbyQuery = `${item.query} near ${activity.title || activity.name} ${activity.address || activity.location || ''}`.trim();
                    const nearbyUrl = `https://www.google.com/maps/search/${encodeURIComponent(nearbyQuery)}`;
                    return (
                      <Button key={item.query} variant="outline" size="sm" className="gap-1 text-[10px] h-8 px-2"
                        onClick={() => window.open(nearbyUrl, '_blank')}>
                        <span>{item.icon}</span> {item.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <QRCodeSVG value={mapUrl} size={60} />
                  <span className="text-[10px] text-muted-foreground">{t('itinerary.location', { defaultValue: 'Location' })}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  {(() => { const { start: qS, end: qE } = getActivityStartEnd(activity, date); return <QRCodeSVG value={`${window.location.origin}/calendar/add?title=${encodeURIComponent(activity.title || activity.name || '')}&location=${encodeURIComponent(activity.address || activity.location || '')}&start=${qS.toISOString()}&end=${qE.toISOString()}&pref=auto`} size={60} />; })()}
                  <span className="text-[10px] text-muted-foreground">{t('itinerary.calendar', { defaultValue: 'Calendar' })}</span>
                </div>
                {activity.website && (
                  <div className="flex flex-col items-center gap-1.5">
                    <QRCodeSVG value={activity.website} size={60} />
                    <span className="text-[10px] text-muted-foreground">{t('itinerary.website', { defaultValue: 'Website' })}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-2">
                <Lightbulb size={16} className="text-amber-500" /> {t('itinerary.visitTips', { defaultValue: 'Visit Tips' })}
              </h3>
              <ul className="space-y-1.5">
                {tips.map((tip, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Check size={12} className="text-amber-500 mt-0.5 shrink-0" /> {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* User Reviews */}
            <ActivityReviews activityName={localizedName || ''} destination={destination} />

            {activity.website && (
              <a href={activity.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Globe size={14} /> {t('itinerary.visitWebsite', { defaultValue: 'Visit Website' })} <ExternalLink size={12} />
              </a>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button className="flex-1 gap-2" onClick={() => { window.open(mapUrl, '_blank'); setShowDetails(false); }}>
                <Navigation size={16} /> {t('itinerary.openInMaps', { defaultValue: 'Open in Google Maps' })}
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => onToggleComplete?.(activity.id)}>
                <CheckCircle2 size={16} /> {isCompleted ? t('itinerary.markIncomplete', { defaultValue: 'Undo Complete' }) : t('itinerary.markComplete', { defaultValue: 'Mark as Complete' })}
              </Button>
            </div>
            {/* Export single activity */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs"
                onClick={async () => {
                  toast.info(isArabic ? 'جاري التصدير...' : 'Exporting...');
                  await exportActivityPDF(activity, date, activityPhotos, destination);
                  toast.success(isArabic ? 'تم التصدير ✅' : 'Exported ✅');
                }}>
                <Download size={12} /> PDF
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs"
                onClick={() => {
                  exportActivityHTML(activity, date, activityPhotos, destination);
                  toast.success(isArabic ? 'تم التصدير ✅' : 'Exported ✅');
                }}>
                <FileText size={12} /> HTML
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs"
                onClick={() => {
                  // Generate ICS for wallet/calendar with full details + links
                  const actName = activity.title || activity.name || 'Activity';
                  const addr = activity.address || activity.location || '';
                  const desc = buildCalendarDescription(activity, date, destination);
                  const startDt = new Date(date);
                  const [sh, sm] = (activity.startTime || activity.time || '09:00').split(':').map(Number);
                  startDt.setHours(sh || 9, sm || 0, 0, 0);
                  const endDt = new Date(startDt);
                  if (activity.endTime) {
                    const [eh, em] = activity.endTime.split(':').map(Number);
                    endDt.setHours(eh || sh + 2, em || 0, 0, 0);
                  } else {
                    endDt.setHours(startDt.getHours() + 2);
                  }
                  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
                  const ics = [
                    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AseelTrip//EN', 'BEGIN:VEVENT',
                    `DTSTART:${fmt(startDt)}`, `DTEND:${fmt(endDt)}`,
                    `SUMMARY:${actName}`, `LOCATION:${addr}`, `DESCRIPTION:${desc}`,
                    `URL:${mapUrl}`,
                    'END:VEVENT', 'END:VCALENDAR'
                  ].join('\r\n');
                  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${actName.replace(/\s+/g, '_')}.ics`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(isArabic ? 'تم التنزيل - افتح الملف لإضافته للمحفظة/التقويم 📲' : 'Downloaded - open the file to add to Wallet/Calendar 📲');
                }}>
                <Wallet size={12} /> {isArabic ? 'المحفظة' : 'Wallet'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <QRCodeDialog activity={activity} date={date} isOpen={showQR} onClose={() => setShowQR(false)} />
    </Reorder.Item>
  );
};

// Trip Stats Component
const TripStats = ({ activities, fuelEfficiency = 8, fuelPrice = 2.5 }: { activities: Activity[]; fuelEfficiency?: number; fuelPrice?: number }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const stats = calculateDayTripStats(activities as any, fuelEfficiency, fuelPrice);
  const dayCost = activities.reduce((sum, a) => sum + (Number(a.cost) || 0), 0);
  const completedCount = activities.filter(a => a.completed).length;

  return (
    <Card className="p-4 mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border-emerald-200 dark:border-emerald-800">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2 rounded-lg"><DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" /></div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">{t('itinerary.dayCosts', { defaultValue: 'Day Costs' })}</h3>
            <p className="text-xs text-muted-foreground">{completedCount}/{activities.length} {t('itinerary.completedOf', { defaultValue: 'completed' })}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-primary">${dayCost} {t('itinerary.activities', { defaultValue: 'activities' })}</div>
            {stats.totalDistance > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Route size={10} /> {stats.totalDistance} {t('itinerary.km', { defaultValue: 'km' })} · <Fuel size={10} /> ${stats.fuelCost}
              </div>
            )}
          </div>
          {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-800 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">{t('itinerary.activityCosts', { defaultValue: 'Activity Costs' })}</h4>
                {activities.map((a, i) => (
                  <div key={i} className={cn("flex items-center justify-between text-sm py-1", a.completed && "line-through opacity-60")}>
                    <span className="text-muted-foreground truncate flex-1">{a.title || a.name}</span>
                    <span className="font-medium text-foreground ml-2">{a.cost === 0 ? t('itinerary.free', { defaultValue: 'Free' }) : `$${a.cost || 0}`}</span>
                  </div>
                ))}
              </div>
              {stats.segments.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                    <Route size={12} /> {t('itinerary.distancesBetween', { defaultValue: 'Distances Between Points' })}
                  </h4>
                  {stats.segments.map((segment, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <span className="text-muted-foreground truncate flex-1">{segment.from} → {segment.to}</span>
                      <span className="font-medium text-foreground ml-2">{segment.distance} {t('itinerary.km', { defaultValue: 'km' })}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="bg-white/60 dark:bg-white/5 rounded-lg p-3 mt-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span>{t('itinerary.totalDayCost', { defaultValue: 'Total Day Cost' })}</span>
                  <span className="text-primary">${(Number(dayCost) + Number(stats.fuelCost)).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

// Publish Day as Story Button with activity selection
const PublishDayStoryButton = ({ activities, dayDate, destination, dayIndex }: { activities: Activity[]; dayDate: Date; destination?: string; dayIndex: number }) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const uiText = getCardUiText(i18n.language);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [publishing, setPublishing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set(activities.map(a => a.id)));
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);
  const [activityMedia, setActivityMedia] = useState<Record<string, string[]>>({});

  // Load activity media when dialog opens
  useEffect(() => {
    if (!showDialog || !user) return;
    const tripId = window.location.pathname.match(/\/itinerary\/([^/]+)/)?.[1];
    if (!tripId) return;
    supabase.from('activity_media').select('activity_id, media_url, activity_name')
      .eq('trip_id', tripId).eq('day_index', dayIndex).eq('user_id', user.id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string[]> = {};
        data.forEach(m => {
          const key = m.activity_id || m.activity_name || '';
          if (!map[key]) map[key] = [];
          map[key].push(m.media_url);
        });
        setActivityMedia(map);
      });
  }, [showDialog, user, dayIndex]);

  const toggleActivity = (id: string) => {
    setSelectedActivities(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const publishDayStory = async () => {
    if (!user) { toast.error(uiText.loginRequired); navigate('/auth'); return; }
    const selected = activities.filter(a => selectedActivities.has(a.id));
    if (selected.length === 0) { toast.error(uiText.selectOneActivity); return; }
    setPublishing(true);
    try {
      const allMedia: string[] = [];
      if (includePhotos) {
        selected.forEach(a => {
          const media = activityMedia[a.id] || activityMedia[a.title || ''] || activityMedia[a.name || ''] || [];
          allMedia.push(...media);
        });
      }

      const actNames = selected.map(a => a.title || a.name).filter(Boolean).join(' → ');
      const content = selected.map(a => {
        const mapUrl = getMapUrl(a);
        return `📍 ${a.title || a.name}\n📌 ${a.address || a.location || ''}\n⏰ ${a.startTime || a.time || ''}\n${a.description || ''}\n🗺️ ${mapUrl}`;
      }).join('\n\n').slice(0, 2000);

      const tripId = window.location.pathname.match(/\/itinerary\/([^/]+)/)?.[1];
      const { error } = await supabase.from('travel_stories').insert({
        user_id: user.id,
        title: `${isArabic ? 'يوم' : 'Day'} ${dayIndex + 1}: ${destination || ''} - ${actNames}`.slice(0, 200),
        content,
        location_name: destination || '',
        media_urls: allMedia.length > 0 ? allMedia : undefined,
        trip_data: {
          day_index: dayIndex,
          activities_count: selected.length,
          destination,
          date: dayDate.toISOString(),
          itinerary: [{
            date: dayDate.toISOString(),
            activities: selected.map(a => ({
              id: a.id,
              name: a.title || a.name,
              title: a.title || a.name,
              description: a.description,
              address: a.address || a.location,
              time: a.startTime || a.time,
              endTime: a.endTime,
              category: a.category || a.type,
              cost: a.cost,
              rating: a.rating,
              openingHours: a.openingHours,
              latitude: a.latitude,
              longitude: a.longitude,
              phone: a.phone,
              website: a.website,
              imageUrl: a.imageUrl,
              media: includePhotos ? (activityMedia[a.id] || activityMedia[a.title || ''] || []) : [],
            })),
          }],
          hashtags: [destination?.toLowerCase(), 'travel', 'day' + (dayIndex + 1)].filter(Boolean),
        },
      });
      if (error) throw error;
      toast.success(isArabic ? 'تم نشر قصة اليوم! 🎉' : 'Day story published! 🎉');
      setShowDialog(false);
    } catch (err) { console.error(err); toast.error(uiText.publishFailed); }
    setPublishing(false);
  };

  const totalPhotos = activities.reduce((sum, a) => {
    const media = activityMedia[a.id] || activityMedia[a.title || ''] || activityMedia[a.name || ''] || [];
    return sum + media.length;
  }, 0);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5 rounded-full border-primary/40 text-primary hover:bg-primary/10"
        onClick={() => { if (!user) { toast.error(uiText.loginRequired); navigate('/auth'); return; } setShowDialog(true); }}>
        <Share2 size={14} /> {uiText.publishDayStory(dayIndex + 1)}
      </Button>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              {uiText.publishDayStory(dayIndex + 1)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Activity Selection */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {uiText.selectActivities} ({selectedActivities.size}/{activities.length})
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activities.map(a => {
                  const mediaCount = (activityMedia[a.id] || activityMedia[a.title || ''] || activityMedia[a.name || ''] || []).length;
                  return (
                    <label key={a.id} className={cn(
                      "flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors",
                      selectedActivities.has(a.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    )}>
                      <input type="checkbox" checked={selectedActivities.has(a.id)} onChange={() => toggleActivity(a.id)}
                        className="rounded border-primary text-primary focus:ring-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.title || a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.startTime || a.time} • {a.address || a.location || ''}</p>
                      </div>
                      {mediaCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          <ImageIcon size={10} className="mr-0.5" /> {mediaCount}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-2.5">
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-border">
                <span className="text-sm flex items-center gap-2">
                  <ImageIcon size={14} className="text-primary" />
                  {uiText.includePhotos} {totalPhotos > 0 && <Badge variant="outline" className="text-[10px]">{totalPhotos}</Badge>}
                </span>
                <input type="checkbox" checked={includePhotos} onChange={e => setIncludePhotos(e.target.checked)}
                  className="rounded border-primary text-primary focus:ring-primary" />
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-xl border border-border">
                <span className="text-sm flex items-center gap-2">
                  <MessageSquare size={14} className="text-primary" />
                  {uiText.includeDescriptions}
                </span>
                <input type="checkbox" checked={includeComments} onChange={e => setIncludeComments(e.target.checked)}
                  className="rounded border-primary text-primary focus:ring-primary" />
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} size="sm">
              {isArabic ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={publishDayStory} disabled={publishing || selectedActivities.size === 0} size="sm" className="gap-1.5">
              {publishing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
              {uiText.publishStory}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Day Activity/Meal Counter Badge with target validation, preference balance + trip-type check
const DayCounterBadge = ({
  activities,
  targetCount,
  mealPreferences,
  interests,
  tripType,
  preferenceSummary,
}: {
  activities: Activity[];
  targetCount?: number;
  mealPreferences?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean; snacks?: boolean; cuisineTypes?: string[] } | null;
  interests?: string[];
  tripType?: string;
  preferenceSummary?: DayData['preferenceSummary'];
}) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const uiText = getCardUiText(i18n.language);

  const mealCategories = ['food', 'restaurant', 'cafe', 'breakfast', 'lunch', 'dinner', 'snack'];
  const meals = activities.filter(a => mealCategories.includes((a.type || a.category || '').toLowerCase()));
  const nonMeals = activities.filter(a => !mealCategories.includes((a.type || a.category || '').toLowerCase()));
  const total = activities.length;

  const hasTarget = typeof targetCount === 'number' && targetCount > 0;
  const matches = hasTarget ? total === targetCount : true;
  const expectedMeals = mealPreferences
    ? (mealPreferences.breakfast ? 1 : 0) + (mealPreferences.lunch ? 1 : 0) + (mealPreferences.dinner ? 1 : 0) + (mealPreferences.snacks ? 1 : 0)
    : null;
  const mealsMatch = expectedMeals == null ? true : meals.length >= expectedMeals;
  const expectedNonMeals = hasTarget ? Math.max(0, targetCount - (expectedMeals ?? 0)) : null;

  // Localized validation strings
  const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
  const matchedLabel = (matched: number, target: number) => {
    switch (code) {
      case 'ar': return `${matched}/${target} مطابق`;
      case 'fr': return `${matched}/${target} correspondants`;
      case 'es': return `${matched}/${target} coincidencias`;
      case 'de': return `${matched}/${target} passend`;
      case 'ru': return `${matched}/${target} совпадений`;
      case 'zh': return `${matched}/${target} 已匹配`;
      case 'ur': return `${matched}/${target} مماثل`;
      default: return `${matched}/${target} matched`;
    }
  };
  const warnLabel = () => {
    const diff = (targetCount || 0) - total;
    const abs = Math.abs(diff);
    const moreNeeded = diff > 0;
    switch (code) {
      case 'ar': return moreNeeded ? `ينقص ${abs} من العدد المطلوب` : `زيادة ${abs} عن العدد المطلوب`;
      case 'fr': return moreNeeded ? `${abs} de moins que prévu` : `${abs} de plus que prévu`;
      case 'es': return moreNeeded ? `Faltan ${abs} respecto al objetivo` : `Sobran ${abs} respecto al objetivo`;
      case 'de': return moreNeeded ? `${abs} weniger als geplant` : `${abs} mehr als geplant`;
      case 'ru': return moreNeeded ? `Не хватает ${abs} до цели` : `Превышение цели на ${abs}`;
      case 'zh': return moreNeeded ? `比目标少 ${abs} 项` : `比目标多 ${abs} 项`;
      case 'ur': return moreNeeded ? `ہدف سے ${abs} کم` : `ہدف سے ${abs} زیادہ`;
      default: return moreNeeded ? `${abs} below target` : `${abs} over target`;
    }
  };
  const okLabel = () => {
    switch (code) {
      case 'ar': return 'مطابق تماماً';
      case 'fr': return 'Conforme';
      case 'es': return 'Conforme';
      case 'de': return 'Stimmt überein';
      case 'ru': return 'Соответствует';
      case 'zh': return '完全匹配';
      case 'ur': return 'بالکل مماثل';
      default: return 'Exact match';
    }
  };

  // ---- Trip-type validation rules (per-day heuristic over generated content) ----
  const TRIP_TYPE_RULES: Record<string, { tokens: RegExp; minRatio: number; bannedCats?: string[] }> = {
    family:      { tokens: /\b(family|kids?|child(ren)?|zoo|aquarium|park|theme|playground|museum|عائل|أطفال|حديق|متحف)\b/i, minRatio: 0.3, bannedCats: ['nightlife'] },
    economical:  { tokens: /\b(free|budget|cheap|affordable|street|market|public|park|اقتصاد|مجاني|رخيص|سوق)\b/i, minRatio: 0.25 },
    luxury:      { tokens: /\b(luxury|premium|fine|spa|gourmet|five\s*star|5\s*star|boutique|exclusive|فاخر|راق|سبا|قمة)\b/i, minRatio: 0.25 },
    adventure:   { tokens: /\b(adventure|hike|trek|climb|kayak|raft|safari|zipline|surf|dive|expedition|مغامر|تسلق|غوص|رحل)\b/i, minRatio: 0.3 },
    romantic:    { tokens: /\b(romantic|sunset|wine|rooftop|couple|dinner|cruise|view|garden|روماني|غروب|عشاء|إطلال)\b/i, minRatio: 0.3 },
    solo:        { tokens: /\b(solo|self|cafe|coworking|walk|tour|gallery|museum|library|فردي|مقهى|جول|متحف)\b/i, minRatio: 0.25 },
  };
  const tripTypeKey = String(tripType || '').toLowerCase().trim();
  const tripTypeRule = tripTypeKey ? TRIP_TYPE_RULES[tripTypeKey] : null;
  const tripTypeMatchedCount = tripTypeRule
    ? activities.filter(a => {
        const text = `${a.title || (a as any).name || ''} ${a.description || ''} ${(a as any).matchReason || ''} ${(a as any).category || ''}`;
        const cat = String((a as any).category || '').toLowerCase();
        if (tripTypeRule.bannedCats?.includes(cat)) return false;
        return tripTypeRule.tokens.test(text);
      }).length
    : 0;
  const tripTypeRatio = activities.length > 0 ? tripTypeMatchedCount / activities.length : 0;
  const tripTypeOk = tripTypeRule ? tripTypeRatio >= tripTypeRule.minRatio : true;
  const tripTypeLabel = (() => {
    const labels: Record<string, Record<string, string>> = {
      family:     { en: 'Family', ar: 'عائلية', fr: 'Famille', es: 'Familiar', de: 'Familie', ru: 'Семейный', zh: '家庭', ur: 'خاندانی' },
      economical: { en: 'Economical', ar: 'اقتصادية', fr: 'Économique', es: 'Económico', de: 'Sparsam', ru: 'Эконом', zh: '经济', ur: 'اقتصادی' },
      luxury:     { en: 'Luxury', ar: 'فاخرة', fr: 'Luxe', es: 'Lujo', de: 'Luxus', ru: 'Люкс', zh: '奢华', ur: 'لگژری' },
      adventure:  { en: 'Adventure', ar: 'مغامرة', fr: 'Aventure', es: 'Aventura', de: 'Abenteuer', ru: 'Приключение', zh: '冒险', ur: 'مہم جوئی' },
      romantic:   { en: 'Romantic', ar: 'رومانسية', fr: 'Romantique', es: 'Romántico', de: 'Romantisch', ru: 'Романтика', zh: '浪漫', ur: 'رومانوی' },
      solo:       { en: 'Solo', ar: 'فردية', fr: 'Solo', es: 'Solo', de: 'Solo', ru: 'Соло', zh: '独行', ur: 'تنہا' },
    };
    return (labels[tripTypeKey] && (labels[tripTypeKey][code] || labels[tripTypeKey].en)) || tripTypeKey;
  })();
  const tripTypePct = Math.round(tripTypeRatio * 100);

  // ---- Preference balance meter (interests + meals breakdown) ----
  const interestList = (interests || []).map(s => String(s).toLowerCase().trim()).filter(Boolean);
  const INTEREST_TOKENS: Record<string, RegExp> = {
    nature:        /\b(nature|park|garden|lake|mountain|forest|botanical|scenic|طبيع|حديق|بحير|جبل|غاب|منتزه|منظر طبيعي)\b/i,
    shopping:      /\b(shop|mall|market|bazaar|boutique|تسوق|سوق|مول)\b/i,
    culture:       /\b(museum|gallery|heritage|historic|monument|cultural|متحف|تراث|تاريخ|ثقاف|أثر)\b/i,
    beach:         /\b(beach|coast|shore|seaside|waterfront|شاطئ|ساحل|بحر)\b/i,
    adventure:     /\b(adventure|hike|trek|climb|kayak|raft|safari|zipline|surf|dive|مغامر|تسلق|غوص|رحل)\b/i,
    art:           /\b(art|gallery|exhibition|painting|sculpture|فن|معرض|رسم|نحت)\b/i,
    entertainment: /\b(entertainment|show|theater|theatre|cinema|concert|amusement|theme|ترفيه|عرض|مسرح|سينما|حفل)\b/i,
    relaxation:    /\b(relax|spa|wellness|massage|sauna|thermal|garden|park|استرخاء|سبا|تدليك|هدوء)\b/i,
    nightlife:     /\b(nightlife|bar|pub|club|lounge|cocktail|rooftop|حياة ليلية|بار|نادي|سهر)\b/i,
    sports:        /\b(sport|stadium|gym|football|soccer|match|game|رياضة|ملعب|مباراة)\b/i,
  };
  const interestLabels: Record<string, Record<string, string>> = {
    nature:        { en: 'Nature 🌿', ar: 'طبيعة 🌿' },
    shopping:      { en: 'Shopping 🛍️', ar: 'تسوق 🛍️' },
    culture:       { en: 'Culture 🏛️', ar: 'ثقافة 🏛️' },
    beach:         { en: 'Beach 🏖️', ar: 'شواطئ 🏖️' },
    adventure:     { en: 'Adventure 🧗', ar: 'مغامرة 🧗' },
    art:           { en: 'Art 🎨', ar: 'فن 🎨' },
    entertainment: { en: 'Entertainment 🎭', ar: 'ترفيه 🎭' },
    relaxation:    { en: 'Relax 🧘', ar: 'استرخاء 🧘' },
    nightlife:     { en: 'Nightlife 🌃', ar: 'حياة ليلية 🌃' },
    sports:        { en: 'Sports ⚽', ar: 'رياضة ⚽' },
  };
  const summaryInterestMap = new Map((preferenceSummary?.interests || []).map((item) => [String(item.key).toLowerCase(), item]));
  const interestCounts: Array<{ key: string; label: string; count: number; pct: number; drivers: string[] }> = [];
  if (interestList.length > 0 && nonMeals.length > 0) {
    interestList.forEach(key => {
      const label = (interestLabels[key] && (interestLabels[key][code] || interestLabels[key].en)) || key;
      const re = INTEREST_TOKENS[key];
      const matchingActs = re ? nonMeals.filter(a => {
        const text = `${a.title || (a as any).name || ''} ${a.description || ''} ${(a as any).category || ''} ${(a as any).matchReason || ''}`;
        return re.test(text);
      }) : [];
      const drivers = matchingActs.map(a => String(a.title || (a as any).name || '').trim()).filter(Boolean).slice(0, 4);

      const summaryItem = summaryInterestMap.get(key);
      if (summaryItem) {
        const count = Number(summaryItem.matchedCount) || 0;
        const totalItems = Number(summaryItem.totalItems) || nonMeals.length;
        const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
        interestCounts.push({ key, label, count, pct, drivers });
        return;
      }

      if (!re) return;
      const count = matchingActs.length;
      const pct = nonMeals.length > 0 ? Math.round((count / nonMeals.length) * 100) : 0;
      interestCounts.push({ key, label, count, pct, drivers });
    });
  }
  const totalCovered = interestCounts.reduce((s, x) => s + x.count, 0);
  const coverage = nonMeals.length > 0 ? Math.round((Math.min(totalCovered, nonMeals.length) / nonMeals.length) * 100) : 0;
  // Balance verdict: skewed if one interest dominates >70%, missing if any picked
  // interest has 0 activities, balanced otherwise. 'na' when <2 interests selected.
  const balanceStatus: 'balanced' | 'skewed' | 'missing' | 'na' = (() => {
    if (interestCounts.length < 2) return 'na';
    const total = interestCounts.reduce((s, x) => s + x.count, 0);
    if (total === 0) return 'missing';
    if (interestCounts.some(x => x.count === 0)) return 'missing';
    const maxShare = Math.max(...interestCounts.map(x => x.count / total));
    return maxShare > 0.7 ? 'skewed' : 'balanced';
  })();
  const balanceLabels: Record<string, Record<string, string>> = {
    balanced: { ar: '✓ توزيع متوازن', en: '✓ Balanced distribution', fr: '✓ Distribution équilibrée', es: '✓ Distribución equilibrada', de: '✓ Ausgewogen', ru: '✓ Сбалансировано', zh: '✓ 分布均衡', ur: '✓ متوازن تقسیم' },
    skewed:   { ar: '⚠️ تركيز على تفضيل واحد', en: '⚠️ Skewed toward one interest', fr: '⚠️ Déséquilibré', es: '⚠️ Desequilibrado', de: '⚠️ Unausgewogen', ru: '⚠️ Перекос', zh: '⚠️ 偏向单一偏好', ur: '⚠️ ایک ترجیح پر مرکوز' },
    missing:  { ar: '⚠️ تفضيل مفقود', en: '⚠️ Interest missing from day', fr: '⚠️ Préférence manquante', es: '⚠️ Falta una preferencia', de: '⚠️ Präferenz fehlt', ru: '⚠️ Не хватает', zh: '⚠️ 缺少偏好', ur: '⚠️ ترجیح غائب' },
    na:       { ar: '', en: '', fr: '', es: '', de: '', ru: '', zh: '', ur: '' },
  };
  const balanceVerdict = (balanceLabels[balanceStatus] && (balanceLabels[balanceStatus][code] || balanceLabels[balanceStatus].en)) || '';
  const drivenByLabel = code === 'ar' ? 'مدفوع بـ' : code === 'fr' ? 'porté par' : code === 'es' ? 'impulsado por' : code === 'de' ? 'getragen von' : code === 'ru' ? 'за счёт' : code === 'zh' ? '来源' : code === 'ur' ? 'بنیاد' : 'driven by';
  const balanceTitle = (() => {
    switch (code) {
      case 'ar': return 'توازن التفضيلات';
      case 'fr': return 'Équilibre des préférences';
      case 'es': return 'Equilibrio de preferencias';
      case 'de': return 'Präferenz-Balance';
      case 'ru': return 'Баланс предпочтений';
      case 'zh': return '偏好分布';
      case 'ur': return 'ترجیحی توازن';
      default: return 'Preference balance';
    }
  })();
  const mealLabels: Record<string, Record<string, string>> = {
    breakfast: { en: '🍳 Breakfast', ar: '🍳 فطور', fr: '🍳 Petit-déj.', es: '🍳 Desayuno', de: '🍳 Frühstück', ru: '🍳 Завтрак', zh: '🍳 早餐', ur: '🍳 ناشتہ' },
    lunch:     { en: '🥗 Lunch', ar: '🥗 غداء', fr: '🥗 Déjeuner', es: '🥗 Almuerzo', de: '🥗 Mittag', ru: '🥗 Обед', zh: '🥗 午餐', ur: '🥗 دوپہر' },
    dinner:    { en: '🍲 Dinner', ar: '🍲 عشاء', fr: '🍲 Dîner', es: '🍲 Cena', de: '🍲 Abend', ru: '🍲 Ужин', zh: '🍲 晚餐', ur: '🍲 رات' },
    snack:     { en: '🍿 Snack', ar: '🍿 وجبة خفيفة', fr: '🍿 Collation', es: '🍿 Snack', de: '🍿 Snack', ru: '🍿 Перекус', zh: '🍿 小吃', ur: '🍿 ہلکا' },
  };
  const mealBuckets = [
    { key: 'breakfast', want: !!mealPreferences?.breakfast },
    { key: 'lunch',     want: !!mealPreferences?.lunch },
    { key: 'dinner',    want: !!mealPreferences?.dinner },
    { key: 'snack',     want: !!mealPreferences?.snacks },
  ].filter(b => b.want).map(b => {
    const got = activities.some(a => {
      const cat = String((a as any).type || (a as any).category || '').toLowerCase();
      const text = `${a.title || (a as any).name || ''} ${a.description || ''}`.toLowerCase();
      return cat.startsWith(b.key) || text.includes(b.key) || (b.key === 'snack' && /snack|وجبة خفيفة/.test(text));
    });
    return { key: b.key, got, label: (mealLabels[b.key] && (mealLabels[b.key][code] || mealLabels[b.key].en)) || b.key };
  });

  const showBalance = interestCounts.length > 0 || mealBuckets.length > 0;
  // STRICT: display preference-match rows ONLY for interests the user actually
  // selected (case-insensitive) and meals they explicitly requested. Prevents
  // showing nature/beach/art/sports as "matched" when never chosen.
  const selectedInterestKeys = new Set(
    (interests || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean)
  );
  const requestedMealKeys = new Set(
    [
      mealPreferences?.breakfast && 'breakfast',
      mealPreferences?.lunch && 'lunch',
      mealPreferences?.dinner && 'dinner',
      mealPreferences?.snacks && 'snack',
    ].filter(Boolean) as string[]
  );
  const summaryItems = [
    ...((preferenceSummary?.interests || []).filter((it) =>
      selectedInterestKeys.has(String(it.key).toLowerCase().trim())
    )),
    ...((preferenceSummary?.meals || []).filter((it) =>
      requestedMealKeys.has(String(it.key).toLowerCase().trim())
    )),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1 text-xs bg-primary/5 border-primary/20">
          <MapPinned size={12} className="text-primary" />
          {uiText.activities(nonMeals.length)}
        </Badge>
        {meals.length > 0 && (
          <Badge variant="outline" className="gap-1 text-xs bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300">
            <UtensilsCrossed size={12} />
            {uiText.meals(meals.length)}
          </Badge>
        )}
        {hasTarget && (
          matches && mealsMatch ? (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
              title={okLabel()}
            >
              <ShieldCheck size={12} />
              {matchedLabel(total, targetCount!)}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              title={warnLabel()}
            >
              <AlertTriangle size={12} />
              {matchedLabel(total, targetCount!)}{expectedNonMeals != null ? ` · ${nonMeals.length}/${expectedNonMeals}` : ''}{expectedMeals != null && expectedMeals > 0 ? ` · ${meals.length}/${expectedMeals}` : ''}
            </Badge>
          )
        )}
        {tripTypeRule && (
          tripTypeOk ? (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-violet-50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300"
              title={`${tripTypeLabel} · ${tripTypeMatchedCount}/${activities.length} (${tripTypePct}%)`}
            >
              <ShieldCheck size={12} />
              {tripTypeLabel} · {tripTypePct}%
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-xs bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              title={`${tripTypeLabel} · ${tripTypeMatchedCount}/${activities.length} (${tripTypePct}%) — ${
                code === 'ar' ? 'لا يطابق نوع الرحلة بالكامل'
                : code === 'fr' ? 'ne correspond pas pleinement au type de voyage'
                : code === 'es' ? 'no coincide totalmente con el tipo de viaje'
                : code === 'de' ? 'entspricht dem Reisetyp nicht vollständig'
                : code === 'ru' ? 'не полностью соответствует типу поездки'
                : code === 'zh' ? '与出行类型不完全匹配'
                : code === 'ur' ? 'سفر کی قسم سے مکمل میل نہیں'
                : 'does not fully match trip type'
              }`}
            >
              <AlertTriangle size={12} />
              {tripTypeLabel} · {tripTypePct}%
            </Badge>
          )
        )}
      </div>
      {showBalance && (
        <details className="rounded-lg border border-border/60 bg-muted/30 p-2 max-w-full group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground select-none">
            <span className="flex items-center gap-1.5">
              <span>{balanceTitle}</span>
              {balanceVerdict && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                  balanceStatus === 'balanced' && 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
                  balanceStatus === 'skewed' && 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                  balanceStatus === 'missing' && 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300',
                )}>
                  {balanceVerdict}
                </span>
              )}
            </span>
            <span className="text-[10px] opacity-70 group-open:hidden">
              {code === 'ar' ? 'إظهار' : code === 'fr' ? 'Afficher' : code === 'es' ? 'Mostrar' : code === 'de' ? 'Anzeigen' : code === 'ru' ? 'Показать' : code === 'zh' ? '显示' : code === 'ur' ? 'دکھائیں' : 'Show'}
            </span>
            <span className="text-[10px] opacity-70 hidden group-open:inline">
              {code === 'ar' ? 'إخفاء' : code === 'fr' ? 'Masquer' : code === 'es' ? 'Ocultar' : code === 'de' ? 'Verbergen' : code === 'ru' ? 'Скрыть' : code === 'zh' ? '隐藏' : code === 'ur' ? 'چھپائیں' : 'Hide'}
            </span>
          </summary>
          <div className="mt-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{balanceTitle}</div>
            {balanceVerdict && (
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full border font-medium',
                balanceStatus === 'balanced' && 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
                balanceStatus === 'skewed' && 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300',
                balanceStatus === 'missing' && 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300',
              )}>
                {balanceVerdict}
              </span>
            )}
          </div>
          {interestCounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {interestCounts.map(item => (
                <div key={item.key} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-foreground/80 min-w-[78px] truncate">{item.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${item.count > 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                        style={{ width: `${Math.max(item.pct, item.count > 0 ? 6 : 4)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground tabular-nums w-8 text-end">{item.count}</span>
                  </div>
                  {item.drivers.length > 0 && (
                    <div className="text-[10px] text-muted-foreground/80 ps-[80px] leading-snug truncate" title={item.drivers.join(' · ')}>
                      {drivenByLabel}: {item.drivers.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {mealBuckets.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {mealBuckets.map(m => (
                <span
                  key={m.key}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${m.got
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}
                  title={m.got ? okLabel() : warnLabel()}
                >
                  {m.got ? '✓' : '!'} {m.label}
                </span>
              ))}
            </div>
          )}
          {interestCounts.length > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1.5">
              {code === 'ar' ? `تغطية التفضيلات ${coverage}%`
                : code === 'fr' ? `Couverture des préférences ${coverage}%`
                : code === 'es' ? `Cobertura de preferencias ${coverage}%`
                : code === 'de' ? `Präferenz-Abdeckung ${coverage}%`
                : code === 'ru' ? `Покрытие предпочтений ${coverage}%`
                : code === 'zh' ? `偏好覆盖率 ${coverage}%`
                : code === 'ur' ? `ترجیحی کوریج ${coverage}%`
                : `Preference coverage ${coverage}%`}
            </div>
          )}
          {summaryItems.length > 0 && (
            <div className="mt-2 rounded-md border border-border/50 bg-background/60 p-2">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                {code === 'ar' ? 'مطابقة التفضيلات' : code === 'fr' ? 'Correspondance des préférences' : code === 'es' ? 'Coincidencia de preferencias' : code === 'de' ? 'Präferenz-Match' : code === 'ru' ? 'Совпадение предпочтений' : code === 'zh' ? '偏好匹配' : code === 'ur' ? 'ترجیحی میچ' : 'Preference Match'}
              </div>
              <div className="space-y-1.5">
                {summaryItems.map((item) => {
                  const localizedLabel = isMealKey(item.key)
                    ? localizeMeal(String(item.key).toLowerCase() === 'snacks' ? 'snack' : item.key, code)
                    : localizeInterest(item.key, code);
                  const localizedReason = localizePreferenceReason({
                    key: item.key,
                    matched: !!item.matched,
                    matchedCount: item.matchedCount,
                    language: code,
                  });
                  return (
                  <div key={item.key} className="flex items-start justify-between gap-2 text-[11px]">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{localizedLabel}</div>
                      <div className="text-muted-foreground leading-relaxed">{localizedReason}</div>
                    </div>
                    <div className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                      item.matched
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    )}>
                      {item.matched ? '✓' : '✗'} {item.matchedCount}/{item.totalItems}
                    </div>
                  </div>
                  );
                })}
              </div>
              {typeof preferenceSummary?.coverage === 'number' && (
                <div className="text-[10px] text-muted-foreground mt-2">
                  {code === 'ar' ? `التغطية ${preferenceSummary.coverage}%` : code === 'fr' ? `Couverture ${preferenceSummary.coverage}%` : code === 'es' ? `Cobertura ${preferenceSummary.coverage}%` : code === 'de' ? `Abdeckung ${preferenceSummary.coverage}%` : code === 'ru' ? `Покрытие ${preferenceSummary.coverage}%` : code === 'zh' ? `覆盖率 ${preferenceSummary.coverage}%` : code === 'ur' ? `کوریج ${preferenceSummary.coverage}%` : `Coverage ${preferenceSummary.coverage}%`}
                </div>
              )}
            </div>
          )}
          {/* Stacked bar chart: distribution across interests + meal types */}
          {(interestCounts.length > 0 || mealBuckets.length > 0) && (() => {
            const mealCountByKey: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
            activities.forEach(a => {
              const cat = String((a as any).type || (a as any).category || '').toLowerCase();
              const text = `${a.title || (a as any).name || ''} ${a.description || ''}`.toLowerCase();
              if (cat.startsWith('breakfast') || /breakfast|فطور|早餐|завтрак|petit.?déj|desayuno|frühstück|ناشتہ/.test(text)) mealCountByKey.breakfast++;
              else if (cat.startsWith('lunch') || /lunch|غداء|午餐|обед|déjeuner|almuerzo|mittag|دوپہر/.test(text)) mealCountByKey.lunch++;
              else if (cat.startsWith('dinner') || /dinner|عشاء|晚餐|ужин|dîner|cena|abend|رات/.test(text)) mealCountByKey.dinner++;
              else if (cat.startsWith('snack') || /snack|وجبة خفيفة|小吃|перекус|collation|ہلکا/.test(text)) mealCountByKey.snack++;
            });
            const segments: Array<{ key: string; label: string; count: number; color: string }> = [];
            const interestColors = ['hsl(var(--primary))', 'hsl(160 84% 39%)', 'hsl(35 92% 50%)', 'hsl(280 65% 60%)', 'hsl(200 80% 50%)', 'hsl(340 75% 55%)', 'hsl(50 95% 55%)', 'hsl(140 60% 45%)', 'hsl(260 70% 60%)', 'hsl(15 80% 55%)'];
            interestCounts.forEach((it, idx) => {
              if (it.count > 0) segments.push({ key: `i:${it.key}`, label: it.label, count: it.count, color: interestColors[idx % interestColors.length] });
            });
            const mealColors: Record<string, string> = { breakfast: 'hsl(35 92% 55%)', lunch: 'hsl(85 65% 50%)', dinner: 'hsl(20 80% 55%)', snack: 'hsl(290 60% 60%)' };
            (['breakfast', 'lunch', 'dinner', 'snack'] as const).forEach(k => {
              if (mealCountByKey[k] > 0) {
                segments.push({ key: `m:${k}`, label: (mealLabels[k] && (mealLabels[k][code] || mealLabels[k].en)) || k, count: mealCountByKey[k], color: mealColors[k] });
              }
            });
            const sumSeg = segments.reduce((s, x) => s + x.count, 0);
            if (sumSeg === 0) return null;
            const chartTitle =
              code === 'ar' ? 'توزيع اليوم' :
              code === 'fr' ? 'Répartition du jour' :
              code === 'es' ? 'Distribución del día' :
              code === 'de' ? 'Tagesverteilung' :
              code === 'ru' ? 'Распределение дня' :
              code === 'zh' ? '当日分布' :
              code === 'ur' ? 'دن کی تقسیم' :
              'Day distribution';
            return (
              <div className="mt-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{chartTitle}</div>
                <div
                  className="flex w-full h-3 rounded-full overflow-hidden bg-muted"
                  role="img"
                  aria-label={`${chartTitle}: ${segments.map(s => `${s.label} ${s.count}`).join(', ')}`}
                >
                  {segments.map(seg => (
                    <div
                      key={seg.key}
                      className="h-full transition-all"
                      style={{ width: `${(seg.count / sumSeg) * 100}%`, backgroundColor: seg.color }}
                      title={`${seg.label}: ${seg.count}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
                  {segments.map(seg => (
                    <div key={`lg-${seg.key}`} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: seg.color }} />
                      <span className="text-foreground/80">{seg.label}</span>
                      <span className="tabular-nums">{seg.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          </div>
        </details>
      )}
    </div>
  );
};

// "Why these activities" expandable panel — shows which user preferences matched each activity
const WhyTheseActivitiesPanel = ({
  activities,
  tripMeta,
}: {
  activities: Activity[];
  tripMeta?: {
    interests?: string[];
    mealPreferences?: { breakfast?: boolean; lunch?: boolean; dinner?: boolean; snacks?: boolean; cuisineTypes?: string[] } | null;
    cuisinePreferences?: string[] | string;
    travelStyle?: string;
    tripType?: string;
  } | null;
}) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [open, setOpen] = useState(false);

  const interests = (tripMeta?.interests || []).map(s => String(s).toLowerCase());
  const cuisines = Array.isArray(tripMeta?.mealPreferences?.cuisineTypes)
    ? tripMeta!.mealPreferences!.cuisineTypes!.map(s => String(s).toLowerCase())
    : Array.isArray(tripMeta?.cuisinePreferences)
      ? (tripMeta!.cuisinePreferences as string[]).map(s => s.toLowerCase())
      : typeof tripMeta?.cuisinePreferences === 'string'
        ? [tripMeta!.cuisinePreferences!.toLowerCase()]
        : [];

  const mealCategories = ['food', 'restaurant', 'cafe', 'breakfast', 'lunch', 'dinner', 'snack'];

  // Synonyms so a "nightlife" interest still matches bars/clubs/lounges, etc.
  const interestSynonyms: Record<string, string[]> = {
    nightlife: ['nightlife', 'night life', 'bar', 'pub', 'club', 'lounge', 'cocktail', 'rooftop', 'حياة ليلية', 'بار', 'نادي', 'سهر'],
    entertainment: ['entertainment', 'show', 'theater', 'theatre', 'cinema', 'movie', 'concert', 'live music', 'arcade', 'amusement', 'park', 'ترفيه', 'عرض', 'مسرح', 'سينما', 'حفل'],
    relaxation: ['relax', 'spa', 'wellness', 'massage', 'sauna', 'thermal', 'beach', 'garden', 'park', 'استرخاء', 'سبا', 'تدليك', 'هدوء', 'حديقة'],
    food: ['food', 'restaurant', 'cafe', 'cuisine', 'dining', 'مطعم', 'طعام', 'مقهى'],
    shopping: ['shop', 'mall', 'market', 'bazaar', 'boutique', 'تسوق', 'سوق', 'مول'],
    culture: ['museum', 'gallery', 'heritage', 'historic', 'monument', 'art', 'متحف', 'تراث', 'تاريخي', 'فن'],
    adventure: ['adventure', 'hike', 'trek', 'climb', 'kayak', 'rafting', 'safari', 'مغامرة', 'تسلق'],
    sports: ['sport', 'stadium', 'gym', 'football', 'soccer', 'match', 'رياضة', 'ملعب', 'مباراة'],
    nature: ['nature', 'park', 'garden', 'lake', 'mountain', 'forest', 'beach', 'طبيعة', 'حديقة', 'بحيرة'],
  };

  const matchesInterest = (interest: string, text: string, cat: string): boolean => {
    const i = interest.toLowerCase().trim();
    if (!i) return false;
    if (text.includes(i) || cat.includes(i)) return true;
    const syns = interestSynonyms[i] || [];
    return syns.some(s => text.includes(s) || cat.includes(s));
  };

  const matchActivity = (a: Activity): { tags: string[]; matchedInterests: string[]; isFallback: boolean; isMeal: boolean } => {
    const matched: string[] = [];
    const matchedInterests: string[] = [];
    const cat = String((a as any).type || (a as any).category || '').toLowerCase();
    const text = `${a.title || (a as any).name || ''} ${a.description || ''} ${(a as any).matchReason || ''}`.toLowerCase();
    const isMeal = mealCategories.includes(cat);

    if (isMeal) {
      const mealTypeKey = ['breakfast','lunch','dinner','snack'].find(m => cat.startsWith(m));
      if (mealTypeKey) matched.push(isArabic
        ? ({ breakfast: '🍳 فطور', lunch: '🥗 غداء', dinner: '🍲 عشاء', snack: '🍿 وجبة خفيفة' } as any)[mealTypeKey]
        : ({ breakfast: '🍳 Breakfast', lunch: '🥗 Lunch', dinner: '🍲 Dinner', snack: '🍿 Snack' } as any)[mealTypeKey]);
      cuisines.forEach(c => {
        if (c && text.includes(c)) matched.push(`🍽️ ${c}`);
      });
      return { tags: matched, matchedInterests: [], isFallback: false, isMeal: true };
    }

    interests.forEach(i => {
      if (matchesInterest(i, text, cat)) {
        matched.push(`✨ ${i}`);
        matchedInterests.push(i);
      }
    });
    const isFallback = matched.length === 0;
    // Hidden from users: do not surface "fallback/احتياطي" labels in the UI.
    // Show the category as a neutral tag instead so the card still has context.
    if (isFallback && cat) matched.push(`✨ ${cat}`);
    return { tags: matched, matchedInterests, isFallback, isMeal: false };
  };

  if (!activities || activities.length === 0) return null;
  const hasAnyPref = interests.length > 0 || cuisines.length > 0;
  if (!hasAnyPref) return null;

  // Per-interest pass/fail summary
  const perInterestCounts = interests.map(interest => {
    const count = activities.reduce((acc, a) => {
      const cat = String((a as any).type || (a as any).category || '').toLowerCase();
      if (mealCategories.includes(cat)) return acc;
      const text = `${a.title || (a as any).name || ''} ${a.description || ''} ${(a as any).matchReason || ''}`.toLowerCase();
      return acc + (matchesInterest(interest, text, cat) ? 1 : 0);
    }, 0);
    return { interest, count, pass: count > 0 };
  });
  const nonMealActivities = activities.filter(a => {
    const cat = String((a as any).type || (a as any).category || '').toLowerCase();
    return !mealCategories.includes(cat);
  });
  const fallbackCount = nonMealActivities.reduce((acc, a) => {
    const r = matchActivity(a);
    return acc + (r.isFallback ? 1 : 0);
  }, 0);
  const allPassed = perInterestCounts.every(p => p.pass);

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
        data-html2canvas-ignore="true"
      >
        <span className="flex items-center gap-1.5">
          <Lightbulb size={12} className="text-primary" />
          {isArabic ? 'لماذا هذه الأنشطة؟ (تشخيص التفضيلات)' : 'Why these activities? (preference debug)'}
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${allPassed ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}`}>
            {allPassed ? (isArabic ? '✓ جميع التفضيلات' : '✓ All prefs') : (isArabic ? '⚠ نقص' : '⚠ Gap')}
          </span>
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          {/* Per-interest pass/fail summary */}
          {perInterestCounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-background/60 border border-border/40">
              <span className="text-[10px] text-muted-foreground w-full mb-0.5">
                {isArabic ? 'مطابقة التفضيلات في هذا اليوم:' : 'Interest match for this day:'}
              </span>
              {perInterestCounts.map(({ interest, count, pass }) => (
                <span
                  key={interest}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    pass
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  }`}
                  title={pass ? `${count} matching activities` : 'No matching activities found'}
                >
                  {pass ? '✓' : '✗'} {interest} <span className="opacity-70">({count})</span>
                </span>
              ))}
              {/* Fallback count hidden from users — internal only */}
            </div>
          )}
          {/* Per-activity rows */}
          {activities.map((a, idx) => {
            const { tags, isFallback, isMeal } = matchActivity(a);
            return (
              <div
                key={(a as any).id || idx}
                className={`flex items-start gap-2 text-[11px] rounded-lg p-2 border ${
                  isMeal
                    ? 'bg-background/60 border-border/40'
                    : 'bg-emerald-500/5 border-emerald-500/30'
                }`}
              >
                <span className="font-semibold text-foreground shrink-0">{idx + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                    {!isMeal && (
                      <span className="text-emerald-600">✓</span>
                    )}
                    {a.title || (a as any).name}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.length > 0 ? tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    )) : (
                      <span className="text-muted-foreground italic">
                        {isArabic ? 'نشاط ضمن خطتك' : 'Activity in your plan'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Regeneration Dialog with prompt & auto-regen
const RegenerateDialog = ({ 
  isOpen, onClose, onRegenerate, type, activityName, loading, regenCosts 
}: { 
  isOpen: boolean; onClose: () => void; onRegenerate: (prompt?: string, autoMode?: boolean) => void; 
  type: 'activity' | 'day' | 'full'; activityName?: string; loading: boolean;
  regenCosts?: { activity: number; day: number; full: number };
}) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [prompt, setPrompt] = useState('');
  const [autoMode, setAutoMode] = useState(false);
  
  const titles: Record<string, { ar: string; en: string }> = {
    activity: { ar: `إعادة توليد: ${activityName || 'فعالية'}`, en: `Regenerate: ${activityName || 'Activity'}` },
    day: { ar: 'إعادة توليد اليوم بالكامل', en: 'Regenerate Entire Day' },
    full: { ar: 'إعادة توليد الخطة بالكامل', en: 'Regenerate Full Plan' },
  };
  
  const placeholders: Record<string, { ar: string; en: string }> = {
    activity: { ar: 'مثال: أريد مكان أكثر هدوءاً أو مطعم ياباني بدلاً من هذا', en: 'e.g. I want a quieter place or a Japanese restaurant instead' },
    day: { ar: 'مثال: أريد يوم مليء بالمغامرات أو يوم استرخاء', en: 'e.g. I want an adventure-filled day or a relaxation day' },
    full: { ar: 'مثال: ركّز على الأماكن التاريخية أو أضف المزيد من المطاعم', en: 'e.g. Focus on historical places or add more restaurants' },
  };

  // Show cost as activity count (integer), not decimal credits
  const actCountForDay = regenCosts?.day ? Math.round(regenCosts.day / Math.max(regenCosts.activity || 1, 0.01)) : 5;
  const actCountForFull = regenCosts?.full ? Math.round(regenCosts.full / Math.max(regenCosts.activity || 1, 0.01)) : 15;
  const costDisplay: Record<string, { ar: string; en: string }> = {
    activity: { ar: `سيتم خصم 1 نشاط من رصيدك`, en: `1 activity will be deducted` },
    day: { ar: `سيتم خصم ${actCountForDay} أنشطة من رصيدك`, en: `${actCountForDay} activities will be deducted` },
    full: { ar: `سيتم خصم ${actCountForFull} نشاط من رصيدك`, en: `${actCountForFull} activities will be deducted` },
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw size={18} className="text-primary" />
            {isArabic ? titles[type].ar : titles[type].en}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Cost indicator */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <Sparkles size={14} className="text-amber-600 shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              {isArabic ? costDisplay[type].ar : costDisplay[type].en}
            </span>
          </div>

          {/* Auto-regen toggle */}
          <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/30 cursor-pointer">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <div>
                <span className="text-sm font-medium">{isArabic ? 'الوضع التلقائي' : 'Auto Mode'}</span>
                <p className="text-[10px] text-muted-foreground">
                  {isArabic ? 'سيتم التوليد تلقائياً بأفضل النتائج' : 'AI will automatically generate the best result'}
                </p>
              </div>
            </div>
            <input type="checkbox" checked={autoMode} onChange={e => { setAutoMode(e.target.checked); if (e.target.checked) setPrompt(''); }}
              className="rounded border-primary text-primary focus:ring-primary h-4 w-4" />
          </label>

          {/* Prompt input - show when not in auto mode */}
          {!autoMode && (
            <div>
              <Label className="text-sm mb-2 block">
                {isArabic ? 'ماذا تريد تغييره بالضبط؟' : 'What exactly do you want to change?'}
              </Label>
              <Textarea 
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isArabic ? placeholders[type].ar : placeholders[type].en}
                rows={3}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {isArabic ? '💡 كلما كان وصفك دقيقاً، كانت النتيجة أفضل' : '💡 The more specific your description, the better the result'}
              </p>
            </div>
          )}

          {/* Warning about possible repeats */}
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <Lightbulb size={14} className="text-blue-600 shrink-0 mt-0.5" />
            <span className="text-[11px] text-blue-700 dark:text-blue-300">
              {isArabic 
                ? 'ملاحظة: قد يتم توليد نفس النشاط مرة أخرى في حال كانت الخيارات محدودة في هذه الوجهة.'
                : 'Note: The same activity may appear again if options are limited for this destination.'}
            </span>
          </div>

          {!autoMode && (
            <div className="flex flex-wrap gap-1.5">
              {(type === 'activity' ? (
                isArabic 
                  ? ['مكان أقرب', 'أرخص', 'مناسب للعائلة', 'أكثر شعبية', 'مطعم بديل']
                  : ['Closer place', 'Cheaper', 'Family-friendly', 'More popular', 'Different restaurant']
              ) : type === 'day' ? (
                isArabic
                  ? ['يوم مغامرات', 'يوم استرخاء', 'يوم ثقافي', 'يوم تسوق', 'أماكن أقل ازدحاماً']
                  : ['Adventure day', 'Relaxation day', 'Cultural day', 'Shopping day', 'Less crowded']
              ) : (
                isArabic
                  ? ['المزيد من المطاعم', 'أماكن تاريخية', 'ميزانية أقل', 'مناسب للأطفال']
                  : ['More restaurants', 'Historical places', 'Lower budget', 'Kid-friendly']
              )).map(suggestion => (
                <button key={suggestion} type="button"
                  onClick={() => setPrompt(prev => prev ? `${prev}, ${suggestion}` : suggestion)}
                  className="text-[10px] px-2 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors">
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} size="sm" disabled={loading}>
            {isArabic ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={() => { onRegenerate(autoMode ? undefined : (prompt.trim() || undefined), autoMode); }} disabled={loading} size="sm" className="gap-1.5">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {autoMode 
              ? (isArabic ? 'توليد تلقائي' : 'Auto Generate')
              : (isArabic ? 'إعادة التوليد' : 'Regenerate')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ItinerarySchedule = ({ 
  destination, itinerary, day, onMapClick, onUpdateDay, onMoveActivity,
  onRegenerateActivity, onRegenerateDay, regenerating = false,
  dayIndex = 0, totalDays = 1, fuelSettings = { efficiency: 8, price: 2.5 },
  regenCosts = { activity: 0.25, day: 0.5, full: 1 },
  tripMeta, remainingActivities
}: ItineraryScheduleProps) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [movingActivityId, setMovingActivityId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>(sortActivitiesChronologically(day?.activities || []));
  const [regenDialog, setRegenDialog] = useState<{ type: 'activity' | 'day' | 'full'; activityId?: string; activityName?: string } | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenLoadingActivityId, setRegenLoadingActivityId] = useState<string | null>(null);
  const [shareDayOpen, setShareDayOpen] = useState(false);
  const [shareActivity, setShareActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (day?.activities && !isEditing) setActivities(sortActivitiesChronologically(day.activities));
  }, [day?.activities, isEditing]);

  const handleReorder = (newOrder: Activity[]) => {
    const recalculated = recalculateTimes(newOrder);
    setActivities(recalculated);
    if (day && onUpdateDay) onUpdateDay({ ...day, activities: recalculated });
  };

  const handleEditSave = (updated: Activity) => {
    const newActivities = activities.map(a => a.id === updated.id ? updated : a);
    setActivities(newActivities);
    if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
    setEditingActivity(null);
  };

  const handleAddNew = (newActivity: Activity) => {
    const lastScheduled = [...activities]
      .reverse()
      .find((activity) => !activity.isMatchAnchor && String(activity.startTime || activity.time || '').trim());

    const originalStart = String(newActivity.startTime || newActivity.time || '').trim() || (lastScheduled?.endTime || '');
    const originalEnd = String(newActivity.endTime || '').trim();
    const nextTimedActivity = normalizeActivityTimeRange({
      ...newActivity,
      startTime: originalStart,
      time: originalStart,
      endTime: originalEnd,
    }, 9 + activities.length * 2);

    // ── Conflict detection: if the requested slot overlaps any existing
    // activity, find the next free slot of the same duration and reschedule
    // the new activity there. Notify the user with the alternative time.
    const reqStart = parseActivityTime(nextTimedActivity.startTime, 9);
    const reqEnd = parseActivityTime(nextTimedActivity.endTime, reqStart.hour + 2);
    let reqStartMin = reqStart.hour * 60 + reqStart.minute;
    let reqEndMin = reqEnd.hour * 60 + reqEnd.minute;
    if (reqEndMin <= reqStartMin) reqEndMin = reqStartMin + 120;
    const duration = reqEndMin - reqStartMin;

    const occupied = activities
      .filter((a) => String(a.startTime || a.time || '').trim() && String(a.endTime || '').trim())
      .map((a) => {
        const s = parseActivityTime(a.startTime || a.time, 9);
        const e = parseActivityTime(a.endTime, s.hour + 2);
        let sm = s.hour * 60 + s.minute;
        let em = e.hour * 60 + e.minute;
        if (em <= sm) em = sm + 120;
        return { sm, em };
      })
      .sort((a, b) => a.sm - b.sm);

    const overlaps = (sm: number, em: number) =>
      occupied.some((slot) => sm < slot.em && em > slot.sm);

    let finalActivity = nextTimedActivity;
    if (overlaps(reqStartMin, reqEndMin)) {
      // Search for the next free slot starting from the requested time, then
      // from the end of each occupied block. Cap the search to 22:00.
      const candidates: number[] = [reqStartMin, ...occupied.map((s) => s.em)];
      let chosen: number | null = null;
      for (const start of candidates.sort((a, b) => a - b)) {
        const end = start + duration;
        if (end > 22 * 60) break;
        if (!overlaps(start, end)) { chosen = start; break; }
      }
      if (chosen === null) chosen = (occupied[occupied.length - 1]?.em ?? reqStartMin);
      const altEnd = chosen + duration;
      const altStartStr = formatDisplayTime(Math.floor(chosen / 60), chosen % 60);
      const altEndStr = formatDisplayTime(Math.floor(altEnd / 60), altEnd % 60);
      finalActivity = {
        ...nextTimedActivity,
        startTime: altStartStr,
        time: altStartStr,
        endTime: altEndStr,
      };
      toast.info(isArabic
        ? `الوقت المطلوب ${nextTimedActivity.startTime} يتعارض مع نشاط آخر — تمت إعادة الجدولة إلى ${altStartStr}`
        : `Requested ${nextTimedActivity.startTime} conflicts with another activity — rescheduled to ${altStartStr}`);
    }

    const withId = { ...finalActivity, id: `act-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
    // Sort by start time to keep the day in chronological order, then chain
    // any subsequent activities forward through recalculateTimes.
    const merged = [...activities, withId].sort((a, b) => {
      const ap = parseActivityTime(a.startTime || a.time, 99);
      const bp = parseActivityTime(b.startTime || b.time, 99);
      return (ap.hour * 60 + ap.minute) - (bp.hour * 60 + bp.minute);
    });
    const newActivities = recalculateTimes(merged);
    setActivities(newActivities);
    if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
    setIsAddingNew(false);
  };

  const handleDelete = (activityId: string) => {
    const newActivities = recalculateTimes(activities.filter(a => a.id !== activityId));
    setActivities(newActivities);
    if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
    toast.success(t('itinerary.activityDeleted', { defaultValue: 'Activity deleted' }));
  };

  const handleToggleComplete = (activityId: string) => {
    const newActivities = activities.map(a => a.id === activityId ? { ...a, completed: !a.completed } : a);
    setActivities(newActivities);
    if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
  };

  const handleMoveToDay = (toDayIndex: number) => {
    if (movingActivityId && onMoveActivity) {
      onMoveActivity(movingActivityId, dayIndex, toDayIndex);
      const newActivities = activities.filter(a => a.id !== movingActivityId);
      setActivities(newActivities);
      toast.success(`${t('itinerary.movedToDay', { defaultValue: 'Activity moved to Day' })} ${toDayIndex + 1}`);
    }
    setMovingActivityId(null);
  };

  const handleRegenerate = async (prompt?: string) => {
    if (!regenDialog) return;
    // Block if activity balance is exhausted
    if (remainingActivities !== null && remainingActivities !== undefined && remainingActivities <= 0) {
      toast.error(isArabic ? '⚠️ لقد استنفدت جميع الأنشطة المتاحة في باقتك. يرجى الترقية.' : '⚠️ Activity balance exhausted. Please upgrade.');
      setRegenDialog(null);
      return;
    }
    setRegenLoading(true);
    setRegenLoadingActivityId(regenDialog.type === 'activity' ? regenDialog.activityId || null : null);
    try {
      if (regenDialog.type === 'activity' && regenDialog.activityId && onRegenerateActivity) {
        const oldAct: any = activities.find(a => a.id === regenDialog.activityId);
        const oldFp = activityFingerprint(oldAct);
        const newAct = await onRegenerateActivity(regenDialog.activityId, dayIndex, prompt);
        if (newAct) {
          const newFp = activityFingerprint(newAct);
          // Hash-based dedup check: if backend returned the same place,
          // keep the original and inform the user instead of silently replacing.
          if (oldFp && newFp && oldFp === newFp) {
            toast.message(isArabic
              ? '⏭️ تم تخطي التوليد: نفس المكان عاد من البحث'
              : '⏭️ Skipped: search returned the same place', {
              description: isArabic
                ? 'حاول تعديل التفضيلات أو إضافة وصف مختلف لإعادة التوليد.'
                : 'Try adjusting preferences or adding a different prompt to regenerate.',
            });
          } else {
            const newActivities = activities.map(a => a.id === regenDialog.activityId ? { ...newAct, id: a.id } : a);
            setActivities(newActivities);
            if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
            toast.success(isArabic ? '✅ تم إعادة توليد الفعالية' : '✅ Activity regenerated');
          }
        }
      } else if (regenDialog.type === 'day' && onRegenerateDay) {
        const oldFps = activities.map(activityFingerprint).filter(Boolean).sort().join('|');
        const newActivities = await onRegenerateDay(dayIndex, prompt);
        if (newActivities) {
          const newFps = newActivities.map((a: any) => activityFingerprint(a)).filter(Boolean).sort().join('|');
          if (oldFps && newFps && oldFps === newFps) {
            toast.message(isArabic
              ? '⏭️ تم تخطي التوليد: عادت نفس الأماكن'
              : '⏭️ Skipped: same places returned', {
              description: isArabic
                ? 'لم يتم استبدال الأنشطة. جرّب تغيير التفضيلات.'
                : 'Activities not replaced. Try changing your preferences.',
            });
          } else {
            setActivities(newActivities);
            if (day && onUpdateDay) onUpdateDay({ ...day, activities: newActivities });
            toast.success(isArabic ? '✅ تم إعادة توليد اليوم' : '✅ Day regenerated');
          }
        }
      }
    } catch (err) {
      console.error('Regeneration error:', err);
      toast.error(getFriendlyGenerationError(err, isArabic));
    }
    setRegenLoading(false);
    setRegenLoadingActivityId(null);
    setRegenDialog(null);
  };

  if (day) {
    const dayDate = new Date(day.date);
    const dayCardId = `day-card-${(day as any).dayNumber || dayIndex}`;
    const handleShareDay = () => setShareDayOpen(true);
    return (
      <div data-day-card={dayCardId} className="bg-card rounded-2xl shadow-sm border border-border p-2 sm:p-6 max-w-full overflow-hidden min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3 mb-3 max-w-full">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="bg-primary text-primary-foreground p-2 sm:p-2.5 rounded-xl shrink-0"><Calendar size={18} className="sm:w-5 sm:h-5" /></div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-bold text-foreground truncate">{format(dayDate, "EEEE, MMMM d, yyyy", { locale: i18n.language?.startsWith('ar') ? ar : i18n.language?.startsWith('zh') ? zhCN : i18n.language?.startsWith('ru') ? ru : enUS })}</h2>
              <DayCounterBadge
                activities={activities}
                targetCount={Number(tripMeta?.totalDailyItemsTarget) || (Number(tripMeta?.activitiesPerDay) > 0 ? Number(tripMeta?.activitiesPerDay) : Number(tripMeta?.maxActivitiesPerDay) || undefined)}
                mealPreferences={tripMeta?.mealPreferences || null}
                interests={tripMeta?.interests || []}
                tripType={tripMeta?.tripType}
                preferenceSummary={day.preferenceSummary}
              />
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0 max-w-full self-start" data-html2canvas-ignore="true">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShareDay}
              className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs h-7 sm:h-9 px-2 sm:px-3 rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
              title={isArabic ? 'مشاركة اليوم' : 'Share Day'}
            >
              <Share2 size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">{isArabic ? 'مشاركة' : 'Share'}</span>
            </Button>
            {onRegenerateDay && (
              <div className="relative group/regenday">
                <Button variant="outline" size="sm" onClick={() => setRegenDialog({ type: 'day' })} 
                  disabled={regenerating || regenLoading} className="gap-1 sm:gap-1.5 text-[10px] sm:text-xs h-7 sm:h-9 px-2 sm:px-3 rounded-lg border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm">
                  {regenLoading ? <Loader2 size={12} className="animate-spin sm:w-3.5 sm:h-3.5" /> : <RefreshCw size={12} className="sm:w-3.5 sm:h-3.5" />}
                  <span className="hidden sm:inline">{isArabic ? 'إعادة توليد اليوم' : 'Regen Day'}</span>
                </Button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-foreground text-background text-[10px] font-medium rounded-lg shadow-lg opacity-0 group-hover/regenday:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                  {isArabic ? `سيتم خصم أنشطة اليوم من رصيدك` : `Day activities will be deducted`}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-foreground" />
                </div>
              </div>
            )}
            <Button variant={isEditing ? "default" : "outline"} size="sm" onClick={() => setIsEditing(!isEditing)} className="gap-1 sm:gap-1.5 h-7 sm:h-9 text-[10px] sm:text-xs px-2 sm:px-3">
              {isEditing ? (<><Check size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">{t('itinerary.done', { defaultValue: 'Done' })}</span></>) : (<><Edit3 size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">{t('common.edit', { defaultValue: 'Edit' })}</span></>)}
            </Button>
          </div>
        </div>

        <TripStats activities={activities as any} fuelEfficiency={fuelSettings.efficiency} fuelPrice={fuelSettings.price} />

        {/* Internal preference diagnostic panel hidden from end users */}
        {false && <WhyTheseActivitiesPanel activities={activities} tripMeta={tripMeta} />}

        <Reorder.Group values={activities} onReorder={handleReorder} className="space-y-0">
          {activities.map((activity, index) => (
            <React.Fragment key={activity.id || index}>
              {index > 0 && (
                <TravelLegBadge from={activities[index - 1] as any} to={activity as any} />
              )}
            <Reorder.Item key={activity.id || index} value={activity} dragListener={isEditing}>
              <div className="relative group"
                draggable={!isEditing}
                onDragStart={(e) => {
                  e.dataTransfer.setData('activityId', activity.id);
                  e.dataTransfer.setData('fromDay', String(dayIndex));
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <ActivityCard activity={activity} index={index} onMapClick={onMapClick} destination={destination}
                  date={dayDate} onEdit={setEditingActivity} onDelete={handleDelete} onMove={setMovingActivityId}
                  onToggleComplete={handleToggleComplete}
                  isEditing={isEditing} dayIndex={dayIndex} totalDays={totalDays}
                  regenButton={!isEditing ? (
                    <div className="relative shrink-0 flex items-center gap-1" data-no-card-open="true">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setShareActivity(activity);
                        }}
                        className="h-7 w-7 p-0 rounded-lg border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
                        data-no-card-open="true"
                        title={isArabic ? 'مشاركة النشاط' : 'Share activity'}
                      >
                        <Share2 size={12} />
                      </Button>
                      {onRegenerateActivity && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setRegenDialog({ type: 'activity', activityId: activity.id, activityName: activity.title || activity.name }); }}
                          disabled={regenLoading}
                          className="h-7 min-w-[62px] gap-1 px-2 rounded-lg border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground transition-all text-[11px] font-medium shadow-sm"
                          data-no-card-open="true"
                        >
                          {regenLoading && regenLoadingActivityId === activity.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                          <span className="hidden xs:inline">{isArabic ? 'تبديل' : 'Swap'}</span>
                        </Button>
                      )}
                    </div>
                  ) : undefined} />
                </div>
              </Reorder.Item>
            </React.Fragment>
            ))}
          </Reorder.Group>

        {/* Publish Story Buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          <PublishDayStoryButton activities={activities} dayDate={dayDate} destination={destination} dayIndex={dayIndex} />
        </div>

        {/* Add Activity Button */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
          <Button variant="outline" className="w-full max-w-full gap-2 h-12 sm:h-14 px-3 sm:px-4 border-dashed border-2 border-primary/30 rounded-2xl text-primary hover:bg-primary/5 hover:border-primary/50 transition-all text-xs sm:text-sm font-medium overflow-hidden"
            onClick={() => { setIsAddingNew(true); setEditingActivity({ id: '', title: '', description: '', startTime: '', endTime: '', address: '', type: 'attraction', cost: 0 }); }}>
            <div className="bg-primary/10 p-1.5 rounded-lg shrink-0"><Plus size={16} className="text-primary" /></div>
            <span className="truncate">{t('itinerary.addNewActivity', { defaultValue: 'Add New Activity' })}</span>
          </Button>
        </motion.div>

        <EditActivityModal activity={editingActivity} isOpen={!!editingActivity} 
          onClose={() => { setEditingActivity(null); setIsAddingNew(false); }} 
          onSave={isAddingNew ? handleAddNew : handleEditSave}
          isNew={isAddingNew}
          destination={destination}
          suggestedStartTime={(() => {
            const lastScheduled = [...activities].reverse().find((a) => !a.isMatchAnchor && String(a.startTime || a.time || '').trim());
            return lastScheduled?.endTime || '';
          })()}
          onAutoGenerate={isAddingNew && onRegenerateActivity ? async (draft) => {
            // Block if activity balance is exhausted
            if (remainingActivities !== null && remainingActivities !== undefined && remainingActivities <= 0) {
              toast.error(isArabic ? '⚠️ لقد استنفدت جميع الأنشطة المتاحة في باقتك.' : '⚠️ Activity balance exhausted.');
              return null;
            }
            const cityName = (day as any)?.cityName || destination || '';
            const existingNames = activities.map(a => a.title || a.name || '').filter(Boolean);
            const cuisineTypes = Array.isArray(tripMeta?.cuisinePreferences)
              ? tripMeta.cuisinePreferences.filter(Boolean)
              : typeof tripMeta?.cuisinePreferences === 'string' && tripMeta.cuisinePreferences.trim()
                ? [tripMeta.cuisinePreferences.trim()]
                : Array.isArray(tripMeta?.mealPreferences?.cuisineTypes)
                  ? tripMeta.mealPreferences.cuisineTypes.filter(Boolean)
                  : [];
            const explicitPrompt = String(draft.customPrompt || '').trim();
            const mergedRequests = explicitPrompt || String(tripMeta?.specialRequests || '').trim() || undefined;
            try {
              const { data, error } = await invokeGenerateTripWithRetry({
                destination: cityName,
                duration: 1,
                regenMode: 'activity',
                currentActivityName: draft.title || draft.name || '',
                currentActivityDescription: draft.description || '',
                currentActivityCategory: draft.type || 'attraction',
                customPrompt: explicitPrompt || undefined,
                regenPrompt: explicitPrompt || undefined,
                excludeActivityNames: existingNames,
                interests: tripMeta?.interests || [],
                tripType: tripMeta?.tripType,
                travelStyle: tripMeta?.travelStyle,
                cuisinePreferences: cuisineTypes,
                cuisineTypes,
                mealPreferences: tripMeta?.mealPreferences || undefined,
                specialRequests: mergedRequests,
                budget: tripMeta?.budget,
                activitiesPerDay: Math.max(1, Number(tripMeta?.activitiesPerDay) || Math.max(1, activities.length || 5)),
                maxActivitiesPerDay: Math.max(1, Number(tripMeta?.totalDailyItemsTarget) || Number(tripMeta?.maxActivitiesPerDay) || Math.max(1, activities.length || 5)),
                maxTotalActivitiesRemaining: remainingActivities,
                lang: i18n.language,
              }, {
                maxRetries: 3,
                perAttemptTimeoutMs: 45000,
                timeoutMessage: isArabic
                  ? 'انتهت مهلة توليد النشاط. حاول مرة أخرى.'
                  : 'Activity generation timed out. Please try again.',
              });
              if (error) throw new Error(getFriendlyGenerationError(error, isArabic));
              if (data?.error) throw new Error(getFriendlyGenerationError(data.error, isArabic));
              const generatedActivity = data?.days?.[0]?.activities?.[0] || data?.itinerary?.[0]?.activities?.[0] || null;
              if (generatedActivity && user) {
                const { error: usageError } = await supabase.from('usage_tracking').insert({
                  user_id: user.id,
                  feature: 'regen_activity',
                  quantity: 1,
                } as any);
                if (usageError) {
                  throw new Error(isArabic ? 'تعذر تحديث رصيد الأنشطة الآن. حاول مرة أخرى.' : 'Could not update activity balance right now. Please try again.');
                }
                window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
              }
              return generatedActivity;
            } catch (error) {
              toast.error(getFriendlyGenerationError(error, isArabic));
              return null;
            }
          } : undefined}
        />
        <MoveActivityModal isOpen={!!movingActivityId} onClose={() => setMovingActivityId(null)} onMove={handleMoveToDay} currentDay={dayIndex} totalDays={totalDays} />
        <RegenerateDialog 
          isOpen={!!regenDialog} 
          onClose={() => setRegenDialog(null)} 
          onRegenerate={handleRegenerate}
          type={regenDialog?.type || 'activity'}
          activityName={regenDialog?.activityName}
          loading={regenLoading}
          regenCosts={regenCosts}
        />
        <ShareSocialDialog
          open={shareDayOpen}
          onOpenChange={setShareDayOpen}
          isArabic={isArabic}
          title={isArabic ? `مشاركة اليوم ${dayIndex + 1}` : `Share Day ${dayIndex + 1}`}
          build={() =>
            buildDayShareNode({
              day: { ...day, activities, dayNumber: (day as any).dayNumber || dayIndex + 1 },
              dayIndex,
              destination,
              itinerary: (typeof window !== 'undefined' ? (window as any).__currentItinerary : undefined),
              isArabic,
              language: i18n.language,
            })
          }
        />
        <ShareSocialDialog
          open={!!shareActivity}
          onOpenChange={(open) => !open && setShareActivity(null)}
          isArabic={isArabic}
          title={isArabic ? 'مشاركة النشاط' : 'Share Activity'}
          build={() =>
            buildActivityShareNode({
              activity: shareActivity!,
              dayIndex,
              destination,
              isArabic,
              language: i18n.language,
            })
          }
        />
      </div>
    );
  }

  // Full itinerary view
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">{t('itinerary.yourTripTo', { defaultValue: 'Your Trip to' })}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{destination}</h1>
        </div>
      </div>
      <div>
        {itinerary?.map((dayItem, index) => {
          const dayDate = new Date(dayItem.date);
          return (
            <div key={index} className="mb-8 last:mb-0">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-primary text-primary-foreground p-2.5 rounded-xl"><Calendar size={20} /></div>
                <h2 className="text-lg font-bold text-foreground">{t('itinerary.day', { defaultValue: 'Day' })} {index + 1} — {format(dayDate, "EEEE, MMM d", { locale: i18n.language?.startsWith('ar') ? ar : i18n.language?.startsWith('zh') ? zhCN : i18n.language?.startsWith('ru') ? ru : enUS })}</h2>
              </div>
              <div className="ml-2">
                {dayItem.activities.map((activity: any, actIdx: number) => (
                  <ActivityCard key={activity.id || actIdx} activity={activity} index={actIdx} onMapClick={onMapClick} date={dayDate} onToggleComplete={() => {}} destination={destination} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ItinerarySchedule;
