import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck } from 'lucide-react';
import { ensureMoyasarSdk } from '@/lib/paymentGateways';
import { getMoyasarRetryDelay, isRetryableMoyasarInitError, MOYASAR_INIT_TIMEOUT_MS, MOYASAR_MAX_INIT_RETRIES } from '@/lib/moyasarRetry';

declare global {
  interface Window {
    Moyasar?: any;
  }
}

interface MoyasarPaymentFormProps {
  amount: number; // in major units (e.g. 10.50 SAR)
  currency: string;
  description: string;
  publishableKey: string;
  metadata?: Record<string, any>;
  onCompleted: (payment: any) => Promise<void> | void;
  onLanguageRefresh?: () => void;
  callbackUrl?: string;
  methods?: string[];
  samsungPay?: {
    serviceId: string;
    orderNumber?: string;
    label?: string;
    environment?: 'TEST' | 'PRODUCTION';
    country?: string;
  };
}

const MINOR_UNIT_ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'XAF', 'XOF', 'KMF', 'BIF', 'DJF', 'GNF', 'RWF']);
const MINOR_UNIT_THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
const WALLET_METHODS = new Set(['applepay', 'stcpay', 'samsungpay']);

// Known label texts Moyasar SDK may render across its supported locales.
// Used to identify and replace labels regardless of which language the SDK rendered.
const KNOWN_LABEL_VARIANTS = {
  orPayWithCard: [
    'Or pay with card', 'أو ادفع بالبطاقة', 'Или оплатить картой',
    'یا کارڈ سے ادائیگی کریں', 'Oder mit Karte bezahlen', 'Ou payer par carte',
    'O paga con tarjeta', '或使用银行卡支付',
  ],
  nameOnCard: [
    'Name on card', 'الاسم على البطاقة', 'Имя на карте', 'کارڈ پر نام',
    'Name auf der Karte', 'Nom sur la carte', 'Nombre en la tarjeta', '持卡人姓名',
  ],
  cardInformation: [
    'Card information', 'معلومات البطاقة', 'Информация о карте', 'کارڈ کی معلومات',
    'Karteninformationen', 'Informations de la carte', 'Información de la tarjeta', '银行卡信息',
  ],
  payNow: [
    'Pay', 'ادفع', 'Оплатить', 'ادائیگی کریں', 'Bezahlen', 'Payer', 'Pagar', '支付',
  ],
} as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveTranslatedLabel(
  raw: string,
  replacements: Record<'orPayWithCard' | 'nameOnCard' | 'cardInformation' | 'payNow', string>
) {
  const trimmed = raw.trim();
  const matchesExact = (variants: readonly string[]) =>
    variants.some((v) => new RegExp(`^\\s*${escapeRegExp(v)}\\s*$`, 'iu').test(trimmed));

  if (matchesExact(KNOWN_LABEL_VARIANTS.orPayWithCard)) return replacements.orPayWithCard;
  if (matchesExact(KNOWN_LABEL_VARIANTS.nameOnCard)) return replacements.nameOnCard;
  if (matchesExact(KNOWN_LABEL_VARIANTS.cardInformation)) return replacements.cardInformation;
  // Strict exact match for "Pay" — never match buttons containing amounts/icons,
  // those are wallet buttons (Apple Pay/STC Pay) and must not be touched.
  if (matchesExact(KNOWN_LABEL_VARIANTS.payNow)) return replacements.payNow;
  return null;
}

function toMinorUnit(amount: number, currency: string): number {
  const upper = currency.toUpperCase();
  if (MINOR_UNIT_ZERO_DECIMAL.has(upper)) return Math.round(amount);
  if (MINOR_UNIT_THREE_DECIMAL.has(upper)) return Math.round(amount * 1000);
  return Math.round(amount * 100);
}

const MOYASAR_SUPPORTED = new Set(['SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD', 'BHD', 'OMR', 'QAR', 'EGP', 'JOD']);

function resolveMethods(_currency: string, methods?: string[], samsungPay?: MoyasarPaymentFormProps['samsungPay']) {
  const source = (methods && methods.length > 0 ? methods : ['creditcard', 'applepay', 'stcpay'])
    .map((m) => m.toLowerCase());
  const filtered = source.filter((m) => {
    if (!WALLET_METHODS.has(m)) return true;
    if (m === 'samsungpay') return Boolean(samsungPay?.serviceId);
    return true;
  });
  return filtered.length > 0 ? filtered : ['creditcard'];
}

const MoyasarPaymentForm = ({
  amount,
  currency,
  description,
  publishableKey,
  metadata,
  onCompleted,
  onLanguageRefresh,
  callbackUrl,
  methods,
  samsungPay,
}: MoyasarPaymentFormProps) => {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const initCycleRef = useRef(0);
  const lang = (i18n.language || 'en').toLowerCase();
  const isArabic = lang.startsWith('ar');
  // Moyasar SDK only supports ar/en natively. Always init in English then overlay our translations
  // for ALL languages — this guarantees labels match the UI language even after language switches.
  const moyasarLang: 'ar' | 'en' = isArabic ? 'ar' : 'en';

  const finalCurrency = MOYASAR_SUPPORTED.has(currency.toUpperCase()) ? currency.toUpperCase() : 'SAR';
  const finalAmount = amount;
  const resolvedMethods = resolveMethods(finalCurrency, methods, samsungPay);

  // Initialize Moyasar — re-runs on language change so SDK base locale matches.
  useEffect(() => {
    if (!containerRef.current) return;

    initCycleRef.current += 1;
    const currentCycle = initCycleRef.current;
    setLoading(true);
    setError(null);

    let disposed = false;
    let interval: number | null = null;
    let timeoutId: number | null = null;
    let retryTimer: number | null = null;

    const localizedLoadError = () => t('pricing.paymentLoadFailed');
    const localizedRetrying = (attemptNumber: number) => t('pricing.paymentRetrying', { count: attemptNumber });

    const scheduleRetry = (message?: string | null) => {
      if (disposed || currentCycle !== initCycleRef.current) return;
      if (retryAttempt >= MOYASAR_MAX_INIT_RETRIES - 1 || !isRetryableMoyasarInitError(message)) {
        setError(message || localizedLoadError());
        setLoading(false);
        return;
      }

      const nextAttempt = retryAttempt + 1;
      setError(localizedRetrying(nextAttempt));
      retryTimer = window.setTimeout(() => {
        if (disposed || currentCycle !== initCycleRef.current) return;
        setRetryAttempt(nextAttempt);
      }, getMoyasarRetryDelay(retryAttempt));
    };

    const init = async () => {
      try {
        await ensureMoyasarSdk();
      } catch (sdkError: any) {
        if (disposed || currentCycle !== initCycleRef.current) return;
        scheduleRetry(sdkError?.message || localizedLoadError());
        return;
      }

      if (disposed || currentCycle !== initCycleRef.current) return;
      const Moyasar = window.Moyasar;
      if (!Moyasar) {
        scheduleRetry(localizedLoadError());
        return;
      }

      try {
        if (containerRef.current) containerRef.current.innerHTML = '';
        timeoutId = window.setTimeout(() => {
          if (disposed || currentCycle !== initCycleRef.current) return;
          scheduleRetry(localizedLoadError());
        }, MOYASAR_INIT_TIMEOUT_MS);

        Moyasar.init({
          element: containerRef.current,
          amount: toMinorUnit(finalAmount, finalCurrency),
          currency: finalCurrency,
          description,
          publishable_api_key: publishableKey,
          callback_url: callbackUrl || window.location.href,
          language: moyasarLang,
          methods: resolvedMethods,
          metadata: metadata || {},
          supported_networks: ['mada', 'visa', 'mastercard', 'amex'],
          ...(resolvedMethods.includes('applepay') ? {
            apple_pay: {
              country: 'SA',
              label: 'ASEEL AI TRIP',
              validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate',
            },
          } : {}),
          ...(resolvedMethods.includes('samsungpay') && samsungPay?.serviceId ? {
            samsung_pay: {
              service_id: samsungPay.serviceId,
              order_number: samsungPay.orderNumber || String(metadata?.invoice || crypto.randomUUID()),
              country: samsungPay.country || 'SA',
              label: samsungPay.label || 'ASEEL AI TRIP',
              environment: samsungPay.environment || 'PRODUCTION',
            },
          } : {}),
          on_completed: async (payment: any) => {
            try {
              await onCompleted(payment);
            } catch (e) {
              console.error('[Moyasar] on_completed handler error:', e);
            }
            return Promise.resolve();
          },
        });

        if (disposed || currentCycle !== initCycleRef.current) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        setLoading(false);
        setError(null);
      } catch (e: any) {
        if (disposed || currentCycle !== initCycleRef.current) return;
        console.error('[Moyasar] init error:', e);
        if (timeoutId) window.clearTimeout(timeoutId);
        scheduleRetry(e?.message || localizedLoadError());
      }
    };

    if (window.Moyasar) {
      void init();
    } else {
      let attempts = 0;
      interval = window.setInterval(() => {
        attempts++;
        if (window.Moyasar) {
          if (interval) window.clearInterval(interval);
          void init();
        } else if (attempts > 50) {
          if (interval) window.clearInterval(interval);
          scheduleRetry(localizedLoadError());
        }
      }, 100);
    }

    return () => {
      disposed = true;
      if (interval) window.clearInterval(interval);
      if (timeoutId) window.clearTimeout(timeoutId);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, retryAttempt]);

  useEffect(() => {
    setRetryAttempt(0);
  }, [lang]);

  // Localized label overlay — mutation-observer driven (lightweight, no continuous polling).
  useEffect(() => {
    if (!containerRef.current) return;

    const orPayWithCard = t('pricing.orPayWithCard');
    const nameOnCard = t('pricing.nameOnCard');
    const cardInformation = t('pricing.cardInformation');
    const payNow = t('pricing.payNow');

    let pending = false;
    const applyOverrides = () => {
      pending = false;
      const root = containerRef.current;
      if (!root) return;

      // Only target the specific Moyasar text labels — never wallet method buttons
      // (Apple Pay / STC Pay / Samsung Pay) which contain logos, icons, and amount badges.
      const candidates = root.querySelectorAll<HTMLElement>(
        '.mysr-form-source-label, .mysr-form-name-label, .mysr-form-card-label, .mysr-form-source-separator, label'
      );
      candidates.forEach((el) => {
        // Skip elements inside wallet method buttons
        if (el.closest('.mysr-form-applepay-button, .mysr-form-stcpay-button, .mysr-form-samsungpay-button')) return;
        // Only consider elements whose direct text content (no children) matches a known label exactly.
        // This avoids matching wrappers that include amounts, icons, or composite content.
        const childElements = el.querySelectorAll('*').length;
        if (childElements > 0) return; // must be a leaf text element
        const raw = (el.textContent || '').trim();
        if (!raw) return;
        const replacement = resolveTranslatedLabel(raw, {
          orPayWithCard,
          nameOnCard,
          cardInformation,
          payNow,
        });
        if (!replacement) return;
        if (el.dataset.localized === replacement && el.textContent === replacement) return;
        el.textContent = replacement;
        el.dataset.localized = replacement;
      });

      // Submit button text — only replace the inner text node containing "Pay", preserve amount span.
      const submitBtn = root.querySelector<HTMLElement>('.mysr-form-submit-button');
      if (submitBtn) {
        const textNodes = Array.from(submitBtn.childNodes).filter(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0
        );
        textNodes.forEach((node) => {
          const raw = (node.textContent || '').trim();
          const replacement = resolveTranslatedLabel(raw, {
            orPayWithCard,
            nameOnCard,
            cardInformation,
            payNow,
          });
          if (!replacement) return;
          if (node.textContent === replacement) return;
          node.textContent = replacement;
        });
      }
    };

    const scheduleApply = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(applyOverrides);
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(containerRef.current, { childList: true, subtree: true, characterData: true });

    // Initial pass + safety re-check after first second to catch async wallet detection.
    scheduleApply();
    const t1 = window.setTimeout(scheduleApply, 500);
    const t2 = window.setTimeout(scheduleApply, 1500);

    return () => {
      observer.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [t, lang, loading]);

  return (
    <div className="w-full">
      {loading && (
        <div className="flex items-center justify-center py-3 gap-2">
          <Loader2 className="animate-spin text-primary" size={16} />
          <p className="text-[11px] text-muted-foreground">
            {isArabic ? 'جاري تحميل الدفع...' : 'Loading payment...'}
          </p>
        </div>
      )}
      {error && (
        <div className="text-center py-2 space-y-1">
          <div className="text-destructive text-xs">{error}</div>
          {!loading && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  setRetryAttempt(0);
                }}
                className="text-[11px] text-primary hover:underline"
              >
                {t('common.tryAgain')}
              </button>
              {onLanguageRefresh && (
                <button
                  type="button"
                  onClick={onLanguageRefresh}
                  className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t('pricing.reloadPaymentPage')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="mysr-form w-full max-w-[420px] mx-auto px-0 text-[13px] sm:text-sm overflow-visible"
        style={{ minHeight: 0, maxHeight: 'none' }}
      />
      {!loading && !error && (
        <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck size={10} className="text-primary" />
          <span>{isArabic ? 'مدفوعات آمنة عبر Moyasar' : 'Secure payments by Moyasar'}</span>
        </div>
      )}
    </div>
  );
};

export default MoyasarPaymentForm;
