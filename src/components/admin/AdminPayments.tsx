import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import AdminCurrencyRates from "./AdminCurrencyRates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Download, DollarSign, Receipt, Percent, Calculator, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FinancialConfig {
  tax_rate: number;
  platform_fee_percent: number;
  currency: string;
  tax_name: string;
  tax_name_ar: string;
  upgrade_discount_enabled: boolean;
  upgrade_discount_percent: number;
  upgrade_discount_max_subscribers: number;
}

interface SubscriptionRevenue {
  plan_name: string;
  plan_name_ar: string | null;
  price: number;
  currency: string;
  count: number;
  total: number;
}

const AdminPayments = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [config, setConfig] = useState<FinancialConfig>({
    tax_rate: 15, platform_fee_percent: 10, currency: "SAR",
    tax_name: "VAT", tax_name_ar: "ضريبة القيمة المضافة",
    upgrade_discount_enabled: false, upgrade_discount_percent: 0, upgrade_discount_max_subscribers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subRevenue, setSubRevenue] = useState<SubscriptionRevenue[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalSubs, setTotalSubs] = useState(0);
  const [activeSubs, setActiveSubs] = useState(0);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [settingsRes, subsRes, plansRes, usersRes] = await Promise.all([
      supabase.from("site_settings").select("financial_config").eq("id", "default").single(),
      supabase.from("user_subscriptions").select("*, subscription_plans(name, name_ar, price, currency)"),
      supabase.from("subscription_plans").select("*").eq("is_active", true),
      supabase.from("profiles").select("id", { count: "exact" }),
    ]);

    if (settingsRes.data?.financial_config) {
      setConfig({
        tax_rate: 15,
        platform_fee_percent: 10,
        currency: "SAR",
        tax_name: "VAT",
        tax_name_ar: "ضريبة القيمة المضافة",
        upgrade_discount_enabled: false,
        upgrade_discount_percent: 0,
        upgrade_discount_max_subscribers: 0,
        ...(settingsRes.data.financial_config as any),
      });
    }
    setTotalUsers(usersRes.count || 0);

    const subs = subsRes.data || [];
    setTotalSubs(subs.length);
    setActiveSubs(subs.filter((s: any) => s.status === "active").length);

    // Calculate revenue per plan
    const planMap: Record<string, SubscriptionRevenue> = {};
    subs.forEach((s: any) => {
      const plan = s.subscription_plans;
      if (!plan) return;
      const key = plan.name;
      if (!planMap[key]) {
        planMap[key] = { plan_name: plan.name, plan_name_ar: plan.name_ar, price: plan.price, currency: plan.currency, count: 0, total: 0 };
      }
      planMap[key].count++;
      planMap[key].total += plan.price;
    });
    setSubRevenue(Object.values(planMap).sort((a, b) => b.total - a.total));
    setLoading(false);
  };

  const saveConfig = async () => {
    setSaving(true);
    const { error } = await supabase.from("site_settings").update({
      financial_config: config as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", "default");
    if (error) toast.error("Failed to save"); else toast.success(isAr ? "✅ تم الحفظ" : "✅ Settings saved");
    setSaving(false);
  };

  const grossRevenue = subRevenue.reduce((s, r) => s + r.total, 0);
  const taxAmount = grossRevenue * (config.tax_rate / 100);
  const platformFee = grossRevenue * (config.platform_fee_percent / 100);
  const netRevenue = grossRevenue - taxAmount - platformFee;

  const exportXLSX = () => {
    const BOM = "\uFEFF";
    let csv = "تقرير المدفوعات الشامل / Comprehensive Payments Report\n";
    csv += `التاريخ / Date,${new Date().toLocaleDateString("en-US")}\n\n`;

    csv += "الإعدادات المالية / Financial Settings\n";
    csv += `${isAr ? "نسبة الضريبة" : "Tax Rate"},${config.tax_rate}%\n`;
    csv += `${isAr ? "اسم الضريبة" : "Tax Name"},${isAr ? config.tax_name_ar : config.tax_name}\n`;
    csv += `${isAr ? "نسبة رسوم المنصة" : "Platform Fee"},${config.platform_fee_percent}%\n`;
    csv += `${isAr ? "العملة" : "Currency"},${config.currency}\n\n`;

    csv += "ملخص / Summary\n";
    csv += `${isAr ? "إجمالي المستخدمين" : "Total Users"},${totalUsers}\n`;
    csv += `${isAr ? "إجمالي الاشتراكات" : "Total Subscriptions"},${totalSubs}\n`;
    csv += `${isAr ? "الاشتراكات النشطة" : "Active Subscriptions"},${activeSubs}\n\n`;

    csv += `${isAr ? "اسم الباقة" : "Plan Name"},${isAr ? "عدد الاشتراكات" : "Subscriptions"},${isAr ? "سعر الباقة" : "Price"},${isAr ? "الإجمالي" : "Total Revenue"}\n`;
    subRevenue.forEach(r => {
      csv += `"${isAr ? r.plan_name_ar || r.plan_name : r.plan_name}",${r.count},${r.price},${r.total}\n`;
    });

    csv += `\n${isAr ? "الحسابات المالية" : "Financial Calculations"}\n`;
    csv += `${isAr ? "إجمالي الإيرادات" : "Gross Revenue"},${grossRevenue.toFixed(2)} ${config.currency}\n`;
    csv += `${isAr ? config.tax_name_ar : config.tax_name} (${config.tax_rate}%),${taxAmount.toFixed(2)} ${config.currency}\n`;
    csv += `${isAr ? "رسوم المنصة" : "Platform Fee"} (${config.platform_fee_percent}%),${platformFee.toFixed(2)} ${config.currency}\n`;
    csv += `${isAr ? "صافي الإيرادات" : "Net Revenue"},${netRevenue.toFixed(2)} ${config.currency}\n`;

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payments-report-${new Date().toISOString().split("T")[0]}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(isAr ? "تم تصدير التقرير" : "Report exported");
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Receipt className="text-primary" size={20} />
          {isAr ? "تقرير المدفوعات والضرائب (Moyasar)" : "Payments & Tax Report (Moyasar)"}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportXLSX} className="gap-1 text-xs">
            <Download size={14} /> {isAr ? "تصدير Excel" : "Export XLSX"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1 text-xs">
            <RefreshCw size={14} /> {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Financial Settings */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator size={16} className="text-primary" />
            {isAr ? "إعدادات الضريبة والرسوم" : "Tax & Fee Settings"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">{isAr ? "نسبة الضريبة %" : "Tax Rate %"}</Label>
              <Input type="number" step="0.5" min={0} max={100} value={config.tax_rate} onChange={e => setConfig(c => ({ ...c, tax_rate: Number(e.target.value) }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{isAr ? "رسوم المنصة %" : "Platform Fee %"}</Label>
              <Input type="number" step="0.5" min={0} max={100} value={config.platform_fee_percent} onChange={e => setConfig(c => ({ ...c, platform_fee_percent: Number(e.target.value) }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{isAr ? "العملة" : "Currency"}</Label>
              <Input value={config.currency} onChange={e => setConfig(c => ({ ...c, currency: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{isAr ? "اسم الضريبة (EN)" : "Tax Name (EN)"}</Label>
              <Input value={config.tax_name} onChange={e => setConfig(c => ({ ...c, tax_name: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">{isAr ? "اسم الضريبة (AR)" : "Tax Name (AR)"}</Label>
              <Input value={config.tax_name_ar} onChange={e => setConfig(c => ({ ...c, tax_name_ar: e.target.value }))} className="h-8 text-sm" dir="rtl" />
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{isAr ? "خصم ترقية الباقات" : "Plan Upgrade Discount"}</p>
                <p className="text-[11px] text-muted-foreground">{isAr ? "تفعيل خصم خاص عند ترقية الباقة" : "Enable a special discount when upgrading a plan"}</p>
              </div>
              <input
                type="checkbox"
                checked={config.upgrade_discount_enabled}
                onChange={e => setConfig(c => ({ ...c, upgrade_discount_enabled: e.target.checked }))}
                className="h-4 w-4"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{isAr ? "نسبة الخصم %" : "Discount %"}</Label>
                <Input type="number" min={0} max={100} value={config.upgrade_discount_percent} onChange={e => setConfig(c => ({ ...c, upgrade_discount_percent: Number(e.target.value) }))} className="h-8 text-sm" disabled={!config.upgrade_discount_enabled} />
              </div>
              <div>
                <Label className="text-xs">{isAr ? "عدد المشتركين (0 = بدون حد)" : "Subscribers Limit (0 = unlimited)"}</Label>
                <Input type="number" min={0} value={config.upgrade_discount_max_subscribers} onChange={e => setConfig(c => ({ ...c, upgrade_discount_max_subscribers: Number(e.target.value) }))} className="h-8 text-sm" disabled={!config.upgrade_discount_enabled} />
              </div>
            </div>
          </div>
          <Button size="sm" onClick={saveConfig} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {isAr ? "حفظ الإعدادات" : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Revenue Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto text-green-500 mb-1" size={20} />
            <p className="text-xl font-bold">{grossRevenue.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "إجمالي الإيرادات" : "Gross Revenue"} ({config.currency})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Percent className="mx-auto text-red-500 mb-1" size={20} />
            <p className="text-xl font-bold text-red-500">-{taxAmount.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? config.tax_name_ar : config.tax_name} ({config.tax_rate}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Receipt className="mx-auto text-amber-500 mb-1" size={20} />
            <p className="text-xl font-bold text-amber-500">-{platformFee.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "رسوم المنصة" : "Platform Fee"} ({config.platform_fee_percent}%)</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto text-green-600 mb-1" size={20} />
            <p className="text-xl font-bold text-green-600">{netRevenue.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "صافي الإيرادات" : "Net Revenue"} ({config.currency})</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{totalUsers}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "إجمالي المستخدمين" : "Total Users"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold">{totalSubs}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "إجمالي الاشتراكات" : "Total Subscriptions"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-500">{activeSubs}</p>
            <p className="text-[10px] text-muted-foreground">{isAr ? "اشتراكات نشطة" : "Active Subs"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{isAr ? "الإيرادات حسب الباقة" : "Revenue by Plan"}</CardTitle>
        </CardHeader>
        <CardContent>
          {subRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{isAr ? "لا توجد اشتراكات بعد" : "No subscriptions yet"}</p>
          ) : (
            <div className="space-y-2">
              {subRevenue.map((r, i) => {
                const pct = grossRevenue > 0 ? Math.round((r.total / grossRevenue) * 100) : 0;
                const tax = r.total * (config.tax_rate / 100);
                const fee = r.total * (config.platform_fee_percent / 100);
                const net = r.total - tax - fee;
                return (
                  <div key={i} className="p-3 rounded-lg bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{isAr ? r.plan_name_ar || r.plan_name : r.plan_name}</p>
                        <p className="text-[10px] text-muted-foreground">{r.count} {isAr ? "اشتراك" : "subs"} × {r.price} {r.currency}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{r.total.toFixed(0)} {config.currency}</p>
                        <p className="text-[10px] text-green-500">{isAr ? "صافي" : "Net"}: {net.toFixed(0)}</p>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-2 text-[9px] text-muted-foreground">
                      <span>{config.tax_name}: -{tax.toFixed(0)}</span>
                      <span>{isAr ? "رسوم" : "Fee"}: -{fee.toFixed(0)}</span>
                      <Badge variant="secondary" className="text-[9px]">{pct}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {/* Currency Exchange Rates */}
      <AdminCurrencyRates />
    </div>
  );
};

export default AdminPayments;
