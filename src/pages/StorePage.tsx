import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShoppingBag, Star, Search, ShoppingCart, CreditCard, Loader2, ChevronLeft, ChevronRight, FileDown, FileText, Download, Heart, Share2, Package, Clock, CheckCircle2, X, MessageSquare, Send, Trash2, Receipt, Plus, Minus, ShieldCheck } from "lucide-react";
const MoyasarPaymentForm = lazy(() => import("@/components/MoyasarPaymentForm"));
import { getMoyasarMethodsForCurrency, MOYASAR_PUBLISHABLE_KEY, moyasarCapabilities } from "@/lib/moyasar";
import { isRetryableMoyasarInitError } from "@/lib/moyasarRetry";
import { useCurrency } from "@/hooks/useCurrency";
import { useNavigate } from "react-router-dom";
import { triggerFileDownload } from "@/lib/fileDownload";
// html2canvas & jsPDF are heavy — load on demand only when printing the invoice

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
  id: string; product_id: string; user_id: string; rating: number; comment: string | null;
  user_name: string | null; created_at: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
}

interface PendingStoreCheckout {
  orderIds: string[];
  paymentMethod: "moyasar";
  email: string;
  invoiceNumber: string;
  items: Array<{
    name: string;
    qty: number;
    price: number;
    total: number;
    currency: string;
    productId: string;
    download_url?: string | null;
    digital_files?: Array<{ label: string; url: string }> | null;
  }>;
  requestedCurrency: string;
  chargedCurrency: string;
  chargedAmount: number;
  merchantReferenceId?: string;
}

const PENDING_STORE_CHECKOUT_KEY = "store-pending-checkout";

// Geidea supported currencies
const GEIDEA_SUPPORTED_CURRENCIES = new Set(["SAR", "AED", "USD", "EUR", "GBP", "BHD", "KWD", "OMR", "QAR", "EGP", "JOD"]);

const CATEGORIES = [
  { key: "all", en: "All", ar: "الكل", icon: "🏷️" },
  { key: "templates", en: "Templates", ar: "قوالب", icon: "📄" },
  { key: "digital_stickers", en: "Stickers", ar: "ملصقات", icon: "🎨" },
  { key: "stickers", en: "Stickers", ar: "ملصقات", icon: "✨" },
  { key: "guides", en: "Guides", ar: "أدلة", icon: "📘" },
  { key: "digital", en: "Digital", ar: "رقمي", icon: "💾" },
  { key: "accessories", en: "Accessories", ar: "إكسسوارات", icon: "🎒" },
];

const StorePage = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { user } = useAuth();
  const { currency: userCurrency, formatPrice: fmtPrice, convertPrice, convertToCurrency } = useCurrency();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"moyasar">("moyasar");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [pendingOrderData, setPendingOrderData] = useState<PendingStoreCheckout | null>(null);
  const [paymentFormKey, setPaymentFormKey] = useState(0);
  const [guestEmail, setGuestEmail] = useState("");
  // Invoice
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [hidePostPurchase, setHidePostPurchase] = useState(false);
  const [guestPurchases, setGuestPurchases] = useState<any[]>([]);
  const [guestVaultOpen, setGuestVaultOpen] = useState(false);

  const GUEST_PURCHASES_KEY = "aseel_guest_purchases_v1";

  // Load saved guest purchases from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GUEST_PURCHASES_KEY);
      if (raw) setGuestPurchases(JSON.parse(raw) || []);
    } catch {}
  }, []);

  const saveGuestPurchase = useCallback((inv: any) => {
    try {
      const raw = localStorage.getItem(GUEST_PURCHASES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      // Avoid duplicates by invoiceNumber
      if (!list.some((p: any) => p.invoiceNumber === inv.invoiceNumber)) {
        list.unshift({ ...inv, savedAt: new Date().toISOString() });
        localStorage.setItem(GUEST_PURCHASES_KEY, JSON.stringify(list.slice(0, 50)));
        setGuestPurchases(list.slice(0, 50));
      }
    } catch (e) { console.warn('saveGuestPurchase failed', e); }
  }, []);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCartQty = useCallback((productId: string) => cart.find(item => item.product.id === productId)?.quantity || 0, [cart]);

  useEffect(() => {
    if (showPaymentForm) {
      setPaymentFormKey((prev) => prev + 1);
    }
  }, [i18n.language, showPaymentForm]);

  const reloadStorePaymentView = () => {
    setPendingOrderData((prev) => (prev ? { ...prev } : prev));
    setPaymentFormKey((prev) => prev + 1);
  };

  useEffect(() => {
    let mounted = true;
    const loadProducts = async () => {
      try {
        const query = supabase
          .from("products")
          .select("id,name,name_ar,description,description_ar,category,price,original_price,currency,media_urls,stock_quantity,is_featured,tags,specs")
          .eq("is_active", true)
          .order("sort_order");
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("products_timeout")), 6500));
        const { data, error } = await Promise.race([query, timeout]);
        if (error) throw error;
        if (!mounted) return;
        const rows = (data || []) as any[];
        setProducts(rows);
        const pendingId = sessionStorage.getItem("store-add-to-cart");
        if (pendingId) {
          sessionStorage.removeItem("store-add-to-cart");
          const found = rows.find(x => x.id === pendingId);
          if (found) {
            setCart(prev => {
              const existing = prev.find(c => c.product.id === found.id);
              if (existing) return prev.map(c => c.product.id === found.id ? { ...c, quantity: c.quantity + 1 } : c);
              return [...prev, { product: found, quantity: 1, notes: "" }];
            });
            setCartOpen(true);
            toast.success(isAr ? "تمت الإضافة للسلة 🛒" : "Added to cart 🛒");
          }
        }
      } catch (error) {
        console.warn("[StorePage] products load failed:", error);
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadProducts();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProduct) { setReviews([]); return; }
    supabase.from("product_reviews").select("*").eq("product_id", selectedProduct.id).order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setReviews(data as any); });
  }, [selectedProduct?.id]);

  // Cleanup poll on unmount or checkout close
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Pending payment banner state
  const [pendingBanner, setPendingBanner] = useState(false);

  const buildInvoiceData = useCallback((pending: PendingStoreCheckout) => ({
    invoiceNumber: pending.invoiceNumber,
    date: new Date().toLocaleDateString(isAr ? "ar-SA" : "en-US"),
    items: pending.items,
    total: pending.items.reduce((sum, item) => sum + item.total, 0),
    currency: pending.requestedCurrency || pending.items[0]?.currency || "USD",
    paymentMethod: isAr ? "بطاقة" : "Moyasar",
    email: pending.email,
  }), [isAr]);

  const normalizePaymentResponse = (responseCode?: string | null, responseMessage?: string | null) => {
    const value = (responseCode || responseMessage || "").toUpperCase();
    if (!value) return null;
    if (["000", "SUCCESS", "SUCCEEDED", "PAID"].includes(value)) return "success";
    if (["CANCELLED", "CANCELED", "CANCEL", "USER_CANCELLED"].includes(value)) return "cancelled";
    return "failed";
  };

  // Recovery: check for pending store checkout on mount (works across tabs via localStorage)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const responseCode = params.get("responseCode") || params.get("geidea-responseCode");
    const responseMessage = params.get("responseMessage") || params.get("detailedResponseMessage") || params.get("geidea-responseMessage");
    const normalizedResponse = normalizePaymentResponse(responseCode, responseMessage);
    // Moyasar appends ?id=pay_xxx&status=paid&message=APPROVED after STC Pay/Apple Pay redirect
    const moyasarPaymentId = params.get("id");
    const moyasarStatus = (params.get("status") || "").toLowerCase();
    const rawPending = localStorage.getItem(PENDING_STORE_CHECKOUT_KEY);
    const returnedFromGeidea = document.referrer.includes("geidea.net");

    if (!rawPending) {
      setProcessingPayment(false);
      setPendingBanner(false);
      return;
    }

    let pending: PendingStoreCheckout;
    try {
      pending = JSON.parse(rawPending) as PendingStoreCheckout;
    } catch {
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      setProcessingPayment(false);
      setPendingBanner(false);
      return;
    }

    const confirmRecoveredPayment = async () => {
      const { data, error } = await supabase.functions.invoke("process-payment", {
        body: {
          action: "confirm-store-payment",
          orderIds: pending.orderIds,
          gateway: pending.paymentMethod,
          items: pending.items,
          email: pending.email,
          invoiceNumber: pending.invoiceNumber,
          lang: isAr ? "ar" : "en",
        },
      });

      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || error?.message || "Failed to confirm payment");
      }

      const inv = buildInvoiceData(pending);
      setInvoiceData(inv);
      setInvoiceOpen(true);
      saveGuestPurchase(inv);
      setCart([]);
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      setPendingBanner(false);
      toast.success(isAr ? "✅ تم الدفع بنجاح!" : "✅ Payment successful!");
    };

    const cancelRecoveredPayment = async (reason: string) => {
      await supabase.functions.invoke("process-payment", {
        body: { action: "cancel-store-payment", orderIds: pending.orderIds, reason },
      });
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
      setPendingBanner(false);
      toast.error(isAr ? "❌ تم إلغاء الدفع" : "❌ Payment cancelled");
    };

    if (normalizedResponse) {
      const finalizeReturnedPayment = async () => {
        setProcessingPayment(true);
        try {
          if (normalizedResponse === "success") await confirmRecoveredPayment();
          else await cancelRecoveredPayment(`gateway_response_${responseCode || responseMessage || "cancelled"}`);
        } catch (err: any) {
          toast.error(err?.message || (isAr ? "تعذر تأكيد الدفع" : "Failed to confirm payment"));
        } finally {
          setProcessingPayment(false);
          window.history.replaceState({}, '', window.location.pathname);
        }
      };

      void finalizeReturnedPayment();
      return;
    }

    const verifyPending = async () => {
      setProcessingPayment(true);
      try {
        // If Moyasar redirected back with a payment id, verify it against Moyasar API
        if (moyasarPaymentId && pending.paymentMethod === "moyasar") {
          if (moyasarStatus && moyasarStatus !== "paid" && moyasarStatus !== "captured") {
            await cancelRecoveredPayment(`moyasar_${moyasarStatus}`);
            window.history.replaceState({}, '', window.location.pathname);
            return;
          }
          const { data: verifyData, error: verifyErr } = await supabase.functions.invoke("process-payment", {
            body: {
              action: "verify-moyasar-store",
              paymentId: moyasarPaymentId,
              orderIds: pending.orderIds,
              expectedCurrency: pending.chargedCurrency,
              expectedAmount: pending.chargedAmount,
              lang: isAr ? "ar" : "en",
            },
          });
          if (!verifyErr && (verifyData as any)?.success) {
            await confirmRecoveredPayment();
          } else {
            setPendingBanner(true);
          }
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        const { data } = await supabase.functions.invoke("process-payment", {
          body: { action: "verify-store-payment", orderIds: pending.orderIds },
        });
        const status = (data as any)?.status;

        if (status === "confirmed") {
          await confirmRecoveredPayment();
        } else if (status === "cancelled" || status === "payment_failed") {
          await cancelRecoveredPayment(status);
        } else {
          setPendingBanner(true);
        }
      } catch {
        if (returnedFromGeidea) {
          try {
            await cancelRecoveredPayment("manual_return_verification_failed");
          } catch {
            localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
            toast.error(isAr ? "❌ تم إلغاء الدفع" : "❌ Payment cancelled");
          }
        } else {
          setPendingBanner(true);
        }
      } finally {
        setProcessingPayment(false);
      }
    };

    void verifyPending();
  }, [buildInvoiceData, isAr]);

  // Cancel pending payment from banner
  const cancelPendingPayment = async () => {
    const rawPending = localStorage.getItem(PENDING_STORE_CHECKOUT_KEY);
    if (!rawPending) { setPendingBanner(false); return; }
    const pending = JSON.parse(rawPending);
    try {
      await supabase.functions.invoke("process-payment", {
        body: { action: "cancel-store-payment", orderIds: pending.orderIds, reason: "user_cancelled_from_banner" },
      });
    } catch { /* ignore */ }
    localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
    setPendingBanner(false);
    toast.success(isAr ? "تم إلغاء عملية الدفع" : "Payment cancelled successfully");
  };

  const getProductImage = useCallback((product: Product, idx = 0) => {
    if (product.media_urls?.length > idx && product.media_urls[idx]) return product.media_urls[idx];
    return FALLBACK_IMAGES[product.category] || FALLBACK_IMAGES.general;
  }, []);

  const filteredProducts = useMemo(() => products.filter(p => {
    const catMatch = activeCategory === "all" || p.category === activeCategory;
    const q = searchQuery.toLowerCase();
    const searchMatch = !q || p.name.toLowerCase().includes(q) || (p.name_ar || "").includes(searchQuery) || (p.tags || []).some(t => t.toLowerCase().includes(q));
    return catMatch && searchMatch;
  }), [products, activeCategory, searchQuery]);

  const availableCategories = useMemo(() => ["all", ...Array.from(new Set(products.map(p => p.category)))], [products]);
  const bestsellers = useMemo(() => products.filter(p => p.is_featured).slice(0, 6), [products]);
  const relatedProducts = useMemo(() => {
    if (!selectedProduct) return [];
    return products.filter(p => p.id !== selectedProduct.id && p.category === selectedProduct.category).slice(0, 4);
  }, [selectedProduct, products]);

  const getCatLabel = (key: string) => {
    const cat = CATEGORIES.find(c => c.key === key);
    return cat ? (isAr ? cat.ar : cat.en) : key;
  };
  const getCatIcon = (key: string) => CATEGORIES.find(c => c.key === key)?.icon || "📦";

  const toggleWishlist = (id: string) => setWishlist(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const getDiscount = (p: Product) => p.original_price && p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;
  const openProductDetail = (p: Product) => { navigate(`/store/product/${p.id}`); };

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  // ── Cart Functions ──
  const addToCart = (product: Product, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(c => c.product.id === product.id);
      if (existing) {
        return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + qty } : c);
      }
      return [...prev, { product, quantity: qty, notes: "" }];
    });
    toast.success(isAr ? "تمت الإضافة للسلة 🛒" : "Added to cart 🛒");
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(c => c.product.id !== productId));
  const updateCartQty = (productId: string, qty: number) => {
    if (qty < 1) return removeFromCart(productId);
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, quantity: qty } : c));
  };
  const updateCartNotes = (productId: string, notes: string) => {
    setCart(prev => prev.map(c => c.product.id === productId ? { ...c, notes } : c));
  };

  const cartTotal = useMemo(() => cart.reduce((s, c) => s + c.product.price * c.quantity, 0), [cart]);
  const cartCurrency = cart.length > 0 ? cart[0].product.currency : "USD";
  const requestedCartCurrency = (userCurrency || cartCurrency || "USD").toUpperCase();
  const cartDisplayTotal = useMemo(
    () => Number(cart.reduce((sum, item) => sum + convertPrice(item.product.price * item.quantity, item.product.currency || "USD"), 0).toFixed(2)),
    [cart, convertPrice]
  );
  const geideaFallsBackToSar = !GEIDEA_SUPPORTED_CURRENCIES.has(requestedCartCurrency);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // ── Reviews ──
  const handleSubmitReview = async () => {
    if (!user) { toast.error(isAr ? "يجب تسجيل الدخول" : "Please login first"); return; }
    if (!selectedProduct) return;
    setSubmittingReview(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle();
      const { error } = await supabase.from("product_reviews").insert({
        product_id: selectedProduct.id, user_id: user.id, rating: reviewRating,
        comment: reviewComment || null,
        user_name: profile?.full_name || profile?.username || user.email?.split("@")[0] || "User",
      } as any);
      if (error) {
        if (error.code === "23505") toast.error(isAr ? "لقد قمت بتقييم هذا المنتج مسبقاً" : "You already reviewed this product");
        else throw error;
      } else {
        toast.success(isAr ? "شكراً لتقييمك! ✅" : "Thanks for your review! ✅");
        setReviewComment(""); setReviewRating(5);
        const { data } = await supabase.from("product_reviews").select("*").eq("product_id", selectedProduct.id).order("created_at", { ascending: false });
        if (data) setReviews(data as any);
      }
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmittingReview(false); }
  };

  // Reset payment state when checkout dialog closes
  const handleCheckoutClose = (open: boolean) => {
    if (!open) {
      // If we're transitioning to the full-page payment view, keep payment state alive.
      if (showPaymentForm) {
        setCheckoutOpen(false);
        return;
      }
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setProcessingPayment(false);
      setShowPaymentForm(false);
      setPendingOrderData(null);
    }
    setCheckoutOpen(open);
  };

  // ── Checkout / Payment (Moyasar Inline) ──
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    // Block guest checkout for items the admin hasn't allowed for guests
    if (!user) {
      const blocked = cart.find(c => !c.product.specs?.allow_guest_checkout);
      if (blocked) {
        toast.error(isAr
          ? `يجب تسجيل الدخول لشراء "${blocked.product.name_ar || blocked.product.name}"`
          : `Please sign in to purchase "${blocked.product.name}"`);
        navigate(`/auth?redirect=${encodeURIComponent("/store")}`);
        return;
      }
    }
    // Email is OPTIONAL for guest checkout when admin allowed it.
    // The download link is shown directly on the success screen, no email required.
    // Validate format only if provided.
    if (!user && guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      toast.error(isAr ? "البريد الإلكتروني غير صحيح" : "Invalid email format");
      return;
    }
    setProcessingPayment(true);

    try {
      const orderIds: string[] = [];
      const savedCartItems = [...cart];
      const guestId = !user ? (localStorage.getItem("guest_id") || crypto.randomUUID()) : null;
      const requestedCurrency = requestedCartCurrency;
      const requestedAmount = Number(savedCartItems.reduce((sum, item) => sum + convertPrice(item.product.price * item.quantity, item.product.currency || "USD"), 0).toFixed(2));

      if (guestId && !localStorage.getItem("guest_id")) localStorage.setItem("guest_id", guestId);

      for (const item of cart) {
        const orderPayload: any = {
          order_type: "product", item_id: item.product.id,
          item_name: item.product.name, quantity: item.quantity,
          unit_price: item.product.price, total_price: item.product.price * item.quantity,
          currency: item.product.currency || "USD",
          notes: item.notes || null, payment_method: "moyasar", status: "pending_payment",
        };
        if (user) {
          orderPayload.user_id = user.id;
        } else {
          orderPayload.guest_id = guestId;
          orderPayload.guest_email = guestEmail.trim() || null;
          orderPayload.user_id = null;
        }
        const { data, error } = await supabase.from("orders").insert(orderPayload as any).select().single();
        if (error) throw error;
        orderIds.push(data.id);
      }

      const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;
      const customerEmail = user?.email || guestEmail || "";
      const itemsPayload = savedCartItems.map(c => ({
        name: isAr ? c.product.name_ar || c.product.name : c.product.name,
        qty: c.quantity,
        price: Number(convertPrice(c.product.price, c.product.currency || "USD").toFixed(2)),
        total: Number(convertPrice(c.product.price * c.quantity, c.product.currency || "USD").toFixed(2)),
        currency: requestedCurrency,
        productId: c.product.id,
        download_url: (c.product.specs?.download_url as string) || null,
        digital_files: Array.isArray(c.product.specs?.digital_files)
          ? (c.product.specs.digital_files as any[]).map(f => typeof f === 'string' ? { label: 'Download', url: f } : { label: f.label || 'Download', url: f.url }).filter(f => f.url)
          : null,
        post_purchase_message: (c.product.specs?.post_purchase_message as string) || null,
        post_purchase_links: Array.isArray(c.product.specs?.post_purchase_links)
          ? (c.product.specs.post_purchase_links as any[]).filter((l: any) => l?.url && l?.label)
          : null,
        usage_instructions: (c.product.specs?.usage_instructions as string) || null,
      }));

      // Moyasar live currently supports SAR — always charge in SAR while showing the user's currency
      const chargedCurrency = "SAR";
      const chargedAmount = Number(
        savedCartItems
          .reduce((sum, item) => sum + convertToCurrency(item.product.price * item.quantity, item.product.currency || "USD", chargedCurrency), 0)
          .toFixed(2)
      );

      const pendingCheckout: PendingStoreCheckout = {
        orderIds,
        paymentMethod: "moyasar",
        email: customerEmail,
        invoiceNumber: invoiceNum,
        items: itemsPayload,
        requestedCurrency,
        chargedCurrency,
        chargedAmount,
      };

      localStorage.setItem(PENDING_STORE_CHECKOUT_KEY, JSON.stringify(pendingCheckout));
      setPendingOrderData(pendingCheckout);
      setShowPaymentForm(true);
      setCheckoutOpen(false); // close dialog so global Navbar is visible during payment
      window.scrollTo({ top: 0, behavior: "smooth" });
      setProcessingPayment(false);
    } catch (err: any) {
      toast.error(err.message || "Error");
      setProcessingPayment(false);
    }
  };

  // Moyasar payment completion handler
  const handleMoyasarStoreCompleted = async (payment: any) => {
    if (!pendingOrderData) return;
    console.log('[Moyasar Store] Payment completed:', payment);

    try {
      // Verify on server
      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke("process-payment", {
        body: {
          action: "verify-moyasar-store",
          paymentId: payment?.id,
          orderIds: pendingOrderData.orderIds,
          expectedCurrency: pendingOrderData.chargedCurrency,
          expectedAmount: pendingOrderData.chargedAmount,
          lang: isAr ? "ar" : "en",
        },
      });

      if (verifyErr || !(verifyData as any)?.success) {
        const failureMessage = verifyErr?.message || (verifyData as any)?.error || 'verification_failed';
        if (isRetryableMoyasarInitError(failureMessage) || (verifyData as any)?.pending || (verifyData as any)?.fallback) {
          toast.message(isAr ? 'تم استلام الدفع ونجري تأكيد الطلب الآن…' : 'Payment received — final order confirmation is in progress…');
          return;
        }
        throw verifyErr || new Error(failureMessage);
      }

      // Confirm orders + send receipt
      await supabase.functions.invoke("process-payment", {
        body: {
          action: "confirm-store-payment",
          orderIds: pendingOrderData.orderIds,
          gateway: "moyasar",
          items: pendingOrderData.items,
          email: pendingOrderData.email,
          invoiceNumber: pendingOrderData.invoiceNumber,
          lang: isAr ? "ar" : "en",
        },
      });

      toast.success(isAr ? "✅ تم الدفع بنجاح!" : "✅ Payment successful!");
      const inv = buildInvoiceData(pendingOrderData);
      setInvoiceData(inv);
      setInvoiceOpen(true);
      saveGuestPurchase(inv);
      setCheckoutOpen(false);
      setShowPaymentForm(false);
      setPendingOrderData(null);
      setCart([]);
      localStorage.removeItem(PENDING_STORE_CHECKOUT_KEY);
    } catch (e: any) {
      console.error('[Moyasar Store] Error:', e);
      toast.error(isAr ? "تم الدفع لكن تعذر التأكيد. تواصل مع الدعم." : "Paid but confirmation failed. Contact support.");
    }
  };

  const handlePrintInvoice = async () => {
    setPrintingPdf(true);
    try {
      const el = document.getElementById("store-invoice-print");
      if (!el) return;
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`invoice-${invoiceData?.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
    }
    setPrintingPdf(false);
  };

  const p = selectedProduct;
  const allImages = p ? (p.media_urls?.length > 0 ? p.media_urls : [getProductImage(p)]) : [];

  const StarRating = ({ rating, size = 14, interactive = false, onChange }: { rating: number; size?: number; interactive?: boolean; onChange?: (r: number) => void }) => (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button key={i} disabled={!interactive} onClick={() => onChange?.(i)} className={interactive ? "cursor-pointer" : "cursor-default"}>
          <Star size={size} className={i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"} />
        </button>
      ))}
    </div>
  );

  const displayPrice = (price: number, fromCurrency: string) => fmtPrice(price, fromCurrency);

  return (
    <div className="min-h-screen bg-background pt-20 pb-10" dir={isAr ? "rtl" : "ltr"}>
      {/* ═══ Full-page Payment View (mirrors Pricing page layout, keeps Navbar visible) ═══ */}
      {showPaymentForm && pendingOrderData ? (
        <div className="max-w-md mx-auto px-3 sm:px-4">
          <button
            onClick={() => { setShowPaymentForm(false); setPendingOrderData(null); }}
            className="text-sm text-primary mb-6 hover:underline"
          >
            ← {isAr ? "العودة إلى السلة" : "Back to cart"}
          </button>

          <div className="flex flex-col items-center justify-center mb-4">
            <img src="/logo.png" alt="ASEEL AI TRIP" className="w-14 h-14 rounded-xl shadow-md mb-2" />
            <span className="text-xs font-semibold text-foreground tracking-wide">ASEEL AI TRIP</span>
          </div>

          <div className="text-center mb-6 px-2">
            <h3 className="text-xl font-bold text-foreground mb-1">{t('pricing.choosePayment')}</h3>
            <p className="text-muted-foreground text-sm">
              {isAr ? `فاتورة ${pendingOrderData.invoiceNumber}` : `Invoice ${pendingOrderData.invoiceNumber}`}
            </p>
            <div className="mt-2 inline-flex max-w-full flex-col items-center gap-1">
              <span className="text-2xl font-bold text-primary">
                {displayPrice(cartDisplayTotal, requestedCartCurrency)}
              </span>
              {pendingOrderData.requestedCurrency !== pendingOrderData.chargedCurrency && (
                <span className="text-[11px] text-muted-foreground">
                  {t('pricing.chargedInSar', { amount: pendingOrderData.chargedAmount.toFixed(2) })}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground text-center leading-5 max-w-[22rem]">
                {t('pricing.currencyFeesNotice')}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 shadow-sm">
            <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>}>
              <MoyasarPaymentForm
                key={`${pendingOrderData.invoiceNumber}-${i18n.language}-${paymentFormKey}`}
                amount={pendingOrderData.chargedAmount}
                currency={pendingOrderData.chargedCurrency}
                description={`ASEEL AI TRIP Store - ${pendingOrderData.invoiceNumber}`}
                publishableKey={MOYASAR_PUBLISHABLE_KEY}
                metadata={{
                  invoice: pendingOrderData.invoiceNumber,
                  order_ids: pendingOrderData.orderIds.join(','),
                  email: pendingOrderData.email,
                }}
                onCompleted={handleMoyasarStoreCompleted}
                onLanguageRefresh={reloadStorePaymentView}
                callbackUrl={window.location.origin + "/store"}
                methods={getMoyasarMethodsForCurrency(pendingOrderData.chargedCurrency)}
                samsungPay={moyasarCapabilities.samsungPay ? { serviceId: moyasarCapabilities.samsungServiceId, orderNumber: pendingOrderData.invoiceNumber, label: 'ASEEL AI TRIP', environment: 'PRODUCTION' } : undefined}
              />
            </Suspense>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-6">
            🔒 {t('pricing.securePayments')}
          </p>
        </div>
      ) : (
      <>
      {/* Pending Payment Banner */}
      {pendingBanner && (
        <div className="fixed top-16 inset-x-0 z-50 bg-amber-500 text-white px-4 py-3 flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 size={16} className="animate-spin" />
            {isAr ? "لديك عملية دفع معلقة..." : "You have a pending payment..."}
          </div>
          <Button size="sm" variant="secondary" className="text-xs h-7 gap-1" onClick={cancelPendingPayment}>
            <X size={12} /> {isAr ? "إلغاء" : "Cancel"}
          </Button>
        </div>
      )}

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/50 mb-6 bg-gradient-to-br from-primary/15 via-primary/5 to-background">
        {/* Decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute -top-24 -end-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -start-20 w-80 h-80 rounded-full bg-amber-400/15 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-14 text-center">
          <Badge className="mb-3 bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 gap-1 px-3 py-1 rounded-full">
            <Star size={12} className="fill-current" /> {isAr ? "الأكثر تقييماً" : "Top Rated"} · 4.8/5
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight gradient-text mb-3">
            {isAr ? "المتجر الرقمي" : "Digital Store"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-5">
            {isAr
              ? "قوالب احترافية، ملصقات، أدلة سفر رقمية — يصلك فوراً بعد الدفع"
              : "Pro templates, stickers and travel guides — delivered instantly after checkout"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm">
              <Download size={12} className="text-primary" /> {isAr ? "تحميل فوري" : "Instant Download"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm">
              <ShieldCheck size={12} className="text-emerald-600" /> {isAr ? "دفع آمن" : "Secure Checkout"}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur-sm border border-border shadow-sm">
              <Receipt size={12} className="text-primary" /> {isAr ? "فاتورة بالبريد" : "Email Invoice"}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        {/* Search + Cart Button */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <Input className="ps-10 h-10" placeholder={isAr ? "ابحث عن منتج..." : "Search products..."} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {user && (
              <>
                <Button variant="outline" className="gap-2 h-10" onClick={() => navigate("/orders")}>
                  <Package size={16} />
                  {isAr ? "مشترياتي" : "My Orders"}
                </Button>
                <Button variant="outline" className="gap-2 h-10" onClick={() => navigate("/invoices")}>
                  <Receipt size={16} />
                  {isAr ? "فواتيري" : "My Invoices"}
                </Button>
              </>
            )}
            {guestPurchases.length > 0 && (
              <Button variant="outline" className="gap-2 h-10 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" onClick={() => setGuestVaultOpen(true)}>
                <FileDown size={16} />
                {isAr ? `تنزيلاتي (${guestPurchases.length})` : `My Downloads (${guestPurchases.length})`}
              </Button>
            )}
            <Button variant="outline" className="relative gap-2 h-10" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={16} />
              {isAr ? "السلة" : "Cart"}
              {cartCount > 0 && (
                <Badge className="absolute -top-2 -end-2 bg-red-500 text-white text-[10px] min-w-[20px] h-5 flex items-center justify-center rounded-full p-0">
                  {cartCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Category Chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4">
          {availableCategories.map(key => (
            <button key={key} onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all border ${
                activeCategory === key
                  ? 'bg-primary text-primary-foreground border-primary shadow-md'
                  : 'bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5'
              }`}>
              <span>{getCatIcon(key)}</span>
              {getCatLabel(key)}
            </button>
          ))}
        </div>

        {/* Bestsellers */}
        {bestsellers.length > 0 && activeCategory === "all" && !searchQuery && (
          <div className="mb-8">
            <h2 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2">
              🔥 {isAr ? "الأكثر مبيعاً" : "Bestsellers"}
            </h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
              {bestsellers.map(product => (
                <Card key={product.id} className="min-w-[160px] max-w-[200px] overflow-hidden cursor-pointer hover:shadow-lg transition-all flex-shrink-0" onClick={() => openProductDetail(product)}>
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    <img src={getProductImage(product)} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    <Badge className="absolute top-1.5 start-1.5 bg-amber-500 text-white text-[9px]">⭐ {isAr ? "مميز" : "Hot"}</Badge>
                  </div>
                  <div className="p-2.5">
                    <h3 className="font-semibold text-xs line-clamp-1">{isAr ? product.name_ar || product.name : product.name}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-bold text-xs text-primary">{displayPrice(product.price, product.currency)}</span>
                       {getCartQty(product.id) > 0 ? (
                         <div onClick={e => e.stopPropagation()} className="flex items-center gap-1 rounded-full bg-primary/10 px-1 py-0.5">
                           <button onClick={() => updateCartQty(product.id, getCartQty(product.id) - 1)} className="w-5 h-5 rounded-full bg-background text-foreground flex items-center justify-center"><Minus size={10} /></button>
                           <span className="text-[10px] font-bold min-w-[14px] text-center">{getCartQty(product.id)}</span>
                           <button onClick={() => updateCartQty(product.id, getCartQty(product.id) + 1)} className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Plus size={10} /></button>
                         </div>
                       ) : (
                         <button onClick={e => { e.stopPropagation(); addToCart(product); }} className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                           <Plus size={12} />
                         </button>
                       )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-56 sm:h-72 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts.map(product => {
              const discount = getDiscount(product);
              return (
                <Card
                  key={product.id}
                  className="overflow-hidden group cursor-pointer rounded-2xl border border-border/60 bg-card hover:shadow-xl hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full"
                  onClick={() => openProductDetail(product)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-muted to-muted/40">
                    <img
                      src={getProductImage(product)}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute top-2 start-2 flex flex-col gap-1">
                      {discount > 0 && (
                        <Badge className="bg-red-500 text-white text-[10px] px-2 py-0.5 font-bold shadow-md">
                          -{discount}%
                        </Badge>
                      )}
                      {product.is_featured && (
                        <Badge className="bg-amber-500 text-white text-[10px] px-2 py-0.5 gap-0.5 shadow-md">
                          <Star size={9} className="fill-white" /> {isAr ? "مميز" : "Top"}
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); toggleWishlist(product.id); }}
                      className="absolute top-2 end-2 w-8 h-8 rounded-full bg-background/90 backdrop-blur-md flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                      aria-label="Add to wishlist"
                    >
                      <Heart size={13} className={wishlist.has(product.id) ? "fill-red-500 text-red-500" : "text-foreground"} />
                    </button>
                    {product.specs?.download_url && (
                      <div className="absolute bottom-2 start-2 flex flex-col gap-1">
                        <Badge className="bg-emerald-600/95 text-white text-[9px] gap-0.5 shadow-md backdrop-blur-sm">
                          <Download size={9} /> {isAr ? "رقمي" : "Digital"}
                        </Badge>
                        {product.specs?.allow_guest_checkout && (
                          <Badge className="bg-sky-600/95 text-white text-[9px] gap-0.5 shadow-md backdrop-blur-sm">
                            ⚡ {isAr ? "بدون تسجيل" : "No sign-up"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex flex-col gap-1.5 flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                      {getCatLabel(product.category)}
                    </p>
                    <h3 className="font-semibold text-sm line-clamp-2 leading-snug min-h-[2.5rem]">
                      {isAr ? product.name_ar || product.name : product.name}
                    </h3>
                    <div className="flex items-center justify-between pt-1 mt-auto">
                      <div className="flex items-baseline gap-1.5 min-w-0">
                        <span className="font-extrabold text-base text-primary">
                          {displayPrice(product.price, product.currency)}
                        </span>
                        {product.original_price && product.original_price > product.price && (
                          <span className="text-[10px] line-through text-muted-foreground truncate">
                            {displayPrice(product.original_price, product.currency)}
                          </span>
                        )}
                      </div>
                      {getCartQty(product.id) > 0 ? (
                        <div onClick={e => e.stopPropagation()} className="flex items-center gap-1 rounded-full bg-primary/10 px-1 py-0.5 flex-shrink-0">
                          <button onClick={() => updateCartQty(product.id, getCartQty(product.id) - 1)} className="w-6 h-6 rounded-full bg-background text-foreground flex items-center justify-center hover:bg-muted shadow-sm" aria-label="Decrease"><Minus size={12} /></button>
                          <span className="text-[11px] font-bold min-w-[16px] text-center">{getCartQty(product.id)}</span>
                          <button onClick={() => updateCartQty(product.id, getCartQty(product.id) + 1)} className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 shadow-sm" aria-label="Increase"><Plus size={12} /></button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); addToCart(product); }}
                          className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 shadow-md hover:scale-110 transition-all flex-shrink-0"
                          aria-label="Add to cart"
                        >
                          <Plus size={15} />
                        </button>
                      )}
                    </div>
                    {product.stock_quantity !== null && product.stock_quantity <= 10 && product.stock_quantity > 0 && (
                      <p className="text-[10px] text-orange-600 font-semibold flex items-center gap-1">
                        <Clock size={9} /> {isAr ? `متبقي ${product.stock_quantity} فقط` : `Only ${product.stock_quantity} left`}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <ShoppingBag size={48} className="mx-auto mb-4 opacity-30" />
                <p>{isAr ? "لا توجد منتجات حالياً" : "No products available"}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Cart Drawer ═══ */}
      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart size={18} /> {isAr ? "سلة المشتريات" : "Shopping Cart"} ({cartCount})
            </DialogTitle>
          </DialogHeader>
          {cart.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShoppingBag size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isAr ? "السلة فارغة" : "Your cart is empty"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.product.id} className="flex gap-3 p-2 rounded-lg border border-border bg-card">
                  <img src={getProductImage(item.product)} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold line-clamp-1">{isAr ? item.product.name_ar || item.product.name : item.product.name}</h4>
                    <p className="text-xs text-primary font-bold">{displayPrice(item.product.price, item.product.currency)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <button onClick={() => updateCartQty(item.product.id, item.quantity - 1)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted"><Minus size={10} /></button>
                      <span className="text-xs font-medium w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateCartQty(item.product.id, item.quantity + 1)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted"><Plus size={10} /></button>
                    </div>
                    {item.product.specs?.allow_notes && (
                      <Input className="h-6 text-[10px] mt-1" placeholder={isAr ? "ملاحظة..." : "Note..."} value={item.notes} onChange={e => updateCartNotes(item.product.id, e.target.value)} />
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <button onClick={() => removeFromCart(item.product.id)} className="text-destructive hover:text-destructive/80"><Trash2 size={14} /></button>
                    <span className="text-xs font-bold">{displayPrice(item.product.price * item.quantity, item.product.currency)}</span>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-3">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-sm">{isAr ? "الإجمالي" : "Total"}</span>
                  <span className="font-bold text-lg text-primary">{displayPrice(cartDisplayTotal, requestedCartCurrency)}</span>
                </div>
                <Button className="w-full gap-2" onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
                  <CreditCard size={14} /> {isAr ? "إتمام الشراء" : "Checkout"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Checkout Dialog ═══ */}
      <Dialog open={checkoutOpen} onOpenChange={handleCheckoutClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isAr ? "إتمام الدفع" : "Checkout"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Pre-payment view: cart summary + email + method info */}
            {!showPaymentForm && (
              <>
                {/* Order Summary */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex justify-between text-xs">
                      <span className="flex-1 line-clamp-1">{isAr ? item.product.name_ar || item.product.name : item.product.name} × {item.quantity}</span>
                      <span className="font-bold ms-2">{displayPrice(item.product.price * item.quantity, item.product.currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex justify-between items-center">
                  <span className="font-bold">{isAr ? "الإجمالي" : "Total"}</span>
                  <span className="font-bold text-lg text-primary">{displayPrice(cartDisplayTotal, requestedCartCurrency)}</span>
                </div>

                {/* Guest Email — optional when guest checkout is allowed */}
                {!user && (
                  <div>
                    <Label className="text-xs flex items-center justify-between">
                      <span>{isAr ? "البريد الإلكتروني" : "Email"}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">{isAr ? "(اختياري)" : "(optional)"}</span>
                    </Label>
                    <Input type="email" inputMode="email" autoComplete="email" className="h-9 text-sm" placeholder="email@example.com" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} />
                    <p className="text-[10px] text-muted-foreground mt-1">{isAr ? "اتركه فارغاً للتحميل المباشر بعد الدفع، أو أدخله لإرسال نسخة من الفاتورة والروابط إلى بريدك" : "Leave empty for instant on-screen download, or enter it to receive an invoice and download links by email"}</p>
                  </div>
                )}

                {/* Payment Method Info */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-foreground">{isAr ? "دفع آمن عبر Moyasar" : "Secure payment via Moyasar"}</p>
                    <p className="text-[10px] text-muted-foreground">{isAr ? "بطاقة ائتمانية / Apple Pay / STC Pay / مدى" : "Card / Apple Pay / STC Pay / Mada"}</p>
                  </div>
                </div>

                {/* Digital download note */}
                {cart.some(c => c.product.specs?.download_url) && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-2 flex items-center gap-2">
                    <FileDown size={14} className="text-green-600 shrink-0" />
                    <p className="text-[10px] text-green-700 dark:text-green-400">{isAr ? "سيتم تحميل المنتجات الرقمية فوراً بعد الدفع" : "Digital products will download instantly after payment"}</p>
                  </div>
                )}
              </>
            )}

            {/* Inline Moyasar Form — exact same layout as Pricing page */}
            {showPaymentForm && pendingOrderData && (
              <div className="px-1 sm:px-0">
                {/* Back button — same as Pricing page */}
                <button
                  onClick={() => { setShowPaymentForm(false); }}
                  className="text-sm text-primary mb-6 hover:underline"
                >
                  ← {isAr ? "العودة إلى السلة" : "Back to cart"}
                </button>

                {/* Site logo */}
                <div className="flex flex-col items-center justify-center mb-4">
                  <img src="/logo.png" alt="ASEEL AI TRIP" className="w-14 h-14 rounded-xl shadow-md mb-2" />
                  <span className="text-xs font-semibold text-foreground tracking-wide">ASEEL AI TRIP</span>
                </div>

                <div className="text-center mb-6 px-2">
                  <h3 className="text-xl font-bold text-foreground mb-1">
                    {t('pricing.choosePayment')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {isAr ? `فاتورة ${pendingOrderData.invoiceNumber}` : `Invoice ${pendingOrderData.invoiceNumber}`}
                  </p>
                  <div className="mt-2 inline-flex max-w-full flex-col items-center gap-1">
                    <span className="text-2xl font-bold text-primary">
                      {displayPrice(cartDisplayTotal, requestedCartCurrency)}
                    </span>
                    {pendingOrderData.requestedCurrency !== pendingOrderData.chargedCurrency && (
                      <span className="text-[11px] text-muted-foreground">
                        {t('pricing.chargedInSar', { amount: pendingOrderData.chargedAmount.toFixed(2) })}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground text-center leading-5 max-w-[22rem]">
                      {t('pricing.currencyFeesNotice')}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 shadow-sm">
                  <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" size={20} /></div>}>
                    <MoyasarPaymentForm
                      key={`${pendingOrderData.invoiceNumber}-${i18n.language}-${paymentFormKey}`}
                      amount={pendingOrderData.chargedAmount}
                      currency={pendingOrderData.chargedCurrency}
                      description={`ASEEL AI TRIP Store - ${pendingOrderData.invoiceNumber}`}
                      publishableKey={MOYASAR_PUBLISHABLE_KEY}
                      metadata={{
                        invoice: pendingOrderData.invoiceNumber,
                        order_ids: pendingOrderData.orderIds.join(','),
                        email: pendingOrderData.email,
                      }}
                      onCompleted={handleMoyasarStoreCompleted}
                      onLanguageRefresh={reloadStorePaymentView}
                      callbackUrl={window.location.origin + "/store"}
                      methods={getMoyasarMethodsForCurrency(pendingOrderData.chargedCurrency)}
                      samsungPay={moyasarCapabilities.samsungPay ? { serviceId: moyasarCapabilities.samsungServiceId, orderNumber: pendingOrderData.invoiceNumber, label: 'ASEEL AI TRIP', environment: 'PRODUCTION' } : undefined}
                    />
                  </Suspense>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-6">
                  🔒 {t('pricing.securePayments')}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => handleCheckoutClose(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
            {!showPaymentForm && (
              <Button size="sm" onClick={handleCheckout} disabled={processingPayment} className="gap-1">
                {processingPayment ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />}
                {isAr ? "متابعة الدفع" : "Continue to Payment"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Invoice Dialog ═══ */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)] sm:w-full max-h-[92vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6 gap-3">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Receipt size={18} /> {isAr ? "الفاتورة" : "Invoice"}
            </DialogTitle>
          </DialogHeader>
          {invoiceData && (
            <div className="min-w-0">
              <div id="store-invoice-print" className="bg-white text-black p-4 sm:p-6 space-y-3 sm:space-y-4 text-sm rounded-lg" style={{ direction: "ltr" }}>
                <div className="text-center border-b border-gray-200 pb-4">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <img src={window.location.origin + "/logo.png"} alt="ASEEL AI TRIP" className="w-10 h-10" crossOrigin="anonymous" style={{ display: 'inline-block' }} />
                    <h3 className="font-bold text-xl text-gray-900">ASEEL AI TRIP</h3>
                  </div>
                  <p className="text-xs text-gray-500">support@aseelaitrip.com</p>
                </div>

                <div className="flex justify-between text-xs text-gray-600">
                  <div>Invoice #: <strong className="text-gray-900">{invoiceData.invoiceNumber}</strong></div>
                  <div>Date: <strong className="text-gray-900">{invoiceData.date}</strong></div>
                </div>
                <div className="text-xs text-gray-600">Email: <strong className="text-gray-900">{invoiceData.email}</strong></div>

                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-2 font-medium text-gray-500">Item</th>
                      <th className="text-center py-2 font-medium text-gray-500">Qty</th>
                      <th className="text-right py-2 font-medium text-gray-500">Price</th>
                      <th className="text-right py-2 font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.items.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-gray-200">
                        <td className="py-2 text-gray-900">{item.name}</td>
                        <td className="text-center py-2 text-gray-900">{item.qty}</td>
                        <td className="text-right py-2 text-gray-900">{item.price.toFixed(2)}</td>
                        <td className="text-right py-2 font-medium text-gray-900">{item.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="py-2 font-bold text-right text-gray-900">Total</td>
                      <td className="py-2 font-bold text-right text-emerald-600">{invoiceData.total.toFixed(2)} {invoiceData.currency}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="text-center text-xs text-gray-500 pt-2 border-t border-gray-200">
                  <p>Paid via: {invoiceData.paymentMethod}</p>
                  <p className="mt-1">Thank you for your purchase! 🎉</p>
                </div>
              </div>

              {/* Instant download links (works for guests + signed-in users) */}
              {(() => {
                const downloadables = (invoiceData.items || []).flatMap((it: any) => {
                  const list: Array<{ label: string; url: string }> = [];
                  if (it.download_url) list.push({ label: it.name, url: it.download_url });
                  if (Array.isArray(it.digital_files)) for (const f of it.digital_files) if (f?.url) list.push({ label: `${it.name} — ${f.label || 'File'}`, url: f.url });
                  return list;
                });
                if (downloadables.length === 0) return null;
                return (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-3 space-y-2">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <FileDown size={14} /> {isAr ? "روابط التحميل الفوري" : "Instant download links"}
                    </p>
                    <div className="space-y-1.5">
                      {downloadables.map((d, i) => {
                        const guessName = (() => {
                          try {
                            const u = new URL(d.url);
                            const last = u.pathname.split('/').pop() || '';
                            return decodeURIComponent(last) || `${d.label}`;
                          } catch { return `${d.label}`; }
                        })();
                        const handleDl = (e: React.MouseEvent) => {
                          e.preventDefault();
                          triggerFileDownload(d.url, guessName || d.label);
                        };
                        return (
                          <button key={i} type="button" onClick={handleDl}
                            className="w-full flex items-center gap-2 rounded-md bg-white dark:bg-card border border-emerald-200 dark:border-emerald-800 p-2 hover:bg-emerald-100/60 transition text-left">
                            <Download size={14} className="text-emerald-600 shrink-0" />
                            <span className="text-xs flex-1 truncate text-gray-900 dark:text-foreground">{d.label}</span>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">{isAr ? "تحميل" : "Download"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                      {isAr ? "تم إرسال الروابط أيضًا إلى بريدك الإلكتروني." : "Links were also sent to your email."}
                    </p>
                  </div>
                );
              })()}

              {/* Post-purchase custom messages & links (per-product, set by admin) */}
              {(() => {
                const itemsWithPost = (invoiceData.items || []).filter((it: any) =>
                  (it.post_purchase_message && String(it.post_purchase_message).trim()) ||
                  (Array.isArray(it.post_purchase_links) && it.post_purchase_links.length > 0)
                );
                if (itemsWithPost.length === 0) return null;
                return (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {isAr ? "📋 تعليمات ما بعد الشراء" : "📋 Post-purchase instructions"}
                      </p>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
                        onClick={() => setHidePostPurchase(v => !v)}>
                        {hidePostPurchase ? (isAr ? "إظهار" : "Show") : (isAr ? "إخفاء" : "Hide")}
                      </Button>
                    </div>
                    {!hidePostPurchase && (<>

                    {itemsWithPost.map((it: any, idx: number) => (
                      <div key={idx} className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2">
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                          ✨ {it.name}
                        </p>
                        {it.post_purchase_message && (
                          <div
                            className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: String(it.post_purchase_message) }}
                          />
                        )}
                        {Array.isArray(it.post_purchase_links) && it.post_purchase_links.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {it.post_purchase_links.map((lnk: any, i: number) => (
                              <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 transition">
                                {lnk.label}
                              </a>
                            ))}
                          </div>
                        )}
                        {/* Save & Download instructions as text file */}
                        {(it.post_purchase_message || it.usage_instructions || (Array.isArray(it.post_purchase_links) && it.post_purchase_links.length > 0)) && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1.5 mt-1 border-blue-300 dark:border-blue-700"
                            onClick={() => {
                              const stripHtml = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
                              const lines: string[] = [];
                              lines.push(`${it.name}`);
                              lines.push('='.repeat(Math.min(60, it.name.length)));
                              lines.push('');
                              lines.push(isAr ? `رقم الفاتورة: ${invoiceData.invoiceNumber}` : `Invoice #: ${invoiceData.invoiceNumber}`);
                              lines.push(isAr ? `التاريخ: ${invoiceData.date}` : `Date: ${invoiceData.date}`);
                              lines.push('');
                              if (it.post_purchase_message) {
                                lines.push(isAr ? '— التعليمات —' : '— Instructions —');
                                lines.push(stripHtml(String(it.post_purchase_message)));
                                lines.push('');
                              }
                              if (it.usage_instructions) {
                                lines.push(isAr ? '— كيفية الاستخدام —' : '— How to use —');
                                lines.push(String(it.usage_instructions));
                                lines.push('');
                              }
                              if (Array.isArray(it.post_purchase_links) && it.post_purchase_links.length > 0) {
                                lines.push(isAr ? '— روابط مهمة —' : '— Important links —');
                                it.post_purchase_links.forEach((l: any) => lines.push(`• ${l.label}: ${l.url}`));
                                lines.push('');
                              }
                              lines.push('—');
                              lines.push('ASEEL AI TRIP — aseelaitrip.com');
                              const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${it.name.replace(/[^\w\u0600-\u06FF -]/g, '_').slice(0, 60)}-instructions.txt`;
                              document.body.appendChild(a); a.click(); document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}>
                            <Download size={12} /> {isAr ? "حفظ التعليمات" : "Save instructions"}
                          </Button>
                        )}
                      </div>
                    ))}
                    </>)}
                  </div>
                );
              })()}

              <div className="flex flex-col sm:flex-row gap-2 mt-4 sticky bottom-0 bg-background pt-2 -mx-4 sm:-mx-6 px-4 sm:px-6 border-t">
                <Button className="flex-1 gap-2 h-10" onClick={handlePrintInvoice} disabled={printingPdf}>
                  {printingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {isAr ? "تحميل PDF" : "Download PDF"}
                </Button>
                {user && (
                  <Button variant="outline" className="gap-2 h-10" onClick={() => { setInvoiceOpen(false); navigate("/orders"); }}>
                    <Package size={14} /> {isAr ? "طلباتي" : "My Orders"}
                  </Button>
                )}
                <Button variant="ghost" className="gap-2 h-10 sm:w-auto" onClick={() => setInvoiceOpen(false)}>
                  {isAr ? "إغلاق" : "Close"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Guest Purchases Vault (saved in browser) ═══ */}
      <Dialog open={guestVaultOpen} onOpenChange={setGuestVaultOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <FileDown size={18} /> {isAr ? "تنزيلاتي المحفوظة" : "My Saved Downloads"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground -mt-2">
            {isAr ? "محفوظة في هذا المتصفح. اضغط على الفاتورة لعرض الروابط والتعليمات." : "Saved in this browser. Tap an invoice to view links & instructions."}
          </p>
          <div className="space-y-2 mt-2">
            {guestPurchases.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {isAr ? "لا توجد مشتريات محفوظة." : "No saved purchases yet."}
              </p>
            )}
            {guestPurchases.map((p: any, idx: number) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
                <button
                  className="flex-1 text-start min-w-0"
                  onClick={() => { setInvoiceData(p); setGuestVaultOpen(false); setInvoiceOpen(true); }}
                >
                  <p className="text-xs font-bold truncate">{p.invoiceNumber}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {p.date} · {(p.items || []).length} {isAr ? "منتج" : "items"} · {p.total?.toFixed?.(2)} {p.currency}
                  </p>
                </button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive"
                  onClick={() => {
                    const next = guestPurchases.filter((_: any, i: number) => i !== idx);
                    setGuestPurchases(next);
                    localStorage.setItem(GUEST_PURCHASES_KEY, JSON.stringify(next));
                  }}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
          {guestPurchases.length > 0 && (
            <div className="pt-2 border-t mt-2">
              <Button variant="ghost" size="sm" className="text-xs text-destructive w-full"
                onClick={() => {
                  if (confirm(isAr ? "حذف جميع التنزيلات المحفوظة؟" : "Clear all saved downloads?")) {
                    localStorage.removeItem(GUEST_PURCHASES_KEY);
                    setGuestPurchases([]);
                  }
                }}>
                {isAr ? "مسح الكل" : "Clear all"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Product Detail Modal ═══ */}
      <Dialog open={!!selectedProduct && !checkoutOpen && !cartOpen} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {p && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {/* Media */}
                <div className="bg-muted/30 p-3 sm:p-6">
                  <div className="relative rounded-xl overflow-hidden bg-muted aspect-square mb-2">
                    {(() => {
                      const currentUrl = allImages[selectedImageIdx] || getProductImage(p);
                      const isVideo = /\.(mp4|webm|mov|ogg)$/i.test(currentUrl) || currentUrl.includes("video");
                      if (isVideo) return <video src={currentUrl} controls className="w-full h-full object-contain" />;
                      return <img src={currentUrl} alt="" className="w-full h-full object-contain" />;
                    })()}
                    {allImages.length > 1 && (
                      <>
                        <button onClick={() => setSelectedImageIdx(i => Math.max(0, i - 1))} className="absolute start-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 shadow-md"><ChevronLeft size={16} /></button>
                        <button onClick={() => setSelectedImageIdx(i => Math.min(allImages.length - 1, i + 1))} className="absolute end-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 shadow-md"><ChevronRight size={16} /></button>
                      </>
                    )}
                  </div>
                  {allImages.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                      {allImages.map((url, i) => {
                        const isVid = /\.(mp4|webm|mov|ogg)$/i.test(url) || url.includes("video");
                        return (
                          <button key={i} onClick={() => setSelectedImageIdx(i)}
                            className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 relative ${i === selectedImageIdx ? 'border-primary' : 'border-transparent opacity-60'}`}>
                            {isVid ? <div className="w-full h-full bg-muted flex items-center justify-center text-xs">▶</div> : <img src={url} alt="" className="w-full h-full object-cover" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-3 sm:p-6 space-y-3">
                  <button onClick={() => setSelectedProduct(null)} className="absolute top-2 end-2 z-10 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20">
                    <X size={14} />
                  </button>

                  {p.stock_quantity !== null && p.stock_quantity <= 10 && p.stock_quantity > 0 && (
                    <div className="flex items-center gap-1.5 text-orange-600">
                      <Clock size={12} />
                      <span className="text-[11px] font-semibold">{isAr ? `متبقي ${p.stock_quantity} فقط` : `Only ${p.stock_quantity} left`}</span>
                    </div>
                  )}

                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xl sm:text-2xl font-bold">{displayPrice(p.price, p.currency)}</span>
                    {p.original_price && p.original_price > p.price && (
                      <>
                        <span className="text-sm line-through text-muted-foreground">{displayPrice(p.original_price, p.currency)}</span>
                        <Badge className="bg-red-500 text-white text-[10px]">{getDiscount(p)}% OFF</Badge>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{isAr ? "شامل الضريبة" : "VAT Included"}</p>

                  {reviews.length > 0 && (
                    <div className="flex items-center gap-2">
                      <StarRating rating={Math.round(avgRating)} size={12} />
                      <span className="text-xs text-muted-foreground">({reviews.length} {isAr ? "تقييم" : "reviews"})</span>
                    </div>
                  )}

                  <div>
                    <h2 className="text-base sm:text-lg font-bold mb-1">{isAr ? p.name_ar || p.name : p.name}</h2>
                    <Badge variant="outline" className="text-[10px]">{getCatLabel(p.category)}</Badge>
                  </div>

                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {isAr ? (p.description_ar || p.description) : p.description}
                  </p>

                  {p.specs?.usage_instructions && (
                    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-1">
                      <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400">{isAr ? "تعليمات الاستخدام" : "Usage Instructions"}</h4>
                      <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80 whitespace-pre-wrap">{p.specs.usage_instructions}</p>
                    </div>
                  )}

                  {p.specs?.terms && (
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
                      <h4 className="text-xs font-bold text-amber-700 dark:text-amber-400">{isAr ? "الشروط والأحكام" : "Terms & Conditions"}</h4>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 whitespace-pre-wrap">{p.specs.terms}</p>
                    </div>
                  )}

                  {getCartQty(p.id) > 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-border p-2">
                      <button onClick={() => updateCartQty(p.id, getCartQty(p.id) - 1)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:bg-muted"><Minus size={14} /></button>
                      <span className="font-bold min-w-[32px] text-center">{getCartQty(p.id)}</span>
                      <button onClick={() => updateCartQty(p.id, getCartQty(p.id) + 1)} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90"><Plus size={14} /></button>
                    </div>
                  ) : (
                    <Button className="w-full h-10 sm:h-12 text-sm sm:text-base gap-2 rounded-xl" onClick={() => { addToCart(p); setSelectedProduct(null); }}>
                      <ShoppingCart size={16} /> {isAr ? "أضف للسلة" : "Add to Cart"}
                    </Button>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => toggleWishlist(p.id)}>
                      <Heart size={12} className={wishlist.has(p.id) ? "fill-red-500 text-red-500" : ""} />
                      {isAr ? "المفضلة" : "Wishlist"}
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success(isAr ? "تم نسخ الرابط" : "Link copied"); }}>
                      <Share2 size={12} /> {isAr ? "مشاركة" : "Share"}
                    </Button>
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <h4 className="font-bold text-xs">{isAr ? "تفاصيل المنتج" : "Item Details"}</h4>
                    <div className="space-y-1.5 text-xs">
                      {p.is_featured && <div className="flex items-center gap-2"><Star size={12} className="text-amber-500" /> <span>{isAr ? "منتج مميز" : "Featured"}</span></div>}
                      {p.specs?.download_url && <div className="flex items-center gap-2"><Download size={12} className="text-green-600" /> <span>{isAr ? "تحميل فوري" : "Instant Download"}</span></div>}
                      {p.specs?.file_format && <div className="flex items-center gap-2"><FileText size={12} className="text-primary" /> <span>{p.specs.file_format}</span></div>}
                      {p.specs?.file_type && <div className="flex items-center gap-2"><Package size={12} className="text-muted-foreground" /> <span>{p.specs.file_type}</span></div>}
                    </div>
                  </div>

                  {p.specs?.download_url && (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 size={14} className="text-green-600" />
                        <span className="font-semibold text-xs text-green-700 dark:text-green-400">{isAr ? "تحميل فوري" : "Instant Download"}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{isAr ? "سيكون الملف متاحاً فور تأكيد الدفع" : "Files available once payment is confirmed"}</p>
                    </div>
                  )}

                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {p.tags.map(tag => <Badge key={tag} variant="outline" className="text-[9px]">#{tag}</Badge>)}
                    </div>
                  )}
                </div>
              </div>

              {/* Reviews */}
              <div className="border-t border-border p-3 sm:p-6 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <MessageSquare size={16} /> {isAr ? "التقييمات والمراجعات" : "Reviews & Ratings"}
                  {reviews.length > 0 && <Badge variant="outline" className="text-[10px]">{reviews.length}</Badge>}
                </h3>
                {user && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium">{isAr ? "أضف تقييمك" : "Write a review"}</p>
                    <StarRating rating={reviewRating} size={18} interactive onChange={setReviewRating} />
                    <div className="flex gap-2">
                      <Input className="flex-1 h-8 text-xs" placeholder={isAr ? "اكتب تعليقك..." : "Your comment..."} value={reviewComment} onChange={e => setReviewComment(e.target.value)} />
                      <Button size="sm" className="h-8 gap-1" onClick={handleSubmitReview} disabled={submittingReview}>
                        {submittingReview ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        {isAr ? "إرسال" : "Submit"}
                      </Button>
                    </div>
                  </div>
                )}
                {reviews.length > 0 ? (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {reviews.map(r => (
                      <div key={r.id} className="flex gap-3 p-2 rounded-lg bg-card border border-border/50">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(r.user_name || "U")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold">{r.user_name || "User"}</span>
                            <StarRating rating={r.rating} size={10} />
                          </div>
                          {r.comment && <p className="text-[11px] text-muted-foreground">{r.comment}</p>}
                          <span className="text-[9px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{isAr ? "لا توجد تقييمات بعد" : "No reviews yet"}</p>
                )}
              </div>

              {/* Related Products */}
              {relatedProducts.length > 0 && (
                <div className="border-t border-border p-3 sm:p-6">
                  <h3 className="font-bold text-sm mb-3">{isAr ? "منتجات ذات صلة" : "Related Products"}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {relatedProducts.map(rp => (
                      <Card key={rp.id} className="overflow-hidden cursor-pointer hover:shadow-md transition-all" onClick={() => openProductDetail(rp)}>
                        <div className="aspect-[4/3] bg-muted overflow-hidden">
                          <img src={getProductImage(rp)} alt={rp.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="p-2">
                          <h4 className="text-[11px] font-semibold line-clamp-1">{isAr ? rp.name_ar || rp.name : rp.name}</h4>
                          <span className="text-[10px] font-bold text-primary">{displayPrice(rp.price, rp.currency)}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Cart Button */}
      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <button onClick={() => setCartOpen(true)}
          className="fixed bottom-20 end-4 z-50 bg-primary text-primary-foreground w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform">
          <ShoppingCart size={22} />
          <span className="absolute -top-1 -end-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{cartCount}</span>
        </button>
      )}
      </>
      )}
    </div>
  );
};

export default StorePage;
