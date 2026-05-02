import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Sparkles, Check, MapPin, Users, Calendar, DollarSign, Plane, Mic, MicOff, Phone, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import ReactMarkdown from "react-markdown";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import VoiceCallOverlay from "./VoiceCallOverlay";
import { getLocalizedCopy } from "@/lib/localizedMessages";
import { enforceDailyItemLimit } from "@/utils/enforceDailyItemLimit";
import { getFriendlyGenerationError } from "@/lib/generationErrors";
import { invokeGenerateTripWithRetry } from "@/lib/invokeWithRetry";

interface TripDetails {
  destination?: string;
  departureCity?: string;
  travelers?: number;
  children?: number;
  duration?: number;
  startDate?: string;
  budget?: number;
  interests?: string[];
  tripType?: string;
  cuisineTypes?: string[];
  mealPreferences?: {
    breakfast?: boolean;
    lunch?: boolean;
    dinner?: boolean;
    snacks?: boolean;
    cuisineTypes?: string[];
  };
  specialRequests?: string;
  ready?: boolean;
  confirmed?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const DetailChip = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-medium">
    <Icon size={12} />
    <span>{label}:</span>
    <span className="font-bold">{value}</span>
  </div>
);


const PromptTripPlanner = () => {
  const { t } = useTranslation();
  const localized = useMemo(() => getLocalizedCopy(i18n.language), [i18n.language]);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { 
    maxActivitiesPerDay, 
    remainingActivities, 
    hasPlan, 
    loading: loadingLimits,
    chatEnabled,
    voiceEnabled,
    maxChatUses,
    maxVoiceUses,
    usedChatCount,
    usedVoiceCount,
  } = useSubscriptionLimits();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [tripDetails, setTripDetails] = useState<TripDetails>({});
  const [usageLimited, setUsageLimited] = useState(false);
  const [siteSettings, setSiteSettings] = useState<{ guest_generation_enabled: boolean; guest_trial_limit: number; free_user_daily_limit: number; guest_chat_enabled: boolean; guest_max_chat_uses: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prefillHandled = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    supabase
      .from("site_settings")
      .select("guest_generation_enabled, guest_trial_limit, free_user_daily_limit, guest_chat_enabled, guest_max_chat_uses")
      .eq("id", "default")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setSiteSettings({
            guest_generation_enabled: d.guest_generation_enabled === true,
            guest_trial_limit: d.guest_trial_limit ?? 1,
            free_user_daily_limit: d.free_user_daily_limit ?? 5,
            guest_chat_enabled: d.guest_chat_enabled === true,
            guest_max_chat_uses: d.guest_max_chat_uses || 0,
          });
        }
      });
  }, []);

  const getGuestId = async () => {
    // Use device fingerprint that survives incognito + different browsers
    const { getDeviceFingerprint } = await import('@/utils/deviceFingerprint');
    const fp = await getDeviceFingerprint();
    // Keep legacy key for backwards-compat
    try { localStorage.setItem('guest_id', fp); } catch { /* noop */ }
    return fp;
  };

  const checkUsageLimit = async (): Promise<boolean> => {
    try {
      const settings = siteSettings;
      if (!settings) return true;

      const isAr = i18n.language?.startsWith("ar");

      if (!user) {
        if (settings.guest_generation_enabled === false) {
          toast.error(isAr ? "هذه الميزة متاحة فقط للمشتركين أو حسب إعدادات الإدارة" : "This feature is only available to subscribers or when enabled by admin", {
            action: {
              label: isAr ? 'عرض الباقات' : 'View Plans',
              onClick: () => navigate('/pricing'),
            },
          });
          setUsageLimited(true);
          return false;
        }
        const guestId = await getGuestId();
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase.from("usage_tracking").select("*", { count: "exact", head: true }).eq("guest_id", guestId).gte("used_at", today);
        if ((count || 0) >= (settings.guest_trial_limit || 1)) {
          setUsageLimited(true);
          navigate('/pricing');
          return false;
        }
      } else {
        if (hasPlan) {
          if (remainingActivities !== null && remainingActivities <= 0) {
            toast.error(isAr
              ? "لقد استنفدت جميع الرحلات المتاحة في باقتك. يرجى الترقية أو التجديد."
              : "You have exhausted all trips in your plan. Please renew or upgrade.",
              {
                action: {
                  label: isAr ? 'عرض الباقات' : 'View Plans',
                  onClick: () => navigate('/pricing'),
                },
              }
            );
            return false;
          }
        } else {
          toast.error(isAr ? "هذه الميزة ضمن الباقات المدفوعة فقط" : "This feature is available in paid plans only", {
            action: {
              label: isAr ? 'عرض الباقات' : 'View Plans',
              onClick: () => navigate('/pricing'),
            },
          });
          navigate('/pricing');
          return false;
        }
      }
      return true;
    } catch {
      return true;
    }
  };

  const trackUsage = async (feature: "planner" | "chat" | "voice", quantity: number = 1) => {
    try {
      const payload = { feature, quantity };
      if (user) await supabase.from("usage_tracking").insert({ ...payload, user_id: user.id });
      else await supabase.from("usage_tracking").insert({ ...payload, guest_id: await getGuestId() });
      window.dispatchEvent(new CustomEvent('aseel-credits-updated'));
    } catch (e) { console.error("Track usage failed:", e); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    const state = location.state as any;
    if (state?.prefillDestination && !prefillHandled.current) {
      prefillHandled.current = true;
      const dest = state.prefillDestination;
      window.history.replaceState({}, document.title);
      setTimeout(() => { sendMessage(t("prompt.prefillMessage", { defaultValue: `I want to travel to ${dest}`, dest })); }, 300);
    }
  }, [location.state]);

  const sendMessage = async (text: string, fromVoice: boolean = false) => {
    if (!text.trim() || loading || generating) return;
    setInput('');

    const isChatAttempt = !fromVoice;
    if (isChatAttempt && (loadingLimits || (user ? ((hasPlan && !chatEnabled) || !hasPlan || chatLimitReached) : siteSettings?.guest_generation_enabled === false))) {
      toast.error(i18n.language?.startsWith('ar') ? 'الشات الذكي غير متاح في باقتك الحالية.' : 'AI chat is not available in your current plan.', {
        action: { label: i18n.language?.startsWith('ar') ? 'عرض الباقات' : 'View Plans', onClick: () => navigate('/pricing') },
      });
      navigate('/pricing');
      return;
    }

    const allowed = await checkUsageLimit();
    if (!allowed) return;

    if (isChatAttempt) {
      await trackUsage("chat", 1);
    } else {
      await trackUsage("voice", 1);
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    if (fromVoice || voiceCall.isActive) voiceCall.setStatus('thinking');
    // We only track the "chat" part if it's NOT leading to a full trip generation
    // But for simplicity, we let generateTrip handle the heavy weight

    try {
      const dateContextAr = `[\u0633\u064a\u0627\u0642 \u0647\u0627\u0645\u064a \u062c\u062f\u0627\u064b: \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u064a\u0648\u0645 \u0647\u0648 ${new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. \u0627\u0644\u0633\u0646\u0629 \u0647\u064a \u0662\u0660\u0662\u0666. \u064a\u0631\u062c\u0649 \u062a\u062c\u0627\u0647\u0644 \u0623\u064a \u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0633\u0627\u0628\u0642\u0629 \u0639\u0646 \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0641\u064a \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0646\u0638\u0627\u0645.]`;
      const dateContextEn = `[IMPORTANT CONTEXT: Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. The year is 2026.]`;
      const baseSystemPrompt = i18n.language === 'ar' ? dateContextAr : dateContextEn;
      const voicePrompt = voiceCall.isActive
        ? (i18n.language === 'ar'
          ? `\n[\u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629 \u0627\u0644\u0635\u0648\u062a\u064a\u0629: \u0643\u0646 \u0645\u062e\u062a\u0635\u0631 \u062c\u062f\u0627\u064b \u0648\u0648\u062f\u0648\u062f. \u062a\u062c\u0646\u0628 \u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0637\u0648\u064a\u0644\u0629 \u0648\u0627\u0644\u062c\u062f\u0627\u0648\u0644. \u062a\u062d\u062f\u062b \u0628\u0644\u0647\u062c\u0629 \u0639\u0627\u0645\u064a\u0629.]`
          : `\n[VOICE MODE: Be very concise and friendly. No lists or tables. Speak naturally.]`)
        : '';

      const apiMessages = [
        { role: 'system', content: baseSystemPrompt + voicePrompt },
        ...updatedMessages
      ];

      const { data, error } = await supabase.functions.invoke("extract-trip-details", {
        body: { messages: apiMessages, uiLanguage: i18n.language },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const aiMessage = data.message || "";
      const details = data.tripDetails;

      if (details) {
        setTripDetails(prev => {
          const merged = { ...prev };
          Object.entries(details).forEach(([key, value]) => { if (value !== null && value !== undefined) (merged as any)[key] = value; });
          return merged;
        });
        if (details.confirmed && details.ready) {
          const finalDetails = { ...tripDetails, ...details };
          if (aiMessage) setMessages(prev => [...prev, { role: "assistant", content: aiMessage }]);
          setLoading(false);
          await generateTrip(finalDetails);
          return;
        }
      }

      if (aiMessage) {
        setMessages(prev => [...prev, { role: "assistant", content: aiMessage }]);
        // If in voice call, speak the response (hook auto-restarts listening after)
        if (voiceCall.isActive) {
          await voiceCall.speakResponse(aiMessage);
        }
      } else if (voiceCall.isActive) {
        // No response but in call — restart listening
        voiceCall.setStatus('listening');
        voiceCall.startListening();
      }
    } catch (err: any) {
      console.error("Chat error:", err);
      // Try to get detail from function response if available
      const detail = err.context?.detail || err.message || "";
      const errorMsg = detail.includes("Configuration Missing") 
        ? (i18n.language === 'ar' ? "خطأ في الإعدادات: مفاتيح AI غير متوفرة." : "Config error: AI keys missing.")
        : t("chatbot.sorryError", { defaultValue: "Something went wrong" });
      
      toast.error(errorMsg, {
        description: detail.substring(0, 100),
        duration: 5000
      });

      if (voiceCall.isActive) {
        await new Promise(r => setTimeout(r, 500));
        voiceCall.setStatus('listening');
        voiceCall.startListening();
      }
    } finally {
      setLoading(false);
      if (!voiceCall.isActive) setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const generateTrip = async (details: TripDetails) => {
    setGenerating(true);
    let generatedData: any = null;
    toast.info(t("wizard.generatingTrip", { defaultValue: "Generating your trip plan..." }));
    try {
      const actualStartDate = details.startDate || new Date().toISOString().split("T")[0];
      const duration = details.duration || 3;
      const travelers = (details.travelers || 1) + (details.children || 0);
      const selectedCuisineTypes = Array.isArray(details.cuisineTypes) && details.cuisineTypes.length > 0
        ? details.cuisineTypes
        : Array.isArray(details.mealPreferences?.cuisineTypes)
          ? details.mealPreferences.cuisineTypes.filter(Boolean)
          : [];
      const selectedMeals = [
        details.mealPreferences?.breakfast && 'breakfast',
        details.mealPreferences?.lunch && 'lunch',
        details.mealPreferences?.dinner && 'dinner',
        details.mealPreferences?.snacks && 'snacks',
      ].filter(Boolean);
      const requestedTarget = Math.max(1, Number(maxActivitiesPerDay) || 1);
      const additionalPreferences = [
        `Departure city: ${details.departureCity || "not specified"}.`,
        `Travelers: ${details.travelers || 1} adults${details.children ? `, ${details.children} children` : ""}.`,
        details.budget ? `Total budget: $${details.budget} USD.` : "Moderate budget.",
        details.tripType ? `Trip type: ${details.tripType}.` : "",
        `Interests: ${details.interests?.join(", ") || "general sightseeing"}.`,
        selectedCuisineTypes.length > 0 ? `Preferred cuisines: ${selectedCuisineTypes.join(', ')}.` : "",
        selectedMeals.length > 0 ? `MANDATORY MEAL REQUIREMENTS (must include these meals EVERY day):\n${selectedMeals.map((meal) => `- ${meal}`).join('\n')}` : "",
        details.specialRequests || "",
      ].filter(Boolean).join(' ').trim();

      const { data, error } = await invokeGenerateTripWithRetry({
        destination: details.destination,
        departureCity: details.departureCity,
        duration,
        travelers,
        budget: details.budget,
        interests: details.interests || [],
        additionalPreferences,
        tripType: details.tripType,
        mealPreferences: details.mealPreferences,
        cuisineTypes: selectedCuisineTypes,
        specialRequests: details.specialRequests,
        startDate: actualStartDate,
        maxActivitiesPerDay: requestedTarget,
        totalDailyItemsTarget: requestedTarget,
        maxTotalActivitiesRemaining: remainingActivities,
        lang: i18n.language || 'en',
      }, {
        maxAttempts: 3,
        attemptTimeoutMs: 60000,
      });
      if (error) throw new Error(getFriendlyGenerationError(error.message || "Failed to generate trip", i18n.language?.startsWith('ar')));
      if (data?.error) throw new Error(getFriendlyGenerationError(data.error, i18n.language?.startsWith('ar')));
      
      generatedData = data;

      const itineraryId = Math.random().toString(36).substring(2, 10);
      const endDate = new Date(new Date(actualStartDate).getTime() + duration * 86400000);
      const calculateEndTime = (start: string, dur: string): string => {
        const [h, m] = start.split(":").map(Number);
        const match = dur?.match(/(\d+\.?\d*)\s*hour/i);
        const hrs = match ? parseFloat(match[1]) : 1;
        const total = h * 60 + (m || 0) + hrs * 60;
        return `${Math.floor(total / 60) % 24}:${Math.round(total % 60).toString().padStart(2, "0")}`;
      };

      const promptCities: string[] = Array.isArray((details as any).cities)
        ? ((details as any).cities as any[]).map((c: any) => (typeof c === "string" ? c : c?.city)).filter(Boolean)
        : Array.isArray((data as any).cities)
          ? ((data as any).cities as any[]).map((c: any) => (typeof c === "string" ? c : c?.city)).filter(Boolean)
          : [];
      const promptIsMultiCity = promptCities.length >= 2;
      const itineraryToSave = {
        id: itineraryId, destination: data.destination || details.destination, departureCity: details.departureCity,
        startDate: actualStartDate, endDate: endDate.toISOString(), duration, travelers: details.travelers || 1,
        children: details.children || 0, budget: details.budget || 0,
        // CRITICAL for BookingsPage multi-city detection
        cities: promptIsMultiCity ? promptCities : undefined,
        citiesVisited: promptIsMultiCity ? promptCities : undefined,
        multiCity: promptIsMultiCity,
        tripDetails: {
          from: details.departureCity,
          destination: data.destination || details.destination,
          startDate: actualStartDate?.split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          travelers: details.travelers || 1,
          children: details.children || 0,
          cities: promptIsMultiCity ? promptCities : undefined,
          legs: promptIsMultiCity
            ? promptCities.map((city, i) => ({
                from: i === 0 ? details.departureCity : promptCities[i - 1],
                to: city,
                date: actualStartDate?.split('T')[0],
              })).filter(l => l.from && l.to)
            : undefined,
        },
        days: (data.days || []).map((day: any) => ({
          date: day.date || new Date(new Date(actualStartDate).getTime() + ((day.dayNumber || 1) - 1) * 86400000).toISOString(),
          activities: (day.activities || []).map((act: any) => ({
            id: act.id, title: act.name, name: act.name, description: act.description, startTime: act.time,
            endTime: calculateEndTime(act.time, act.duration), address: act.address,
            // Preserve exact place link from generator (place_id-based) so map opens the right place
            googleMapsLink: act.googleMapsUrl || act.googleMapsLink
              || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((act.name || '') + " " + (act.address || ""))}`,
            googleMapsUrl: act.googleMapsUrl || act.googleMapsLink,
            googleMapsCoordsUrl: act.googleMapsCoordsUrl,
            place_id: act.place_id || act.placeId,
            imageUrl: act.imageUrl || "/placeholder.svg", openingHours: act.openingHours, isOpen: true,
            cost: act.cost, type: act.category, category: act.category, duration: act.duration,
            phone: act.phone, website: act.website,
            rating: act.rating, latitude: act.latitude, longitude: act.longitude, enriched: act.enriched,
            // Preserve match anchor metadata so the match banner renders inside activity cards
            isMatchAnchor: act.isMatchAnchor, matchReason: act.matchReason, venue: act.venue,
          })),
        })),
        estimatedTotalCost: data.estimatedTotalCost, cityOverview: data.cityOverview || null,
        tips: data.tips, aiGenerated: true,
        tripType: details.tripType,
        interests: details.interests || [],
        mealPreferences: details.mealPreferences,
        cuisinePreferences: selectedCuisineTypes,
        specialRequests: details.specialRequests || "",
        // Persist the strict per-day target so regeneration uses the original number
        activitiesPerDay: Math.max(0, requestedTarget - selectedMeals.length),
        maxActivitiesPerDay: requestedTarget,
        totalDailyItemsTarget: requestedTarget,
      };

      // ── FINAL VALIDATOR ─────────────────────────────────────────────
      // Trim every day to exactly the requested target (meals + attractions).
      // Match anchors and meals are preserved first; surplus items are dropped.
      const enforced = enforceDailyItemLimit(itineraryToSave.days, requestedTarget, details.mealPreferences);
      itineraryToSave.days = enforced.days;
      if (enforced.trimmedCount > 0) {
        const isAr = i18n.language?.startsWith('ar');
        toast.info(
          isAr
            ? `تم ضبط الخطة لتطابق الحد المطلوب (${requestedTarget}/يوم) — إزالة ${enforced.trimmedCount} نشاط زائد.`
            : `Plan trimmed to match your target (${requestedTarget}/day) — ${enforced.trimmedCount} extra item(s) removed.`
        );
      }

      localStorage.setItem(`itinerary-${itineraryId}`, JSON.stringify(itineraryToSave));
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;

        if (userId) {
          console.log("Saving trip to database pool...", { userId, tripId: itineraryId });
          await supabase.from("saved_trips").insert({ 
            user_id: userId,
            trip_id: itineraryId, 
            destination: itineraryToSave.destination, 
            trip_data: itineraryToSave as any 
          });
        }
      } catch (dbErr) {
        console.warn("Shared pool save failed (silent):", dbErr);
      }

      // Show plan limit notification
      if (data?.planLimitApplied && data.planLimitApplied < 7) {
        const isAr = i18n.language?.startsWith('ar');
        toast.info(
          isAr 
            ? `⚡ باقتك الحالية تسمح بـ ${data.planLimitApplied} فعاليات يومياً. يمكنك ترقية باقتك للحصول على المزيد!`
            : `⚡ Your plan allows ${data.planLimitApplied} activities/day. Upgrade for more!`,
          {
            duration: 8000,
            action: {
              label: isAr ? 'ترقية الباقة' : 'Upgrade',
              onClick: () => navigate('/pricing'),
            },
          }
        );
      }

      toast.success(t("wizard.tripGenerated", { defaultValue: "Trip plan generated!" }), {
        description: i18n.language?.startsWith('ar')
          ? 'تذكير: الفطور والغداء والعشاء تُحتسب ضمن إجمالي عدد الأنشطة.'
          : 'Reminder: breakfast, lunch, and dinner count toward the total activity limit.',
      });
      navigate(`/itinerary/${itineraryId}`);
    } catch (err: any) {
      console.error("Generation error:", err);
      toast.error(err.message || t("chatbot.sorryError"));
      setMessages(prev => [...prev, { role: "assistant", content: t("prompt.generationFailed", { defaultValue: "Sorry, generation failed." }) }]);
    } finally {
      // Count total activities generated from the JSON to track usage
      let totalActivities = 0;
      if (generatedData && Array.isArray(generatedData.days)) {
        const enforced = enforceDailyItemLimit(
          generatedData.days.map((day: any) => ({ ...day, activities: Array.isArray(day.activities) ? day.activities : [] })),
          Math.max(1, Number(maxActivitiesPerDay) || 1),
          tripDetails.mealPreferences,
        );
        enforced.days.forEach((day: any) => {
          if (Array.isArray(day.activities)) totalActivities += day.activities.length;
        });
      }
      
      if (totalActivities > 0) {
        console.log(`Generated itinerary with ${totalActivities} activities. Logging usage...`);
        await trackUsage("planner", totalActivities);
      }

      setGenerating(false);
    }
  };

  // ── Voice Call hook (NEW: uses Web Speech API, no backend STT) ──
  const voiceCall = useVoiceCall({
    language: i18n.language,
    onTranscript: (text) => {
      if (!text.trim()) return;
      sendMessage(text, true);
    },
    onError: (err) => {
      toast.error(err);
    },
  });

  // ── Mic-to-text (push-to-talk for text input, keeps old useVoiceRecorder) ──
  const voiceRecorder = useVoiceRecorder({
    language: i18n.language,
    onTranscript: (text) => { if (text.trim()) setInput(text); },
    onError: (err) => toast.error(err),
    continuous: false,
    silenceTimeout: 2000,
    autoDetect: false,
  });

  useEffect(() => {
    if (!voiceCall.isActive && voiceRecorder.interimText) setInput(voiceRecorder.interimText);
  }, [voiceRecorder.interimText, voiceCall.isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      voiceCall.endCall();
      voiceRecorder.stopAll();
    };
  }, []);

  const chatLimitReached = maxChatUses > 0 && usedChatCount >= maxChatUses;
  const voiceLimitReached = maxVoiceUses > 0 && usedVoiceCount >= maxVoiceUses;
  const guestBlocked = !user && siteSettings?.guest_generation_enabled === false;
  const chatBlockedByPlan = user ? ((hasPlan && !chatEnabled) || !hasPlan) : guestBlocked;
  const voiceBlockedByPlan = user ? ((hasPlan && !voiceEnabled) || !hasPlan) : guestBlocked;

  const handleVoiceCallStart = () => {
    if (loadingLimits || voiceBlockedByPlan || voiceLimitReached) {
      toast.error(localized.callLocked, {
        action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
      });
      return;
    }
    voiceCall.startCall();
  };

  const handleMicToggle = () => {
    if (loadingLimits || voiceBlockedByPlan || voiceLimitReached) {
      toast.error(localized.voiceLocked, {
        action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
      });
      return;
    }
    toggleRecording();
  };

  const toggleRecording = () => {
    if (voiceRecorder.isListening || voiceRecorder.isProcessing) {
      voiceRecorder.stop();
    } else {
      voiceRecorder.start();
    }
  };

  const isRecording = voiceRecorder.isListening || voiceRecorder.isProcessing;
  const hasDetails = tripDetails.destination || tripDetails.duration || tripDetails.travelers;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden relative">
      {usageLimited && !user && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <Lock className="text-primary mb-3" size={32} />
          <h3 className="font-bold text-foreground text-lg mb-2">{i18n.language?.startsWith('ar') ? 'الاشتراك مطلوب' : 'Subscription required'}</h3>
          <p className="text-sm text-muted-foreground mb-4">{i18n.language?.startsWith('ar') ? 'هذه الميزات متاحة فقط حسب الباقة أو إعدادات الإدارة.' : 'These features depend on your plan or admin settings.'}</p>
          <Button onClick={() => navigate("/pricing")} className="gap-2">{i18n.language?.startsWith('ar') ? 'عرض الباقات' : 'View Plans'}</Button>
        </div>
      )}

      <div className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="mx-auto mb-3 text-primary" size={28} />
            <p className="text-sm">{t("prompt.startHint", { defaultValue: "Tell me about your dream trip!" })}</p>
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>p:last-child]:mb-0">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {(loading || generating) && (() => {
          const code = (i18n.language || 'en').slice(0, 2).toLowerCase();
          const dest = tripDetails.destination || '';
          const PREP: Record<string, string> = {
            en: `✈️ Preparing your dream trip to ${dest}...`,
            ar: `✈️ جاري تجهيز رحلة أحلامك إلى ${dest}...`,
            fr: `✈️ Préparation de votre voyage de rêve à ${dest}...`,
            es: `✈️ Preparando tu viaje soñado a ${dest}...`,
            de: `✈️ Ihre Traumreise nach ${dest} wird vorbereitet...`,
            ru: `✈️ Готовим ваше путешествие мечты в ${dest}...`,
            zh: `✈️ 正在为您准备前往${dest}的梦想之旅...`,
            ur: `✈️ ${dest} کے لیے آپ کے خوابوں کا سفر تیار کیا جا رہا ہے...`,
          };
          return (
            <motion.div key="chat-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                {generating ? (PREP[code] || PREP.en) : t("common.loading", { defaultValue: "Thinking..." })}
              </div>
            </motion.div>
          );
        })()}
        <div ref={chatEndRef} />
      </div>

      {hasDetails && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex flex-wrap gap-1.5">
          {tripDetails.destination && <DetailChip icon={MapPin} label={t("travel.destination", { defaultValue: "To" })} value={tripDetails.destination} />}
          {tripDetails.departureCity && <DetailChip icon={Plane} label={t("travel.departure", { defaultValue: "From" })} value={tripDetails.departureCity} />}
          {tripDetails.travelers && <DetailChip icon={Users} label={t("travel.travelers", { defaultValue: "Travelers" })} value={`${tripDetails.travelers}${tripDetails.children ? `+${tripDetails.children}` : ""}`} />}
          {tripDetails.duration && <DetailChip icon={Calendar} label={t("travel.duration", { defaultValue: "Days" })} value={`${tripDetails.duration}`} />}
          {tripDetails.budget && <DetailChip icon={DollarSign} label={t("travel.budget", { defaultValue: "Budget" })} value={`$${tripDetails.budget}`} />}
          {tripDetails.ready && <div className="flex items-center gap-1 text-xs text-primary font-medium ml-auto"><Check size={12} /> {t("prompt.readyToGenerate", { defaultValue: "Ready!" })}</div>}
        </div>
      )}

      {/* Voice Call Overlay — uses new useVoiceCall hook */}
      <VoiceCallOverlay
        isOpen={voiceCall.isActive}
        onClose={() => voiceCall.endCall()}
        status={voiceCall.status}
        messages={messages}
        interimText={voiceCall.interimText}
        isMuted={voiceCall.isMuted}
        onToggleMute={() => voiceCall.toggleMute()}
        retryError={voiceCall.retryError}
        onRetry={() => voiceCall.retryListening()}
        signalLevel={voiceCall.signalLevel}
        onStopListening={() => voiceCall.stopListeningManual()}
        onStopSpeaking={() => voiceCall.stopSpeakingHard()}
      />

      {isRecording && !voiceCall.isActive && (
        <div className="flex items-center justify-center py-3 gap-1 border-t border-border bg-destructive/5">
          {[...Array(7)].map((_, i) => (
            <motion.div key={i} className="w-1 bg-destructive rounded-full"
              animate={{ height: [6, 20 + Math.random() * 14, 6] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }} />
          ))}
          <span className="text-xs text-destructive font-medium ml-2">{t("prompt.listening", { defaultValue: "Listening..." })}</span>
        </div>
      )}

      <div className="p-3 border-t border-border">
        {/* Show lock message when features are blocked */}
        {(chatBlockedByPlan || chatLimitReached || guestBlocked) && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs">
            <Lock size={14} className="shrink-0" />
            <span className="flex-1">{chatLimitReached ? localized.chatLimitReached : localized.chatLocked}</span>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => navigate('/pricing')}>
              {localized.viewPlans}
            </Button>
          </div>
        )}
        {voiceCall.isActive ? (
          <div className="flex items-center justify-center py-1">
            <p className="text-xs text-muted-foreground">{t("prompt.voiceHint", { defaultValue: "Speak to plan your trip by voice" })}</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 items-center">
            <Button type="submit" size="icon" disabled={!input.trim() || loading || generating || loadingLimits || chatBlockedByPlan || chatLimitReached} className="shrink-0 rounded-xl bg-primary hover:bg-primary/90">
              <Send size={18} />
            </Button>
            <div className="relative">
              <Button type="button" size="icon" variant={isRecording ? "destructive" : "outline"} onClick={handleMicToggle}
                disabled={loading || generating || loadingLimits} className={`shrink-0 rounded-xl ${isRecording ? 'animate-pulse' : ''}`}>
                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
              </Button>
              {(voiceBlockedByPlan || voiceLimitReached) && <Lock size={10} className="absolute -top-1 -right-1 text-destructive" />}
            </div>
            <div className="relative">
              <Button type="button" size="icon" variant="outline" onClick={handleVoiceCallStart}
                disabled={loading || generating || loadingLimits} className="shrink-0 rounded-xl text-primary hover:bg-primary hover:text-primary-foreground"
                title={t("prompt.startCall", { defaultValue: "Start voice call" })}>
                <Phone size={18} />
              </Button>
              {(voiceBlockedByPlan || voiceLimitReached) && <Lock size={10} className="absolute -top-1 -right-1 text-destructive" />}
            </div>
            <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={
                (chatBlockedByPlan || chatLimitReached || guestBlocked)
                  ? localized.chatLocked
                  : messages.length === 0 ? t("prompt.inputPlaceholder", { defaultValue: "Describe your dream trip..." }) : t("prompt.replyPlaceholder", { defaultValue: "Type your answer..." })
              }
              disabled={loading || generating || loadingLimits || chatBlockedByPlan || chatLimitReached} className="flex-1" autoFocus dir="auto" />
          </form>
        )}
      </div>
    </div>
  );
};

export default PromptTripPlanner;
