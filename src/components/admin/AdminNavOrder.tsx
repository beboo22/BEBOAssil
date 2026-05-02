import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { GripVertical, ArrowUp, ArrowDown, Save, RefreshCw, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_NAV_ORDER = [
  "home", "destinations", "planner", "promotions", "bookings",
  "flights", "hotels", "cars", "my-trips", "stories",
  "story-explorer", "stories-map", "memories", "reels",
  "events", "saved-bookings", "pricing", "wallet"
];

const NAV_LABELS: Record<string, { en: string; ar: string; icon: string }> = {
  "home": { en: "Home", ar: "الرئيسية", icon: "🏠" },
  "destinations": { en: "Destinations", ar: "الوجهات", icon: "📍" },
  "planner": { en: "Planner", ar: "المخطط", icon: "📅" },
  "promotions": { en: "Promotions", ar: "العروض", icon: "🎁" },
  "bookings": { en: "Bookings", ar: "الحجوزات", icon: "🛒" },
  "flights": { en: "Flights", ar: "الرحلات", icon: "✈️" },
  "hotels": { en: "Hotels", ar: "الفنادق", icon: "🏨" },
  "cars": { en: "Cars", ar: "السيارات", icon: "🚗" },
  "my-trips": { en: "My Trips", ar: "رحلاتي", icon: "🗺️" },
  "stories": { en: "Stories", ar: "القصص", icon: "📸" },
  "story-explorer": { en: "Story Explorer", ar: "مستكشف القصص", icon: "🧭" },
  "stories-map": { en: "Stories Map", ar: "خريطة القصص", icon: "🗺️" },
  "memories": { en: "Memories", ar: "الذكريات", icon: "📦" },
  "reels": { en: "Reels", ar: "ريلز", icon: "🎬" },
  "events": { en: "Events", ar: "الفعاليات", icon: "✨" },
  "saved-bookings": { en: "Saved Bookings", ar: "المحفوظات", icon: "🔖" },
  "pricing": { en: "Pricing", ar: "الأسعار", icon: "👑" },
  "wallet": { en: "Wallet", ar: "المحفظة", icon: "💰" },
};

const AdminNavOrder = () => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [navOrder, setNavOrder] = useState<string[]>(DEFAULT_NAV_ORDER);
  const [hiddenItems, setHiddenItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("nav_order")
        .limit(1)
        .single();
      if (data?.nav_order) {
        const order = data.nav_order as any;
        if (Array.isArray(order)) {
          // Simple array format
          setNavOrder(order as string[]);
        } else if (order.visible && order.hidden) {
          // Object format with visible/hidden
          setNavOrder(order.visible as string[]);
          setHiddenItems(order.hidden as string[]);
        }
      }
      setLoading(false);
    };
    fetchOrder();
  }, []);

  const moveItem = (idx: number, direction: "up" | "down") => {
    const toIdx = direction === "up" ? idx - 1 : idx + 1;
    if (toIdx < 0 || toIdx >= navOrder.length) return;
    const newOrder = [...navOrder];
    [newOrder[idx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[idx]];
    setNavOrder(newOrder);
  };

  const toggleVisibility = (key: string) => {
    if (key === "home") return; // Can't hide home
    if (hiddenItems.includes(key)) {
      setHiddenItems(prev => prev.filter(k => k !== key));
    } else {
      setHiddenItems(prev => [...prev, key]);
    }
  };

  const saveOrder = async () => {
    setSaving(true);
    const payload = { visible: navOrder, hidden: hiddenItems };
    const { error } = await supabase
      .from("site_settings")
      .update({ nav_order: payload as any })
      .eq("id", (await supabase.from("site_settings").select("id").limit(1).single()).data?.id || "");
    
    if (error) {
      toast.error("Failed to save");
    } else {
      toast.success(isAr ? "تم حفظ ترتيب القائمة ✅" : "Navigation order saved ✅");
    }
    setSaving(false);
  };

  const resetOrder = () => {
    setNavOrder(DEFAULT_NAV_ORDER);
    setHiddenItems([]);
    toast.success(isAr ? "تم إعادة الترتيب الافتراضي" : "Reset to default order");
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold">{isAr ? "ترتيب القائمة الرئيسية" : "Navigation Menu Order"}</h3>
          <p className="text-sm text-muted-foreground">{isAr ? "اسحب العناصر لإعادة ترتيبها أو أخفها" : "Reorder or hide navigation items for all users"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={resetOrder}>
            <RefreshCw size={12} /> {isAr ? "إعادة تعيين" : "Reset"}
          </Button>
          <Button size="sm" className="gap-1 text-xs" onClick={saveOrder} disabled={saving}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {isAr ? "حفظ الترتيب" : "Save Order"}
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        {navOrder.map((key, idx) => {
          const label = NAV_LABELS[key];
          if (!label) return null;
          const isHidden = hiddenItems.includes(key);
          
          return (
            <motion.div
              key={key}
              layout
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isHidden 
                  ? "bg-muted/30 border-border/30 opacity-50" 
                  : "bg-card border-border hover:border-primary/30"
              }`}
            >
              <GripVertical size={14} className="text-muted-foreground shrink-0" />
              <span className="text-lg shrink-0">{label.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{isAr ? label.ar : label.en}</span>
                <span className="text-[10px] text-muted-foreground mx-2">#{idx + 1}</span>
              </div>
              
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === 0}
                  onClick={() => moveItem(idx, "up")}
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={idx === navOrder.length - 1}
                  onClick={() => moveItem(idx, "down")}
                >
                  <ArrowDown size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => toggleVisibility(key)}
                  disabled={key === "home"}
                >
                  {isHidden ? <EyeOff size={14} className="text-muted-foreground" /> : <Eye size={14} className="text-primary" />}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {hiddenItems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {isAr ? `${hiddenItems.length} عنصر مخفي` : `${hiddenItems.length} hidden item(s)`}
        </p>
      )}
    </div>
  );
};

export default AdminNavOrder;
