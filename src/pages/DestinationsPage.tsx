import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, CalendarDays, Star, Loader2, Sparkles, Filter, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface DBDestination {
  id: string;
  city: string;
  country: string;
  image: string;
  description: string;
  description_ar: string | null;
  rating: number;
  best_season: string;
  highlights: any;
}

const CONTINENT_MAP: Record<string, string[]> = {
  asia: ['Japan', 'Thailand', 'Malaysia', 'Singapore', 'South Korea', 'Vietnam', 'Indonesia', 'Qatar', 'UAE', 'Oman', 'Jordan', 'Lebanon', 'Saudi Arabia', 'Bahrain', 'Turkey'],
  europe: ['France', 'UK', 'Italy', 'Spain', 'Netherlands', 'Greece', 'Iceland', 'Switzerland', 'Czech Republic', 'Austria', 'Ireland', 'Denmark', 'Portugal', 'Russia', 'Tunisia', 'Germany'],
  northAmerica: ['USA', 'Canada', 'Mexico', 'Cuba'],
  southAmerica: ['Brazil', 'Argentina', 'Peru', 'Colombia', 'Chile'],
  africa: ['Morocco', 'Egypt', 'Kenya', 'South Africa', 'Tunisia'],
  oceania: ['Australia', 'New Zealand'],
};

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn', 'Year-round'];

function getContinent(country: string): string {
  for (const [continent, countries] of Object.entries(CONTINENT_MAP)) {
    if (countries.includes(country)) return continent;
  }
  return 'other';
}

const DestinationsPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [searchQuery, setSearchQuery] = useState("");
  const [destinations, setDestinations] = useState<DBDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContinent, setSelectedContinent] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchDest = async () => {
      setLoading(true);
      const { data } = await supabase.from("destinations").select("*").eq("is_active", true).order("sort_order");
      if (data) setDestinations(data.map((d: any) => ({ ...d, highlights: Array.isArray(d.highlights) ? d.highlights : [] })));
      setLoading(false);
    };
    fetchDest();
  }, []);

  const countries = useMemo(() => {
    let list = destinations.map(d => d.country);
    if (selectedContinent) {
      const continentCountries = CONTINENT_MAP[selectedContinent] || [];
      list = list.filter(c => continentCountries.includes(c));
    }
    return [...new Set(list)].sort();
  }, [destinations, selectedContinent]);

  const filtered = useMemo(() => {
    return destinations.filter(d => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || d.city.toLowerCase().includes(q) || (d.description_ar || '').includes(searchQuery) || d.country.toLowerCase().includes(q);
      const matchContinent = !selectedContinent || (CONTINENT_MAP[selectedContinent] || []).includes(d.country);
      const matchCountry = !selectedCountry || d.country === selectedCountry;
      const matchSeason = !selectedSeason || d.best_season === selectedSeason;
      return matchSearch && matchContinent && matchCountry && matchSeason;
    });
  }, [destinations, searchQuery, selectedContinent, selectedCountry, selectedSeason]);

  const hasActiveFilters = selectedContinent || selectedCountry || selectedSeason;

  const clearFilters = () => {
    setSelectedContinent(null);
    setSelectedCountry(null);
    setSelectedSeason(null);
    setSearchQuery("");
  };

  const continentKeys = ['asia', 'europe', 'northAmerica', 'southAmerica', 'africa', 'oceania'] as const;

  const seasonKey = (s: string) => `destinations.season${s}` as const;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-16 min-h-screen bg-background pb-16">
      {/* Hero */}
      <div className="py-10" style={{ background: 'var(--gradient-hero)' }}>
        <div className="section-container text-center max-w-2xl mx-auto mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold mb-4 text-white">{t('destinations.exploreTitle')}</h1>
          <p className="text-lg text-white/80">{t('destinations.exploreDesc')}</p>
        </div>

        <div className="section-container max-w-3xl mx-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
            <div className="relative">
              <Search className="absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-white/50" size={18} />
              <Input
                placeholder={t('destinations.searchPlaceholder')}
                className="ltr:pl-10 rtl:pr-10 bg-white/10 text-white border-white/20 placeholder:text-white/40 focus:bg-white/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                dir="auto"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="section-container py-6">
        {/* Filter toggle + count */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {t('destinations.destinationCount', { count: filtered.length })}
          </p>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" className="text-xs gap-1 h-7" onClick={clearFilters}>
                <X size={12} /> {t('destinations.clearFilters')}
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-xs gap-1 h-8" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={14} /> {showFilters ? t('destinations.hideFilters') : t('destinations.showFilters')}
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-card border border-border rounded-xl p-4 mb-6 space-y-4">
            {/* Continent */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{t('destinations.filterContinent')}</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={!selectedContinent ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => { setSelectedContinent(null); setSelectedCountry(null); }}
                >
                  {t('destinations.all')}
                </Badge>
                {continentKeys.map(c => (
                  <Badge
                    key={c}
                    variant={selectedContinent === c ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => { setSelectedContinent(selectedContinent === c ? null : c); setSelectedCountry(null); }}
                  >
                    {t(`destinations.continent_${c}`)}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Country */}
            {countries.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{t('destinations.filterCountry')}</p>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                  <Badge
                    variant={!selectedCountry ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedCountry(null)}
                  >
                    {t('destinations.all')}
                  </Badge>
                  {countries.map(c => (
                    <Badge
                      key={c}
                      variant={selectedCountry === c ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setSelectedCountry(selectedCountry === c ? null : c)}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Season */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">{t('destinations.filterSeason')}</p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={!selectedSeason ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setSelectedSeason(null)}
                >
                  {t('destinations.all')}
                </Badge>
                {SEASONS.map(s => (
                  <Badge
                    key={s}
                    variant={selectedSeason === s ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedSeason(selectedSeason === s ? null : s)}
                  >
                    {t(`destinations.season_${s.toLowerCase().replace('-', '')}`, { defaultValue: s })}
                  </Badge>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-2xl p-10 text-center border border-border">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2 text-foreground">{t('destinations.noDestinations')}</h3>
            <p className="text-muted-foreground mb-4">{t('destinations.tryAdjusting')}</p>
            <Button onClick={clearFilters}>{t('destinations.clearFilters')}</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((d) => (
              <motion.div key={d.id} whileHover={{ y: -4 }} className="bg-card rounded-2xl overflow-hidden border border-border shadow-sm hover:shadow-md transition-all group">
                <div className="relative h-48 overflow-hidden">
                  <img src={d.image} alt={d.city} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  {d.rating > 0 && (
                    <div className="absolute top-3 ltr:right-3 rtl:left-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <Star size={10} className="fill-yellow-400 text-yellow-400" /> {d.rating}
                    </div>
                  )}
                  {d.best_season && (
                    <Badge className="absolute top-3 ltr:left-3 rtl:right-3 bg-white/20 backdrop-blur-sm text-white text-[10px] border-0">
                      {t('destinations.bestTime')}: {t(`destinations.season_${d.best_season.toLowerCase().replace('-', '')}`, { defaultValue: d.best_season })}
                    </Badge>
                  )}
                  <div className="absolute bottom-3 ltr:left-4 rtl:right-4 text-white">
                    <div className="flex items-center gap-1 text-sm"><MapPin size={12} />{d.country}</div>
                    <h3 className="text-xl font-bold">{d.city}</h3>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-muted-foreground text-sm line-clamp-2">{isAr && d.description_ar ? d.description_ar : d.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(d.highlights) ? d.highlights : []).slice(0, 3).map((h: string) => (
                      <Badge key={h} variant="secondary" className="text-[10px]">{h}</Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 text-xs gap-1" onClick={() => navigate(`/planner?destination=${encodeURIComponent(`${d.city}, ${d.country}`)}`)}>
                      <Sparkles size={12} /> {t('destinations.planTrip')}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => navigate(`/bookings?to=${encodeURIComponent(d.city)}&tab=flights`)}>
                      <CalendarDays size={12} /> {t('destinations.bookNow')}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DestinationsPage;
