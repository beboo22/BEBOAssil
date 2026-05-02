import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Package, Plus, Trash2, Save, Loader2, Settings, Tag, ToggleLeft, Users, Gift, MapPin, ChevronUp, ChevronDown, Brain, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Plan {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  price: number;
  currency: string;
  duration_days: number;
  daily_limit: number;
  max_daily_generations: number;
  max_monthly_generations: number;
  max_generation_days: number;
  max_activities_per_day: number;
  max_total_activities: number;
  voice_enabled: boolean;
  chat_enabled: boolean;
  weather_enabled: boolean;
  news_enabled: boolean;
  emergency_enabled: boolean;
  max_chat_uses: number;
  max_voice_uses: number;
  max_weather_uses: number;
  max_emergency_uses: number;
  max_news_uses: number;
  // SerpAPI plan-level controls
  serpapi_flights_enabled: boolean;
  serpapi_hotels_enabled: boolean;
  max_serpapi_flight_searches: number;
  max_serpapi_hotel_searches: number;
  max_flight_results_per_search: number;
  max_hotel_results_per_search: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
  // Regeneration costs (admin-controlled)
  regen_activity_cost: number;
  regen_day_multiplier: number;
  regen_full_multiplier: number;
}

interface DataSource {
  id: string;
  name: string;
  type: string;
  priority: number;
  enabled: boolean;
  apiKeyName: string;
  description: string;
  maxDailyRequests: number;
}

interface AIModel {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  secretName: string;
  description: string;
  maxDailyRequests: number;
}

interface SiteSettings {
  guest_trial_limit: number;
  free_user_daily_limit: number;
  guest_generation_enabled: boolean;
  guest_chat_enabled: boolean;
  guest_voice_enabled: boolean;
  guest_max_chat_uses: number;
  guest_max_voice_uses: number;
  announcement_banner_text: string;
  announcement_banner_enabled: boolean;
  data_sources_config: DataSource[];
  ai_models_config: AIModel[];
  regen_costs_config: { activity: number; day: number; full: number };
  flex_plan_config: { enabled: boolean; base_price: number; per_trip: number; per_day: number; per_activity: number; min_price: number; currency: string; duration_days: number };
}

interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  discount_amount: number;
  applicable_to: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
}

const DEFAULT_DATA_SOURCES: DataSource[] = [
  { id: 'serpapi', name: 'SerpAPI (Google Maps)', type: 'places', priority: 1, enabled: true, apiKeyName: 'SERPAPI_KEY', description: 'Primary source for coordinates, reviews and images', maxDailyRequests: 1000 },
  { id: 'serper', name: 'Serper.dev (Maps/Places)', type: 'places', priority: 2, enabled: true, apiKeyName: 'SERPER_API_KEY', description: 'Secondary places data with maps integration', maxDailyRequests: 2500 },
  { id: 'rapidapi', name: 'RapidAPI Google Maps Places', type: 'places', priority: 3, enabled: true, apiKeyName: 'RAPIDAPI_KEY', description: 'Google Map Places v2 via RapidAPI', maxDailyRequests: 500 },
  { id: 'ai', name: 'AI Enrichment (Fallback)', type: 'ai', priority: 4, enabled: true, apiKeyName: 'LOVABLE_API_KEY', description: 'AI-generated metadata as last resort', maxDailyRequests: 0 },
];

const DEFAULT_AI_MODELS: AIModel[] = [
  { id: 'aiml', name: 'AIML API (GPT-4o)', priority: 1, enabled: true, secretName: 'AIML_API_KEY', description: 'Primary AI model for trip generation', maxDailyRequests: 500 },
  { id: 'openrouter', name: 'OpenRouter', priority: 2, enabled: true, secretName: 'OPENROUTER_API_KEY', description: 'Multi-model router as secondary option', maxDailyRequests: 1000 },
  { id: 'lovable', name: 'Lovable AI', priority: 3, enabled: true, secretName: 'LOVABLE_API_KEY', description: 'Built-in AI as final fallback', maxDailyRequests: 0 },
];

const AdminSubscriptions = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [settings, setSettings] = useState<SiteSettings>({
    guest_trial_limit: 1, free_user_daily_limit: 5, guest_generation_enabled: true,
    guest_chat_enabled: false, guest_voice_enabled: false, guest_max_chat_uses: 0, guest_max_voice_uses: 0,
    announcement_banner_text: '', announcement_banner_enabled: false,
    data_sources_config: DEFAULT_DATA_SOURCES, ai_models_config: DEFAULT_AI_MODELS,
    regen_costs_config: { activity: 0.25, day: 0.5, full: 1.0 },
    flex_plan_config: { enabled: false, base_price: 5, per_trip: 2, per_day: 1, per_activity: 0.5, min_price: 5, currency: 'USD', duration_days: 30 },
  });
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDS, setSavingDS] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [newDiscount, setNewDiscount] = useState({ code: '', description: '', discount_percent: 10, max_uses: 100 });

  const [overrideEmail, setOverrideEmail] = useState('');
  const [overrideValue, setOverrideValue] = useState(10);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideType, setOverrideType] = useState<'bonus_generations' | 'bonus_activities'>('bonus_activities');
  const [grantingOverride, setGrantingOverride] = useState(false);
  const [overrides, setOverrides] = useState<any[]>([]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [plansRes, settingsRes, discountsRes, overridesRes] = await Promise.all([
      supabase.from("subscription_plans").select("*").order("sort_order"),
      supabase.from("site_settings").select("*").eq("id", "default").single(),
      supabase.from("discount_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("user_generation_overrides").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (plansRes.data) setPlans(plansRes.data.map((p: any) => ({
      ...p,
      features: Array.isArray(p.features) ? p.features : [],
      max_activities_per_day: p.max_activities_per_day ?? 7,
      max_total_activities: p.max_total_activities ?? 0,
      serpapi_flights_enabled: !!p.serpapi_flights_enabled,
      serpapi_hotels_enabled: !!p.serpapi_hotels_enabled,
      max_serpapi_flight_searches: p.max_serpapi_flight_searches ?? 0,
      max_serpapi_hotel_searches: p.max_serpapi_hotel_searches ?? 0,
      max_flight_results_per_search: p.max_flight_results_per_search ?? 8,
      max_hotel_results_per_search: p.max_hotel_results_per_search ?? 12,
      max_news_uses: p.max_news_uses ?? 0,
      regen_activity_cost: Number(p.regen_activity_cost ?? 1) || 1,
      regen_day_multiplier: Number(p.regen_day_multiplier ?? 1.5) || 1.5,
      regen_full_multiplier: Number(p.regen_full_multiplier ?? 1.5) || 1.5,
    })));
    if (settingsRes.data) {
      const s = settingsRes.data as any;
      setSettings({
        guest_trial_limit: s.guest_trial_limit,
        free_user_daily_limit: s.free_user_daily_limit,
        guest_generation_enabled: s.guest_generation_enabled !== false,
        guest_chat_enabled: s.guest_chat_enabled || false,
        guest_voice_enabled: s.guest_voice_enabled || false,
        guest_max_chat_uses: s.guest_max_chat_uses || 0,
        guest_max_voice_uses: s.guest_max_voice_uses || 0,
        announcement_banner_text: s.announcement_banner_text || '',
        announcement_banner_enabled: s.announcement_banner_enabled || false,
        data_sources_config: Array.isArray(s.data_sources_config) && s.data_sources_config.length > 0 ? s.data_sources_config : DEFAULT_DATA_SOURCES,
        ai_models_config: Array.isArray(s.ai_models_config) && s.ai_models_config.length > 0 ? s.ai_models_config : DEFAULT_AI_MODELS,
        regen_costs_config: s.regen_costs_config || { activity: 0.25, day: 0.5, full: 1.0 },
        flex_plan_config: s.flex_plan_config || { enabled: false, base_price: 5, per_trip: 2, per_day: 1, per_activity: 0.5, min_price: 5, currency: 'USD', duration_days: 30 },
      });
    }
    if (discountsRes.data) setDiscounts(discountsRes.data as any);
    if (overridesRes.data) setOverrides(overridesRes.data);
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    const { error } = await supabase.from("site_settings").update({
      guest_trial_limit: settings.guest_trial_limit,
      free_user_daily_limit: settings.free_user_daily_limit,
      guest_generation_enabled: settings.guest_generation_enabled,
      guest_chat_enabled: settings.guest_chat_enabled,
      guest_voice_enabled: settings.guest_voice_enabled,
      guest_max_chat_uses: settings.guest_max_chat_uses,
      guest_max_voice_uses: settings.guest_max_voice_uses,
      announcement_banner_text: settings.announcement_banner_text,
      announcement_banner_enabled: settings.announcement_banner_enabled,
      regen_costs_config: settings.regen_costs_config as any,
      flex_plan_config: settings.flex_plan_config as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", "default");
    if (error) toast.error("Failed to save settings"); else toast.success("✅ Settings saved");
    setSaving(false);
  };

  const saveDataSources = async () => {
    setSavingDS(true);
    const { error } = await supabase.from("site_settings").update({
      data_sources_config: settings.data_sources_config as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", "default");
    if (error) toast.error("Failed to save data sources"); else toast.success("✅ Data sources saved & will be used in next generation");
    setSavingDS(false);
  };

  const saveAIModels = async () => {
    setSavingAI(true);
    const { error } = await supabase.from("site_settings").update({
      ai_models_config: settings.ai_models_config as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", "default");
    if (error) toast.error("Failed to save AI models"); else toast.success("✅ AI models config saved");
    setSavingAI(false);
  };

  const moveDSPriority = (id: string, direction: 'up' | 'down') => {
    setSettings(prev => {
      const arr = [...prev.data_sources_config].sort((a, b) => a.priority - b.priority);
      const idx = arr.findIndex(s => s.id === id);
      if (direction === 'up' && idx > 0) {
        const tmp = arr[idx].priority;
        arr[idx].priority = arr[idx - 1].priority;
        arr[idx - 1].priority = tmp;
      } else if (direction === 'down' && idx < arr.length - 1) {
        const tmp = arr[idx].priority;
        arr[idx].priority = arr[idx + 1].priority;
        arr[idx + 1].priority = tmp;
      }
      return { ...prev, data_sources_config: arr };
    });
  };

  const moveAIPriority = (id: string, direction: 'up' | 'down') => {
    setSettings(prev => {
      const arr = [...prev.ai_models_config].sort((a, b) => a.priority - b.priority);
      const idx = arr.findIndex(s => s.id === id);
      if (direction === 'up' && idx > 0) {
        const tmp = arr[idx].priority;
        arr[idx].priority = arr[idx - 1].priority;
        arr[idx - 1].priority = tmp;
      } else if (direction === 'down' && idx < arr.length - 1) {
        const tmp = arr[idx].priority;
        arr[idx].priority = arr[idx + 1].priority;
        arr[idx + 1].priority = tmp;
      }
      return { ...prev, ai_models_config: arr };
    });
  };

  const savePlan = async (plan: Plan) => {
    const { id, ...data } = plan;
    const payload = { ...data, features: data.features as any, updated_at: new Date().toISOString() };
    const { error } = id.startsWith("new-")
      ? await supabase.from("subscription_plans").insert(payload)
      : await supabase.from("subscription_plans").update(payload).eq("id", id);
    if (error) toast.error("Failed to save plan"); else { toast.success("✅ Plan saved"); setEditingPlan(null); fetchAll(); }
  };

  const deletePlan = async (id: string) => {
    if (id.startsWith("new-")) { setPlans(prev => prev.filter(p => p.id !== id)); return; }
    const { error } = await supabase.from("subscription_plans").delete().eq("id", id);
    if (error) toast.error("Failed"); else { toast.success("🗑️ Deleted"); fetchAll(); }
  };

  const addDiscount = async () => {
    if (!newDiscount.code) return;
    const { error } = await supabase.from("discount_codes").insert({
      code: newDiscount.code.toUpperCase(),
      description: newDiscount.description,
      discount_percent: newDiscount.discount_percent,
      max_uses: newDiscount.max_uses,
    });
    if (error) toast.error(error.message); else { toast.success("✅ Discount code created"); setNewDiscount({ code: '', description: '', discount_percent: 10, max_uses: 100 }); fetchAll(); }
  };

  const toggleDiscount = async (id: string, active: boolean) => {
    await supabase.from("discount_codes").update({ is_active: active }).eq("id", id);
    fetchAll();
  };

  const deleteDiscount = async (id: string) => {
    await supabase.from("discount_codes").delete().eq("id", id);
    toast.success("🗑️ Deleted");
    fetchAll();
  };

  const grantOverride = async () => {
    if (!overrideEmail.trim()) { toast.error("Enter user email"); return; }
    setGrantingOverride(true);
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", overrideEmail.trim()).maybeSingle();
    if (!profile) { toast.error("User not found"); setGrantingOverride(false); return; }
    const { error } = await supabase.from("user_generation_overrides").insert({
      user_id: profile.id,
      override_type: overrideType,
      value: overrideValue,
      reason: overrideReason || null,
      granted_by: user?.id || null,
    });
    if (error) toast.error(error.message);
    else { toast.success(`✅ Granted ${overrideValue} bonus ${overrideType === 'bonus_activities' ? 'activities' : 'generations'}`); setOverrideEmail(''); setOverrideReason(''); fetchAll(); }
    setGrantingOverride(false);
  };

  const newPlanTemplate = (): Plan => ({
    id: `new-${Date.now()}`, name: '', name_ar: '', description: '', description_ar: '',
    price: 0, currency: 'USD', duration_days: 30, daily_limit: 50,
    max_daily_generations: 10, max_monthly_generations: 100, max_generation_days: 14,
    max_activities_per_day: 7, max_total_activities: 0,
    voice_enabled: false, chat_enabled: true, weather_enabled: true,
    news_enabled: false, emergency_enabled: false,
    max_chat_uses: 0, max_voice_uses: 0,
    max_weather_uses: 0, max_emergency_uses: 0, max_news_uses: 0,
    serpapi_flights_enabled: false, serpapi_hotels_enabled: false,
    max_serpapi_flight_searches: 0, max_serpapi_hotel_searches: 0,
    max_flight_results_per_search: 8, max_hotel_results_per_search: 12,
    features: [], is_active: true, sort_order: plans.length + 1,
    regen_activity_cost: 1, regen_day_multiplier: 1.5, regen_full_multiplier: 1.5,
  });

  const addNewDataSource = () => {
    const newDS: DataSource = {
      id: `custom-${Date.now()}`,
      name: 'New Data Source',
      type: 'places',
      priority: settings.data_sources_config.length + 1,
      enabled: false,
      apiKeyName: '',
      description: '',
      maxDailyRequests: 100,
    };
    setSettings(prev => ({ ...prev, data_sources_config: [...prev.data_sources_config, newDS] }));
  };

  const addNewAIModel = () => {
    const newModel: AIModel = {
      id: `custom-ai-${Date.now()}`,
      name: 'New AI Model',
      priority: settings.ai_models_config.length + 1,
      enabled: false,
      secretName: '',
      description: '',
      maxDailyRequests: 100,
    };
    setSettings(prev => ({ ...prev, ai_models_config: [...prev.ai_models_config, newModel] }));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Site Settings */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-primary" />
          <h4 className="font-bold text-foreground">Trial & Usage Settings</h4>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <Switch checked={settings.guest_generation_enabled} onCheckedChange={v => setSettings(s => ({ ...s, guest_generation_enabled: v }))} />
            <Label className="text-xs font-medium">🔓 Allow Guest Generation (without login)</Label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Guest Daily Limit (per device)</Label>
              <Input type="number" min={0} value={settings.guest_trial_limit} onChange={e => setSettings(s => ({ ...s, guest_trial_limit: Number(e.target.value) }))} disabled={!settings.guest_generation_enabled} />
            </div>
            <div>
              <Label className="text-xs">Free User Daily Limit</Label>
              <Input type="number" min={0} value={settings.free_user_daily_limit} onChange={e => setSettings(s => ({ ...s, free_user_daily_limit: Number(e.target.value) }))} />
            </div>
          </div>
          {/* Guest AI Access Controls */}
          <div className="border-t border-border pt-3 mt-3">
            <h5 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">🤖 Guest AI Access (Chatbot & Voice)</h5>
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <Switch checked={settings.guest_chat_enabled} onCheckedChange={v => setSettings(s => ({ ...s, guest_chat_enabled: v }))} />
                <Label className="text-xs font-medium">💬 Allow Guest Chatbot Access</Label>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <Switch checked={settings.guest_voice_enabled} onCheckedChange={v => setSettings(s => ({ ...s, guest_voice_enabled: v }))} />
                <Label className="text-xs font-medium">🎙️ Allow Guest Voice/Call Access</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px]">Guest Max Chat Uses (per device/day, 0=unlimited)</Label>
                  <Input type="number" min={0} value={settings.guest_max_chat_uses} onChange={e => setSettings(s => ({ ...s, guest_max_chat_uses: Number(e.target.value) }))} disabled={!settings.guest_chat_enabled} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">Guest Max Voice Uses (per device/day, 0=unlimited)</Label>
                  <Input type="number" min={0} value={settings.guest_max_voice_uses} onChange={e => setSettings(s => ({ ...s, guest_max_voice_uses: Number(e.target.value) }))} disabled={!settings.guest_voice_enabled} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch checked={settings.announcement_banner_enabled} onCheckedChange={v => setSettings(s => ({ ...s, announcement_banner_enabled: v }))} />
            <Label className="text-xs">Show Announcement Banner</Label>
          </div>
          <Textarea placeholder="Banner text..." value={settings.announcement_banner_text} onChange={e => setSettings(s => ({ ...s, announcement_banner_text: e.target.value }))} dir="auto" className="text-sm" />
        </div>
        {/* Regeneration Costs */}
        <div className="border-t border-border pt-4 mt-4">
          <h5 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">🔄 Regeneration Costs (deducted from daily generations)</h5>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px]">Single Activity Cost</Label>
              <Input type="number" step="0.25" min={0} value={settings.regen_costs_config.activity} onChange={e => setSettings(s => ({ ...s, regen_costs_config: { ...s.regen_costs_config, activity: Number(e.target.value) } }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Full Day Cost</Label>
              <Input type="number" step="0.25" min={0} value={settings.regen_costs_config.day} onChange={e => setSettings(s => ({ ...s, regen_costs_config: { ...s.regen_costs_config, day: Number(e.target.value) } }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Full Plan Cost</Label>
              <Input type="number" step="0.25" min={0} value={settings.regen_costs_config.full} onChange={e => setSettings(s => ({ ...s, regen_costs_config: { ...s.regen_costs_config, full: Number(e.target.value) } }))} className="h-8 text-xs" />
            </div>
          </div>
        </div>

        {/* Flexible Plan Config */}
        <div className="border-t border-border pt-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Switch checked={settings.flex_plan_config.enabled} onCheckedChange={v => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, enabled: v } }))} />
            <h5 className="text-xs font-bold text-foreground">🎛️ Flexible Plan Builder (users build custom plans)</h5>
          </div>
          {settings.flex_plan_config.enabled && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-[10px]">Base Price</Label><Input type="number" step="0.5" value={settings.flex_plan_config.base_price} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, base_price: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Per Trip (+)</Label><Input type="number" step="0.5" value={settings.flex_plan_config.per_trip} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, per_trip: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Per Day (+)</Label><Input type="number" step="0.5" value={settings.flex_plan_config.per_day} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, per_day: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Per Activity (+)</Label><Input type="number" step="0.1" value={settings.flex_plan_config.per_activity} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, per_activity: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Min Price</Label><Input type="number" value={settings.flex_plan_config.min_price} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, min_price: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Currency</Label><Input value={settings.flex_plan_config.currency} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, currency: e.target.value } }))} className="h-8 text-xs" /></div>
              <div><Label className="text-[10px]">Duration (days)</Label><Input type="number" value={settings.flex_plan_config.duration_days} onChange={e => setSettings(s => ({ ...s, flex_plan_config: { ...s.flex_plan_config, duration_days: Number(e.target.value) } }))} className="h-8 text-xs" /></div>
            </div>
          )}
        </div>

        <Button size="sm" onClick={saveSettings} disabled={saving} className="gap-1">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Settings
        </Button>
      </div>

      {/* Subscription Plans */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-primary" />
            <h4 className="font-bold text-foreground">Subscription Plans</h4>
          </div>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => {
            const np = newPlanTemplate();
            setPlans(prev => [...prev, np]);
            setEditingPlan(np);
          }}>
            <Plus size={14} /> Add Plan
          </Button>
        </div>

        <div className="space-y-3">
          {plans.map(plan => (
            <div key={plan.id} className="border border-border rounded-lg p-3 space-y-2">
              {editingPlan?.id === plan.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div><Label className="text-[10px]">Name (EN)</Label><Input value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Name (AR)</Label><Input value={editingPlan.name_ar || ''} onChange={e => setEditingPlan({ ...editingPlan, name_ar: e.target.value })} className="h-8 text-xs" dir="rtl" /></div>
                    <div><Label className="text-[10px]">Price</Label><Input type="number" step="0.01" value={editingPlan.price} onChange={e => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Currency</Label><Input value={editingPlan.currency} onChange={e => setEditingPlan({ ...editingPlan, currency: e.target.value })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Duration (days)</Label><Input type="number" value={editingPlan.duration_days} onChange={e => setEditingPlan({ ...editingPlan, duration_days: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Sort Order</Label><Input type="number" value={editingPlan.sort_order} onChange={e => setEditingPlan({ ...editingPlan, sort_order: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Daily Generations</Label><Input type="number" value={editingPlan.max_daily_generations} onChange={e => setEditingPlan({ ...editingPlan, max_daily_generations: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Monthly Generations</Label><Input type="number" value={editingPlan.max_monthly_generations} onChange={e => setEditingPlan({ ...editingPlan, max_monthly_generations: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div><Label className="text-[10px]">Max Trip Days</Label><Input type="number" value={editingPlan.max_generation_days} onChange={e => setEditingPlan({ ...editingPlan, max_generation_days: Number(e.target.value) })} className="h-8 text-xs" /></div>
                    <div>
                      <Label className="text-[10px] font-bold text-primary">🎯 Activities/Day (per plan)</Label>
                      <Input type="number" min={1} max={20} value={editingPlan.max_activities_per_day} onChange={e => setEditingPlan({ ...editingPlan, max_activities_per_day: Number(e.target.value) })} className="h-8 text-xs border-primary/50" />
                      <p className="text-[9px] text-muted-foreground mt-0.5">Controls max activities generated per day for this plan</p>
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold text-amber-600">📊 Total Activities (entire subscription)</Label>
                      <Input type="number" min={0} value={editingPlan.max_total_activities} onChange={e => setEditingPlan({ ...editingPlan, max_total_activities: Number(e.target.value) })} className="h-8 text-xs border-amber-500/50" />
                      <p className="text-[9px] text-muted-foreground mt-0.5">0 = unlimited. Total activities allowed during the entire subscription period</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-2 rounded-lg border border-purple-500/30 bg-purple-500/5">
                    <div className="col-span-3">
                      <Label className="text-[11px] font-bold text-purple-600">♻️ Regeneration Costs</Label>
                      <p className="text-[9px] text-muted-foreground">Activity cost = credits per single-activity regen. Day/Full multipliers × number of activities = credits deducted (rounded up).</p>
                    </div>
                    <div>
                      <Label className="text-[10px]">Activity cost</Label>
                      <Input type="number" step="0.5" min={0} value={editingPlan.regen_activity_cost ?? 1} onChange={e => setEditingPlan({ ...editingPlan, regen_activity_cost: Number(e.target.value) })} className="h-8 text-xs border-purple-500/50" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Day multiplier</Label>
                      <Input type="number" step="0.1" min={0} value={editingPlan.regen_day_multiplier ?? 1.5} onChange={e => setEditingPlan({ ...editingPlan, regen_day_multiplier: Number(e.target.value) })} className="h-8 text-xs border-purple-500/50" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Full multiplier</Label>
                      <Input type="number" step="0.1" min={0} value={editingPlan.regen_full_multiplier ?? 1.5} onChange={e => setEditingPlan({ ...editingPlan, regen_full_multiplier: Number(e.target.value) })} className="h-8 text-xs border-purple-500/50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-[10px]">Description (EN)</Label><Textarea value={editingPlan.description || ''} onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })} className="text-xs min-h-[40px]" /></div>
                    <div><Label className="text-[10px]">Description (AR)</Label><Textarea value={editingPlan.description_ar || ''} onChange={e => setEditingPlan({ ...editingPlan, description_ar: e.target.value })} className="text-xs min-h-[40px]" dir="rtl" /></div>
                  </div>
                  <div><Label className="text-[10px]">Features (EN & AR, one per line)</Label>
                    <Textarea value={editingPlan.features.join('\n')} onChange={e => setEditingPlan({ ...editingPlan, features: e.target.value.split('\n').filter(Boolean) })} className="text-xs min-h-[60px]" />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {(['voice_enabled', 'chat_enabled', 'weather_enabled', 'news_enabled', 'emergency_enabled'] as const).map(key => (
                      <div key={key} className="flex items-center gap-1">
                        <Switch checked={editingPlan[key]} onCheckedChange={v => setEditingPlan({ ...editingPlan, [key]: v })} />
                        <Label className="text-[10px] capitalize">{key.replace('_enabled', '').replace('_', ' ')}</Label>
                      </div>
                    ))}
                    <div className="flex items-center gap-1">
                      <Switch checked={editingPlan.is_active} onCheckedChange={v => setEditingPlan({ ...editingPlan, is_active: v })} />
                      <Label className="text-[10px]">Active</Label>
                    </div>
                  </div>
                  {/* Max usage for chat & voice */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px]">Max Chat Uses (0 = unlimited)</Label>
                      <Input type="number" value={(editingPlan as any).max_chat_uses || 0} onChange={e => setEditingPlan({ ...editingPlan, max_chat_uses: parseInt(e.target.value) || 0 } as any)} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">Max Voice Uses (0 = unlimited)</Label>
                      <Input type="number" value={(editingPlan as any).max_voice_uses || 0} onChange={e => setEditingPlan({ ...editingPlan, max_voice_uses: parseInt(e.target.value) || 0 } as any)} className="h-7 text-xs" />
                    </div>
                  </div>

                  {/* Weather, Emergency & News Quotas */}
                  <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <Settings size={14} className="text-primary" />
                      <h5 className="text-xs font-bold text-foreground">🌤️ Weather, 🚨 Emergency & 📰 News Quotas</h5>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Toggle the feature above (Weather/Emergency/News switches). Then set how many times the user can fetch
                      live data per subscription period (0 = unlimited).
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1 p-2 rounded bg-background/50">
                        <Label className="text-[11px] font-semibold">🌤️ Weather Forecast</Label>
                        <Label className="text-[9px] text-muted-foreground">Max Weather Fetches per period (0 = unlimited)</Label>
                        <Input
                          type="number" min={0}
                          value={editingPlan.max_weather_uses}
                          onChange={e => setEditingPlan({ ...editingPlan, max_weather_uses: parseInt(e.target.value) || 0 })}
                          disabled={!editingPlan.weather_enabled}
                          className="h-7 text-xs"
                        />
                        {!editingPlan.weather_enabled && (
                          <p className="text-[9px] text-amber-600">Enable "weather" toggle above to allow this feature.</p>
                        )}
                      </div>
                      <div className="space-y-1 p-2 rounded bg-background/50">
                        <Label className="text-[11px] font-semibold">🚨 Emergency Numbers</Label>
                        <Label className="text-[9px] text-muted-foreground">Max Emergency Fetches per period (0 = unlimited)</Label>
                        <Input
                          type="number" min={0}
                          value={editingPlan.max_emergency_uses}
                          onChange={e => setEditingPlan({ ...editingPlan, max_emergency_uses: parseInt(e.target.value) || 0 })}
                          disabled={!editingPlan.emergency_enabled}
                          className="h-7 text-xs"
                        />
                        {!editingPlan.emergency_enabled && (
                          <p className="text-[9px] text-amber-600">Enable "emergency" toggle above to allow this feature.</p>
                        )}
                      </div>
                      <div className="space-y-1 p-2 rounded bg-background/50">
                        <Label className="text-[11px] font-semibold">📰 Travel News</Label>
                        <Label className="text-[9px] text-muted-foreground">Max News Fetches per period (0 = unlimited)</Label>
                        <Input
                          type="number" min={0}
                          value={editingPlan.max_news_uses}
                          onChange={e => setEditingPlan({ ...editingPlan, max_news_uses: parseInt(e.target.value) || 0 })}
                          disabled={!editingPlan.news_enabled}
                          className="h-7 text-xs"
                        />
                        {!editingPlan.news_enabled && (
                          <p className="text-[9px] text-amber-600">Enable "news" toggle above to allow this feature.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SerpAPI Plan Limits */}
                  <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <Database size={14} className="text-primary" />
                      <h5 className="text-xs font-bold text-foreground">🌐 SerpAPI Search Quotas (Live Flights & Hotels)</h5>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Control whether this plan can fetch live results from Google Flights/Hotels (SerpAPI).
                      Disabled plans will silently fall back to alternative providers (Aviasales/Trip.com).
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2 p-2 rounded bg-background/50">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editingPlan.serpapi_flights_enabled}
                            onCheckedChange={v => setEditingPlan({ ...editingPlan, serpapi_flights_enabled: v })}
                          />
                          <Label className="text-[11px] font-semibold">✈️ SerpAPI Flights</Label>
                        </div>
                        <div>
                          <Label className="text-[9px] text-muted-foreground">Max Flight Searches per period (0 = unlimited)</Label>
                          <Input
                            type="number" min={0}
                            value={editingPlan.max_serpapi_flight_searches}
                            onChange={e => setEditingPlan({ ...editingPlan, max_serpapi_flight_searches: parseInt(e.target.value) || 0 })}
                            disabled={!editingPlan.serpapi_flights_enabled}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] text-muted-foreground">Max Flight Results per search</Label>
                          <Input
                            type="number" min={1} max={50}
                            value={editingPlan.max_flight_results_per_search}
                            onChange={e => setEditingPlan({ ...editingPlan, max_flight_results_per_search: parseInt(e.target.value) || 8 })}
                            disabled={!editingPlan.serpapi_flights_enabled}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-2 p-2 rounded bg-background/50">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={editingPlan.serpapi_hotels_enabled}
                            onCheckedChange={v => setEditingPlan({ ...editingPlan, serpapi_hotels_enabled: v })}
                          />
                          <Label className="text-[11px] font-semibold">🏨 SerpAPI Hotels</Label>
                        </div>
                        <div>
                          <Label className="text-[9px] text-muted-foreground">Max Hotel Searches per period (0 = unlimited)</Label>
                          <Input
                            type="number" min={0}
                            value={editingPlan.max_serpapi_hotel_searches}
                            onChange={e => setEditingPlan({ ...editingPlan, max_serpapi_hotel_searches: parseInt(e.target.value) || 0 })}
                            disabled={!editingPlan.serpapi_hotels_enabled}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[9px] text-muted-foreground">Max Hotel Results per search</Label>
                          <Input
                            type="number" min={1} max={50}
                            value={editingPlan.max_hotel_results_per_search}
                            onChange={e => setEditingPlan({ ...editingPlan, max_hotel_results_per_search: parseInt(e.target.value) || 12 })}
                            disabled={!editingPlan.serpapi_hotels_enabled}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => savePlan(editingPlan)}><Save size={12} /> Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingPlan(null); if (plan.id.startsWith("new-")) setPlans(prev => prev.filter(p => p.id !== plan.id)); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{plan.name}</span>
                      {plan.name_ar && <span className="text-xs text-muted-foreground">({plan.name_ar})</span>}
                      <Badge variant={plan.is_active ? "default" : "secondary"} className="text-[10px]">{plan.is_active ? "Active" : "Inactive"}</Badge>
                      {plan.price === 0 && <Badge variant="outline" className="text-[10px]">Free</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ${plan.price}/{plan.duration_days}d — {plan.max_daily_generations} daily / {plan.max_monthly_generations} monthly — <span className="font-semibold text-primary">{plan.max_activities_per_day} activities/day</span>
                      {plan.max_total_activities > 0 && <span className="font-semibold text-amber-600 ml-1">• {plan.max_total_activities} total</span>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPlan(plan)}><Settings size={12} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePlan(plan.id)}><Trash2 size={12} /></Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Data Sources Management */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={16} className="text-primary" />
            <h4 className="font-bold text-foreground">Data Sources (Enrichment Chain)</h4>
          </div>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={addNewDataSource}>
            <Plus size={12} /> Add Source
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Control the priority order, enable/disable, and set usage limits for each data source. The system tries sources in priority order (1 = first).
        </p>
        <div className="space-y-2">
          {settings.data_sources_config.sort((a, b) => a.priority - b.priority).map((source) => (
            <div key={source.id} className="bg-muted/30 rounded-lg px-3 py-3 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">
                    {source.priority}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{source.name}</span>
                      <Badge variant="outline" className="text-[10px]">{source.type}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{source.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={source.priority <= 1}
                      onClick={() => moveDSPriority(source.id, 'up')}>
                      <ChevronUp size={12} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={source.priority >= settings.data_sources_config.length}
                      onClick={() => moveDSPriority(source.id, 'down')}>
                      <ChevronDown size={12} />
                    </Button>
                  </div>
                  <Switch checked={source.enabled} onCheckedChange={v => setSettings(prev => ({
                    ...prev,
                    data_sources_config: prev.data_sources_config.map(s => s.id === source.id ? { ...s, enabled: v } : s)
                  }))} />
                  {source.id.startsWith('custom-') && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setSettings(prev => ({
                      ...prev, data_sources_config: prev.data_sources_config.filter(s => s.id !== source.id)
                    }))}>
                      <Trash2 size={10} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[9px] text-muted-foreground">API Key Name</Label>
                  <Input value={source.apiKeyName} onChange={e => setSettings(prev => ({
                    ...prev, data_sources_config: prev.data_sources_config.map(s => s.id === source.id ? { ...s, apiKeyName: e.target.value } : s)
                  }))} className="h-6 text-[10px] font-mono" />
                </div>
                <div>
                  <Label className="text-[9px] text-muted-foreground">Max Daily Requests (0=unlimited)</Label>
                  <Input type="number" min={0} value={source.maxDailyRequests} onChange={e => setSettings(prev => ({
                    ...prev, data_sources_config: prev.data_sources_config.map(s => s.id === source.id ? { ...s, maxDailyRequests: Number(e.target.value) } : s)
                  }))} className="h-6 text-[10px]" />
                </div>
                <div>
                  <Label className="text-[9px] text-muted-foreground">Name</Label>
                  <Input value={source.name} onChange={e => setSettings(prev => ({
                    ...prev, data_sources_config: prev.data_sources_config.map(s => s.id === source.id ? { ...s, name: e.target.value } : s)
                  }))} className="h-6 text-[10px]" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={saveDataSources} disabled={savingDS} className="gap-1 text-xs">
          {savingDS ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Data Sources
        </Button>
      </div>

      {/* AI Models Management */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" />
            <h4 className="font-bold text-foreground">AI Models (Generation Priority)</h4>
          </div>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={addNewAIModel}>
            <Plus size={12} /> Add Model
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Control AI model priority for trip generation. The system tries models in order (1 = first). Set daily limits to control costs.
        </p>
        <div className="space-y-2">
          {settings.ai_models_config.sort((a, b) => a.priority - b.priority).map((model) => (
            <div key={model.id} className="bg-muted/30 rounded-lg px-3 py-3 border border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/30 text-accent-foreground text-sm font-bold">
                    {model.priority}
                  </div>
                  <div>
                    <span className="font-medium text-sm text-foreground">{model.name}</span>
                    <p className="text-[11px] text-muted-foreground">{model.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={model.priority <= 1}
                      onClick={() => moveAIPriority(model.id, 'up')}>
                      <ChevronUp size={12} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" disabled={model.priority >= settings.ai_models_config.length}
                      onClick={() => moveAIPriority(model.id, 'down')}>
                      <ChevronDown size={12} />
                    </Button>
                  </div>
                  <Switch checked={model.enabled} onCheckedChange={v => setSettings(prev => ({
                    ...prev,
                    ai_models_config: prev.ai_models_config.map(m => m.id === model.id ? { ...m, enabled: v } : m)
                  }))} />
                  {model.id.startsWith('custom-') && (
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setSettings(prev => ({
                      ...prev, ai_models_config: prev.ai_models_config.filter(m => m.id !== model.id)
                    }))}>
                      <Trash2 size={10} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[9px] text-muted-foreground">Secret Name</Label>
                  <Input value={model.secretName} onChange={e => setSettings(prev => ({
                    ...prev, ai_models_config: prev.ai_models_config.map(m => m.id === model.id ? { ...m, secretName: e.target.value } : m)
                  }))} className="h-6 text-[10px] font-mono" />
                </div>
                <div>
                  <Label className="text-[9px] text-muted-foreground">Max Daily Requests (0=unlimited)</Label>
                  <Input type="number" min={0} value={model.maxDailyRequests} onChange={e => setSettings(prev => ({
                    ...prev, ai_models_config: prev.ai_models_config.map(m => m.id === model.id ? { ...m, maxDailyRequests: Number(e.target.value) } : m)
                  }))} className="h-6 text-[10px]" />
                </div>
                <div>
                  <Label className="text-[9px] text-muted-foreground">Name</Label>
                  <Input value={model.name} onChange={e => setSettings(prev => ({
                    ...prev, ai_models_config: prev.ai_models_config.map(m => m.id === model.id ? { ...m, name: e.target.value } : m)
                  }))} className="h-6 text-[10px]" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" onClick={saveAIModels} disabled={savingAI} className="gap-1 text-xs">
          {savingAI ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save AI Models
        </Button>
      </div>

      {/* Grant User Overrides */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-primary" />
          <h4 className="font-bold text-foreground">Grant User Bonus (Activities / Generations)</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          🎯 <strong>Bonus Activities</strong>: Extra activities added to the user's subscription quota. 
          📋 <strong>Bonus Generations</strong>: Extra trip plan generations.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input placeholder="User email" value={overrideEmail} onChange={e => setOverrideEmail(e.target.value)} className="h-8 text-xs" />
          <select
            value={overrideType}
            onChange={e => setOverrideType(e.target.value as any)}
            className="h-8 text-xs rounded-md border border-input bg-background px-2"
          >
            <option value="bonus_activities">🎯 Bonus Activities</option>
            <option value="bonus_generations">📋 Bonus Generations</option>
          </select>
          <Input type="number" placeholder="Amount" value={overrideValue} onChange={e => setOverrideValue(Number(e.target.value))} className="h-8 text-xs" />
          <Input placeholder="Reason (optional)" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" className="h-8 text-xs gap-1" onClick={grantOverride} disabled={grantingOverride}>
            {grantingOverride ? <Loader2 size={12} className="animate-spin" /> : <Gift size={12} />} Grant
          </Button>
        </div>
        {overrides.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {overrides.map(o => (
              <div key={o.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-1.5 text-xs">
                <span className="font-mono text-muted-foreground">{o.user_id.slice(0, 8)}...</span>
                <Badge variant="outline" className={`text-[10px] ${o.override_type === 'bonus_activities' ? 'border-primary text-primary' : 'border-amber-500 text-amber-600'}`}>
                  +{o.value} {o.override_type === 'bonus_activities' ? 'activities' : 'generations'}
                </Badge>
                <span className="text-muted-foreground">{o.reason || '-'}</span>
                <span className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discount Codes */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-primary" />
          <h4 className="font-bold text-foreground">Discount Codes</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="CODE" value={newDiscount.code} onChange={e => setNewDiscount(d => ({ ...d, code: e.target.value }))} className="h-8 text-xs uppercase" />
          <Input placeholder="Description" value={newDiscount.description} onChange={e => setNewDiscount(d => ({ ...d, description: e.target.value }))} className="h-8 text-xs" />
          <Input type="number" placeholder="% off" value={newDiscount.discount_percent} onChange={e => setNewDiscount(d => ({ ...d, discount_percent: Number(e.target.value) }))} className="h-8 text-xs" />
          <Button size="sm" className="h-8 text-xs gap-1" onClick={addDiscount}><Plus size={12} /> Add</Button>
        </div>
        <div className="space-y-2">
          {discounts.map(d => (
            <div key={d.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
              <div>
                <span className="font-mono text-sm font-bold text-primary">{d.code}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.discount_percent}% off — {d.current_uses}/{d.max_uses || '∞'} uses</span>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={d.is_active} onCheckedChange={v => toggleDiscount(d.id, v)} />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteDiscount(d.id)}><Trash2 size={12} /></Button>
              </div>
            </div>
          ))}
          {discounts.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No discount codes yet</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminSubscriptions;
