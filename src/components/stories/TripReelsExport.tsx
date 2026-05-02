import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, Download, Loader2, Music, Play, Pause, Sparkles, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { enrichItineraryWithActivityMedia } from "@/utils/storyTrip";

interface TripActivity {
  name?: string;
  title?: string;
  location?: string;
  address?: string;
  time?: string;
  image?: string;
  media?: string[];
  rating?: number;
  type?: string;
  category?: string;
}

interface TripReelsExportProps {
  tripData: any;
  title: string;
  location?: string;
  authorName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MUSIC_TRACKS = [
  { id: 'none', labelEn: 'No Music', labelAr: 'بدون موسيقى' },
  { id: 'chill', labelEn: 'Chill Vibes', labelAr: 'أجواء هادئة' },
  { id: 'adventure', labelEn: 'Adventure', labelAr: 'مغامرة' },
  { id: 'cinematic', labelEn: 'Cinematic', labelAr: 'سينمائي' },
];

const TRANSITION_STYLES = [
  { id: 'fade', labelEn: 'Fade', labelAr: 'تلاشي' },
  { id: 'slide', labelEn: 'Slide', labelAr: 'انزلاق' },
  { id: 'zoom', labelEn: 'Zoom', labelAr: 'تكبير' },
];

const generateTone = (type: string, sampleRate: number, duration: number): Float32Array => {
  const samples = sampleRate * duration;
  const data = new Float32Array(samples);
  const baseFreq = type === 'chill' ? 220 : type === 'adventure' ? 330 : 440;
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 4) * Math.max(0, 1 - (t / duration) * 0.3);
    data[i] = env * 0.15 * (
      Math.sin(2 * Math.PI * baseFreq * t) +
      0.5 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t) +
      0.3 * Math.sin(2 * Math.PI * baseFreq * 2 * t + Math.sin(t * 2))
    );
  }
  return data;
};

// Collect activities with images from trip data
const collectActivitySlides = (tripData: any): Array<{ image: string; name: string; location: string; time: string; day: string; rating?: number; type?: string }> => {
  const itinerary = enrichItineraryWithActivityMedia(tripData);
  const slides: Array<{ image: string; name: string; location: string; time: string; day: string; rating?: number; type?: string }> = [];

  for (let di = 0; di < itinerary.length; di++) {
    const day = itinerary[di];
    const dayLabel = day.date ? (typeof day.date === 'string' ? day.date : new Date(day.date).toLocaleDateString()) : `Day ${di + 1}`;
    const activities = day.activities || [];

    for (const act of activities) {
      const actName = act.name || act.title || '';
      const actLocation = act.location || act.address || '';
      const images = Array.isArray(act.media) ? act.media.filter((u: string) => u && !/\.(mp4|webm|mov)(\?|$)/i.test(u)) : [];
      const actImage = act.image || images[0];

      if (actImage && actName) {
        slides.push({
          image: actImage,
          name: actName,
          location: actLocation,
          time: act.time || '',
          day: dayLabel,
          rating: act.rating,
          type: act.type || act.category,
        });
      }
      // Add extra slides for additional media
      images.slice(actImage ? 1 : 0, 3).forEach((img: string) => {
        if (img !== actImage) {
          slides.push({ image: img, name: actName, location: actLocation, time: '', day: dayLabel, rating: act.rating, type: act.type || act.category });
        }
      });
    }
  }

  return slides.slice(0, 12); // Max 12 slides
};

export const TripReelsExport = ({ tripData, title, location, authorName, open, onOpenChange }: TripReelsExportProps) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith('ar');
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [musicTrack, setMusicTrack] = useState('cinematic');
  const [transition, setTransition] = useState('zoom');
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const slides = collectActivitySlides(tripData);
  const SLIDE_DURATION = 3;
  const TRANSITION_DURATION = 0.8;
  const FPS = 30;
  const WIDTH = 1080;
  const HEIGHT = 1920;

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const drawFrame = (
    ctx: CanvasRenderingContext2D,
    loadedImages: HTMLImageElement[],
    slideData: typeof slides,
    frameNum: number,
    w: number,
    h: number
  ) => {
    const time = frameNum / FPS;
    const cycleDuration = SLIDE_DURATION;
    const currentSlideIndex = Math.min(Math.floor(time / cycleDuration), loadedImages.length - 1);
    const slideProgress = (time % cycleDuration) / cycleDuration;
    const currentSlide = slideData[currentSlideIndex];
    const nextSlideIndex = Math.min(currentSlideIndex + 1, loadedImages.length - 1);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const drawImageCover = (img: HTMLImageElement, alpha: number, scale: number = 1, offsetX: number = 0) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      const imgRatio = img.width / img.height;
      const canvasRatio = w / h;
      let dw: number, dh: number, sx: number, sy: number;
      if (imgRatio > canvasRatio) { dh = h * scale; dw = dh * imgRatio; }
      else { dw = w * scale; dh = dw / imgRatio; }
      sx = (w - dw) / 2 + offsetX;
      sy = (h - dh) / 2;
      ctx.drawImage(img, sx, sy, dw, dh);
      ctx.restore();
    };

    const currentImg = loadedImages[currentSlideIndex];
    const nextImg = loadedImages[nextSlideIndex];

    // Transitions with Ken Burns
    const fadeStart = 1 - TRANSITION_DURATION / cycleDuration;
    const isTransitioning = slideProgress > fadeStart && currentSlideIndex < loadedImages.length - 1;

    if (transition === 'fade') {
      if (isTransitioning) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        drawImageCover(currentImg, 1 - t, 1 + slideProgress * 0.06);
        drawImageCover(nextImg, t);
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.08);
      }
    } else if (transition === 'slide') {
      if (isTransitioning) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        const ease = t * t * (3 - 2 * t);
        drawImageCover(currentImg, 1, 1, -w * ease);
        drawImageCover(nextImg, 1, 1, w * (1 - ease));
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.05);
      }
    } else {
      if (isTransitioning) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        drawImageCover(currentImg, 1 - t, 1 + t * 0.3);
        drawImageCover(nextImg, t, 1.3 - t * 0.3);
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.1);
      }
    }

    // Bottom gradient
    const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.4, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Top gradient
    const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.15);
    topGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, h * 0.15);

    // Activity info with animation
    const textAlpha = Math.min(1, (time - currentSlideIndex * cycleDuration) * 3);
    const slideUpOffset = Math.max(0, 20 - (time - currentSlideIndex * cycleDuration) * 60);

    ctx.save();
    ctx.globalAlpha = textAlpha;
    ctx.translate(0, slideUpOffset);

    if (currentSlide) {
      // Day badge at top
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const dayText = currentSlide.day;
      ctx.font = `bold ${Math.round(w * 0.028)}px sans-serif`;
      const dayMetrics = ctx.measureText(dayText);
      const badgeW = dayMetrics.width + w * 0.04;
      const badgeH = w * 0.045;
      const badgeX = w * 0.06;
      const badgeY = h * 0.06;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(dayText, badgeX + w * 0.02, badgeY + badgeH * 0.7);

      // Time badge next to day
      if (currentSlide.time) {
        ctx.fillStyle = 'rgba(255,165,0,0.25)';
        ctx.font = `${Math.round(w * 0.024)}px sans-serif`;
        const timeText = currentSlide.time;
        const timeMetrics = ctx.measureText(timeText);
        const timeBadgeW = timeMetrics.width + w * 0.035;
        const timeBadgeX = badgeX + badgeW + w * 0.02;
        ctx.beginPath();
        ctx.roundRect(timeBadgeX, badgeY, timeBadgeW, badgeH, badgeH / 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,200,100,1)';
        ctx.fillText(timeText, timeBadgeX + w * 0.017, badgeY + badgeH * 0.68);
      }

      // Activity name
      const nameY = h * 0.78;
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(w * 0.052)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(currentSlide.name.slice(0, 35), w / 2, nameY, w * 0.85);

      // Location with pin icon
      if (currentSlide.location) {
        ctx.font = `${Math.round(w * 0.03)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText(`📍 ${currentSlide.location.slice(0, 50)}`, w / 2, nameY + w * 0.06, w * 0.85);
      }

      // Rating
      if (currentSlide.rating) {
        ctx.font = `${Math.round(w * 0.026)}px sans-serif`;
        ctx.fillStyle = 'rgba(255,215,0,0.9)';
        ctx.fillText(`⭐ ${currentSlide.rating}`, w / 2, nameY + w * 0.105, w * 0.85);
      }

      // Type badge
      if (currentSlide.type) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.font = `${Math.round(w * 0.022)}px sans-serif`;
        const typeMetrics = ctx.measureText(currentSlide.type);
        const typeBadgeW = typeMetrics.width + w * 0.03;
        ctx.beginPath();
        ctx.roundRect((w - typeBadgeW) / 2, nameY + w * 0.12, typeBadgeW, w * 0.038, w * 0.019);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(currentSlide.type, w / 2, nameY + w * 0.146);
      }
    }

    // Trip title at very bottom
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.round(w * 0.025)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(title.slice(0, 40), w / 2, h * 0.91, w * 0.8);

    if (authorName) {
      ctx.font = `${Math.round(w * 0.022)}px sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(`@${authorName}`, w / 2, h * 0.935, w * 0.8);
    }

    // Slide indicator dots
    const dotY = h * 0.96;
    const dotR = w * 0.005;
    const dotGap = w * 0.02;
    const totalDotsW = (Math.min(slides.length, 12) - 1) * dotGap;
    const startX = (w - totalDotsW) / 2;
    for (let i = 0; i < Math.min(slides.length, 12); i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dotGap, dotY, i === currentSlideIndex ? dotR * 2 : dotR, 0, Math.PI * 2);
      ctx.fillStyle = i === currentSlideIndex ? '#ffffff' : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    ctx.restore();
  };

  const startPreview = useCallback(async () => {
    if (!previewRef.current || slides.length === 0) return;
    const ctx = previewRef.current.getContext('2d');
    if (!ctx) return;

    try {
      const loaded = await Promise.all(slides.map(s => loadImage(s.image)));
      const totalDuration = loaded.length * SLIDE_DURATION;
      const totalFrames = Math.round(totalDuration * FPS);
      let frame = 0;
      setPreviewPlaying(true);

      const animate = () => {
        if (frame >= totalFrames) frame = 0;
        drawFrame(ctx, loaded, slides, frame, previewRef.current!.width, previewRef.current!.height);
        frame++;
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.error('Preview error:', e);
    }
  }, [slides, transition]);

  const stopPreview = () => {
    cancelAnimationFrame(animFrameRef.current);
    setPreviewPlaying(false);
  };

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const renderVideoBlob = async (): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d')!;

    const loaded = await Promise.all(slides.map(s => loadImage(s.image)));
    setProgress(15);

    const totalDuration = loaded.length * SLIDE_DURATION;
    const totalFrames = Math.round(totalDuration * FPS);

    let audioBuffer: AudioBuffer | null = null;
    if (musicTrack !== 'none') {
      const audioCtx = new AudioContext({ sampleRate: 44100 });
      audioBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * totalDuration, audioCtx.sampleRate);
      const channelData = generateTone(musicTrack, audioCtx.sampleRate, totalDuration);
      audioBuffer.getChannelData(0).set(channelData);
      audioCtx.close();
    }

    const stream = canvas.captureStream(FPS);

    if (audioBuffer && musicTrack !== 'none') {
      const audioCtx = new AudioContext();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.start();
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      setTimeout(() => { source.stop(); audioCtx.close(); }, totalDuration * 1000 + 500);
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
      videoBitsPerSecond: 5_000_000,
    });

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start();

    for (let f = 0; f < totalFrames; f++) {
      drawFrame(ctx, loaded, slides, f, WIDTH, HEIGHT);
      setProgress(15 + Math.round((f / totalFrames) * 75));
      await new Promise(r => setTimeout(r, 1000 / FPS));
    }

    recorder.stop();
    await done;
    setProgress(95);

    return new Blob(chunks, { type: 'video/webm' });
  };

  const exportVideo = async () => {
    if (slides.length === 0) return;
    setExporting(true);
    setProgress(0);

    try {
      const blob = await renderVideoBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 30)}_trip_reels.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setProgress(100);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setTimeout(() => { setExporting(false); setProgress(0); }, 1000);
    }
  };

  const shareAsStory = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: isArabic ? 'يرجى تسجيل الدخول أولاً' : 'Please sign in first', variant: 'destructive' });
      navigate('/auth');
      return;
    }

    if (slides.length === 0) return;
    setSharing(true);
    setProgress(0);

    try {
      const blob = await renderVideoBlob();
      
      // Upload to storage
      const fileName = `reels_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webm`;
      const filePath = `${session.user.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('story-media')
        .upload(filePath, blob, { contentType: 'video/webm', upsert: false });
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('story-media').getPublicUrl(filePath);
      const videoUrl = urlData.publicUrl;

      // Collect image URLs from slides for media_urls
      const mediaImages = slides.slice(0, 6).map(s => s.image);

      // Build trip_data for the story
      const itinerary = enrichItineraryWithActivityMedia(tripData);
      const storyTripData: any = {
        destination: tripData?.destination || location,
        duration: itinerary.length,
        category: tripData?.category || tripData?.tripType,
        budget: tripData?.budget || tripData?.cost_estimate,
        itinerary: itinerary.map((day: any, di: number) => ({
          date: day.date,
          activities: (day.activities || []).map((a: any) => ({
            name: a.name || a.title,
            title: a.name || a.title,
            location: a.location || a.address,
            address: a.address || a.location,
            time: a.time,
            category: a.category || a.type,
            cost: a.cost,
            rating: a.rating,
            openingHours: a.openingHours,
            latitude: a.latitude,
            longitude: a.longitude,
            image: a.image,
            media: a.media,
          })),
        })),
      };

      // Create the story
      const { error: storyError } = await supabase.from('travel_stories').insert({
        user_id: session.user.id,
        title: `${title} 🎬`,
        content: isArabic 
          ? `ريلز رحلتي إلى ${location || tripData?.destination || ''} - ${slides.length} فعالية`
          : `My trip reels to ${location || tripData?.destination || ''} - ${slides.length} activities`,
        location_name: location || tripData?.destination || null,
        video_url: videoUrl,
        media_urls: mediaImages,
        trip_data: storyTripData,
      });

      if (storyError) throw storyError;

      setProgress(100);
      toast({ title: isArabic ? 'تم نشر الريلز كقصة بنجاح! 🎬' : 'Reels shared as story! 🎬' });
      
      setTimeout(() => {
        onOpenChange(false);
        navigate('/stories');
      }, 1000);
    } catch (err: any) {
      console.error('Share as story error:', err);
      toast({ title: isArabic ? 'فشل في نشر الريلز' : 'Failed to share reels', description: err?.message, variant: 'destructive' });
    } finally {
      setTimeout(() => { setSharing(false); setProgress(0); }, 1200);
    }
  };

  if (slides.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            {isArabic ? 'ريلز الرحلة' : 'Trip Reels'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="relative aspect-[9/16] bg-muted rounded-2xl overflow-hidden max-h-72 mx-auto" style={{ maxWidth: 200 }}>
            <canvas ref={previewRef} width={270} height={480} className="w-full h-full" />
            <button onClick={previewPlaying ? stopPreview : startPreview}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
              {previewPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white fill-white" />}
            </button>
            <Badge className="absolute top-2 left-2 bg-black/50 text-white border-0 text-[10px]">
              {slides.length} {isArabic ? 'فعالية' : 'activities'}
            </Badge>
          </div>

          {/* Activity list preview */}
          <div className="max-h-24 overflow-y-auto no-scrollbar space-y-1">
            {slides.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <img src={s.image} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{s.name}</p>
                  <p className="text-muted-foreground text-[10px] truncate">{s.day} {s.location ? `• ${s.location}` : ''}</p>
                </div>
              </div>
            ))}
            {slides.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center">+{slides.length - 5} {isArabic ? 'أخرى' : 'more'}</p>
            )}
          </div>

          {/* Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground flex items-center gap-1 mb-1.5">
                <Music className="w-3.5 h-3.5" /> {isArabic ? 'الموسيقى' : 'Music'}
              </label>
              <Select value={musicTrack} onValueChange={setMusicTrack}>
                <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">{MUSIC_TRACKS.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{isArabic ? t.labelAr : t.labelEn}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground flex items-center gap-1 mb-1.5">
                <Sparkles className="w-3.5 h-3.5" /> {isArabic ? 'الانتقال' : 'Transition'}
              </label>
              <Select value={transition} onValueChange={setTransition}>
                <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent position="popper">{TRANSITION_STYLES.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{isArabic ? t.labelAr : t.labelEn}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
          </div>

          {(exporting || sharing) && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {progress < 15 ? (isArabic ? 'تحميل الصور...' : 'Loading images...') :
                 progress < 90 ? (isArabic ? 'إنشاء الفيديو...' : 'Creating video...') :
                 sharing ? (isArabic ? 'جاري النشر...' : 'Publishing...') :
                 (isArabic ? 'جاري التنزيل...' : 'Downloading...')}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={exportVideo} disabled={exporting || sharing} variant="outline" className="flex-1 gap-2 rounded-xl h-11">
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isArabic ? 'تنزيل' : 'Download'}
            </Button>
            <Button onClick={shareAsStory} disabled={exporting || sharing} className="flex-1 gap-2 rounded-xl h-11">
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {isArabic ? 'نشر كقصة' : 'Share as Story'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
