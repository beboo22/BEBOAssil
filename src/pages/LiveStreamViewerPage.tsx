import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Users, MapPin, X, Heart, Send, Loader2, Share2, Eye, BarChart3, Smile, Wifi, WifiOff, RefreshCw, Plane, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { retryChannelSendWithBackoff, retryWithBackoff } from "@/utils/realtimeRetry";
import { STREAM_FILTERS, STREAM_FRAMES } from "@/hooks/useLiveStream";

interface Comment {
  id: string;
  user_name: string;
  avatar_url?: string | null;
  content: string;
  created_at: string;
}

interface ReactionBurst {
  id: string;
  emoji: string;
  xOffset: number;
}

const QUICK_REACTIONS = ['❤️', '🔥', '👏', '😍', '😂', '🎉'];

const LiveStreamViewerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");

  const [stream, setStream] = useState<any>(null);
  const [author, setAuthor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewers, setViewers] = useState<Array<{ key: string; user_id?: string; user_name: string; avatar_url?: string | null; joined_at: number }>>([]);
  const [peakViewers, setPeakViewers] = useState(0);
  const [totalJoins, setTotalJoins] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [likes, setLikes] = useState(0);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [reactionBursts, setReactionBursts] = useState<ReactionBurst[]>([]);
  const [duration, setDuration] = useState(0);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'offline'>('connecting');
  const [viewerJoins, setViewerJoins] = useState<Array<{ joined_at: string }>>([]);
  const [linkedStreams, setLinkedStreams] = useState<Array<{ id: string; title: string; thumbnail_url: string | null; user_id: string; author?: { full_name: string | null; username: string | null; avatar_url: string | null } | null }>>([]);
  const [myCohostStatus, setMyCohostStatus] = useState<'none' | 'pending' | 'approved'>('none');
  const [pinnedTrip, setPinnedTrip] = useState<{ tripId?: string; destination?: string; thumbnail?: string | null; activityName?: string | null; activityLocation?: string | null } | null>(null);
  const [liked, setLiked] = useState(false);
  const [neighborStreams, setNeighborStreams] = useState<Array<{ id: string; started_at: string }>>([]);
  const [totalComments, setTotalComments] = useState(0);
  const [endedRedirect, setEndedRedirect] = useState<{ countdown: number; targetId: string | null } | null>(null);
  const channelRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const presenceKeyRef = useRef<string | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const loggedJoinRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);

  const activeFilter = useMemo(() => {
    const id = (stream as any)?.active_filter || 'none';
    return STREAM_FILTERS.find(f => f.id === id) || STREAM_FILTERS[0];
  }, [stream]);
  const activeFrame = useMemo(() => {
    const stickers = Array.isArray((stream as any)?.active_stickers) ? (stream as any).active_stickers : [];
    const id = stickers.find((s: any) => s?.frame)?.frame || 'none';
    return STREAM_FRAMES.find(f => f.id === id) || STREAM_FRAMES[0];
  }, [stream]);

  const pushReaction = (emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setReactionBursts(prev => [...prev.slice(-9), { id, emoji, xOffset: Math.random() * 80 - 40 }]);
    window.setTimeout(() => {
      setReactionBursts(prev => prev.filter(item => item.id !== id));
    }, 2200);
  };

  const sendRealtimeEvent = async (event: string, payload: any = {}) => {
    await retryChannelSendWithBackoff(
      () => channelRef.current,
      { type: "broadcast", event, payload },
      { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 },
    );
  };

  const cleanupPeerConnection = () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.getReceivers().forEach(receiver => {
        try { receiver.track?.stop?.(); } catch {}
      });
      pc.close();
    } catch {}
    peerConnectionRef.current = null;
    if (videoRef.current) {
      try { videoRef.current.srcObject = null; } catch {}
    }
  };

  const isHost = !!(user && stream && stream.user_id === user.id);

  useEffect(() => {
    if (!id) return;
    cleanupPeerConnection();
    // Safe tile switch: reset all per-stream state + tear down old channel BEFORE loading the new one.
    // Without this, clicking a sibling co-host tile leaves the old presence channel + stale stream/comments.
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
    }
    seenKeysRef.current = new Set();
    loggedJoinRef.current = false;
    setStream(null);
    setAuthor(null);
    setLoading(true);
    setComments([]);
    setViewers([]);
    setViewerCount(0);
    setPeakViewers(0);
    setTotalJoins(0);
    setLikes(0);
    setHasRemoteVideo(false);
    setDuration(0);
    setViewerJoins([]);
    setLinkedStreams([]);
    setMyCohostStatus('none');
    setTotalComments(0);
    load();
  }, [id]);

  // Track current user's cohost request status for this stream
  useEffect(() => {
    if (!id || !user) { setMyCohostStatus('none'); return; }
    const fetchStatus = async () => {
      const { data } = await (supabase.from('live_stream_cohost_requests' as any).select('status') as any)
        .eq('stream_id', id).eq('requester_id', user.id).maybeSingle();
      setMyCohostStatus((data?.status as any) || 'none');
    };
    fetchStatus();
    const ch = supabase
      .channel(`my_cohost_${id}_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_stream_cohost_requests', filter: `stream_id=eq.${id}` }, () => fetchStatus())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, user]);

  const load = async () => {
    const { data, error } = await supabase.from("live_streams").select("*").eq("id", id).single();
    if (error || !data || !data.is_active) {
      setLoading(false);
      return;
    }
    setStream(data);
    // Initialize likes from authoritative live_stream_likes count (so unlikes from anyone reflect immediately).
    try {
      const { count: likeCount } = await (supabase.from('live_stream_likes' as any).select('*', { count: 'exact', head: true }) as any).eq('stream_id', id!);
      setLikes(typeof likeCount === 'number' ? likeCount : (data.total_likes || 0));
    } catch {
      setLikes(data.total_likes || 0);
    }
    const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url, username").eq("id", data.user_id).single();
    setAuthor(profile);
    setLoading(false);

    // Load linked streams (parent + siblings) for split-screen co-host view.
    // The "primary" id is the parent if this stream is a child, else this stream itself.
    const primaryId = (data as any).parent_stream_id || data.id;
    const { data: linked } = await (supabase
      .from("live_streams")
      .select("id, title, thumbnail_url, user_id, parent_stream_id") as any)
      .or(`id.eq.${primaryId},parent_stream_id.eq.${primaryId}`)
      .eq("is_active", true);
    if (linked && linked.length > 1) {
      const ids: string[] = Array.from(new Set((linked as any[]).map((s) => String(s.user_id))));
      const { data: profs } = await supabase.from("profiles").select("id, full_name, username, avatar_url").in("id", ids);
      const pmap = new Map((profs || []).map(p => [p.id, p]));
      setLinkedStreams(linked
        .filter((s: any) => s.id !== id)
        .map((s: any) => ({ ...s, author: pmap.get(s.user_id) || null })));
    } else {
      setLinkedStreams([]);
    }

    // Load neighbor active streams for swipe-up/down navigation between streams.
    try {
      const { data: nbr } = await supabase
        .from("live_streams")
        .select("id, started_at")
        .eq("is_active", true)
        .neq("id", id!)
        .order("started_at", { ascending: false })
        .limit(20);
      if (nbr) setNeighborStreams(nbr.map((s: any) => ({ id: s.id, started_at: s.started_at })));
    } catch {}

    // Check if current user/guest already liked this stream (DB-backed toggle).
    try {
      const STORAGE_KEY = `lvkey_${id}`;
      const myKey = user?.id || sessionStorage.getItem(STORAGE_KEY);
      if (user) {
        const { data: lk } = await (supabase.from('live_stream_likes' as any).select('id') as any)
          .eq('stream_id', id!).eq('user_id', user.id).maybeSingle();
        setLiked(!!lk);
      } else if (myKey) {
        const { data: lk } = await (supabase.from('live_stream_likes' as any).select('id') as any)
          .eq('stream_id', id!).is('user_id', null).eq('viewer_key', myKey).maybeSingle();
        setLiked(!!lk);
      }
    } catch {}

    // Load existing comments
    const { data: existing } = await supabase
      .from("live_stream_comments")
      .select("id, user_name, avatar_url, content, created_at")
      .eq("stream_id", id!)
      .order("created_at", { ascending: true })
      .limit(100);
    if (existing) setComments(existing);
    try {
      const { count: cCount } = await (supabase.from('live_stream_comments').select('*', { count: 'exact', head: true }) as any).eq('stream_id', id!);
      if (typeof cCount === 'number') setTotalComments(cCount);
    } catch {}

    // Resolve current viewer's profile (for richer presence info)
    let myName = isArabic ? "ضيف" : "Guest";
    let myAvatar: string | null = null;
    if (user) {
      const { data: myProfile } = await supabase
        .from("profiles").select("full_name, username, avatar_url").eq("id", user.id).single();
      myName = myProfile?.username ? `@${myProfile.username}` : (myProfile?.full_name || myName);
      myAvatar = myProfile?.avatar_url || null;
    }
    // Stable per-browser key (so a refresh doesn't double-count joins)
    const STORAGE_KEY = `lvkey_${id}`;
    let presenceKey = user?.id || sessionStorage.getItem(STORAGE_KEY) || `guest_${Math.random().toString(36).slice(2, 10)}`;
    if (!user) sessionStorage.setItem(STORAGE_KEY, presenceKey);
    presenceKeyRef.current = presenceKey;

    // Log a unique viewer-join row (for time-bucketed analytics).
    // The UNIQUE (stream_id, viewer_key) constraint handles dedup automatically.
    if (!loggedJoinRef.current) {
      loggedJoinRef.current = true;
      supabase.from("live_stream_viewers").insert({
        stream_id: id!,
        viewer_key: presenceKey,
        user_id: user?.id || null,
        user_name: myName,
      } as any).then(() => {});
    }

    // If the visitor is the host, load all viewer-join rows for analytics chart.
    if (user && data.user_id === user.id) {
      const { data: joins } = await supabase
        .from("live_stream_viewers")
        .select("joined_at")
        .eq("stream_id", id!)
        .order("joined_at", { ascending: true });
      if (joins) setViewerJoins(joins as any);
    }

    // Subscribe to stream updates + new comments via Postgres changes
    const ch = supabase
      .channel(`live_stream_${id}`, { config: { presence: { key: presenceKey } } })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${id}` },
        (payload) => {
          if (!(payload.new as any).is_active) {
            setStream(null);
            // Auto-redirect: if there's another active stream, jump to it; else go back to list.
            const next = neighborStreams[0]?.id || null;
            setEndedRedirect({ countdown: 3, targetId: next });
          } else {
            setStream(payload.new);
          }
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_stream_comments", filter: `stream_id=eq.${id}` },
        (payload) => {
          const c = payload.new as Comment;
          setTotalComments(t => t + 1);
          setComments(prev => {
            if (prev.some(x => x.id === c.id)) return prev;
            const incomingTs = new Date(c.created_at).getTime();
            // Replace any optimistic local entries with same content+user (within 10s).
            const filtered = prev.filter(x => !(
              x.id.startsWith('local-') &&
              x.content === c.content &&
              x.user_name === c.user_name &&
              Math.abs(new Date(x.created_at).getTime() - incomingTs) < 10000
            ));
            return [...filtered.slice(-99), c];
          });
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_stream_viewers", filter: `stream_id=eq.${id}` },
        (payload) => {
          const v = payload.new as { joined_at: string };
          setViewerJoins(prev => [...prev, { joined_at: v.joined_at }]);
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_stream_likes", filter: `stream_id=eq.${id}` },
        () => { setLikes(l => l + 1); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "live_stream_likes", filter: `stream_id=eq.${id}` },
        () => { setLikes(l => Math.max(0, l - 1)); })
      .on("broadcast", { event: "like" }, () => {
        // Legacy broadcast path — postgres_changes is now the source of truth, so ignore to avoid double counting.
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const emoji = typeof payload?.emoji === "string" ? payload.emoji : "❤️";
        pushReaction(emoji);
      })
      .on("broadcast", { event: "pin-trip" }, ({ payload }) => {
        setPinnedTrip(payload && typeof payload === 'object' ? payload : null);
      })
      .on("broadcast", { event: "webrtc-offer" }, async ({ payload }) => {
        const viewerId = typeof payload?.viewerId === "string" ? payload.viewerId : null;
        const offer = typeof payload?.offer === "string" ? payload.offer : null;
        if (!viewerId || !offer || viewerId !== presenceKeyRef.current) return;

        cleanupPeerConnection();
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        peerConnectionRef.current = pc;

        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (remoteStream && videoRef.current) {
            videoRef.current.srcObject = remoteStream;
            setHasRemoteVideo(true);
            videoRef.current.play().catch(() => {});
          }
        };

        pc.onicecandidate = async (event) => {
          if (!event.candidate) return;
          try {
            await retryChannelSendWithBackoff(
              () => ch,
              {
                type: "broadcast",
                event: "webrtc-ice",
                payload: {
                  candidate: event.candidate.toJSON(),
                  targetHostViewerId: viewerId,
                },
              },
              { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 },
            );
          } catch {}
        };

        pc.onconnectionstatechange = () => {
          if (["failed", "closed", "disconnected"].includes(pc.connectionState)) cleanupPeerConnection();
        };

        await pc.setRemoteDescription({ type: "offer", sdp: offer });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await retryChannelSendWithBackoff(
          () => ch,
          {
            type: "broadcast",
            event: "webrtc-answer",
            payload: {
              viewerId,
              hostId: payload?.hostId,
              answer: answer.sdp,
            },
          },
          { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 },
        );
      })
      .on("broadcast", { event: "webrtc-ice" }, async ({ payload }) => {
        if (payload?.targetViewerId !== presenceKeyRef.current || !payload?.candidate || !peerConnectionRef.current) return;
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {}
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, any[]>;
        const list = Object.entries(state).map(([key, metas]) => {
          const meta = (metas?.[0] || {}) as any;
          return {
            key,
            user_id: meta.user_id as string | undefined,
            user_name: (meta.user_name as string) || (isArabic ? "ضيف" : "Guest"),
            avatar_url: (meta.avatar_url as string | null) || null,
            joined_at: (meta.joined_at as number) || Date.now(),
          };
        }).sort((a, b) => a.joined_at - b.joined_at);

        // Track unique join keys for "total joins" stat
        for (const k of Object.keys(state)) {
          if (!seenKeysRef.current.has(k)) seenKeysRef.current.add(k);
        }
        setTotalJoins(seenKeysRef.current.size);
        setViewers(list);
        const count = list.length;
        setViewerCount(count);
        setPeakViewers(prev => Math.max(prev, count));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnectionState('connected');
          await ch.track({
            user_id: user?.id || null,
            user_name: myName,
            avatar_url: myAvatar,
            joined_at: Date.now(),
          });
          if (!isHost) {
            await retryChannelSendWithBackoff(() => ch, { type: "broadcast", event: "webrtc-join", payload: { viewerId: presenceKey } }, { attempts: 6, baseDelayMs: 250, maxDelayMs: 4000 });
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionState('reconnecting');
        } else if (status === "CLOSED") {
          setConnectionState('offline');
        }
      });
    channelRef.current = ch;

    // Heartbeat: re-track presence + re-request the stream if our peer connection has dropped.
    // Without this the realtime presence layer drops idle clients after ~60s, which is what
    // caused the broadcast to die after ~2 minutes.
    const heartbeat = window.setInterval(() => {
      try {
        ch.track({
          user_id: user?.id || null,
          user_name: myName,
          avatar_url: myAvatar,
          joined_at: Date.now(),
          ts: Date.now(),
        });
      } catch {}
      const pc = peerConnectionRef.current;
      const pcDead = !pc || ["failed", "closed", "disconnected"].includes(pc.connectionState);
      if (pcDead && !isHost) setConnectionState('reconnecting');
      else if (!pcDead) setConnectionState('connected');
      if (!isHost && pcDead) {
        retryChannelSendWithBackoff(() => ch, { type: "broadcast", event: "webrtc-join", payload: { viewerId: presenceKey } }, { attempts: 4, baseDelayMs: 300, maxDelayMs: 2500 }).catch(() => {});
      }
    }, 25000);

    // Persist the heartbeat handle on the channel so we can clear it when the channel
    // is removed (in the unmount effect below).
    (channelRef.current as any).__heartbeat = heartbeat;
  };

  useEffect(() => {
    return () => {
      cleanupPeerConnection();
      if (channelRef.current) {
        const hb = (channelRef.current as any).__heartbeat;
        if (hb) window.clearInterval(hb);
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!stream) return;
    const start = new Date(stream.started_at).getTime();
    const t = setInterval(() => setDuration(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [stream]);

  // Auto-redirect countdown after stream ends
  useEffect(() => {
    if (!endedRedirect) return;
    if (endedRedirect.countdown <= 0) {
      if (endedRedirect.targetId) navigate(`/stories/live/${endedRedirect.targetId}`, { replace: true });
      else navigate("/stories/live", { replace: true });
      return;
    }
    const t = window.setTimeout(() => setEndedRedirect(s => s ? { ...s, countdown: s.countdown - 1 } : null), 1000);
    return () => window.clearTimeout(t);
  }, [endedRedirect, navigate]);

  // Swipe up/down between active streams (Reels-style navigation).
  // neighborStreams is ordered by started_at DESC (newest first) and excludes the
  // current stream. Pick the nearest neighbor relative to the current stream's
  // started_at: swipe-up → newer (started after), swipe-down → older.
  const goToNeighborStream = useCallback((direction: 'up' | 'down') => {
    if (!stream || neighborStreams.length === 0) return;
    const currentTs = new Date(stream.started_at).getTime();
    const newer = neighborStreams
      .filter(s => new Date(s.started_at).getTime() > currentTs)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())[0];
    const older = neighborStreams
      .filter(s => new Date(s.started_at).getTime() < currentTs)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
    const target = direction === 'up'
      ? (newer?.id || older?.id || neighborStreams[0]?.id)
      : (older?.id || newer?.id || neighborStreams[0]?.id);
    if (target && target !== id) navigate(`/stories/live/${target}`, { replace: true });
  }, [neighborStreams, id, navigate, stream]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartYRef.current;
    touchStartYRef.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientY ?? start;
    const dy = end - start;
    if (Math.abs(dy) < 80) return; // ignore taps / small drags
    goToNeighborStream(dy < 0 ? 'up' : 'down');
  };

  const sendComment = async () => {
    if (!input.trim() || !id || sending) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    const { data: profile } = user
      ? await supabase.from("profiles").select("full_name, username, avatar_url").eq("id", user.id).maybeSingle()
      : { data: null as any };
    const fallback = user
      ? (user.email?.split("@")[0]) || (isArabic ? "مسافر" : "Traveler")
      : (isArabic ? "ضيف" : "Guest");
    const userName = profile?.username ? `@${profile.username}` : (profile?.full_name || fallback);

    try {
      await retryWithBackoff(async () => {
        const { error } = await supabase.from("live_stream_comments").insert({
          stream_id: id,
          user_id: user?.id || null,
          user_name: userName,
          avatar_url: profile?.avatar_url || null,
          content: text,
        });
        if (error) throw error;
      }, { attempts: 5, baseDelayMs: 250, maxDelayMs: 3000 });

      const optimistic: Comment = {
        id: `local-${Date.now()}`,
        user_name: userName,
        avatar_url: profile?.avatar_url || null,
        content: text,
        created_at: new Date().toISOString(),
      };
      setComments(prev => prev.some(c => c.id === optimistic.id) ? prev : [...prev.slice(-99), optimistic]);
    } catch (error: any) {
      setInput(text);
      console.warn("comment insert failed", error);
      toast({
        title: isArabic ? "تعذّر إرسال التعليق" : "Failed to send comment",
        description: error?.message,
        variant: "destructive",
      });
    }
    setSending(false);
  };

  const reconnectViewer = async () => {
    setConnectionState('reconnecting');
    cleanupPeerConnection();
    if (channelRef.current) {
      try { await channelRef.current.send({ type: "broadcast", event: "webrtc-join", payload: { viewerId: presenceKeyRef.current } }); } catch {}
    }
    toast({ title: isArabic ? 'يتم إعادة الاتصال بالبث ↻' : 'Reconnecting to live stream ↻' });
  };

  const sendLike = async () => {
    if (!stream) return;
    const myKey = presenceKeyRef.current || (user?.id ?? null);
    const wasLiked = liked;
    // Optimistic visual toggle only — the actual count is driven by the realtime
    // postgres_changes listener on live_stream_likes, so we don't bump `likes` here
    // to avoid double-counting the local actor.
    setLiked(!wasLiked);
    try {
      if (wasLiked) {
        const q: any = supabase.from('live_stream_likes' as any).delete().eq('stream_id', id!);
        if (user) await q.eq('user_id', user.id);
        else await q.is('user_id', null).eq('viewer_key', myKey);
        if (stream) {
          supabase.from('live_streams').update({ total_likes: Math.max(0, (stream.total_likes || 0) - 1) }).eq('id', id).then(() => {});
        }
      } else {
        const { error } = await (supabase.from('live_stream_likes' as any).insert({
          stream_id: id,
          user_id: user?.id || null,
          viewer_key: user ? null : myKey,
        } as any) as any);
        if (error && !String(error.message || '').toLowerCase().includes('duplicate')) throw error;
        if (stream) {
          supabase.from('live_streams').update({ total_likes: (stream.total_likes || 0) + 1 }).eq('id', id).then(() => {});
        }
      }
    } catch (e) {
      setLiked(wasLiked);
      console.warn('like toggle failed', e);
    }
  };

  const sendReaction = async (emoji: string) => {
    pushReaction(emoji);
    setShowEmojiBar(false);
    try {
      await sendRealtimeEvent("reaction", { emoji });
    } catch (e) { console.warn("reaction broadcast failed", e); }
  };

  const shareStream = async () => {
    const url = `${window.location.origin}/stories/live/${id}`;
    const shareData = {
      title: stream?.title || (isArabic ? "بث مباشر" : "Live Stream"),
      text: isArabic ? "شاهد البث المباشر الآن!" : "Watch this live stream now!",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch { /* user cancelled */ }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: isArabic ? "تم نسخ الرابط ✓" : "Link copied ✓" });
    } catch {
      toast({ title: isArabic ? "تعذّر النسخ" : "Copy failed", variant: "destructive" });
    }
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="w-8 h-8 animate-spin text-white" />
    </div>
  );

  if (!stream) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white gap-3 p-6">
      <Radio className="w-16 h-16 opacity-30" />
      <p className="text-lg font-medium">{isArabic ? "انتهى البث" : "Stream has ended"}</p>
      {endedRedirect ? (
        <p className="text-sm text-white/70">
          {endedRedirect.targetId
            ? (isArabic
                ? `الانتقال للبث التالي خلال ${endedRedirect.countdown}…`
                : `Switching to next stream in ${endedRedirect.countdown}…`)
            : (isArabic
                ? `العودة لقائمة البثوث خلال ${endedRedirect.countdown}…`
                : `Returning to streams list in ${endedRedirect.countdown}…`)}
        </p>
      ) : (
        <Button onClick={() => navigate("/stories/live")} variant="outline" className="rounded-xl">
          {isArabic ? "عرض البثوث الأخرى" : "Browse other streams"}
        </Button>
      )}
    </div>
  );

  // Default thumbnail fallback: gradient + author avatar (when host hasn't uploaded one)
  const fallbackInitial = (author?.full_name || author?.username || "U").charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background: thumbnail if available, else live video, else avatar gradient */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isHost}
        className={`absolute inset-0 w-full h-full object-cover ${activeFilter.className}`}
      />
      {!hasRemoteVideo && stream.thumbnail_url ? (
        <div className="absolute inset-0">
          <img src={stream.thumbnail_url} alt="" className={`absolute inset-0 w-full h-full object-cover ${activeFilter.className}`} />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      ) : !hasRemoteVideo ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900 via-pink-900 to-red-900">
          <div className="text-center">
            <Avatar className="w-28 h-28 mx-auto border-4 border-white/30 shadow-2xl mb-3">
              <AvatarImage src={author?.avatar_url || undefined} />
              <AvatarFallback className="text-3xl bg-white/15 text-white">{fallbackInitial}</AvatarFallback>
            </Avatar>
            <Radio className="w-6 h-6 text-white/40 mx-auto animate-pulse mb-1" />
            <p className="text-white/60 text-sm">{isArabic ? "بث مباشر" : "Live Broadcast"}</p>
          </div>
        </div>
      ) : null}

      {/* Sync host's frame on top of the video */}
      {activeFrame.render()}

      {/* Reels-style brand watermark + location pill */}
      <div className="absolute top-3 right-3 z-[15] flex flex-col items-end gap-1.5 pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-full bg-black/45 backdrop-blur-md px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-white border border-white/15 shadow">
          <Plane className="w-3 h-3" /> ASEEL AI TRIP
        </div>
        {stream.location_name && (
          <div className="flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md px-2.5 py-1 text-[10px] font-semibold text-white border border-white/15 max-w-[60vw] truncate shadow">
            <MapPin className="w-3 h-3" /> <span className="truncate">{stream.location_name}</span>
          </div>
        )}
      </div>

      {/* Swipe hint arrows for vertical navigation between streams */}
      {neighborStreams.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[12] pointer-events-none flex flex-col items-center gap-2">
          <ChevronUp className="w-5 h-5 text-white/40 animate-bounce mt-20" />
        </div>
      )}
      {neighborStreams.length > 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 z-[12] pointer-events-none">
          <ChevronDown className="w-5 h-5 text-white/40 animate-bounce" />
        </div>
      )}


      {/* Host-only live analytics panel */}
      {isHost && (
        <div className="absolute top-[calc(env(safe-area-inset-top)+72px)] left-3 z-[14] pointer-events-none">
          <div className="rounded-2xl bg-black/55 backdrop-blur-md border border-white/15 shadow-lg px-3 py-2 flex items-center gap-3 text-white text-[11px] font-semibold">
            <div className="flex items-center gap-1" title={isArabic ? 'المشاهدون الآن' : 'Viewers now'}>
              <Eye className="w-3.5 h-3.5 text-emerald-300" />
              <span>{viewerCount}</span>
              <span className="text-white/50 font-normal">/ {peakViewers}</span>
            </div>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-1" title={isArabic ? 'الإعجابات' : 'Likes'}>
              <Heart className="w-3.5 h-3.5 text-pink-400" />
              <span>{likes}</span>
            </div>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-1" title={isArabic ? 'التعليقات' : 'Comments'}>
              <Send className="w-3.5 h-3.5 text-sky-300" />
              <span>{totalComments}</span>
            </div>
            <div className="w-px h-4 bg-white/15" />
            <div className="flex items-center gap-1" title={isArabic ? 'إجمالي الانضمامات' : 'Total joins'}>
              <Users className="w-3.5 h-3.5 text-amber-300" />
              <span>{totalJoins}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pt-[max(1rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-red-500 text-white border-0 gap-1 animate-pulse font-bold">
              <Radio className="w-3 h-3" /> LIVE
            </Badge>
            {isHost ? (
              <button onClick={() => setShowViewers(true)} className="inline-flex">
                <Badge className="bg-black/40 text-white border-0 gap-1 backdrop-blur-sm hover:bg-black/60 cursor-pointer">
                  <Users className="w-3 h-3" /> {viewerCount}
                </Badge>
              </button>
            ) : (
              <Badge className="bg-black/40 text-white border-0 gap-1 backdrop-blur-sm">
                <Users className="w-3 h-3" /> {viewerCount}
              </Badge>
            )}
            <Badge className="bg-black/40 text-white border-0 backdrop-blur-sm font-mono text-xs">
              {formatDuration(duration)}
            </Badge>
            <Badge
              onClick={connectionState !== 'connected' ? reconnectViewer : undefined}
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
          <div className="flex items-center gap-1">
            {connectionState !== 'connected' && (
              <Button onClick={reconnectViewer} variant="ghost" size="sm" className="text-white hover:bg-white/20 rounded-full text-xs gap-1">
                <RefreshCw className="w-3 h-3" />
                {isArabic ? 'إعادة الاتصال' : 'Reconnect'}
              </Button>
            )}
            {!isHost && user && myCohostStatus === 'approved' && (
              <Button
                onClick={() => navigate(`/stories?cohost=${id}`)}
                size="sm"
                className="bg-green-500 hover:bg-green-600 text-white rounded-full text-xs gap-1 animate-pulse"
              >
                <Radio className="w-3 h-3" /> {isArabic ? "ابدأ بثّك المشترك" : "Start co-streaming"}
              </Button>
            )}
            {!isHost && user && myCohostStatus === 'pending' && (
              <Badge variant="secondary" className="bg-yellow-500/80 text-white border-0 text-[10px]">
                {isArabic ? "بانتظار موافقة المضيف" : "Pending approval"}
              </Badge>
            )}
            {!isHost && stream.allow_cohost_requests && user && myCohostStatus === 'none' && (
              <Button
                onClick={async () => {
                  const { data: profile } = await supabase.from("profiles").select("full_name, username, avatar_url").eq("id", user.id).single();
                  const name = profile?.username ? `@${profile.username}` : (profile?.full_name || (isArabic ? "مسافر" : "Traveler"));
                  const { error } = await (supabase.from("live_stream_cohost_requests" as any).insert({
                    stream_id: id, requester_id: user.id, requester_name: name, requester_avatar: profile?.avatar_url || null,
                  } as any) as any);
                  toast({ title: error ? (isArabic ? "تم الإرسال مسبقاً" : "Already requested") : (isArabic ? "تم إرسال طلبك ✓" : "Request sent ✓") });
                }}
                variant="ghost" size="sm" className="text-white hover:bg-white/20 rounded-full text-xs gap-1"
              >
                {isArabic ? "اطلب بثاً مشتركاً" : "Request co-host"}
              </Button>
            )}
            <Button onClick={shareStream} variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" aria-label={isArabic ? "مشاركة" : "Share"}>
              <Share2 className="w-5 h-5" />
            </Button>
            <Button
              onClick={() => {
                // If there's prior history within the app, go back; otherwise go to live streams hub
                if (window.history.length > 1 && document.referrer && document.referrer.includes(window.location.origin)) {
                  navigate(-1);
                } else {
                  navigate("/stories/live");
                }
              }}
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full"
              aria-label={isArabic ? "إغلاق" : "Close"}
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Avatar className="w-9 h-9 border border-white/30">
            <AvatarImage src={author?.avatar_url} />
            <AvatarFallback>{(author?.full_name || "U").charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-sm truncate">{stream.title}</p>
            <p className="text-white/70 text-xs">
              {author?.username ? `@${author.username}` : author?.full_name}
              {stream.location_name && (<> · <MapPin className="inline w-3 h-3" /> {stream.location_name}</>)}
            </p>
          </div>
        </div>
      </div>

      {/* Co-host split-screen strip: shows linked streams (parent + siblings) */}
      {linkedStreams.length > 0 && (
        <div className="absolute top-24 right-3 z-20 flex flex-col gap-2">
          {linkedStreams.slice(0, 2).map(s => (
            <button
              key={s.id}
              onClick={() => {
                if (s.id && s.id !== id) navigate(`/stories/live/${s.id}`, { replace: true });
              }}
              className="relative w-24 h-32 rounded-xl overflow-hidden border-2 border-white/40 shadow-lg group"
              aria-label={isArabic ? "تبديل البث" : "Switch stream"}
            >
              {s.thumbnail_url ? (
                <img src={s.thumbnail_url} alt={s.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-purple-700 via-pink-700 to-red-700 flex items-center justify-center">
                  <Radio className="w-6 h-6 text-white/60" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <Badge className="absolute top-1 left-1 bg-red-500 text-white border-0 text-[8px] px-1 py-0 gap-0.5 animate-pulse">
                <Radio className="w-2 h-2" /> LIVE
              </Badge>
              <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1">
                <Avatar className="w-4 h-4 border border-white/40">
                  <AvatarImage src={s.author?.avatar_url || undefined} />
                  <AvatarFallback className="text-[7px]">{(s.author?.full_name || "U").charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-white text-[9px] font-semibold truncate">
                  {s.author?.username ? `@${s.author.username}` : (s.author?.full_name || (isArabic ? "ضيف" : "Guest"))}
                </span>
              </div>
            </button>
          ))}
          <Badge variant="secondary" className="text-[9px] justify-center bg-black/60 text-white border-0 backdrop-blur-sm">
            {isArabic ? "بث مشترك" : "Co-stream"}
          </Badge>
        </div>
      )}

      {/* Pinned trip card from host */}
      {pinnedTrip && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute top-24 left-3 right-3 sm:right-auto sm:max-w-sm z-20"
        >
          <button
            onClick={() => pinnedTrip.tripId && navigate(`/itinerary/${pinnedTrip.tripId}`)}
            className="w-full text-left rounded-2xl overflow-hidden bg-black/60 backdrop-blur-xl border border-white/15 shadow-xl hover:bg-black/70 transition-colors"
          >
            <div className="flex items-center gap-3 p-2.5">
              <div className="w-14 h-14 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {pinnedTrip.thumbnail ? (
                  <img src={pinnedTrip.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <MapPin className="w-6 h-6 text-white/70" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  {pinnedTrip.activityName ? (isArabic ? 'النشاط الحالي' : 'Now featuring') : (isArabic ? 'خطة من المضيف' : 'Featured trip')}
                </p>
                <p className="text-white text-sm font-bold truncate">{pinnedTrip.activityName || pinnedTrip.destination}</p>
                <p className="text-white/70 text-xs truncate">{pinnedTrip.activityLocation || pinnedTrip.destination}</p>
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* Comments overlay */}
      <div className="absolute bottom-24 left-0 right-20 z-10 px-4 max-h-[40vh] overflow-hidden">
        <AnimatePresence>
          {comments.slice(-8).map(c => (
            <motion.div key={c.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-1.5 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5 w-fit max-w-full">
              {c.avatar_url && (
                <Avatar className="w-5 h-5 shrink-0">
                  <AvatarImage src={c.avatar_url} />
                  <AvatarFallback className="text-[9px]">{c.user_name.charAt(0)}</AvatarFallback>
                </Avatar>
              )}
              <span className="text-white/80 text-xs font-semibold shrink-0">{c.user_name}</span>
              <span className="text-white text-xs truncate">{c.content}</span>
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

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/80 to-transparent">
        <AnimatePresence>
          {showEmojiBar && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="mb-3 flex flex-wrap gap-2">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => sendReaction(emoji)} className="h-10 w-10 rounded-full bg-white/15 backdrop-blur-sm text-xl text-white hover:bg-white/25 active:scale-95 transition-all">
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") sendComment(); }}
            placeholder={user ? (isArabic ? "أضف تعليق..." : "Add comment...") : (isArabic ? "سجّل الدخول للتعليق" : "Sign in to comment")}
            className="flex-1 bg-white/15 border-white/20 text-white placeholder:text-white/50 rounded-full h-10 text-sm" />
          <Button onClick={() => setShowEmojiBar(prev => !prev)} size="icon" className="rounded-full h-10 w-10 bg-white/15 hover:bg-white/25 text-white shrink-0">
            <Smile className="w-4 h-4" />
          </Button>
          <Button onClick={sendComment} disabled={sending} size="icon" className="rounded-full h-10 w-10 bg-white/15 hover:bg-white/25 text-white shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
          <Button onClick={sendLike} size="icon" className={`rounded-full h-10 w-10 text-white shrink-0 transition-colors ${liked ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-300/60' : 'bg-red-500/80 hover:bg-red-500'}`} aria-pressed={liked}>
            <Heart className={`w-4 h-4 ${liked ? 'fill-white' : ''}`} />
          </Button>
        </div>
        {likes > 0 && <p className="text-white/60 text-[11px] text-center mt-2">❤️ {likes}</p>}
      </div>

      {/* Host-only viewers modal */}
      {isHost && (
        <Dialog open={showViewers} onOpenChange={setShowViewers}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                {isArabic ? "المشاهدون المتصلون" : "Connected Viewers"}
              </DialogTitle>
            </DialogHeader>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-primary">{viewerCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "الآن" : "Now"}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold">{peakViewers}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "الذروة" : "Peak"}</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold">{totalJoins}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "إجمالي" : "Total joins"}</p>
              </div>
            </div>

            {/* Unique viewers over time buckets (5-min) */}
            {(() => {
              if (viewerJoins.length === 0) return null;
              const start = new Date(stream.started_at).getTime();
              const now = Date.now();
              const bucketMs = 5 * 60 * 1000;
              const totalBuckets = Math.max(1, Math.ceil((now - start) / bucketMs));
              const buckets = new Array(totalBuckets).fill(0);
              viewerJoins.forEach(j => {
                const t = new Date(j.joined_at).getTime();
                const idx = Math.min(totalBuckets - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
                buckets[idx] += 1;
              });
              const maxV = Math.max(...buckets, 1);
              return (
                <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BarChart3 className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold">{isArabic ? "المشاهدون الفريدون عبر الزمن (كل ٥ د)" : "Unique viewers over time (per 5 min)"}</p>
                  </div>
                  <div className="flex items-end gap-1 h-20">
                    {buckets.map((v, i) => (
                      <div key={i} className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors" style={{ height: `${(v / maxV) * 100}%`, minHeight: v > 0 ? '4px' : '2px' }} title={`+${v}`} />
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                    {isArabic ? `إجمالي فريد: ${viewerJoins.length}` : `Unique total: ${viewerJoins.length}`}
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center justify-between mt-3 mb-1 px-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {isArabic ? "القائمة الحية" : "Live list"}
              </p>
              <Badge variant="secondary" className="gap-1">
                <Heart className="w-3 h-3 text-red-500" /> {likes}
              </Badge>
            </div>

            <ScrollArea className="h-72 rounded-lg border">
              {viewers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 gap-2">
                  <Users className="w-10 h-10 opacity-30" />
                  <p className="text-sm">{isArabic ? "لا يوجد مشاهدون حالياً" : "No viewers right now"}</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {viewers.map((v) => {
                    const isAnon = !v.user_id;
                    const display = isAnon
                      ? `${isArabic ? "ضيف" : "Guest"} ${v.key.slice(-4).toUpperCase()}`
                      : v.user_name;
                    const minutes = Math.max(0, Math.floor((Date.now() - v.joined_at) / 60000));
                    return (
                      <li key={v.key} className="flex items-center gap-3 p-2.5">
                        <Avatar className="w-9 h-9">
                          <AvatarImage src={v.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {display.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {display}
                            {v.user_id === user?.id && (
                              <span className="text-[10px] text-muted-foreground ms-1">
                                ({isArabic ? "أنت" : "you"})
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {minutes === 0
                              ? (isArabic ? "انضم للتو" : "Just joined")
                              : (isArabic ? `منذ ${minutes} د` : `${minutes}m ago`)}
                          </p>
                        </div>
                        {isAnon && (
                          <Badge variant="outline" className="text-[10px]">
                            {isArabic ? "مجهول" : "Anon"}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default LiveStreamViewerPage;
