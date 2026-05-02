import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ReactMarkdown from "react-markdown";

const AdminPrivacy = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [contentEn, setContentEn] = useState("");
  const [contentAr, setContentAr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLang, setPreviewLang] = useState<"en" | "ar">("en");

  useEffect(() => {
    supabase
      .from("privacy_policy")
      .select("*")
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setContentEn(data.content_en || "");
          setContentAr(data.content_ar || "");
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { data: existing } = await supabase.from("privacy_policy").select("id").limit(1).single();

    if (existing) {
      const { error } = await supabase
        .from("privacy_policy")
        .update({ content_en: contentEn, content_ar: contentAr, updated_by: user?.id || null, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) toast.error("Failed to save");
      else toast.success(t("admin.saved", { defaultValue: "Saved successfully" }));
    } else {
      const { error } = await supabase
        .from("privacy_policy")
        .insert({ content_en: contentEn, content_ar: contentAr, updated_by: user?.id || null });
      if (error) toast.error("Failed to save");
      else toast.success(t("admin.saved", { defaultValue: "Saved successfully" }));
    }
    setSaving(false);
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">
          {t("admin.privacyPolicy", { defaultValue: "Privacy Policy" })}
        </h3>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t("admin.save", { defaultValue: "Save" })}
        </Button>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview" className="gap-1"><Eye className="w-3 h-3" /> Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-4">
          <div>
            <Label className="font-medium">English Content (Markdown)</Label>
            <Textarea
              value={contentEn}
              onChange={(e) => setContentEn(e.target.value)}
              className="mt-1.5 min-h-[200px] font-mono text-sm"
              placeholder="# Privacy Policy&#10;&#10;Write your privacy policy here using Markdown..."
              dir="ltr"
            />
          </div>
          <div>
            <Label className="font-medium">المحتوى العربي (Markdown)</Label>
            <Textarea
              value={contentAr}
              onChange={(e) => setContentAr(e.target.value)}
              className="mt-1.5 min-h-[200px] font-mono text-sm"
              placeholder="# سياسة الخصوصية&#10;&#10;اكتب سياسة الخصوصية هنا باستخدام Markdown..."
              dir="rtl"
            />
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <div className="flex gap-2 mb-3">
            <Button variant={previewLang === "en" ? "default" : "outline"} size="sm" onClick={() => setPreviewLang("en")}>English</Button>
            <Button variant={previewLang === "ar" ? "default" : "outline"} size="sm" onClick={() => setPreviewLang("ar")}>العربية</Button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/30 rounded-xl p-6 border border-border" dir={previewLang === "ar" ? "rtl" : "ltr"}>
            <ReactMarkdown>{previewLang === "ar" ? contentAr : contentEn}</ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPrivacy;
