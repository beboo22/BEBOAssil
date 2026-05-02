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
import { Plus, Pencil, Trash2, Save, X, Package, Upload, Loader2, Link2, FileDown, FileText } from "lucide-react";

interface Product {
  id: string; name: string; name_ar: string | null; description: string; description_ar: string | null;
  category: string; price: number; original_price: number | null; currency: string; media_urls: string[];
  stock_quantity: number; is_active: boolean; is_featured: boolean; sort_order: number; specs: any; tags: string[];
}

const CATEGORIES = ["general", "templates", "digital_stickers", "stickers", "guides", "digital", "accessories", "clothing", "souvenirs", "books", "gift_cards"];

const emptyProduct: Partial<Product> = {
  name: "", name_ar: "", description: "", description_ar: "",
  category: "general", price: 0, original_price: null, currency: "USD",
  media_urls: [], stock_quantity: 0, is_active: true, is_featured: false,
  sort_order: 0, specs: {}, tags: [],
};

const AdminProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<Product>>(emptyProduct);
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("sort_order", { ascending: true });
    if (data) setProducts(data as any);
    setLoading(false);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingMedia(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const fileName = `product-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("story-media").upload(`products/${fileName}`, file, { upsert: true });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`products/${fileName}`);
        newUrls.push(urlData.publicUrl);
      }
      setForm(f => ({ ...f, media_urls: [...(f.media_urls || []), ...newUrls] }));
      toast.success(`${newUrls.length} file(s) uploaded`);
    } catch (err: any) { toast.error(err.message || "Upload failed"); }
    finally { setUploadingMedia(false); }
  };

  const handleProductFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `download-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("story-media").upload(`products/downloads/${fileName}`, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`products/downloads/${fileName}`);
      setForm(f => ({
        ...f,
        specs: { ...(f.specs || {}), download_url: urlData.publicUrl, file_format: (ext || '').toUpperCase(), file_type: file.name }
      }));
      toast.success("✅ Product file uploaded");
    } catch (err: any) { toast.error(err.message || "Upload failed"); }
    finally { setUploadingFile(false); }
  };

  const addMediaUrl = () => {
    if (!mediaUrlInput.trim()) return;
    setForm(f => ({ ...f, media_urls: [...(f.media_urls || []), mediaUrlInput.trim()] }));
    setMediaUrlInput("");
  };

  const removeMedia = (idx: number) => setForm(f => ({ ...f, media_urls: (f.media_urls || []).filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    if (!form.name) { toast.error("اسم المنتج مطلوب / Product name required"); return; }
    const payload = { ...form, media_urls: form.media_urls || [], tags: form.tags || [], specs: form.specs || {} };

    if (editing) {
      const { error } = await supabase.from("products").update(payload as any).eq("id", editing);
      if (error) toast.error(error.message);
      else { toast.success("تم التحديث ✅"); setEditing(null); }
    } else {
      const { error } = await supabase.from("products").insert(payload as any);
      if (error) toast.error(error.message);
      else { toast.success("تمت الإضافة ✅"); setAdding(false); }
    }
    setForm(emptyProduct);
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("حذف المنتج؟ / Delete product?")) return;
    await supabase.from("products").delete().eq("id", id);
    toast.success("تم الحذف");
    fetchProducts();
  };

  const startEdit = (p: Product) => {
    setEditing(p.id); setAdding(false); setForm(p);
    setMediaUrlInput("");
    setTagsInput(p.tags?.join(", ") || "");
  };

  const downloadUrl = form.specs?.download_url || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">🛍️ المنتجات / Products ({products.length})</h3>
        <Button size="sm" className="gap-1" onClick={() => { setAdding(true); setEditing(null); setForm(emptyProduct); setTagsInput(""); setMediaUrlInput(""); }}>
          <Plus size={14} /> إضافة منتج
        </Button>
      </div>

      {(adding || editing) && (
        <Card className="p-4 space-y-3 border-primary/30">
          <h4 className="font-bold text-sm">{editing ? "✏️ تعديل" : "➕ إضافة منتج"}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label className="text-xs">الاسم (EN) *</Label><Input className="h-8 text-xs" value={form.name || ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label className="text-xs">الاسم (AR)</Label><Input className="h-8 text-xs" dir="rtl" value={form.name_ar || ""} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">الفئة / Category</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">السعر / Price</Label><Input className="h-8 text-xs" type="number" value={form.price || 0} onChange={e => setForm(p => ({ ...p, price: +e.target.value }))} /></div>
            <div><Label className="text-xs">السعر الأصلي</Label><Input className="h-8 text-xs" type="number" value={form.original_price || ""} onChange={e => setForm(p => ({ ...p, original_price: e.target.value ? +e.target.value : null }))} /></div>
            <div>
              <Label className="text-xs">العملة</Label>
              <Select value={form.currency} onValueChange={v => setForm(p => ({ ...p, currency: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["USD","EUR","SAR","AED","QAR","KWD","BHD","OMR","GBP","EGP","JOD","TRY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">الكمية المتوفرة</Label><Input className="h-8 text-xs" type="number" value={form.stock_quantity || 0} onChange={e => setForm(p => ({ ...p, stock_quantity: +e.target.value }))} /></div>
            <div><Label className="text-xs">ترتيب العرض</Label><Input className="h-8 text-xs" type="number" value={form.sort_order || 0} onChange={e => setForm(p => ({ ...p, sort_order: +e.target.value }))} /></div>
          </div>
          <div><Label className="text-xs">الوصف (EN)</Label><Textarea className="text-xs min-h-[50px]" value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div><Label className="text-xs">الوصف (AR)</Label><Textarea className="text-xs min-h-[50px]" dir="rtl" value={form.description_ar || ""} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} /></div>

          {/* Media with upload */}
          <div>
            <Label className="text-xs font-semibold">الصور / Product Images</Label>
            <div className="flex gap-2 mb-2">
              <Input className="h-8 text-xs flex-1" value={mediaUrlInput} onChange={e => setMediaUrlInput(e.target.value)} placeholder="Paste URL..." onKeyDown={e => e.key === 'Enter' && addMediaUrl()} />
              <Button size="sm" variant="outline" className="h-8" onClick={addMediaUrl}><Link2 size={12} /></Button>
              <label className="cursor-pointer">
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                <Button type="button" size="sm" variant="outline" className="h-8" asChild disabled={uploadingMedia}>
                  <span>{uploadingMedia ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}</span>
                </Button>
              </label>
            </div>
            {(form.media_urls || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(form.media_urls || []).map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} className="w-20 h-14 rounded-lg object-cover" alt="" onError={e => (e.currentTarget.src = '/placeholder.svg')} />
                    <button onClick={() => removeMedia(i)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Downloadable Product File */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2 border border-dashed border-primary/30">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <FileDown size={14} className="text-primary" />
              ملف المنتج الرقمي / Downloadable Product File
            </Label>
            <p className="text-[10px] text-muted-foreground">الملف الذي سيتم تسليمه للمشتري بعد الشراء / File delivered to buyer after purchase</p>
            
            {downloadUrl ? (
              <div className="flex items-center gap-2 bg-card rounded-md p-2 border">
                <FileText size={16} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{form.specs?.file_type || "Product File"}</p>
                  <p className="text-[10px] text-muted-foreground">{form.specs?.file_format || "FILE"}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => window.open(downloadUrl, '_blank')}>Preview</Button>
                <Button size="sm" variant="ghost" className="h-6 text-destructive text-[10px]" onClick={() => setForm(f => ({ ...f, specs: { ...(f.specs || {}), download_url: null, file_type: null, file_format: null } }))}>
                  <X size={10} />
                </Button>
              </div>
            ) : null}
            
            <div className="flex gap-2">
              <label className="cursor-pointer flex-1">
                <input type="file" accept=".pdf,.zip,.rar,.7z,.xlsx,.xls,.docx,.pptx,.png,.jpg,.jpeg,.svg,.txt,.csv" className="hidden" onChange={handleProductFileUpload} />
                <Button type="button" size="sm" variant="outline" className="w-full h-8 gap-1.5 text-xs" asChild disabled={uploadingFile}>
                  <span>{uploadingFile ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</> : <><Upload className="w-3 h-3" /> Upload Product File</>}</span>
                </Button>
              </label>
              <Input className="h-8 text-xs flex-1" placeholder="Or paste file URL..." value={form.specs?.download_url && !downloadUrl ? "" : ""} 
                onChange={e => {
                  if (e.target.value.trim()) {
                    setForm(f => ({ ...f, specs: { ...(f.specs || {}), download_url: e.target.value.trim() } }));
                  }
                }} />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">File Type Label</Label>
                <Input className="h-7 text-[10px]" value={form.specs?.file_type || ""} onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), file_type: e.target.value } }))} placeholder="e.g. PDF Template" />
              </div>
              <div>
                <Label className="text-[10px]">File Format</Label>
                <Select value={form.specs?.file_format || ""} onValueChange={v => setForm(f => ({ ...f, specs: { ...(f.specs || {}), file_format: v } }))}>
                  <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Format..." /></SelectTrigger>
                  <SelectContent>{["PDF","ZIP","RAR","7Z","XLSX","DOCX","PPTX","PNG","JPG","SVG","CSV","TXT"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Additional Digital Files */}
            <div className="border-t border-border/50 pt-2 mt-2">
              <Label className="text-[10px] font-semibold">📎 ملفات إضافية / Additional Digital Files</Label>
              <p className="text-[9px] text-muted-foreground mb-1">أضف روابط أو ملفات إضافية يحصل عليها المشتري / Extra links or files the buyer receives</p>
              {(form.specs?.digital_files || []).map((df: any, i: number) => (
                <div key={i} className="flex items-center gap-1 mb-1">
                  <Input className="h-6 text-[10px] flex-1" value={df.label} placeholder="Label" onChange={e => {
                    const files = [...(form.specs?.digital_files || [])];
                    files[i] = { ...files[i], label: e.target.value };
                    setForm(f => ({ ...f, specs: { ...(f.specs || {}), digital_files: files } }));
                  }} />
                  <Input className="h-6 text-[10px] flex-1" value={df.url} placeholder="URL" readOnly />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => {
                    const files = (form.specs?.digital_files || []).filter((_: any, idx: number) => idx !== i);
                    setForm(f => ({ ...f, specs: { ...(f.specs || {}), digital_files: files } }));
                  }}><X size={10} /></Button>
                </div>
              ))}
              <div className="flex gap-1">
                <label className="cursor-pointer flex-1">
                  <input type="file" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const ext = file.name.split(".").pop();
                      const fileName = `extra-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                      const { error } = await supabase.storage.from("story-media").upload(`products/downloads/${fileName}`, file, { upsert: true });
                      if (error) throw error;
                      const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`products/downloads/${fileName}`);
                      const files = [...(form.specs?.digital_files || []), { label: file.name, url: urlData.publicUrl }];
                      setForm(f => ({ ...f, specs: { ...(f.specs || {}), digital_files: files } }));
                      toast.success("File added");
                    } catch (err: any) { toast.error(err.message); }
                  }} />
                  <Button type="button" size="sm" variant="outline" className="w-full h-7 text-[10px] gap-1" asChild>
                    <span><Upload className="w-3 h-3" /> Upload Extra File</span>
                  </Button>
                </label>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => {
                  const url = prompt("Paste URL:");
                  if (url) {
                    const label = prompt("Label:") || "Download Link";
                    const files = [...(form.specs?.digital_files || []), { label, url }];
                    setForm(f => ({ ...f, specs: { ...(f.specs || {}), digital_files: files } }));
                  }
                }}><Link2 size={10} /> URL</Button>
              </div>
            </div>
          </div>

          {/* Usage Instructions */}
          <div>
            <Label className="text-xs font-semibold">📋 تعليمات الاستخدام / Usage Instructions</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="How to use this product..." value={form.specs?.usage_instructions || ""} onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), usage_instructions: e.target.value } }))} />
          </div>

          {/* Post-Purchase Message - Shown after successful payment */}
          <div className="rounded-lg border-2 border-blue-500/40 bg-blue-500/5 p-3 space-y-2">
            <Label className="text-xs font-bold text-blue-700 dark:text-blue-300 block">
              ✨ رسالة بعد الشراء / Post-Purchase Message
            </Label>
            <p className="text-[10px] text-muted-foreground">
              تظهر للمشتري فور إتمام الدفع (تعليمات، رمز تفعيل، رابط واتساب، إلخ). يدعم HTML بسيط.
              <br />Shown to buyer immediately after payment (instructions, activation code, WhatsApp link, etc.). Supports basic HTML.
            </p>
            <Textarea className="text-xs min-h-[100px] bg-background"
              placeholder="مثال: شكرًا لشرائك! للتفعيل اتصل على... / Example: Thank you! To activate, contact..."
              value={form.specs?.post_purchase_message || ""}
              onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), post_purchase_message: e.target.value } }))} />

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold">🔗 روابط/أزرار بعد الشراء / Post-Purchase Links</Label>
              {(form.specs?.post_purchase_links || []).map((lnk: any, i: number) => (
                <div key={i} className="flex gap-1 items-center">
                  <Input className="h-7 text-[10px] flex-1" placeholder="Label (e.g. Join WhatsApp Group)" value={lnk.label || ""}
                    onChange={e => {
                      const arr = [...(form.specs?.post_purchase_links || [])];
                      arr[i] = { ...arr[i], label: e.target.value };
                      setForm(f => ({ ...f, specs: { ...(f.specs || {}), post_purchase_links: arr } }));
                    }} />
                  <Input className="h-7 text-[10px] flex-1" placeholder="https://..." value={lnk.url || ""}
                    onChange={e => {
                      const arr = [...(form.specs?.post_purchase_links || [])];
                      arr[i] = { ...arr[i], url: e.target.value };
                      setForm(f => ({ ...f, specs: { ...(f.specs || {}), post_purchase_links: arr } }));
                    }} />
                  <Button size="sm" variant="ghost" className="h-7 text-destructive text-[10px] px-2"
                    onClick={() => {
                      const arr = (form.specs?.post_purchase_links || []).filter((_: any, idx: number) => idx !== i);
                      setForm(f => ({ ...f, specs: { ...(f.specs || {}), post_purchase_links: arr } }));
                    }}>×</Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-[10px] w-full"
                onClick={() => {
                  const arr = [...(form.specs?.post_purchase_links || []), { label: "", url: "" }];
                  setForm(f => ({ ...f, specs: { ...(f.specs || {}), post_purchase_links: arr } }));
                }}>+ إضافة رابط / Add link</Button>
            </div>
          </div>

          {/* Terms & Conditions */}
          <div>
            <Label className="text-xs font-semibold">📜 الشروط والأحكام / Terms & Conditions</Label>
            <Textarea className="text-xs min-h-[60px]" placeholder="Product terms, refund policy..." value={form.specs?.terms || ""} onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), terms: e.target.value } }))} />
          </div>

          {/* Allow Notes */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="allow_notes" checked={!!form.specs?.allow_notes} onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), allow_notes: e.target.checked } }))} />
            <Label htmlFor="allow_notes" className="text-xs font-semibold cursor-pointer">📝 السماح بالملاحظات / Allow Customer Notes</Label>
          </div>

          {/* Allow Guest Checkout (no login required) */}
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <input type="checkbox" id="allow_guest_checkout" className="mt-0.5"
              checked={!!form.specs?.allow_guest_checkout}
              onChange={e => setForm(f => ({ ...f, specs: { ...(f.specs || {}), allow_guest_checkout: e.target.checked } }))} />
            <div className="flex-1">
              <Label htmlFor="allow_guest_checkout" className="text-xs font-semibold cursor-pointer block">
                🛒 السماح بالشراء بدون تسجيل دخول / Allow Guest Checkout
              </Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                عند التفعيل: يستطيع أي زائر شراء هذا المنتج ويحصل على رابط التحميل فور تأكيد الدفع. / When enabled, any visitor can buy this product and receive the download link immediately after payment.
              </p>
            </div>
          </div>

          <div>
            <Label className="text-xs">الوسوم / Tags (comma separated)</Label>
            <Input className="h-8 text-xs" value={tagsInput} onChange={e => {
              setTagsInput(e.target.value);
              setForm(p => ({ ...p, tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }));
            }} />
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2"><Switch checked={form.is_active ?? true} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} /><Label className="text-xs">نشط / Active</Label></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_featured ?? false} onCheckedChange={v => setForm(p => ({ ...p, is_featured: v }))} /><Label className="text-xs">مميز / Featured</Label></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="gap-1" onClick={handleSave}><Save size={12} /> حفظ / Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setAdding(false); }}><X size={12} /> إلغاء</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
      ) : products.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-8">لا توجد منتجات</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {products.map(p => (
            <Card key={p.id} className={`p-3 ${!p.is_active ? "opacity-50" : ""}`}>
              <div className="flex gap-3">
                {p.media_urls?.[0] ? (
                  <img src={p.media_urls[0]} alt={p.name} className="w-16 h-16 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0"><Package size={20} className="text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px]">{p.category}</Badge>
                    {p.is_featured && <Badge className="text-[9px] bg-amber-500">⭐</Badge>}
                    {p.specs?.download_url && <Badge variant="outline" className="text-[9px] border-green-400 text-green-600"><FileDown size={8} className="mr-0.5" />{p.specs?.file_format || "FILE"}</Badge>}
                    <span className="text-[10px] text-muted-foreground">Stock: {p.stock_quantity}</span>
                  </div>
                  <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                  {p.name_ar && <p className="text-xs text-muted-foreground truncate" dir="rtl">{p.name_ar}</p>}
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-primary">{p.price} {p.currency}</span>
                    {p.original_price && p.original_price > p.price && (
                      <span className="text-xs line-through text-muted-foreground">{p.original_price}</span>
                    )}
                  </div>
                  {p.tags?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-1">
                      {p.tags.slice(0, 3).map(t => <Badge key={t} variant="outline" className="text-[8px]">#{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(p)}><Pencil size={12} /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 size={12} /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
