import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const AdminWorldCities = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ count?: number }>({});

  const loadStats = async () => {
    const { count } = await supabase
      .from("world_cities" as any)
      .select("*", { count: "exact", head: true });
    setStats({ count: count || 0 });
  };

  const seed = async (source: "cities5000" | "cities15000") => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("seed-world-cities", {
        body: { source, minPopulation: source === "cities5000" ? 5000 : 15000 },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) throw error;
      toast.success(`تم إدخال ${data?.inserted || 0} مدينة بنجاح`);
      await loadStats();
    } catch (e: any) {
      toast.error(`فشل البذر: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" /> قاعدة بيانات مدن العالم
        </CardTitle>
        <CardDescription>
          استيراد مدن العالم من GeoNames (يشمل أسماء عربية وإحداثيات وعدد سكان).
          يستخدم البحث هذه القاعدة محلياً ثم يرجع لـ Photon (OSM) للقرى النادرة.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" onClick={loadStats} disabled={loading}>
          عرض عدد المدن المخزنة
        </Button>
        {stats.count !== undefined && (
          <p className="text-sm text-muted-foreground">
            عدد المدن المخزنة حالياً: <strong>{stats.count.toLocaleString()}</strong>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => seed("cities15000")} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            استيراد المدن المتوسطة والكبيرة (~25 ألف)
          </Button>
          <Button onClick={() => seed("cities5000")} disabled={loading} variant="secondary">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            استيراد تغطية موسعة (~50 ألف)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          ⚠️ العملية تستغرق 1-3 دقائق وتحذف البيانات السابقة قبل الإدخال.
        </p>
      </CardContent>
    </Card>
  );
};
