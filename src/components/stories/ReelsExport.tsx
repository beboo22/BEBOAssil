import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Film, Download, Loader2, Music, Play, Pause, Sparkles, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { getLocalizedCopy } from "@/lib/localizedMessages";
import { TRACK_NOTES } from "@/utils/audioEngine";

interface ReelsExportProps {
  images: string[];
  title: string;
  location?: string;
  authorName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetTransition?: string;
  presetMusic?: string;
  customAudioUrl?: string;
  requireAuth?: boolean;
  exportSettings?: {
    filter?: string;
    speed?: number;
    slideDuration?: number;
    showTextOverlay?: boolean;
    showWatermark?: boolean;
    autoEnhance?: boolean;
    textStyle?: string;
    textFont?: string;
    textColor?: string;
    textSize?: number;
    customAudioUrl?: string;
    stickers?: Array<{
      id: string;
      emoji: string;
      x: number;
      y: number;
      size: number;
      slideIndex: number;
      isImage?: boolean;
      rotation: number;
    }>;
    mediaControls?: Array<{ duration: number; speed: number }> | Record<number, { duration: number; speed: number }>;
  };
}

const MUSIC_TRACKS = [
  { id: 'none', labelEn: 'No Music', labelAr: 'بدون موسيقى' },
  { id: 'chill', labelEn: 'Chill Vibes', labelAr: 'أجواء هادئة' },
  { id: 'adventure', labelEn: 'Adventure', labelAr: 'مغامرة' },
  { id: 'cinematic', labelEn: 'Cinematic', labelAr: 'سينمائي' },
];

const TRANSITION_STYLES = [
  { id: 'fade', labelEn: 'Fade', labelAr: 'تلاشي' },
  { id: 'slide', labelEn: 'Slide', labelAr: 'انزلاق' },
  { id: 'zoom', labelEn: 'Zoom', labelAr: 'تكبير' },
];

const FILTER_MAP: Record<string, string> = {
  none: '',
  warm: 'sepia(0.3) saturate(1.4)',
  cool: 'hue-rotate(30deg) saturate(1.2)',
  bw: 'grayscale(1)',
  vintage: 'sepia(0.5) contrast(1.1) brightness(0.95)',
  vivid: 'saturate(1.8) contrast(1.1)',
  dramatic: 'contrast(1.4) brightness(0.9)',
  fade: 'brightness(1.1) saturate(0.7) contrast(0.9)',
};

const TEXT_STYLE_MAP: Record<string, { weight: string; scale: number; shadow: boolean }> = {
  minimal: { weight: '500', scale: 1, shadow: false },
  bold: { weight: '900', scale: 1.08, shadow: true },
  elegant: { weight: '400', scale: 0.96, shadow: true },
  neon: { weight: '700', scale: 1.02, shadow: true },
};

const TEXT_FONT_MAP: Record<string, string> = {
  modern: '"Helvetica Neue", "Segoe UI", sans-serif',
  editorial: 'Georgia, "Times New Roman", serif',
  cinematic: '"Trebuchet MS", "Segoe UI", sans-serif',
  mono: '"Courier New", monospace',
};

const TEXT_COLOR_MAP: Record<string, string> = {
  white: 'hsl(0 0% 100%)',
  mint: 'hsl(172 62% 46%)',
  gold: 'hsl(45 90% 68%)',
  rose: 'hsl(350 85% 82%)',
};

// Generate audio data - supports both simple types and audioEngine track IDs
const generateTone = (type: string, sampleRate: number, duration: number): Float32Array => {
  const samples = sampleRate * duration;
  const data = new Float32Array(samples);
  
  // Check if this is an audioEngine track ID with note data
  const trackConfig = TRACK_NOTES[type];
  if (trackConfig) {
    const { notes, wave, tempo } = trackConfig;
    const noteLen = tempo * sampleRate;
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const noteIdx = Math.floor(i / noteLen) % notes.length;
      const freq = notes[noteIdx];
      const notePos = (i % noteLen) / noteLen;
      const env = Math.min(1, notePos * 10) * Math.max(0, 1 - notePos * 0.3) * 0.15;
      
      if (wave === 'sine') {
        data[i] = env * Math.sin(2 * Math.PI * freq * t);
      } else if (wave === 'triangle') {
        const p = (freq * t) % 1;
        data[i] = env * (p < 0.5 ? 4 * p - 1 : 3 - 4 * p);
      } else if (wave === 'square') {
        data[i] = env * (Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1) * 0.5;
      } else if (wave === 'sawtooth') {
        const p = (freq * t) % 1;
        data[i] = env * (2 * p - 1) * 0.7;
      } else {
        data[i] = env * Math.sin(2 * Math.PI * freq * t);
      }
    }
    return data;
  }
  
  // Fallback for simple types
  const baseFreq = type === 'chill' ? 220 : type === 'adventure' ? 330 : 440;
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 4) * Math.max(0, 1 - (t / duration) * 0.3);
    data[i] = env * 0.15 * (
      Math.sin(2 * Math.PI * baseFreq * t) +
      0.5 * Math.sin(2 * Math.PI * baseFreq * 1.5 * t) +
      0.3 * Math.sin(2 * Math.PI * baseFreq * 2 * t + Math.sin(t * 2))
    );
  }
  return data;
};

export const ReelsExport = ({ images, title, location, authorName, open, onOpenChange, presetTransition, presetMusic, customAudioUrl, requireAuth = false, exportSettings }: ReelsExportProps) => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isArabic = i18n.language?.startsWith('ar');
  const localized = useMemo(() => getLocalizedCopy(i18n.language), [i18n.language]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [musicTrack, setMusicTrack] = useState(presetMusic || 'chill');
  const [transition, setTransition] = useState(presetTransition || 'fade');

  // Sync preset props when they change
  useEffect(() => {
    if (presetMusic) setMusicTrack(presetMusic);
  }, [presetMusic]);
  useEffect(() => {
    if (presetTransition) setTransition(presetTransition);
  }, [presetTransition]);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [exportedFile, setExportedFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const SLIDE_DURATION = exportSettings?.slideDuration || 2.5;
  const mediaControls = exportSettings?.mediaControls;
  const TRANSITION_DURATION = 0.8;
  const FPS = 30;
  const WIDTH = 1080;
  const HEIGHT = 1920;

  const resolvedFilter = exportSettings?.filter || 'none';
  const resolvedTextStyle = TEXT_STYLE_MAP[exportSettings?.textStyle || 'minimal'] || TEXT_STYLE_MAP.minimal;
  const resolvedTextFont = TEXT_FONT_MAP[exportSettings?.textFont || 'modern'] || TEXT_FONT_MAP.modern;
  const resolvedTextColor = TEXT_COLOR_MAP[exportSettings?.textColor || 'white'] || TEXT_COLOR_MAP.white;
  const resolvedTextSize = exportSettings?.textSize || 16;
  const resolvedStickers = useMemo(() => exportSettings?.stickers || [], [exportSettings?.stickers]);
  const resolvedCanvasFilter = useMemo(() => {
    return [
      FILTER_MAP[resolvedFilter] || '',
      exportSettings?.autoEnhance ? 'brightness(1.03) contrast(1.06) saturate(1.08)' : '',
    ].filter(Boolean).join(' ');
  }, [exportSettings?.autoEnhance, resolvedFilter]);

  const getMediaControl = useCallback((index: number) => {
    if (!mediaControls) return undefined;
    return Array.isArray(mediaControls) ? mediaControls[index] : mediaControls[index];
  }, [mediaControls]);

  const buildFilename = useCallback(() => {
    return `${title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 30) || 'reel'}_reels.mp4`;
  }, [title]);

  const downloadFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const shareVideoFile = useCallback(async (file: File) => {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text: title });
        toast.success(localized.shareSuccess);
        return;
      }
      downloadFile(file);
      toast.info(localized.shareNotSupported);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      console.error('Share error:', error);
      toast.error(localized.shareFailed);
    }
  }, [downloadFile, localized.shareFailed, localized.shareNotSupported, localized.shareSuccess, title]);

  const createAudioStream = useCallback(async (totalDuration: number) => {
    const audioSourceUrl = customAudioUrl || exportSettings?.customAudioUrl;
    const shouldCreateAudio = Boolean(audioSourceUrl) || (musicTrack !== 'none' && musicTrack !== '');
    if (!shouldCreateAudio) {
      return { stream: null as MediaStream | null, cleanup: () => undefined };
    }

    const audioCtx = new AudioContext({ sampleRate: 44100 });
    const destination = audioCtx.createMediaStreamDestination();
    const gainNode = audioCtx.createGain();
    gainNode.connect(destination);
    let source: AudioBufferSourceNode | null = null;

    try {
      let buffer: AudioBuffer;
      if (audioSourceUrl) {
        const response = await fetch(audioSourceUrl);
        const arrayBuffer = await response.arrayBuffer();
        buffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } else {
        buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * totalDuration, audioCtx.sampleRate);
        buffer.getChannelData(0).set(generateTone(musicTrack, audioCtx.sampleRate, totalDuration));
      }

      source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.loop = buffer.duration < totalDuration - 0.05;
      source.connect(gainNode);

      const startAt = audioCtx.currentTime;
      const endAt = startAt + totalDuration;
      const fadeDuration = Math.min(1.25, Math.max(0.6, totalDuration * 0.12));
      gainNode.gain.setValueAtTime(0.9, startAt);
      gainNode.gain.setValueAtTime(0.9, Math.max(startAt, endAt - fadeDuration));
      gainNode.gain.linearRampToValueAtTime(0, endAt);

      source.start(startAt);
      source.stop(endAt + 0.05);

      return {
        stream: destination.stream,
        cleanup: () => {
          try { source?.stop(); } catch {}
          audioCtx.close().catch(() => undefined);
        },
      };
    } catch (error) {
      console.error('Audio stream creation failed:', error);
      await audioCtx.close().catch(() => undefined);
      return { stream: null as MediaStream | null, cleanup: () => undefined };
    }
  }, [customAudioUrl, exportSettings?.customAudioUrl, musicTrack]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Retry without crossOrigin for blob URLs
        if (src.startsWith('blob:')) {
          const img2 = new Image();
          img2.onload = () => resolve(img2);
          img2.onerror = reject;
          img2.src = src;
        } else {
          reject(new Error(`Failed to load: ${src}`));
        }
      };
      img.src = src;
    });
  };

  const drawSticker = useCallback((ctx: CanvasRenderingContext2D, sticker: NonNullable<ReelsExportProps['exportSettings']>['stickers'][number], w: number, h: number, loadedStickerImages: Map<string, HTMLImageElement>) => {
    const x = (sticker.x / 100) * w;
    const y = (sticker.y / 100) * h;
    const size = Math.max(36, sticker.size * (w / 375));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((sticker.rotation || 0) * Math.PI) / 180);
    if (sticker.isImage) {
      const stickerImg = loadedStickerImages.get(sticker.emoji);
      if (stickerImg) {
        ctx.drawImage(stickerImg, -size / 2, -size / 2, size, size);
      }
    } else {
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sticker.emoji, 0, 0);
    }
    ctx.restore();
  }, []);

  const getSlideTimeline = useCallback((imageCount: number) => {
    const globalSpeed = exportSettings?.speed || 1;
    const entries: Array<{ start: number; duration: number }> = [];
    let cursor = 0;
    for (let i = 0; i < imageCount; i++) {
      const ctrl = getMediaControl(i);
      const dur = (ctrl?.duration || SLIDE_DURATION) / (ctrl?.speed || globalSpeed);
      entries.push({ start: cursor, duration: dur });
      cursor += dur;
    }
    return { entries, totalDuration: cursor };
  }, [SLIDE_DURATION, exportSettings?.speed, getMediaControl]);

  const drawFrame = (
    ctx: CanvasRenderingContext2D,
    loadedImages: HTMLImageElement[],
    frameNum: number,
    _totalFrames: number,
    w: number,
    h: number,
    loadedStickerImages: Map<string, HTMLImageElement>
  ) => {
    const time = frameNum / FPS;
    const { entries } = getSlideTimeline(loadedImages.length);
    let currentSlideIndex = loadedImages.length - 1;
    let slideProgress = 0;
    let cycleDuration = entries[0]?.duration || SLIDE_DURATION;
    for (let i = 0; i < entries.length; i++) {
      if (time < entries[i].start + entries[i].duration || i === entries.length - 1) {
        currentSlideIndex = i;
        cycleDuration = entries[i].duration;
        slideProgress = Math.min(1, (time - entries[i].start) / cycleDuration);
        break;
      }
    }

    // Dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    const drawImageCover = (img: HTMLImageElement, alpha: number, scale: number = 1, offsetX: number = 0, extraFilter = '') => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.filter = [resolvedCanvasFilter, extraFilter].filter(Boolean).join(' ');
      const imgRatio = img.width / img.height;
      const canvasRatio = w / h;
      let dw: number, dh: number, sx: number, sy: number;
      if (imgRatio > canvasRatio) {
        dh = h * scale;
        dw = dh * imgRatio;
      } else {
        dw = w * scale;
        dh = dw / imgRatio;
      }
      sx = (w - dw) / 2 + offsetX;
      sy = (h - dh) / 2;
      ctx.drawImage(img, sx, sy, dw, dh);
      ctx.restore();
    };

    const currentImg = loadedImages[currentSlideIndex];
    const nextImg = loadedImages[Math.min(currentSlideIndex + 1, loadedImages.length - 1)];

    if (transition === 'fade') {
      const fadeStart = 1 - TRANSITION_DURATION / cycleDuration;
      if (slideProgress > fadeStart && currentSlideIndex < loadedImages.length - 1) {
        const fadeProgress = (slideProgress - fadeStart) / (1 - fadeStart);
        drawImageCover(currentImg, 1 - fadeProgress, 1 + slideProgress * 0.05);
        drawImageCover(nextImg, fadeProgress);
      } else {
        // Ken Burns effect
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.08);
      }
    } else if (transition === 'slide') {
      const fadeStart = 1 - TRANSITION_DURATION / cycleDuration;
      if (slideProgress > fadeStart && currentSlideIndex < loadedImages.length - 1) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        const ease = t * t * (3 - 2 * t);
        drawImageCover(currentImg, 1, 1, -w * ease);
        drawImageCover(nextImg, 1, 1, w * (1 - ease));
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.05);
      }
    } else if (transition === 'blur') {
      const fadeStart = 1 - TRANSITION_DURATION / cycleDuration;
      if (slideProgress > fadeStart && currentSlideIndex < loadedImages.length - 1) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        drawImageCover(currentImg, 1 - t, 1 + t * 0.04, 0, `blur(${Math.round(t * 16)}px)`);
        drawImageCover(nextImg, t, 1.04 - t * 0.04, 0, `blur(${Math.round((1 - t) * 16)}px)`);
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.05);
      }
    } else if (transition === 'kenBurns') {
      drawImageCover(currentImg, 1, 1.04 + slideProgress * 0.14);
    } else { // zoom
      const fadeStart = 1 - TRANSITION_DURATION / cycleDuration;
      if (slideProgress > fadeStart && currentSlideIndex < loadedImages.length - 1) {
        const t = (slideProgress - fadeStart) / (1 - fadeStart);
        drawImageCover(currentImg, 1 - t, 1 + t * 0.3);
        drawImageCover(nextImg, t, 1.3 - t * 0.3);
      } else {
        drawImageCover(currentImg, 1, 1 + slideProgress * 0.1);
      }
    }

    // Gradient overlay at bottom
    const grad = ctx.createLinearGradient(0, h * 0.55, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    resolvedStickers
      .filter((sticker) => sticker.slideIndex === currentSlideIndex)
      .forEach((sticker) => drawSticker(ctx, sticker, w, h, loadedStickerImages));

    // Title text with fade-in
    const textAlpha = Math.min(1, time * 2);
    ctx.save();
    ctx.globalAlpha = textAlpha;
    const maxTextW = w * 0.85;
    const titleY = h * 0.82;
    if (exportSettings?.showTextOverlay !== false) {
      if (resolvedTextStyle.shadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
      }
      ctx.fillStyle = resolvedTextColor;
      ctx.font = `${resolvedTextStyle.weight} ${Math.round((w * 0.055 * resolvedTextStyle.scale) + (resolvedTextSize - 16) * 2)}px ${resolvedTextFont}`;
      ctx.textAlign = 'center';
      ctx.fillText(title.slice(0, 40), w / 2, titleY, maxTextW);

      if (location) {
        ctx.font = `${Math.round((w * 0.032) + (resolvedTextSize - 16))}px ${resolvedTextFont}`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(`📍 ${location}`, w / 2, titleY + w * 0.065, maxTextW);
      }

      if (authorName) {
        ctx.font = `${Math.round(w * 0.028)}px ${resolvedTextFont}`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(`@${authorName}`, w / 2, titleY + w * 0.11, maxTextW);
      }
    }

    if (exportSettings?.showWatermark) {
      ctx.save();
      ctx.textAlign = 'right';
      // Elegant watermark with shadow and premium font
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      const wmSize = Math.round(w * 0.032);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `700 italic ${wmSize}px "Georgia", "Times New Roman", serif`;
      ctx.fillText('Aseel AI Trip', w * 0.94, h * 0.055);
      // Subtle underline accent
      const textW = ctx.measureText('Aseel AI Trip').width;
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(w * 0.94 - textW, h * 0.055 + 6, textW, 1.5);
      ctx.restore();
    }

    // Slide indicator dots
    const dotY = h * 0.93;
    const dotR = w * 0.006;
    const dotGap = w * 0.025;
    const totalDotsW = (loadedImages.length - 1) * dotGap;
    const startX = (w - totalDotsW) / 2;
    loadedImages.forEach((_, i) => {
      ctx.beginPath();
      ctx.arc(startX + i * dotGap, dotY, i === currentSlideIndex ? dotR * 1.8 : dotR, 0, Math.PI * 2);
      ctx.fillStyle = i === currentSlideIndex ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.fill();
    });

    ctx.restore();
  };

  // Preview animation
  const startPreview = useCallback(async () => {
    if (!previewRef.current || images.length === 0) return;
    const ctx = previewRef.current.getContext('2d');
    if (!ctx) return;

    try {
      const loaded = await Promise.all(images.slice(0, 8).map(loadImage));
      const stickerSources = Array.from(new Set(resolvedStickers.filter(s => s.isImage).map(s => s.emoji)));
      const stickerPairs = await Promise.all(stickerSources.map(async (src) => [src, await loadImage(src)] as const));
      const stickerMap = new Map(stickerPairs);
      const { totalDuration } = getSlideTimeline(loaded.length);
      const totalFrames = Math.round(totalDuration * FPS);
      let frame = 0;
      setPreviewPlaying(true);

      const animate = () => {
        if (frame >= totalFrames) frame = 0;
        if (!previewRef.current) {
          setPreviewPlaying(false);
          return;
        }
        drawFrame(ctx, loaded, frame, totalFrames, previewRef.current.width, previewRef.current.height, stickerMap);
        frame++;
        animFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.error('Preview error:', e);
    }
  }, [images, transition, resolvedStickers, SLIDE_DURATION, getSlideTimeline]);

  const stopPreview = () => {
    cancelAnimationFrame(animFrameRef.current);
    setPreviewPlaying(false);
  };

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const exportVideo = async () => {
    if (images.length === 0) return;
    if (requireAuth && !user) {
      toast.error(localized.exportSignInRequired);
      onOpenChange(false);
      navigate('/auth');
      return;
    }
    setExporting(true);
    setProgress(0);
    setExportedFile(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const ctx = canvas.getContext('2d')!;

      const loaded = await Promise.all(images.slice(0, 8).map(loadImage));
      const stickerSources = Array.from(new Set(resolvedStickers.filter(s => s.isImage).map(s => s.emoji)));
      const stickerPairs = await Promise.all(stickerSources.map(async (src) => [src, await loadImage(src)] as const));
      const stickerMap = new Map(stickerPairs);
      setProgress(15);

      const { totalDuration } = getSlideTimeline(loaded.length);
      const totalFrames = Math.round(totalDuration * FPS);

      const mp4RecorderMime = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
      ].find((mime) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime));

      let mp4Blob: Blob;

      if (mp4RecorderMime) {
        const stream = canvas.captureStream(FPS);
        const { stream: audioStream, cleanup } = await createAudioStream(totalDuration);
        audioStream?.getAudioTracks().forEach((track) => stream.addTrack(track));

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: mp4RecorderMime,
          videoBitsPerSecond: 5_000_000,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const done = new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
        });

        recorder.start(100);
        for (let f = 0; f < totalFrames; f++) {
          drawFrame(ctx, loaded, f, totalFrames, WIDTH, HEIGHT, stickerMap);
          setProgress(15 + Math.round((f / totalFrames) * 75));
          await new Promise((resolve) => setTimeout(resolve, 1000 / FPS));
        }

        recorder.stop();
        await done;
        cleanup();
        stream.getTracks().forEach((track) => track.stop());
        mp4Blob = new Blob(chunks, { type: 'video/mp4' });
      } else if ('VideoEncoder' in window && 'VideoFrame' in window) {
        const target = new ArrayBufferTarget();
        const muxer = new Muxer({
          target,
          video: {
            codec: 'avc',
            width: WIDTH,
            height: HEIGHT,
          },
          fastStart: 'in-memory',
        });

        let encodeError: Error | null = null;
        // @ts-ignore
        const encoder = new VideoEncoder({
          output: (chunk: EncodedVideoChunk, meta: EncodedVideoChunkMetadata | undefined) => muxer.addVideoChunk(chunk, meta),
          error: (error: Error) => { encodeError = error; },
        });

        // @ts-ignore
        encoder.configure({
          codec: 'avc1.42001f',
          width: WIDTH,
          height: HEIGHT,
          bitrate: 5_000_000,
          framerate: FPS,
          avc: { format: 'annexb' },
        });

        for (let f = 0; f < totalFrames; f++) {
          drawFrame(ctx, loaded, f, totalFrames, WIDTH, HEIGHT, stickerMap);
          const bitmap = await createImageBitmap(canvas);
          // @ts-ignore
          const frame = new VideoFrame(bitmap, {
            timestamp: Math.round((f / FPS) * 1_000_000),
            duration: Math.round(1_000_000 / FPS),
          });
          encoder.encode(frame);
          frame.close();
          bitmap.close();
          if (encoder.encodeQueueSize > 12) {
            await encoder.flush();
          }
          setProgress(15 + Math.round((f / totalFrames) * 75));
        }

        await encoder.flush();
        encoder.close();
        if (encodeError) throw encodeError;
        muxer.finalize();
        mp4Blob = new Blob([target.buffer], { type: 'video/mp4' });
      } else {
        throw new Error('MP4 export is not supported on this device');
      }

      setProgress(95);
      const file = new File([mp4Blob], buildFilename(), { type: 'video/mp4' });
      setExportedFile(file);
      downloadFile(file);
      toast.success(localized.exportReady);
      setProgress(100);
    } catch (err) {
      console.error('Export error:', err);
      toast.error(localized.exportFailed);
    } finally {
      setTimeout(() => { setExporting(false); setProgress(0); }, 1000);
    }
  };

  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            {isArabic ? 'تصدير الفيديو' : 'Export Video'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="relative aspect-[9/16] bg-muted rounded-2xl overflow-hidden max-h-64 mx-auto" style={{ maxWidth: 180 }}>
            <canvas ref={previewRef} width={270} height={480} className="w-full h-full" />
            <button onClick={previewPlaying ? stopPreview : startPreview}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
              {previewPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white fill-white" />}
            </button>
            <Badge className="absolute top-2 left-2 bg-black/50 text-white border-0 text-[10px]">
              {images.length} {isArabic ? 'صورة' : 'photos'}
            </Badge>
          </div>

          {/* Total duration indicator */}
          {(() => {
            const { totalDuration } = getSlideTimeline(images.length);
            const mins = Math.floor(totalDuration / 60);
            const secs = Math.round(totalDuration % 60);
            const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
            return (
              <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-muted/60 border border-border/50">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{isArabic ? 'المدة الإجمالية' : 'Total Duration'}: {timeStr}</span>
                <span className="text-[10px] text-muted-foreground">({images.length} {isArabic ? 'شريحة' : 'slides'})</span>
              </div>
            );
          })()}

          {/* Show applied settings summary when presets are passed */}
          {presetTransition && presetMusic && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {musicTrack && musicTrack !== 'none' && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Music className="w-3 h-3" /> {musicTrack}
                </Badge>
              )}
              {exportSettings?.filter && exportSettings.filter !== 'none' && (
                <Badge variant="secondary" className="text-[10px]">
                  <Sparkles className="w-3 h-3" /> {exportSettings.filter}
                </Badge>
              )}
              {exportSettings?.speed && exportSettings.speed !== 1 && (
                <Badge variant="secondary" className="text-[10px]">
                  {exportSettings.speed}x
                </Badge>
              )}
            </div>
          )}

          {/* Settings - only show if no presets were passed */}
          {(!presetTransition || !presetMusic) && (
            <div className="grid grid-cols-2 gap-3">
              {!presetMusic && (
                <div>
                  <label className="text-xs font-medium text-foreground flex items-center gap-1 mb-1.5">
                    <Music className="w-3.5 h-3.5" /> {isArabic ? 'الموسيقى' : 'Music'}
                  </label>
                  <Select value={musicTrack} onValueChange={setMusicTrack}>
                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">{MUSIC_TRACKS.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{isArabic ? t.labelAr : t.labelEn}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
              )}
              {!presetTransition && (
                <div>
                  <label className="text-xs font-medium text-foreground flex items-center gap-1 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> {isArabic ? 'الانتقال' : 'Transition'}
                  </label>
                  <Select value={transition} onValueChange={setTransition}>
                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">{TRANSITION_STYLES.map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{isArabic ? t.labelAr : t.labelEn}</SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {exporting && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {progress < 15 ? (isArabic ? 'تحميل الصور...' : 'Loading images...') :
                 progress < 90 ? (isArabic ? 'إنشاء الفيديو...' : 'Creating video...') :
                 (isArabic ? 'جاري التنزيل...' : 'Downloading...')}
              </p>
            </div>
          )}

          <Button onClick={exportVideo} disabled={exporting} className="w-full gap-2 rounded-xl h-11">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? (isArabic ? 'جاري التصدير...' : 'Exporting...') : (requireAuth && !user ? (isArabic ? 'سجل للدخول للتصدير' : 'Sign in to export') : (isArabic ? 'تصدير MP4' : 'Export MP4'))}
          </Button>

          {exportedFile && (
            <Button variant="outline" onClick={() => shareVideoFile(exportedFile)} className="w-full gap-2 rounded-xl h-11">
              <Sparkles className="w-4 h-4" />
              {localized.shareVideo}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
