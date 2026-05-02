import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, MapPin, ArrowRight, Sparkles, Trophy, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, isPast, isFuture, differenceInDays } from "date-fns";

interface GlobalEvent {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  city: string;
  country: string;
  category: string;
  start_date: string;
  end_date: string | null;
  image_url: string | null;
  is_featured: boolean | null;
  venue: string | null;
  website_url: string | null;
  ticket_url: string | null;
  metadata?: any;
}

const CATEGORY_ICONS: Record<string, string> = {
  sports: "⚽",
  technology: "💻",
  culture: "🎭",
  music: "🎵",
  expo: "🌐",
  business: "💼",
  food: "🍽️",
  art: "🎨",
  film: "🎬",
  fashion: "👗",
};

const CATEGORY_GRADIENTS: Record<string, string> = {
  sports: "from-green-500/20 to-emerald-500/20",
  technology: "from-blue-500/20 to-cyan-500/20",
  culture: "from-purple-500/20 to-violet-500/20",
  music: "from-pink-500/20 to-rose-500/20",
  expo: "from-amber-500/20 to-orange-500/20",
  business: "from-slate-500/20 to-gray-500/20",
  food: "from-orange-500/20 to-red-500/20",
  art: "from-indigo-500/20 to-purple-500/20",
  film: "from-red-500/20 to-rose-500/20",
  fashion: "from-fuchsia-500/20 to-pink-500/20",
};

const HomepageEvents = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith("ar");
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from("global_events")
        .select("*")
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("start_date", { ascending: true })
        .limit(6);
      if (data) setEvents(data);
      setLoading(false);
    };
    fetchEvents();
  }, []);

  if (loading || events.length === 0) return null;

  const getCountdown = (startDate: string, endDate: string | null) => {
    const now = new Date();
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    // Event ended
    if (end && isPast(end)) return { status: "ended" as const, days: 0 };
    // Event happening now
    if (isPast(start) && (!end || isFuture(end))) return { status: "now" as const, days: 0 };
    // Countdown
    const days = differenceInDays(start, now);
    return { status: "upcoming" as const, days };
  };

  const planEventTrip = (event: GlobalEvent) => {
    const meta: any = event.metadata || {};
    const params = new URLSearchParams({
      event: event.title,
      destination: `${event.city}, ${event.country}`,
      startDate: event.start_date,
    });

    const teams = meta.team1 && meta.team2 ? `${meta.team1} vs ${meta.team2}` : event.title;
    const venue = event.venue || meta.venue || event.city;
    const kickoff = meta.kickoff || meta.time || meta.start_time || "";
    params.set(
      "specialPlaces",
      [`MANDATORY EVENT: ${teams}`, venue ? `at ${venue}` : "", event.start_date ? `on ${event.start_date}` : "", kickoff ? `at ${kickoff}` : ""]
        .filter(Boolean)
        .join(" ")
    );
    navigate(`/planner?${params.toString()}`);
  };

  return (
    <section className="py-16 bg-gradient-to-b from-background via-secondary/10 to-background overflow-hidden">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
            <Globe2 size={14} /> {t('events.badge', { defaultValue: isAr ? "فعاليات عالمية" : "Global Events" })}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-3 gradient-text">
            {t('events.title', { defaultValue: isAr ? "لا تفوت أكبر الأحداث العالمية" : "Don't Miss the World's Biggest Events" })}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t('events.subtitle', { defaultValue: isAr ? "اكتشف أهم الفعاليات والأحداث حول العالم وخطط رحلتك لحضورها" : "Discover the most important events worldwide and plan your trip to attend" })}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event, index) => {
            const countdown = getCountdown(event.start_date, event.end_date);
            const eventTitle = isAr && event.title_ar ? event.title_ar : event.title;
            const eventDesc = isAr && event.description_ar ? event.description_ar : event.description;
            const categoryGradient = CATEGORY_GRADIENTS[event.category] || "from-primary/20 to-accent/20";
            const categoryIcon = CATEGORY_ICONS[event.category] || "🌟";

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8, transition: { duration: 0.3 } }}
                className="group cursor-pointer"
                onClick={() => navigate("/events")}
              >
                <div className={`relative rounded-2xl overflow-hidden border border-border bg-gradient-to-br ${categoryGradient} backdrop-blur-sm h-full`}>
                  {/* Image */}
                  {event.image_url && (
                    <div className="relative h-44 overflow-hidden">
                      <img
                        src={event.image_url}
                        alt={eventTitle}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                      {/* Countdown Badge */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.1, type: "spring" }}
                        className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${
                          countdown.status === "ended" ? "bg-red-600 text-white shadow-red-500/30" :
                          countdown.status === "now" ? "bg-emerald-500 text-white animate-pulse shadow-emerald-500/40" :
                          "bg-amber-500 text-white shadow-amber-500/30"
                        }`}
                      >
                        {countdown.status === "ended" ? t('events.ended', { defaultValue: "Ended" }) :
                         countdown.status === "now" ? `🔴 ${t('events.liveNow', { defaultValue: "Live Now" })}` :
                         `⏳ ${t('events.daysLeft', { defaultValue: `${countdown.days} days`, count: countdown.days })}`}
                      </motion.div>

                      {/* Featured Badge */}
                      {event.is_featured && (
                        <div className="absolute top-3 left-3 flex items-center gap-1 bg-amber-500/90 text-white px-2.5 py-1 rounded-full text-[10px] font-bold">
                          <Trophy size={10} /> {t('events.featured', { defaultValue: "Featured" })}
                        </div>
                      )}

                      {/* Category */}
                      <div className="absolute bottom-3 left-3">
                        <Badge variant="secondary" className="bg-white/20 backdrop-blur-md text-white border-0 text-xs">
                          {categoryIcon} {event.category}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-4 space-y-2">
                    <h3 className="font-bold text-lg text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {eventTitle}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin size={12} className="text-primary shrink-0" />
                      <span className="truncate">{event.city}, {event.country}</span>
                      {event.venue && <span className="truncate">• {event.venue}</span>}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar size={12} className="text-primary shrink-0" />
                      <span>
                        {format(new Date(event.start_date), "MMM dd, yyyy")}
                        {event.end_date && ` — ${format(new Date(event.end_date), "MMM dd, yyyy")}`}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {eventDesc}
                    </p>

                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary gap-1 text-xs p-0 h-auto hover:bg-transparent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          planEventTrip(event);
                        }}
                      >
                        <Sparkles size={12} />
                        {t('events.planTrip', { defaultValue: "Plan a trip" })}
                      </Button>
                      <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* View All Button */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-8"
        >
          <Button
            onClick={() => navigate("/events")}
            variant="outline"
            size="lg"
            className="gap-2 rounded-full px-8 border-primary/30 hover:bg-primary/10"
          >
            <Globe2 size={16} />
            {t('events.viewAll', { defaultValue: "View All Events" })}
            <ArrowRight size={16} />
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default HomepageEvents;
