import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, Star, Clock, DollarSign, Phone, Globe, ExternalLink, Navigation, 
  ChevronLeft, ArrowRight, Calendar, Image as ImageIcon, X, ChevronRight,
  ThumbsUp, Users, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getPrecisePlaceData } from "@/utils/placeResolution";

// Localized name reconstruction for legacy/cached itineraries.
// Mirrors the logic in ItinerarySchedule so meal labels render in the active UI language
// (e.g. "Abendessen bei Guadalajara" instead of "عشاء في Guadalajara").
const getLocalizedPlaceName = (place: any, lang: string): string => {
  const raw = String(place?.title || place?.name || '').trim();
  if (!raw) return raw;
  const code = (lang || 'en').slice(0, 2).toLowerCase();
  if (code === 'ar') return raw;
  const hasArabic = /[\u0600-\u06FF]/.test(raw);
  if (!hasArabic) return raw;
  const cat = String(place?.type || place?.category || '').toLowerCase();
  const isMeal = ['breakfast', 'lunch', 'dinner', 'snack', 'food', 'restaurant', 'cafe'].includes(cat);
  const parts = raw.split(/\s+في\s+/);
  let placeName = parts.length > 1 ? parts.slice(1).join(' في ').trim() : raw;
  placeName = placeName.replace(/[\u0600-\u06FF]+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!placeName) placeName = String(place?.address || place?.location || '').replace(/[\u0600-\u06FF]+/g, '').trim();
  if (!placeName) return raw;
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
    return `${prefix} ${placeName}`;
  }
  return placeName;
};

const stripArabic = (value?: string | null): string =>
  String(value || '').replace(/[\u0600-\u06FF]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

const PlaceDetailsPage = () => {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const isArabicUI = lang.toLowerCase().startsWith('ar');
  const [place, setPlace] = useState<any>(null);
  const [photos, setPhotos] = useState<{ thumbnail: string; image: string }[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [placeDetails, setPlaceDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Load place from localStorage
  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('itinerary-'));
    for (const key of keys) {
      try {
        const itinerary = JSON.parse(localStorage.getItem(key) || '');
        for (const day of itinerary.days || []) {
          for (const act of day.activities || []) {
            if (act.id === placeId) {
              setPlace({ ...act, itineraryId: key.replace('itinerary-', ''), destination: itinerary.destination });
              return;
            }
          }
        }
      } catch {}
    }
  }, [placeId]);

  // Fetch real photos & details from SerpAPI
  useEffect(() => {
    if (!place) return;

    const resolvedPlace = getPrecisePlaceData(place);
    const detailsQuery = resolvedPlace.mapQuery || `${place.title || place.name} ${place.destination || ''}`.trim();

    const fetchPhotos = async () => {
      setLoadingPhotos(true);
      try {
        const { data, error } = await supabase.functions.invoke('serpapi-photos', {
          body: {
            query: detailsQuery,
            latitude: place.latitude,
            longitude: place.longitude,
          },
        });
        if (!error && data?.success && data.photos?.length > 0) {
          setPhotos(data.photos);
        }
      } catch (e) {
        console.error("Failed to fetch photos:", e);
      } finally {
        setLoadingPhotos(false);
      }
    };

    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const { data, error } = await supabase.functions.invoke('serpapi-places', {
          body: {
            query: detailsQuery,
            latitude: place.latitude,
            longitude: place.longitude,
            type: 'place_details',
          },
        });
        if (!error && data?.success && data.results?.length > 0) {
          setPlaceDetails(data.results[0]);
        }
      } catch (e) {
        console.error("Failed to fetch details:", e);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchPhotos();
    fetchDetails();
  }, [place]);

  if (!place) {
    return (
      <div className="pt-20 min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <MapPin className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">المكان غير موجود</h1>
        <p className="text-muted-foreground mb-6 text-center">لم يتم العثور على تفاصيل هذا المكان</p>
        <Button onClick={() => navigate(-1)}>العودة</Button>
      </div>
    );
  }

  const getCategoryInfo = (cat: string) => {
    const map: Record<string, { emoji: string; label: string; color: string }> = {
      attraction: { emoji: "🏛️", label: "معلم سياحي", color: "bg-blue-500/10 text-blue-600" },
      food: { emoji: "🍽️", label: "مطعم", color: "bg-orange-500/10 text-orange-600" },
      activity: { emoji: "🎯", label: "نشاط", color: "bg-green-500/10 text-green-600" },
      entertainment: { emoji: "🎭", label: "ترفيه", color: "bg-purple-500/10 text-purple-600" },
      shopping: { emoji: "🛍️", label: "تسوق", color: "bg-pink-500/10 text-pink-600" },
      cultural: { emoji: "🎨", label: "ثقافي", color: "bg-amber-500/10 text-amber-600" },
      nature: { emoji: "🌿", label: "طبيعة", color: "bg-emerald-500/10 text-emerald-600" },
    };
    return map[cat?.toLowerCase()] || map.attraction;
  };

  const catInfo = getCategoryInfo(place.type || place.category);
  const resolvedPlace = getPrecisePlaceData({ ...place, ...placeDetails });
  const mapUrl = resolvedPlace.mapUrl;

  const mergedRating = placeDetails?.rating || place.rating;
  const mergedPhone = placeDetails?.phone || place.phone;
  const mergedWebsite = placeDetails?.website || place.website;
  const mergedAddress = resolvedPlace.addressLabel || placeDetails?.address || place.address || place.location;
  const localizedName = getLocalizedPlaceName(place, lang);
  const rawDescription = placeDetails?.description || place.serpDescription || place.description;
  const mergedDescription = !isArabicUI && rawDescription && /[\u0600-\u06FF]/.test(String(rawDescription))
    ? (stripArabic(rawDescription) || localizedName)
    : rawDescription;
  const reviewsCount = placeDetails?.reviews_count || place.reviewsCount;
  const placeType = placeDetails?.type || place.placeType || catInfo.label;
  const hours = placeDetails?.hours;

  // Hero image - prefer real photos
  const heroImage = photos.length > 0 ? photos[0].image : (place.imageUrl || null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background">
      {/* Hero with real photo */}
      <div className="relative h-72 sm:h-96 overflow-hidden bg-muted">
        {heroImage ? (
          <img src={heroImage} alt={localizedName} 
            className="w-full h-full object-cover" 
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--gradient-hero, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))))' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} 
            className="text-white/80 hover:text-white hover:bg-white/10 absolute top-4 left-4 gap-1">
            <ChevronLeft size={16} /> العودة
          </Button>

          {/* Photo count badge */}
          {photos.length > 0 && (
            <button onClick={() => setSelectedPhoto(0)}
              className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm hover:bg-black/70 transition-colors">
              <ImageIcon size={14} />
              <span>{photos.length} صورة</span>
            </button>
          )}

          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge variant="outline" className="bg-white/15 text-white border-white/20 backdrop-blur-sm">
                {catInfo.emoji} {catInfo.label}
              </Badge>
              {placeType !== catInfo.label && (
                <Badge variant="outline" className="bg-white/15 text-white border-white/20 backdrop-blur-sm">
                  {placeType}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-2">{localizedName}</h1>
            <div className="flex items-center gap-3 text-white/80 text-sm flex-wrap">
              <span className="flex items-center gap-1"><MapPin size={14} /> {mergedAddress}</span>
              {mergedRating && (
                <span className="flex items-center gap-1 bg-yellow-500/90 text-white px-2.5 py-0.5 rounded-full font-semibold">
                  <Star size={12} className="fill-white" /> {mergedRating}
                  {reviewsCount && <span className="font-normal opacity-80 ml-1">({reviewsCount})</span>}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Photo Gallery Strip */}
      {photos.length > 1 && (
        <div className="bg-card border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {photos.map((photo, idx) => (
                <button key={idx} onClick={() => setSelectedPhoto(idx)}
                  className="shrink-0 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors">
                  <img src={photo.thumbnail} alt={`صورة ${idx + 1}`} 
                    className="h-16 w-24 sm:h-20 sm:w-32 object-cover" 
                    onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Loading photos skeleton */}
      {loadingPhotos && photos.length === 0 && (
        <div className="bg-card border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex gap-2">
              {[1,2,3,4,5].map(i => (
                <Skeleton key={i} className="h-20 w-32 rounded-lg shrink-0" />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 pb-20">
        <div className="grid lg:grid-cols-[1fr_340px] gap-6">
          {/* Main content */}
          <div className="space-y-6">
            {/* Description */}
            <Card className="p-6">
              <h2 className="text-lg font-bold text-foreground mb-3">عن المكان</h2>
              <p className="text-muted-foreground leading-relaxed">{mergedDescription}</p>
            </Card>

            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {(place.startTime || place.time) && (
                <Card className="p-4 text-center">
                  <Calendar size={20} className="text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">وقت الزيارة</p>
                  <p className="text-sm font-semibold text-foreground">{place.startTime || place.time}</p>
                </Card>
              )}
              {place.cost !== undefined && (
                <Card className="p-4 text-center">
                  <DollarSign size={20} className="text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">التكلفة</p>
                  <p className="text-sm font-semibold text-foreground">{place.cost === 0 ? "مجاني" : `$${place.cost}`}</p>
                </Card>
              )}
              {mergedRating && (
                <Card className="p-4 text-center">
                  <Star size={20} className="text-yellow-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">التقييم</p>
                  <p className="text-sm font-semibold text-foreground">{mergedRating} / 5</p>
                  {reviewsCount && <p className="text-xs text-muted-foreground">{reviewsCount} تقييم</p>}
                </Card>
              )}
              {place.duration && (
                <Card className="p-4 text-center">
                  <Clock size={20} className="text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">المدة المقترحة</p>
                  <p className="text-sm font-semibold text-foreground">{place.duration}</p>
                </Card>
              )}
            </div>

            {/* Opening Hours from SerpAPI - normalize string | object | array shapes */}
            {(() => {
              const dayAr: Record<string, string> = {
                monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء',
                thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت', sunday: 'الأحد',
              };
              // Normalize: array of {day:value}, plain object, or string -> array of [day, time] pairs
              const entries: Array<[string, string]> = [];
              if (Array.isArray(hours)) {
                for (const item of hours) {
                  if (!item || typeof item !== 'object') continue;
                  for (const [k, v] of Object.entries(item)) {
                    if (v == null) continue;
                    if (typeof v === 'string' || typeof v === 'number') entries.push([k, String(v)]);
                  }
                }
              } else if (hours && typeof hours === 'object') {
                for (const [k, v] of Object.entries(hours)) {
                  if (v == null) continue;
                  if (typeof v === 'string' || typeof v === 'number') entries.push([k, String(v)]);
                }
              }
              if (entries.length === 0) return null;
              return (
                <Card className="p-6">
                  <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                    <Clock size={18} className="text-primary" /> ساعات العمل
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {entries.map(([day, time], idx) => (
                      <div key={`${day}-${idx}`} className="flex justify-between items-center py-1.5 px-3 rounded-lg bg-muted/50">
                        <span className="text-sm font-medium text-foreground">{dayAr[day.toLowerCase()] || day}</span>
                        <span className="text-sm text-muted-foreground">{time}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })()}

            {/* Map embed */}
            {place.latitude && place.longitude && (
              <Card className="overflow-hidden">
                <div className="p-4 border-b flex items-center justify-between">
                  <h2 className="font-bold text-foreground flex items-center gap-2">
                    <MapPin size={16} className="text-primary" /> الموقع على الخريطة
                  </h2>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(mapUrl, '_blank')}>
                    <Navigation size={14} /> فتح في Google Maps
                  </Button>
                </div>
                <iframe
                  title="Location Map"
                  width="100%"
                  height="300"
                  style={{ border: 0 }}
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${place.longitude-0.008},${place.latitude-0.008},${place.longitude+0.008},${place.latitude+0.008}&layer=mapnik&marker=${place.latitude},${place.longitude}`}
                />
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="font-bold text-foreground mb-4">إجراءات سريعة</h3>
              <div className="space-y-3">
                <Button className="w-full gap-2" onClick={() => window.open(mapUrl, "_blank")}>
                  <Navigation size={16} /> انتقل إلى الموقع
                </Button>
                {mergedWebsite && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => window.open(mergedWebsite, "_blank")}>
                    <Globe size={16} /> الموقع الإلكتروني
                  </Button>
                )}
                {mergedPhone && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => window.open(`tel:${mergedPhone}`)}>
                    <Phone size={16} /> {mergedPhone}
                  </Button>
                )}
              </div>
            </Card>

            {/* Place info card */}
            <Card className="p-5 space-y-3">
              <h3 className="font-bold text-foreground">معلومات المكان</h3>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin size={14} className="text-primary mt-0.5 shrink-0" />
                  <span>{mergedAddress}</span>
                </div>
                {mergedPhone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone size={14} className="text-primary shrink-0" />
                    <span>{mergedPhone}</span>
                  </div>
                )}
                {mergedWebsite && (
                  <a href={mergedWebsite} target="_blank" rel="noopener noreferrer" 
                    className="flex items-center gap-2 text-primary hover:underline">
                    <Globe size={14} className="shrink-0" />
                    <span className="truncate">{new URL(mergedWebsite).hostname}</span>
                    <ExternalLink size={12} />
                  </a>
                )}
                {placeDetails?.price_level && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={14} className="text-primary shrink-0" />
                    <span>مستوى الأسعار: {placeDetails.price_level}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Loading details indicator */}
            {loadingDetails && !placeDetails && (
              <Card className="p-5 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">جاري تحميل التفاصيل...</span>
              </Card>
            )}

            {place.itineraryId && (
              <Button variant="outline" className="w-full gap-2" onClick={() => navigate(`/itinerary/${place.itineraryId}`)}>
                <ArrowRight size={16} /> العودة للخطة
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Viewer */}
      <AnimatePresence>
        {selectedPhoto !== null && photos.length > 0 && (
          <motion.div 
            key="photo-viewer-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setSelectedPhoto(null)}
          >
            <Button variant="ghost" size="sm" 
              className="absolute top-4 right-4 text-white hover:bg-white/10 z-10"
              onClick={() => setSelectedPhoto(null)}>
              <X size={24} />
            </Button>

            {/* Navigation */}
            {selectedPhoto > 0 && (
              <Button variant="ghost" size="sm"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 z-10"
                onClick={(e) => { e.stopPropagation(); setSelectedPhoto(selectedPhoto - 1); }}>
                <ChevronLeft size={32} />
              </Button>
            )}
            {selectedPhoto < photos.length - 1 && (
              <Button variant="ghost" size="sm"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 z-10"
                onClick={(e) => { e.stopPropagation(); setSelectedPhoto(selectedPhoto + 1); }}>
                <ChevronRight size={32} />
              </Button>
            )}

            <motion.img
              key={selectedPhoto}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={photos[selectedPhoto].image}
              alt={`صورة ${selectedPhoto + 1}`}
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">
              {selectedPhoto + 1} / {photos.length}
            </div>

            {/* Thumbnails */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 max-w-[80vw] overflow-x-auto pb-1 scrollbar-none">
              {photos.map((p, idx) => (
                <button key={idx} onClick={(e) => { e.stopPropagation(); setSelectedPhoto(idx); }}
                  className={cn(
                    "shrink-0 rounded-md overflow-hidden border-2 transition-all",
                    idx === selectedPhoto ? "border-white scale-110" : "border-transparent opacity-60 hover:opacity-100"
                  )}>
                  <img src={p.thumbnail} alt="" className="h-12 w-16 object-cover" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PlaceDetailsPage;
