import { useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, Plus, Trash2, Save, Loader2, Pencil, X, Upload, Sparkles, Image as ImageIcon, Video, Link2, Wand2, Eye, Clock, MapPin, Ticket, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Promotion {
  id: string;
  title: string;
  title_ar: string | null;
  description: string;
  description_ar: string | null;
  media_urls: string[];
  media_type: string;
  linked_event_id: string | null;
  linked_destination_id: string | null;
  included_places: any[];
  cta_destination: string;
  is_active: boolean;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
  ai_prompt?: string | null;
  updated_at: string;
  created_at: string;
}

interface EventOption {
  id: string;
  title: string;
  city: string;
  country: string;
  start_date: string | null;
  end_date: string | null;
}

interface DestinationOption {
  id: string;
  city: string;
  country: string;
}

interface NamedItem {
  name: string;
}

interface CityItem {
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  kickoff_time?: string | null;
  venue?: string | null;
  google_maps_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  media_urls?: string[];
  notes?: string | null;
  ai_prompt?: string | null;
}

// Build a default AI prompt for a city item — date/time included only when set
const buildCityPromptSuggestion = (c: CityItem): string => {
  const parts: string[] = [];
  if (c.name) parts.push(c.name);
  if (c.venue) parts.push(`at ${c.venue}`);
  if (c.start_date) {
    parts.push(c.end_date && c.end_date !== c.start_date ? `from ${c.start_date} to ${c.end_date}` : `on ${c.start_date}`);
  }
  if (c.kickoff_time) parts.push(`at ${c.kickoff_time}`);
  if (c.notes) parts.push(`(${c.notes})`);
  return parts.join(" ").trim();
};

// Build a default AI prompt for the whole promotion
const buildPromotionPromptSuggestion = (f: Partial<Promotion>, cities: CityItem[]): string => {
  const parts: string[] = [];
  if (f.title) parts.push(f.title);
  if (f.description) parts.push(`— ${f.description}`);
  if (f.start_date) {
    parts.push(f.end_date && f.end_date !== f.start_date ? `from ${f.start_date} to ${f.end_date}` : `on ${f.start_date}`);
  }
  if (cities.length > 0) {
    parts.push(`across: ${cities.map((c) => c.name).filter(Boolean).join(", ")}`);
  }
  return parts.join(" ").trim();
};

const EMPTY_FORM: Partial<Promotion> = {
  title: "",
  title_ar: "",
  description: "",
  description_ar: "",
  media_urls: [],
  media_type: "image",
  linked_event_id: null,
  linked_destination_id: null,
  included_places: [],
  cta_destination: "",
  is_active: true,
  sort_order: 0,
  start_date: null,
  end_date: null,
};

const normalizeName = (value: string) => value.replace(/\s+/g, " ").trim();
const normalizeForMatch = (value: string) => normalizeName(value).toLowerCase();

const dedupeNames = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeForMatch(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toNameArray = (input: unknown): string[] => {
  if (!input) return [];

  if (Array.isArray(input)) {
    return dedupeNames(
      input
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const named = item as { name?: string; title?: string; city?: string };
            return named.name || named.title || named.city || "";
          }
          return "";
        })
        .map(normalizeName)
        .filter(Boolean)
    );
  }

  if (typeof input === "string") {
    return dedupeNames(
      input
        .split(/\n|,|•|\|/)
        .map(normalizeName)
        .filter(Boolean)
    );
  }

  return [];
};

const parseSseText = (raw: string) => {
  if (!raw.includes("data:")) return raw;
  let text = "";
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const parsed = JSON.parse(line.slice(6));
      text += parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content || "";
    } catch {
      text += line.slice(6);
    }
  }
  return text;
};

const extractAiJson = (data: any) => {
  if (!data) return null;

  // Helper: try parse + repair common issues
  const tryParse = (raw: string): any => {
    if (!raw) return null;
    let cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const candidate = match[0];
    try { return JSON.parse(candidate); } catch {}
    // Strip trailing commas
    try { return JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1")); } catch {}
    return null;
  };

  if (typeof data === "object" && !Array.isArray(data)) {
    if (data.title || data.description || data.cities || data.activities) return data;
    const directText = data?.choices?.[0]?.message?.content || data?.content || data?.message?.content;
    if (typeof directText === "string") {
      const parsed = tryParse(parseSseText(directText));
      if (parsed) return parsed;
    }
  }

  if (typeof data === "string") {
    return tryParse(parseSseText(data));
  }

  return null;
};

const AdminPromotions = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Partial<Promotion>>(EMPTY_FORM);
  const [cities, setCities] = useState<CityItem[]>([]);
  const [activities, setActivities] = useState<NamedItem[]>([]);
  const [expandedCity, setExpandedCity] = useState<number | null>(null);
  const [uploadingCityMedia, setUploadingCityMedia] = useState<number | null>(null);
  const [newCity, setNewCity] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [mediaUrlInput, setMediaUrlInput] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (adding || editing) {
      setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [adding, editing]);

  useEffect(() => {
    fetchAll();
  }, []);

  const destinationOptions = useMemo(
    () => destinations.map((destination) => ({ ...destination, label: `${destination.city}, ${destination.country}` })),
    [destinations]
  );

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: promos }, { data: evts }, { data: dests }] = await Promise.all([
      supabase.from("promotions").select("*").order("sort_order"),
      supabase.from("global_events").select("id, title, city, country, start_date, end_date").eq("is_active", true).order("title"),
      supabase.from("destinations").select("id, city, country").eq("is_active", true).order("city"),
    ]);

    if (promos) {
      setPromotions(
        promos.map((promotion: any) => ({
          ...promotion,
          included_places: Array.isArray(promotion.included_places) ? promotion.included_places : [],
          media_urls: Array.isArray(promotion.media_urls) ? promotion.media_urls : [],
        }))
      );
    }

    if (evts) setEvents(evts as EventOption[]);
    if (dests) setDestinations(dests as DestinationOption[]);
    setLoading(false);
  };

  const resetEditor = () => {
    setForm({ ...EMPTY_FORM, sort_order: promotions.length });
    setCities([]);
    setActivities([]);
    setNewCity("");
    setNewActivity("");
    setMediaUrlInput("");
  };

  const startAdd = () => {
    resetEditor();
    setAdding(true);
    setEditing(null);
  };

  const startEdit = (promotion: Promotion) => {
    setForm({ ...promotion });
    const cityItems: CityItem[] = [];
    const activityItems: NamedItem[] = [];

    (promotion.included_places || []).forEach((place: any) => {
      if (typeof place === "object" && place?.type === "city") {
        cityItems.push({
          name: normalizeName(place.name || ""),
          start_date: place.start_date || null,
          end_date: place.end_date || null,
          kickoff_time: place.kickoff_time || null,
          venue: place.venue || null,
          google_maps_url: place.google_maps_url || null,
          latitude: typeof place.latitude === "number" ? place.latitude : null,
          longitude: typeof place.longitude === "number" ? place.longitude : null,
          media_urls: Array.isArray(place.media_urls) ? place.media_urls : [],
          notes: place.notes || null,
          ai_prompt: place.ai_prompt || null,
        });
      } else activityItems.push({ name: normalizeName(typeof place === "string" ? place : place?.name || "") });
    });

    setCities(cityItems.filter((item) => item.name));
    setActivities(activityItems.filter((item) => item.name));
    setNewCity("");
    setNewActivity("");
    setMediaUrlInput("");
    setEditing(promotion.id);
    setAdding(false);
  };

  const addCity = (name: string) => {
    const value = normalizeName(name);
    if (!value) return;
    if (cities.some((city) => normalizeForMatch(city.name) === normalizeForMatch(value))) return;
    setCities((prev) => [...prev, { name: value }]);
    if (!form.cta_destination) setForm((prev) => ({ ...prev, cta_destination: value }));
    setNewCity("");
  };

  const addActivity = (name: string) => {
    const value = normalizeName(name);
    if (!value) return;
    if (activities.some((activity) => normalizeForMatch(activity.name) === normalizeForMatch(value))) return;
    setActivities((prev) => [...prev, { name: value }]);
    setNewActivity("");
  };

  const editCity = (index: number) => {
    setNewCity(cities[index]?.name || "");
    setCities((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const editActivity = (index: number) => {
    setNewActivity(activities[index]?.name || "");
    setActivities((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const removeCity = (index: number) => {
    setCities((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setExpandedCity((curr) => (curr === index ? null : curr !== null && curr > index ? curr - 1 : curr));
  };
  const removeActivity = (index: number) => setActivities((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

  const updateCity = (index: number, patch: Partial<CityItem>) => {
    setCities((prev) => prev.map((city, idx) => (idx === index ? { ...city, ...patch } : city)));
  };

  const handleCityMediaUpload = async (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    setUploadingCityMedia(index);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const extension = file.name.split(".").pop();
        const fileName = `promo-city-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const { error } = await supabase.storage.from("story-media").upload(`promotions/${fileName}`, file, { upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from("story-media").getPublicUrl(`promotions/${fileName}`);
        newUrls.push(data.publicUrl);
      }
      setCities((prev) => prev.map((city, idx) => (idx === index ? { ...city, media_urls: [...(city.media_urls || []), ...newUrls] } : city)));
      toast.success(`${newUrls.length} file(s) uploaded`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingCityMedia(null);
      event.target.value = "";
    }
  };

  const removeCityMedia = (cityIndex: number, mediaIndex: number) => {
    setCities((prev) => prev.map((city, idx) => (idx === cityIndex ? { ...city, media_urls: (city.media_urls || []).filter((_, mi) => mi !== mediaIndex) } : city)));
  };

  const applyDestinationSelection = (destinationId: string | null) => {
    const selected = destinationOptions.find((destination) => destination.id === destinationId);
    setForm((prev) => ({
      ...prev,
      linked_destination_id: destinationId,
      cta_destination: selected ? selected.label : prev.cta_destination || "",
    }));
    if (selected) addCity(selected.label);
  };

  const applyEventSelection = (eventId: string | null) => {
    const selected = events.find((event) => event.id === eventId);
    setForm((prev) => ({
      ...prev,
      linked_event_id: eventId,
      start_date: selected?.start_date || prev.start_date || null,
      end_date: selected?.end_date || prev.end_date || null,
      cta_destination: selected ? `${selected.city}, ${selected.country}` : prev.cta_destination || "",
    }));
    if (selected?.city) addCity(`${selected.city}, ${selected.country}`);
  };

  const addMediaUrl = () => {
    const url = normalizeName(mediaUrlInput);
    if (!url) return;
    setForm((prev) => ({ ...prev, media_urls: [...(prev.media_urls || []), url] }));
    setMediaUrlInput("");
  };

  const removeMedia = (index: number) => {
    setForm((prev) => ({ ...prev, media_urls: (prev.media_urls || []).filter((_, itemIndex) => itemIndex !== index) }));
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setUploadingMedia(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const extension = file.name.split(".").pop();
        const fileName = `promo-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const { error } = await supabase.storage.from("story-media").upload(`promotions/${fileName}`, file, { upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from("story-media").getPublicUrl(`promotions/${fileName}`);
        newUrls.push(data.publicUrl);
      }
      setForm((prev) => ({ ...prev, media_urls: [...(prev.media_urls || []), ...newUrls] }));
      toast.success(`${newUrls.length} file(s) uploaded`);
    } catch (error: any) {
      toast.error(error.message || "Upload failed");
    } finally {
      setUploadingMedia(false);
      event.target.value = "";
    }
  };

  const autoLink = (overrides?: { title?: string; ctaDestination?: string; cityNames?: string[] }) => {
    const titleSource = normalizeForMatch(overrides?.title || form.title || "");
    const ctaSource = normalizeForMatch(overrides?.ctaDestination || form.cta_destination || "");
    const citySources = dedupeNames([...(overrides?.cityNames || []), ...cities.map((city) => city.name)]).map(normalizeForMatch);

    const matchedEvent =
      events.find((event) => {
        const eventText = normalizeForMatch(`${event.title} ${event.city} ${event.country}`);
        return !!titleSource && (eventText.includes(titleSource) || titleSource.includes(normalizeForMatch(event.title)));
      }) || null;

    const matchedDestination =
      destinationOptions.find((destination) => {
        const full = normalizeForMatch(destination.label);
        const city = normalizeForMatch(destination.city);
        return full === ctaSource || citySources.includes(full) || citySources.includes(city) || (!!ctaSource && (ctaSource.includes(city) || city.includes(ctaSource)));
      }) || null;

    let linkedCount = 0;

    if (matchedEvent) {
      linkedCount += 1;
      setForm((prev) => ({
        ...prev,
        linked_event_id: matchedEvent.id,
        start_date: prev.start_date || matchedEvent.start_date || null,
        end_date: prev.end_date || matchedEvent.end_date || null,
        cta_destination: prev.cta_destination || `${matchedEvent.city}, ${matchedEvent.country}`,
      }));
    }

    if (matchedDestination) {
      linkedCount += 1;
      setForm((prev) => ({
        ...prev,
        linked_destination_id: matchedDestination.id,
        cta_destination: prev.cta_destination || matchedDestination.label,
      }));
      if (!cities.some((city) => normalizeForMatch(city.name) === normalizeForMatch(matchedDestination.label) || normalizeForMatch(city.name) === normalizeForMatch(matchedDestination.city))) {
        setCities((prev) => [...prev, { name: matchedDestination.label }]);
      }
    }

    if (linkedCount > 0) toast.success(`🔗 Auto-linked ${linkedCount} item(s)`);
    else toast.info("No matches found");
  };

  const aiAutoFill = async () => {
    if (!normalizeName(form.title || "")) {
      toast.error("Enter a title first");
      return;
    }

    setAiLoading(true);
    try {
      const linkedEvent = form.linked_event_id ? events.find((event) => event.id === form.linked_event_id) : null;
      const linkedDestination = form.linked_destination_id ? destinationOptions.find((destination) => destination.id === form.linked_destination_id) : null;

      const promptContext = [
        `Title EN: ${form.title || ""}`,
        form.title_ar ? `Title AR: ${form.title_ar}` : "",
        linkedEvent ? `Linked event: ${linkedEvent.title} | ${linkedEvent.city}, ${linkedEvent.country} | ${linkedEvent.start_date || ""} to ${linkedEvent.end_date || ""}` : "",
        linkedDestination ? `Linked destination: ${linkedDestination.label}` : "",
        form.description ? `Existing description: ${form.description}` : "",
        form.description_ar ? `Existing Arabic description: ${form.description_ar}` : "",
      ].filter(Boolean).join("\n");

      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [
            {
              role: "system",
              content:
                'You MUST return ONLY a single valid JSON object — no markdown, no code fences, no commentary, no prose. Schema: {"title":"string","title_ar":"string","description":"string","description_ar":"string","cta_destination":"City, Country","cities":["City, Country"],"activities":["place name"],"start_date":"YYYY-MM-DD or null","end_date":"YYYY-MM-DD or null","media_type":"image|video|mixed"}. Rules: cities must contain ONLY actual trip destinations (a city + country). Activities must contain landmarks, neighborhoods, restaurants, attractions, stadiums, fan zones, museums, malls, beaches, and experiences — never cities. If an Arabic title is possible, generate it. If dates are unknown return null. If you do not know a real-world value, return null instead of inventing it. Always include all keys.',
            },
            { role: "user", content: promptContext },
          ],
        },
      });

      if (error) throw error;

      const result = extractAiJson(data);
      if (!result) {
        // Soft fallback — pre-fill what we can so the admin still gets value
        setForm((prev) => ({
          ...prev,
          description: prev.description || `Promotion: ${form.title}`,
        }));
        toast.warning("AI couldn't return structured data — keeping your title and adding a placeholder description. You can edit everything manually.");
        return;
      }

      const generatedCities = toNameArray(result.cities);
      const generatedActivities = toNameArray(result.activities);
      const nextCta = normalizeName(result.cta_destination || "") || linkedDestination?.label || (generatedCities[0] || "");

      setForm((prev) => ({
        ...prev,
        title_ar: result.title_ar || prev.title_ar || "",
        description: result.description || prev.description || "",
        description_ar: result.description_ar || prev.description_ar || "",
        cta_destination: nextCta || prev.cta_destination || "",
        start_date: result.start_date || linkedEvent?.start_date || prev.start_date || null,
        end_date: result.end_date || linkedEvent?.end_date || prev.end_date || null,
        media_type: ["image", "video", "mixed"].includes(result.media_type) ? result.media_type : prev.media_type || "image",
      }));

      setCities(dedupeNames([...(generatedCities.length ? generatedCities : []), ...(linkedDestination ? [linkedDestination.label] : []), ...(linkedEvent?.city ? [`${linkedEvent.city}, ${linkedEvent.country}`] : []), ...cities.map((city) => city.name)]).map((name) => ({ name })));
      setActivities(dedupeNames([...generatedActivities, ...activities.map((activity) => activity.name)]).map((name) => ({ name })));

      autoLink({
        title: form.title || "",
        ctaDestination: nextCta,
        cityNames: generatedCities,
      });

      toast.success("✨ AI auto-filled the draft — you can still edit everything manually");
    } catch (error: any) {
      toast.error(`AI failed: ${error.message || "Unknown error"}`);
    } finally {
      setAiLoading(false);
    }
  };

  const savePromotion = async () => {
    if (!normalizeName(form.title || "")) {
      toast.error("Title is required");
      return;
    }

    const allPlaces = [
      ...cities.map((city) => ({
        name: normalizeName(city.name),
        type: "city",
        start_date: city.start_date || null,
        end_date: city.end_date || null,
        kickoff_time: city.kickoff_time || null,
        venue: city.venue || null,
        google_maps_url: city.google_maps_url || null,
        latitude: city.latitude ?? null,
        longitude: city.longitude ?? null,
        media_urls: city.media_urls || [],
        notes: city.notes || null,
        ai_prompt: city.ai_prompt || null,
      })),
      ...activities.map((activity) => ({ name: normalizeName(activity.name), type: "activity" })),
    ].filter((place) => place.name);

    const payload: any = {
      title: normalizeName(form.title || ""),
      title_ar: normalizeName(form.title_ar || "") || null,
      description: normalizeName(form.description || ""),
      description_ar: normalizeName(form.description_ar || "") || null,
      media_urls: form.media_urls || [],
      media_type: form.media_type || "image",
      linked_event_id: form.linked_event_id || null,
      linked_destination_id: form.linked_destination_id || null,
      included_places: allPlaces as any,
      cta_destination: normalizeName(form.cta_destination || "") || cities[0]?.name || "",
      is_active: form.is_active ?? true,
      sort_order: Number(form.sort_order || 0),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      ai_prompt: (form.ai_prompt || "").trim() || null,
    };

    if (adding) {
      const { error } = await supabase.from("promotions").insert(payload);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("✅ Promotion added");
    } else if (editing) {
      const { error } = await supabase.from("promotions").update(payload).eq("id", editing);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("✅ Updated");
    }

    setAdding(false);
    setEditing(null);
    resetEditor();
    fetchAll();
  };

  const deletePromotion = async (id: string) => {
    if (!confirm("Delete this promotion?")) return;
    const { error } = await supabase.from("promotions").delete().eq("id", id);
    if (error) toast.error("Failed");
    else {
      toast.success("🗑️ Deleted");
      fetchAll();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-primary" />
          <h4 className="font-bold text-foreground">Promotions ({promotions.length})</h4>
        </div>
        <Button size="sm" onClick={startAdd} type="button">
          <Plus className="w-4 h-4 mr-1" /> Add Promotion
        </Button>
      </div>

      {/* Search bar */}
      <Input
        placeholder="🔍 Search promotions by title, description, city, CTA..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="h-9 text-sm"
      />

      {(adding || editing) && (
        <div ref={editorRef} className="bg-muted/50 rounded-xl p-4 space-y-4 border border-border scroll-mt-20">

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Title (EN) *</Label>
              <Input value={form.title || ""} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Title (AR)</Label>
              <Input value={form.title_ar || ""} onChange={(event) => setForm((prev) => ({ ...prev, title_ar: event.target.value }))} dir="rtl" />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={aiAutoFill} disabled={aiLoading} type="button">
              {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} AI Auto-Fill
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => autoLink()} type="button">
              <Link2 className="w-3 h-3" /> Auto-Link Sources
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Description (EN)</Label>
              <Textarea value={form.description || ""} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Description (AR)</Label>
              <Textarea value={form.description_ar || ""} onChange={(event) => setForm((prev) => ({ ...prev, description_ar: event.target.value }))} dir="rtl" />
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Media</Label>
            <div className="flex gap-2 mb-2 flex-wrap md:flex-nowrap">
              <Select value={form.media_type || "image"} onValueChange={(value) => setForm((prev) => ({ ...prev, media_type: value }))}>
                <SelectTrigger className="w-full md:w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">
                    <div className="flex items-center gap-1"><ImageIcon size={12} /> Image</div>
                  </SelectItem>
                  <SelectItem value="video">
                    <div className="flex items-center gap-1"><Video size={12} /> Video</div>
                  </SelectItem>
                  <SelectItem value="mixed">
                    <div className="flex items-center gap-1"><Sparkles size={12} /> Mixed</div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input value={mediaUrlInput} onChange={(event) => setMediaUrlInput(event.target.value)} placeholder="Paste URL..." className="flex-1 h-8 text-xs" onKeyDown={(event) => event.key === "Enter" && addMediaUrl()} />
              <Button size="sm" variant="outline" className="h-8" onClick={addMediaUrl} type="button"><Link2 size={14} /></Button>
              <label className="cursor-pointer">
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                <Button type="button" size="sm" variant="outline" className="h-8" asChild disabled={uploadingMedia}>
                  <span>{uploadingMedia ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}</span>
                </Button>
              </label>
            </div>
            {(form.media_urls || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(form.media_urls || []).map((url, index) => (
                  <div key={index} className="relative group">
                    {/\.(mp4|webm|mov)/i.test(url) ? (
                      <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center"><Video className="w-5 h-5 text-muted-foreground" /></div>
                    ) : (
                      <img src={url} className="w-20 h-14 rounded-lg object-cover" alt="" onError={(event) => (event.currentTarget.src = "/placeholder.svg")} />
                    )}
                    <button type="button" onClick={() => removeMedia(index)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Link to Event</Label>
              <Select value={form.linked_event_id || "none"} onValueChange={(value) => applyEventSelection(value === "none" ? null : value)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Link to Destination</Label>
              <Select value={form.linked_destination_id || "none"} onValueChange={(value) => applyDestinationSelection(value === "none" ? null : value)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {destinationOptions.map((destination) => (
                    <SelectItem key={destination.id} value={destination.id}>{destination.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">CTA Destination</Label>
            <Input className="h-8 text-xs" value={form.cta_destination || ""} onChange={(event) => setForm((prev) => ({ ...prev, cta_destination: event.target.value }))} placeholder="Dubai, UAE" />
          </div>

          <div className="bg-card border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><MapPin size={12} /> Cities (Trip Destinations)</Label>
              <span className="text-[10px] text-muted-foreground">Click a city chip to expand its schedule, venue, map & media</span>
            </div>

            {cities.length === 0 && (
              <span className="text-[10px] text-muted-foreground block">No cities added yet</span>
            )}

            <div className="space-y-2">
              {cities.map((city, index) => {
                const isOpen = expandedCity === index;
                const hasSchedule = city.start_date || city.end_date || city.kickoff_time;
                const hasLocation = city.venue || city.google_maps_url || city.latitude !== null;
                const mediaCount = (city.media_urls || []).length;
                return (
                  <div key={`${city.name}-${index}`} className="border border-border rounded-lg bg-background overflow-hidden">
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <button type="button" onClick={() => setExpandedCity(isOpen ? null : index)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                        <MapPin size={12} className="text-primary shrink-0" />
                        <span className="text-xs font-semibold truncate">{city.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {hasSchedule && <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5"><Calendar size={8} />Date</Badge>}
                          {hasLocation && <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5"><MapPin size={8} />Loc</Badge>}
                          {mediaCount > 0 && <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5"><ImageIcon size={8} />{mediaCount}</Badge>}
                        </div>
                      </button>
                      <button type="button" onClick={() => setExpandedCity(isOpen ? null : index)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button type="button" onClick={() => removeCity(index)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Remove city">
                        <X size={14} />
                      </button>
                    </div>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 p-3 space-y-3">
                        <div>
                          <Label className="text-[10px] font-semibold">City name</Label>
                          <Input className="h-8 text-xs" value={city.name} onChange={(e) => updateCity(index, { name: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px] font-semibold flex items-center gap-1"><Calendar size={10} /> Start date</Label>
                            <Input type="date" className="h-8 text-xs" value={city.start_date || ""} onChange={(e) => updateCity(index, { start_date: e.target.value || null })} />
                          </div>
                          <div>
                            <Label className="text-[10px] font-semibold flex items-center gap-1"><Calendar size={10} /> End date</Label>
                            <Input type="date" className="h-8 text-xs" value={city.end_date || ""} onChange={(e) => updateCity(index, { end_date: e.target.value || null })} />
                          </div>
                          <div>
                            <Label className="text-[10px] font-semibold flex items-center gap-1"><Clock size={10} /> Time (24h)</Label>
                            <Input type="time" className="h-8 text-xs" value={city.kickoff_time || ""} onChange={(e) => updateCity(index, { kickoff_time: e.target.value || null })} />
                          </div>
                        </div>

                        <div>
                          <Label className="text-[10px] font-semibold flex items-center gap-1"><MapPin size={10} /> Venue / location</Label>
                          <Input className="h-8 text-xs" placeholder="e.g. Estadio Akron" value={city.venue || ""} onChange={(e) => updateCity(index, { venue: e.target.value || null })} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="md:col-span-1">
                            <Label className="text-[10px] font-semibold">Latitude</Label>
                            <Input type="number" step="any" className="h-8 text-xs" value={city.latitude ?? ""} onChange={(e) => updateCity(index, { latitude: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                          </div>
                          <div className="md:col-span-1">
                            <Label className="text-[10px] font-semibold">Longitude</Label>
                            <Input type="number" step="any" className="h-8 text-xs" value={city.longitude ?? ""} onChange={(e) => updateCity(index, { longitude: e.target.value === "" ? null : parseFloat(e.target.value) })} />
                          </div>
                          <div className="md:col-span-1">
                            <Label className="text-[10px] font-semibold">Google Maps URL</Label>
                            <Input className="h-8 text-xs" placeholder="https://maps.google.com/..." value={city.google_maps_url || ""} onChange={(e) => updateCity(index, { google_maps_url: e.target.value || null })} />
                          </div>
                        </div>

                        <div>
                          <Label className="text-[10px] font-semibold">Notes (optional)</Label>
                          <Textarea className="text-xs min-h-[60px]" placeholder="Anything special about this city/event…" value={city.notes || ""} onChange={(e) => updateCity(index, { notes: e.target.value || null })} />
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Label className="text-[10px] font-semibold flex items-center gap-1">
                              <Sparkles size={10} className="text-primary" /> AI Prompt for this city
                            </Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] gap-1 px-2"
                              onClick={() => updateCity(index, { ai_prompt: buildCityPromptSuggestion(city) })}
                            >
                              <Wand2 size={10} /> Auto-fill
                            </Button>
                          </div>
                          <Textarea
                            className="text-xs min-h-[50px] mt-1"
                            placeholder="Optional. Custom AI instruction for this leg. Date/time included only when set."
                            value={city.ai_prompt || ""}
                            onChange={(e) => updateCity(index, { ai_prompt: e.target.value || null })}
                          />
                          <p className="text-[9px] text-muted-foreground mt-0.5">Sent as a special request when this city is included in a generated trip.</p>
                        </div>

                        <div>
                          <Label className="text-[10px] font-semibold flex items-center gap-1"><ImageIcon size={10} /> City media (images & videos)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <label className="cursor-pointer">
                              <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleCityMediaUpload(index, e)} />
                              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" asChild disabled={uploadingCityMedia === index}>
                                <span>{uploadingCityMedia === index ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />} Upload</span>
                              </Button>
                            </label>
                            <Input
                              className="h-8 text-xs flex-1"
                              placeholder="…or paste a URL and press Enter"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const target = e.currentTarget;
                                  const url = normalizeName(target.value);
                                  if (url) {
                                    updateCity(index, { media_urls: [...(city.media_urls || []), url] });
                                    target.value = "";
                                  }
                                }
                              }}
                            />
                          </div>
                          {(city.media_urls || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {(city.media_urls || []).map((url, mi) => (
                                <div key={mi} className="relative group">
                                  {/\.(mp4|webm|mov)/i.test(url) ? (
                                    <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center"><Video className="w-5 h-5 text-muted-foreground" /></div>
                                  ) : (
                                    <img src={url} className="w-20 h-14 rounded-lg object-cover" alt="" onError={(e) => (e.currentTarget.src = "/placeholder.svg")} />
                                  )}
                                  <button type="button" onClick={() => removeCityMedia(index, mi)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
              <Select onValueChange={(value) => addCity(value)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick from destinations..." /></SelectTrigger>
                <SelectContent>
                  {destinationOptions.map((destination) => (
                    <SelectItem key={destination.id} value={destination.label}>{destination.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs"
                placeholder="Add new city manually..."
                value={newCity}
                onChange={(event) => setNewCity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCity(newCity);
                  }
                }}
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addCity(newCity)} disabled={!normalizeName(newCity)} type="button">
                <Plus size={12} /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Each city becomes a planner leg. Optional: add date, time, venue, map link, and media — they'll be passed to the trip plan as special requests.</p>
          </div>

          <div className="bg-card border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5"><Ticket size={12} /> Activities & Places (AI Instructions)</Label>
              <span className="text-[10px] text-muted-foreground">Click a chip to edit it</span>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {activities.map((activity, index) => (
                <Badge key={`${activity.name}-${index}`} variant="outline" className="gap-1 text-xs py-0.5">
                  <button type="button" onClick={() => editActivity(index)} className="hover:underline">{activity.name}</button>
                  <button type="button" onClick={() => removeActivity(index)} className="hover:text-destructive">×</button>
                </Badge>
              ))}
              {activities.length === 0 && <span className="text-[10px] text-muted-foreground">No places added yet</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <Input
                className="h-8 text-xs"
                placeholder="Add landmark, restaurant, attraction, district, or activity..."
                value={newActivity}
                onChange={(event) => setNewActivity(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addActivity(newActivity);
                  }
                }}
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addActivity(newActivity)} disabled={!normalizeName(newActivity)} type="button">
                <Plus size={12} /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Landmarks, restaurants, attractions, neighborhoods, fan zones, stadiums — NOT cities. Injected into the planner as AI instructions.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold">Start Date</Label>
              <Input type="date" className="h-8 text-xs" value={form.start_date || ""} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value || null }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold">End Date</Label>
              <Input type="date" className="h-8 text-xs" value={form.end_date || ""} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value || null }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Sort Order</Label>
              <Input type="number" className="h-8 text-xs" value={form.sort_order || 0} onChange={(event) => setForm((prev) => ({ ...prev, sort_order: Number(event.target.value) || 0 }))} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={!!form.is_active} onCheckedChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} />
            <Label className="text-xs">Active</Label>
          </div>

          {/* Promotion-level AI prompt */}
          <div className="bg-card border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles size={12} className="text-primary" /> AI Prompt (sent to trip planner)
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                onClick={() => setForm((prev) => ({ ...prev, ai_prompt: buildPromotionPromptSuggestion(prev, cities) }))}
              >
                <Wand2 size={11} /> Auto-fill from fields
              </Button>
            </div>
            <Textarea
              className="text-xs min-h-[70px]"
              placeholder="Optional. Custom instructions for the AI when generating trips from this promotion. Date/time included only when set."
              value={form.ai_prompt || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, ai_prompt: e.target.value }))}
            />
            <p className="text-[10px] text-muted-foreground">
              When users click "Plan trip" on this promotion, this prompt is injected as a special request to the AI. Leave empty to use defaults.
            </p>
          </div>

          {/* Live Preview: How data will be passed to the planner */}
          {(cities.length > 0 || activities.length > 0) && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Eye size={14} className="text-blue-600" />
                <span className="text-xs font-bold text-blue-700 dark:text-blue-400">Planner Preview — How this data will be used</span>
              </div>
              {cities.length > 0 && (
                <div className="text-[11px] space-y-0.5">
                  <span className="font-semibold text-blue-600">🏙️ Trip Destinations (multiCities):</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {cities.map((c, i) => (
                      <span key={i} className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded text-[10px] font-mono">{c.name}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-blue-500">→ Each city becomes a separate leg in the trip planner with its own days & activities.</p>
                </div>
              )}
              {activities.length > 0 && (
                <div className="text-[11px] space-y-0.5">
                  <span className="font-semibold text-blue-600">📍 AI Instructions (specialPlaces):</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {activities.map((a, i) => (
                      <span key={i} className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded text-[10px] font-mono">{a.name}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">→ These are NOT cities. They will be injected as special AI instructions: "Include these landmarks, restaurants, and attractions in the trip plan."</p>
                </div>
              )}
              {form.cta_destination && (
                <div className="text-[10px] text-muted-foreground">
                  <span className="font-semibold">CTA Destination:</span> <code className="bg-muted px-1 rounded">{form.cta_destination}</code>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={savePromotion} type="button"><Save className="w-4 h-4 mr-1" /> Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditing(null); resetEditor(); }} type="button"><X className="w-4 h-4 mr-1" /> Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {promotions
          .filter((promotion) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const placesText = (promotion.included_places || [])
              .map((p: any) => (typeof p === "string" ? p : p?.name || "")).join(" ").toLowerCase();
            return (
              (promotion.title || "").toLowerCase().includes(q) ||
              (promotion.title_ar || "").toLowerCase().includes(q) ||
              (promotion.description || "").toLowerCase().includes(q) ||
              (promotion.cta_destination || "").toLowerCase().includes(q) ||
              placesText.includes(q)
            );
          })
          .map((promotion) => {
          const cityCount = (promotion.included_places || []).filter((place: any) => place?.type === "city").length;
          const activityCount = (promotion.included_places || []).filter((place: any) => place?.type === "activity").length;
          return (
            <div key={promotion.id} className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 hover:shadow-sm transition-shadow">
              {promotion.media_urls?.[0] ? (
                /\.(mp4|webm|mov)/i.test(promotion.media_urls[0]) ? (
                  <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Video className="w-5 h-5 text-muted-foreground" /></div>
                ) : (
                  <img src={promotion.media_urls[0]} className="w-16 h-12 rounded-lg object-cover flex-shrink-0" alt="" />
                )
              ) : (
                <div className="w-16 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><Megaphone className="w-5 h-5 text-muted-foreground" /></div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{promotion.title}</span>
                  <Badge variant={promotion.is_active ? "default" : "destructive"} className="text-[10px]">{promotion.is_active ? "Active" : "Hidden"}</Badge>
                  {cityCount > 0 && <Badge variant="outline" className="text-[10px]">🏙️ {cityCount}</Badge>}
                  {activityCount > 0 && <Badge variant="outline" className="text-[10px]">📍 {activityCount}</Badge>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="truncate">{promotion.description?.slice(0, 60)}</span>
                  {promotion.updated_at && <span className="flex items-center gap-0.5 shrink-0"><Clock size={8} /> {format(new Date(promotion.updated_at), "dd/MM HH:mm")}</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Switch checked={promotion.is_active} onCheckedChange={async (value) => {
                  await supabase.from("promotions").update({ is_active: value }).eq("id", promotion.id);
                  setPromotions((prev) => prev.map((item) => item.id === promotion.id ? { ...item, is_active: value } : item));
                }} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(`/promotions/${promotion.id}`, "_blank")} type="button"><Eye size={12} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(promotion)} type="button"><Pencil size={12} /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePromotion(promotion.id)} type="button"><Trash2 size={12} /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPromotions;
