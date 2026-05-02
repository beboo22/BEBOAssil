import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Archive, MapPin, Calendar, Sparkles, Trash2, ChevronLeft, ChevronRight, X, Play, Image as ImageIcon, Share2, Film, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import CinematicSlideshow from "./CinematicSlideshow";

interface MemoryAlbumProps {
  memories: any[];
  isArabic: boolean;
  userId: string;
  onUpdate: () => void;
  onPublish: (memory: any) => Promise<void>;
}

const MemoryAlbum = ({ memories, isArabic, userId, onUpdate, onPublish }: MemoryAlbumProps) => {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeMemory, setActiveMemory] = useState<any>(null);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [slideshowMemory, setSlideshowMemory] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const openViewer = (memory: any) => {
    setActiveMemory(memory);
    setActiveMediaIdx(0);
    setViewerOpen(true);
  };

  const deleteMemory = async (id: string) => {
    await supabase.from("memories").delete().eq("id", id);
    onUpdate();
    toast.success(isArabic ? "تم الحذف" : "Deleted");
    if (activeMemory?.id === id) setViewerOpen(false);
  };

  const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

  const shareMemory = async (memory: any) => {
    // Make memory temporarily public for sharing
    if (!memory.is_published) {
      await supabase.from("memories").update({ is_published: true }).eq("id", memory.id);
    }
    const shareUrl = `${window.location.origin}/memory/${memory.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(memory.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success(isArabic ? "تم نسخ رابط المشاركة ✅" : "Share link copied! ✅");
    } catch {
      toast.info(shareUrl);
    }
  };

  if (memories.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
        <Archive size={32} className="mx-auto mb-2 opacity-30" />
        <p>{isArabic ? "لا توجد ذكريات محفوظة" : "No memories saved yet"}</p>
        <p className="text-xs mt-1">{isArabic ? "احفظ قصصك ورحلاتك كذكريات خاصة" : "Save your stories and trips as private memories"}</p>
      </div>
    );
  }

  const allMedia = activeMemory?.media_urls || [];

  return (
    <>
      {/* Album Grid */}
      <div className="grid grid-cols-2 gap-3">
        {memories.map((memory: any, idx: number) => {
          const coverImg = memory.media_urls?.[0];
          const mediaCount = memory.media_urls?.length || 0;
          return (
            <motion.div
              key={memory.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="group relative rounded-2xl overflow-hidden bg-card border border-border shadow-sm hover:shadow-lg transition-all cursor-pointer"
              onClick={() => openViewer(memory)}
            >
              {/* Cover */}
              <div className="aspect-[4/3] relative overflow-hidden">
                {coverImg ? (
                  isVideo(coverImg) ? (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Play className="w-8 h-8 text-muted-foreground" />
                    </div>
                  ) : (
                    <img src={coverImg} alt={memory.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  )
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
                  </div>
                )}
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {/* Media count badge */}
                {mediaCount > 1 && (
                  <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <ImageIcon className="w-2.5 h-2.5" />{mediaCount}
                  </div>
                )}
                {/* Type badge */}
                <Badge className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white border-0 text-[9px] h-5">
                  {memory.memory_type === "trip" ? "✈️" : memory.memory_type === "activity" ? "🎯" : "📖"}
                </Badge>
                {/* Title on cover */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h3 className="text-white font-bold text-sm truncate drop-shadow-lg">{memory.title}</h3>
                  <div className="flex items-center gap-2 text-white/70 text-[10px] mt-0.5">
                    {memory.location_name && (
                      <span className="flex items-center gap-0.5"><MapPin size={8} />{memory.location_name}</span>
                    )}
                    <span className="flex items-center gap-0.5">
                      <Calendar size={8} />
                      {new Date(memory.created_at).toLocaleDateString(isArabic ? "ar-u-nu-latn" : "en-US")}
                    </span>
                  </div>
                </div>
              </div>
              {/* Actions row */}
              <div className="p-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {!memory.is_published ? (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-primary"
                      onClick={(e) => { e.stopPropagation(); onPublish(memory); }}>
                      <Sparkles size={10} />{isArabic ? "نشر" : "Publish"}
                    </Button>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] h-5 gap-0.5">✅</Badge>
                  )}
                  {(memory.media_urls?.length || 0) > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                      onClick={(e) => { e.stopPropagation(); setSlideshowMemory(memory); }}>
                      <Film size={10} />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"
                    onClick={(e) => { e.stopPropagation(); shareMemory(memory); }}>
                    {copiedId === memory.id ? <Check size={10} className="text-green-500" /> : <Share2 size={10} />}
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteMemory(memory.id); }}>
                  <Trash2 size={11} />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Fullscreen Memory Viewer */}
      <AnimatePresence>
        {viewerOpen && activeMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/95 flex flex-col"
            onClick={() => setViewerOpen(false)}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white" onClick={e => e.stopPropagation()}>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-lg truncate">{activeMemory.title}</h2>
                <div className="flex items-center gap-2 text-white/60 text-xs">
                  {activeMemory.location_name && <span className="flex items-center gap-0.5"><MapPin size={10} />{activeMemory.location_name}</span>}
                  <span>{new Date(activeMemory.created_at).toLocaleDateString(isArabic ? "ar-u-nu-latn" : "en-US")}</span>
                </div>
              </div>
              <button onClick={() => setViewerOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X className="w-6 h-6 text-white" />
              </button>
            </div>

            {/* Media area */}
            <div className="flex-1 flex items-center justify-center relative px-4" onClick={e => e.stopPropagation()}>
              {allMedia.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeMediaIdx}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.3 }}
                      className="max-w-full max-h-[70vh] flex items-center justify-center"
                    >
                      {isVideo(allMedia[activeMediaIdx]) ? (
                        <video src={allMedia[activeMediaIdx]} controls autoPlay className="max-w-full max-h-[70vh] rounded-xl" />
                      ) : (
                        <img src={allMedia[activeMediaIdx]} alt="" className="max-w-full max-h-[70vh] rounded-xl object-contain" />
                      )}
                    </motion.div>
                  </AnimatePresence>
                  {/* Nav arrows */}
                  {allMedia.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm disabled:opacity-30"
                        disabled={activeMediaIdx === 0}
                        onClick={() => setActiveMediaIdx(i => i - 1)}
                      >
                        <ChevronLeft className="w-6 h-6 text-white" />
                      </button>
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm disabled:opacity-30"
                        disabled={activeMediaIdx === allMedia.length - 1}
                        onClick={() => setActiveMediaIdx(i => i + 1)}
                      >
                        <ChevronRight className="w-6 h-6 text-white" />
                      </button>
                    </>
                  )}
                  {/* Dots */}
                  {allMedia.length > 1 && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {allMedia.map((_: string, i: number) => (
                        <button key={i} onClick={() => setActiveMediaIdx(i)}
                          className={`w-2 h-2 rounded-full transition-all ${i === activeMediaIdx ? "bg-white scale-125" : "bg-white/40"}`} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-white/40 text-center">
                  <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                  <p>{isArabic ? "لا توجد وسائط" : "No media"}</p>
                </div>
              )}
            </div>

            {/* Description */}
            {activeMemory.description && (
              <div className="p-4 text-white/80 text-sm text-center max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
                {activeMemory.description}
              </div>
            )}

            {/* Thumbnails strip */}
            {allMedia.length > 1 && (
              <div className="p-3 flex gap-2 justify-center overflow-x-auto" onClick={e => e.stopPropagation()}>
                {allMedia.map((url: string, i: number) => (
                  <button key={i} onClick={() => setActiveMediaIdx(i)}
                    className={`w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${i === activeMediaIdx ? "border-primary scale-110" : "border-transparent opacity-60"}`}>
                    {isVideo(url) ? (
                      <div className="w-full h-full bg-muted flex items-center justify-center"><Play className="w-4 h-4" /></div>
                    ) : (
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Bottom actions */}
            <div className="p-4 flex justify-center gap-3" onClick={e => e.stopPropagation()}>
              {(allMedia.length > 1) && (
                <Button size="sm" variant="secondary" className="gap-1.5 rounded-xl" onClick={() => { setSlideshowMemory(activeMemory); setViewerOpen(false); }}>
                  <Film size={14} />{isArabic ? "عرض سينمائي" : "Cinematic View"}
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-white border-white/20 hover:bg-white/10" onClick={() => shareMemory(activeMemory)}>
                <Share2 size={14} />{isArabic ? "مشاركة" : "Share"}
              </Button>
              {!activeMemory.is_published && (
                <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { onPublish(activeMemory); setViewerOpen(false); }}>
                  <Sparkles size={14} />{isArabic ? "نشر" : "Publish"}
                </Button>
              )}
              <Button size="sm" variant="destructive" className="gap-1.5 rounded-xl" onClick={() => deleteMemory(activeMemory.id)}>
                <Trash2 size={14} />{isArabic ? "حذف" : "Delete"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Slideshow */}
      <AnimatePresence>
        {slideshowMemory && (
          <CinematicSlideshow
            memory={slideshowMemory}
            isArabic={isArabic}
            onClose={() => setSlideshowMemory(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default MemoryAlbum;
