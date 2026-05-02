import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar, MapPin, ExternalLink, Ticket, Star, Search, Globe, Trophy,
  Cpu, Palette, Music, X, Clock, Users, ArrowRight, Sparkles, Share2, Map,
  Filter, ChevronDown, SlidersHorizontal, Facebook, Twitter, MessageCircle, Link2, Navigation
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format, differenceInDays, isPast, isFuture, isWithinInterval, parseISO } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";


interface GlobalEvent {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  category: string;
  city: string;
  country: string;
  venue: string | null;
  image_url: string | null;
  start_date: string;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  ticket_url: string | null;
  google_maps_url: string | null;
  is_featured: boolean;
  metadata: any;
}

const CATEGORIES = [
  { key: "all", icon: Globe, color: "from-blue-500 to-cyan-500" },
  { key: "sports", icon: Trophy, color: "from-green-500 to-emerald-500" },
  { key: "technology", icon: Cpu, color: "from-purple-500 to-violet-500" },
  { key: "expo", icon: Globe, color: "from-orange-500 to-amber-500" },
  { key: "entertainment", icon: Music, color: "from-pink-500 to-rose-500" },
  { key: "culture", icon: Palette, color: "from-indigo-500 to-blue-500" },
];

const categoryLabels: Record<string, Record<string, string>> = {
  all: { en: "All Events", ar: "جميع الفعاليات", zh: "所有活动", ru: "Все события" },
  sports: { en: "Sports", ar: "رياضة", zh: "体育", ru: "Спорт" },
  technology: { en: "Technology", ar: "تكنولوجيا", zh: "科技", ru: "Технологии" },
  expo: { en: "Expos", ar: "معارض", zh: "博览会", ru: "Выставки" },
  entertainment: { en: "Entertainment", ar: "ترفيه", zh: "娱乐", ru: "Развлечения" },
  culture: { en: "Culture & Art", ar: "ثقافة وفن", zh: "文化艺术", ru: "Культура" },
};

const DATE_FILTERS = [
  { key: "all", en: "All Dates", ar: "كل التواريخ" },
  { key: "happening", en: "Happening Now", ar: "جاري الآن" },
  { key: "this_month", en: "This Month", ar: "هذا الشهر" },
  { key: "next_month", en: "Next Month", ar: "الشهر القادم" },
  { key: "next_3months", en: "Next 3 Months", ar: "الـ 3 أشهر القادمة" },
  { key: "next_6months", en: "Next 6 Months", ar: "الـ 6 أشهر القادمة" },
  { key: "past", en: "Past Events", ar: "فعاليات منتهية" },
];

const Countdown = ({ targetDate, endDate, lang }: { targetDate: string; endDate?: string | null; lang: string }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const startD = new Date(targetDate);
  const endD = endDate ? new Date(endDate) : null;

  if (endD && isPast(endD)) {
    return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">{lang === "ar" ? "انتهت" : "Ended"}</Badge>;
  }
  if (isPast(startD) && (!endD || !isPast(endD))) {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs animate-pulse">{lang === "ar" ? "جاري الآن" : "Happening Now"}</Badge>;
  }

  const totalSeconds = Math.max(0, Math.floor((startD.getTime() - now.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 30) {
    return (
      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-mono">
        <Clock className="w-3 h-3 mr-1" />
        {days} {lang === "ar" ? "يوم" : "days"}
      </Badge>
    );
  }

  return (
    <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-mono">
      <Clock className="w-3 h-3 mr-1" />
      {days > 0 && `${days}${lang === "ar" ? "ي" : "d"} `}
      {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </Badge>
  );
};

const EventsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const lang = i18n.language;
  const isAr = lang === "ar";

  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<GlobalEvent | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [selectedCity, setSelectedCity] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [referralCode, setReferralCode] = useState("");

  // Load referral code
  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("referral_code").eq("id", user.id).single().then(({ data }) => {
        if (data?.referral_code) setReferralCode(data.referral_code);
      });
    }
  }, [user]);
  const [showFilters, setShowFilters] = useState(false);

  // Open event from URL param (from homepage click)
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (eventId && events.length > 0) {
      const found = events.find(e => e.id === eventId);
      if (found) setSelectedEvent(found);
    }
  }, [searchParams, events]);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    const { data } = await supabase.from("global_events").select("*").eq("is_active", true).order("sort_order");
    setEvents((data as any) || []);
    setLoading(false);
  };

  // Extract unique countries and cities for filters
  const countries = useMemo(() => {
    const set = new Set(events.map(e => e.country));
    return Array.from(set).sort();
  }, [events]);

  const cities = useMemo(() => {
    const filteredByCountry = selectedCountry === "all" ? events : events.filter(e => e.country === selectedCountry);
    const set = new Set(filteredByCountry.map(e => e.city));
    return Array.from(set).sort();
  }, [events, selectedCountry]);

  const filtered = useMemo(() => events.filter((e) => {
    const matchCat = selectedCategory === "all" || e.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || (e.title_ar || "").includes(q) || e.city.toLowerCase().includes(q) || e.country.toLowerCase().includes(q) || (e.venue || "").toLowerCase().includes(q);
    const matchCountry = selectedCountry === "all" || e.country === selectedCountry;
    const matchCity = selectedCity === "all" || e.city === selectedCity;

    // Date filter
    let matchDate = true;
    const now = new Date();
    const start = new Date(e.start_date);
    const end = e.end_date ? new Date(e.end_date) : start;

    if (dateFilter === "happening") {
      matchDate = isPast(start) && isFuture(end);
    } else if (dateFilter === "this_month") {
      matchDate = start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
    } else if (dateFilter === "next_month") {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      matchDate = start.getMonth() === nextMonth.getMonth() && start.getFullYear() === nextMonth.getFullYear();
    } else if (dateFilter === "next_3months") {
      const limit = new Date(now);
      limit.setMonth(limit.getMonth() + 3);
      matchDate = start >= now && start <= limit;
    } else if (dateFilter === "next_6months") {
      const limit = new Date(now);
      limit.setMonth(limit.getMonth() + 6);
      matchDate = start >= now && start <= limit;
    } else if (dateFilter === "past") {
      matchDate = isPast(end);
    }

    return matchCat && matchSearch && matchCountry && matchCity && matchDate;
  }), [events, selectedCategory, searchQuery, selectedCountry, selectedCity, dateFilter]);

  const featured = filtered.filter((e) => e.is_featured);
  const regular = filtered.filter((e) => !e.is_featured);

  const getTitle = (e: GlobalEvent) => (isAr && e.title_ar ? e.title_ar : e.title);
  const getDesc = (e: GlobalEvent) => (isAr && e.description_ar ? e.description_ar : e.description);
  const getCatLabel = (key: string) => categoryLabels[key]?.[lang] || categoryLabels[key]?.en || key;
  const getCatColor = (cat: string) => CATEGORIES.find((c) => c.key === cat)?.color || "from-gray-500 to-gray-600";

  const handlePlanTrip = (e: GlobalEvent) => {
    const params = new URLSearchParams({
      destination: e.city,
      event: e.title,
    });
    if (e.start_date) params.set("startDate", e.start_date);
    if (e.end_date) {
      const days = Math.max(3, Math.ceil((new Date(e.end_date).getTime() - new Date(e.start_date).getTime()) / (1000 * 60 * 60 * 24)));
      params.set("duration", String(Math.min(days, 14)));
    }

    // Map event category -> planner interests so the AI only generates matching activities
    const categoryToInterests: Record<string, string[]> = {
      sports: ["adventure", "local"],
      technology: ["culture", "local"],
      culture: ["culture", "art"],
      music: ["nightlife", "art"],
      entertainment: ["nightlife", "family"],
      art: ["art", "culture"],
      food: ["food"],
      film: ["art", "culture"],
      fashion: ["shopping", "art"],
      expo: ["culture", "shopping"],
      business: ["local"],
    };
    const mappedInterests = categoryToInterests[e.category] || ["culture", "local"];
    params.set("interests", mappedInterests.join(","));

    // Build a precise special request so the AI schedules THIS event at its exact date/time/venue
    const meta: any = e.metadata || {};
    const eventTitle = isAr && e.title_ar ? e.title_ar : e.title;
    const time = meta.kickoff || meta.time || meta.start_time || "";
    const venue = e.venue || meta.venue || e.city;
    const teamLine = meta.team1 && meta.team2 ? `${meta.team1} vs ${meta.team2}` : eventTitle;
    const dateStr = e.start_date || "";
    const specialParts = [
      `MANDATORY EVENT: ${teamLine}`,
      venue ? `at ${venue}` : "",
      dateStr ? `on ${dateStr}` : "",
      time ? `at ${time}` : "",
      `(category: ${e.category}). Schedule this event at its exact date and time. Build the day around it.`,
    ].filter(Boolean).join(" ");
    params.set("specialPlaces", specialParts);

    navigate(`/planner?${params.toString()}`);
  };

  const getShareUrl = (e: GlobalEvent) => {
    let url = `${window.location.origin}/events?event=${e.id}`;
    if (referralCode) url += `&ref=${referralCode}`;
    return url;
  };

  const handleShare = async (e: GlobalEvent) => {
    const shareUrl = getShareUrl(e);
    try {
      await navigator.share?.({ title: getTitle(e), text: getDesc(e), url: shareUrl });
    } catch {
      navigator.clipboard.writeText(shareUrl);
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied!");
    }
  };

  const trackShare = async (eventId: string, platform: string) => {
    try {
      await supabase.from("event_shares").insert({ event_id: eventId, user_id: user?.id || null, platform, referral_code: referralCode || null });
    } catch {}
  };

  const shareToSocial = (platform: string, e: GlobalEvent) => {
    const url = encodeURIComponent(getShareUrl(e));
    const text = encodeURIComponent(getTitle(e));
    const links: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    };
    trackShare(e.id, platform);
    window.open(links[platform], "_blank", "noopener,noreferrer,width=600,height=400");
    setShowShareMenu(false);
  };

  const activeFiltersCount = [selectedCountry !== "all", selectedCity !== "all", dateFilter !== "all"].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedCountry("all");
    setSelectedCity("all");
    setDateFilter("all");
    setSearchQuery("");
    setSelectedCategory("all");
  };

  const statsData = useMemo(() => {
    const cats: Record<string, number> = {};
    events.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; });
    const countriesCount = new Set(events.map(e => e.country)).size;
    const citiesCount = new Set(events.map(e => e.city)).size;
    return { total: events.length, countries: countriesCount, cities: citiesCount, categories: cats };
  }, [events]);

  return (
    <div className="min-h-screen bg-background pt-16" dir={isAr ? "rtl" : "ltr"}>
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-accent/20 py-16 md:py-24">
        <div className="absolute inset-0 overflow-hidden">
          <motion.div animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }} transition={{ duration: 20, repeat: Infinity }} className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
          <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, -5, 0] }} transition={{ duration: 15, repeat: Infinity }} className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          {[...Array(6)].map((_, i) => (
            <motion.div key={i} className="absolute w-2 h-2 bg-primary/20 rounded-full"
              style={{ left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 25}%` }}
              animate={{ y: [-10, 10, -10], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 3 + i, repeat: Infinity, delay: i * 0.5 }} />
          ))}
        </div>
        <div className="container mx-auto px-4 relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center max-w-3xl mx-auto">
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-sm px-4 py-1.5">
                <Sparkles className="w-4 h-4 mr-1.5 inline" />
                {isAr ? `${statsData.total} فعالية عالمية` : `${statsData.total} Global Events`}
              </Badge>
            </motion.div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-foreground mb-4 leading-tight">
              {isAr ? "اكتشف أعظم الفعاليات العالمية" : "Discover the World's Greatest Events"}
            </h1>
            <p className="text-muted-foreground text-lg mb-6">
              {isAr ? `${statsData.countries} دولة • ${statsData.cities} مدينة` : `${statsData.countries} countries • ${statsData.cities} cities`}
            </p>

            {/* Stats chips */}
            <div className="flex justify-center gap-3 flex-wrap mb-8">
              {Object.entries(statsData.categories).slice(0, 5).map(([cat, count]) => (
                <motion.button key={cat} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    selectedCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/80 text-muted-foreground border-border hover:border-primary/30"
                  }`}>
                  {getCatLabel(cat)} ({count})
                </motion.button>
              ))}
            </div>

            {/* Search + filter toggle */}
            <div className="flex gap-2 max-w-lg mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder={isAr ? "ابحث عن فعالية، مدينة أو دولة..." : "Search events, cities or countries..."}
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base rounded-full border-primary/20 bg-card/80 backdrop-blur"
                />
              </div>
              <Button
                variant={showFilters ? "default" : "outline"}
                size="icon"
                className="h-12 w-12 rounded-full shrink-0 relative"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="w-5 h-5" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-b border-border bg-card/50 backdrop-blur-sm"
          >
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" />
                  {isAr ? "تصفية متقدمة" : "Advanced Filters"}
                </h3>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-destructive">
                    <X className="w-3 h-3 mr-1" />
                    {isAr ? "مسح الكل" : "Clear All"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Country Filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{isAr ? "الدولة" : "Country"}</label>
                  <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setSelectedCity("all"); }}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={isAr ? "كل الدول" : "All Countries"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "كل الدول" : "All Countries"}</SelectItem>
                      {countries.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* City Filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{isAr ? "المدينة" : "City"}</label>
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={isAr ? "كل المدن" : "All Cities"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "كل المدن" : "All Cities"}</SelectItem>
                      {cities.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Date Filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{isAr ? "التاريخ" : "Date Range"}</label>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FILTERS.map(df => (
                        <SelectItem key={df.key} value={df.key}>{isAr ? df.ar : df.en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Filter */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide flex-wrap">
          {CATEGORIES.map((cat, i) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.key;
            return (
              <motion.button key={cat.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCategory(cat.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${active ? `bg-gradient-to-r ${cat.color} text-white shadow-lg shadow-primary/20` : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"}`}>
                <Icon className="w-4 h-4" />
                {getCatLabel(cat.key)}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="container mx-auto px-4 pb-10">
        {/* Results count */}
        {(activeFiltersCount > 0 || searchQuery) && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <span>{isAr ? `${filtered.length} نتيجة` : `${filtered.length} results`}</span>
            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-6 px-2">
                {isAr ? "إزالة الفلاتر" : "Clear filters"} <X className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-80 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <Globe className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-2">{isAr ? "لا توجد فعاليات مطابقة" : "No matching events found"}</p>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {isAr ? "مسح الفلاتر" : "Clear Filters"}
            </Button>
          </motion.div>
        ) : (
          <>
            {/* Featured Events */}
            {featured.length > 0 && (
              <div className="mb-14">
                <motion.h2 initial={{ opacity: 0, x: isAr ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Star className="w-6 h-6 text-yellow-500" />
                  {isAr ? "فعاليات مميزة" : "Featured Events"}
                </motion.h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {featured.map((event, i) => (
                    <motion.div key={event.id}
                      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.15, type: "spring", stiffness: 100 }}
                      whileHover={{ y: -8, scale: 1.01 }}
                      className="group relative rounded-2xl overflow-hidden cursor-pointer h-72 md:h-80 shadow-lg hover:shadow-2xl transition-shadow duration-500"
                      onClick={() => setSelectedEvent(event)}>
                      <motion.img src={event.image_url || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800"} alt={getTitle(event)}
                        className="w-full h-full object-cover"
                        whileHover={{ scale: 1.08 }} transition={{ duration: 0.7 }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                        <Badge className={`bg-gradient-to-r ${getCatColor(event.category)} text-white border-0 text-xs backdrop-blur-sm`}>{getCatLabel(event.category)}</Badge>
                        <div className="flex gap-2">
                          <Countdown targetDate={event.start_date} endDate={event.end_date} lang={lang} />
                          <Badge className="bg-yellow-500/90 text-white border-0">⭐ {isAr ? "مميز" : "Featured"}</Badge>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-6">
                        {event.metadata?.team1_flag && event.metadata?.team2_flag ? (
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-3xl">{event.metadata.team1_flag}</span>
                            <span className="text-white font-bold text-lg">vs</span>
                            <span className="text-3xl">{event.metadata.team2_flag}</span>
                          </div>
                        ) : null}
                        <h3 className="text-white text-xl md:text-2xl font-bold mb-2 drop-shadow-lg">{getTitle(event)}</h3>
                        <p className="text-white/70 text-sm mb-3 line-clamp-2">{getDesc(event)}</p>
                        <div className="flex flex-wrap gap-3 text-white/80 text-sm">
                          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{event.city}, {event.country}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{format(new Date(event.start_date), "MMM yyyy")}</span>
                          {event.metadata?.kickoff && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{event.metadata.kickoff}</span>}
                        </div>
                        <motion.div initial={{ opacity: 0, y: 10 }} whileHover={{ opacity: 1, y: 0 }} className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="secondary" className="backdrop-blur-sm bg-white/20 text-white border-0 hover:bg-white/30">
                            {isAr ? "عرض التفاصيل" : "View Details"} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* All Events Grid */}
            <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xl font-bold mb-6">
              {isAr ? "جميع الفعاليات" : "All Events"} ({regular.length})
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regular.map((event, i) => (
                <motion.div key={event.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.06, 0.5), type: "spring", stiffness: 120 }}
                  whileHover={{ y: -6, scale: 1.02 }}
                  className="group bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300 cursor-pointer"
                  onClick={() => setSelectedEvent(event)}>
                  <div className="relative h-48 overflow-hidden">
                    <motion.img src={event.image_url || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800"} alt={getTitle(event)}
                      className="w-full h-full object-cover" whileHover={{ scale: 1.1 }} transition={{ duration: 0.5 }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute top-3 left-3 right-3 flex justify-between">
                      <Badge className={`bg-gradient-to-r ${getCatColor(event.category)} text-white border-0 text-xs`}>{getCatLabel(event.category)}</Badge>
                      <Countdown targetDate={event.start_date} endDate={event.end_date} lang={lang} />
                    </div>
                  </div>
                  <div className="p-5">
                    {event.metadata?.team1_flag && event.metadata?.team2_flag ? (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{event.metadata.team1_flag}</span>
                        <span className="text-xs font-bold text-muted-foreground">vs</span>
                        <span className="text-xl">{event.metadata.team2_flag}</span>
                        {event.metadata?.match_type && <Badge variant="outline" className="text-[10px] ml-auto">{event.metadata.match_type}</Badge>}
                      </div>
                    ) : null}
                    <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-1 group-hover:text-primary transition-colors">{getTitle(event)}</h3>
                    <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-primary" />{event.venue || event.city}, {event.country}</span>
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-primary" />{format(new Date(event.start_date), "dd MMM yyyy")}</span>
                      {event.metadata?.kickoff && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-primary" />{event.metadata.kickoff}</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Event Detail Modal */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
            onClick={() => setSelectedEvent(null)}>
            <motion.div
              initial={{ y: "100%", opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl max-h-[92vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="relative h-56 md:h-72 overflow-hidden">
                <img src={selectedEvent.image_url || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800"} alt={getTitle(selectedEvent)}
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-black/30 to-transparent" />
                <button onClick={() => setSelectedEvent(null)} className="absolute top-4 right-4 bg-black/40 text-white rounded-full p-2 hover:bg-black/60 backdrop-blur-sm transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="absolute top-4 left-4 flex gap-2">
                  <Badge className={`bg-gradient-to-r ${getCatColor(selectedEvent.category)} text-white border-0`}>{getCatLabel(selectedEvent.category)}</Badge>
                  <Countdown targetDate={selectedEvent.start_date} endDate={selectedEvent.end_date} lang={lang} />
                </div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/40 rounded-full md:hidden" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  {selectedEvent.metadata?.team1_flag && selectedEvent.metadata?.team2_flag && (
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-4xl">{selectedEvent.metadata.team1_flag}</span>
                        <span className="text-white font-bold text-sm">{selectedEvent.metadata.team1 || ''}</span>
                      </div>
                      <span className="text-white/60 font-bold text-lg">VS</span>
                      <div className="flex items-center gap-2">
                        <span className="text-4xl">{selectedEvent.metadata.team2_flag}</span>
                        <span className="text-white font-bold text-sm">{selectedEvent.metadata.team2 || ''}</span>
                      </div>
                    </div>
                  )}
                  <h2 className="text-white text-2xl md:text-3xl font-bold drop-shadow-lg">{getTitle(selectedEvent)}</h2>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Match metadata details */}
                {selectedEvent.metadata?.match_type && (
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-primary/10 text-primary border-primary/20">{selectedEvent.metadata.match_type}</Badge>
                    {selectedEvent.metadata?.kickoff && <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />{selectedEvent.metadata.kickoff}</Badge>}
                    {selectedEvent.metadata?.stadium_capacity && <Badge variant="outline" className="gap-1"><Users className="w-3 h-3" />{Number(selectedEvent.metadata.stadium_capacity).toLocaleString()}</Badge>}
                  </div>
                )}
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                  className="text-foreground leading-relaxed text-base">{getDesc(selectedEvent)}</motion.p>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl border border-border/50">
                    <div className="p-2 bg-primary/10 rounded-lg"><MapPin className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{isAr ? "الموقع" : "Location"}</p>
                      <p className="text-sm text-muted-foreground">{selectedEvent.venue && `${selectedEvent.venue}, `}{selectedEvent.city}, {selectedEvent.country}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-xl border border-border/50">
                    <div className="p-2 bg-primary/10 rounded-lg"><Calendar className="w-5 h-5 text-primary" /></div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{isAr ? "التاريخ" : "Date"}</p>
                      <p className="text-sm text-muted-foreground">{format(new Date(selectedEvent.start_date), "dd MMM yyyy")}{selectedEvent.end_date ? ` — ${format(new Date(selectedEvent.end_date), "dd MMM yyyy")}` : ""}</p>
                    </div>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="flex flex-wrap gap-3">
                  <Button onClick={() => handlePlanTrip(selectedEvent)} className="flex-1 min-w-[140px] h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                    🗺️ {isAr ? "خطط رحلتك" : "Plan Your Trip"}
                  </Button>
                  {selectedEvent.ticket_url && (
                    <Button variant="outline" asChild className="flex-1 min-w-[140px] h-11">
                      <a href={selectedEvent.ticket_url} target="_blank" rel="noopener noreferrer">
                        <Ticket className="w-4 h-4 mr-2" />{isAr ? "احجز تذاكر" : "Get Tickets"}
                      </a>
                    </Button>
                  )}
                </motion.div>

                <div className="flex gap-2 flex-wrap">
                  {selectedEvent.website_url && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={selectedEvent.website_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1.5" />{isAr ? "الموقع الرسمي" : "Official Site"}
                      </a>
                    </Button>
                  )}
                  <div className="relative">
                    <Button variant="ghost" size="sm" onClick={() => setShowShareMenu(!showShareMenu)}>
                      <Share2 className="w-4 h-4 mr-1.5" />{isAr ? "مشاركة" : "Share"}
                    </Button>
                    {showShareMenu && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="absolute bottom-full left-0 mb-2 bg-card border border-border rounded-xl p-2 shadow-xl z-50 min-w-[180px]">
                        <button onClick={() => shareToSocial("whatsapp", selectedEvent)} className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors">
                          <MessageCircle className="w-4 h-4 text-green-500" /> WhatsApp
                        </button>
                        <button onClick={() => shareToSocial("twitter", selectedEvent)} className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors">
                          <Twitter className="w-4 h-4 text-sky-500" /> Twitter / X
                        </button>
                        <button onClick={() => shareToSocial("facebook", selectedEvent)} className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors">
                          <Facebook className="w-4 h-4 text-blue-600" /> Facebook
                        </button>
                        <button onClick={() => shareToSocial("telegram", selectedEvent)} className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors">
                          <Navigation className="w-4 h-4 text-blue-400" /> Telegram
                        </button>
                        <button onClick={() => { trackShare(selectedEvent.id, 'link'); navigator.clipboard.writeText(getShareUrl(selectedEvent)); toast.success(isAr ? "تم نسخ الرابط" : "Link copied!"); setShowShareMenu(false); }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors">
                          <Link2 className="w-4 h-4 text-muted-foreground" /> {isAr ? "نسخ الرابط" : "Copy Link"}
                        </button>
                      </motion.div>
                    )}
                  </div>
                  {(selectedEvent.google_maps_url || selectedEvent.latitude) && (
                    <Button variant="ghost" size="sm" onClick={() => setShowMap(!showMap)}>
                      <Map className="w-4 h-4 mr-1.5" />{isAr ? "الخريطة" : "Map"}
                    </Button>
                  )}
                </div>

                {selectedEvent.latitude && selectedEvent.longitude && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: showMap ? 220 : 220, opacity: 1 }}
                    className="rounded-xl overflow-hidden border border-border">
                    <iframe
                      src={`https://www.google.com/maps?q=${selectedEvent.latitude},${selectedEvent.longitude}&z=13&output=embed`}
                      className="w-full h-[220px] border-0" loading="lazy" allowFullScreen />
                  </motion.div>
                )}

                {(selectedEvent.google_maps_url || (selectedEvent.latitude && selectedEvent.longitude)) && (
                  <Button variant="outline" size="sm" asChild className="w-full">
                    <a href={selectedEvent.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${selectedEvent.latitude},${selectedEvent.longitude}`} target="_blank" rel="noopener noreferrer">
                      <MapPin className="w-4 h-4 mr-1.5" />{isAr ? "فتح في خرائط جوجل" : "Open in Google Maps"}
                    </a>
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EventsPage;
