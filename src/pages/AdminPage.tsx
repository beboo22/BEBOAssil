import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Shield, Users, Heart, History, BarChart3, Loader2, Trash2, Search, Brain, Key, Plus, Save, Pencil, X, Check, Cpu, Mic, Volume2, Eye, EyeOff, RefreshCw, Download, Upload, MessageSquare, Package, MapPin, Trophy, FileText, Sparkles, Receipt, Bell, Smartphone, Database, GripVertical, ArrowLeftRight, Activity, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AdminComments from "@/components/admin/AdminComments";
import AdminSubscriptions from "@/components/admin/AdminSubscriptions";
import AdminDestinations from "@/components/admin/AdminDestinations";
import { AdminWorldCities } from "@/components/admin/AdminWorldCities";
import AdminRewards from "@/components/admin/AdminRewards";
import AdminTerms from "@/components/admin/AdminTerms";
import AdminBookingStats from "@/components/admin/AdminBookingStats";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import AdminEvents from "@/components/admin/AdminEvents";
import AdminPayments from "@/components/admin/AdminPayments";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminAppStoreLinks from "@/components/admin/AdminAppStoreLinks";
import AdminAPIMonitoring from "@/components/admin/AdminAPIMonitoring";
import AdminPromotions from "@/components/admin/AdminPromotions";
import AdminPriceVariance from "@/components/admin/AdminPriceVariance";
import AdminMatchScores from "@/components/admin/AdminMatchScores";
import AdminNavOrder from "@/components/admin/AdminNavOrder";
import AdminPrivacy from "@/components/admin/AdminPrivacy";
import AdminPartnerListings from "@/components/admin/AdminPartnerListings";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminOrders from "@/components/admin/AdminOrders";
import AdminSerpAPIUsage from "@/components/admin/AdminSerpAPIUsage";
import AdminPlacesCacheInspector from "@/components/admin/AdminPlacesCacheInspector";
import AdminPlanningKeyDebug from "@/components/admin/AdminPlanningKeyDebug";
import AdminSerpBankSettings from "@/components/admin/AdminSerpBankSettings";
import AdminSocialLinks from "@/components/admin/AdminSocialLinks";

// AI Model definitions
interface AIModel {
  id: string;
  name: string;
  provider: string;
  type: 'chat' | 'stt' | 'tts' | 'vision' | 'image';
  model_id: string;
  enabled: boolean;
  description: string;
  apiKeyName: string;
}

interface APIKeyConfig {
  id: string;
  name: string;
  displayName: string;
  maskedValue: string;
  provider: string;
  isSet: boolean;
}

const DEFAULT_MODELS: AIModel[] = [
  // Chat models
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash Preview', provider: 'Lovable AI', type: 'chat', model_id: 'google/gemini-3-flash-preview', enabled: true, description: 'Fast preview of Google\'s next-gen model', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gemini-25-flash', name: 'Gemini 2.5 Flash', provider: 'Lovable AI', type: 'chat', model_id: 'google/gemini-2.5-flash', enabled: true, description: 'Balanced speed and quality', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gemini-25-pro', name: 'Gemini 2.5 Pro', provider: 'Lovable AI', type: 'chat', model_id: 'google/gemini-2.5-pro', enabled: true, description: 'Top-tier reasoning and multimodal', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gpt5', name: 'GPT-5', provider: 'Lovable AI', type: 'chat', model_id: 'openai/gpt-5', enabled: true, description: 'Powerful all-rounder with excellent reasoning', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gpt5-mini', name: 'GPT-5 Mini', provider: 'Lovable AI', type: 'chat', model_id: 'openai/gpt-5-mini', enabled: true, description: 'Cost-effective with strong performance', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gpt52', name: 'GPT-5.2', provider: 'Lovable AI', type: 'chat', model_id: 'openai/gpt-5.2', enabled: true, description: 'Latest with enhanced reasoning', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'deepseek-v3', name: 'DeepSeek V3.2', provider: 'OpenRouter', type: 'chat', model_id: 'deepseek/deepseek-v3.2', enabled: true, description: 'Fast and capable open model', apiKeyName: 'OPENROUTER_API_KEY' },
  { id: 'trinity', name: 'Trinity Large Preview', provider: 'OpenRouter', type: 'chat', model_id: 'arcee-ai/trinity-large-preview:free', enabled: true, description: 'Free capable model', apiKeyName: 'OPENROUTER_API_KEY' },

  // Vision models
  { id: 'gemini-25-flash-vision', name: 'Gemini 2.5 Flash (Vision)', provider: 'Lovable AI', type: 'vision', model_id: 'google/gemini-2.5-flash', enabled: true, description: 'Image analysis with Gemini', apiKeyName: 'LOVABLE_API_KEY' },
  { id: 'gpt5-vision', name: 'GPT-5 (Vision)', provider: 'Lovable AI', type: 'vision', model_id: 'openai/gpt-5', enabled: true, description: 'Image analysis with GPT-5', apiKeyName: 'LOVABLE_API_KEY' },

  // STT models (AIML API)
  { id: 'aiml-stt-gpt4o-mini', name: 'GPT-4o Mini Transcribe', provider: 'AIML API', type: 'stt', model_id: 'openai/gpt-4o-mini-transcribe', enabled: true, description: 'Fast speech-to-text with GPT-4o Mini', apiKeyName: 'AIML_API_KEY' },
  { id: 'aiml-stt-gpt4o', name: 'GPT-4o Transcribe', provider: 'AIML API', type: 'stt', model_id: 'openai/gpt-4o-transcribe', enabled: true, description: 'High-quality speech-to-text', apiKeyName: 'AIML_API_KEY' },

  // TTS models (AIML API)
  { id: 'aiml-tts-elevenlabs', name: 'ElevenLabs Turbo v2.5', provider: 'AIML API', type: 'tts', model_id: 'elevenlabs/eleven_turbo_v2_5', enabled: true, description: 'High quality text-to-speech', apiKeyName: 'AIML_API_KEY' },
  { id: 'aiml-tts-elevenlabs-v3', name: 'ElevenLabs v3 Alpha', provider: 'AIML API', type: 'tts', model_id: 'elevenlabs/v3_alpha', enabled: true, description: 'Next-gen voice synthesis', apiKeyName: 'AIML_API_KEY' },
  { id: 'aiml-tts-inworld', name: 'Inworld TTS 1.5 Mini', provider: 'AIML API', type: 'tts', model_id: 'inworld/tts-1-5-mini', enabled: true, description: 'Fast compact TTS model', apiKeyName: 'AIML_API_KEY' },
  { id: 'aiml-tts-minimax', name: 'MiniMax Speech 2.5 Turbo', provider: 'AIML API', type: 'tts', model_id: 'minimax/speech-2.5-turbo-preview', enabled: true, description: 'Expressive multi-voice TTS', apiKeyName: 'AIML_API_KEY' },
];

const DEFAULT_API_KEYS: APIKeyConfig[] = [
  { id: 'lovable', name: 'LOVABLE_API_KEY', displayName: 'Lovable AI', maskedValue: '••••••••', provider: 'Lovable AI Gateway', isSet: true },
  { id: 'openrouter', name: 'OPENROUTER_API_KEY', displayName: 'OpenRouter', maskedValue: '••••••••', provider: 'OpenRouter.ai', isSet: true },
  { id: 'aiml', name: 'AIML_API_KEY', displayName: 'AIML API', maskedValue: '••••••••', provider: 'aimlapi.com', isSet: true },
  { id: 'serpapi', name: 'SERPAPI_KEY', displayName: 'SerpAPI', maskedValue: '••••••••', provider: 'serpapi.com', isSet: true },
];

const AdminPage = () => {
  const { t } = useTranslation();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [searches, setSearches] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // AI Management state
  const [models, setModels] = useState<AIModel[]>(() => {
    const saved = localStorage.getItem('admin_ai_models');
    return saved ? JSON.parse(saved) : DEFAULT_MODELS;
  });
  const [apiKeys, setApiKeys] = useState<APIKeyConfig[]>(DEFAULT_API_KEYS);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [showKeyValue, setShowKeyValue] = useState<Record<string, boolean>>({});
  const [newModel, setNewModel] = useState(false);
  const [newModelData, setNewModelData] = useState<Partial<AIModel>>({ type: 'chat', enabled: true, provider: 'Custom', apiKeyName: '' });
  const [newKeyData, setNewKeyData] = useState({ name: '', displayName: '', provider: '' });
  const [addingKey, setAddingKey] = useState(false);
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [reorderMode, setReorderMode] = useState(false);
  // Persist active admin tab so navigating away and back doesn't reset to Analytics
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('tab');
      if (fromUrl) return fromUrl;
      return localStorage.getItem('admin_active_tab') || 'analytics';
    } catch { return 'analytics'; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('admin_active_tab', activeTab);
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, [activeTab]);

  // Admin tab definitions
  const DEFAULT_TAB_ORDER = [
    { value: "analytics", label: "Analytics", icon: "BarChart3" },
    { value: "ai-models", label: "AI", icon: "Brain" },
    { value: "api-keys", label: "Keys", icon: "Key" },
    { value: "destinations", label: "Destinations", icon: "MapPin" },
    { value: "subscriptions", label: "Plans", icon: "Package" },
    { value: "rewards", label: "Rewards", icon: "Trophy" },
    { value: "comments", label: "Comments", icon: "MessageSquare" },
    { value: "users", label: "Users", icon: "Users" },
    { value: "favorites", label: "Favorites", icon: "Heart" },
    { value: "searches", label: "Searches", icon: "History" },
    { value: "trips", label: "Trips", icon: "BarChart3" },
    { value: "terms", label: "Terms", icon: "FileText" },
    { value: "privacy", label: "Privacy", icon: "FileText" },
    { value: "bookings", label: "Bookings", icon: "Package" },
    { value: "events", label: "Events", icon: "Sparkles" },
    { value: "scores", label: "Scores", icon: "Trophy" },
    { value: "promotions", label: "Promotions", icon: "Package" },
    { value: "payments", label: "Payments", icon: "Receipt" },
    { value: "notifications", label: "Notifications", icon: "Bell" },
    { value: "app-stores", label: "App Links", icon: "Smartphone" },
    { value: "social-links", label: "Social", icon: "Globe" },
    { value: "api-monitoring", label: "Data Sources", icon: "Database" },
    { value: "serpapi-usage", label: "SerpAPI Cost", icon: "Activity" },
    { value: "price-variance", label: "Price Alerts", icon: "AlertTriangle" },
    { value: "places-cache", label: "Cache Inspector", icon: "Database" },
    { value: "key-debug", label: "Bank Key Debug", icon: "Key" },
    { value: "serp-bank", label: "SerpApi Bank", icon: "Database" },
    { value: "nav-order", label: "Nav Order", icon: "GripVertical" },
    { value: "partners", label: "Partners", icon: "MapPin" },
    { value: "products", label: "Products", icon: "Package" },
    { value: "store-orders", label: "Store Orders", icon: "ShoppingBag" },
  ];

  const [tabOrder, setTabOrder] = useState<typeof DEFAULT_TAB_ORDER>(() => {
    const saved = localStorage.getItem('admin_tab_order');
    if (saved) {
      try {
        const savedOrder = JSON.parse(saved) as string[];
        const ordered = savedOrder
          .map(v => DEFAULT_TAB_ORDER.find(t => t.value === v))
          .filter(Boolean) as typeof DEFAULT_TAB_ORDER;
        // Add any new tabs not in saved order
        DEFAULT_TAB_ORDER.forEach(t => {
          if (!ordered.find(o => o.value === t.value)) ordered.push(t);
        });
        return ordered;
      } catch { return DEFAULT_TAB_ORDER; }
    }
    return DEFAULT_TAB_ORDER;
  });

  const moveTab = (fromIdx: number, direction: 'left' | 'right') => {
    const toIdx = direction === 'left' ? fromIdx - 1 : fromIdx + 1;
    if (toIdx < 0 || toIdx >= tabOrder.length) return;
    const newOrder = [...tabOrder];
    [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];
    setTabOrder(newOrder);
    localStorage.setItem('admin_tab_order', JSON.stringify(newOrder.map(t => t.value)));
  };

  const resetTabOrder = () => {
    setTabOrder(DEFAULT_TAB_ORDER);
    localStorage.removeItem('admin_tab_order');
    toast.success("Tab order reset");
  };

  const getTabIcon = (iconName: string) => {
    const icons: Record<string, any> = { BarChart3, Brain, Key, MapPin, Package, Trophy, MessageSquare, Users, Heart, History, FileText, Sparkles, Receipt, Bell, Smartphone, Database, GripVertical, Activity, AlertTriangle, Globe };
    const Icon = icons[iconName] || BarChart3;
    return <Icon size={12} />;
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) {
      navigate("/");
      toast.error(t("admin.accessDenied", { defaultValue: "Access denied" }));
      return;
    }
    loadAdminData();
  }, [user, isAdmin, authLoading]);

  // Persist model configs
  useEffect(() => {
    localStorage.setItem('admin_ai_models', JSON.stringify(models));
  }, [models]);

  const [subscriptions, setSubscriptions] = useState<any[]>([]);

  const loadAdminData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, favsRes, searchRes, tripsRes, subsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("favorites").select("*, profiles(full_name, email)"),
      supabase.from("search_history").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(100),
      supabase.from("saved_trips").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(100),
      supabase.from("user_subscriptions").select("*, subscription_plans(name, name_ar)").order("created_at", { ascending: false }),
    ]);
    if (profilesRes.data) {
      const roles = rolesRes.data || [];
      const merged = profilesRes.data.map(p => ({
        ...p,
        user_roles: roles.filter(r => r.user_id === p.id),
      }));
      setUsers(merged);
    }
    if (favsRes.data) setFavorites(favsRes.data);
    if (searchRes.data) setSearches(searchRes.data);
    if (tripsRes.data) setTrips(tripsRes.data);
    if (subsRes.data) setSubscriptions(subsRes.data);
    setLoading(false);
  };

  const changeUserRole = async (userId: string, newRole: string) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert([{ user_id: userId, role: newRole as any }]);
    if (error) toast.error("Failed to update role");
    else { toast.success("Role updated"); loadAdminData(); }
  };

  const deleteUser = async (userId: string) => {
    if (userId === user?.id) { toast.error("Cannot delete yourself"); return; }
    await supabase.from("profiles").delete().eq("id", userId);
    toast.success("User data removed");
    loadAdminData();
  };

  const toggleModel = (id: string) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m));
    toast.success(t("admin.modelUpdated", { defaultValue: "Model updated" }));
  };

  const deleteModel = (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    toast.success(t("admin.modelDeleted", { defaultValue: "Model deleted" }));
  };

  const addModel = () => {
    if (!newModelData.name || !newModelData.model_id) {
      toast.error("Name and Model ID are required");
      return;
    }
    const model: AIModel = {
      id: `custom-${Date.now()}`,
      name: newModelData.name || '',
      provider: newModelData.provider || 'Custom',
      type: (newModelData.type as any) || 'chat',
      model_id: newModelData.model_id || '',
      enabled: true,
      description: newModelData.description || '',
      apiKeyName: newModelData.apiKeyName || '',
    };
    setModels(prev => [...prev, model]);
    setNewModel(false);
    setNewModelData({ type: 'chat', enabled: true, provider: 'Custom', apiKeyName: '' });
    toast.success(t("admin.modelAdded", { defaultValue: "Model added" }));
  };

  const updateModel = (id: string, updates: Partial<AIModel>) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const resetModels = () => {
    setModels(DEFAULT_MODELS);
    localStorage.removeItem('admin_ai_models');
    toast.success(t("admin.modelsReset", { defaultValue: "Models reset to defaults" }));
  };

  const filteredModels = modelFilter === 'all' ? models : models.filter(m => m.type === modelFilter);

  const filteredUsers = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'chat': return <Brain className="h-4 w-4" />;
      case 'stt': return <Mic className="h-4 w-4" />;
      case 'tts': return <Volume2 className="h-4 w-4" />;
      case 'vision': return <Eye className="h-4 w-4" />;
      case 'image': return <Cpu className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'chat': return 'bg-blue-500/20 text-blue-400';
      case 'stt': return 'bg-green-500/20 text-green-400';
      case 'tts': return 'bg-purple-500/20 text-purple-400';
      case 'vision': return 'bg-amber-500/20 text-amber-400';
      case 'image': return 'bg-pink-500/20 text-pink-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen flex items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  );

  const stats = [
    { label: t("admin.totalUsers", { defaultValue: "Total Users" }), value: users.length, icon: Users },
    { label: t("admin.totalFavorites", { defaultValue: "Favorites" }), value: favorites.length, icon: Heart },
    { label: t("admin.totalSearches", { defaultValue: "Searches" }), value: searches.length, icon: History },
    { label: t("admin.totalTrips", { defaultValue: "Saved Trips" }), value: trips.length, icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background pt-20 pb-10 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-6">
            <Shield className="text-primary" size={24} />
            <h1 className="text-2xl font-extrabold gradient-text">{t("admin.dashboard", { defaultValue: "Admin Dashboard" })}</h1>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {stats.map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
                <s.icon className="mx-auto mb-1 text-primary" size={20} />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant={reorderMode ? "default" : "outline"}
                  size="sm"
                  className="gap-1 text-[10px] h-7"
                  onClick={() => setReorderMode(!reorderMode)}
                >
                  <ArrowLeftRight size={12} /> {reorderMode ? "Done" : "Reorder Tabs"}
                </Button>
                {reorderMode && (
                  <Button variant="ghost" size="sm" className="gap-1 text-[10px] h-7" onClick={resetTabOrder}>
                    <RefreshCw size={10} /> Reset
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide">
                <TabsList className="inline-flex gap-1 min-w-max bg-muted/50 p-1 rounded-lg">
                  {tabOrder.map((tab, idx) => (
                    <div key={tab.value} className="relative flex items-center">
                      {reorderMode && (
                        <div className="flex flex-col absolute -top-6 left-1/2 -translate-x-1/2 z-10 gap-0.5">
                          <div className="flex gap-0.5">
                            <button
                              onClick={() => moveTab(idx, 'left')}
                              disabled={idx === 0}
                              className="w-4 h-4 rounded bg-primary/20 hover:bg-primary/40 flex items-center justify-center text-[8px] disabled:opacity-30"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => moveTab(idx, 'right')}
                              disabled={idx === tabOrder.length - 1}
                              className="w-4 h-4 rounded bg-primary/20 hover:bg-primary/40 flex items-center justify-center text-[8px] disabled:opacity-30"
                            >
                              →
                            </button>
                          </div>
                        </div>
                      )}
                      <TabsTrigger
                        value={tab.value}
                        className={`gap-1 text-[10px] px-2 py-1.5 h-auto ${reorderMode ? "mt-4 ring-1 ring-primary/20" : ""}`}
                      >
                        {getTabIcon(tab.icon)} {tab.label}
                      </TabsTrigger>
                    </div>
                  ))}
                </TabsList>
              </div>
            </div>

            {/* Analytics Tab */}
            <TabsContent value="analytics">
              <AdminAnalytics />
            </TabsContent>

            {/* AI Models Tab */}
            <TabsContent value="ai-models" className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex gap-2 flex-wrap">
                  {['all', 'chat', 'vision', 'stt', 'tts', 'image'].map(f => (
                    <Button key={f} variant={modelFilter === f ? 'default' : 'outline'} size="sm" className="text-xs capitalize" onClick={() => setModelFilter(f)}>
                      {f === 'all' ? t("admin.allModels", { defaultValue: "All" }) : f.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => {
                    const exportData = { models, apiKeys, exportedAt: new Date().toISOString() };
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `ai-settings-${Date.now()}.json`; a.click();
                    URL.revokeObjectURL(url);
                    toast.success(t("admin.exported", { defaultValue: "Settings exported" }));
                  }}>
                    <Download size={12} /> {t("admin.export", { defaultValue: "Export" })}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => {
                    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const data = JSON.parse(ev.target?.result as string);
                          if (data.models) setModels(data.models);
                          if (data.apiKeys) setApiKeys(data.apiKeys);
                          toast.success(t("admin.imported", { defaultValue: "Settings imported successfully" }));
                        } catch { toast.error("Invalid JSON file"); }
                      };
                      reader.readAsText(file);
                    };
                    input.click();
                  }}>
                    <Upload size={12} /> {t("admin.import", { defaultValue: "Import" })}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={resetModels}>
                    <RefreshCw size={12} /> {t("admin.resetDefaults", { defaultValue: "Reset" })}
                  </Button>
                  <Button size="sm" className="gap-1 text-xs" onClick={() => setNewModel(true)}>
                    <Plus size={12} /> {t("admin.addModel", { defaultValue: "Add Model" })}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t("admin.modelsCount", { defaultValue: `${filteredModels.length} models • ${models.filter(m => m.enabled).length} enabled`, count: filteredModels.length, enabled: models.filter(m => m.enabled).length })}
              </p>

              {/* Add new model form */}
              {newModel && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Plus size={14} className="text-primary" /> {t("admin.addNewModel", { defaultValue: "Add New Model" })}
                    </h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewModel(false)}><X size={14} /></Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{t("admin.modelName", { defaultValue: "Model Name" })}</Label>
                      <Input placeholder="e.g. My Custom Model" value={newModelData.name || ''} onChange={e => setNewModelData(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("admin.modelId", { defaultValue: "Model ID" })}</Label>
                      <Input placeholder="e.g. provider/model-name" value={newModelData.model_id || ''} onChange={e => setNewModelData(p => ({ ...p, model_id: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("admin.provider", { defaultValue: "Provider" })}</Label>
                      <Input placeholder="e.g. OpenAI, AIML API" value={newModelData.provider || ''} onChange={e => setNewModelData(p => ({ ...p, provider: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("admin.type", { defaultValue: "Type" })}</Label>
                      <Select value={newModelData.type || 'chat'} onValueChange={v => setNewModelData(p => ({ ...p, type: v as any }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="chat">Chat</SelectItem>
                          <SelectItem value="stt">STT (Speech-to-Text)</SelectItem>
                          <SelectItem value="tts">TTS (Text-to-Speech)</SelectItem>
                          <SelectItem value="vision">Vision</SelectItem>
                          <SelectItem value="image">Image Generation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">{t("admin.apiKeyRef", { defaultValue: "API Key Reference" })}</Label>
                      <Input placeholder="e.g. AIML_API_KEY" value={newModelData.apiKeyName || ''} onChange={e => setNewModelData(p => ({ ...p, apiKeyName: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">{t("admin.description", { defaultValue: "Description" })}</Label>
                      <Input placeholder="Short description" value={newModelData.description || ''} onChange={e => setNewModelData(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>
                  <Button size="sm" className="gap-1" onClick={addModel}>
                    <Save size={12} /> {t("admin.save", { defaultValue: "Save" })}
                  </Button>
                </motion.div>
              )}

              {/* Models list */}
              {filteredModels.map(model => (
                <div key={model.id} className={`bg-card border rounded-xl p-4 transition-all ${model.enabled ? 'border-border' : 'border-border/50 opacity-60'}`}>
                  {editingModel === model.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Name</Label>
                          <Input value={model.name} onChange={e => updateModel(model.id, { name: e.target.value })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Model ID</Label>
                          <Input value={model.model_id} onChange={e => updateModel(model.id, { model_id: e.target.value })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Provider</Label>
                          <Input value={model.provider} onChange={e => updateModel(model.id, { provider: e.target.value })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">API Key</Label>
                          <Input value={model.apiKeyName} onChange={e => updateModel(model.id, { apiKeyName: e.target.value })} className="h-8 text-sm" />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Input value={model.description} onChange={e => updateModel(model.id, { description: e.target.value })} className="h-8 text-sm" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="gap-1 text-xs" onClick={() => { setEditingModel(null); toast.success("Saved"); }}>
                          <Check size={12} /> Done
                        </Button>
                        <Button variant="destructive" size="sm" className="gap-1 text-xs" onClick={() => deleteModel(model.id)}>
                          <Trash2 size={12} /> Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`p-2 rounded-lg ${getTypeBadgeColor(model.type)}`}>
                          {getTypeIcon(model.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{model.name}</p>
                            <Badge variant="outline" className={`text-[10px] ${getTypeBadgeColor(model.type)}`}>{model.type.toUpperCase()}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{model.provider}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{model.model_id}</p>
                          <p className="text-xs text-muted-foreground">{model.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch checked={model.enabled} onCheckedChange={() => toggleModel(model.id)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingModel(model.id)}>
                          <Pencil size={12} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {filteredModels.length === 0 && (
                <p className="text-center text-muted-foreground py-8">{t("admin.noModels", { defaultValue: "No models found" })}</p>
              )}
            </TabsContent>

            {/* API Keys Tab */}
            <TabsContent value="api-keys" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("admin.apiKeysDesc", { defaultValue: "Manage API keys for AI services. Keys are stored securely as backend secrets." })}</p>
                <Button size="sm" className="gap-1 text-xs" onClick={() => setAddingKey(true)}>
                  <Plus size={12} /> {t("admin.addKey", { defaultValue: "Add Key" })}
                </Button>
              </div>

              {addingKey && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Plus size={14} className="text-primary" /> {t("admin.addNewKey", { defaultValue: "Add New API Key" })}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Secret Name</Label>
                      <Input placeholder="e.g. MY_API_KEY" value={newKeyData.name} onChange={e => setNewKeyData(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Display Name</Label>
                      <Input placeholder="e.g. My Service" value={newKeyData.displayName} onChange={e => setNewKeyData(p => ({ ...p, displayName: e.target.value }))} className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs">Provider</Label>
                      <Input placeholder="e.g. example.com" value={newKeyData.provider} onChange={e => setNewKeyData(p => ({ ...p, provider: e.target.value }))} className="h-8 text-sm" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.addKeyNote", { defaultValue: "Note: The actual key value is managed securely through the backend secrets system. Add the key name here to track it." })}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1 text-xs" onClick={() => {
                      if (!newKeyData.name) { toast.error("Secret name is required"); return; }
                      setApiKeys(prev => [...prev, { id: `key-${Date.now()}`, name: newKeyData.name, displayName: newKeyData.displayName || newKeyData.name, maskedValue: '••••••••', provider: newKeyData.provider, isSet: false }]);
                      setNewKeyData({ name: '', displayName: '', provider: '' });
                      setAddingKey(false);
                      toast.success("Key reference added");
                    }}>
                      <Save size={12} /> Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAddingKey(false)}>Cancel</Button>
                  </div>
                </motion.div>
              )}

              {apiKeys.map(key => (
                <div key={key.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Key className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{key.displayName}</p>
                          <Badge variant={key.isSet ? 'default' : 'destructive'} className="text-[10px]">
                            {key.isSet ? t("admin.configured", { defaultValue: "Configured" }) : t("admin.notSet", { defaultValue: "Not Set" })}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{key.name}</p>
                        <p className="text-xs text-muted-foreground">{key.provider}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono text-muted-foreground">{key.maskedValue}</p>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Destinations Tab */}
            <TabsContent value="destinations">
              <div className="space-y-6">
                <AdminWorldCities />
                <AdminDestinations />
              </div>
            </TabsContent>

            {/* Subscriptions Tab */}
            <TabsContent value="subscriptions">
              <AdminSubscriptions />
            </TabsContent>

            {/* Rewards Tab */}
            <TabsContent value="rewards">
              <AdminRewards />
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments">
              <AdminComments />
            </TabsContent>

            {/* Booking Analytics Tab */}
            <TabsContent value="bookings">
              <AdminBookingStats />
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events">
              <AdminEvents />
            </TabsContent>

            {/* Match Scores Tab */}
            <TabsContent value="scores">
              <AdminMatchScores />
            </TabsContent>

            {/* Promotions Tab */}
            <TabsContent value="promotions">
              <AdminPromotions />
            </TabsContent>

            {/* Payments Tab */}
            <TabsContent value="payments">
              <AdminPayments />
            </TabsContent>

            <TabsContent value="notifications">
              <AdminNotifications />
            </TabsContent>

            <TabsContent value="app-stores">
              <AdminAppStoreLinks />
            </TabsContent>

            <TabsContent value="social-links">
              <AdminSocialLinks />
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("admin.searchUsers", { defaultValue: "Search users..." })} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <p className="text-xs text-muted-foreground">{filteredUsers.length} {t("admin.usersFound", { defaultValue: "users" })}</p>
              {filteredUsers.map(u => {
                const role = u.user_roles?.[0]?.role || "user";
                const userSubs = subscriptions.filter((s: any) => s.user_id === u.id);
                const activeSub = userSubs.find((s: any) => s.status === 'active');
                const planName = activeSub?.subscription_plans?.name || null;
                const totalSubCount = userSubs.length;
                return (
                  <div key={u.id} className="bg-card border border-border rounded-xl p-3 sm:p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs sm:text-sm">
                            {(u.full_name || u.email || "?")[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-medium text-xs sm:text-sm truncate">{u.full_name || "No name"}</p>
                            {u.username && <span className="text-[10px] text-primary">@{u.username}</span>}
                          </div>
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Select defaultValue={role} onValueChange={val => changeUserRole(u.id, val)}>
                          <SelectTrigger className="w-20 sm:w-24 h-7 text-[9px] sm:text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="moderator">Moderator</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteUser(u.id)}>
                          <Trash2 size={12} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[8px] sm:text-[9px]">🏷️ {role}</Badge>
                      {u.country && <Badge variant="secondary" className="text-[8px] sm:text-[9px]">🌍 {u.country}</Badge>}
                      {u.gender && <Badge variant="secondary" className="text-[8px] sm:text-[9px]">{u.gender === "male" ? "♂️" : "♀️"} {u.gender}</Badge>}
                      {u.birthdate && <Badge variant="secondary" className="text-[8px] sm:text-[9px]">🎉 {u.birthdate}</Badge>}
                      <Badge variant="secondary" className="text-[8px] sm:text-[9px]">⭐ {u.total_points || 0} pts</Badge>
                      <Badge variant="secondary" className="text-[8px] sm:text-[9px]">📅 {new Date(u.created_at).toLocaleDateString()}</Badge>
                      {planName ? (
                        <Badge className="text-[8px] sm:text-[9px] bg-green-100 text-green-700 border-green-200">📦 {planName}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[8px] sm:text-[9px] text-muted-foreground">📦 Free</Badge>
                      )}
                      <Badge variant="secondary" className="text-[8px] sm:text-[9px]">🔄 {totalSubCount} subs</Badge>
                    </div>
                    {/* Inline Bonus Grant */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 gap-1" onClick={async () => {
                        const val = prompt("عدد الأنشطة الإضافية (Bonus Activities):", "10");
                        if (!val || isNaN(Number(val))) return;
                        const { error } = await supabase.from('user_generation_overrides').insert({ user_id: u.id, override_type: 'bonus_activities', value: Number(val), granted_by: user?.id, reason: 'Admin grant' } as any);
                        if (error) toast.error("Failed"); else toast.success(`✅ +${val} activities granted`);
                      }}>
                        <Plus size={10} /> Bonus Activities
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-[9px] px-2 gap-1" onClick={async () => {
                        const val = prompt("عدد التوليدات الإضافية (Bonus Generations):", "5");
                        if (!val || isNaN(Number(val))) return;
                        const { error } = await supabase.from('user_generation_overrides').insert({ user_id: u.id, override_type: 'bonus_generations', value: Number(val), granted_by: user?.id, reason: 'Admin grant' } as any);
                        if (error) toast.error("Failed"); else toast.success(`✅ +${val} generations granted`);
                      }}>
                        <Plus size={10} /> Bonus Generations
                      </Button>
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.noData", { defaultValue: "No users found" })}</p>}
            </TabsContent>

            <TabsContent value="favorites" className="space-y-3">
              {favorites.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium text-sm">{f.place_name}</p>
                      <p className="text-xs text-muted-foreground">{f.destination} · {f.place_type}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs h-fit">{(f as any).profiles?.full_name || (f as any).profiles?.email}</Badge>
                  </div>
                </div>
              ))}
              {favorites.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.noData", { defaultValue: "No data yet" })}</p>}
            </TabsContent>

            <TabsContent value="searches" className="space-y-3">
              {searches.map(s => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-3 flex justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.query_text || s.destination || s.search_type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs h-fit">{(s as any).profiles?.email}</Badge>
                </div>
              ))}
              {searches.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.noData", { defaultValue: "No data yet" })}</p>}
            </TabsContent>

            <TabsContent value="trips" className="space-y-3">
              {trips.map(tr => (
                <div key={tr.id} className="bg-card border border-border rounded-xl p-3 flex justify-between">
                  <div>
                    <p className="text-sm font-medium">{tr.destination}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tr.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs h-fit">{(tr as any).profiles?.email}</Badge>
                </div>
              ))}
              {trips.length === 0 && <p className="text-center text-muted-foreground py-8">{t("admin.noData", { defaultValue: "No data yet" })}</p>}
            </TabsContent>

            <TabsContent value="terms">
              <AdminTerms />
            </TabsContent>

            <TabsContent value="privacy">
              <AdminPrivacy />
            </TabsContent>

            <TabsContent value="api-monitoring">
              <AdminAPIMonitoring />
            </TabsContent>

            <TabsContent value="serpapi-usage">
              <AdminSerpAPIUsage />
            </TabsContent>

            <TabsContent value="price-variance">
              <AdminPriceVariance />
            </TabsContent>

            <TabsContent value="places-cache">
              <AdminPlacesCacheInspector />
            </TabsContent>

            <TabsContent value="key-debug">
              <AdminPlanningKeyDebug />
            </TabsContent>

            <TabsContent value="serp-bank">
              <AdminSerpBankSettings />
            </TabsContent>

            <TabsContent value="nav-order">
              <AdminNavOrder />
            </TabsContent>

            <TabsContent value="partners">
              <AdminPartnerListings />
            </TabsContent>

            <TabsContent value="products">
              <AdminProducts />
            </TabsContent>

            <TabsContent value="store-orders">
              <AdminOrders />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminPage;
