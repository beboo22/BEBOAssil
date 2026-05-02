import { useRef, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { transcribeAudioBlob, getSpeechLang } from '@/lib/voice';

export type CallStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export type VoiceOption = {
  id: string;
  label: string;
  labelAr: string;
};

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'alloy', label: 'Alloy (Balanced)', labelAr: 'أللوي (متوازن)' },
  { id: 'nova', label: 'Nova (Warm)', labelAr: 'نوفا (دافئ)' },
  { id: 'echo', label: 'Echo (Deep)', labelAr: 'إيكو (عميق)' },
  { id: 'fable', label: 'Fable (Expressive)', labelAr: 'فابل (معبّر)' },
  { id: 'onyx', label: 'Onyx (Rich)', labelAr: 'أونيكس (غني)' },
  { id: 'shimmer', label: 'Shimmer (Clear)', labelAr: 'شيمر (واضح)' },
];

interface UseVoiceCallOptions {
  onTranscript: (text: string) => void;
  language?: string;
  onError?: (error: string) => void;
  silenceTimeout?: number;
}

export function useVoiceCall({
  onTranscript,
  language = 'en',
  onError,
  silenceTimeout = 3000,
}: UseVoiceCallOptions) {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [retryError, setRetryError] = useState<string | null>(null);
  const [signalLevel, setSignalLevel] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<string>(() => {
    try { return localStorage.getItem('aseel_voice') || 'nova'; } catch { return 'nova'; }
  });

  const isActiveRef = useRef(false);
  const isMutedRef = useRef(false);
  const statusRef = useRef<CallStatus>('idle');
  const retryErrorRef = useRef<string | null>(null);
  const selectedVoiceRef = useRef(selectedVoice);
  
  // STT Refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const webSpeechSupported = useRef<boolean | null>(null);
  const autoRetryCountRef = useRef(0);
  
  // TTS Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set to true whenever the user interrupts/ends a call so any in-flight
  // speakResponse() exits without auto-restarting the listener.
  const speechInterruptedRef = useRef(false);
  // Resolver for the currently-playing TTS Promise — calling it short-circuits the await.
  const speakResolverRef = useRef<(() => void) | null>(null);

  
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const changeVoice = useCallback((voiceId: string) => {
    setSelectedVoice(voiceId);
    selectedVoiceRef.current = voiceId;
    try { localStorage.setItem('aseel_voice', voiceId); } catch {}
  }, []);

  const speechLang = getSpeechLang(language);
  const isArabicUi = language?.startsWith('ar');
  const uiText = {
    listening: isArabicUi ? 'جاري الاستماع...' : 'Listening...',
    processing: isArabicUi ? 'جاري معالجة الصوت...' : 'Processing voice...',
    micDenied: isArabicUi ? 'تم رفض إذن الميكروفون.' : 'Microphone access denied.',
    timeout: isArabicUi ? 'انتهت مهلة التعرف الصوتي. أعد المحاولة.' : 'Voice recognition timed out. Retry now.',
    noSpeech: isArabicUi ? 'لم يتم التقاط صوت واضح. أعد المحاولة.' : 'No clear speech detected. Retry now.',
    failed: isArabicUi ? 'تعذر التعرف على الصوت. أعد المحاولة.' : 'Speech recognition failed. Retry now.',
  };

  const updateStatus = useCallback((s: CallStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const clearRetryState = useCallback(() => {
    retryErrorRef.current = null;
    setRetryError(null);
    autoRetryCountRef.current = 0;
  }, []);

  const setRetryState = useCallback((message: string) => {
    // Auto-retry up to 3 times before showing error
    if (autoRetryCountRef.current < 3 && isActiveRef.current && !isMutedRef.current) {
      autoRetryCountRef.current++;
      setTimeout(() => {
        if (isActiveRef.current && !isMutedRef.current && statusRef.current !== 'speaking' && statusRef.current !== 'thinking') {
          startListeningInternal();
        }
      }, 500);
      return;
    }
    retryErrorRef.current = message;
    setRetryError(message);
    setInterimText('');
    updateStatus('idle');
    onErrorRef.current?.(message);
  }, [updateStatus]);

  // Internal reference for startListening (to avoid circular deps)
  const startListeningInternalRef = useRef<() => void>(() => {});

  const startListeningInternal = () => startListeningInternalRef.current();

  // ═══════════════════════════════════════
  //  STT: MediaRecorder (Whisper Fallback)
  // ═══════════════════════════════════════
  const startMediaRecorder = useCallback(async () => {
    if (!isActiveRef.current || isMutedRef.current) return;
    if (statusRef.current === 'speaking' || statusRef.current === 'thinking') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      streamRef.current = stream;
      chunksRef.current = [];

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let lastSpeakTime = Date.now();
      let hasStartedSpeaking = false;

      const monitorVolume = () => {
        if (statusRef.current !== 'listening') return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const average = sum / bufferLength;
        const THRESHOLD = 8;
        const level = Math.min(100, Math.round((average / 40) * 100));
        setSignalLevel(level);

        if (average > THRESHOLD) {
          hasStartedSpeaking = true;
          lastSpeakTime = Date.now();
          setInterimText(uiText.listening);
        } else if (hasStartedSpeaking) {
          if (Date.now() - lastSpeakTime > silenceTimeout) {
            stopListeningInternal();
            return;
          }
        }
        // Auto timeout after 15s even if no speech detected
        if (!hasStartedSpeaking && Date.now() - lastSpeakTime > 15000) {
          // No speech for 15s, auto restart
          stopListeningInternal();
          return;
        }
        requestAnimationFrame(monitorVolume);
      };

      requestAnimationFrame(monitorVolume);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
        }
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 800) {
          // No speech, auto restart listening
          if (isActiveRef.current && !isMutedRef.current) {
            setTimeout(() => {
              if (isActiveRef.current) startListeningInternal();
            }, 300);
          }
          return;
        }

        clearRetryState();
        updateStatus('thinking');
        setInterimText(uiText.processing);

        try {
          const text = await Promise.race<string>([
            transcribeAudioBlob(blob, language),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('STT_TIMEOUT')), 15000)
            ),
          ]);

          if (text.trim() && isActiveRef.current) {
            onTranscriptRef.current(text.trim());
          } else {
            // Auto restart instead of showing error
            if (isActiveRef.current && !isMutedRef.current) {
              setTimeout(() => {
                if (isActiveRef.current) startListeningInternal();
              }, 300);
            }
          }
        } catch (err: any) {
          console.error('Whisper STT error:', err);
          setRetryState(err instanceof Error && err.message === 'STT_TIMEOUT' ? uiText.timeout : uiText.failed);
        } finally {
          setInterimText('');
        }
      };

      recorder.start(250);
      updateStatus('listening');
    } catch (err: any) {
      console.error('MediaRecorder start failed:', err);
      onErrorRef.current?.(uiText.micDenied);
      setIsActive(false);
      isActiveRef.current = false;
      updateStatus('idle');
    }
  }, [language, silenceTimeout, updateStatus, uiText.listening, uiText.processing, uiText.timeout, uiText.noSpeech, uiText.failed, uiText.micDenied, clearRetryState, setRetryState]);

  // ═══════════════════════════════════════
  //  STT: Web Speech API
  // ═══════════════════════════════════════
  const startWebSpeech = useCallback((): boolean => {
    if (!isActiveRef.current || isMutedRef.current) return false;
    
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      webSpeechSupported.current = false;
      return false;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    const recognition = new SR();
    recognition.continuous = true; // Keep listening continuously
    recognition.interimResults = true;
    recognition.lang = speechLang;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let hasFired = false;
    let localSilenceTimer: ReturnType<typeof setTimeout> | null = null;

    const fireTranscript = () => {
      if (!hasFired && finalTranscript.trim()) {
        hasFired = true;
        setInterimText('');
        try { recognition.stop(); } catch {}
        clearRetryState();
        onTranscriptRef.current(finalTranscript.trim());
      }
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setInterimText(finalTranscript || interim);

      if (localSilenceTimer) clearTimeout(localSilenceTimer);
      if (finalTranscript.trim()) {
        localSilenceTimer = setTimeout(fireTranscript, silenceTimeout);
      }
    };

    recognition.onend = () => {
      if (localSilenceTimer) clearTimeout(localSilenceTimer);
      recognitionRef.current = null;

      if (!hasFired && finalTranscript.trim()) {
        fireTranscript();
      } else if (!hasFired && isActiveRef.current && !isMutedRef.current) {
        // Auto-restart on end without result
        setInterimText('');
        setTimeout(() => {
          if (isActiveRef.current && statusRef.current !== 'speaking' && statusRef.current !== 'thinking') {
            startListeningInternal();
          }
        }, 300);
      }
    };

    recognition.onerror = (e: any) => {
      recognitionRef.current = null;
      if (localSilenceTimer) clearTimeout(localSilenceTimer);
      
      if (e.error === 'not-allowed') {
        onErrorRef.current?.(uiText.micDenied);
        return;
      }

      if (e.error === 'no-speech') {
        // Auto restart on no-speech
        if (isActiveRef.current && !isMutedRef.current) {
          setTimeout(() => {
            if (isActiveRef.current) startListeningInternal();
          }, 300);
        }
        return;
      }

      // Fallback to MediaRecorder on network/aborted errors
      console.warn('Web Speech error, falling back to Whisper:', e.error);
      webSpeechSupported.current = false;
      if (isActiveRef.current) {
        setTimeout(startMediaRecorder, 100);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      updateStatus('listening');
      webSpeechSupported.current = true;
      return true;
    } catch (err) {
      webSpeechSupported.current = false;
      return false;
    }
  }, [speechLang, silenceTimeout, updateStatus, startMediaRecorder, uiText.micDenied, clearRetryState]);

  const startListening = useCallback(() => {
    if (!isActiveRef.current || isMutedRef.current) return;
    if (statusRef.current === 'speaking' || statusRef.current === 'thinking') return;
    clearRetryState();
    
    if (webSpeechSupported.current === false) {
      startMediaRecorder();
    } else {
      const ok = startWebSpeech();
      if (!ok) startMediaRecorder();
    }
  }, [startMediaRecorder, startWebSpeech, clearRetryState]);

  // Assign to ref for internal use
  startListeningInternalRef.current = startListening;

  const stopListeningInternal = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
  }, []);

  const stopListeningManual = useCallback(() => {
    stopListeningInternal();
  }, [stopListeningInternal]);

  // ═══════════════════════════════════════
  //  Hard stop: halt both TTS and STT, no auto-resume
  // ═══════════════════════════════════════
  // Defined later — forward declaration via ref so we can call it from interruptSpeech below.
  const hardStopRef = useRef<() => void>(() => {});

  // ═══════════════════════════════════════
  //  TTS — Speak AI Response
  // ═══════════════════════════════════════
  const speakResponse = useCallback(async (text: string): Promise<void> => {
    if (!isActiveRef.current) return;
    speechInterruptedRef.current = false;
    clearRetryState();

    const clean = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/[-*+]\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\{"id".*?\}/g, '')
      .replace(/data: /g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!clean || clean.length < 2) {
      if (isActiveRef.current && !isMutedRef.current && !speechInterruptedRef.current) {
        updateStatus('listening');
        startListening();
      }
      return;
    }

    const truncated = clean.length > 600 ? clean.substring(0, 600) + '...' : clean;

    updateStatus('speaking');
    stopListeningInternal();

    try {
      // Use user-selected voice, but prefer Arabic-suitable voices for Arabic
      const isArabic = /[\u0600-\u06FF]/.test(truncated);
      const voice = selectedVoiceRef.current || (isArabic ? 'nova' : 'alloy');

      const ttsResult = await Promise.race<Awaited<ReturnType<typeof supabase.functions.invoke>>>([
        supabase.functions.invoke('aiml-tts', {
          body: { text: truncated, voice },
        }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('TTS_TIMEOUT') } as Awaited<ReturnType<typeof supabase.functions.invoke>>), 12000)
        ),
      ]);

      // If the user interrupted while we were waiting on TTS, bail out.
      if (speechInterruptedRef.current || !isActiveRef.current) return;

      const { data, error } = ttsResult;
      const ttsData = (data as { audioContent?: string; contentType?: string } | null);

      if (error) throw error;

      if (ttsData?.audioContent) {
        const audioUrl = `data:${ttsData.contentType || 'audio/mpeg'};base64,${ttsData.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        await new Promise<void>((resolve) => {
          // Store resolver so interruptSpeech can short-circuit this await synchronously.
          speakResolverRef.current = () => {
            speakResolverRef.current = null;
            resolve();
          };
          audio.onended = () => { audioRef.current = null; speakResolverRef.current = null; resolve(); };
          audio.onerror = () => { audioRef.current = null; speakResolverRef.current = null; resolve(); };
          audio.onpause = () => {
            // Browsers fire pause on .pause(); use it as another interrupt path.
            if (speechInterruptedRef.current) {
              audioRef.current = null;
              speakResolverRef.current = null;
              resolve();
            }
          };
          audio.play().catch(() => {
            audioRef.current = null;
            speakResolverRef.current = null;
            fallbackBrowserSpeak(truncated).then(resolve);
          });
        });
      } else {
        await fallbackBrowserSpeak(truncated);
      }
    } catch (err) {
      console.warn('TTS error, falling back to browser speech:', err);
      if (!speechInterruptedRef.current && isActiveRef.current) {
        await fallbackBrowserSpeak(truncated);
      }
    }

    // Critical: only restart listening if the call is still active AND was not interrupted.
    if (isActiveRef.current && !isMutedRef.current && !speechInterruptedRef.current) {
      updateStatus('listening');
      startListening();
    }
  }, [startListening, stopListeningInternal, updateStatus, clearRetryState]);


  const fallbackBrowserSpeak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text.substring(0, 200));
      utt.lang = /[\u0600-\u06FF]/.test(text) ? 'ar-SA' : speechLang;
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    });
  }, [speechLang]);

  // ═══════════════════════════════════════
  //  Greeting Message
  // ═══════════════════════════════════════
  const speakGreeting = useCallback(async () => {
    const greetings: Record<string, string> = {
      ar: "مرحباً! أنا أسيل، مساعدك الشخصي للرحلات. كيف أقدر أساعدك اليوم؟",
      en: "Hello! I'm Aseel, your personal travel assistant. How can I help you today?",
      fr: "Bonjour ! Je suis Aseel, votre assistant voyage personnel. Comment puis-je vous aider ?",
      es: "¡Hola! Soy Aseel, tu asistente de viajes personal. ¿Cómo puedo ayudarte?",
      de: "Hallo! Ich bin Aseel, Ihr persönlicher Reiseassistent. Wie kann ich Ihnen helfen?",
      tr: "Merhaba! Ben Aseel, kişisel seyahat asistanınız. Size nasıl yardımcı olabilirim?",
    };
    const lang = (language || 'en').split('-')[0];
    const greeting = greetings[lang] || greetings.en;
    await speakResponse(greeting);
  }, [language, speakResponse]);

  // ═══════════════════════════════════════
  //  Call Controls
  // ═══════════════════════════════════════
  const interruptSpeech = useCallback(() => {
    speechInterruptedRef.current = true;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.src = '';
        audioRef.current.load();
      } catch {}
      audioRef.current = null;
    }
    try { window.speechSynthesis?.cancel(); } catch {}
    // Force-resolve any pending speak() await so the post-await branch can exit cleanly.
    try { speakResolverRef.current?.(); } catch {}
    speakResolverRef.current = null;
  }, []);

  // Public "Stop speaking" — halts TTS playback, stops the recorder, mutes the mic,
  // and crucially does NOT let speakResponse re-arm the listener afterwards.
  const stopSpeakingHard = useCallback(() => {
    speechInterruptedRef.current = true;
    interruptSpeech();
    stopListeningInternal();
    autoRetryCountRef.current = 99; // block any pending auto-retry
    // Force the mic into the "muted/idle" state so onend handlers stop trying to restart.
    isMutedRef.current = true;
    setIsMuted(true);
    updateStatus('idle');
    setInterimText('');
  }, [interruptSpeech, stopListeningInternal, updateStatus]);
  hardStopRef.current = stopSpeakingHard;

  const startCall = useCallback(async () => {
    setIsActive(true);
    isActiveRef.current = true;
    setIsMuted(false);
    isMutedRef.current = false;
    setInterimText('');
    clearRetryState();
    autoRetryCountRef.current = 0;
    updateStatus('speaking');
    
    // Speak greeting first, then start listening
    await speakGreeting();
  }, [speakGreeting, updateStatus, clearRetryState]);

  const endCall = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
    stopListeningInternal();
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    interruptSpeech();
    updateStatus('idle');
    setInterimText('');
    clearRetryState();
    setIsMuted(false);
    isMutedRef.current = false;
  }, [stopListeningInternal, interruptSpeech, updateStatus, clearRetryState]);

  const retryListening = useCallback(() => {
    if (!isActiveRef.current || isMutedRef.current) return;
    clearRetryState();
    autoRetryCountRef.current = 0;
    setInterimText('');
    updateStatus('listening');
    startListening();
  }, [clearRetryState, startListening, updateStatus]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMutedRef.current;
    isMutedRef.current = newMuted;
    setIsMuted(newMuted);

    if (newMuted) {
      stopListeningInternal();
    } else if (isActiveRef.current && statusRef.current !== 'speaking' && statusRef.current !== 'thinking') {
      updateStatus('listening');
      startListening();
    }
  }, [startListening, stopListeningInternal, updateStatus]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      stopListeningInternal();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      interruptSpeech();
    };
  }, [stopListeningInternal, interruptSpeech]);

  useEffect(() => {
    if (!isActive || status !== 'thinking') return;

    const watchdog = setTimeout(() => {
      if (!isActiveRef.current || statusRef.current !== 'thinking') return;
      // Instead of error, auto restart
      if (isActiveRef.current && !isMutedRef.current) {
        updateStatus('listening');
        startListening();
      }
    }, 25000);

    return () => clearTimeout(watchdog);
  }, [isActive, status, updateStatus, startListening]);

  return {
    isActive,
    status,
    isMuted,
    interimText,
    retryError,
    signalLevel,
    selectedVoice,
    startCall,
    endCall,
    startListening,
    stopListeningManual: stopListeningInternal,
    stopSpeakingHard,
    toggleMute,
    retryListening,
    speakResponse,
    setStatus: updateStatus,
    changeVoice,
  };
}
