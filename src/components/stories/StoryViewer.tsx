import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Heart, MessageCircle, Share2, MapPin, Bookmark, Plane, Volume2, VolumeX, ChevronUp, Clock, DollarSign, Copy, Check, Calendar, Film } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { StoryTags } from './HashtagSystem';
import { MediaCarousel } from './MediaCarousel';

const STORY_FILTERS: Record<string, string> = {
  warm: 'sepia(0.3) saturate(1.4)',
  cool: 'hue-rotate(30deg) saturate(1.2)',
  bw: 'grayscale(1)',
  vintage: 'sepia(0.5) contrast(1.1) brightness(0.95)',
  vivid: 'saturate(1.8) contrast(1.1)',
  dramatic: 'contrast(1.4) brightness(0.9)',
  fade: 'brightness(1.1) saturate(0.7) contrast(0.9)',
};
import { enrichItineraryWithActivityMedia, getMediaActivityContext, type MediaActivityContext } from '@/utils/storyTrip';
import { TripReelsExport } from './TripReelsExport';
import { awardPoints } from '@/utils/pointsSystem';

interface Story {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  media_urls?: string[];
  video_url?: string;
  trip_data?: any;
  likes_count: number;
  created_at: string;
  user_id: string;
  profiles?: { full_name?: string; avatar_url?: string };
  is_liked?: boolean;
  comments_count?: number;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
  onLike: (storyId: string) => void;
  onComment: (storyId: string) => void;
  currentUser?: any;
}

const StorySlide: React.FC<{
  story: Story;
  isActive: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: (platform: string) => void;
  onPlanSimilar: () => void;
  onClose: () => void;
  currentUser?: any;
  onShowDetails?: () => void;
  onMediaChange?: (payload: { index: number; total: number; itemType: 'image' | 'video' | 'youtube'; src: string }) => void;
  mediaContext?: MediaActivityContext | null;
}> = ({ story, isActive, onLike, onComment, onShare, onPlanSimilar, onClose, onShowDetails, onMediaChange, mediaContext }) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith('ar');
  const [muted, setMuted] = useState(true);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const timeAgo = formatDistanceToNow(new Date(story.created_at), { addSuffix: true, ...(isArabic ? { locale: ar } : {}) });
  const authorName = story.profiles?.full_name || (isArabic ? 'مسافر' : 'Traveler');

  const handleShareClick = (platform: string) => {
    if (platform === 'copy') setCopied(true);
    onShare(platform);
    setTimeout(() => { setCopied(false); setShowShareMenu(false); }, 1500);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="absolute inset-0" style={{ filter: story.trip_data?.filter ? (STORY_FILTERS[story.trip_data.filter] || '') : '' }}>
        <MediaCarousel
          urls={story.media_urls || []}
          videoUrl={story.video_url}
          isActive={isActive}
          muted={muted}
          isRTL={isArabic}
          className="absolute inset-0"
          onMediaChange={onMediaChange}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40 pointer-events-none" />

      <div className="relative z-20 flex items-center justify-between px-4 pt-12 pb-2">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => { if (!story.user_id.startsWith('demo-')) navigate(`/profile/${story.user_id}`); }}>
          <Avatar className="w-10 h-10 ring-2 ring-white/30">
            <AvatarImage src={story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${story.user_id}`} />
            <AvatarFallback className="bg-primary text-white text-xs">U</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-white font-semibold text-sm drop-shadow-lg">{authorName}</p>
            <p className="text-white/60 text-xs">{timeAgo}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 bg-black/50 backdrop-blur-sm rounded-full text-white/80 hover:text-white border border-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="absolute right-3 bottom-52 z-20 flex flex-col items-center gap-4">
        <button onClick={onLike} className="flex flex-col items-center gap-0.5">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/10 ${story.is_liked ? 'bg-red-500/30' : 'bg-black/40'}`}>
            <Heart className={`w-5 h-5 ${story.is_liked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </div>
          <span className="text-white text-[10px] font-semibold">{story.likes_count}</span>
        </button>

        <button onClick={onComment} className="flex flex-col items-center gap-0.5">
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-white text-[10px] font-semibold">{story.comments_count || 0}</span>
        </button>

        <button onClick={() => setSaved(!saved)} className="flex flex-col items-center gap-0.5">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/10 ${saved ? 'bg-yellow-500/20' : 'bg-black/40'}`}>
            <Bookmark className={`w-5 h-5 ${saved ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
          </div>
        </button>

        <div className="relative">
          <button onClick={() => setShowShareMenu(!showShareMenu)} className="flex flex-col items-center gap-0.5">
            <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
              <Share2 className="w-5 h-5 text-white" />
            </div>
          </button>
          <AnimatePresence>
            {showShareMenu && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-14 bottom-0 bg-black/90 backdrop-blur-xl rounded-2xl p-2 flex gap-2 border border-white/10 shadow-2xl">
                <button onClick={() => handleShareClick('whatsapp')} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center hover:scale-110 transition-transform">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                </button>
                <button onClick={() => handleShareClick('twitter')} className="w-9 h-9 rounded-full bg-black flex items-center justify-center hover:scale-110 transition-transform border border-white/20">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </button>
                <button onClick={() => handleShareClick('facebook')} className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 transition-transform">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </button>
                <button onClick={() => handleShareClick('copy')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:scale-110 transition-transform">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={() => setMuted(!muted)}>
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
            {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
          </div>
        </button>
      </div>

      <div className="absolute bottom-6 left-0 right-16 z-20 px-4">
        <h2 className="text-white font-bold text-base mb-1 drop-shadow-lg leading-tight line-clamp-2">{story.title}</h2>
        <p className="text-white/80 text-sm line-clamp-2 mb-2 drop-shadow">{story.content}</p>
        {story.location_name && (
          <Badge className="bg-white/15 backdrop-blur-md text-white border-0 gap-1 text-xs px-3 py-1 mb-2 cursor-pointer hover:bg-white/25 transition-colors"
            onClick={(e) => { e.stopPropagation(); navigate(`/stories?search=${encodeURIComponent(story.location_name!)}`); }}>
            <MapPin className="w-3 h-3" />{story.location_name}
          </Badge>
        )}

        {mediaContext && (
          <div className="mb-2 bg-black/45 backdrop-blur-md rounded-lg px-2 py-1 border border-white/10 max-w-[96%]">
            <p className="text-[11px] text-white font-semibold truncate">{mediaContext.activityName}</p>
            <p className="text-[10px] text-white/70 truncate">
              {mediaContext.dayLabel}
              {mediaContext.locationName ? ` • ${mediaContext.locationName}` : ''}
            </p>
          </div>
        )}

        <StoryTags hashtags={story.trip_data?.hashtags || []} topics={story.trip_data?.topics || []} />
        <div className="flex gap-2 mt-2 flex-wrap">
          {story.trip_data && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onShowDetails?.(); }}
              className="bg-white/15 backdrop-blur-sm hover:bg-white/25 text-white rounded-full text-xs h-8 px-4 gap-1.5 border border-white/20">
              <ChevronUp className="w-3 h-3" />{isArabic ? 'تفاصيل الخطة' : 'Trip Details'}
            </Button>
          )}
          {story.location_name && (
            <Button size="sm" onClick={onPlanSimilar}
              className="bg-accent/90 hover:bg-accent text-accent-foreground rounded-full text-xs h-8 px-4 gap-1.5 shadow-lg">
              <Plane className="w-3 h-3" />{isArabic ? 'رحلة مشابهة' : 'Plan Similar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export const StoryViewer: React.FC<StoryViewerProps> = ({ stories, initialIndex, onClose, onLike, onComment, currentUser }) => {
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith('ar');
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showDetails, setShowDetails] = useState(false);
  const [showTripReels, setShowTripReels] = useState(false);
  const [currentMediaContext, setCurrentMediaContext] = useState<MediaActivityContext | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentStory = stories[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { if (currentIndex < stories.length - 1) setCurrentIndex(p => p + 1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { if (currentIndex > 0) setCurrentIndex(p => p - 1); }
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, stories.length, onClose]);

  useEffect(() => {
    setCurrentMediaContext(null);
  }, [currentIndex]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 60;
    if (info.offset.y < -threshold && currentIndex < stories.length - 1) setCurrentIndex(p => p + 1);
    else if (info.offset.y > threshold && currentIndex > 0) setCurrentIndex(p => p - 1);
  };

  const handleShare = useCallback(async (platform: string) => {
    if (!currentStory) return;
    const url = `${window.location.origin}/stories?id=${currentStory.id}`;
    const text = `${currentStory.title} - ${currentStory.location_name || ''}`;

    // Award points for sharing (only if user is logged in)
    if (currentUser) {
      try {
        await awardPoints({ 
          userId: currentUser.id, 
          action: 'SHARE_STORY', 
          reason: `Shared story: ${currentStory.title} in viewer to ${platform}` 
        });
      } catch (e) {
        console.error('[points] Failed to award points for share:', e);
      }
    }

    switch (platform) {
      case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank'); break;
      case 'twitter': window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank'); break;
      case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank'); break;
      case 'copy':
        navigator.clipboard.writeText(url);
        toast({ title: isArabic ? 'تم نسخ الرابط ✅' : 'Link copied! ✅', duration: 2000 });
        break;
    }
  }, [currentStory, isArabic, toast, currentUser]);

  const handlePlanSimilar = () => {
    if (!currentStory) return;
    const tripData = currentStory.trip_data;
    const routeSource = String(tripData?.destination || currentStory.location_name || "");
    const routeCities = routeSource
      .split(/(?:\s*→\s*|\s*->\s*|\s*➜\s*)/g)
      .map((city) => city.trim())
      .filter(Boolean);

    const destination = routeCities[0] || currentStory.location_name || tripData?.destination || '';
    if (!destination) return;

    const params = new URLSearchParams({ destination });
    if (tripData?.budget) params.set('budget', String(tripData.budget));
    
    const duration = Number(tripData?.duration || tripData?.itinerary?.length || tripData?.days?.length || 0);
    if (duration > 0) params.set('duration', String(duration));
    
    if (tripData?.category) params.set('tripType', tripData.category);
    if (tripData?.departureCity || tripData?.departure_city) params.set('departure', tripData.departureCity || tripData.departure_city);
    if (tripData?.travelers) params.set('travelers', String(tripData.travelers));
    
    const transport = tripData?.intercityTransport || tripData?.transport || 'flight';
    params.set('transport', transport);

    // Multi-city support
    const cities = tripData?.cities || tripData?.multiCities;
    if (Array.isArray(cities) && cities.length > 1) {
      params.set('multiCity', 'true');
      params.set('cities', JSON.stringify(cities.map((c: any) => ({
        name: c.name || c.city || c,
        days: c.days || c.duration || Math.ceil(duration / cities.length)
      }))));
    } else if (routeCities.length > 1) {
      params.set('multiCity', 'true');
      const fallbackDays = Math.max(1, Math.ceil((duration || routeCities.length) / routeCities.length));
      params.set('cities', JSON.stringify(routeCities.map((name: string) => ({ name, days: fallbackDays }))));
    }

    onClose();
    navigate(`/planner?${params.toString()}`);
  };

  const handleMediaChange = useCallback((payload: { src: string }) => {
    if (!currentStory) return;
    const context = getMediaActivityContext(currentStory.trip_data, payload.src, isArabic);
    setCurrentMediaContext(context);
  }, [currentStory, isArabic]);

  if (!currentStory) return null;

  const enrichedItinerary = enrichItineraryWithActivityMedia(currentStory.trip_data);

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <motion.div ref={containerRef} className="w-full h-full relative overflow-hidden" drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.2} onDragEnd={handleDragEnd}>
        <AnimatePresence mode="wait">
          <motion.div key={currentIndex} initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -300, opacity: 0 }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="absolute inset-0">
            <StorySlide
              story={currentStory}
              isActive
              onLike={() => onLike(currentStory.id)}
              onComment={() => onComment(currentStory.id)}
              onShare={handleShare}
              onPlanSimilar={handlePlanSimilar}
              onClose={onClose}
              onShowDetails={() => setShowDetails(true)}
              onMediaChange={handleMediaChange}
              mediaContext={currentMediaContext}
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <Badge className="bg-black/40 text-white border-0 text-xs backdrop-blur-md">{currentIndex + 1} / {stories.length}</Badge>
        </div>
      </motion.div>

      <AnimatePresence>
        {showDetails && currentStory.trip_data && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-0 z-40 bg-background/95 backdrop-blur-xl overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-background/90 backdrop-blur-md border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />{currentStory.title}
              </h3>
              <button onClick={() => setShowDetails(false)} className="p-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Hero image */}
              {currentStory.media_urls?.[0] && (
                <img src={currentStory.media_urls[0]} alt="" className="w-full h-48 object-cover rounded-2xl" />
              )}

              {/* Trip summary bar */}
              <div className="flex flex-wrap gap-2">
                {currentStory.location_name && (
                  <Badge className="bg-primary/10 text-primary border-0 gap-1">
                    <MapPin className="w-3 h-3" />{currentStory.location_name}
                  </Badge>
                )}
                {currentStory.trip_data?.category && (
                  <Badge className="bg-accent/10 text-accent-foreground border-0 text-xs">{currentStory.trip_data.category}</Badge>
                )}
                {enrichedItinerary.length > 0 && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Calendar className="w-3 h-3" />{enrichedItinerary.length} {isArabic ? 'أيام' : 'days'}
                  </Badge>
                )}
                {currentStory.trip_data?.budget && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <DollarSign className="w-3 h-3" />${currentStory.trip_data.budget}
                  </Badge>
                )}
              </div>

              {currentStory.content && enrichedItinerary.length === 0 && (
                <p className="text-muted-foreground text-sm leading-relaxed">{currentStory.content}</p>
              )}

              {/* Trip Summary */}
              {currentStory.trip_data && (
                <div className="grid grid-cols-2 gap-2">
                  {currentStory.trip_data.departure_city && (
                    <div className="bg-muted/40 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground">{isArabic ? 'من' : 'From'}</p>
                      <p className="text-xs font-semibold text-foreground">{currentStory.trip_data.departure_city}</p>
                    </div>
                  )}
                  {currentStory.trip_data.destination && (
                    <div className="bg-muted/40 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground">{isArabic ? 'إلى' : 'To'}</p>
                      <p className="text-xs font-semibold text-foreground">{currentStory.trip_data.destination}</p>
                    </div>
                  )}
                  {currentStory.trip_data.duration && (
                    <div className="bg-muted/40 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground">{isArabic ? 'المدة' : 'Duration'}</p>
                      <p className="text-xs font-semibold text-foreground">{currentStory.trip_data.duration} {isArabic ? 'أيام' : 'days'}</p>
                    </div>
                  )}
                  {currentStory.trip_data.travelers && (
                    <div className="bg-muted/40 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground">{isArabic ? 'المسافرون' : 'Travelers'}</p>
                      <p className="text-xs font-semibold text-foreground">{currentStory.trip_data.travelers}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Full Itinerary - matching ItineraryPage style */}
              {enrichedItinerary.length > 0 && (
                <div className="space-y-4">
                  <h4 className="font-bold text-foreground flex items-center gap-2 text-base">
                    <Calendar className="w-5 h-5 text-primary" />
                    {isArabic ? 'جدول الرحلة الكامل' : 'Full Trip Itinerary'}
                    <Badge variant="secondary" className="text-[10px]">{enrichedItinerary.length} {isArabic ? 'أيام' : 'days'}</Badge>
                  </h4>
                  {enrichedItinerary.map((day: any, di: number) => {
                    const dayDateRaw = day.date;
                    let dayDate: string | null = null;
                    if (dayDateRaw) {
                      try {
                        const d = new Date(dayDateRaw);
                        dayDate = !isNaN(d.getTime()) ? d.toLocaleDateString(isArabic ? 'ar-SA' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null;
                      } catch { dayDate = null; }
                    }
                    const activities = day.activities || [];
                    const cityName = day.city || day.location || '';
                    return (
                      <div key={di} className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                        {/* Day header */}
                        <div className="bg-primary/5 px-4 py-3 flex items-center gap-3 border-b border-border">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="text-primary font-bold text-sm">{di + 1}</span>
                          </div>
                          <div>
                            <p className="font-bold text-foreground">
                              {isArabic ? `اليوم ${di + 1}` : `Day ${di + 1}`}
                              {day.title ? ` — ${day.title}` : ''}
                            </p>
                            <div className="flex items-center gap-2">
                              {dayDate && <p className="text-xs text-muted-foreground">{dayDate}</p>}
                              {cityName && <Badge variant="outline" className="text-[10px] h-4 px-1.5 gap-0.5"><MapPin className="w-2.5 h-2.5" />{cityName}</Badge>}
                            </div>
                          </div>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {activities.length} {isArabic ? 'فعالية' : 'activities'}
                          </span>
                        </div>
                        {/* Activities */}
                        <div className="p-3 space-y-3">
                          {activities.map((act: any, ai: number) => {
                            const actName = act.name || act.title || '';
                            const actLocation = act.location || act.address || '';
                            const actImage = act.image || (act.media && act.media[0]) || null;
                            const mapQuery = `${actName} ${actLocation}`.trim();
                            const mapUrl = mapQuery
                              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
                              : (act.latitude && act.longitude ? `https://www.google.com/maps?q=${act.latitude},${act.longitude}` : null);

                            return (
                              <div key={ai} className="bg-muted/30 rounded-xl p-3 border-l-[3px] border-primary/40">
                                <div className="flex items-start gap-3">
                                  {/* Activity image */}
                                  {actImage && (
                                    <img src={actImage} alt={actName} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      {act.time && (
                                        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded-md">{act.time}</span>
                                      )}
                                      <p className="text-sm font-bold text-foreground">{actName}</p>
                                    </div>
                                    {actLocation && (
                                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                        <MapPin className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{actLocation}</span>
                                        {mapUrl && (
                                          <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                                            className="text-primary text-[10px] hover:underline shrink-0 ml-1">
                                            📍 {isArabic ? 'الخريطة' : 'Map'}
                                          </a>
                                        )}
                                      </p>
                                    )}
                                    {act.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-3 mb-1">{act.description}</p>
                                    )}
                                    {/* Activity meta */}
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                      {(act.cost > 0 || act.price > 0) && <span className="text-xs text-accent font-bold">${act.cost || act.price}</span>}
                                      {act.duration && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{act.duration}</span>}
                                      {act.rating && <span className="text-[10px] text-amber-500">⭐ {act.rating}</span>}
                                      {(act.type || act.category) && <Badge variant="outline" className="text-[9px] h-4 px-1">{act.type || act.category}</Badge>}
                                    </div>
                                    {/* Activity photos */}
                                    {act.media && act.media.length > 0 && (
                                      <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                                        {act.media.slice(0, 6).map((m: string, mi: number) => (
                                          <img key={mi} src={m} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 border border-border" />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* All Photos Grid */}
              {currentStory.media_urls && currentStory.media_urls.length > 1 && (
                <div>
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">📸 {isArabic ? 'جميع الصور' : 'All Photos'}</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {currentStory.media_urls.map((url, i) => {
                      const context = getMediaActivityContext(currentStory.trip_data, url, isArabic);
                      return (
                        <div key={i}>
                          <img src={url} alt="" className="w-full aspect-square object-cover rounded-xl" />
                          {context && <p className="text-[9px] text-muted-foreground mt-1 truncate">{context.activityName}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Budget */}
              {currentStory.trip_data?.budget && (
                <div className="bg-accent/10 rounded-xl p-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">{isArabic ? 'الميزانية: ' : 'Budget: '}${currentStory.trip_data.budget}</span>
                </div>
              )}

              <StoryTags hashtags={currentStory.trip_data?.hashtags} topics={currentStory.trip_data?.topics} />

              <div className="flex gap-2 pt-2">
                <Button onClick={() => { setShowDetails(false); handlePlanSimilar(); }} className="flex-1 rounded-xl gap-2">
                  <Plane className="w-4 h-4" />{isArabic ? 'خطط رحلة مشابهة' : 'Plan Similar Trip'}
                </Button>
                {currentStory.trip_data && enrichedItinerary.length > 0 && (
                  <Button variant="outline" onClick={() => setShowTripReels(true)} className="rounded-xl gap-2">
                    <Film className="w-4 h-4" />{isArabic ? 'ريلز' : 'Reels'}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trip Reels Export */}
      {currentStory?.trip_data && (
        <TripReelsExport
          tripData={currentStory.trip_data}
          title={currentStory.title}
          location={currentStory.location_name}
          authorName={currentStory.profiles?.full_name}
          open={showTripReels}
          onOpenChange={setShowTripReels}
        />
      )}
    </div>
  );
};