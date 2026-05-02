import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Palette, Smile, Music, LayoutTemplate, Crown, ImagePlus, Upload, X, Trash2, Move, Sticker, Volume2, Square, Headphones, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import bonVoyageSticker from "@/assets/stickers/bon-voyage.png";
import adventureSticker from "@/assets/stickers/adventure.png";
import paradiseSticker from "@/assets/stickers/paradise.png";
import explorerSticker from "@/assets/stickers/explorer.png";
import cameraSticker from "@/assets/stickers/camera.png";
import roadtripSticker from "@/assets/stickers/roadtrip.png";
import wanderlustSticker from "@/assets/stickers/wanderlust.png";
import foodieSticker from "@/assets/stickers/foodie.png";
import firstClassSticker from "@/assets/stickers/first-class.png";
import worldTravelerSticker from "@/assets/stickers/world-traveler.png";
import beachVibesSticker from "@/assets/stickers/beach-vibes.png";
import mountainPeakSticker from "@/assets/stickers/mountain-peak.png";
import sunsetChaserSticker from "@/assets/stickers/sunset-chaser.png";
import cityExplorerSticker from "@/assets/stickers/city-explorer.png";
import desertSoulSticker from "@/assets/stickers/desert-soul.png";
import oceanDiverSticker from "@/assets/stickers/ocean-diver.png";
import { MUSIC_TRACKS, MUSIC_CATEGORIES, playTrack, playCustomAudio, stopAll } from "@/utils/audioEngine";

const FILTERS = [
  { id: 'none', css: '' },
  { id: 'warm', css: 'sepia(0.3) saturate(1.4)' },
  { id: 'cool', css: 'hue-rotate(30deg) saturate(1.2)' },
  { id: 'bw', css: 'grayscale(1)' },
  { id: 'vintage', css: 'sepia(0.5) contrast(1.1) brightness(0.95)' },
  { id: 'vivid', css: 'saturate(1.8) contrast(1.1)' },
  { id: 'dramatic', css: 'contrast(1.4) brightness(0.9)' },
  { id: 'fade', css: 'brightness(1.1) saturate(0.7) contrast(0.9)' },
];

const TEMPLATES = [
  { id: 'travel', filter: 'warm', emoji: '✈️' },
  { id: 'food', filter: 'vivid', emoji: '🍽️' },
  { id: 'adventure', filter: 'dramatic', emoji: '🏔️' },
  { id: 'romantic', filter: 'vintage', emoji: '💕' },
  { id: 'party', filter: 'vivid', emoji: '🎉' },
];

const STICKER_PACKS: Record<string, string[]> = {
  travel: ['✈️', '🧳', '🗺️', '🏖️', '🏔️', '🗼', '🏰', '⛩️', '🚂', '🚗', '⛵', '🌍', '🧭', '📸', '🎒', '⛺'],
  food: ['🍕', '🍔', '🍣', '🍜', '🍰', '☕', '🍷', '🥗', '🌮', '🍦', '🥐', '🍱', '🍝', '🥂', '🍩', '🧁'],
  nature: ['🌅', '🌊', '🏝️', '🌺', '🌴', '🦋', '🌈', '⭐', '🌸', '🍃', '🌻', '🏜️', '💐', '🍂', '☀️', '🌙'],
  emotions: ['❤️', '😍', '🥰', '✨', '💫', '🎊', '🎈', '💖', '🤩', '😎', '🥳', '💝', '💕', '🫶', '💯', '🌟'],
};

const PRO_STICKERS = [
  { id: 'bonVoyage', src: bonVoyageSticker },
  { id: 'adventure', src: adventureSticker },
  { id: 'paradise', src: paradiseSticker },
  { id: 'explorer', src: explorerSticker },
  { id: 'camera', src: cameraSticker },
  { id: 'roadtrip', src: roadtripSticker },
  { id: 'wanderlust', src: wanderlustSticker },
  { id: 'foodie', src: foodieSticker },
  { id: 'firstClass', src: firstClassSticker },
  { id: 'worldTraveler', src: worldTravelerSticker },
  { id: 'beachVibes', src: beachVibesSticker },
  { id: 'mountainPeak', src: mountainPeakSticker },
  { id: 'sunsetChaser', src: sunsetChaserSticker },
  { id: 'cityExplorer', src: cityExplorerSticker },
  { id: 'desertSoul', src: desertSoulSticker },
  { id: 'oceanDiver', src: oceanDiverSticker },
];

export interface StoryStickerItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  isImage?: boolean;
  rotation: number;
}

interface StoryMediaEditorProps {
  previewUrls: string[];
  stickers: StoryStickerItem[];
  onStickersChange: (stickers: StoryStickerItem[]) => void;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export const StoryMediaEditor = ({ previewUrls, stickers, onStickersChange, activeFilter, onFilterChange }: StoryMediaEditorProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('stickers');
  const [activeStickerCategory, setActiveStickerCategory] = useState('travel');
  const [stickerSize, setStickerSize] = useState([32]);
  const [placingSticker, setPlacingSticker] = useState<string | null>(null);
  const [placingStickerIsImage, setPlacingStickerIsImage] = useState(false);
  const [customStickers, setCustomStickers] = useState<string[]>([]);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [audioCategory, setAudioCategory] = useState('ambient');
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [audioUrlInput, setAudioUrlInput] = useState('');
  const [previewIdx, setPreviewIdx] = useState(0);

  const currentFilter = FILTERS.find(f => f.id === activeFilter);

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingStickerId || !placingSticker || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const ns: StoryStickerItem = {
      id: `sticker-${Date.now()}-${Math.random()}`,
      emoji: placingSticker, x, y, size: stickerSize[0],
      isImage: placingStickerIsImage, rotation: 0,
    };
    onStickersChange([...stickers, ns]);
    setPlacingSticker(null);
    setPlacingStickerIsImage(false);
  }, [placingSticker, placingStickerIsImage, stickerSize, draggingStickerId, stickers, onStickersChange]);

  const handleStickerPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation(); e.preventDefault();
    if (!previewRef.current) return;
    const s = stickers.find(s => s.id === id);
    if (!s) return;
    setDraggingStickerId(id);
    dragStartPos.current = { x: e.clientX, y: e.clientY, sx: s.x, sy: s.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [stickers]);

  const handleStickerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingStickerId || !dragStartPos.current || !previewRef.current) return;
    e.stopPropagation();
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartPos.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartPos.current.y) / rect.height) * 100;
    const nx = Math.max(5, Math.min(95, dragStartPos.current.sx + dx));
    const ny = Math.max(5, Math.min(95, dragStartPos.current.sy + dy));
    onStickersChange(stickers.map(s => s.id === draggingStickerId ? { ...s, x: nx, y: ny } : s));
  }, [draggingStickerId, stickers, onStickersChange]);

  const handleStickerPointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingStickerId) { e.stopPropagation(); setDraggingStickerId(null); dragStartPos.current = null; }
  }, [draggingStickerId]);

  const removeSticker = (id: string) => onStickersChange(stickers.filter(s => s.id !== id));

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const urls = files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f));
    setCustomStickers(prev => [...prev, ...urls]);
    if (e.target) e.target.value = '';
  };

  const applyTemplate = (tmpl: typeof TEMPLATES[0]) => {
    onFilterChange(tmpl.filter);
  };

  if (previewUrls.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Preview with stickers */}
      <div ref={previewRef} onClick={handlePreviewClick}
        className={`relative aspect-video bg-black rounded-2xl overflow-hidden mx-auto max-w-sm ${placingSticker ? 'cursor-crosshair ring-2 ring-primary ring-offset-2' : ''}`}>
        <img src={previewUrls[previewIdx]} alt="" className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: currentFilter?.css || '' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
        
        {/* Stickers on preview */}
        {stickers.map(sticker => (
          <div key={sticker.id}
            className={`absolute z-20 group select-none touch-none ${draggingStickerId === sticker.id ? 'cursor-grabbing z-30' : 'cursor-grab'}`}
            style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation || 0}deg)` }}
            onPointerDown={(e) => handleStickerPointerDown(e, sticker.id)}
            onPointerMove={handleStickerPointerMove}
            onPointerUp={handleStickerPointerUp}>
            {sticker.isImage ? (
              <img src={sticker.emoji} alt="" className="drop-shadow-lg pointer-events-none" style={{ width: `${sticker.size}px`, height: `${sticker.size}px`, objectFit: 'contain' }} />
            ) : (
              <span className="drop-shadow-lg pointer-events-none" style={{ fontSize: `${sticker.size}px` }}>{sticker.emoji}</span>
            )}
            <button onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
              className="absolute -top-2 -right-2 w-4 h-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30">
              <X className="w-2.5 h-2.5 text-destructive-foreground" />
            </button>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
              <button onClick={(e) => { e.stopPropagation(); onStickersChange(stickers.map(s => s.id === sticker.id ? { ...s, size: Math.max(12, s.size - 4) } : s)); }}
                className="w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] text-primary-foreground font-bold">−</button>
              <button onClick={(e) => { e.stopPropagation(); onStickersChange(stickers.map(s => s.id === sticker.id ? { ...s, size: Math.min(80, s.size + 4) } : s)); }}
                className="w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] text-primary-foreground font-bold">+</button>
            </div>
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
              <button onClick={(e) => { e.stopPropagation(); onStickersChange(stickers.map(s => s.id === sticker.id ? { ...s, rotation: (s.rotation || 0) - 15 } : s)); }}
                className="w-3.5 h-3.5 bg-accent rounded-full flex items-center justify-center text-[7px] text-accent-foreground font-bold">↺</button>
              <button onClick={(e) => { e.stopPropagation(); onStickersChange(stickers.map(s => s.id === sticker.id ? { ...s, rotation: (s.rotation || 0) + 15 } : s)); }}
                className="w-3.5 h-3.5 bg-accent rounded-full flex items-center justify-center text-[7px] text-accent-foreground font-bold">↻</button>
            </div>
          </div>
        ))}

        {placingSticker && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <motion.div initial={{ scale: 0 }} animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
              className="bg-primary/20 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-white font-medium flex items-center gap-1.5">
              {placingStickerIsImage ? <img src={placingSticker} alt="" className="w-5 h-5 object-contain" /> : <span>{placingSticker}</span>}
              {t("reelsPage.tapImageToPlace")}
            </motion.div>
          </div>
        )}

        {/* Thumbnail strip */}
        {previewUrls.length > 1 && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 z-10">
            {previewUrls.slice(0, 8).map((url, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); setPreviewIdx(i); }}
                className={`w-6 h-6 rounded overflow-hidden border ${i === previewIdx ? 'border-primary' : 'border-white/30'}`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 h-8">
          <TabsTrigger value="stickers" className="text-[10px] gap-1"><Smile className="w-3 h-3" />{t("reelsPage.stickers")}</TabsTrigger>
          <TabsTrigger value="filters" className="text-[10px] gap-1"><Palette className="w-3 h-3" />{t("reelsPage.filtersTitle")}</TabsTrigger>
          <TabsTrigger value="music" className="text-[10px] gap-1"><Music className="w-3 h-3" />{t("reelsPage.audioLibrary")}</TabsTrigger>
          <TabsTrigger value="templates" className="text-[10px] gap-1"><LayoutTemplate className="w-3 h-3" />{t("reelsPage.templates")}</TabsTrigger>
        </TabsList>

        {/* Stickers Tab */}
        <TabsContent value="stickers" className="space-y-3 mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("reelsPage.stickerSize")}: {stickerSize[0]}px</span>
            </div>
            {stickers.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onStickersChange([])} className="text-[10px] text-destructive h-6 px-2">
                <Trash2 className="w-2.5 h-2.5 mr-0.5" />{t("reelsPage.clearStickers")}
              </Button>
            )}
          </div>
          <Slider value={stickerSize} onValueChange={setStickerSize} min={16} max={64} step={4} />

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {Object.keys(STICKER_PACKS).map(cat => (
              <button key={cat} onClick={() => setActiveStickerCategory(cat)}
                className={`px-2 py-0.5 rounded-lg text-[9px] font-medium whitespace-nowrap transition-all ${activeStickerCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                {t(`reelsPage.stickerCategories.${cat}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-1">
            {STICKER_PACKS[activeStickerCategory]?.map((emoji, idx) => (
              <motion.button key={`${activeStickerCategory}-${idx}`} whileTap={{ scale: 0.85 }}
                onClick={() => { setPlacingStickerIsImage(false); setPlacingSticker(placingSticker === emoji ? null : emoji); }}
                className={`aspect-square rounded-lg flex items-center justify-center text-base transition-all hover:bg-muted ${placingSticker === emoji && !placingStickerIsImage ? 'bg-primary/20 ring-2 ring-primary scale-110' : ''}`}>
                {emoji}
              </motion.button>
            ))}
          </div>

          {/* Pro Stickers */}
          <div>
            <h4 className="font-bold text-xs flex items-center gap-1.5 mb-2"><Crown className="w-3.5 h-3.5 text-amber-500" />{t("reelsPage.proStickers")}</h4>
            <div className="grid grid-cols-4 gap-1.5">
              {PRO_STICKERS.map(ps => (
                <motion.button key={ps.id} whileTap={{ scale: 0.85 }}
                  onClick={() => { setPlacingStickerIsImage(true); setPlacingSticker(placingSticker === ps.src ? null : ps.src); }}
                  className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${placingSticker === ps.src && placingStickerIsImage ? 'border-amber-500 ring-2 ring-amber-500 scale-105' : 'border-transparent hover:border-muted-foreground/30 bg-muted/30'}`}>
                  <img src={ps.src} alt={t(`reelsPage.proStickerNames.${ps.id}`)} className="w-full h-full object-contain p-0.5" loading="lazy" />
                </motion.button>
              ))}
            </div>
          </div>

          {/* Custom sticker upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-xs flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5 text-primary" />{t("reelsPage.customStickers")}</h4>
              <Button variant="outline" size="sm" onClick={() => stickerInputRef.current?.click()} className="gap-1 rounded-xl text-[9px] h-6 px-2">
                <Upload className="w-2.5 h-2.5" />{t("reelsPage.uploadSticker")}
              </Button>
            </div>
            <input type="file" ref={stickerInputRef} onChange={handleStickerUpload} accept="image/png,image/webp,image/gif,image/*" multiple className="hidden" />
            {customStickers.length > 0 && (
              <div className="grid grid-cols-6 gap-1">
                {customStickers.map((url, idx) => (
                  <div key={idx} className="relative group aspect-square">
                    <motion.button whileTap={{ scale: 0.85 }}
                      onClick={() => { setPlacingStickerIsImage(true); setPlacingSticker(placingSticker === url ? null : url); }}
                      className={`w-full h-full rounded-lg overflow-hidden border-2 transition-all ${placingSticker === url && placingStickerIsImage ? 'border-primary ring-2 ring-primary scale-105' : 'border-transparent hover:border-muted-foreground/30'}`}>
                      <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
                    </motion.button>
                    <button onClick={(e) => { e.stopPropagation(); URL.revokeObjectURL(url); setCustomStickers(prev => prev.filter(u => u !== url)); onStickersChange(stickers.filter(s => s.emoji !== url)); }}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <X className="w-2 h-2 text-destructive-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {stickers.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">{t("reelsPage.dragToMove")} • {stickers.length} {t("reelsPage.stickers")}</p>
          )}
        </TabsContent>

        {/* Filters Tab */}
        <TabsContent value="filters" className="mt-2">
          <div className="grid grid-cols-4 gap-1.5">
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => onFilterChange(f.id)}
                className={`rounded-xl p-1 border-2 transition-all text-center ${activeFilter === f.id ? 'border-primary bg-primary/5' : 'border-transparent bg-muted hover:bg-muted/80'}`}>
                <div className="w-full aspect-square rounded-lg overflow-hidden mb-1">
                  {previewUrls[0] ? (
                    <img src={previewUrls[0]} alt="" className="w-full h-full object-cover" style={{ filter: f.css || '' }} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" style={{ filter: f.css || '' }} />
                  )}
                </div>
                <span className="text-[9px] font-medium text-foreground">{t(`reelsPage.filters.${f.id}`)}</span>
              </button>
            ))}
          </div>
        </TabsContent>

        {/* Music Tab */}
        <TabsContent value="music" className="space-y-3 mt-2">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {MUSIC_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setAudioCategory(cat)}
                className={`px-2 py-0.5 rounded-lg text-[9px] font-medium whitespace-nowrap transition-all ${audioCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                {t(`reelsPage.audioCategories.${cat}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
            {MUSIC_TRACKS.filter(tr => tr.category === audioCategory).map(tr => (
              <motion.button key={tr.id} whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (activeTrackId === tr.id) { stopAll(); setActiveTrackId(null); }
                  else { setCustomAudioUrl(''); playTrack(tr.id, 60); setActiveTrackId(tr.id); }
                }}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-medium transition-all ${activeTrackId === tr.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                <span>{tr.emoji}</span>
                <span className="truncate">{t(`reelsPage.audioTracks.${tr.nameKey}`)}</span>
                {activeTrackId === tr.id && <Volume2 className="w-2.5 h-2.5 shrink-0 animate-pulse" />}
              </motion.button>
            ))}
          </div>
          {activeTrackId && (
            <div className="flex items-center justify-between px-2 py-1 bg-primary/10 rounded-lg">
              <span className="text-[9px] text-primary font-medium flex items-center gap-1">
                <Volume2 className="w-2.5 h-2.5 animate-pulse" /> {t("reelsPage.nowPlaying")}
              </span>
              <button onClick={() => { stopAll(); setActiveTrackId(null); }} className="text-[9px] text-destructive font-medium flex items-center gap-0.5">
                <Square className="w-2 h-2" /> {t("reelsPage.stopAudio")}
              </button>
            </div>
          )}
          {/* Custom audio */}
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} className="gap-1 rounded-xl text-[9px] h-6 px-2">
              <Upload className="w-2.5 h-2.5" />{t("reelsPage.uploadAudio")}
            </Button>
            <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { const url = URL.createObjectURL(file); setCustomAudioUrl(url); setActiveTrackId(null); playCustomAudio(url); }
            }} />
          </div>
          <div className="flex gap-1">
            <Input value={audioUrlInput} onChange={e => setAudioUrlInput(e.target.value)} placeholder={t("reelsPage.audioUrlPlaceholder")} className="h-7 text-[10px] rounded-xl" />
            <Button size="sm" variant="outline" className="h-7 px-2 rounded-xl" onClick={() => { if (audioUrlInput) { setCustomAudioUrl(audioUrlInput); setActiveTrackId(null); playCustomAudio(audioUrlInput); } }}>
              <Link2 className="w-2.5 h-2.5" />
            </Button>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-2">
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map(tmpl => (
              <motion.button key={tmpl.id} whileTap={{ scale: 0.95 }} onClick={() => applyTemplate(tmpl)}
                className="bg-card border border-border rounded-2xl p-2.5 text-center hover:border-primary transition-all">
                <span className="text-xl block mb-1">{tmpl.emoji}</span>
                <span className="text-[10px] font-bold text-foreground">{t(`reelsPage.templateNames.${tmpl.id}`)}</span>
              </motion.button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
