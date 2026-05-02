const SCRIPT_TIMEOUT_MS = 5000;

const scriptPromises = new Map<string, Promise<void>>();

declare global {
  interface Window {
    Moyasar?: any;
  }
}

function loadScript(src: string): Promise<void> {
  if (scriptPromises.has(src)) return scriptPromises.get(src)!;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if ((existing as any).dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Script timeout: ${src}`));
    }, SCRIPT_TIMEOUT_MS);

    script.onload = () => {
      (script as any).dataset.loaded = "true";
      clearTimeout(timeoutId);
      resolve();
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

export async function ensureMoyasarSdk() {
  if (window.Moyasar) return;

  // Load CSS if not already present
  if (!document.querySelector('link[href*="moyasar"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/moyasar-payment-form@2.2.7/dist/moyasar.css";
    document.head.appendChild(link);
  }

  await loadScript("https://cdn.jsdelivr.net/npm/moyasar-payment-form@2.2.7/dist/moyasar.umd.min.js");

  if (!window.Moyasar) {
    throw new Error("Moyasar SDK did not initialize");
  }
}

// Keep legacy exports for backward compatibility during migration
export async function ensurePayPalSdk(_clientId = "sb", _currency = "SAR") {
  console.warn("[PaymentGateways] PayPal is deprecated, using Moyasar instead");
}

export async function ensureGeideaSdk() {
  console.warn("[PaymentGateways] Geidea is deprecated, using Moyasar instead");
}
