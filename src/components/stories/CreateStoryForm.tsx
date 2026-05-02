import { useState, useEffect } from "react";
import { CameraCapture } from "./CameraCapture";
import { HashtagSystem } from "./HashtagSystem";
import { LiveStreamButton } from "./LiveStreamButton";
import { StoryMediaEditor, StoryStickerItem } from "./StoryMediaEditor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, X, Camera, Award, Sparkles, Upload, Loader2, Video, Link2, Navigation, Radio, FileText, Route, ImageIcon, CheckCircle2, Clock, Film, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { awardPoints } from "@/utils/pointsSystem";
import { useTranslation } from "react-i18next";
import { stopAll } from "@/utils/audioEngine";

const CATEGORIES = [
  { value: "desert", labelEn: "Desert Adventure", labelAr: "مغامرة صحراوية", icon: "🏜️" },
  { value: "mountain", labelEn: "Mountain Climbing", labelAr: "تسلق الجبال", icon: "🏔️" },
  { value: "beach", labelEn: "Beach", labelAr: "شاطئ", icon: "🏖️" },
  { value: "camping", labelEn: "Camping", labelAr: "تخييم", icon: "⛺" },
  { value: "diving", labelEn: "Diving", labelAr: "غوص", icon: "🤿" },
  { value: "hiking", labelEn: "Hiking", labelAr: "مشي", icon: "🥾" },
  { value: "skydiving", labelEn: "Skydiving", labelAr: "قفز مظلي", icon: "🪂" },
  { value: "cultural", labelEn: "Cultural", labelAr: "ثقافي", icon: "🏛️" },
  { value: "city", labelEn: "City Exploration", labelAr: "استكشاف المدينة", icon: "🏙️" },
  { value: "food", labelEn: "Food Adventure", labelAr: "مغامرة طعام", icon: "🍜" },
];

const DIFFICULTY = [
  { value: "easy", labelEn: "Easy", labelAr: "سهل" },
  { value: "moderate", labelEn: "Moderate", labelAr: "متوسط" },
  { value: "extreme", labelEn: "Extreme", labelAr: "صعب" },
];

const SEASONS = [
  { value: "summer", labelEn: "Summer ☀️", labelAr: "صيف ☀️" },
  { value: "winter", labelEn: "Winter ❄️", labelAr: "شتاء ❄️" },
  { value: "spring", labelEn: "Spring 🌸", labelAr: "ربيع 🌸" },
  { value: "autumn", labelEn: "Autumn 🍂", labelAr: "خريف 🍂" },
  { value: "all", labelEn: "All Seasons 🌍", labelAr: "كل المواسم 🌍" },
];

type CreateMode = 'new' | 'from-trip' | 'live';

interface CreateStoryFormProps {
  onSuccess: (story: any) => void;
  onCancel: () => void;
  prefillLinkedTripId?: string | null;
}

interface ActivityDetail {
  name: string;
  time?: string;
  dayIndex: number;
  location?: string;
  description?: string;
  type?: string;
  cost?: number;
  duration?: string;
  id?: string;
  latitude?: number;
  longitude?: number;
}

interface TripOption {
  id: string;
  tripId: string;
  destination: string;
  tripData: any;
  createdAt: string;
  source: 'local' | 'cloud';
  activities: ActivityDetail[];
}

export const CreateStoryForm = ({ onSuccess, onCancel, prefillLinkedTripId }: CreateStoryFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [mode, setMode] = useState<CreateMode>(prefillLinkedTripId ? 'from-trip' : 'new');
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [allTrips, setAllTrips] = useState<TripOption[]>([]);
  const [linkedTripIds, setLinkedTripIds] = useState<string[]>(prefillLinkedTripId ? [prefillLinkedTripId] : []);
  const linkedTripId = linkedTripIds[0] || '';
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'approximate' | 'error'>('idle');
  const [locationMessage, setLocationMessage] = useState('');
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [activityMedia, setActivityMedia] = useState<{ url: string; activityName: string; activityId?: string; mediaType?: string }[]>([]);
  const [formData, setFormData] = useState({
    title: "", content: "", location_name: "",
    latitude: null as number | null, longitude: null as number | null,
    video_url: "", category: "", difficulty: "", season: "",
    cost_estimate: "", travel_tips: "",
  });
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [storyStickers, setStoryStickers] = useState<StoryStickerItem[]>([]);
  const [storyFilter, setStoryFilter] = useState('none');

  // Cleanup audio on unmount
  useEffect(() => { return () => { stopAll(); }; }, []);

  // Load trips from both localStorage AND Supabase
  useEffect(() => {
    const loadAllTrips = async () => {
      const trips: TripOption[] = [];

      // Load from localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('itinerary-')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '');
            const tripId = key.replace('itinerary-', '');
            const activities: ActivityDetail[] = [];
            const daysList = data.days || data.itinerary || [];
            (daysList as any[]).forEach((day: any, dayIdx: number) => {
              (day.activities || []).forEach((a: any) => {
                activities.push({
                  name: a.name || a.title || '',
                  time: a.time || a.startTime,
                  dayIndex: dayIdx,
                  location: a.address || a.location || '',
                  description: a.description || '',
                  type: a.type || a.category || '',
                  cost: a.cost,
                  duration: a.duration,
                  id: a.id || '',
                  latitude: a.latitude,
                  longitude: a.longitude,
                });
              });
            });
            trips.push({
              id: `local-${tripId}`,
              tripId,
              destination: data.destination || 'Unknown',
              tripData: data,
              createdAt: data.startDate || new Date().toISOString(),
              source: 'local',
              activities,
            });
          } catch { /* skip */ }
        }
      }

      // Load from Supabase
      if (user) {
        const { data: cloudTrips } = await supabase
          .from('saved_trips')
          .select('id, trip_id, destination, trip_data, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (cloudTrips) {
          cloudTrips.forEach((ct: any) => {
            // Avoid duplicates
            if (!trips.find(t => t.tripId === ct.trip_id)) {
              const td = ct.trip_data as any;
              const activities: ActivityDetail[] = [];
              const daysList = td?.days || td?.itinerary || [];
              (daysList as any[]).forEach((day: any, dayIdx: number) => {
                (day.activities || []).forEach((a: any) => {
                  activities.push({
                    name: a.name || a.title || '',
                    time: a.time || a.startTime,
                    dayIndex: dayIdx,
                    location: a.address || a.location || '',
                    description: a.description || '',
                    type: a.type || a.category || '',
                    cost: a.cost,
                    duration: a.duration,
                    id: a.id || '',
                    latitude: a.latitude,
                    longitude: a.longitude,
                  });
                });
              });
              trips.push({
                id: ct.id,
                tripId: ct.trip_id,
                destination: ct.destination,
                tripData: td,
                createdAt: ct.created_at,
                source: 'cloud',
                activities,
              });
            }
          });
        }
      }

      trips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAllTrips(trips);
    };
    loadAllTrips();
  }, [user]);

  useEffect(() => {
    if (prefillLinkedTripId) {
      setLinkedTripIds([prefillLinkedTripId]);
      setMode('from-trip');
    }
  }, [prefillLinkedTripId]);

  // Auto-fill form when linking to trips
  useEffect(() => {
    if (linkedTripIds.length === 0) return;
    const selectedTrips = allTrips.filter(t => linkedTripIds.includes(t.id));
    if (selectedTrips.length === 0) return;

    // Build content from all selected trips
    const allContentLines: string[] = [];
    selectedTrips.forEach(trip => {
      const td = trip.tripData;
      const tripDays = td?.days || td?.itinerary || [];
      if (tripDays.length > 0) {
        allContentLines.push(`🗺️ ${trip.destination}`);
        (tripDays as any[]).forEach((day: any, i: number) => {
          const acts = (day.activities || []).map((a: any) => `• ${a.name || a.title || ''}`).join('\n');
          allContentLines.push(`📅 ${isArabic ? 'اليوم' : 'Day'} ${i + 1}:\n${acts}`);
        });
        allContentLines.push('');
      }
    });

    const firstTrip = selectedTrips[0];
    const destinations = selectedTrips.map(t => t.destination).join(' & ');
    setFormData(prev => ({
      ...prev,
      title: selectedTrips.length === 1
        ? `${isArabic ? 'رحلتي إلى' : 'My trip to'} ${destinations} ✈️`
        : `${isArabic ? 'مغامراتي في' : 'Adventures in'} ${destinations} ✈️`,
      location_name: destinations,
      content: allContentLines.join('\n'),
      category: firstTrip.tripData?.tripType || '',
      cost_estimate: firstTrip.tripData?.budget ? `$${firstTrip.tripData.budget}` : '',
    }));

    // Load activity media from DB for all selected trips
    if (user) {
      const tripIds = selectedTrips.map(t => t.tripId);
      supabase.from('activity_media').select('media_url, activity_name, activity_id, media_type').in('trip_id', tripIds).eq('user_id', user.id)
        .then(({ data: media }) => {
          if (media && media.length > 0) {
            setActivityMedia(media.map(m => ({ url: m.media_url, activityName: m.activity_name || '', activityId: m.activity_id, mediaType: m.media_type })));
            setPreviewUrls(prev => [...new Set([...prev, ...media.map(m => m.media_url)])]);
          } else {
            setActivityMedia([]);
          }
        });
    }
  }, [linkedTripIds, allTrips]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + mediaFiles.length > 8) {
      toast({ title: isArabic ? 'الحد الأقصى 8 ملفات' : 'Max 8 files', variant: "destructive" });
      return;
    }
    const validFiles = files.filter(file => {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: isArabic ? 'الملف كبير جدًا' : 'File too large', variant: "destructive" });
        return false;
      }
      return file.type.startsWith('image/') || file.type.startsWith('video/');
    });

    // Validate video duration (max 1 minute)
    const validateAndAdd = async () => {
      const approved: File[] = [];
      for (const file of validFiles) {
        if (file.type.startsWith('video/')) {
          const ok = await new Promise<boolean>((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
              URL.revokeObjectURL(video.src);
              if (video.duration > 60) {
                toast({ title: isArabic ? 'الفيديو طويل جدًا' : 'Video too long', description: isArabic ? 'الحد الأقصى دقيقة واحدة' : 'Max 1 minute allowed', variant: "destructive" });
                resolve(false);
              } else { resolve(true); }
            };
            video.onerror = () => resolve(true);
            video.src = URL.createObjectURL(file);
          });
          if (ok) approved.push(file);
        } else { approved.push(file); }
      }
      if (approved.length > 0) {
        setMediaFiles(prev => [...prev, ...approved]);
        setPreviewUrls(prev => [...prev, ...approved.map(f => URL.createObjectURL(f))]);
      }
    };
    validateAndAdd();
  };

  const removeFile = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => { if (prev[index]?.startsWith('blob:')) URL.revokeObjectURL(prev[index]); return prev.filter((_, i) => i !== index); });
  };

  const reverseGeocodeLocation = async (lat: number, lng: number) => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${isArabic ? 'ar' : 'en'}`);
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.state || '';
    const country = data.address?.country || '';
    return city && country ? `${city}, ${country}` : city || country || '';
  };

  const detectLocationFallback = async () => {
    try {
      const res = await fetch('https://ipwho.is');
      const data = await res.json();
      if (!data?.success) return null;
      const label = [data.city, data.country].filter(Boolean).join(', ');
      return {
        label,
        latitude: typeof data.latitude === 'number' ? data.latitude : null,
        longitude: typeof data.longitude === 'number' ? data.longitude : null,
      };
    } catch {
      return null;
    }
  };

  const handleLocationSelect = () => {
    setDetectingLocation(true);
    setLocationStatus('loading');
    setLocationMessage(isArabic ? 'جارٍ تحديد الموقع...' : 'Detecting location...');

    const useFallback = async () => {
      const fallback = await detectLocationFallback();
      if (fallback?.label) {
        setFormData(prev => ({
          ...prev,
          location_name: fallback.label,
          latitude: fallback.latitude ?? prev.latitude,
          longitude: fallback.longitude ?? prev.longitude,
        }));
        setLocationStatus('approximate');
        setLocationMessage(isArabic ? `تم تحديد موقع تقريبي: ${fallback.label}` : `Approximate location detected: ${fallback.label}`);
      } else {
        setLocationStatus('error');
        setLocationMessage(isArabic ? 'تعذر تحديد الموقع. يمكنك إدخاله يدوياً.' : 'Could not detect location. You can enter it manually.');
      }
      setDetectingLocation(false);
    };

    if (!navigator.geolocation) {
      void useFallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));

        try {
          const locationStr = await reverseGeocodeLocation(lat, lng);
          if (locationStr) {
            setFormData(prev => ({ ...prev, location_name: locationStr, latitude: lat, longitude: lng }));
            setLocationStatus('success');
            setLocationMessage(isArabic ? `تم تحديد الموقع: ${locationStr}` : `Location detected: ${locationStr}`);
          } else {
            setLocationStatus('success');
            setLocationMessage(isArabic ? 'تم حفظ الإحداثيات. يمكنك كتابة اسم المكان يدوياً.' : 'Coordinates captured. You can type the place name manually.');
          }
        } catch {
          setLocationStatus('success');
          setLocationMessage(isArabic ? 'تم حفظ الإحداثيات. يمكنك كتابة اسم المكان يدوياً.' : 'Coordinates captured. You can type the place name manually.');
        }

        setDetectingLocation(false);
      },
      async () => {
        await useFallback();
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000,
      }
    );
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (!user || mediaFiles.length === 0) return [];
    setUploadingMedia(true);
    const urls: string[] = [];
    for (const file of mediaFiles) {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('story-media').upload(path, file);
      if (error) { console.error("Upload error:", error); continue; }
      const { data: urlData } = supabase.storage.from('story-media').getPublicUrl(path);
      if (urlData?.publicUrl) urls.push(urlData.publicUrl);
    }
    setUploadingMedia(false);
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent, saveAsMemory = false) => {
    e.preventDefault();
    if (!user) { toast({ title: isArabic ? 'يجب تسجيل الدخول' : 'Sign in required', variant: "destructive" }); return; }
    if (!formData.title || !formData.content) {
      toast({ title: isArabic ? 'مطلوب' : 'Required', description: isArabic ? 'العنوان والنص مطلوبان' : 'Title and content are required', variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || '',
      });

      const uploadedUrls = await uploadFiles();
      const remoteUrls = previewUrls.filter(u => !u.startsWith('blob:'));
      const allMediaUrls = [...uploadedUrls, ...remoteUrls];
      const firstTrip = allTrips.find(t => t.id === linkedTripId);
      
      // Build trip_data with activity-media mapping
      const activityMediaMap: Record<string, string[]> = {};
      activityMedia.forEach(m => {
        const key = m.activityName || 'general';
        if (!activityMediaMap[key]) activityMediaMap[key] = [];
        activityMediaMap[key].push(m.url);
      });

      const tripData = {
        category: formData.category, difficulty: formData.difficulty,
        season: formData.season, cost_estimate: formData.cost_estimate,
        travel_tips: formData.travel_tips, hashtags: selectedHashtags,
        topics: selectedTopics,
        linked_trip_ids: linkedTripIds.length > 0 ? linkedTripIds : null,
        linked_trip_id: linkedTripId || null,
        linked_trip_destination: firstTrip?.destination || null,
        activity_media_map: activityMediaMap,
        itinerary: firstTrip?.tripData?.days || firstTrip?.tripData?.itinerary || [],
        stickers: storyStickers.length > 0 ? storyStickers : null,
        filter: storyFilter !== 'none' ? storyFilter : null,
      };

      if (saveAsMemory) {
        // Save as private memory
        const { error } = await supabase.from('memories').insert({
          user_id: user.id,
          title: formData.title,
          description: formData.content,
          memory_type: linkedTripId ? 'trip' : 'story',
          trip_id: firstTrip?.tripId || null,
          location_name: formData.location_name || null,
          latitude: formData.latitude,
          longitude: formData.longitude,
          media_urls: allMediaUrls,
          video_url: formData.video_url || null,
          trip_data: tripData as any,
          is_published: false,
        } as any);
        if (error) throw error;
        toast({ title: isArabic ? 'تم الحفظ في الذكريات ✅' : 'Saved to Memories ✅' });
        previewUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
        onCancel();
      } else {
        const { data: story, error } = await supabase
          .from("travel_stories")
          .insert({
            title: formData.title, content: formData.content,
            location_name: formData.location_name || null,
            latitude: formData.latitude, longitude: formData.longitude,
            media_urls: allMediaUrls, video_url: formData.video_url || null,
            trip_data: tripData as any, user_id: user.id, likes_count: 0,
          } as any)
          .select(`*, profiles!travel_stories_user_id_fkey (full_name, avatar_url, username)`)
          .single();
        if (error) throw error;
        await awardPoints({ userId: user.id, action: "CREATE_STORY", reason: "Published a travel story" });
        onSuccess({ ...story, is_liked: false, comments_count: 0 });
        previewUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
      }
    } catch (error: any) {
      console.error("Error creating story:", error);
      toast({ title: isArabic ? 'خطأ' : 'Error', description: error?.message || (isArabic ? 'فشل النشر. حاول مرة أخرى.' : 'Failed to publish. Try again.'), variant: "destructive" });
    } finally { setLoading(false); }
  };

  const modes = [
    { id: 'new' as CreateMode, icon: FileText, label: isArabic ? 'قصة جديدة' : 'New Story', desc: isArabic ? 'اكتب قصة من الصفر' : 'Write from scratch' },
    { id: 'from-trip' as CreateMode, icon: Route, label: isArabic ? 'من رحلة' : 'From Trip', desc: isArabic ? 'استورد من خططك' : 'Import from your trips' },
    { id: 'live' as CreateMode, icon: Radio, label: isArabic ? 'بث مباشر' : 'Go Live', desc: isArabic ? 'ابدأ بثاً مباشراً' : 'Start streaming' },
  ];

  const selectedTrips = allTrips.filter(t => linkedTripIds.includes(t.id));
  const allSelectedActivities = selectedTrips.flatMap(t => t.activities.map(a => ({ ...a, tripDestination: t.destination })));

  return (
    <div className="bg-card rounded-2xl sm:rounded-3xl">
      <CardHeader className="border-b border-border pb-3 sm:pb-4 px-4 sm:px-6 pt-4 sm:pt-6 sticky top-0 bg-card z-10">
        <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-center gap-2 text-foreground text-sm sm:text-lg min-w-0 flex-1">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-accent shrink-0" />
            <span className="truncate">{isArabic ? 'شارك مغامرتك' : 'Share Your Adventure'}</span>
          </span>
          <Badge className="bg-accent/15 text-accent border-0 gap-1 font-semibold text-[10px] sm:text-xs px-2 py-1 shrink-0">
            <Award className="w-3 h-3 sm:w-3.5 sm:h-3.5" />+5 pts
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6">
        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2 mb-4 sm:mb-6">
          {modes.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} type="button"
              className={`flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-xl border-2 transition-all text-center min-h-[92px] sm:min-h-[104px] ${
                mode === m.id
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-background hover:border-primary/30'
              }`}>
              <m.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${mode === m.id ? 'text-primary' : 'text-muted-foreground'} ${m.id === 'live' ? 'text-red-500' : ''}`} />
              <span className={`text-[11px] sm:text-xs font-bold leading-tight ${mode === m.id ? 'text-primary' : 'text-foreground'}`}>{m.label}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight line-clamp-2">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Live Stream mode */}
        {mode === 'live' && (
          <div className="text-center py-6 sm:py-8 space-y-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <Radio className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-foreground">{isArabic ? 'ابدأ بثاً مباشراً' : 'Start Live Stream'}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {isArabic ? 'شارك لحظاتك مباشرة مع المتابعين.' : 'Share your moments live with followers.'}
            </p>
            <LiveStreamButton variant="full" />
            <Button variant="outline" onClick={onCancel} className="rounded-xl mt-2 h-10 sm:h-11">
              {isArabic ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        )}

        {/* From Trip mode - trip selector */}
        {mode === 'from-trip' && (
          <div className="mb-4 sm:mb-5">
            <Label className="text-foreground font-medium flex items-center gap-2 mb-2 text-sm">
              <Route className="w-4 h-4 text-primary" />
              {isArabic ? 'اختر رحلة أو أكثر لاستيراد بياناتها' : 'Select one or more trips to import'}
            </Label>
            {allTrips.length === 0 ? (
              <div className="text-center py-5 sm:py-6 bg-muted/30 rounded-xl">
                <Route className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{isArabic ? 'لا توجد رحلات محفوظة' : 'No saved trips found'}</p>
                <p className="text-xs text-muted-foreground mt-1">{isArabic ? 'أنشئ رحلة أولاً من المخطط' : 'Create a trip first from the planner'}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 sm:max-h-60 overflow-y-auto">
                {allTrips.map(trip => (
                  <button key={trip.id} type="button" onClick={() => {
                    setLinkedTripIds(prev => {
                      if (prev.includes(trip.id)) return prev.filter(id => id !== trip.id);
                      return [...prev, trip.id];
                    });
                  }}
                    className={`w-full flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border-2 text-left transition-all ${
                      linkedTripIds.includes(trip.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    }`}>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">🗺️</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{trip.destination}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] text-muted-foreground">{new Date(trip.createdAt).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-US')}</p>
                        <Badge variant="secondary" className="text-[8px] h-4 px-1.5">
                          {trip.source === 'cloud' ? '☁️' : '💾'} {trip.activities.length} {isArabic ? 'فعالية' : 'activities'}
                        </Badge>
                      </div>
                    </div>
                    {linkedTripIds.includes(trip.id) && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Show selected trips activities with details and media */}
            {allSelectedActivities.length > 0 && (
              <div className="mt-3 bg-muted/30 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate">{isArabic ? 'الفعاليات المستوردة' : 'Imported Activities'} ({allSelectedActivities.length})</span>
                  </p>
                  {linkedTripIds.length > 1 && (
                    <Badge variant="secondary" className="text-[8px] shrink-0">
                      {linkedTripIds.length} {isArabic ? 'رحلات' : 'trips'}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 max-h-[320px] sm:max-h-[400px] overflow-y-auto pr-1">
                  {allSelectedActivities.map((act, i) => {
                    const actMedia = activityMedia.filter(m => 
                      m.activityId === act.id || 
                      m.activityName?.toLowerCase() === act.name?.toLowerCase()
                    );
                    const actKey = `${act.dayIndex}-${act.name}-${i}`;
                    const isExpanded = expandedActivity === actKey;
                    return (
                      <div key={i} className="bg-background rounded-xl border border-border overflow-hidden cursor-pointer hover:border-primary/30 transition-all"
                        onClick={() => setExpandedActivity(isExpanded ? null : actKey)}>
                        <div className="p-2.5 sm:p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <Badge variant="secondary" className="shrink-0 text-[9px] h-5 px-1.5 bg-primary/10 text-primary border-0">
                              D{act.dayIndex + 1}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{act.name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                {act.time && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Clock className="w-2.5 h-2.5" /> {act.time}
                                  </span>
                                )}
                                {act.location && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate max-w-[180px] sm:max-w-[200px]">
                                    <MapPin className="w-2.5 h-2.5 shrink-0" /> {act.location}
                                  </span>
                                )}
                                {act.cost !== undefined && act.cost !== null && (
                                  <span className="text-[10px] text-muted-foreground">
                                    💰 {act.cost === 0 ? (isArabic ? 'مجاني' : 'Free') : `$${act.cost}`}
                                  </span>
                                )}
                                {actMedia.length > 0 && (
                                  <span className="text-[10px] text-primary font-medium">📷 {actMedia.length}</span>
                                )}
                              </div>
                            </div>
                            {act.type && (
                              <Badge variant="outline" className="shrink-0 text-[8px] h-4 px-1">{act.type}</Badge>
                            )}
                          </div>

                          {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 pt-2 border-t border-border">
                              {act.description && (
                                <p className="text-xs text-muted-foreground">{act.description}</p>
                              )}
                              {act.duration && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">⏱️ {act.duration}</span>
                              )}
                              {(act as any).tripDestination && linkedTripIds.length > 1 && (
                                <Badge variant="secondary" className="text-[8px]">📍 {(act as any).tripDestination}</Badge>
                              )}
                              {actMedia.length > 0 && (
                                <div className="grid grid-cols-3 gap-1.5 pt-1">
                                  {actMedia.map((m, mi) => (
                                    <div key={mi} className="rounded-lg overflow-hidden border border-border aspect-square relative">
                                      {m.mediaType === 'video' ? (
                                        <div className="w-full h-full bg-muted flex items-center justify-center relative">
                                          <video src={m.url} className="absolute inset-0 w-full h-full object-cover" muted />
                                          <Video className="w-6 h-6 text-primary-foreground z-10 drop-shadow-lg" />
                                        </div>
                                      ) : (
                                        <img src={m.url} alt={m.activityName} className="w-full h-full object-cover" />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activityMedia.length > 0 && (
                  <div className="pt-2 border-t border-border flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-medium text-foreground">
                      {activityMedia.length} {isArabic ? 'صورة/فيديو مستورد' : 'media imported'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {linkedTripIds.length > 0 && (
              <Badge className="mt-2 bg-primary/10 text-primary border-0 text-xs">
                ✈️ {isArabic ? 'تم استيراد بيانات الرحلة تلقائياً' : 'Trip data imported automatically'}
              </Badge>
            )}
          </div>
        )}

        {/* Story form (for new and from-trip modes) */}
        {mode !== 'live' && (
          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <Label htmlFor="title" className="text-foreground font-medium text-sm">{isArabic ? 'عنوان القصة' : 'Story title'} *</Label>
              <Input id="title" placeholder={isArabic ? 'مثال: رحلة رائعة عبر جبال الألب...' : 'e.g. Incredible journey through the Alps...'} value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm" dir="auto" />
            </div>

            <div>
              <Label htmlFor="content" className="text-foreground font-medium text-sm">{isArabic ? 'نص القصة' : 'Story text'} *</Label>
              <Textarea id="content" placeholder={isArabic ? 'صف تجربتك، الأماكن المميزة، النصائح...' : 'Describe your experience, unique places, tips...'} value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))} className="mt-1.5 min-h-[88px] sm:min-h-[100px] bg-background border-border rounded-xl text-sm" dir="auto" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-foreground font-medium text-sm">{isArabic ? 'نوع المغامرة' : 'Adventure Type'}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm"><SelectValue placeholder={isArabic ? 'اختر النوع' : 'Select type'} /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="max-h-60 z-[9999]">
                    {CATEGORIES.map(c => (<SelectItem key={c.value} value={c.value}>{c.icon} {isArabic ? c.labelAr : c.labelEn}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground font-medium text-sm">{isArabic ? 'مستوى الصعوبة' : 'Difficulty'}</Label>
                <Select value={formData.difficulty} onValueChange={(v) => setFormData(prev => ({ ...prev, difficulty: v }))}>
                  <SelectTrigger className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm"><SelectValue placeholder={isArabic ? 'المستوى' : 'Level'} /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="z-[9999]">{DIFFICULTY.map(d => (<SelectItem key={d.value} value={d.value}>{isArabic ? d.labelAr : d.labelEn}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-foreground font-medium text-sm">{isArabic ? 'أفضل موسم' : 'Best Season'}</Label>
                <Select value={formData.season} onValueChange={(v) => setFormData(prev => ({ ...prev, season: v }))}>
                  <SelectTrigger className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm"><SelectValue placeholder={isArabic ? 'الموسم' : 'Season'} /></SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="z-[9999]">{SEASONS.map(s => (<SelectItem key={s.value} value={s.value}>{isArabic ? s.labelAr : s.labelEn}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-foreground font-medium text-sm">{isArabic ? 'التكلفة المقدرة' : 'Estimated Cost'}</Label>
                <Input placeholder={isArabic ? 'مثال: $500' : 'e.g. $500'} value={formData.cost_estimate}
                  onChange={(e) => setFormData(prev => ({ ...prev, cost_estimate: e.target.value }))} className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm" />
              </div>
            </div>

            {/* Location */}
            <div>
              <Label className="text-foreground font-medium text-sm">{isArabic ? 'الموقع' : 'Location'}</Label>
              <div className="flex gap-2 mt-1.5">
                <Input placeholder={isArabic ? 'المدينة أو المكان...' : 'City or place...'} value={formData.location_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, location_name: e.target.value }))} className="flex-1 bg-background border-border rounded-xl h-10 sm:h-11 text-sm" dir="auto" />
                <Button type="button" variant="outline" size="icon" onClick={handleLocationSelect} disabled={detectingLocation}
                  className="shrink-0 h-10 w-10 sm:h-11 sm:w-11 rounded-xl">
                  {detectingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                </Button>
              </div>
              {locationStatus !== 'idle' && (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-xs sm:text-sm ${
                  locationStatus === 'error'
                    ? 'border-destructive/30 bg-destructive/10 text-foreground'
                    : locationStatus === 'approximate'
                      ? 'border-accent/30 bg-accent/10 text-foreground'
                      : 'border-primary/30 bg-primary/10 text-foreground'
                }`}>
                  {locationMessage}
                </div>
              )}
            </div>

            {/* Hashtags & Topics */}
            <div className="bg-muted/30 rounded-2xl p-3 sm:p-4">
              <HashtagSystem selectedTags={selectedHashtags} onTagsChange={setSelectedHashtags}
                selectedTopics={selectedTopics} onTopicsChange={setSelectedTopics} mode="edit" />
            </div>

            {/* Link to Trip (for 'new' mode only) */}
            {mode === 'new' && allTrips.length > 0 && (
              <div>
                <Label className="text-foreground font-medium flex items-center gap-2 text-sm">
                  <Link2 className="w-4 h-4 text-primary" /> {isArabic ? 'ربط برحلة (اختياري)' : 'Link to Trip (optional)'}
                </Label>
                <Select value={linkedTripId} onValueChange={(v) => setLinkedTripIds(v === 'none' ? [] : [v])}>
                  <SelectTrigger className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm">
                    <SelectValue placeholder={isArabic ? 'اختر رحلة محفوظة...' : 'Select a saved trip...'} />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                    <SelectItem value="none">{isArabic ? 'بدون ربط' : 'No trip linked'}</SelectItem>
                    {allTrips.map(trip => (
                      <SelectItem key={trip.id} value={trip.id}>
                        🗺️ {trip.destination} ({trip.activities.length} {isArabic ? 'فعالية' : 'act.'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-foreground font-medium text-sm">{isArabic ? 'نصائح السفر' : 'Travel tips'}</Label>
              <Textarea placeholder={isArabic ? 'نصائح للمسافرين...' : 'Tips for travelers...'} value={formData.travel_tips}
                onChange={(e) => setFormData(prev => ({ ...prev, travel_tips: e.target.value }))} className="mt-1.5 min-h-[56px] sm:min-h-[60px] bg-background border-border rounded-xl text-sm" dir="auto" />
            </div>

            <div>
              <Label className="text-foreground font-medium text-sm">{isArabic ? 'رابط فيديو (اختياري)' : 'Video URL (optional)'}</Label>
              <Input placeholder="https://youtube.com/watch?v=..." value={formData.video_url}
                onChange={(e) => setFormData(prev => ({ ...prev, video_url: e.target.value }))} className="mt-1.5 bg-background border-border rounded-xl h-10 sm:h-11 text-sm" />
            </div>

            {/* Story Media Editor (Stickers, Filters, Music, Templates) */}
            {previewUrls.length > 0 && (
              <div className="bg-muted/30 rounded-2xl p-3 sm:p-4">
                <Label className="text-foreground font-medium mb-3 flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {isArabic ? 'محرر الوسائط' : 'Media Editor'}
                </Label>
                <StoryMediaEditor
                  previewUrls={previewUrls}
                  stickers={storyStickers}
                  onStickersChange={setStoryStickers}
                  activeFilter={storyFilter}
                  onFilterChange={setStoryFilter}
                />
              </div>
            )}

            {/* Media Upload */}
            <div>
              <Label className="text-foreground font-medium text-sm">{isArabic ? 'صور وفيديوهات' : 'Photos & Videos'}</Label>
              <div className="mt-1.5 flex gap-2">
                <input type="file" multiple accept="image/*,video/*" onChange={handleFileChange} className="hidden" id="media-upload" />
                <label htmlFor="media-upload"
                  className="flex items-center justify-center flex-1 h-20 sm:h-24 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                  <div className="text-center">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-1.5 group-hover:bg-primary/20 transition-colors">
                      <Upload className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-xs font-medium text-foreground">{isArabic ? 'رفع' : 'Upload'}</p>
                  </div>
                </label>
                <button type="button" onClick={() => setShowCamera(true)}
                  className="flex items-center justify-center w-20 sm:w-24 h-20 sm:h-24 border-2 border-dashed border-accent/40 rounded-2xl cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group">
                  <div className="text-center">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-1.5 group-hover:bg-accent/20 transition-colors">
                      <Camera className="w-4 h-4 text-accent" />
                    </div>
                    <p className="text-xs font-medium text-foreground">{isArabic ? 'كاميرا' : 'Camera'}</p>
                  </div>
                </button>
              </div>
              <AnimatePresence>
                {previewUrls.length > 0 && (
                  <motion.div key="media-previews" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex flex-wrap gap-2 mt-3">
                    {previewUrls.map((url, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden group border border-border" style={{ width: 64, height: 64 }}>
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeFile(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-3 h-3 text-destructive-foreground" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {showCamera && (
              <CameraCapture onCapture={(file) => {
                setMediaFiles(prev => [...prev, file]);
                setPreviewUrls(prev => [...prev, URL.createObjectURL(file)]);
                setShowCamera(false);
              }} onClose={() => setShowCamera(false)} />
            )}

            {/* Reels Export Option */}
            {previewUrls.length >= 2 && (
              <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Film className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{isArabic ? 'تصدير كـ Reels' : 'Export as Reels'}</p>
                  <p className="text-[10px] text-muted-foreground">{isArabic ? `${previewUrls.length} صور جاهزة للتحويل لفيديو سينمائي` : `${previewUrls.length} photos ready to convert to cinematic video`}</p>
                </div>
                <Badge className="bg-violet-500/20 text-violet-600 dark:text-violet-400 border-0 text-[10px]">{isArabic ? 'تلقائي' : 'Auto'}</Badge>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1 sm:pt-2">
              <div className="flex gap-2 sm:gap-3">
                <Button type="button" variant="outline" onClick={onCancel} className="flex-1 rounded-xl h-10 sm:h-11 text-sm">
                  {isArabic ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" disabled={loading || uploadingMedia} className="flex-1 rounded-xl h-10 sm:h-11 bg-accent hover:bg-accent/90 text-accent-foreground gap-2 shadow-md text-sm">
                  {(loading || uploadingMedia) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {loading ? (isArabic ? 'جاري النشر...' : 'Publishing...') : (isArabic ? 'نشر القصة 🚀' : 'Publish Story 🚀')}
                </Button>
              </div>
              <Button type="button" variant="outline" disabled={loading || uploadingMedia}
                onClick={(e) => handleSubmit(e as any, true)}
                className="w-full rounded-xl h-10 gap-2 border-primary/20 text-primary hover:bg-primary/5 text-sm">
                <Bookmark className="w-4 h-4" />
                {isArabic ? 'حفظ كذكرى خاصة 💾' : 'Save as Private Memory 💾'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </div>
  );
};
