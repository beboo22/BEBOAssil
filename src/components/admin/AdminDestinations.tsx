import { useState, useEffect } from "react";
import { MapPin, Plus, Trash2, Save, Loader2, Pencil, X, Copy, Upload, Sparkles, Star, Image, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Destination {
  id: string;
  city: string;
  country: string;
  code: string;
  image: string;
  description: string;
  description_ar: string | null;
  rating: number;
  avg_price: number;
  best_season: string;
  highlights: string[];
  is_active: boolean;
  sort_order: number;
}

const SEASONS = ["Winter", "Spring", "Summer", "Autumn", "Year-round"];

const DEST_TEMPLATES: Partial<Destination>[] = [
  { city: "Paris", country: "France", code: "CDG", description: "City of Lights — Eiffel Tower, Louvre Museum", description_ar: "مدينة الأنوار — برج إيفل ومتحف اللوفر", rating: 4.8, best_season: "Spring", highlights: ["Eiffel Tower", "Louvre Museum", "Seine River"], image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800" },
  { city: "Dubai", country: "UAE", code: "DXB", description: "City of luxury — Burj Khalifa, desert safaris", description_ar: "مدينة الفخامة — برج خليفة وسفاري الصحراء", rating: 4.7, best_season: "Winter", highlights: ["Burj Khalifa", "Desert Safari", "Dubai Mall"], image: "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800" },
  { city: "Mecca", country: "Saudi Arabia", code: "JED", description: "The holiest city in Islam — Masjid al-Haram, Kaaba", description_ar: "أقدس مدينة في الإسلام — المسجد الحرام والكعبة", rating: 4.9, best_season: "Winter", highlights: ["Masjid al-Haram", "Kaaba", "Mount Arafat"], image: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=800" },
];

const AdminDestinations = () => {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<Destination>>({});
  const [highlightsText, setHighlightsText] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [aiDialog, setAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => { fetchDestinations(); }, []);

  const fetchDestinations = async () => {
    setLoading(true);
    const { data } = await supabase.from("destinations").select("*").order("sort_order");
    if (data) setDestinations(data.map((d: any) => ({ ...d, highlights: Array.isArray(d.highlights) ? d.highlights : [] })));
    setLoading(false);
  };

  const startAdd = () => {
    setForm({ is_active: true, rating: 4.5, avg_price: 100, best_season: "Winter", sort_order: destinations.length, code: "" });
    setHighlightsText("");
    setAdding(true);
    setEditing(null);
  };

  const startFromTemplate = (tmpl: Partial<Destination>) => {
    setForm({ ...tmpl, is_active: true, sort_order: destinations.length, avg_price: 100 });
    setHighlightsText((tmpl.highlights || []).join(", "));
    setAdding(true);
    setEditing(null);
    toast.success("Template loaded - customize and save");
  };

  const startEdit = (d: Destination) => {
    setForm({ ...d });
    setHighlightsText(d.highlights.join(", "));
    setEditing(d.id);
    setAdding(false);
  };

  const duplicateDest = (d: Destination) => {
    const { id, ...rest } = d;
    setForm({ ...rest, city: `${rest.city} (Copy)` });
    setHighlightsText(d.highlights.join(", "));
    setAdding(true);
    setEditing(null);
  };

  const saveDest = async () => {
    if (!form.city || !form.image) { toast.error("City and image are required"); return; }
    const highlights = highlightsText.split(",").map(s => s.trim()).filter(Boolean);
    const payload = {
      city: form.city, country: form.country || "", code: form.code || "",
      image: form.image, description: form.description || "", description_ar: form.description_ar || null,
      rating: form.rating || 4.5, avg_price: form.avg_price || 100, best_season: form.best_season || "Winter",
      highlights: highlights as any, is_active: form.is_active ?? true, sort_order: form.sort_order || 0,
      updated_at: new Date().toISOString(),
    };

    if (adding) {
      const { error } = await supabase.from("destinations").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("✅ Destination added");
    } else if (editing) {
      const { error } = await supabase.from("destinations").update(payload).eq("id", editing);
      if (error) { toast.error(error.message); return; }
      toast.success("✅ Updated");
    }
    setAdding(false); setEditing(null); setForm({});
    fetchDestinations();
  };

  const deleteDest = async (id: string) => {
    if (!confirm("Delete this destination?")) return;
    const { error } = await supabase.from("destinations").delete().eq("id", id);
    if (error) toast.error("Failed"); else { toast.success("🗑️ Deleted"); fetchDestinations(); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("destinations").update({ is_active: active }).eq("id", id);
    setDestinations(prev => prev.map(d => d.id === id ? { ...d, is_active: active } : d));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `dest-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("story-media").upload(`destinations/${fileName}`, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`destinations/${fileName}`);
      setForm(p => ({ ...p, image: urlData.publicUrl }));
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            { role: "system", content: "You are a helpful assistant that generates travel destination data. Return ONLY valid JSON with these fields: city, country, code (airport code), description, description_ar (Arabic), rating (1-5), best_season, highlights (array of strings). No markdown, no explanation, just JSON." },
            { role: "user", content: aiPrompt },
          ],
        },
      });
      if (error) throw error;
      const text = result?.choices?.[0]?.message?.content || result?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const destData = JSON.parse(jsonMatch[0]);
        setForm(p => ({ ...p, ...destData, is_active: true, sort_order: destinations.length, avg_price: 100 }));
        setHighlightsText((destData.highlights || []).join(", "));
        setAdding(true);
        setAiDialog(false);
        setAiPrompt("");
        toast.success("Destination generated with AI - review and save");
      } else {
        toast.error("Could not parse AI response");
      }
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const filteredDests = searchFilter ? destinations.filter(d => d.city.toLowerCase().includes(searchFilter.toLowerCase()) || d.country.toLowerCase().includes(searchFilter.toLowerCase())) : destinations;

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-primary" />
          <h4 className="font-bold text-foreground">Destinations ({destinations.length})</h4>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setAiDialog(true)} className="gap-1">
            <Sparkles className="w-3.5 h-3.5" /> AI Generate
          </Button>
          <Button size="sm" onClick={startAdd}><Plus className="w-4 h-4 mr-1" /> Add Destination</Button>
        </div>
      </div>

      {/* Quick templates */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Quick Add from Templates:</Label>
        <div className="flex flex-wrap gap-2">
          {DEST_TEMPLATES.map((tmpl, i) => (
            <Button key={i} size="sm" variant="outline" className="h-7 text-xs" onClick={() => startFromTemplate(tmpl)}>
              <Copy className="w-3 h-3 mr-1" /> {tmpl.city}
            </Button>
          ))}
        </div>
      </div>

      {/* Search */}
      <Input placeholder="Search destinations..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)} className="h-8 text-xs" />

      {/* Add/Edit Form */}
      {(adding || editing) && (
        <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-border">
          {form.image && (
            <div className="relative">
              <img src={form.image} className="w-full h-40 object-cover rounded-lg" alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
              <Badge className="absolute top-2 left-2 text-[10px]"><Image className="w-3 h-3 mr-1" /> Preview</Badge>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>City *</Label><Input value={form.city || ""} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
            <div><Label>Country</Label><Input value={form.country || ""} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} /></div>
            <div><Label>Airport Code</Label><Input value={form.code || ""} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="CDG, DXB..." /></div>
            <div><Label>Rating</Label><Input type="number" step="0.1" min="0" max="5" value={form.rating || 4.5} onChange={e => setForm(p => ({ ...p, rating: Number(e.target.value) }))} /></div>
            <div><Label>Best Season</Label>
              <Select value={form.best_season || "Winter"} onValueChange={v => setForm(p => ({ ...p, best_season: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SEASONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Sort Order</Label><Input type="number" value={form.sort_order || 0} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} /></div>
            <div className="md:col-span-2">
              <Label>Image *</Label>
              <div className="flex gap-2">
                <Input value={form.image || ""} onChange={e => setForm(p => ({ ...p, image: e.target.value }))} placeholder="https://..." className="flex-1" />
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <Button type="button" size="sm" variant="outline" className="gap-1 h-9" asChild disabled={uploadingImage}>
                    <span>{uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload</span>
                  </Button>
                </label>
              </div>
            </div>
          </div>
          <div><Label>Description (EN)</Label><Textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div><Label>Description (AR)</Label><Textarea value={form.description_ar || ""} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} dir="rtl" /></div>
          <div><Label>Highlights (comma separated)</Label><Input value={highlightsText} onChange={e => setHighlightsText(e.target.value)} placeholder="Eiffel Tower, Louvre, Seine River" /></div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2"><Switch checked={!!form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} /><Label>Active</Label></div>
          </div>

          {/* Card Preview */}
          <div className="bg-card rounded-lg p-3 border">
            <Label className="text-xs text-muted-foreground mb-2 block">Card Preview:</Label>
            <div className="flex gap-3 items-center">
              {form.image ? (
                <img src={form.image} className="w-20 h-14 rounded-lg object-cover" alt="" />
              ) : (
                <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center"><Globe className="w-5 h-5 text-muted-foreground" /></div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{form.city || "City"}, {form.country || "Country"}</p>
                <p className="text-xs text-muted-foreground truncate">{form.description || "Description..."}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">⭐ {form.rating || 4.5}</span>
                  <span className="text-[10px] text-muted-foreground">🌤️ {form.best_season || "Winter"}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={saveDest}><Save className="w-4 h-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditing(null); }}><X className="w-4 h-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}

      {/* Destinations list */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {filteredDests.map(d => (
          <div key={d.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow">
            {d.image ? (
              <img src={d.image} className="w-16 h-12 rounded-lg object-cover flex-shrink-0" alt={d.city} />
            ) : (
              <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Globe className="w-5 h-5 text-muted-foreground" /></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{d.city}</span>
                <span className="text-xs text-muted-foreground">{d.country}</span>
                <Badge variant={d.is_active ? "default" : "destructive"} className="text-[10px]">
                  {d.is_active ? "Active" : "Hidden"}
                </Badge>
                <span className="text-[10px] text-muted-foreground">⭐{d.rating}</span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{d.description}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <Switch checked={d.is_active} onCheckedChange={v => toggleActive(d.id, v)} />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateDest(d)}><Copy size={12} /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(d)}><Pencil size={12} /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteDest(d.id)}><Trash2 size={12} /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* AI Dialog */}
      <Dialog open={aiDialog} onOpenChange={setAiDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate Destination with AI</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="Describe the destination, e.g. 'Kyoto, Japan - ancient temples and cherry blossoms'" className="min-h-[80px]" />
            <Button onClick={generateWithAI} disabled={aiGenerating} className="w-full gap-1">
              {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiGenerating ? "Generating..." : "Generate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDestinations;
