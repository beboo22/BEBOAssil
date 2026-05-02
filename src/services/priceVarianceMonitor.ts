import { supabase } from "@/integrations/supabase/client";

const DEFAULT_THRESHOLD_PCT = 25;
// Throttle to avoid spamming the table from the client
const recentLogs = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000; // same key only once per minute

export interface PriceVarianceCheck {
  resourceType: "flight" | "hotel";
  origin?: string;
  destination?: string;
  provider?: string;
  estimatedPrice: number;
  apiPrice: number;
  currency?: string;
  thresholdPct?: number;
  metadata?: Record<string, any>;
}

export interface PriceVarianceResult {
  variancePct: number;
  exceedsThreshold: boolean;
  hideEstimate: boolean;
  severity: "info" | "warning" | "critical";
}

/**
 * Compare an estimated/fallback price against an API price.
 * - Returns the variance percentage.
 * - When the variance exceeds the threshold, marks `hideEstimate=true`
 *   and asynchronously logs a warning to `price_variance_alerts` for admins.
 */
export function evaluatePriceVariance(check: PriceVarianceCheck): PriceVarianceResult {
  const threshold = check.thresholdPct ?? DEFAULT_THRESHOLD_PCT;
  const est = Number(check.estimatedPrice) || 0;
  const api = Number(check.apiPrice) || 0;

  if (est <= 0 || api <= 0) {
    return { variancePct: 0, exceedsThreshold: false, hideEstimate: false, severity: "info" };
  }

  const diff = Math.abs(est - api);
  const base = Math.min(est, api);
  const pct = (diff / base) * 100;

  const exceeds = pct >= threshold;
  const severity: PriceVarianceResult["severity"] = pct >= 60 ? "critical" : pct >= threshold ? "warning" : "info";

  if (exceeds) {
    void logPriceVariance({ ...check, thresholdPct: threshold }, pct, severity);
  }

  return {
    variancePct: Math.round(pct * 10) / 10,
    exceedsThreshold: exceeds,
    hideEstimate: exceeds,
    severity,
  };
}

async function logPriceVariance(
  check: PriceVarianceCheck,
  variancePct: number,
  severity: "info" | "warning" | "critical",
) {
  try {
    const key = [
      check.resourceType,
      check.origin || "",
      check.destination || "",
      check.provider || "",
      Math.round(variancePct),
    ].join("|");
    const now = Date.now();
    const last = recentLogs.get(key) || 0;
    if (now - last < MIN_INTERVAL_MS) return;
    recentLogs.set(key, now);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // RLS requires authenticated insert

    await supabase.from("price_variance_alerts").insert({
      user_id: user.id,
      resource_type: check.resourceType,
      origin: check.origin || null,
      destination: check.destination || null,
      provider: check.provider || null,
      estimated_price: check.estimatedPrice,
      api_price: check.apiPrice,
      currency: (check.currency || "USD").toUpperCase(),
      variance_pct: variancePct,
      threshold_pct: check.thresholdPct ?? DEFAULT_THRESHOLD_PCT,
      severity,
      metadata: check.metadata || {},
    });
  } catch (e) {
    // Silent — monitoring must never break the UI
    console.warn("[priceVariance] logging failed", e);
  }
}
