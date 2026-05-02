import React, { useState, useEffect, useMemo } from 'react';
import { Radio, MapPin, Loader2, Navigation, ImagePlus, Calendar, Route, Check, CheckCheck, X, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLiveStream } from '@/hooks/useLiveStream';

interface LiveStreamButtonProps {
  variant?: 'icon' | 'full';
}

export const LiveStreamButton: React.FC<LiveStreamButtonProps> = ({ variant = 'icon' }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { startLiveStream, isLive } = useLiveStream();

  const [showSetup, setShowSetup] = useState(false);
  const [setupTab, setSetupTab] = useState<'now' | 'fromTrip' | 'schedule'>('now');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string>('all');

  // Auto-open setup when arriving with ?cohost, ?openLive=1, or ?openLive=fromTrip&tripId=...
  // Deep-link contract:
  //   /stories?openLive=1            → open setup on "Now" tab
  //   /stories?openLive=fromTrip     → open setup on "From Trip" tab
  //   /stories?openLive=fromTrip&tripId=<saved_trips.trip_id>  → also pre-select that trip
  //   /stories?cohost=1              → open setup pre-titled as a co-stream
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsCohost = !!params.get('cohost');
    const openLiveParam = params.get('openLive');
    const wantsOpenLive = openLiveParam === '1' || openLiveParam === 'fromTrip';
    const tripIdParam = params.get('tripId');
    if ((wantsCohost || wantsOpenLive) && user && !isLive) {
      setShowSetup(true);
      if (openLiveParam === 'fromTrip') setSetupTab('fromTrip');
      if (wantsCohost && !title) setTitle(isArabic ? 'بثّ مشترك' : 'Co-stream');
      if (tripIdParam) {
        // Pre-select the trip once savedTrips loads
        setSelectedTripIds((prev) => (prev.includes(tripIdParam) ? prev : [...prev, tripIdParam]));
      }
    }
  }, [user]);

  // Once savedTrips finish loading, reconcile pre-selected trip IDs against
  // the actual list (handles cases where the deep-linked trip ID maps to a
  // saved_trips row keyed by `id` instead of `trip_id`).
  useEffect(() => {
    if (savedTrips.length === 0 || selectedTripIds.length === 0) return;
    const valid = new Set<string>();
    for (const sel of selectedTripIds) {
      const match = savedTrips.find((t) => t.id === sel || t.trip_id === sel);
      if (match) valid.add(match.id);
    }
    if (valid.size !== selectedTripIds.length) {
      setSelectedTripIds(Array.from(valid));
    }
  }, [savedTrips]);

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=${isArabic ? 'ar' : 'en'}`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.state || '';
          const country = data.address?.country || '';
          setLocation([city, country].filter(Boolean).join(', '));
        } catch {}
        setDetectingLocation(false);
      },
      () => setDetectingLocation(false)
    );
  };

  const compressImage = (file: File, maxDim = 720, quality = 0.78): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('blob failed')); return; }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });

  const handleThumbnailPick = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: isArabic ? 'الحجم الأقصى 10 ميجا' : 'Max size 10MB', variant: 'destructive' });
      return;
    }
    setThumbnailPreview(URL.createObjectURL(file));
    setUploadingThumb(true);
    try {
      const blob = await compressImage(file, 720, 0.78);
      setThumbnailFile(new File([blob], 'thumb.jpg', { type: 'image/jpeg' }));
    } catch {
      setThumbnailFile(file);
    } finally {
      setUploadingThumb(false);
    }
  };

  const uploadThumbnail = async (): Promise<string | null> => {
    if (!user || !thumbnailFile) return null;
    try {
      const ext = (thumbnailFile.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stream-thumbnails')
        .upload(path, thumbnailFile, { upsert: true, contentType: thumbnailFile.type, cacheControl: '3600' });
      if (!upErr) {
        const { data: pub } = supabase.storage.from('stream-thumbnails').getPublicUrl(path);
        return pub.publicUrl;
      }
    } catch {}
    return null;
  };

  // Load saved trips when "fromTrip" tab is opened
  useEffect(() => {
    if (setupTab !== 'fromTrip' || !user || savedTrips.length > 0) return;
    setLoadingTrips(true);
    supabase.from('saved_trips')
      .select('id, trip_id, destination, trip_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setSavedTrips(data || []);
        setLoadingTrips(false);
      });
  }, [setupTab, user]);

  const getDayDate = (d: any): number => {
    const raw = d?.date || d?.day_date || d?.dayDate || d?.start_date || d?.startDate;
    if (raw) {
      const t = new Date(raw).getTime();
      if (!isNaN(t)) return t;
    }
    const idx = typeof d?.day === 'number' ? d.day : (typeof d?.day_index === 'number' ? d.day_index : 0);
    return idx;
  };

  const buildMergedTripData = (trips: any[]) => {
    if (trips.length === 0) return null;
    if (trips.length === 1) return trips[0].trip_data;
    // Merge multiple trips: sort each trip's days by date, then concat with source tag
    const mergedDays: any[] = [];
    const destinations: string[] = [];
    trips.forEach(t => {
      const td = t.trip_data || {};
      destinations.push(t.destination);
      const days = [...(td.days || td.itinerary || [])].sort((a, b) => getDayDate(a) - getDayDate(b));
      days.forEach((d: any) => mergedDays.push({
        ...d,
        _sourceTrip: t.destination,
        _sourceTripId: t.trip_id,
      }));
    });
    return {
      ...(trips[0].trip_data || {}),
      destination: destinations.join(' & '),
      destinations,
      days: mergedDays,
      itinerary: mergedDays,
      multi_trip: true,
      source_trip_ids: trips.map(t => t.trip_id),
    };
  };

  // Derived: city list from saved trips (use first part before comma)
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    savedTrips.forEach(t => {
      const city = String(t.destination || '').split(',')[0].trim();
      if (city) set.add(city);
    });
    return Array.from(set);
  }, [savedTrips]);

  const filteredTrips = useMemo(() => {
    if (cityFilter === 'all') return savedTrips;
    return savedTrips.filter(t => String(t.destination || '').split(',')[0].trim() === cityFilter);
  }, [savedTrips, cityFilter]);

  const selectedTrips = useMemo(
    () => savedTrips.filter(t => selectedTripIds.includes(t.id)),
    [savedTrips, selectedTripIds]
  );

  const previewTotalDays = useMemo(
    () => selectedTrips.reduce((sum, t) => sum + ((t.trip_data as any)?.days?.length || (t.trip_data as any)?.itinerary?.length || 0), 0),
    [selectedTrips]
  );

  const allFilteredSelected = filteredTrips.length > 0 && filteredTrips.every(t => selectedTripIds.includes(t.id));
  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedTripIds(prev => prev.filter(id => !filteredTrips.some(t => t.id === id)));
    } else {
      const ids = filteredTrips.map(t => t.id);
      setSelectedTripIds(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleGoLive = async () => {
    if (!user) { navigate('/auth'); return; }
    setStarting(true);
    const params = new URLSearchParams(window.location.search);
    const cohostParent = params.get('cohost');
    const importedTrips = selectedTripIds.length > 0
      ? savedTrips.filter(t => selectedTripIds.includes(t.id))
      : [];
    const mergedTripData = buildMergedTripData(importedTrips);
    const destinationsLabel = importedTrips.map(t => t.destination).join(' & ');
    const finalTitle = title || (importedTrips.length > 0
      ? (importedTrips.length === 1
        ? `${isArabic ? 'بث من رحلة' : 'Live from trip'}: ${destinationsLabel}`
        : `${isArabic ? 'بث من رحلاتي' : 'Live from my trips'}: ${destinationsLabel}`)
      : '');
    const finalLocation = location || destinationsLabel || '';
    const ok = await startLiveStream({
      title: finalTitle,
      location: finalLocation,
      thumbnailFile,
      facingMode: 'environment',
      cohostParent,
      importedTripId: importedTrips[0]?.trip_id || null,
      importedTripData: mergedTripData,
    } as any);
    setStarting(false);
    if (ok) {
      setShowSetup(false);
      setTitle('');
      setLocation('');
      setThumbnailFile(null);
      setThumbnailPreview(null);
      setSelectedTripIds([]);
    }
  };

  const scheduleStream = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!title || !scheduledAt) {
      toast({ title: isArabic ? 'أدخل العنوان والموعد' : 'Enter title and time', variant: 'destructive' });
      return;
    }
    const when = new Date(scheduledAt);
    if (when.getTime() < Date.now()) {
      toast({ title: isArabic ? 'الموعد يجب أن يكون في المستقبل' : 'Time must be in the future', variant: 'destructive' });
      return;
    }
    setScheduling(true);
    const thumbnailUrl = await uploadThumbnail();
    const importedTrips = selectedTripIds.length > 0
      ? savedTrips.filter(t => selectedTripIds.includes(t.id))
      : [];
    const mergedTripData = buildMergedTripData(importedTrips);
    const destinationsLabel = importedTrips.map(t => t.destination).join(' & ');
    const { error } = await supabase.from('live_streams').insert({
      user_id: user.id,
      title,
      location_name: location || destinationsLabel || null,
      is_active: false,
      status: 'scheduled',
      scheduled_at: when.toISOString(),
      thumbnail_url: thumbnailUrl,
      imported_trip_id: importedTrips[0]?.trip_id || null,
      imported_trip_data: mergedTripData,
    } as any);
    setScheduling(false);
    if (error) {
      toast({ title: isArabic ? 'تعذّر الجدولة' : 'Schedule failed', variant: 'destructive' });
      return;
    }
    setShowSetup(false);
    setTitle(''); setLocation(''); setScheduledAt(''); setThumbnailFile(null); setThumbnailPreview(null); setSelectedTripIds([]);
    toast({ title: isArabic ? 'تمت جدولة البث ✅' : 'Stream scheduled ✅' });
  };

  const handleStartLive = () => {
    if (!user) { navigate('/auth'); return; }
    setShowSetup(true);
  };

  return (
    <>
      {variant === 'icon' ? (
        <button onClick={handleStartLive}
          className="flex flex-col items-center gap-0.5 text-white/60 hover:text-red-400 transition-colors">
          <div className="relative">
            <Radio className="w-5 h-5" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <span className="text-[10px]">{isArabic ? 'بث' : 'Live'}</span>
        </button>
      ) : (
        <Button onClick={handleStartLive} variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl border-red-500/30 text-red-500 hover:bg-red-500/10">
          <Radio className="w-3.5 h-3.5" />
          {isArabic ? 'بث مباشر' : 'Go Live'}
        </Button>
      )}

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent
          className="max-w-[95vw] sm:max-w-md rounded-2xl p-0 gap-0 max-sm:w-screen max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none max-sm:border-0 flex flex-col overflow-hidden"
        >
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 max-sm:pt-[calc(env(safe-area-inset-top)+1rem)] shrink-0 border-b border-border/40 sm:border-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Radio className="w-5 h-5 text-red-500" />
              {isArabic ? 'إعداد البث المباشر' : 'Setup Live Stream'}
            </DialogTitle>
          </DialogHeader>

          <Tabs
            value={setupTab}
            onValueChange={(v) => setSetupTab(v as any)}
            className="pt-1 flex-1 min-h-0 flex flex-col overflow-hidden px-4 sm:px-6 pb-4 sm:pb-6 max-sm:pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="now" className="gap-1 text-[11px] sm:text-xs px-1 py-2 flex-col sm:flex-row">
                <Radio className="w-3.5 h-3.5" />{isArabic ? 'الآن' : 'Now'}
              </TabsTrigger>
              <TabsTrigger value="fromTrip" className="gap-1 text-[11px] sm:text-xs px-1 py-2 flex-col sm:flex-row">
                <Route className="w-3.5 h-3.5" />{isArabic ? 'من رحلة' : 'From Trip'}
              </TabsTrigger>
              <TabsTrigger value="schedule" className="gap-1 text-[11px] sm:text-xs px-1 py-2 flex-col sm:flex-row">
                <Calendar className="w-3.5 h-3.5" />{isArabic ? 'جدولة' : 'Schedule'}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-3 sm:space-y-4 pt-4">
              {setupTab === 'fromTrip' && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 flex items-center justify-between gap-2">
                    <span>{isArabic ? 'اختر رحلة أو أكثر لاستيراد بياناتها' : 'Pick one or more trips to import'}</span>
                    {selectedTripIds.length > 0 && (
                      <span className="text-[10px] font-semibold text-red-500">
                        {selectedTripIds.length} {isArabic ? 'محددة' : 'selected'}
                      </span>
                    )}
                  </label>

                  {/* City filter chips + Select all */}
                  {savedTrips.length > 0 && (
                    <div className="mb-2 space-y-2">
                      {cityOptions.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
                          <Filter className="w-3 h-3 text-muted-foreground shrink-0" />
                          <button
                            type="button"
                            onClick={() => setCityFilter('all')}
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${cityFilter === 'all' ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-border bg-muted/30 text-muted-foreground'}`}
                          >
                            {isArabic ? 'الكل' : 'All'}
                          </button>
                          {cityOptions.map(city => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => setCityFilter(city)}
                              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] border transition-colors ${cityFilter === city ? 'border-red-500 bg-red-500/10 text-red-500' : 'border-border bg-muted/30 text-muted-foreground'}`}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={toggleSelectAllFiltered}
                          disabled={filteredTrips.length === 0}
                          className="h-8 text-[11px] gap-1.5 rounded-lg flex-1"
                        >
                          {allFilteredSelected ? <X className="w-3.5 h-3.5" /> : <CheckCheck className="w-3.5 h-3.5" />}
                          {allFilteredSelected
                            ? (isArabic ? 'إلغاء تحديد الكل' : 'Clear all')
                            : (isArabic ? 'تحديد كل الرحلات' : 'Select all trips')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {loadingTrips ? (
                    <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                  ) : savedTrips.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {isArabic ? 'لا توجد رحلات محفوظة بعد' : 'No saved trips yet'}
                    </p>
                  ) : filteredTrips.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {isArabic ? 'لا توجد رحلات لهذه المدينة' : 'No trips for this city'}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto -mx-1 px-1">
                      {filteredTrips.map((trip) => {
                        const isSel = selectedTripIds.includes(trip.id);
                        const days = (trip.trip_data as any)?.days?.length || (trip.trip_data as any)?.itinerary?.length || 0;
                        return (
                          <button
                            key={trip.id}
                            type="button"
                            onClick={() => setSelectedTripIds(prev => isSel ? prev.filter(id => id !== trip.id) : [...prev, trip.id])}
                            className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-colors ${isSel ? 'border-red-500 bg-red-500/10' : 'border-border bg-muted/30 hover:bg-muted/50'}`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{trip.destination}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {days} {isArabic ? (days === 1 ? 'يوم' : 'أيام') : (days === 1 ? 'day' : 'days')} · {new Date(trip.created_at).toLocaleDateString(isArabic ? 'ar' : 'en')}
                              </p>
                            </div>
                            {isSel && <Check className="w-4 h-4 text-red-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Merge preview */}
                  {selectedTrips.length > 0 && (
                    <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2">
                      <p className="text-[11px] font-semibold text-red-500 mb-1">
                        {isArabic ? 'معاينة الدمج' : 'Merge preview'}
                      </p>
                      <p className="text-[11px] text-foreground">
                        {isArabic
                          ? `سيتم دمج ${previewTotalDays} ${previewTotalDays === 1 ? 'يوم' : 'أيام'} من ${selectedTrips.length} ${selectedTrips.length === 1 ? 'رحلة' : 'رحلات'}`
                          : `Merging ${previewTotalDays} ${previewTotalDays === 1 ? 'day' : 'days'} from ${selectedTrips.length} ${selectedTrips.length === 1 ? 'trip' : 'trips'}`}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {selectedTrips.map(t => (
                          <Badge key={t.id} variant="outline" className="text-[10px] border-red-500/40 text-foreground bg-background/50">
                            {String(t.destination || '').split(',')[0].trim()}
                            <span className="ms-1 text-muted-foreground">
                              · {(t.trip_data as any)?.days?.length || (t.trip_data as any)?.itinerary?.length || 0}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{isArabic ? 'عنوان البث' : 'Stream Title'}</label>
                <Input value={title} onChange={e => setTitle(e.target.value)}
                  placeholder={isArabic ? 'مثال: استكشاف شوارع طوكيو...' : 'e.g. Exploring Tokyo streets...'} className="rounded-xl" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{isArabic ? 'الموقع' : 'Location'}</label>
                <div className="flex gap-2">
                  <Input value={location} onChange={e => setLocation(e.target.value)}
                    placeholder={isArabic ? 'طوكيو، اليابان' : 'Tokyo, Japan'} className="rounded-xl flex-1" />
                  <Button type="button" variant="outline" size="icon" onClick={detectLocation} disabled={detectingLocation} className="shrink-0 rounded-xl">
                    {detectingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">{isArabic ? 'الصورة المصغرة (اختياري)' : 'Thumbnail (optional)'}</label>
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  {thumbnailPreview ? (
                    <img src={thumbnailPreview} alt="thumb" className="w-16 h-16 rounded-lg object-cover" />
                  ) : (
                    <ImagePlus className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-xs text-muted-foreground">{thumbnailPreview ? (isArabic ? 'تغيير الصورة' : 'Change image') : (isArabic ? 'اختر صورة' : 'Pick image')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleThumbnailPick(e.target.files?.[0] || null)} />
                </label>
                {uploadingThumb && <p className="text-xs text-muted-foreground mt-1">{isArabic ? 'جارٍ الضغط...' : 'Compressing...'}</p>}
              </div>

              {setupTab === 'schedule' && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">{isArabic ? 'موعد البث' : 'Scheduled Time'}</label>
                  <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="rounded-xl" />
                </div>
              )}
            </div>

            {/* Sticky footer button — never hidden behind iOS Safari toolbar */}
            <div className="shrink-0 pt-3 mt-2 border-t border-border/40 bg-background">
              {setupTab === 'schedule' ? (
                <Button onClick={scheduleStream} disabled={scheduling} className="w-full rounded-xl gap-2 h-11">
                  {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                  {isArabic ? 'جدولة البث' : 'Schedule Stream'}
                </Button>
              ) : (
                <Button onClick={handleGoLive} disabled={starting} className="w-full rounded-xl bg-red-500 hover:bg-red-600 text-white gap-2 h-11">
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                  {setupTab === 'fromTrip' && selectedTripIds.length > 0
                    ? (selectedTripIds.length === 1
                      ? (isArabic ? 'بدء البث من الرحلة' : 'Go Live from Trip')
                      : (isArabic ? `بدء البث من ${selectedTripIds.length} رحلات` : `Go Live from ${selectedTripIds.length} Trips`))
                    : (isArabic ? 'بدء البث الآن' : 'Go Live Now')}
                </Button>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
};
