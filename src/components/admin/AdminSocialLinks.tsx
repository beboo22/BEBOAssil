import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SocialIcon, SOCIAL_PLATFORMS, type SocialPlatform } from "@/components/social/SocialIcon";
import { DEFAULT_SOCIAL_LINKS, normalizeSocialLinks, type SocialLinkConfig } from "@/components/social/socialLinks";

const AdminSocialLinks = () => {
  const [links, setLinks] = useState<SocialLinkConfig[]>(DEFAULT_SOCIAL_LINKS);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchLinks(); }, []);

  const fetchLinks = async () => {
    const { data } = await (supabase as any).from("site_settings").select("social_links").eq("id", "default").maybeSingle();
    setLinks(normalizeSocialLinks(data?.social_links));
  };

  const updateLink = (id: string, patch: Partial<SocialLinkConfig>) => {
    setLinks((prev) => prev.map((link) => link.id === id ? { ...link, ...patch } : link));
  };

  const addLink = () => {
    setLinks((prev) => [...prev, {
      id: `custom-${Date.now()}`,
      name: "New Link",
      platform: "custom",
      url: "",
      enabled: true,
      sortOrder: prev.length + 1,
    }]);
  };

  const deleteLink = (id: string) => setLinks((prev) => prev.filter((link) => link.id !== id));

  const saveLinks = async () => {
    setSaving(true);
    const payload = links.map((link, index) => ({ ...link, sortOrder: index + 1 }));
    const { error } = await (supabase as any).from("site_settings").update({ social_links: payload }).eq("id", "default");
    setSaving(false);
    if (error) toast.error("فشل حفظ روابط التواصل");
    else toast.success("تم حفظ روابط التواصل");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">روابط التواصل الرسمية</h3>
          <p className="text-xs text-muted-foreground">فعّل أو عدّل التطبيقات التي تظهر أسفل الصفحة.</p>
        </div>
        <Button size="sm" onClick={addLink} className="gap-2"><Plus size={14} /> إضافة</Button>
      </div>

      {links.map((link) => (
        <div key={link.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground overflow-hidden">
                <SocialIcon platform={link.platform} iconUrl={link.iconUrl} className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{link.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{link.url || "بدون رابط"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={link.enabled} onCheckedChange={(enabled) => updateLink(link.id, { enabled })} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteLink(link.id)}><Trash2 size={14} /></Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">الاسم</Label>
              <Input value={link.name} onChange={(e) => updateLink(link.id, { name: e.target.value })} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">الشعار</Label>
              <Select value={link.platform} onValueChange={(platform: SocialPlatform) => updateLink(link.id, { platform })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOCIAL_PLATFORMS.map((platform) => (
                    <SelectItem key={platform.value} value={platform.value}>{platform.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">الرابط</Label>
              <Input value={link.url} onChange={(e) => updateLink(link.id, { url: e.target.value })} dir="ltr" className="h-9" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">رابط شعار مخصص (اختياري)</Label>
              <Input
                value={link.iconUrl || ""}
                onChange={(e) => updateLink(link.id, { iconUrl: e.target.value })}
                placeholder="https://...logo.png"
                dir="ltr"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground mt-1">اتركه فارغًا لاستخدام شعار المنصة الافتراضي.</p>
            </div>
          </div>
        </div>
      ))}

      <Button onClick={saveLinks} disabled={saving} className="w-full gap-2">
        <Save size={16} /> {saving ? "جاري الحفظ..." : "حفظ روابط التواصل"}
      </Button>
    </div>
  );
};

export default AdminSocialLinks;