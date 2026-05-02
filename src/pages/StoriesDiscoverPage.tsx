import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

import { supabase } from "@/integrations/supabase/client";
import { StoryCard } from "@/components/stories/StoryCard";
import { StoryFeed } from "@/components/stories/StoryFeed";
import { CreateStoryForm } from "@/components/stories/CreateStoryForm";
import { CommentsSection } from "@/components/stories/CommentsSection";
import { StoryMapView } from "@/components/stories/StoryMapView";
import { TravelLeaderboard } from "@/components/stories/TravelLeaderboard";
import { AutoStoryGenerator } from "@/components/stories/AutoStoryGenerator";
import { StoryHeatmap } from "@/components/stories/StoryHeatmap";
import { StoryHighlights } from "@/components/stories/StoryHighlights";
import { FeaturedAdventures } from "@/components/stories/FeaturedAdventures";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MapPin, Plus, Search, Users, Award, Map, TrendingUp, BookOpen, Globe,
  Compass, Mountain, Waves, Tent, Anchor, Sun, Building2, Play, Eye, Flame, Wand2, Sparkles, ArrowRight, Trash2, Edit, User, Film, Filter
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { awardPoints } from "@/utils/pointsSystem";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { attachProfiles } from "@/utils/publicProfiles";

interface Story {
  id: string;
  title: string;
  content: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  media_urls?: string[];
  video_url?: string;
  trip_data?: any;
  likes_count: number;
  created_at: string;
  user_id: string;
  profiles?: { full_name?: string; avatar_url?: string };
  is_liked?: boolean;
  comments_count?: number;
}

const ADVENTURE_CATEGORIES = [
  { id: "all", label: "الكل", labelEn: "All", icon: Globe, gradient: "from-primary to-primary/70" },
  { id: "desert", label: "صحراء", labelEn: "Desert", icon: Sun, gradient: "from-amber-500 to-orange-600" },
  { id: "mountain", label: "جبال", labelEn: "Mountains", icon: Mountain, gradient: "from-emerald-500 to-green-700" },
  { id: "beach", label: "شاطئ", labelEn: "Beach", icon: Waves, gradient: "from-sky-400 to-blue-600" },
  { id: "camping", label: "تخييم", labelEn: "Camping", icon: Tent, gradient: "from-green-500 to-emerald-700" },
  { id: "diving", label: "غوص", labelEn: "Diving", icon: Anchor, gradient: "from-blue-400 to-indigo-600" },
  { id: "city", label: "مدينة", labelEn: "City", icon: Building2, gradient: "from-violet-500 to-purple-600" },
  { id: "cultural", label: "ثقافة", labelEn: "Culture", icon: Compass, gradient: "from-rose-400 to-red-600" },
];



const StoriesDiscoverPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');

  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [prefilledTripId, setPrefilledTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("explore");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [stats, setStats] = useState({ stories: 0, destinations: 0, users: 0 });
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [feedView, setFeedView] = useState<'feed' | 'grid'>('grid');
  const [activeTopicFilter, setActiveTopicFilter] = useState<string | null>(null);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [allLocations, setAllLocations] = useState<string[]>([]);

  // Parse URL search params for hashtag/topic/location filtering
  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const search = params.get('search');
    const topic = params.get('topic');
    const tab = params.get('tab');
    if (search) {
      const decoded = decodeURIComponent(search).replace(/^#/, '');
      setSearchTerm(decoded);
    } else {
      setSearchTerm('');
    }
    if (topic) {
      setActiveTopicFilter(topic);
    } else {
      setActiveTopicFilter(null);
    }
    if (tab) {
      setActiveTab(tab);
    }
  }, [loc.search]);

  useEffect(() => {
    if (!authLoading) { fetchStories(); fetchStats(); if (user) { fetchSavedTrips(); fetchMyStories(); } }
  }, [authLoading, activeTab, selectedCategory, searchTerm, activeTopicFilter]);

  const fetchMyStories = async () => {
    if (!user) return;
    const { data } = await supabase.from("travel_stories").select(`*, profiles!travel_stories_user_id_fkey (full_name, avatar_url, username)`)
      .eq("user_id", user.id).order("created_at", { ascending: false });
    setMyStories((data || []).map(s => ({ ...s, likes_count: s.likes_count || 0, is_liked: false, comments_count: 0 })));
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!user) return;
    setDeletingStoryId(storyId);
    try {
      await supabase.from("story_likes").delete().eq("story_id", storyId);
      await supabase.from("story_comments").delete().eq("story_id", storyId);
      const { error } = await supabase.from("travel_stories").delete().eq("id", storyId).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: isArabic ? 'تم الحذف' : 'Deleted', description: isArabic ? 'تم حذف القصة بنجاح' : 'Story deleted successfully' });
      setMyStories(prev => prev.filter(s => s.id !== storyId));
      setStories(prev => prev.filter(s => s.id !== storyId));
    } catch (e: any) {
      toast({ title: isArabic ? 'خطأ' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingStoryId(null);
    }
  };

  const fetchSavedTrips = async () => {
    if (!user) return;
    const { data } = await supabase.from('saved_trips').select('id, trip_id, destination, trip_data, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
    setSavedTrips(data || []);
  };

  useEffect(() => {
    if (loc.state?.openCreateForm) {
      setShowCreateForm(true);
      if (loc.state?.linkedTripId) setPrefilledTripId(loc.state.linkedTripId);
      window.history.replaceState({}, document.title);
    }
  }, [loc.state]);

  const fetchStats = async () => {
    const [s, d, u] = await Promise.all([
      supabase.from("travel_stories").select("*", { count: "exact", head: true }),
      supabase.from("travel_stories").select("location_name").not("location_name", "is", null),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
    ]);
    setStats({ stories: s.count || 0, destinations: new Set(d.data?.map(x => x.location_name)).size, users: u.count || 0 });
    // Extract unique locations for filter
    const locs = [...new Set((d.data || []).map((x: any) => x.location_name).filter(Boolean))] as string[];
    setAllLocations(locs.sort());
  };

  const fetchStories = async () => {
    try {
      setLoading(true);
      let query = supabase.from("travel_stories").select("*").order("created_at", { ascending: false }).limit(20);
      if (activeTab === "following" && user) {
        const { data: follows } = await supabase.from("user_follows").select("following_id").eq("follower_id", user.id);
        if (follows?.length) query = query.in("user_id", follows.map(f => f.following_id));
        else { setStories([]); setLoading(false); return; }
      }
      if (searchTerm) query = query.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,location_name.ilike.%${searchTerm}%`);
      const { data, error } = await query;
      if (error) throw error;
      const withProfiles = await attachProfiles((data || []) as any[]);
      let mapped = await Promise.all(withProfiles.map(async (story) => {
        const [{ count: lc }, { count: cc }] = await Promise.all([
          supabase.from("story_likes").select("*", { count: "exact", head: true }).eq("story_id", story.id),
          supabase.from("story_comments").select("*", { count: "exact", head: true }).eq("story_id", story.id),
        ]);
        let isLiked = false;
        if (user) { const { data: ul } = await supabase.from("story_likes").select("id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle(); isLiked = !!ul; }
        return { ...story, likes_count: lc || 0, is_liked: isLiked, comments_count: cc || 0 };
      }));
      
      // Client-side filtering for hashtags, topics, and search from URL
      if (searchTerm || activeTopicFilter) {
        mapped = mapped.filter(s => {
          let matches = true;
          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const hashtags = ((s.trip_data as any)?.hashtags || []) as string[];
            const matchesHashtag = hashtags.some(h => h.toLowerCase().includes(term));
            const matchesTitle = s.title.toLowerCase().includes(term);
            const matchesContent = s.content.toLowerCase().includes(term);
            const matchesLocation = (s.location_name || '').toLowerCase().includes(term);
            matches = matchesHashtag || matchesTitle || matchesContent || matchesLocation;
          }
          if (activeTopicFilter) {
            const topics = ((s.trip_data as any)?.topics || []) as string[];
            matches = matches && topics.includes(activeTopicFilter);
          }
          return matches;
        });
      }
      setStories(mapped);
    } catch (e) { 
      console.error("Error fetching stories:", e);
      setStories([]); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleLikeStory = async (storyId: string, isLiked: boolean) => {
    if (!user) { navigate('/auth'); return; }
    try {
      if (isLiked) await supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", user.id);
      else {
        await supabase.from("story_likes").insert({ story_id: storyId, user_id: user.id });
        await awardPoints({ userId: user.id, action: "LIKE_STORY", reason: "Liked a travel story" });
        // Send notification to story owner
        try {
          const story = stories.find(s => s.id === storyId);
          if (story && story.user_id !== user.id) {
            const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
            const likerName = profile?.full_name || (isArabic ? 'مسافر' : 'Traveler');
            await supabase.from("notifications").insert({
              user_id: story.user_id,
              type: 'like',
              title: isArabic ? 'إعجاب جديد ❤️' : 'New Like ❤️',
              message: isArabic ? `${likerName} أعجب بقصتك` : `${likerName} liked your story`,
              metadata: { story_id: storyId, liker_id: user.id } as any,
            });
          }
        } catch {}
      }
      setStories(prev => prev.map(s => s.id === storyId ? { ...s, likes_count: isLiked ? s.likes_count - 1 : s.likes_count + 1, is_liked: !isLiked } : s));
    } catch (e) { console.error(e); }
  };

  const handlePlanSimilar = (story: Story) => {
    const routeSource = String(story.trip_data?.destination || story.location_name || '');
    const routeCities = routeSource
      .split(/(?:\s*→\s*|\s*->\s*|\s*➜\s*)/g)
      .map((city) => city.trim())
      .filter(Boolean);

    const destination = routeCities[0] || story.location_name || story.trip_data?.destination;
    if (!destination) return;
    const p = new URLSearchParams({ destination });
    if (story.trip_data?.budget) p.set('budget', String(story.trip_data.budget));
    const duration = Number(story.trip_data?.duration || story.trip_data?.itinerary?.length || story.trip_data?.days?.length || 0);
    if (duration > 0) p.set('duration', String(duration));
    if (story.trip_data?.category) p.set('tripType', story.trip_data.category);
    if (story.trip_data?.departureCity || story.trip_data?.departure_city)
      p.set('departure', story.trip_data.departureCity || story.trip_data.departure_city);
    if (story.trip_data?.travelers) p.set('travelers', String(story.trip_data.travelers));
    p.set('transport', story.trip_data?.intercityTransport || story.trip_data?.transport || 'flight');

    // Multi-city support
    const cities = story.trip_data?.cities || story.trip_data?.multiCities;
    if (Array.isArray(cities) && cities.length > 1) {
      p.set('multiCity', 'true');
      p.set('cities', JSON.stringify(cities.map((c: any) => ({
        name: c.name || c.city || c,
        days: c.days || c.duration || Math.ceil(duration / cities.length)
      }))));
    } else if (routeCities.length > 1) {
      p.set('multiCity', 'true');
      const fallbackDays = Math.max(1, Math.ceil((duration || routeCities.length) / routeCities.length));
      p.set('cities', JSON.stringify(routeCities.map((name) => ({ name, days: fallbackDays }))));
    }

    navigate(`/planner?${p.toString()}`);
  };

  const handleBook = (story: Story) => { if (story.location_name) navigate(`/destinations?search=${encodeURIComponent(story.location_name)}`); };

  const filteredStories = stories.filter(s => {
    if (selectedCategory !== 'all' && s.trip_data?.category !== selectedCategory) return false;
    if (locationFilter !== 'all' && s.location_name !== locationFilter) return false;
    return true;
  });

  if (authLoading) return <div className="flex justify-center items-center min-h-screen bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="min-h-screen bg-background pt-16">

      {/* Stats */}
      <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border">
        <div className="container mx-auto px-3 py-2.5 flex items-center justify-center gap-6">
          {[
            { label: isArabic ? 'مغامرات' : 'Adventures', value: stats.stories, icon: BookOpen },
            { label: isArabic ? 'وجهات' : 'Destinations', value: stats.destinations, icon: MapPin },
            { label: isArabic ? 'مسافرون' : 'Travelers', value: stats.users, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-primary" />
              <span className="text-base font-black text-foreground">{value}</span>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Categories - horizontal scroll */}
      <div className="px-3 py-2.5 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5">
          {ADVENTURE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            return (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                  active ? `bg-gradient-to-r ${cat.gradient} text-white border-transparent shadow` : 'bg-card text-foreground border-border hover:border-primary/40'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {isArabic ? cat.label : cat.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured */}
      <div className="px-3 mb-3">
        <FeaturedAdventures onExplore={(adv) => setSelectedCategory(adv.category.toLowerCase())} />
      </div>

      {/* Highlights */}
      <div className="px-3 mb-3">
        <StoryHighlights stories={filteredStories} onViewStory={(idx) => setViewerIndex(idx)} userId={user?.id} isOwner={!!user} />
      </div>

      {/* Avatar row */}
      <div className="px-3 mb-3">
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex flex-col items-center gap-1 shrink-0 cursor-pointer" onClick={() => setShowCreateForm(true)}>
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-primary flex items-center justify-center bg-card">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            <span className="text-[10px] font-medium text-foreground">{isArabic ? 'نشر' : 'Publish'}</span>
          </div>
          {filteredStories.slice(0, 10).map((story, idx) => (
            <div key={story.id} className="flex flex-col items-center gap-1 shrink-0 cursor-pointer" onClick={() => setViewerIndex(idx)}>
              <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-accent via-primary to-emerald-400 shadow">
                <img src={story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${story.user_id}`}
                  alt="" className="w-full h-full rounded-full border-2 border-background object-cover" />
              </div>
              <span className="text-[10px] font-medium text-foreground w-14 truncate text-center">{story.profiles?.full_name?.split(' ')[0] || 'User'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Active filters */}
      {(searchTerm || activeTopicFilter) && (
        <div className="px-3 mb-2 flex items-center gap-2 flex-wrap">
          {searchTerm && (
            <Badge className="bg-accent/10 text-accent border-accent/20 gap-1 text-xs cursor-pointer hover:bg-accent/20"
              onClick={() => { setSearchTerm(''); navigate('/stories/discover', { replace: true }); }}>
              #{searchTerm} ✕
            </Badge>
          )}
          {activeTopicFilter && (
            <Badge className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs cursor-pointer hover:bg-primary/20"
              onClick={() => { setActiveTopicFilter(null); navigate('/stories/discover', { replace: true }); }}>
              {activeTopicFilter} ✕
            </Badge>
          )}
          <button onClick={() => { setSearchTerm(''); setActiveTopicFilter(null); navigate('/stories/discover', { replace: true }); }}
            className="text-[10px] text-muted-foreground hover:text-foreground underline">
            {isArabic ? 'مسح الكل' : 'Clear all'}
          </button>
        </div>
      )}

      {/* CTA - Create Story */}
      <div className="px-3 mb-3">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-accent/15 via-primary/10 to-accent/15 border border-accent/20 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">{isArabic ? 'شارك مغامرتك الآن!' : 'Share your adventure!'}</p>
            <p className="text-[10px] text-muted-foreground">{isArabic ? 'انشر قصتك واكسب 5 نقاط' : 'Publish your story & earn 5 points'}</p>
          </div>
          <Button size="sm" onClick={() => user ? setShowCreateForm(true) : navigate('/auth')}
            className="rounded-xl h-9 px-4 bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5 shadow-md shrink-0">
            <Plus className="w-3.5 h-3.5" />
            {isArabic ? 'انشر' : 'Create'}
          </Button>
        </motion.div>
      </div>

      {/* Action buttons row */}
      <div className="px-3 mb-2 flex items-center gap-2">
        {!user && (
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="gap-1 text-[10px] rounded-xl shrink-0 border-primary/30 text-primary h-8 px-2">
            {isArabic ? 'سجل دخولك' : 'Sign in'}
          </Button>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
          <Input placeholder={isArabic ? 'ابحث عن مغامرات...' : 'Search...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchStories()} className="pl-8 h-8 rounded-xl text-xs" />
        </div>
        <Button variant="default" size="sm" onClick={() => navigate('/stories')} className="gap-1 text-[10px] rounded-xl shrink-0 h-8 px-3">
          <Play className="w-3 h-3" />{isArabic ? 'الفيد' : 'Feed'}
        </Button>
      </div>

      {/* Location filter */}
      {allLocations.length > 0 && (
        <div className="px-3 mb-3 flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-8 rounded-xl text-xs flex-1">
              <SelectValue placeholder={isArabic ? 'فلترة حسب الوجهة' : 'Filter by destination'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isArabic ? 'كل الوجهات' : 'All destinations'}</SelectItem>
              {allLocations.map(loc => (
                <SelectItem key={loc} value={loc}>{loc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locationFilter !== 'all' && (
            <Button variant="ghost" size="sm" onClick={() => setLocationFilter('all')} className="h-8 px-2 text-xs text-muted-foreground">
              ✕
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="px-3 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-4">
            <div className="overflow-x-auto no-scrollbar">
              <TabsList className="bg-card/80 backdrop-blur-sm border border-border p-1 rounded-xl shadow-sm inline-flex gap-0.5 w-max">
                <TabsTrigger value="explore" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  <TrendingUp className="w-3 h-3" />{isArabic ? 'استكشاف' : 'Explore'}
                </TabsTrigger>
                <TabsTrigger value="map" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  <Map className="w-3 h-3" />{isArabic ? 'خريطة' : 'Map'}
                </TabsTrigger>
                <TabsTrigger value="following" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap" disabled={!user}>
                  <Users className="w-3 h-3" />{isArabic ? 'متابعون' : 'Following'}
                </TabsTrigger>
                <TabsTrigger value="leaderboard" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  <Award className="w-3 h-3" />{isArabic ? 'متصدرون' : 'Leaders'}
                </TabsTrigger>
                <TabsTrigger value="heatmap" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  <Flame className="w-3 h-3" />{isArabic ? 'حرارية' : 'Heatmap'}
                </TabsTrigger>
                <TabsTrigger value="reels" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                  <Film className="w-3 h-3" />{isArabic ? 'ريلز' : 'Reels'}
                </TabsTrigger>
                {user && (
                  <TabsTrigger value="my-stories" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                    <User className="w-3 h-3" />{isArabic ? 'قصصي' : 'My Stories'}
                  </TabsTrigger>
                )}
                {user && savedTrips.length > 0 && (
                  <TabsTrigger value="auto-story" className="gap-1 text-[10px] rounded-lg px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap">
                    <Wand2 className="w-3 h-3" />Auto
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          <TabsContent value="explore">
            <div className="flex gap-2 mb-3">
              <Button variant={feedView === 'feed' ? 'default' : 'outline'} size="sm" onClick={() => setFeedView('feed')} className="rounded-xl gap-1 text-xs h-7">
                <Play className="w-3 h-3" />{isArabic ? 'بطاقات' : 'Cards'}
              </Button>
              <Button variant={feedView === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setFeedView('grid')} className="rounded-xl gap-1 text-xs h-7">
                <Eye className="w-3 h-3" />{isArabic ? 'شبكة' : 'Grid'}
              </Button>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-card rounded-2xl overflow-hidden border border-border animate-pulse">
                    <div className="h-40 bg-muted" /><div className="p-3 space-y-2"><div className="h-3 bg-muted rounded-full w-3/4" /></div>
                  </div>
                ))}
              </div>
            ) : filteredStories.length > 0 ? (
              feedView === 'feed' ? (
                <div className="max-w-lg mx-auto">
                  <StoryFeed stories={filteredStories} onStoryTap={(idx) => setViewerIndex(idx)}
                    onLike={(id) => handleLikeStory(id, filteredStories.find(s => s.id === id)?.is_liked || false)}
                    onPlanSimilar={handlePlanSimilar} onBookAdventure={handleBook} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredStories.map((story, i) => (
                    <motion.div key={story.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <StoryCard story={story} onLike={() => handleLikeStory(story.id, story.is_liked || false)}
                        onPlanSimilar={() => handlePlanSimilar(story)} onBookSimilar={() => handleBook(story)}
                        onComment={() => setSelectedStoryId(story.id)} currentUser={user} />
                    </motion.div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-8">
                {/* Empty State */}
                <div className="text-center py-12 bg-card rounded-3xl border border-dashed border-border">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Compass className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {isArabic ? 'كن أول من يشارك قصته!' : 'Be the first to share!'}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                    {isArabic ? 'لا توجد قصص بعد في هذا القسم. شارك تجربتك المميزة وألهم غيرك.' : 'No stories found in this section. Share your unique experience and inspire others.'}
                  </p>
                  <Button onClick={() => user ? setShowCreateForm(true) : navigate('/auth')} className="rounded-xl gap-2">
                    <Plus className="w-4 h-4" />
                    {isArabic ? 'انشر قصتك الأولى' : 'Publish your first story'}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="map">
            <StoryMapView stories={filteredStories} onStoryClick={(s) => { const idx = filteredStories.findIndex(x => x.id === s.id); if (idx >= 0) setViewerIndex(idx); }} />
          </TabsContent>

          <TabsContent value="following">
            {loading ? <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" /></div>
            : stories.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground mb-2">{isArabic ? 'تابع مسافرين' : 'Follow Travelers'}</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stories.map(story => (
                  <StoryCard key={story.id} story={story} onLike={() => handleLikeStory(story.id, story.is_liked || false)}
                    onPlanSimilar={() => handlePlanSimilar(story)} onBookSimilar={() => handleBook(story)}
                    onComment={() => setSelectedStoryId(story.id)} currentUser={user} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="leaderboard"><TravelLeaderboard /></TabsContent>
          <TabsContent value="heatmap"><StoryHeatmap stories={filteredStories} /></TabsContent>

          <TabsContent value="reels">
            <div className="space-y-4">
              <div className="text-center py-4">
                <Film className="w-10 h-10 text-primary mx-auto mb-2" />
                <h3 className="text-base font-bold text-foreground mb-1">{isArabic ? 'استوديو الريلز' : 'Reels Studio'}</h3>
                <p className="text-xs text-muted-foreground mb-3">{isArabic ? 'أنشئ فيديوهات سينمائية من صور رحلاتك' : 'Create cinematic videos from your trip photos'}</p>
                <Button onClick={() => navigate('/stories/reels')} className="rounded-xl gap-2">
                  <Film className="w-4 h-4" />
                  {isArabic ? 'افتح محرر الريلز' : 'Open Reels Editor'}
                </Button>
              </div>
              {/* Show stories with videos/reels */}
              {filteredStories.filter(s => s.video_url).length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {filteredStories.filter(s => s.video_url).map((story) => (
                    <div key={story.id} className="bg-card rounded-2xl overflow-hidden border border-border cursor-pointer group"
                      onClick={() => { const idx = filteredStories.findIndex(x => x.id === story.id); if (idx >= 0) setViewerIndex(idx); }}>
                      <div className="relative h-48">
                        {story.media_urls?.[0] ? (
                          <img src={story.media_urls[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Film className="w-8 h-8 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <Play className="w-10 h-10 text-white/90 fill-white/90" />
                        </div>
                        <Badge className="absolute top-2 left-2 bg-primary/80 text-primary-foreground border-0 text-[9px]">
                          <Film className="w-2.5 h-2.5 mr-0.5" />Reel
                        </Badge>
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-bold truncate text-foreground">{story.title}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{story.profiles?.full_name || 'User'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground py-4">{isArabic ? 'لا توجد ريلز بعد' : 'No reels yet'}</p>
              )}
            </div>
          </TabsContent>

          {/* My Stories Tab */}
          {user && (
            <TabsContent value="my-stories">
              {myStories.length === 0 ? (
                <div className="text-center py-16">
                  <User className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-foreground mb-1">{isArabic ? 'لا توجد قصص بعد' : 'No stories yet'}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{isArabic ? 'شارك أول مغامرة لك!' : 'Share your first adventure!'}</p>
                  <Button size="sm" onClick={() => setShowCreateForm(true)} className="rounded-xl gap-1.5">
                    <Plus className="w-3.5 h-3.5" />{isArabic ? 'انشر قصة' : 'Create Story'}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {myStories.map((story) => (
                    <div key={story.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="flex gap-3 p-3">
                        {/* Preview image */}
                        {story.media_urls && story.media_urls.length > 0 ? (
                          <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 cursor-pointer" onClick={() => {
                            const idx = filteredStories.findIndex(s => s.id === story.id);
                            if (idx >= 0) setViewerIndex(idx);
                          }}>
                            <img src={story.media_urls[0]} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <BookOpen className="w-6 h-6 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm text-foreground truncate">{story.title}</h4>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{story.content}</p>
                          {story.location_name && (
                            <p className="text-[10px] text-primary mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{story.location_name}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {story.media_urls?.length || 0} {isArabic ? 'صورة' : 'photos'} • {new Date(story.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg"
                            onClick={() => navigate('/stories', { state: { openCreateForm: true, editStoryId: story.id } })}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            disabled={deletingStoryId === story.id}
                            onClick={() => handleDeleteStory(story.id)}>
                            {deletingStoryId === story.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}

          {user && savedTrips.length > 0 && (
            <TabsContent value="auto-story"><AutoStoryGenerator savedTrips={savedTrips} userId={user.id} /></TabsContent>
          )}
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="w-screen h-[100dvh] max-w-full sm:max-w-2xl sm:w-auto sm:h-auto sm:max-h-[90vh] overflow-y-auto p-0 rounded-none sm:rounded-2xl [&>div]:overflow-visible pb-[env(safe-area-inset-bottom)]">
          <CreateStoryForm onSuccess={() => { setShowCreateForm(false); setPrefilledTripId(null); fetchStories(); }} onCancel={() => setShowCreateForm(false)} prefillLinkedTripId={prefilledTripId} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedStoryId} onOpenChange={() => setSelectedStoryId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle>{isArabic ? 'التعليقات' : 'Comments'}</DialogTitle></DialogHeader>
          {selectedStoryId && <CommentsSection storyId={selectedStoryId} currentUser={user} />}
        </DialogContent>
      </Dialog>
      {viewerIndex !== null && (
        <StoryViewer stories={filteredStories} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)}
          onLike={(id) => handleLikeStory(id, filteredStories.find(s => s.id === id)?.is_liked || false)}
          onComment={(id) => { setViewerIndex(null); setSelectedStoryId(id); }} currentUser={user} />
      )}
    </div>
  );
};

export default StoriesDiscoverPage;
