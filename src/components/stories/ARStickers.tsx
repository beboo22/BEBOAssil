import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sticker, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StickerItem {
  id: string;
  emoji: string;
  label: string;
  labelAr: string;
}

interface FrameItem {
  id: string;
  label: string;
  labelAr: string;
  borderStyle: string;
}

const TRAVEL_STICKERS: StickerItem[] = [
  { id: 's1', emoji: '✈️', label: 'Flight', labelAr: 'طيران' },
  { id: 's2', emoji: '🏖️', label: 'Beach', labelAr: 'شاطئ' },
  { id: 's3', emoji: '🏔️', label: 'Mountain', labelAr: 'جبل' },
  { id: 's4', emoji: '🌴', label: 'Palm', labelAr: 'نخلة' },
  { id: 's5', emoji: '🗺️', label: 'Map', labelAr: 'خريطة' },
  { id: 's6', emoji: '📸', label: 'Camera', labelAr: 'كاميرا' },
  { id: 's7', emoji: '🌅', label: 'Sunset', labelAr: 'غروب' },
  { id: 's8', emoji: '⛺', label: 'Camp', labelAr: 'مخيم' },
  { id: 's9', emoji: '🚢', label: 'Ship', labelAr: 'سفينة' },
  { id: 's10', emoji: '🧭', label: 'Compass', labelAr: 'بوصلة' },
  { id: 's11', emoji: '🎒', label: 'Backpack', labelAr: 'حقيبة' },
  { id: 's12', emoji: '🏝️', label: 'Island', labelAr: 'جزيرة' },
  { id: 's13', emoji: '🌊', label: 'Wave', labelAr: 'موجة' },
  { id: 's14', emoji: '🎭', label: 'Culture', labelAr: 'ثقافة' },
  { id: 's15', emoji: '🍽️', label: 'Food', labelAr: 'طعام' },
  { id: 's16', emoji: '❤️', label: 'Love', labelAr: 'حب' },
];

const PHOTO_FRAMES: FrameItem[] = [
  { id: 'f0', label: 'None', labelAr: 'بدون', borderStyle: 'none' },
  { id: 'f1', label: 'Polaroid', labelAr: 'بولارويد', borderStyle: 'polaroid' },
  { id: 'f2', label: 'Vintage', labelAr: 'كلاسيكي', borderStyle: 'vintage' },
  { id: 'f3', label: 'Travel', labelAr: 'سفر', borderStyle: 'travel' },
  { id: 'f4', label: 'Stamp', labelAr: 'طابع', borderStyle: 'stamp' },
  { id: 'f5', label: 'Golden', labelAr: 'ذهبي', borderStyle: 'golden' },
];

export interface PlacedSticker {
  id: string;
  stickerId: string;
  emoji: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface ARStickersProps {
  onStickersChange: (stickers: PlacedSticker[]) => void;
  onFrameChange: (frameId: string) => void;
  activeFrame: string;
  placedStickers: PlacedSticker[];
}

export const ARStickers: React.FC<ARStickersProps> = ({ onStickersChange, onFrameChange, activeFrame, placedStickers }) => {
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [showPanel, setShowPanel] = useState(false);
  const [tab, setTab] = useState<'stickers' | 'frames'>('stickers');

  const addSticker = (sticker: StickerItem) => {
    const newSticker: PlacedSticker = {
      id: `placed-${Date.now()}`,
      stickerId: sticker.id,
      emoji: sticker.emoji,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
    };
    onStickersChange([...placedStickers, newSticker]);
  };

  const removeSticker = (id: string) => {
    onStickersChange(placedStickers.filter(s => s.id !== id));
  };

  return (
    <>
      <button onClick={() => setShowPanel(!showPanel)}
        className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors">
        <Sticker size={18} />
      </button>
      <AnimatePresence>
        {showPanel && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-36 left-3 right-3 z-40 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex border-b border-white/10">
              <button onClick={() => setTab('stickers')}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'stickers' ? 'text-white bg-white/10' : 'text-white/50'}`}>
                {isArabic ? '😊 ملصقات' : '😊 Stickers'}
              </button>
              <button onClick={() => setTab('frames')}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'frames' ? 'text-white bg-white/10' : 'text-white/50'}`}>
                {isArabic ? '🖼️ إطارات' : '🖼️ Frames'}
              </button>
            </div>
            <div className="p-3 max-h-40 overflow-y-auto">
              {tab === 'stickers' ? (
                <div className="grid grid-cols-8 gap-1.5">
                  {TRAVEL_STICKERS.map(s => (
                    <button key={s.id} onClick={() => addSticker(s)}
                      className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center text-lg transition-all hover:scale-110 active:scale-90"
                      title={isArabic ? s.labelAr : s.label}>
                      {s.emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {PHOTO_FRAMES.map(f => (
                    <button key={f.id} onClick={() => onFrameChange(f.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        activeFrame === f.id ? 'bg-accent text-accent-foreground shadow-lg' : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}>
                      {isArabic ? f.labelAr : f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {placedStickers.length > 0 && (
              <div className="px-3 pb-2 flex gap-1 flex-wrap">
                {placedStickers.map(ps => (
                  <button key={ps.id} onClick={() => removeSticker(ps.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 text-white/80 text-xs hover:bg-red-500/40 transition-colors">
                    {ps.emoji} <X size={10} />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// Draggable item component with touch support for drag, pinch-zoom, and rotate
const DraggableItem: React.FC<{
  x: number; y: number; scale: number; rotation: number;
  onUpdate: (x: number, y: number, scale: number, rotation: number) => void;
  onDoubleTap?: () => void;
  children: React.ReactNode;
}> = ({ x, y, scale, rotation, onUpdate, onDoubleTap, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; itemX: number; itemY: number } | null>(null);
  const pinchState = useRef<{ dist: number; angle: number; startScale: number; startRotation: number } | null>(null);
  const lastTap = useRef(0);

  const getParentRect = () => ref.current?.parentElement?.getBoundingClientRect();

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragState.current = { startX: t.clientX, startY: t.clientY, itemX: x, itemY: y };
      // Double-tap detection
      const now = Date.now();
      if (now - lastTap.current < 300) onDoubleTap?.();
      lastTap.current = now;
    } else if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * (180 / Math.PI);
      pinchState.current = { dist, angle, startScale: scale, startRotation: rotation };
    }
  }, [x, y, scale, rotation, onDoubleTap]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = getParentRect();
    if (!rect) return;

    if (e.touches.length === 1 && dragState.current) {
      const t = e.touches[0];
      const dx = ((t.clientX - dragState.current.startX) / rect.width) * 100;
      const dy = ((t.clientY - dragState.current.startY) / rect.height) * 100;
      const nx = Math.max(0, Math.min(100, dragState.current.itemX + dx));
      const ny = Math.max(0, Math.min(100, dragState.current.itemY + dy));
      onUpdate(nx, ny, scale, rotation);
    } else if (e.touches.length === 2 && pinchState.current) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * (180 / Math.PI);
      const newScale = Math.max(0.3, Math.min(4, pinchState.current.startScale * (dist / pinchState.current.dist)));
      const newRotation = pinchState.current.startRotation + (angle - pinchState.current.angle);
      onUpdate(x, y, newScale, newRotation);
    }
  }, [x, y, scale, rotation, onUpdate]);

  const handleTouchEnd = useCallback(() => {
    dragState.current = null;
    pinchState.current = null;
  }, []);

  // Mouse drag for desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = getParentRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const itemX = x;
    const itemY = y;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      onUpdate(
        Math.max(0, Math.min(100, itemX + dx)),
        Math.max(0, Math.min(100, itemY + dy)),
        scale, rotation
      );
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [x, y, scale, rotation, onUpdate]);

  return (
    <div ref={ref}
      className="absolute cursor-grab active:cursor-grabbing touch-none select-none"
      style={{
        left: `${x}%`, top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        zIndex: 20,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
    >
      {children}
    </div>
  );
};

// Overlay component to render stickers and frames on top of the camera/image
export const StickerOverlay: React.FC<{
  stickers: PlacedSticker[];
  frameId: string;
  onStickerUpdate?: (id: string, x: number, y: number, scale: number, rotation: number) => void;
  onStickerRemove?: (id: string) => void;
  interactive?: boolean;
}> = ({ stickers, frameId, onStickerUpdate, onStickerRemove, interactive = true }) => {
  const frameStyles: Record<string, React.CSSProperties> = {
    none: {},
    polaroid: { border: '12px solid white', borderBottom: '48px solid white', borderRadius: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' },
    vintage: { border: '8px solid #d4a574', borderRadius: '8px', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.2), 0 4px 20px rgba(0,0,0,0.3)' },
    travel: { border: '6px dashed rgba(255,255,255,0.4)', borderRadius: '16px' },
    stamp: { border: '3px solid white', borderRadius: '0', outline: '3px dashed white', outlineOffset: '4px' },
    golden: { border: '6px solid #d4af37', borderRadius: '12px', boxShadow: '0 0 20px rgba(212,175,55,0.3), inset 0 0 20px rgba(212,175,55,0.1)' },
  };

  return (
    <div className="absolute inset-0 z-10" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      {frameId !== 'f0' && frameId !== 'none' && (
        <div className="absolute inset-2 pointer-events-none" style={frameStyles[PHOTO_FRAMES.find(f => f.id === frameId)?.borderStyle || 'none']} />
      )}
      {stickers.map(s => (
        interactive && onStickerUpdate ? (
          <DraggableItem key={s.id} x={s.x} y={s.y} scale={s.scale} rotation={s.rotation}
            onUpdate={(nx, ny, ns, nr) => onStickerUpdate(s.id, nx, ny, ns, nr)}
            onDoubleTap={() => onStickerRemove?.(s.id)}>
            <span className="text-4xl drop-shadow-lg select-none">{s.emoji}</span>
          </DraggableItem>
        ) : (
          <div key={s.id} className="absolute text-4xl drop-shadow-lg pointer-events-none"
            style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -50%) scale(${s.scale}) rotate(${s.rotation}deg)` }}>
            {s.emoji}
          </div>
        )
      ))}
    </div>
  );
};

// Draggable text overlay component
export const DraggableTextOverlay: React.FC<{
  id: string; text: string; x: number; y: number; color: string; fontSize: number; bold: boolean;
  onUpdate: (id: string, x: number, y: number) => void;
  onRemove?: (id: string) => void;
}> = ({ id, text, x, y, color, fontSize, bold, onUpdate, onRemove }) => {
  return (
    <DraggableItem x={x} y={y} scale={1} rotation={0}
      onUpdate={(nx, ny) => onUpdate(id, nx, ny)}
      onDoubleTap={() => onRemove?.(id)}>
      <span className="select-none whitespace-nowrap"
        style={{ color, fontSize: `${fontSize}px`, fontWeight: bold ? 'bold' : 'normal', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
        {text}
      </span>
    </DraggableItem>
  );
};
