import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhoneOff, Mic, MicOff, Volume2, Bot, Sparkles, Square, Clock, Settings2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CallStatus } from '@/hooks/useVoiceCall';
import { VOICE_OPTIONS } from '@/hooks/useVoiceCall';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceCallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  status: CallStatus;
  messages?: Message[];
  interimText?: string;
  isMuted?: boolean;
  onToggleMute?: () => void;
  retryError?: string | null;
  onRetry?: () => void;
  signalLevel?: number;
  onStopListening?: () => void;
  onStopSpeaking?: () => void;
  selectedVoice?: string;
  onChangeVoice?: (voiceId: string) => void;
}

const VoiceCallOverlay = ({ 
  isOpen,
  onClose,
  status,
  messages = [],
  interimText = "",
  isMuted = false,
  onToggleMute,
  retryError = null,
  onRetry,
  signalLevel = 0,
  onStopListening,
  onStopSpeaking,
  selectedVoice = 'nova',
  onChangeVoice,
}: VoiceCallOverlayProps) => {
  const [callSeconds, setCallSeconds] = useState(0);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isOpen) {
      setCallSeconds(0);
      timerRef.current = setInterval(() => setCallSeconds(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isOpen]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const { i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isArabic = i18n.language?.startsWith('ar') || messages.some(m => /[\u0600-\u06FF]/.test(m.content));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimText]);

  if (!isOpen) return null;

  const getStatusText = () => {
    switch (status) {
      case 'listening': return isArabic ? 'يستمع... تحدث الآن' : 'Listening... speak now';
      case 'thinking': return isArabic ? 'يفكر...' : 'Thinking...';
      case 'speaking': return isArabic ? 'يتحدث...' : 'Speaking...';
      case 'error': return isArabic ? 'بانتظار إعادة المحاولة' : 'Waiting for retry';
      default: return isArabic ? 'متصل' : 'Connected';
    }
  };

  const getOrbColors = () => {
    switch (status) {
      case 'listening': return { bg: 'from-blue-500 via-indigo-500 to-violet-600', glow: 'rgba(99, 102, 241, 0.5)' };
      case 'thinking': return { bg: 'from-amber-400 via-orange-500 to-rose-500', glow: 'rgba(251, 146, 60, 0.5)' };
      case 'speaking': return { bg: 'from-emerald-400 via-teal-500 to-cyan-500', glow: 'rgba(20, 184, 166, 0.5)' };
      case 'error': return { bg: 'from-rose-500 via-red-500 to-orange-500', glow: 'rgba(244, 63, 94, 0.45)' };
      default: return { bg: 'from-slate-400 via-slate-500 to-slate-600', glow: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const colors = getOrbColors();
  const voiceMessages = messages.filter(m => m.content.trim().length > 0).slice(-6);

  const currentVoiceLabel = VOICE_OPTIONS.find(v => v.id === selectedVoice);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
          style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0f2e 40%, #0a0a1a 100%)' }}
        >
          {/* Ambient gradient blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={{ x: [0, 30, -20, 0], y: [0, -20, 15, 0], scale: [1, 1.1, 0.95, 1] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
              className={`absolute -top-[20%] -left-[20%] w-[70%] h-[70%] rounded-full blur-[100px] opacity-15 bg-gradient-to-br ${colors.bg}`}
            />
            <motion.div
              animate={{ x: [0, -25, 15, 0], y: [0, 20, -10, 0], scale: [1, 0.95, 1.05, 1] }}
              transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
              className={`absolute -bottom-[20%] -right-[20%] w-[60%] h-[60%] rounded-full blur-[100px] opacity-10 bg-gradient-to-br ${colors.bg}`}
            />
          </div>

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-3 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-center">
                <Bot size={18} className="text-white/70" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-base tracking-tight">Aseel AI</h2>
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`w-1.5 h-1.5 rounded-full ${
                      status === 'listening' ? 'bg-blue-400' :
                      status === 'thinking' ? 'bg-amber-400' :
                      status === 'speaking' ? 'bg-emerald-400' :
                      status === 'error' ? 'bg-rose-400' : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-[11px] text-white/40 uppercase tracking-[0.15em] font-medium">
                    {getStatusText()}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Voice selector */}
              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                  className="h-8 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 px-3 text-white/60 hover:text-white hover:bg-white/10 gap-1.5"
                >
                  <Settings2 size={12} />
                  <span className="text-[10px]">{currentVoiceLabel ? (isArabic ? currentVoiceLabel.labelAr.split(' ')[0] : currentVoiceLabel.label.split(' ')[0]) : 'Voice'}</span>
                  <ChevronDown size={10} />
                </Button>
                <AnimatePresence>
                  {showVoiceMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute right-0 top-10 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-2 min-w-[180px] z-50"
                    >
                      <p className="text-[10px] text-white/40 uppercase tracking-wider px-2 pb-1 font-medium">
                        {isArabic ? 'اختر الصوت' : 'Select Voice'}
                      </p>
                      {VOICE_OPTIONS.map(v => (
                        <button
                          key={v.id}
                          onClick={() => { onChangeVoice?.(v.id); setShowVoiceMenu(false); }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                            selectedVoice === v.id
                              ? 'bg-primary/20 text-white'
                              : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {isArabic ? v.labelAr : v.label}
                          {selectedVoice === v.id && <span className="ml-2 text-primary">✓</span>}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-3 py-1.5">
                <Clock size={11} className="text-white/50" />
                <span className="text-[11px] text-white/70 font-mono tabular-nums">{formatTime(callSeconds)}</span>
              </div>
            </div>
          </div>

          {/* Central Orb */}
          <div className="relative z-10 flex-shrink-0 flex flex-col items-center justify-center py-6">
            <div className="relative">
              <motion.div
                animate={{
                  scale: status === 'speaking' ? [1.3, 1.6, 1.3] : status === 'listening' ? [1.2, 1.4, 1.2] : [1.1, 1.2, 1.1],
                  opacity: [0.15, 0.3, 0.15],
                }}
                transition={{ duration: status === 'speaking' ? 1.2 : 3, repeat: Infinity, ease: "easeInOut" }}
                className={`absolute inset-0 rounded-full blur-[50px] bg-gradient-to-br ${colors.bg}`}
                style={{ margin: '-30%' }}
              />
              <motion.div
                animate={{
                  scale: status === 'speaking' ? [1, 1.06, 0.98, 1.04, 1] : status === 'listening' ? [1, 1.02, 0.99, 1.01, 1] : 1,
                }}
                transition={{ scale: { duration: status === 'speaking' ? 0.8 : 2, repeat: Infinity, ease: "easeInOut" } }}
                style={{ boxShadow: `0 0 60px ${colors.glow}, 0 0 120px ${colors.glow.replace('0.5', '0.2')}` }}
                className={`w-32 h-32 md:w-44 md:h-44 rounded-full bg-gradient-to-tr ${colors.bg} relative overflow-hidden`}
              >
                <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.5\'/%3E%3C/svg%3E")',
                }} />
                <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent" />

                {status === 'thinking' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                      className="w-12 h-12 border-t-2 border-r-2 border-white/40 rounded-full" />
                  </div>
                )}
                {status === 'listening' && (
                  <div className="absolute inset-0 flex items-center justify-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <motion.div key={i} className="w-1 bg-white/50 rounded-full"
                        animate={{ height: [8, 20 + Math.random() * 16, 8] }}
                        transition={{ duration: 0.6 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }} />
                    ))}
                  </div>
                )}
                {status === 'speaking' && (
                  <div className="absolute inset-0 flex items-center justify-center gap-[3px]">
                    {[...Array(7)].map((_, i) => (
                      <motion.div key={i} className="w-[3px] bg-white/60 rounded-full"
                        animate={{ height: [4, 28 + Math.random() * 20, 4] }}
                        transition={{ duration: 0.4 + Math.random() * 0.3, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }} />
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* Transcript Area */}
          <div className="relative z-10 flex-1 w-full max-w-xl mx-auto px-4 overflow-hidden flex flex-col">
            <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[#0a0a1a] to-transparent z-10 pointer-events-none" />
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 py-3 scrollbar-hide">
              {voiceMessages.map((msg, i) => (
                <motion.div
                  key={`voice-msg-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-500/20 border border-blue-500/30 text-blue-100 rounded-br-sm'
                      : 'bg-white/[0.06] border border-white/10 text-white/80 rounded-bl-sm'
                  }`}>
                    {msg.role === 'user' ? (
                      <span>🎤 {msg.content}</span>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-none [&>p]:mb-1 [&>ul]:mb-1">
                        <ReactMarkdown>{String(msg.content).substring(0, 300)}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {interimText && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex justify-end"
                >
                  <div className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-br-sm">
                    🎤 {interimText}...
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Control Bar */}
          <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-8 pt-4">
            {retryError && (
              <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-center">
                <p className="text-sm text-rose-100 mb-2">{retryError}</p>
                <Button
                  onClick={onRetry}
                  size="sm"
                  className="h-8 rounded-full bg-white/15 hover:bg-white/20 text-white border border-white/20"
                >
                  {isArabic ? 'إعادة المحاولة الآن' : 'Retry now'}
                </Button>
              </div>
            )}
            <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-full p-3 flex items-center justify-between shadow-2xl">
              <Button
                size="icon" variant="ghost" onClick={onToggleMute}
                className={`rounded-full h-11 w-11 transition-all duration-300 ${
                  isMuted
                  ? 'bg-red-500/90 text-white hover:bg-red-600 shadow-lg shadow-red-500/20'
                  : 'bg-white/[0.06] hover:bg-white/10 text-white/60 hover:text-white border border-white/[0.06]'
                }`}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </Button>

              <div className="flex items-center gap-2">
                {(status === 'listening' || status === 'speaking' || status === 'thinking') && (onStopSpeaking || onStopListening) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (onStopSpeaking) onStopSpeaking();
                      else onStopListening?.();
                      toast.success(isArabic ? 'تم إيقاف الصوت 🔇' : 'Stopped speaking 🔇', {
                        description: isArabic ? 'تم إيقاف التحدث والاستماع. اضغط الميكروفون لاستئناف.' : 'TTS and mic halted. Tap the mic to resume.',
                      });
                    }}
                    className="rounded-full h-11 w-11 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 border border-indigo-500/20"
                    title={isArabic ? 'إيقاف الصوت' : 'Stop speaking'}
                  >
                    <Square size={16} />
                  </Button>
                )}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <Volume2 size={12} className="text-white/30" />
                    <div className="h-1 w-16 bg-white/[0.08] rounded-full overflow-hidden">
                      <motion.div
                        animate={{
                          width: status === 'speaking'
                            ? ['50%', '85%', '60%', '90%', '50%']
                            : status === 'listening'
                            ? `${Math.max(10, signalLevel)}%`
                            : '40%'
                        }}
                        transition={{ duration: status === 'speaking' ? 0.8 : 0.3, repeat: status === 'speaking' ? Infinity : 0 }}
                        className={`h-full rounded-full ${
                          status === 'speaking'
                            ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                            : signalLevel > 60
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : signalLevel > 25
                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                            : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={onClose}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full px-5 h-11 flex items-center gap-2 font-semibold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-500/20"
              >
                <PhoneOff size={16} />
                <span>{isArabic ? 'إنهاء' : 'End'}</span>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VoiceCallOverlay;
