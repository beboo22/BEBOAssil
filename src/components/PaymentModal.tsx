import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Crown, Check, Loader2, Star, ShieldCheck, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
import MoyasarPaymentForm from '@/components/MoyasarPaymentForm';
import { getMoyasarMethodsForCurrency, MOYASAR_PUBLISHABLE_KEY, moyasarCapabilities, resolveMoyasarChargeCurrency } from '@/lib/moyasar';
import { isRetryableMoyasarInitError } from '@/lib/moyasarRetry';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  generationsUsed?: number;
  generationsLimit?: number;
}

interface Plan {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  price: number;
  currency: string;
  duration_days: number;
  max_daily_generations: number;
  max_monthly_generations: number;
  max_generation_days: number;
  voice_enabled: boolean;
  chat_enabled: boolean;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

const planIcons = [Zap, Star, Crown, Crown];

const PaymentModal = ({ isOpen, onClose, onSuccess, generationsUsed = 0, generationsLimit = 3 }: PaymentModalProps) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { formatPrice, convertPrice, currency: userCurrency } = useCurrency();
  const isArabic = i18n.language?.startsWith('ar');
  const [loading, setLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fetching, setFetching] = useState(true);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ percent: number; code: string } | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'plans' | 'gateway'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const safeUsed = Math.max(0, generationsUsed || 0);
  const safeLimit = Math.max(0, generationsLimit || 0);
  const remaining = Math.max(0, safeLimit - safeUsed);

  useEffect(() => {
    if (isOpen) {
      fetchPlans();
      if (user) fetchUserSub();
      else setCurrentPlanId(null);
      setPaymentStep('plans');
      setSelectedPlan(null);
    }
  }, [isOpen, user]);

  const fetchPlans = async () => {
    setFetching(true);
    const { data } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (data) {
      setPlans(data.map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));
    }
    setFetching(false);
  };

  const fetchUserSub = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCurrentPlanId(data?.plan_id ?? null);
  };

  const applyDiscount = async () => {
    if (!discountCode.trim()) return;
    const { data } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', discountCode.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    if (data && (data.discount_percent ?? 0) > 0) {
      setAppliedDiscount({ percent: data.discount_percent ?? 0, code: data.code });
      toast.success(`✅ ${data.discount_percent}% ${isArabic ? 'خصم' : 'off'}`);
    } else {
      toast.error(isArabic ? 'كود غير صالح' : 'Invalid code');
    }
  };

  const getDiscountedPrice = (price: number) => {
    if (!appliedDiscount) return price;
    return price * (1 - appliedDiscount.percent / 100);
  };

  const containsArabicScript = (v: string) => /[\u0600-\u06FF]/.test(v);

  const activateSubscription = async (planId: string) => {
    const { error } = await supabase.functions.invoke('process-payment', {
      body: { action: 'confirm-payment', planId, gateway: 'moyasar', lang: i18n.language?.startsWith('ar') ? 'ar' : 'en' },
    });
    if (error) throw error;
    // Carry over any remaining credits from the previous plan
    if (user) {
      const { carryOverRemainingCredits, createInvoice } = await import('@/utils/subscriptionHelpers');
      const carried = await carryOverRemainingCredits(user.id, planId);
      if (carried > 0) {
        toast.success(isArabic ? `🎁 تم ترحيل ${carried} نشاط من باقتك السابقة!` : `🎁 ${carried} activities carried over from your previous plan!`);
      }
      // Create invoice for paid plan activation
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
    await fetchUserSub();
    toast.success(isArabic ? '✅ تم تفعيل الاشتراك بنجاح!' : '✅ Subscription activated!');
    onSuccess?.();
    onClose();
  };

  const handleSubscribe = async (plan: Plan) => {
    if (!user) {
      toast.info(isArabic ? 'يرجى تسجيل الدخول أولاً' : 'Please sign in first');
      onClose();
      navigate('/auth');
      return;
    }

    // Free plan
    if (plan.price === 0) {
      setLoading(plan.id);
      try {
        const { data: existingSub } = await supabase
          .from('user_subscriptions')
          .select('id, plan_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gte('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSub?.plan_id === plan.id) {
          setCurrentPlanId(plan.id);
          toast.success(isArabic ? '✅ الباقة المجانية مفعّلة بالفعل' : '✅ Free plan already active');
          onSuccess?.();
          onClose();
          return;
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (plan.duration_days || 365));
        await supabase.from('user_subscriptions').insert({
          user_id: user.id,
          plan_id: plan.id,
          expires_at: expiresAt.toISOString(),
          status: 'active',
        });

        const planDisplayName = isArabic && plan.name_ar ? plan.name_ar : plan.name;
        await supabase.from('notifications').insert({
          user_id: user.id,
          type: 'subscription_activated',
          title: isArabic ? '✅ تم تفعيل الباقة المجانية!' : '✅ Free plan activated!',
          message: isArabic
            ? `تم تفعيل باقة "${planDisplayName}" بنجاح. استمتع بالتوليدات المجانية!`
            : `"${planDisplayName}" plan activated successfully. Enjoy your free generations!`,
          metadata: { plan_id: plan.id, plan_name: plan.name, gateway: 'free', expires_at: expiresAt.toISOString() } as any,
        });

        try {
          await supabase.functions.invoke('send-email', {
            body: {
              to: user.email,
              subject: isArabic ? `✅ تأكيد تفعيل الباقة المجانية - ${planDisplayName}` : `✅ Free Plan Activated - ${planDisplayName}`,
              html: `<!DOCTYPE html>
<html dir="${isArabic ? 'rtl' : 'ltr'}" lang="${isArabic ? 'ar' : 'en'}">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px">${isArabic ? '✅ تم تفعيل الباقة المجانية!' : '✅ Free Plan Activated!'}</h1>
    <p style="color:#a0aec0;margin:8px 0 0;font-size:14px">ASEEL AI TRIP</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px;color:#2d3748">${isArabic ? `تم تفعيل باقة "${planDisplayName}" بنجاح.` : `Your "${planDisplayName}" plan is now active.`}</p>
    <p style="font-size:14px;color:#718096">${isArabic ? `ينتهي في: ${expiresAt.toLocaleDateString('ar-SA')}` : `Expires: ${expiresAt.toLocaleDateString('en-US')}`}</p>
    <a href="https://aseelaitrip.com" style="display:inline-block;margin-top:16px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600">${isArabic ? 'ابدأ التخطيط الآن' : 'Start Planning Now'}</a>
  </div>
  <div style="background:#f7fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;color:#a0aec0;font-size:12px">support@aseelaitrip.com</p>
  </div>
</div>
</body></html>`,
            },
          });
        } catch (emailErr) {
          console.error('Free plan email error (non-blocking):', emailErr);
        }

        toast.success(isArabic ? '✅ تم تفعيل الباقة المجانية' : '✅ Free plan activated');
        await fetchUserSub();
        onSuccess?.();
        onClose();
      } catch (error: any) {
        toast.error(error?.message || 'Failed');
      } finally {
        setLoading(null);
      }
      return;
    }

    // Paid plan - show Moyasar form
    setSelectedPlan(plan);
    setPaymentStep('gateway');
    setLoading(null);
  };

  const handleMoyasarCompleted = async (payment: any) => {
    if (!selectedPlan) return;
    console.log('[Moyasar] Payment completed:', payment);
    const chargeCurrency = resolveMoyasarChargeCurrency(userCurrency || selectedPlan.currency);
    const chargeAmount = Number(convertPrice(getDiscountedPrice(selectedPlan.price), selectedPlan.currency).toFixed(2));

    try {
      // Verify payment on server and activate
      const { data, error } = await supabase.functions.invoke('process-payment', {
        body: {
          action: 'verify-moyasar-payment',
          planId: selectedPlan.id,
          paymentId: payment?.id,
          source: payment?.source?.type || payment?.source,
          expectedCurrency: chargeCurrency,
          expectedAmount: chargeAmount,
          gateway: 'moyasar',
          lang: isArabic ? 'ar' : 'en',
        },
      });

      if (error || !(data as any)?.success) {
        const message = error?.message || (data as any)?.error || (data as any)?.message;
        if (isRetryableMoyasarInitError(message) || (data as any)?.pending || (data as any)?.fallback) {
          toast.message(isArabic ? 'تم استلام الدفع ونجري التحقق النهائي الآن…' : 'Payment received — finishing final verification…');
          return;
        }
        console.error('[Moyasar] Server verification error:', error || data);
        toast.error(message || (isArabic ? 'تم رفض التحقق من الدفع. لم يتم تفعيل الاشتراك.' : 'Payment verification failed. Subscription was not activated.'));
      } else {
        await fetchUserSub();
        toast.success(isArabic ? '✅ تم تفعيل الاشتراك بنجاح!' : '✅ Subscription activated!');
        onSuccess?.();
        onClose();
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      console.error('[Moyasar] Activation error:', e);
      toast.error((e as any)?.message || (isArabic ? 'تم الدفع لكن تعذر التفعيل. تواصل مع الدعم.' : 'Payment succeeded but activation failed. Contact support.'));
    }
  };

  const renderGatewaySelection = () => {
    if (!selectedPlan) return null;
    const finalPrice = getDiscountedPrice(selectedPlan.price);
    const chargeCurrency = resolveMoyasarChargeCurrency(userCurrency || selectedPlan.currency);
    const chargeAmount = Number(convertPrice(finalPrice, selectedPlan.currency).toFixed(2));
    // Convert to user's selected currency for display
    const displayCurrency = userCurrency || selectedPlan.currency;
    const convertedPrice = convertPrice(finalPrice, selectedPlan.currency);

    return (
      <div className="p-6">
        <button onClick={() => { setPaymentStep('plans'); setLoading(null); }} className="text-sm text-primary mb-4 hover:underline">
          ← {isArabic ? 'العودة للباقات' : 'Back to plans'}
        </button>

        <div className="text-center mb-6">
          <h3 className="text-lg font-bold text-foreground mb-1">
            {isArabic ? 'إتمام الدفع' : 'Complete Payment'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isArabic && selectedPlan.name_ar ? selectedPlan.name_ar : selectedPlan.name} — {formatPrice(finalPrice, selectedPlan.currency)}
          </p>
        </div>

        <MoyasarPaymentForm
          amount={chargeAmount}
          currency={chargeCurrency}
          description={`ASEEL AI TRIP - ${selectedPlan.name}`}
          publishableKey={MOYASAR_PUBLISHABLE_KEY}
          metadata={{ plan_id: selectedPlan.id, user_id: user?.id || '', plan_name: selectedPlan.name, requested_currency: userCurrency || selectedPlan.currency, charged_currency: chargeCurrency, charged_amount: chargeAmount }}
          onCompleted={handleMoyasarCompleted}
          callbackUrl={window.location.origin + '/pricing'}
          methods={getMoyasarMethodsForCurrency(chargeCurrency)}
          samsungPay={moyasarCapabilities.samsungPay ? { serviceId: moyasarCapabilities.samsungServiceId, label: 'ASEEL AI TRIP', environment: 'PRODUCTION' } : undefined}
        />
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="payment-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            key="payment-modal-content"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 5 }}
            className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden border border-border max-h-[90vh] overflow-y-auto"
            dir={isArabic ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="p-6 pb-3 text-center relative">
              <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
              <div className="flex justify-center mb-4">
                <div className="bg-primary/10 p-3 rounded-2xl">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-extrabold text-foreground mb-1">
                {isArabic ? 'باقات الاشتراك' : 'Premium Access'}
              </h2>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                {isArabic
                  ? `استخدمت ${safeUsed} من ${safeLimit} توليد اليوم. المتبقي ${remaining}.`
                  : `You've used ${safeUsed} of ${safeLimit} generations today. ${remaining} remaining.`}
              </p>
            </div>

            {paymentStep === 'plans' ? (
              <>
                {/* Discount Code */}
                <div className="px-6 pb-3">
                  <div className="flex gap-2 max-w-xs mx-auto">
                    <Input
                      placeholder={isArabic ? 'كود الخصم' : 'Discount code'}
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      className="uppercase h-8 text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={applyDiscount} className="gap-1 shrink-0 h-8 text-xs">
                      <Tag size={12} /> {isArabic ? 'تطبيق' : 'Apply'}
                    </Button>
                  </div>
                  {appliedDiscount && (
                    <p className="text-[10px] text-green-500 mt-1 text-center">
                      ✅ {appliedDiscount.code}: {appliedDiscount.percent}% {isArabic ? 'خصم' : 'off'}
                    </p>
                  )}
                </div>

                {/* Plans */}
                <div className="p-6 pt-2">
                  {fetching ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin text-primary" size={24} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {plans.map((plan, idx) => {
                        const Icon = planIcons[idx % planIcons.length];
                        const isCurrent = currentPlanId === plan.id;
                        const isFree = plan.price === 0;
                        const isPopular = idx === Math.min(2, plans.length - 1) && plans.length > 1;
                        const finalPrice = getDiscountedPrice(plan.price);
                        const localFeatures = plan.features.filter(f =>
                          isArabic ? containsArabicScript(f) : !containsArabicScript(f)
                        );

                        return (
                          <div
                            key={plan.id}
                            className={`relative rounded-2xl border-2 p-5 flex flex-col transition-all ${
                              isPopular ? 'border-primary bg-primary/5' : 'border-border bg-card'
                            } ${isCurrent ? 'ring-2 ring-green-500/50' : ''}`}
                          >
                            {isPopular && (
                              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px]">
                                {isArabic ? 'الأكثر طلباً' : 'RECOMMENDED'}
                              </Badge>
                            )}
                            {isCurrent && (
                              <Badge className="absolute -top-2.5 right-3 bg-green-600 text-white text-[10px]">
                                {isArabic ? 'باقتك' : 'Current'}
                              </Badge>
                            )}

                            <div className="flex items-center gap-2 mb-3">
                              <div className={`p-2 rounded-xl ${isPopular ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                <Icon size={16} />
                              </div>
                              <span className="font-bold text-sm text-foreground">
                                {isArabic && plan.name_ar ? plan.name_ar : plan.name}
                              </span>
                            </div>

                            <div className="mb-4">
                              {appliedDiscount && plan.price > 0 && (
                                <span className="text-xs text-muted-foreground line-through mr-1">
                                  {formatPrice(plan.price, plan.currency)}
                                </span>
                              )}
                              <span className="text-2xl font-black text-foreground">
                                {isFree ? (isArabic ? 'مجاني' : 'Free') : formatPrice(finalPrice, plan.currency)}
                              </span>
                              {!isFree && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  / {plan.duration_days} {isArabic ? 'يوم' : 'days'}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col gap-1.5 mb-5 flex-1">
                              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                <Check size={12} className="text-green-500 mt-0.5 shrink-0" />
                                <span>{plan.max_daily_generations} {isArabic ? 'توليد يومي' : 'daily generations'}</span>
                              </div>
                              {plan.voice_enabled && (
                                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                  <Check size={12} className="text-green-500 mt-0.5 shrink-0" />
                                  <span>{isArabic ? 'المساعد الصوتي' : 'Voice Assistant'}</span>
                                </div>
                              )}
                              {plan.chat_enabled && (
                                <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                  <Check size={12} className="text-green-500 mt-0.5 shrink-0" />
                                  <span>{isArabic ? 'الدردشة الذكية' : 'AI Chat'}</span>
                                </div>
                              )}
                              {localFeatures.map((f, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                  <Check size={12} className="text-green-500 mt-0.5 shrink-0" />
                                  <span>{f}</span>
                                </div>
                              ))}
                            </div>

                            <Button
                              onClick={() => handleSubscribe(plan)}
                              disabled={isCurrent || loading !== null}
                              className={`rounded-xl h-10 font-bold text-sm ${
                                isPopular ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''
                              }`}
                              variant={isPopular ? 'default' : 'outline'}
                            >
                              {loading === plan.id ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : isCurrent ? (
                                isArabic ? 'مفعّلة' : 'Active'
                              ) : isFree ? (
                                isArabic ? 'ابدأ مجاناً' : 'Start Free'
                              ) : (
                                isArabic ? 'اشترك الآن' : 'Subscribe Now'
                              )}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="text-center mt-4">
                    <button onClick={onClose} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                      {isArabic ? 'العودة لاحقاً' : 'Return to free access'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              renderGatewaySelection()
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PaymentModal;
