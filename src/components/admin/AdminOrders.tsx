import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Package, RefreshCw, Download, ShoppingBag, CheckCircle2, Clock, XCircle, FileSpreadsheet, BarChart3 } from "lucide-react";

interface Order {
  id: string; item_name: string; item_id: string; quantity: number; unit_price: number;
  total_price: number; currency: string; status: string; payment_method: string | null;
  notes: string | null; user_id: string; created_at: string; order_type: string;
}

interface Profile { id: string; email: string | null; full_name: string | null; }

const AdminOrders = () => {
  const { i18n } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [taxRate, setTaxRate] = useState(15);

  useEffect(() => { fetchOrders(); fetchTaxRate(); }, []);

  const fetchTaxRate = async () => {
    const { data } = await supabase.from("site_settings").select("financial_config").eq("id", "default").maybeSingle();
    if ((data as any)?.financial_config?.tax_rate) setTaxRate((data as any).financial_config.tax_rate);
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(500);
    if (data) {
      setOrders(data as any);
      const uids = [...new Set(data.map((o: any) => o.user_id))];
      if (uids.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, email, full_name").in("id", uids);
        if (profs) {
          const map: Record<string, Profile> = {};
          profs.forEach((p: any) => { map[p.id] = p; });
          setProfiles(map);
        }
      }
    }
    setLoading(false);
  };

  const updateStatus = async (orderId: string, status: string) => {
    const { error } = await supabase.from("orders").update({ status } as any).eq("id", orderId);
    if (error) toast.error("Failed");
    else {
      toast.success(isAr ? "تم تحديث الحالة" : "Status updated");
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    }
  };

  // Per-product stats
  const productStats = useMemo(() => {
    const map: Record<string, { name: string; sold: number; revenue: number; currency: string }> = {};
    orders.filter(o => o.status === "confirmed").forEach(o => {
      const key = o.item_id || o.item_name;
      if (!map[key]) map[key] = { name: o.item_name, sold: 0, revenue: 0, currency: o.currency };
      map[key].sold += o.quantity;
      map[key].revenue += o.total_price;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const storeOrders = filter === "all" ? orders.filter(o => o.order_type === "product") : orders.filter(o => o.order_type === "product" && o.status === filter);
  const subOrders = orders.filter(o => o.order_type === "subscription" && o.status === "confirmed");

  const totalStoreRevenue = orders.filter(o => o.order_type === "product" && o.status === "confirmed").reduce((s, o) => s + o.total_price, 0);
  const totalSubRevenue = subOrders.reduce((s, o) => s + o.total_price, 0);
  const totalRevenue = totalStoreRevenue + totalSubRevenue;
  const confirmedCount = orders.filter(o => o.status === "confirmed").length;
  const pendingCount = orders.filter(o => o.status === "pending_payment").length;

  const exportCSV = () => {
    const BOM = "\uFEFF";
    let csv = "Order ID,Customer,Email,Item,Type,Qty,Price,Total,Currency,Status,Payment,Date\n";
    orders.forEach(o => {
      const p = profiles[o.user_id];
      csv += `${o.id.slice(0,8)},${p?.full_name || "-"},${p?.email || "-"},${o.item_name},${o.order_type},${o.quantity},${o.unit_price},${o.total_price},${o.currency},${o.status},${o.payment_method || "-"},${new Date(o.created_at).toLocaleDateString("en")}\n`;
    });
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `orders-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = async () => {
    try {
      toast.info(isAr ? "جاري تصدير التقرير..." : "Exporting report...");
      
      const confirmed = orders.filter(o => o.status === "confirmed");
      const grossRevenue = confirmed.reduce((s, o) => s + o.total_price, 0);
      const taxAmount = grossRevenue * (taxRate / (100 + taxRate)); // extract tax from inclusive price
      const netRevenue = grossRevenue - taxAmount;
      
      // Build CSV-like TSV that Excel opens natively with formulas
      const BOM = "\uFEFF";
      const sep = "\t";
      let tsv = "";
      
      // Summary sheet
      tsv += `ASEEL AI TRIP - Revenue Report${sep}${sep}${sep}Date: ${new Date().toLocaleDateString("en")}\n\n`;
      tsv += `SUMMARY\n`;
      tsv += `Metric${sep}Value\n`;
      tsv += `Total Orders${sep}${orders.length}\n`;
      tsv += `Confirmed Orders${sep}${confirmed.length}\n`;
      tsv += `Gross Revenue${sep}${grossRevenue.toFixed(2)}\n`;
      tsv += `Tax Rate${sep}${taxRate}%\n`;
      tsv += `Tax Amount${sep}${taxAmount.toFixed(2)}\n`;
      tsv += `Net Revenue (after tax)${sep}${netRevenue.toFixed(2)}\n`;
      tsv += `Store Revenue${sep}${totalStoreRevenue.toFixed(2)}\n`;
      tsv += `Subscription Revenue${sep}${totalSubRevenue.toFixed(2)}\n\n`;

      // Per-product breakdown
      tsv += `PRODUCT PERFORMANCE\n`;
      tsv += `Product${sep}Units Sold${sep}Revenue${sep}Tax${sep}Net\n`;
      productStats.forEach(ps => {
        const pTax = ps.revenue * (taxRate / (100 + taxRate));
        tsv += `${ps.name}${sep}${ps.sold}${sep}${ps.revenue.toFixed(2)}${sep}${pTax.toFixed(2)}${sep}${(ps.revenue - pTax).toFixed(2)}\n`;
      });
      tsv += "\n";

      // All orders
      tsv += `ALL ORDERS\n`;
      tsv += `ID${sep}Customer${sep}Email${sep}Item${sep}Type${sep}Qty${sep}Unit Price${sep}Total${sep}Currency${sep}Tax${sep}Net${sep}Status${sep}Payment${sep}Date\n`;
      orders.forEach(o => {
        const p = profiles[o.user_id];
        const oTax = o.status === "confirmed" ? o.total_price * (taxRate / (100 + taxRate)) : 0;
        tsv += `${o.id.slice(0,8)}${sep}${p?.full_name || "-"}${sep}${p?.email || "-"}${sep}${o.item_name}${sep}${o.order_type}${sep}${o.quantity}${sep}${o.unit_price}${sep}${o.total_price}${sep}${o.currency}${sep}${oTax.toFixed(2)}${sep}${(o.total_price - oTax).toFixed(2)}${sep}${o.status}${sep}${o.payment_method || "-"}${sep}${new Date(o.created_at).toLocaleDateString("en")}\n`;
      });

      const blob = new Blob([BOM + tsv], { type: "application/vnd.ms-excel;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `revenue-report-${new Date().toISOString().split("T")[0]}.xls`; a.click();
      URL.revokeObjectURL(url);
      toast.success(isAr ? "تم التصدير بنجاح ✅" : "Export successful ✅");
    } catch (err: any) { toast.error(err.message); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={28} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Package className="text-primary" size={20} />
          {isAr ? "الطلبات والإيرادات" : "Orders & Revenue"}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportXLSX} className="gap-1 text-xs"><FileSpreadsheet size={14} /> XLSX</Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1 text-xs"><Download size={14} /> CSV</Button>
          <Button variant="outline" size="sm" onClick={fetchOrders} className="gap-1 text-xs"><RefreshCw size={14} /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{orders.length}</p><p className="text-[10px] text-muted-foreground">{isAr ? "إجمالي الطلبات" : "Total Orders"}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-green-500">{confirmedCount}</p><p className="text-[10px] text-muted-foreground">{isAr ? "مكتمل" : "Confirmed"}</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-amber-500">{pendingCount}</p><p className="text-[10px] text-muted-foreground">{isAr ? "معلق" : "Pending"}</p></CardContent></Card>
        <Card className="border-green-500/30"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-green-600">{totalRevenue.toFixed(0)}</p><p className="text-[10px] text-muted-foreground">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</p></CardContent></Card>
        <Card className="border-blue-500/30"><CardContent className="p-3 text-center"><p className="text-xl font-bold text-blue-600">{(totalRevenue * (taxRate / (100 + taxRate))).toFixed(0)}</p><p className="text-[10px] text-muted-foreground">{isAr ? `ضريبة ${taxRate}%` : `Tax ${taxRate}%`}</p></CardContent></Card>
      </div>

      {/* Per-product revenue */}
      {productStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 size={16} /> {isAr ? "أداء المنتجات" : "Product Performance"}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {productStats.slice(0, 10).map((ps, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-bold text-primary w-5">{i + 1}</span>
                  <span className="truncate">{ps.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className="text-[9px]">{ps.sold} {isAr ? "مبيع" : "sold"}</Badge>
                  <span className="font-bold text-green-600">{ps.revenue.toFixed(2)} {ps.currency}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
          <SelectItem value="confirmed">{isAr ? "مكتمل" : "Confirmed"}</SelectItem>
          <SelectItem value="pending_payment">{isAr ? "معلق" : "Pending"}</SelectItem>
          <SelectItem value="cancelled">{isAr ? "ملغي" : "Cancelled"}</SelectItem>
        </SelectContent>
      </Select>

      {/* Orders List */}
      {storeOrders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground"><ShoppingBag size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">{isAr ? "لا توجد طلبات" : "No orders"}</p></div>
      ) : (
        <div className="space-y-2">
          {storeOrders.map(order => {
            const profile = profiles[order.user_id];
            return (
              <Card key={order.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{order.item_name}</h4>
                      {order.status === "confirmed" && <Badge className="bg-green-500 text-white text-[9px]"><CheckCircle2 size={9} /></Badge>}
                      {order.status === "pending_payment" && <Badge className="bg-amber-500 text-white text-[9px]"><Clock size={9} /></Badge>}
                      {order.status === "cancelled" && <Badge className="bg-red-500 text-white text-[9px]"><XCircle size={9} /></Badge>}
                    </div>
                    <div className="flex gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                      <span>{profile?.full_name || profile?.email || order.user_id.slice(0, 8)}</span>
                      <span>×{order.quantity}</span>
                      <span className="font-bold text-foreground">{order.total_price.toFixed(2)} {order.currency}</span>
                      <span>{order.payment_method === "geidea" ? "Visa/MC" : order.payment_method || "-"}</span>
                      <span>{new Date(order.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                    </div>
                    {order.notes && <p className="text-[10px] text-muted-foreground mt-1 italic">📝 {order.notes}</p>}
                  </div>
                  <Select value={order.status} onValueChange={v => updateStatus(order.id, v)}>
                    <SelectTrigger className="w-28 h-7 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending_payment">{isAr ? "معلق" : "Pending"}</SelectItem>
                      <SelectItem value="confirmed">{isAr ? "مكتمل" : "Confirmed"}</SelectItem>
                      <SelectItem value="cancelled">{isAr ? "ملغي" : "Cancelled"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
