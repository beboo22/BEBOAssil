import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { Radio, Calendar, Users, Heart, Eye, Play, Trash2, Edit2, BarChart3, ArrowLeft, Loader2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLiveStream } from "@/hooks/useLiveStream";

interface MyStream {
  id: string;
  title: string;
  thumbnail_url: string | null;
  status: string | null;
  is_active: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  peak_viewers: number;
  total_likes: number;
  location_name: string | null;
}

const MyLiveStreamsPage = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { resumeStream, endLiveStream, currentStreamId } = useLiveStream();
  const isArabic = i18n.language?.startsWith("ar");

  const [streams, setStreams] = useState<MyStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsFor, setAnalyticsFor] = useState<MyStream | null>(null);
  const [analyticsJoins, setAnalyticsJoins] = useState<Array<{ joined_at: string }>>([]);
  const [editFor, setEditFor] = useState<MyStream | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "stop" | "delete"; stream: MyStream } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    load();
  }, [user, authLoading]);

  const load = async () => {
    if (!user) return;
    const { data } = await (supabase
      .from("live_streams")
      .select("id, title, thumbnail_url, status, is_active, scheduled_at, started_at, ended_at, peak_viewers, total_likes, location_name") as any)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setStreams((data as MyStream[]) || []);
    setLoading(false);
  };

  const startScheduledNow = async (s: MyStream) => {
    if (!user) return;
    setStartingId(s.id);
    const ok = await resumeStream(s.id);
    setStartingId(null);
    if (!ok) {
      toast({ title: isArabic ? "تعذّر بدء البث" : "Could not start stream", variant: "destructive" });
      return;
    }
    toast({ title: isArabic ? "تم بدء البث ✓" : "Stream started ✓" });
    navigate(`/stories/live/${s.id}`);
  };

  const stopStream = async (s: MyStream) => {
    if (!user) return;
    if (currentStreamId === s.id) {
      await endLiveStream();
    } else {
      const { error } = await (supabase.from("live_streams").update({
        is_active: false,
        status: "ended",
        ended_at: new Date().toISOString(),
      } as any) as any).eq("id", s.id).eq("user_id", user.id);
      if (error) {
        toast({ title: isArabic ? "تعذّر إيقاف البث" : "Could not stop stream", variant: "destructive" });
        return;
      }
    }

    setStreams(prev => prev.map(item => item.id === s.id ? {
      ...item,
      is_active: false,
      status: "ended",
      ended_at: new Date().toISOString(),
    } : item));
    toast({ title: isArabic ? "✅ تم إيقاف البث" : "✅ Stream stopped" });
  };

  const deleteStream = async (s: MyStream) => {
    if (!user) return;
    if (s.is_active) {
      if (currentStreamId === s.id) {
        await endLiveStream();
      } else {
        await (supabase.from("live_streams").update({
          is_active: false,
          status: "ended",
          ended_at: new Date().toISOString(),
        } as any) as any).eq("id", s.id).eq("user_id", user.id);
      }
    }
    await supabase.from("live_streams").delete().eq("id", s.id).eq("user_id", user.id);
    setStreams(prev => prev.filter(x => x.id !== s.id));
    toast({ title: isArabic ? "✅ تم الحذف" : "✅ Deleted" });
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setActionInProgress(true);
    try {
      if (confirmAction.type === "stop") {
        await stopStream(confirmAction.stream);
      } else {
        await deleteStream(confirmAction.stream);
      }
    } finally {
      setActionInProgress(false);
      setConfirmAction(null);
    }
  };

  const openEdit = (s: MyStream) => {
    setEditFor(s);
    setEditTitle(s.title || "");
    setEditLocation(s.location_name || "");
    setEditScheduledAt(s.scheduled_at ? new Date(s.scheduled_at).toISOString().slice(0, 16) : "");
  };

  const saveEdit = async () => {
    if (!editFor || !user) return;
    setSavingEdit(true);
    const updates: any = { title: editTitle, location_name: editLocation || null };
    if (editFor.status === "scheduled" && editScheduledAt) {
      updates.scheduled_at = new Date(editScheduledAt).toISOString();
    }
    const { error } = await (supabase.from("live_streams").update(updates) as any).eq("id", editFor.id).eq("user_id", user.id);
    setSavingEdit(false);
    if (error) {
      toast({ title: isArabic ? "تعذّر الحفظ" : "Save failed", variant: "destructive" });
      return;
    }
    toast({ title: isArabic ? "تم الحفظ ✓" : "Saved ✓" });
    setEditFor(null);
    load();
  };

  const openAnalytics = async (s: MyStream) => {
    setAnalyticsFor(s);
    const { data } = await supabase
      .from("live_stream_viewers")
      .select("joined_at")
      .eq("stream_id", s.id)
      .order("joined_at", { ascending: true });
    setAnalyticsJoins((data as any) || []);
  };

  const liveStreams = streams.filter(s => s.is_active);
  const scheduledStreams = streams.filter(s => s.status === "scheduled" && !s.is_active);
  const pastStreams = streams.filter(s => !s.is_active && s.status !== "scheduled");

  const formatDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleString(isArabic ? "ar" : "en", { dateStyle: "medium", timeStyle: "short" });
  };

  const renderCard = (s: MyStream) => {
    const isScheduled = s.status === "scheduled" && !s.is_active;
    const isLive = s.is_active;
    const canStartNow = isScheduled && s.scheduled_at;
    const upcomingText = s.scheduled_at ? formatDate(s.scheduled_at) : "";

    return (
      <div key={s.id} className="flex gap-3 p-3 rounded-2xl border bg-card hover:shadow-md transition-shadow">
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-muted flex-shrink-0">
          {s.thumbnail_url ? (
            <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Radio className="w-7 h-7 text-muted-foreground" />
            </div>
          )}
          {isLive && (
            <Badge className="absolute top-1 left-1 bg-destructive text-destructive-foreground border-0 text-[9px] px-1.5 py-0 gap-1 animate-pulse">
              <Radio className="w-2.5 h-2.5" /> LIVE
            </Badge>
          )}
          {isScheduled && (
            <Badge className="absolute top-1 left-1 bg-primary text-primary-foreground border-0 text-[9px] px-1.5 py-0 gap-1">
              <Clock className="w-2.5 h-2.5" />
            </Badge>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm line-clamp-1">{s.title}</p>
          {isScheduled && (
            <p className="text-xs text-primary mt-0.5">
              {isArabic ? "موعد: " : "Scheduled: "}{upcomingText}
            </p>
          )}
          {!isScheduled && s.started_at && (
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(s.started_at)}</p>
          )}
          <div className="flex items-center flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{s.peak_viewers || 0}</span>
            <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{s.total_likes || 0}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {canStartNow && (
              <Button size="sm" onClick={() => startScheduledNow(s)} disabled={startingId === s.id}
                className="h-7 px-2.5 text-[11px] rounded-lg gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {startingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {isArabic ? "ابدأ الآن" : "Start now"}
              </Button>
            )}
            {isLive && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/stories/live/${s.id}`)}
                className="h-7 px-2.5 text-[11px] rounded-lg gap-1">
                <Eye className="w-3 h-3" />{isArabic ? "افتح" : "Open"}
              </Button>
            )}
            {isLive && (
              <Button size="sm" onClick={() => setConfirmAction({ type: "stop", stream: s })}
                className="h-7 px-2.5 text-[11px] rounded-lg gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                <Radio className="w-3 h-3" />{isArabic ? "إيقاف" : "Stop"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => openAnalytics(s)}
              className="h-7 px-2.5 text-[11px] rounded-lg gap-1">
              <BarChart3 className="w-3 h-3" />{isArabic ? "تحليل" : "Analytics"}
            </Button>
            {isScheduled && (
              <Button size="sm" variant="ghost" onClick={() => openEdit(s)}
                className="h-7 px-2.5 text-[11px] rounded-lg gap-1">
                <Edit2 className="w-3 h-3" />{isArabic ? "تعديل" : "Edit"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ type: "delete", stream: s })}
              className="h-7 px-2.5 text-[11px] rounded-lg gap-1 text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pt-16 pb-24">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="w-6 h-6 text-destructive" />
              {isArabic ? "بثوثي" : "My Streams"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isArabic ? "أدر بثوثك المباشرة والمجدولة" : "Manage your live and scheduled streams"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-2xl border bg-card">
                <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl" />
                <div className="flex-1 space-y-2 py-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-6 w-32 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Radio className="w-16 h-16 mx-auto opacity-20 mb-4" />
            <p className="text-lg font-medium">{isArabic ? "لا توجد بثوث بعد" : "No streams yet"}</p>
            <p className="text-sm mt-1">{isArabic ? "ابدأ بثك الأول من صفحة القصص" : "Start your first stream from the stories page"}</p>
          </div>
        ) : (
          <Tabs defaultValue="live">
            <TabsList className="grid grid-cols-3 w-full mb-4">
              <TabsTrigger value="live" className="gap-1.5 text-xs">
                <Radio className="w-3.5 h-3.5" />
                {isArabic ? `مباشر (${liveStreams.length})` : `Live (${liveStreams.length})`}
              </TabsTrigger>
              <TabsTrigger value="scheduled" className="gap-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                {isArabic ? `مجدول (${scheduledStreams.length})` : `Scheduled (${scheduledStreams.length})`}
              </TabsTrigger>
              <TabsTrigger value="past" className="gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5" />
                {isArabic ? `سابق (${pastStreams.length})` : `Past (${pastStreams.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="space-y-3 m-0">
              {liveStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">{isArabic ? "لا يوجد بث مباشر" : "Nothing live right now"}</p>
              ) : liveStreams.map(renderCard)}
            </TabsContent>

            <TabsContent value="scheduled" className="space-y-3 m-0">
              {scheduledStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">{isArabic ? "لا توجد بثوث مجدولة" : "No scheduled streams"}</p>
              ) : scheduledStreams.map(renderCard)}
            </TabsContent>

            <TabsContent value="past" className="space-y-3 m-0">
              {pastStreams.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">{isArabic ? "لا توجد بثوث سابقة" : "No past streams"}</p>
              ) : pastStreams.map(renderCard)}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Analytics dialog */}
      <Dialog open={!!analyticsFor} onOpenChange={(o) => !o && setAnalyticsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              {analyticsFor?.title}
            </DialogTitle>
          </DialogHeader>
          {analyticsFor && (
            <>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{analyticsFor.peak_viewers || 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "الذروة" : "Peak"}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold">{analyticsJoins.length}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "إجمالي فريد" : "Unique"}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{analyticsFor.total_likes || 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{isArabic ? "إعجابات" : "Likes"}</p>
                </div>
              </div>

              {(() => {
                if (analyticsJoins.length === 0 || !analyticsFor.started_at) {
                  return <p className="text-xs text-muted-foreground text-center mt-4">{isArabic ? "لا توجد بيانات مشاهدين" : "No viewer data"}</p>;
                }
                const start = new Date(analyticsFor.started_at).getTime();
                const end = analyticsFor.ended_at ? new Date(analyticsFor.ended_at).getTime() : Date.now();
                const bucketMs = 5 * 60 * 1000;
                const totalBuckets = Math.max(1, Math.ceil((end - start) / bucketMs));
                const buckets = new Array(totalBuckets).fill(0);
                analyticsJoins.forEach(j => {
                  const t = new Date(j.joined_at).getTime();
                  const idx = Math.min(totalBuckets - 1, Math.max(0, Math.floor((t - start) / bucketMs)));
                  buckets[idx] += 1;
                });
                const maxV = Math.max(...buckets, 1);
                return (
                  <div className="mt-4 rounded-xl border bg-muted/30 p-3">
                    <p className="text-xs font-semibold mb-2">{isArabic ? "المشاهدون عبر الزمن (٥ د)" : "Viewers over time (5m)"}</p>
                    <div className="flex items-end gap-1 h-24">
                      {buckets.map((v, i) => (
                        <div key={i} className="flex-1 bg-primary/80 rounded-t hover:bg-primary transition-colors"
                          style={{ height: `${(v / maxV) * 100}%`, minHeight: v > 0 ? "4px" : "2px" }} title={`+${v}`} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isArabic ? "تعديل البث" : "Edit stream"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">{isArabic ? "العنوان" : "Title"}</label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">{isArabic ? "الموقع" : "Location"}</label>
              <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} className="rounded-xl" />
            </div>
            {editFor?.status === "scheduled" && (
              <div>
                <label className="text-xs font-medium mb-1 block">{isArabic ? "الموعد" : "Scheduled time"}</label>
                <Input type="datetime-local" value={editScheduledAt}
                  onChange={e => setEditScheduledAt(e.target.value)}
                  min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} className="rounded-xl" />
              </div>
            )}
            <Button onClick={saveEdit} disabled={savingEdit || !editTitle} className="w-full rounded-xl gap-2">
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
              {isArabic ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm stop / delete */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && !actionInProgress && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "stop"
                ? (isArabic ? "إيقاف البث؟" : "Stop this stream?")
                : (isArabic ? "حذف البث؟" : "Delete this stream?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "stop"
                ? (isArabic
                    ? `سيتم إنهاء البث "${confirmAction?.stream.title}" فوراً وفصل جميع المشاهدين. لا يمكن التراجع.`
                    : `Stream "${confirmAction?.stream.title}" will end immediately and all viewers will be disconnected. This cannot be undone.`)
                : (isArabic
                    ? `سيتم حذف البث "${confirmAction?.stream.title}" نهائياً مع كل تعليقاته وإحصائياته. لا يمكن التراجع.`
                    : `Stream "${confirmAction?.stream.title}" will be permanently deleted along with all its comments and stats. This cannot be undone.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInProgress}>
              {isArabic ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={actionInProgress}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
            >
              {actionInProgress && <Loader2 className="w-4 h-4 animate-spin" />}
              {confirmAction?.type === "stop"
                ? (isArabic ? "إيقاف الآن" : "Stop now")
                : (isArabic ? "حذف نهائياً" : "Delete permanently")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MyLiveStreamsPage;
