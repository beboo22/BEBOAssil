import { useState, createContext, useContext, useEffect, useCallback } from 'react';
import { formatLatnNumber } from '@/utils/numberFormat';
import { supabase } from '@/integrations/supabase/client';

export interface CustomCurrencyMeta {
  code: string;
  name?: string;
  name_ar?: string;
  symbol?: string;
  flag_url?: string;
  enabled?: boolean;
}

interface CurrencyContextType {
  currency: string;
  setCurrency: (currency: string) => void;
  formatPrice: (amount: number, fromCurrency?: string) => string;
  formatPriceCompact: (amount: number, fromCurrency?: string) => string;
  convertPrice: (amount: number, fromCurrency?: string) => number;
  convertToCurrency: (amount: number, fromCurrency: string, toCurrency: string) => number;
  getSymbol: (code?: string) => string;
  getFlag: (code?: string) => string | undefined;
  customCurrencies: CustomCurrencyMeta[];
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const defaultRates: { [key: string]: number } = {
  USD: 1, EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75, JPY: 149.5,
  CAD: 1.36, AUD: 1.53, INR: 83.1, TRY: 32.2, EGP: 30.9,
  KWD: 0.31, BHD: 0.38, QAR: 3.64, OMR: 0.38, RUB: 92.5,
  CNY: 7.24, THB: 35.8, MYR: 4.72, IDR: 15700, PHP: 56.1,
  SGD: 1.34, HKD: 7.82, KRW: 1330, BRL: 4.97, MXN: 17.1,
  ZAR: 18.6, CHF: 0.88, SEK: 10.4, NOK: 10.5, DKK: 6.87,
  PLN: 4.02, CZK: 22.8, HUF: 356, NZD: 1.64, JOD: 0.71,
};

const currencySymbols: { [key: string]: string } = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SAR: 'ر.س',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  INR: '₹',
  TRY: '₺',
  EGP: 'ج.م',
  KWD: 'د.ك',
  BHD: 'د.ب',
  QAR: 'ر.ق',
  OMR: 'ر.ع',
  RUB: '₽',
  CNY: '¥',
  THB: '฿',
  MYR: 'RM',
  IDR: 'Rp',
  PHP: '₱',
  SGD: 'S$',
  HKD: 'HK$',
  KRW: '₩',
  BRL: 'R$',
  MXN: 'MX$',
  ZAR: 'R',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  PLN: 'zł',
  CZK: 'Kč',
  HUF: 'Ft',
  NZD: 'NZ$',
};

// Currencies where decimals are not used
const zeroPrecisionCurrencies = new Set(['JPY', 'KRW', 'IDR', 'HUF', 'CLP', 'VND']);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>(() => {
    return localStorage.getItem('preferred-currency') || 'USD';
  });
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(defaultRates);

  const [customCurrencies, setCustomCurrencies] = useState<CustomCurrencyMeta[]>([]);

  // Load admin-configured exchange rates and custom currencies
  useEffect(() => {
    supabase.from('site_settings').select('financial_config').eq('id', 'default').maybeSingle()
      .then(({ data }) => {
        const config = (data?.financial_config || {}) as any;
        if (config.exchange_rates && typeof config.exchange_rates === 'object') {
          setExchangeRates(prev => ({ ...prev, ...config.exchange_rates }));
        }
        if (Array.isArray(config.custom_currencies)) {
          setCustomCurrencies(config.custom_currencies as CustomCurrencyMeta[]);
        }
      });
  }, []);

  const setCurrency = useCallback((newCurrency: string) => {
    setCurrencyState(newCurrency);
    localStorage.setItem('preferred-currency', newCurrency);
  }, []);

  const getSymbol = useCallback((code?: string): string => {
    const c = code || currency;
    const custom = customCurrencies.find(cc => cc.code === c);
    if (custom?.symbol) return custom.symbol;
    return currencySymbols[c] || c;
  }, [currency, customCurrencies]);

  const getFlag = useCallback((code?: string): string | undefined => {
    const c = code || currency;
    return customCurrencies.find(cc => cc.code === c)?.flag_url;
  }, [currency, customCurrencies]);

  const convertToCurrency = useCallback((amount: number, fromCurrency: string, toCurrency: string): number => {
    const from = (fromCurrency || 'USD').toUpperCase();
    const to = (toCurrency || 'USD').toUpperCase();
    if (from === to) return amount;
    const sourceRate = exchangeRates[from] || 1;
    const targetRate = exchangeRates[to] || 1;
    const usdAmount = amount / sourceRate;
    return usdAmount * targetRate;
  }, [exchangeRates]);

  const convertPrice = useCallback((amount: number, fromCurrency = 'USD'): number => {
    return convertToCurrency(amount, fromCurrency, currency);
  }, [currency, convertToCurrency]);

  const formatPrice = useCallback((amount: number, fromCurrency = 'USD'): string => {
    const convertedAmount = convertPrice(amount, fromCurrency);
    const symbol = getSymbol();
    const userLanguage = document.documentElement.lang || navigator.language || 'en-US';

    if (zeroPrecisionCurrencies.has(currency)) {
      return `${symbol}${formatLatnNumber(Math.round(convertedAmount), userLanguage, { maximumFractionDigits: 0 })}`;
    }

    return `${symbol}${formatLatnNumber(convertedAmount, userLanguage, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [convertPrice, getSymbol, currency]);

  const formatPriceCompact = useCallback((amount: number, fromCurrency = 'USD'): string => {
    const convertedAmount = convertPrice(amount, fromCurrency);
    const symbol = getSymbol();
    const userLanguage = document.documentElement.lang || navigator.language || 'en-US';

    if (zeroPrecisionCurrencies.has(currency)) {
      return `${symbol}${formatLatnNumber(Math.round(convertedAmount), userLanguage, { maximumFractionDigits: 0 })}`;
    }

    // Show decimals only if not whole number
    const isWhole = Math.abs(convertedAmount - Math.round(convertedAmount)) < 0.01;
    return `${symbol}${formatLatnNumber(convertedAmount, userLanguage, {
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }, [convertPrice, getSymbol, currency]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice, formatPriceCompact, convertPrice, convertToCurrency, getSymbol, getFlag, customCurrencies }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};