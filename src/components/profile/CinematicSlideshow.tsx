import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, X, Volume2, VolumeX, SkipForward, SkipBack, Film, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CinematicSlideshowProps {
  memory: any;
  isArabic: boolean;
  onClose: () => void;
}

const TRANSITIONS = [
  { name: "fade", enter: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  { name: "zoom", enter: { opacity: 0, scale: 1.3 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.8 } },
  { name: "slideLeft", enter: { opacity: 0, x: 100 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -100 } },
  { name: "slideUp", enter: { opacity: 0, y: 80 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -80 } },
  { name: "rotate", enter: { opacity: 0, rotate: 5, scale: 1.1 }, animate: { opacity: 1, rotate: 0, scale: 1 }, exit: { opacity: 0, rotate: -5, scale: 0.9 } },
];

const MUSIC_TRACKS = [
  { name: "Ambient Journey", url: "https://cdn.pixabay.com/audio/2024/11/29/audio_d2b31c1cad.mp3" },
  { name: "Calm Piano", url: "https://cdn.pixabay.com/audio/2024/02/14/audio_08625a8b0a.mp3" },
  { name: "Cinematic", url: "https://cdn.pixabay.com/audio/2023/10/18/audio_9f2a4c1094.mp3" },
];

const CinematicSlideshow = ({ memory, isArabic, onClose }: CinematicSlideshowProps) => {
  const mediaUrls = memory.media_urls || [];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SLIDE_DURATION = 4000; // 4 seconds per slide

  const isVideo = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url);

  const startSlideTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!playing) return;
    
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / SLIDE_DURATION) * 100, 100);
      setProgress(pct);
      if (elapsed >= SLIDE_DURATION) {
        setCurrentIdx(prev => {
          if (prev >= mediaUrls.length - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
        setProgress(0);
      }
    }, 50);
  }, [playing, mediaUrls.length]);

  useEffect(() => {
    startSlideTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentIdx, playing, startSlideTimer]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted ? 0 : 0.3;
      if (playing) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [playing, muted, selectedTrack]);

  const handleInteraction = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    handleInteraction();
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, []);

  const goNext = () => { if (currentIdx < mediaUrls.length - 1) { setCurrentIdx(i => i + 1); setProgress(0); } };
  const goPrev = () => { if (currentIdx > 0) { setCurrentIdx(i => i - 1); setProgress(0); } };
  const transition = TRANSITIONS[currentIdx % TRANSITIONS.length];

  if (mediaUrls.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black flex flex-col"
      onClick={handleInteraction}
    >
      <audio ref={audioRef} src={MUSIC_TRACKS[selectedTrack].url} loop />

      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-50 flex gap-1 p-2">
        {mediaUrls.map((_: string, i: number) => (
          <div key={i} className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-100"
              style={{ width: i < currentIdx ? "100%" : i === currentIdx ? `${progress}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Ken Burns effect on images */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={transition.enter}
            animate={transition.animate}
            exit={transition.exit}
            transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0"
          >
            {isVideo(mediaUrls[currentIdx]) ? (
              <video src={mediaUrls[currentIdx]} autoPlay muted={muted} className="w-full h-full object-cover" />
            ) : (
              <motion.img
                src={mediaUrls[currentIdx]}
                alt=""
                className="w-full h-full object-cover"
                initial={{ scale: 1 }}
                animate={{ scale: 1.08 }}
                transition={{ duration: SLIDE_DURATION / 1000, ease: "linear" }}
              />
            )}
            {/* Cinematic overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          </motion.div>
        </AnimatePresence>

        {/* Memory info overlay */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: currentIdx === 0 ? 1 : 0.7, y: 0 }}
          className="absolute bottom-20 left-0 right-0 px-6 z-10"
        >
          <h2 className="text-white text-2xl font-bold mb-2 drop-shadow-xl">{memory.title}</h2>
          <div className="flex items-center gap-3 text-white/70 text-sm">
            {memory.location_name && (
              <span className="flex items-center gap-1"><MapPin size={14} />{memory.location_name}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={14} />{new Date(memory.created_at).toLocaleDateString(isArabic ? "ar-u-nu-latn" : "en-US")}
            </span>
          </div>
          {memory.description && currentIdx === 0 && (
            <p className="text-white/60 text-sm mt-2 line-clamp-2">{memory.description}</p>
          )}
          <p className="text-white/40 text-xs mt-2">{currentIdx + 1} / {mediaUrls.length}</p>
        </motion.div>
      </div>

      {/* Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 p-4 z-50"
          >
            <div className="flex items-center justify-center gap-4 mb-3">
              <button onClick={goPrev} disabled={currentIdx === 0}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm disabled:opacity-30">
                <SkipBack className="w-5 h-5 text-white" />
              </button>
              <button onClick={() => setPlaying(!playing)}
                className="p-3 bg-white/20 hover:bg-white/30 rounded-full backdrop-blur-sm">
                {playing ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white" />}
              </button>
              <button onClick={goNext} disabled={currentIdx >= mediaUrls.length - 1}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-sm disabled:opacity-30">
                <SkipForward className="w-5 h-5 text-white" />
              </button>
            </div>

            {/* Music & Close */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setMuted(!muted)} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full">
                  {muted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
                </button>
                <select
                  value={selectedTrack}
                  onChange={e => setSelectedTrack(Number(e.target.value))}
                  className="bg-white/10 text-white text-[10px] rounded-lg px-2 py-1 border-0 outline-none backdrop-blur-sm"
                >
                  {MUSIC_TRACKS.map((t, i) => (
                    <option key={i} value={i} className="bg-black text-white">{t.name}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" variant="ghost" onClick={onClose} className="text-white/70 hover:text-white gap-1 text-xs">
                <X size={14} />{isArabic ? "إغلاق" : "Close"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close button always visible */}
      <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 rounded-full">
        <X className="w-5 h-5 text-white" />
      </button>
    </motion.div>
  );
};

export default CinematicSlideshow;
