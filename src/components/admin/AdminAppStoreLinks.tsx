import { useState, useEffect } from "react";
import { Smartphone, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface StoreLink {
  enabled: boolean;
  url: string;
}

interface AppStoreConfig {
  apple: StoreLink;
  google: StoreLink;
  huawei: StoreLink;
}

const AdminAppStoreLinks = () => {
  const [config, setConfig] = useState<AppStoreConfig>({
    apple: { enabled: false, url: "" },
    google: { enabled: false, url: "" },
    huawei: { enabled: false, url: "" },
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data } = await supabase.from("site_settings").select("app_store_links").eq("id", "default").single();
    if (data?.app_store_links) {
      setConfig(data.app_store_links as unknown as AppStoreConfig);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    const { error } = await supabase.from("site_settings").update({ app_store_links: config as any }).eq("id", "default");
    setSaving(false);
    if (error) {
      toast.error("فشل الحفظ");
    } else {
      toast.success("تم حفظ إعدادات المتاجر");
    }
  };

  const updateStore = (store: keyof AppStoreConfig, field: keyof StoreLink, value: any) => {
    setConfig(prev => ({
      ...prev,
      [store]: { ...prev[store], [field]: value },
    }));
  };

  const stores = [
    { key: "apple" as const, label: "Apple App Store", icon: "🍎", color: "bg-black" },
    { key: "google" as const, label: "Google Play Store", icon: "🤖", color: "bg-green-600" },
    { key: "huawei" as const, label: "Huawei AppGallery", icon: "📱", color: "bg-red-600" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="font-semibold flex items-center gap-2"><Smartphone size={16} /> روابط تحميل التطبيق</h3>
      <p className="text-xs text-muted-foreground">فعّل المتاجر وأضف روابط التحميل لعرضها في الصفحة الرئيسية</p>

      {stores.map(store => (
        <div key={store.key} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{store.icon}</span>
              <Label className="font-medium text-sm">{store.label}</Label>
            </div>
            <Switch
              checked={config[store.key].enabled}
              onCheckedChange={v => updateStore(store.key, "enabled", v)}
            />
          </div>
          {config[store.key].enabled && (
            <Input
              placeholder={`رابط ${store.label}...`}
              value={config[store.key].url}
              onChange={e => updateStore(store.key, "url", e.target.value)}
              dir="ltr"
              className="text-sm"
            />
          )}
        </div>
      ))}

      <Button onClick={saveConfig} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        حفظ الإعدادات
      </Button>
    </div>
  );
};

export default AdminAppStoreLinks;
