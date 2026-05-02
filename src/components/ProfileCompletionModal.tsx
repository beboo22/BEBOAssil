import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const COUNTRIES = [
  "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "Jordan", "Lebanon", "Iraq", "Morocco", "Tunisia", "Algeria",
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Italy", "Spain", "Netherlands", "Switzerland", "Sweden", "Norway", "Denmark",
  "Turkey", "Japan", "South Korea", "China", "India", "Pakistan", "Indonesia",
  "Malaysia", "Thailand", "Philippines", "Singapore", "Brazil", "Mexico",
  "South Africa", "Nigeria", "Kenya", "New Zealand",
].sort();

const SKIPPED_KEY = "profile_completion_skipped";

const ProfileCompletionModal = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [birthdate, setBirthdate] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    // If previously skipped, don't show
    const skippedFor = localStorage.getItem(SKIPPED_KEY);
    if (skippedFor === user.id) return;

    const checkProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("birthdate, country, gender")
        .eq("id", user.id)
        .maybeSingle();
      
      // Only show if all fields are empty
      if (data && !data.birthdate && !data.country && !data.gender) {
        const providers = user.app_metadata?.providers || [];
        const isOAuth = providers.includes("google") || providers.includes("apple");
        const createdRecently = new Date(user.created_at).getTime() > Date.now() - 5 * 60 * 1000;
        if (isOAuth || createdRecently) {
          setOpen(true);
        }
      }
    };
    const timer = setTimeout(checkProfile, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (birthdate) updates.birthdate = birthdate;
      if (country) updates.country = country;
      if (gender) updates.gender = gender;
      
      if (Object.keys(updates).length > 0) {
        await supabase.from("profiles").update(updates).eq("id", user.id);
        toast.success(t("profile.saved", { defaultValue: "Profile updated!" }));
      }
      // Mark as completed so it never shows again
      localStorage.setItem(SKIPPED_KEY, user.id);
      setOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (user) localStorage.setItem(SKIPPED_KEY, user.id);
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="sm:max-w-md z-[200]" style={{ zIndex: 200 }}>
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            {t("profile.completeTitle", { defaultValue: "Complete Your Profile" })}
          </DialogTitle>
          <p className="text-center text-sm text-muted-foreground">
            {t("profile.completeSubtitle", { defaultValue: "Optional — helps us personalize your experience" })}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Date of Birth - using standard date input */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Calendar size={14} />
              {t("auth.birthdate", { defaultValue: "Date of Birth" })}
            </Label>
            <Input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              min="1920-01-01"
              className="text-sm"
              lang="en"
              dir="ltr"
              placeholder="YYYY-MM-DD"
            />
          </div>

          {/* Gender */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("auth.gender", { defaultValue: "Gender" })}</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="relative z-[210]">
                <SelectValue placeholder={t("auth.selectGender", { defaultValue: "Select gender" })} />
              </SelectTrigger>
              <SelectContent className="z-[300]" position="popper" sideOffset={4}>
                <SelectItem value="male">{t("auth.male", { defaultValue: "Male" })}</SelectItem>
                <SelectItem value="female">{t("auth.female", { defaultValue: "Female" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Globe size={14} />
              {t("auth.country", { defaultValue: "Country" })}
            </Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="relative z-[210]">
                <SelectValue placeholder={t("auth.selectCountry", { defaultValue: "Select country" })} />
              </SelectTrigger>
              <SelectContent className="z-[300] max-h-60" position="popper" sideOffset={4}>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {t("common.save", { defaultValue: "Save" })}
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            {t("common.skip", { defaultValue: "Skip" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileCompletionModal;
