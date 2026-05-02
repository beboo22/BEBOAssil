import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save, X, Hotel, Car, Home, Ticket, Star, MapPin, Phone, Mail, ExternalLink, Image } from "lucide-react";

interface PartnerListing {
  id: string;
  listing_type: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  city: string;
  country: string;
  price: number;
  original_price: number | null;
  currency: string;
  media_urls: string[];
  booking_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  specs: any;
  amenities: string[];
  rating: number;
  review_count: number;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  partner_name: string | null;
  partner_logo: string | null;
}

const LISTING_TYPES = [
  { value: "hotel", label: "🏨 فندق / Hotel", icon: Hotel },
  { value: "apartment", label: "🏠 شقة / Apartment", icon: Home },
  { value: "car_rental", label: "🚗 إيجار سيارة / Car Rental", icon: Car },
  { value: "activity", label: "🎫 فعالية / Activity", icon: Ticket },
  { value: "restaurant", label: "🍽️ مطعم / Restaurant", icon: Star },
  { value: "other", label: "📦 أخرى / Other", icon: Star },
];

const emptyListing: Partial<PartnerListing> = {
  listing_type: "hotel",
  title: "",
  title_ar: "",
  description: "",
  description_ar: "",
  city: "",
  country: "",
  price: 0,
  original_price: null,
  currency: "USD",
  media_urls: [],
  booking_url: "",
  contact_phone: "",
  contact_email: "",
  contact_whatsapp: "",
  specs: {},
  amenities: [],
  rating: 0,
  review_count: 0,
  address: "",
  is_active: true,
  is_featured: false,
  sort_order: 0,
  partner_name: "",
  partner_logo: "",
};

const AdminPartnerListings = () => {
  const [listings, setListings] = useState<PartnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<PartnerListing>>(emptyListing);
  const [filterType, setFilterType] = useState("all");
  const [mediaInput, setMediaInput] = useState("");
  const [amenitiesInput, setAmenitiesInput] = useState("");

  useEffect(() => { fetchListings(); }, []);

  const fetchListings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("partner_listings")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setListings(data as any);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.title || !form.city || !form.country) {
      toast.error("العنوان والمدينة والدولة مطلوبة");
      return;
    }
    const payload = {
      ...form,
      media_urls: form.media_urls || [],
      amenities: form.amenities || [],
      specs: form.specs || {},
    };

    if (editing) {
      const { error } = await supabase
        .from("partner_listings")
        .update(payload as any)
        .eq("id", editing);
      if (error) toast.error(error.message);
      else { toast.success("تم التحديث"); setEditing(null); }
    } else {
      const { error } = await supabase
        .from("partner_listings")
        .insert(payload as any);
      if (error) toast.error(error.message);
      else { toast.success("تمت الإضافة"); setAdding(false); }
    }
    setForm(emptyListing);
    fetchListings();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    await supabase.from("partner_listings").delete().eq("id", id);
    toast.success("تم الحذف");
    fetchListings();
  };

  const startEdit = (listing: PartnerListing) => {
    setEditing(listing.id);
    setAdding(false);
    setForm(listing);
    setMediaInput(listing.media_urls?.join(", ") || "");
    setAmenitiesInput(listing.amenities?.join(", ") || "");
  };

  const filtered = filterType === "all" ? listings : listings.filter(l => l.listing_type === filterType);

  const getTypeIcon = (type: string) => {
    const t = LISTING_TYPES.find(lt => lt.value === type);
    return t ? <t.icon size={14} /> : <Star size={14} />;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">🤝 عروض الشراكات / Partner Listings</h3>
        <Button size="sm" className="gap-1" onClick={() => { setAdding(true); setEditing(null); setForm(emptyListing); }}>
          <Plus size={14} /> إضافة عرض جديد
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ value: "all", label: "الكل" }, ...LISTING_TYPES].map(t => (
          <Button key={t.value} size="sm" variant={filterType === t.value ? "default" : "outline"} className="text-xs" onClick={() => setFilterType(t.value)}>
            {t.label}
          </Button>
        ))}
      </div>

      {(adding || editing) && (
        <Card className="p-4 space-y-3 border-primary/30">
          <h4 className="font-bold text-sm">{editing ? "✏️ تعديل العرض" : "➕ إضافة عرض جديد"}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">النوع</Label>
              <Select value={form.listing_type} onValueChange={v => setForm(p => ({ ...p, listing_type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LISTING_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">العنوان (EN)</Label>
              <Input className="h-8 text-xs" value={form.title || ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">العنوان (AR)</Label>
              <Input className="h-8 text-xs" dir="rtl" value={form.title_ar || ""} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">المدينة</Label>
              <Input className="h-8 text-xs" value={form.city || ""} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">الدولة</Label>
              <Input className="h-8 text-xs" value={form.country || ""} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">السعر</Label>
              <Input className="h-8 text-xs" type="number" value={form.price || 0} onChange={e => setForm(p => ({ ...p, price: +e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">السعر الأصلي (للخصم)</Label>
              <Input className="h-8 text-xs" type="number" value={form.original_price || ""} onChange={e => setForm(p => ({ ...p, original_price: e.target.value ? +e.target.value : null }))} />
            </div>
            <div>
              <Label className="text-xs">العملة</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","SAR","AED","GBP","EGP","KWD","QAR","BHD","OMR","JOD"].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">التقييم (0-5)</Label>
              <Input className="h-8 text-xs" type="number" min="0" max="5" step="0.1" value={form.rating || 0} onChange={e => setForm(p => ({ ...p, rating: +e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">عدد التقييمات</Label>
              <Input className="h-8 text-xs" type="number" value={form.review_count || 0} onChange={e => setForm(p => ({ ...p, review_count: +e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">اسم الشريك</Label>
              <Input className="h-8 text-xs" value={form.partner_name || ""} onChange={e => setForm(p => ({ ...p, partner_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">شعار الشريك (URL)</Label>
              <Input className="h-8 text-xs" value={form.partner_logo || ""} onChange={e => setForm(p => ({ ...p, partner_logo: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label className="text-xs">الوصف (EN)</Label>
            <Textarea className="text-xs min-h-[60px]" value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">الوصف (AR)</Label>
            <Textarea className="text-xs min-h-[60px]" dir="rtl" value={form.description_ar || ""} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">رابط الحجز</Label>
              <Input className="h-8 text-xs" value={form.booking_url || ""} onChange={e => setForm(p => ({ ...p, booking_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">العنوان الكامل</Label>
              <Input className="h-8 text-xs" value={form.address || ""} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">رقم التواصل</Label>
              <Input className="h-8 text-xs" value={form.contact_phone || ""} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input className="h-8 text-xs" value={form.contact_email || ""} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">واتساب</Label>
              <Input className="h-8 text-xs" value={form.contact_whatsapp || ""} onChange={e => setForm(p => ({ ...p, contact_whatsapp: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">ترتيب العرض</Label>
              <Input className="h-8 text-xs" type="number" value={form.sort_order || 0} onChange={e => setForm(p => ({ ...p, sort_order: +e.target.value }))} />
            </div>
          </div>

          <div>
            <Label className="text-xs">روابط الصور (فاصلة بين كل رابط)</Label>
            <Textarea className="text-xs min-h-[40px]" value={mediaInput} onChange={e => {
              setMediaInput(e.target.value);
              setForm(p => ({ ...p, media_urls: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }));
            }} placeholder="https://img1.jpg, https://img2.jpg" />
          </div>

          <div>
            <Label className="text-xs">المميزات / Amenities (فاصلة)</Label>
            <Input className="h-8 text-xs" value={amenitiesInput} onChange={e => {
              setAmenitiesInput(e.target.value);
              setForm(p => ({ ...p, amenities: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }));
            }} placeholder="WiFi, Pool, Gym" />
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active ?? true} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <Label className="text-xs">نشط</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_featured ?? false} onCheckedChange={v => setForm(p => ({ ...p, is_featured: v }))} />
              <Label className="text-xs">مميز</Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" className="gap-1" onClick={handleSave}><Save size={12} /> حفظ</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAdding(false); setForm(emptyListing); }}><X size={12} /> إلغاء</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">لا توجد عروض حالياً</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(listing => (
            <Card key={listing.id} className={`p-3 flex flex-col sm:flex-row items-start gap-3 ${!listing.is_active ? "opacity-50" : ""}`}>
              {listing.media_urls?.[0] && (
                <img src={listing.media_urls[0]} alt={listing.title} className="w-20 h-16 rounded object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] gap-1">{getTypeIcon(listing.listing_type)} {listing.listing_type}</Badge>
                  {listing.is_featured && <Badge className="text-[10px] bg-amber-500">⭐ مميز</Badge>}
                  {!listing.is_active && <Badge variant="destructive" className="text-[10px]">معطل</Badge>}
                </div>
                <h4 className="font-semibold text-sm mt-1 truncate">{listing.title}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <MapPin size={10} /> {listing.city}, {listing.country}
                  {listing.rating > 0 && <span className="text-amber-500">★ {listing.rating}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold text-sm text-primary">{listing.price} {listing.currency}</span>
                  {listing.original_price && listing.original_price > listing.price && (
                    <span className="text-xs line-through text-muted-foreground">{listing.original_price}</span>
                  )}
                  {listing.partner_name && <Badge variant="outline" className="text-[9px]">{listing.partner_name}</Badge>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(listing)}><Pencil size={12} /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(listing.id)}><Trash2 size={12} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPartnerListings;
