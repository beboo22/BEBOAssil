import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, FlipHorizontal, Zap, ZapOff, X, Check, RotateCcw, SunMedium, Contrast, Palette, Type, Bold, Video, StopCircle, Music, Timer, Grid3x3, VolumeX, Volume2, Sparkles, Ratio, MapPin, Clock, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { StickerOverlay, DraggableTextOverlay, type PlacedSticker } from './ARStickers';

const COLOR_FILTERS = [
  { id: 'none', label: 'Original', css: 'none', preview: 'bg-gradient-to-br from-gray-300 to-gray-500' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.4) contrast(1.1) saturate(0.9) brightness(1.05)', preview: 'bg-gradient-to-br from-amber-200 to-orange-400' },
  { id: 'warm', label: 'Warm', css: 'saturate(1.3) hue-rotate(-10deg) brightness(1.05)', preview: 'bg-gradient-to-br from-orange-300 to-red-400' },
  { id: 'cool', label: 'Cool', css: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)', preview: 'bg-gradient-to-br from-blue-300 to-cyan-400' },
  { id: 'bw', label: 'B&W', css: 'grayscale(1) contrast(1.1)', preview: 'bg-gradient-to-br from-gray-400 to-gray-700' },
  { id: 'sunset', label: 'Sunset', css: 'saturate(1.4) hue-rotate(-15deg) contrast(1.1) brightness(1.05)', preview: 'bg-gradient-to-br from-pink-300 to-orange-500' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(1.8) contrast(1.15)', preview: 'bg-gradient-to-br from-green-400 to-purple-500' },
  { id: 'fade', label: 'Fade', css: 'saturate(0.6) brightness(1.1) contrast(0.9)', preview: 'bg-gradient-to-br from-gray-200 to-blue-200' },
  { id: 'cinematic', label: 'Cinema', css: 'contrast(1.2) saturate(0.85) brightness(0.95) sepia(0.1)', preview: 'bg-gradient-to-br from-slate-400 to-amber-700' },
  { id: 'noir', label: 'Noir', css: 'grayscale(0.8) contrast(1.4) brightness(0.9)', preview: 'bg-gradient-to-br from-gray-600 to-black' },
  { id: 'tropical', label: 'Tropical', css: 'saturate(1.5) hue-rotate(-5deg) brightness(1.1)', preview: 'bg-gradient-to-br from-emerald-300 to-teal-500' },
  { id: 'dreamy', label: 'Dreamy', css: 'blur(0.3px) saturate(1.2) brightness(1.15) contrast(0.9)', preview: 'bg-gradient-to-br from-pink-200 to-purple-300' },
  { id: 'retro', label: 'Retro', css: 'sepia(0.5) hue-rotate(-20deg) saturate(1.2) brightness(1.1)', preview: 'bg-gradient-to-br from-yellow-300 to-red-500' },
  { id: 'arctic', label: 'Arctic', css: 'saturate(0.7) hue-rotate(30deg) brightness(1.15) contrast(0.95)', preview: 'bg-gradient-to-br from-cyan-200 to-blue-400' },
  { id: 'golden', label: 'Golden', css: 'sepia(0.3) saturate(1.4) brightness(1.1) hue-rotate(-10deg)', preview: 'bg-gradient-to-br from-yellow-200 to-amber-500' },
];

const TRAVEL_STICKERS = [
  '✈️', '🏖️', '🏔️', '🌴', '🗺️', '📸', '🌅', '⛺', '🚢', '🧭',
  '🎒', '🏝️', '🌊', '🎭', '🍽️', '❤️', '🏕️', '🚗', '🏰', '🎡',
  '🎶', '🌺', '🐚', '🦋', '🌈', '⭐', '🔥', '💎', '🎯', '🎪',
];

const FRAME_OPTIONS = [
  { id: 'f0', label: 'None', border: 'none' },
  { id: 'f1', label: 'Polaroid', border: '12px solid white' },
  { id: 'f2', label: 'Vintage', border: '8px solid #d4a574' },
  { id: 'f3', label: 'Travel', border: '6px dashed rgba(255,255,255,0.4)' },
  { id: 'f4', label: 'Stamp', border: '3px solid white' },
  { id: 'f5', label: 'Golden', border: '6px solid #d4af37' },
];

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  bold: boolean;
}

const TEXT_COLORS = ['#ffffff', '#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onMultiCapture?: (files: File[]) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onMultiCapture, onClose }) => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [activeFrame, setActiveFrame] = useState('f0');
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textBold, setTextBold] = useState(true);
  const [textSize, setTextSize] = useState(24);
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const MAX_RECORD_SECONDS = 60;
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [silentMode, setSilentMode] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [selfieTimer, setSelfieTimer] = useState(0);
  const [timerCountdown, setTimerCountdown] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<'none' | 'adjust' | 'text' | 'music' | 'stickers' | 'emoji' | 'frames'>('none');
  const [showLocation, setShowLocation] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [showDateTime, setShowDateTime] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const MAX_MULTI_PHOTOS = 10;
  const MUSIC_TRACKS = [
    { id: 'none', label: isArabic ? 'بدون' : 'None', url: '' },
    { id: 'chill', label: isArabic ? 'هادئة' : 'Chill', url: 'https://cdn.pixabay.com/audio/2024/11/29/audio_7e0bde1e35.mp3' },
    { id: 'adventure', label: isArabic ? 'مغامرة' : 'Adventure', url: 'https://cdn.pixabay.com/audio/2024/09/10/audio_6e8cd59dfa.mp3' },
    { id: 'travel', label: isArabic ? 'سفر' : 'Travel', url: 'https://cdn.pixabay.com/audio/2024/10/07/audio_0f5aa4980c.mp3' },
    { id: 'sunset', label: isArabic ? 'غروب' : 'Sunset', url: 'https://cdn.pixabay.com/audio/2023/10/30/audio_81b1eff735.mp3' },
    { id: 'upbeat', label: isArabic ? 'حماسية' : 'Upbeat', url: 'https://cdn.pixabay.com/audio/2024/03/12/audio_e7b3fe3ef4.mp3' },
  ];

  // Get location
  useEffect(() => {
    if (showLocation && !locationName) {
      navigator.geolocation?.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=${isArabic ? 'ar' : 'en'}`);
            const data = await res.json();
            setLocationName(data.address?.city || data.address?.town || data.address?.state || data.display_name?.split(',')[0] || 'Unknown');
          } catch { setLocationName(isArabic ? 'موقع غير معروف' : 'Unknown location'); }
        },
        () => setLocationName(isArabic ? 'تعذر الوصول للموقع' : 'Location unavailable')
      );
    }
  }, [showLocation]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      // Stop previous stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: mode === 'video' && !silentMode,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraReady(false);
    }
  }, [facingMode, mode, silentMode]);

  useEffect(() => {
    startCamera();
    return () => {
      // Cleanup: stop all tracks, turn off torch
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          try { (t as any).applyConstraints({ advanced: [{ torch: false }] }); } catch {}
          t.stop();
        });
        streamRef.current = null;
      }
      if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (timerCountdownRef.current) clearInterval(timerCountdownRef.current);
    };
  }, [facingMode, mode, silentMode]);

  // Flash control
  useEffect(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try { (track as any).applyConstraints({ advanced: [{ torch: flashOn }] }); } catch {}
    }
  }, [flashOn]);

  // Turn off flash on close
  const handleClose = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try { (t as any).applyConstraints({ advanced: [{ torch: false }] }); } catch {}
        t.stop();
      });
      streamRef.current = null;
    }
    if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; }
    setFlashOn(false);
    onClose();
  };

  const getFilterCSS = () => {
    const filter = COLOR_FILTERS.find(f => f.id === selectedFilter);
    const base = filter?.css || 'none';
    const adj = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;
    return base === 'none' ? adj : `${base} ${adj}`;
  };

  const takePhoto = () => {
    if (selfieTimer > 0) {
      setTimerCountdown(selfieTimer);
      let count = selfieTimer;
      timerCountdownRef.current = setInterval(() => {
        count--;
        setTimerCountdown(count);
        if (count <= 0) {
          clearInterval(timerCountdownRef.current!);
          setTimerCountdown(null);
          capturePhoto();
        }
      }, 1000);
    } else {
      capturePhoto();
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = getFilterCSS();
    if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    ctx.filter = 'none';
    if (facingMode === 'user') ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Draw text overlays
    textOverlays.forEach(overlay => {
      ctx.font = `${overlay.bold ? 'bold' : 'normal'} ${overlay.fontSize * (canvas.width / 400)}px sans-serif`;
      ctx.fillStyle = overlay.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText(overlay.text, overlay.x * canvas.width / 100, overlay.y * canvas.height / 100);
      ctx.shadowBlur = 0;
    });
    // Draw location/datetime stamp
    if (showLocation && locationName) {
      ctx.font = `bold ${canvas.width / 30}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillText(`📍 ${locationName}`, canvas.width * 0.03, canvas.height * 0.95);
      ctx.shadowBlur = 0;
    }
    if (showDateTime) {
      const now = new Date();
      const dateStr = now.toLocaleDateString(isArabic ? 'ar' : 'en', { year: 'numeric', month: 'short', day: 'numeric' });
      const timeStr = now.toLocaleTimeString(isArabic ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' });
      ctx.font = `bold ${canvas.width / 35}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'right';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillText(`${dateStr} ${timeStr}`, canvas.width * 0.97, canvas.height * 0.95);
      ctx.shadowBlur = 0;
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (multiMode) {
      setCapturedPhotos(prev => {
        if (prev.length >= MAX_MULTI_PHOTOS) return prev;
        return [...prev, dataUrl];
      });
    } else {
      setCapturedImage(dataUrl);
    }
  };

  const playMusic = () => {
    if (selectedMusic) {
      const track = MUSIC_TRACKS.find(t => t.id === selectedMusic);
      if (track?.url) {
        musicRef.current = new Audio(track.url);
        musicRef.current.loop = true;
        musicRef.current.volume = 0.3;
        musicRef.current.play().catch(() => {});
      }
    }
  };

  const stopMusic = () => { if (musicRef.current) { musicRef.current.pause(); musicRef.current = null; } };

  const startRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const mimeCandidates = [
      'video/mp4;codecs=h264,aac',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    const mr = mimeType
      ? new MediaRecorder(streamRef.current, { mimeType })
      : new MediaRecorder(streamRef.current);
    mr.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      setCapturedVideo(URL.createObjectURL(blob));
      stopMusic();
    };
    mr.start(100);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    setRecordTime(0);
    playMusic();
    recordTimerRef.current = setInterval(() => {
      setRecordTime(prev => { if (prev >= MAX_RECORD_SECONDS - 1) { stopRecording(); return prev; } return prev + 1; });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    setIsRecording(false);
    stopMusic();
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
  };

  const addTextOverlay = () => {
    if (!currentText.trim()) return;
    setTextOverlays(prev => [...prev, { id: Date.now().toString(), text: currentText, x: 50, y: 30 + prev.length * 10, color: textColor, fontSize: textSize, bold: textBold }]);
    setCurrentText('');
    setActivePanel('none');
  };

  const addEmojiSticker = (emoji: string) => {
    const newSticker: PlacedSticker = {
      id: `placed-${Date.now()}`,
      stickerId: emoji,
      emoji,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      scale: 1,
      rotation: Math.random() * 30 - 15,
    };
    setPlacedStickers(prev => [...prev, newSticker]);
  };

  const confirmCapture = async () => {
    if (multiMode && capturedPhotos.length > 0) {
      const files: File[] = [];
      for (let i = 0; i < capturedPhotos.length; i++) {
        const resp = await fetch(capturedPhotos[i]);
        const blob = await resp.blob();
        files.push(new File([blob], `camera-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' }));
      }
      if (onMultiCapture) {
        onMultiCapture(files);
      } else {
        files.forEach(f => onCapture(f));
      }
    } else if (capturedVideo) {
      fetch(capturedVideo).then(r => r.blob()).then(blob => {
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `video-${Date.now()}.${extension}`, { type: blob.type || 'video/webm' });
        onCapture(file);
      });
    } else if (capturedImage) {
      fetch(capturedImage).then(r => r.blob()).then(blob => {
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      });
    }
  };

  const resetCapture = () => { setCapturedImage(null); setCapturedVideo(null); setTextOverlays([]); setRecordTime(0); setCapturedPhotos([]); };
  const flipCamera = () => setFacingMode(f => f === 'user' ? 'environment' : 'user');
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const hasCaptured = !!capturedImage || !!capturedVideo || capturedPhotos.length > 0;
  const cycleTimer = () => { const vals = [0, 3, 5, 10]; setSelfieTimer(vals[(vals.indexOf(selfieTimer) + 1) % vals.length]); };
  const togglePanel = (panel: typeof activePanel) => setActivePanel(prev => prev === panel ? 'none' : panel);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-black flex flex-col" style={{ width: '100vw', height: '100dvh' }}>

      {/* Close button */}
      <Button variant="ghost" size="icon" onClick={handleClose}
        className="absolute top-3 left-3 z-50 text-white bg-black/50 backdrop-blur-sm rounded-full h-10 w-10">
        <X size={20} />
      </Button>

      {/* Timer countdown */}
      {timerCountdown !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <motion.span key={timerCountdown} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-7xl font-black text-white drop-shadow-2xl">{timerCountdown}</motion.span>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-red-600/90 backdrop-blur-sm px-4 py-1.5 rounded-full">
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-bold tabular-nums">{formatTime(recordTime)}</span>
          </div>
          <div className="absolute top-0 left-0 right-0 z-40 h-1 bg-white/20">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${(recordTime / MAX_RECORD_SECONDS) * 100}%` }} />
          </div>
        </>
      )}

      {/* Camera view area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Side toolbar */}
        {!hasCaptured && (
          <div className="absolute top-14 right-2 z-40 flex flex-col gap-1">
            {[
              { icon: flashOn ? <Zap size={16} /> : <ZapOff size={16} />, action: () => setFlashOn(!flashOn), active: flashOn, color: 'text-yellow-400', label: isArabic ? 'فلاش' : 'Flash' },
              { icon: <FlipHorizontal size={16} />, action: flipCamera, active: facingMode === 'user', color: 'text-accent', label: isArabic ? 'سلفي' : 'Selfie' },
              { icon: selfieTimer > 0 ? <span className="text-[10px] font-bold">{selfieTimer}s</span> : <Timer size={16} />, action: cycleTimer, active: selfieTimer > 0, color: 'text-accent', label: isArabic ? 'مؤقت' : 'Timer' },
              { icon: <Grid3x3 size={16} />, action: () => setShowGrid(!showGrid), active: showGrid, color: 'text-accent', label: isArabic ? 'شبكة' : 'Grid' },
              { icon: silentMode ? <VolumeX size={16} /> : <Volume2 size={16} />, action: () => setSilentMode(!silentMode), active: silentMode, color: 'text-red-400', label: isArabic ? 'صامت' : 'Mute' },
              { icon: <MapPin size={16} />, action: () => setShowLocation(!showLocation), active: showLocation, color: 'text-green-400', label: isArabic ? 'موقع' : 'Location' },
              { icon: <Clock size={16} />, action: () => setShowDateTime(!showDateTime), active: showDateTime, color: 'text-blue-400', label: isArabic ? 'وقت' : 'Time' },
              { icon: <SunMedium size={16} />, action: () => togglePanel('adjust'), active: activePanel === 'adjust', color: 'text-accent', label: isArabic ? 'تعديل' : 'Adjust' },
              { icon: <Type size={16} />, action: () => togglePanel('text'), active: activePanel === 'text', color: 'text-accent', label: isArabic ? 'نص' : 'Text' },
              { icon: <Smile size={16} />, action: () => togglePanel('emoji'), active: activePanel === 'emoji', color: 'text-accent', label: isArabic ? 'ملصقات' : 'Stickers' },
              { icon: <Sparkles size={16} />, action: () => togglePanel('frames'), active: activePanel === 'frames', color: 'text-accent', label: isArabic ? 'إطار' : 'Frame' },
              ...(mode === 'video' ? [{ icon: <Music size={16} />, action: () => togglePanel('music'), active: !!selectedMusic, color: 'text-accent', label: isArabic ? 'موسيقى' : 'Music' }] : []),
            ].map((btn, i) => (
              <button key={i} onClick={btn.action}
                className={`flex flex-col items-center justify-center rounded-full w-10 h-10 backdrop-blur-md transition-all
                  ${btn.active ? `${btn.color} bg-white/20` : 'text-white/90 bg-black/40'}`}>
                {btn.icon}
                <span className="text-[6px] mt-0.5 leading-none">{btn.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Multi-capture progress bar */}
        {multiMode && capturedPhotos.length > 0 && !capturedImage && !capturedVideo && (
          <div className="absolute top-14 left-14 right-14 z-40">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <span className="text-white text-xs font-bold">{capturedPhotos.length}/{MAX_MULTI_PHOTOS}</span>
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(capturedPhotos.length / MAX_MULTI_PHOTOS) * 100}%` }} />
              </div>
              <button onClick={confirmCapture} className="text-accent text-xs font-bold">{isArabic ? 'تم' : 'Done'}</button>
            </div>
            <div className="flex gap-1 mt-1.5 overflow-x-auto no-scrollbar">
              {capturedPhotos.map((p, i) => (
                <div key={i} className="shrink-0 relative">
                  <img src={p} className="w-10 h-10 rounded-lg object-cover border border-white/30" />
                  <button onClick={() => setCapturedPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <X size={8} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Camera preview */}
        {capturedVideo ? (
          <video src={capturedVideo} className="w-full h-full object-contain" controls autoPlay loop />
        ) : capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-contain" />
        ) : (
          <div className="relative w-full h-full overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted={mode === 'photo' || silentMode}
              className="w-full h-full object-cover"
              style={{ filter: getFilterCSS(), transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/25" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/25" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/25" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/25" />
              </div>
            )}
            {/* Location overlay on preview */}
            {showLocation && locationName && (
              <div className="absolute bottom-24 left-3 z-30 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
                <MapPin className="w-3 h-3 text-green-400" />
                <span className="text-white text-xs">{locationName}</span>
              </div>
            )}
            {/* DateTime overlay on preview */}
            {showDateTime && (
              <div className="absolute bottom-24 right-14 z-30 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
                <Clock className="w-3 h-3 text-blue-400" />
                <span className="text-white text-xs">
                  {new Date().toLocaleTimeString(isArabic ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
            {textOverlays.map(overlay => (
              <DraggableTextOverlay key={overlay.id} id={overlay.id} text={overlay.text}
                x={overlay.x} y={overlay.y} color={overlay.color} fontSize={overlay.fontSize} bold={overlay.bold}
                onUpdate={(id, nx, ny) => setTextOverlays(prev => prev.map(o => o.id === id ? { ...o, x: nx, y: ny } : o))}
                onRemove={(id) => setTextOverlays(prev => prev.filter(o => o.id !== id))} />
            ))}
          </div>
        )}
        <StickerOverlay stickers={placedStickers} frameId={activeFrame} interactive={!hasCaptured}
          onStickerUpdate={(id, nx, ny, ns, nr) => setPlacedStickers(prev => prev.map(s => s.id === id ? { ...s, x: nx, y: ny, scale: ns, rotation: nr } : s))}
          onStickerRemove={(id) => setPlacedStickers(prev => prev.filter(s => s.id !== id))} />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Panels */}
      <AnimatePresence>
        {activePanel === 'adjust' && !hasCaptured && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-3 right-14 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3 space-y-2">
            {[
              { label: isArabic ? 'السطوع' : 'Brightness', icon: SunMedium, value: brightness, set: setBrightness },
              { label: isArabic ? 'التباين' : 'Contrast', icon: Contrast, value: contrast, set: setContrast },
              { label: isArabic ? 'التشبع' : 'Saturation', icon: Palette, value: saturation, set: setSaturation },
            ].map(({ label, icon: Icon, value, set }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon size={14} className="text-white/60 shrink-0" />
                <span className="text-[10px] text-white/70 w-12 shrink-0">{label}</span>
                <Slider value={[value]} onValueChange={([v]) => set(v)} min={20} max={200} step={5} className="flex-1" />
                <span className="text-[10px] text-white/50 w-7 text-right">{value}%</span>
              </div>
            ))}
          </motion.div>
        )}

        {activePanel === 'text' && !hasCaptured && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-3 right-14 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3 space-y-2">
            <div className="flex gap-2">
              <Input value={currentText} onChange={e => setCurrentText(e.target.value)}
                placeholder={isArabic ? 'اكتب نصاً...' : 'Type text...'}
                className="flex-1 h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl"
                onKeyDown={e => e.key === 'Enter' && addTextOverlay()} />
              <Button size="sm" onClick={addTextOverlay} className="h-9 px-3 rounded-xl bg-accent text-accent-foreground shrink-0">
                <Check size={14} />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {TEXT_COLORS.map(c => (
                <button key={c} onClick={() => setTextColor(c)}
                  className={`w-6 h-6 rounded-full border-2 shrink-0 ${textColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setTextBold(!textBold)} className={`px-2 py-1 rounded text-xs ${textBold ? 'bg-white text-black' : 'bg-white/15 text-white'}`}>
                <Bold size={12} />
              </button>
              <span className="text-[10px] text-white/60">{isArabic ? 'حجم' : 'Size'}</span>
              <Slider value={[textSize]} onValueChange={([v]) => setTextSize(v)} min={14} max={48} step={2} className="flex-1" />
            </div>
          </motion.div>
        )}

        {activePanel === 'emoji' && !hasCaptured && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-3 right-14 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3">
            <p className="text-white/70 text-xs mb-2">{isArabic ? 'اختر ملصق' : 'Choose sticker'}</p>
            <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto">
              {TRAVEL_STICKERS.map((emoji, i) => (
                <button key={i} onClick={() => addEmojiSticker(emoji)}
                  className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 active:scale-90 transition-transform rounded-lg hover:bg-white/10">
                  {emoji}
                </button>
              ))}
            </div>
            {placedStickers.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-2 pt-2 border-t border-white/10">
                {placedStickers.map(s => (
                  <button key={s.id} onClick={() => setPlacedStickers(prev => prev.filter(p => p.id !== s.id))}
                    className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-red-500/20 text-white/80 text-xs hover:bg-red-500/40">
                    {s.emoji} <X size={8} />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activePanel === 'frames' && !hasCaptured && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-3 right-14 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3">
            <p className="text-white/70 text-xs mb-2">{isArabic ? 'اختر إطار' : 'Choose frame'}</p>
            <div className="grid grid-cols-3 gap-2">
              {FRAME_OPTIONS.map(f => (
                <button key={f.id} onClick={() => setActiveFrame(f.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    activeFrame === f.id ? 'bg-accent text-accent-foreground' : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {activePanel === 'music' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-44 left-3 right-14 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3">
            <p className="text-white/70 text-xs mb-2">{isArabic ? 'موسيقى خلفية' : 'Background Music'}</p>
            <div className="flex flex-wrap gap-2">
              {MUSIC_TRACKS.map(track => (
                <button key={track.id} onClick={() => { setSelectedMusic(track.id === 'none' ? null : track.id); setActivePanel('none'); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedMusic === track.id ? 'bg-accent text-accent-foreground' : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}>
                  {track.id !== 'none' && '♫ '}{track.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      {hasCaptured ? (
        <div className="absolute bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-8 pb-8 pt-4 bg-gradient-to-t from-black/90 to-transparent">
          <Button variant="ghost" size="icon" onClick={resetCapture} className="text-white bg-white/15 rounded-full h-14 w-14">
            <RotateCcw size={22} />
          </Button>
          <Button size="icon" onClick={confirmCapture} className="bg-accent text-accent-foreground rounded-full h-16 w-16 shadow-xl shadow-accent/30">
            <Check size={28} />
          </Button>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 z-30 pb-4 pt-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {/* Mode toggle */}
          <div className="flex justify-center gap-3 mb-2">
            <button onClick={() => { if (!isRecording) { setMode('photo'); setMultiMode(false); } }}
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all ${mode === 'photo' && !multiMode ? 'text-white bg-white/25' : 'text-white/50'}`}>
              {isArabic ? 'صورة' : 'Photo'}
            </button>
            <button onClick={() => { if (!isRecording) { setMode('photo'); setMultiMode(true); } }}
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all ${multiMode ? 'text-accent bg-accent/20' : 'text-white/50'}`}>
              {isArabic ? 'متعدد' : 'Multi'} {multiMode && capturedPhotos.length > 0 ? `(${capturedPhotos.length})` : ''}
            </button>
            <button onClick={() => { if (!isRecording) { setMode('video'); setMultiMode(false); } }}
              className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all ${mode === 'video' ? 'text-red-400 bg-red-500/20' : 'text-white/50'}`}>
              {isArabic ? 'فيديو' : 'Video'}
            </button>
          </div>

          {/* Filters row */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
            {COLOR_FILTERS.map(f => (
              <button key={f.id} onClick={() => setSelectedFilter(f.id)} className="shrink-0 flex flex-col items-center gap-0.5">
                <div className={`w-10 h-10 rounded-full border-2 transition-all ${selectedFilter === f.id ? 'border-white scale-110' : 'border-white/20'} ${f.preview}`} />
                <span className={`text-[8px] font-medium ${selectedFilter === f.id ? 'text-white' : 'text-white/50'}`}>{f.label}</span>
              </button>
            ))}
          </div>

          {/* Shutter */}
          <div className="flex justify-center">
            {mode === 'photo' ? (
              <button onClick={takePhoto}
                className="rounded-full border-[3px] border-white flex items-center justify-center bg-white/10 active:scale-90 transition-all"
                style={{ width: 68, height: 68 }}>
                <div className="w-13 h-13 rounded-full bg-white" style={{ width: 54, height: 54 }} />
              </button>
            ) : isRecording ? (
              <button onClick={stopRecording}
                className="rounded-full border-[3px] border-red-500 flex items-center justify-center bg-red-500/20 active:scale-90 transition-all"
                style={{ width: 68, height: 68 }}>
                <div className="w-8 h-8 rounded-md bg-red-500" />
              </button>
            ) : (
              <button onClick={startRecording}
                className="rounded-full border-[3px] border-red-500 flex items-center justify-center bg-red-500/10 active:scale-90 transition-all"
                style={{ width: 68, height: 68 }}>
                <div className="rounded-full bg-red-500" style={{ width: 54, height: 54 }} />
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
