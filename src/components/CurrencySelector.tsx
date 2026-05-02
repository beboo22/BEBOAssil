
import React from 'react';
import { 
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';

interface CurrencySelectorProps {
  value?: string;
  onChange?: (currency: string) => void;
  compact?: boolean;
  className?: string;
}

const CurrencySelector: React.FC<CurrencySelectorProps> = ({ value: valueProp, onChange: onChangeProp, compact = false, className }) => {
  const { currency: contextCurrency, setCurrency: setContextCurrency, customCurrencies } = useCurrency();
  
  const value = valueProp ?? contextCurrency;
  const onChange = onChangeProp ?? setContextCurrency;

  const baseCurrencies = [
    { code: 'USD', name: 'دولار أمريكي', symbol: '$' },
    { code: 'EUR', name: 'يورو', symbol: '€' },
    { code: 'GBP', name: 'جنيه إسترليني', symbol: '£' },
    { code: 'AED', name: 'درهم إماراتي', symbol: 'د.إ' },
    { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' },
    { code: 'KWD', name: 'دينار كويتي', symbol: 'د.ك' },
    { code: 'QAR', name: 'ريال قطري', symbol: 'ر.ق' },
    { code: 'BHD', name: 'دينار بحريني', symbol: 'د.ب' },
    { code: 'OMR', name: 'ريال عماني', symbol: 'ر.ع' },
    { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م' },
    { code: 'TRY', name: 'ليرة تركية', symbol: '₺' },
    { code: 'JPY', name: 'ين ياباني', symbol: '¥' },
    { code: 'CAD', name: 'دولار كندي', symbol: 'C$' },
    { code: 'AUD', name: 'دولار أسترالي', symbol: 'A$' },
    { code: 'INR', name: 'روبية هندية', symbol: '₹' },
    { code: 'CHF', name: 'فرنك سويسري', symbol: 'CHF' },
    { code: 'CNY', name: 'يوان صيني', symbol: '¥' },
    { code: 'SGD', name: 'دولار سنغافوري', symbol: 'S$' },
    { code: 'MYR', name: 'رينغيت ماليزي', symbol: 'RM' },
    { code: 'THB', name: 'بات تايلاندي', symbol: '฿' },
    { code: 'KRW', name: 'وون كوري', symbol: '₩' },
    { code: 'RUB', name: 'روبل روسي', symbol: '₽' },
  ];

  // Merge admin-defined custom currencies (only enabled ones, no duplicates)
  const adminCustom = (customCurrencies || [])
    .filter(c => c.enabled !== false && c.code)
    .filter(c => !baseCurrencies.find(b => b.code === c.code))
    .map(c => ({ code: c.code, name: c.name_ar || c.name || c.code, symbol: c.symbol || c.code, flag_url: c.flag_url }));

  const currencies: Array<{ code: string; name: string; symbol: string; flag_url?: string }> = [...baseCurrencies, ...adminCustom];

  // Attach flags to base currencies if admin provided them
  const flagFor = (code: string) => (customCurrencies || []).find(c => c.code === code)?.flag_url;

  const currentCurrency = currencies.find((curr) => curr.code === value) || currencies[0];
  const currentFlag = currentCurrency.flag_url || flagFor(currentCurrency.code);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn(
        "w-auto min-w-[90px] h-8 text-sm border-0 bg-transparent shadow-none",
        compact && "w-full min-w-[76px] px-2 text-xs border border-border/60 bg-card/70",
        className
      )}>
        {compact ? (
          <span className="inline-flex items-center gap-1 font-medium">
            {currentFlag && <img src={currentFlag} alt="" className="w-4 h-4 rounded-sm object-cover" />}
            <span>{currentCurrency.symbol}</span>
            <span>{currentCurrency.code}</span>
          </span>
        ) : (
          <SelectValue placeholder="العملة" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>اختر العملة</SelectLabel>
          {currencies.map((c) => {
            const flag = c.flag_url || flagFor(c.code);
            return (
              <SelectItem key={c.code} value={c.code}>
                <span className="flex items-center gap-2">
                  {flag && <img src={flag} alt="" className="w-4 h-4 rounded-sm object-cover" />}
                  <span className="font-medium">{c.symbol}</span>
                  <span>{c.code}</span>
                  <span className="text-muted-foreground text-xs">({c.name})</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default CurrencySelector;
