import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, TrendingUp, DollarSign, BarChart3, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Sale {
  action_id: string;
  subid: string;
  status: string;
  reward: number;
  currency: string;
  booking_date: string;
  click_date: string;
}

const AdminBookingStats = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelpayouts", {
        body: { type: "sync_bookings" },
      });
      if (error) throw error;
      if (data?.sales) setSales(data.sales);
      else setSales([]);
    } catch (err) {
      console.error("Failed to fetch booking stats:", err);
      toast.error(isAr ? "فشل تحميل الإحصائيات" : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const totalRevenue = sales.reduce((sum, s) => sum + (s.reward || 0), 0);
  const paidSales = sales.filter(s => s.status === "paid");
  const processingSales = sales.filter(s => s.status === "processing");
  const cancelledSales = sales.filter(s => s.status === "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="text-primary" size={22} />
          {isAr ? "إحصائيات الحجوزات" : "Booking Analytics"}
        </h2>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-1">
          {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          {isAr ? "تحديث" : "Refresh"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="mx-auto text-primary mb-1" size={20} />
            <p className="text-2xl font-bold">{sales.length}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "إجمالي الحجوزات" : "Total Bookings"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="mx-auto text-green-500 mb-1" size={20} />
            <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "إجمالي العمولات" : "Total Revenue"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-500">{paidSales.length}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "مؤكدة" : "Paid"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-500">{processingSales.length}</p>
            <p className="text-xs text-muted-foreground">{isAr ? "قيد المعالجة" : "Processing"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-primary" size={28} />
        </div>
      ) : sales.length === 0 ? (
        <Card className="p-8 text-center">
          <Globe className="mx-auto text-muted-foreground mb-2" size={32} />
          <p className="text-muted-foreground">{isAr ? "لا توجد حجوزات بعد" : "No bookings yet"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isAr ? "ستظهر هنا بمجرد حجز المستخدمين عبر روابط Travelpayouts" : "Bookings will appear here once users book through your affiliate links"}
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{isAr ? "آخر الحجوزات" : "Recent Bookings"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sales.slice(0, 20).map((sale, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">#{sale.action_id}</p>
                    <p className="text-[10px] text-muted-foreground">{sale.booking_date || sale.click_date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sale.status === "paid" ? "default" : sale.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px]">
                      {sale.status}
                    </Badge>
                    <span className="text-sm font-bold">${sale.reward?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminBookingStats;
