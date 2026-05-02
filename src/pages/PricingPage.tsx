import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Check, Crown, Zap, Star, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "@/hooks/useCurrency";
import MoyasarPaymentForm from "@/components/MoyasarPaymentForm";
import { getMoyasarMethodsForCurrency, MOYASAR_PUBLISHABLE_KEY, moyasarCapabilities, resolveMoyasarChargeCurrency } from "@/lib/moyasar";
import { isRetryableMoyasarInitError } from "@/lib/moyasarRetry";

interface Plan {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  price: number;
  currency: string;
  duration_days: number;
  daily_limit: number;
  max_daily_generations: number;
  max_monthly_generations: number;
  max_generation_days: number;
  max_activities_per_day: number;
  max_total_activities: number; // Added for fixed-quota model
  voice_enabled: boolean;
  chat_enabled: boolean;
  weather_enabled: boolean;
  news_enabled: boolean;
  emergency_enabled: boolean;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

interface UpgradeDiscountConfig {
  upgrade_discount_enabled?: boolean;
  upgrade_discount_percent?: number;
  upgrade_discount_max_subscribers?: number;
}

// Flexible Plan Builder Component
const FlexPlanBuilder = ({ isArabic, formatPrice, user, navigate }: { isArabic: boolean; formatPrice: (v: number, c: string) => string; user: any; navigate: any }) => {
  const [config, setConfig] = useState<any>(null);
  const [trips, setTrips] = useState(3);
  const [days, setDays] = useState(5);
  const [activitiesPerDay, setActivitiesPerDay] = useState(5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('site_settings').select('flex_plan_config').eq('id', 'default').maybeSingle().then(({ data }) => {
      const c = (data as any)?.flex_plan_config;
      if (c?.enabled) setConfig(c);
      setLoading(false);
    });
  }, []);

  if (loading || !config) return null;

  const price = Math.max(
    config.min_price,
    config.base_price + (trips * config.per_trip) + (days * config.per_day) + (activitiesPerDay * config.per_activity)
  );

  const handleSubscribe = async () => {
    if (!user) { navigate('/auth'); return; }
    toast.info(isArabic ? 'سيتم التواصل معك لإتمام الاشتراك المخصص' : 'Custom plan subscription coming soon!');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="max-w-lg mx-auto mt-12 rounded-2xl border-2 border-dashed border-primary/30 p-6 bg-card">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-sm font-bold px-4 py-1.5 rounded-full mb-3">
          🎛️ {isArabic ? 'الباقة المرنة' : 'Flexible Plan'}
        </div>
        <p className="text-sm text-muted-foreground">
          {isArabic ? 'صمّم باقتك بنفسك واختر ما يناسبك' : 'Build your own plan and choose what fits you'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium flex justify-between">
            <span>{isArabic ? 'عدد الرحلات' : 'Number of Trips'}</span>
            <span className="text-primary font-bold">{trips}</span>
          </label>
          <input type="range" min={1} max={20} value={trips} onChange={e => setTrips(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
        <div>
          <label className="text-sm font-medium flex justify-between">
            <span>{isArabic ? 'عدد الأيام لكل رحلة' : 'Days per Trip'}</span>
            <span className="text-primary font-bold">{days}</span>
          </label>
          <input type="range" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
        <div>
          <label className="text-sm font-medium flex justify-between">
            <span>{isArabic ? 'فعاليات يومياً' : 'Activities per Day'}</span>
            <span className="text-primary font-bold">{activitiesPerDay}</span>
          </label>
          <input type="range" min={3} max={10} value={activitiesPerDay} onChange={e => setActivitiesPerDay(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="text-3xl font-bold text-foreground">{formatPrice(price, config.currency)}</div>
        <span className="text-sm text-muted-foreground">/ {config.duration_days} {isArabic ? 'يوم' : 'days'}</span>
      </div>

      <Button className="w-full mt-4 gap-2" onClick={handleSubscribe}>
        {isArabic ? 'اشترك بالباقة المرنة' : 'Subscribe to Flexible Plan'}
      </Button>
    </motion.div>
  );
};

const PricingPage = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const { formatPrice, convertPrice, convertToCurrency, currency: userCurrency, getSymbol } = useCurrency();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ percent: number; code: string } | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [upgradeDiscountConfig, setUpgradeDiscountConfig] = useState<UpgradeDiscountConfig>({});
  const [paymentStep, setPaymentStep] = useState<'plans' | 'gateway'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [paymentFormKey, setPaymentFormKey] = useState(0);
  // Moyasar inline form replaces external gateways

  useEffect(() => {
    fetchPlans();
    if (user) fetchUserSubscription();
  }, [user]);

  useEffect(() => {
    if (paymentStep === 'gateway') {
      setPaymentFormKey((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [i18n.language, paymentStep]);

  const reloadPaymentView = () => {
    setSelectedPlan((prev) => (prev ? { ...prev } : prev));
    setPaymentFormKey((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const fetchPlans = async () => {
    const [plansRes, settingsRes] = await Promise.all([
      supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("site_settings").select("financial_config").eq("id", "default").maybeSingle(),
    ]);

    if (plansRes.data) setPlans(plansRes.data.map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
    setUpgradeDiscountConfig(((settingsRes.data as any)?.financial_config || {}) as UpgradeDiscountConfig);
    setLoading(false);
  };

  const fetchUserSubscription = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status, expires_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (data) setCurrentPlanId(data.plan_id);
  };

  const applyDiscount = async () => {
    if (!discountCode.trim()) return;
    const { data } = await supabase
      .from("discount_codes")
      .select("*")
      .eq("code", discountCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    if (data && (data.discount_percent ?? 0) > 0) {
      setAppliedDiscount({ percent: data.discount_percent ?? 0, code: data.code });
      toast.success(`✅ ${isArabic ? 'تم تطبيق الكود' : 'Discount applied'}: ${data.discount_percent}% off`);
    } else {
      toast.error(isArabic ? "كود غير صالح" : "Invalid discount code");
    }
  };

  const activateSubscription = async (planId: string) => {
    const { error } = await supabase.functions.invoke('process-payment', {
      body: { action: 'confirm-payment', planId },
    });
    if (error) throw error;
    // Carry over remaining credits from previous plan
    if (user) {
      const { carryOverRemainingCredits, createInvoice } = await import('@/utils/subscriptionHelpers');
      const carried = await carryOverRemainingCredits(user.id, planId);
      if (carried > 0) {
        toast.success(isArabic ? `🎁 تم ترحيل ${carried} نشاط من باقتك السابقة!` : `🎁 ${carried} activities carried over from your previous plan!`);
      }
      // Create invoice record for paid plans
      const plan = plans.find(p => p.id === planId);
      if (plan && plan.price > 0) {
        const amount = getDiscountedPrice(plan.price);
        await createInvoice({
          userId: user.id,
          planId: plan.id,
          planName: isArabic && plan.name_ar ? plan.name_ar : plan.name,
          amount,
          currency: plan.currency || 'SAR',
          paymentMethod: 'moyasar',
          billingEmail: user.email || undefined,
          taxRate: 0.15,
          status: 'paid',
        });
      }
    }
    await fetchUserSubscription();
    toast.success(isArabic ? '✅ تم تفعيل الاشتراك بنجاح!' : '✅ Subscription activated!');
  };

  const handleMoyasarCompleted = async (plan: Plan, payment: any) => {
    console.log('[Moyasar] Payment completed:', payment);
    // Always charge in SAR (Moyasar live currently supports SAR for our account)
    const chargeCurrency = 'SAR';
    const chargeAmount = Number(
      convertToCurrency(getDiscountedPrice(plan.price), plan.currency || 'USD', chargeCurrency).toFixed(2)
    );
    try {
      const { data, error } = await supabase.functions.invoke('process-payment', {
        body: {
          action: 'verify-moyasar-payment',
          planId: plan.id,
          paymentId: payment?.id,
          source: payment?.source?.type || payment?.source,
          expectedCurrency: chargeCurrency,
          expectedAmount: chargeAmount,
          gateway: 'moyasar',
          lang: isArabic ? 'ar' : 'en',
        },
      });
      if (error || !(data as any)?.success) {
        const failureMessage = error?.message || (data as any)?.error || (data as any)?.message || 'verification_failed';
        if (isRetryableMoyasarInitError(failureMessage) || (data as any)?.pending || (data as any)?.fallback) {
          toast.message(isArabic ? 'تم استلام الدفع ونجري التحقق النهائي الآن…' : 'Payment received — finishing final verification…');
          return;
        }
        throw error || new Error(failureMessage);
      }
      // Carry over remaining credits from previous plan (upgrade path)
      if (user) {
        try {
          const { carryOverRemainingCredits } = await import('@/utils/subscriptionHelpers');
          const carried = await carryOverRemainingCredits(user.id, plan.id);
          if (carried > 0) {
            toast.success(isArabic ? `🎁 تم ترحيل ${carried} نشاط من باقتك السابقة!` : `🎁 ${carried} activities carried over from your previous plan!`);
          }
        } catch (carryErr) {
          console.warn('Carry-over failed:', carryErr);
        }
      }
      await fetchUserSubscription();
      toast.success(isArabic ? '✅ تم تفعيل الاشتراك بنجاح!' : '✅ Subscription activated!');
      setPaymentStep('plans');
      setSubscribing(null);
      // Refresh page so all subscription-gated UI picks up the new plan
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      console.error('[Moyasar] Activation error:', e);
      toast.error((e as any)?.message || (isArabic ? 'تم الدفع لكن تعذر التفعيل. تواصل مع الدعم.' : 'Payment succeeded but activation failed.'));
      setSubscribing(null);
    }
  };

  const handleSubscribe = async (plan: Plan) => {
    if (!user) {
      toast.info(isArabic ? "يرجى تسجيل الدخول أولاً" : "Please sign in first");
      navigate("/auth");
      return;
    }

    if (plan.price === 0) {
      setSubscribing(plan.id);
      try {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
        await supabase.from("user_subscriptions").insert({
          user_id: user.id,
          plan_id: plan.id,
          expires_at: expiresAt.toISOString(),
          status: "active",
        });
        toast.success(isArabic ? "✅ تم تفعيل الباقة المجانية" : "✅ Free plan activated");
        setCurrentPlanId(plan.id);
      } finally {
        setSubscribing(null);
      }
      return;
    }

    // Provide immediate visual feedback then transition to payment view
    setSubscribing(plan.id);
    setSelectedPlan(plan);
    setPaymentStep('gateway');
    // Scroll to top so user sees the payment form even on long pages
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    // Clear "subscribing" flag once form has had a moment to mount
    setTimeout(() => setSubscribing(null), 800);
  };

  const getDiscountedPrice = (price: number) => {
    let finalPrice = price;
    if (appliedDiscount) finalPrice = finalPrice * (1 - appliedDiscount.percent / 100);
    if (currentPlanId && upgradeDiscountConfig.upgrade_discount_enabled && (upgradeDiscountConfig.upgrade_discount_percent || 0) > 0) {
      finalPrice = finalPrice * (1 - (upgradeDiscountConfig.upgrade_discount_percent || 0) / 100);
    }
    return Number(finalPrice.toFixed(2));
  };

  const formatLatnCount = (value: number) =>
    new Intl.NumberFormat(isArabic ? "ar-u-nu-latn" : i18n.language || "en-US", {
      numberingSystem: "latn",
      maximumFractionDigits: 0,
    }).format(value);

  const formatPlanPrice = (value: number, sourceCurrency: string) =>
    formatPrice(value, sourceCurrency || "USD");

  const containsArabicScript = (value: string) => /[\u0600-\u06FF]/.test(value);

  const planIcons = [Zap, Star, Crown];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-16 px-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {t('pricing.title')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('pricing.subtitle')}
          </p>
        </motion.div>

        {paymentStep === 'gateway' && selectedPlan ? (
          <div className="max-w-md mx-auto px-1 sm:px-0">
            {(() => {
              // Always charge in SAR — show user's preferred currency for transparency
              const chargeCurrency = 'SAR';
              const requestedCurrency = (userCurrency || selectedPlan.currency || 'USD').toUpperCase();
              const displayedAmount = getDiscountedPrice(selectedPlan.price);
              const chargeAmount = Number(
                convertToCurrency(displayedAmount, selectedPlan.currency || 'USD', chargeCurrency).toFixed(2)
              );
              const userDisplayAmount = Number(
                convertToCurrency(displayedAmount, selectedPlan.currency || 'USD', requestedCurrency).toFixed(2)
              );

              return (
                <>
            <button onClick={() => { setPaymentStep('plans'); setSubscribing(null); }} className="text-sm text-primary mb-6 hover:underline">
              ← {t('pricing.backToPlans')}
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
                {isArabic && selectedPlan.name_ar ? selectedPlan.name_ar : selectedPlan.name}
              </p>
              <div className="mt-2 inline-flex max-w-full flex-col items-center gap-1">
                <span className="text-2xl font-bold text-primary">
                  {getSymbol(requestedCurrency)}{userDisplayAmount.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{requestedCurrency}</span>
                </span>
                {/* Always show the SAR charge for transparency in every language. */}
                <span className="text-[11px] text-muted-foreground">
                  {t('pricing.chargedInSar', { amount: chargeAmount.toFixed(2) })}
                </span>
                <span className="text-[11px] text-muted-foreground text-center leading-5 max-w-[22rem]">
                  {t('pricing.currencyFeesNotice')}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/80 p-3 sm:p-4 shadow-sm">
            <MoyasarPaymentForm
              key={`${selectedPlan.id}-${i18n.language}-${paymentFormKey}`}
              amount={chargeAmount}
              currency={chargeCurrency}
              description={`ASEEL AI TRIP - ${selectedPlan.name}`}
              publishableKey={MOYASAR_PUBLISHABLE_KEY}
              metadata={{ plan_id: selectedPlan.id, user_id: user?.id || '', plan_name: selectedPlan.name, requested_currency: requestedCurrency, requested_amount: userDisplayAmount, charged_currency: chargeCurrency, charged_amount: chargeAmount }}
              onCompleted={(payment) => handleMoyasarCompleted(selectedPlan, payment)}
              onLanguageRefresh={reloadPaymentView}
              callbackUrl={window.location.origin + '/pricing'}
              methods={getMoyasarMethodsForCurrency(chargeCurrency)}
              samsungPay={moyasarCapabilities.samsungPay ? { serviceId: moyasarCapabilities.samsungServiceId, label: 'ASEEL AI TRIP', environment: 'PRODUCTION' } : undefined}
            />
            </div>

            <p className="text-xs text-muted-foreground text-center mt-6">
              🔒 {t('pricing.securePayments')}
            </p>
                </>
              );
            })()}
          </div>
        ) : (
          <>
            {/* Discount Code */}
            <div className="max-w-md mx-auto mb-10">
              <div className="flex gap-2">
                <Input
                  placeholder={t('pricing.discountPlaceholder')}
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  className="uppercase"
                />
                <Button variant="outline" onClick={applyDiscount} className="gap-1 shrink-0">
                  <Tag size={14} /> {t('pricing.apply')}
                </Button>
              </div>
              {appliedDiscount && (
                <p className="text-xs text-green-600 mt-1 text-center">
                  ✅ {appliedDiscount.code}: {appliedDiscount.percent}% {t('pricing.discount')}
                </p>
              )}
            </div>

            {/* Plans Grid */}
            <div className={`grid grid-cols-1 md:grid-cols-${Math.min(plans.length, 3)} gap-6 max-w-5xl mx-auto`}>
              {plans.map((plan, idx) => {
                const Icon = planIcons[idx % planIcons.length];
                const isCurrent = currentPlanId === plan.id;
                const isFree = plan.price === 0;
                const isPopular = idx === 1 && plans.length > 1;
                const finalPrice = getDiscountedPrice(plan.price);
                const localizedCustomFeatures = plan.features.filter((feature) =>
                  isArabic ? containsArabicScript(feature) : !containsArabicScript(feature)
                );

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`relative rounded-2xl border-2 p-6 flex flex-col ${
                      isPopular ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]" : "border-border"
                    } ${isCurrent ? "bg-primary/5" : "bg-card"}`}
                  >
                    {isPopular && (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                        {t('pricing.mostPopular')}
                      </Badge>
                    )}
                    {isCurrent && (
                      <Badge className="absolute -top-3 right-4 bg-green-600 text-white">
                        {t('pricing.currentPlan')}
                      </Badge>
                    )}

                    <div className="text-center mb-6">
                      <Icon className="mx-auto mb-3 text-primary" size={32} />
                      <h3 className="text-xl font-bold text-foreground">
                        {isArabic && plan.name_ar ? plan.name_ar : plan.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isArabic && plan.description_ar ? plan.description_ar : plan.description}
                      </p>
                    </div>

                    <div className="text-center mb-6">
                      {appliedDiscount && plan.price > 0 && (
                        <span className="text-sm text-muted-foreground line-through">{formatPlanPrice(plan.price, plan.currency)}</span>
                      )}
                      <div className="text-3xl font-bold text-foreground">
                        {isFree ? t('pricing.free') : formatPlanPrice(finalPrice, plan.currency)}
                      </div>
                      {!isFree && (
                        <span className="text-sm text-muted-foreground">
                          / {formatLatnCount(plan.duration_days)} {t('pricing.days')}
                        </span>
                      )}
                    </div>

                    <p className="text-[#8E9196] font-medium text-sm mb-4">
                      {isArabic 
                        ? `إجمالي ${formatLatnCount(plan.max_total_activities)} نشاط (شامل الوجبات) لهذه الباقة` 
                        : `Total of ${formatLatnCount(plan.max_total_activities)} activities (meals included) for this plan`}
                    </p>

                    <ul className="space-y-3 mb-6 flex-1">
                      {plan.max_total_activities > 0 ? (
                        <li className="flex items-center gap-2 text-sm font-bold text-primary">
                          <Zap size={16} className="shrink-0" />
                          <span>
                            {isArabic 
                              ? `${formatLatnCount(plan.max_total_activities)} نشاط إجمالي (شامل الوجبات)` 
                              : `${formatLatnCount(plan.max_total_activities)} total activities (meals included)`}
                          </span>
                        </li>
                      ) : (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{formatLatnCount(plan.max_daily_generations)} {t('pricing.dailyGenerations')}</span>
                        </li>
                      )}
                      
                      {plan.max_monthly_generations > 0 && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{formatLatnCount(plan.max_monthly_generations)} {t('pricing.monthlyGenerations')}</span>
                        </li>
                      )}
                      <li className="flex items-center gap-2 text-sm">
                        <Check size={16} className="text-green-500 shrink-0" />
                        <span>{(t as any)('pricing.upToDayTrips', { count: formatLatnCount(plan.max_generation_days) })}</span>
                      </li>
                      <li className="flex items-center gap-2 text-sm">
                        <Check size={16} className="text-green-500 shrink-0" />
                        <span>{(t as any)('pricing.activitiesPerDay', { count: formatLatnCount(plan.max_activities_per_day) })}</span>
                      </li>
                      {plan.voice_enabled && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{t('pricing.voiceAssistant')}{(plan as any).max_voice_uses > 0 ? ` (${(plan as any).max_voice_uses} ${isArabic ? 'مرة' : 'uses'})` : ''}</span>
                        </li>
                      )}
                      {plan.chat_enabled && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{t('pricing.aiChat')}{(plan as any).max_chat_uses > 0 ? ` (${(plan as any).max_chat_uses} ${isArabic ? 'مرة' : 'uses'})` : ''}</span>
                        </li>
                      )}
                      {plan.weather_enabled && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{t('pricing.weatherInfo')}{(plan as any).max_weather_uses > 0 ? ` (${(plan as any).max_weather_uses} ${isArabic ? 'مرة' : 'uses'})` : ''}</span>
                        </li>
                      )}
                      {plan.news_enabled && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{t('pricing.travelNews')}{(plan as any).max_news_uses > 0 ? ` (${(plan as any).max_news_uses} ${isArabic ? 'مرة' : 'uses'})` : ''}</span>
                        </li>
                      )}
                      {plan.emergency_enabled && (
                        <li className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{t('pricing.emergencyNumbers')}{(plan as any).max_emergency_uses > 0 ? ` (${(plan as any).max_emergency_uses} ${isArabic ? 'مرة' : 'uses'})` : ''}</span>
                        </li>
                      )}
                      {localizedCustomFeatures.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Check size={16} className="text-green-500 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      onClick={() => handleSubscribe(plan)}
                      disabled={subscribing === plan.id || isCurrent}
                      className={`w-full ${isPopular ? "bg-primary hover:bg-primary/90" : ""}`}
                      variant={isPopular ? "default" : "outline"}
                    >
                      {subscribing === plan.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {isArabic ? 'جاري التحميل...' : 'Loading...'}
                        </span>
                      ) : isCurrent
                        ? t('pricing.active')
                        : currentPlanId && !isFree
                        ? (isArabic ? 'ترقية الباقة' : 'Upgrade')
                        : isFree
                        ? t('pricing.startFree')
                        : t('pricing.subscribeNow')}
                    </Button>
                  </motion.div>
                );
              })}
            </div>

            {/* Flexible Plan Builder */}
            <FlexPlanBuilder isArabic={isArabic} formatPrice={formatPlanPrice} user={user} navigate={navigate} />

            {plans.length === 0 && (
              <div className="text-center py-16">
                <p className="text-muted-foreground text-lg">
                  {t('pricing.noPlans')}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PricingPage;
