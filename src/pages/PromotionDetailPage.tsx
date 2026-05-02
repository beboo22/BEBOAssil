import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone, Sparkles, MapPin, Play, ChevronLeft, ChevronRight,
  Calendar, Clock, Trophy, ArrowLeft, X, Maximize2,
  Loader2, Share2, Users, Building2, Lightbulb, Navigation,
  ChevronDown, ChevronUp, Globe, Thermometer, Train, Star,
  Heart, Bell, CheckSquare, Square
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import WorldCupStandings from "@/components/WorldCupStandings";

interface Promotion {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  media_urls: string[];
  media_type: string;
  linked_event_id: string | null;
  linked_destination_id: string | null;
  included_places: any;
  cta_destination: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  ai_prompt?: string | null;
}

interface LinkedMatch {
  id: string;
  title: string;
  title_ar: string | null;
  city: string;
  venue: string | null;
  start_date: string;
  metadata: any;
  latitude: number | null;
  longitude: number | null;
}

interface StadiumInfo {
  tournamentName: string;
  officialName: string;
  capacity: number;
  city: string;
  country: string;
  countryFlag: string;
  lat: number;
  lng: number;
  roofType: string;
  roofType_ar: string;
  climate: string;
  climate_ar: string;
  transit: string;
  transit_ar: string;
  tips: string[];
  tips_ar: string[];
  highlights: string[];
  highlights_ar: string[];
}

// Consolidated stadium data — source: stadiumdb.com
const STADIUMS: StadiumInfo[] = [
  {
    tournamentName: "New York New Jersey Stadium", officialName: "MetLife Stadium",
    capacity: 82500, city: "East Rutherford, NJ", country: "USA", countryFlag: "🇺🇸",
    lat: 40.8128, lng: -74.0742, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Warm summers, 25-30°C", climate_ar: "صيف دافئ، 25-30°م",
    transit: "NJ Transit from Penn Station", transit_ar: "قطار NJ Transit من محطة Penn",
    tips: ["No parking during WC — use public transit only", "Arrive 2+ hours early for security", "Final match venue — 19 July 2026"],
    tips_ar: ["لا مواقف سيارات — استخدم النقل العام فقط", "الوصول قبل ساعتين للتفتيش", "ملعب المباراة النهائية — 19 يوليو 2026"],
    highlights: ["🏆 Hosts the FINAL", "Most WC matches (9)", "Revolution in transport — no parking"],
    highlights_ar: ["🏆 يستضيف المباراة النهائية", "أكثر مباريات المونديال (9)", "ثورة نقل — بدون مواقف"],
  },
  {
    tournamentName: "Dallas Stadium", officialName: "AT&T Stadium",
    capacity: 94000, city: "Arlington, TX", country: "USA", countryFlag: "🇺🇸",
    lat: 32.7473, lng: -97.0945, roofType: "Retractable roof", roofType_ar: "سقف قابل للطي",
    climate: "Hot, 35°C+", climate_ar: "حار جداً، +35°م",
    transit: "Free trolley from parking lots", transit_ar: "حافلات مجانية من المواقف",
    tips: ["Largest WC venue — 94,000 capacity", "Fully air-conditioned", "Hosts a semifinal"],
    tips_ar: ["أكبر ملعب — 94,000 متفرج", "مكيف بالكامل", "يستضيف نصف النهائي"],
    highlights: ["🥇 Largest capacity (94K)", "Semifinal venue", "World's largest video screen"],
    highlights_ar: ["🥇 أكبر سعة (94 ألف)", "ملعب نصف النهائي", "أكبر شاشة فيديو في العالم"],
  },
  {
    tournamentName: "Mexico City Stadium", officialName: "Estadio Azteca",
    capacity: 83000, city: "Mexico City", country: "Mexico", countryFlag: "🇲🇽",
    lat: 19.3029, lng: -99.1505, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Mild, 20-25°C, rainy season", climate_ar: "معتدل، 20-25°م، موسم أمطار",
    transit: "Metro Line 2 to Tasqueña", transit_ar: "مترو الخط 2 إلى Tasqueña",
    tips: ["Altitude: 2,240m — stay hydrated", "3rd World Cup here (1970, 1986, 2026)", "Bring rain gear for July"],
    tips_ar: ["ارتفاع 2,240م — اشرب الكثير", "ثالث كأس عالم (1970، 1986، 2026)", "أحضر مظلة لشهر يوليو"],
    highlights: ["🏟️ 3rd World Cup", "Historic Azteca", "Opening match venue"],
    highlights_ar: ["🏟️ ثالث كأس عالم", "أزتيكا التاريخي", "ملعب مباراة الافتتاح"],
  },
  {
    tournamentName: "Atlanta Stadium", officialName: "Mercedes-Benz Stadium",
    capacity: 75000, city: "Atlanta, GA", country: "USA", countryFlag: "🇺🇸",
    lat: 33.7554, lng: -84.4010, roofType: "Retractable roof", roofType_ar: "سقف قابل للطي",
    climate: "Hot & humid, 30-35°C", climate_ar: "حار ورطب، 30-35°م",
    transit: "MARTA rail from airport", transit_ar: "قطار MARTA من المطار",
    tips: ["One of the most advanced stadiums globally", "Semifinal venue", "Opened 2017 — ultramodern"],
    tips_ar: ["من أكثر الملاعب تطوراً عالمياً", "ملعب نصف النهائي", "افتتح 2017 — فائق الحداثة"],
    highlights: ["Semifinal venue", "Ultramodern design", "MARTA direct from airport"],
    highlights_ar: ["ملعب نصف النهائي", "تصميم فائق الحداثة", "MARTA مباشر من المطار"],
  },
  {
    tournamentName: "Los Angeles Stadium", officialName: "SoFi Stadium",
    capacity: 70000, city: "Inglewood, CA", country: "USA", countryFlag: "🇺🇸",
    lat: 33.9535, lng: -118.3392, roofType: "Semi-enclosed", roofType_ar: "شبه مغلق",
    climate: "Mild year-round, 20-28°C", climate_ar: "معتدل طوال العام، 20-28°م",
    transit: "Metro C Line to Inglewood", transit_ar: "مترو الخط C إلى Inglewood",
    tips: ["Most expensive stadium in the world", "LAX airport 5 min away", "Semi-enclosed — comfortable in any weather"],
    tips_ar: ["أغلى ملعب في العالم", "مطار LAX على بعد 5 دقائق", "شبه مغلق — مريح في أي طقس"],
    highlights: ["💰 Most expensive stadium globally", "Near LAX airport", "Quarter-final venue"],
    highlights_ar: ["💰 أغلى ملعب في العالم", "قرب مطار LAX", "ملعب ربع النهائي"],
  },
  {
    tournamentName: "Miami Stadium", officialName: "Hard Rock Stadium",
    capacity: 65000, city: "Miami, FL", country: "USA", countryFlag: "🇺🇸",
    lat: 25.958, lng: -80.2389, roofType: "Partial canopy", roofType_ar: "مظلة جزئية",
    climate: "Hot & humid, 30-35°C", climate_ar: "حار ورطب، 30-35°م",
    transit: "Express bus from downtown", transit_ar: "حافلة سريعة من وسط المدينة",
    tips: ["Bring sunscreen — intense sun", "3rd place match venue", "Cuban food & Key lime pie nearby"],
    tips_ar: ["أحضر واقي شمس", "ملعب مباراة المركز الثالث", "أكل كوبي وفطيرة ليمون قريبة"],
    highlights: ["3rd place match", "Quarter-final venue", "Beach nearby"],
    highlights_ar: ["مباراة المركز الثالث", "ملعب ربع النهائي", "شاطئ قريب"],
  },
  {
    tournamentName: "Houston Stadium", officialName: "NRG Stadium",
    capacity: 72000, city: "Houston, TX", country: "USA", countryFlag: "🇺🇸",
    lat: 29.6847, lng: -95.4107, roofType: "Retractable roof", roofType_ar: "سقف قابل للطي",
    climate: "Very hot & humid, 33-38°C", climate_ar: "حار جداً ورطب، 33-38°م",
    transit: "METRORail from downtown", transit_ar: "METRORail من وسط المدينة",
    tips: ["Full A/C — climate controlled", "Near NASA Space Center", "Tex-Mex food capital"],
    tips_ar: ["تكييف كامل", "قرب مركز ناسا الفضائي", "عاصمة أكل تكس-مكس"],
    highlights: ["Round of 16 venue", "Full air conditioning", "NASA nearby"],
    highlights_ar: ["ملعب دور الـ16", "تكييف كامل", "ناسا قريب"],
  },
  {
    tournamentName: "Seattle Stadium", officialName: "Lumen Field",
    capacity: 69000, city: "Seattle, WA", country: "USA", countryFlag: "🇺🇸",
    lat: 47.5952, lng: -122.3316, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Cool, 18-25°C", climate_ar: "بارد نسبياً، 18-25°م",
    transit: "Link Light Rail from airport", transit_ar: "قطار Link من المطار",
    tips: ["Coolest WC venue — bring a jacket", "Walk from Pioneer Square", "Original Starbucks nearby"],
    tips_ar: ["أبرد ملعب — أحضر جاكيت", "مشي من Pioneer Square", "أول ستاربكس قريب"],
    highlights: ["Coolest climate", "Round of 32 venue", "Waterfront views"],
    highlights_ar: ["أبرد مناخ", "ملعب دور الـ32", "إطلالة على الواجهة البحرية"],
  },
  {
    tournamentName: "Philadelphia Stadium", officialName: "Lincoln Financial Field",
    capacity: 69000, city: "Philadelphia, PA", country: "USA", countryFlag: "🇺🇸",
    lat: 39.9008, lng: -75.1675, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Warm, 28-33°C", climate_ar: "دافئ، 28-33°م",
    transit: "SEPTA Broad Street Line", transit_ar: "خط SEPTA Broad Street",
    tips: ["Round of 16 venue", "Independence Hall nearby", "Famous Philly cheesesteaks"],
    tips_ar: ["ملعب دور الـ16", "قاعة الاستقلال قريبة", "ساندويشات فيلي الشهيرة"],
    highlights: ["Round of 16 venue", "Historic Philadelphia", "Direct subway"],
    highlights_ar: ["ملعب دور الـ16", "فيلادلفيا التاريخية", "مترو مباشر"],
  },
  {
    tournamentName: "San Francisco Bay Area Stadium", officialName: "Levi's Stadium",
    capacity: 71000, city: "Santa Clara, CA", country: "USA", countryFlag: "🇺🇸",
    lat: 37.4033, lng: -121.9694, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Mild, 22-28°C", climate_ar: "معتدل، 22-28°م",
    transit: "VTA light rail from San Jose", transit_ar: "قطار VTA من سان خوسيه",
    tips: ["Bay Area mild climate", "Round of 32 venue", "Great America theme park nearby"],
    tips_ar: ["مناخ خليج معتدل", "ملعب دور الـ32", "منتزه Great America قريب"],
    highlights: ["Round of 32 venue", "Silicon Valley location", "Mild climate"],
    highlights_ar: ["ملعب دور الـ32", "وادي السيليكون", "مناخ معتدل"],
  },
  {
    tournamentName: "Boston Stadium", officialName: "Gillette Stadium",
    capacity: 65000, city: "Foxborough, MA", country: "USA", countryFlag: "🇺🇸",
    lat: 42.0909, lng: -71.2643, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Warm, 25-30°C", climate_ar: "دافئ، 25-30°م",
    transit: "Commuter rail from Boston South Station", transit_ar: "قطار الضواحي من Boston South",
    tips: ["Quarter-final venue", "Local dispute with FIFA on security costs", "Revolutionary War history nearby"],
    tips_ar: ["ملعب ربع النهائي", "خلاف محلي مع FIFA بشأن التكاليف", "تاريخ الثورة الأمريكية قريب"],
    highlights: ["Quarter-final venue", "Historic Boston area", "Commuter rail access"],
    highlights_ar: ["ملعب ربع النهائي", "منطقة بوسطن التاريخية", "قطار ضواحي"],
  },
  {
    tournamentName: "Kansas City Stadium", officialName: "Arrowhead Stadium",
    capacity: 73000, city: "Kansas City, MO", country: "USA", countryFlag: "🇺🇸",
    lat: 39.0489, lng: -94.4839, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Hot, 30-35°C", climate_ar: "حار، 30-35°م",
    transit: "Shuttle from downtown KC", transit_ar: "حافلات من وسط المدينة",
    tips: ["BBQ capital of the world", "Famous tailgating culture", "Quarter-final venue"],
    tips_ar: ["عاصمة الباربكيو في العالم", "ثقافة شواء ما قبل المباراة", "ملعب ربع النهائي"],
    highlights: ["Quarter-final venue", "BBQ capital", "Electric atmosphere"],
    highlights_ar: ["ملعب ربع النهائي", "عاصمة الباربكيو", "أجواء كهربائية"],
  },
  {
    tournamentName: "BC Place Vancouver", officialName: "BC Place",
    capacity: 54000, city: "Vancouver, BC", country: "Canada", countryFlag: "🇨🇦",
    lat: 49.2768, lng: -123.1118, roofType: "Retractable roof", roofType_ar: "سقف قابل للطي",
    climate: "Cool & mild, 18-24°C", climate_ar: "بارد ومعتدل، 18-24°م",
    transit: "SkyTrain from airport", transit_ar: "SkyTrain من المطار",
    tips: ["Rain protected — retractable roof", "Walk along False Creek after match", "Round of 16 venue"],
    tips_ar: ["محمي من المطر — سقف قابل للطي", "تمشّ على False Creek بعد المباراة", "ملعب دور الـ16"],
    highlights: ["Round of 16 venue", "Mountain & ocean views", "Retractable roof"],
    highlights_ar: ["ملعب دور الـ16", "إطلالة جبلية وبحرية", "سقف قابل للطي"],
  },
  {
    tournamentName: "Toronto Stadium", officialName: "BMO Field",
    capacity: 45000, city: "Toronto, ON", country: "Canada", countryFlag: "🇨🇦",
    lat: 43.6335, lng: -79.4186, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Warm & humid, 25-30°C", climate_ar: "دافئ ورطب، 25-30°م",
    transit: "TTC streetcar to Exhibition", transit_ar: "ترام TTC إلى Exhibition",
    tips: ["Smallest WC venue — 45K (intimate)", "Recently renovated for WC 2026", "Lake Ontario waterfront"],
    tips_ar: ["أصغر ملعب — 45 ألف (حميم)", "تم تجديده حديثاً لـ 2026", "واجهة بحيرة أونتاريو"],
    highlights: ["Smallest & most intimate", "Renovated for 2026", "Waterfront location"],
    highlights_ar: ["الأصغر والأكثر حميمية", "مجدد لـ 2026", "على الواجهة البحرية"],
  },
  {
    tournamentName: "Estadio Monterrey", officialName: "Estadio BBVA",
    capacity: 53500, city: "Monterrey", country: "Mexico", countryFlag: "🇲🇽",
    lat: 25.6697, lng: -100.2447, roofType: "Open-air", roofType_ar: "مكشوف",
    climate: "Very hot, 32-40°C", climate_ar: "حار جداً، 32-40°م",
    transit: "Metro & bus from city center", transit_ar: "مترو وحافلات من وسط المدينة",
    tips: ["Stunning mountain backdrop", "Try cabrito & machaca", "Very hot — drink water constantly"],
    tips_ar: ["منظر جبلي خلاب", "جرّب الكابريتو والماتشاكا", "حار جداً — اشرب ماء باستمرار"],
    highlights: ["Mountain backdrop", "Impressive architecture", "Local culinary scene"],
    highlights_ar: ["خلفية جبلية", "عمارة مبهرة", "مشهد طعام محلي"],
  },
  {
    tournamentName: "Estadio Guadalajara", officialName: "Estadio Akron",
    capacity: 48000, city: "Guadalajara (Zapopan)", country: "Mexico", countryFlag: "🇲🇽",
    lat: 20.6821, lng: -103.4625, roofType: "Partial canopy", roofType_ar: "مظلة جزئية",
    climate: "Warm, rainy in July, 22-28°C", climate_ar: "دافئ، ممطر في يوليو، 22-28°م",
    transit: "Bus from Guadalajara center", transit_ar: "حافلة من وسط غوادالاخارا",
    tips: ["Volcano-inspired design", "Tequila distilleries nearby", "Only group-stage venue — no knockouts"],
    tips_ar: ["تصميم مستوحى من البراكين", "مصانع تكيلا قريبة", "مباريات المجموعات فقط"],
    highlights: ["Volcano-inspired design", "Tequila country", "Group stage only"],
    highlights_ar: ["تصميم بركاني", "بلد التكيلا", "مجموعات فقط"],
  },
];

// Build lookup maps
const STADIUM_BY_NAME: Record<string, StadiumInfo> = {};
STADIUMS.forEach((s) => {
  STADIUM_BY_NAME[s.tournamentName] = s;
  STADIUM_BY_NAME[s.officialName] = s;
});

const stadiumIcon = new L.DivIcon({
  html: `<div style="background:linear-gradient(135deg,hsl(142,76%,36%),hsl(142,70%,28%));width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;">⚽</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
  className: "",
});

const PromotionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const isAr = lang === "ar";

  const [promo, setPromo] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<LinkedMatch[]>([]);
  const [currentMedia, setCurrentMedia] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [expandedVenue, setExpandedVenue] = useState<string | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [selectedSubEvents, setSelectedSubEvents] = useState<Set<number>>(new Set());
  const [favoriteMatches, setFavoriteMatches] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const scheduleRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (type: string) => {
    setCollapsedGroups(prev => {
      const n = new Set(prev);
      if (n.has(type)) n.delete(type); else n.add(type);
      return n;
    });
  };

  // Load favorites from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("wc_favorite_matches");
    if (saved) setFavoriteMatches(new Set(JSON.parse(saved)));
  }, []);

  const toggleSelectMatch = (matchId: string) => {
    setSelectedMatches(prev => {
      const n = new Set(prev);
      if (n.has(matchId)) n.delete(matchId); else n.add(matchId);
      return n;
    });
  };

  const toggleFavorite = (matchId: string) => {
    setFavoriteMatches(prev => {
      const n = new Set(prev);
      if (n.has(matchId)) n.delete(matchId); else n.add(matchId);
      localStorage.setItem("wc_favorite_matches", JSON.stringify([...n]));
      return n;
    });
  };

  const handlePlanSelected = () => {
    const selected = matches.filter(m => selectedMatches.has(m.id));
    if (selected.length === 0) return;
    const cities = [...new Set(selected.map(m => m.city))];
    // Prefer admin-defined ai_prompt per match (stored in metadata.ai_prompt); fallback to auto-generated schedule
    const scheduleParts = selected.map(m => {
      const meta: any = m.metadata || {};
      if (typeof meta.ai_prompt === "string" && meta.ai_prompt.trim()) {
        return meta.ai_prompt.trim();
      }
      const teams = meta.team1 && meta.team2 ? `${meta.team1} vs ${meta.team2}` : m.title;
      const dateBit = m.start_date ? ` on ${m.start_date}` : "";
      const timeBit = meta.kickoff ? ` at ${meta.kickoff}` : "";
      return `${teams} at ${m.venue || m.city}${dateBit}${timeBit}`;
    });
    const params = new URLSearchParams({
      destination: cities[0],
      event: promo?.title || "World Cup 2026",
      startDate: selected[0].start_date,
      specialPlaces: `Match schedule: ${scheduleParts.join("; ")}`,
    });
    if (cities.length > 1) params.set("multiCities", cities.join("|"));
    navigate(`/planner?${params.toString()}`);
  };

  const fetchMatches = async () => {
    const { data: m } = await supabase
      .from("global_events")
      .select("id, title, title_ar, city, venue, start_date, metadata, latitude, longitude")
      .eq("is_active", true)
      .ilike("title", "%World Cup 2026%")
      .order("start_date");
    if (m) setMatches(m as any);
  };

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      setLoading(true);
      const { data } = await supabase.from("promotions").select("*").eq("id", id).single();
      if (data) {
        setPromo(data as any);
        if (data.title?.toLowerCase().includes("world cup") || data.title?.includes("كأس العالم")) {
          await fetchMatches();
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  // Auto-open schedule when navigated with #schedule hash
  useEffect(() => {
    if (location.hash === '#schedule' && matches.length > 0) {
      setShowSchedule(true);
      setTimeout(() => scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    }
  }, [location.hash, matches]);

  // Realtime score updates
  useEffect(() => {
    const channel = supabase
      .channel('wc-live-scores')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'global_events' }, (payload) => {
        if ((payload.new as any)?.title?.includes('World Cup 2026')) {
          fetchMatches();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Compute matches per venue
  const matchesByVenue = useMemo(() => {
    const map: Record<string, LinkedMatch[]> = {};
    matches.forEach((m) => {
      const venueName = m.venue || m.city;
      if (!map[venueName]) map[venueName] = [];
      map[venueName].push(m);
    });
    return map;
  }, [matches]);

  // Unique stadiums with match counts — fuzzy venue matching
  const venueList = useMemo(() => {
    const seen = new Set<string>();
    return STADIUMS.filter((s) => {
      const key = `${s.lat},${s.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((s) => {
      const venueMatches = matches.filter(m => {
        const v = (m.venue || "").toLowerCase();
        return v.includes(s.tournamentName.toLowerCase()) || v.includes(s.officialName.toLowerCase());
      });
      return { ...s, matchCount: venueMatches.length, venueMatches };
    }).sort((a, b) => b.matchCount - a.matchCount);
  }, [matches]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center pt-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!promo) return (
    <div className="min-h-screen flex flex-col items-center justify-center pt-20 gap-4">
      <Megaphone className="h-12 w-12 text-muted-foreground" />
      <p className="text-lg font-bold">{isAr ? "العرض غير موجود" : "Promotion not found"}</p>
      <Button onClick={() => navigate("/promotions")}><ArrowLeft className="w-4 h-4 mr-2" />{isAr ? "العودة" : "Back"}</Button>
    </div>
  );

  const title = isAr && promo.title_ar ? promo.title_ar : promo.title;
  const desc = isAr && promo.description_ar ? promo.description_ar : promo.description;
  const places = Array.isArray(promo.included_places) ? promo.included_places : [];
  const mediaUrls = promo.media_urls || [];
  const isWC = promo.title?.toLowerCase().includes("world cup") || promo.title?.includes("كأس العالم");

  const isVideo = (url: string) => /\.(mp4|webm|mov)/i.test(url);

  const handlePlanTrip = () => {
    const allPlaces = places.map((p: any) => typeof p === "string" ? p : p.name || p);
    const params = new URLSearchParams();
    if (promo.cta_destination) params.set("destination", promo.cta_destination);
    params.set("event", title);

    // Use structured type field from admin if available, fallback to regex parsing
    const extractedCities: string[] = [];
    const venueActivities: string[] = [];
    places.forEach((place: any) => {
      const name = typeof place === 'string' ? place : place.name || place;
      const type = typeof place === 'object' ? place.type : null;
      if (type === 'city') {
        extractedCities.push(name);
      } else if (type === 'activity') {
        venueActivities.push(name);
      } else {
        // Fallback: parse "Venue — City" pattern
        const dashMatch = name.match(/—\s*(.+)/);
        if (dashMatch) {
          const cityPart = dashMatch[1].replace(/\(.*\)/, '').trim();
          if (cityPart) extractedCities.push(cityPart);
          venueActivities.push(name);
        } else {
          venueActivities.push(name);
        }
      }
    });

    // Build specialPlaces — venues & activities for the AI
    const venuesText = venueActivities.join(", ");

    // Collect per-city sub-event details (admin-defined dates/times/venues)
    // Prefer the admin-provided ai_prompt for that city; otherwise build from fields (only including date/time if set)
    const cityScheduleParts: string[] = [];
    places.forEach((place: any) => {
      if (typeof place !== "object" || place?.type !== "city") return;
      if (typeof place.ai_prompt === "string" && place.ai_prompt.trim()) {
        cityScheduleParts.push(place.ai_prompt.trim());
        return;
      }
      const bits: string[] = [];
      if (place.venue) bits.push(`at ${place.venue}`);
      if (place.start_date) bits.push(`on ${place.start_date}`);
      if (place.kickoff_time) bits.push(`at ${place.kickoff_time}`);
      if (place.notes) bits.push(`(${place.notes})`);
      if (bits.length > 0) cityScheduleParts.push(`${place.name} ${bits.join(" ")}`);
    });

    const lang = i18n.language;
    let specialInstruction = "";

    // Admin-defined top-level promotion prompt always wins as the lead instruction
    if (promo.ai_prompt && promo.ai_prompt.trim()) {
      specialInstruction = promo.ai_prompt.trim();
    }

    if (venuesText) {
      const venuesLine = lang === 'ar'
        ? `يجب أن تتضمن خطة الرحلة هذه الأماكن والأنشطة المحددة (هي ليست مدن بل معالم ومطاعم وأنشطة): ${venuesText}`
        : `You MUST include these specific places/activities in the trip itinerary (they are NOT cities, they are attractions, restaurants, or activities): ${venuesText}`;
      specialInstruction += (specialInstruction ? "\n" : "") + venuesLine;
    }
    if (cityScheduleParts.length > 0) {
      specialInstruction += (specialInstruction ? "\n" : "") + `Event schedule: ${cityScheduleParts.join("; ")}`;
    }

    if (matches.length > 0) {
      params.set("startDate", matches[0].start_date);
      // Also set end date / duration from last match
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.start_date !== matches[0].start_date) {
        const start = new Date(matches[0].start_date);
        const end = new Date(lastMatch.start_date);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 0) params.set("duration", String(diffDays));
      }
      const schedule = matches.slice(0, 20).map((m) => {
        const meta = m.metadata;
        const teams = meta?.team1 && meta?.team2 ? `${meta.team1} vs ${meta.team2}` : m.title;
        return `${teams} at ${m.venue || m.city} on ${m.start_date}${meta?.kickoff ? " at " + meta.kickoff : ""}`;
      }).join("; ");
      if (schedule) {
        specialInstruction += (specialInstruction ? "\n" : "") + `Match schedule: ${schedule}`;
      }
      // Extract actual cities from matches for multiCities
      const matchCities = [...new Set(matches.map(m => m.city).filter(Boolean))];
      if (matchCities.length > 1) params.set("multiCities", matchCities.join("|"));
    } else {
      // Use extracted cities from place names as multiCities
      const uniqueCities = [...new Set(extractedCities)];
      if (uniqueCities.length > 1) {
        params.set("multiCities", uniqueCities.join("|"));
      }
      if (promo.start_date) {
        params.set("startDate", promo.start_date);
        if (promo.end_date) {
          const start = new Date(promo.start_date);
          const end = new Date(promo.end_date);
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0 && diffDays <= 30) params.set("duration", String(diffDays));
        }
      }
    }

    if (specialInstruction) params.set("specialPlaces", specialInstruction);
    navigate(`/planner?${params.toString()}`);
  };

  const handlePlanMatch = (match: LinkedMatch) => {
    const meta = match.metadata || {};
    const params = new URLSearchParams({ destination: match.city, event: match.title, startDate: match.start_date });
    if (meta.kickoff) params.set("specialPlaces", `Match: ${meta.team1 || ""} vs ${meta.team2 || ""} at ${match.venue || match.city} on ${match.start_date} at ${meta.kickoff}`);
    navigate(`/planner?${params.toString()}`);
  };

  const scrollToSchedule = () => {
    setShowSchedule(true);
    setTimeout(() => scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const groupMatchesByType = (ms: LinkedMatch[]) => {
    const groups: Record<string, LinkedMatch[]> = {};
    ms.forEach((m) => {
      const type = m.metadata?.match_type || "Other";
      if (!groups[type]) groups[type] = [];
      groups[type].push(m);
    });
    return groups;
  };

  const matchGroups = groupMatchesByType(matches);

  const formatMatchDateLabel = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return format(parsed, isAr ? "dd MMM yyyy" : "EEE, dd MMM yyyy");
  };

  const formatMatchDateParts = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return { day: "", month: "", weekday: "" };
    return {
      day: format(parsed, "dd"),
      month: format(parsed, "MMM").toUpperCase(),
      weekday: format(parsed, "EEE").toUpperCase(),
    };
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background pb-16" dir={isAr ? "rtl" : "ltr"}>
      {/* Back button */}
      <div className="section-container pt-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/promotions")} className="gap-2">
          <ArrowLeft size={16} /> {isAr ? "العودة للعروض" : "Back to Promotions"}
        </Button>
      </div>

      {/* Media Gallery */}
      {mediaUrls.length > 0 && (
        <div className="relative mt-2">
          <div className="relative h-72 md:h-[420px] bg-black cursor-pointer" onClick={() => setLightbox(true)}>
            {isVideo(mediaUrls[currentMedia]) ? (
              <video src={mediaUrls[currentMedia]} className="w-full h-full object-contain" controls autoPlay={false} onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={mediaUrls[currentMedia]} alt={title} className="w-full h-full object-contain" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
            {mediaUrls.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setCurrentMedia((p) => (p > 0 ? p - 1 : mediaUrls.length - 1)); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"><ChevronLeft size={20} /></button>
                <button onClick={(e) => { e.stopPropagation(); setCurrentMedia((p) => (p < mediaUrls.length - 1 ? p + 1 : 0)); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"><ChevronRight size={20} /></button>
              </>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">{currentMedia + 1} / {mediaUrls.length}</div>
            <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"><Maximize2 size={14} /></button>
          </div>
          {mediaUrls.length > 1 && (
            <div className="section-container py-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaUrls.map((url, i) => (
                  <button key={i} onClick={() => setCurrentMedia(i)} className={`relative w-16 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition ${i === currentMedia ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
                    {isVideo(url) ? <div className="w-full h-full bg-muted flex items-center justify-center"><Play size={14} className="text-muted-foreground" /></div> : <img src={url} alt="" className="w-full h-full object-cover" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightbox(false)}>
            <button className="absolute top-4 right-4 text-white z-10" onClick={() => setLightbox(false)}><X size={28} /></button>
            {isVideo(mediaUrls[currentMedia]) ? (
              <video src={mediaUrls[currentMedia]} className="max-w-full max-h-[90vh]" controls autoPlay onClick={(e) => e.stopPropagation()} />
            ) : (
              <img src={mediaUrls[currentMedia]} className="max-w-full max-h-[90vh] object-contain" alt="" onClick={(e) => e.stopPropagation()} />
            )}
            {mediaUrls.length > 1 && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setCurrentMedia((p) => (p > 0 ? p - 1 : mediaUrls.length - 1)); }} className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center"><ChevronLeft size={24} /></button>
                <button onClick={(e) => { e.stopPropagation(); setCurrentMedia((p) => (p < mediaUrls.length - 1 ? p + 1 : 0)); }} className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center"><ChevronRight size={24} /></button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="section-container py-6 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isWC && <Trophy className="w-7 h-7 text-yellow-500" />}
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">{title}</h1>
            </div>
            {promo.start_date && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar size={14} />
                {format(new Date(promo.start_date), "dd MMM yyyy")}
                {promo.end_date && ` — ${format(new Date(promo.end_date), "dd MMM yyyy")}`}
              </p>
            )}
            {isWC && (
              <div className="flex gap-2 flex-wrap">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{isAr ? "48 منتخب" : "48 Teams"}</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{isAr ? "104 مباراة" : "104 Matches"}</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{isAr ? "16 ملعب" : "16 Stadiums"}</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{isAr ? "3 دول" : "3 Countries"}</Badge>
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => {
            navigator.share?.({ title, url: window.location.href }).catch(() => { navigator.clipboard.writeText(window.location.href); });
          }}>
            <Share2 size={14} /> {isAr ? "مشاركة" : "Share"}
          </Button>
        </div>

        {/* Description */}
        <p className="text-muted-foreground leading-relaxed text-base">{desc}</p>

        {/* Places */}
        {places.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">{isAr ? "الأماكن المضمنة في خطتك:" : "Included in your trip plan:"}</h3>
            <div className="flex flex-wrap gap-2">
              {places.map((place: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs gap-1 py-1.5 px-3">
                  <MapPin size={12} /> {typeof place === "string" ? place : place.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ===== INTERACTIVE LEAFLET MAP ===== */}
        {isWC && venueList.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              {isAr ? "خريطة الملاعب التفاعلية" : "Interactive Stadiums Map"}
            </h3>
            <div className="rounded-2xl overflow-hidden border-2 border-primary/20 shadow-xl ring-1 ring-primary/10" style={{ height: 450 }}>
              <MapContainer
                {...{ center: [35, -98] as L.LatLngExpression, zoom: 3, scrollWheelZoom: true, attributionControl: false }}
                style={{ width: "100%", height: "100%" }}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                {venueList.map((s) => (
                  <Marker key={s.tournamentName} {...{ position: [s.lat, s.lng] as L.LatLngExpression, icon: stadiumIcon }}>
                    <Popup {...{ maxWidth: 320, minWidth: 260 }}>
                      <div style={{ fontFamily: "system-ui", padding: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>{s.tournamentName}</div>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>({s.officialName}) • {s.countryFlag} {s.city}</div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, background: "#f0f0f0", padding: "2px 8px", borderRadius: 12 }}>👥 {s.capacity.toLocaleString()}</span>
                          <span style={{ fontSize: 11, background: "#f0f0f0", padding: "2px 8px", borderRadius: 12 }}>🏟️ {isAr ? s.roofType_ar : s.roofType}</span>
                          <span style={{ fontSize: 11, background: "#f0f0f0", padding: "2px 8px", borderRadius: 12 }}>🌡️ {isAr ? s.climate_ar : s.climate}</span>
                        </div>
                        {s.venueMatches.length > 0 && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3 }}>⚽ {isAr ? "المباريات" : "Matches"} ({s.matchCount}):</div>
                            <div style={{ maxHeight: 100, overflowY: "auto" }}>
                              {s.venueMatches.slice(0, 6).map((m, i) => {
                                const meta = m.metadata || {};
                                return (
                                  <div key={i} style={{ fontSize: 10, padding: "2px 0", borderBottom: "1px solid #eee" }}>
                                    {meta.team1_flag} {meta.team1} vs {meta.team2} {meta.team2_flag}
                                    <span style={{ color: "#999", marginLeft: 4 }}>{meta.kickoff || ""}</span>
                                  </div>
                                );
                              })}
                              {s.venueMatches.length > 6 && <div style={{ fontSize: 10, color: "#999" }}>+{s.venueMatches.length - 6} more</div>}
                            </div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ background: "#22c55e", color: "white", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: "none" }}
                          >
                            🗺️ {isAr ? "خرائط جوجل" : "Google Maps"}
                          </a>
                          <a
                            href={`/stadium/${s.officialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`}
                            style={{ background: "#3b82f6", color: "white", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, textDecoration: "none" }}
                          >
                            🏟️ {isAr ? "التفاصيل" : "Details"}
                          </a>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">{isAr ? "اضغط على أي ملعب لعرض التفاصيل والمباريات" : "Click any stadium for details & matches"}</p>
          </div>
        )}

        {/* ===== STADIUMS SECTION ===== */}
        {isWC && venueList.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {isAr ? `الملاعب (${venueList.length})` : `Stadiums (${venueList.length})`}
              <span className="text-xs font-normal text-muted-foreground ml-2">stadiumdb.com</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {venueList.map((s) => {
                const isExpanded = expandedVenue === s.tournamentName;
                return (
                  <motion.div key={s.tournamentName} layout className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-all hover:shadow-md">
                    <button onClick={() => setExpandedVenue(isExpanded ? null : s.tournamentName)} className="w-full flex items-center justify-between p-4 text-left gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 text-lg">
                          {s.countryFlag}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-foreground">{s.tournamentName}</p>
                          <p className="text-[11px] text-muted-foreground">({s.officialName}) • {s.city}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <Badge variant="outline" className="text-[10px] mb-0.5">{s.matchCount} {isAr ? "مباراة" : "matches"}</Badge>
                          <p className="text-[10px] text-muted-foreground">{s.capacity.toLocaleString()} 👥</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                            {/* Quick facts */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                                <Building2 size={12} className="text-primary shrink-0" />
                                <span>{isAr ? s.roofType_ar : s.roofType}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                                <Thermometer size={12} className="text-orange-500 shrink-0" />
                                <span>{isAr ? s.climate_ar : s.climate}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                                <Users size={12} className="text-blue-500 shrink-0" />
                                <span>{s.capacity.toLocaleString()}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                                <Train size={12} className="text-green-500 shrink-0" />
                                <span className="truncate">{isAr ? s.transit_ar : s.transit}</span>
                              </div>
                            </div>

                            {/* Highlights */}
                            <div className="flex flex-wrap gap-1.5">
                              {(isAr ? s.highlights_ar : s.highlights).map((h, i) => (
                                <Badge key={i} className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20 text-[10px]">
                                  <Star size={8} className="mr-0.5" /> {h}
                                </Badge>
                              ))}
                            </div>

                            {/* Tips */}
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-foreground flex items-center gap-1">
                                <Lightbulb size={12} className="text-yellow-500" /> {isAr ? "نصائح:" : "Tips:"}
                              </p>
                              <ul className="space-y-0.5">
                                {(isAr ? s.tips_ar : s.tips).map((tip, i) => (
                                  <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                                    <span className="text-primary mt-0.5 shrink-0">•</span> {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Matches at this venue */}
                            {s.venueMatches.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-bold text-foreground flex items-center gap-1">
                                  <Trophy size={12} className="text-yellow-500" /> {isAr ? `المباريات في هذا الملعب (${s.matchCount}):` : `Matches here (${s.matchCount}):`}
                                </p>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {s.venueMatches.map((m, i) => {
                                    const meta = m.metadata || {};
                                    return (
                                      <div key={i} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-lg text-[11px]">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span>{meta.team1_flag}</span>
                                          <span className="font-medium">{meta.team1}</span>
                                          <span className="text-muted-foreground">vs</span>
                                          <span className="font-medium">{meta.team2}</span>
                                          <span>{meta.team2_flag}</span>
                                        </div>
                                        <div className="text-muted-foreground shrink-0 flex items-center gap-1">
                                          <span>{format(new Date(m.start_date), "dd MMM")}</span>
                                          {meta.kickoff && <><span>·</span><span>{meta.kickoff}</span></>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Directions */}
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="flex-1 gap-2 text-xs" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.officialName + " " + s.city)}`, "_blank")}>
                                <Navigation size={12} /> {isAr ? "خرائط جوجل" : "Google Maps"}
                              </Button>
                              <Button variant="default" size="sm" className="flex-1 gap-2 text-xs" asChild>
                                <Link to={`/stadium/${s.officialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")}`}>
                                  <Building2 size={12} /> {isAr ? "تفاصيل الملعب" : "Stadium Details"}
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* World Cup Standings */}
        {isWC && matches.length > 0 && <WorldCupStandings />}

        {/* Match Schedule — collapsible */}
        {matches.length > 0 && (
          <div className="space-y-4" ref={scheduleRef}>
            <button onClick={() => setShowSchedule(!showSchedule)} className="w-full flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                {isAr ? `جدول المباريات (${matches.length})` : `Match Schedule (${matches.length})`}
              </h3>
              {showSchedule ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>

            {/* Multi-select toolbar */}
            {showSchedule && selectedMatches.size > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-primary/20">
                <CheckSquare className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm font-medium">{isAr ? `${selectedMatches.size} مباراة محددة` : `${selectedMatches.size} matches selected`}</span>
                <Button size="sm" className="gap-1.5 ml-auto" onClick={handlePlanSelected}>
                  <Sparkles size={14} /> {isAr ? "خطط للمباريات المحددة" : "Plan Selected Matches"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedMatches(new Set())}>
                  <X size={14} />
                </Button>
              </motion.div>
            )}

            <AnimatePresence>
              {showSchedule && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden space-y-6">
                  {Object.entries(matchGroups).sort(([a], [b]) => a.localeCompare(b)).map(([type, typeMatches]) => {
                    const isCollapsed = collapsedGroups.has(type);
                    return (
                    <div key={type} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => toggleGroup(type)}
                        className="w-full flex items-center justify-between gap-2 pb-1 border-b border-border/50 hover:border-primary/40 transition-colors text-left"
                      >
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/5 border-primary/30 text-primary font-semibold">{type}</Badge>
                          <span className="text-muted-foreground text-xs font-medium">{typeMatches.length} {isAr ? "مباراة" : "matches"}</span>
                        </h4>
                        {isCollapsed
                          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      <AnimatePresence initial={false}>
                      {!isCollapsed && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {typeMatches.map((match) => {
                          const meta = match.metadata || {};
                          const isSelected = selectedMatches.has(match.id);
                          const isFav = favoriteMatches.has(match.id);
                          const hasScore = meta.score1 !== undefined && meta.score2 !== undefined;
                          const isLive = meta.match_status === "live" || meta.match_status === "halftime";
                          const dateParts = formatMatchDateParts(match.start_date);
                          return (
                            <motion.div
                              key={match.id}
                              whileHover={{ y: -2 }}
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleSelectMatch(match.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  toggleSelectMatch(match.id);
                                }
                              }}
                              aria-pressed={isSelected}
                              className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-300 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                                isSelected
                                  ? "border-primary shadow-lg shadow-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
                                  : isLive
                                  ? "border-green-500/60 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent shadow-md shadow-green-500/10"
                                  : "border-border/60 bg-gradient-to-br from-card to-card/60 hover:border-primary/40 hover:shadow-md"
                              }`}
                            >
                              <div className={`absolute top-0 inset-x-0 h-1 ${isSelected ? "bg-primary" : isLive ? "bg-green-500" : "bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30"}`} />

                              {isLive && (
                                <Badge className="absolute top-3 right-3 bg-green-500 text-white text-[10px] font-bold animate-pulse shadow-md">
                                  {meta.match_status === "halftime" ? "⏸ HT" : "🔴 LIVE"}
                                </Badge>
                              )}

                              <div className="p-4 pt-5">
                                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Checkbox
                                      checked={isSelected}
                                      onClick={(e) => e.stopPropagation()}
                                      onCheckedChange={() => toggleSelectMatch(match.id)}
                                      className="shrink-0"
                                    />
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                                      <Calendar size={11} className="text-primary" />
                                      <span className="text-[11px] font-bold text-primary tracking-wide">
                                        {dateParts.weekday} • {dateParts.day} {dateParts.month}
                                      </span>
                                    </div>
                                    {meta.kickoff && (
                                      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/80 border border-border">
                                        <Clock size={10} className="text-muted-foreground" />
                                        <span className="text-[11px] font-bold text-foreground whitespace-nowrap">
                                          {meta.kickoff.replace(/\s*UTC.*/i, "")}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); toggleFavorite(match.id); }} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                                      <Heart size={14} className={isFav ? "fill-red-500 text-red-500" : "text-muted-foreground"} />
                                    </button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 hover:text-primary" onClick={(e) => { e.stopPropagation(); handlePlanMatch(match); }} title={isAr ? "خطط لهذه المباراة" : "Plan this match"}>
                                      <Sparkles size={14} />
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                  <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                                    {meta.team1_flag && <span className="text-3xl leading-none drop-shadow-sm">{meta.team1_flag}</span>}
                                    <span className="text-sm font-bold text-foreground truncate w-full leading-tight">{meta.team1 || ""}</span>
                                  </div>

                                  <div className="shrink-0 flex flex-col items-center gap-0.5 px-2">
                                    {hasScore ? (
                                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-lg shadow-md">
                                        <span>{meta.score1}</span>
                                        <span className="opacity-60">-</span>
                                        <span>{meta.score2}</span>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center">
                                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">vs</span>
                                        <div className="w-6 h-px bg-border mt-0.5" />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex-1 flex flex-col items-center text-center gap-1.5 min-w-0">
                                    {meta.team2_flag && <span className="text-3xl leading-none drop-shadow-sm">{meta.team2_flag}</span>}
                                    <span className="text-sm font-bold text-foreground truncate w-full leading-tight">{meta.team2 || ""}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/50">
                                  <MapPin size={12} className="text-primary shrink-0" />
                                  <span className="text-[11px] text-foreground/80 font-medium truncate">{match.venue || match.city}</span>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                      </motion.div>
                      )}
                      </AnimatePresence>
                    </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ===== CUSTOM SUB-EVENTS (admin-defined city items) ===== */}
        {!isWC && (() => {
          const cityItems = places
            .map((p: any, idx: number) => ({ ...p, _idx: idx }))
            .filter((p: any) => typeof p === "object" && p?.type === "city" && (p.start_date || p.kickoff_time || p.venue || (p.media_urls || []).length > 0 || p.notes));
          if (cityItems.length === 0) return null;

          const toggleSub = (idx: number) => {
            setSelectedSubEvents((prev) => {
              const n = new Set(prev);
              if (n.has(idx)) n.delete(idx); else n.add(idx);
              return n;
            });
          };

          const planSubEvent = (item: any) => {
            const params = new URLSearchParams({ destination: item.name, event: title });
            if (item.start_date) params.set("startDate", item.start_date);
            if (item.start_date && item.end_date) {
              const diff = Math.ceil((new Date(item.end_date).getTime() - new Date(item.start_date).getTime()) / 86400000) + 1;
              if (diff > 0 && diff <= 30) params.set("duration", String(diff));
            }
            const parts = [
              `${title} at ${item.venue || item.name}`,
              item.start_date ? `on ${item.start_date}` : "",
              item.kickoff_time ? `at ${item.kickoff_time}` : "",
              item.notes ? `— ${item.notes}` : "",
            ].filter(Boolean).join(" ");
            params.set("specialPlaces", parts);
            navigate(`/planner?${params.toString()}`);
          };

          const planSelectedSubs = () => {
            const selected = cityItems.filter((it: any) => selectedSubEvents.has(it._idx));
            if (selected.length === 0) return;
            const cities = [...new Set(selected.map((s: any) => s.name))];
            const sorted = [...selected].sort((a: any, b: any) => (a.start_date || "").localeCompare(b.start_date || ""));
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            const params = new URLSearchParams({ destination: cities[0] as string, event: title });
            if (first?.start_date) params.set("startDate", first.start_date);
            if (first?.start_date && last?.start_date) {
              const diff = Math.ceil((new Date(last.start_date).getTime() - new Date(first.start_date).getTime()) / 86400000) + 1;
              if (diff > 0 && diff <= 30) params.set("duration", String(diff));
            }
            if (cities.length > 1) params.set("multiCities", (cities as string[]).join("|"));
            const schedule = sorted.map((s: any) => [
              `${title} in ${s.name}`,
              s.venue ? `at ${s.venue}` : "",
              s.start_date ? `on ${s.start_date}` : "",
              s.kickoff_time ? `at ${s.kickoff_time}` : "",
              s.notes ? `(${s.notes})` : "",
            ].filter(Boolean).join(" ")).join("; ");
            params.set("specialPlaces", `Event schedule: ${schedule}`);
            navigate(`/planner?${params.toString()}`);
          };

          return (
            <div className="space-y-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                {isAr ? `الفعاليات (${cityItems.length})` : `Sub-events (${cityItems.length})`}
              </h3>

              {selectedSubEvents.size > 0 && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <CheckSquare className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm font-medium">{isAr ? `${selectedSubEvents.size} فعالية محددة` : `${selectedSubEvents.size} selected`}</span>
                  <Button size="sm" className="gap-1.5 ml-auto" onClick={planSelectedSubs}>
                    <Sparkles size={14} /> {isAr ? "خطط للفعاليات المحددة" : "Plan Selected"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedSubEvents(new Set())}>
                    <X size={14} />
                  </Button>
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cityItems.map((item: any) => {
                  const isSel = selectedSubEvents.has(item._idx);
                  const dateParts = item.start_date ? formatMatchDateParts(item.start_date) : null;
                  const cover = (item.media_urls || [])[0];
                  const isVid = cover && /\.(mp4|webm|mov)/i.test(cover);
                  return (
                    <div key={item._idx} className={`flex flex-col bg-card rounded-xl border overflow-hidden transition-all ${isSel ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/30 hover:shadow-md"}`}>
                      {cover && (
                        <div className="relative h-32 bg-muted">
                          {isVid ? <video src={cover} className="w-full h-full object-cover" muted /> : <img src={cover} alt={item.name} className="w-full h-full object-cover" />}
                          <Checkbox checked={isSel} onCheckedChange={() => toggleSub(item._idx)} className="absolute top-2 left-2 bg-background/90 border-2" />
                        </div>
                      )}
                      <div className="flex items-stretch gap-3 p-3">
                        {!cover && (
                          <Checkbox checked={isSel} onCheckedChange={() => toggleSub(item._idx)} className="shrink-0 mt-1" />
                        )}
                        {dateParts && (
                          <div className="shrink-0 flex flex-col items-center justify-center w-14 rounded-lg bg-muted/60 border border-border px-1 py-1.5 text-center">
                            <span className="text-[9px] font-bold text-muted-foreground tracking-wider leading-none">{dateParts.weekday}</span>
                            <span className="text-xl font-extrabold text-foreground leading-none mt-0.5">{dateParts.day}</span>
                            <span className="text-[9px] font-semibold text-primary tracking-wider leading-none mt-0.5">{dateParts.month}</span>
                            {item.kickoff_time && (
                              <div className="mt-1 pt-1 border-t border-border w-full flex items-center justify-center gap-0.5">
                                <Clock size={8} className="text-muted-foreground" />
                                <span className="text-[9px] font-bold text-foreground leading-none whitespace-nowrap">{item.kickoff_time}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm text-foreground truncate">{item.name}</p>
                          {item.venue && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                              <MapPin size={10} className="shrink-0" /> {item.venue}
                            </p>
                          )}
                          {item.notes && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{item.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 justify-between">
                          {item.google_maps_url && (
                            <a href={item.google_maps_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-muted">
                              <Navigation size={14} className="text-primary" />
                            </a>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => planSubEvent(item)} title={isAr ? "خطط هذه الفعالية" : "Plan this event"}>
                            <Sparkles size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Non-WC map fallback */}
        {!isWC && places.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <MapPin size={16} className="text-primary" /> {isAr ? "خريطة الأماكن" : "Venues Map"}
            </h3>
            <div className="rounded-xl overflow-hidden border border-border h-[300px]">
              <iframe title="Venues" className="w-full h-full" src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(typeof places[0] === "string" ? places[0] : places[0]?.name || "location")}&zoom=10`} allowFullScreen loading="lazy" />
            </div>
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex gap-3 flex-wrap pt-4 border-t border-border">
          <Button size="lg" className="gap-2" onClick={handlePlanTrip}>
            <Sparkles size={18} /> {isAr ? "خطط رحلتك من هذا العرض" : "Plan Trip from This Offer"}
          </Button>
          {isWC && (
            <Button
              size="lg"
              className="gap-2 bg-gradient-to-r from-primary via-primary to-primary/80 hover:shadow-lg hover:shadow-primary/30 text-primary-foreground font-semibold transition-all hover:-translate-y-0.5"
              onClick={scrollToSchedule}
            >
              <Trophy size={18} className="drop-shadow-sm" />
              {isAr ? "عرض كل المباريات" : "View All Matches"}
              <span className="opacity-80">·</span>
              <Sparkles size={16} />
              {isAr ? "خطط لحضور المباراة" : "Plan to Attend"}
            </Button>
          )}
        </div>

        {/* Source */}
        {isWC && (
          <p className="text-[10px] text-muted-foreground text-center pt-2">
            {isAr ? "المصدر: stadiumdb.com | البيانات تُحدّث لحظياً" : "Source: stadiumdb.com | Real-time updates"}
          </p>
        )}
      </div>

      {/* Floating sticky bar — always visible while matches are selected */}
      <AnimatePresence>
        {selectedMatches.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-3 inset-x-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:inset-x-auto z-[60] sm:w-[calc(100%-1.5rem)] sm:max-w-md pointer-events-none"
          >
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-background/95 backdrop-blur-md border-2 border-primary/40 shadow-2xl pointer-events-auto" dir={isAr ? "rtl" : "ltr"}>
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <CheckSquare className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-semibold truncate flex-1 min-w-0">
                {t("promotions.matchesSelected", { count: selectedMatches.size, defaultValue: isAr ? `${selectedMatches.size} مباراة محددة` : `${selectedMatches.size} ${selectedMatches.size === 1 ? "match" : "matches"} selected` })}
              </span>
              <Button size="sm" className="gap-1.5 shrink-0 px-3 sm:px-4 font-semibold" onClick={handlePlanSelected}>
                <Sparkles size={14} /> {t("promotions.planSelected", { defaultValue: isAr ? "خطط الآن" : "Plan Now" })}
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setSelectedMatches(new Set())} aria-label={isAr ? "إلغاء" : "Clear"}>
                <X size={16} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PromotionDetailPage;
