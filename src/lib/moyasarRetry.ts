export const MOYASAR_INIT_TIMEOUT_MS = 7000;
export const MOYASAR_MAX_INIT_RETRIES = 3;
export const MOYASAR_RETRY_DELAYS_MS = [1200, 2500] as const;

export function isRetryableMoyasarInitError(message?: string | null) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('timeout')
    || normalized.includes('load')
    || normalized.includes('initialize')
    || normalized.includes('sdk');
}

export function getMoyasarRetryDelay(attempt: number) {
  return MOYASAR_RETRY_DELAYS_MS[Math.min(attempt, MOYASAR_RETRY_DELAYS_MS.length - 1)] ?? 2500;
}