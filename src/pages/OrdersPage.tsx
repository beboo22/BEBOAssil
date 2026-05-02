import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Download, Receipt, Loader2, ShoppingBag, ExternalLink, FileText, Clock, CheckCircle2, XCircle, Link2, Paperclip } from "lucide-react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { triggerFileDownload } from "@/lib/fileDownload";

interface Order {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  status: string;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  order_type: string;
}

interface Product {
  id: string;
  name: string;
  name_ar: string | null;
  media_urls: string[];
  specs: any;
  category: string;
}

const OrdersPage = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [printingPdf, setPrintingPdf] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const inFlightPaymentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    fetchOrders();
  }, [user]);

  // Auto-verify ONLY pending Moyasar orders on mount and every 15s while any remain pending
  useEffect(() => {
    if (!user || orders.length === 0) return;
    const pendingMoyasar = orders.filter(
      (o) =>
        o.status === "pending_payment" &&
        o.payment_method === "moyasar" &&
        o.payment_reference
    );
    if (pendingMoyasar.length === 0) return;

    let cancelled = false;
    const verifyAll = async () => {
      if (cancelled) return;

      // Group by payment_reference, skipping any payment ID currently in-flight
      const groups: Record<string, string[]> = {};
      pendingMoyasar.forEach((o) => {
        const ref = o.payment_reference!;
        if (inFlightPaymentsRef.current.has(ref)) return;
        if (!groups[ref]) groups[ref] = [];
        groups[ref].push(o.id);
      });

      const paymentIds = Object.keys(groups);
      if (paymentIds.length === 0) return;

      // Mark all as in-flight before starting
      paymentIds.forEach((id) => inFlightPaymentsRef.current.add(id));
      setVerifying(true);

      try {
        let anyUpdated = false;
        for (const [paymentId, orderIds] of Object.entries(groups)) {
          try {
            const { data } = await supabase.functions.invoke("process-payment", {
              body: { action: "verify-moyasar-store", paymentId, orderIds },
            });
            if (data?.status === "paid" || data?.success) anyUpdated = true;
          } catch (err) {
            console.warn("verify-moyasar-store failed", err);
          } finally {
            inFlightPaymentsRef.current.delete(paymentId);
          }
        }
        if (anyUpdated && !cancelled) await fetchOrders();
      } finally {
        // Safety: clear any leftover in-flight markers for this batch
        paymentIds.forEach((id) => inFlightPaymentsRef.current.delete(id));
        if (!cancelled) setVerifying(false);
      }
    };

    verifyAll();
    const interval = setInterval(verifyAll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, orders]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", user!.id)
      .eq("order_type", "product")
      .order("created_at", { ascending: false });

    if (data) {
      setOrders(data as any);
      const ids = [...new Set(data.map((o: any) => o.item_id))];
      if (ids.length > 0) {
        const { data: prods } = await supabase.from("products").select("id, name, name_ar, media_urls, specs, category").in("id", ids);
        if (prods) {
          const map: Record<string, Product> = {};
          prods.forEach((p: any) => { map[p.id] = p; });
          setProducts(map);
        }
      }
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-500 text-white text-[10px] gap-1"><CheckCircle2 size={10} /> {isAr ? "مكتمل" : "Completed"}</Badge>;
      case "pending_payment":
        return <Badge className="bg-amber-500 text-white text-[10px] gap-1"><Clock size={10} /> {isAr ? "بانتظار الدفع" : "Pending"}</Badge>;
      case "cancelled":
        return <Badge className="bg-red-500 text-white text-[10px] gap-1"><XCircle size={10} /> {isAr ? "ملغي" : "Cancelled"}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  // Collect all attachments for a product (download_url + digital_files + external_links)
  const getProductAttachments = (product: Product | undefined) => {
    if (!product?.specs) return [] as Array<{ url: string; label: string; type: "file" | "link" }>;
    const list: Array<{ url: string; label: string; type: "file" | "link" }> = [];
    if (product.specs.download_url) {
      list.push({ url: product.specs.download_url, label: isAr ? "تحميل المنتج" : "Download Product", type: "file" });
    }
    if (Array.isArray(product.specs.digital_files)) {
      product.specs.digital_files.forEach((df: any, idx: number) => {
        if (df?.url) list.push({ url: df.url, label: df.label || `${isAr ? "ملف" : "File"} ${idx + 1}`, type: "file" });
      });
    }
    if (Array.isArray(product.specs.external_links)) {
      product.specs.external_links.forEach((lnk: any, idx: number) => {
        if (lnk?.url) list.push({ url: lnk.url, label: lnk.label || `${isAr ? "رابط" : "Link"} ${idx + 1}`, type: "link" });
      });
    }
    return list;
  };

  const handlePrintInvoice = async () => {
    setPrintingPdf(true);
    try {
      const el = document.getElementById("order-invoice-content");
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save(`invoice-${invoiceOrder?.id?.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error("PDF error:", err);
    }
    setPrintingPdf(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen pt-24 text-center px-4">
        <ShoppingBag size={48} className="mx-auto mb-4 text-muted-foreground/30" />
        <p className="text-muted-foreground mb-4">{isAr ? "يجب تسجيل الدخول لعرض طلباتك" : "Please sign in to view your orders"}</p>
        <Button onClick={() => navigate("/auth")}>{isAr ? "تسجيل الدخول" : "Sign In"}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-10 px-4" dir={isAr ? "rtl" : "ltr"}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Package size={22} className="text-primary" />
            {isAr ? "مشترياتي" : "My Purchases"}
            {verifying && (
              <span className="text-[10px] text-muted-foreground font-normal flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                {isAr ? "جاري التحقق..." : "Verifying..."}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/store")}>
              <ShoppingBag size={14} /> {isAr ? "العودة للمتجر" : "Back to Store"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/invoices")}>
              <Receipt size={14} /> {isAr ? "فواتيري" : "My Invoices"}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag size={48} className="mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">{isAr ? "لا توجد طلبات بعد" : "No orders yet"}</p>
            <Button onClick={() => navigate("/store")} className="gap-2">
              <ShoppingBag size={14} /> {isAr ? "تصفح المتجر" : "Browse Store"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map(order => {
              const product = products[order.item_id];
              const attachments = order.status === "confirmed" ? getProductAttachments(product) : [];
              return (
                <Card
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/store/product/${order.item_id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/store/product/${order.item_id}`);
                    }
                  }}
                  aria-label={isAr ? "عرض تفاصيل المنتج" : "View product details"}
                  className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Top: product header (image + info) — entire card opens product details */}
                  <div className="w-full text-start p-4 flex gap-3 hover:bg-muted/40 transition-colors">
                    {product?.media_urls?.[0] ? (
                      <img src={product.media_urls[0]} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-border" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Package size={22} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm line-clamp-1 hover:text-primary transition-colors">
                            {isAr ? (product?.name_ar || order.item_name) : order.item_name}
                          </h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(order.created_at).toLocaleDateString(isAr ? "ar-u-nu-latn" : "en-US", { year: "numeric", month: "short", day: "numeric" })}
                          </p>
                        </div>
                        {getStatusBadge(order.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                        <span className="text-muted-foreground">{isAr ? "الكمية" : "Qty"}: {order.quantity}</span>
                        <span className="font-bold text-primary">{order.total_price.toFixed(2)} {order.currency}</span>
                        {order.payment_method && (
                          <span className="text-muted-foreground capitalize">{order.payment_method}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Attachments / Links section per product */}
                  {attachments.length > 0 && (
                    <div className="border-t border-border bg-muted/30 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Paperclip size={11} />
                        {isAr ? "ملفات ومرفقات المنتج" : "Product Files & Attachments"}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {attachments.map((att, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); att.type === "file" ? triggerFileDownload(att.url, att.label) : window.open(att.url, "_blank", "noopener,noreferrer"); }}
                            className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border hover:border-primary hover:bg-primary/5 transition-colors text-xs group text-start"
                          >
                            <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${att.type === "file" ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                              {att.type === "file" ? <Download size={13} /> : <Link2 size={13} />}
                            </span>
                            <span className="flex-1 truncate font-medium">{att.label}</span>
                            <ExternalLink size={11} className="text-muted-foreground group-hover:text-primary flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer actions */}
                  <div className="border-t border-border px-4 py-2.5 flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="gap-1 text-xs h-8" onClick={(e) => { e.stopPropagation(); setInvoiceOrder(order); }}>
                      <Receipt size={12} /> {isAr ? "عرض الفاتورة" : "View Invoice"}
                    </Button>
                    {order.status === "confirmed" && attachments.length === 0 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        {isAr ? "لا توجد مرفقات لهذا المنتج" : "No attachments for this product"}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice Dialog */}
      <Dialog open={!!invoiceOrder} onOpenChange={open => !open && setInvoiceOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt size={18} /> {isAr ? "الفاتورة" : "Invoice"}</DialogTitle>
          </DialogHeader>
          {invoiceOrder && (
            <div>
              <div id="order-invoice-content" className="bg-white text-black p-6 space-y-4 text-sm" style={{ direction: "ltr" }}>
                <div className="text-center border-b border-gray-200 pb-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <img src={window.location.origin + "/logo.png"} alt="ASEEL AI TRIP" className="w-10 h-10" crossOrigin="anonymous" style={{ display: 'inline-block' }} />
                    <h3 className="font-bold text-xl text-gray-900">ASEEL AI TRIP</h3>
                  </div>
                  <p className="text-xs text-gray-500">support@aseelaitrip.com</p>
                </div>

                <div className="flex justify-between text-xs text-gray-600">
                  <div>Invoice #: <strong className="text-gray-900">INV-{invoiceOrder.id.slice(0, 8).toUpperCase()}</strong></div>
                  <div>Date: <strong className="text-gray-900">{new Date(invoiceOrder.created_at).toLocaleDateString("en-US")}</strong></div>
                </div>
                <div className="text-xs text-gray-600">Email: <strong className="text-gray-900">{user?.email}</strong></div>

                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-2 font-medium text-gray-500">Item</th>
                      <th className="text-center py-2 font-medium text-gray-500">Qty</th>
                      <th className="text-right py-2 font-medium text-gray-500">Price</th>
                      <th className="text-right py-2 font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-2 text-gray-900">{invoiceOrder.item_name}</td>
                      <td className="text-center py-2 text-gray-900">{invoiceOrder.quantity}</td>
                      <td className="text-right py-2 text-gray-900">{invoiceOrder.unit_price.toFixed(2)}</td>
                      <td className="text-right py-2 font-medium text-gray-900">{invoiceOrder.total_price.toFixed(2)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={3} className="py-2 font-bold text-right text-gray-900">Total</td>
                      <td className="py-2 font-bold text-right text-emerald-600">{invoiceOrder.total_price.toFixed(2)} {invoiceOrder.currency}</td>
                    </tr>
                  </tfoot>
                </table>

                <div className="text-center text-xs text-gray-500 pt-2 border-t border-gray-200">
                  <p>Paid via: {invoiceOrder.payment_method || "—"}</p>
                  <p className="mt-1">Thank you for your purchase! 🎉</p>
                </div>
              </div>

              <Button className="w-full mt-4 gap-2" onClick={handlePrintInvoice} disabled={printingPdf}>
                {printingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {isAr ? "تحميل PDF" : "Download PDF"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
