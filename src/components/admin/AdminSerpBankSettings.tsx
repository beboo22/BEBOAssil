import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type RefreshMode = "manual" | "interval" | "generations";

interface SerpBankConfig {
  maxPages: number;
  pageSize: number;
  freshThreshold: number;
  refreshMode: RefreshMode;
  refreshIntervalDays: number;
  refreshAfterGenerations: number;
  lastRefreshedAt: string | null;
  generationsSinceRefresh: number;
}

const DEFAULTS: SerpBankConfig = {
  maxPages: 3,
  pageSize: 20,
  freshThreshold: 10,
  refreshMode: "manual",
  refreshIntervalDays: 7,
  refreshAfterGenerations: 100,
  lastRefreshedAt: null,
  generationsSinceRefresh: 0,
};

const AdminSerpBankSettings = () => {
  const [cfg, setCfg] = useState<SerpBankConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("serpapi_bank_config")
          .eq("id", "default")
          .maybeSingle();
        const raw = (data as any)?.serpapi_bank_config;
        if (raw && typeof raw === "object") {
          setCfg({ ...DEFAULTS, ...raw });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (next: SerpBankConfig) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({ serpapi_bank_config: next as any })
        .eq("id", "default");
      if (error) throw error;
      setCfg(next);
      toast.success("تم حفظ إعدادات بنك SerpApi");
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const refreshBankNow = async () => {
    setRefreshing(true);
    try {
      // Mark all rows as expired so the next generation re-fetches fresh data
      // and merges it on top of the existing bank.
      const { error } = await supabase
        .from("places_cache")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .gte("expires_at", new Date().toISOString());
      if (error) throw error;
      const next: SerpBankConfig = {
        ...cfg,
        lastRefreshedAt: new Date().toISOString(),
        generationsSinceRefresh: 0,
      };
      await persist(next);
      toast.success("تم تحديث البنك — سيتم جلب نتائج جديدة في التوليدات القادمة");
    } catch (e: any) {
      toast.error(e?.message || "فشل التحديث");
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const dueByInterval =
    cfg.refreshMode === "interval" &&
    cfg.lastRefreshedAt &&
    Date.now() - new Date(cfg.lastRefreshedAt).getTime() >
      cfg.refreshIntervalDays * 24 * 60 * 60 * 1000;
  const dueByCount =
    cfg.refreshMode === "generations" &&
    cfg.generationsSinceRefresh >= cfg.refreshAfterGenerations;
  const refreshDue = dueByInterval || dueByCount;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            إعدادات بنك SerpApi والتقسيم (Pagination)
          </CardTitle>
          <CardDescription>
            تحكّم في عمق البحث عبر صفحات SerpApi، حجم الصفحة، وعدد العناصر
            الجديدة المطلوبة قبل التوقف. يتم دمج النتائج الجديدة مع البنك الموجود
            (الأماكن السابقة لا تُحذف، تُضاف فقط أماكن جديدة).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>أقصى عدد صفحات (Max Pages)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={cfg.maxPages}
                onChange={(e) =>
                  setCfg({ ...cfg, maxPages: Number(e.target.value) || 1 })
                }
              />
              <p className="text-xs text-muted-foreground">1-10 صفحات</p>
            </div>
            <div className="space-y-2">
              <Label>حجم الصفحة (Page Size)</Label>
              <Input
                type="number"
                min={5}
                max={20}
                value={cfg.pageSize}
                onChange={(e) =>
                  setCfg({ ...cfg, pageSize: Number(e.target.value) || 20 })
                }
              />
              <p className="text-xs text-muted-foreground">5-20 (start step)</p>
            </div>
            <div className="space-y-2">
              <Label>الحد الأدنى للأماكن الجديدة</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={cfg.freshThreshold}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    freshThreshold: Number(e.target.value) || 10,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                يتوقف عند جلب N place_id جديد
              </p>
            </div>
          </div>

          <Button
            onClick={() => persist(cfg)}
            disabled={saving}
            className="w-full md:w-auto"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            حفظ إعدادات Pagination
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            جدولة تحديث البنك
            {refreshDue && (
              <Badge variant="destructive" className="ml-2">
                التحديث مطلوب الآن
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            اختر متى يتم تحديث بنك الأماكن: يدوياً، أو تلقائياً كل عدد أيام، أو
            بعد عدد معيّن من التوليدات.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>وضع التحديث</Label>
            <Select
              value={cfg.refreshMode}
              onValueChange={(v: RefreshMode) =>
                setCfg({ ...cfg, refreshMode: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">يدوي فقط</SelectItem>
                <SelectItem value="interval">تلقائي كل عدد أيام</SelectItem>
                <SelectItem value="generations">
                  تلقائي بعد عدد توليدات
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cfg.refreshMode === "interval" && (
            <div className="space-y-2">
              <Label>عدد الأيام بين كل تحديث</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={cfg.refreshIntervalDays}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    refreshIntervalDays: Number(e.target.value) || 7,
                  })
                }
              />
            </div>
          )}

          {cfg.refreshMode === "generations" && (
            <div className="space-y-2">
              <Label>عدد التوليدات قبل التحديث</Label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={cfg.refreshAfterGenerations}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    refreshAfterGenerations: Number(e.target.value) || 100,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                التوليدات منذ آخر تحديث: {cfg.generationsSinceRefresh}
              </p>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            آخر تحديث:{" "}
            {cfg.lastRefreshedAt
              ? new Date(cfg.lastRefreshedAt).toLocaleString("en-GB", {
                  hour12: false,
                })
              : "لم يتم بعد"}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => persist(cfg)} disabled={saving} variant="outline">
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              حفظ إعدادات الجدولة
            </Button>
            <Button onClick={refreshBankNow} disabled={refreshing} variant="default">
              {refreshing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              تحديث البنك الآن
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSerpBankSettings;
