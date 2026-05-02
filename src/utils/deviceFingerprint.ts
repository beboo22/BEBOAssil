import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedFingerprint: string | null = null;
let fpPromise: Promise<string> | null = null;

/**
 * Get a stable device fingerprint that persists across:
 * - Incognito / private browsing modes
 * - Different browsers on the same device
 * - localStorage/sessionStorage/cookies being cleared
 *
 * Uses FingerprintJS (open-source) which combines ~50 browser signals
 * (canvas, audio, fonts, screen, timezone, GPU, etc.) into a stable hash.
 * Accuracy: ~85% on the same device across different browsing modes.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint;
  if (fpPromise) return fpPromise;

  fpPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      cachedFingerprint = `fp-${result.visitorId}`;
      // Persist to localStorage so subsequent calls are instant
      try {
        localStorage.setItem('device_fingerprint', cachedFingerprint);
      } catch { /* storage blocked */ }
      return cachedFingerprint;
    } catch (e) {
      console.warn('Fingerprint failed, using fallback:', e);
      // Fallback: deterministic hash of stable browser attributes
      const raw = [
        navigator.userAgent,
        navigator.language,
        navigator.languages?.join(',') || '',
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        (navigator as any).hardwareConcurrency || 0,
        (navigator as any).deviceMemory || 0,
        (navigator as any).platform || '',
      ].join('|');
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
      }
      cachedFingerprint = `fp-fallback-${Math.abs(hash).toString(36)}`;
      try { localStorage.setItem('device_fingerprint', cachedFingerprint); } catch { /* noop */ }
      return cachedFingerprint;
    }
  })();
  return fpPromise;
}

/**
 * Synchronous version: returns cached fingerprint if available, or a
 * best-effort fallback. Prefer getDeviceFingerprint() when possible.
 */
export function getDeviceFingerprintSync(): string {
  if (cachedFingerprint) return cachedFingerprint;
  try {
    const stored = localStorage.getItem('device_fingerprint');
    if (stored) {
      cachedFingerprint = stored;
      return stored;
    }
  } catch { /* noop */ }
  // Warm up async fingerprint for next call
  getDeviceFingerprint().catch(() => { /* noop */ });
  // Return fallback for immediate use
  const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return `fp-tmp-${Math.abs(hash).toString(36)}`;
}

/**
 * Get the guest identifier for tracking usage limits.
 * Prefers device fingerprint over localStorage-based IDs because
 * fingerprint survives incognito mode and browser clears.
 */
export async function getGuestIdentifier(): Promise<string> {
  return getDeviceFingerprint();
}
