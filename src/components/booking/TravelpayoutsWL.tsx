import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/hooks/useCurrency";

const TP_SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "RUB", "CNY", "JPY", "KRW", "INR", "BRL", "THB", "MYR", "SGD", "HKD", "IDR", "PHP", "NZD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "MXN", "ZAR", "AED", "SAR", "TRY", "EGP", "KWD", "BHD", "QAR", "OMR"];

interface MultiCitySegment {
  origin: string;
  destination: string;
  date: string;
}

interface TravelpayoutsWLProps {
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  adults?: number;
  defaultTab?: "avia" | "hotels";
  /**
   * `multicity` activates the WL multi-city flow with the provided segments.
   * `oneway` and `round` keep the existing single-leg behaviour.
   */
  tripType?: "round" | "oneway" | "multicity";
  segments?: MultiCitySegment[];
  onStatus?: (status: { state: "loading" | "ready" | "error"; message: string; details?: Record<string, unknown> }) => void;
}

/**
 * Travelpayouts White Label Metasearch Widget
 *
 * IMPORTANT: This widget MUST run inside an isolated `iframe srcDoc` because
 * the Travelpayouts WL script (`tpscr.com/wl_web/main.js?wl_id=3357`) mutates
 * the DOM aggressively and conflicts with React's reconciler. Without the
 * iframe, the search box renders but no results ever appear (the widget keeps
 * trying to attach to nodes React just unmounted).
 *
 * Supports one-way, round-trip, and multi-city flight searches as well as the
 * hotel tab provided by the same WL build.
 */
const TravelpayoutsWL = ({
  origin,
  destination,
  departDate,
  returnDate,
  adults = 1,
  defaultTab = "avia",
  tripType = "round",
  segments,
  onStatus,
}: TravelpayoutsWLProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const instanceIdRef = useRef(`tpwl-${Math.random().toString(36).slice(2)}`);
  const [isLoading, setIsLoading] = useState(true);
  const [diagnostic, setDiagnostic] = useState<{ state: "loading" | "ready" | "error"; message: string; details?: Record<string, unknown> }>({
    state: "loading",
    message: "initializing",
  });
  const { i18n } = useTranslation();
  const { currency } = useCurrency();
  const isAr = i18n.language?.startsWith("ar");
  const tpCurrency = (TP_SUPPORTED_CURRENCIES.includes((currency || "").toUpperCase()) ? currency.toUpperCase() : "USD").toLowerCase();

  // Order departure/return correctly so reversed inputs do not break the WL.
  const normalizedDates = useMemo(() => {
    if (!departDate || !returnDate) {
      return { safeDepartDate: departDate, safeReturnDate: returnDate };
    }
    const isReversed = departDate > returnDate;
    return {
      safeDepartDate: isReversed ? returnDate : departDate,
      safeReturnDate: isReversed ? departDate : returnDate,
    };
  }, [departDate, returnDate]);

  // Build the config consumed by the WL script. We support one-way, round and
  // multi-city. For multi-city we hand the WL a `segments` array which the WL
  // metasearch UI knows how to render (up to 6 legs).
  const widgetConfig = useMemo(() => {
    const normalizedOrigin = origin?.trim();
    const normalizedDestination = destination?.trim();
    const cleanSegments = (segments || [])
      .filter((s) => s && s.origin && s.destination && s.date)
      .map((s) => ({ origin: s.origin.trim(), destination: s.destination.trim(), depart_date: s.date }));

    const base: Record<string, unknown> = {
      wl_id: 3357,
      locale: isAr ? "ar" : "en",
      currency: tpCurrency,
      default_tab: defaultTab,
      adults,
    };

    if (tripType === "multicity" && cleanSegments.length >= 2) {
      base.trip_class = "Y";
      base.search_type = "complex";
      base.segments = cleanSegments;
      // Origin/destination of the FIRST leg are still useful for the search box header.
      base.origin = cleanSegments[0].origin;
      base.destination = cleanSegments[0].destination;
      base.depart_date = cleanSegments[0].depart_date;
    } else {
      base.one_way = tripType === "oneway";
      if (normalizedOrigin) base.origin = normalizedOrigin;
      if (normalizedDestination) base.destination = normalizedDestination;
      if (normalizedDates.safeDepartDate) base.depart_date = normalizedDates.safeDepartDate;
      if (normalizedDates.safeReturnDate && tripType === "round") base.return_date = normalizedDates.safeReturnDate;
      if (defaultTab === "hotels") {
        if (normalizedDestination) base.destination = normalizedDestination;
        if (normalizedDates.safeDepartDate) {
          base.check_in = normalizedDates.safeDepartDate;
          base.checkIn = normalizedDates.safeDepartDate;
        }
        if (normalizedDates.safeReturnDate) {
          base.check_out = normalizedDates.safeReturnDate;
          base.checkOut = normalizedDates.safeReturnDate;
        }
      }
    }

    return base;
  }, [origin, destination, normalizedDates.safeDepartDate, normalizedDates.safeReturnDate, tripType, adults, isAr, tpCurrency, defaultTab, segments]);

  // The full HTML document we hand to the iframe. Keeping it self-contained
  // means the React tree never has to reconcile against the WL's DOM mutations.
  const srcDoc = useMemo(() => {
    const configJson = JSON.stringify(widgetConfig).replace(/</g, "\\u003c");
    const instanceId = instanceIdRef.current;
    const dir = isAr ? "rtl" : "ltr";
    return `<!doctype html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; background: transparent; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    body { min-height: 100%; }
    #tpwl-search, #tpwl-tickets { width: 100%; }
    #tpwl-search { min-height: 120px; }
    #tpwl-tickets { min-height: 520px; }
    .tpwl-loading { display: flex; align-items: center; justify-content: center; padding: 24px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div id="tpwl-search"></div>
  <div id="tpwl-tickets"></div>
  <div class="tpwl-loading" id="tpwl-loading">${isAr ? "جاري تحميل محرك البحث..." : "Loading search engine..."}</div>
  <script>
    window.__tpwl_config = ${configJson};
    window.TPWL_CONFIG = ${configJson};
    window.travelpayoutsWhiteLabelConfig = ${configJson};
    function tpwlPost(state, message, details){
      try { window.parent && window.parent.postMessage({type:'tpwl-status', instanceId:'${instanceId}', state:state, message:message, details:details || {}}, '*'); } catch(e) {}
    }
    window.addEventListener('error', function(e){ tpwlPost('error', 'iframe-runtime-error', { message: e.message, source: e.filename, line: e.lineno }); });
    window.addEventListener('unhandledrejection', function(e){ tpwlPost('error', 'iframe-unhandled-rejection', { message: String(e.reason && (e.reason.message || e.reason) || e.reason) }); });
    tpwlPost('loading', 'iframe-created', window.__tpwl_config);
  </script>
  <script nowprocket data-noptimize="1" data-cfasync="false" data-wpfc-render="false" seraph-accel-crit="1" data-no-defer="1">
    (function () {
      var startedAt = Date.now();
      var script = document.createElement("script");
      script.async = 1;
      script.type = "module";
      script.src = "https://tpscr.com/wl_web/main.js?wl_id=3357&t=${Date.now()}";
      script.onload = function(){
        tpwlPost('loading', 'script-loaded', { elapsedMs: Date.now() - startedAt });
        var checks = 0;
        var probe = setInterval(function(){
          checks += 1;
          var search = document.getElementById('tpwl-search');
          var tickets = document.getElementById('tpwl-tickets');
          var rendered = (search && search.children.length > 0) || (tickets && tickets.children.length > 0) || document.body.scrollHeight > 220;
          tpwlPost(rendered ? 'ready' : 'loading', rendered ? 'widget-rendered' : 'waiting-for-widget-render', {
            checks: checks,
            searchChildren: search ? search.children.length : -1,
            ticketsChildren: tickets ? tickets.children.length : -1,
            bodyHeight: document.body.scrollHeight
          });
          if (rendered) {
            var l=document.getElementById('tpwl-loading'); if(l) l.remove();
            clearInterval(probe);
          }
          if (!rendered && checks >= 20) {
            clearInterval(probe);
            tpwlPost('error', 'widget-render-timeout', { searchChildren: search ? search.children.length : -1, ticketsChildren: tickets ? tickets.children.length : -1, bodyHeight: document.body.scrollHeight });
          }
        }, 750);
      };
      script.onerror = function(){tpwlPost('error', 'script-load-failed', { src: script.src });};
      document.head.appendChild(script);
    })();
  </script>
</body>
</html>`;
  }, [widgetConfig, isAr]);

  // Hide the spinner once the iframe signals it is ready (or after 6s as a safety net).
  useEffect(() => {
    setIsLoading(true);
    const loadingState = { state: "loading" as const, message: "loading widget" };
    setDiagnostic(loadingState);
    onStatus?.(loadingState);
    const onMessage = (e: MessageEvent) => {
      const data: any = e.data;
      if (!data || data.type !== "tpwl-status" || data.instanceId !== instanceIdRef.current) return;
      const state = data.state === "ready" || data.state === "error" ? data.state : "loading";
      const next = { state, message: data.message || "status", details: data.details };
      setDiagnostic(next);
      onStatus?.(next);
      if (data.state === "ready" || data.state === "error") {
        setIsLoading(false);
      }
    };
    window.addEventListener("message", onMessage);
    const fallback = window.setTimeout(() => {
      const timeoutState = { state: "error" as const, message: "widget-timeout", details: { timeoutMs: 18000 } };
      setDiagnostic(timeoutState);
      onStatus?.(timeoutState);
      setIsLoading(false);
    }, 18000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(fallback);
    };
  }, [srcDoc]);

  return (
    <div className="w-full space-y-4">
      {defaultTab === "avia" && <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
        <span>{isAr
          ? "تنبيه: قد تكون أوقات الرحلات المعروضة غير دقيقة. يرجى التحقق من الأوقات الفعلية عند زيارة موقع شركة الطيران أو وكيل الحجز قبل إتمام الحجز."
          : "Note: Flight times shown may not be accurate. Please verify actual departure and arrival times on the airline or booking agent website before completing your booking."
        }</span>
      </div>}

      <div className="relative w-full rounded-xl overflow-hidden border border-border bg-card">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card/90 backdrop-blur-sm pointer-events-none">
            <Loader2 className="animate-spin text-primary" size={32} />
            <p className="text-sm text-muted-foreground">{isAr ? "جاري تحميل محرك البحث المتقدم..." : "Loading advanced search engine..."}</p>
          </div>
        )}
        {/* Quiet UI: do not surface raw widget timeout/error banners.
            Real hotel/flight results are rendered separately by the parent page. */}
        <iframe
          ref={iframeRef}
          title="Travelpayouts metasearch"
          srcDoc={srcDoc}
          className="w-full"
          style={{ minHeight: 720, border: "none", display: "block" }}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-same-origin allow-top-navigation-by-user-activation"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
};

export default TravelpayoutsWL;
