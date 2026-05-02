import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Play, Pause, Download, Music, Upload, Image, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

interface SavedTrip {
  id: string;
  trip_id: string;
  destination: string;
  trip_data: any;
  created_at: string;
}

interface AutoStoryGeneratorProps {
  savedTrips: SavedTrip[];
  userId: string;
}

interface SlideItem {
  url: string;
  caption: string;
  day?: string;
  type: 'image' | 'video';
}

const TRANSITIONS = [
  { id: 'fade', label: 'Fade' },
  { id: 'slide', label: 'Slide' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'flip', label: 'Flip' },
];

const BACKGROUND_TRACKS = [
  { id: 'none', label: '🔇 No Music' },
  { id: 'chill', label: '🎵 Chill Vibes' },
  { id: 'adventure', label: '🎸 Adventure' },
  { id: 'cinematic', label: '🎬 Cinematic' },
  { id: 'custom', label: '🎤 Custom Upload' },
];

const SLIDE_DURATION = 3000; // 3 seconds per slide

export const AutoStoryGenerator = ({ savedTrips, userId }: AutoStoryGeneratorProps) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [selectedTripId, setSelectedTripId] = useState('');
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transition, setTransition] = useState('fade');
  const [bgTrack, setBgTrack] = useState('none');
  const [customAudio, setCustomAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load trip data and build slides
  useEffect(() => {
    if (!selectedTripId) { setSlides([]); return; }
    const trip = savedTrips.find(t => t.id === selectedTripId);
    if (!trip) return;
    const tripData = trip.trip_data as any;
    const items: SlideItem[] = [];

    // Title slide
    items.push({ url: '', caption: `✈️ ${trip.destination}`, type: 'image' });

    // Extract from itinerary days
    const days = tripData?.days || tripData?.itinerary || [];
    days.forEach((day: any, idx: number) => {
      const dayLabel = isArabic ? `اليوم ${idx + 1}` : `Day ${idx + 1}`;
      const activities = day.activities || day.places || [];
      activities.forEach((act: any) => {
        if (act.image || act.photo) {
          items.push({
            url: act.image || act.photo,
            caption: act.name || act.title || act.activity || '',
            day: dayLabel,
            type: 'image',
          });
        }
      });
    });

    // If no images from trip, add placeholder slides
    if (items.length <= 1) {
      items.push({ url: `https://source.unsplash.com/800x600/?${encodeURIComponent(trip.destination)}`, caption: trip.destination, type: 'image' });
    }

    // Ending slide
    items.push({ url: '', caption: isArabic ? '🌟 شكراً للمشاهدة!' : '🌟 Thanks for watching!', type: 'image' });

    setSlides(items);
    setCurrentSlide(0);
  }, [selectedTripId, isArabic]);

  // Add extra photos as slides
  const handleExtraPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setExtraPhotos(prev => [...prev, ...files]);
    const newSlides = files.map(f => ({
      url: URL.createObjectURL(f),
      caption: f.name.replace(/\.[^.]+$/, ''),
      type: (f.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
    }));
    setSlides(prev => {
      const copy = [...prev];
      copy.splice(copy.length - 1, 0, ...newSlides); // insert before ending
      return copy;
    });
  };

  // Audio
  const handleCustomAudio = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomAudio(file);
      setAudioUrl(URL.createObjectURL(file));
      setBgTrack('custom');
    }
  };

  // Playback
  useEffect(() => {
    if (isPlaying && slides.length > 0) {
      intervalRef.current = setInterval(() => {
        setCurrentSlide(prev => {
          if (prev >= slides.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, SLIDE_DURATION);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, slides.length]);

  useEffect(() => {
    if (isPlaying && audioUrl && audioRef.current) {
      audioRef.current.play().catch(() => {});
    } else if (!isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying, audioUrl]);

  const togglePlay = () => {
    if (!isPlaying && currentSlide >= slides.length - 1) setCurrentSlide(0);
    setIsPlaying(p => !p);
  };

  const goTo = (dir: number) => {
    setCurrentSlide(prev => Math.max(0, Math.min(slides.length - 1, prev + dir)));
  };

  // Download as series of images (simulated)
  const handleDownload = async () => {
    // For a web app, we create a shareable story post instead
    if (!selectedTripId) return;
    setUploading(true);
    try {
      const trip = savedTrips.find(t => t.id === selectedTripId);
      const mediaUrls = slides.filter(s => s.url).map(s => s.url);
      
      await supabase.from('travel_stories').insert({
        title: `${isArabic ? 'قصة رحلة:' : 'Trip Story:'} ${trip?.destination || ''}`,
        content: slides.map(s => s.caption).filter(Boolean).join(' • '),
        media_urls: mediaUrls.slice(0, 8),
        user_id: userId,
        trip_data: { auto_generated: true, linked_trip_id: selectedTripId, transition, bg_track: bgTrack },
        location_name: trip?.destination,
      });
      
      // Reset
      setIsPlaying(false);
      setCurrentSlide(0);
    } catch (err) {
      console.error('Error publishing auto story:', err);
    } finally {
      setUploading(false);
    }
  };

  const getTransitionVariants = () => {
    switch (transition) {
      case 'slide': return { initial: { x: 300, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -300, opacity: 0 } };
      case 'zoom': return { initial: { scale: 0.5, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.5, opacity: 0 } };
      case 'flip': return { initial: { rotateY: 90, opacity: 0 }, animate: { rotateY: 0, opacity: 1 }, exit: { rotateY: -90, opacity: 0 } };
      default: return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
    }
  };

  const progress = slides.length > 0 ? ((currentSlide + 1) / slides.length) * 100 : 0;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wand2 className="w-5 h-5 text-accent" />
          {isArabic ? 'إنشاء قصة تلقائية' : 'Auto Story Generator'}
          <Badge variant="secondary" className="text-xs">{isArabic ? 'جديد' : 'New'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Trip Selector */}
        <Select value={selectedTripId} onValueChange={setSelectedTripId}>
          <SelectTrigger className="bg-background border-border rounded-xl">
            <SelectValue placeholder={isArabic ? 'اختر رحلة محفوظة...' : 'Select a saved trip...'} />
          </SelectTrigger>
          <SelectContent>
            {savedTrips.map(trip => (
              <SelectItem key={trip.id} value={trip.id}>
                ✈️ {trip.destination} ({new Date(trip.created_at).toLocaleDateString()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {slides.length > 0 && (
          <>
            {/* Preview Area */}
            <div className="relative aspect-[9/16] max-h-[420px] bg-black rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 240 }}>
              {/* Progress bars */}
              <div className="absolute top-2 left-2 right-2 z-20 flex gap-1">
                {slides.map((_, i) => (
                  <div key={i} className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${i < currentSlide ? 'bg-white w-full' : i === currentSlide ? 'bg-white' : 'w-0'}`}
                      style={i === currentSlide ? { width: isPlaying ? '100%' : '50%', transition: isPlaying ? `width ${SLIDE_DURATION}ms linear` : 'none' } : {}} />
                  </div>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide}
                  {...getTransitionVariants()}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {slides[currentSlide]?.url ? (
                    slides[currentSlide].type === 'video' ? (
                      <video src={slides[currentSlide].url} className="w-full h-full object-cover" muted autoPlay />
                    ) : (
                      <img src={slides[currentSlide].url} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center p-6">
                      <p className="text-white font-bold text-lg text-center leading-relaxed">{slides[currentSlide]?.caption}</p>
                    </div>
                  )}

                  {/* Caption overlay */}
                  {slides[currentSlide]?.url && slides[currentSlide]?.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                      {slides[currentSlide]?.day && (
                        <Badge className="bg-accent/80 text-white border-0 text-[10px] mb-1">{slides[currentSlide].day}</Badge>
                      )}
                      <p className="text-white text-sm font-medium">{slides[currentSlide].caption}</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Nav buttons */}
              <button onClick={() => goTo(-1)} className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => goTo(1)} className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white hover:bg-black/50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" onClick={togglePlay} className="gap-2 rounded-xl">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? (isArabic ? 'إيقاف' : 'Pause') : (isArabic ? 'تشغيل' : 'Play')}
              </Button>
              <span className="text-xs text-muted-foreground">{currentSlide + 1}/{slides.length}</span>
            </div>

            {/* Settings Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">{isArabic ? 'الانتقال' : 'Transition'}</label>
                <Select value={transition} onValueChange={setTransition}>
                  <SelectTrigger className="h-9 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRANSITIONS.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">{isArabic ? 'الموسيقى' : 'Music'}</label>
                <Select value={bgTrack} onValueChange={setBgTrack}>
                  <SelectTrigger className="h-9 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>{BACKGROUND_TRACKS.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom audio upload */}
            {bgTrack === 'custom' && (
              <div>
                <input type="file" accept="audio/*" onChange={handleCustomAudio} className="hidden" id="custom-audio" />
                <label htmlFor="custom-audio" className="flex items-center gap-2 px-4 py-2 border border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 text-sm">
                  <Music className="w-4 h-4 text-primary" />
                  {customAudio ? customAudio.name : (isArabic ? 'اختر ملف صوتي...' : 'Choose audio file...')}
                </label>
              </div>
            )}

            {/* Add extra photos */}
            <div>
              <input type="file" multiple accept="image/*,video/*" onChange={handleExtraPhotos} className="hidden" id="extra-photos" />
              <label htmlFor="extra-photos" className="flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-primary/30 rounded-xl cursor-pointer hover:bg-primary/5 text-sm text-primary font-medium">
                <Image className="w-4 h-4" />
                {isArabic ? 'أضف صور/فيديو إضافية' : 'Add extra photos/videos'}
              </label>
            </div>

            {/* Publish */}
            <Button onClick={handleDownload} disabled={uploading} className="w-full gap-2 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground">
              {uploading ? <span className="animate-spin">⏳</span> : <Upload className="w-4 h-4" />}
              {isArabic ? 'نشر كقصة' : 'Publish as Story'}
            </Button>
          </>
        )}

        {audioUrl && <audio ref={audioRef} src={audioUrl} loop />}
      </CardContent>
    </Card>
  );
};
