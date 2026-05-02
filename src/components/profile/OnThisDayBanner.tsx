import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, MapPin, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface OnThisDayBannerProps {
  userId: string;
  isArabic: boolean;
  onViewMemory?: (memory: any) => void;
}

const OnThisDayBanner = ({ userId, isArabic, onViewMemory }: OnThisDayBannerProps) => {
  const [memories, setMemories] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadOnThisDay();
  }, [userId]);

  const loadOnThisDay = async () => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Check memories
    const { data: memData } = await supabase
      .from("memories")
      .select("*")
      .eq("user_id", userId);

    // Check stories
    const { data: storyData } = await supabase
      .from("travel_stories")
      .select("id, title, media_urls, location_name, created_at")
      .eq("user_id", userId);

    const matches: any[] = [];

    (memData || []).forEach((m: any) => {
      const d = new Date(m.created_at);
      if (d.getMonth() + 1 === month && d.getDate() === day && d.getFullYear() < today.getFullYear()) {
        const yearsAgo = today.getFullYear() - d.getFullYear();
        matches.push({ ...m, type: "memory", yearsAgo });
      }
    });

    (storyData || []).forEach((s: any) => {
      const d = new Date(s.created_at);
      if (d.getMonth() + 1 === month && d.getDate() === day && d.getFullYear() < today.getFullYear()) {
        const yearsAgo = today.getFullYear() - d.getFullYear();
        matches.push({ ...s, type: "story", yearsAgo });
      }
    });

    if (matches.length > 0) {
      setMemories(matches);
      // Also insert a notification
      const firstMatch = matches[0];
      const title = isArabic ? `🕰️ ذكرى من ${firstMatch.yearsAgo === 1 ? "سنة" : firstMatch.yearsAgo + " سنوات"}` : `🕰️ Memory from ${firstMatch.yearsAgo} year${firstMatch.yearsAgo > 1 ? "s" : ""} ago`;
      const message = isArabic
        ? `في مثل هذا اليوم: ${firstMatch.title || firstMatch.location_name || "ذكرى جميلة"}`
        : `On this day: ${firstMatch.title || firstMatch.location_name || "A beautiful memory"}`;

      // Check if we already sent this notification today
      const todayStr = today.toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "on_this_day")
        .gte("created_at", todayStr)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "on_this_day",
          title,
          message,
          metadata: { memory_id: firstMatch.id, years_ago: firstMatch.yearsAgo } as any,
        });
      }
    }
  };

  if (dismissed || memories.length === 0) return null;

  const featured = memories[0];
  const coverImg = featured.media_urls?.[0];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="relative bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/20 rounded-2xl overflow-hidden mb-4"
      >
        <div className="flex items-stretch">
          {/* Image */}
          {coverImg && (
            <div className="w-24 h-24 shrink-0">
              <img src={coverImg} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {/* Content */}
          <div className="flex-1 p-3 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary">
                {isArabic ? "في مثل هذا اليوم" : "On This Day"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isArabic
                  ? `منذ ${featured.yearsAgo === 1 ? "سنة" : featured.yearsAgo + " سنوات"}`
                  : `${featured.yearsAgo} year${featured.yearsAgo > 1 ? "s" : ""} ago`}
              </span>
            </div>
            <h4 className="text-sm font-bold text-foreground truncate">{featured.title}</h4>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              {featured.location_name && (
                <span className="flex items-center gap-0.5"><MapPin size={8} />{featured.location_name}</span>
              )}
              <span className="flex items-center gap-0.5">
                <Calendar size={8} />
                {new Date(featured.created_at).toLocaleDateString(isArabic ? "ar-u-nu-latn" : "en-US")}
              </span>
            </div>
            {memories.length > 1 && (
              <p className="text-[10px] text-primary mt-1">
                +{memories.length - 1} {isArabic ? "ذكريات أخرى" : "more memories"}
              </p>
            )}
          </div>
          {/* Actions */}
          <div className="flex flex-col items-center justify-center gap-1 p-2 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-primary"
              onClick={() => onViewMemory?.(featured)}>
              {isArabic ? "عرض" : "View"}
            </Button>
            <button onClick={() => setDismissed(true)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OnThisDayBanner;
