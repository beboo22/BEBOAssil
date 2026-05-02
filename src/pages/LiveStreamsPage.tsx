import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Users, MapPin, ArrowLeft, Calendar, Settings, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";

interface ActiveStream {
  id: string;
  user_id: string;
  title: string;
  location_name: string | null;
  thumbnail_url: string | null;
  started_at: string;
  peak_viewers: number;
  scheduled_at?: string | null;
  status?: string | null;
  author?: { full_name: string | null; avatar_url: string | null; username: string | null } | null;
  liveViewers?: number;
}

const LiveStreamsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith("ar");
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const [upcoming, setUpcoming] = useState<ActiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStreams();
    const channel = supabase
      .channel("live_streams_listing")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, () => loadStreams())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Subscribe to presence on each stream's channel for real viewer counts
  useEffect(() => {
    if (streams.length === 0) return;
    const channels = streams.map(s => {
      const ch = supabase.channel(`live_stream_${s.id}`, { config: { presence: { key: `viewer_${Math.random()}` } } });
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const count = Object.keys(state).length;
        setStreams(prev => prev.map(p => p.id === s.id ? { ...p, liveViewers: count } : p));
      }).subscribe();
      return ch;
    });
    return () => { channels.forEach(c => supabase.removeChannel(c)); };
  }, [streams.map(s => s.id).join(",")]);

  const loadStreams = async () => {
    const liveCols = "id, user_id, title, location_name, thumbnail_url, started_at, peak_viewers";
    const upcomingCols = "id, user_id, title, location_name, thumbnail_url, scheduled_at, started_at, peak_viewers";
    const [{ data: liveData }, { data: upcomingData }] = await Promise.all([
      supabase.from("live_streams").select(liveCols).eq("is_active", true).order("started_at", { ascending: false }),
      (supabase.from("live_streams").select(upcomingCols) as any)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(20),
    ]);

    const allUserIds = [...new Set([...(liveData || []), ...(upcomingData || [])].map((d: any) => d.user_id))];
    const profileMap = new Map<string, any>();
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url, username").in("id", allUserIds);
      (profiles || []).forEach(p => profileMap.set(p.id, p));
    }

    setStreams((liveData || []).map((d: any) => ({ ...d, author: profileMap.get(d.user_id) || null })));
    setUpcoming((upcomingData || []).map((d: any) => ({ ...d, author: profileMap.get(d.user_id) || null })));
    setLoading(false);
  };

  const formatElapsed = (startedAt: string) => {
    const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h.toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(t); }, []);

  return (
    <div className="min-h-screen bg-background pt-16 pb-24">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="w-6 h-6 text-red-500 animate-pulse" />
              {isArabic ? "البث المباشر الآن" : "Live Now"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isArabic ? `${streams.length} مسافر يبث الآن` : `${streams.length} traveler${streams.length === 1 ? "" : "s"} streaming now`}
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={() => navigate("/stories?openLive=1")}
                className="gap-1.5 rounded-full text-xs bg-red-500 hover:bg-red-600 text-white"
              >
                <Video className="w-3.5 h-3.5" />
                {isArabic ? "ابدأ البث" : "Go live"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/stories/live/mine")} className="gap-1.5 rounded-full text-xs">
                <Settings className="w-3.5 h-3.5" />
                {isArabic ? "بثوثي" : "My streams"}
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="relative aspect-[3/4] rounded-2xl overflow-hidden">
                <Skeleton className="absolute inset-0 w-full h-full" />
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : streams.length === 0 && upcoming.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Radio className="w-16 h-16 mx-auto opacity-20 mb-4" />
            <p className="text-lg font-medium">{isArabic ? "لا يوجد بث مباشر حالياً" : "No live streams right now"}</p>
            <p className="text-sm mt-1">{isArabic ? "كن أول من يبدأ البث!" : "Be the first to go live!"}</p>
          </div>
        ) : (
          <>
            {streams.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {streams.map(stream => (
                  <motion.button
                    key={stream.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => navigate(`/stories/live/${stream.id}`)}
                    className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-br from-destructive/20 via-primary/20 to-accent/20 group"
                  >
                    {stream.thumbnail_url ? (
                      <img src={stream.thumbnail_url} alt={stream.title} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Radio className="w-16 h-16 text-white/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                      <Badge className="bg-destructive text-destructive-foreground border-0 gap-1 animate-pulse font-bold text-[10px]">
                        <Radio className="w-3 h-3" /> LIVE
                      </Badge>
                      <Badge className="bg-black/50 text-white border-0 gap-1 backdrop-blur-sm text-[10px]">
                        <Users className="w-3 h-3" /> {stream.liveViewers ?? 0}
                      </Badge>
                    </div>
                    <div className="absolute top-12 right-3">
                      <Badge className="bg-black/50 text-white border-0 backdrop-blur-sm font-mono text-[10px]">
                        {formatElapsed(stream.started_at)}
                      </Badge>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                      <p className="text-white font-bold text-sm line-clamp-2 drop-shadow-lg mb-2">{stream.title}</p>
                      {stream.location_name && (
                        <div className="flex items-center gap-1 text-white/80 text-[11px] mb-2">
                          <MapPin className="w-3 h-3" /> {stream.location_name}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 border border-white/30">
                          <AvatarImage src={stream.author?.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">{(stream.author?.full_name || "U").charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-white text-xs truncate">
                          {stream.author?.username ? `@${stream.author.username}` : (stream.author?.full_name || (isArabic ? "مسافر" : "Traveler"))}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold flex items-center gap-2 mb-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  {isArabic ? "البث القادم" : "Upcoming"}
                </h2>
                <div className="space-y-2">
                  {upcoming.map(s => {
                    const when = s.scheduled_at ? new Date(s.scheduled_at) : null;
                    const isOwner = !!user && s.user_id === user.id;
                    const canStartNow = isOwner; // owner can always start their scheduled stream early
                    return (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                        {s.thumbnail_url ? (
                          <img src={s.thumbnail_url} alt="" className="w-14 h-14 rounded-lg object-cover" loading="lazy" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {when ? when.toLocaleString(isArabic ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" }) : ""}
                          </p>
                          {s.author && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {s.author?.username ? `@${s.author.username}` : s.author?.full_name}
                              {isOwner && <span className="ms-1 text-primary">· {isArabic ? "أنت" : "you"}</span>}
                            </p>
                          )}
                        </div>
                        {canStartNow && (
                          <Button size="sm" variant="default" onClick={() => navigate("/stories/live/mine")}
                            className="rounded-full text-[11px] h-7 px-2.5 gap-1 shrink-0">
                            <Radio className="w-3 h-3" />
                            {isArabic ? "ابدأ" : "Start"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveStreamsPage;
