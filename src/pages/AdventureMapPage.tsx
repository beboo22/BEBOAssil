import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { attachProfiles } from "@/utils/publicProfiles";
import Navbar from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { Loader2, MapPin, Filter, Route, Compass, Calendar, Star, Globe, Heart, Search, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isPast, isFuture } from "date-fns";
import "leaflet/dist/leaflet.css";

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const storyIcon = new L.Icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
});

const eventIcon = new L.DivIcon({
  className: "",
  html: `<div style="background:linear-gradient(135deg,#f59e0b,#ef4444);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🎪</div>`,
  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
});

interface Story {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  media_urls?: string[];
  likes_count?: number;
  trip_data?: any;
  created_at: string;
  profiles?: { full_name?: string; avatar_url?: string };
}

interface GlobalEvent {
  id: string;
  title: string;
  title_ar?: string;
  city: string;
  country: string;
  category: string;
  start_date: string;
  end_date?: string;
  image_url?: string;
  latitude?: number;
  longitude?: number;
  is_featured?: boolean;
}

const AdventureMapPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language?.startsWith("ar");
  const [stories, setStories] = useState<Story[]>([]);
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [storiesRes, eventsRes] = await Promise.all([
        supabase
          .from("travel_stories")
          .select("id,title,content,location_name,latitude,longitude,media_urls,likes_count,trip_data,created_at,user_id")
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("global_events")
          .select("id,title,title_ar,city,country,category,start_date,end_date,image_url,latitude,longitude,is_featured")
          .eq("is_active", true)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("start_date", { ascending: true })
          .limit(100),
      ]);
      const enrichedStories = await attachProfiles((storiesRes.data as any[]) || []);
      setStories(enrichedStories as any);
      setEvents((eventsRes.data as any) || []);
      setLoading(false);
    };
    load();
  }, []);

  const countries = useMemo(() => {
    const storyCountries = stories.map(s => (s.location_name || "").split(",").pop()?.trim()).filter(Boolean);
    const eventCountries = events.map(e => e.country).filter(Boolean);
    return Array.from(new Set([...storyCountries, ...eventCountries])).sort() as string[];
  }, [stories, events]);

  const categories = useMemo(() => {
    const storyCats = stories.map(s => s.trip_data?.category).filter(Boolean);
    const eventCats = events.map(e => e.category).filter(Boolean);
    return Array.from(new Set([...storyCats, ...eventCats]));
  }, [stories, events]);

  const filteredStories = useMemo(() => {
    return stories.filter(s => {
      const text = `${s.title} ${s.content} ${s.location_name || ""}`.toLowerCase();
      const sCountry = (s.location_name || "").split(",").pop()?.trim() || "";
      const sCat = (s.trip_data?.category || "").toLowerCase();
      return (!search || text.includes(search.toLowerCase())) &&
        (country === "all" || sCountry === country) &&
        (category === "all" || sCat === category);
    });
  }, [stories, search, country, category]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const text = `${e.title} ${e.title_ar || ""} ${e.city} ${e.country}`.toLowerCase();
      return (!search || text.includes(search.toLowerCase())) &&
        (country === "all" || e.country === country) &&
        (category === "all" || e.category === category);
    });
  }, [events, search, country, category]);

  const mapItems = useMemo(() => {
    if (activeTab === "stories") return { stories: filteredStories, events: [] };
    if (activeTab === "events") return { stories: [], events: filteredEvents };
    return { stories: filteredStories, events: filteredEvents };
  }, [activeTab, filteredStories, filteredEvents]);

  const center = useMemo<[number, number]>(() => {
    const allLats = [...mapItems.stories.map(s => Number(s.latitude)), ...mapItems.events.map(e => Number(e.latitude))].filter(Boolean);
    const allLngs = [...mapItems.stories.map(s => Number(s.longitude)), ...mapItems.events.map(e => Number(e.longitude))].filter(Boolean);
    if (!allLats.length) return [24.7136, 46.6753];
    return [allLats.reduce((a, b) => a + b) / allLats.length, allLngs.reduce((a, b) => a + b) / allLngs.length];
  }, [mapItems]);

  const getEventStatus = (e: GlobalEvent) => {
    const start = new Date(e.start_date);
    const end = e.end_date ? new Date(e.end_date) : null;
    if (end && isPast(end)) return "ended";
    if (isPast(start) && (!end || isFuture(end))) return "live";
    return "upcoming";
  };

  const totalCount = mapItems.stories.length + mapItems.events.length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-10 space-y-5">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Compass className="w-6 h-6 text-primary" />
            </div>
            {isAr ? "خريطة المغامرات العالمية" : "Global Adventure Map"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isAr ? "اكتشف قصص السفر والفعاليات حول العالم على الخريطة التفاعلية" : "Discover travel stories & events worldwide on an interactive map"}
          </p>
        </motion.div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2 lg:col-span-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={isAr ? "ابحث عن مكان أو فعالية..." : "Search places or events..."}
                  className="pl-9"
                />
              </div>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder={isAr ? "الدولة" : "Country"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                  {countries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={isAr ? "التصنيف" : "Category"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                  {categories.map(c => <SelectItem key={String(c)} value={String(c).toLowerCase()}>{String(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{totalCount} {isAr ? "نتيجة" : "results"}</Badge>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="all" className="gap-1.5 text-xs sm:text-sm">
              <Globe className="w-3.5 h-3.5" /> {isAr ? "الكل" : "All"}
            </TabsTrigger>
            <TabsTrigger value="stories" className="gap-1.5 text-xs sm:text-sm">
              <Heart className="w-3.5 h-3.5" /> {isAr ? "القصص" : "Stories"} ({filteredStories.length})
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5 text-xs sm:text-sm">
              <Star className="w-3.5 h-3.5" /> {isAr ? "الفعاليات" : "Events"} ({filteredEvents.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Map + Sidebar */}
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5">
          {/* Map */}
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <Card className="overflow-hidden rounded-2xl shadow-lg">
              {loading ? (
                <div className="h-[60vh] sm:h-[70vh] flex items-center justify-center bg-muted/30">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{isAr ? "جاري تحميل الخريطة..." : "Loading map..."}</p>
                  </div>
                </div>
              ) : (
                // @ts-ignore
                <MapContainer center={center} zoom={3} style={{ height: "70vh", width: "100%" }} scrollWheelZoom>
                  <TileLayer
                    // @ts-ignore
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {/* Story markers */}
                  {mapItems.stories.map(story => (
                    // @ts-ignore - react-leaflet icon type mismatch
                    <Marker key={`s-${story.id}`} position={[Number(story.latitude), Number(story.longitude)]} icon={storyIcon}>
                      <Popup>
                        <div className="max-w-[240px] space-y-2">
                          {story.media_urls?.[0] && (
                            <img src={story.media_urls[0]} alt={story.title} className="w-full h-28 object-cover rounded-lg" />
                          )}
                          <h3 className="font-bold text-sm">{story.title}</h3>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {story.location_name}
                          </p>
                          {story.likes_count ? (
                            <p className="text-xs text-gray-400">❤️ {story.likes_count}</p>
                          ) : null}
                          <button
                            onClick={() => navigate("/stories")}
                            className="w-full bg-blue-500 text-white text-xs py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
                          >
                            {isAr ? "عرض القصة" : "View Story"}
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                  {/* Event markers */}
                  {mapItems.events.map(event => (
                    // @ts-ignore - react-leaflet icon type mismatch
                    <Marker key={`e-${event.id}`} position={[Number(event.latitude), Number(event.longitude)]} icon={eventIcon}>
                      <Popup>
                        <div className="max-w-[240px] space-y-2">
                          {event.image_url && (
                            <img src={event.image_url} alt={event.title} className="w-full h-28 object-cover rounded-lg" />
                          )}
                          <h3 className="font-bold text-sm">{isAr && event.title_ar ? event.title_ar : event.title}</h3>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {event.city}, {event.country}
                          </p>
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {format(new Date(event.start_date), "dd MMM yyyy")}
                          </p>
                          <button
                            onClick={() => navigate(`/events?event=${event.id}`)}
                            className="w-full bg-amber-500 text-white text-xs py-1.5 rounded-lg hover:bg-amber-600 transition-colors"
                          >
                            {isAr ? "عرض الفعالية" : "View Event"}
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              )}
            </Card>
          </motion.div>

          {/* Sidebar list */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between sticky top-0 bg-card z-10 pb-2">
                <h2 className="font-bold text-foreground flex items-center gap-2 text-sm">
                  <Filter className="w-4 h-4 text-primary" />
                  {isAr ? "النتائج" : "Results"}
                </h2>
                <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
              </div>

              {totalCount === 0 ? (
                <div className="text-center py-12">
                  <Globe className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد نتائج" : "No results found"}</p>
                </div>
              ) : (
                <AnimatePresence>
                  {/* Events first */}
                  {mapItems.events.map((event, i) => {
                    const status = getEventStatus(event);
                    return (
                      <motion.button key={`e-${event.id}`}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        onClick={() => navigate(`/events?event=${event.id}`)}
                        className="w-full text-left border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all group"
                      >
                        <div className="flex gap-3 p-3">
                          {event.image_url ? (
                            <img src={event.image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-amber-400 to-red-500 flex items-center justify-center text-2xl shrink-0">🎪</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-600">
                                {isAr ? "فعالية" : "Event"}
                              </Badge>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                status === "live" ? "bg-green-500/10 text-green-600" :
                                status === "ended" ? "bg-red-500/10 text-red-500" :
                                "bg-blue-500/10 text-blue-600"
                              }`}>
                                {status === "live" ? (isAr ? "🔴 جاري" : "🔴 Live") : status === "ended" ? (isAr ? "انتهت" : "Ended") : format(new Date(event.start_date), "MMM dd")}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                              {isAr && event.title_ar ? event.title_ar : event.title}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {event.city}, {event.country}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}

                  {/* Stories */}
                  {mapItems.stories.map((story, i) => (
                    <motion.button key={`s-${story.id}`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (mapItems.events.length + i) * 0.03 }}
                      onClick={() => navigate("/stories")}
                      className="w-full text-left border border-border rounded-xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all group"
                    >
                      <div className="flex gap-3 p-3">
                        {story.media_urls?.[0] ? (
                          <img src={story.media_urls[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                            <Route className="w-6 h-6 text-primary/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/30 text-primary">
                              {isAr ? "قصة" : "Story"}
                            </Badge>
                            {story.likes_count ? (
                              <span className="text-[10px] text-muted-foreground">❤️ {story.likes_count}</span>
                            ) : null}
                          </div>
                          <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{story.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {story.location_name || (isAr ? "موقع غير محدد" : "Unknown location")}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdventureMapPage;
