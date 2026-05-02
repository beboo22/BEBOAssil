import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Heart, MessageCircle, MapPin, Calendar, Plane, User, Bookmark, Share2, Eye, Film, Play, Copy, Link2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getYouTubeThumbnail } from "@/utils/youtube";
import { useTranslation } from "react-i18next";
import { StoryTags } from "./HashtagSystem";
import { supabase } from "@/integrations/supabase/client";
import { awardPoints } from "@/utils/pointsSystem";
import { ReelsExport } from "./ReelsExport";

interface Story {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  media_urls?: string[];
  video_url?: string;
  trip_data?: any;
  likes_count: number;
  created_at: string;
  user_id: string;
  profiles?: { full_name?: string; avatar_url?: string; username?: string };
  is_liked?: boolean;
  is_saved?: boolean;
  comments_count?: number;
}

interface StoryCardProps {
  story: Story;
  onLike: () => void;
  onPlanSimilar: () => void;
  onBookSimilar: () => void;
  onComment?: () => void;
  onSave?: (e: React.MouseEvent) => void;
  currentUser?: any;
}

export const StoryCard = ({ story, onLike, onPlanSimilar, onBookSimilar, onComment, onSave, currentUser }: StoryCardProps) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [showReels, setShowReels] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Intersection Observer for autoplay
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto play/pause video based on visibility
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isVisible) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isVisible]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');

  // Detect if story has a video (direct video_url or video file in media_urls)
  const videoInMedia = story.media_urls?.find(u => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u));
  const hasVideo = !!(story.video_url || videoInMedia);
  const videoSrc = videoInMedia || story.video_url;
  const isYouTube = story.video_url && !videoInMedia && /youtu/i.test(story.video_url);

  const displayImage = story.media_urls && story.media_urls.length > 0 && story.media_urls[0] !== '/placeholder.svg'
    ? (videoInMedia ? (story.media_urls.find(u => !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) || null) : story.media_urls[0])
    : story.video_url
    ? getYouTubeThumbnail(story.video_url)
    : null;

  const authorName = story.profiles?.full_name || (isArabic ? "مسافر مجهول" : "Anonymous Traveler");
  const authorUsername = story.profiles?.username;
  const timeAgo = formatDistanceToNow(new Date(story.created_at), { addSuffix: true, ...(isArabic ? { locale: ar } : {}) });
  const category = story.trip_data?.category;

  const handleShare = async (platform?: string) => {
    const url = `${window.location.origin}/stories?id=${story.id}`;
    const byLine = authorUsername ? ` by @${authorUsername}` : '';
    const text = `${story.title} - ${story.location_name || ''}${byLine}`;
    
    // Award points for sharing (only if user is logged in)
    if (currentUser) {
      try {
        await awardPoints({ 
          userId: currentUser.id, 
          action: 'SHARE_STORY', 
          reason: `Shared story: ${story.title} to ${platform || 'clipboard'}` 
        });
      } catch (e) {
        console.error('[points] Failed to award points for share:', e);
      }
    }

    switch (platform) {
      case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank'); break;
      case 'twitter': window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank'); break;
      case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank'); break;
      default:
        navigator.clipboard.writeText(url);
        toast({ title: t('stories.linkCopied', { defaultValue: 'Link copied! ✅' }) });
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    if (onSave) {
      onSave(e);
    } else {
      // Fallback for demo/standalone if needed
      setSaved(!saved);
    }
  };

  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (story.location_name) {
      navigate(`/stories?search=${encodeURIComponent(story.location_name)}`);
    }
  };

  return (
    <motion.div whileHover={{ y: -6 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <Card className="overflow-hidden bg-card border-border/50 shadow-sm hover:shadow-2xl transition-all duration-500 rounded-3xl group">
        {/* Image Section */}
        <div ref={cardRef} className="relative overflow-hidden">
          <AspectRatio ratio={16 / 10}>
            {/* Video inline preview - autoplay on visibility */}
            {hasVideo && videoSrc && !isYouTube ? (
              <>
                <video
                  ref={videoRef}
                  src={isVisible ? videoSrc : undefined}
                  preload="metadata"
                  className={`object-cover w-full h-full transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-70'}`}
                  muted loop playsInline
                />
                {/* Poster image overlay when not playing */}
                {displayImage && !isVisible && (
                  <img
                    src={displayImage}
                    alt={story.title}
                    className="absolute inset-0 object-cover w-full h-full"
                  />
                )}
              </>
            ) : displayImage ? (
              <img
                src={displayImage}
                alt={story.title}
                className={`object-cover w-full h-full transition-all duration-700 group-hover:scale-110 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/10 to-muted flex items-center justify-center">
                <MapPin className="w-12 h-12 text-primary/30" />
              </div>
            )}
            {imageLoading && displayImage && (
              <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            )}
          </AspectRatio>

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

          {/* Reels / Video indicator */}
          {hasVideo && (
            <>
              <div className="absolute top-3 right-14 z-10">
                <Badge className="bg-black/50 backdrop-blur-md text-white border-0 gap-1 text-[10px] px-2 py-1 font-bold uppercase tracking-wider shadow-lg">
                  <Film className="w-3 h-3" />
                  Reels
                </Badge>
              </div>
              {!isVisible && (
                <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-xl">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Media count badge */}
          {story.media_urls && story.media_urls.length > 1 && (
            <div className="absolute bottom-10 right-3 z-10">
              <Badge className="bg-black/40 backdrop-blur-md text-white border-0 text-[10px] px-2 py-0.5 font-medium">
                {story.media_urls.filter(u => !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)).length} 📷
                {story.media_urls.filter(u => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)).length > 0 && (
                  <> · {story.media_urls.filter(u => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)).length} 🎬</>
                )}
              </Badge>
            </div>
          )}

          {/* Top badges */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
            {story.location_name && (
              <Badge
                className="bg-white/15 backdrop-blur-xl text-white border-0 gap-1.5 text-xs px-3 py-1.5 shadow-lg cursor-pointer hover:bg-white/30 transition-all"
                onClick={handleLocationClick}
              >
                <MapPin className="w-3 h-3" />
                {story.location_name}
              </Badge>
            )}
            <button
              onClick={handleSave}
              className="w-9 h-9 rounded-full bg-white/15 backdrop-blur-xl flex items-center justify-center hover:bg-white/30 transition-all border border-white/10 shadow-lg"
            >
              <Bookmark className={`w-4 h-4 transition-all ${story.is_saved ? 'fill-white text-white scale-110' : 'text-white'}`} />
            </button>
          </div>

          {/* Category chip */}
          {category && (
            <div className="absolute top-3 left-3 mt-9">
              <Badge className="bg-accent/90 text-accent-foreground border-0 text-[10px] px-2 py-0.5 uppercase tracking-wider font-semibold">
                {category}
              </Badge>
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-white font-bold text-lg leading-tight drop-shadow-xl line-clamp-2">{story.title}</h3>
          </div>
        </div>

        {/* Author & Content */}
        <CardContent className="p-5">
          <div
            className="flex items-center gap-3 mb-3 cursor-pointer group/author"
            onClick={() => navigate(`/profile/${story.user_id}`)}
          >
            <Avatar className="w-9 h-9 ring-2 ring-primary/20 group-hover/author:ring-primary/50 transition-all">
              <AvatarImage src={story.profiles?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs"><User className="w-4 h-4" /></AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate group-hover/author:text-primary transition-colors">{authorName}</p>
              {authorUsername && <p className="text-[10px] text-primary/70 truncate">@{authorUsername}</p>}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" />{timeAgo}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2">
            {story.content?.replace(/https?:\/\/\S+/g, '').replace(/🗺️\s*/g, '').replace(/📋\s*/g, '').replace(/🎯\s*/g, '').trim()}
          </p>
          <StoryTags hashtags={story.trip_data?.hashtags} topics={story.trip_data?.topics} />
        </CardContent>

        {/* Actions */}
        <CardFooter className="pt-0 pb-4 px-5 flex flex-col gap-3">
          <div className="flex items-center justify-between w-full border-t border-border/50 pt-3">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost" size="sm" onClick={onLike} disabled={!currentUser}
                className={`rounded-full px-3 h-9 gap-1.5 transition-all duration-300 ${
                  story.is_liked
                    ? 'text-destructive bg-destructive/10 hover:bg-destructive/20'
                    : 'text-muted-foreground hover:text-destructive hover:bg-destructive/5'
                }`}
              >
                <Heart className={`w-4 h-4 transition-all duration-300 ${story.is_liked ? 'fill-current scale-110' : ''}`} />
                <span className="text-xs font-semibold">{story.likes_count.toLocaleString('en-US')}</span>
              </Button>
              <Button
                variant="ghost" size="sm" onClick={onComment}
                className="rounded-full px-3 h-9 gap-1.5 text-muted-foreground hover:text-primary hover:bg-primary/5"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">{(story.comments_count || 0).toLocaleString('en-US')}</span>
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost" size="sm"
                    className="rounded-full px-3 h-9 text-muted-foreground hover:text-primary hover:bg-primary/5"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2 bg-black/90 backdrop-blur-xl border-white/10 shadow-2xl" align="start" side="top">
                  <div className="flex gap-2">
                    <button onClick={() => handleShare('copy')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:scale-110 transition-transform">
                      <Copy className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => handleShare('facebook')} className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center hover:scale-110 transition-transform">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </button>
                    <button onClick={() => handleShare('twitter')} className="w-9 h-9 rounded-full bg-black flex items-center justify-center hover:scale-110 transition-transform border border-white/20">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </button>
                    <button onClick={() => handleShare('whatsapp')} className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center hover:scale-110 transition-transform">
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              {story.media_urls && story.media_urls.length >= 2 && currentUser?.id === story.user_id && (
                <Button
                  variant="ghost" size="sm" onClick={() => setShowReels(true)}
                  className="rounded-full px-3 h-9 text-muted-foreground hover:text-accent hover:bg-accent/5"
                >
                  <Film className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex gap-2 w-full">
            <Button
              onClick={onPlanSimilar}
              variant="outline"
              size="sm"
              className="flex-1 text-xs h-10 gap-1.5 border-primary/25 text-primary hover:bg-primary hover:text-primary-foreground rounded-xl transition-all duration-300"
            >
              <Plane className="w-3.5 h-3.5" />
              {t('stories.planSimilar', { defaultValue: 'Plan Similar' })}
            </Button>
            <Button
              onClick={onBookSimilar}
              size="sm"
              className="flex-1 text-xs h-10 bg-accent hover:bg-accent/90 text-accent-foreground rounded-xl shadow-md shadow-accent/15"
            >
              {t('stories.bookAdventure', { defaultValue: 'Book Adventure' })}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Reels Export Dialog - only for story owner */}
      {story.media_urls && story.media_urls.length >= 2 && currentUser?.id === story.user_id && (
        <ReelsExport
          images={story.media_urls.filter(u => !/\.(mp4|webm|mov)(\?|$)/i.test(u))}
          title={story.title}
          location={story.location_name}
          authorName={story.profiles?.full_name}
          open={showReels}
          onOpenChange={setShowReels}
        />
      )}
    </motion.div>
  );
};
