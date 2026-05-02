import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Save, X, Loader2, Star, Image, Globe, Eye, Copy, Upload, Sparkles, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface EventRow {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  category: string;
  city: string;
  country: string;
  venue: string | null;
  image_url: string | null;
  start_date: string;
  end_date: string | null;
  latitude: number | null;
  longitude: number | null;
  website_url: string | null;
  ticket_url: string | null;
  google_maps_url: string | null;
  is_active: boolean | null;
  is_featured: boolean | null;
  sort_order: number | null;
  ai_prompt?: string | null;
}

// Build a default AI prompt from form fields. Date/time are included only when set.
const buildEventPromptSuggestion = (f: Partial<EventRow>): string => {
  const parts: string[] = [];
  if (f.title) parts.push(f.title);
  const loc = [f.venue, f.city, f.country].filter(Boolean).join(", ");
  if (loc) parts.push(`at ${loc}`);
  if (f.start_date) {
    parts.push(f.end_date && f.end_date !== f.start_date ? `from ${f.start_date} to ${f.end_date}` : `on ${f.start_date}`);
  }
  if (f.description) parts.push(`— ${f.description}`);
  return parts.join(" ").trim();
};

const CATEGORIES = ["sports", "technology", "expo", "entertainment", "culture", "music", "food", "art", "business"];

const EVENT_TEMPLATES: Partial<EventRow>[] = [
  {
    title: "FIFA World Cup 2026", title_ar: "كأس العالم 2026",
    category: "sports", city: "Multiple Cities", country: "United States",
    description: "The 23rd FIFA World Cup, hosted across USA, Mexico and Canada",
    description_ar: "كأس العالم لكرة القدم 2026 في أمريكا والمكسيك وكندا",
    start_date: "2026-06-11", end_date: "2026-07-19",
    image_url: "https://digitalhub.fifa.com/transform/3b120203-48c7-4e9b-af18-3f543134e6e6/FIFA-World-Cup-26-Official-Brand",
    website_url: "https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026",
    is_active: true, is_featured: true, sort_order: 0,
  },
  {
    title: "Expo 2025 Osaka", title_ar: "إكسبو 2025 أوساكا",
    category: "expo", city: "Osaka", country: "Japan",
    description: "World Expo 2025 - Designing Future Society for Our Lives",
    description_ar: "المعرض العالمي 2025 - تصميم مجتمع المستقبل",
    start_date: "2025-04-13", end_date: "2025-10-13",
    image_url: "https://www.expo2025.or.jp/wp/wp-content/uploads/2023/06/expo2025_logo.png",
    website_url: "https://www.expo2025.or.jp/en/",
    is_active: true, is_featured: true, sort_order: 1,
  },
  {
    title: "Olympics 2028 Los Angeles", title_ar: "أولمبياد 2028 لوس أنجلوس",
    category: "sports", city: "Los Angeles", country: "United States",
    description: "The 2028 Summer Olympics in Los Angeles",
    description_ar: "الألعاب الأولمبية الصيفية 2028 في لوس أنجلوس",
    start_date: "2028-07-14", end_date: "2028-07-30",
    is_active: true, is_featured: true, sort_order: 2,
  },
];

const AdminEvents = () => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<EventRow>>({});
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDialog, setAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [shareStats, setShareStats] = useState<Record<string, { total: number; platforms: Record<string, number> }>>({});

  useEffect(() => { fetchEvents(); fetchShareStats(); }, []);

  const fetchEvents = async () => {
    const { data } = await supabase.from("global_events").select("*").order("sort_order");
    setEvents((data as any) || []);
    setLoading(false);
  };

  const fetchShareStats = async () => {
    const { data } = await supabase.from("event_shares").select("event_id, platform");
    if (!data) return;
    const stats: Record<string, { total: number; platforms: Record<string, number> }> = {};
    data.forEach((s: any) => {
      if (!stats[s.event_id]) stats[s.event_id] = { total: 0, platforms: {} };
      stats[s.event_id].total++;
      stats[s.event_id].platforms[s.platform] = (stats[s.event_id].platforms[s.platform] || 0) + 1;
    });
    setShareStats(stats);
  };

  const startAdd = () => {
    setForm({ category: "sports", is_active: true, is_featured: false, sort_order: 0 });
    setAdding(true);
    setEditing(null);
  };

  const startFromTemplate = (tmpl: Partial<EventRow>) => {
    setForm({ ...tmpl });
    setAdding(true);
    setEditing(null);
    toast.success("Template loaded - customize and save");
  };

  const startEdit = (e: EventRow) => {
    setForm({ ...e });
    setEditing(e.id);
    setAdding(false);
  };

  const duplicateEvent = (e: EventRow) => {
    const { id, ...rest } = e;
    setForm({ ...rest, title: `${rest.title} (Copy)` });
    setAdding(true);
    setEditing(null);
  };

  const saveEvent = async () => {
    if (!form.title || !form.city || !form.country || !form.start_date) {
      toast.error("Title, city, country and start date are required");
      return;
    }
    if (adding) {
      const { error } = await supabase.from("global_events").insert([form as any]);
      if (error) { toast.error(error.message); return; }
      toast.success("Event added");
    } else if (editing) {
      const { error } = await supabase.from("global_events").update(form as any).eq("id", editing);
      if (error) { toast.error(error.message); return; }
      toast.success("Event updated");
    }
    setAdding(false);
    setEditing(null);
    setForm({});
    fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    await supabase.from("global_events").delete().eq("id", id);
    toast.success("Event deleted");
    fetchEvents();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `event-${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("story-media").upload(`events/${fileName}`, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(`events/${fileName}`);
      setForm(p => ({ ...p, image_url: urlData.publicUrl }));
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
            { role: "system", content: "You are an assistant that returns ONLY a single valid JSON object (no markdown, no code fences, no commentary) with these fields: title, title_ar, description, description_ar, category (one of: sports, technology, expo, entertainment, culture, music, food, art, business), city, country, venue, start_date (YYYY-MM-DD), end_date (YYYY-MM-DD). If a field is unknown, use null. Always include all keys." },
            { role: "user", content: aiPrompt },
          ],
        },
      });
      if (error) throw error;

      // Robust extraction: handle SSE, markdown ```json fences, raw text
      let text = "";
      if (typeof result === "string") text = result;
      else text = result?.choices?.[0]?.message?.content || result?.content || result?.message?.content || "";
      // Strip SSE
      if (text.includes("data:")) {
        let buf = "";
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const p = JSON.parse(line.slice(6));
            buf += p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || "";
          } catch { buf += line.slice(6); }
        }
        text = buf || text;
      }
      // Strip markdown fences
      text = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      let eventData: any = null;
      if (jsonMatch) {
        try { eventData = JSON.parse(jsonMatch[0]); } catch {
          // Try to repair common issues: trailing commas
          try { eventData = JSON.parse(jsonMatch[0].replace(/,(\s*[}\]])/g, "$1")); } catch {}
        }
      }

      if (!eventData || typeof eventData !== "object") {
        // Soft fallback: pre-fill title from prompt
        setForm(p => ({ ...p, title: aiPrompt.slice(0, 80), is_active: true, is_featured: false, sort_order: 0 }));
        setAdding(true);
        setAiDialog(false);
        setAiPrompt("");
        toast.warning("AI couldn't return structured data — pre-filled the title only. Please complete the form manually.");
        return;
      }

      setForm(p => ({
        ...p, ...eventData,
        is_active: true, is_featured: false, sort_order: 0,
      }));
      setAdding(true);
      setAiDialog(false);
      setAiPrompt("");
      toast.success("Event generated with AI - review and save");
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const moveEvent = async (event: EventRow, direction: 'up' | 'down') => {
    const idx = filteredEvents.findIndex(e => e.id === event.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filteredEvents.length) return;
    const other = filteredEvents[swapIdx];
    const newOrder = other.sort_order ?? 0;
    const otherOrder = event.sort_order ?? 0;
    await Promise.all([
      supabase.from("global_events").update({ sort_order: newOrder }).eq("id", event.id),
      supabase.from("global_events").update({ sort_order: otherOrder }).eq("id", other.id),
    ]);
    fetchEvents();
  };

  const filteredEvents = events.filter(e => {
    if (filter !== "all" && e.category !== filter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (e.title || "").toLowerCase().includes(q) ||
      (e.title_ar || "").toLowerCase().includes(q) ||
      (e.city || "").toLowerCase().includes(q) ||
      (e.country || "").toLowerCase().includes(q) ||
      (e.venue || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q)
    );
  });
  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h2 className="text-lg font-bold">Global Events ({events.length})</h2>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setAiDialog(true)} className="gap-1">
            <Sparkles className="w-3.5 h-3.5" /> AI Generate
          </Button>
          <Button size="sm" onClick={startAdd}><Plus className="w-4 h-4 mr-1" /> Add Event</Button>
        </div>
      </div>

      {/* Quick templates */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Quick Add from Templates:</Label>
        <div className="flex flex-wrap gap-2">
          {EVENT_TEMPLATES.map((tmpl, i) => (
            <Button
              key={i}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => startFromTemplate(tmpl)}
            >
              <Copy className="w-3 h-3 mr-1" />
              {tmpl.title}
            </Button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <Input
        placeholder="🔍 Search by title, city, country, venue, description..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        className="h-9 text-sm"
      />

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1">
        <Badge
          variant={filter === "all" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setFilter("all")}
        >All</Badge>
        {CATEGORIES.map(c => (
          <Badge
            key={c}
            variant={filter === c ? "default" : "outline"}
            className="cursor-pointer text-xs capitalize"
            onClick={() => setFilter(c)}
          >{c}</Badge>
        ))}
      </div>

      {/* Editor block — rendered at top when ADDING; inline (after the matching row) when EDITING */}
      {(() => {
        const editorBlock = (
          <div className="bg-muted/50 rounded-xl p-4 space-y-3 border border-primary/40 shadow-sm" key="editor">
            {/* Image preview */}
            {form.image_url && (
              <div className="relative">
                <img src={form.image_url} className="w-full h-40 object-cover rounded-lg" alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                <Badge className="absolute top-2 left-2 text-[10px]"><Image className="w-3 h-3 mr-1" /> Preview</Badge>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Title (EN)</Label><Input value={form.title || ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div><Label>Title (AR)</Label><Input value={form.title_ar || ""} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} dir="rtl" /></div>
              <div><Label>City</Label><Input value={form.city || ""} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
              <div><Label>Country</Label><Input value={form.country || ""} onChange={e => setForm(p => ({ ...p, country: e.target.value }))} /></div>
              <div><Label>Venue</Label><Input value={form.venue || ""} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} /></div>
              <div><Label>Category</Label>
                <Select value={form.category || "sports"} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Start Date</Label><Input type="date" value={form.start_date || ""} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.end_date || ""} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} /></div>
              <div className="md:col-span-2">
                <Label>Image</Label>
                <div className="flex gap-2">
                  <Input value={form.image_url || ""} onChange={e => setForm(p => ({ ...p, image_url: e.target.value }))} placeholder="https://example.com/image.jpg" className="flex-1" />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    <Button type="button" size="sm" variant="outline" className="gap-1 h-9" asChild disabled={uploadingImage}>
                      <span>{uploadingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload</span>
                    </Button>
                  </label>
                </div>
              </div>
              <div><Label>Website URL</Label><Input value={form.website_url || ""} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} /></div>
              <div><Label>Ticket URL</Label><Input value={form.ticket_url || ""} onChange={e => setForm(p => ({ ...p, ticket_url: e.target.value }))} /></div>
              <div className="md:col-span-2"><Label>Google Maps URL</Label><Input value={form.google_maps_url || ""} onChange={e => setForm(p => ({ ...p, google_maps_url: e.target.value }))} placeholder="https://maps.google.com/..." /></div>
              <div><Label>Sort Order</Label><Input type="number" value={form.sort_order || 0} onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) }))} /></div>
              <div><Label>Latitude</Label><Input type="number" step="any" value={form.latitude || ""} onChange={e => setForm(p => ({ ...p, latitude: parseFloat(e.target.value) }))} /></div>
              <div><Label>Longitude</Label><Input type="number" step="any" value={form.longitude || ""} onChange={e => setForm(p => ({ ...p, longitude: parseFloat(e.target.value) }))} /></div>
            </div>
            <div><Label>Description (EN)</Label><Textarea value={form.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Description (AR)</Label><Textarea value={form.description_ar || ""} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} dir="rtl" /></div>
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2"><Switch checked={!!form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} /><Label>Active</Label></div>
              <div className="flex items-center gap-2"><Switch checked={!!form.is_featured} onCheckedChange={v => setForm(p => ({ ...p, is_featured: v }))} /><Label>Featured</Label></div>
            </div>

            {/* Widget preview */}
            <div className="bg-card rounded-lg p-3 border">
              <Label className="text-xs text-muted-foreground mb-2 block">Event Card Preview:</Label>
              <div className="flex gap-3 items-center">
                {form.image_url ? (
                  <img src={form.image_url} className="w-20 h-14 rounded-lg object-cover" alt="" />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center"><Image className="w-5 h-5 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{form.title || "Event Title"}</p>
                  <p className="text-xs text-muted-foreground">{form.city || "City"}, {form.country || "Country"}</p>
                  <p className="text-[10px] text-muted-foreground">{form.start_date || "Start Date"} → {form.end_date || "End Date"}</p>
                </div>
                {form.is_featured && <Star className="w-4 h-4 text-yellow-500" />}
              </div>
            </div>

            <div>
              <Label className="flex items-center justify-between">
                <span>AI Prompt (used by trip generator)</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => setForm(p => ({ ...p, ai_prompt: buildEventPromptSuggestion(p) }))}
                >
                  <Sparkles className="w-3 h-3" /> Auto-fill from fields
                </Button>
              </Label>
              <Textarea
                value={form.ai_prompt || ""}
                onChange={e => setForm(p => ({ ...p, ai_prompt: e.target.value }))}
                placeholder={buildEventPromptSuggestion(form) || "What should the trip planner know about this event? Date/time will be included automatically when set."}
                rows={3}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Leave blank to let the system build it from the fields above. Date and time are only injected when you fill them in.
              </p>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={saveEvent}><Save className="w-4 h-4 mr-1" /> Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditing(null); }}><X className="w-4 h-4 mr-1" /> Cancel</Button>
            </div>
          </div>
        );

        return (
          <>
            {adding && editorBlock}
            <div className="space-y-2">
              {filteredEvents.map(e => (
                <div key={e.id} className="space-y-2">
                  <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow">
                    {e.image_url ? (
                      <img src={e.image_url} className="w-16 h-12 rounded-lg object-cover flex-shrink-0" alt={e.title} />
                    ) : (
                      <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Globe className="w-5 h-5 text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{e.title}</span>
                        {e.is_featured && <Star className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />}
                        <Badge variant="outline" className="text-[10px] capitalize">{e.category}</Badge>
                        {!e.is_active && <Badge variant="destructive" className="text-[10px]">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-muted-foreground">{e.city}, {e.country} · {e.start_date}</p>
                        {shareStats[e.id] && (
                          <Badge variant="secondary" className="text-[10px] gap-0.5"><Eye className="w-2.5 h-2.5" /> {shareStats[e.id].total} shares</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveEvent(e, 'up')} title="Move up"><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveEvent(e, 'down')} title="Move down"><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateEvent(e)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant={editing === e.id ? "default" : "ghost"} className="h-7 w-7" onClick={() => editing === e.id ? (setEditing(null), setForm({})) : startEdit(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteEvent(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  {editing === e.id && editorBlock}
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No events found</p>
              )}
            </div>
          </>
        );
      })()}
      {/* AI Generation Dialog */}
      <Dialog open={aiDialog} onOpenChange={setAiDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Generate Event with AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              placeholder="Describe the event you want to create, e.g: 'A music festival in Tokyo, Japan in Summer 2026 with international artists'"
              rows={4}
            />
            <Button onClick={generateWithAI} disabled={aiGenerating || !aiPrompt.trim()} className="w-full gap-2">
              {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiGenerating ? "Generating..." : "Generate Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEvents;
