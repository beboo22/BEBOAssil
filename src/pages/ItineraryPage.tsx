import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { localizeInterest, resolveLang } from "@/lib/preferenceLabels";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Check, Calendar, Share2, Download, MapPin, Clock, DollarSign,
  Star, ChevronLeft, Navigation, Lightbulb, Fuel, Route, Settings, Car, FileText, Loader2,
  Globe, Phone, Shield, Languages, Coins, Mail, Link as LinkIcon, BookmarkCheck, Bookmark,
  Plane, Hotel, Camera, Archive, Film, Plus, Sparkles
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import BookingCostSummary from "@/components/booking/BookingCostSummary";
import SelectedTripBookings from "@/components/booking/SelectedTripBookings";
import { enforceDailyItemLimit } from "@/utils/enforceDailyItemLimit";
import { auditItineraryPreferences } from "@/utils/auditItineraryPreferences";
import { resyncMissingItems } from "@/utils/resyncItinerary";
import { healItineraryFlags } from "@/utils/healFlags";
import { applyStrictDaySchedule, parseWakeSleep } from "@/utils/strictDayScheduler";
import { format, isValid, addDays } from "date-fns";
import { getFriendlyGenerationError } from "@/lib/generationErrors";

// ────────────────────────────────────────────────────────────────────────────
// Retry helper for generate-trip edge function (prevents 504s during long
// generations or share-time exports). Retries on network/timeout errors with
// exponential backoff and a per-attempt timeout (default 45s).
// ────────────────────────────────────────────────────────────────────────────
async function invokeGenerateTripWithRetry(
  body: any,
  opts: { maxRetries?: number; perAttemptTimeoutMs?: number; timeoutMessage?: string } = {},
): Promise<{ data: any; error: any }> {
  // Bumped to 3 retries (4 total attempts) and a longer per-attempt budget
  // so the busy-edge-runtime path almost always recovers without showing
  // the user the "service was busy" toast.
  const maxRetries = opts.maxRetries ?? 3;
  const perAttemptTimeoutMs = opts.perAttemptTimeoutMs ?? 60000;
  const timeoutMessage = opts.timeoutMessage || "Request timed out. Please try again.";
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const callPromise = supabase.functions.invoke('generate-trip', { body });
      const result = await Promise.race([
        callPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(timeoutMessage)), perAttemptTimeoutMs),
        ),
      ]) as any;

      const err = result?.error;
      const isRetryableErr =
        err && (
          /504|timeout|gateway|fetch|network|abort|failed to send/i.test(String(err?.message || err))
          || err?.status === 504 || err?.status === 502 || err?.status === 503
        );

      if (err && isRetryableErr && attempt < maxRetries) {
        console.warn(`[generate-trip] attempt ${attempt + 1} failed (${err?.message || err}), retrying in ${(attempt + 1) * 2}s...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        lastError = err;
        continue;
      }
      return result;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e || "");
      const isRetryable = /timeout|fetch|network|abort|failed to send|504|502|503/i.test(msg);
      if (isRetryable && attempt < maxRetries) {
        console.warn(`[generate-trip] attempt ${attempt + 1} threw (${msg}), retrying in ${(attempt + 1) * 2}s...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastError || new Error(timeoutMessage);
}

// Safe date parser to avoid "Invalid time value" RangeError
function safeDate(value: string | Date | undefined | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return isValid(value) ? value : new Date();
  // Try ISO or standard parse first
  const d = new Date(value);
  if (isValid(d)) return d;
  // Try manual YYYY-MM-DD parse
  const parts = String(value).split(/[-/T]/);
  if (parts.length >= 3) {
    const manual = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isValid(manual)) return manual;
  }
  return new Date();
}

function safeFormat(value: string | Date | undefined | null, fmt: string): string {
  try {
    return format(safeDate(value), fmt);
  } catch {
    return "—";
  }
}

function toTripDateKey(value: string | Date | undefined | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = safeDate(value);
  return isValid(d) ? format(d, "yyyy-MM-dd") : "";
}

const isMealActivity = (activity: any): boolean => {
  const raw = `${activity?.category || ""} ${activity?.type || ""} ${activity?.title || ""} ${activity?.name || ""}`.toLowerCase();
  return /\bbreakfast\b|\blunch\b|\bdinner\b|\bsnacks?\b|فطور|غداء|عشاء|وجبة\s*خفيفة/.test(raw);
};

function normalizePersistedActivityTimes(itineraryData: any) {
  if (!Array.isArray(itineraryData?.days)) {
    return { itinerary: itineraryData, corrected: false, correctedCount: 0, conflictsResolved: 0 };
  }

  let correctedCount = 0;
  let conflictsResolved = 0;

  const formatTime = (hour24: number, minute: number) => {
    const normalizedHour = ((hour24 % 24) + 24) % 24;
    const period = normalizedHour >= 12 ? 'PM' : 'AM';
    const hour12 = normalizedHour > 12 ? normalizedHour - 12 : normalizedHour === 0 ? 12 : normalizedHour;
    return `${hour12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  const parseTime = (raw: string, fallbackHour: number): { hour: number; minute: number } => {
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

  const normalizedDays = itineraryData.days.map((day: any) => {
    if (!Array.isArray(day?.activities)) return day;

    // Step 1: per-activity normalization (start < end)
    const stepOne = day.activities.map((activity: any, index: number) => {
      if (activity?.isMatchAnchor) return activity;

      const rawStart = String(activity?.startTime || activity?.time || '').trim();
      const rawEnd = String(activity?.endTime || '').trim();
      const fallbackHour = 9 + index * 2;
      const { hour: startHour, minute: startMinute } = parseTime(rawStart, fallbackHour);
      let { hour: endHour, minute: endMinute } = parseTime(rawEnd, startHour + 2);
      if (endHour < startHour || (endHour === startHour && endMinute <= startMinute)) {
        endHour = startHour + 2;
        endMinute = startMinute;
      }

      const normalizedStart = formatTime(startHour, startMinute);
      const normalizedEnd = formatTime(endHour, endMinute);
      if (rawStart !== normalizedStart || (rawEnd && rawEnd !== normalizedEnd)) correctedCount += 1;

      return {
        ...activity,
        startTime: normalizedStart,
        time: normalizedStart,
        endTime: normalizedEnd,
        _startMin: startHour * 60 + startMinute,
        _endMin: endHour * 60 + endMinute,
      };
    });

    // Step 2: conflict detection — if an activity overlaps the previous one,
    // reschedule it to start at the previous end (preserving its duration)
    // and cascade subsequent shifts.
    let cursor = -1;
    const stepTwo = stepOne.map((act: any) => {
      if (act?.isMatchAnchor || isMealActivity(act) || act._startMin === undefined) {
        if (Number.isFinite(act?._endMin)) cursor = Math.max(cursor, act._endMin);
        return act;
      }
      const duration = Math.max(30, Math.min(240, (act._endMin || act._startMin + 120) - act._startMin));
      let start = act._startMin;
      if (cursor >= 0 && start < cursor) {
        start = cursor;
        conflictsResolved += 1;
      }
      const end = start + duration;
      cursor = end;
      const newStart = formatTime(Math.floor(start / 60), start % 60);
      const newEnd = formatTime(Math.floor(end / 60), end % 60);
      const { _startMin, _endMin, ...clean } = act;
      return { ...clean, startTime: newStart, time: newStart, endTime: newEnd };
    });

    return { ...day, activities: stepTwo };
  });

  return {
    itinerary: { ...itineraryData, days: normalizedDays },
    corrected: correctedCount > 0 || conflictsResolved > 0,
    correctedCount,
    conflictsResolved,
  };
}

function getActivityMapUrl(activity: any): string {
  // Always use text-based search for accurate results — AI-generated short URLs (goo.gl) are unreliable
  const placeName = activity?.title || activity?.name || "";
  const address = activity?.address || activity?.location || "";
  const query = `${placeName} ${address}`.trim();
  if (query) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  if (Number.isFinite(activity?.latitude) && Number.isFinite(activity?.longitude)) {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }
  return '#';
}
import { useTranslation } from "react-i18next";
import ItinerarySchedule from "@/components/ItinerarySchedule";
import { shareFullPlanAsImage } from "@/utils/shareAsImage";
import ItineraryMap from "@/components/ItineraryMap";
import PrintableItinerary from "@/components/PrintableItinerary";
import { toast } from "sonner";
import DestinationInfoCard from "@/components/DestinationInfoCard";
import { generateUniqueActivities } from "@/utils/calendarUtils";
import { generateFullItinerary, validateAndRepairItinerary, generateItineraryPDF, generateInteractiveHTML, calculateDayTripStats } from "@/utils/itineraryUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TripReelsExport } from "@/components/stories/TripReelsExport";
import PartnerDealsSection from "@/components/PartnerDealsSection";

const generateSampleItinerary = (destination: string, startDate: Date, duration: number) => {
  const days = [];
  const allUsedAttractions: string[] = [];

  for (let i = 0; i < duration; i++) {
    const dayDate = new Date(startDate);
    dayDate.setDate(startDate.getDate() + i);
    const activitiesCount = Math.floor(Math.random() * 4) + 3;
    const activities = generateUniqueActivities(destination, activitiesCount, allUsedAttractions);
    allUsedAttractions.push(...activities.map((a: any) => a.title));
    days.push({ date: dayDate, activities });
  }

  return {
    id: Math.random().toString(36).substring(2, 10),
    destination,
    startDate,
    endDate: (() => { const d = new Date(startDate); d.setDate(startDate.getDate() + duration - 1); return d; })(),
    duration,
    days,
  };
};

const ItineraryPage = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDay, setActiveDay] = useState(0);
  const [itinerary, setItinerary] = useState<any>(null);
  const resyncedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRCodes, setShowQRCodes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFuelSettings, setShowFuelSettings] = useState(false);
  const [fuelSettings, setFuelSettings] = useState({ efficiency: 8, price: 2.5 });
  const [sharing, setSharing] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareOptions, setShareOptions] = useState({
    fullTrip: true,
    photosOnly: false,
    reviewsOnly: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);
  const mobileDayTabsRef = useRef<HTMLDivElement>(null);
  const dayBtnRefs = useRef<Record<number, HTMLButtonElement>>({});
  const [destInfoData, setDestInfoData] = useState<any>(null);
  const [savingMemory, setSavingMemory] = useState(false);
  const [showTripReels, setShowTripReels] = useState(false);
  const [remainingCredits, setRemainingCredits] = useState<{ used: number; limit: number; planName: string | null; totalActivities: number | null; usedActivities: number; remainingActivities: number | null } | null>(null);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfShareUrl, setPdfShareUrl] = useState<string>("");
  const [renderPrintable, setRenderPrintable] = useState(false);
  const latestItineraryRef = useRef<any>(null);
  const lastTimeCorrectionSignatureRef = useRef<string>("");

  useEffect(() => {
    latestItineraryRef.current = itinerary;
  }, [itinerary]);

  // Fetch remaining daily credits + total subscription activities
  const fetchRemainingCredits = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (!user) {
        // Guest: fetch from site_settings
        const { data: settings } = await supabase
          .from('site_settings')
          .select('guest_trial_limit, guest_generation_enabled')
          .eq('id', 'default')
          .maybeSingle();
        const guestLimit = settings?.guest_trial_limit || 1;
        const guestId = localStorage.getItem('guest_id') || '';
        let guestUsed = 0;
        if (guestId) {
          const { count } = await supabase
            .from('usage_tracking')
            .select('id', { count: 'exact', head: true })
            .eq('guest_id', guestId)
            .gte('used_at', today.toISOString());
          guestUsed = count || 0;
        }
        setRemainingCredits({
          used: guestUsed,
          limit: guestLimit,
          planName: i18n.language?.startsWith('ar') ? 'ضيف' : 'Guest',
          totalActivities: null,
          usedActivities: 0,
          remainingActivities: null,
        });
        return;
      }
      
      // Daily count = NUMBER OF ROWS today (each generation event = 1 row regardless of quantity)
      const { count: dailyRowCount } = await supabase
        .from('usage_tracking')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('used_at', today.toISOString());
      const usedCount = dailyRowCount || 0;
      
      // Get user's plan limits
      const { data: sub } = await supabase
        .from('user_subscriptions')
        .select('plan_id, starts_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let dailyLimit = 5; // free default
      let planName: string | null = null;
      let totalActivities: number | null = null;
      let usedActivities = 0;
      let remainingActivities: number | null = null;
      
      if (sub?.plan_id) {
        const [planRes, bonusRes] = await Promise.all([
          supabase.from('subscription_plans').select('max_daily_generations, max_total_activities, name, name_ar').eq('id', sub.plan_id).maybeSingle(),
          supabase.from('user_generation_overrides').select('value, expires_at').eq('user_id', user.id).eq('override_type', 'bonus_activities'),
        ]);
        const plan = planRes.data;
        const bonusActivities = (bonusRes.data || []).reduce((sum: number, row: any) => {
          const isValid = !row.expires_at || new Date(row.expires_at) > new Date();
          return isValid ? sum + (Number(row.value) || 0) : sum;
        }, 0);
        if (plan) {
          dailyLimit = plan.max_daily_generations || 5;
          planName = i18n.language?.startsWith('ar') ? (plan.name_ar || plan.name) : plan.name;
          const baseTotalActivities = plan.max_total_activities || 0;
          totalActivities = baseTotalActivities + bonusActivities;
          
          if (totalActivities > 0) {
            const { data: used, error: rpcError } = await supabase.rpc('get_total_used_activities' as any, {
              p_user_id: user.id,
              p_since: sub.starts_at
            });
            if (!rpcError) {
              usedActivities = Number(used) || 0;
              remainingActivities = Math.max(0, totalActivities - usedActivities);
            }
          }
        }
      } else {
        const { data: settings } = await supabase
          .from('site_settings')
          .select('free_user_daily_limit')
          .eq('id', 'default')
          .maybeSingle();
        if (settings) dailyLimit = settings.free_user_daily_limit || 5;
      }
      
      setRemainingCredits({ 
        used: usedCount, 
        limit: dailyLimit, 
        planName, 
        totalActivities, 
        usedActivities, 
        remainingActivities 
      });
    } catch (err) {
      console.warn('Failed to fetch credits:', err);
    }
  }, [user, i18n.language]);

  useEffect(() => { fetchRemainingCredits(); }, [fetchRemainingCredits]);

  // Auto-scroll mobile day tabs when active day changes
  useEffect(() => {
    const btn = dayBtnRefs.current[activeDay];
    if (btn) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeDay]);

  // Snapshot the navigation-state itinerary ONCE per id so subsequent
  // re-renders (e.g. opening a dialog that updates location) don't re-hydrate
  // from stale state and wipe out manually added activities.
  const initialStateItinRef = useRef<any>(null);
  const consumedStateForIdRef = useRef<string | null>(null);
  if (consumedStateForIdRef.current !== id) {
    initialStateItinRef.current = location.state?.itinerary ?? null;
    consumedStateForIdRef.current = id ?? null;
  }

  useEffect(() => {
    let cancelled = false;

    const hydrate = (raw: any) => {
      try {
        let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed) return false;
        parsed.startDate = safeDate(parsed.startDate);
        parsed.endDate = safeDate(parsed.endDate);
        // Accept any itinerary that has at least a destination — show what we have
        // (avoids the disruptive "regenerate" redirect for users whose data loaded fine)
        if (!parsed.destination && !Array.isArray(parsed.days)) {
          return false;
        }
        if (Array.isArray(parsed.days)) {
          parsed.days.forEach((d: any) => { if (d?.date) d.date = safeDate(d.date); });
          const normalized = normalizePersistedActivityTimes(parsed);
          parsed = normalized.itinerary;
          const metaTargetRaw = Math.max(1, Number(parsed?.totalDailyItemsTarget) || Number(parsed?.maxActivitiesPerDay) || 1);
          // ── PRESERVE USER ADDITIONS ON RELOAD: if any saved day is longer
          // than metaTarget the user manually added activities; keep them by
          // raising the effective target. saveItinerary() also persists
          // totalDailyItemsTarget for new edits — this branch handles legacy
          // / cloud-synced trips where the saved meta is still the original.
          const longestPersistedDayLength = parsed.days.reduce((max: number, day: any) => {
            const count = Array.isArray(day?.activities) ? day.activities.length : 0;
            return Math.max(max, count);
          }, 0);
          const metaTarget = Math.max(metaTargetRaw, longestPersistedDayLength);
          const enforced = enforceDailyItemLimit(
            parsed.days,
            metaTarget,
            parsed?.mealPreferences,
          );
          const audited = auditItineraryPreferences(enforced.days, {
            mealPreferences: parsed?.mealPreferences,
            perDayTarget: metaTarget,
            destination: parsed?.destination,
            language: parsed?.language,
          });
          // Final strict pass: window-clamp every time and place meals at
          // logical hours (breakfast morning, lunch noon, dinner evening).
          const { wakeHour, sleepHour } = parseWakeSleep(parsed?.wakeTime, parsed?.sleepTime);
          const scheduled = applyStrictDaySchedule(audited.days, {
            perDayTarget: metaTarget,
            wakeHour,
            sleepHour,
            mealPreferences: parsed?.mealPreferences,
          });
          parsed.days = scheduled.days;
          // Make sure metaTarget upgrades stick across future reloads.
          parsed.totalDailyItemsTarget = metaTarget;
          if (Number(parsed?.maxActivitiesPerDay) < metaTarget) parsed.maxActivitiesPerDay = metaTarget;
          // Heal legacy itineraries: re-resolve missing team flags (🏳️) using
          // centralized registry so old saved trips show correct flags.
          const healed = healItineraryFlags(parsed);
          if (healed.changed) {
            parsed = healed.itinerary;
            // Persist the healed copy so the fix is permanent.
            if (id) {
              try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(parsed)); } catch {}
              if (user?.id) {
                (supabase as any)
                  .from('saved_trips')
                  .update({ trip_data: parsed })
                  .eq('trip_id', id)
                  .eq('user_id', user.id)
                  .then(() => {}, () => {});
              }
            }
          }
          if (normalized.corrected && id) {
            const signature = `${id}:${normalized.correctedCount}:${normalized.conflictsResolved}`;
            if (lastTimeCorrectionSignatureRef.current !== signature) {
              lastTimeCorrectionSignatureRef.current = signature;
              // Quiet UI: routine time-sync info is noisy and unhelpful — log only.
              if (normalized.correctedCount > 0 || normalized.conflictsResolved > 0) {
                console.info('[itinerary] time-sync', {
                  corrected: normalized.correctedCount,
                  conflictsResolved: normalized.conflictsResolved,
                });
              }
            }
            try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(parsed)); } catch {}
          }
        } else {
          parsed.days = [];
        }
        if (!cancelled) setItinerary(parsed);
        return true;
      } catch (e) {
        console.warn('Failed to hydrate itinerary', e);
        return false;
      }
    };

    const loadFromDb = async () => {
      if (!id) return false;
      try {
        let query = (supabase as any)
          .from('saved_trips')
          .select('trip_data, created_at')
          .eq('trip_id', id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (user?.id) {
          query = query.eq('user_id', user.id);
        }

        const { data } = await query.maybeSingle();
        if (data?.trip_data) {
          // cache it locally for next time
          try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(data.trip_data)); } catch {}
          return hydrate(data.trip_data);
        }
      } catch (e) {
        console.warn('Failed to load trip from DB', e);
      }
      return false;
    };

    const loadFromShared = async () => {
      if (!id) return false;
      try {
        const { data } = await (supabase as any)
          .from('shared_trips')
          .select('trip_data')
          .eq('trip_id', id)
          .maybeSingle();
        if (data?.trip_data) {
          try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(data.trip_data)); } catch {}
          return hydrate(data.trip_data);
        }
      } catch {}
      return false;
    };

    const redirectToPlanner = () => {
      if (cancelled) return;
      console.warn('[ItineraryPage] No itinerary found for id — sending user to planner', { id });
      navigate('/planner', { replace: true });
    };

    (async () => {
      setLoading(true);
      const hasDays = (raw: any): boolean => {
        try {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          return Array.isArray(parsed?.days) && parsed.days.length > 0;
        } catch { return false; }
      };

      const localRaw = id ? localStorage.getItem(`itinerary-${id}`) : null;
      const stateItin = initialStateItinRef.current;
      let ok = false;

      // PRIORITY 1: Fresh data passed via navigation state (always trust if it has days)
      if (stateItin && hasDays(stateItin)) {
        ok = hydrate(stateItin);
        // Persist fresh data so subsequent loads have the good copy
        if (ok && id) {
          try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(stateItin)); } catch {}
        }
      }

      // PRIORITY 2: localStorage with valid days
      if (!ok && localRaw && hasDays(localRaw)) ok = hydrate(localRaw);

      // PRIORITY 3: Database
      if (!ok) ok = await loadFromDb();
      if (!ok) ok = await loadFromShared();

      // PRIORITY 4: Last resort — hydrate ANY local copy (even empty) so UI shows something
      if (!ok && localRaw) ok = hydrate(localRaw);
      if (!ok && stateItin) ok = hydrate(stateItin);

      if (!ok) { redirectToPlanner(); if (!cancelled) setLoading(false); return; }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
    // Intentionally exclude `location` — we only re-load when the trip id or
    // the signed-in user changes. Listening to `location` re-runs hydration on
    // every URL/hash change and overwrites manually added activities with the
    // (now-stale) snapshot in `location.state`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, i18n.language]);

  // Fetch destination info for PDF export (weather, emergency, forecast)
  // Auto-resync: when audit detects missing meals/activities, fetch real
  // venues from data sources before final display. Runs once per itinerary id.
  useEffect(() => {
    if (!itinerary || !Array.isArray(itinerary.days) || itinerary.days.length === 0) return;
    const tripKey = String(itinerary.id || id || itinerary.destination || "");
    if (!tripKey || resyncedRef.current === tripKey) return;
    resyncedRef.current = tripKey;
    (async () => {
      try {
        const result = await resyncMissingItems(itinerary);
        // Always run the strict day scheduler so meal times are pinned to
        // their canonical bands (breakfast ~08:30, lunch ~13:00, dinner
        // ~19:30) — not just when resync replaced something. Without this,
        // an AI-generated lunch at 20:00 would persist on the page.
        const metaTarget = Math.max(
          1,
          Number(itinerary?.totalDailyItemsTarget) || Number(itinerary?.maxActivitiesPerDay) || 1,
        );
        const { wakeHour, sleepHour } = parseWakeSleep(itinerary?.wakeTime, itinerary?.sleepTime);
        const baseDays = result.resyncedCount > 0 ? result.days : itinerary.days;
        const scheduled = applyStrictDaySchedule(baseDays, {
          perDayTarget: metaTarget,
          wakeHour,
          sleepHour,
          mealPreferences: itinerary?.mealPreferences,
        });
        const changed = result.resyncedCount > 0 || scheduled.rescheduledCount > 0 || scheduled.trimmedCount > 0;
        if (changed) {
          const next = { ...itinerary, days: scheduled.days };
          setItinerary(next);
          latestItineraryRef.current = next;
          if (tripKey) {
            try { localStorage.setItem(`itinerary-${tripKey}`, JSON.stringify(next)); } catch {}
          }
          const cloudTripId = id || itinerary?.id;
          if (user?.id && cloudTripId) {
            (supabase as any)
              .from('saved_trips')
              .update({ destination: next.destination, trip_data: { ...next, id: cloudTripId } })
              .eq('user_id', user.id)
              .eq('trip_id', cloudTripId)
              .then(() => {}, () => {});
          }
        }
      } catch (e) {
        console.warn("[itinerary] resync failed", e);
      }
    })();
  }, [itinerary, id, user?.id]);

  useEffect(() => {
    if (!itinerary?.destination) return;
    const tripStartKey = toTripDateKey(itinerary.startDate);
    const cacheKey = `dest-info-v5-${itinerary.destination}-${itinerary.duration || itinerary.days?.length || 3}-${tripStartKey}-${i18n.language}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setDestInfoData(JSON.parse(cached)); return; } catch {}
    }
    const fetchInfo = async () => {
      try {
        const { data } = await supabase.functions.invoke('destination-info', {
          body: { destination: itinerary.destination, tripDays: itinerary.duration || itinerary.days?.length || 3, startDate: tripStartKey, lang: i18n.language }
        });
        if (data) {
          setDestInfoData(data);
          localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      } catch {}
    };
    fetchInfo();
  }, [itinerary?.destination, itinerary?.duration, itinerary?.days?.length, itinerary?.startDate, i18n.language]);

  const countryEmergencyFallback: Record<string, any> = {
    SA: { police: '999', ambulance: '997', fire: '998', general: '911' },
    AE: { police: '999', ambulance: '998', fire: '997', general: '112' },
    QA: { police: '999', ambulance: '999', fire: '999', general: '999' },
    KW: { police: '112', ambulance: '112', fire: '112', general: '112' },
    BH: { police: '999', ambulance: '999', fire: '999', general: '999' },
    OM: { police: '9999', ambulance: '9999', fire: '9999', general: '9999' },
    US: { police: '911', ambulance: '911', fire: '911', general: '911' },
    CA: { police: '911', ambulance: '911', fire: '911', general: '911' },
    GB: { police: '999', ambulance: '999', fire: '999', general: '999' },
    DE: { police: '110', ambulance: '112', fire: '112', general: '112' },
    FR: { police: '17', ambulance: '15', fire: '18', general: '112' },
    IT: { police: '112', ambulance: '118', fire: '115', general: '112' },
    ES: { police: '091', ambulance: '061', fire: '080', general: '112' },
    NL: { police: '112', ambulance: '112', fire: '112', general: '112' },
    CH: { police: '117', ambulance: '144', fire: '118', general: '112' },
    AT: { police: '133', ambulance: '144', fire: '122', general: '112' },
    TR: { police: '155', ambulance: '112', fire: '110', general: '112' },
  };

  const emergencyNumbersForExport =
    destInfoData?.emergency ||
    destInfoData?.emergency_numbers ||
    itinerary?.cityOverview?.emergencyNumbers ||
    countryEmergencyFallback[String(destInfoData?.country_code || '').toUpperCase()] ||
    { police: '112', ambulance: '112', fire: '112', general: '112' };

  const persistItineraryToCloud = useCallback(async (draft: any) => {
    if (!user) return;
    const tripId = id || draft?.id;
    if (!tripId) return;

    const latestDraft = latestItineraryRef.current;
    const payload = {
      ...(latestDraft?.id === tripId ? latestDraft : {}),
      ...draft,
      id: tripId,
    };

    try {
      const { data: updatedRows, error: updateError } = await (supabase as any)
        .from('saved_trips')
        .update({
          destination: payload.destination,
          trip_data: payload,
        })
        .eq('user_id', user.id)
        .eq('trip_id', tripId)
        .select('id');

      if (updateError) throw updateError;

      if (!updatedRows?.length) {
        const { error: insertError } = await (supabase as any)
          .from('saved_trips')
          .insert({
            user_id: user.id,
            trip_id: tripId,
            destination: payload.destination,
            trip_data: payload,
          });

        if (insertError) throw insertError;
      }
    } catch (err) {
      console.warn('Auto cloud save failed:', err);
    }
  }, [id, user]);

  useEffect(() => {
    if (!itinerary || !id) return;
    const normalized = normalizePersistedActivityTimes(itinerary);
    if (!normalized.corrected) return;

    const signature = `${id}:${normalized.correctedCount}:${normalized.conflictsResolved}`;
    if (lastTimeCorrectionSignatureRef.current === signature) return;
    lastTimeCorrectionSignatureRef.current = signature;

    setItinerary(normalized.itinerary);
    latestItineraryRef.current = normalized.itinerary;
    try { localStorage.setItem(`itinerary-${id}`, JSON.stringify(normalized.itinerary)); } catch {}
    void persistItineraryToCloud(normalized.itinerary);
    // Quiet UI: routine time-sync info is noisy and unhelpful — log only.
    if (normalized.correctedCount > 0 || normalized.conflictsResolved > 0) {
      console.info('[itinerary] time-sync', {
        corrected: normalized.correctedCount,
        conflictsResolved: normalized.conflictsResolved,
      });
    }
  }, [itinerary, id, i18n.language, persistItineraryToCloud]);

  // Save itinerary changes to localStorage + cloud copy for signed-in users
  const saveItinerary = useCallback((updated: any) => {
    const daysArr = Array.isArray(updated?.days) ? updated.days : [];
    // Preserve manually added activities by never shrinking the effective
    // per-day cap below the longest current day.
    const metaTarget = Math.max(
      1,
      Number(updated?.totalDailyItemsTarget) || Number(updated?.maxActivitiesPerDay) || 1,
    );
    const longestDayLength = daysArr.reduce((max: number, day: any) => {
      const count = Array.isArray(day?.activities) ? day.activities.length : 0;
      return Math.max(max, count);
    }, 0);
    const effectiveTarget = Math.max(metaTarget, longestDayLength);
    const enforced = enforceDailyItemLimit(
      daysArr,
      effectiveTarget,
      updated?.mealPreferences,
    );
    const audited = auditItineraryPreferences(enforced.days, {
      mealPreferences: updated?.mealPreferences,
      perDayTarget: effectiveTarget,
      destination: updated?.destination,
      language: updated?.language,
    });
    const { wakeHour, sleepHour } = parseWakeSleep(updated?.wakeTime, updated?.sleepTime);
    const scheduled = applyStrictDaySchedule(audited.days, {
      perDayTarget: effectiveTarget,
      wakeHour,
      sleepHour,
      mealPreferences: updated?.mealPreferences,
    });
    const tripId = id || updated?.id;
    // ── PERSIST the expanded target so hydrate() on next page-load does NOT
    // trim back to the original metaTarget and silently drop user-added
    // activities. This is the key fix: without it, the user adds a 6th
    // activity to a target=5 day, sees it work, but on refresh enforceDailyItemLimit
    // (in hydrate) cuts it off because metaTarget is still 5.
    const next = {
      ...updated,
      id: tripId || updated?.id,
      days: scheduled.days,
      totalDailyItemsTarget: effectiveTarget,
      maxActivitiesPerDay: Math.max(Number(updated?.maxActivitiesPerDay) || 0, effectiveTarget),
    };
    setItinerary(next);
    if (tripId) {
      localStorage.setItem(`itinerary-${tripId}`, JSON.stringify(next));
    }
    void persistItineraryToCloud(next);
  }, [id, persistItineraryToCloud]);

  // Handle day update
  const handleUpdateDay = useCallback((dayIndex: number, updatedDay: any) => {
    if (!itinerary) return;
    const newDays = [...itinerary.days];
    newDays[dayIndex] = updatedDay;
    saveItinerary({ ...itinerary, days: newDays });
  }, [itinerary, saveItinerary]);

  // Handle moving activity between days
  const handleMoveActivity = useCallback((activityId: string, fromDayIndex: number, toDayIndex: number) => {
    if (!itinerary) return;

    const fromDay = itinerary.days[fromDayIndex];
    const toDay = itinerary.days[toDayIndex];
    const activity = fromDay.activities.find((a: any) => a.id === activityId);

    if (!activity) return;

    const newFromActivities = fromDay.activities.filter((a: any) => a.id !== activityId);
    const newToActivities = [...toDay.activities, activity];

    const newDays = [...itinerary.days];
    newDays[fromDayIndex] = { ...fromDay, activities: newFromActivities };
    newDays[toDayIndex] = { ...toDay, activities: newToActivities };

    saveItinerary({ ...itinerary, days: newDays });
  }, [itinerary, saveItinerary]);

  // Dynamic regen costs — admin-controlled per plan via subscription_plans columns:
  //   regen_activity_cost   (default 1)   — credits to deduct for a single-activity regen
  //   regen_day_multiplier  (default 1.5) — multiplier × number of activities for a full-day regen
  //   regen_full_multiplier (default 1.5) — multiplier × total activities for a full-trip regen
  // The multipliers are stored as numeric (e.g. 1.5) but usage_tracking.quantity is integer,
  // so the final deducted quantity is rounded up (Math.ceil) to honour the multiplier.
  const [regenCosts, setRegenCosts] = useState<{
    activity: number;
    dayMultiplier: number;
    fullMultiplier: number;
  }>({ activity: 1, dayMultiplier: 1.5, fullMultiplier: 1.5 });

  useEffect(() => {
    const fetchDynamicCosts = async () => {
      // Fallback defaults from site_settings
      const { data: settings } = await supabase
        .from('site_settings')
        .select('regen_costs_config')
        .eq('id', 'default')
        .maybeSingle();
      let baseCosts = { activity: 1, dayMultiplier: 1.5, fullMultiplier: 1.5 };
      if (settings?.regen_costs_config) {
        const cfg = settings.regen_costs_config as any;
        baseCosts = {
          activity: Number(cfg.activity ?? 1) || 1,
          dayMultiplier: Number(cfg.day_multiplier ?? cfg.dayMultiplier ?? 1.5) || 1.5,
          fullMultiplier: Number(cfg.full_multiplier ?? cfg.fullMultiplier ?? 1.5) || 1.5,
        };
      }

      // Per-plan overrides take priority
      if (user) {
        const { data: sub } = await supabase
          .from('user_subscriptions')
          .select('plan_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sub?.plan_id) {
          const { data: plan } = await supabase
            .from('subscription_plans')
            .select('regen_activity_cost, regen_day_multiplier, regen_full_multiplier')
            .eq('id', sub.plan_id)
            .maybeSingle();
          if (plan) {
            baseCosts = {
              activity: Number((plan as any).regen_activity_cost ?? baseCosts.activity) || baseCosts.activity,
              dayMultiplier: Number((plan as any).regen_day_multiplier ?? baseCosts.dayMultiplier) || baseCosts.dayMultiplier,
              fullMultiplier: Number((plan as any).regen_full_multiplier ?? baseCosts.fullMultiplier) || baseCosts.fullMultiplier,
            };
          }
        }
      }
      setRegenCosts(baseCosts);
    };
    fetchDynamicCosts();
  }, [user, itinerary?.days?.length]);

  // Deduct regen cost from usage_tracking (integer quantity = number of activities)
  // ─────────────────────────────────────────────────────────────────────────
  // CREDIT DEDUCTION GUARANTEE — EVERY REGENERATION IS DEDUCTED
  // EN: Credits are deducted on every regeneration, even repeats of the same
  //     activity/day. Each call inserts a fresh usage_tracking row.
  // AR: يُخصم الرصيد عند كل إعادة توليد، حتى لو تكررت نفس العملية.
  // FR: Les crédits sont déduits à chaque régénération, même répétée.
  // ES: Los créditos se descuentan en cada regeneración, incluso si se repite.
  // DE: Credits werden bei jeder Regenerierung abgezogen, auch bei Wiederholung.
  // TR: Her yeniden üretimde krediler düşülür, tekrar olsa bile.
  // RU: Кредиты списываются при каждой регенерации, даже при повторе.
  // ZH: 每次重新生成都会扣除积分,即使是重复的也会扣除。
  // JA: 再生成のたびにクレジットが差し引かれます(重複時も差引)。
  // ─────────────────────────────────────────────────────────────────────────
  const deductRegenCost = async (type: 'activity' | 'day' | 'full', activityCount?: number) => {
    if (!user) return true;
    try {
      // quantity = credits to deduct (integer). Multipliers are admin-controlled per plan.
      let qty: number;
      if (type === 'activity') {
        qty = Math.max(1, Math.ceil(Number(regenCosts.activity) || 1));
      } else if (type === 'day') {
        const count = activityCount || itinerary?.days?.[activeDay]?.activities?.length || 5;
        qty = Math.max(1, Math.ceil(count * (Number(regenCosts.dayMultiplier) || 1.5)));
      } else {
        const total = itinerary?.days?.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0) || 10;
        qty = Math.max(1, Math.ceil(total * (Number(regenCosts.fullMultiplier) || 1.5)));
      }
      const { error } = await supabase.from('usage_tracking').insert({
        user_id: user.id,
        feature: `regen_${type}`,
        quantity: qty,
      });
      if (error) throw error;
      await fetchRemainingCredits();
      window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
      return true;
    } catch (err) {
      console.error('Failed to track regen usage:', err);
      return false;
    }
  };

  // Drag-and-drop state
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

   // Regenerate a single activity via AI (success-only deduction)
  const handleRegenerateActivity = useCallback(async (activityId: string, dayIdx: number, prompt?: string): Promise<any> => {
    if (!itinerary) return null;
    // Block if daily limit exhausted
    if (remainingCredits && remainingCredits.used >= remainingCredits.limit) {
      toast.error(i18n.language?.startsWith('ar') ? '⚠️ لقد استنفدت الرصيد اليومي. يرجى المحاولة غداً أو الترقية.' : '⚠️ Daily credits exhausted. Try tomorrow or upgrade.');
      return null;
    }
    // Block if activity balance is exhausted
    if (remainingCredits?.totalActivities && remainingCredits.totalActivities > 0 && remainingCredits.remainingActivities !== null && remainingCredits.remainingActivities <= 0) {
      toast.error(i18n.language?.startsWith('ar') ? '⚠️ لقد استنفدت جميع الأنشطة المتاحة في باقتك. يرجى الترقية.' : '⚠️ You have exhausted all activities in your plan. Please upgrade.');
      return null;
    }
    const currentDay = itinerary.days[dayIdx];
    const activity = currentDay?.activities?.find((a: any) => a.id === activityId);
    if (!activity) return null;

    const buildExcludeKey = (item: any) => {
      const name = String(item?.title || item?.name || '').trim().toLowerCase();
      const address = String(item?.address || item?.location || '').trim().toLowerCase();
      const lat = Number(item?.latitude);
      const lng = Number(item?.longitude);
      const geo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
        ? `${lat.toFixed(4)},${lng.toFixed(4)}`
        : '';
      return `${name}|${address}|${geo}`;
    };
    
    // Collect ALL existing names for dedup
    const existingNames = itinerary.days.flatMap((d: any) =>
      (d.activities || []).map((a: any) => a.title || a.name || '').filter(Boolean)
    );
    const existingKeys = itinerary.days.flatMap((d: any) =>
      (d.activities || []).map((a: any) => buildExcludeKey(a)).filter(Boolean)
    );
    
    const cityName = currentDay.cityName || itinerary.destination;
    const cuisineTypes = Array.isArray(itinerary.cuisinePreferences)
      ? itinerary.cuisinePreferences.filter(Boolean)
      : Array.isArray(itinerary.mealPreferences?.cuisineTypes)
        ? itinerary.mealPreferences.cuisineTypes.filter(Boolean)
        : [];
    try {
      const { data, error } = await invokeGenerateTripWithRetry(
        {
          destination: cityName,
          duration: 1,
          regenMode: 'activity',
          regenPrompt: prompt,
          currentActivityName: activity.title || activity.name,
          currentActivityCategory: activity.category || activity.type,
          currentActivityDescription: activity.description || '',
          currentActivityMatchReason: activity.matchReason || '',
          excludeActivityNames: existingNames,
          excludeActivityKeys: existingKeys,
          tripType: itinerary.tripType,
          interests: itinerary.interests || itinerary.activityPrefs || [],
          budget: itinerary.budget,
          cuisinePreferences: cuisineTypes,
          cuisineTypes,
          mealPreferences: itinerary.mealPreferences,
          specialRequests: itinerary.specialRequests,
          travelStyle: itinerary.travelStyle,
          // Use the original user-selected daily count, never derive from currentDay.activities.length
          // (which would lock a previous over-count into every regeneration).
          activitiesPerDay: Math.max(0, Number((itinerary as any)?.activitiesPerDay) || 0),
          maxActivitiesPerDay: Math.max(1, Number((itinerary as any)?.totalDailyItemsTarget) || Number((itinerary as any)?.maxActivitiesPerDay) || 7),
          totalDailyItemsTarget: Number((itinerary as any)?.totalDailyItemsTarget) || undefined,
          maxTotalActivitiesRemaining: remainingCredits?.remainingActivities ?? null,
          lang: i18n.language,
          variationSeed: Date.now(),
        },
        {
          maxRetries: 2,
          perAttemptTimeoutMs: 35000,
          timeoutMessage: i18n.language?.startsWith('ar')
            ? 'انتهت مهلة إعادة التوليد. حاول مرة أخرى.'
            : 'Regeneration timed out. Please try again.',
        },
      );
      if (error) throw error;
      const newAct = data?.days?.[0]?.activities?.[0] || data?.itinerary?.[0]?.activities?.[0];
      if (newAct) {
        // Deduct credit ONLY on success
        const charged = await deductRegenCost('activity');
        if (!charged) {
          toast.error(i18n.language?.startsWith('ar') ? 'تعذر تحديث رصيد الأنشطة الآن. حاول مرة أخرى.' : 'Could not update activity balance right now. Please try again.');
          return null;
        }
        return newAct;
      }
      toast.error(i18n.language?.startsWith('ar') ? 'تعذر العثور على بديل من نفس النوع. جرّب وصفًا أدق.' : 'Could not find a same-type replacement. Try a more specific prompt.');
      return null;
      } catch (err) {
      console.error('Regenerate activity error:', err);
        toast.error(getFriendlyGenerationError(err, i18n.language?.startsWith('ar')));
      return null;
    }
  }, [itinerary, i18n.language, user, remainingCredits, fetchRemainingCredits]);

   // Regenerate an entire day via AI (success-only deduction)
  const handleRegenerateDay = useCallback(async (dayIdx: number, prompt?: string): Promise<any[] | null> => {
    if (!itinerary) return null;
    // Block if daily limit exhausted
    if (remainingCredits && remainingCredits.used >= remainingCredits.limit) {
      toast.error(i18n.language?.startsWith('ar') ? '⚠️ لقد استنفدت الرصيد اليومي. يرجى المحاولة غداً أو الترقية.' : '⚠️ Daily credits exhausted. Try tomorrow or upgrade.');
      return null;
    }
    // Block if activity balance is exhausted
    if (remainingCredits?.totalActivities && remainingCredits.totalActivities > 0 && remainingCredits.remainingActivities !== null && remainingCredits.remainingActivities <= 0) {
      toast.error(i18n.language?.startsWith('ar') ? '⚠️ لقد استنفدت جميع الأنشطة المتاحة في باقتك. يرجى الترقية.' : '⚠️ You have exhausted all activities in your plan. Please upgrade.');
      return null;
    }
    const currentDay = itinerary.days[dayIdx];
    const cityName = currentDay?.cityName || itinerary.destination;

    const buildExcludeKey = (item: any) => {
      const name = String(item?.title || item?.name || '').trim().toLowerCase();
      const address = String(item?.address || item?.location || '').trim().toLowerCase();
      const lat = Number(item?.latitude);
      const lng = Number(item?.longitude);
      const geo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
        ? `${lat.toFixed(4)},${lng.toFixed(4)}`
        : '';
      return `${name}|${address}|${geo}`;
    };

    // ── Identify "locked" activities in the day being regenerated:
    // user-added match anchors (sports events) and AI-injected special-request
    // items must SURVIVE a full-day regeneration. We send them separately
    // so the backend can preserve them and exclude their names from the
    // anti-repeat list (otherwise their slot gets re-filled with a DIFFERENT
    // place that does not satisfy the special request).
    const lockedFromCurrentDay = (currentDay?.activities || []).filter((a: any) =>
      a?.isMatchAnchor === true ||
      a?.isSpecialRequest === true ||
      Boolean(a?.specialRequestQuery) ||
      Boolean(a?.__specialRequestQuery)
    );
    const lockedNameSet = new Set(
      lockedFromCurrentDay
        .map((a: any) => String(a?.title || a?.name || '').trim().toLowerCase())
        .filter(Boolean)
    );
    const lockedKeySet = new Set(lockedFromCurrentDay.map(buildExcludeKey).filter(Boolean));

    // Collect all existing activity names across all days for dedup
    // EXCEPT the locked ones in the day we're regenerating — they need to
    // be re-pickable so they don't get permanently lost on regeneration.
    const existingNames = itinerary.days.flatMap((d: any, di: number) =>
      (d.activities || [])
        .filter((a: any) => !(di === dayIdx && lockedNameSet.has(String(a?.title || a?.name || '').trim().toLowerCase())))
        .map((a: any) => a.title || a.name || '')
        .filter(Boolean)
    );
    const existingKeys = itinerary.days.flatMap((d: any, di: number) =>
      (d.activities || [])
        .filter((a: any) => !(di === dayIdx && lockedKeySet.has(buildExcludeKey(a))))
        .map((a: any) => buildExcludeKey(a))
        .filter(Boolean)
    );

    const cuisineTypes = Array.isArray(itinerary.cuisinePreferences)
      ? itinerary.cuisinePreferences.filter(Boolean)
      : Array.isArray(itinerary.mealPreferences?.cuisineTypes)
        ? itinerary.mealPreferences.cuisineTypes.filter(Boolean)
        : [];

    try {
      const { data, error } = await invokeGenerateTripWithRetry(
        {
          destination: cityName,
          duration: 1,
          regenMode: 'day',
          regenPrompt: prompt,
          tripType: itinerary.tripType,
          interests: itinerary.interests || itinerary.activityPrefs || [],
          mealPreferences: itinerary.mealPreferences,
          cuisinePreferences: cuisineTypes,
          cuisineTypes,
          specialRequests: itinerary.specialRequests,
          travelStyle: itinerary.travelStyle,
          budget: itinerary.budget,
          // Pass locked activities so backend re-inserts them at their original slot
          lockedActivities: lockedFromCurrentDay,
          // CRITICAL: use the ORIGINAL user-selected daily count from itinerary metadata.
          // Never derive from currentDay.activities.length — that may reflect a previous over-count
          // and would lock the wrong number into every regeneration (feedback loop).
          activitiesPerDay: Math.max(0, Number((itinerary as any)?.activitiesPerDay) || 0),
          maxActivitiesPerDay: Math.max(1, Number((itinerary as any)?.totalDailyItemsTarget) || Number((itinerary as any)?.maxActivitiesPerDay) || 7),
          totalDailyItemsTarget: Number((itinerary as any)?.totalDailyItemsTarget) || undefined,
          maxTotalActivitiesRemaining: remainingCredits?.remainingActivities ?? null,
          excludeActivityNames: existingNames,
          excludeActivityKeys: existingKeys,
          lang: i18n.language,
          variationSeed: Date.now(),
        },
        {
          maxRetries: 2,
          perAttemptTimeoutMs: 45000,
          timeoutMessage: i18n.language?.startsWith('ar')
            ? 'انتهت مهلة إعادة توليد اليوم. حاول مرة أخرى.'
            : 'Day regeneration timed out. Please try again.',
        },
      );
      if (error) throw error;
      let newActivities = data?.days?.[0]?.activities || data?.itinerary?.[0]?.activities;
      if (newActivities) {
        // ── FINAL VALIDATOR: enforce exact per-day target after regeneration
        const target = Math.max(1, Number((itinerary as any)?.totalDailyItemsTarget) || Number((itinerary as any)?.maxActivitiesPerDay) || newActivities.length);
        const enforced = enforceDailyItemLimit([{ activities: newActivities }], target, itinerary?.mealPreferences);
        newActivities = enforced.days[0].activities;
        // Deduct credit ONLY on success - count = number of activities kept
        await deductRegenCost('day', newActivities.length);
        fetchRemainingCredits();
      }
      return newActivities || null;
    } catch (err) {
      console.error('Regenerate day error:', err);
      return null;
    }
  }, [itinerary, i18n.language, regenCosts, user, fetchRemainingCredits]);

  // Add a new day to the itinerary
  const handleAddDay = useCallback(() => {
    if (!itinerary) return;
    const lastDay = itinerary.days[itinerary.days.length - 1];
    const lastDate = safeDate(lastDay?.date);
    const newDate = addDays(lastDate, 1);
    const newDay = {
      date: newDate,
      cityName: lastDay?.cityName || itinerary.destination,
      activities: [],
    };
    const newDays = [...itinerary.days, newDay];
    const newEndDate = newDate;
    saveItinerary({
      ...itinerary,
      days: newDays,
      duration: newDays.length,
      endDate: newEndDate,
    });
    setActiveDay(newDays.length - 1);
    toast.success(i18n.language?.startsWith('ar') ? `✅ تم إضافة اليوم ${newDays.length}` : `✅ Day ${newDays.length} added`);
  }, [itinerary, saveItinerary, i18n.language]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
        <p className="text-muted-foreground">{t('itinerary.loadingTrip')}</p>
      </div>
    );
  }

  if (error || !itinerary?.days?.length) {
    const isAr = i18n.language?.startsWith('ar');
    const lastPrefs = (() => {
      try { return JSON.parse(localStorage.getItem('lastTripPreferences') || 'null'); } catch { return null; }
    })();
    const handleRegenerate = () => {
      navigate('/planner', { state: { regenerate: true, preferences: lastPrefs, itinerary } });
    };
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background">
        <div className="max-w-md w-full text-center bg-card/60 backdrop-blur-md border border-border rounded-2xl p-8 shadow-xl">
          <div className="text-5xl mb-4">🗺️</div>
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {isAr ? 'الخطة غير مكتملة' : 'Itinerary incomplete'}
          </h2>
          <p className="text-muted-foreground mb-6">
            {error || (isAr
              ? 'لم يتم توليد أي أيام لهذه الرحلة. يمكنك إعادة التوليد للحصول على خطة كاملة تلتزم بتفضيلاتك.'
              : 'No days were generated for this trip. Regenerate to get a full plan that respects your preferences.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              onClick={handleRegenerate}
              className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              🔄 {isAr ? 'إعادة التوليد' : 'Regenerate'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/')}>
              {t('itinerary.createNew')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const safeDay = Math.min(Math.max(0, activeDay), itinerary.days.length - 1);
  if (safeDay !== activeDay) setActiveDay(safeDay);

  const handleViewInMaps = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const handleSaveTrip = async () => {
    if (!user) {
      toast.error(t('auth.signInRequired', { defaultValue: 'Please sign in to save trips' }));
      navigate('/auth');
      return;
    }
    setSaving(true);
    try {
      const currentTrip = latestItineraryRef.current || itinerary;
      const tripId = id || currentTrip?.id || `trip-${Date.now()}`;
      
      const payload = { ...currentTrip, id: tripId };
      const { data: updatedRows, error: updateError } = await (supabase as any)
        .from('saved_trips')
        .update({
          destination: currentTrip.destination,
          trip_data: payload,
        })
        .eq('user_id', user.id)
        .eq('trip_id', tripId)
        .select('id');

      if (updateError) throw updateError;

      if (!updatedRows?.length) {
        const { error: insertError } = await (supabase as any)
          .from('saved_trips')
          .insert({
          user_id: user.id,
          trip_id: tripId,
          destination: currentTrip.destination,
          trip_data: payload,
        });
        
        if (insertError) throw insertError;
      }
      setSaved(true);
      toast.success(t('itinerary.tripSaved', { defaultValue: '✅ Trip saved to your profile!' }));
    } catch (err) {
      console.error('Save trip error:', err);
      toast.error(t('common.error', { defaultValue: 'Failed to save trip' }));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsMemory = async () => {
    if (!user) {
      toast.error(i18n.language?.startsWith('ar') ? 'يجب تسجيل الدخول أولاً' : 'Please sign in first');
      navigate('/auth');
      return;
    }
    if (!itinerary) return;
    setSavingMemory(true);
    try {
      // Fetch all activity media for this trip
      const tripId = id || itinerary.id;
      let mediaUrls: string[] = [];
      if (tripId) {
        const { data: media } = await supabase
          .from('activity_media')
          .select('media_url')
          .eq('trip_id', tripId)
          .eq('user_id', user.id);
        if (media) mediaUrls = media.map(m => m.media_url);
      }

      const days = itinerary.days || itinerary.itinerary || [];
      const { error } = await supabase.from('memories').insert({
        user_id: user.id,
        title: `${i18n.language?.startsWith('ar') ? 'رحلتي إلى' : 'My trip to'} ${itinerary.destination} ✈️`,
        description: days.map((d: any, i: number) => {
          const acts = (d.activities || []).map((a: any) => `• ${a.name || a.title || ''}`).join('\n');
          return `📅 ${d.date || `Day ${i + 1}`}:\n${acts}`;
        }).join('\n\n'),
        memory_type: 'trip',
        trip_id: tripId,
        location_name: itinerary.destination,
        media_urls: mediaUrls,
        trip_data: {
          destination: itinerary.destination,
          startDate: itinerary.startDate,
          duration: itinerary.duration,
          itinerary: days,
          budget: itinerary.budget || itinerary.cost_estimate,
        },
        is_published: false,
      });
      if (error) throw error;
      toast.success(i18n.language?.startsWith('ar') ? 'تم حفظ الرحلة كذكرى خاصة ✅' : 'Trip saved as private memory! ✅');
    } catch (err: any) {
      console.error('Save memory error:', err);
      toast.error(i18n.language?.startsWith('ar') ? 'فشل الحفظ' : 'Failed to save');
    } finally {
      setSavingMemory(false);
    }
  };

  const handleShare = async (email?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setSharing(true);
        
        // Build trip data based on share options
        let tripDataToShare = itinerary;
        if (!shareOptions.fullTrip) {
          tripDataToShare = {
            destination: itinerary.destination,
            startDate: itinerary.startDate,
            endDate: itinerary.endDate,
            duration: itinerary.duration,
            days: itinerary.days.map((day: any) => ({
              ...day,
              activities: day.activities.map((act: any) => ({
                id: act.id,
                title: act.title || act.name,
                time: act.time || act.startTime,
                ...(shareOptions.photosOnly ? { photos: act.photos } : {}),
                ...(shareOptions.reviewsOnly ? { reviews: act.reviews } : {}),
                coordinates: act.coordinates,
                address: act.address || act.location,
                category: act.category,
              }))
            })),
            shareMode: shareOptions.photosOnly ? 'photos' : shareOptions.reviewsOnly ? 'reviews' : 'selective',
          };
        }
        
        const insertData: any = {
          trip_id: id || itinerary.id,
          trip_data: tripDataToShare,
          destination: itinerary.destination,
          shared_by: session.user.id,
        };
        if (email?.trim()) {
          insertData.shared_with_email = email.trim();
        }

        const { data, error } = await (supabase as any).from("shared_trips").insert(insertData).select("share_code").single();

        setSharing(false);

        if (!error && data?.share_code) {
          const shareUrl = `${window.location.origin}/shared/${data.share_code}`;

          if (email?.trim()) {
            toast.success(t('share.sharedWithEmail', { defaultValue: `تمت مشاركة الرحلة مع ${email}` }));
          }

          // Copy link BEFORE closing dialog to preserve user gesture context
          if (!email?.trim()) {
            const shareData = {
              title: `${t('itinerary.yourTripTo', { defaultValue: 'Trip to' })}: ${itinerary.destination}`,
              text: `${t('share.checkOutTrip', { defaultValue: 'Check out my trip to' })} ${itinerary.destination}!`,
              url: shareUrl
            };
            if (navigator.share && navigator.canShare?.(shareData)) {
              try { await navigator.share(shareData); } catch {}
            } else {
              try {
                await navigator.clipboard.writeText(shareUrl);
              } catch {
                // Fallback for clipboard API failure
                const ta = document.createElement('textarea');
                ta.value = shareUrl;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
              toast.success(t('share.linkCreated', { defaultValue: 'تم نسخ رابط المشاركة!' }));
            }
          }

          // Close dialog AFTER clipboard operation
          setShowShareDialog(false);
          setShareEmail("");
          return;
        }
        setShowShareDialog(false);
        setShareEmail("");
      }
    } catch (err) {
      console.warn("Share via DB failed, falling back to URL share", err);
      setSharing(false);
    }

    // Fallback: copy current URL
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast.success(t('itinerary.linkCopied', { defaultValue: 'تم نسخ الرابط!' }));
  };

  const handleShareAsStory = async () => {
    if (!user) {
      toast.error(t('auth.signInRequired', { defaultValue: 'Please sign in' }));
      navigate('/auth');
      return;
    }
    const tripId = id || itinerary.id;
    if (!tripId) {
      toast.error(t('common.error', { defaultValue: 'Cannot link an unsaved trip' }));
      return;
    }

    // Collect all media from activity_media table for this trip
    const { data: mediaData } = await supabase.from('activity_media').select('media_url, activity_id, activity_name, day_index')
      .eq('trip_id', tripId).eq('user_id', user.id);
    
    const allMedia = mediaData?.map(m => m.media_url) || [];
    
    // Build activity_media_map for proper media-activity binding
    const activityMediaMap: Record<string, string[]> = {};
    mediaData?.forEach(m => {
      const key = m.activity_name || m.activity_id;
      if (!activityMediaMap[key]) activityMediaMap[key] = [];
      activityMediaMap[key].push(m.media_url);
    });

    // Navigate to stories with full trip data for proper display
    navigate('/stories', { 
      state: { 
        openCreateForm: true, 
        linkedTripId: tripId,
        prefillData: {
          title: `${itinerary.destination} ✈️`,
          location_name: itinerary.destination,
          media_urls: allMedia,
          trip_data: {
            destination: itinerary.destination,
            startDate: itinerary.startDate,
            duration: itinerary.duration,
            itinerary: itinerary.days?.map((day: any) => ({
              date: day.date,
              activities: (day.activities || []).map((a: any) => ({
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
              })),
            })),
            activity_media_map: activityMediaMap,
          },
        },
      } 
    });
  };


  const handleDownload = async () => {
    const HIDDEN_STYLE = 'position:fixed;left:-10000px;top:0;width:794px;overflow:hidden;pointer-events:none;z-index:-9999;';
    setPdfGenerating(true);
    setPdfProgress(10);
    setRenderPrintable(true);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!printableRef.current) throw new Error("Could not find printable content");
      const wrapper = printableRef.current.parentElement;
      // Create a unique share entry so QR code in PDF points to real shared trip
      let shareUrlForPdf = window.location.href;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: shareData } = await (supabase as any).from("shared_trips").insert({
            trip_id: id || itinerary.id,
            trip_data: itinerary,
            destination: itinerary.destination,
            shared_by: session.user.id,
          }).select("share_code").single();
          if (shareData?.share_code) {
            shareUrlForPdf = `${window.location.origin}/shared/${shareData.share_code}`;
          }
        }
      } catch (e) {
        console.warn("Could not create share entry for PDF QR code", e);
      }
      setPdfShareUrl(shareUrlForPdf);
      setPdfProgress(20);

      // Wait briefly for React to re-render PrintableItinerary with new shareUrl
      await new Promise(r => setTimeout(r, 80));

      // Move into viewport so html2canvas can render it - use absolute, not fixed
      if (wrapper) {
        wrapper.style.cssText = 'position:absolute;left:0;top:0;width:794px;z-index:-1;opacity:1;overflow:visible;pointer-events:none;';
      }
      setPdfProgress(30);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      setPdfProgress(50);
      
      const pdf = await generateItineraryPDF(printableRef, {
        maxDays: itinerary?.days?.length || undefined,
        onProgress: (progress) => {
          setPdfProgress(Math.max(50, Math.min(88, progress)));
        },
      });
      setPdfProgress(90);
      
      if (wrapper) wrapper.style.cssText = HIDDEN_STYLE;
      
      pdf.save(`${itinerary.destination.replace(/\W+/g, '_')}_Itinerary.pdf`);
      setPdfProgress(100);
      toast.success(t('itinerary.downloadSuccess'));
      setTimeout(() => { setPdfGenerating(false); setPdfProgress(0); setRenderPrintable(false); }, 1000);
    } catch (err) {
      console.error('PDF generation error:', err);
      const wrapper = printableRef.current?.parentElement;
      if (wrapper) wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;overflow:hidden;pointer-events:none;z-index:-9999;';
      setPdfGenerating(false);
      setRenderPrintable(false);
      setPdfProgress(0);
      toast.error(t('itinerary.pdfFailed', { defaultValue: 'فشل تحميل الملف. حاول مرة أخرى.' }));
    }
  };

  // Download all activities as a single ICS file directly to phone calendar
  const handleDownloadFullCalendar = () => {
    if (!itinerary?.days?.length) return;
    
    const fmtIcs = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const itineraryLink = window.location.href.split('#')[0];
    const lang = i18n.language || 'en';
    const isAr = lang.startsWith('ar');
    const isZh = lang.startsWith('zh');
    const isRu = lang.startsWith('ru');
    
    const labels = isAr
      ? { maps: 'خرائط جوجل', fullPlan: 'الخطة الكاملة', activityDetails: 'تفاصيل الفعالية' }
      : isZh
      ? { maps: '谷歌地图', fullPlan: '完整行程', activityDetails: '活动详情' }
      : isRu
      ? { maps: 'Google Карты', fullPlan: 'Полный маршрут', activityDetails: 'Детали активности' }
      : { maps: 'Google Maps', fullPlan: 'Full Itinerary', activityDetails: 'Activity Details' };
    
    let icsEvents = '';
    
    for (const day of itinerary.days) {
      const dayDate = safeDate(day.date);
      for (const act of (day.activities || [])) {
        const actName = act.title || act.name || 'Activity';
        const addr = act.address || act.location || itinerary.destination;
        const mapUrl = getActivityMapUrl(act);
        const activityDetailLink = `${itineraryLink}#activity-${act.id}`;
        const desc = [
          act.description,
          act.phone ? `📞 ${act.phone}` : '',
          act.website ? `🌐 ${act.website}` : '',
          '',
          `🗺️ ${labels.maps}: ${mapUrl}`,
          `📋 ${labels.fullPlan}: ${itineraryLink}`,
          `🎯 ${labels.activityDetails}: ${activityDetailLink}`,
        ].filter(Boolean).join('\\n');
        const startDt = new Date(dayDate);
        const [sh, sm] = (act.startTime || act.time || '09:00').split(':').map(Number);
        startDt.setHours(sh || 9, sm || 0, 0, 0);
        const endDt = new Date(startDt);
        if (act.endTime) {
          const [eh, em] = act.endTime.split(':').map(Number);
          endDt.setHours(eh || sh + 2, em || 0, 0, 0);
        } else {
          endDt.setHours(startDt.getHours() + 2);
        }
        icsEvents += `BEGIN:VEVENT\r\nDTSTART:${fmtIcs(startDt)}\r\nDTEND:${fmtIcs(endDt)}\r\nSUMMARY:${actName}\r\nLOCATION:${addr}\r\nDESCRIPTION:${desc}\r\nURL:${mapUrl}\r\nUID:${act.id || Date.now()}-${Math.random().toString(36).slice(2)}@aseeltrip\r\nEND:VEVENT\r\n`;
      }
    }
    
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//AseelTrip//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n${icsEvents}END:VCALENDAR`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${itinerary.destination.replace(/\W+/g, '_')}_All_Events.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('itinerary.calendarDownloaded', { defaultValue: '📅 تم تنزيل جميع الفعاليات! افتح الملف لإضافتها للتقويم' }));
  };

  const handleDownloadHTML = async () => {
    setRenderPrintable(true);
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!printableRef.current) return;
      generateInteractiveHTML(printableRef, `${itinerary.destination.replace(/\W+/g, '_')}_Itinerary`);
      toast.success(t('itinerary.downloadSuccess'));
    } catch (err) {
      console.error(err);
      toast.error(t('itinerary.pdfFailed'));
    } finally {
      setTimeout(() => setRenderPrintable(false), 500);
    }
  };

  // Calculate accurate total cost from all components
  const totalActivitiesCost = itinerary.days.reduce((sum: number, day: any) =>
    sum + (day.activities || []).reduce((s: number, a: any) => s + (a.cost || 0), 0), 0);
  const flightCostCalc = itinerary.flightDetails
    ? (itinerary.flightDetails.departure?.price || 0) + (itinerary.flightDetails.return?.price || 0) : 0;
  const hotelCostCalc = itinerary.estimatedHotelCost || (itinerary.wantHotel ? itinerary.duration * 120 : 0);
  const totalCost = totalActivitiesCost + flightCostCalc + hotelCostCalc;

  // Calculate total distance and fuel for entire trip
  const tripTotalStats = itinerary.days.reduce((acc: any, day: any) => {
    const dayStats = calculateDayTripStats(day.activities || [], fuelSettings.efficiency, fuelSettings.price);
    return {
      totalDistance: acc.totalDistance + dayStats.totalDistance,
      fuelCost: acc.fuelCost + dayStats.fuelCost
    };
  }, { totalDistance: 0, fuelCost: 0 });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }} className="pt-16 min-h-screen bg-background pb-20 overflow-x-hidden max-w-[100vw] w-full">

      {/* Hidden printable - use absolute positioning instead of display:none to allow rendering */}
      <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '794px', overflow: 'hidden', pointerEvents: 'none', zIndex: -9999 }}>
        <div id="printable-itinerary" ref={printableRef}>
          {renderPrintable && (
            <PrintableItinerary 
              itinerary={itinerary} 
              showQRCodes={showQRCodes} 
              fastMode={false}
              fuelSettings={fuelSettings}
              weatherData={destInfoData?.weather}
              emergencyNumbers={emergencyNumbersForExport}
              forecast={destInfoData?.forecast}
              shareUrl={pdfShareUrl || undefined}
            />
          )}
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-gradient-to-br from-primary via-accent to-primary text-white py-4 sm:py-10 overflow-hidden w-full">
        <div className="container mx-auto px-3 sm:px-4 max-w-full overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-white/80 hover:text-white hover:bg-white/10 -ml-2">
              <ChevronLeft size={16} className="mr-1" /> {t('itinerary.home')}
            </Button>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{itinerary.destination}</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-white/80 text-xs sm:text-sm min-w-0">
                <span className="flex min-w-0 items-center gap-1 break-words"><Calendar size={14} className="shrink-0" /> <span className="break-words">{safeFormat(itinerary.startDate, "MMM dd")} — {safeFormat(itinerary.endDate, "MMM dd, yyyy")}</span></span>
                <span className="flex items-center gap-1"><Clock size={14} className="shrink-0" /> {itinerary.duration} {t('travel.days')}</span>
                {totalCost > 0 && <span className="flex items-center gap-1"><DollarSign size={14} className="shrink-0" /> <span className="break-all">~{formatPrice(totalCost)}</span></span>}
              </div>
              {itinerary.aiGenerated && (
                <span className="inline-flex items-center gap-1 mt-2 bg-white/15 text-white text-xs px-2.5 py-1 rounded-full">
                  <Star size={12} /> {t('itinerary.aiGenerated')}
                </span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap max-w-full">
              <Button size="sm" variant="secondary" onClick={() => setShowFuelSettings(true)} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full">
                <Car size={14} /> <span className="hidden sm:inline">{t('itinerary.fuelSettings')}</span><span className="sm:hidden">⛽</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowShareDialog(true)} disabled={sharing} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full">
                {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} <span className="hidden sm:inline">{t('itinerary.share')}</span>
              </Button>
               <Button size="sm" variant="secondary" onClick={handleShareAsStory} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full bg-white/20 hover:bg-white/30 border-white/30">
                <Camera size={14} /> <span className="hidden sm:inline">{t('stories.shareAdventure', { defaultValue: 'Share as Story' })}</span><span className="sm:hidden">📸</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowTripReels(true)} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full bg-white/20 hover:bg-white/30 border-white/30">
                <Film size={14} /> <span className="hidden sm:inline">{i18n.language?.startsWith('ar') ? 'ريلز' : 'Reels'}</span><span className="sm:hidden">🎬</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={handleDownload} disabled={pdfGenerating} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full">
                {pdfGenerating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} <span className="hidden sm:inline">{t('itinerary.downloadPdf')}</span><span className="sm:hidden">PDF</span>
              </Button>
              {pdfGenerating && (
                <div className="w-full max-w-[200px]">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${pdfProgress}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground text-center mt-0.5">{pdfProgress}%</p>
                </div>
              )}
              <Button size="sm" variant="secondary" onClick={handleDownloadHTML} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full">
                <FileText size={14} /> HTML
              </Button>
              <Button size="sm" variant="secondary" onClick={handleDownloadFullCalendar} className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full">
                <Calendar size={14} /> <span className="hidden sm:inline">{t('itinerary.addAllToCalendar', { defaultValue: 'Add to Calendar' })}</span><span className="sm:hidden">📅</span>
              </Button>
              <Button
                size="sm"
                variant={saved ? "default" : "secondary"}
                onClick={handleSaveTrip}
                disabled={saving}
                className={`gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full ${saved ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                <span className="hidden sm:inline">{saved ? t('itinerary.tripSaved', { defaultValue: 'Saved ✓' }) : t('itinerary.saveTrip', { defaultValue: 'Save Trip' })}</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleSaveAsMemory}
                disabled={savingMemory}
                className="gap-1 text-[11px] sm:text-sm px-2.5 sm:px-3 max-w-full"
              >
                {savingMemory ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                <span className="hidden sm:inline">{i18n.language?.startsWith('ar') ? 'حفظ كذكرى' : 'Save Memory'}</span>
                <span className="sm:hidden">💾</span>
              </Button>
            </div>

            <Separator className="bg-white/20" />

            <div className="flex gap-2 flex-wrap items-center max-w-full">
              <span className="text-sm font-medium text-white/90 break-words">{t('itinerary.bookYourTrip', { defaultValue: 'Book your trip:' })}</span>
              <Button 
                size="sm" 
                className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 shadow-lg border-none max-w-full text-[11px] sm:text-sm px-2.5 sm:px-3"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("tab", "flights");
                  params.set("to", itinerary.destination);
                  params.set("date", safeFormat(itinerary.startDate, "yyyy-MM-dd"));
                  if (itinerary.endDate) params.set("returnDate", safeFormat(itinerary.endDate, "yyyy-MM-dd"));
                  params.set("guests", String(itinerary.travelMetadata?.adults || 2));
                  if (id) params.set("itineraryId", id);
                  navigate(`/bookings?${params.toString()}`);
                }}
              >
                <Plane size={14} /> {t('itinerary.viewFlights', { defaultValue: 'View Flights' })}
              </Button>
              <Button 
                size="sm" 
                className="bg-blue-500 hover:bg-blue-600 text-white gap-1.5 shadow-lg border-none max-w-full text-[11px] sm:text-sm px-2.5 sm:px-3"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("tab", "hotels");
                  params.set("to", itinerary.destination);
                  params.set("date", safeFormat(itinerary.startDate, "yyyy-MM-dd"));
                  params.set("returnDate", safeFormat(itinerary.endDate || addDays(safeDate(itinerary.startDate), 1), "yyyy-MM-dd"));
                  params.set("guests", String(itinerary.travelMetadata?.adults || 2));
                  if (id) params.set("itineraryId", id);
                  navigate(`/bookings?${params.toString()}`);
                }}
              >
                <Hotel size={14} /> {t('itinerary.viewHotels', { defaultValue: 'View Hotels' })}
              </Button>
              <Button 
                size="sm" 
                className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 shadow-lg border-none max-w-full text-[11px] sm:text-sm px-2.5 sm:px-3"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("destination", itinerary.destination);
                  params.set("pickup_date", safeFormat(itinerary.startDate, "yyyy-MM-dd"));
                  params.set("dropoff_date", safeFormat(itinerary.endDate || addDays(safeDate(itinerary.startDate), 3), "yyyy-MM-dd"));
                  navigate(`/cars?${params.toString()}`);
                }}
              >
                <Car size={14} /> {t('itinerary.rentCar', { defaultValue: 'Rent a Car' })}
              </Button>
            </div>

            {/* Live Credits Counter */}
            {remainingCredits && (
              <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 mt-3 space-y-2.5">
                {/* Daily Credits */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Lightbulb size={14} className="text-yellow-300" />
                    <span className="text-xs text-white/90 font-medium">
                      {i18n.language?.startsWith('ar') ? 'الرصيد اليومي' : 'Daily Credits'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-1 bg-white/20 rounded-full px-3 py-1">
                      <span className={`text-sm font-bold ${remainingCredits.limit - remainingCredits.used <= 2 ? 'text-red-300' : 'text-white'}`}>
                        {Math.max(0, remainingCredits.limit - remainingCredits.used)}
                      </span>
                      <span className="text-[10px] text-white/70">/ {remainingCredits.limit}</span>
                    </div>
                    {remainingCredits.planName && (
                      <span className="bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-medium truncate max-w-[100px]">
                        {remainingCredits.planName}
                      </span>
                    )}
                    {remainingCredits.limit - remainingCredits.used <= 0 && (
                      <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2 bg-yellow-500 hover:bg-yellow-600 text-black border-none"
                        onClick={() => navigate('/pricing')}>
                        {i18n.language?.startsWith('ar') ? 'ترقية' : 'Upgrade'}
                      </Button>
                    )}
                  </div>
                </div>
                {/* Total Subscription Activities - show for ALL users including guests */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-300" />
                    <span className="text-xs text-white/90 font-medium">
                      {i18n.language?.startsWith('ar') ? 'الأنشطة المتبقية' : 'Activities Left'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {remainingCredits.totalActivities != null && remainingCredits.totalActivities > 0 ? (
                      <>
                        <div className="flex items-center gap-1 bg-white/20 rounded-full px-3 py-1 min-w-0">
                          <span className={`text-sm font-bold ${(remainingCredits.remainingActivities ?? 0) <= 3 ? 'text-red-300' : 'text-emerald-300'}`}>
                            {remainingCredits.remainingActivities ?? 0}
                          </span>
                          <span className="text-[10px] text-white/70">/ {remainingCredits.totalActivities}</span>
                        </div>
                        {remainingCredits.remainingActivities === 0 && (
                          <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2 bg-yellow-500 hover:bg-yellow-600 text-black border-none"
                            onClick={() => navigate('/pricing')}>
                            {i18n.language?.startsWith('ar') ? 'ترقية' : 'Upgrade'}
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-white/60">
                        {i18n.language?.startsWith('ar') ? 'غير محدود' : 'Unlimited'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-2 sm:px-4 max-w-full overflow-hidden min-w-0">
        {/* Booking Cost Summary */}
        {itinerary.bookingSelections && (
          <div className="mt-4 mb-2">
            <BookingCostSummary
              bookingSelections={itinerary.bookingSelections}
              duration={itinerary.duration || 1}
            />
          </div>
        )}

        {/* Auto-selected Hotels & Flights from generator (SerpAPI) */}
        <SelectedTripBookings
          selectedHotels={itinerary.selectedHotels}
          selectedFlights={itinerary.selectedFlights}
        />

        <div className="mt-4 rounded-2xl border border-primary/20 bg-accent/40 px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            {(() => {
              const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
              switch (code) {
                case 'ar': return 'تنبيه: عدد الأنشطة يشمل الوجبات أيضًا، لذلك إذا اخترت 3 أنشطة مع فطور وغداء فسيتم توليد فطور وغداء ونشاط واحد فقط.';
                case 'fr': return 'Avis : les repas sont inclus dans le total des activités. Choisir 3 activités avec petit-déjeuner et déjeuner générera donc petit-déjeuner, déjeuner et 1 activité supplémentaire.';
                case 'es': return 'Aviso: las comidas se incluyen en el total de actividades. Si eliges 3 actividades con desayuno y almuerzo, se generarán desayuno, almuerzo y solo 1 actividad adicional.';
                case 'de': return 'Hinweis: Mahlzeiten zählen zur Gesamtzahl der Aktivitäten. Bei 3 Aktivitäten mit Frühstück und Mittagessen werden Frühstück, Mittagessen und nur 1 zusätzliche Aktivität erstellt.';
                case 'ru': return 'Внимание: приёмы пищи входят в общее число активностей. При выборе 3 активностей с завтраком и обедом будут созданы только завтрак, обед и 1 дополнительная активность.';
                case 'zh': return '提示：餐饮已计入活动总数。若选择 3 项活动并包含早餐和午餐，将仅生成早餐、午餐和 1 项额外活动。';
                case 'ur': return 'نوٹ: کھانے سرگرمیوں کی کل تعداد میں شامل ہیں۔ ناشتے اور دوپہر کے کھانے کے ساتھ 3 سرگرمیاں منتخب کرنے پر صرف ناشتہ، دوپہر کا کھانا اور 1 اضافی سرگرمی تیار ہوگی۔';
                default: return 'Notice: meals are included in the activity total, so selecting 3 activities with breakfast and lunch will generate breakfast, lunch, and 1 extra activity only.';
              }
            })()}
          </p>
        </div>

        {/* Partner Deals for this destination */}
        {itinerary?.destination && (
          <PartnerDealsSection city={itinerary.destination.split(',')[0].trim()} />
        )}

        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6 mt-6 max-w-full min-w-0">
          {/* Sidebar */}
          <div className="hidden lg:block space-y-4 min-w-0">
            <Card className="p-4">
              <h2 className="text-base font-semibold text-foreground mb-3">{t('itinerary.overview')}</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={14} className="text-primary shrink-0" />
                  <span>{itinerary.destination}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={14} className="text-primary shrink-0" />
                  <span>{safeFormat(itinerary.startDate, "MMM dd")} — {safeFormat(itinerary.endDate, "MMM dd")}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={14} className="text-primary shrink-0" />
                  <span>{itinerary.duration} {t('travel.days')}</span>
                </div>
                {totalCost > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={14} className="text-primary shrink-0" />
                    <span>~{formatPrice(totalCost)} {t('itinerary.estimate')}</span>
                  </div>
                )}
              </div>
            </Card>

            {tripTotalStats.totalDistance > 0 && (
              <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-emerald-200 dark:border-emerald-800">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Car size={14} className="text-emerald-600" /> {t('itinerary.carTravelStats')}
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Route size={12} /> {t('itinerary.totalDistance')}
                    </span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">{Number(tripTotalStats.totalDistance).toFixed(1)} {t('itinerary.km')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Fuel size={12} /> {t('itinerary.fuelCost')}
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-300">{formatPrice(tripTotalStats.fuelCost)}</span>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t('itinerary.daysLabel')}</h3>
              <div className="space-y-1.5">
                {itinerary.days.map((day: any, index: number) => (
                  <button key={index} 
                    onClick={() => setActiveDay(index)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverDay(index); }}
                    onDragLeave={() => setDragOverDay(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverDay(null);
                      const activityId = e.dataTransfer.getData('activityId');
                      const fromDay = parseInt(e.dataTransfer.getData('fromDay'), 10);
                      if (activityId && !isNaN(fromDay) && fromDay !== index) {
                        handleMoveActivity(activityId, fromDay, index);
                        toast.success(i18n.language?.startsWith('ar') ? `✅ تم نقل النشاط إلى اليوم ${index + 1}` : `✅ Activity moved to Day ${index + 1}`);
                      }
                    }}
                    className={`w-full text-left p-2.5 rounded-lg transition-all text-sm ${activeDay === index
                        ? "bg-primary/10 text-primary font-medium border border-primary/20"
                        : dragOverDay === index
                          ? "bg-primary/20 border-2 border-primary border-dashed scale-[1.02]"
                          : "hover:bg-muted text-foreground"
                      }`}>
                    <div className="font-medium">{t('itinerary.day')} {index + 1}</div>
                    <div className="text-xs text-muted-foreground">{safeFormat(day.date, "EEE, MMM dd")}</div>
                    <div className="text-xs mt-0.5">{(day.activities || []).length} {t('itinerary.activities')}</div>
                  </button>
                ))}
                <button
                  onClick={handleAddDay}
                  className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-all text-sm font-medium"
                >
                  <Plus size={16} /> {i18n.language?.startsWith('ar') ? 'إضافة يوم' : 'Add Day'}
                </button>
              </div>
            </Card>

            {itinerary.tips?.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Lightbulb size={14} className="text-yellow-500" /> {t('itinerary.tips')}
                </h3>
                <ul className="space-y-2">
                  {itinerary.tips.map((tip: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Check size={12} className="text-primary mt-0.5 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* City Overview */}
            {itinerary.cityOverview && (
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Globe size={14} className="text-primary" /> {t('itinerary.cityGuide', { defaultValue: 'City Guide' })}
                </h3>
                {itinerary.cityOverview.description && (
                  <p className="text-xs text-muted-foreground">{itinerary.cityOverview.description}</p>
                )}
                <div className="space-y-1.5 text-xs">
                  {itinerary.cityOverview.language && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Languages size={12} className="text-primary shrink-0" />
                      <span>{itinerary.cityOverview.language}</span>
                    </div>
                  )}
                  {itinerary.cityOverview.currency && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Coins size={12} className="text-primary shrink-0" />
                      <span>{itinerary.cityOverview.currency}</span>
                    </div>
                  )}
                  {itinerary.cityOverview.timezone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock size={12} className="text-primary shrink-0" />
                      <span>{itinerary.cityOverview.timezone}</span>
                    </div>
                  )}
                </div>
                {itinerary.cityOverview.highlights?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1">{t('itinerary.highlights', { defaultValue: 'Highlights' })}</h4>
                    <ul className="space-y-1">
                      {itinerary.cityOverview.highlights.map((h: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Star size={10} className="text-primary mt-0.5 shrink-0" /> {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {itinerary.cityOverview.customs?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1">{t('itinerary.customs', { defaultValue: 'Local Customs' })}</h4>
                    <ul className="space-y-1">
                      {itinerary.cityOverview.customs.map((c: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <Check size={10} className="text-primary mt-0.5 shrink-0" /> {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {itinerary.cityOverview.emergencyNumbers && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                      <Phone size={10} className="text-destructive" /> {t('itinerary.emergency', { defaultValue: 'Emergency Numbers' })}
                    </h4>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {itinerary.cityOverview.emergencyNumbers.police && <div>🚔 Police: {itinerary.cityOverview.emergencyNumbers.police}</div>}
                      {itinerary.cityOverview.emergencyNumbers.ambulance && <div>🚑 Ambulance: {itinerary.cityOverview.emergencyNumbers.ambulance}</div>}
                      {itinerary.cityOverview.emergencyNumbers.fire && <div>🚒 Fire: {itinerary.cityOverview.emergencyNumbers.fire}</div>}
                      {itinerary.cityOverview.emergencyNumbers.tourist_police && <div>🛡️ Tourist Police: {itinerary.cityOverview.emergencyNumbers.tourist_police}</div>}
                      {itinerary.cityOverview.emergencyNumbers.embassy_note && <div className="mt-1 italic">{itinerary.cityOverview.emergencyNumbers.embassy_note}</div>}
                    </div>
                  </div>
                )}
                {itinerary.cityOverview.safety && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                      <Shield size={10} className="text-primary" /> {t('itinerary.safety', { defaultValue: 'Safety' })}
                    </h4>
                    <p className="text-xs text-muted-foreground">{itinerary.cityOverview.safety}</p>
                  </div>
                )}
                {itinerary.cityOverview.usefulPhrases?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1">{t('itinerary.phrases', { defaultValue: 'Useful Phrases' })}</h4>
                    <ul className="space-y-0.5">
                      {itinerary.cityOverview.usefulPhrases.map((p: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground">• {p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {itinerary.cityOverview.transportation && (
                  <div>
                    <h4 className="text-xs font-semibold text-foreground mb-1">{t('itinerary.transport', { defaultValue: 'Getting Around' })}</h4>
                    <p className="text-xs text-muted-foreground">{itinerary.cityOverview.transportation}</p>
                  </div>
                )}
              </Card>
            )}

            {/* Destination News & Currency - Show for all cities in multi-city trips */}
            {(() => {
              const uniqueCities = Array.from(new Set(
                itinerary.days?.map((d: any) => d.cityName).filter(Boolean) || []
              ));
              if (uniqueCities.length > 1) {
                return uniqueCities.map((city: string) => (
                  <DestinationInfoCard key={city} destination={city} tripDays={
                    itinerary.days?.filter((d: any) => d.cityName === city).length || 1
                  } startDate={itinerary.days?.find((d: any) => d.cityName === city)?.date || itinerary.startDate} />
                ));
              }
              return <DestinationInfoCard destination={itinerary.destination} tripDays={itinerary.duration || itinerary.days?.length || 3} startDate={itinerary.startDate} />;
            })()}
          </div>

          {/* Main Content */}
          <div className="min-w-0 max-w-full overflow-hidden">
            <div className="lg:hidden mb-4 min-w-0 max-w-full">
              {(() => {
                const uniqueCities = Array.from(new Set(
                  itinerary.days?.map((d: any) => d.cityName).filter(Boolean) || []
                ));
                if (uniqueCities.length > 1) {
                  return uniqueCities.map((city: string) => (
                    <DestinationInfoCard key={city} destination={city} tripDays={
                      itinerary.days?.filter((d: any) => d.cityName === city).length || 1
                    } startDate={itinerary.days?.find((d: any) => d.cityName === city)?.date || itinerary.startDate} />
                  ));
                }
                return <DestinationInfoCard destination={itinerary.destination} tripDays={itinerary.duration || itinerary.days?.length || 3} startDate={itinerary.startDate} />;
              })()}
            </div>

            <Tabs defaultValue="schedule" className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="schedule" className="text-sm">{t('itinerary.schedule')}</TabsTrigger>
                <TabsTrigger value="map" className="text-sm">{t('itinerary.map')}</TabsTrigger>
                <TabsTrigger value="summary" className="text-sm">{t('itinerary.summary')}</TabsTrigger>
              </TabsList>

              <TabsContent value="schedule" className="mt-0">
                <div className="lg:hidden mb-4 -mx-4 px-4">
                  <div 
                    ref={mobileDayTabsRef}
                    className="flex gap-2 p-1.5 pb-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth max-w-full" 
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', scrollbarWidth: 'none' }}
                  >
                    {itinerary.days.map((day: any, index: number) => {
                      const isActive = activeDay === index;
                      const isDragTarget = dragOverDay === index;
                      const cityLabel = day.cityName ? ` • ${day.cityName.split(',')[0]}` : '';
                      return (
                        <motion.button 
                          key={index}
                          ref={(el: HTMLButtonElement | null) => { if (el) dayBtnRefs.current[index] = el; }}
                          layout
                          whileTap={{ scale: 0.93 }}
                          onClick={() => {
                            setActiveDay(index);
                            dayBtnRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                          }}
                          onDragOver={(e) => { e.preventDefault(); setDragOverDay(index); }}
                          onDragLeave={() => setDragOverDay(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragOverDay(null);
                            const activityId = e.dataTransfer.getData('activityId');
                            const fromDay = parseInt(e.dataTransfer.getData('fromDay'), 10);
                            if (activityId && !isNaN(fromDay) && fromDay !== index) {
                              handleMoveActivity(activityId, fromDay, index);
                              toast.success(i18n.language?.startsWith('ar') ? `✅ تم نقل النشاط إلى اليوم ${index + 1}` : `✅ Activity moved to Day ${index + 1}`);
                            }
                          }}
                          className={cn(
                            "snap-center shrink-0 min-w-[60px] max-w-[140px] px-3 py-2.5 rounded-xl transition-all duration-200 text-xs relative",
                            isActive && "bg-primary text-primary-foreground font-semibold shadow-md ring-2 ring-primary/30",
                            isDragTarget && !isActive && "bg-primary/20 border-2 border-primary border-dashed scale-110 shadow-lg",
                            !isActive && !isDragTarget && "bg-card border border-border hover:bg-muted/80 hover:shadow-sm"
                          )}
                        >
                          {isActive && (
                            <motion.div 
                              layoutId="activeDayIndicator"
                              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                              transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            />
                          )}
                          <div className="font-semibold whitespace-nowrap">
                            {i18n.language?.startsWith('ar') ? `${index + 1}` : `${index + 1}`}
                          </div>
                          <div className="text-[10px] opacity-75 truncate max-w-full">{safeFormat(day.date, "dd/MM")}{cityLabel}</div>
                          <div className="text-[9px] opacity-50 truncate max-w-full">{day.activities?.length || 0} {i18n.language?.startsWith('ar') ? 'نشاط' : 'act.'}</div>
                        </motion.button>
                      );
                    })}
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={handleAddDay}
                      className="snap-center shrink-0 min-w-[56px] px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 text-xs flex flex-col items-center justify-center gap-0.5"
                    >
                      <Plus size={16} />
                      <div className="text-[10px] font-medium whitespace-nowrap">{i18n.language?.startsWith('ar') ? 'يوم+' : '+Day'}</div>
                    </motion.button>
                  </div>
                </div>

                <ItinerarySchedule
                  day={itinerary.days[activeDay]}
                  destination={itinerary.destination}
                  onMapClick={handleViewInMaps}
                  onUpdateDay={(updatedDay) => handleUpdateDay(activeDay, updatedDay)}
                  onMoveActivity={handleMoveActivity}
                  onRegenerateActivity={handleRegenerateActivity}
                  onRegenerateDay={handleRegenerateDay}
                  regenerating={false}
                  dayIndex={activeDay}
                  totalDays={itinerary.days.length}
                  fuelSettings={fuelSettings}
                  regenCosts={(() => {
                    const dayCount = itinerary.days[activeDay]?.activities?.length || 5;
                    const totalCount = itinerary.days?.reduce((s: number, d: any) => s + (d.activities?.length || 0), 0) || 10;
                    return {
                      activity: Math.max(1, Math.ceil(Number(regenCosts.activity) || 1)),
                      day: Math.max(1, Math.ceil(dayCount * (Number(regenCosts.dayMultiplier) || 1.5))),
                      full: Math.max(1, Math.ceil(totalCount * (Number(regenCosts.fullMultiplier) || 1.5))),
                    };
                  })()}
                  remainingActivities={remainingCredits?.remainingActivities ?? null}
                  tripMeta={{
                    tripType: itinerary.tripType,
                    interests: itinerary.interests,
                    cuisinePreferences: itinerary.cuisinePreferences,
                    mealPreferences: itinerary.mealPreferences,
                    specialRequests: itinerary.specialRequests,
                    travelStyle: itinerary.travelStyle,
                    budget: itinerary.budget,
                    activitiesPerDay: (itinerary as any).activitiesPerDay ?? (itinerary as any).maxActivitiesPerDay,
                    maxActivitiesPerDay: (itinerary as any).maxActivitiesPerDay ?? (itinerary as any).activitiesPerDay,
                    totalDailyItemsTarget: (itinerary as any).totalDailyItemsTarget ?? (itinerary as any).maxActivitiesPerDay,
                    preferenceMatchSummary: (itinerary as any).preferenceMatchSummary,
                  }}
                />

                {/* Share Full Plan Button */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="mt-8 mb-4 grid grid-cols-1 gap-3 overflow-hidden"
                >
                  <Button
                    onClick={() => shareFullPlanAsImage({ itinerary, isArabic: i18n.language?.startsWith('ar') })}
                    variant="outline"
                    className="w-full h-12 sm:h-14 gap-2 px-4 sm:px-6 text-xs sm:text-base font-semibold rounded-2xl border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm"
                  >
                    <Share2 size={16} className="shrink-0 sm:w-[18px] sm:h-[18px]" />
                    <span className="truncate">{i18n.language?.startsWith('ar') ? 'مشاركة الخطة الكاملة كصورة' : 'Share Full Plan as Image'}</span>
                  </Button>
                </motion.div>

                {/* Preference Verification Panel — hidden from end users (kept in source for internal QA) */}
              </TabsContent>

              <TabsContent value="map" className="mt-0">
                <Card className="p-4 sm:p-6">
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4">
                    {itinerary.days.map((day: any, index: number) => (
                      <button
                        key={`map-day-${index}`}
                        onClick={() => setActiveDay(index)}
                        className={cn(
                          "shrink-0 px-4 py-2 rounded-xl transition-all text-sm",
                          activeDay === index
                            ? "bg-primary text-primary-foreground font-medium shadow-sm"
                            : "bg-card border border-border hover:bg-muted"
                        )}
                      >
                        <div className="font-medium">{t('itinerary.day')} {index + 1}</div>
                        <div className="text-xs opacity-70">{safeFormat(day.date, "MMM dd")}</div>
                      </button>
                    ))}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">{t('itinerary.mapForDay', { num: activeDay + 1 })}</h3>
                  <ItineraryMap activities={itinerary.days[activeDay].activities} onMarkerClick={handleViewInMaps} />
                  <div className="mt-4 space-y-2">
                    {itinerary.days[activeDay].activities.map((activity: any) => {
                      const mapUrl = getActivityMapUrl(activity);
                      return (
                        <div key={activity.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                          onClick={() => handleViewInMaps(mapUrl)}>
                          <div className="bg-primary/10 p-2 rounded-lg">
                            <MapPin size={16} className="text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground truncate">{activity.title || activity.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{activity.address || activity.location}</div>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{activity.startTime || activity.time}</span>
                          <Navigation size={14} className="text-muted-foreground shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-0 space-y-6">
                {/* Destination Info: News, Currency, Weather, Emergency, Customs */}
                {(() => {
                  const uniqueCities = Array.from(new Set(
                    itinerary.days?.map((d: any) => d.cityName).filter(Boolean) || []
                  ));
                  if (uniqueCities.length > 1) {
                    return uniqueCities.map((city: string) => (
                      <DestinationInfoCard key={city} destination={city} tripDays={
                        itinerary.days?.filter((d: any) => d.cityName === city).length || 1
                      } startDate={itinerary.days?.find((d: any) => d.cityName === city)?.date || itinerary.startDate} />
                    ));
                  }
                  return <DestinationInfoCard destination={itinerary.destination} tripDays={itinerary.duration || itinerary.days?.length || 3} startDate={itinerary.startDate} />;
                })()}

                <Card className="p-4 sm:p-6 space-y-5">
                  <h2 className="text-lg font-semibold text-foreground">{t('itinerary.summary')}</h2>

                  {/* Detailed Cost Breakdown */}
                  <div className="bg-muted/30 border border-border p-4 rounded-xl space-y-3">
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      <DollarSign size={16} className="text-primary" /> {t('itinerary.costBreakdown')}
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">🎯 {t('itinerary.activitiesCost')}</span>
                        <span className="font-semibold">{formatPrice(totalActivitiesCost)}</span>
                      </div>
                      {flightCostCalc > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">✈️ {t('itinerary.flightsCost')}</span>
                          <span className="font-semibold">{formatPrice(flightCostCalc)}</span>
                        </div>
                      )}
                      {hotelCostCalc > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">🏨 {t('itinerary.hotelCost')}</span>
                          <span className="font-semibold">{formatPrice(hotelCostCalc)}</span>
                        </div>
                      )}
                      {tripTotalStats.fuelCost > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">⛽ {t('itinerary.transportCost')}</span>
                          <span className="font-semibold">{formatPrice(tripTotalStats.fuelCost)}</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-2 flex justify-between">
                        <span className="font-bold text-primary">{t('itinerary.grandTotal')}</span>
                        <span className="text-xl font-bold text-primary">{formatPrice(totalCost + tripTotalStats.fuelCost)}</span>
                      </div>
                    </div>
                  </div>

                  {tripTotalStats.totalDistance > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl">
                      <h3 className="font-medium text-emerald-800 dark:text-emerald-300 mb-3 flex items-center gap-2">
                        <Car size={16} /> {t('itinerary.carTravelStats')}
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-muted-foreground">{t('itinerary.totalDistance')}</div>
                          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{Number(tripTotalStats.totalDistance).toFixed(1)} {t('itinerary.km')}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">{t('itinerary.fuelCost')}</div>
                          <div className="text-xl font-bold text-amber-700 dark:text-amber-300">${Number(tripTotalStats.fuelCost).toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {itinerary.tips?.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-xl">
                      <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                        <Lightbulb size={16} /> {t('itinerary.tips')}
                      </h3>
                      <ul className="space-y-1.5">
                        {itinerary.tips.map((tip: string, i: number) => (
                          <li key={i} className="text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
                            <Check size={14} className="mt-0.5 shrink-0" /> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Separator />

                  <div>
                    <h3 className="text-base font-medium text-foreground mb-3">{t('itinerary.daysLabel')}</h3>
                    <div className="space-y-2">
                      {itinerary.days.map((day: any, index: number) => {
                        const dayCost = (day.activities || []).reduce((s: number, a: any) => s + (a.cost || 0), 0);
                        const dayStats = calculateDayTripStats(day.activities || [], fuelSettings.efficiency, fuelSettings.price);
                        return (
                          <div key={index} className="bg-muted/50 p-3 rounded-xl">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm text-foreground">{t('itinerary.day')} {index + 1}</div>
                                <div className="text-xs text-muted-foreground">{safeFormat(day.date, "EEE, MMM dd")} · {(day.activities || []).length} {t('itinerary.activities')}</div>
                              </div>
                              <div className="text-right">
                                {dayCost > 0 && <span className="text-sm font-semibold text-primary block">${dayCost}</span>}
                                {dayStats.totalDistance > 0 && (
                                  <span className="text-xs text-muted-foreground">{dayStats.totalDistance} {t('itinerary.km')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Fuel Settings Dialog */}
      <Dialog open={showFuelSettings} onOpenChange={setShowFuelSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={18} /> {t('itinerary.fuelSettings')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t('wizard.fuelEfficiency')}</Label>
              <Input
                type="number"
                value={fuelSettings.efficiency}
                onChange={(e) => setFuelSettings(s => ({ ...s, efficiency: Number(e.target.value) }))}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>{t('wizard.fuelPriceLabel')}</Label>
              <Input
                type="number"
                step="0.1"
                value={fuelSettings.price}
                onChange={(e) => setFuelSettings(s => ({ ...s, price: Number(e.target.value) }))}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowFuelSettings(false)}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              {t('share.title', { defaultValue: 'مشاركة الرحلة' })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Share mode selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t('share.shareMode', { defaultValue: 'نوع المشاركة' })}
              </Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                  <input type="radio" name="shareMode" checked={shareOptions.fullTrip} onChange={() => setShareOptions({ fullTrip: true, photosOnly: false, reviewsOnly: false })} className="accent-primary" />
                  <div>
                    <span className="text-sm font-medium">{t('share.fullTrip', { defaultValue: 'مشاركة كاملة' })}</span>
                    <p className="text-xs text-muted-foreground">{t('share.fullTripDesc', { defaultValue: 'مشاركة جميع تفاصيل الرحلة والأنشطة والخريطة' })}</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                  <input type="radio" name="shareMode" checked={shareOptions.photosOnly} onChange={() => setShareOptions({ fullTrip: false, photosOnly: true, reviewsOnly: false })} className="accent-primary" />
                  <div>
                    <span className="text-sm font-medium">{t('share.photosOnly', { defaultValue: 'الصور والأماكن فقط' })}</span>
                    <p className="text-xs text-muted-foreground">{t('share.photosOnlyDesc', { defaultValue: 'مشاركة الصور التي التقطتها والأماكن المصورة' })}</p>
                  </div>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted transition-colors">
                  <input type="radio" name="shareMode" checked={shareOptions.reviewsOnly} onChange={() => setShareOptions({ fullTrip: false, photosOnly: false, reviewsOnly: true })} className="accent-primary" />
                  <div>
                    <span className="text-sm font-medium">{t('share.reviewsOnly', { defaultValue: 'التقييمات والتعليقات فقط' })}</span>
                    <p className="text-xs text-muted-foreground">{t('share.reviewsOnlyDesc', { defaultValue: 'مشاركة تقييماتك وتعليقاتك على الأماكن' })}</p>
                  </div>
                </label>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-sm font-medium">
                {t('share.withEmail', { defaultValue: 'مشاركة مع شخص محدد (اختياري)' })}
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={() => handleShare(shareEmail)}
                  disabled={sharing || !shareEmail.trim()}
                  size="sm"
                >
                  {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('share.emailHint', { defaultValue: 'سيتم إرسال إشعار داخل التطبيق للمستلم' })}
              </p>
            </div>
            <Separator />
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => handleShare()}
              disabled={sharing}
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              {t('share.copyLink', { defaultValue: 'نسخ رابط المشاركة' })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trip Reels Export */}
      <TripReelsExport
        tripData={itinerary}
        title={itinerary.destination || ''}
        location={itinerary.destination}
        authorName={user?.user_metadata?.full_name}
        open={showTripReels}
        onOpenChange={setShowTripReels}
      />
    </motion.div>
  );
};

export default ItineraryPage;
