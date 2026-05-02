import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Plane, MapPin, Calendar as CalendarIcon, Trash2, Loader2, Plus, Clock, BookOpen, ArrowDownUp, LayoutGrid, CalendarDays, Filter } from "lucide-react";
import { formatLatnDateTime, formatLatnNumber } from "@/utils/numberFormat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TravelCalendar, { type CalendarItem } from "@/components/TravelCalendar";

interface TripItem {
  id: string;
  tripId: string;
  destination: string;
  origin?: string;
  startDate?: string;
  duration?: number;
  source: 'local' | 'cloud';
  createdAt: string;
  searchedAt: string; // when the user last searched/generated this trip
  data: any;
}

type SortKey = 'recent' | 'tripDate' | 'durationDesc';
type TimeFilter = 'all' | 'upcoming' | 'active' | 'past';

const MyTripsPage = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language?.startsWith('ar');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [originFilter, setOriginFilter] = useState<string>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');

  useEffect(() => {
    loadTrips();
  }, [user]);

  const loadTrips = async () => {
    setLoading(true);
    const allTrips: TripItem[] = [];

    // Load from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('itinerary-')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          const tripId = key.replace('itinerary-', '');
          allTrips.push({
            id: key,
            tripId,
            destination: data.destination || t('common.noResults'),
            origin: data.origin || data.originCity || data.from || data.startCity,
            startDate: data.startDate,
            duration: data.duration,
            source: 'local',
            createdAt: data.generatedAt || data.createdAt || data.startDate || new Date(0).toISOString(),
            searchedAt: data.generatedAt || data.createdAt || data.startDate || new Date(0).toISOString(),
            data,
          });

        } catch { /* skip invalid */ }
      }
    }

    // Load from database if logged in
    if (user) {
      const { data: cloudTrips } = await supabase
        .from('saved_trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (cloudTrips) {
        cloudTrips.forEach((ct: any) => {
          if (!allTrips.find(t => t.tripId === ct.trip_id)) {
            allTrips.push({
              id: ct.id,
              tripId: ct.trip_id,
              destination: ct.destination,
              origin: (ct.trip_data as any)?.origin || (ct.trip_data as any)?.originCity || (ct.trip_data as any)?.from || (ct.trip_data as any)?.startCity,
              startDate: (ct.trip_data as any)?.startDate,
              duration: (ct.trip_data as any)?.duration,
              source: 'cloud',
              createdAt: ct.created_at,
              searchedAt: (ct.trip_data as any)?.generatedAt || ct.created_at,
              data: ct.trip_data,
            });

          }
        });
      }
    }

    // Default: most recently searched/generated first
    allTrips.sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime());
    setTrips(allTrips);

    // Load memories + stories (for calendar enrichment)
    if (user) {
      const [memRes, storyRes] = await Promise.all([
        supabase.from('memories').select('id, title, description, activity_name, location_name, media_urls, video_url, created_at, trip_id').eq('user_id', user.id),
        supabase.from('travel_stories').select('id, title, content, location_name, media_urls, created_at').eq('user_id', user.id),
      ]);
      setMemories(memRes.data || []);
      setStories(storyRes.data || []);
    }

    setLoading(false);
  };

  const uniqueOrigins = useMemo(() => {
    const set = new Set<string>();
    trips.forEach(t => { if (t.origin) set.add(String(t.origin).trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const uniqueDestinations = useMemo(() => {
    const set = new Set<string>();
    trips.forEach(t => { if (t.destination) set.add(String(t.destination).trim()); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const sortedTrips = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let arr = [...trips];

    // Time filter (Upcoming / Active / Past)
    if (timeFilter !== 'all') {
      arr = arr.filter(t => {
        if (!t.startDate) return timeFilter === 'upcoming';
        const start = new Date(t.startDate); start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + Math.max(1, t.duration || 1) - 1);
        if (timeFilter === 'upcoming') return start.getTime() > today.getTime();
        if (timeFilter === 'active') return start.getTime() <= today.getTime() && end.getTime() >= today.getTime();
        if (timeFilter === 'past') return end.getTime() < today.getTime();
        return true;
      });
    }

    // Origin / Destination filters
    if (originFilter !== 'all') {
      arr = arr.filter(t => (t.origin || '').trim() === originFilter);
    }
    if (destinationFilter !== 'all') {
      arr = arr.filter(t => (t.destination || '').trim() === destinationFilter);
    }

    if (sortKey === 'recent') {
      arr.sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime());
    } else if (sortKey === 'tripDate') {
      arr.sort((a, b) => {
        const ad = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bd = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
        return ad - bd;
      });
    } else if (sortKey === 'durationDesc') {
      arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    }
    return arr;
  }, [trips, sortKey, timeFilter, originFilter, destinationFilter]);

  // Build unified calendar items (trips + memories + stories)
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    trips.forEach(trip => {
      if (!trip.startDate) return;
      const start = new Date(trip.startDate);
      if (isNaN(start.getTime())) return;
      const end = new Date(start);
      end.setDate(start.getDate() + Math.max(1, trip.duration || 1) - 1);
      let kind: CalendarItem['kind'] = 'trip-upcoming';
      if (today.getTime() > end.getTime()) kind = 'trip-past';
      else if (today.getTime() >= start.getTime()) kind = 'trip-active';
      items.push({
        id: `trip-${trip.id}`,
        refId: trip.tripId,
        kind,
        title: trip.destination,
        destination: trip.destination,
        startDate: trip.startDate,
        durationDays: trip.duration,
        thumbnail: (trip.data as any)?.coverImage || (trip.data as any)?.heroImage,
        previewDescription: (trip.data as any)?.tips?.[0] || (trip.data as any)?.specialRequests,
        onOpen: () => openTrip(trip),
      });
    });

    memories.forEach((m: any) => {
      if (!m.created_at) return;
      items.push({
        id: `memory-${m.id}`,
        refId: m.id,
        kind: 'memory',
        title: m.title || (isAr ? 'ذكرى' : 'Memory'),
        destination: m.location_name,
        startDate: m.created_at,
        thumbnail: Array.isArray(m.media_urls) && m.media_urls.length > 0 ? m.media_urls[0] : undefined,
        previewMedia: Array.isArray(m.media_urls) ? m.media_urls : undefined,
        previewDescription: m.description || m.activity_name,
        onOpen: () => navigate('/memories'),
      });
    });

    stories.forEach((s: any) => {
      if (!s.created_at) return;
      items.push({
        id: `story-${s.id}`,
        refId: s.id,
        kind: 'story',
        title: s.title || (isAr ? 'قصة' : 'Story'),
        destination: s.location_name,
        startDate: s.created_at,
        thumbnail: Array.isArray(s.media_urls) && s.media_urls.length > 0 ? s.media_urls[0] : undefined,
        previewMedia: Array.isArray(s.media_urls) ? s.media_urls : undefined,
        previewDescription: s.content,
        onOpen: () => navigate('/stories'),
      });
    });

    return items;
  }, [trips, memories, stories, isAr, navigate]);

  const deleteTrip = async (trip: TripItem) => {
    if (trip.source === 'local') {
      localStorage.removeItem(trip.id);
    } else if (user) {
      await supabase.from('saved_trips').delete().eq('id', trip.id);
    }
    setTrips(prev => prev.filter(t => t.id !== trip.id));
    toast.success(t('profile.tripDeleted'));
  };

  const openTrip = (trip: TripItem) => {
    if (trip.source === 'cloud' && trip.data) {
      localStorage.setItem(`itinerary-${trip.tripId}`, JSON.stringify(trip.data));
    }
    navigate(`/itinerary/${trip.tripId}`);
  };

  const renderTripCard = (trip: TripItem, index: number) => (
    <motion.div
      key={trip.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card
        className="p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all border-border hover:border-primary/30"
        onClick={() => openTrip(trip)}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-foreground truncate">{trip.destination}</h3>
            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground mt-0.5 flex-wrap">
              {trip.startDate && (
                <span className="flex items-center gap-1">
                  <CalendarIcon size={11} />
                  {formatLatnDateTime(trip.startDate, i18n.language, { year: 'numeric', month: 'numeric', day: 'numeric' })}
                </span>
              )}
              {trip.duration && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatLatnNumber(trip.duration, i18n.language)} {t('travel.days')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2 sm:hidden">
              <Badge variant={trip.source === 'cloud' ? 'default' : 'secondary'} className="text-[9px]">
                {trip.source === 'cloud' ? t('myTrips.saved', { defaultValue: 'Saved' }) : t('myTrips.local', { defaultValue: 'Local' })}
              </Badge>
              <Button
                variant="default"
                size="sm"
                className="h-7 gap-1 text-[10px] bg-accent hover:bg-accent/90 text-accent-foreground px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  const tripIdForStory = trip.source === 'local' ? `local-${trip.tripId}` : trip.id;
                  if (trip.source === 'cloud' && trip.data) {
                    localStorage.setItem(`itinerary-${trip.tripId}`, JSON.stringify(trip.data));
                  }
                  navigate('/stories', { state: { openCreateForm: true, linkedTripId: tripIdForStory } });
                }}
              >
                <BookOpen size={10} />
                {isAr ? 'قصة' : 'Story'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); deleteTrip(trip); }}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Badge variant={trip.source === 'cloud' ? 'default' : 'secondary'} className="text-[10px]">
              {trip.source === 'cloud' ? t('myTrips.saved', { defaultValue: 'Saved' }) : t('myTrips.local', { defaultValue: 'Local' })}
            </Badge>
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs bg-accent hover:bg-accent/90 text-accent-foreground"
              onClick={(e) => {
                e.stopPropagation();
                const tripIdForStory = trip.source === 'local' ? `local-${trip.tripId}` : trip.id;
                if (trip.source === 'cloud' && trip.data) {
                  localStorage.setItem(`itinerary-${trip.tripId}`, JSON.stringify(trip.data));
                }
                navigate('/stories', { state: { openCreateForm: true, linkedTripId: tripIdForStory } });
              }}
            >
              <BookOpen size={12} />
              {isAr ? 'نشر قصة' : 'Story'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); deleteTrip(trip); }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-10 px-3 sm:px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold gradient-text">
                {t('myTrips.title', { defaultValue: 'My Trips' })}
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                {t('myTrips.subtitle', { defaultValue: 'All your generated trip plans' })}
              </p>
            </div>
            <Button onClick={() => navigate('/')} size="sm" className="gap-1.5 shrink-0 text-xs sm:text-sm">
              <Plus size={14} />
              <span className="hidden sm:inline">{t('myTrips.newTrip', { defaultValue: 'New Trip' })}</span>
              <span className="sm:hidden">{isAr ? 'جديد' : 'New'}</span>
            </Button>
          </div>

          {!user ? (
            <Card className="p-8 sm:p-12 text-center">
              <Plane className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                {isAr ? 'يجب تسجيل الدخول لمشاهدة الخطط المحفوظة' : 'Please sign in to view saved trips'}
              </h3>
              <Button onClick={() => navigate('/auth')} className="mt-4">
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </Button>
            </Card>
          ) : trips.length === 0 ? (
            <Card className="p-8 sm:p-12 text-center">
              <Plane className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                {t('profile.noTrips')}
              </h3>
              <Button onClick={() => navigate('/')} className="mt-4">
                {t('profile.planTrip')}
              </Button>
            </Card>
          ) : (
            <Tabs defaultValue="list" className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                  <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
                    <LayoutGrid size={14} />
                    {isAr ? 'قائمة' : 'List'}
                  </TabsTrigger>
                  <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm">
                    <CalendarDays size={14} />
                    {isAr ? 'تقويم' : 'Calendar'}
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <ArrowDownUp size={14} className="text-muted-foreground shrink-0" />
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="h-9 text-xs sm:text-sm flex-1 sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">
                        {isAr ? 'الأحدث (آخر بحث)' : 'Most recent (last search)'}
                      </SelectItem>
                      <SelectItem value="tripDate">
                        {isAr ? 'حسب تاريخ الرحلة' : 'By trip date'}
                      </SelectItem>
                      <SelectItem value="durationDesc">
                        {isAr ? 'حسب المدة (الأطول أولاً)' : 'By duration (longest first)'}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Filter row: Time (Upcoming/Active/Past) + Origin + Destination */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Filter size={14} />
                  <span className="hidden sm:inline">{isAr ? 'تصفية' : 'Filters'}</span>
                </div>
                <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm w-[130px] sm:w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? 'كل الرحلات' : 'All trips'}</SelectItem>
                    <SelectItem value="upcoming">{isAr ? 'القادمة' : 'Upcoming'}</SelectItem>
                    <SelectItem value="active">{isAr ? 'الجارية الآن' : 'Active now'}</SelectItem>
                    <SelectItem value="past">{isAr ? 'السابقة' : 'Past'}</SelectItem>
                  </SelectContent>
                </Select>
                {uniqueOrigins.length > 0 && (
                  <CitySearchCombobox
                    value={originFilter}
                    onChange={setOriginFilter}
                    options={uniqueOrigins}
                    placeholder={isAr ? 'مدينة الانطلاق' : 'Origin city'}
                    allLabel={isAr ? 'كل مدن الانطلاق' : 'All origins'}
                    searchPlaceholder={isAr ? 'ابحث عن مدينة...' : 'Search city...'}
                    emptyLabel={isAr ? 'لا توجد نتائج' : 'No results'}
                    width="w-[150px] sm:w-[180px]"
                  />
                )}
                <CitySearchCombobox
                  value={destinationFilter}
                  onChange={setDestinationFilter}
                  options={uniqueDestinations}
                  placeholder={isAr ? 'مدينة الوصول' : 'Destination city'}
                  allLabel={isAr ? 'كل الوجهات' : 'All destinations'}
                  searchPlaceholder={isAr ? 'ابحث عن وجهة...' : 'Search destination...'}
                  emptyLabel={isAr ? 'لا توجد نتائج' : 'No results'}
                  width="w-[160px] sm:w-[190px]"
                />
                {(timeFilter !== 'all' || originFilter !== 'all' || destinationFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-xs"
                    onClick={() => { setTimeFilter('all'); setOriginFilter('all'); setDestinationFilter('all'); }}
                  >
                    {isAr ? 'مسح' : 'Clear'}
                  </Button>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {formatLatnNumber(sortedTrips.length, i18n.language)} {isAr ? 'رحلة' : 'trips'}
                </span>
              </div>

              <TabsContent value="list" className="mt-0">
                <div className="grid gap-3">
                  {sortedTrips.map((trip, index) => renderTripCard(trip, index))}
                </div>
              </TabsContent>

              <TabsContent value="calendar" className="mt-0">
                <TravelCalendar items={calendarItems} />
              </TabsContent>
            </Tabs>
          )}
        </motion.div>
      </div>
    </div>
  );
};

interface CitySearchComboboxProps {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  width?: string;
}

const CitySearchCombobox = ({
  value, onChange, options, placeholder, allLabel, searchPlaceholder, emptyLabel, width = 'w-[170px]',
}: CitySearchComboboxProps) => {
  const [open, setOpen] = useState(false);
  const display = value === 'all' ? placeholder : value;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-9 justify-between text-xs sm:text-sm font-normal', width)}
        >
          <span className={cn('truncate', value === 'all' && 'text-muted-foreground')}>{display}</span>
          <ChevronsUpDown className="ms-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const v = itemValue.toLocaleLowerCase();
            const s = search.toLocaleLowerCase().trim();
            if (!s) return 1;
            return v.includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => { onChange('all'); setOpen(false); }}
              >
                <Check className={cn('me-2 h-4 w-4', value === 'all' ? 'opacity-100' : 'opacity-0')} />
                {allLabel}
              </CommandItem>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => { onChange(opt); setOpen(false); }}
                >
                  <Check className={cn('me-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MyTripsPage;
