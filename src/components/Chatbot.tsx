import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Send, Loader2, X, Maximize2, Minimize2, Phone, Bot, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useVoiceCall } from "@/hooks/useVoiceCall";
import VoiceCallOverlay from "./VoiceCallOverlay";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { getLocalizedCopy } from "@/lib/localizedMessages";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Chatbot = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { 
    maxActivitiesPerDay, 
    planName, 
    remainingActivities, 
    hasPlan,
    chatEnabled,
    voiceEnabled,
    maxChatUses,
    maxVoiceUses,
    usedChatCount,
    usedVoiceCount,
  } = useSubscriptionLimits();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showPricingPrompt, setShowPricingPrompt] = useState(false);
  const [isBtnMinimized, setIsBtnMinimized] = useState(true);
  const isAr = i18n.language?.startsWith("ar");
  const localized = useMemo(() => getLocalizedCopy(i18n.language), [i18n.language]);

  // Corner-snap draggable button: 4 corners only
  type Corner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  const FLOATING_MARGIN = 16;
  const TOP_OFFSET = 88;
  const DRAG_THRESHOLD = 14;

  const [btnCorner, setBtnCorner] = useState<Corner>(() => {
    return (localStorage.getItem('chatbot-btn-corner') as Corner) || 'bottom-right';
  });
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ignoreNextClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const getCornerPoint = useCallback((corner: Corner, width: number, height: number) => {
    const maxX = Math.max(FLOATING_MARGIN, window.innerWidth - width - FLOATING_MARGIN);
    const maxY = Math.max(TOP_OFFSET, window.innerHeight - height - FLOATING_MARGIN);

    return {
      x: corner.endsWith('left') ? FLOATING_MARGIN : maxX,
      y: corner.startsWith('top') ? TOP_OFFSET : maxY,
    };
  }, []);

  const currentButtonPoint = useMemo(() => {
    const width = isBtnMinimized ? 48 : 220;
    const height = isBtnMinimized ? 48 : 56;
    return getCornerPoint(btnCorner, width, height);
  }, [btnCorner, getCornerPoint, isBtnMinimized]);

  const resolveCornerFromPoint = useCallback((clientX: number, clientY: number): Corner => {
    const isLeft = clientX < window.innerWidth / 2;
    const isTop = clientY < window.innerHeight / 2;
    return isTop
      ? (isLeft ? 'top-left' : 'top-right')
      : (isLeft ? 'bottom-left' : 'bottom-right');
  }, []);

  const finishDrag = useCallback((clientX: number, clientY: number) => {
    const activeDrag = dragRef.current;
    if (!activeDrag) return false;

    const wasDrag = activeDrag.moved;
    dragRef.current = null;
    setDragPosition(null);

    if (wasDrag) {
      const nextCorner = resolveCornerFromPoint(clientX, clientY);
      setBtnCorner(nextCorner);
      localStorage.setItem('chatbot-btn-corner', nextCorner);
      ignoreNextClickRef.current = true;
      window.setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 220);
    }

    return wasDrag;
  }, [resolveCornerFromPoint]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const activeDrag = dragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;

      const dx = event.clientX - activeDrag.startX;
      const dy = event.clientY - activeDrag.startY;
      const moved = Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD;
      if (moved && !activeDrag.moved) activeDrag.moved = true;
      if (!activeDrag.moved) return;

      const button = buttonRef.current;
      const width = button?.offsetWidth || (isBtnMinimized ? 48 : 220);
      const height = button?.offsetHeight || (isBtnMinimized ? 48 : 56);
      const nextX = Math.min(Math.max(FLOATING_MARGIN, event.clientX - activeDrag.offsetX), Math.max(FLOATING_MARGIN, window.innerWidth - width - FLOATING_MARGIN));
      const nextY = Math.min(Math.max(TOP_OFFSET, event.clientY - activeDrag.offsetY), Math.max(TOP_OFFSET, window.innerHeight - height - FLOATING_MARGIN));

      setDragPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const activeDrag = dragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      finishDrag(event.clientX, event.clientY);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [finishDrag, isBtnMinimized]);

  const checkUsageLimit = async (feature: 'chat' | 'voice' = 'chat'): Promise<boolean> => {
    try {
      const { data: settings } = await supabase
        .from("site_settings")
        .select("guest_chat_enabled, guest_voice_enabled, guest_max_chat_uses, guest_max_voice_uses")
        .eq("id", "default")
        .single();
      if (!settings) return true;
      const s = settings as any;
      const lockedMessage = feature === 'chat' ? localized.chatLocked : localized.voiceLocked;

      if (!user) {
        if (feature === 'chat' && !s.guest_chat_enabled) {
          toast.error(lockedMessage, {
            action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
          });
          return false;
        }
        if (feature === 'voice' && !s.guest_voice_enabled) {
          toast.error(lockedMessage, {
            action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
          });
          return false;
        }
        const guestId = localStorage.getItem('guest_id') || 'guest';
        const today = new Date().toISOString().split('T')[0];
        const maxUses = feature === 'chat' ? (s.guest_max_chat_uses || 0) : (s.guest_max_voice_uses || 0);
        if (maxUses > 0) {
          const { count } = await supabase.from("usage_tracking").select("*", { count: "exact", head: true }).eq("guest_id", guestId).eq("feature", feature).gte("used_at", today);
          if ((count || 0) >= maxUses) {
            toast.error(localized.featureLockedDescription, {
              action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
            });
            return false;
          }
        }
      } else {
        // Logged in user: Check subscription limits
        if (hasPlan) {
          if (remainingActivities !== null && remainingActivities <= 0) {
            toast.error(isAr 
              ? "لقد استنفدت جميع الرصيد المتاح في باقتك." 
              : "AI limit reached for your plan.",
              { action: { label: isAr ? 'ترقية' : 'Upgrade', onClick: () => navigate('/pricing') } }
            );
            return false;
          }
        }
      }
      return true;
    } catch { return true; }
  };

  // Check if chat/voice should show paywall
  const chatBlocked = user ? ((hasPlan && !chatEnabled) || !hasPlan) : false;
  const voiceBlocked = user ? ((hasPlan && !voiceEnabled) || !hasPlan) : false;
  const chatLimitReached = maxChatUses > 0 && usedChatCount >= maxChatUses;
  const voiceLimitReached = maxVoiceUses > 0 && usedVoiceCount >= maxVoiceUses;

  // Guest access check - uses dedicated guest_chat_enabled / guest_voice_enabled flags
  const [guestSettings, setGuestSettings] = useState<{ chatAllowed: boolean; voiceAllowed: boolean; maxChat: number; maxVoice: number } | null>(null);
  useEffect(() => {
    if (!user) {
      supabase.from("site_settings").select("guest_chat_enabled, guest_voice_enabled, guest_max_chat_uses, guest_max_voice_uses").eq("id", "default").single().then(({ data }) => {
        const d = data as any;
        setGuestSettings({
          chatAllowed: d?.guest_chat_enabled === true,
          voiceAllowed: d?.guest_voice_enabled === true,
          maxChat: d?.guest_max_chat_uses || 0,
          maxVoice: d?.guest_max_voice_uses || 0,
        });
      });
    }
  }, [user]);
  const guestChatBlocked = !user && guestSettings !== null && !guestSettings.chatAllowed;
  const guestVoiceBlocked = !user && guestSettings !== null && !guestSettings.voiceAllowed;

  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "assistant", content: t('chatbot.welcomeMessage') }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const voiceRuntimeRef = useRef<{
    isActive: boolean;
    setStatus: (status: any) => void;
    speakResponse: (text: string) => Promise<void>;
    startListening: () => void;
  }>({
    isActive: false,
    setStatus: () => undefined,
    speakResponse: async () => undefined,
    startListening: () => undefined,
  });

  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.role !== 'assistant') return prev;
      return [{ role: 'assistant', content: t('chatbot.welcomeMessage') }];
    });
  }, [i18n.language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  const streamChat = useCallback(async (updatedMessages: Message[]) => {
    setIsLoading(true);
    if (voiceRuntimeRef.current.isActive) voiceRuntimeRef.current.setStatus('thinking');

    let assistantContent = "";
    let streamBuffer = "";

    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { messages: updatedMessages, language: i18n.language || 'en', maxActivitiesPerDay, planName },
        // @ts-ignore
        stream: true,
      });

      if (error) throw error;

      let stream: ReadableStream | null = null;
      let nonStreamData: any = null;

      if (data instanceof ReadableStream || (data && typeof data.getReader === 'function')) {
        stream = data as ReadableStream;
      } else if (data instanceof Response) {
        if (data.body instanceof ReadableStream) {
          stream = data.body;
        } else {
          nonStreamData = await data.json().catch(() => null);
        }
      } else {
        nonStreamData = data;
      }

      if (stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        while (true) {
          try {
            const { done, value } = await reader.read();
            if (done) break;

            streamBuffer += decoder.decode(value, { stream: true });
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.replace('data: ', '').trim();
                if (jsonStr === '[DONE]') break;
                try {
                  const json = JSON.parse(jsonStr);
                  const content = json.choices?.[0]?.delta?.content || "";
                  if (content) assistantContent += content;
                } catch {}
              }
            }

            if (assistantContent) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant") {
                  return [...prev.slice(0, -1), { ...last, content: assistantContent }];
                }
                return prev;
              });
            }
          } catch (readError) {
            console.error("Stream read error:", readError);
            break;
          }
        }
      } else if (nonStreamData) {
        const text = nonStreamData.text || nonStreamData.content || nonStreamData.choices?.[0]?.message?.content || "";
        assistantContent = typeof text === 'string' ? text : "";
        if (assistantContent) {
          setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
        } else {
          throw new Error("AI response was empty");
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      toast.error(t("chatbot.sorryError", { defaultValue: "Sorry, I'm having trouble connecting right now." }));
    } finally {
      setIsLoading(false);

      // Voice mode: speak response, then hook auto-restarts listening
      if (voiceRuntimeRef.current.isActive && assistantContent) {
        await voiceRuntimeRef.current.speakResponse(assistantContent);
      } else if (voiceRuntimeRef.current.isActive) {
        voiceRuntimeRef.current.setStatus('listening');
        voiceRuntimeRef.current.startListening();
      }
    }
  }, [t, i18n.language, maxActivitiesPerDay, planName]);

  const handleSendMessage = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoadingRef.current) return;

    // Check limits before sending
    if (guestChatBlocked || chatBlocked || chatLimitReached) {
      setShowPricingPrompt(true);
      return;
    }
    const canSend = await checkUsageLimit('chat');
    if (!canSend) return;

    // Track chat usage
    if (user) {
      await supabase.from('usage_tracking').insert({ user_id: user.id, feature: 'chat', quantity: 1 });
    } else {
      const guestId = localStorage.getItem('guest_id') || 'guest';
      await supabase.from('usage_tracking').insert({ guest_id: guestId, feature: 'chat', quantity: 1 });
    }

    const userMessage = { role: "user" as const, content: input };
    setMessages(prev => {
      const updated = [...prev, userMessage];
      streamChat(updated);
      return updated;
    });
    setInput("");
  }, [input, streamChat, checkUsageLimit, chatBlocked, chatLimitReached, guestChatBlocked, user]);

  // ── Voice Call hook ──
  const voiceCall = useVoiceCall({
    language: i18n.language || 'auto',
    onTranscript: async (text) => {
      if (!text.trim()) return;
      
      const canSend = await checkUsageLimit('voice');
      if (!canSend) return;

      const userMessage = { role: "user" as const, content: text };
      setMessages((prev) => {
        const updated = [...prev, userMessage];
        streamChat(updated);
        return updated;
      });
    },
    onError: (err) => toast.error(err),
  });

  useEffect(() => {
    voiceRuntimeRef.current = {
      isActive: voiceCall.isActive,
      setStatus: voiceCall.setStatus,
      speakResponse: voiceCall.speakResponse,
      startListening: voiceCall.startListening,
    };
  }, [voiceCall.isActive, voiceCall.setStatus, voiceCall.speakResponse, voiceCall.startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { voiceCall.endCall(); };
  }, []);

  const handleOpenChat = () => {
    if (guestChatBlocked || chatBlocked || chatLimitReached) {
      setShowPricingPrompt(true);
      setIsOpen(true);
      setIsMinimized(false);
      return;
    }
    setShowPricingPrompt(false);
    setIsOpen(true);
    setIsMinimized(false);
  };

  const handleVoiceCall = async () => {
    if (guestVoiceBlocked || voiceBlocked || voiceLimitReached) {
      toast.error(voiceLimitReached ? localized.featureLockedDescription : localized.voiceLocked, {
        action: { label: localized.viewPlans, onClick: () => navigate('/pricing') },
      });
      return;
    }
    const canUse = await checkUsageLimit('voice');
    if (!canUse) return;
    // Track voice usage
    if (user) {
      await supabase.from('usage_tracking').insert({ user_id: user.id, feature: 'voice', quantity: 1 });
    } else {
      const guestId = localStorage.getItem('guest_id') || 'guest';
      await supabase.from('usage_tracking').insert({ guest_id: guestId, feature: 'voice', quantity: 1 });
    }
    voiceCall.startCall();
  };

  return (
    <>
      {/* Chat window */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`bg-card border border-border shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ${
                isMinimized ? "h-16 w-64" : "h-[600px] w-[400px]"
              }`}
            >
            {/* Header */}
            <div className="bg-primary p-4 flex items-center justify-between text-primary-foreground min-h-[64px]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Bot size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">{t('chatbot.title')}</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] opacity-80 uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setIsMinimized(!isMinimized)}>
                  {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10" onClick={() => setIsOpen(false)}>
                  <X size={18} />
                </Button>
              </div>
            </div>

            {!isMinimized && (
              <>
                {showPricingPrompt ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-muted/5">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Bot size={32} className="text-primary" />
                    </div>
                    <h3 className="font-bold text-lg text-foreground mb-2">
                      {localized.featureLockedTitle}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {chatLimitReached
                        ? localized.chatLimitReached
                        : localized.chatLocked
                      }
                    </p>
                    {maxChatUses > 0 && (
                      <p className="text-xs text-muted-foreground mb-4">
                        {isAr ? `الاستخدام: ${usedChatCount}/${maxChatUses}` : `Usage: ${usedChatCount}/${maxChatUses}`}
                      </p>
                    )}
                    <Button onClick={() => navigate('/pricing')} className="gap-2 rounded-xl">
                      🚀 {localized.viewPlans}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/5 scrollbar-hide">
                      {messages.map((msg, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[10px] ${
                              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border'
                            }`}>
                              {msg.role === 'user' ? 'YOU' : <Bot size={14} />}
                            </div>
                            <div className={`p-3 rounded-2xl text-sm ${
                              msg.role === 'user'
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-card border border-border rounded-tl-none shadow-sm'
                            }`}>
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{String(msg.content)}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="bg-card border border-border rounded-2xl rounded-tl-none p-3 shadow-sm flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground italic">Thinking...</span>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 bg-card border-t border-border">
                      <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={handleVoiceCall}
                          disabled={isLoading || voiceCall.isActive}
                          className="rounded-xl shrink-0 text-primary border-primary/20 hover:bg-primary/5 h-10 w-10"
                          title="Voice Call"
                        >
                          <Phone size={18} />
                        </Button>
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={t('chatbot.askDestination')}
                          className="rounded-xl h-10 bg-muted/50 border-border focus:ring-primary"
                          disabled={isLoading}
                        />
                        <Button
                          type="submit"
                          size="icon"
                          disabled={!input.trim() || isLoading}
                          className="rounded-xl shrink-0 h-10 w-10 shadow-lg shadow-primary/20"
                        >
                          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </Button>
                      </form>
                    </div>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Corner-snapping floating button with animation */}
      {!isOpen && (
        <motion.div
          className="fixed z-[9999] flex items-center gap-1 touch-none"
          animate={{
            x: dragPosition?.x ?? currentButtonPoint.x,
            y: dragPosition?.y ?? currentButtonPoint.y,
          }}
          transition={dragPosition ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
          style={{ top: 0, left: 0 }}
        >
          {!isBtnMinimized && (
            <motion.button
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => { e.stopPropagation(); setIsBtnMinimized(true); }}
              className="rounded-full w-7 h-7 flex items-center justify-center bg-muted/80 text-muted-foreground hover:bg-muted shadow-md border border-border"
              title={isAr ? 'تصغير' : 'Minimize'}
            >
              <Minus size={14} />
            </motion.button>
          )}
          <motion.button
            ref={buttonRef}
            whileTap={{ scale: 0.97 }}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') e.preventDefault();
              const button = buttonRef.current;
              const rect = button?.getBoundingClientRect();
              dragRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                offsetX: rect ? e.clientX - rect.left : 24,
                offsetY: rect ? e.clientY - rect.top : 24,
                moved: false,
              };
              button?.setPointerCapture(e.pointerId);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (ignoreNextClickRef.current || dragRef.current?.moved) return;
              if (isBtnMinimized) setIsBtnMinimized(false);
              else handleOpenChat();
            }}
            className={`rounded-full shadow-xl flex items-center font-bold bg-primary text-primary-foreground cursor-grab active:cursor-grabbing touch-none select-none ${
              isBtnMinimized ? 'w-12 h-12 justify-center' : 'h-14 px-5 gap-3'
            }`}
            style={{ willChange: 'transform' }}
          >
            <div className="relative">
              <MessageSquare size={isBtnMinimized ? 20 : 22} />
              <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-emerald-500" />
            </div>
            {!isBtnMinimized && <span className="text-sm">{t('chatbot.askButton', { defaultValue: 'Ask Aseel AI' })}</span>}
          </motion.button>
        </motion.div>
      )}

      <VoiceCallOverlay
        isOpen={voiceCall.isActive}
        onClose={() => voiceCall.endCall()}
        status={voiceCall.status}
        messages={messages}
        interimText={voiceCall.interimText}
        isMuted={voiceCall.isMuted}
        onToggleMute={() => voiceCall.toggleMute()}
        retryError={voiceCall.retryError}
        onRetry={() => voiceCall.retryListening()}
        signalLevel={voiceCall.signalLevel}
        onStopListening={() => voiceCall.stopListeningManual()}
        onStopSpeaking={() => voiceCall.stopSpeakingHard()}
        selectedVoice={voiceCall.selectedVoice}
        onChangeVoice={(v) => voiceCall.changeVoice(v)}
      />

    </>
  );
};

export default Chatbot;
