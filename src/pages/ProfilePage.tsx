import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { User, Heart, History, Settings, LogOut, Loader2, Trash2, MapPin, Calendar, Plane, Hotel, Car, RefreshCw, CheckCircle2, Clock, MousePointer2, Camera, Image as ImageIcon, Lock, Bell, Eye, EyeOff, Shield, BookOpen, Film, Archive, Sparkles, Pencil, CreditCard, Star, Gift, Package, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import MemoryAlbum from "@/components/profile/MemoryAlbum";
import OnThisDayBanner from "@/components/profile/OnThisDayBanner";

interface Profile {
  full_name: string;
  email: string;
  preferred_language: string;
  preferred_currency: string;
  travel_interests: string[];
  avatar_url?: string;
  username?: string;
  gender?: string;
  country?: string;
  birthdate?: string;
  total_points?: number;
}

interface Favorite {
  id: string;
  place_name: string;
  place_type: string;
  destination: string;
  created_at: string;
}

interface SearchHistoryItem {
  id: string;
  search_type: string;
  query_text: string;
  destination: string;
  created_at: string;
}

interface SavedTrip {
  id: string;
  trip_id: string;
  destination: string;
  trip_data: any;
  created_at: string;
}

const AVATAR_PRESETS = [
  // Avataaars
  'https://api.dicebear.com/7.x/avataaars/svg?seed=adventurer1',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=traveler2',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=explorer3',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=nomad4',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=wanderer5',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=voyager6',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=pilgrim7',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=roamer8',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=drifter9',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=globetrotter10',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=backpacker11',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=hiker12',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=captain13',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=sailor14',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=pilot15',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=guide16',
  // Lorelei
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female1',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female2',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female3',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female4',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female5',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female6',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female7',
  'https://api.dicebear.com/7.x/lorelei/svg?seed=female8',
  // Personas
  'https://api.dicebear.com/7.x/personas/svg?seed=persona1',
  'https://api.dicebear.com/7.x/personas/svg?seed=persona2',
  'https://api.dicebear.com/7.x/personas/svg?seed=persona3',
  'https://api.dicebear.com/7.x/personas/svg?seed=persona4',
  'https://api.dicebear.com/7.x/personas/svg?seed=persona5',
  'https://api.dicebear.com/7.x/personas/svg?seed=persona6',
  // Adventurer
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char1',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char2',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char3',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char4',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char5',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char6',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char7',
  'https://api.dicebear.com/7.x/adventurer/svg?seed=char8',
  // Fun Emoji
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=happy1',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=cool2',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=smile3',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=wink4',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=laugh5',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=star6',
  // Bottts
  'https://api.dicebear.com/7.x/bottts/svg?seed=robot1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=robot2',
  'https://api.dicebear.com/7.x/bottts/svg?seed=robot3',
  'https://api.dicebear.com/7.x/bottts/svg?seed=robot4',
  // Thumbs
  'https://api.dicebear.com/7.x/thumbs/svg?seed=thumb1',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=thumb2',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=thumb3',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=thumb4',
  // Notionists
  'https://api.dicebear.com/7.x/notionists/svg?seed=notion1',
  'https://api.dicebear.com/7.x/notionists/svg?seed=notion2',
  'https://api.dicebear.com/7.x/notionists/svg?seed=notion3',
  'https://api.dicebear.com/7.x/notionists/svg?seed=notion4',
  // Open Peeps
  'https://api.dicebear.com/7.x/open-peeps/svg?seed=peep1',
  'https://api.dicebear.com/7.x/open-peeps/svg?seed=peep2',
  'https://api.dicebear.com/7.x/open-peeps/svg?seed=peep3',
  'https://api.dicebear.com/7.x/open-peeps/svg?seed=peep4',
];

const ALL_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan",
  "Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia",
  "Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica",
  "Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt",
  "El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon",
  "Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
  "Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel",
  "Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait",
  "Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg",
  "Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico",
  "Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru",
  "Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman",
  "Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal",
  "Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","São Tomé and Príncipe",
  "Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria",
  "Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey",
  "Turkmenistan","Tuvalu","UAE","Uganda","Ukraine","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu",
  "Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];

const ProfilePage = () => {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [stories, setStories] = useState<any[]>([]);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [editingStory, setEditingStory] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Subscriptions & Orders
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [pointsHistory, setPointsHistory] = useState<any[]>([]);
  const [countrySearch, setCountrySearch] = useState('');

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [profileRes, favRes, histRes, tripsRes, storiesRes, memoriesRes, subsRes, ordersRes, pointsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("favorites").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("search_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("saved_trips").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("travel_stories").select("id, title, content, media_urls, created_at, likes_count").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("memories").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("user_subscriptions").select("*, subscription_plans(name, name_ar, price, currency, duration_days, max_total_activities, max_daily_generations)").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("user_points").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (profileRes.data) setProfile(profileRes.data as any);
    if (favRes.data) setFavorites(favRes.data as any);
    if (histRes.data) setHistory(histRes.data as any);
    if (tripsRes.data) setSavedTrips(tripsRes.data as any);
    if (storiesRes.data) setStories(storiesRes.data as any);
    if (memoriesRes.data) setMemories(memoriesRes.data as any);
    if (subsRes.data) setSubscriptions(subsRes.data as any);
    if (ordersRes.data) setOrders(ordersRes.data as any);
    if (pointsRes.data) setPointsHistory(pointsRes.data as any);
    setLoading(false);
  };

  const updateProfile = async () => {
    if (!user || !profile) return;
    // Validate username uniqueness
    if (profile.username) {
      const { data: existing } = await supabase.from("profiles").select("id").eq("username", profile.username).neq("id", user.id).maybeSingle();
      if (existing) { toast.error(isArabic ? 'اسم المستخدم مأخوذ بالفعل' : 'Username already taken'); return; }
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name,
      username: profile.username || null,
      gender: profile.gender || null,
      country: profile.country || null,
      birthdate: profile.birthdate || null,
      preferred_language: profile.preferred_language,
      preferred_currency: profile.preferred_currency,
      travel_interests: profile.travel_interests,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    if (error) toast.error(t("common.error"));
    else toast.success(isArabic ? 'تم الحفظ ✅' : 'Saved! ✅');
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { toast.error(isArabic ? 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)' : 'Password too short (min 6 chars)'); return; }
    if (newPassword !== confirmPassword) { toast.error(isArabic ? 'كلمات المرور غير متطابقة' : 'Passwords do not match'); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error(error.message);
    else { toast.success(isArabic ? 'تم تغيير كلمة المرور ✅' : 'Password changed ✅'); setShowPasswordDialog(false); setNewPassword(''); setConfirmPassword(''); }
    setChangingPassword(false);
  };

  const removeFavorite = async (id: string) => {
    await supabase.from("favorites").delete().eq("id", id);
    setFavorites(prev => prev.filter(f => f.id !== id));
    toast.success(isArabic ? 'تمت الإزالة' : 'Removed');
  };

  const deleteTrip = async (id: string) => {
    await supabase.from("saved_trips").delete().eq("id", id);
    setSavedTrips(prev => prev.filter(t => t.id !== id));
    toast.success(isArabic ? 'تم الحذف' : 'Deleted');
  };

  const deleteStory = async (id: string) => {
    await supabase.from("travel_stories").delete().eq("id", id);
    setStories(prev => prev.filter(s => s.id !== id));
    toast.success(isArabic ? 'تم حذف القصة' : 'Story deleted');
  };

  const openEditStory = (story: any) => {
    setEditingStory(story);
    setEditTitle(story.title || '');
    setEditContent(story.content || '');
  };

  const saveEditStory = async () => {
    if (!editingStory) return;
    setSavingEdit(true);
    const { error } = await supabase.from("travel_stories").update({
      title: editTitle,
      content: editContent,
      updated_at: new Date().toISOString(),
    }).eq("id", editingStory.id);
    if (error) { toast.error(isArabic ? 'خطأ في الحفظ' : 'Save failed'); }
    else {
      setStories(prev => prev.map(s => s.id === editingStory.id ? { ...s, title: editTitle, content: editContent } : s));
      toast.success(isArabic ? 'تم تحديث القصة ✅' : 'Story updated ✅');
      setEditingStory(null);
    }
    setSavingEdit(false);
  };

  const clearHistory = async () => {
    if (!user) return;
    await supabase.from("search_history").delete().eq("user_id", user.id);
    setHistory([]);
    toast.success(isArabic ? 'تم مسح السجل' : 'History cleared');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('story-media').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('story-media').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
      setProfile(p => p ? { ...p, avatar_url: publicUrl } : p);
      toast.success(isArabic ? 'تم تحديث الصورة ✅' : 'Avatar updated ✅');
    } catch (err) {
      toast.error(isArabic ? 'فشل رفع الصورة' : 'Upload failed');
    } finally { setUploadingAvatar(false); }
  };

  const selectPresetAvatar = async (url: string) => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      await supabase.from('profiles').update({ avatar_url: url, updated_at: new Date().toISOString() }).eq('id', user.id);
      setProfile(p => p ? { ...p, avatar_url: url } : p);
      setShowAvatarPicker(false);
      toast.success(isArabic ? 'تم تحديث الصورة ✅' : 'Avatar updated ✅');
    } catch { toast.error(isArabic ? 'خطأ' : 'Error'); }
    finally { setUploadingAvatar(false); }
  };

  const activeSub = subscriptions.find((s: any) => s.status === 'active' && new Date(s.expires_at) > new Date());

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  );

  return (
    <div className="min-h-screen bg-background pt-20 pb-10 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 sm:gap-4 mb-6">
            {/* Avatar with edit */}
            <div className="relative group shrink-0">
              <Avatar className="w-18 h-18 sm:w-20 sm:h-20 border-4 border-primary/20 shadow-xl">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl"><User /></AvatarFallback>
              </Avatar>
              <input type="file" ref={avatarInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button onClick={() => avatarInputRef.current?.click()} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30">
                  <Camera className="w-4 h-4 text-white" />
                </button>
                <button onClick={() => setShowAvatarPicker(p => !p)} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30">
                  <ImageIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">{profile?.full_name || t('profile.title')}</h1>
              {profile?.username && <p className="text-xs text-primary font-medium">@{profile.username}</p>}
              <p className="text-muted-foreground text-xs sm:text-sm truncate">{user?.email}</p>
              <div className="flex gap-2 sm:gap-3 mt-1 text-[10px] sm:text-xs text-muted-foreground flex-wrap">
                <span><strong className="text-foreground">{stories.length}</strong> {isArabic ? 'قصص' : 'Stories'}</span>
                <span><strong className="text-foreground">{savedTrips.length}</strong> {isArabic ? 'رحلات' : 'Trips'}</span>
                <span><strong className="text-foreground">{favorites.length}</strong> {isArabic ? 'مفضلة' : 'Favs'}</span>
                <span className="flex items-center gap-0.5"><Star size={10} className="text-yellow-500 fill-yellow-500" /><strong className="text-foreground">{profile?.total_points || 0}</strong> {isArabic ? 'نقطة' : 'pts'}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => navigate('/invoices')} className="gap-1 text-xs">
                <CreditCard size={12} /> {isArabic ? 'فواتيري' : 'Invoices'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-1 text-xs">
                <LogOut size={12} /> {isArabic ? 'خروج' : 'Sign Out'}
              </Button>
            </div>
          </div>

          {/* Avatar preset picker */}
          <AnimatePresence>
            {showAvatarPicker && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-card border border-border rounded-2xl p-4 mb-4 overflow-hidden">
                <p className="text-sm font-medium text-foreground mb-3">{isArabic ? 'اختر شخصيتك' : 'Choose your avatar'}</p>
                <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-56 overflow-y-auto">
                  {AVATAR_PRESETS.map((url, i) => (
                    <button key={i} onClick={() => selectPresetAvatar(url)}
                      className="w-full aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-primary transition-colors">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* On This Day Banner */}
          {user && <OnThisDayBanner userId={user.id} isArabic={isArabic} onViewMemory={() => {}} />}

          <Tabs defaultValue="profile" className="space-y-4">
            <TabsList className="w-full grid grid-cols-4 sm:grid-cols-8 h-auto">
              <TabsTrigger value="profile" className="gap-1 text-[10px] sm:text-xs py-2"><User size={12} />{isArabic ? 'ملفي' : 'Profile'}</TabsTrigger>
              <TabsTrigger value="subscriptions" className="gap-1 text-[10px] sm:text-xs py-2"><Crown size={12} />{isArabic ? 'باقاتي' : 'Plans'}</TabsTrigger>
              <TabsTrigger value="trips" className="gap-1 text-[10px] sm:text-xs py-2"><Plane size={12} />{isArabic ? 'رحلات' : 'Trips'}</TabsTrigger>
              <TabsTrigger value="stories" className="gap-1 text-[10px] sm:text-xs py-2"><BookOpen size={12} />{isArabic ? 'قصص' : 'Stories'}</TabsTrigger>
              <TabsTrigger value="memories" className="gap-1 text-[10px] sm:text-xs py-2"><Archive size={12} />{isArabic ? 'ذكريات' : 'Memories'}</TabsTrigger>
              <TabsTrigger value="favorites" className="gap-1 text-[10px] sm:text-xs py-2"><Heart size={12} />{isArabic ? 'مفضلة' : 'Favs'}</TabsTrigger>
              <TabsTrigger value="security" className="gap-1 text-[10px] sm:text-xs py-2"><Shield size={12} />{isArabic ? 'الأمان' : 'Security'}</TabsTrigger>
              <TabsTrigger value="history" className="gap-1 text-[10px] sm:text-xs py-2"><History size={12} />{isArabic ? 'السجل' : 'History'}</TabsTrigger>
            </TabsList>

            {/* Profile Settings */}
            <TabsContent value="profile" className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'الاسم الكامل' : 'Full Name'}</Label>
                  <Input value={profile?.full_name || ""} onChange={e => setProfile(p => p ? { ...p, full_name: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'اسم المستخدم' : 'Username'}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input value={profile?.username || ""} onChange={e => setProfile(p => p ? { ...p, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') } : p)} className="pl-8" placeholder="username" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'تاريخ الميلاد' : 'Birthdate'}</Label>
                  <Input type="date" value={profile?.birthdate || ""} onChange={e => setProfile(p => p ? { ...p, birthdate: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'الجنس' : 'Gender'}</Label>
                  <Select value={profile?.gender || ""} onValueChange={v => setProfile(p => p ? { ...p, gender: v } : p)}>
                    <SelectTrigger><SelectValue placeholder={isArabic ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{isArabic ? 'ذكر' : 'Male'}</SelectItem>
                      <SelectItem value="female">{isArabic ? 'أنثى' : 'Female'}</SelectItem>
                      <SelectItem value="other">{isArabic ? 'آخر' : 'Other'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'الدولة' : 'Country'}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal text-sm h-10">
                        {profile?.country || (isArabic ? 'اختر الدولة' : 'Select country')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 max-h-64 overflow-hidden" align="start">
                      <Input
                        placeholder={isArabic ? 'ابحث عن دولة...' : 'Search country...'}
                        value={countrySearch}
                        onChange={e => setCountrySearch(e.target.value)}
                        className="mb-2 h-8 text-xs"
                      />
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {ALL_COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                          <button key={c} onClick={() => { setProfile(p => p ? { ...p, country: c } : p); setCountrySearch(''); }}
                            className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${profile?.country === c ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'اللغة' : 'Language'}</Label>
                  <Input value={profile?.preferred_language || ""} onChange={e => setProfile(p => p ? { ...p, preferred_language: e.target.value } : p)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isArabic ? 'العملة' : 'Currency'}</Label>
                  <Input value={profile?.preferred_currency || ""} onChange={e => setProfile(p => p ? { ...p, preferred_currency: e.target.value } : p)} />
                </div>
              </div>
              <Button onClick={updateProfile} disabled={saving} className="gap-1.5 w-full sm:w-auto">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {isArabic ? 'حفظ التغييرات' : 'Save Changes'}
              </Button>
            </TabsContent>

            {/* Subscriptions & Purchases */}
            <TabsContent value="subscriptions" className="space-y-4">
              {/* Points Summary */}
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Star size={16} className="text-yellow-500" />{isArabic ? 'نقاطي' : 'My Points'}</h3>
                  <Badge variant="secondary" className="text-lg font-black">{profile?.total_points || 0}</Badge>
                </div>
                {pointsHistory.length > 0 && (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {pointsHistory.slice(0, 5).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate flex-1">{p.reason}</span>
                        <span className={`font-bold ${p.points > 0 ? 'text-green-600' : 'text-red-500'}`}>{p.points > 0 ? '+' : ''}{p.points}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Subscription */}
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
                <h3 className="font-bold text-foreground flex items-center gap-2 mb-3"><Crown size={16} className="text-primary" />{isArabic ? 'الباقة الحالية' : 'Current Plan'}</h3>
                {activeSub ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{isArabic ? (activeSub.subscription_plans as any)?.name_ar : (activeSub.subscription_plans as any)?.name}</span>
                      <Badge className="bg-green-100 text-green-700">{isArabic ? 'نشطة' : 'Active'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>{isArabic ? 'تنتهي في' : 'Expires'}: {new Date(activeSub.expires_at).toLocaleDateString()}</p>
                      <p>{isArabic ? 'الأنشطة القصوى' : 'Max Activities'}: {(activeSub.subscription_plans as any)?.max_total_activities || '∞'}</p>
                      <p>{isArabic ? 'التوليدات اليومية' : 'Daily Generations'}: {(activeSub.subscription_plans as any)?.max_daily_generations || '∞'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">{isArabic ? 'لا توجد باقة نشطة' : 'No active plan'}</p>
                    <Button size="sm" onClick={() => navigate('/pricing')} className="gap-1.5"><Crown size={12} />{isArabic ? 'اشترك الآن' : 'Subscribe Now'}</Button>
                  </div>
                )}
              </div>

              {/* Subscription History */}
              {subscriptions.length > 1 && (
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="font-bold text-sm text-foreground mb-2">{isArabic ? 'سجل الاشتراكات' : 'Subscription History'}</h3>
                  <div className="space-y-2">
                    {subscriptions.filter((s: any) => s !== activeSub).map((sub: any) => (
                      <div key={sub.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                        <span className="text-foreground">{isArabic ? (sub.subscription_plans as any)?.name_ar : (sub.subscription_plans as any)?.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{sub.status}</Badge>
                          <span className="text-muted-foreground">{new Date(sub.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Orders */}
              <div className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground flex items-center gap-2"><Package size={16} />{isArabic ? 'مشترياتي' : 'My Purchases'}</h3>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => navigate('/invoices')}>
                    {isArabic ? 'فواتيري' : 'My Invoices'}
                  </Button>
                </div>
                {orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">{isArabic ? 'لا توجد مشتريات' : 'No purchases yet'}</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {orders.map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                        <div>
                          <p className="font-medium text-foreground">{order.item_name}</p>
                          <p className="text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-foreground">{order.total_price} {order.currency}</p>
                          <Badge variant="outline" className={`text-[10px] ${order.status === 'completed' ? 'text-green-600' : order.status === 'pending' ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Trips */}
            <TabsContent value="trips" className="space-y-3">
              {savedTrips.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                  <Plane size={32} className="mx-auto mb-2 opacity-30" />
                   <p>{t('profilePage.noSavedTrips')}</p>
                   <Button className="mt-3" onClick={() => navigate("/")}>{t('profilePage.planTrip')}</Button>
                 </div>
              ) : savedTrips.map(trip => (
                <div key={trip.id} className="bg-card border border-border rounded-xl p-3 sm:p-4 hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => { localStorage.setItem(`itinerary-${trip.trip_id}`, JSON.stringify(trip.trip_data)); navigate(`/itinerary/${trip.trip_id}`); }}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground flex items-center gap-1.5 text-sm"><MapPin size={13} className="text-primary shrink-0" /><span className="truncate">{trip.destination}</span></p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Calendar size={11} />{new Date(trip.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate('/stories', { state: { openCreateForm: true, linkedTripId: trip.id } }); }}>
                        <Film size={12} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteTrip(trip.id); }}>
                        <Trash2 size={13} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* Stories Management */}
            <TabsContent value="stories" className="space-y-3">
              {stories.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                   <p>{t('profilePage.noStories')}</p>
                   <Button className="mt-3" onClick={() => navigate('/stories', { state: { openCreateForm: true } })}>{t('profilePage.publishStory')}</Button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {stories.map(story => (
                    <div key={story.id} className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
                      onClick={() => navigate(`/stories?id=${story.id}`)}>
                      {story.media_urls?.[0] ? (
                        <img src={story.media_urls[0]} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <MapPin className="w-6 h-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <span className="text-white text-[10px] flex items-center gap-1"><Heart className="w-3 h-3 fill-white" />{story.likes_count || 0}</span>
                        <div className="flex gap-1 mt-1">
                          <button onClick={(e) => { e.stopPropagation(); openEditStory(story); }}
                            className="p-1 bg-primary/80 rounded-full"><Pencil className="w-3 h-3 text-primary-foreground" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteStory(story.id); }}
                            className="p-1 bg-destructive/80 rounded-full"><Trash2 className="w-3 h-3 text-destructive-foreground" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Security & Privacy */}
            <TabsContent value="security" className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-5">
                <h3 className="font-bold text-foreground flex items-center gap-2"><Lock size={16} />{isArabic ? 'الأمان' : 'Security'}</h3>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{isArabic ? 'تغيير كلمة المرور' : 'Change Password'}</p>
                    <p className="text-xs text-muted-foreground">{isArabic ? 'تحديث كلمة المرور الخاصة بك' : 'Update your password'}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)} className="gap-1.5 rounded-xl">
                    <Lock size={12} />{isArabic ? 'تغيير' : 'Change'}
                  </Button>
                </div>

                <div className="border-t border-border pt-4">
                  <h3 className="font-bold text-foreground flex items-center gap-2 mb-3"><Bell size={16} />{isArabic ? 'الإشعارات' : 'Notifications'}</h3>
                  {[
                    { label: isArabic ? 'إشعارات الإعجاب' : 'Like notifications', key: 'likes' },
                    { label: isArabic ? 'إشعارات التعليقات' : 'Comment notifications', key: 'comments' },
                    { label: isArabic ? 'إشعارات المتابعين' : 'Follower notifications', key: 'followers' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-sm text-foreground">{item.label}</span>
                      <Switch defaultChecked />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Memories */}
            <TabsContent value="memories" className="space-y-3">
              <MemoryAlbum
                memories={memories}
                isArabic={isArabic}
                userId={user!.id}
                onUpdate={loadData}
                onPublish={async (memory: any) => {
                  await supabase.from('memories').update({ is_published: true }).eq('id', memory.id);
                  await supabase.from('travel_stories').insert({
                    title: memory.title, content: memory.description || '',
                    location_name: memory.location_name,
                    latitude: memory.latitude, longitude: memory.longitude,
                    media_urls: memory.media_urls || [], video_url: memory.video_url,
                    trip_data: memory.trip_data, user_id: user!.id, likes_count: 0,
                  });
                  toast.success(isArabic ? 'تم نشر الذكرى ✅' : 'Memory published! ✅');
                  loadData();
                }}
              />
            </TabsContent>

            <TabsContent value="favorites" className="space-y-3">
              {favorites.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                  <Heart size={32} className="mx-auto mb-2 opacity-30" />
                  <p>{t('profilePage.noFavorites')}</p>
                </div>
              ) : favorites.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-xl p-3 sm:p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground text-sm truncate">{f.place_name}</p>
                    <p className="text-xs text-muted-foreground">{f.destination} · {f.place_type}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeFavorite(f.id)}><Trash2 size={14} className="text-destructive" /></Button>
                </div>
              ))}
            </TabsContent>

            {/* History */}
            <TabsContent value="history" className="space-y-3">
              <div className="flex justify-end">
                {history.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive gap-1.5">
                    <Trash2 size={12} />{isArabic ? 'مسح السجل' : 'Clear History'}
                  </Button>
                )}
              </div>
              {history.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">
                  <History size={32} className="mx-auto mb-2 opacity-30" />
                  <p>{t('profilePage.noSearchHistory')}</p>
                </div>
              ) : history.map(h => (
                <div key={h.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{h.query_text || h.destination || h.search_type}</p>
                    <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5" />{isArabic ? 'تغيير كلمة المرور' : 'Change Password'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{isArabic ? 'كلمة المرور الجديدة' : 'New Password'}</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="pr-10" />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{isArabic ? 'تأكيد كلمة المرور' : 'Confirm Password'}</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            <Button onClick={handleChangePassword} disabled={changingPassword} className="w-full gap-2">
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {isArabic ? 'تحديث كلمة المرور' : 'Update Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Story Dialog */}
      <Dialog open={!!editingStory} onOpenChange={(open) => { if (!open) setEditingStory(null); }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-5 h-5" />{isArabic ? 'تعديل القصة' : 'Edit Story'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{isArabic ? 'العنوان' : 'Title'}</Label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{isArabic ? 'المحتوى' : 'Content'}</Label>
              <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={5} />
            </div>
            <Button onClick={saveEditStory} disabled={savingEdit} className="w-full gap-2">
              {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isArabic ? 'حفظ التعديلات' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProfilePage;
