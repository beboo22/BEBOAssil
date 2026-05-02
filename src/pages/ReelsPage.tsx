import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Film, ArrowLeft, Sparkles, Music, Camera, Wand2, Upload, Trash2, Plus, ArrowRight, ImageIcon, Route, Gauge, Palette, Type, Play, Pause, Zap, Timer, User, Copy, Ratio, Layers, Share2, Save, LayoutTemplate, Lightbulb, GripVertical, Sticker, Smile, X, FolderOpen, ImagePlus, Move, Crown, Volume2, VolumeX, Link2, Headphones, Square, Loader2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReelsExport } from "@/components/stories/ReelsExport";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getLocalizedCopy } from "@/lib/localizedMessages";

const isVideoFile = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

const DEFAULT_ITEM_DURATION = 2.5;

interface MediaControl {
  duration: number;
  speed: number;
}

interface ReelMediaItem extends MediaControl {
  url: string;
  type: 'image' | 'video';
}

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

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
];

const TEMPLATES = [
  { id: 'travel', filter: 'warm', speed: 1, duration: 2.5, transition: 'fade', emoji: '✈️' },
  { id: 'food', filter: 'vivid', speed: 0.75, duration: 3, transition: 'zoom', emoji: '🍽️' },
  { id: 'adventure', filter: 'dramatic', speed: 1.5, duration: 2, transition: 'slide', emoji: '🏔️' },
  { id: 'romantic', filter: 'vintage', speed: 0.75, duration: 3.5, transition: 'fade', emoji: '💕' },
  { id: 'party', filter: 'vivid', speed: 2, duration: 1.5, transition: 'slide', emoji: '🎉' },
];

const TEXT_STYLES = [
  { id: 'minimal', fontWeight: '400', fontSize: 'text-sm', shadow: '' },
  { id: 'bold', fontWeight: '900', fontSize: 'text-base', shadow: 'drop-shadow-2xl' },
  { id: 'elegant', fontWeight: '300', fontSize: 'text-sm', shadow: 'drop-shadow-md' },
  { id: 'neon', fontWeight: '700', fontSize: 'text-base', shadow: '' },
];

const TEXT_FONTS = [
  { id: 'modern', labelAr: 'عصري', labelEn: 'Modern', family: '"Helvetica Neue", "Segoe UI", sans-serif' },
  { id: 'editorial', labelAr: 'تحريري', labelEn: 'Editorial', family: 'Georgia, "Times New Roman", serif' },
  { id: 'cinematic', labelAr: 'سينمائي', labelEn: 'Cinematic', family: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: 'mono', labelAr: 'أحادي', labelEn: 'Mono', family: '"Courier New", monospace' },
];

const TEXT_COLORS = [
  { id: 'white', labelAr: 'أبيض', labelEn: 'White', value: 'hsl(0 0% 100%)' },
  { id: 'mint', labelAr: 'فيروزي', labelEn: 'Mint', value: 'hsl(172 62% 46%)' },
  { id: 'gold', labelAr: 'ذهبي', labelEn: 'Gold', value: 'hsl(45 90% 68%)' },
  { id: 'rose', labelAr: 'وردي', labelEn: 'Rose', value: 'hsl(350 85% 82%)' },
];

const STICKER_PACKS: Record<string, string[]> = {
  travel: ['✈️', '🧳', '🗺️', '🏖️', '🏔️', '🗼', '🏰', '⛩️', '🎢', '🚂', '🚗', '⛵', '🛩️', '🌍', '🧭', '📸', '🎒', '🛤️', '⛺', '🏕️'],
  food: ['🍕', '🍔', '🍣', '🍜', '🍰', '☕', '🍷', '🥗', '🌮', '🍦', '🥐', '🫕', '🍱', '🧆', '🥘', '🍝', '🫖', '🥂', '🍩', '🧁'],
  nature: ['🌅', '🌊', '🏝️', '🌺', '🌴', '🦋', '🌈', '⭐', '🌸', '🍃', '🌻', '🏜️', '🌾', '💐', '🍂', '🌿', '☀️', '🌙', '❄️', '🔥'],
  emotions: ['❤️', '😍', '🥰', '✨', '💫', '🎊', '🎈', '💖', '🤩', '😎', '🥳', '💝', '💕', '🫶', '👏', '🙌', '💯', '🔥', '⚡', '🌟'],
  activities: ['🎿', '🏄', '🤿', '🚴', '🧗', '🏊', '⛷️', '🎣', '🏌️', '🎾', '⚽', '🏀', '🎯', '🎳', '🛹', '🏇', '🚣', '🤸', '🧘', '🎮'],
  flags: ['🇸🇦', '🇦🇪', '🇪🇬', '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇪🇸', '🇮🇹', '🇯🇵', '🇨🇳', '🇰🇷', '🇹🇷', '🇮🇳', '🇧🇷', '🇲🇽', '🇹🇭', '🇮🇩', '🇲🇾', '🇦🇺'],
  weather: ['☀️', '🌤️', '⛅', '🌥️', '☁️', '🌧️', '⛈️', '🌩️', '❄️', '🌨️', '🌪️', '🌫️', '🌬️', '🌡️', '☃️', '⛄', '💨', '🌊', '🔥', '🌈'],
  animals: ['🐪', '🐫', '🐘', '🦁', '🐬', '🦅', '🦜', '🐠', '🦋', '🐢', '🦩', '🐧', '🦒', '🐆', '🦈', '🐳', '🦚', '🐻', '🦊', '🐨'],
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

interface StickerItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  slideIndex: number;
  isImage?: boolean;
  rotation: number;
}

interface ReelsExportSettings {
  filter: string;
  speed: number;
  slideDuration: number;
  showTextOverlay: boolean;
  showWatermark: boolean;
  autoEnhance: boolean;
  textStyle: string;
  textFont: string;
  textColor: string;
  textSize: number;
  stickers: StickerItem[];
  mediaControls?: MediaControl[];
  customAudioUrl?: string;
}

const MapPin = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);

const ReelsPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const localized = useMemo(() => getLocalizedCopy(i18n.language), [i18n.language]);
  const [showExport, setShowExport] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [reelsTitle, setReelsTitle] = useState(t("reelsPage.defaultTitle"));
  const [reelsLocation, setReelsLocation] = useState("");
  const [detectedCoordinates, setDetectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'approximate' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [showTripPicker, setShowTripPicker] = useState(false);
  const [activeFilter, setActiveFilter] = useState('none');
  const [speed, setSpeed] = useState(1);
  const [slideDuration, setSlideDuration] = useState([2.5]);
  const [showTextOverlay, setShowTextOverlay] = useState(true);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [transition, setTransition] = useState('fade');
  const [textStyle, setTextStyle] = useState('minimal');
  const [textFont, setTextFont] = useState('modern');
  const [textColor, setTextColor] = useState('white');
  const [textSize, setTextSize] = useState([16]);
  const [showWatermark, setShowWatermark] = useState(false);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [activeTab, setActiveTab] = useState('edit');
  const [mediaControls, setMediaControls] = useState<MediaControl[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [activeStickerCategory, setActiveStickerCategory] = useState('travel');
  const [stickerSize, setStickerSize] = useState([32]);
  const [placingSticker, setPlacingSticker] = useState<string | null>(null);
  const [placingStickerIsImage, setPlacingStickerIsImage] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const [customStickers, setCustomStickers] = useState<string[]>([]);
  const [draggingStickerId, setDraggingStickerId] = useState<string | null>(null);
  const dragStartPos = useRef<{ x: number; y: number; stickerX: number; stickerY: number } | null>(null);

  const [drafts, setDrafts] = useState<any[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [audioCategory, setAudioCategory] = useState('ambient');
  const [customAudioUrl, setCustomAudioUrl] = useState('');
  const [audioUrlInput, setAudioUrlInput] = useState('');
  const audioInputRef = useRef<HTMLInputElement>(null);
  const isArabic = i18n.language?.startsWith('ar');

  const buildMediaControl = useCallback((duration = slideDuration[0], playbackSpeed = speed): MediaControl => ({
    duration,
    speed: playbackSpeed,
  }), [slideDuration, speed]);

  const reelMediaItems = useMemo<ReelMediaItem[]>(() => selectedImages.map((url, index) => ({
    url,
    type: isVideoFile(url) ? 'video' : 'image',
    duration: mediaControls[index]?.duration ?? slideDuration[0] ?? DEFAULT_ITEM_DURATION,
    speed: mediaControls[index]?.speed ?? speed,
  })), [mediaControls, selectedImages, slideDuration, speed]);

  const currentMediaItem = reelMediaItems[previewIdx];
  const currentTextFont = useMemo(() => TEXT_FONTS.find((font) => font.id === textFont) ?? TEXT_FONTS[0], [textFont]);
  const currentTextColor = useMemo(() => TEXT_COLORS.find((color) => color.id === textColor) ?? TEXT_COLORS[0], [textColor]);

  const getEffectiveMediaDuration = useCallback((control?: Partial<MediaControl>) => {
    const rawDuration = control?.duration ?? slideDuration[0] ?? DEFAULT_ITEM_DURATION;
    const playbackSpeed = Math.max(control?.speed ?? speed ?? 1, 0.1);
    return rawDuration / playbackSpeed;
  }, [slideDuration, speed]);

  const currentPreviewDuration = currentMediaItem ? getEffectiveMediaDuration(currentMediaItem) : (slideDuration[0] ?? DEFAULT_ITEM_DURATION);

  const selectPreviewItem = useCallback((index: number) => {
    setPreviewIdx(Math.max(0, Math.min(index, selectedImages.length - 1)));
    setPreviewPlaying(false);
  }, [selectedImages.length]);

  const openLocationUrl = useMemo(() => {
    if (detectedCoordinates) {
      return `https://www.google.com/maps/search/?api=1&query=${detectedCoordinates.lat},${detectedCoordinates.lng}`;
    }

    if (reelsLocation.trim()) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(reelsLocation.trim())}`;
    }

    return '';
  }, [detectedCoordinates, reelsLocation]);

  useEffect(() => {
    const state = location.state as any;
    if (state?.images) {
      setSelectedImages(state.images);
      if (state.title) setReelsTitle(state.title);
      if (state.location) setReelsLocation(state.location);
    }
  }, [location.state]);

  useEffect(() => {
    setMediaControls((prev) => selectedImages.map((_, index) => prev[index] ?? buildMediaControl()));
  }, [buildMediaControl, selectedImages]);

  // Sync global duration/speed to all media controls when changed
  useEffect(() => {
    setMediaControls(prev => prev.map(ctrl => ({
      duration: slideDuration[0],
      speed: speed,
    })));
  }, [slideDuration, speed]);

  useEffect(() => {
    if (previewIdx >= selectedImages.length) {
      setPreviewIdx(Math.max(selectedImages.length - 1, 0));
    }
  }, [previewIdx, selectedImages.length]);

  useEffect(() => {
    if (activeTab === 'settings') setPreviewPlaying(false);
  }, [activeTab]);

  useEffect(() => {
    const loadTrips = async () => {
      const trips: any[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('itinerary-')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '');
            trips.push({ id: key.replace('itinerary-', ''), destination: data.destination || 'Unknown', data });
          } catch { /* skip */ }
        }
      }
      if (user) {
        const { data: cloudTrips } = await supabase.from('saved_trips').select('trip_id, destination, trip_data').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
        cloudTrips?.forEach((ct: any) => {
          if (!trips.find(t => t.id === ct.trip_id)) trips.push({ id: ct.trip_id, destination: ct.destination, data: ct.trip_data });
        });
      }
      setSavedTrips(trips);
    };
    loadTrips();
  }, [user]);

  useEffect(() => {
    if (user) loadDrafts();
  }, [user]);

  const loadDrafts = async () => {
    if (!user) return;
    const { data } = await supabase.from('reels_drafts').select('*').eq('user_id', user.id).order('updated_at', { ascending: false });
    if (data) setDrafts(data);
  };

  useEffect(() => {
    if (previewPlaying && selectedImages.length > 1) {
      previewTimerRef.current = setTimeout(() => {
        setPreviewIdx(p => (p + 1) % selectedImages.length);
      }, Math.max((currentMediaItem?.duration ?? slideDuration[0]) * 1000, 700));
      return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
    }
  }, [currentPreviewDuration, previewPlaying, selectedImages.length]);

  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;

    video.playbackRate = currentMediaItem?.speed ?? 1;
    if (previewPlaying) {
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [currentMediaItem?.speed, previewIdx, previewPlaying]);

  useEffect(() => { return () => { stopAll(); }; }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const mediaFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const urls = mediaFiles.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...urls].slice(0, 20));
    setMediaControls(prev => [...prev, ...urls.map(() => buildMediaControl())].slice(0, 20));
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => {
      if (prev[index]?.startsWith('blob:')) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setMediaControls(prev => prev.filter((_, i) => i !== index));
    setStickers(prev => prev.filter(s => s.slideIndex !== index).map(s => s.slideIndex > index ? { ...s, slideIndex: s.slideIndex - 1 } : s));
  };

  const duplicateSlide = (index: number) => {
    if (selectedImages.length >= 20) return;
    setSelectedImages(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, prev[index]);
      return copy;
    });
    setMediaControls(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, prev[index] ?? buildMediaControl());
      return copy;
    });
    const slideStickers = stickers.filter(s => s.slideIndex === index).map(s => ({
      ...s, id: `sticker-${Date.now()}-${Math.random()}`, slideIndex: index + 1,
    }));
    setStickers(prev => [...prev.map(s => s.slideIndex > index ? { ...s, slideIndex: s.slideIndex + 1 } : s), ...slideStickers]);
    toast.success(t("reelsPage.duplicateSlide"));
  };

  const importFromTrip = async (trip: any) => {
    setReelsTitle(t("reelsPage.myTripTo", { destination: trip.destination }));
    setReelsLocation(trip.destination);
    if (user) {
      const { data: media } = await supabase.from('activity_media').select('media_url, media_type').eq('trip_id', trip.id).eq('user_id', user.id);
      if (media && media.length > 0) {
        const urls = media.map(m => m.media_url);
        setSelectedImages(prev => [...prev, ...urls].slice(0, 20));
        setMediaControls(prev => [...prev, ...urls.map(() => buildMediaControl())].slice(0, 20));
      }
    }
    setShowTripPicker(false);
  };

  const applyTemplate = (template: typeof TEMPLATES[0]) => {
    setActiveFilter(template.filter);
    setSpeed(template.speed);
    setSlideDuration([template.duration]);
    setTransition(template.transition);
    setMediaControls(prev => prev.map(() => ({ duration: template.duration, speed: template.speed })));
    toast.success(`${t(`reelsPage.templateNames.${template.id}`)} ✨`);
  };

  const handleUseInStory = () => {
    navigate('/stories', {
      state: { openCreateForm: true, reelsImages: selectedImages, reelsTitle },
    });
  };

  const handleDragStart = (index: number) => setDragIdx(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === index) return;
    setSelectedImages(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIdx, 1);
      copy.splice(index, 0, moved);
      return copy;
    });
    setMediaControls(prev => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIdx, 1);
      copy.splice(index, 0, moved);
      return copy;
    });
    setDragIdx(index);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handlePreviewClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingStickerId) return;
    if (!placingSticker || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const newSticker: StickerItem = {
      id: `sticker-${Date.now()}-${Math.random()}`,
      emoji: placingSticker,
      x, y,
      size: stickerSize[0],
      slideIndex: previewIdx,
      isImage: placingStickerIsImage,
      rotation: 0,
    };
    setStickers(prev => [...prev, newSticker]);
    setPlacingSticker(null);
    setPlacingStickerIsImage(false);
  }, [placingSticker, placingStickerIsImage, previewIdx, stickerSize, draggingStickerId]);

  const removeSticker = (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id));
  };

  const clearSlideStickers = () => {
    setStickers(prev => prev.filter(s => s.slideIndex !== previewIdx));
  };

  const handleStickerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const urls = imageFiles.map(f => URL.createObjectURL(f));
    setCustomStickers(prev => [...prev, ...urls]);
    if (e.target) e.target.value = '';
  };

  const removeCustomSticker = (url: string) => {
    URL.revokeObjectURL(url);
    setCustomStickers(prev => prev.filter(u => u !== url));
    setStickers(prev => prev.filter(s => s.emoji !== url));
  };

  const handleStickerPointerDown = useCallback((e: React.PointerEvent, stickerId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!previewRef.current) return;
    const sticker = stickers.find(s => s.id === stickerId);
    if (!sticker) return;
    setDraggingStickerId(stickerId);
    const rect = previewRef.current.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      stickerX: sticker.x,
      stickerY: sticker.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [stickers]);

  const handleStickerPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingStickerId || !dragStartPos.current || !previewRef.current) return;
    e.stopPropagation();
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartPos.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartPos.current.y) / rect.height) * 100;
    const newX = Math.max(5, Math.min(95, dragStartPos.current.stickerX + dx));
    const newY = Math.max(5, Math.min(95, dragStartPos.current.stickerY + dy));
    setStickers(prev => prev.map(s => s.id === draggingStickerId ? { ...s, x: newX, y: newY } : s));
  }, [draggingStickerId]);

  const handleStickerPointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingStickerId) {
      e.stopPropagation();
      setDraggingStickerId(null);
      dragStartPos.current = null;
    }
  }, [draggingStickerId]);

  const saveDraft = async () => {
    if (!user) { toast.error(t("pricing.signInFirst")); return; }
    const settings = { activeFilter, speed, slideDuration, showTextOverlay, transition, textStyle, textFont, textColor, textSize, showWatermark, autoEnhance, stickers, mediaControls };
    const { error } = await supabase.from('reels_drafts').insert({
      user_id: user.id,
      title: reelsTitle,
      location: reelsLocation,
      images: selectedImages.filter(u => !u.startsWith('blob:')),
      settings,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(t("reelsPage.draftSaved"));
    loadDrafts();
  };

  const loadDraft = (draft: any) => {
    setReelsTitle(draft.title || '');
    setReelsLocation(draft.location || '');
    setDetectedCoordinates(null);
    setSelectedImages(draft.images || []);
    const s = draft.settings || {};
    if (s.activeFilter) setActiveFilter(s.activeFilter);
    if (s.speed) setSpeed(s.speed);
    if (s.slideDuration) setSlideDuration(s.slideDuration);
    if (s.showTextOverlay !== undefined) setShowTextOverlay(s.showTextOverlay);
    if (s.transition) setTransition(s.transition);
    if (s.textStyle) setTextStyle(s.textStyle);
    if (s.textFont) setTextFont(s.textFont);
    if (s.textColor) setTextColor(s.textColor);
    if (Array.isArray(s.textSize) && s.textSize.length) setTextSize(s.textSize);
    if (s.showWatermark !== undefined) setShowWatermark(s.showWatermark);
    if (s.autoEnhance !== undefined) setAutoEnhance(s.autoEnhance);
    if (s.stickers) setStickers(s.stickers);
    if (Array.isArray(s.mediaControls)) setMediaControls(s.mediaControls);
    setPreviewIdx(0);
    setShowDrafts(false);
    toast.success(t("reelsPage.draftLoaded"));
  };

  const deleteDraft = async (id: string) => {
    await supabase.from('reels_drafts').delete().eq('id', id);
    toast.success(t("reelsPage.draftDeleted"));
    loadDrafts();
  };

  const currentFilter = FILTERS.find(f => f.id === activeFilter);
  const totalDuration = reelMediaItems.reduce((sum, item) => sum + getEffectiveMediaDuration(item), 0);
  const currentTextStyle = TEXT_STYLES.find(s => s.id === textStyle) || TEXT_STYLES[0];

  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    const endpoints = [
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=${i18n?.language || 'en'}`,
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&accept-language=${i18n?.language || 'en'}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) continue;
        const data = await res.json();
        const city = data.city || data.locality || data.address?.city || data.address?.town || data.address?.village || data.principalSubdivision || data.address?.state || '';
        const country = data.countryName || data.country || data.address?.country || '';
        const label = [city, country].filter(Boolean).join(', ');
        if (label) return label;
      } catch (error) {
        console.warn('Reverse geocode provider failed:', error);
      }
    }

    return '';
  }, [i18n?.language]);

  const detectLocationFallback = useCallback(async () => {
    const res = await fetch('https://ipwho.is');
    const data = await res.json();
    if (!data?.success) return null;

    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      const precise = await reverseGeocode(data.latitude, data.longitude).catch(() => '');
      if (precise) {
        return { label: precise, approximate: true, latitude: data.latitude, longitude: data.longitude };
      }
    }

    const fallbackLabel = [data.city, data.country].filter(Boolean).join(', ');
    return fallbackLabel ? { label: fallbackLabel, approximate: true, latitude: data.latitude, longitude: data.longitude } : null;
  }, [reverseGeocode]);

  const handleDetectLocation = useCallback(() => {
    if (detectingLocation) return;
    setDetectingLocation(true);
    setLocationStatus('loading');
    setLocationMessage('');

    const useFallback = async () => {
      try {
        const fallback = await detectLocationFallback();
        if (fallback?.label) {
          setReelsLocation(fallback.label);
          if (typeof fallback.latitude === 'number' && typeof fallback.longitude === 'number') {
            setDetectedCoordinates({ lat: fallback.latitude, lng: fallback.longitude });
          }
          setLocationStatus('approximate');
          setLocationMessage(localized.locationApproximate);
          return;
        }
      } catch (error) {
        console.error('Fallback location failed:', error);
      }

      setLocationStatus('error');
      setLocationMessage(localized.locationFailed);
    };

    if (!navigator.geolocation) {
      void useFallback().finally(() => setDetectingLocation(false));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setDetectedCoordinates({ lat, lng });
          const label = await reverseGeocode(lat, lng);
          if (label) {
            setReelsLocation(label);
          } else {
            setReelsLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
          setLocationStatus('success');
          setLocationMessage(localized.locationAutoDetected);
        } catch (error) {
          console.warn('Reverse geocoding failed:', error);
          setLocationStatus('success');
          setLocationMessage(localized.locationAutoDetected);
        } finally {
          setDetectingLocation(false);
        }
      },
      async (error) => {
        console.warn('Precise geolocation failed, using fallback:', error);
        await useFallback();
        setDetectingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  }, [detectLocationFallback, detectingLocation, localized.locationApproximate, localized.locationAutoDetected, localized.locationFailed, reverseGeocode]);
  const currentSlideStickers = stickers.filter(s => s.slideIndex === previewIdx);

  const updateCurrentMediaControl = (updates: Partial<MediaControl>) => {
    setPreviewPlaying(false);
    setMediaControls(prev => prev.map((control, index) => index === previewIdx ? {
      duration: updates.duration ?? control.duration,
      speed: updates.speed ?? control.speed,
    } : control));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-3 sm:px-4 pt-20 pb-16 max-w-5xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/stories/discover')} className="rounded-full shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2">
              <Film className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              {t("reelsPage.title")}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm truncate">{t("reelsPage.subtitle")}</p>
          </div>
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="font-medium text-foreground">{user.user_metadata?.full_name || user.email?.split('@')[0]}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Left: Preview */}
          <div>
            <div ref={previewRef} onClick={handlePreviewClick}
              onTouchStart={(e) => { (previewRef.current as any).__touchStartX = e.touches[0].clientX; (previewRef.current as any).__touchStartY = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                const startX = (previewRef.current as any)?.__touchStartX;
                const startY = (previewRef.current as any)?.__touchStartY;
                if (startX == null) return;
                const diffX = e.changedTouches[0].clientX - startX;
                const diffY = e.changedTouches[0].clientY - (startY ?? 0);
                // Only navigate if horizontal swipe is dominant and exceeds threshold
                if (Math.abs(diffX) > 25 && Math.abs(diffX) > Math.abs(diffY) && selectedImages.length > 1) {
                  if (isArabic ? diffX > 0 : diffX < 0) selectPreviewItem(previewIdx + 1);
                  else selectPreviewItem(previewIdx - 1);
                }
                (previewRef.current as any).__touchStartX = null;
                (previewRef.current as any).__touchStartY = null;
              }}
              onMouseDown={(e) => { if (draggingStickerId || placingSticker) return; (previewRef.current as any).__mouseStartX = e.clientX; }}
              onMouseUp={(e) => {
                const startX = (previewRef.current as any)?.__mouseStartX;
                if (startX == null) return;
                const diff = e.clientX - startX;
                if (Math.abs(diff) > 25 && selectedImages.length > 1) {
                  if (isArabic ? diff > 0 : diff < 0) selectPreviewItem(previewIdx + 1);
                  else selectPreviewItem(previewIdx - 1);
                }
                (previewRef.current as any).__mouseStartX = null;
              }}
              className={`relative aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl max-h-[420px] sm:max-h-[500px] mx-auto ${placingSticker ? 'cursor-crosshair ring-2 ring-primary ring-offset-2' : ''}`} style={{ maxWidth: 260 }}>
              {selectedImages.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    {isVideoFile(selectedImages[previewIdx]) ? (
                      <video ref={previewVideoRef} key={`${previewIdx}-${currentMediaItem?.speed ?? 1}`} src={selectedImages[previewIdx]} className="absolute inset-0 w-full h-full object-cover"
                        style={{ filter: `${currentFilter?.css || ''} ${autoEnhance ? 'brightness(1.05) contrast(1.05)' : ''}` }} autoPlay loop muted playsInline onLoadedMetadata={(e) => {
                          e.currentTarget.playbackRate = currentMediaItem?.speed ?? 1;
                        }} />
                    ) : (
                      <motion.img key={previewIdx} src={selectedImages[previewIdx]} alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ filter: `${currentFilter?.css || ''} ${autoEnhance ? 'brightness(1.05) contrast(1.05)' : ''}` }}
                        initial={{ opacity: 0, scale: transition === 'zoom' ? 1.3 : 1.1, x: transition === 'slide' ? 100 : 0 }}
                        animate={{ opacity: 1, scale: transition === 'kenBurns' ? 1.12 : 1 + Math.min((currentMediaItem?.speed ?? 1) * 0.03, 0.08), x: 0 }}
                        exit={{ opacity: 0, scale: transition === 'zoom' ? 0.8 : transition === 'kenBurns' ? 1.04 : 1, x: transition === 'slide' ? -100 : 0 }}
                        transition={{ duration: currentPreviewDuration, ease: 'linear' }} />
                    )}
                  </AnimatePresence>
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 pointer-events-none" />
                  
                  {/* Stickers on preview - draggable */}
                  {currentSlideStickers.map(sticker => (
                    <div key={sticker.id}
                      className={`absolute z-20 group select-none touch-none ${draggingStickerId === sticker.id ? 'cursor-grabbing z-30' : 'cursor-grab'}`}
                      style={{ left: `${sticker.x}%`, top: `${sticker.y}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation || 0}deg)` }}
                      onPointerDown={(e) => handleStickerPointerDown(e, sticker.id)}
                      onPointerMove={handleStickerPointerMove}
                      onPointerUp={handleStickerPointerUp}>
                      {sticker.isImage ? (
                        <img src={sticker.emoji} alt="sticker" className="drop-shadow-lg pointer-events-none" 
                          style={{ width: `${sticker.size}px`, height: `${sticker.size}px`, objectFit: 'contain' }} />
                      ) : (
                        <span className="drop-shadow-lg pointer-events-none" style={{ fontSize: `${sticker.size}px` }}>{sticker.emoji}</span>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <X className="w-2.5 h-2.5 text-destructive-foreground" />
                      </button>
                      {/* Resize buttons */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <button onClick={(e) => { e.stopPropagation(); setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, size: Math.max(12, s.size - 4) } : s)); }}
                          className="w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] text-primary-foreground font-bold">−</button>
                        <button onClick={(e) => { e.stopPropagation(); setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, size: Math.min(80, s.size + 4) } : s)); }}
                          className="w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center text-[8px] text-primary-foreground font-bold">+</button>
                      </div>
                      {/* Rotate buttons */}
                      <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-30">
                        <button onClick={(e) => { e.stopPropagation(); setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, rotation: (s.rotation || 0) - 15 } : s)); }}
                          className="w-3.5 h-3.5 bg-accent rounded-full flex items-center justify-center text-[7px] text-accent-foreground font-bold">↺</button>
                        <button onClick={(e) => { e.stopPropagation(); setStickers(prev => prev.map(s => s.id === sticker.id ? { ...s, rotation: (s.rotation || 0) + 15 } : s)); }}
                          className="w-3.5 h-3.5 bg-accent rounded-full flex items-center justify-center text-[7px] text-accent-foreground font-bold">↻</button>
                      </div>
                    </div>
                  ))}

                  {/* Placing sticker indicator */}
                  {placingSticker && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                      <motion.div initial={{ scale: 0 }} animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                        className="bg-primary/20 backdrop-blur-sm rounded-xl px-3 py-1.5 text-xs text-white font-medium flex items-center gap-1.5">
                        {placingStickerIsImage ? (
                          <img src={placingSticker} alt="" className="w-5 h-5 object-contain" />
                        ) : (
                          <span>{placingSticker}</span>
                        )}
                        {t("reelsPage.tapImageToPlace")}
                      </motion.div>
                    </div>
                  )}

                  {/* Text overlay */}
                  {showTextOverlay && (
                    <div className={`absolute bottom-4 left-4 right-4 z-10 ${currentTextStyle.shadow} pointer-events-none`}>
                      <p className={`${currentTextStyle.fontSize} line-clamp-2 mb-0.5`}
                        style={{
                          color: currentTextColor.value,
                          fontFamily: currentTextFont.family,
                          fontSize: `${textSize[0]}px`,
                          fontWeight: currentTextStyle.fontWeight as any,
                          textShadow: textStyle === 'neon' ? '0 0 10px rgba(0,255,255,0.8), 0 0 20px rgba(0,255,255,0.4)' : undefined,
                        }}>
                        {reelsTitle}
                      </p>
                      {reelsLocation && (
                        <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.75)', fontFamily: currentTextFont.family, fontSize: `${Math.max(textSize[0] - 4, 10)}px` }}><MapPin className="w-3 h-3" />{reelsLocation}</p>
                      )}
                    </div>
                  )}
                  {showWatermark && (
                    <div className="absolute top-10 right-3 z-10 pointer-events-none">
                      <span className="text-white/75 text-[11px] font-bold italic drop-shadow-lg tracking-wide" style={{ fontFamily: 'Georgia, "Times New Roman", serif', textShadow: '1px 1px 4px rgba(0,0,0,0.5)' }}>
                        Aseel AI Trip
                      </span>
                      <div className="h-[1px] bg-white/30 mt-0.5 rounded-full" />
                    </div>
                  )}
                  {/* Slide progress bars */}
                  <div className="absolute top-3 left-3 right-3 z-10 flex gap-1 pointer-events-none">
                    {selectedImages.map((_, i) => (
                      <div key={i} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${
                          i < previewIdx ? 'bg-white w-full' : i === previewIdx ? 'bg-white w-full' : 'w-0'
                        }`} />
                      </div>
                    ))}
                  </div>
                  {/* Navigation arrows */}
                  {selectedImages.length > 1 && (
                    <>
                      {previewIdx > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); selectPreviewItem(previewIdx - 1); }}
                          className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 opacity-60 hover:opacity-100 transition-opacity">
                          <ArrowLeft className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                      {previewIdx < selectedImages.length - 1 && (
                        <button onClick={(e) => { e.stopPropagation(); selectPreviewItem(previewIdx + 1); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center z-20 opacity-60 hover:opacity-100 transition-opacity">
                          <ArrowRight className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                    </>
                  )}
                  {/* Play/Pause */}
                  <button onClick={(e) => { e.stopPropagation(); setPreviewPlaying(!previewPlaying); }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center z-10 opacity-0 hover:opacity-100 transition-opacity">
                    {previewPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white fill-white" />}
                  </button>
                  <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm">
                    {selectedImages.map((_, i) => (
                      <button key={i} type="button" onClick={(e) => { e.stopPropagation(); selectPreviewItem(i); }} className="relative h-2.5 w-2.5 rounded-full bg-white/25">
                        {i === previewIdx && (
                          <motion.span layoutId="reels-mobile-dot" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />
                        )}
                      </button>
                    ))}
                  </div>
                  <Badge className="absolute top-3 right-3 bg-black/50 text-white border-0 text-[10px] z-10">{t("reelsPage.itemsCount", { count: selectedImages.length })}</Badge>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-accent/10 to-muted">
                  <Film className="w-14 h-14 text-primary/30 mb-3" />
                  <p className="text-muted-foreground text-sm text-center px-4">{t("reelsPage.addMediaToStart")}</p>
                  <label className="mt-3 inline-flex items-center gap-1.5 rounded-xl text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />{t("reelsPage.uploadFiles")}
                    <input type="file" onChange={handleFileUpload} accept="image/*,video/mp4,video/webm,video/mov" multiple className="hidden" />
                  </label>
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {selectedImages.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-muted-foreground text-center mb-1.5">{t("reelsPage.reorderMedia")}</p>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-1">
                  {selectedImages.map((img, i) => (
                    <div key={`${img}-${i}`} draggable onDragStart={() => handleDragStart(i)} onDragOver={(e) => handleDragOver(e, i)} onDragEnd={handleDragEnd}
                      className={`relative shrink-0 group cursor-grab active:cursor-grabbing ${dragIdx === i ? 'opacity-50 scale-95' : ''}`}>
                      <button onClick={() => selectPreviewItem(i)}
                        className={`relative w-11 h-11 rounded-lg overflow-hidden border-2 transition-all ${i === previewIdx ? 'border-primary scale-105' : 'border-transparent opacity-70'}`}>
                        {isVideoFile(img) ? (
                          <div className="w-full h-full bg-muted flex items-center justify-center"><Play className="w-3.5 h-3.5 text-muted-foreground" /></div>
                        ) : (
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[7px] text-center">{i + 1}</div>
                        {stickers.filter(s => s.slideIndex === i).length > 0 && (
                          <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[7px] px-1 rounded-bl">
                            {stickers.filter(s => s.slideIndex === i).length}🏷️
                          </div>
                        )}
                      </button>
                      <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button onClick={(e) => { e.stopPropagation(); duplicateSlide(i); }}
                          className="w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                          <Copy className="w-2.5 h-2.5 text-primary-foreground" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                          className="w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                          <Trash2 className="w-2.5 h-2.5 text-destructive-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duration info */}
            {selectedImages.length > 0 && (
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span>{t("reelsPage.totalDuration")}: {totalDuration.toFixed(1)} {t("reelsPage.seconds")}</span>
              </div>
            )}

            {/* Visual Timeline */}
            {selectedImages.length > 1 && (
              <div className="mt-1 px-1">
                <div className="flex items-end gap-[2px] h-8">
                  {selectedImages.map((_, i) => {
                    const ctrl = mediaControls[i];
                    const dur = (ctrl?.duration || slideDuration[0]) / (ctrl?.speed || speed);
                    const maxDur = Math.max(...mediaControls.map((c, j) => (c?.duration || slideDuration[0]) / (c?.speed || speed)));
                    const heightPercent = Math.max(20, (dur / maxDur) * 100);
                    return (
                      <button
                        key={i}
                        onClick={() => selectPreviewItem(i)}
                        className={`flex-1 rounded-t-sm transition-all relative group ${
                          i === previewIdx ? 'bg-primary' : 'bg-muted-foreground/20 hover:bg-muted-foreground/30'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${(i + 1)}: ${dur.toFixed(1)}s`}
                      >
                        <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {dur.toFixed(1)}s
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-[1px] bg-border" />
              </div>
            )}

            {selectedImages.length > 0 && selectedImages.length < 3 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-2 p-2 bg-accent/10 border border-accent/20 rounded-xl flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground"><span className="font-bold text-accent">{t("reelsPage.proTip")}:</span> {t("reelsPage.proTipText")}</p>
              </motion.div>
            )}
          </div>

          {/* Right: Controls with Tabs */}
          <div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-4 mb-3 h-9">
                <TabsTrigger value="edit" className="text-xs gap-1"><Palette className="w-3.5 h-3.5" />{t("reelsPage.filtersTitle")}</TabsTrigger>
                <TabsTrigger value="stickers" className="text-xs gap-1"><Smile className="w-3.5 h-3.5" />{t("reelsPage.stickers")}</TabsTrigger>
                <TabsTrigger value="settings" className="text-xs gap-1"><Gauge className="w-3.5 h-3.5" />{t("common.settings")}</TabsTrigger>
                <TabsTrigger value="templates" className="text-xs gap-1"><LayoutTemplate className="w-3.5 h-3.5" />{t("reelsPage.templates")}</TabsTrigger>
              </TabsList>

              {/* Edit Tab */}
              <TabsContent value="edit" className="space-y-4 mt-0">
                {/* Title & Location */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-3">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t("reelsPage.form.title")}</Label>
                    <Input value={reelsTitle} onChange={e => setReelsTitle(e.target.value)} className="rounded-xl h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">{t("reelsPage.form.location")}</Label>
                    <div className="flex gap-1.5">
                      <Input value={reelsLocation} onChange={e => setReelsLocation(e.target.value)} placeholder={t("reelsPage.form.locationPlaceholder")} className="rounded-xl h-9 text-sm flex-1" />
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl shrink-0" title={t("reelsPage.form.detectLocation") || "Detect location"}
                        onClick={handleDetectLocation} disabled={detectingLocation}>
                        {detectingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                      </Button>
                    </div>
                    {locationStatus !== 'idle' && locationStatus !== 'loading' && (
                      <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${
                        locationStatus === 'error'
                          ? 'border-destructive/30 bg-destructive/10 text-foreground'
                          : locationStatus === 'approximate'
                            ? 'border-accent/30 bg-accent/10 text-foreground'
                            : 'border-primary/30 bg-primary/10 text-foreground'
                      }`}>
                        {locationMessage}
                      </div>
                    )}
                    {openLocationUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => window.open(openLocationUrl, '_blank', 'noopener,noreferrer')} className="mt-1 h-7 px-2 text-[11px] text-primary">
                        <Link2 className="mr-1 h-3 w-3" />
                        {isArabic ? 'فتح الموقع' : 'Open location'}
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t("reelsPage.form.showText")}</Label>
                    <Switch checked={showTextOverlay} onCheckedChange={setShowTextOverlay} />
                  </div>
                </div>

                {/* Upload */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-primary" />{t("reelsPage.media")}<Badge variant="secondary" className="text-[10px]">{selectedImages.length}/20</Badge></h3>
                  <div className="flex flex-wrap gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,video/mp4,video/webm,video/mov" multiple className="hidden" />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 rounded-xl text-xs">
                      <Upload className="w-3.5 h-3.5" />{t("reelsPage.uploadFiles")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowTripPicker(!showTripPicker)} className="gap-1.5 rounded-xl text-xs">
                      <Route className="w-3.5 h-3.5" />{t("reelsPage.fromTrip")}
                    </Button>
                  </div>
                  {showTripPicker && (
                    <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                      {savedTrips.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">{t("reelsPage.noTrips")}</p>
                      ) : savedTrips.map(trip => (
                        <button key={trip.id} onClick={() => importFromTrip(trip)}
                          className="w-full flex items-center gap-2 p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-left text-sm">
                          <span>🗺️</span>
                          <span className="flex-1 truncate text-foreground">{trip.destination}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Filters */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2"><Palette className="w-4 h-4 text-primary" />{t("reelsPage.filtersTitle")}</h3>
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                    {FILTERS.map(f => (
                      <button key={f.id} onClick={() => setActiveFilter(f.id)}
                        className={`rounded-xl p-1 sm:p-1.5 border-2 transition-all text-center ${activeFilter === f.id ? 'border-primary bg-primary/5' : 'border-transparent bg-muted hover:bg-muted/80'}`}>
                        <div className="w-full aspect-square rounded-lg overflow-hidden mb-1">
                          {selectedImages[0] ? (
                            <img src={selectedImages[0]} alt="" className="w-full h-full object-cover" style={{ filter: f.css || '' }} />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" style={{ filter: f.css || '' }} />
                          )}
                        </div>
                        <span className="text-[9px] sm:text-[10px] font-medium text-foreground">{t(`reelsPage.filters.${f.id}`)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Style */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2"><Type className="w-4 h-4 text-primary" />{t("reelsPage.textStyle")}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {TEXT_STYLES.map(s => (
                      <button key={s.id} onClick={() => setTextStyle(s.id)}
                        className={`rounded-xl p-2 border-2 transition-all text-center ${textStyle === s.id ? 'border-primary bg-primary/5' : 'border-transparent bg-muted hover:bg-muted/80'}`}>
                        <span className={`text-xs font-${s.fontWeight === '900' ? 'black' : s.fontWeight === '300' ? 'light' : 'normal'}`}
                          style={{ textShadow: s.id === 'neon' ? '0 0 6px rgba(0,255,255,0.8)' : undefined }}>
                          Aa
                        </span>
                        <p className="text-[9px] mt-1 text-foreground">{t(`reelsPage.textStyles.${s.id}`)}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-medium">{isArabic ? 'حجم النص' : 'Text size'}</Label>
                        <span className="text-xs text-muted-foreground">{textSize[0]}px</span>
                      </div>
                      <Slider value={textSize} onValueChange={setTextSize} min={12} max={28} step={1} />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-2 block">{isArabic ? 'الخط' : 'Font'}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {TEXT_FONTS.map((font) => (
                          <button
                            key={font.id}
                            onClick={() => setTextFont(font.id)}
                            className={`rounded-xl border px-3 py-2 text-xs transition-all ${textFont === font.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}`}
                            style={{ fontFamily: font.family }}
                          >
                            {isArabic ? font.labelAr : font.labelEn}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-2 block">{isArabic ? 'لون النص' : 'Text color'}</Label>
                      <div className="flex flex-wrap gap-2">
                        {TEXT_COLORS.map((color) => (
                          <button
                            key={color.id}
                            onClick={() => setTextColor(color.id)}
                            className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] transition-all ${textColor === color.id ? 'border-primary bg-primary/5 text-foreground' : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'}`}
                          >
                            <span className="h-4 w-4 rounded-full border border-white/30" style={{ backgroundColor: color.value }} />
                            {isArabic ? color.labelAr : color.labelEn}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Stickers & Emoji Tab */}
              <TabsContent value="stickers" className="space-y-4 mt-0">
                {/* Sticker Size */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Smile className="w-4 h-4 text-primary" />{t("reelsPage.stickerSize")}</h3>
                    <span className="text-xs text-muted-foreground">{stickerSize[0]}px</span>
                  </div>
                  <Slider value={stickerSize} onValueChange={(val) => {
                    setStickerSize(val);
                    // Update all stickers on current slide to new size
                    setStickers(prev => prev.map(s => s.slideIndex === previewIdx ? { ...s, size: val[0] } : s));
                  }} min={16} max={64} step={4} />
                </div>

                {/* Category tabs */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <Sticker className="w-4 h-4 text-primary" />{t("reelsPage.stickers")}
                    </h3>
                    {currentSlideStickers.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearSlideStickers} className="text-xs text-destructive h-7 px-2">
                        <Trash2 className="w-3 h-3 mr-1" />{t("reelsPage.clearStickers")}
                      </Button>
                    )}
                  </div>

                  {/* Category selector */}
                  <div className="flex gap-1 overflow-x-auto no-scrollbar mb-3">
                    {Object.keys(STICKER_PACKS).map(cat => (
                      <button key={cat} onClick={() => setActiveStickerCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${activeStickerCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                        {t(`reelsPage.stickerCategories.${cat}`)}
                      </button>
                    ))}
                  </div>

                  {/* Sticker grid */}
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
                    {STICKER_PACKS[activeStickerCategory]?.map((emoji, idx) => (
                      <motion.button key={`${activeStickerCategory}-${idx}`}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => {
                          if (selectedImages.length === 0) { toast.error(t("reelsPage.addMediaToStart")); return; }
                          setPlacingStickerIsImage(false);
                          setPlacingSticker(placingSticker === emoji ? null : emoji);
                        }}
                        className={`aspect-square rounded-lg flex items-center justify-center text-lg sm:text-xl transition-all hover:bg-muted ${placingSticker === emoji && !placingStickerIsImage ? 'bg-primary/20 ring-2 ring-primary scale-110' : ''}`}>
                        {emoji}
                      </motion.button>
                    ))}
                  </div>

                  {placingSticker && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-center text-[11px] text-primary font-medium mt-2">
                      👆 {t("reelsPage.tapImageToPlace")}
                    </motion.p>
                  )}
                </div>

                {/* Pro Stickers Library */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />{t("reelsPage.proStickers")}
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
                    {PRO_STICKERS.map(ps => (
                      <motion.button key={ps.id} whileTap={{ scale: 0.85 }}
                        onClick={() => {
                          if (selectedImages.length === 0) { toast.error(t("reelsPage.addMediaToStart")); return; }
                          setPlacingStickerIsImage(true);
                          setPlacingSticker(placingSticker === ps.src ? null : ps.src);
                        }}
                        className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${placingSticker === ps.src && placingStickerIsImage ? 'border-amber-500 ring-2 ring-amber-500 scale-105' : 'border-transparent hover:border-muted-foreground/30 bg-muted/30'}`}>
                        <img src={ps.src} alt={t(`reelsPage.proStickerNames.${ps.id}`)} className="w-full h-full object-contain p-1" loading="lazy" />
                      </motion.button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    {PRO_STICKERS.map(ps => t(`reelsPage.proStickerNames.${ps.id}`)).join(' • ')}
                  </p>
                </div>

                {/* Custom Sticker Upload */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <ImagePlus className="w-4 h-4 text-primary" />{t("reelsPage.customStickers")}
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => stickerInputRef.current?.click()} className="gap-1 rounded-xl text-[10px] h-7 px-2">
                      <Upload className="w-3 h-3" />{t("reelsPage.uploadSticker")}
                    </Button>
                  </div>
                  <input type="file" ref={stickerInputRef} onChange={handleStickerUpload} accept="image/png,image/webp,image/gif,image/svg+xml,image/*" multiple className="hidden" />
                  
                  {customStickers.length === 0 ? (
                    <div className="text-center py-4 border-2 border-dashed border-border rounded-xl">
                      <ImagePlus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-[11px] text-muted-foreground">{t("reelsPage.uploadStickerHint")}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
                      {customStickers.map((url, idx) => (
                        <div key={idx} className="relative group aspect-square">
                          <motion.button whileTap={{ scale: 0.85 }}
                            onClick={() => {
                              if (selectedImages.length === 0) { toast.error(t("reelsPage.addMediaToStart")); return; }
                              setPlacingStickerIsImage(true);
                              setPlacingSticker(placingSticker === url ? null : url);
                            }}
                            className={`w-full h-full rounded-lg overflow-hidden border-2 transition-all ${placingSticker === url && placingStickerIsImage ? 'border-primary ring-2 ring-primary scale-105' : 'border-transparent hover:border-muted-foreground/30'}`}>
                            <img src={url} alt="" className="w-full h-full object-contain p-0.5" />
                          </motion.button>
                          <button onClick={(e) => { e.stopPropagation(); removeCustomSticker(url); }}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <X className="w-2.5 h-2.5 text-destructive-foreground" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Current slide stickers list */}
                {currentSlideStickers.length > 0 && (
                  <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                    <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
                      <Move className="w-3.5 h-3.5 text-primary" />
                      {t("reelsPage.stickers")} ({currentSlideStickers.length})
                      <span className="text-[10px] text-muted-foreground font-normal">— {t("reelsPage.dragToMove")}</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {currentSlideStickers.map(s => (
                        <motion.div key={s.id} initial={{ scale: 0 }} animate={{ scale: 1 }}
                          className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1 text-sm group">
                          {s.isImage ? (
                            <img src={s.emoji} alt="" className="w-5 h-5 object-contain" />
                          ) : (
                            <span style={{ fontSize: `${Math.min(s.size, 24)}px` }}>{s.emoji}</span>
                          )}
                          <button onClick={() => removeSticker(s.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3 text-destructive" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4 mt-0">
                {currentMediaItem && (
                  <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Film className="w-4 h-4 text-primary" />{isArabic ? 'العنصر الحالي' : 'Current item'}</h3>
                      <Badge variant="secondary" className="text-[10px]">{previewIdx + 1}/{selectedImages.length}</Badge>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Timer className="w-4 h-4 text-primary" />{isArabic ? 'مدة العنصر' : 'Item duration'}</h3>
                        <span className="text-xs text-muted-foreground">{currentMediaItem.duration.toFixed(1)}s</span>
                      </div>
                      <Slider value={[currentMediaItem.duration]} onValueChange={(value) => updateCurrentMediaControl({ duration: value[0] })} min={1} max={8} step={0.5} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" />{isArabic ? 'سرعة العنصر' : 'Item speed'}</h3>
                      <div className="flex gap-1.5 flex-wrap">
                        {SPEED_OPTIONS.map(option => (
                          <button key={`item-${option.value}`} onClick={() => updateCurrentMediaControl({ speed: option.value })}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${currentMediaItem.speed === option.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />{t("reelsPage.transition")}</h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {['fade', 'slide', 'zoom', 'kenBurns', 'blur'].map(tr => (
                      <button key={tr} onClick={() => setTransition(tr)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${transition === tr ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                        {t(`reelsPage.transitions.${tr}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audio Library */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4">
                  <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2"><Headphones className="w-4 h-4 text-primary" />{t("reelsPage.audioLibrary")}</h3>
                  
                  {/* Category tabs */}
                  <div className="flex gap-1 overflow-x-auto no-scrollbar mb-3">
                    {MUSIC_CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => setAudioCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-all ${audioCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                        {t(`reelsPage.audioCategories.${cat}`)}
                      </button>
                    ))}
                  </div>

                  {/* Track grid */}
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                    {MUSIC_TRACKS.filter(tr => tr.category === audioCategory).map(tr => (
                      <motion.button key={tr.id} whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          if (activeTrackId === tr.id) { stopAll(); setActiveTrackId(null); }
                          else { setCustomAudioUrl(''); playTrack(tr.id, 60); setActiveTrackId(tr.id); }
                        }}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-medium transition-all ${activeTrackId === tr.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                        <span>{tr.emoji}</span>
                        <span className="truncate">{t(`reelsPage.audioTracks.${tr.nameKey}`)}</span>
                        {activeTrackId === tr.id && <Volume2 className="w-3 h-3 shrink-0 animate-pulse" />}
                      </motion.button>
                    ))}
                  </div>

                  {/* Now playing indicator */}
                  {activeTrackId && (
                    <div className="flex items-center justify-between mt-2 px-2 py-1.5 bg-primary/10 rounded-lg">
                      <span className="text-[10px] text-primary font-medium flex items-center gap-1">
                        <Volume2 className="w-3 h-3 animate-pulse" /> {t("reelsPage.nowPlaying")}: {MUSIC_TRACKS.find(t2 => t2.id === activeTrackId)?.emoji}
                      </span>
                      <button onClick={() => { stopAll(); setActiveTrackId(null); }} className="text-[10px] text-destructive font-medium flex items-center gap-0.5">
                        <Square className="w-2.5 h-2.5" /> {t("reelsPage.stopAudio")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Custom Audio */}
                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-3">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Music className="w-4 h-4 text-primary" />{t("reelsPage.customAudio")}</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} className="gap-1 rounded-xl text-[10px] h-7 px-2">
                      <Upload className="w-3 h-3" />{t("reelsPage.uploadAudio")}
                    </Button>
                    <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) { const url = URL.createObjectURL(file); setCustomAudioUrl(url); setActiveTrackId(null); playCustomAudio(url); }
                    }} />
                  </div>
                  <div className="flex gap-1.5">
                    <Input value={audioUrlInput} onChange={e => setAudioUrlInput(e.target.value)} placeholder={t("reelsPage.audioUrlPlaceholder")} className="h-8 text-xs rounded-xl" />
                    <Button size="sm" variant="outline" className="h-8 px-2 rounded-xl text-xs" onClick={() => { if (audioUrlInput) { setCustomAudioUrl(audioUrlInput); setActiveTrackId(null); playCustomAudio(audioUrlInput); } }}>
                      <Link2 className="w-3 h-3" />
                    </Button>
                  </div>
                  {customAudioUrl && (
                    <div className="flex items-center justify-between px-2 py-1.5 bg-primary/10 rounded-lg">
                      <span className="text-[10px] text-primary font-medium flex items-center gap-1 truncate">
                        <Volume2 className="w-3 h-3 animate-pulse" /> {t("reelsPage.nowPlaying")} 🎧
                      </span>
                      <button onClick={() => { stopAll(); setCustomAudioUrl(''); }} className="text-[10px] text-destructive font-medium flex items-center gap-0.5">
                        <Square className="w-2.5 h-2.5" /> {t("reelsPage.stopAudio")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-4">
                  <div>
                    <h3 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2"><Gauge className="w-4 h-4 text-primary" />{t("reelsPage.speed")}</h3>
                    <div className="flex gap-1.5">
                      {SPEED_OPTIONS.map(s => (
                        <button key={s.value} onClick={() => setSpeed(s.value)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${speed === s.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm text-foreground flex items-center gap-2"><Timer className="w-4 h-4 text-primary" />{t("reelsPage.slideDuration")}</h3>
                      <span className="text-xs text-muted-foreground">{slideDuration[0]}s</span>
                    </div>
                    <Slider value={slideDuration} onValueChange={setSlideDuration} min={1} max={5} step={0.5} />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-3 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-2"><Wand2 className="w-3.5 h-3.5 text-primary" />{t("reelsPage.autoEnhance")}</Label>
                    <Switch checked={autoEnhance} onCheckedChange={setAutoEnhance} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-primary" />{t("reelsPage.watermark")}</Label>
                    <Switch checked={showWatermark} onCheckedChange={setShowWatermark} />
                  </div>
                </div>
              </TabsContent>

              {/* Templates Tab */}
              <TabsContent value="templates" className="space-y-3 mt-0">
                <p className="text-xs text-muted-foreground">{t("reelsPage.templates")}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEMPLATES.map(tmpl => (
                    <motion.button key={tmpl.id} whileTap={{ scale: 0.95 }} onClick={() => applyTemplate(tmpl)}
                      className="bg-card border border-border rounded-2xl p-3 text-center hover:border-primary transition-all group">
                      <span className="text-2xl block mb-1">{tmpl.emoji}</span>
                      <span className="text-xs font-bold text-foreground">{t(`reelsPage.templateNames.${tmpl.id}`)}</span>
                      <div className="flex items-center justify-center gap-1 mt-1 text-[10px] text-muted-foreground">
                        <span>{tmpl.speed}x</span><span>•</span><span>{tmpl.duration}s</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={() => setShowExport(true)} disabled={selectedImages.length === 0}
                className="w-full gap-2 rounded-xl h-11 bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg">
                <Film className="w-4 h-4" />{t("reelsPage.exportReels")}
              </Button>
              <div className="flex gap-2">
                {selectedImages.length > 0 && (
                  <Button variant="outline" onClick={handleUseInStory} className="flex-1 gap-1.5 rounded-xl h-10 text-xs sm:text-sm">
                    <Share2 className="w-3.5 h-3.5" />{t("reelsPage.shareDirectly")}
                  </Button>
                )}
                <Button variant="outline" onClick={() => navigate("/stories", { state: { openCreateForm: true } })} className="flex-1 gap-1.5 rounded-xl h-10 text-xs sm:text-sm">
                  <Camera className="w-3.5 h-3.5" />{t("reelsPage.publishStory")}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveDraft} disabled={selectedImages.length === 0} className="flex-1 gap-1.5 rounded-xl h-10 text-xs sm:text-sm">
                  <Save className="w-3.5 h-3.5" />{t("reelsPage.saveAsDraft")}
                </Button>
                <Button variant="outline" onClick={() => setShowDrafts(!showDrafts)} className="flex-1 gap-1.5 rounded-xl h-10 text-xs sm:text-sm">
                  <FolderOpen className="w-3.5 h-3.5" />{t("reelsPage.myDrafts")} {drafts.length > 0 && <Badge variant="secondary" className="text-[9px] ml-1">{drafts.length}</Badge>}
                </Button>
              </div>
            </div>

            {/* Drafts panel */}
            <AnimatePresence>
              {showDrafts && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden">
                  <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-primary" />{t("reelsPage.myDrafts")}
                    </h3>
                    {drafts.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">{t("reelsPage.noDrafts")}</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {drafts.map(draft => (
                          <div key={draft.id} className="flex items-center gap-2 p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadDraft(draft)}>
                              <p className="text-sm font-medium text-foreground truncate">{draft.title || t("reelsPage.defaultTitle")}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {draft.images?.length || 0} {t("reelsPage.media")} • {new Date(draft.updated_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteDraft(draft.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ReelsExport
        images={selectedImages}
        title={reelsTitle}
        location={reelsLocation}
        authorName={user?.user_metadata?.full_name || t("stories.traveler")}
        open={showExport}
        onOpenChange={setShowExport}
        presetTransition={transition}
        presetMusic={activeTrackId || undefined}
        customAudioUrl={customAudioUrl || undefined}
        exportSettings={{
          filter: activeFilter,
          speed,
          slideDuration: slideDuration[0],
          showTextOverlay,
          showWatermark,
          autoEnhance,
          textStyle,
          textFont,
          textColor,
          textSize: textSize[0],
          stickers,
          mediaControls,
          customAudioUrl: customAudioUrl || undefined,
        }}
        requireAuth
      />
    </div>
  );
};

export default ReelsPage;
