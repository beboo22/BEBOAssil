import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminAPIUsageCharts from "./AdminAPIUsageCharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle, ArrowUpDown, Save, Eye, EyeOff, Database, Key, Shield, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DataSourceConfig {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  priority: number;
  apiKeyName: string;
  status: 'active' | 'quota_exhausted' | 'error' | 'unknown';
  lastChecked?: string;
  description: string;
}

const DEFAULT_SOURCES: DataSourceConfig[] = [
  { id: 'serpapi', name: 'SerpAPI', displayName: 'SerpAPI (Google)', enabled: true, priority: 1, apiKeyName: 'SERPAPI_KEY', status: 'unknown', description: 'Google Maps, Hotels, Flights via SerpAPI' },
  { id: 'serper', name: 'Serper.dev', displayName: 'Serper.dev', enabled: true, priority: 2, apiKeyName: 'SERPER_API_KEY', status: 'unknown', description: 'Google Maps, Places, Images, Reviews via Serper' },
  { id: 'rapidapi', name: 'RapidAPI', displayName: 'RapidAPI (Booking)', enabled: true, priority: 3, apiKeyName: 'RAPIDAPI_KEY', status: 'unknown', description: 'Booking.com hotels and data via RapidAPI' },
  { id: 'lovable_ai', name: 'Lovable AI', displayName: 'Lovable AI (Fallback)', enabled: true, priority: 4, apiKeyName: 'LOVABLE_API_KEY', status: 'active', description: 'AI-generated location data as last resort' },
];

const AdminAPIMonitoring = () => {
  const [sources, setSources] = useState<DataSourceConfig[]>(() => {
    const saved = localStorage.getItem('admin_data_sources');
    return saved ? JSON.parse(saved) : DEFAULT_SOURCES;
  });
  const [testingSource, setTestingSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showKeySection, setShowKeySection] = useState(false);
  const [keyValues, setKeyValues] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('admin_data_sources', JSON.stringify(sources));
    saveToDB(sources);
  }, [sources]);

  const saveToDB = async (configs: DataSourceConfig[]) => {
    try {
      await supabase.from('site_settings').update({
        data_sources_config: configs as any,
      }).eq('id', 'default');
    } catch (e) {
      console.error('Failed to save data sources config:', e);
    }
  };

  const testSource = async (sourceId: string) => {
    setTestingSource(sourceId);
    try {
      if (sourceId === 'serpapi' || sourceId === 'serper') {
        const { data, error } = await supabase.functions.invoke('serpapi-places', {
          body: { query: 'coffee shop', type: 'search' },
        });
        if (error) throw error;
        const isActive = data?.results?.length > 0;
        const usedSerper = data?.source === 'serper';
        if (sourceId === 'serpapi') {
          updateSourceStatus(sourceId, isActive && !usedSerper ? 'active' : 'quota_exhausted');
        } else {
          updateSourceStatus(sourceId, usedSerper && isActive ? 'active' : 'unknown');
        }
      } else {
        updateSourceStatus(sourceId, 'active');
      }
      toast.success(`${sources.find(s => s.id === sourceId)?.displayName} تم اختباره بنجاح`);
    } catch {
      updateSourceStatus(sourceId, 'error');
      toast.error(`فشل اختبار ${sources.find(s => s.id === sourceId)?.displayName}`);
    } finally {
      setTestingSource(null);
    }
  };

  const updateSourceStatus = (id: string, status: DataSourceConfig['status']) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, status, lastChecked: new Date().toISOString() } : s));
  };

  const toggleSource = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const changePriority = (id: string, direction: 'up' | 'down') => {
    setSources(prev => {
      const sorted = [...prev].sort((a, b) => a.priority - b.priority);
      const idx = sorted.findIndex(s => s.id === id);
      if (direction === 'up' && idx > 0) {
        const temp = sorted[idx].priority;
        sorted[idx].priority = sorted[idx - 1].priority;
        sorted[idx - 1].priority = temp;
      } else if (direction === 'down' && idx < sorted.length - 1) {
        const temp = sorted[idx].priority;
        sorted[idx].priority = sorted[idx + 1].priority;
        sorted[idx + 1].priority = temp;
      }
      return sorted;
    });
    toast.success('تم تحديث الأولوية');
  };

  const resetDefaults = () => {
    setSources(DEFAULT_SOURCES);
    localStorage.removeItem('admin_data_sources');
    toast.success('تم إعادة التعيين');
  };

  const testAllSources = async () => {
    setLoading(true);
    for (const source of sources.filter(s => s.enabled)) {
      await testSource(source.id);
    }
    setLoading(false);
  };

  const saveApiKey = async (keyName: string) => {
    const value = keyValues[keyName];
    if (!value?.trim()) {
      toast.error('أدخل قيمة المفتاح');
      return;
    }
    setSavingKey(keyName);
    try {
      // We use the edge function to securely update secrets
      const { error } = await supabase.functions.invoke('bootstrap-admin', {
        body: { action: 'update_secret', key: keyName, value: value.trim() },
      });
      if (error) throw error;
      toast.success(`تم حفظ ${keyName} بنجاح`);
      setKeyValues(prev => ({ ...prev, [keyName]: '' }));
    } catch {
      toast.error(`لا يمكن تحديث المفتاح من هنا. استخدم إعدادات Lovable Cloud.`);
    } finally {
      setSavingKey(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]"><CheckCircle size={10} className="mr-1" /> نشط</Badge>;
      case 'quota_exhausted': return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]"><AlertTriangle size={10} className="mr-1" /> نفدت الحصة</Badge>;
      case 'error': return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 text-[10px]"><AlertTriangle size={10} className="mr-1" /> خطأ</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">غير معروف</Badge>;
    }
  };

  const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Database size={18} className="text-primary" /> مصادر البيانات و API</h3>
          <p className="text-xs text-muted-foreground mt-1">تحكم بأولوية المصادر، فعّل/عطّل، وراقب الحالة. التغييرات تُطبّق تلقائياً.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={testAllSources} disabled={loading}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} اختبار الكل
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowKeySection(!showKeySection)}>
            <Key size={12} /> {showKeySection ? 'إخفاء المفاتيح' : 'إدارة المفاتيح'}
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={resetDefaults}>
            <RefreshCw size={12} /> إعادة تعيين
          </Button>
        </div>
      </div>

      {/* Fallback Chain */}
      <Card className="border-primary/20">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-bold flex items-center gap-2"><Activity size={14} /> سلسلة الانتقال التلقائي</CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div className="flex flex-wrap items-center gap-2">
            {sortedSources.filter(s => s.enabled).map((s, i, arr) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${s.status === 'active' ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400' : s.status === 'quota_exhausted' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' : 'bg-muted border-border text-muted-foreground'}`}>
                  {s.displayName}
                </div>
                {i < arr.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">عند نفاد حصة مصدر أو حدوث خطأ، ينتقل النظام تلقائياً للمصدر التالي دون أن يشعر المستخدم.</p>
        </CardContent>
      </Card>

      {/* API Key Management Section */}
      {showKeySection && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2"><Shield size={14} className="text-amber-600" /> إدارة مفاتيح API</CardTitle>
          </CardHeader>
          <CardContent className="py-2 px-4 space-y-3">
            <p className="text-[11px] text-muted-foreground">أدخل أو حدّث مفاتيح API لكل مصدر. المفاتيح تُحفظ بشكل آمن ومشفّر.</p>
            {sortedSources.map((source) => (
              <div key={source.id} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border">
                <Label className="text-xs font-bold min-w-[100px]">{source.apiKeyName}</Label>
                <div className="relative flex-1">
                  <Input
                    type={showKeys[source.id] ? 'text' : 'password'}
                    placeholder={`أدخل ${source.apiKeyName}...`}
                    value={keyValues[source.apiKeyName] || ''}
                    onChange={(e) => setKeyValues(prev => ({ ...prev, [source.apiKeyName]: e.target.value }))}
                    className="text-xs h-8 pr-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8"
                    onClick={() => setShowKeys(prev => ({ ...prev, [source.id]: !prev[source.id] }))}
                  >
                    {showKeys[source.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-[10px] px-3"
                  onClick={() => saveApiKey(source.apiKeyName)}
                  disabled={savingKey === source.apiKeyName || !keyValues[source.apiKeyName]?.trim()}
                >
                  {savingKey === source.apiKeyName ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                  <span className="mr-1">حفظ</span>
                </Button>
              </div>
            ))}
            <p className="text-[10px] text-amber-600">⚠️ ملاحظة: لتحديث المفاتيح بشكل دائم، يُفضل استخدام إعدادات Lovable Cloud → Secrets.</p>
          </CardContent>
        </Card>
      )}

      {/* Source Cards */}
      <div className="space-y-3">
        {sortedSources.map((source) => (
          <Card key={source.id} className={`transition-all ${!source.enabled ? 'opacity-50' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold">{source.displayName}</h4>
                    {getStatusBadge(source.status)}
                    <Badge variant="outline" className="text-[10px]">أولوية #{source.priority}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{source.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-muted-foreground">المفتاح: {source.apiKeyName}</span>
                    {source.lastChecked && (
                      <span className="text-[10px] text-muted-foreground">• آخر فحص: {new Date(source.lastChecked).toLocaleTimeString('ar')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => changePriority(source.id, 'up')} title="رفع الأولوية">
                      <ArrowUpDown size={10} />
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => testSource(source.id)} disabled={testingSource === source.id}>
                    {testingSource === source.id ? <Loader2 size={10} className="animate-spin" /> : 'اختبار'}
                  </Button>
                  <Switch checked={source.enabled} onCheckedChange={() => toggleSource(source.id)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info */}
      <Card className="bg-muted/30 border-border">
        <CardContent className="p-4">
          <h4 className="text-sm font-bold mb-2">كيف يعمل الانتقال التلقائي</h4>
          <ul className="text-[11px] text-muted-foreground space-y-1">
            <li>• عند إرجاع مصدر خطأ 429 (نفاد الحصة)، ينتقل النظام تلقائياً للمصدر التالي المفعّل.</li>
            <li>• الانتقال سلس — المستخدم لا يلاحظ أي انقطاع.</li>
            <li>• SerpAPI → Serper.dev → RapidAPI → Lovable AI (كملاذ أخير).</li>
            <li>• Serper.dev يشمل Maps, Places, Images, Reviews لبيانات شاملة.</li>
            <li>• يمكنك تغيير الأولوية وتفعيل/تعطيل أي مصدر من هنا.</li>
          </ul>
        </CardContent>
      </Card>

      {/* API Usage Charts */}
      <AdminAPIUsageCharts />
    </div>
  );
};

export default AdminAPIMonitoring;
