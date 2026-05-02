import { supabase } from "@/integrations/supabase/client";

/**
 * Detects whether an error from supabase.functions.invoke (or a thrown
 * Error inside the handler) is a TRANSIENT failure that is safe to
 * retry — busy edge runtime, gateway timeout, network blip, AI model
 * upstream timeout. Permanent errors (validation, quota exhaustion,
 * 4xx with structured `data.error`) are NOT retried.
 */
function isTransientInvokeError(err: unknown, data: any): boolean {
  // If the function returned a structured business-logic error in the
  // body, do NOT retry — it would just produce the same outcome.
  const businessError = String(data?.error || "").toLowerCase();
  if (
    businessError.includes("quota") ||
    businessError.includes("daily limit") ||
    businessError.includes("exhausted") ||
    businessError.includes("not allowed") ||
    businessError.includes("invalid")
  ) {
    return false;
  }

  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.toLowerCase();
  if (!msg) return false;

  return (
    msg.includes("non-2xx status code") ||
    msg.includes("failed to send a request") ||
    msg.includes("functionshttperror") ||
    msg.includes("fetch failed") ||
    msg.includes("networkerror") ||
    msg.includes("failed to fetch") ||
    msg.includes("gateway") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborterror") ||
    msg.includes("upstream") ||
    msg.includes("ai service") ||
    msg.includes("could not finish") ||
    msg.includes("service was busy")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Per-attempt soft timeout. If exceeded, we abort the attempt and treat it as transient. */
  attemptTimeoutMs?: number;
  /** Optional callback fired before each retry attempt (useful for UI hints). */
  onRetry?: (attempt: number, lastError: unknown) => void;
}

/**
 * Wrapper around supabase.functions.invoke that auto-retries on
 * transient failures (busy runtime / gateway timeouts / network blips)
 * with exponential backoff + jitter.
 *
 * Returns the same { data, error } shape as the SDK so call-sites stay
 * unchanged. The `error` field is only populated on the FINAL failed
 * attempt, or when the error is non-transient.
 */
export async function invokeGenerateTripWithRetry(
  body: any,
  opts: RetryOptions = {},
): Promise<{ data: any; error: any }> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const baseDelay = opts.baseDelayMs ?? 1200;
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? 60_000;

  let lastError: any = null;
  let lastData: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Race the SDK call against an attempt-level timeout so a hung
      // edge function doesn't burn the whole user-visible budget.
      const invokePromise = supabase.functions.invoke("generate-trip", { body });
      const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
        setTimeout(
          () => reject(new Error(`attempt ${attempt} timed out after ${attemptTimeoutMs}ms`)),
          attemptTimeoutMs,
        ),
      );

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
      lastData = data;
      lastError = error;

      // Success path: SDK returned no error AND no business-logic error.
      if (!error && !data?.error) {
        return { data, error: null };
      }

      // Non-transient failure (validation, quota, etc.) — return immediately.
      if (!isTransientInvokeError(error, data)) {
        return { data, error };
      }
    } catch (e) {
      lastError = e;
      if (!isTransientInvokeError(e, null)) {
        return { data: null, error: e };
      }
    }

    if (attempt < maxAttempts) {
      opts.onRetry?.(attempt, lastError);
      // Exponential backoff with jitter: 1.2s, 2.6s, 5.4s ...
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 400;
      await sleep(delay);
    }
  }

  return { data: lastData, error: lastError };
}
