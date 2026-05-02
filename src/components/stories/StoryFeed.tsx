import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, MapPin, Bookmark, Share2, Music2, Plus, Route, Plane, Copy, Check, ChevronDown, Clock, DollarSign, CalendarDays, Film, UserPlus, UserMinus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { StoryTags } from './HashtagSystem';
import { MediaCarousel } from './MediaCarousel';
import { enrichItineraryWithActivityMedia, getMediaActivityContext } from '@/utils/storyTrip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  is_saved?: boolean;
  comments_count?: number;
}

interface StoryFeedProps {
  stories: Story[];
  onStoryTap: (index: number) => void;
  onLike: (storyId: string) => void;
  onCreate?: () => void;
  onSearch?: () => void;
  onPlanSimilar?: (story: Story) => void;
  onBookAdventure?: (story: Story) => void;
  onComment?: (storyId: string) => void;
  onSave?: (storyId: string, isCurrentlySaved: boolean) => void;
  fullScreen?: boolean;
}

const formatCount = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
};

export const StoryFeed: React.FC<StoryFeedProps> = ({ stories, onStoryTap, onLike, onCreate, onPlanSimilar, onBookAdventure, onComment, onSave, fullScreen = false }) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isArabic = i18n.language?.startsWith('ar');
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showShareFor, setShowShareFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [activeMediaByStory, setActiveMediaByStory] = useState<Record<string, { src: string; index: number; total: number }>>({});
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  // Load following status for all story authors
  useEffect(() => {
    if (!user) return;
    const authorIds = [...new Set(stories.map(s => s.user_id).filter(id => id !== user.id))];
    if (!authorIds.length) return;
    supabase.from('user_follows').select('following_id').eq('follower_id', user.id).in('following_id', authorIds)
      .then(({ data }) => {
        if (data) setFollowingSet(new Set(data.map(d => d.following_id)));
      });
  }, [user, stories]);

  const toggleFollow = useCallback(async (authorId: string) => {
    if (!user) { navigate('/auth'); return; }
    const wasFollowing = followingSet.has(authorId);
    setFollowingSet(prev => {
      const next = new Set(prev);
      wasFollowing ? next.delete(authorId) : next.add(authorId);
      return next;
    });
    try {
      if (wasFollowing) {
        await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('following_id', authorId);
      } else {
        await supabase.from('user_follows').insert({ follower_id: user.id, following_id: authorId });
        toast({ title: isArabic ? '✅ تمت المتابعة' : '✅ Following' });
      }
    } catch {
      setFollowingSet(prev => {
        const next = new Set(prev);
        wasFollowing ? next.add(authorId) : next.delete(authorId);
        return next;
      });
    }
  }, [user, followingSet, isArabic]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-index'));
            if (!isNaN(idx)) setActiveIdx(idx);
          }
        });
      },
      { root: container, threshold: 0.6 }
    );
    container.querySelectorAll('[data-index]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [stories]);

  const handleShare = (story: Story, platform: string) => {
    const url = `${window.location.origin}/stories?id=${story.id}`;
    const text = `${story.title} - ${story.location_name || ''}`;
    switch (platform) {
      case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank'); break;
      case 'twitter': window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank'); break;
      case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank'); break;
      case 'copy':
        navigator.clipboard.writeText(url);
        setCopiedId(story.id);
        toast({ title: isArabic ? 'تم نسخ الرابط ✅' : 'Link copied! ✅', duration: 2000 });
        setTimeout(() => setCopiedId(null), 2000);
        break;
    }
    setShowShareFor(null);
  };

  const itemHeight = fullScreen ? 'h-[100dvh]' : 'h-[80vh]';
  const containerHeight = fullScreen ? 'h-[100dvh]' : 'h-[80vh]';

  return (
    <div
      ref={containerRef}
      className={`${containerHeight} overflow-y-scroll snap-y snap-mandatory no-scrollbar ${fullScreen ? '' : 'rounded-3xl'}`}
    >
      {stories.map((story, index) => {
        const authorName = story.profiles?.full_name || (isArabic ? 'مسافر' : 'Traveler');
        const timeAgo = formatDistanceToNow(new Date(story.created_at), {
          addSuffix: true, ...(isArabic ? { locale: ar } : {}),
        });
        const isActive = activeIdx === index;
        const isExpanded = expandedStory === story.id;
        const itinerary = enrichItineraryWithActivityMedia(story.trip_data);
        const budget = story.trip_data?.budget || story.trip_data?.cost_estimate;
        const hasDetails = itinerary.length > 0 || budget || story.trip_data?.category;
        const activeMedia = activeMediaByStory[story.id];
        const mediaContext = getMediaActivityContext(story.trip_data, activeMedia?.src, isArabic);

        // Collect all media: story media_urls + activity media from trip_data
        const allMediaUrls = [...(story.media_urls || [])];
        if (itinerary.length > 0) {
          itinerary.forEach((day: any) => {
            (day.activities || []).forEach((act: any) => {
              (act.media || []).forEach((url: string) => {
                if (url && !allMediaUrls.includes(url)) allMediaUrls.push(url);
              });
            });
          });
        }

        return (
          <div key={story.id} data-index={index} className={`snap-start ${itemHeight} relative overflow-hidden`}>
            <MediaCarousel
              urls={allMediaUrls}
              videoUrl={story.video_url}
              isActive={isActive}
              isRTL={i18n.language?.startsWith('ar')}
              className="absolute inset-0 w-full h-full"
              onMediaChange={(payload) => {
                setActiveMediaByStory((prev) => {
                  const existing = prev[story.id];
                  if (existing?.src === payload.src && existing?.index === payload.index && existing?.total === payload.total) {
                    return prev;
                  }

                  return {
                    ...prev,
                    [story.id]: {
                      src: payload.src,
                      index: payload.index,
                      total: payload.total,
                    },
                  };
                });
              }}
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

            <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none" style={{ paddingTop: fullScreen ? '48px' : '0' }}>
              <div className="flex items-center gap-2 cursor-pointer pointer-events-auto" onClick={(e) => {
                e.stopPropagation();
                if (!story.user_id.startsWith('demo-')) navigate(`/profile/${story.user_id}`);
              }}>
                <div className="relative">
                  <Avatar className="w-10 h-10 ring-2 ring-accent/60">
                    <AvatarImage src={story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${story.user_id}`} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">U</AvatarFallback>
                  </Avatar>
                  {onCreate && index === 0 && (
                    <button onClick={(e) => { e.stopPropagation(); onCreate(); }}
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center border-2 border-black">
                      <Plus className="w-3 h-3 text-accent-foreground" />
                    </button>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-bold text-sm drop-shadow-lg">{authorName}</p>
                    {user && story.user_id !== user.id && (
                      <button onClick={(e) => { e.stopPropagation(); toggleFollow(story.user_id); }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all ${followingSet.has(story.user_id) ? 'bg-white/20 text-white border-white/30' : 'bg-primary text-primary-foreground border-primary'}`}>
                        {followingSet.has(story.user_id) ? (isArabic ? 'متابَع' : 'Following') : (isArabic ? 'متابعة' : 'Follow')}
                      </button>
                    )}
                  </div>
                  <p className="text-white/50 text-[10px]">@{authorName.toLowerCase().replace(/\s+/g, '')} · {timeAgo}</p>
                </div>
              </div>
              {story.location_name && (
                <Badge className="bg-white/15 backdrop-blur-md text-white border-0 gap-1 text-[10px] px-2 py-0.5 max-w-[140px] truncate cursor-pointer hover:bg-white/25 pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); navigate(`/stories?search=${encodeURIComponent(story.location_name!)}`); }}>
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{story.location_name}</span>
                </Badge>
              )}
            </div>

            <div className="absolute right-2 z-20 flex flex-col items-center gap-3 pointer-events-none" style={{ bottom: fullScreen ? 'calc(env(safe-area-inset-bottom, 0px) + 180px)' : '180px' }}>
              <button onClick={(e) => { e.stopPropagation(); onLike(story.id); }} className="flex flex-col items-center gap-0.5 pointer-events-auto active:scale-95 transition-transform">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/10 ${story.is_liked ? 'bg-red-500/30' : 'bg-black/40'}`}>
                  <Heart className={`w-5 h-5 ${story.is_liked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </div>
                <span className="text-white text-[10px] font-bold">{formatCount(story.likes_count)}</span>
              </button>

              <button onClick={(e) => { e.stopPropagation(); onComment?.(story.id); }} className="flex flex-col items-center gap-0.5 pointer-events-auto active:scale-95 transition-transform">
                <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-white text-[10px] font-bold">{formatCount(story.comments_count || 0)}</span>
              </button>

              <button onClick={(e) => { e.stopPropagation(); onSave?.(story.id, story.is_saved || false); }} className="flex flex-col items-center gap-0.5 pointer-events-auto active:scale-95 transition-transform">
                <div className={`w-11 h-11 rounded-full backdrop-blur-sm border border-white/10 flex items-center justify-center ${story.is_saved ? 'bg-accent/30' : 'bg-black/40'}`}>
                  <Bookmark className={`w-5 h-5 ${story.is_saved ? 'fill-accent text-accent' : 'text-white'}`} />
                </div>
              </button>

              <div className="relative pointer-events-auto">
                <button onClick={(e) => { e.stopPropagation(); setShowShareFor(showShareFor === story.id ? null : story.id); }} className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <Share2 className="w-5 h-5 text-white" />
                  </div>
                </button>
                {showShareFor === story.id && (
                  <div className="absolute right-14 bottom-0 bg-black/90 backdrop-blur-xl rounded-2xl p-2 flex gap-2 border border-white/10 shadow-2xl z-50" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleShare(story, 'whatsapp')} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center hover:scale-110 transition-transform">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                    <button onClick={() => handleShare(story, 'twitter')} className="w-9 h-9 rounded-full bg-black flex items-center justify-center hover:scale-110 transition-transform border border-white/20">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </button>
                    <button onClick={() => handleShare(story, 'facebook')} className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 transition-transform">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </button>
                    <button onClick={() => handleShare(story, 'copy')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:scale-110 transition-transform">
                      {copiedId === story.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                )}
              </div>

              {(story.media_urls?.length || 0) >= 2 && user?.id === story.user_id && (
                <button onClick={(e) => { e.stopPropagation(); navigate('/stories/reels', { state: { images: story.media_urls, title: story.title, location: story.location_name } }); }} className="flex flex-col items-center gap-0.5 pointer-events-auto active:scale-95 transition-transform">
                  <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <Film className="w-5 h-5 text-white" />
                  </div>
                </button>
              )}

              <div className="w-9 h-9 rounded-full border-2 border-white/30 overflow-hidden animate-spin pointer-events-none" style={{ animationDuration: '4s' }}>
                <img src={story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${story.user_id}`} alt="" className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="absolute left-3 right-16 z-20 pointer-events-none" style={{ bottom: fullScreen ? 'calc(env(safe-area-inset-bottom, 0px) + 56px)' : '16px' }}>
              <h3 className="text-white font-bold text-sm leading-tight drop-shadow-xl mb-1 line-clamp-1 pointer-events-auto select-none">{story.title}</h3>
              <p className="text-white/70 text-xs line-clamp-1 mb-1.5 pointer-events-auto select-none">{story.content}</p>

              {mediaContext && (
                <div className="mb-1.5 bg-black/45 backdrop-blur-md rounded-lg px-2 py-1 border border-white/10 max-w-[92%] pointer-events-auto">
                  <p className="text-[10px] text-white/90 font-semibold truncate">
                    {mediaContext.activityName}
                  </p>
                  <p className="text-[9px] text-white/65 truncate">
                    {mediaContext.dayLabel}
                    {mediaContext.locationName ? ` • ${mediaContext.locationName}` : ''}
                  </p>
                </div>
              )}

              {hasDetails && (
                <div className="flex items-center gap-2 mb-1.5 flex-wrap pointer-events-auto">
                  {story.trip_data?.category && (
                    <Badge className="bg-accent/80 text-accent-foreground border-0 text-[9px] px-1.5 py-0 uppercase tracking-wider font-bold h-5">
                      {story.trip_data.category}
                    </Badge>
                  )}
                  {budget && (
                    <span className="text-white/60 text-[10px] flex items-center gap-0.5">
                      <DollarSign className="w-2.5 h-2.5" />{typeof budget === 'number' ? `$${budget}` : budget}
                    </span>
                  )}
                  {itinerary.length > 0 && (
                    <span className="text-white/60 text-[10px] flex items-center gap-0.5">
                      <CalendarDays className="w-2.5 h-2.5" />{itinerary.length} {isArabic ? 'أيام' : 'days'}
                    </span>
                  )}
                  {itinerary.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); setExpandedStory(isExpanded ? null : story.id); }}
                      className="text-accent text-[10px] flex items-center gap-0.5 hover:text-accent/80 transition-colors font-semibold bg-black/35 px-2 py-0.5 rounded-full active:scale-95">
                      <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      {isArabic ? 'الخطة الكاملة' : 'Full Plan'}
                    </button>
                  )}
                </div>
              )}

              <AnimatePresence>
                {isExpanded && itinerary.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="bg-black/70 backdrop-blur-lg rounded-xl p-3 mb-1.5 max-h-[55vh] overflow-y-auto no-scrollbar border border-white/10 pointer-events-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                      <CalendarDays className="w-4 h-4 text-accent" />
                      <span className="text-white font-bold text-xs">{isArabic ? 'خطة الرحلة الكاملة' : 'Full Trip Plan'}</span>
                      <span className="text-white/40 text-[10px] ml-auto">{itinerary.length} {isArabic ? 'أيام' : 'days'}</span>
                    </div>

                    {itinerary.map((day: any, di: number) => (
                      <div key={di} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                            <span className="text-accent text-[10px] font-bold">{di + 1}</span>
                          </div>
                          <p className="text-white/90 text-[11px] font-bold">
                            {day.date || `${isArabic ? 'اليوم' : 'Day'} ${di + 1}`}
                          </p>
                        </div>
                        {(day.activities || []).map((act: any, ai: number) => {
                          const actName = act.name || act.title || '';
                          const actLocation = act.location || act.address || '';
                          const mapQuery = `${actName} ${actLocation}`.trim();
                          const mapUrl = mapQuery
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
                            : (act.latitude && act.longitude ? `https://www.google.com/maps?q=${act.latitude},${act.longitude}` : null);
                          const actImage = act.image || (act.media && act.media[0]) || null;

                          return (
                            <div key={ai} className="ml-3 mb-2 bg-white/8 rounded-xl p-2.5 border-l-2 border-accent/50">
                              <div className="flex items-start gap-2">
                                {actImage && (
                                  <img src={actImage} alt={actName} className="w-14 h-14 rounded-lg object-cover shrink-0 border border-white/15" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                    {act.time && <span className="text-accent text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">{act.time}</span>}
                                    <span className="text-white/95 text-[11px] font-bold">{actName}</span>
                                    {act.rating && <span className="text-amber-400 text-[9px]">⭐{act.rating}</span>}
                                  </div>
                                  {actLocation && (
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <MapPin className="w-2 h-2 shrink-0 text-white/40" />
                                      <span className="text-white/50 text-[9px] truncate">{actLocation}</span>
                                      {mapUrl && (
                                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                          className="text-accent text-[8px] hover:underline shrink-0">📍</a>
                                      )}
                                    </div>
                                  )}
                                  {act.openingHours && (
                                    <p className="text-white/40 text-[8px] flex items-center gap-0.5">
                                      <Clock className="w-2 h-2" />{act.openingHours}
                                    </p>
                                  )}
                                  {act.description && (
                                    <p className="text-white/50 text-[9px] mt-0.5 line-clamp-2">{act.description}</p>
                                  )}
                                  {act.media && act.media.length > 0 && (
                                    <div className="flex gap-1 mt-1.5 overflow-x-auto no-scrollbar">
                                      {act.media.slice(0, 4).map((m: string, mi: number) => (
                                        <img key={mi} src={m} alt="" className="w-10 h-10 rounded-md object-cover shrink-0 border border-white/15" />
                                      ))}
                                      {act.media.length > 4 && (
                                        <span className="text-white/40 text-[8px] self-center ml-1">+{act.media.length - 4}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-0.5 shrink-0">
                                  {(act.cost > 0 || act.price > 0) && <span className="text-accent text-[9px] font-bold">${act.cost || act.price}</span>}
                                  {act.duration && <span className="text-white/30 text-[8px]">{act.duration}</span>}
                                  {(act.type || act.category) && <span className="text-white/30 text-[7px] bg-white/5 px-1 rounded">{act.type || act.category}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {(story.trip_data?.budget || story.trip_data?.cost_estimate) && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                        <DollarSign className="w-3 h-3 text-accent" />
                        <span className="text-white/70 text-[10px]">{isArabic ? 'إجمالي الميزانية:' : 'Total Budget:'}</span>
                        <span className="text-accent text-[11px] font-bold">${story.trip_data?.budget || story.trip_data?.cost_estimate}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="pointer-events-auto">
                <StoryTags hashtags={story.trip_data?.hashtags} topics={story.trip_data?.topics} locationName={story.location_name} />
              </div>

              <div className="flex gap-2 mt-2 flex-wrap pointer-events-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white/20 backdrop-blur-md border-white/30 text-white hover:bg-white/30 text-[11px] h-8 rounded-full gap-1.5 px-4 active:scale-95"
                  onClick={(e) => { e.stopPropagation(); onStoryTap(index); }}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  {isArabic ? 'تفاصيل القصة' : 'Story Details'}
                </Button>
                <Button size="sm"
                  className="bg-accent/90 hover:bg-accent text-accent-foreground text-[11px] h-8 rounded-full gap-1.5 px-4 shadow-lg active:scale-95"
                  onClick={(e) => { e.stopPropagation(); onBookAdventure?.(story); }}>
                  <Plane className="w-3.5 h-3.5" />
                  {isArabic ? 'احجز' : 'Book'}
                </Button>
                <Button size="sm" variant="outline"
                  className="bg-white/20 backdrop-blur-md border-white/30 text-white hover:bg-white/30 text-[11px] h-8 rounded-full gap-1.5 px-4 active:scale-95"
                  onClick={(e) => { e.stopPropagation(); onPlanSimilar?.(story); }}>
                  <Route className="w-3.5 h-3.5" />
                  {isArabic ? 'رحلة مشابهة' : 'Similar Trip'}
                </Button>
              </div>

              {story.video_url && (
                <div className="flex items-center gap-1.5 mt-1.5 pointer-events-none">
                  <Music2 className="w-3 h-3 text-white/60" />
                  <div className="overflow-hidden flex-1">
                    <motion.span animate={{ x: [0, -100, 0] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                      className="text-white/50 text-[10px] whitespace-nowrap inline-block">
                      ♫ {isArabic ? 'صوت أصلي' : 'Original sound'} — {authorName}
                    </motion.span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};