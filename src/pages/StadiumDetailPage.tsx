import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArrowLeft, MapPin, Users, Building2, Thermometer, Train,
  Lightbulb, Star, Calendar, Clock, Trophy,
  Navigation, ChevronDown, ChevronUp, Globe, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

const STADIUM_BY_SLUG: Record<string, StadiumInfo> = {};
STADIUMS.forEach(s => {
  const slug = s.officialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  STADIUM_BY_SLUG[slug] = s;
});

const stadiumIcon = new L.DivIcon({
  html: `<div style="background:linear-gradient(135deg,hsl(142,76%,36%),hsl(142,70%,28%));width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:18px;">⚽</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
  className: "",
});

const StadiumDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const stadium = slug ? STADIUM_BY_SLUG[slug] : undefined;

  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllMatches, setShowAllMatches] = useState(false);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("global_events")
        .select("id, title, title_ar, city, venue, start_date, metadata, latitude, longitude")
        .eq("is_active", true)
        .ilike("title", "%World Cup 2026%")
        .order("start_date");
      setMatches(data || []);
      setLoading(false);
    };
    fetchMatches();
  }, []);

  const stadiumMatches = useMemo(() => {
    if (!stadium) return [];
    return matches.filter(m => {
      const v = m.venue || "";
      return v === stadium.officialName || v === stadium.tournamentName ||
        v.includes(stadium.officialName) || v.includes(stadium.tournamentName);
    });
  }, [matches, stadium]);

  if (!stadium) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center pt-20 gap-4">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-bold">{isAr ? "الملعب غير موجود" : "Stadium not found"}</p>
        <Button onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />{isAr ? "العودة" : "Back"}</Button>
      </div>
    );
  }

  const displayedMatches = showAllMatches ? stadiumMatches : stadiumMatches.slice(0, 4);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${stadium.lat},${stadium.lng}`;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background pb-20" dir={isAr ? "rtl" : "ltr"}>
      <div className="relative bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 text-white">
        <div className="section-container py-10 relative z-10">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-white/80 hover:text-white mb-4 gap-2">
            <ArrowLeft size={16} /> {isAr ? "العودة" : "Back"}
          </Button>

          <div className="flex items-start gap-3 mb-2">
            <span className="text-3xl">{stadium.countryFlag}</span>
            <div>
              <h1 className="text-2xl md:text-4xl font-bold leading-tight">{stadium.tournamentName}</h1>
              <p className="text-white/70 text-sm mt-1">{stadium.officialName}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <Badge className="bg-white/20 text-white border-white/30 gap-1"><MapPin size={12} />{stadium.city}, {stadium.country}</Badge>
            <Badge className="bg-white/20 text-white border-white/30 gap-1"><Users size={12} />{stadium.capacity.toLocaleString()}</Badge>
            <Badge className="bg-white/20 text-white border-white/30 gap-1"><Building2 size={12} />{isAr ? stadium.roofType_ar : stadium.roofType}</Badge>
            <Badge className="bg-white/20 text-white border-white/30 gap-1"><Trophy size={12} />{stadiumMatches.length} {isAr ? "مباراة" : "matches"}</Badge>
          </div>
        </div>
      </div>

      <div className="section-container py-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center shrink-0">
                <Thermometer size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{isAr ? "المناخ" : "Climate"}</p>
                <p className="text-sm font-semibold">{isAr ? stadium.climate_ar : stadium.climate}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 dark:border-blue-900">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                <Train size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{isAr ? "النقل" : "Transit"}</p>
                <p className="text-sm font-semibold">{isAr ? stadium.transit_ar : stadium.transit}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 dark:border-purple-900">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{isAr ? "السقف" : "Roof"}</p>
                <p className="text-sm font-semibold">{isAr ? stadium.roofType_ar : stadium.roofType}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Star size={18} className="text-yellow-500" /> {isAr ? "أبرز المعلومات" : "Highlights"}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(isAr ? stadium.highlights_ar : stadium.highlights).map((h, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="text-primary text-lg">✦</span>
                  <span className="text-sm">{h}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Lightbulb size={18} className="text-amber-500" /> {isAr ? "نصائح المسافر" : "Travel Tips"}</h2>
            <div className="space-y-2">
              {(isAr ? stadium.tips_ar : stadium.tips).map((tip, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                  <span className="text-amber-600 mt-0.5">💡</span>
                  <span className="text-sm">{tip}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><MapPin size={18} className="text-green-600" /> {isAr ? "الموقع على الخريطة" : "Location"}</h2>
            <div className="rounded-xl overflow-hidden border" style={{ height: 300 }}>
              <MapContainer {...{ center: [stadium.lat, stadium.lng], zoom: 15, style: { height: "100%", width: "100%" }, scrollWheelZoom: false } as any}>
                <TileLayer
                  {...{ url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", attribution: '&copy; <a href="https://carto.com/">CARTO</a>' } as any}
                />
                <Marker position={[stadium.lat, stadium.lng] as L.LatLngExpression} {...{ icon: stadiumIcon } as any}>
                  <Popup>
                    <div className="text-center p-1">
                      <strong>{stadium.tournamentName}</strong>
                      <br />
                      <span className="text-xs text-gray-500">{stadium.city}</span>
                      <br />
                      <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
                        {isAr ? "فتح في خرائط جوجل" : "Open in Google Maps"}
                      </a>
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(googleMapsUrl, "_blank")}>
                <Navigation size={14} /> {isAr ? "فتح في خرائط جوجل" : "Open in Google Maps"}
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(`https://www.stadiumdb.com/`, "_blank")}>
                <Globe size={14} /> stadiumdb.com
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Trophy size={18} className="text-green-600" />
              {isAr ? `المباريات في هذا الملعب (${stadiumMatches.length})` : `Matches at this Stadium (${stadiumMatches.length})`}
            </h2>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : stadiumMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{isAr ? "لم يتم تحديد المباريات بعد" : "No matches assigned yet"}</p>
            ) : (
              <div className="space-y-3">
                {displayedMatches.map((m: any) => {
                  const meta = m.metadata || {};
                  const score1 = meta.score1;
                  const score2 = meta.score2;
                  const hasScore = score1 != null && score2 != null;
                  const status = meta.status;

                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border p-4 bg-muted/30 hover:bg-muted/50 transition"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Calendar size={12} />
                          <span>{m.start_date}</span>
                          {meta.kickoff && <><Clock size={12} /><span>{meta.kickoff}</span></>}
                        </div>
                        {status === "live" && <Badge className="bg-red-500 text-white animate-pulse text-[10px]">🔴 LIVE</Badge>}
                        {meta.match_type && <Badge variant="outline" className="text-[10px]">{meta.match_type}</Badge>}
                      </div>

                      <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          {meta.flag1 && <span className="text-xl">{meta.flag1}</span>}
                          <span className="font-semibold text-sm">{meta.team1 || "TBD"}</span>
                        </div>

                        {hasScore ? (
                          <div className="bg-primary/10 px-3 py-1 rounded-lg">
                            <span className="text-lg font-bold text-primary">{score1} - {score2}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm font-medium px-2">vs</span>
                        )}

                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-semibold text-sm">{meta.team2 || "TBD"}</span>
                          {meta.flag2 && <span className="text-xl">{meta.flag2}</span>}
                        </div>
                      </div>

                      <div className="mt-3 flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          onClick={() => {
                            const params = new URLSearchParams({
                              destination: m.city,
                              event: m.title,
                              startDate: m.start_date,
                            });
                            if (meta.kickoff) params.set("specialPlaces", `Match: ${meta.team1 || ""} vs ${meta.team2 || ""} at ${m.venue || m.city} on ${m.start_date} at ${meta.kickoff}`);
                            navigate(`/planner?${params.toString()}`);
                          }}
                        >
                          <Calendar size={12} /> {isAr ? "خطط لحضور هذه المباراة" : "Plan for this match"}
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}

                {stadiumMatches.length > 4 && (
                  <Button variant="ghost" className="w-full gap-2" onClick={() => setShowAllMatches(!showAllMatches)}>
                    {showAllMatches ? <><ChevronUp size={14} /> {isAr ? "عرض أقل" : "Show less"}</> : <><ChevronDown size={14} /> {isAr ? `عرض الكل (${stadiumMatches.length})` : `Show all (${stadiumMatches.length})`}</>}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-bold mb-3">{isAr ? "ملاعب أخرى" : "Other Stadiums"}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STADIUMS.filter(s => s.officialName !== stadium.officialName).map(s => {
                const sSlug = s.officialName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
                return (
                  <Link key={sSlug} to={`/stadium/${sSlug}`} className="rounded-lg border p-3 hover:bg-muted/50 transition text-center">
                    <span className="text-xl">{s.countryFlag}</span>
                    <p className="text-xs font-semibold mt-1 line-clamp-1">{s.tournamentName}</p>
                    <p className="text-[10px] text-muted-foreground">{s.city}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {isAr ? "المصدر: stadiumdb.com" : "Source: stadiumdb.com"}
        </p>
      </div>
    </motion.div>
  );
};

export default StadiumDetailPage;
