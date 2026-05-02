import { useRef, useState, useCallback, useEffect } from 'react';
import { transcribeAudioBlob } from '@/lib/voice';

type VoiceState = 'idle' | 'listening' | 'processing';

interface UseVoiceRecorderOptions {
  language: string;
  onTranscript: (text: string) => void;
  onSpeechStart?: () => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  silenceTimeout?: number;
  autoDetect?: boolean;
}

/**
 * Robust voice recorder hook.
 * 1) Tries Web Speech API first (real-time interim results).
 * 2) Falls back to MediaRecorder + backend STT if Web Speech unavailable or fails.
 */
export function useVoiceRecorder({
  language,
  onTranscript,
  onSpeechStart,
  onError,
  continuous = false,
  silenceTimeout = 2000,
  autoDetect = false,
}: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRafRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const webSpeechSupported = useRef<boolean | null>(null);

  // Refs to avoid stale closure issues
  const stateRef = useRef<VoiceState>('idle');
  const continuousRef = useRef(continuous);
  continuousRef.current = continuous;
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSpeechStartRef = useRef(onSpeechStart);
  onSpeechStartRef.current = onSpeechStart;

  const setVoiceState = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const langMap: Record<string, string> = {
    ar: 'ar-SA', en: 'en-US', de: 'de-DE', fr: 'fr-FR',
    es: 'es-ES', ur: 'ur-PK', zh: 'zh-CN', ja: 'ja-JP',
    it: 'it-IT', tr: 'tr-TR', hi: 'hi-IN',
  };
  const speechLang = language === 'auto'
    ? (navigator.language || 'en-US')
    : (langMap[language?.split('-')[0]] || 'en-US');

  const cleanupMediaRecorder = useCallback(() => {
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopAll = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;

    cleanupMediaRecorder();
    chunksRef.current = [];
    setVoiceState('idle');
    setInterimText('');
  }, [cleanupMediaRecorder, setVoiceState]);

  // ── Web Speech API path ──
  const startWebSpeech = useCallback((): boolean => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      webSpeechSupported.current = false;
      return false;
    }

    // Stop any existing recognition first
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = speechLang;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasFired = false;

    const fireResult = () => {
      if (hasFired) return;
      hasFired = true;
      if (finalTranscript.trim()) {
        const text = finalTranscript.trim();
        finalTranscript = '';
        try { recognition.stop(); } catch {}
        onTranscriptRef.current(text);
      }
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(finalTranscript || interim);

      if (silenceTimer) clearTimeout(silenceTimer);
      if (finalTranscript.trim()) {
        silenceTimer = setTimeout(fireResult, silenceTimeout);
      }
    };

    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (!hasFired && finalTranscript.trim()) {
        hasFired = true;
        onTranscriptRef.current(finalTranscript.trim());
      }
      finalTranscript = '';
      setVoiceState('idle');
      setInterimText('');
      recognitionRef.current = null;
    };

    recognition.onerror = (e: any) => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (e.error === 'not-allowed') {
        onErrorRef.current?.('Microphone access denied. Please allow mic access in your browser.');
        setVoiceState('idle');
      } else if (e.error === 'no-speech') {
        setVoiceState('idle');
        setInterimText('');
      } else if (e.error === 'aborted') {
        setVoiceState('idle');
      } else {
        console.warn('Web Speech error:', e.error, '- falling back to MediaRecorder');
        webSpeechSupported.current = false;
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setVoiceState('listening');
      setInterimText('');
      webSpeechSupported.current = true;
      return true;
    } catch (err) {
      console.warn('Web Speech start failed:', err);
      webSpeechSupported.current = false;
      return false;
    }
  }, [speechLang, silenceTimeout, setVoiceState]);

  // ── MediaRecorder + backend STT path ──
  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });
      streamRef.current = stream;
      chunksRef.current = [];

      // Setup Audio Analyser for Silence Detection
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
      let speechDetected = false;

      const monitorVolume = () => {
        if (stateRef.current !== 'listening') return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const THRESHOLD = 8;

        if (average > THRESHOLD) {
          if (!speechDetected) {
            speechDetected = true;
            onSpeechStartRef.current?.();
          }
          lastSpeakTime = Date.now();
        } else if (speechDetected) {
          const silentDuration = Date.now() - lastSpeakTime;
          if (silentDuration > silenceTimeout) {
            console.log('Silence detected - auto stopping...');
            stopRecording();
            return;
          }
        }
        volumeRafRef.current = requestAnimationFrame(monitorVolume);
      };

      volumeRafRef.current = requestAnimationFrame(monitorVolume);

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
        cleanupMediaRecorder();

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 500) {
          setVoiceState('idle');
          setInterimText('');
          return;
        }

        setVoiceState('processing');
        setInterimText('Processing...');

        try {
          const text = await transcribeAudioBlob(blob, autoDetect ? 'auto' : language);
          if (text.trim()) {
            onTranscriptRef.current(text.trim());
          }
        } catch (err: any) {
          console.error('STT fallback error:', err);
          onErrorRef.current?.(err.message || 'Transcription failed');
        } finally {
          setVoiceState('idle');
          setInterimText('');
        }
      };

      recorder.start(250);
      setVoiceState('listening');
      setInterimText('🎙️');
    } catch (err: any) {
      console.error('MediaRecorder start failed:', err);
      onErrorRef.current?.('Microphone access denied. Please allow mic access in your browser.');
      setVoiceState('idle');
    }
  }, [language, autoDetect, silenceTimeout, cleanupMediaRecorder, setVoiceState]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {} // triggers onstop → transcription
    } else {
      if (volumeRafRef.current) {
        cancelAnimationFrame(volumeRafRef.current);
        volumeRafRef.current = null;
      }
      setVoiceState('idle');
      setInterimText('');
    }
  }, [setVoiceState]);

  // ── Public API ──
  const start = useCallback(async () => {
    if (stateRef.current !== 'idle') return;

    // Use MediaRecorder for auto-detect or if Web Speech is known to not work
    if (language === 'auto' || autoDetect || webSpeechSupported.current === false) {
      await startMediaRecorder();
      return;
    }

    const ok = startWebSpeech();
    if (!ok) {
      await startMediaRecorder();
    }
  }, [startWebSpeech, startMediaRecorder, language, autoDetect]);

  const stop = stopRecording;

  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  return {
    state,
    interimText,
    start,
    stop,
    stopAll,
    isListening: state === 'listening',
    isProcessing: state === 'processing',
  };
}
