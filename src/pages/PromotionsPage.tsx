import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Megaphone, Sparkles, MapPin, Play, Image as ImageIcon, Loader2, Calendar, Clock, Trophy, X, ArrowRight, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
}

interface LinkedMatch {
  id: string;
  title: string;
  title_ar: string | null;
  city: string;
  venue: string | null;
  start_date: string;
  metadata: any;
}

const PromotionsPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPromo, setExpandedPromo] = useState<string | null>(null);
  const [linkedMatches, setLinkedMatches] = useState<Record<string, LinkedMatch[]>>({});

  useEffect(() => {
    const fetchPromos = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (data) {
        setPromotions(data as any);
        // Fetch linked matches for World Cup and similar promotions
        for (const promo of data as any[]) {
          if (promo.title?.toLowerCase().includes("world cup") || promo.title?.includes("كأس العالم")) {
            fetchWorldCupMatches(promo.id);
          }
        }
      }
      setLoading(false);
    };
    fetchPromos();
  }, []);

  const fetchWorldCupMatches = async (promoId: string) => {
    const { data } = await supabase
      .from("global_events")
      .select("id, title, title_ar, city, venue, start_date, metadata")
      .eq("is_active", true)
      .ilike("title", "%World Cup 2026%")
      .order("start_date");
    if (data) {
      setLinkedMatches(prev => ({ ...prev, [promoId]: data as any }));
    }
  };

  const handlePlanTrip = (promo: Promotion) => {
    const allPlaces = (Array.isArray(promo.included_places) ? promo.included_places : []);
    const dest = promo.cta_destination || '';
    const title = isAr && promo.title_ar ? promo.title_ar : promo.title;

    const params = new URLSearchParams();
    if (dest) params.set('destination', dest);
    if (title) params.set('event', title);

    // Use structured type field from admin if available, fallback to regex parsing
    const extractedCities: string[] = [];
    const venueActivities: string[] = [];
    allPlaces.forEach((place: any) => {
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

    const venuesText = venueActivities.join(', ');
    let specialInstruction = '';
    if (venuesText) {
      specialInstruction = isAr
        ? `يجب أن تتضمن خطة الرحلة هذه الأماكن والأنشطة المحددة (هي ليست مدن بل معالم ومطاعم وأنشطة): ${venuesText}`
        : `You MUST include these specific places/activities in the trip itinerary (they are NOT cities, they are attractions, restaurants, or activities): ${venuesText}`;
    }

    const matches = linkedMatches[promo.id];
    if (matches && matches.length > 0) {
      params.set('startDate', matches[0].start_date);
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.start_date !== matches[0].start_date) {
        const start = new Date(matches[0].start_date);
        const end = new Date(lastMatch.start_date);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 0) params.set('duration', String(diffDays));
      }

      const matchSchedule = matches.slice(0, 20).map((m: LinkedMatch) => {
        const meta = m.metadata;
        const teams = meta?.team1 && meta?.team2 ? `${meta.team1} vs ${meta.team2}` : m.title;
        return `${teams} at ${m.venue || m.city} on ${m.start_date}${meta?.kickoff ? ' at ' + meta.kickoff : ''}`;
      }).join('; ');
      
      if (matchSchedule) {
        specialInstruction += (specialInstruction ? '\n' : '') + `Match schedule to include in plan: ${matchSchedule}`;
      }
      const matchCities = [...new Set(matches.map((m: LinkedMatch) => m.city).filter(Boolean))];
      if (matchCities.length > 1) params.set('multiCities', matchCities.join('|'));
    } else {
      const uniqueCities = [...new Set(extractedCities)];
      if (uniqueCities.length > 1) {
        params.set('multiCities', uniqueCities.join('|'));
      }
      if (promo.start_date) {
        params.set('startDate', promo.start_date);
        if (promo.end_date) {
          const start = new Date(promo.start_date);
          const end = new Date(promo.end_date);
          const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 0 && diffDays <= 30) params.set('duration', String(diffDays));
        }
      }
    }

    if (specialInstruction) params.set('specialPlaces', specialInstruction);
    navigate(`/planner?${params.toString()}`);
  };

  const handlePlanFromMatch = (match: LinkedMatch) => {
    const params = new URLSearchParams({
      destination: match.city,
      event: match.title,
      startDate: match.start_date,
    });
    const meta = match.metadata;
    if (meta?.kickoff) {
      params.set('specialPlaces', `Match: ${meta.team1 || ''} vs ${meta.team2 || ''} at ${match.venue || match.city} on ${match.start_date} at ${meta.kickoff}`);
    }
    navigate(`/planner?${params.toString()}`);
  };

  const isWorldCup = (promo: Promotion) =>
    promo.title?.toLowerCase().includes("world cup") || promo.title?.includes("كأس العالم");

  // Group matches by match_type
  const groupMatchesByType = (matches: LinkedMatch[]) => {
    const groups: Record<string, LinkedMatch[]> = {};
    matches.forEach(m => {
      const type = m.metadata?.match_type || "Other";
      if (!groups[type]) groups[type] = [];
      groups[type].push(m);
    });
    return groups;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-16 min-h-screen bg-background pb-16">
      <div className="py-10" style={{ background: 'var(--gradient-hero)' }}>
        <div className="section-container text-center max-w-2xl mx-auto">
          <Megaphone className="w-10 h-10 text-white mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-extrabold mb-4 text-white">
            {t('promotions.title')}
          </h1>
          <p className="text-lg text-white/80">
            {t('promotions.subtitle')}
          </p>
        </div>
      </div>

      <div className="section-container py-10">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : promotions.length === 0 ? (
          <div className="bg-card rounded-2xl p-10 text-center border border-border">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">{t('promotions.noPromotions')}</h3>
            <p className="text-muted-foreground">{t('promotions.checkBack')}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {promotions.map((promo) => {
              const title = isAr && promo.title_ar ? promo.title_ar : promo.title;
              const desc = isAr && promo.description_ar ? promo.description_ar : promo.description;
              const places = Array.isArray(promo.included_places) ? promo.included_places : [];
              const hasMedia = promo.media_urls && promo.media_urls.length > 0;
              const matches = linkedMatches[promo.id] || [];
              const isExpanded = expandedPromo === promo.id;
              const isWC = isWorldCup(promo);
              const matchGroups = groupMatchesByType(matches);

              return (
                <motion.div
                  key={promo.id}
                  layout
                  className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-lg transition-all"
                >
                  {/* Media section - supports images, videos, and mixed */}
                  {hasMedia && (
                    <div className="relative">
                      {/* Primary media */}
                      {promo.media_urls[0]?.match(/\.(mp4|webm|mov)/i) || promo.media_type === 'video' ? (
                        <video src={promo.media_urls[0]} className="w-full h-64 md:h-80 object-cover" controls
                          poster={promo.media_urls.find(u => !u.match(/\.(mp4|webm|mov)/i))} />
                      ) : (
                        <div className="relative h-64 md:h-80 overflow-hidden">
                          <img src={promo.media_urls[0]} alt={title} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                      )}
                      {/* Thumbnail strip for additional media */}
                      {promo.media_urls.length > 1 && (
                        <div className="absolute bottom-3 ltr:right-3 rtl:left-3 flex gap-1.5">
                          {promo.media_urls.slice(1, 5).map((url, i) => {
                            const isVideo = url.match(/\.(mp4|webm|mov)/i);
                            return isVideo ? (
                              <div key={i} className="w-14 h-14 rounded-lg bg-black/60 flex items-center justify-center border-2 border-white/50 cursor-pointer">
                                <Play size={16} className="text-white" />
                              </div>
                            ) : (
                              <img key={i} src={url} className="w-14 h-14 rounded-lg object-cover border-2 border-white/50" alt="" />
                            );
                          })}
                          {promo.media_urls.length > 5 && (
                            <div className="w-14 h-14 rounded-lg bg-black/50 flex items-center justify-center text-white text-xs font-bold border-2 border-white/50">
                              +{promo.media_urls.length - 5}
                            </div>
                          )}
                        </div>
                      )}
                      <Badge className="absolute top-3 ltr:left-3 rtl:right-3 bg-primary/90 text-primary-foreground gap-1">
                        {promo.media_type === 'video' ? <Play size={14} /> : <ImageIcon size={14} />}
                        {promo.media_urls.length > 1
                          ? `${promo.media_urls.length} ${t('promotions.media')}`
                          : t('promotions.featured')
                        }
                      </Badge>
                    </div>
                  )}

                  {/* Content */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
                        {promo.start_date && (
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar size={14} />
                            {format(new Date(promo.start_date), "dd MMM yyyy")}
                            {promo.end_date && ` — ${format(new Date(promo.end_date), "dd MMM yyyy")}`}
                          </p>
                        )}
                      </div>
                      {isWC && <Trophy className="w-6 h-6 text-yellow-500 shrink-0" />}
                    </div>
                    
                    <p className="text-muted-foreground leading-relaxed">{desc}</p>

                    {/* Included places */}
                    {places.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          {t('promotions.includedPlaces')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {places.map((place: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs gap-1">
                              <MapPin size={10} /> {typeof place === 'string' ? place : place.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Match schedule moved to detail page only */}

                    {/* CTA */}
                    <div className="flex gap-3 pt-2 flex-wrap">
                      <Button className="gap-2" onClick={() => navigate(`/promotions/${promo.id}`)}>
                        <ExternalLink size={16} /> {t('promotions.viewDetails')}
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={() => handlePlanTrip(promo)}>
                        <Sparkles size={16} /> {t('promotions.planFromPromo')}
                      </Button>
                      {isWC && (
                        <Button
                          className="gap-2 bg-gradient-to-r from-primary via-primary to-primary/80 hover:shadow-lg hover:shadow-primary/30 text-primary-foreground font-semibold transition-all hover:-translate-y-0.5"
                          onClick={() => navigate(`/promotions/${promo.id}#schedule`)}
                        >
                          <Trophy size={16} className="drop-shadow-sm" />
                          {t('promotions.viewAllMatches')}
                          <span className="opacity-80">·</span>
                          <Sparkles size={14} />
                          {t('promotions.planToAttend')}
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default PromotionsPage;
