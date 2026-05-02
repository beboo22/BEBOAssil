import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Heart, Share2, Star,
  ShoppingCart, Download, FileText, Package, CheckCircle2, Clock,
  ShieldCheck, Mail, Loader2, Receipt, MessageSquare, Archive,
} from "lucide-react";
import JSZip from "jszip";
import { Skeleton } from "@/components/ui/skeleton";
import { inferDownloadFilename, triggerFileDownload } from "@/lib/fileDownload";

import stickersPack from "@/assets/products/stickers-pack.jpg";
import plannerTemplate from "@/assets/products/planner-template.jpg";
import travelJournal from "@/assets/products/travel-journal.jpg";
import photoPresets from "@/assets/products/photo-presets.jpg";
import cityGuides from "@/assets/products/city-guides.jpg";
import budgetTracker from "@/assets/products/budget-tracker.jpg";

const FALLBACK_IMAGES: Record<string, string> = {
  stickers: stickersPack, digital_stickers: stickersPack, templates: plannerTemplate,
  digital: photoPresets, guides: cityGuides, accessories: budgetTracker, general: travelJournal,
};

interface Product {
  id: string; name: string; name_ar: string | null; description: string; description_ar: string | null;
  category: string; price: number; original_price: number | null; currency: string; media_urls: string[];
  stock_quantity: number; is_featured: boolean; tags: string[]; specs: any;
}

interface Review {
  id: string; rating: number; comment: string | null; user_name: string | null; created_at: string;
}

interface Order {
  id: string; status: string; created_at: string; quantity: number;
}

const StarRating = ({ rating, size = 14 }: { rating: number; size?: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star key={s} size={size} className={s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
    ))}
  </div>
);

const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { user } = useAuth();
  const { formatPrice } = useCurrency();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pastPurchases, setPastPurchases] = useState<Array<{ order: any; product: Product }>>([]);
  const [loading, setLoading] = useState(true);
  // Initial image index can come from query param `?img=N` (or session hint),
  // so external pages can deep-link to a specific gallery image.
  const readInitialImg = () => {
    if (typeof window === "undefined") return 0;
    const fromQuery = parseInt(new URLSearchParams(window.location.search).get("img") || "", 10);
    if (Number.isFinite(fromQuery) && fromQuery >= 0) return fromQuery;
    const fromSession = parseInt(sessionStorage.getItem(`store-img-${id}`) || "", 10);
    if (Number.isFinite(fromSession) && fromSession >= 0) {
      sessionStorage.removeItem(`store-img-${id}`);
      return fromSession;
    }
    return 0;
  };
  const [imageIdx, setImageIdx] = useState<number>(readInitialImg);
  const [wishlisted, setWishlisted] = useState(false);
  const [zipping, setZipping] = useState(false);
  const relatedScrollRef = useRef<HTMLDivElement | null>(null);
  const pastScrollRef = useRef<HTMLDivElement | null>(null);
  const [relatedDot, setRelatedDot] = useState(0);
  const [relatedDotCount, setRelatedDotCount] = useState(0);
  const [pastDot, setPastDot] = useState(0);
  const [pastDotCount, setPastDotCount] = useState(0);
  // Track image loading inside the related carousel so we can show a skeleton
  // overlay until everything is ready (prevents dot/snap jumps during layout).
  const [relatedImagesReady, setRelatedImagesReady] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    // Re-evaluate the deep-link image (?img= or session hint) for the new product
    setImageIdx(readInitialImg());
    setRelatedImagesReady(false);
    (async () => {
      const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (!data) { setLoading(false); return; }
      setProduct(data as any);
      const cat = (data as any).category;
      const [{ data: rev }, { data: relSame }] = await Promise.all([
        supabase.from("product_reviews").select("*").eq("product_id", id).order("created_at", { ascending: false }),
        supabase.from("products").select("*").eq("is_active", true).eq("category", cat).neq("id", id).limit(8),
      ]);
      let relList = (relSame || []) as any[];
      if (relList.length < 4) {
        const { data: relOther } = await supabase.from("products").select("*")
          .eq("is_active", true).neq("category", cat).neq("id", id)
          .order("is_featured", { ascending: false }).limit(8 - relList.length);
        if (relOther) relList = [...relList, ...relOther];
      }
      if (rev) setReviews(rev as any);
      setRelated(relList as any);
      setLoading(false);
      window.scrollTo(0, 0);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load purchased orders for this product (so user can see their downloads)
  useEffect(() => {
    if (!id || !user) { setOrders([]); return; }
    supabase.from("orders").select("id, status, created_at, quantity")
      .eq("user_id", user.id).eq("item_id", id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setOrders(data as any); });
  }, [id, user?.id]);

  // Load all of user's previous purchases (other than this one) for quick re-download
  useEffect(() => {
    if (!user) { setPastPurchases([]); return; }
    (async () => {
      const { data: ords } = await supabase.from("orders")
        .select("id, item_id, item_name, status, created_at, quantity, total_price, currency")
        .eq("user_id", user.id).eq("order_type", "product")
        .in("status", ["paid", "confirmed", "completed", "fulfilled"])
        .order("created_at", { ascending: false }).limit(20);
      if (!ords || ords.length === 0) { setPastPurchases([]); return; }
      const ids = [...new Set(ords.map((o: any) => o.item_id).filter((x: any) => x && x !== id))];
      if (ids.length === 0) { setPastPurchases([]); return; }
      const { data: prods } = await supabase.from("products")
        .select("id, name, name_ar, media_urls, specs, category, price, currency, description, description_ar, original_price, stock_quantity, is_featured, tags")
        .in("id", ids);
      const map: Record<string, Product> = {};
      (prods || []).forEach((p: any) => { map[p.id] = p; });
      const seen = new Set<string>();
      const list: Array<{ order: any; product: Product }> = [];
      for (const o of ords) {
        if (seen.has(o.item_id) || !map[o.item_id]) continue;
        seen.add(o.item_id);
        list.push({ order: o, product: map[o.item_id] });
      }
      setPastPurchases(list);
    })();
  }, [user?.id, id]);

  // Inject dynamic OG / Twitter / canonical tags so social shares (WhatsApp, Telegram, X, FB)
  // display the product image, name and site logo. Restores defaults on unmount.
  useEffect(() => {
    if (!product) return;
    const isAr = i18n.language === "ar";
    const productName = isAr ? (product.name_ar || product.name) : product.name;
    const productDesc = (isAr ? (product.description_ar || product.description) : product.description) || "ASEEL AI TRIP Store";
    const productImage = (product.media_urls && product.media_urls[0])
      || `${window.location.origin}/og-image.png`;
    const url = window.location.href;
    const title = `${productName} | ASEEL AI TRIP`;

    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement("meta");
        const [, key, k] = selector.match(/\[(\w+)="([^"]+)"\]/) || [];
        if (key && k) el.setAttribute(key, k);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    const prevTitle = document.title;
    document.title = title;

    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", productDesc.slice(0, 200));
    setMeta('meta[property="og:image"]', "content", productImage);
    setMeta('meta[property="og:url"]', "content", url);
    setMeta('meta[property="og:type"]', "content", "product");
    setMeta('meta[property="og:site_name"]', "content", "ASEEL AI TRIP");
    setMeta('meta[name="twitter:card"]', "content", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", productDesc.slice(0, 200));
    setMeta('meta[name="twitter:image"]', "content", productImage);
    setMeta('meta[name="description"]', "content", productDesc.slice(0, 160));

    return () => {
      document.title = prevTitle;
      // Reset to site defaults
      setMeta('meta[property="og:title"]', "content", "AI Travel Planner – Plan Trips Instantly | ASEEL AI TRIP");
      setMeta('meta[property="og:description"]', "content", "Free AI travel planner: generate complete trip itineraries with flights, hotels & activities in seconds. Try ASEEL AI TRIP now.");
      setMeta('meta[property="og:image"]', "content", `${window.location.origin}/og-image.png`);
      setMeta('meta[property="og:url"]', "content", "https://aseelaitrip.com");
      setMeta('meta[property="og:type"]', "content", "website");
      setMeta('meta[name="twitter:title"]', "content", "AI Travel Planner – Plan Trips Instantly | ASEEL AI TRIP");
      setMeta('meta[name="twitter:image"]', "content", `${window.location.origin}/og-image.png`);
    };
  }, [product, i18n.language]);

  const scrollRelated = (dir: 1 | -1) => {
    const el = relatedScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.9), behavior: "smooth" });
  };

  // Per-carousel snap offsets (left position of every child relative to scroller).
  // Using actual measurements keeps dots in sync with snap points and survives image loads / RTL / varying widths.
  const relatedOffsetsRef = useRef<number[]>([]);
  const pastOffsetsRef = useRef<number[]>([]);

  useEffect(() => {
    const setup = (
      el: HTMLDivElement | null,
      offsetsRef: React.MutableRefObject<number[]>,
      setCount: (n: number) => void,
      setActive: (n: number) => void,
      opts?: { onReady?: () => void; onAllImagesLoaded?: () => void; restoreKey?: string },
    ) => {
      if (!el) return () => {};

      const measure = () => {
        const children = Array.from(el.children) as HTMLElement[];
        if (children.length === 0) {
          offsetsRef.current = [];
          setCount(0);
          setActive(0);
          return;
        }
        const baseLeft = children[0].offsetLeft;
        const offsets = children.map(c => c.offsetLeft - baseLeft);
        const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
        const trimmed = offsets.filter((o, i) => i === 0 || o <= maxScroll + 1);
        offsetsRef.current = trimmed;
        setCount(trimmed.length);
        updateActive();
      };

      let rafId = 0;
      const updateActive = () => {
        const offsets = offsetsRef.current;
        if (offsets.length === 0) return;
        const sl = Math.abs(el.scrollLeft);
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < offsets.length; i++) {
          const d = Math.abs(offsets[i] - sl);
          if (d < bestDiff) { bestDiff = d; bestIdx = i; }
        }
        setActive(bestIdx);
      };
      const onScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => { rafId = 0; updateActive(); });
      };

      measure();

      el.addEventListener("scroll", onScroll, { passive: true });
      el.addEventListener("touchmove", onScroll, { passive: true });
      window.addEventListener("resize", measure);

      const ro = new ResizeObserver(measure);
      ro.observe(el);
      Array.from(el.children).forEach(c => ro.observe(c as Element));

      // Track image loading + restore scroll position once everything is ready
      const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
      let loaded = 0;
      let readyFired = false;
      const total = imgs.length;
      const fireReadyIfDone = () => {
        if (readyFired) return;
        if (total === 0 || loaded >= total) {
          readyFired = true;
          measure();
          // Restore previous scroll position (e.g., after navigating back)
          if (opts?.restoreKey) {
            const saved = parseFloat(sessionStorage.getItem(opts.restoreKey) || "");
            if (Number.isFinite(saved) && saved > 0) {
              el.scrollTo({ left: saved, behavior: "auto" });
              requestAnimationFrame(updateActive);
            }
          }
          opts?.onAllImagesLoaded?.();
          opts?.onReady?.();
        }
      };
      const onImgLoad = () => { loaded++; measure(); fireReadyIfDone(); };
      imgs.forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
          loaded++;
        } else {
          img.addEventListener("load", onImgLoad, { once: true });
          img.addEventListener("error", onImgLoad, { once: true });
        }
      });
      fireReadyIfDone();

      // Persist scroll position so we can restore on browser back
      const persist = () => {
        if (opts?.restoreKey) sessionStorage.setItem(opts.restoreKey, String(el.scrollLeft));
      };
      el.addEventListener("scroll", persist, { passive: true });

      return () => {
        if (rafId) cancelAnimationFrame(rafId);
        el.removeEventListener("scroll", onScroll);
        el.removeEventListener("touchmove", onScroll);
        el.removeEventListener("scroll", persist);
        window.removeEventListener("resize", measure);
        ro.disconnect();
        imgs.forEach(img => {
          img.removeEventListener("load", onImgLoad);
          img.removeEventListener("error", onImgLoad);
        });
      };
    };

    const c1 = setup(relatedScrollRef.current, relatedOffsetsRef, setRelatedDotCount, setRelatedDot, {
      onAllImagesLoaded: () => setRelatedImagesReady(true),
      restoreKey: id ? `store-related-scroll-${id}` : undefined,
    });
    const c2 = setup(pastScrollRef.current, pastOffsetsRef, setPastDotCount, setPastDot);
    return () => { c1(); c2(); };
  }, [related.length, pastPurchases.length]);

  const goToDot = (
    ref: React.RefObject<HTMLDivElement>,
    offsetsRef: React.MutableRefObject<number[]>,
    idx: number,
  ) => {
    const el = ref.current;
    const offsets = offsetsRef.current;
    if (!el || !offsets[idx] && idx !== 0) return;
    el.scrollTo({ left: offsets[idx] ?? 0, behavior: "smooth" });
  };


  const downloadAllPurchases = async () => {
    if (pastPurchases.length === 0) return;
    setZipping(true);
    const id_msg = isAr ? "جاري تحضير الملفات..." : "Preparing your files...";
    const tId = toast.loading(id_msg);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      let added = 0, failed = 0;
      for (const { product: pp } of pastPurchases) {
        const urls: string[] = [];
        if (pp.specs?.download_url) urls.push(pp.specs.download_url as string);
        if (Array.isArray(pp.specs?.digital_files)) {
          for (const f of pp.specs.digital_files) {
            if (typeof f === "string") urls.push(f);
            else if (f?.url) urls.push(f.url);
          }
        }
        if (urls.length === 0) continue;
        const safeName = (pp.name || "product").replace(/[^\w\u0600-\u06FF\-\s]/g, "").trim().slice(0, 60) || "product";
        const folder = zip.folder(safeName);
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("fetch failed");
            const blob = await res.blob();
            let fname = inferDownloadFilename(url, `file-${added + 1}`);
            if (used.has(`${safeName}/${fname}`)) fname = `${Date.now()}-${fname}`;
            used.add(`${safeName}/${fname}`);
            folder!.file(fname, blob);
            added++;
          } catch { failed++; }
        }
      }
      if (added === 0) {
        toast.dismiss(tId);
        toast.error(isAr ? "تعذّر تجهيز الملفات. افتح صفحة طلباتي." : "No files could be packaged. Open My Orders.");
        return;
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `my-purchases-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.dismiss(tId);
      toast.success(
        isAr
          ? `تم تحميل ${added} ملف${failed ? ` (فشل ${failed})` : ""}`
          : `Downloaded ${added} file${added !== 1 ? "s" : ""}${failed ? ` (${failed} failed)` : ""}`,
      );
    } catch (e) {
      toast.dismiss(tId);
      toast.error(isAr ? "حدث خطأ أثناء التحميل" : "Failed to create ZIP");
    } finally {
      setZipping(false);
    }
  };

  const images = useMemo(() => {
    if (!product) return [] as string[];
    const arr = (product.media_urls || []).filter(Boolean);
    return arr.length > 0 ? arr : [FALLBACK_IMAGES[product.category] || FALLBACK_IMAGES.general];
  }, [product]);

  const avgRating = useMemo(() => reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0, [reviews]);
  const hasPaidOrder = useMemo(() => orders.some(o => ["paid", "confirmed", "completed", "fulfilled"].includes(o.status)), [orders]);
  const discount = product?.original_price && product.original_price > product.price
    ? Math.round((1 - product.price / product.original_price) * 100) : 0;

  const addToCart = () => {
    if (!product) return;
    // If admin requires login for this product, redirect to auth first
    if (!user && !product.specs?.allow_guest_checkout) {
      toast.info(isAr ? "يجب تسجيل الدخول لشراء هذا المنتج" : "Please sign in to buy this product");
      navigate(`/auth?redirect=${encodeURIComponent(`/store/product/${product.id}`)}`);
      return;
    }
    // Persist intent and navigate to store (cart lives there)
    sessionStorage.setItem("store-add-to-cart", product.id);
    navigate("/store");
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product?.name, url });
      else { await navigator.clipboard.writeText(url); toast.success(isAr ? "تم نسخ الرابط" : "Link copied"); }
    } catch { /* user cancelled */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pt-20 px-4 text-center">
        <Package size={48} className="text-muted-foreground" />
        <h1 className="text-xl font-bold">{isAr ? "المنتج غير موجود" : "Product not found"}</h1>
        <Button onClick={() => navigate("/store")} variant="outline" className="gap-2">
          <ArrowLeft size={16} /> {isAr ? "العودة للمتجر" : "Back to store"}
        </Button>
      </div>
    );
  }

  const currentUrl = images[imageIdx];
  const isVideo = /\.(mp4|webm|mov|ogg)$/i.test(currentUrl);
  const downloadUrl = product.specs?.download_url as string | undefined;

  return (
    <div className="min-h-screen pt-20 pb-16 bg-background">
      <div className="container mx-auto px-3 sm:px-6 max-w-6xl">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Link to="/store" className="hover:text-primary flex items-center gap-1">
            <ArrowLeft size={12} /> {isAr ? "المتجر" : "Store"}
          </Link>
          <span>/</span>
          <span className="text-foreground line-clamp-1">{isAr ? product.name_ar || product.name : product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* ── Gallery ── */}
          <div className="space-y-3">
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-muted via-background to-muted aspect-square shadow-xl ring-1 ring-border/50">
              {isVideo ? (
                <video src={currentUrl} controls className="w-full h-full object-contain" />
              ) : (
                <img src={currentUrl} alt={product.name} className="w-full h-full object-contain transition-transform duration-500 hover:scale-105" />
              )}
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setImageIdx(i => (i === 0 ? images.length - 1 : i - 1))}
                    className="absolute start-3 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur-md rounded-full p-2.5 shadow-lg hover:scale-110 transition-all hover:bg-primary hover:text-primary-foreground"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setImageIdx(i => (i === images.length - 1 ? 0 : i + 1))}
                    className="absolute end-3 top-1/2 -translate-y-1/2 bg-background/90 backdrop-blur-md rounded-full p-2.5 shadow-lg hover:scale-110 transition-all hover:bg-primary hover:text-primary-foreground"
                    aria-label="Next image"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-3 start-1/2 -translate-x-1/2 bg-background/80 backdrop-blur-md rounded-full px-3 py-1 text-[11px] font-semibold shadow-md">
                    {imageIdx + 1} / {images.length}
                  </div>
                </>
              )}
              {discount > 0 && (
                <Badge className="absolute top-3 start-3 bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-lg border-0 text-xs font-bold px-2.5 py-1">
                  -{discount}% {isAr ? "خصم" : "OFF"}
                </Badge>
              )}
              {product.is_featured && (
                <Badge className="absolute top-3 end-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg border-0 text-[10px] font-bold gap-1">
                  ⭐ {isAr ? "مميز" : "Featured"}
                </Badge>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {images.map((url, i) => {
                  const isVid = /\.(mp4|webm|mov|ogg)$/i.test(url);
                  return (
                    <button
                      key={i}
                      onClick={() => setImageIdx(i)}
                      className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition ${i === imageIdx ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    >
                      {isVid ? <div className="w-full h-full bg-muted flex items-center justify-center text-xs">▶</div>
                        : <img src={url} alt="" className="w-full h-full object-cover" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Details ── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] capitalize bg-primary/5 border-primary/20 text-primary">{product.category}</Badge>
                {product.specs?.allow_guest_checkout && (
                  <Badge className="text-[10px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 border">
                    ⚡ {isAr ? "بدون تسجيل" : "No sign-up"}
                  </Badge>
                )}
                {product.specs?.file_format && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                    <FileText size={10} /> {product.specs.file_format}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text">
                {isAr ? product.name_ar || product.name : product.name}
              </h1>
              {reviews.length > 0 && (
                <div className="flex items-center gap-2">
                  <StarRating rating={Math.round(avgRating)} />
                  <span className="text-xs text-muted-foreground font-medium">
                    {avgRating.toFixed(1)} · {reviews.length} {isAr ? "تقييم" : "reviews"}
                  </span>
                </div>
              )}
            </div>

            {/* Price card */}
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-4 space-y-1">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">{formatPrice(product.price, product.currency)}</span>
                {product.original_price && product.original_price > product.price && (
                  <>
                    <span className="text-base line-through text-muted-foreground/70">
                      {formatPrice(product.original_price, product.currency)}
                    </span>
                    <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 border text-[10px]">
                      {isAr ? `وفر ${discount}%` : `Save ${discount}%`}
                    </Badge>
                  </>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{isAr ? "السعر شامل الضريبة • تحميل فوري بعد الدفع" : "VAT included · Instant delivery after payment"}</p>
            </div>

            {product.stock_quantity !== null && product.stock_quantity > 0 && product.stock_quantity <= 10 && (
              <div className="flex items-center gap-1.5 text-orange-600 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                <Clock size={14} />
                <span className="text-xs font-semibold">
                  {isAr ? `🔥 متبقي ${product.stock_quantity} فقط - اطلب الآن` : `🔥 Only ${product.stock_quantity} left - order now`}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={addToCart} className="flex-1 h-12 gap-2 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all">
                <ShoppingCart size={18} /> {isAr ? "أضف للسلة" : "Add to Cart"}
              </Button>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl hover:scale-105 transition" onClick={() => { setWishlisted(w => !w); toast.success(isAr ? "تم التحديث" : "Updated"); }}>
                <Heart size={18} className={wishlisted ? "fill-red-500 text-red-500" : ""} />
              </Button>
              <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl hover:scale-105 transition" onClick={share}>
                <Share2 size={18} />
              </Button>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="flex flex-col items-center text-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20">
                <ShieldCheck size={18} className="text-emerald-600" />
                <span className="text-[10px] font-semibold leading-tight">{isAr ? "دفع آمن" : "Secure Checkout"}</span>
              </div>
              <div className="flex flex-col items-center text-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <Download size={18} className="text-primary" />
                <span className="text-[10px] font-semibold leading-tight">{isAr ? "تحميل فوري" : "Instant Access"}</span>
              </div>
              <div className="flex flex-col items-center text-center gap-1.5 p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20">
                <Mail size={18} className="text-amber-600" />
                <span className="text-[10px] font-semibold leading-tight">{isAr ? "إيصال بالبريد" : "Email Receipt"}</span>
              </div>
            </div>

            {/* Description */}
            <div className="border-t border-border pt-4 space-y-2">
              <h2 className="font-bold text-sm">{isAr ? "الوصف" : "Description"}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {isAr ? product.description_ar || product.description : product.description}
              </p>
            </div>

            {/* Specs */}
            {(product.specs?.file_format || product.specs?.file_type || product.specs?.usage_instructions) && (
              <div className="border-t border-border pt-4 space-y-2">
                <h2 className="font-bold text-sm">{isAr ? "تفاصيل المنتج" : "Product Details"}</h2>
                <div className="space-y-1.5 text-xs">
                  {product.specs?.file_format && (
                    <div className="flex items-center gap-2"><FileText size={14} className="text-primary" /> <span>{isAr ? "الصيغة" : "Format"}: {product.specs.file_format}</span></div>
                  )}
                  {product.specs?.file_type && (
                    <div className="flex items-center gap-2"><Package size={14} className="text-muted-foreground" /> <span>{product.specs.file_type}</span></div>
                  )}
                </div>
                {product.specs?.usage_instructions && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1">{product.specs.usage_instructions}</p>
                )}
              </div>
            )}

            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {product.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px]">#{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Download Instructions (post-purchase) ── */}
        <Card className="mt-8 p-5 sm:p-6 border-2 border-primary/10 bg-gradient-to-br from-primary/5 to-transparent">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Download size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">{isAr ? "كيفية التحميل بعد الشراء" : "How to Download After Purchase"}</h2>
              <p className="text-xs text-muted-foreground">{isAr ? "اتبع الخطوات التالية لاستلام منتجك الرقمي" : "Follow these steps to access your digital product"}</p>
            </div>
          </div>

          <ol className="space-y-3">
            {[
              {
                en: "Add the product to your cart and complete secure checkout.",
                ar: "أضف المنتج إلى السلة وأكمل الدفع الآمن.",
              },
              {
                en: "You'll receive an email receipt with your invoice and download link.",
                ar: "ستتلقى إيصالاً عبر البريد الإلكتروني يحتوي على الفاتورة ورابط التحميل.",
              },
              {
                en: "Open the My Orders page anytime to access your downloads.",
                ar: "افتح صفحة طلباتي في أي وقت للوصول إلى ملفاتك القابلة للتحميل.",
              },
              {
                en: "Files remain available in your account — re-download whenever you need.",
                ar: "تبقى الملفات متاحة في حسابك — يمكنك إعادة تحميلها متى احتجت.",
              },
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <p className="text-sm pt-1">{isAr ? step.ar : step.en}</p>
              </li>
            ))}
          </ol>

          {/* Personal status */}
          <div className="mt-5 pt-5 border-t border-border">
            {hasPaidOrder ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 size={24} className="text-emerald-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-400">
                    {isAr ? "لقد اشتريت هذا المنتج ✅" : "You own this product ✅"}
                  </p>
                  <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
                    {isAr ? "حمّل ملفاتك من الزر بالأسفل أو من صفحة طلباتي." : "Download your files from the button below or from My Orders."}
                  </p>
                </div>
                {downloadUrl ? (
                  <Button className="gap-2" onClick={() => triggerFileDownload(downloadUrl, product.specs?.file_type || product.name)}>
                    <Download size={16} /> {isAr ? "تحميل الآن" : "Download now"}
                  </Button>
                ) : (
                  <Button onClick={() => navigate("/orders")} className="gap-2">
                    <Receipt size={16} /> {isAr ? "طلباتي" : "My Orders"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {user
                    ? (isAr ? "لم تشتر هذا المنتج بعد." : "You haven't purchased this product yet.")
                    : (isAr ? "سجّل الدخول لمتابعة طلباتك بسهولة." : "Sign in to easily track your orders.")}
                </p>
                <Button variant="outline" size="sm" onClick={() => navigate("/orders")} className="gap-2">
                  <Receipt size={14} /> {isAr ? "طلباتي" : "My Orders"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Reviews ── */}
        {reviews.length > 0 && (
          <div className="mt-8 space-y-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <MessageSquare size={18} /> {isAr ? "التقييمات" : "Reviews"}
              <Badge variant="outline" className="text-[10px]">{reviews.length}</Badge>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reviews.slice(0, 6).map(r => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {(r.user_name || "U")[0].toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold">{r.user_name || "User"}</span>
                    <StarRating rating={r.rating} size={11} />
                  </div>
                  {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── You may also like (horizontal carousel) ── */}
        {related.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-base sm:text-lg">{isAr ? "قد يعجبك أيضًا" : "You may also like"}</h2>
                <p className="text-[11px] text-muted-foreground">{isAr ? "منتجات مختارة بناءً على اهتماماتك" : "Hand-picked products based on your interests"}</p>
              </div>
              <div className="hidden sm:flex gap-1.5">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => scrollRelated(-1)} aria-label="Scroll left">
                  <ChevronLeft size={16} />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={() => scrollRelated(1)} aria-label="Scroll right">
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
            <div className="relative">
              {!relatedImagesReady && (
                <div className="absolute inset-0 z-10 flex gap-3 -mx-3 px-3 pointer-events-none" aria-hidden>
                  {Array.from({ length: Math.min(related.length, 6) }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[160px] sm:w-[200px] space-y-2">
                      <Skeleton className="aspect-[4/3] w-full rounded-md" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              )}
              <div
                ref={relatedScrollRef}
                className={`flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-3 px-3 scroll-smooth no-scrollbar touch-pan-x overscroll-x-contain transition-opacity duration-300 ${relatedImagesReady ? "opacity-100" : "opacity-0"}`}
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {related.map((rp, idx) => {
                  const rpDiscount = rp.original_price && rp.original_price > rp.price
                    ? Math.round((1 - rp.price / rp.original_price) * 100) : 0;
                  const handleClick = () => {
                    if (relatedScrollRef.current && id) {
                      sessionStorage.setItem(`store-related-scroll-${id}`, String(relatedScrollRef.current.scrollLeft));
                    }
                    const offsets = relatedOffsetsRef.current;
                    if (offsets[idx] !== undefined && relatedScrollRef.current) {
                      relatedScrollRef.current.scrollTo({ left: offsets[idx], behavior: "auto" });
                      setRelatedDot(idx);
                    }
                    navigate(`/store/product/${rp.id}`);
                  };
                  return (
                    <Card
                      key={rp.id}
                      className="overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition flex-shrink-0 snap-start w-[160px] sm:w-[200px]"
                      onClick={handleClick}
                    >
                      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                        <img
                          src={rp.media_urls?.[0] || FALLBACK_IMAGES[rp.category] || FALLBACK_IMAGES.general}
                          alt={rp.name}
                          className="w-full h-full object-cover transition-transform hover:scale-105"
                          loading="lazy"
                        />
                        {rpDiscount > 0 && (
                          <Badge className="absolute top-1.5 start-1.5 bg-red-500 text-white text-[9px] h-4 px-1.5">-{rpDiscount}%</Badge>
                        )}
                        {rp.is_featured && (
                          <Badge className="absolute top-1.5 end-1.5 bg-amber-500 text-white text-[9px] h-4 px-1.5 gap-0.5">
                            <Star size={8} className="fill-white" /> {isAr ? "مميز" : "Top"}
                          </Badge>
                        )}
                      </div>
                      <div className="p-2.5 space-y-1">
                        <h3 className="text-xs font-semibold line-clamp-2 min-h-[2rem]">{isAr ? rp.name_ar || rp.name : rp.name}</h3>
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-primary">{formatPrice(rp.price, rp.currency)}</span>
                          {rp.original_price && rp.original_price > rp.price && (
                            <span className="text-[10px] line-through text-muted-foreground">{formatPrice(rp.original_price, rp.currency)}</span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
            {relatedDotCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {Array.from({ length: Math.min(relatedDotCount, 10) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToDot(relatedScrollRef, relatedOffsetsRef, i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${i === relatedDot ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Your previous purchases (quick re-download) ── */}
        {pastPurchases.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-bold text-base sm:text-lg flex items-center gap-2">
                  <Receipt size={18} className="text-primary" />
                  {isAr ? "مشترياتك السابقة" : "Your previous purchases"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? "حمّل ملفاتك مرة أخرى في أي وقت" : "Re-download your files anytime"}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/orders")}>
                {isAr ? "عرض الكل" : "View all"} <ChevronRight size={14} />
              </Button>
            </div>
            <div
              ref={pastScrollRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-3 px-3 scroll-smooth no-scrollbar touch-pan-x overscroll-x-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {pastPurchases.map(({ order, product: pp }) => {
                const dl = pp.specs?.download_url as string | undefined;
                const extras = Array.isArray(pp.specs?.digital_files) ? pp.specs.digital_files.length : 0;
                return (
                  <Card
                    key={order.id}
                    className="overflow-hidden flex-shrink-0 snap-start w-[180px] sm:w-[220px] hover:shadow-md transition"
                  >
                    <div
                      className="aspect-[4/3] bg-muted overflow-hidden cursor-pointer"
                      onClick={() => navigate(`/store/product/${pp.id}`)}
                    >
                      <img
                        src={pp.media_urls?.[0] || FALLBACK_IMAGES[pp.category] || FALLBACK_IMAGES.general}
                        alt={pp.name}
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <h3
                        className="text-xs font-semibold line-clamp-2 min-h-[2rem] cursor-pointer hover:text-primary"
                        onClick={() => navigate(`/store/product/${pp.id}`)}
                      >
                        {isAr ? pp.name_ar || pp.name : pp.name}
                      </h3>
                      <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                        <CheckCircle2 size={10} />
                        <span>{isAr ? "تم الشراء" : "Owned"}</span>
                        {extras > 0 && (
                          <span className="text-muted-foreground">· +{extras} {isAr ? "ملف" : "files"}</span>
                        )}
                      </div>
                      {dl ? (
                        <Button size="sm" className="w-full h-7 text-[11px] gap-1" onClick={(e) => { e.stopPropagation(); triggerFileDownload(dl, pp.specs?.file_type || pp.name); }}>
                          <Download size={12} /> {isAr ? "تحميل" : "Download"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full h-7 text-[11px] gap-1" onClick={() => navigate("/orders")}>
                          <Receipt size={12} /> {isAr ? "ملفاتي" : "My files"}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
            {pastDotCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-2">
                {Array.from({ length: Math.min(pastDotCount, 10) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToDot(pastScrollRef, pastOffsetsRef, i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${i === pastDot ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"}`}
                  />
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-center">
              <Button
                onClick={downloadAllPurchases}
                disabled={zipping}
                variant="outline"
                className="gap-2 rounded-full border-primary/30 hover:bg-primary/5"
              >
                {zipping ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} className="text-primary" />}
                {zipping
                  ? (isAr ? "جاري التحضير..." : "Preparing ZIP...")
                  : (isAr ? `تحميل كل الملفات (${pastPurchases.length}) كـ ZIP` : `Download all files (${pastPurchases.length}) as ZIP`)}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPage;
