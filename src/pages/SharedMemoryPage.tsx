import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { MapPin, Calendar, ChevronLeft, ChevronRight, Play, Image as ImageIcon, Archive, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

const SharedMemoryPage = () => {
  const { shareCode } = useParams();
  const { i18n, t } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const dateLocale = isArabic ? "ar-u-nu-latn" : (i18n.language || "en-US");
  const [memory, setMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (shareCode) loadMemory();
  }, [shareCode]);

  const loadMemory = async () => {
    setLoading(true);
    // shareCode is the memory id for simplicity
    const { data, error: err } = await supabase
      .from("memories")
      .select("*")
      .eq("id", shareCode)
      .eq("is_published", true)
      .single();

    if (err || !data) {
      setError(true);
      setLoading(false);
      return;
    }

    // Fetch author profile separately
    const { data: authorProfile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", data.user_id)
      .single();

    setMemory({ ...data, author: authorProfile });
    setLoading(false);
  };

  const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (error || !memory) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-muted-foreground gap-3">
      <Archive className="w-16 h-16 opacity-30" />
      <p className="text-lg font-medium">{t("sharedMemoryPage.notFound")}</p>
    </div>
  );

  const mediaUrls = memory.media_urls || [];

  return (
    <div className="min-h-screen bg-background pt-16 pb-10">
      <div className="max-w-2xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="text-center mb-6">
            <Badge className="mb-3 gap-1">
              {memory.memory_type === "trip" ? "✈️" : "📖"} {t("sharedMemoryPage.badge")}
            </Badge>
            <h1 className="text-2xl font-bold text-foreground">{memory.title}</h1>
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground mt-2">
              {memory.location_name && (
                <span className="flex items-center gap-1"><MapPin size={14} />{memory.location_name}</span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={14} />{new Date(memory.created_at).toLocaleDateString(dateLocale)}
              </span>
            </div>
          </div>

          {/* Media viewer */}
          {mediaUrls.length > 0 && (
            <div className="relative rounded-2xl overflow-hidden bg-black mb-6">
              <div className="aspect-video relative">
                {isVideo(mediaUrls[activeIdx]) ? (
                  <video src={mediaUrls[activeIdx]} controls autoPlay className="w-full h-full object-contain" />
                ) : (
                  <img src={mediaUrls[activeIdx]} alt="" className="w-full h-full object-contain" />
                )}
                {mediaUrls.length > 1 && (
                  <>
                    <button
                      disabled={activeIdx === 0}
                      onClick={() => setActiveIdx(i => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 hover:bg-black/60 rounded-full disabled:opacity-30"
                    >
                      <ChevronLeft className="w-5 h-5 text-white" />
                    </button>
                    <button
                      disabled={activeIdx >= mediaUrls.length - 1}
                      onClick={() => setActiveIdx(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 hover:bg-black/60 rounded-full disabled:opacity-30"
                    >
                      <ChevronRight className="w-5 h-5 text-white" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {mediaUrls.map((_: string, i: number) => (
                        <button key={i} onClick={() => setActiveIdx(i)}
                          className={`w-2 h-2 rounded-full ${i === activeIdx ? "bg-white" : "bg-white/40"}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Thumbnails */}
              {mediaUrls.length > 1 && (
                <div className="flex gap-1.5 p-3 overflow-x-auto bg-black/80">
                  {mediaUrls.map((url: string, i: number) => (
                    <button key={i} onClick={() => setActiveIdx(i)}
                      className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 border-2 ${i === activeIdx ? "border-primary" : "border-transparent opacity-60"}`}>
                      {isVideo(url) ? (
                        <div className="w-full h-full bg-muted flex items-center justify-center"><Play className="w-3 h-3" /></div>
                      ) : (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {memory.description && (
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <p className="text-foreground leading-relaxed">{memory.description}</p>
            </div>
          )}

          {/* Author */}
          {memory.author && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <img src={memory.author.avatar_url || ""} alt="" className="w-8 h-8 rounded-full bg-muted" />
              <span>{memory.author.full_name || t("stories.traveler")}</span>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SharedMemoryPage;
