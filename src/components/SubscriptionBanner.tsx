import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const SubscriptionBanner = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(true);
  const [bannerText, setBannerText] = useState("");
  const [bannerEnabled, setBannerEnabled] = useState(true);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!user) {
        setHasSubscription(false);
        return;
      }
      const { data } = await supabase
        .from("user_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();
      setHasSubscription(!!data);
    };
    checkSubscription();
  }, [user]);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("announcement_banner_text, announcement_banner_enabled")
        .eq("id", "default")
        .maybeSingle();
      if (data) {
        setBannerText(data.announcement_banner_text || "");
        setBannerEnabled(data.announcement_banner_enabled ?? true);
      }
    };
    fetchSettings();
  }, []);

  if (hasSubscription || dismissed) return null;

  const defaultText = isArabic
    ? "🎉 اكتشف باقاتنا واستمتع بتجربة سفر أفضل"
    : "🎉 Discover our plans and enjoy a better travel experience";

  const displayText = bannerText || defaultText;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white z-40"
      >
        <div className="container mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Crown size={16} className="shrink-0 text-yellow-200" />
            <p className="text-xs sm:text-sm font-bold truncate">
              {displayText}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => navigate('/pricing')}
              className="text-xs font-bold px-3 py-0.5 h-6 bg-white text-orange-600 hover:bg-white/90 shadow-sm"
            >
              {t('subscription.viewPlans')}
            </Button>
            <button onClick={() => setDismissed(true)} className="opacity-70 hover:opacity-100 transition-opacity p-0.5">
              <X size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SubscriptionBanner;
