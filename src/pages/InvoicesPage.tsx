import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Receipt, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoice_number: string;
  plan_name: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  billing_name: string | null;
  billing_email: string | null;
  issued_at: string;
}

const InvoicesPage = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const isAr = lang.startsWith('ar');
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Localized labels per language (covers all 8 supported languages)
  const L = (() => {
    const dict: Record<string, Record<string, string>> = {
      en: { title: 'My Invoices', empty: 'No invoices yet', invoice: 'Invoice', date: 'Date', plan: 'Plan', amount: 'Amount', status: 'Status', actions: 'Actions', download: 'Download PDF', paid: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded', cancelled: 'Cancelled' },
      ar: { title: 'فواتيري', empty: 'لا توجد فواتير بعد', invoice: 'الفاتورة', date: 'التاريخ', plan: 'الباقة', amount: 'المبلغ', status: 'الحالة', actions: 'الإجراءات', download: 'تحميل PDF', paid: 'مدفوعة', pending: 'قيد الانتظار', failed: 'فشلت', refunded: 'مستردة', cancelled: 'ملغاة' },
      fr: { title: 'Mes factures', empty: 'Aucune facture pour le moment', invoice: 'Facture', date: 'Date', plan: 'Forfait', amount: 'Montant', status: 'Statut', actions: 'Actions', download: 'Télécharger PDF', paid: 'Payée', pending: 'En attente', failed: 'Échouée', refunded: 'Remboursée', cancelled: 'Annulée' },
      es: { title: 'Mis facturas', empty: 'Aún no hay facturas', invoice: 'Factura', date: 'Fecha', plan: 'Plan', amount: 'Monto', status: 'Estado', actions: 'Acciones', download: 'Descargar PDF', paid: 'Pagada', pending: 'Pendiente', failed: 'Fallida', refunded: 'Reembolsada', cancelled: 'Cancelada' },
      de: { title: 'Meine Rechnungen', empty: 'Noch keine Rechnungen', invoice: 'Rechnung', date: 'Datum', plan: 'Tarif', amount: 'Betrag', status: 'Status', actions: 'Aktionen', download: 'PDF herunterladen', paid: 'Bezahlt', pending: 'Ausstehend', failed: 'Fehlgeschlagen', refunded: 'Erstattet', cancelled: 'Storniert' },
      tr: { title: 'Faturalarım', empty: 'Henüz fatura yok', invoice: 'Fatura', date: 'Tarih', plan: 'Plan', amount: 'Tutar', status: 'Durum', actions: 'İşlemler', download: 'PDF indir', paid: 'Ödendi', pending: 'Beklemede', failed: 'Başarısız', refunded: 'İade edildi', cancelled: 'İptal' },
      ru: { title: 'Мои счета', empty: 'Счетов пока нет', invoice: 'Счёт', date: 'Дата', plan: 'Тариф', amount: 'Сумма', status: 'Статус', actions: 'Действия', download: 'Скачать PDF', paid: 'Оплачено', pending: 'Ожидание', failed: 'Ошибка', refunded: 'Возврат', cancelled: 'Отменено' },
      zh: { title: '我的发票', empty: '暂无发票', invoice: '发票', date: '日期', plan: '套餐', amount: '金额', status: '状态', actions: '操作', download: '下载 PDF', paid: '已支付', pending: '待处理', failed: '失败', refunded: '已退款', cancelled: '已取消' },
    };
    const code = lang.split('-')[0];
    return dict[code] || dict.en;
  })();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('invoices' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false });
      if (!error && data) setInvoices(data as any);
      setLoading(false);
    })();
  }, [user, authLoading, navigate]);

  const getStatusInfo = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'paid':
      case 'confirmed':
      case 'completed':
        return { label: L.paid, icon: CheckCircle2, className: 'bg-green-500 hover:bg-green-600 text-white' };
      case 'pending':
      case 'pending_payment':
      case 'processing':
        return { label: L.pending, icon: Clock, className: 'bg-amber-500 hover:bg-amber-600 text-white' };
      case 'failed':
      case 'declined':
        return { label: L.failed, icon: XCircle, className: 'bg-red-500 hover:bg-red-600 text-white' };
      case 'refunded':
        return { label: L.refunded, icon: AlertCircle, className: 'bg-blue-500 hover:bg-blue-600 text-white' };
      case 'cancelled':
      case 'canceled':
        return { label: L.cancelled, icon: XCircle, className: 'bg-gray-500 hover:bg-gray-600 text-white' };
      default:
        return { label: status, icon: AlertCircle, className: 'bg-muted text-muted-foreground' };
    }
  };

  const downloadPDF = async (inv: Invoice) => {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.text('INVOICE', 105, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.text('Aseel AI Trip', 105, 28, { align: 'center' });
      doc.text('support@aseelaitrip.com', 105, 34, { align: 'center' });
      doc.line(20, 40, 190, 40);

      doc.setFontSize(12);
      doc.text(`Invoice #: ${inv.invoice_number}`, 20, 52);
      doc.text(`Date: ${new Date(inv.issued_at).toLocaleDateString('en-US')}`, 20, 60);
      doc.text(`Status: ${inv.status.toUpperCase()}`, 20, 68);

      doc.text(`Bill to:`, 20, 84);
      doc.text(`${inv.billing_name || user?.email || '-'}`, 20, 92);
      doc.text(`${inv.billing_email || user?.email || '-'}`, 20, 100);

      doc.line(20, 110, 190, 110);
      doc.text('Description', 20, 120);
      doc.text('Amount', 160, 120);
      doc.line(20, 124, 190, 124);

      doc.text(`${inv.plan_name || 'Subscription'} plan`, 20, 134);
      doc.text(`${inv.amount.toFixed(2)} ${inv.currency}`, 160, 134);

      doc.text('Tax (VAT)', 20, 144);
      doc.text(`${inv.tax_amount.toFixed(2)} ${inv.currency}`, 160, 144);

      doc.line(20, 150, 190, 150);
      doc.setFontSize(14);
      doc.text('TOTAL', 20, 160);
      doc.text(`${inv.total_amount.toFixed(2)} ${inv.currency}`, 160, 160);

      doc.setFontSize(9);
      doc.text('Thank you for your purchase!', 105, 280, { align: 'center' });

      doc.save(`${inv.invoice_number}.pdf`);
    } catch (e) {
      console.error(e);
      toast.error(isAr ? 'فشل تحميل الفاتورة' : 'Failed to download invoice');
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12 bg-background" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Receipt className="text-primary" size={28} />
          <h1 className="text-2xl md:text-3xl font-extrabold gradient-text">{L.title}</h1>
        </div>

        {invoices.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="mx-auto mb-3 text-muted-foreground" size={40} />
            <p className="text-muted-foreground">{L.empty}</p>
          </Card>
        ) : (
          <>
            {/* Desktop table view */}
            <Card className="hidden md:block overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50 border-b border-border">
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 text-start font-semibold">{L.invoice}</th>
                    <th className="px-4 py-3 text-start font-semibold">{L.date}</th>
                    <th className="px-4 py-3 text-start font-semibold">{L.plan}</th>
                    <th className="px-4 py-3 text-end font-semibold">{L.amount}</th>
                    <th className="px-4 py-3 text-center font-semibold">{L.status}</th>
                    <th className="px-4 py-3 text-end font-semibold">{L.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const s = getStatusInfo(inv.status);
                    const Icon = s.icon;
                    return (
                      <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm font-semibold">{inv.invoice_number}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(inv.issued_at).toLocaleDateString(isAr ? 'ar-u-nu-latn' : lang, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm">{inv.plan_name || '—'}</td>
                        <td className="px-4 py-3 text-sm font-bold text-end">{inv.total_amount.toFixed(2)} {inv.currency}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge className={`${s.className} gap-1 text-[11px]`}>
                            <Icon size={11} /> {s.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <Button size="sm" variant="outline" onClick={() => downloadPDF(inv)} className="gap-1">
                            <Download size={13} /> PDF
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {invoices.map((inv) => {
                const s = getStatusInfo(inv.status);
                const Icon = s.icon;
                return (
                  <Card key={inv.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-[180px]">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="font-bold font-mono text-sm">{inv.invoice_number}</span>
                          <Badge className={`${s.className} gap-1 text-[10px]`}>
                            <Icon size={10} /> {s.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {inv.plan_name || '—'} • {new Date(inv.issued_at).toLocaleDateString(isAr ? 'ar-u-nu-latn' : lang)}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="font-bold text-base">{inv.total_amount.toFixed(2)} {inv.currency}</p>
                        <Button size="sm" variant="outline" onClick={() => downloadPDF(inv)} className="mt-1.5 h-7 text-xs">
                          <Download size={12} className="me-1" />
                          {L.download}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InvoicesPage;
