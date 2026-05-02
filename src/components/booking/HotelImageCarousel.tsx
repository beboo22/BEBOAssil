import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, Hotel as HotelIcon, X, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import hotelFallbackLobby from "@/assets/hotel-fallback-lobby.jpg";

interface HotelImageCarouselProps {
  images: Array<string | { thumbnail?: string; original?: string }>;
  alt: string;
  className?: string;
  fallbackQuery?: string;
  enableLightbox?: boolean;
}

/**
 * Hotel image carousel: prev/next nav, swipe, dots, counter, fullscreen lightbox,
 * keyboard arrows, and graceful fallbacks. Buttons are always visible on mobile
 * and revealed on hover for desktop.
 */
const HotelImageCarousel = ({
  images,
  alt,
  className = "",
  fallbackQuery,
  enableLightbox = true,
}: HotelImageCarouselProps) => {
  const initialUrls: string[] = useMemo(() => (images || [])
    .map((im) => (typeof im === "string" ? im : im?.original || im?.thumbnail || ""))
    .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)))
    .filter((u, i, all) => all.indexOf(u) === i), [images]);

  const [idx, setIdx] = useState(0);
  const [apiUrls, setApiUrls] = useState<string[]>(initialUrls);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [retryCounts, setRetryCounts] = useState<Record<string, number>>({});
  const [retryNonce, setRetryNonce] = useState(0);
  const [loadingApiPhotos, setLoadingApiPhotos] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const photoQuery = (fallbackQuery || alt || "").trim();

  useEffect(() => {
    setApiUrls(initialUrls);
    setFailedUrls({});
    setRetryCounts({});
    setIdx(0);
  }, [initialUrls.join("|")]);

  useEffect(() => {
    if (!photoQuery) return;
    let cancelled = false;
    setLoadingApiPhotos(true);

    supabase.functions.invoke("serpapi-photos", { body: { query: `${photoQuery} hotel` } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.success) {
          console.warn("[hotel-images] API photo lookup failed", { hotel: photoQuery, error: error?.message || data?.error });
          return;
        }
        const fetched = (data.photos || [])
          .map((p: any) => p?.image || p?.original || p?.thumbnail)
          .filter((u: any): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
        if (fetched.length > 0) {
          setApiUrls((current) => [...fetched, ...current].filter((u, i, all) => all.indexOf(u) === i).slice(0, 12));
        } else {
          console.warn("[hotel-images] API photo lookup returned no usable photos", { hotel: photoQuery });
        }
      })
      .catch((error) => console.warn("[hotel-images] API photo lookup exception", { hotel: photoQuery, error }))
      .finally(() => {
        if (!cancelled) setLoadingApiPhotos(false);
      });

    return () => { cancelled = true; };
  }, [photoQuery]);

  const urls = apiUrls.filter((u) => !failedUrls[u]);

  const withRetryParam = (url: string, retry: number) => {
    if (retry <= 0) return url;
    return `${url}${url.includes("?") ? "&" : "?"}hotel_img_retry=${retry}-${retryNonce}`;
  };

  const handleImageError = (url: string) => {
    if (!url) return;
    const currentRetry = retryCounts[url] || 0;
    if (currentRetry < 2) {
      console.warn("[hotel-images] API image failed, retrying", { hotel: photoQuery || alt, url, attempt: currentRetry + 1 });
      setRetryCounts((p) => ({ ...p, [url]: currentRetry + 1 }));
      setRetryNonce(Date.now());
      return;
    }
    console.warn("[hotel-images] API image failed after retries; moving to next source", { hotel: photoQuery || alt, url });
    setFailedUrls((p) => ({ ...p, [url]: true }));
    setIdx(0);
  };

  const total = urls.length;
  const safeIdx = total > 0 ? ((idx % total) + total) % total : 0;

  const next = useCallback(() => setIdx((c) => (c + 1)), []);
  const prev = useCallback(() => setIdx((c) => (c - 1)), []);

  // Keyboard nav inside lightbox
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") setLightbox(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, next, prev]);

  if (total === 0) {
    return (
      <div className={`relative w-full h-full flex items-center justify-center bg-muted ${className}`}>
        {!loadingApiPhotos && (
          <img
            src={hotelFallbackLobby}
            alt={alt || "Hotel"}
            loading="lazy"
            decoding="async"
            width={1280}
            height={832}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-background/10" />
        <HotelIcon size={48} className="relative z-10 text-background/80 drop-shadow" />
      </div>
    );
  }

  const currentRawSrc = urls[safeIdx];
  const currentSrc = withRetryParam(currentRawSrc, retryCounts[currentRawSrc] || 0);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const go = (delta: number) => (e: React.MouseEvent) => {
    stop(e);
    setIdx((c) => c + delta);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    touchStartX.current = null;
  };

  const openLightbox = (e: React.MouseEvent) => {
    if (!enableLightbox) return;
    stop(e);
    setLightbox(true);
  };

  return (
    <>
      <div
        className={`group relative w-full h-full overflow-hidden bg-muted ${className}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={currentSrc}
          alt={`${alt} (${safeIdx + 1}/${total})`}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-opacity duration-300 ${enableLightbox ? "cursor-zoom-in" : ""}`}
          onClick={openLightbox}
          onError={() => handleImageError(currentRawSrc)}
        />

        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/85 hover:bg-background text-foreground shadow-lg backdrop-blur-sm flex items-center justify-center transition-all md:opacity-0 md:group-hover:opacity-100"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-background/85 hover:bg-background text-foreground shadow-lg backdrop-blur-sm flex items-center justify-center transition-all md:opacity-0 md:group-hover:opacity-100"
            >
              <ChevronRight size={18} />
            </button>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
              {urls.slice(0, 8).map((_, i) => {
                const realIdx = total <= 8 ? i : Math.round((i / 7) * (total - 1));
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Go to image ${realIdx + 1}`}
                    onClick={(e) => {
                      stop(e);
                      setIdx(realIdx);
                    }}
                    className={`h-1.5 rounded-full transition-all ${realIdx === safeIdx ? "w-5 bg-primary" : "w-1.5 bg-background/80 hover:bg-background"}`}
                  />
                );
              })}
            </div>
          </>
        )}

        <div className="absolute top-2 right-2 z-10 bg-background/85 backdrop-blur-sm text-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
          {safeIdx + 1}/{total}
        </div>

        {enableLightbox && (
          <button
            type="button"
            aria-label="View fullscreen"
            onClick={openLightbox}
            className="absolute top-2 left-2 z-10 h-7 w-7 rounded-full bg-background/85 hover:bg-background text-foreground shadow-md backdrop-blur-sm flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setLightbox(false)}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => { stop(e); setLightbox(false); }}
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          >
            <X size={20} />
          </button>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white/10 text-white text-xs font-semibold px-3 py-1 rounded-full">
            {safeIdx + 1} / {total}
          </div>

          <img
            src={currentSrc}
            alt={alt}
            className="max-w-full max-h-full object-contain select-none"
            onClick={stop}
            onError={() => handleImageError(currentRawSrc)}
          />

          {total > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={go(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={go(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <ChevronRight size={28} />
              </button>

              {/* Thumbnails strip */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 max-w-[90vw] overflow-x-auto px-2 py-1 bg-white/5 rounded-lg backdrop-blur-sm">
                {urls.map((u, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { stop(e); setIdx(i); }}
                    className={`shrink-0 h-14 w-20 rounded-md overflow-hidden border-2 transition-all ${i === safeIdx ? "border-primary scale-105" : "border-transparent opacity-60 hover:opacity-100"}`}
                  >
                    <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default HotelImageCarousel;
