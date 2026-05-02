import { lazy, Suspense, useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Sparkles, ShoppingBag, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import HeroSection from "@/components/HeroSection";
import SubscriptionBanner from "@/components/SubscriptionBanner";
import EventsTicker from "@/components/EventsTicker";
import PromptTripPlanner from "@/components/PromptTripPlanner";

const TripWizard = lazy(() => import("@/components/TripWizard"));
const Features = lazy(() => import("@/components/Features"));
const Stats = lazy(() => import("@/components/Stats"));
const PopularDestinations = lazy(() => import("@/components/PopularDestinations"));
const Testimonials = lazy(() => import("@/components/Testimonials"));
const StoriesPreview = lazy(() => import("@/components/StoriesPreview"));
const HomepageEvents = lazy(() => import("@/components/HomepageEvents"));
const HomepageRewards = lazy(() => import("@/components/HomepageRewards"));
const CommentsSection = lazy(() => import("@/components/CommentsSection"));
const Footer = lazy(() => import("@/components/Footer"));
const AppStoreLinks = lazy(() => import("@/components/AppStoreLinks"));
const HomepagePromotions = lazy(() => import("@/components/HomepagePromotions"));
const SocialFollowSection = lazy(() => import("@/components/SocialFollowSection"));
const Chatbot = lazy(() => import("@/components/Chatbot"));

const LazySection = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="min-h-[200px]">
      {visible ? <Suspense fallback={<div className="min-h-[200px]" />}>{children}</Suspense> : null}
    </div>
  );
};

const FALLBACK_IMG = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&q=80";

const HomepageStorePreview = ({ isAr }: { isAr: boolean }) => {
  const { t } = useTranslation();
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("products").select("*").eq("is_active", true).order("sort_order").limit(6)
      .then(({ data }) => { if (data) setProducts(data); });
  }, []);

  const getImage = useCallback((p: any) => {
    if (p.media_urls?.length > 0 && p.media_urls[0]) return p.media_urls[0];
    return FALLBACK_IMG;
  }, []);

  const getDiscount = (p: any) => p.original_price && p.original_price > p.price ? Math.round((1 - p.price / p.original_price) * 100) : 0;

  return (
    <section className="py-12 bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-8">
          <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
            <ShoppingBag size={14} /> {t('index.storeLabel', { defaultValue: isAr ? 'المتجر الرقمي' : 'Digital Store' })}
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-2 gradient-text">
            {t('index.storeTitle', { defaultValue: isAr ? 'ملصقات، قوالب وأدلة سفر' : 'Stickers, Templates & Travel Guides' })}
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto mb-2">
            {t('index.storeDesc', { defaultValue: isAr ? 'منتجات رقمية حصرية — تحميل فوري بعد الشراء' : 'Exclusive digital products — instant download after purchase' })}
          </p>
        </motion.div>

        {products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {products.map((p, i) => {
              const discount = getDiscount(p);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
                  <Link to="/store">
                    <Card className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group">
                      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                        <img src={getImage(p)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                        {discount > 0 && <Badge className="absolute top-1.5 start-1.5 bg-red-500 text-white text-[8px] px-1.5">{discount}% OFF</Badge>}
                      </div>
                      <div className="p-2">
                        <h3 className="text-[10px] sm:text-xs font-semibold line-clamp-1">{isAr ? p.name_ar || p.name : p.name}</h3>
                        <span className="text-[10px] font-bold text-primary">{p.currency} {p.price}</span>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="text-center">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link to="/store" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-8 py-3 rounded-xl hover:bg-primary/90 transition-all shadow-lg">
              <ShoppingBag size={16} />
              {t('index.storeCta', { defaultValue: isAr ? 'تصفح المتجر' : 'Browse Store' })}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const Index = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="pt-14 lg:pt-16">
        <SubscriptionBanner />
        <EventsTicker />
      </div>

      <HeroSection />

      {/* Quick Plan (Chatbot-style prompt) */}
      <section className="py-8 bg-gradient-to-b from-background to-secondary/20" id="quick-plan">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-6"
          >
            <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
              <Sparkles size={14} /> {t('planner.describeTrip')}
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-2 gradient-text">
              {t('index.quickPlanTitle')}
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t('index.quickPlanDesc')}
            </p>
          </motion.div>
          <PromptTripPlanner />
        </div>
      </section>

      <LazySection>
      <section className="py-16 bg-background" id="plan-trip">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
              <Sparkles size={14} /> {t('index.aiPlannerBadge')}
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-3 gradient-text">{t('index.planYourWay')}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              {t('index.planYourWayDesc')}
            </p>
          </motion.div>
          <TripWizard />
        </div>
      </section>
      </LazySection>

      <LazySection><Features /></LazySection>
      <LazySection><Stats /></LazySection>
      <LazySection><PopularDestinations /></LazySection>
      <LazySection><HomepagePromotions /></LazySection>
      <LazySection><HomepageEvents /></LazySection>
      <LazySection><StoriesPreview /></LazySection>
      <LazySection><HomepageRewards /></LazySection>

      {/* Store Preview Section */}
      <LazySection>
        <HomepageStorePreview isAr={isAr} />
      </LazySection>

      <LazySection><Testimonials /></LazySection>
      <LazySection><AppStoreLinks /></LazySection>
      <LazySection><SocialFollowSection /></LazySection>

      <LazySection>
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <CommentsSection destination="general" />
        </div>
      </section>
      </LazySection>

      <section className="py-20 relative overflow-hidden" style={{ background: 'var(--gradient-hero)' }}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-5xl font-extrabold mb-6 text-white">{t('index.ctaTitle')}</h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto text-white/80">
              {t('index.ctaDesc')}
            </p>
            <motion.a
              href="#quick-plan"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="bg-accent text-accent-foreground font-bold px-10 py-4 rounded-2xl hover:bg-accent/90 transition-all duration-300 inline-block text-lg shadow-2xl"
            >
              {t('index.ctaButton')}
            </motion.a>
          </motion.div>
        </div>
      </section>

      <LazySection><Footer /></LazySection>
      {/* Chatbot is now rendered at App level for all pages */}
    </motion.div>
  );
};

export default Index;
