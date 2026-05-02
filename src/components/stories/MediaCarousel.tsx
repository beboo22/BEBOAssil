import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';


interface MediaCarouselProps {
  urls: string[];
  videoUrl?: string | null;
  isActive?: boolean;
  muted?: boolean;
  className?: string;
  isRTL?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onMediaChange?: (payload: {
    index: number;
    total: number;
    itemType: 'image' | 'video' | 'youtube';
    src: string;
  }) => void;
}

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg|m4v)(\?|$)/i.test(url);
const getMediaSrc = (url: string) => url.trim();

const normalizeMediaKey = (url: string) => {
  const raw = getMediaSrc(url);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return raw.split('?')[0].split('#')[0].toLowerCase();
  }
};

const getVideoMimeType = (url: string) => {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.m4v')) return 'video/mp4';
  if (cleanUrl.endsWith('.mov')) return 'video/quicktime';
  if (cleanUrl.endsWith('.webm')) return 'video/webm';
  if (cleanUrl.endsWith('.ogg')) return 'video/ogg';
  return 'video/mp4';
};

const getYouTubeEmbedUrl = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1&mute=1&loop=1&controls=0&playsinline=1` : null;
};

export const MediaCarousel: React.FC<MediaCarouselProps> = ({
  urls,
  videoUrl,
  isActive = true,
  muted = true,
  className,
  isRTL,
  onPause,
  onResume,
  onMediaChange,
}) => {
  const [current, setCurrent] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const swiping = useRef(false);
  const gestureLocked = useRef<'x' | 'y' | null>(null);
  const moved = useRef(false);
  const lastSwipeAt = useRef(0);

  const items = useMemo(() => {
    const all: { type: 'image' | 'video' | 'youtube'; src: string }[] = [];
    const seen = new Set<string>();

    urls.filter(Boolean).forEach((url) => {
      const src = getMediaSrc(url);
      const key = normalizeMediaKey(src);
      if (!src || !key || seen.has(key)) return;
      seen.add(key);
      all.push({ type: isVideoUrl(src) ? 'video' : 'image', src });
    });

    if (videoUrl?.trim()) {
      const source = getMediaSrc(videoUrl);
      const key = normalizeMediaKey(source);
      if (source && key && !seen.has(key)) {
        const embed = getYouTubeEmbedUrl(source);
        all.push({ type: embed ? 'youtube' : isVideoUrl(source) ? 'video' : 'image', src: embed || source });
      }
    }

    return all;
  }, [urls, videoUrl]);

  const mediaSignature = useMemo(() => items.map((item) => `${item.type}:${item.src}`).join('|'), [items]);

  useEffect(() => {
    if (!items.length) {
      setCurrent(0);
      return;
    }

    const preferredImageIndex = items.findIndex((item) => item.type === 'image');
    setCurrent((prev) => {
      if (prev >= 0 && prev < items.length) return prev;
      return preferredImageIndex >= 0 ? preferredImageIndex : 0;
    });
  }, [mediaSignature, items]);

  useEffect(() => {
    if (current > items.length - 1) setCurrent(0);
  }, [items.length, current]);

  const currentItem = items[current] || items[0] || null;
  const hasMultiple = items.length > 1;

  useEffect(() => {
    if (!currentItem || !onMediaChange) return;
    onMediaChange({
      index: current,
      total: items.length,
      itemType: currentItem.type,
      src: currentItem.src,
    });
  }, [current, currentItem, items.length, onMediaChange]);

  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    setVideoLoaded(false);
    setVideoError(false);
  }, [current]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive && currentItem?.type === 'video' && !isPaused) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isActive, current, currentItem?.type, isPaused]);

  useEffect(() => {
    if (currentItem?.type !== 'video' || videoLoaded || videoError) return;
    const timeout = window.setTimeout(() => {
      setVideoError(true);
      setVideoLoaded(true);
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [currentItem?.type, currentItem?.src, videoLoaded, videoError]);

  const goNext = useCallback(() => {
    setCurrent((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const goPrev = useCallback(() => {
    setCurrent((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
    gestureLocked.current = null;
    moved.current = false;

    longPressTimer.current = window.setTimeout(() => {
      setIsPaused(true);
      onPause?.();
    }, 500);
  }, [onPause]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    const diffX = Math.abs(deltaX);
    const diffY = Math.abs(deltaY);

    if (diffX + diffY > 6) {
      moved.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    if (!gestureLocked.current && (diffX > 8 || diffY > 8)) {
      gestureLocked.current = diffX > diffY ? 'x' : 'y';
    }

    if (gestureLocked.current === 'x' && diffX > 10 && hasMultiple) {
      swiping.current = true;
      e.preventDefault();
      e.stopPropagation();
    }
  }, [hasMultiple]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isPaused) {
      setIsPaused(false);
      onResume?.();
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    if (touchStartX.current === null || touchStartY.current === null) return;

    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    const absDiffX = Math.abs(diffX);

    if (gestureLocked.current === 'x' && absDiffX > 24 && absDiffX > diffY && hasMultiple) {
      if (diffX > 0) goNext();
      else goPrev();
      lastSwipeAt.current = Date.now();
      e.preventDefault();
      e.stopPropagation();
    } else if (!moved.current && absDiffX < 10 && diffY < 10 && hasMultiple) {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const clientX = e.changedTouches[0].clientX;
      const relativeX = (clientX - rect.left) / rect.width;
      if (isRTL) {
        if (relativeX < 0.35) goNext();
        else if (relativeX > 0.65) goPrev();
      } else {
        if (relativeX < 0.35) goPrev();
        else if (relativeX > 0.65) goNext();
      }
      lastSwipeAt.current = Date.now();
      e.preventDefault();
      e.stopPropagation();
    }

    touchStartX.current = null;
    touchStartY.current = null;
    gestureLocked.current = null;
    moved.current = false;
    swiping.current = false;
  }, [isPaused, hasMultiple, goNext, goPrev, onResume, isRTL]);

  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartX.current = null;
    touchStartY.current = null;
    gestureLocked.current = null;
    moved.current = false;
    swiping.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (Date.now() - lastSwipeAt.current < 300) return;
    if (!hasMultiple) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width;
    if (isRTL) {
      if (relativeX < 0.35) goNext();
      else if (relativeX > 0.65) goPrev();
    } else {
      if (relativeX < 0.35) goPrev();
      else if (relativeX > 0.65) goNext();
    }
  }, [hasMultiple, goPrev, goNext, isRTL]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className={`relative bg-gradient-to-br from-primary/80 via-accent/50 to-primary/60 ${className || ''} flex items-center justify-center overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-t from-background/35 via-transparent to-background/10" />
        <div className="text-primary-foreground/80 text-center z-10 px-4">
          <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
          <p className="text-xs font-medium">No media yet</p>
        </div>
      </div>
    );
  }

  const hasPosterImage = urls.find((u) => u && !isVideoUrl(u));

  return (
    <div
      className={`relative ${className || ''} touch-pan-y overflow-hidden`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onClick={handleClick}
      style={{ touchAction: hasMultiple ? 'pan-y' : 'auto' }}
    >
      {currentItem?.type === 'image' && !imgLoaded && !imgError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {currentItem?.type === 'video' && !videoLoaded && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isPaused && (
        <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="flex gap-1.5">
              <div className="w-3 h-8 bg-white rounded-sm" />
              <div className="w-3 h-8 bg-white rounded-sm" />
            </div>
          </div>
        </div>
      )}

      {currentItem?.type === 'video' && videoError && hasPosterImage ? (
        <div className="absolute inset-0 bg-black/60">
          <img src={hasPosterImage} alt="" className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-40 scale-110" aria-hidden="true" />
          <img src={hasPosterImage} alt="Story media fallback" className="relative w-full h-full object-contain z-10" loading="lazy" decoding="async" />
        </div>
      ) : currentItem?.type === 'video' ? (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-contain z-10 relative"
            loop muted={muted} playsInline autoPlay={isActive}
            preload={isActive ? 'auto' : 'metadata'}
            poster={hasPosterImage || undefined}
            controls={false}
            onLoadedMetadata={() => setVideoLoaded(true)}
            onLoadedData={() => setVideoLoaded(true)}
            onCanPlay={() => setVideoLoaded(true)}
            onStalled={() => { if (!videoLoaded) { setVideoError(true); setVideoLoaded(true); } }}
            onError={() => { setVideoError(true); setVideoLoaded(true); }}
          >
            <source src={currentItem.src} type={getVideoMimeType(currentItem.src)} />
          </video>
        </div>
      ) : currentItem?.type === 'youtube' ? (
        <div className="absolute inset-0 bg-black">
          <iframe title="Story media video" src={isActive ? currentItem.src : 'about:blank'} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media" allowFullScreen style={{ border: 0 }} />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 overflow-hidden">
          <img 
            src={currentItem?.src} 
            alt="" 
            className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30 scale-110 pointer-events-none"
            aria-hidden="true"
          />
          <img
            src={currentItem?.src}
            alt="Story media"
            className="relative max-w-full max-h-full object-contain z-10 drop-shadow-2xl"
            loading={isActive ? 'eager' : 'lazy'}
            fetchPriority={isActive ? 'high' : 'auto'}
            decoding="async"
            style={{ imageRendering: 'auto' }}
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true); }}
          />
        </div>
      )}

      {((imgError && currentItem?.type === 'image') || (videoError && currentItem?.type === 'video' && !hasPosterImage)) && (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 via-accent/40 to-primary/50 flex items-center justify-center">
          <div className="text-white/50 text-center">
            <svg className="w-10 h-10 mx-auto mb-1 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <p className="text-xs">Media unavailable</p>
          </div>
        </div>
      )}

      {hasMultiple && (
        <div className="absolute top-2 left-3 right-3 z-20 flex gap-1">
          {items.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full overflow-hidden bg-white/25">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: i <= current ? '100%' : '0%' }}
              />
            </div>
          ))}
        </div>
      )}

      {hasMultiple && (
        <div className="absolute top-6 right-3 z-20">
          <span className="bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
            {current + 1}/{items.length}
          </span>
        </div>
      )}

      {hasMultiple && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-1.5 z-40 pointer-events-auto bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/5">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
              className={`transition-all duration-300 rounded-full ${
                i === current 
                  ? 'w-4 h-1.5 bg-accent shadow-[0_0_8px_rgba(var(--accent),0.5)]' 
                  : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/60'
              }`}
              aria-label={`Go to media ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};