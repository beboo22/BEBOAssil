export const MOYASAR_PUBLISHABLE_KEY = 'pk_live_uXYHbU9G4BqxWvK8BQo49Fox1konuhcZHagjYCfQ';

const samsungServiceId = (import.meta.env.VITE_MOYASAR_SAMSUNG_SERVICE_ID || '').trim();

export const moyasarCapabilities = {
  applePay: true,
  stcPay: true,
  samsungPay: Boolean(samsungServiceId),
  samsungServiceId,
} as const;

export const MOYASAR_SUPPORTED_CURRENCIES = new Set(['SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD', 'BHD', 'OMR', 'QAR', 'EGP', 'JOD']);

export function resolveMoyasarChargeCurrency(currency: string) {
  const upper = String(currency || '').toUpperCase();
  return MOYASAR_SUPPORTED_CURRENCIES.has(upper) ? upper : 'SAR';
}

export function getMoyasarMethodsForCurrency(_currency: string) {
  // Show all wallet methods regardless of currency. Moyasar will gracefully
  // handle wallet eligibility on the user's device (e.g., Apple Pay shows on
  // Apple devices, STC Pay shows for KSA users) — currency does not gate them.
  const methods = ['creditcard', 'applepay', 'stcpay'];
  if (moyasarCapabilities.samsungPay) methods.push('samsungpay');
  return methods;
}