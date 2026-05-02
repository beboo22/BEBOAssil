import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Geidea signature helper ──────────────────────────────────────────────
async function geideaSignature(
  merchantPublicKey: string,
  amount: number,
  currency: string,
  merchantReferenceId: string,
  timestamp: string,
  apiPassword: string,
): Promise<string> {
  const amountStr = amount.toFixed(2);
  const data = `${merchantPublicKey}${amountStr}${currency}${merchantReferenceId}${timestamp}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(apiPassword), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigArray = new Uint8Array(sig);
  return btoa(String.fromCharCode(...sigArray));
}

// ── Email generator for subscriptions ────────────────────────────────────
const generatePaymentConfirmationEmail = (
  planName: string, price: string, gateway: string, expiresAt: string, isArabic: boolean,
) => {
  const gatewayLabel = gateway === "geidea" ? (isArabic ? "بطاقة ائتمانية" : "Credit Card") : gateway === "paypal" ? "PayPal" : gateway === "free" ? (isArabic ? "مجاني" : "Free") : (isArabic ? "الدفع" : "Payment");
  const expiryDate = new Date(expiresAt).toLocaleDateString(isArabic ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" });

  if (isArabic) {
    return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px">✅ تم تفعيل اشتراكك بنجاح!</h1>
    <p style="color:#a0aec0;margin:8px 0 0;font-size:14px">ASEEL AI TRIP</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px;color:#2d3748;margin:0 0 24px">مرحباً! تم تفعيل اشتراكك بنجاح. إليك تفاصيل الاشتراك:</p>
    <div style="background:#f7fafc;border-radius:12px;padding:20px;margin:0 0 24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#718096;font-size:14px">الباقة</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:left">${planName}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">المبلغ</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:left;border-top:1px solid #e2e8f0">${price}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">طريقة الدفع</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:left;border-top:1px solid #e2e8f0">${gatewayLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">ينتهي في</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:left;border-top:1px solid #e2e8f0">${expiryDate}</td></tr>
      </table>
    </div>
    <a href="https://aseelaitrip.com" style="display:block;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px">ابدأ التخطيط الآن</a>
  </div>
  <div style="background:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;color:#a0aec0;font-size:12px">© ${new Date().getFullYear()} ASEEL AI TRIP - جميع الحقوق محفوظة</p>
    <p style="margin:4px 0 0;color:#a0aec0;font-size:12px">support@aseelaitrip.com</p>
  </div>
</div></body></html>`;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px">✅ Subscription Activated!</h1>
    <p style="color:#a0aec0;margin:8px 0 0;font-size:14px">ASEEL AI TRIP</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px;color:#2d3748;margin:0 0 24px">Hello! Your subscription has been activated successfully. Here are your details:</p>
    <div style="background:#f7fafc;border-radius:12px;padding:20px;margin:0 0 24px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#718096;font-size:14px">Plan</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:right">${planName}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">Amount</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:right;border-top:1px solid #e2e8f0">${price}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">Payment Method</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:right;border-top:1px solid #e2e8f0">${gatewayLabel}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:14px;border-top:1px solid #e2e8f0">Expires</td><td style="padding:8px 0;color:#2d3748;font-weight:600;font-size:14px;text-align:right;border-top:1px solid #e2e8f0">${expiryDate}</td></tr>
      </table>
    </div>
    <a href="https://aseelaitrip.com" style="display:block;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px">Start Planning Now</a>
  </div>
  <div style="background:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;color:#a0aec0;font-size:12px">© ${new Date().getFullYear()} ASEEL AI TRIP - All rights reserved</p>
    <p style="margin:4px 0 0;color:#a0aec0;font-size:12px">support@aseelaitrip.com</p>
  </div>
</div></body></html>`;
};

// ── Store purchase email ─────────────────────────────────────────────────
const generateStoreReceiptEmail = (
  items: { name: string; qty: number; price: number; total: number }[],
  grandTotal: number, currency: string, paymentMethod: string,
  downloadLinks: { name: string; url: string }[],
  invoiceNumber: string, isArabic: boolean,
) => {
  const payLabel = paymentMethod === "geidea" ? "Visa / Mastercard" : "PayPal";
  const proxyDownloadUrl = (url: string, name: string) => {
    const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/download-product-file`;
    const proxied = new URL(base);
    proxied.searchParams.set("url", url);
    proxied.searchParams.set("filename", name);
    return proxied.toString();
  };
  const itemRows = items.map(i =>
    `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#2d3748;font-size:13px">${i.name}</td><td style="padding:8px;text-align:center;border-bottom:1px solid #e2e8f0;color:#2d3748;font-size:13px">${i.qty}</td><td style="padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;color:#2d3748;font-size:13px">${i.total.toFixed(2)}</td></tr>`
  ).join("");
  const dlRows = downloadLinks.length > 0 ? downloadLinks.map(d =>
    `<tr><td style="padding:6px 0"><a href="${proxyDownloadUrl(d.url, d.name)}" style="color:#667eea;text-decoration:none;font-weight:600;font-size:13px">📥 ${d.name}</a></td></tr>`
  ).join("") : "";
  const dlSection = dlRows ? `<div style="background:#f0fff4;border-radius:12px;padding:16px;margin:16px 0"><h3 style="margin:0 0 8px;font-size:14px;color:#276749">${isArabic ? "📦 روابط التحميل" : "📦 Download Links"}</h3><table style="width:100%">${dlRows}</table></div>` : "";

  return `<!DOCTYPE html><html lang="${isArabic ? 'ar' : 'en'}" ${isArabic ? 'dir="rtl"' : ''}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">${isArabic ? '🧾 تأكيد الطلب' : '🧾 Order Confirmation'}</h1>
    <p style="color:#a0aec0;margin:8px 0 0;font-size:14px">ASEEL AI TRIP</p>
  </div>
  <div style="padding:24px">
    <p style="font-size:14px;color:#718096;margin:0 0 4px">${isArabic ? 'رقم الفاتورة' : 'Invoice'}: <strong style="color:#2d3748">${invoiceNumber}</strong></p>
    <p style="font-size:14px;color:#718096;margin:0 0 16px">${isArabic ? 'التاريخ' : 'Date'}: <strong style="color:#2d3748">${new Date().toLocaleDateString(isArabic ? 'ar-SA' : 'en-US')}</strong></p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f7fafc"><th style="padding:8px;text-align:left;font-size:12px;color:#718096">${isArabic ? 'المنتج' : 'Item'}</th><th style="padding:8px;text-align:center;font-size:12px;color:#718096">${isArabic ? 'الكمية' : 'Qty'}</th><th style="padding:8px;text-align:right;font-size:12px;color:#718096">${isArabic ? 'المجموع' : 'Total'}</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot><tr><td colspan="2" style="padding:10px 8px;font-weight:700;text-align:right;font-size:14px;border-top:2px solid #2d3748">${isArabic ? 'الإجمالي' : 'Total'}</td><td style="padding:10px 8px;font-weight:700;text-align:right;font-size:14px;color:#38a169;border-top:2px solid #2d3748">${grandTotal.toFixed(2)} ${currency}</td></tr></tfoot>
    </table>
    <p style="text-align:center;color:#718096;font-size:12px;margin:12px 0 0">${isArabic ? 'تم الدفع عبر' : 'Paid via'}: ${payLabel}</p>
    ${dlSection}
    <a href="https://aseelaitrip.com/orders" style="display:block;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:12px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin-top:16px">${isArabic ? 'عرض طلباتي' : 'View My Orders'}</a>
  </div>
  <div style="background:#f7fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
    <p style="margin:0;color:#a0aec0;font-size:12px">© ${new Date().getFullYear()} ASEEL AI TRIP</p>
    <p style="margin:4px 0 0;color:#a0aec0;font-size:12px">support@aseelaitrip.com</p>
  </div>
</div></body></html>`;
};

const getUpgradePricing = async (serviceClient: any, userId: string | undefined, plan: any) => {
  const result = {
    finalPrice: Number(plan.price || 0),
    isUpgrade: false,
    discountPercent: 0,
  };

  if (!userId) return result;

  const { data: activeSub } = await serviceClient
    .from("user_subscriptions")
    .select("id, plan_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSub || activeSub.plan_id === plan.id) return result;

  result.isUpgrade = true;
  const { data: settings } = await serviceClient
    .from("site_settings")
    .select("financial_config")
    .eq("id", "default")
    .maybeSingle();

  const config = (settings?.financial_config || {}) as any;
  const enabled = !!config.upgrade_discount_enabled;
  const discountPercent = Math.max(0, Number(config.upgrade_discount_percent) || 0);
  const maxSubscribers = Math.max(0, Number(config.upgrade_discount_max_subscribers) || 0);

  if (!enabled || discountPercent <= 0) return result;

  const { count } = await serviceClient
    .from("user_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("status", "upgraded");

  const underLimit = maxSubscribers === 0 || (count || 0) < maxSubscribers;
  if (!underLimit) return result;

  result.discountPercent = discountPercent;
  result.finalPrice = Number((Number(plan.price || 0) * (1 - discountPercent / 100)).toFixed(2));
  return result;
};

const isMoyasarSettled = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'paid' || normalized === 'captured';
};

const toMoyasarMinorAmount = (amount: number, currency: string) => {
  const upper = String(currency || 'SAR').toUpperCase();
  if (["JPY", "KRW", "VND", "CLP", "PYG", "XAF", "XOF", "KMF", "BIF", "DJF", "GNF", "RWF"].includes(upper)) {
    return Math.round(amount);
  }
  if (["KWD", "BHD", "OMR", "JOD", "TND"].includes(upper)) {
    return Math.round(amount * 1000);
  }
  return Math.round(amount * 100);
};

const minorAmountsMatch = (expected: number, actual: number) => {
  return Math.abs(Number(expected || 0) - Number(actual || 0)) <= 1;
};

const getPollingAttempts = (source?: string | null) => {
  const normalized = String(source || '').toLowerCase();
  return normalized === 'stcpay' ? 12 : 6;
};

const getPollingDelayMs = (source?: string | null) => {
  const normalized = String(source || '').toLowerCase();
  return normalized === 'stcpay' ? 1500 : 2000;
};

// ── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const body = await req.json();
    const { action, planId, gateway, lang, orderId, orderIds: reqOrderIds, amount: reqAmount, currency: reqCurrency, callbackUrl: reqCallback, guestEmail, reason } = body;
    const isArabic = lang === "ar";
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabase.auth.getUser();

    // Allow guest checkout for store orders only
    const isGuestStoreOrder = (action === "create-store-session" || action === "confirm-store-payment" || action === "cancel-store-payment" || action === "verify-store-payment" || action === "check-geidea-store-payment" || action === "verify-moyasar-store") && !user;
    if (!user && !isGuestStoreOrder) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify store payment status ────────────────────────────────────
    if (action === "verify-store-payment") {
      const storeOrderIds = Array.isArray(reqOrderIds) && reqOrderIds.length > 0 ? reqOrderIds.filter(Boolean) : [];
      if (storeOrderIds.length === 0) {
        return new Response(JSON.stringify({ error: "orderIds required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: orders } = await serviceClient.from("orders").select("status").in("id", storeOrderIds);
      const statuses = (orders || []).map((o: any) => o.status);
      let status = "unknown";
      if (statuses.every((s: string) => s === "confirmed")) status = "confirmed";
      else if (statuses.some((s: string) => s === "cancelled" || s === "payment_failed")) status = statuses.find((s: string) => s === "cancelled" || s === "payment_failed");
      else if (statuses.some((s: string) => s === "pending_payment")) status = "pending_payment";
      return new Response(JSON.stringify({ success: true, status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Check Geidea payment status by merchantReferenceId ──────────────
    if (action === "check-geidea-store-payment") {
      const { merchantReferenceId } = body;
      const storeOrderIds = Array.isArray(reqOrderIds) && reqOrderIds.length > 0 ? reqOrderIds.filter(Boolean) : [];
      if (!merchantReferenceId || storeOrderIds.length === 0) {
        return new Response(JSON.stringify({ paid: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        const merchantPublicKey = Deno.env.get("GEIDEA_MERCHANT_PUBLIC_KEY") || "22b18c15-0bb4-43ee-9cd4-148d8643eb09";
        const apiPassword = Deno.env.get("GEIDEA_API_PASSWORD") || "3aa66be4-c9ea-4c76-bdd4-c586b07abd2c";
        const credentials = btoa(`${merchantPublicKey}:${apiPassword}`);
        const geideaRes = await fetch(`https://api.ksamerchant.geidea.net/pgw/api/v1/direct/order?merchantReferenceId=${encodeURIComponent(merchantReferenceId)}`, {
          headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json" },
        });
        const geideaData = await geideaRes.json();
        const orders = geideaData?.orders || [];
        const paidOrder = orders.find((o: any) => o.status === "Success" || o.detailedStatus === "Paid");
        if (paidOrder) {
          await serviceClient.from("orders").update({ status: "confirmed" } as any).in("id", storeOrderIds);
          return new Response(JSON.stringify({ paid: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e) {
        console.error("Geidea order check error:", e);
      }
      return new Response(JSON.stringify({ paid: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Create Geidea session for STORE orders ──────────────────────────
    if (action === "create-store-session" && gateway === "geidea") {
      const storeOrderIds = Array.isArray(reqOrderIds) && reqOrderIds.length > 0
        ? reqOrderIds.filter(Boolean)
        : orderId ? [orderId] : [];

      if (storeOrderIds.length === 0 || !reqAmount) {
        return new Response(JSON.stringify({ error: "orderId and amount required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const GEIDEA_SUPPORTED = new Set(["SAR", "AED", "USD", "EUR", "GBP", "BHD", "KWD", "OMR", "QAR", "EGP", "JOD"]);
      const merchantPublicKey = Deno.env.get("GEIDEA_MERCHANT_PUBLIC_KEY") || "22b18c15-0bb4-43ee-9cd4-148d8643eb09";
      const apiPassword = Deno.env.get("GEIDEA_API_PASSWORD") || "3aa66be4-c9ea-4c76-bdd4-c586b07abd2c";
      const geideaApiBase = "https://api.ksamerchant.geidea.net";
      const baseAmount = Math.max(0, Number(reqAmount) || 0);

      // Use user's currency if Geidea supports it, otherwise convert to SAR
      const requestedCurrency = (reqCurrency || "SAR").toUpperCase();
      let currency: string;
      let amount: number;
      if (GEIDEA_SUPPORTED.has(requestedCurrency)) {
        currency = requestedCurrency;
        amount = Math.round(baseAmount * 100) / 100;
      } else {
        // Convert to SAR using admin-configured rates when available
        const { data: settings } = await serviceClient
          .from("site_settings")
          .select("financial_config")
          .eq("id", "default")
          .maybeSingle();
        const financialConfig = (settings?.financial_config || {}) as any;
        const customRates = financialConfig.exchange_rates && typeof financialConfig.exchange_rates === "object"
          ? financialConfig.exchange_rates as Record<string, number>
          : {};
        const rateToUSD: Record<string, number> = {
          USD: 1, EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75, JPY: 149.5,
          CAD: 1.36, AUD: 1.53, INR: 83.1, TRY: 32.2, EGP: 30.9,
          KWD: 0.31, BHD: 0.38, QAR: 3.64, OMR: 0.38, RUB: 92.5,
          CNY: 7.24, THB: 35.8, MYR: 4.72, IDR: 15700, PHP: 56.1,
          SGD: 1.34, HKD: 7.82, KRW: 1330, BRL: 4.97, MXN: 17.1,
          ZAR: 18.6, CHF: 0.88, SEK: 10.4, NOK: 10.5, DKK: 6.87,
          PLN: 4.02, CZK: 22.8, HUF: 356, NZD: 1.64, JOD: 0.71,
          ...customRates,
        };
        const fromRate = rateToUSD[requestedCurrency] || 1;
        const usdAmount = baseAmount / fromRate;
        amount = Math.round(usdAmount * (rateToUSD.SAR || 3.75) * 100) / 100;
        currency = "SAR";
      }

      const merchantReferenceId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const callbackUrl = reqCallback || "https://aseelaitrip.com/store";

      const { error: prepOrdersError } = await serviceClient
        .from("orders")
        .update({
          payment_reference: merchantReferenceId,
          payment_method: "geidea",
          status: "pending_payment",
        } as any)
        .in("id", storeOrderIds);

      if (prepOrdersError) {
        return new Response(JSON.stringify({ error: prepOrdersError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const signature = await geideaSignature(merchantPublicKey, amount, currency, merchantReferenceId, timestamp, apiPassword);
      const credentials = btoa(`${merchantPublicKey}:${apiPassword}`);
      const customerEmail = user?.email || guestEmail || "";
      const sessionPayload = { amount, currency, timestamp, merchantReferenceId, signature, callbackUrl, language: isArabic ? "ar" : "en", paymentOperation: "Pay", customer: { email: customerEmail } };

      const geideaRes = await fetch(`${geideaApiBase}/payment-intent/api/v2/direct/session`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}` },
        body: JSON.stringify(sessionPayload),
      });
      const geideaRaw = await geideaRes.text();
      let geideaData: any = null;
      try { geideaData = geideaRaw ? JSON.parse(geideaRaw) : null; } catch { geideaData = null; }

      if (!geideaRes.ok || geideaData?.responseCode !== "000" || !geideaData?.session?.id) {
        await serviceClient
          .from("orders")
          .update({ status: "payment_failed" } as any)
          .in("id", storeOrderIds);

        return new Response(JSON.stringify({ error: geideaData?.detailedResponseMessage || "Session creation failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, sessionId: geideaData.session?.id, merchantPublicKey, merchantReferenceId, amount, currency }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel-store-payment") {
      const storeOrderIds = Array.isArray(reqOrderIds) && reqOrderIds.length > 0
        ? reqOrderIds.filter(Boolean)
        : orderId ? [orderId] : [];

      if (storeOrderIds.length === 0) {
        return new Response(JSON.stringify({ error: "orderIds required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: cancelError } = await serviceClient
        .from("orders")
        .update({
          status: "cancelled",
          notes: reason ? `Payment cancelled: ${reason}` : "Payment cancelled",
        } as any)
        .eq("status", "pending_payment")
        .in("id", storeOrderIds);

      if (cancelError) {
        return new Response(JSON.stringify({ error: cancelError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Confirm store payment (called after payment window closes) ──────
    if (action === "confirm-store-payment") {
      const { orderIds, items, email: customerEmail, invoiceNumber } = body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return new Response(JSON.stringify({ error: "orderIds required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: confirmError } = await serviceClient
        .from("orders")
        .update({ status: "confirmed" } as any)
        .in("id", orderIds);

      if (confirmError) {
        return new Response(JSON.stringify({ error: confirmError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch product details for download links
      const downloadLinks: { name: string; url: string }[] = [];
      if (items && Array.isArray(items)) {
        for (const item of items) {
          if (item.productId) {
            const { data: prod } = await serviceClient.from("products").select("name, specs").eq("id", item.productId).maybeSingle();
            if (prod?.specs?.download_url) {
              downloadLinks.push({ name: prod.name, url: prod.specs.download_url });
            }
            // Also check for digital_files array
            if (prod?.specs?.digital_files && Array.isArray(prod.specs.digital_files)) {
              for (const df of prod.specs.digital_files) {
                downloadLinks.push({ name: df.label || prod.name, url: df.url });
              }
            }
          }
        }
      }

      // Send receipt email
      const recipientEmail = customerEmail || user?.email;
      if (recipientEmail && items) {
        try {
          const emailItems = items.map((i: any) => ({ name: i.name, qty: i.qty, price: i.price, total: i.total }));
          const grandTotal = emailItems.reduce((s: number, i: any) => s + i.total, 0);
          const currency = items[0]?.currency || "USD";
          const payMethod = gateway || "geidea";
          const emailHtml = generateStoreReceiptEmail(emailItems, grandTotal, currency, payMethod, downloadLinks, invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`, isArabic);

          await serviceClient.functions.invoke("send-email", {
            body: {
              to: recipientEmail,
              subject: isArabic ? `🧾 تأكيد الطلب - ASEEL AI TRIP` : `🧾 Order Confirmation - ASEEL AI TRIP`,
              html: emailHtml,
            },
          });
        } catch (emailErr) {
          console.error("Store email error (non-blocking):", emailErr);
        }
      }

      return new Response(JSON.stringify({ success: true, downloadLinks }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create Geidea session for subscription plans ────────────────────
    if (action === "create-session" && gateway === "geidea") {
      const { data: plan, error: planError } = await supabase.from("subscription_plans").select("*").eq("id", planId).single();
      if (planError || !plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (plan.price === 0) {
        return new Response(JSON.stringify({ error: "Free plan does not require payment" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const merchantPublicKey = Deno.env.get("GEIDEA_MERCHANT_PUBLIC_KEY") || "22b18c15-0bb4-43ee-9cd4-148d8643eb09";
      const apiPassword = Deno.env.get("GEIDEA_API_PASSWORD") || "3aa66be4-c9ea-4c76-bdd4-c586b07abd2c";
      const geideaApiBase = "https://api.ksamerchant.geidea.net";
      const pricing = await getUpgradePricing(serviceClient, user?.id, plan);
      const priceInSAR = plan.currency === "SAR" ? pricing.finalPrice : pricing.finalPrice * 3.75;
      const amount = Math.round(priceInSAR * 100) / 100;
      const currency = "SAR";
      const merchantReferenceId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const callbackUrl = "https://aseelaitrip.com/pricing";

      const signature = await geideaSignature(merchantPublicKey, amount, currency, merchantReferenceId, timestamp, apiPassword);
      const credentials = btoa(`${merchantPublicKey}:${apiPassword}`);
      const sessionPayload = { amount, currency, timestamp, merchantReferenceId, signature, callbackUrl, language: isArabic ? "ar" : "en", paymentOperation: "Pay", customer: { email: user.email || "" } };

      const geideaRes = await fetch(`${geideaApiBase}/payment-intent/api/v2/direct/session`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}` },
        body: JSON.stringify(sessionPayload),
      });
      const geideaRaw = await geideaRes.text();
      let geideaData: any = null;
      try { geideaData = geideaRaw ? JSON.parse(geideaRaw) : null; } catch { geideaData = null; }

      if (!geideaRes.ok || geideaData?.responseCode !== "000" || !geideaData?.session?.id) {
        return new Response(JSON.stringify({ error: geideaData?.detailedResponseMessage || geideaData?.responseMessage || "Session creation failed", details: geideaData || { status: geideaRes.status } }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, sessionId: geideaData.session?.id, merchantPublicKey, amount, currency, finalPrice: pricing.finalPrice, isUpgrade: pricing.isUpgrade, discountPercent: pricing.discountPercent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create PayPal session info ──────────────────────────────────────
    if (action === "create-session" && gateway === "paypal") {
      const { data: plan } = await supabase.from("subscription_plans").select("*").eq("id", planId).single();
      if (!plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const pricing = await getUpgradePricing(serviceClient, user?.id, plan);
      const priceInUSD = plan.currency === "SAR" ? pricing.finalPrice / 3.75 : pricing.finalPrice;
      return new Response(JSON.stringify({ success: true, gateway: "paypal", amount: Number(priceInUSD.toFixed(2)), currency: "USD", planId: plan.id, planName: plan.name, finalPrice: pricing.finalPrice, isUpgrade: pricing.isUpgrade, discountPercent: pricing.discountPercent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify Moyasar payment & activate subscription ──────────────────
    if (action === "verify-moyasar-payment") {
      const { paymentId, expectedCurrency: bodyExpectedCurrency, expectedAmount: bodyExpectedAmount } = body;
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "paymentId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const moyasarSecret = Deno.env.get("MOYASAR_SECRET_KEY");
      if (!moyasarSecret) {
        return new Response(JSON.stringify({ error: "Moyasar secret key not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const auth = btoa(`${moyasarSecret}:`);
        const paymentSource = String(body?.source || body?.method || '').toLowerCase();
        const maxAttempts = getPollingAttempts(paymentSource);
        const pollDelayMs = getPollingDelayMs(paymentSource);
        let moyasarData: any = null;
        let status: string | undefined;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const moyasarRes = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: `Basic ${auth}` },
          });
          moyasarData = await moyasarRes.json();
          status = moyasarData?.status;
          if (isMoyasarSettled(status)) break;
          // 'failed' / 'voided' should stop the loop early
          if (status === 'failed' || status === 'voided' || status === 'verified') break;
          await new Promise((r) => setTimeout(r, pollDelayMs));
        }
        if (!isMoyasarSettled(status)) {
          return new Response(JSON.stringify({ success: false, pending: true, fallback: true, error: "Payment still processing", status, details: moyasarData }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: plan } = await supabase.from("subscription_plans").select("*").eq("id", planId).single();
        if (!plan) {
          return new Response(JSON.stringify({ error: "Plan not found" }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const pricing = await getUpgradePricing(serviceClient, user?.id, plan);
        const fallbackCurrency = String(plan.currency || 'USD').toUpperCase();
        const expectedCurrency = String(bodyExpectedCurrency || fallbackCurrency).toUpperCase();
        const expectedMajorAmount = Number(
          bodyExpectedAmount ?? (expectedCurrency === fallbackCurrency ? pricing.finalPrice : pricing.finalPrice)
        );
        const expectedAmount = toMoyasarMinorAmount(expectedMajorAmount, expectedCurrency);
        const actualCurrency = String(moyasarData?.currency || '').toUpperCase();
        const actualAmount = Number(moyasarData?.amount || 0);

        if (actualCurrency !== expectedCurrency || !minorAmountsMatch(expectedAmount, actualAmount)) {
          return new Response(JSON.stringify({
            error: "Payment amount or currency mismatch",
            expected: { amount: expectedAmount, currency: expectedCurrency },
            actual: { amount: actualAmount, currency: actualCurrency },
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Fall through to activate subscription using planId from body
      } catch (e: any) {
        console.error("Moyasar verification error:", e);
        return new Response(JSON.stringify({ error: e?.message || "Moyasar verification failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Activate subscription (same logic as confirm-payment)
      const { data: plan } = await supabase.from("subscription_plans").select("*").eq("id", planId).single();
      const durationDays = plan?.duration_days || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      // Mark previous active sub as upgraded
      await serviceClient
        .from("user_subscriptions")
        .update({ status: "upgraded" } as any)
        .eq("user_id", user.id)
        .eq("status", "active");

      const { error: insertError } = await serviceClient.from("user_subscriptions").insert({
        user_id: user.id, plan_id: planId, expires_at: expiresAt.toISOString(), status: "active",
      });
      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const planName = plan?.name || "Premium";
      const planNameAr = plan?.name_ar || planName;
      const displayName = isArabic ? planNameAr : planName;
      const priceDisplay = plan ? `${plan.price} ${plan.currency}` : "";

      await supabase.from("notifications").insert({
        user_id: user.id, type: "subscription_activated",
        title: isArabic ? "✅ تم تفعيل اشتراكك بنجاح!" : "✅ Subscription Activated!",
        message: isArabic
          ? `تم الاشتراك في باقة "${displayName}" بمبلغ ${priceDisplay} عبر Moyasar. ينتهي في ${new Date(expiresAt).toLocaleDateString("ar-SA")}`
          : `Subscribed to "${displayName}" for ${priceDisplay} via Moyasar. Expires ${new Date(expiresAt).toLocaleDateString("en-US")}`,
        metadata: { plan_id: planId, plan_name: planName, gateway: "moyasar", expires_at: expiresAt.toISOString(), amount: plan?.price, currency: plan?.currency, payment_id: paymentId },
      });

      try {
        const emailHtml = generatePaymentConfirmationEmail(displayName, priceDisplay, "moyasar", expiresAt.toISOString(), isArabic);
        await serviceClient.functions.invoke("send-email", {
          body: { to: user.email, subject: isArabic ? `✅ تأكيد اشتراك - ${displayName}` : `✅ Subscription Confirmation - ${displayName}`, html: emailHtml },
        });
      } catch (emailErr) { console.error("Email send error (non-blocking):", emailErr); }

      return new Response(JSON.stringify({ success: true, message: "Subscription activated", expiresAt: expiresAt.toISOString(), planName: displayName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verify Moyasar STORE payment ────────────────────────────────────
    if (action === "verify-moyasar-store") {
      const { paymentId, orderIds: storeOrderIds, expectedCurrency: bodyExpectedCurrency, expectedAmount: bodyExpectedAmount } = body;
      if (!paymentId || !Array.isArray(storeOrderIds) || storeOrderIds.length === 0) {
        return new Response(JSON.stringify({ error: "paymentId and orderIds required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const moyasarSecret = Deno.env.get("MOYASAR_SECRET_KEY");
      if (!moyasarSecret) {
        return new Response(JSON.stringify({ error: "Moyasar secret key not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const auth = btoa(`${moyasarSecret}:`);
        const paymentSource = String(body?.source || body?.method || '').toLowerCase();
        const maxAttempts = getPollingAttempts(paymentSource);
        const pollDelayMs = getPollingDelayMs(paymentSource);
        let moyasarData: any = null;
        let status: string | undefined;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const moyasarRes = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentId)}`, {
            headers: { Authorization: `Basic ${auth}` },
          });
          moyasarData = await moyasarRes.json();
          status = moyasarData?.status;
          if (isMoyasarSettled(status)) break;
          if (status === 'failed' || status === 'voided' || status === 'verified') break;
          await new Promise((r) => setTimeout(r, pollDelayMs));
        }
        if (!isMoyasarSettled(status)) {
          return new Response(JSON.stringify({ success: false, pending: true, fallback: true, error: "Payment still processing", status, details: moyasarData }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const expectedCurrency = String(bodyExpectedCurrency || '').toUpperCase();
        const expectedAmount = toMoyasarMinorAmount(Number(bodyExpectedAmount || 0), expectedCurrency || 'SAR');
        const actualCurrency = String(moyasarData?.currency || '').toUpperCase();
        const actualAmount = Number(moyasarData?.amount || 0);

        if (!expectedCurrency || actualCurrency !== expectedCurrency || !minorAmountsMatch(expectedAmount, actualAmount)) {
          return new Response(JSON.stringify({
            error: "Payment amount or currency mismatch",
            expected: { amount: expectedAmount, currency: expectedCurrency },
            actual: { amount: actualAmount, currency: actualCurrency },
          }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await serviceClient.from("orders").update({
          status: "confirmed",
          payment_method: "moyasar",
          payment_reference: paymentId,
        } as any).in("id", storeOrderIds);
        return new Response(JSON.stringify({ success: true, paymentId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e?.message || "Moyasar verification failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Confirm payment & activate subscription ─────────────────────────
    if (action === "confirm-payment") {
      const { data: plan } = await supabase.from("subscription_plans").select("*").eq("id", planId).single();
      const durationDays = plan?.duration_days || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      const { data: activeSub } = await serviceClient
        .from("user_subscriptions")
        .select("id, plan_id, starts_at, expires_at, subscription_plans(max_total_activities, name, name_ar)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeSub?.plan_id && activeSub.plan_id !== planId) {
        let carryoverActivities = 0;
        const currentPlanLimit = Number((activeSub as any)?.subscription_plans?.max_total_activities || 0);

        if (currentPlanLimit > 0) {
          const { data: activityOverrides } = await serviceClient
            .from("user_generation_overrides")
            .select("value, expires_at")
            .eq("user_id", user.id)
            .eq("override_type", "bonus_activities");

          const bonusActivities = (activityOverrides || []).reduce((sum: number, row: any) => {
            const isValid = !row.expires_at || new Date(row.expires_at) > new Date();
            return isValid ? sum + (Number(row.value) || 0) : sum;
          }, 0);

          const { data: usedActivities } = await serviceClient.rpc("get_total_used_activities", {
            p_user_id: user.id,
            p_since: activeSub.starts_at,
          });

          carryoverActivities = Math.max(0, currentPlanLimit + bonusActivities - (Number(usedActivities) || 0));
        }

        await serviceClient
          .from("user_subscriptions")
          .update({ status: "upgraded" } as any)
          .eq("user_id", user.id)
          .eq("status", "active");

        if (carryoverActivities > 0) {
          await serviceClient.from("user_generation_overrides").insert({
            user_id: user.id,
            override_type: "bonus_activities",
            value: carryoverActivities,
            reason: `Upgrade carryover from ${(activeSub as any)?.subscription_plans?.name || 'previous plan'}`,
            expires_at: expiresAt.toISOString(),
          });
        }
      }

      const { error: insertError } = await serviceClient.from("user_subscriptions").insert({
        user_id: user.id, plan_id: planId, expires_at: expiresAt.toISOString(), status: "active",
      });
      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const planName = plan?.name || "Premium";
      const planNameAr = plan?.name_ar || planName;
      const displayName = isArabic ? planNameAr : planName;
      const priceDisplay = plan ? `${plan.price} ${plan.currency}` : "";
      const gatewayLabel = gateway === "geidea" ? "بطاقة ائتمانية" : gateway === "paypal" ? "PayPal" : "الدفع";

      await supabase.from("notifications").insert({
        user_id: user.id, type: "subscription_activated",
        title: isArabic ? "✅ تم تفعيل اشتراكك بنجاح!" : "✅ Subscription Activated!",
        message: isArabic
          ? `تم الاشتراك في باقة "${displayName}" بمبلغ ${priceDisplay} عبر ${gatewayLabel}. ينتهي في ${new Date(expiresAt).toLocaleDateString("ar-SA")}`
          : `Subscribed to "${displayName}" for ${priceDisplay} via ${gatewayLabel}. Expires ${new Date(expiresAt).toLocaleDateString("en-US")}`,
        metadata: { plan_id: planId, plan_name: planName, gateway: gateway || "unknown", expires_at: expiresAt.toISOString(), amount: plan?.price, currency: plan?.currency },
      });

      try {
        const emailHtml = generatePaymentConfirmationEmail(displayName, priceDisplay, gateway || "unknown", expiresAt.toISOString(), isArabic);
        const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await serviceClient.functions.invoke("send-email", {
          body: { to: user.email, subject: isArabic ? `✅ تأكيد اشتراك - ${displayName}` : `✅ Subscription Confirmation - ${displayName}`, html: emailHtml },
        });
      } catch (emailErr) { console.error("Email send error (non-blocking):", emailErr); }

      return new Response(JSON.stringify({ success: true, message: "Subscription activated", expiresAt: expiresAt.toISOString(), planName: displayName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-payment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
