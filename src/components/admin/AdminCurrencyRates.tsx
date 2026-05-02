import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DEFAULT_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, AED: 3.67, SAR: 3.75, JPY: 149.5,
  CAD: 1.36, AUD: 1.53, INR: 83.1, TRY: 32.2, EGP: 30.9,
  KWD: 0.31, BHD: 0.38, QAR: 3.64, OMR: 0.38, RUB: 92.5,
  CNY: 7.24, THB: 35.8, MYR: 4.72, IDR: 15700, PHP: 56.1,
  SGD: 1.34, HKD: 7.82, KRW: 1330, BRL: 4.97, MXN: 17.1,
  ZAR: 18.6, CHF: 0.88, SEK: 10.4, NOK: 10.5, DKK: 6.87,
  PLN: 4.02, CZK: 22.8, HUF: 356, NZD: 1.64, JOD: 0.71,
};

const CURRENCY_NAMES: Record<string, { en: string; ar: string }> = {
  USD: { en: "US Dollar", ar: "دولار أمريكي" },
  EUR: { en: "Euro", ar: "يورو" },
  GBP: { en: "British Pound", ar: "جنيه إسترليني" },
  AED: { en: "UAE Dirham", ar: "درهم إماراتي" },
  SAR: { en: "Saudi Riyal", ar: "ريال سعودي" },
  EGP: { en: "Egyptian Pound", ar: "جنيه مصري" },
  KWD: { en: "Kuwaiti Dinar", ar: "دينار كويتي" },
  BHD: { en: "Bahraini Dinar", ar: "دينار بحريني" },
  QAR: { en: "Qatari Riyal", ar: "ريال قطري" },
  OMR: { en: "Omani Rial", ar: "ريال عماني" },
  JOD: { en: "Jordanian Dinar", ar: "دينار أردني" },
  JPY: { en: "Japanese Yen", ar: "ين ياباني" },
  CAD: { en: "Canadian Dollar", ar: "دولار كندي" },
  AUD: { en: "Australian Dollar", ar: "دولار أسترالي" },
  INR: { en: "Indian Rupee", ar: "روبية هندية" },
  TRY: { en: "Turkish Lira", ar: "ليرة تركية" },
  CNY: { en: "Chinese Yuan", ar: "يوان صيني" },
  THB: { en: "Thai Baht", ar: "بات تايلندي" },
  MYR: { en: "Malaysian Ringgit", ar: "رينجيت ماليزي" },
  IDR: { en: "Indonesian Rupiah", ar: "روبية إندونيسية" },
  PHP: { en: "Philippine Peso", ar: "بيزو فلبيني" },
  SGD: { en: "Singapore Dollar", ar: "دولار سنغافوري" },
  HKD: { en: "Hong Kong Dollar", ar: "دولار هونج كونج" },
  KRW: { en: "South Korean Won", ar: "وون كوري" },
  BRL: { en: "Brazilian Real", ar: "ريال برازيلي" },
  MXN: { en: "Mexican Peso", ar: "بيزو مكسيكي" },
  ZAR: { en: "South African Rand", ar: "راند جنوب أفريقي" },
  CHF: { en: "Swiss Franc", ar: "فرنك سويسري" },
  SEK: { en: "Swedish Krona", ar: "كرونة سويدية" },
  NOK: { en: "Norwegian Krone", ar: "كرونة نرويجية" },
  DKK: { en: "Danish Krone", ar: "كرونة دنماركية" },
  PLN: { en: "Polish Zloty", ar: "زلوتي بولندي" },
  CZK: { en: "Czech Koruna", ar: "كرونة تشيكية" },
  HUF: { en: "Hungarian Forint", ar: "فورنت مجري" },
  NZD: { en: "New Zealand Dollar", ar: "دولار نيوزيلندي" },
  RUB: { en: "Russian Ruble", ar: "روبل روسي" },
};

interface CustomCurrency {
  code: string;
  name?: string;
  name_ar?: string;
  symbol?: string;
  flag_url?: string;
  enabled?: boolean;
}

const AdminCurrencyRates = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES);
  const [customCurrencies, setCustomCurrencies] = useState<CustomCurrency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [newCustom, setNewCustom] = useState<CustomCurrency>({ code: "", name: "", name_ar: "", symbol: "", flag_url: "", enabled: true });
  const [uploadingFlag, setUploadingFlag] = useState(false);

  useEffect(() => { fetchRates(); }, []);

  const fetchRates = async () => {
    setLoading(true);
    const { data } = await supabase.from("site_settings").select("financial_config").eq("id", "default").single();
    const config = (data?.financial_config || {}) as any;
    if (config.exchange_rates && typeof config.exchange_rates === "object") {
      setRates({ ...DEFAULT_RATES, ...config.exchange_rates });
    }
    if (Array.isArray(config.custom_currencies)) {
      setCustomCurrencies(config.custom_currencies);
    }
    setLoading(false);
  };

  const saveRates = async () => {
    setSaving(true);
    const { data: current } = await supabase.from("site_settings").select("financial_config").eq("id", "default").single();
    const existingConfig = (current?.financial_config || {}) as any;
    const { error } = await supabase.from("site_settings").update({
      financial_config: { ...existingConfig, exchange_rates: rates, custom_currencies: customCurrencies } as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", "default");
    if (error) toast.error("Failed to save");
    else toast.success(isAr ? "✅ تم حفظ أسعار العملات" : "✅ Exchange rates saved");
    setSaving(false);
  };

  const resetToDefaults = () => {
    setRates({ ...DEFAULT_RATES });
    toast.info(isAr ? "تم إعادة الأسعار الافتراضية" : "Reset to default rates");
  };

  const handleFlagUpload = async (e: React.ChangeEvent<HTMLInputElement>, isNew = false, idx = -1) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFlag(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `flag-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("story-media").upload(`currency-flags/${fileName}`, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`currency-flags/${fileName}`);
      if (isNew) setNewCustom(c => ({ ...c, flag_url: urlData.publicUrl }));
      else setCustomCurrencies(arr => arr.map((c, i) => i === idx ? { ...c, flag_url: urlData.publicUrl } : c));
      toast.success("✅ Flag uploaded");
    } catch (err: any) { toast.error(err.message || "Upload failed"); }
    finally { setUploadingFlag(false); }
  };

  const addCustomCurrency = () => {
    const code = newCustom.code.trim().toUpperCase();
    if (!code || code.length < 2) { toast.error(isAr ? "أدخل رمز العملة" : "Enter currency code"); return; }
    if (customCurrencies.find(c => c.code === code) || rates[code]) {
      toast.error(isAr ? "العملة موجودة بالفعل" : "Currency already exists");
      return;
    }
    setCustomCurrencies(arr => [...arr, { ...newCustom, code, enabled: true }]);
    setRates(r => ({ ...r, [code]: 1 }));
    setNewCustom({ code: "", name: "", name_ar: "", symbol: "", flag_url: "", enabled: true });
    toast.success(isAr ? "تمت الإضافة - لا تنسَ الحفظ" : "Added — remember to save");
  };

  const removeCustomCurrency = (code: string) => {
    setCustomCurrencies(arr => arr.filter(c => c.code !== code));
    setRates(r => { const n = { ...r }; delete n[code]; return n; });
  };

  const filteredCurrencies = Object.keys(rates).filter(code => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = CURRENCY_NAMES[code];
    const custom = customCurrencies.find(c => c.code === code);
    return code.toLowerCase().includes(q) || name?.en.toLowerCase().includes(q) || name?.ar.includes(search) || (custom?.name || "").toLowerCase().includes(q);
  });

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-primary" />
            {isAr ? "إدارة أسعار العملات" : "Currency Exchange Rates"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefaults} className="gap-1 text-xs h-7">
              <RefreshCw size={12} /> {isAr ? "افتراضي" : "Reset"}
            </Button>
            <Button size="sm" onClick={saveRates} disabled={saving} className="gap-1 text-xs h-7">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {isAr ? "حفظ" : "Save"}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          {isAr
            ? "جميع الأسعار نسبية إلى 1 دولار أمريكي (USD). مثال: SAR = 3.75 يعني 1 USD = 3.75 SAR"
            : "All rates are relative to 1 USD. Example: SAR = 3.75 means 1 USD = 3.75 SAR"}
        </p>

        {/* Add Custom Currency */}
        <div className="rounded-lg border border-dashed border-primary/40 p-3 space-y-2 bg-primary/5">
          <Label className="text-xs font-semibold">{isAr ? "➕ إضافة عملة مخصصة" : "➕ Add custom currency"}</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Input className="h-7 text-xs" placeholder="Code (e.g. QAR)" value={newCustom.code} onChange={e => setNewCustom(c => ({ ...c, code: e.target.value.toUpperCase() }))} />
            <Input className="h-7 text-xs" placeholder="Symbol" value={newCustom.symbol || ""} onChange={e => setNewCustom(c => ({ ...c, symbol: e.target.value }))} />
            <Input className="h-7 text-xs" placeholder="Name (EN)" value={newCustom.name || ""} onChange={e => setNewCustom(c => ({ ...c, name: e.target.value }))} />
            <Input className="h-7 text-xs" dir="rtl" placeholder="الاسم بالعربي" value={newCustom.name_ar || ""} onChange={e => setNewCustom(c => ({ ...c, name_ar: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            {newCustom.flag_url && <img src={newCustom.flag_url} alt="flag" className="w-8 h-6 rounded object-cover border" />}
            <Input className="h-7 text-xs flex-1" placeholder={isAr ? "رابط الشعار/العلم" : "Flag/icon URL"} value={newCustom.flag_url || ""} onChange={e => setNewCustom(c => ({ ...c, flag_url: e.target.value }))} />
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={e => handleFlagUpload(e, true)} />
              <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" asChild disabled={uploadingFlag}>
                <span>{uploadingFlag ? "..." : isAr ? "رفع" : "Upload"}</span>
              </Button>
            </label>
            <Button size="sm" className="h-7 text-[10px]" onClick={addCustomCurrency}>{isAr ? "إضافة" : "Add"}</Button>
          </div>
        </div>

        {/* Custom Currencies List */}
        {customCurrencies.length > 0 && (
          <div className="rounded-lg border p-2 space-y-2">
            <Label className="text-[11px] font-semibold">{isAr ? "العملات المخصصة" : "Custom currencies"}</Label>
            {customCurrencies.map((c, idx) => (
              <div key={c.code} className="flex items-center gap-2 p-2 rounded bg-muted/30">
                {c.flag_url ? <img src={c.flag_url} alt="" className="w-8 h-6 rounded object-cover border" /> : <div className="w-8 h-6 rounded bg-muted border" />}
                <Badge variant="outline" className="text-[10px] font-mono">{c.code}</Badge>
                <Input className="h-6 text-[10px] w-16" value={c.symbol || ""} placeholder="Symbol" onChange={e => setCustomCurrencies(arr => arr.map((x, i) => i === idx ? { ...x, symbol: e.target.value } : x))} />
                <Input className="h-6 text-[10px] flex-1" value={c.name || ""} placeholder="Name" onChange={e => setCustomCurrencies(arr => arr.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={e => handleFlagUpload(e, false, idx)} />
                  <Button type="button" size="sm" variant="ghost" className="h-6 text-[10px]" asChild>
                    <span>{isAr ? "علم" : "Flag"}</span>
                  </Button>
                </label>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setCustomCurrencies(arr => arr.map((x, i) => i === idx ? { ...x, enabled: !(x.enabled !== false) } : x))}>
                  {c.enabled !== false ? (isAr ? "إخفاء" : "Hide") : (isAr ? "إظهار" : "Show")}
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-destructive text-[10px]" onClick={() => removeCustomCurrency(c.code)}>×</Button>
              </div>
            ))}
          </div>
        )}

        <Input
          className="h-8 text-sm"
          placeholder={isAr ? "بحث عن عملة..." : "Search currency..."}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
          {filteredCurrencies.map(code => {
            const name = CURRENCY_NAMES[code];
            const custom = customCurrencies.find(c => c.code === code);
            return (
              <div key={code} className="p-2 rounded-lg border border-border bg-card space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {custom?.flag_url && <img src={custom.flag_url} alt="" className="w-4 h-3 rounded-sm object-cover" />}
                    <Badge variant="outline" className="text-[10px] font-mono">{code}</Badge>
                  </div>
                  {code === "USD" && <Badge className="text-[8px] bg-primary/20 text-primary">{isAr ? "أساس" : "Base"}</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1">
                  {isAr ? (custom?.name_ar || name?.ar || code) : (custom?.name || name?.en || code)}
                </p>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={rates[code] || 0}
                  onChange={e => setRates(prev => ({ ...prev, [code]: Number(e.target.value) }))}
                  className="h-7 text-xs font-mono"
                  disabled={code === "USD"}
                />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminCurrencyRates;
