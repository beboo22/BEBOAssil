import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Sparkles, Trophy, ChevronLeft, ChevronRight, ArrowRight, Calendar } from "lucide-react";
import { isPast, isFuture, differenceInDays, differenceInHours, format } from "date-fns";

interface TickerEvent {
  id: string;
  title: string;
  title_ar: string | null;
  city: string;
  country: string;
  category: string;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  is_featured: boolean | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  sports: "⚽", technology: "💻", culture: "🎭", music: "🎵",
  expo: "🌐", business: "💼", food: "🍽️", art: "🎨", film: "🎬", fashion: "👗",
  entertainment: "🎪",
};

const EventsTicker = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith("ar");
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("global_events")
        .select("id, title, title_ar, city, country, category, start_date, end_date, image_url, is_featured")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("start_date", { ascending: true })
        .limit(10);
      if (data && data.length > 0) setEvents(data);
    };
    fetchEvents();
  }, []);

  useEffect(() => {
    if (events.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % events.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [events.length]);

  if (events.length === 0) return null;

  const getCountdown = (startDate: string, endDate: string | null) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    if (end && isPast(end)) return { status: "ended" as const, text: isAr ? "انتهت" : "Ended" };
    if (isPast(start) && (!end || isFuture(end))) return { status: "now" as const, text: isAr ? "جاري الآن" : "Live Now" };
    const days = differenceInDays(start, now);
    const hours = differenceInHours(start, now) % 24;
    if (days === 0) return { status: "upcoming" as const, text: isAr ? `بعد ${hours} ساعة` : `In ${hours}h` };
    return { status: "upcoming" as const, text: isAr ? `بعد ${days} يوم` : `In ${days}d` };
  };

  const resetAutoPlay = () => { clearInterval(intervalRef.current); };
  const goNext = () => { setCurrent(prev => (prev + 1) % events.length); resetAutoPlay(); };
  const goPrev = () => { setCurrent(prev => (prev - 1 + events.length) % events.length); resetAutoPlay(); };

  const event = events[current];
  const eventTitle = isAr && event.title_ar ? event.title_ar : event.title;
  const countdown = getCountdown(event.start_date, event.end_date);
  const icon = CATEGORY_ICONS[event.category] || "🌟";
  const dateStr = format(new Date(event.start_date), "dd MMM yyyy");

  return (
    <div className="relative overflow-hidden">
      <div className="relative h-[160px] sm:h-[140px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            className="absolute inset-0 cursor-pointer"
            onClick={() => navigate(`/events?event=${event.id}`)}
          >
            {/* Background image */}
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={eventTitle}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent" />
            )}
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />

            {/* Top badges */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-[2]">
              <div className="flex items-center gap-1.5">
                <span className="bg-black/40 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-xs font-semibold border border-white/10">
                  {icon} {event.category}
                </span>
                {event.is_featured && (
                  <span className="flex items-center gap-1 bg-amber-500/90 text-white px-2 py-1 rounded-full text-[10px] font-bold">
                    <Trophy className="w-3 h-3" /> {isAr ? "مميز" : "Featured"}
                  </span>
                )}
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-md border shadow-lg ${
                countdown.status === "ended" ? "bg-red-600/90 text-white border-red-400/40 shadow-red-500/30" :
                countdown.status === "now" ? "bg-emerald-500 text-white border-emerald-300/40 animate-pulse shadow-emerald-500/40" :
                "bg-amber-500/90 text-white border-amber-300/40 shadow-amber-500/30"
              }`}>
                {countdown.status === "now" && "🔴 "}{countdown.status === "upcoming" && "⏳ "}{countdown.text}
              </span>
            </div>

            {/* Bottom content */}
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 z-[2]">
              <h3 className="text-white font-bold text-base sm:text-lg leading-tight line-clamp-1 drop-shadow-lg mb-1">
                {eventTitle}
              </h3>
              <div className="flex items-center gap-3 text-white/80 text-xs sm:text-sm">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {event.city}, {event.country}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> {dateStr}
                </span>
              </div>
              {/* CTA on desktop */}
              <div className="hidden sm:flex items-center gap-1.5 mt-2 text-white/90 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAr ? "اضغط لعرض التفاصيل" : "Click for details"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        {events.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/60 hover:text-white transition-all active:scale-90"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/60 hover:text-white transition-all active:scale-90"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {events.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
            {events.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); resetAutoPlay(); }}
                className={`rounded-full transition-all duration-300 ${
                  i === current ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventsTicker;
