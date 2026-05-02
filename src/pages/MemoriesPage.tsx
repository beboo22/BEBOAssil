import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import MemoryAlbum from "@/components/profile/MemoryAlbum";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Archive, Plus, Upload, MapPin, Plane, Image as ImageIcon,
  Sparkles, ArrowLeft, X, Film, Heart, Calendar, FolderOpen, Grid3X3, List
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const MemoriesPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { i18n, t } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith("ar");
  const dateLocale = isArabic ? "ar-u-nu-latn" : (i18n.language || "en-US");
  const geocodeLang = (i18n.language || "en").split("-")[0];
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreview, setMediaPreview] = useState<string[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [memoriesRes, tripsRes] = await Promise.all([
      supabase.from("memories").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("saved_trips").select("trip_id, destination, trip_data, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setMemories(memoriesRes.data || []);
    setSavedTrips(tripsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && user) loadData();
  }, [authLoading, user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, 10);
    setMediaFiles(prev => [...prev, ...validFiles].slice(0, 10));
    setMediaPreview(prev => [...prev, ...validFiles.map(f => URL.createObjectURL(f))].slice(0, 10));
  };

  const removeFile = (idx: number) => {
    URL.revokeObjectURL(mediaPreview[idx]);
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
    setMediaPreview(prev => prev.filter((_, i) => i !== idx));
  };

  const importTrip = (trip: any) => {
    setSelectedTrip(trip);
    setTitle(t("memoriesPage.myTripTo", { destination: trip.destination }));
    setLocation(trip.destination);
  };

  const handleCreate = async () => {
    if (!user || !title.trim()) {
      toast.error(t("memoriesPage.toast.enterTitle"));
      return;
    }
    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of mediaFiles) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("story-media").upload(path, file);
        if (!error) {
          const { data: urlData } = supabase.storage.from("story-media").getPublicUrl(path);
          uploadedUrls.push(urlData.publicUrl);
        }
      }

      const { error } = await supabase.from("memories").insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        location_name: location.trim() || null,
        media_urls: uploadedUrls,
        memory_type: selectedTrip ? "trip" : "moment",
        trip_id: selectedTrip?.trip_id || null,
        trip_data: selectedTrip?.trip_data || null,
      });

      if (error) throw error;
      toast.success(t("memoriesPage.toast.saved"));
      resetForm();
      setShowCreate(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(t("memoriesPage.toast.saveFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLocation("");
    mediaPreview.forEach(u => URL.revokeObjectURL(u));
    setMediaFiles([]);
    setMediaPreview([]);
    setSelectedTrip(null);
  };

  // Filtered memories
  const filteredMemories = activeTab === "all"
    ? memories
    : activeTab === "trips"
    ? memories.filter(m => m.memory_type === "trip")
    : activeTab === "moments"
    ? memories.filter(m => m.memory_type === "moment")
    : activeTab === "published"
    ? memories.filter(m => m.is_published)
    : memories;

  // Unique locations for album view
  const locationAlbums = Array.from(
    new Map(
      memories.filter(m => m.location_name).map(m => [m.location_name, m])
    ).entries()
  ).map(([loc, sample]) => ({
    location: loc,
    count: memories.filter(m => m.location_name === loc).length,
    cover: (sample as any).media_urls?.[0],
  }));

  const totalPhotos = memories.reduce((s, m) => s + (m.media_urls?.length || 0), 0);
  const totalVideos = memories.reduce((s, m) => s + (m.media_urls || []).filter((u: string) => /\.(mp4|mov|webm)(\?|$)/i.test(u)).length, 0);

  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex flex-col items-center justify-center pt-32 px-4 text-center">
          <Archive className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-bold mb-2">{t("memoriesPage.signInTitle")}</h2>
          <Button onClick={() => navigate("/auth")} className="mt-4">{t("memoriesPage.signInButton")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-16 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-extrabold flex items-center gap-2">
                <Archive className="w-6 h-6 text-primary" />
                {t("memoriesPage.title")}
              </h1>
              <p className="text-muted-foreground text-sm">{t("memoriesPage.subtitle")}</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            {t("memoriesPage.newMemory")}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-3 text-center">
              <Archive className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold text-primary">{memories.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("memoriesPage.stats.memories")}</p>
            </CardContent>
          </Card>
          <Card className="border-accent/20 bg-accent/5">
            <CardContent className="p-3 text-center">
              <ImageIcon className="w-5 h-5 mx-auto mb-1 text-accent" />
              <p className="text-2xl font-bold text-accent">{totalPhotos}</p>
              <p className="text-[10px] text-muted-foreground">{t("memoriesPage.stats.photos")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Film className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold text-foreground">{totalVideos}</p>
              <p className="text-[10px] text-muted-foreground">{t("memoriesPage.stats.videos")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <MapPin className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold text-foreground">{locationAlbums.length}</p>
              <p className="text-[10px] text-muted-foreground">{t("memoriesPage.stats.places")}</p>
            </CardContent>
          </Card>
        </div>

        {/* Location Albums */}
        {locationAlbums.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              {t("memoriesPage.albumsByDestination")}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {locationAlbums.map((album, i) => (
                <motion.div
                  key={album.location}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="shrink-0 w-32 cursor-pointer group"
                  onClick={() => { setActiveTab("all"); }}
                >
                  <div className="w-32 h-32 rounded-2xl overflow-hidden relative mb-1.5 border border-border shadow-sm">
                    {album.cover ? (
                      <img src={album.cover} alt={album.location} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <MapPin className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-white text-xs font-bold truncate drop-shadow-lg">{album.location}</p>
                      <p className="text-white/70 text-[10px]">{t("memoriesPage.albumCount", { count: album.count })}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Tabs & View Toggle */}
        <div className="flex items-center justify-between mb-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="bg-muted/30">
              <TabsTrigger value="all" className="text-xs">{t("memoriesPage.tabs.all")}</TabsTrigger>
              <TabsTrigger value="trips" className="text-xs gap-1">
                <Plane className="w-3 h-3" />{t("memoriesPage.tabs.trips")}
              </TabsTrigger>
              <TabsTrigger value="moments" className="text-xs gap-1">
                <Heart className="w-3 h-3" />{t("memoriesPage.tabs.moments")}
              </TabsTrigger>
              <TabsTrigger value="published" className="text-xs gap-1">
                <Sparkles className="w-3 h-3" />{t("memoriesPage.tabs.published")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex gap-1 ml-2">
            <Button variant={viewMode === "grid" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}>
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Memory Album / List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
            <Archive size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t("memoriesPage.emptyState")}</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => setShowCreate(true)}>
                <Plus className="w-3 h-3" /> {t("memoriesPage.createMemory")}
            </Button>
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-3">
            {filteredMemories.map((memory, idx) => (
              <motion.div key={memory.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex">
                    <div className="w-20 h-20 shrink-0">
                      {memory.media_urls?.[0] ? (
                        <img src={memory.media_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate text-foreground">{memory.title}</h3>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                            {memory.location_name && <span className="flex items-center gap-0.5"><MapPin size={8} />{memory.location_name}</span>}
                            <span className="flex items-center gap-0.5">
                              <Calendar size={8} />
                              {new Date(memory.created_at).toLocaleDateString(dateLocale)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="text-[9px]">
                            {memory.memory_type === "trip" ? "✈️" : "📖"}
                          </Badge>
                          {memory.is_published && <Badge className="text-[9px] bg-green-500/20 text-green-700 border-0">✅</Badge>}
                        </div>
                      </div>
                      {memory.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{memory.description}</p>}
                    </CardContent>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <MemoryAlbum
            memories={filteredMemories}
            isArabic={isArabic}
            userId={user!.id}
            onUpdate={loadData}
            onPublish={async (memory: any) => {
              await supabase.from("memories").update({ is_published: true }).eq("id", memory.id);
              await supabase.from("travel_stories").insert({
                title: memory.title,
                content: memory.description || "",
                location_name: memory.location_name,
                media_urls: memory.media_urls,
                user_id: user!.id,
                trip_data: memory.trip_data,
                latitude: memory.latitude,
                longitude: memory.longitude,
              });
              toast.success(t("memoriesPage.toast.published"));
              loadData();
            }}
          />
        )}

        {/* Trip.com Hotel Widget */}
        <div className="mt-8">
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            🏨 {t("memoriesPage.bookHotel")}
          </h2>
          <div className="w-full overflow-hidden rounded-xl border border-border">
            <iframe
              src="https://www.trip.com/partners/ad/S14625543?Allianceid=7384441&SID=279474539&trip_sub1="
              style={{ width: "100%", height: 320, border: "none" }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
              title="Trip.com Hotels"
              loading="lazy"
            />
          </div>
        </div>
      </div>

      {/* Create Memory Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) resetForm(); setShowCreate(o); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {t("memoriesPage.createDialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{t("memoriesPage.createDialog.titleLabel")}</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("memoriesPage.createDialog.titlePlaceholder")} className="rounded-xl" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t("memoriesPage.createDialog.descriptionLabel")}</label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t("memoriesPage.createDialog.descriptionPlaceholder")} className="rounded-xl min-h-[80px]" />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">{t("memoriesPage.createDialog.locationLabel")}</label>
              <div className="flex gap-2">
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder={t("memoriesPage.createDialog.locationPlaceholder")} className="rounded-xl flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-xl shrink-0"
                  title={t("memoriesPage.createDialog.getLocation")}
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error(t("memoriesPage.toast.geolocationUnsupported"));
                      return;
                    }
                    toast.info(t("memoriesPage.toast.gettingLocation"));
                    navigator.geolocation.getCurrentPosition(
                      async (pos) => {
                        try {
                          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=${geocodeLang}`);
                          const data = await res.json();
                          const name = data.address?.city || data.address?.town || data.address?.village || data.display_name?.split(",")[0] || "";
                          const country = data.address?.country || "";
                          setLocation(name + (country ? `, ${country}` : ""));
                          toast.success(t("memoriesPage.toast.locationDetected"));
                        } catch {
                          setLocation(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
                        }
                      },
                      () => toast.error(t("memoriesPage.toast.locationFailed")),
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }}
                >
                  <MapPin className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {savedTrips.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1 block">{t("memoriesPage.createDialog.importFromTrip")}</label>
                <div className="flex flex-wrap gap-2">
                  {savedTrips.slice(0, 6).map(trip => (
                    <Button key={trip.trip_id} variant={selectedTrip?.trip_id === trip.trip_id ? "default" : "outline"} size="sm" onClick={() => importTrip(trip)} className="rounded-xl text-xs gap-1">
                      <Plane className="w-3 h-3" /> {trip.destination}
                    </Button>
                  ))}
                </div>
                {selectedTrip && (
                  <Badge variant="secondary" className="mt-2 text-xs gap-1">
                    <MapPin className="w-3 h-3" /> {t("memoriesPage.createDialog.linkedTo", { destination: selectedTrip.destination })}
                    <button onClick={() => setSelectedTrip(null)} className="ml-1"><X className="w-3 h-3" /></button>
                  </Badge>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">{t("memoriesPage.createDialog.mediaLabel")}</label>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-xl gap-2 mb-2">
                <Upload className="w-4 h-4" /> {t("memoriesPage.createDialog.uploadFiles")}
                <Badge variant="secondary" className="text-[10px]">{mediaPreview.length}/10</Badge>
              </Button>

              {mediaPreview.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {mediaPreview.map((url, i) => (
                    <div key={i} className="relative group">
                      {mediaFiles[i]?.type.startsWith("video/") ? (
                        <div className="w-full aspect-square bg-muted rounded-xl flex items-center justify-center">
                          <Film className="w-6 h-6 text-muted-foreground" />
                        </div>
                      ) : (
                        <img src={url} alt="" className="w-full aspect-square object-cover rounded-xl" />
                      )}
                      <button onClick={() => removeFile(i)} className="absolute top-1 right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="w-3 h-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={submitting || !title.trim()} className="w-full rounded-xl gap-2">
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {t("memoriesPage.saveMemory")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MemoriesPage;
