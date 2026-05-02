import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, X, Users, Heart, MessageCircle, MapPin, Send, SwitchCamera, Zap, ZapOff, Sparkles, Share2, Layers, UserPlus, Check, Mic, MicOff, Video, VideoOff, Map as MapIcon, Plane, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { retryChannelSendWithBackoff, retryWithBackoff } from '@/utils/realtimeRetry';

interface StartParams {
  title?: string;
  location?: string;
  thumbnailFile?: File | null;
  facingMode?: 'user' | 'environment';
  cohostParent?: string | null;
  importedTripId?: string | null;
  importedTripData?: any;
}

interface LiveStreamCtx {
  isLive: boolean;
  currentStreamId: string | null;
  startLiveStream: (params: StartParams) => Promise<boolean>;
  endLiveStream: () => Promise<void>;
  resumeStream: (streamId: string) => Promise<boolean>;
}

interface LiveComment {
  id: string;
  text: string;
  userName: string;
  avatarUrl?: string;
  timestamp: number;
}

interface ReactionBurst {
  id: string;
  emoji: string;
  xOffset: number;
}

const Ctx = createContext<LiveStreamCtx | null>(null);

export interface FilterPreset { id: string; label: string; labelAr: string; className: string; }
export const STREAM_FILTERS: FilterPreset[] = [
  { id: 'none', label: 'Original', labelAr: 'أصلي', className: '' },
  { id: 'vivid', label: 'Vivid', labelAr: 'حيوي', className: 'saturate-150 contrast-110' },
  { id: 'warm', label: 'Warm', labelAr: 'دافئ', className: 'sepia-[0.25] saturate-125 brightness-105' },
  { id: 'cool', label: 'Cool', labelAr: 'بارد', className: 'hue-rotate-15 saturate-110 brightness-105' },
  { id: 'mono', label: 'B&W', labelAr: 'أبيض وأسود', className: 'grayscale contrast-110' },
  { id: 'cinema', label: 'Cinema', labelAr: 'سينمائي', className: 'contrast-125 saturate-90 brightness-95' },
  { id: 'dream', label: 'Dream', labelAr: 'حالم', className: 'blur-[1px] brightness-110 saturate-110' },
];

export interface FramePreset { id: string; label: string; labelAr: string; render: () => React.ReactNode; }
export const STREAM_FRAMES: FramePreset[] = [
  { id: 'none', label: 'No frame', labelAr: 'بدون', render: () => null },
  { id: 'soft', label: 'Soft', labelAr: 'ناعم', render: () => (
    <div className="pointer-events-none absolute inset-0 z-[5]" style={{ boxShadow: 'inset 0 0 120px 30px rgba(0,0,0,0.55)' }} />
  ) },
  { id: 'gold', label: 'Gold', labelAr: 'ذهبي', render: () => (
    <div className="pointer-events-none absolute inset-3 z-[5] rounded-3xl border-4" style={{ borderColor: 'hsl(45 90% 60%)', boxShadow: '0 0 28px hsl(45 90% 60% / 0.45)' }} />
  ) },
  { id: 'travel', label: 'Travel', labelAr: 'سفر', render: () => (
    <>
      <div className="pointer-events-none absolute inset-0 z-[5]" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 80%, rgba(0,0,0,0.55) 100%)' }} />
      <div className="pointer-events-none absolute top-3 left-3 z-[6] flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white border border-white/20">
        <Plane className="w-3 h-3" /> ASEEL · TRAVEL
      </div>
    </>
  ) },
  { id: 'polaroid', label: 'Polaroid', labelAr: 'بولارويد', render: () => (
    <div className="pointer-events-none absolute inset-0 z-[5] border-[14px] border-white/95 shadow-[inset_0_0_0_2px_rgba(0,0,0,0.05)]" />
  ) },
];

export const useLiveStream = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLiveStream must be used inside LiveStreamProvider');
  return ctx;
};

export const LiveStreamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');

  const [isLive, setIsLive] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [duration, setDuration] = useState(0);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewers, setViewers] = useState<Array<{ key: string; userId?: string | null; userName: string; avatarUrl?: string | null; joinedAt: number; isHost?: boolean }>>([]);
  const [pastViewers, setPastViewers] = useState<Array<{ key: string; userId?: string | null; userName: string; avatarUrl?: string | null; joinedAt: number }>>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [viewersTab, setViewersTab] = useState<'live' | 'all'>('live');
  const [hostProfile, setHostProfile] = useState<{ user_name: string; avatar_url: string | null } | null>(null);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [reconnectKey, setReconnectKey] = useState(0);
  const [likes, setLikes] = useState(0);
  const [liveComments, setLiveComments] = useState<LiveComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashOn, setFlashOn] = useState(false);
  const [filterId, setFilterId] = useState<string>('none');
  const [frameId, setFrameId] = useState<string>('none');
  const [showEffects, setShowEffects] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [allowCohost, setAllowCohost] = useState(false);
  const [cohostRequests, setCohostRequests] = useState<any[]>([]);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [showShareTrip, setShowShareTrip] = useState(false);
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [pinnedTrip, setPinnedTrip] = useState<{ tripId: string; destination: string; thumbnail?: string | null; activityName?: string | null; activityLocation?: string | null } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<any>(null);
  const peakViewersRef = useRef(0);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const pushReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setReactionBursts(prev => [...prev.slice(-9), { id, emoji, xOffset: Math.random() * 80 - 40 }]);
    window.setTimeout(() => {
      setReactionBursts(prev => prev.filter(item => item.id !== id));
    }, 2200);
  }, []);

  // Load host profile so presence shows the real account name (not "Host").
  useEffect(() => {
    if (!user) { setHostProfile(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('profiles').select('full_name, username, avatar_url').eq('id', user.id).maybeSingle();
      if (cancelled) return;
      const fallback = (user.email?.split('@')[0]) || (isArabic ? 'المضيف' : 'Host');
      setHostProfile({
        user_name: data?.username ? `@${data.username}` : (data?.full_name || fallback),
        avatar_url: data?.avatar_url || null,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id, isArabic]);

  const cleanupPeerConnection = useCallback((viewerId: string) => {
    const existing = peerConnectionsRef.current.get(viewerId);
    if (!existing) return;
    try {
      existing.onicecandidate = null;
      existing.onconnectionstatechange = null;
      existing.ontrack = null;
      existing.close();
    } catch {}
    peerConnectionsRef.current.delete(viewerId);
  }, []);

  const cleanupAllPeerConnections = useCallback(() => {
    Array.from(peerConnectionsRef.current.keys()).forEach(cleanupPeerConnection);
  }, [cleanupPeerConnection]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
      streamRef.current = null;
    }
    if (videoRef.current) { try { videoRef.current.srcObject = null; } catch {} }
  }, []);

  const sendRealtimeEvent = useCallback(async (event: string, payload: any = {}) => {
    await retryChannelSendWithBackoff(
      () => channelRef.current,
      { type: 'broadcast', event, payload },
      { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 },
    );
  }, []);

  const sendCommentRecord = useCallback(async (payload: { stream_id: string; user_id: string; user_name: string; avatar_url: string | null; content: string }) => {
    await retryWithBackoff(async () => {
      const { error } = await supabase.from('live_stream_comments').insert(payload);
      if (error) throw error;
    }, { attempts: 5, baseDelayMs: 250, maxDelayMs: 3000 });
  }, []);

  const uploadThumbnail = async (file: File): Promise<string | null> => {
    if (!user) return null;
    try {
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('stream-thumbnails')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (!upErr) {
        const { data: pub } = supabase.storage.from('stream-thumbnails').getPublicUrl(path);
        return pub.publicUrl;
      }
    } catch { /* ignore */ }
    return null;
  };

  const startLiveStream = useCallback(async (params: StartParams): Promise<boolean> => {
    if (!user) return false;
    let mediaStream: MediaStream | null = null;
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: params.facingMode || 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = mediaStream;
    } catch {
      toast({
        title: isArabic ? 'لم نتمكن من الوصول للكاميرا' : 'Camera access denied',
        description: isArabic ? 'فعّل صلاحيات الكاميرا والمايك من إعدادات المتصفح.' : 'Enable camera and mic permissions in your browser settings.',
        variant: 'destructive',
      });
      return false;
    }

    setTitle(params.title || (isArabic ? 'بث مباشر' : 'Live Stream'));
    setLocation(params.location || '');
    setFacingMode(params.facingMode || 'environment');
    setIsLive(true);
    setDuration(0);
    setViewerCount(0);
    peakViewersRef.current = 0;
    setLiveComments([]);
    setLikes(0);

    const thumbnailUrl = params.thumbnailFile ? await uploadThumbnail(params.thumbnailFile) : null;

    const { data, error } = await supabase
      .from('live_streams')
      .insert({
        user_id: user.id,
        title: params.title || (isArabic ? 'بث مباشر' : 'Live Stream'),
        location_name: params.location || null,
        is_active: true,
        status: 'live',
        thumbnail_url: thumbnailUrl,
        ...(params.cohostParent ? { parent_stream_id: params.cohostParent } : {}),
        ...(params.importedTripId ? { imported_trip_id: params.importedTripId } : {}),
        ...(params.importedTripData ? { imported_trip_data: params.importedTripData } : {}),
      } as any)
      .select('id')
      .single();

    if (!error && data) {
      setStreamId(data.id);
      if (params.cohostParent) {
        toast({ title: isArabic ? 'انضممت كبثّ مشترك ✅' : 'Joined as co-host ✅' });
      }
      return true;
    }
    // DB failed — still keep live UI so the user sees their feed; just no persistence.
    return true;
  }, [user, isArabic, toast]);

  // Resume an existing stream row (e.g., scheduled stream activated from My Streams page)
  const resumeStream = useCallback(async (existingId: string): Promise<boolean> => {
    if (!user) return false;
    let mediaStream: MediaStream | null = null;
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = mediaStream;
    } catch {
      toast({
        title: isArabic ? 'لم نتمكن من الوصول للكاميرا' : 'Camera access denied',
        variant: 'destructive',
      });
      return false;
    }
    const { data } = await (supabase.from('live_streams').select('title, location_name').eq('id', existingId).maybeSingle() as any);
    setTitle(data?.title || (isArabic ? 'بث مباشر' : 'Live Stream'));
    setLocation(data?.location_name || '');
    setStreamId(existingId);
    setIsLive(true);
    setDuration(0);
    setViewerCount(0);
    peakViewersRef.current = 0;
    setLiveComments([]);
    setLikes(0);
    await (supabase.from('live_streams').update({ is_active: true, status: 'live', started_at: new Date().toISOString(), scheduled_at: null } as any) as any).eq('id', existingId).eq('user_id', user.id);
    return true;
  }, [user, isArabic, toast]);

  const endLiveStream = useCallback(async () => {
    stopCamera();
    cleanupAllPeerConnections();
    const sid = streamId;
    if (sid) {
      await supabase.from('live_streams').update({
        is_active: false,
        status: 'ended',
        ended_at: new Date().toISOString(),
        peak_viewers: peakViewersRef.current,
        total_likes: likes,
      } as any).eq('id', sid);
    }
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    setStreamId(null);
    setIsLive(false);
    setPinnedTrip(null);
    setShowEffects(false);
    setShowShareTrip(false);
    setFilterId('none');
    setFrameId('none');
    setMicOn(true);
    setCamOn(true);
    toast({
      title: isArabic ? '✅ تم إيقاف البث بنجاح' : '✅ Stream stopped successfully',
      description: `${formatDuration(duration)} • ${peakViewersRef.current} ${isArabic ? 'مشاهد' : 'viewers'}`,
    });
  }, [streamId, likes, duration, isArabic, toast, stopCamera, cleanupAllPeerConnections]);

  // Attach stream to <video> when overlay mounts
  useEffect(() => {
    if (isLive && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isLive]);

  // Duration timer
  useEffect(() => {
    if (!isLive) return;
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isLive]);

  // Sync host's active filter + frame to DB so viewers see the same effects.
  useEffect(() => {
    if (!isLive || !streamId) return;
    const t = window.setTimeout(() => {
      supabase.from('live_streams').update({
        active_filter: filterId,
        active_stickers: [{ frame: frameId }],
      } as any).eq('id', streamId).then(() => {});
    }, 150);
    return () => window.clearTimeout(t);
  }, [filterId, frameId, isLive, streamId]);

  // Realtime presence + comments
  useEffect(() => {
    if (!isLive || !streamId) return;
    (async () => {
      const { data } = await supabase
        .from('live_stream_comments')
        .select('id, user_name, avatar_url, content, created_at')
        .eq('stream_id', streamId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (data) {
        setLiveComments(data.map((c: any) => ({
          id: c.id, text: c.content, userName: c.user_name, avatarUrl: c.avatar_url, timestamp: new Date(c.created_at).getTime(),
        })));
      }
    })();

    const ch = supabase
      .channel(`live_stream_${streamId}`, { config: { presence: { key: user?.id || 'host' } } })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        const viewerList = Object.entries(state).map(([key, metas]) => {
          const meta = (metas?.[0] || {}) as any;
          return {
            key,
            userId: (meta.user_id as string | null | undefined) ?? null,
            userName: (meta.user_name as string) || (meta.host ? (isArabic ? 'المضيف' : 'Host') : (isArabic ? 'ضيف' : 'Guest')),
            avatarUrl: (meta.avatar_url as string | null) || null,
            joinedAt: (meta.joined_at as number) || Date.now(),
            isHost: Boolean(meta.host),
          };
        }).sort((a, b) => a.joinedAt - b.joinedAt);
        setViewers(viewerList);
        const count = Object.keys(state).length;
        setViewerCount(count);
        if (count > peakViewersRef.current) peakViewersRef.current = count;

        const activeViewerIds = new Set(Object.keys(state).filter((key) => key !== (user?.id || 'host')));
        Array.from(peerConnectionsRef.current.keys()).forEach((viewerId) => {
          if (!activeViewerIds.has(viewerId)) cleanupPeerConnection(viewerId);
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_stream_comments', filter: `stream_id=eq.${streamId}` }, (payload) => {
        const c: any = payload.new;
        setLiveComments(prev => {
          // Avoid duplicates by id, AND replace optimistic local entries that match same content+user.
          if (prev.some(x => x.id === c.id)) return prev;
          const incomingTs = new Date(c.created_at).getTime();
          const filtered = prev.filter(x => !(
            x.id.startsWith('local-') &&
            x.text === c.content &&
            x.userName === c.user_name &&
            Math.abs(x.timestamp - incomingTs) < 10000
          ));
          return [...filtered.slice(-50), {
            id: c.id, text: c.content, userName: c.user_name, avatarUrl: c.avatar_url, timestamp: incomingTs,
          }];
        });
      })
      .on('broadcast', { event: 'like' }, () => setLikes(l => l + 1))
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const emoji = typeof payload?.emoji === 'string' ? payload.emoji : '❤️';
        pushReaction(emoji);
      })
      .on('broadcast', { event: 'webrtc-join' }, async ({ payload }) => {
        const viewerId = typeof payload?.viewerId === 'string' ? payload.viewerId : null;
        if (!viewerId || viewerId === (user?.id || 'host') || !streamRef.current) return;

        cleanupPeerConnection(viewerId);
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        peerConnectionsRef.current.set(viewerId, pc);

        streamRef.current.getTracks().forEach((track) => {
          try { pc.addTrack(track, streamRef.current as MediaStream); } catch {}
        });

        pc.onicecandidate = async (event) => {
          if (!event.candidate) return;
          try {
            await retryChannelSendWithBackoff(() => ch, {
              type: 'broadcast',
              event: 'webrtc-ice',
              payload: {
                candidate: event.candidate.toJSON(),
                targetViewerId: viewerId,
                hostId: user?.id || 'host',
              },
            }, { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 });
          } catch {}
        };

        pc.onconnectionstatechange = () => {
          if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) cleanupPeerConnection(viewerId);
        };

        const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
        await pc.setLocalDescription(offer);
        await retryChannelSendWithBackoff(() => ch, {
          type: 'broadcast',
          event: 'webrtc-offer',
          payload: { viewerId, hostId: user?.id || 'host', offer: offer.sdp },
        }, { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 });
      })
      .on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
        const viewerId = typeof payload?.viewerId === 'string' ? payload.viewerId : null;
        const hostId = typeof payload?.hostId === 'string' ? payload.hostId : null;
        const answer = typeof payload?.answer === 'string' ? payload.answer : null;
        if (!viewerId || !answer || hostId !== (user?.id || 'host')) return;
        const pc = peerConnectionsRef.current.get(viewerId);
        if (!pc) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      })
      .on('broadcast', { event: 'webrtc-ice' }, async ({ payload }) => {
        const viewerId = typeof payload?.targetHostViewerId === 'string'
          ? payload.targetHostViewerId
          : typeof payload?.viewerId === 'string'
            ? payload.viewerId
            : null;
        if (!viewerId || !payload?.candidate) return;
        const pc = peerConnectionsRef.current.get(viewerId);
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      })
      .subscribe(async (status) => {
        // Re-track presence on every (re)subscribe so a network blip after ~2 min doesn't
        // drop us off the presence list, which would otherwise leave viewers stranded.
        if (status === 'SUBSCRIBED') {
          setConnectionState('connected');
          try { await ch.track({ host: true, user_id: user?.id || null, user_name: hostProfile?.user_name || (isArabic ? 'المضيف' : 'Host'), avatar_url: hostProfile?.avatar_url || null, joined_at: Date.now(), ts: Date.now() }); } catch {}
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionState('reconnecting');
        } else if (status === 'CLOSED') {
          setConnectionState('offline');
        }
      });
    channelRef.current = ch;

    // Heartbeat — refresh presence every 25s. Supabase realtime drops idle members
    // after ~60s by default, which is what cut the broadcast at the 2-minute mark.
    const heartbeat = window.setInterval(() => {
      try { ch.track({ host: true, user_id: user?.id || null, user_name: hostProfile?.user_name || (isArabic ? 'المضيف' : 'Host'), avatar_url: hostProfile?.avatar_url || null, joined_at: Date.now(), ts: Date.now() }); } catch {}
      const liveTracks = streamRef.current?.getTracks().filter(t => t.readyState === 'live').length ?? 0;
      if (liveTracks === 0) setConnectionState('reconnecting');
    }, 25000);

    return () => {
      window.clearInterval(heartbeat);
      cleanupAllPeerConnections();
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [isLive, streamId, user?.id, isArabic, cleanupPeerConnection, cleanupAllPeerConnections, pushReaction, reconnectKey, hostProfile?.user_name, hostProfile?.avatar_url]);

  const reconnectStream = useCallback(async () => {
    setConnectionState('reconnecting');
    cleanupAllPeerConnections();
    try {
      // Re-acquire camera + mic if any track died
      const tracksAlive = streamRef.current?.getTracks().some(t => t.readyState === 'live') ?? false;
      if (!tracksAlive) {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => { try { t.stop(); } catch {} });
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        streamRef.current = ms;
        if (videoRef.current) { videoRef.current.srcObject = ms; videoRef.current.play().catch(() => {}); }
      }
    } catch {
      toast({ title: isArabic ? 'تعذّر إعادة الاتصال' : 'Reconnect failed', variant: 'destructive' });
    }
    setReconnectKey(k => k + 1);
    toast({ title: isArabic ? 'يتم إعادة الاتصال بالبث ↻' : 'Reconnecting to live stream ↻' });
  }, [cleanupAllPeerConnections, facingMode, isArabic, toast]);

  // Cohost requests (host)
  useEffect(() => {
    if (!isLive || !streamId || !user) return;
    const loadRequests = async () => {
      const { data } = await (supabase.from('live_stream_cohost_requests' as any).select('*') as any)
        .eq('stream_id', streamId)
        .order('created_at', { ascending: false });
      if (data) setCohostRequests(data.filter((r: any) => r.status === 'pending'));
    };
    loadRequests();
    const ch = supabase
      .channel(`cohost_${streamId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_stream_cohost_requests', filter: `stream_id=eq.${streamId}` }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isLive, streamId, user]);

  // Cleanup on full unmount only (provider lives at app root, so this only fires on tab close)
  useEffect(() => {
    const handler = () => {
      stopCamera();
      if (streamId) {
        try {
          navigator.sendBeacon?.(
            `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`,
            new Blob([JSON.stringify({ is_active: false, status: 'ended', ended_at: new Date().toISOString() })], { type: 'application/json' })
          );
        } catch {}
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [streamId, stopCamera]);

  // ----- Overlay actions -----
  const switchCamera = async () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    if (flashOn) setFlashOn(false);
    try {
      const newMs = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      const newVideoTrack = newMs.getVideoTracks()[0];
      const newAudioTrack = newMs.getAudioTracks()[0];

      // Replace tracks in every active peer connection so VIEWERS see the new camera
      // without needing to reconnect.
      peerConnectionsRef.current.forEach((pc) => {
        try {
          const senders = pc.getSenders();
          const vSender = senders.find((s) => s.track?.kind === 'video');
          if (vSender && newVideoTrack) vSender.replaceTrack(newVideoTrack).catch(() => {});
          const aSender = senders.find((s) => s.track?.kind === 'audio');
          if (aSender && newAudioTrack) aSender.replaceTrack(newAudioTrack).catch(() => {});
        } catch (err) {
          console.warn('replaceTrack failed for peer', err);
        }
      });

      // Stop OLD tracks only AFTER replacement to avoid black-frame flicker for viewers.
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());

      streamRef.current = newMs;
      // Preserve mic-mute state
      newMs.getAudioTracks().forEach((t) => { t.enabled = micOn; });
      newMs.getVideoTracks().forEach((t) => { t.enabled = camOn; });

      if (videoRef.current) {
        videoRef.current.srcObject = newMs;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      toast({ title: isArabic ? 'تعذّر تبديل الكاميرا' : 'Camera switch failed', variant: 'destructive' });
    }
  };

  const toggleFlash = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities?.() as any;
      if (caps?.torch) {
        const newState = !flashOn;
        await (track as any).applyConstraints({ advanced: [{ torch: newState }] });
        setFlashOn(newState);
      } else {
        toast({ title: isArabic ? 'الفلاش غير مدعوم' : 'Flash not supported', variant: 'destructive', duration: 2000 });
      }
    } catch {
      toast({ title: isArabic ? 'تعذر تشغيل الفلاش' : 'Flash failed', variant: 'destructive', duration: 2000 });
    }
  };

  const toggleAllowCohost = async () => {
    if (!streamId) return;
    const newVal = !allowCohost;
    setAllowCohost(newVal);
    await (supabase.from('live_streams').update({ allow_cohost_requests: newVal } as any) as any).eq('id', streamId);
  };

  const respondToCohostRequest = async (requestId: string, approve: boolean) => {
    await (supabase.from('live_stream_cohost_requests' as any).update({
      status: approve ? 'approved' : 'declined',
      responded_at: new Date().toISOString(),
    } as any) as any).eq('id', requestId);
    toast({ title: approve ? (isArabic ? 'تمت الموافقة' : 'Approved') : (isArabic ? 'تم الرفض' : 'Declined') });
  };

  const addComment = async () => {
    if (!commentInput.trim() || !streamId || !user) return;
    const text = commentInput.trim();
    setCommentInput('');
    const { data: profile } = await supabase.from('profiles').select('full_name, username, avatar_url').eq('id', user.id).maybeSingle();
    const fallback = (user.email?.split('@')[0]) || (isArabic ? 'مسافر' : 'Traveler');
    const userName = profile?.username ? `@${profile.username}` : (profile?.full_name || fallback);
    try {
      await sendCommentRecord({ stream_id: streamId, user_id: user.id, user_name: userName, avatar_url: profile?.avatar_url || null, content: text });
      setLiveComments(prev => [...prev.slice(-50), { id: `local-${Date.now()}`, text, userName, avatarUrl: profile?.avatar_url || undefined, timestamp: Date.now() }]);
    } catch (error: any) {
      console.warn('host comment failed', error);
      setCommentInput(text);
      toast({ title: isArabic ? 'تعذّر إرسال التعليق' : 'Failed to send comment', description: error?.message, variant: 'destructive' });
    }
  };

  const handleLike = async () => {
    setLikes(l => l + 1);
    try { await sendRealtimeEvent('like'); } catch {}
  };

  const toggleMic = () => {
    if (!streamRef.current) return;
    const newVal = !micOn;
    streamRef.current.getAudioTracks().forEach(t => { t.enabled = newVal; });
    setMicOn(newVal);
    toast({ title: newVal ? (isArabic ? 'تم تشغيل المايك' : 'Mic on') : (isArabic ? 'تم كتم المايك' : 'Mic muted'), duration: 1500 });
  };

  const toggleCam = () => {
    if (!streamRef.current) return;
    const newVal = !camOn;
    streamRef.current.getVideoTracks().forEach(t => { t.enabled = newVal; });
    setCamOn(newVal);
    toast({ title: newVal ? (isArabic ? 'تم تشغيل الكاميرا' : 'Camera on') : (isArabic ? 'تم إيقاف الكاميرا' : 'Camera off'), duration: 1500 });
  };

  const loadSavedTrips = useCallback(async () => {
    if (!user) return;
    setLoadingTrips(true);
    const { data } = await supabase.from('saved_trips').select('id, trip_id, destination, trip_data, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    setSavedTrips(data || []);
    setLoadingTrips(false);
  }, [user]);

  const loadPastViewers = useCallback(async () => {
    if (!streamId) return;
    const { data } = await (supabase
      .from('live_stream_viewers')
      .select('viewer_key, user_id, user_name, joined_at')
      .eq('stream_id', streamId)
      .order('joined_at', { ascending: false })
      .limit(200) as any);
    if (!data) return;
    const userIds = Array.from(new Set((data as any[]).map((r: any) => r.user_id).filter(Boolean)));
    let avatarMap = new Map<string, { full_name: string | null; username: string | null; avatar_url: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', userIds);
      (profs || []).forEach((p: any) => avatarMap.set(p.id, p));
    }
    setPastViewers((data as any[]).map((r: any) => {
      const prof = r.user_id ? avatarMap.get(r.user_id) : null;
      const name = prof?.username ? `@${prof.username}` : (prof?.full_name || r.user_name || (isArabic ? 'ضيف' : 'Guest'));
      return {
        key: r.viewer_key,
        userId: r.user_id || null,
        userName: name,
        avatarUrl: prof?.avatar_url || null,
        joinedAt: new Date(r.joined_at).getTime(),
      };
    }));
  }, [streamId, isArabic]);

  const broadcastPin = async (payload: any) => {
    try { await sendRealtimeEvent('pin-trip', payload); } catch {}
  };

  const pinTripToStream = async (trip: any, activity?: { name: string; location?: string }) => {
    const data = trip.trip_data || {};
    const thumb: string | null = data?.image || data?.heroImage || data?.thumbnail || null;
    const pin = {
      tripId: trip.trip_id,
      destination: trip.destination,
      thumbnail: thumb,
      activityName: activity?.name || null,
      activityLocation: activity?.location || null,
    };
    setPinnedTrip(pin);
    await broadcastPin(pin);
    setShowShareTrip(false);
    toast({ title: isArabic ? 'تمت مشاركة الخطة في البث ✨' : 'Trip pinned to stream ✨' });
  };

  const unpinTrip = async () => {
    setPinnedTrip(null);
    await broadcastPin(null);
  };

  const shareStream = async () => {
    if (!streamId) return;
    const url = `${window.location.origin}/stories/live/${streamId}`;
    const shareData = { title: title || (isArabic ? 'بث مباشر' : 'Live Stream'), text: isArabic ? 'انضم إلى بثي المباشر!' : 'Join my live stream!', url };
    try { if (navigator.share) { await navigator.share(shareData); return; } } catch {}
    try { await navigator.clipboard.writeText(url); toast({ title: isArabic ? 'تم نسخ الرابط ✓' : 'Link copied ✓' }); }
    catch { toast({ title: isArabic ? 'تعذّر النسخ' : 'Copy failed', variant: 'destructive' }); }
  };

  const activeFilter = useMemo(() => STREAM_FILTERS.find(f => f.id === filterId) || STREAM_FILTERS[0], [filterId]);
  const activeFrame = useMemo(() => STREAM_FRAMES.find(f => f.id === frameId) || STREAM_FRAMES[0], [frameId]);

  const tripActivities = useMemo(() => {
    // Flatten activities from saved trips for quick activity-share menu.
    // Filter out meal entries — those are restaurant suggestions, not "shareable" sights.
    const isMeal = (a: any) => {
      const cat = String(a?.category || a?.type || '').toLowerCase();
      const name = String(a?.name || '').toLowerCase();
      return /meal|breakfast|lunch|dinner|restaurant|cafe|food|مطعم|فطور|غداء|عشاء/.test(cat)
        || /breakfast|lunch|dinner|فطور|غداء|عشاء/.test(name);
    };
    const out: { tripId: string; destination: string; trip: any; name: string; location?: string }[] = [];
    savedTrips.forEach((t: any) => {
      const data = t.trip_data || {};
      const days = Array.isArray(data?.itinerary) ? data.itinerary : Array.isArray(data?.days) ? data.days : [];
      days.forEach((d: any) => {
        const acts = Array.isArray(d?.activities) ? d.activities : [];
        acts.filter((a: any) => a?.name && !isMeal(a)).slice(0, 6).forEach((a: any) => {
          out.push({ tripId: t.trip_id, destination: t.destination, trip: t, name: a.name, location: a.location || a.address });
        });
      });
    });
    return out.slice(0, 80);
  }, [savedTrips]);


  const overlay = isLive ? (
    <div className="fixed inset-0 z-[200] bg-black">
      <video ref={videoRef} autoPlay muted playsInline className={`absolute inset-0 w-full h-full object-cover ${activeFilter.className} ${facingMode === 'user' ? 'scale-x-[-1]' : ''} ${!camOn ? 'opacity-0' : ''}`} />
      {!camOn && (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <VideoOff className="w-10 h-10 text-white/50" />
          <p className="text-white/60 text-sm font-semibold">{isArabic ? 'الكاميرا متوقفة' : 'Camera off'}</p>
        </div>
      )}
      {activeFrame.render()}

      {/* Reels-style brand watermark + location pill (always visible to host & viewers) */}
      <div className="absolute top-3 right-3 z-[15] flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-full bg-black/45 backdrop-blur-md px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white border border-white/15 shadow">
          <Plane className="w-3 h-3" /> ASEEL AI TRIP
        </div>
        {location && (
          <div className="flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white border border-white/15 max-w-[60vw] truncate shadow">
            <MapPin className="w-3 h-3" /> <span className="truncate">{location}</span>
          </div>
        )}
      </div>


      <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className="bg-red-500 text-white border-0 gap-1 animate-pulse font-bold">
              <Radio className="w-3 h-3" /> LIVE
            </Badge>
            <Badge onClick={() => { setShowViewers(true); setViewersTab('live'); loadPastViewers(); }} className="bg-black/40 text-white border-0 gap-1 backdrop-blur-sm cursor-pointer">
              <Users className="w-3 h-3" /> {viewerCount}
            </Badge>
            <Badge className="bg-black/40 text-white border-0 backdrop-blur-sm font-mono text-xs">
              {formatDuration(duration)}
            </Badge>
            <Badge
              onClick={connectionState !== 'connected' ? reconnectStream : undefined}
              className={`border-0 gap-1 backdrop-blur-sm text-[10px] ${connectionState === 'connected' ? 'bg-emerald-500/80 text-white' : connectionState === 'reconnecting' ? 'bg-amber-500/80 text-white animate-pulse cursor-pointer' : 'bg-destructive/80 text-destructive-foreground cursor-pointer'}`}
            >
              {connectionState === 'connected' ? <Wifi className="w-3 h-3" /> : connectionState === 'reconnecting' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
              {connectionState === 'connected'
                ? (isArabic ? 'الاتصال جيد' : 'Live: OK')
                : connectionState === 'reconnecting'
                  ? (isArabic ? 'إعادة الاتصال...' : 'Reconnecting...')
                  : (isArabic ? 'منقطع — اضغط للإعادة' : 'Offline — tap to retry')}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {connectionState !== 'connected' && (
              <Button onClick={reconnectStream} size="sm" variant="ghost" className="text-white hover:bg-white/20 rounded-full text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                {isArabic ? 'إعادة الاتصال' : 'Reconnect'}
              </Button>
            )}
            <Button
              onClick={endLiveStream}
              size="sm"
              className="rounded-full bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 h-9 text-xs font-bold shadow-lg shadow-destructive/40 ring-2 ring-destructive/30 ring-offset-2 ring-offset-black/20 animate-pulse gap-1.5"
              aria-label={isArabic ? 'إيقاف البث' : 'Stop stream'}
            >
              <X className="w-3.5 h-3.5" />
              {isArabic ? 'إيقاف البث' : 'Stop stream'}
            </Button>
            <Button onClick={shareStream} variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" aria-label={isArabic ? 'مشاركة' : 'Share'}>
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
        {title && <p className="text-white font-bold text-sm mt-2 drop-shadow-lg">{title}</p>}
        {location && (
          <Badge className="bg-white/15 text-white border-0 gap-1 mt-1 backdrop-blur-sm text-xs">
            <MapPin className="w-3 h-3" /> {location}
          </Badge>
        )}
      </div>

      {/* Pinned trip card overlay */}
      {pinnedTrip && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-24 left-3 right-3 sm:right-auto sm:max-w-sm z-20"
        >
          <Link to={`/itinerary/${pinnedTrip.tripId}`} className="block rounded-2xl overflow-hidden bg-black/60 backdrop-blur-xl border border-white/15 shadow-xl">
            <div className="flex items-center gap-3 p-2.5">
              <div className="w-14 h-14 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {pinnedTrip.thumbnail ? (
                  <img src={pinnedTrip.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <MapIcon className="w-6 h-6 text-white/70" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  {pinnedTrip.activityName ? (isArabic ? 'النشاط الحالي' : 'Now featuring') : (isArabic ? 'خطة مشاركة' : 'Featured trip')}
                </p>
                <p className="text-white text-sm font-bold truncate">{pinnedTrip.activityName || pinnedTrip.destination}</p>
                <p className="text-white/70 text-xs truncate">{pinnedTrip.activityLocation || pinnedTrip.destination}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/70 shrink-0" />
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); unpinTrip(); }} className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white shrink-0" aria-label="unpin">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </Link>
        </motion.div>
      )}

      {/* Right-side controls */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2.5 pointer-events-auto">
        <button type="button" onClick={toggleMic} aria-label={isArabic ? 'كتم/تشغيل المايك' : 'Toggle mic'} className={`touch-manipulation w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 active:scale-90 transition-transform ${micOn ? 'bg-black/40 text-white' : 'bg-destructive/70 text-destructive-foreground'}`}>
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button type="button" onClick={toggleCam} aria-label={isArabic ? 'تشغيل/إيقاف الكاميرا' : 'Toggle camera'} className={`touch-manipulation w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 active:scale-90 transition-transform ${camOn ? 'bg-black/40 text-white' : 'bg-destructive/70 text-destructive-foreground'}`}>
          {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button type="button" onClick={switchCamera} aria-label={isArabic ? 'تبديل الكاميرا' : 'Switch camera'} className="touch-manipulation w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform">
          <SwitchCamera className="w-5 h-5" />
        </button>
        <button type="button" onClick={toggleFlash} aria-label={isArabic ? 'فلاش' : 'Flash'} className={`touch-manipulation w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 active:scale-90 transition-transform ${flashOn ? 'bg-yellow-500/60 text-yellow-100' : 'bg-black/40 text-white'}`}>
          {flashOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
        </button>
        <button type="button" onClick={() => setShowEffects(v => !v)} aria-label={isArabic ? 'فلاتر وإطارات' : 'Filters & frames'} className={`touch-manipulation w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 active:scale-90 transition-transform ${showEffects || filterId !== 'none' || frameId !== 'none' ? 'bg-accent/60 text-accent-foreground' : 'bg-black/40 text-white'}`}>
          <Sparkles className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => { setShowShareTrip(true); loadSavedTrips(); }} aria-label={isArabic ? 'مشاركة خطة' : 'Share trip'} className="touch-manipulation w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white border border-white/10 active:scale-90 transition-transform">
          <MapIcon className="w-5 h-5" />
        </button>
        <button type="button" onClick={toggleAllowCohost} title={isArabic ? 'السماح بطلبات البث المشترك' : 'Allow co-host requests'} className={`touch-manipulation relative w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center border border-white/10 active:scale-90 transition-transform ${allowCohost ? 'bg-primary/70 text-primary-foreground' : 'bg-black/40 text-white'}`}>
          <UserPlus className="w-5 h-5" />
          {cohostRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {cohostRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Effects panel */}
      <AnimatePresence>
        {showEffects && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-3 right-3 z-30 rounded-2xl bg-black/70 backdrop-blur-xl border border-white/10 p-3 space-y-3">
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1.5">{isArabic ? 'الفلاتر' : 'Filters'}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {STREAM_FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilterId(f.id)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border transition-all ${filterId === f.id ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}>
                    {isArabic ? f.labelAr : f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-wider mb-1.5">{isArabic ? 'الإطارات' : 'Frames'}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {STREAM_FRAMES.map(f => (
                  <button key={f.id} onClick={() => setFrameId(f.id)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold border transition-all ${frameId === f.id ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}>
                    {isArabic ? f.labelAr : f.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {allowCohost && cohostRequests.length > 0 && (
        <div className="absolute top-24 left-3 right-3 sm:right-auto sm:max-w-xs z-30 bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-white/10">
          <p className="text-white text-xs font-bold mb-2 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {isArabic ? `طلبات بث مشترك (${cohostRequests.length})` : `Co-host requests (${cohostRequests.length})`}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {cohostRequests.map(r => (
              <div key={r.id} className="flex items-center gap-2 bg-white/10 rounded-xl p-2">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={r.requester_avatar || undefined} />
                  <AvatarFallback className="text-[10px]">{(r.requester_name || 'U').charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 text-white text-xs truncate">{r.requester_name || (isArabic ? 'مسافر' : 'Traveler')}</span>
                <button onClick={() => respondToCohostRequest(r.id, true)} className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => respondToCohostRequest(r.id, false)} className="w-7 h-7 rounded-full bg-destructive/80 text-destructive-foreground flex items-center justify-center">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="absolute bottom-28 left-0 right-20 z-10 px-4 max-h-[40vh] overflow-hidden">
        <AnimatePresence>
          {liveComments.slice(-8).map(c => (
            <motion.div key={c.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-1.5 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5 w-fit max-w-full">
              {c.avatarUrl && (
                <Avatar className="w-5 h-5 shrink-0">
                  <AvatarImage src={c.avatarUrl} />
                  <AvatarFallback className="text-[9px]">{c.userName.charAt(0)}</AvatarFallback>
                </Avatar>
              )}
              <span className="text-white/80 text-xs font-semibold shrink-0">{c.userName}</span>
              <span className="text-white text-xs truncate">{c.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {reactionBursts.map((reaction, i) => (
          <motion.div key={reaction.id} initial={{ opacity: 1, y: 0, x: 0 }} animate={{ opacity: 0, y: -200, x: reaction.xOffset }}
            exit={{ opacity: 0 }} transition={{ duration: 2, delay: i * 0.05 }}
            className="absolute bottom-28 right-8 z-10 text-2xl pointer-events-none">{reaction.emoji}</motion.div>
        ))}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/70 to-transparent">
        <div className="flex items-center gap-2">
          <Input value={commentInput} onChange={e => setCommentInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
            placeholder={isArabic ? 'أضف تعليق...' : 'Add comment...'}
            className="flex-1 bg-white/15 border-white/20 text-white placeholder:text-white/50 rounded-full h-10 text-sm" />
          <Button onClick={addComment} size="icon" className="rounded-full h-10 w-10 bg-white/15 hover:bg-white/25 text-white shrink-0">
            <Send className="w-4 h-4" />
          </Button>
          <Button onClick={handleLike} size="icon" className="rounded-full h-10 w-10 bg-red-500/80 hover:bg-red-500 text-white shrink-0">
            <Heart className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Share-trip dialog */}
      <Dialog open={showShareTrip} onOpenChange={setShowShareTrip}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-primary" />
              {isArabic ? 'مشاركة خطة في البث' : 'Share a trip in your stream'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            {isArabic ? 'اختر خطة لتثبيتها كبطاقة في بثك المباشر، أو شارك نشاطاً محدداً منها.' : 'Pin a trip card to your live stream, or share a specific activity from it.'}
          </p>
          <ScrollArea className="h-[55vh] -mx-2 px-2">
            {loadingTrips ? (
              <p className="text-center text-sm text-muted-foreground py-6">{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</p>
            ) : savedTrips.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <MapIcon className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{isArabic ? 'لا توجد خطط محفوظة بعد.' : 'No saved trips yet.'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedTrips.map((t: any) => {
                  const data = t.trip_data || {};
                  const thumb: string | null = data?.image || data?.heroImage || data?.thumbnail || null;
                  const acts = tripActivities.filter(a => a.tripId === t.trip_id);
                  return (
                    <div key={t.id} className="rounded-xl border bg-card/50 overflow-hidden">
                      <button onClick={() => pinTripToStream(t)} className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/40 text-left transition-colors">
                        <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{t.destination}</p>
                          <p className="text-[11px] text-muted-foreground">{isArabic ? 'مشاركة الخطة كاملة' : 'Pin entire trip'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </button>
                      {acts.length > 0 && (
                        <div className="border-t bg-muted/20 p-2 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">{isArabic ? 'مشاركة نشاط' : 'Share activity'}</p>
                          {acts.slice(0, 6).map((a, i) => (
                            <button key={i} onClick={() => pinTripToStream(t, { name: a.name, location: a.location })} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-background/60 flex items-center gap-2 transition-colors">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              <span className="text-xs flex-1 truncate">{a.name}</span>
                              {a.location && <span className="text-[10px] text-muted-foreground truncate max-w-[35%]">{a.location}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewers} onOpenChange={setShowViewers}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {isArabic ? 'المشاهدون المتصلون' : 'Connected viewers'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-72 rounded-lg border">
            {viewers.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                {isArabic ? 'لا يوجد مشاهدون حالياً' : 'No viewers right now'}
              </div>
            ) : (
              <ul className="divide-y">
                {viewers.map((viewer) => (
                  <li key={viewer.key} className="flex items-center gap-3 p-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={viewer.avatarUrl || undefined} />
                      <AvatarFallback>{viewer.userName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{viewer.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {viewer.isHost
                          ? (isArabic ? 'صاحب البث' : 'Host')
                          : (isArabic ? `منذ ${Math.max(0, Math.floor((Date.now() - viewer.joinedAt) / 60000))} د` : `${Math.max(0, Math.floor((Date.now() - viewer.joinedAt) / 60000))}m ago`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  ) : null;

  return (
    <Ctx.Provider value={{ isLive, currentStreamId: streamId, startLiveStream, endLiveStream, resumeStream }}>
      {children}
      {typeof document !== 'undefined' && overlay ? createPortal(overlay, document.body) : overlay}
    </Ctx.Provider>
  );
};

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}