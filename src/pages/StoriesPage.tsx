import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import Navbar from "@/components/Navbar";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  MapPin, Plus, Search, Users, Award, Map, TrendingUp, BookOpen, Globe,
  Compass, Mountain, Waves, TreePine, Flame, Play, Camera, Video, Star,
  ArrowRight, Sparkles, Eye, Route, Wand2, Tent, Anchor, Sun, Building2, Wallet, Radio
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { awardPoints } from "@/utils/pointsSystem";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StoryViewer } from "@/components/stories/StoryViewer";
import { attachProfiles } from "@/utils/publicProfiles";
import { LiveStreamButton } from "@/components/stories/LiveStreamButton";
import { WalletCard } from "@/components/stories/WalletCard";

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
  is_saved?: boolean;
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

const DEMO_STORIES: Story[] = [
  {
    id: 'demo-1', title: 'Sunset in Santorini 🌅', content: 'The most breathtaking sunset I have ever witnessed. The caldera views from Oia are absolutely magical. Swimming in the infinity pool overlooking the caldera was a dream come true.',
    location_name: 'Santorini, Greece', latitude: 36.4618, longitude: 25.3753, likes_count: 234, created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    user_id: 'demo-user-1', profiles: { full_name: 'Sarah Ahmed', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
    media_urls: ['https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800', 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=800', 'https://images.unsplash.com/photo-1504512485720-7d83a16ee930?w=800'],
    video_url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    is_liked: false, comments_count: 12, trip_data: { category: 'beach', hashtags: ['santorini', 'sunset', 'greece', 'wanderlust', 'caldera', 'swimming'], topics: ['swimming', 'photography', 'food'], budget: 1200, itinerary: [{ date: 'Day 1', activities: [{ name: 'Arrival at Santorini Airport', time: '10:00 AM', cost: 0 }, { name: 'Check-in at Oia Boutique Hotel', time: '12:00 PM', cost: 280 }, { name: 'Sunset at Oia Castle', time: '6:00 PM', cost: 0 }] }, { date: 'Day 2', activities: [{ name: 'Red Beach Visit', time: '9:00 AM', cost: 0 }, { name: 'Caldera Boat Tour', time: '1:00 PM', cost: 65 }, { name: 'Wine Tasting Tour', time: '4:00 PM', cost: 45 }] }, { date: 'Day 3', activities: [{ name: 'Fira to Oia Hike', time: '8:00 AM', cost: 0 }, { name: 'Black Sand Beach', time: '2:00 PM', cost: 0 }] }] },
  },
  {
    id: 'demo-2', title: 'Lost in the Streets of Tokyo 🏯', content: 'From the neon lights of Shibuya to the peaceful temples of Asakusa. A perfect blend of ultra-modern and traditional culture. The food scene is absolutely incredible!',
    location_name: 'Tokyo, Japan', latitude: 35.6762, longitude: 139.6503, likes_count: 189, created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    user_id: 'demo-user-2', profiles: { full_name: 'Omar Ali', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=omar' },
    media_urls: ['https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800', 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800', 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800'],
    video_url: 'https://www.w3schools.com/html/movie.mp4',
    is_liked: false, comments_count: 8, trip_data: { category: 'city', hashtags: ['tokyo', 'japan', 'culture', 'food', 'neon', 'temples', 'ramen'], topics: ['food', 'shopping', 'photography', 'nightlife'], budget: 2500, itinerary: [{ date: 'Day 1', activities: [{ name: 'Shibuya Crossing & Hachiko', time: '10:00 AM', cost: 0 }, { name: 'Meiji Shrine Walk', time: '2:00 PM', cost: 0 }, { name: 'Harajuku Takeshita Street', time: '4:00 PM', cost: 30 }] }, { date: 'Day 2', activities: [{ name: 'Tsukiji Fish Market Breakfast', time: '7:00 AM', cost: 40 }, { name: 'Senso-ji Temple Asakusa', time: '11:00 AM', cost: 0 }, { name: 'Akihabara Electronics', time: '3:00 PM', cost: 50 }] }] },
  },
  {
    id: 'demo-3', title: 'Desert Safari Adventure 🏜️', content: 'Dune bashing, camel rides, and stargazing in the Arabian desert. An unforgettable experience under millions of stars. The BBQ dinner was amazing!',
    location_name: 'Dubai, UAE', latitude: 25.2048, longitude: 55.2708, likes_count: 156, created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    user_id: 'demo-user-3', profiles: { full_name: 'Layla Hassan', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=layla' },
    media_urls: ['https://images.unsplash.com/photo-1451337516015-6b6e9a44a8a3?w=800', 'https://images.unsplash.com/photo-1547234935-80c7145ec969?w=800'],
    is_liked: false, comments_count: 15, trip_data: { category: 'desert', hashtags: ['desert', 'safari', 'dubai', 'adventure', 'camels', 'stargazing'], topics: ['camping', 'photography', 'wildlife'], budget: 800, itinerary: [{ date: 'Day 1', activities: [{ name: 'Desert Safari Pickup', time: '3:00 PM', cost: 120 }, { name: 'Dune Bashing', time: '4:00 PM', cost: 0 }, { name: 'Camel Ride', time: '5:30 PM', cost: 0 }, { name: 'BBQ Dinner & Show', time: '7:00 PM', cost: 0 }] }] },
  },
  {
    id: 'demo-4', title: 'Hiking the Swiss Alps ⛰️', content: 'Spectacular mountain scenery. Fresh air, green valleys, and snow-capped peaks everywhere you look. Paragliding over Interlaken was the highlight!',
    location_name: 'Interlaken, Switzerland', latitude: 46.6863, longitude: 7.8632, likes_count: 298, created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    user_id: 'demo-user-4', profiles: { full_name: 'Youssef Khalid', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=youssef' },
    media_urls: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800', 'https://images.unsplash.com/photo-1527668752968-14dc70a27c95?w=800'],
    is_liked: false, comments_count: 22, trip_data: { category: 'mountain', hashtags: ['alps', 'hiking', 'switzerland', 'nature', 'mountains', 'paragliding'], topics: ['hiking', 'sports', 'photography'], budget: 3000, itinerary: [{ date: 'Day 1', activities: [{ name: 'Jungfraujoch Top of Europe', time: '8:00 AM', cost: 180 }, { name: 'Grindelwald Glacier Walk', time: '2:00 PM', cost: 40 }] }, { date: 'Day 2', activities: [{ name: 'Paragliding over Interlaken', time: '10:00 AM', cost: 200 }, { name: 'Lake Brienz Boat Tour', time: '3:00 PM', cost: 45 }] }, { date: 'Day 3', activities: [{ name: 'Harder Kulm Viewpoint', time: '9:00 AM', cost: 35 }, { name: 'Trümmelbach Falls', time: '1:00 PM', cost: 15 }] }] },
  },
  {
    id: 'demo-5', title: 'Diving in the Maldives 🤿', content: 'Crystal clear waters, vibrant coral reefs, and swimming with manta rays. The underwater world is beyond imagination.',
    location_name: 'Maldives', latitude: 3.2028, longitude: 73.2207, likes_count: 312, created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    user_id: 'demo-user-5', profiles: { full_name: 'Nora Farid', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=nora' },
    media_urls: ['https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800', 'https://images.unsplash.com/photo-1540202403-b7abd6747a18?w=800'],
    is_liked: false, comments_count: 19, trip_data: { category: 'diving', hashtags: ['maldives', 'diving', 'ocean', 'luxury', 'coral', 'mantaray'], topics: ['swimming', 'wildlife', 'photography'], budget: 5000, itinerary: [{ date: 'Day 1', activities: [{ name: 'Water Villa Check-in', time: '11:00 AM', cost: 450 }, { name: 'Snorkeling House Reef', time: '3:00 PM', cost: 0 }] }, { date: 'Day 2', activities: [{ name: 'Manta Ray Diving Tour', time: '7:00 AM', cost: 150 }, { name: 'Sunset Dolphin Cruise', time: '5:00 PM', cost: 80 }] }] },
  },
  {
    id: 'demo-6', title: 'Camping Under Northern Lights 🏕️', content: 'Aurora borealis dancing across the Arctic sky. A once-in-a-lifetime experience in Norwegian Lapland.',
    location_name: 'Tromsø, Norway', latitude: 69.6496, longitude: 18.9560, likes_count: 445, created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    user_id: 'demo-user-6', profiles: { full_name: 'Khaled Mansour', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=khaled' },
    media_urls: ['https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=800', 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800'],
    is_liked: false, comments_count: 31, trip_data: { category: 'camping', hashtags: ['aurora', 'camping', 'norway', 'nature', 'arctic', 'northernlights'], topics: ['camping', 'photography'] },
  },
  {
    id: 'demo-7', title: 'Exploring Marrakech Souks 🕌', content: 'The vibrant colors, exotic spices, and intricate craftsmanship of Marrakech\'s famous souks.',
    location_name: 'Marrakech, Morocco', latitude: 31.6295, longitude: -7.9811, likes_count: 178, created_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    user_id: 'demo-user-7', profiles: { full_name: 'Amira Benali', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=amira' },
    media_urls: ['https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=800', 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=800'],
    is_liked: false, comments_count: 14, trip_data: { category: 'cultural', hashtags: ['marrakech', 'morocco', 'souks', 'culture', 'spices'], topics: ['shopping', 'food', 'history', 'art'] },
  },
  {
    id: 'demo-8', title: 'Bali Rice Terraces 🌴', content: 'Walking through the legendary Tegallalang rice terraces. The lush green layers stretching endlessly.',
    location_name: 'Bali, Indonesia', latitude: -8.4095, longitude: 115.1889, likes_count: 520, created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    user_id: 'demo-user-8', profiles: { full_name: 'Rania Yusuf', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rania' },
    media_urls: ['https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800'],
    is_liked: false, comments_count: 27, trip_data: { category: 'camping', hashtags: ['bali', 'indonesia', 'nature', 'wanderlust', 'riceterrace'], topics: ['hiking', 'photography', 'wellness'] },
  },
];

const StoriesPage = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search')?.replace(/^#/, '') || '';
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [prefilledTripId, setPrefilledTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'explore';
  });
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [stats, setStats] = useState({ stories: 0, destinations: 0, users: 0 });
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [savedStoryIds, setSavedStoryIds] = useState<Set<string>>(new Set());
  const [feedView, setFeedView] = useState<'feed' | 'grid'>('feed');
  const [showFeedView, setShowFeedView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'feed') return true;
    return !params.get('search') && !tab && !params.get('topic');
  });
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [activeTopicFilter, setActiveTopicFilter] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('topic') || null;
  });

  // Stories for map/heatmap insights (combining live and demo data)
  const storiesForInsights = useMemo(() => {
    return [...stories, ...DEMO_STORIES];
  }, [stories]);

  // Sync URL params with component state - always react to URL changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlSearch = params.get('search')?.replace(/^#/, '') || '';
    const urlTab = params.get('tab') || '';
    const urlTopic = params.get('topic') || '';

    if (urlTab === 'feed') {
      setShowFeedView(true);
      return;
    }

    const hasFilter = !!(urlSearch || urlTab || urlTopic);

    if (hasFilter) {
      setShowFeedView(false);
      setSearchTerm(urlSearch);
      setActiveTab(urlTab || 'explore');
      setActiveTopicFilter(urlTopic || null);
    } else if (!params.get('id')) {
      if (!showCreateForm) setSearchTerm('');
      setActiveTopicFilter(null);
    }
  }, [location.search, showCreateForm]);

  useEffect(() => {
    if (!authLoading) {
      fetchStories();
      fetchStats();
      if (user) {
        fetchSavedTrips();
        fetchSavedStories();
      }
    }
  }, [authLoading, activeTab, selectedCategory, searchTerm, activeTopicFilter]);

  const fetchSavedTrips = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('saved_trips')
      .select('id, trip_id, destination, trip_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setSavedTrips(data || []);
  };

  const fetchSavedStories = async () => {
    if (!user) {
      setSavedStoryIds(new Set());
      return;
    }
    const { data } = await supabase
      .from('favorites')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('place_type', 'story');
    
    const ids = new Set((data || []).map(f => (f.metadata as any)?.story_id).filter(Boolean));
    setSavedStoryIds(ids);
  };

  useEffect(() => {
    if (location.state?.openCreateForm && user) {
      setShowCreateForm(true);
      if (location.state?.linkedTripId) setPrefilledTripId(location.state.linkedTripId);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const storyId = params.get('id');
    if (!storyId) return;
    const idx = stories.findIndex(s => s.id === storyId);
    if (idx >= 0) setViewerIndex(idx);
  }, [location.search, stories]);

  const fetchStats = async () => {
    const [storiesRes, destinationsRes, usersRes] = await Promise.all([
      supabase.from("travel_stories").select("*", { count: "exact", head: true }),
      supabase.from("travel_stories").select("location_name").not("location_name", "is", null),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
    ]);
    const uniqueDestinations = new Set(destinationsRes.data?.map(d => d.location_name)).size;
    setStats({ stories: (storiesRes.count || 0) || DEMO_STORIES.length, destinations: uniqueDestinations || 6, users: (usersRes.count || 0) || 42 });
  };

  const fetchStories = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("travel_stories")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(searchTerm ? 100 : 20);

      if (activeTab === "following" && user) {
        const { data: follows } = await supabase.from("user_follows").select("following_id").eq("follower_id", user.id);
        if (follows && follows.length > 0) {
          query = query.in("user_id", follows.map(f => f.following_id));
        } else { setStories([]); setLoading(false); return; }
      }

      const { data, error } = await query;
      if (error) throw error;

      const withProfiles = await attachProfiles((data || []) as any[]);
      const storiesWithInteractions = await Promise.all(
        withProfiles.map(async (story) => {
          const [{ count: likesCount }, { count: commentsCount }] = await Promise.all([
            supabase.from("story_likes").select("*", { count: "exact", head: true }).eq("story_id", story.id),
            supabase.from("story_comments").select("*", { count: "exact", head: true }).eq("story_id", story.id),
          ]);
          let isLiked = false;
          if (user) {
            const { data: userLike } = await supabase.from("story_likes").select("id").eq("story_id", story.id).eq("user_id", user.id).maybeSingle();
            isLiked = !!userLike;
          }
          return { 
            ...story, 
            likes_count: likesCount || 0, 
            is_liked: isLiked, 
            is_saved: savedStoryIds.has(story.id),
            comments_count: commentsCount || 0 
          };
        })
      );
      let result: Story[] = storiesWithInteractions as any;

      const normalizedSearch = searchTerm.trim().replace(/^#/, '').toLowerCase();
      if (normalizedSearch) {
        result = result.filter((s) => {
          const hashtags = Array.isArray((s.trip_data as any)?.hashtags) ? (s.trip_data as any).hashtags : [];
          const topics = Array.isArray((s.trip_data as any)?.topics) ? (s.trip_data as any).topics : [];
          const searchable = [
            s.title,
            s.content,
            s.location_name,
            ...hashtags,
            ...topics,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchable.includes(normalizedSearch);
        });
      }

      // Client-side filtering for topics
      if (activeTopicFilter) {
        result = result.filter(s => {
          const topics = ((s.trip_data as any)?.topics || []) as string[];
          return topics.some((topic) => topic.toLowerCase() === activeTopicFilter.toLowerCase());
        });
      }

      setStories(result);
    } catch (error) {
      console.error("Error fetching stories:", error);
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLikeStory = async (storyId: string, isCurrentlyLiked: boolean) => {
    if (!user) { navigate('/auth'); return; }
    try {
      if (isCurrentlyLiked) {
        await supabase.from("story_likes").delete().eq("story_id", storyId).eq("user_id", user.id);
      } else {
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
              message: isArabic
                ? `${likerName} أعجب بقصتك "${story.title}"`
                : `${likerName} liked your story "${story.title}"`,
              metadata: { story_id: storyId, liker_id: user.id } as any,
            });
          }
        } catch {}
      }
      setStories(prev => prev.map(s => s.id === storyId
        ? { ...s, likes_count: isCurrentlyLiked ? s.likes_count - 1 : s.likes_count + 1, is_liked: !isCurrentlyLiked }
        : s
      ));
    } catch (error) { console.error("Error handling like:", error); }
  };

  const handleSaveStory = async (storyId: string, isCurrentlySaved: boolean) => {
    if (!user) { navigate('/auth'); return; }
    try {
      if (isCurrentlySaved) {
        await supabase.from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("place_type", "story")
          .filter("metadata->>story_id", "eq", storyId);
        
        setSavedStoryIds(prev => {
          const next = new Set(prev);
          next.delete(storyId);
          return next;
        });
        toast({ title: isArabic ? 'تمت الإزالة من المفضلات' : 'Removed from favorites' });
      } else {
        const story = stories.find(s => s.id === storyId);
        await supabase.from("favorites").insert({
          user_id: user.id,
          place_name: story?.title || 'Story',
          place_type: 'story',
          image_url: story?.media_urls?.[0] || null,
          metadata: { story_id: storyId }
        });
        
        setSavedStoryIds(prev => {
          const next = new Set(prev);
          next.add(storyId);
          return next;
        });
        
        await awardPoints({ userId: user.id, action: "BOOK_TRIP", reason: "Saved a travel story" });
        toast({ title: isArabic ? 'تم الحفظ في المفضلات ❤️' : 'Saved to favorites ❤️' });
      }
      
      setStories(prev => prev.map(s => s.id === storyId ? { ...s, is_saved: !isCurrentlySaved } : s));
    } catch (error) { 
      console.error("Error handling save:", error);
      toast({ variant: 'destructive', title: isArabic ? 'خطأ في الحفظ' : 'Error saving' });
    }
  };

  const handleStoryCreated = (newStory: Story) => {
    setStories(prev => [newStory, ...prev]);
    setShowCreateForm(false);
    toast({ title: "Adventure Published! 🎉", description: "Your story is now live" });
  };

  const normalizeDestination = (value?: string) => (value || '').replace(/\s*#.*$/g, '').replace(/\s+[A-Z]$/g, '').trim();

  const mapStoryTripType = (value?: string) => {
    const normalized = (value || '').toLowerCase().trim();
    if (["family", "economic", "luxury", "adventure", "romantic", "solo"].includes(normalized)) return normalized;
    if (["beach", "mountain", "camping", "diving", "desert", "hiking", "sports"].includes(normalized)) return 'adventure';
    if (["city", "cultural", "culture", "food"].includes(normalized)) return 'solo';
    return 'adventure';
  };

  const mapTopicToInterest = (topic: string) => {
    const value = topic.toLowerCase().trim();
    if (["hiking", "mountain", "sports", "adventure"].some((k) => value.includes(k))) return "adventure";
    if (["nature", "alps", "outdoor"].some((k) => value.includes(k))) return "nature";
    if (["beach", "diving", "swimming", "ocean"].some((k) => value.includes(k))) return "beach";
    if (["food", "cuisine", "restaurant"].some((k) => value.includes(k))) return "culture";
    if (["shopping", "market"].some((k) => value.includes(k))) return "shopping";
    if (["nightlife", "party"].some((k) => value.includes(k))) return "nightlife";
    return "";
  };

  const handlePlanSimilarTrip = (story: Story) => {
    const routeSource = normalizeDestination(String(story.trip_data?.destination || story.location_name || ''));
    const routeCities = routeSource
      .split(/(?:\s*→\s*|\s*->\s*|\s*➜\s*)/g)
      .map((city) => normalizeDestination(city))
      .filter(Boolean);

    const destination = routeCities[0] || normalizeDestination(story.location_name || story.trip_data?.destination);
    if (!destination) return;

    const params = new URLSearchParams({ destination });
    if (story.trip_data?.budget) params.set('budget', String(story.trip_data.budget));

    const duration = Number(story.trip_data?.duration || story.trip_data?.itinerary?.length || story.trip_data?.days?.length || 0);
    if (duration > 0) params.set('duration', String(duration));

    const travelers = Number(story.trip_data?.travelers || story.trip_data?.people || 0);
    if (travelers > 0) params.set('travelers', String(travelers));

    if (story.trip_data?.departureCity || story.trip_data?.departure_city)
      params.set('departure', String(story.trip_data.departureCity || story.trip_data.departure_city));

    const storyTripType = mapStoryTripType(story.trip_data?.tripType || story.trip_data?.category);
    if (storyTripType) params.set('tripType', storyTripType);

    const transport = story.trip_data?.intercityTransport || story.trip_data?.transport || 'flight';
    params.set('transport', transport);

    const topics = Array.isArray(story.trip_data?.topics) ? story.trip_data.topics : [];
    const mappedInterests = Array.from(new Set(topics.map(mapTopicToInterest).filter(Boolean)));
    if (mappedInterests.length > 0) params.set('interests', mappedInterests.join(','));

    // Multi-city support
    const cities = story.trip_data?.cities || story.trip_data?.multiCities;
    if (Array.isArray(cities) && cities.length > 1) {
      params.set('multiCity', 'true');
      params.set('cities', JSON.stringify(cities.map((c: any) => ({
        name: c.name || c.city || c,
        days: c.days || c.duration || Math.ceil(duration / cities.length)
      }))));
    } else if (routeCities.length > 1) {
      params.set('multiCity', 'true');
      const fallbackDays = Math.max(1, Math.ceil((duration || routeCities.length) / routeCities.length));
      params.set('cities', JSON.stringify(routeCities.map((name) => ({ name, days: fallbackDays }))));
    }

    navigate(`/planner?${params.toString()}`);
  };

  const handleBookAdventure = (story: Story) => {
    if (story.location_name) navigate(`/destinations?search=${encodeURIComponent(story.location_name)}`);
  };

  // Filter stories by category
  const filteredStories = selectedCategory === 'all' 
    ? stories 
    : stories.filter(s => s.trip_data?.category === selectedCategory);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const renderStoryGrid = (storyList: Story[]) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {storyList.map((story, index) => (
        <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
          <StoryCard
            story={story}
            onLike={() => handleLikeStory(story.id, story.is_liked || false)}
            onPlanSimilar={() => handlePlanSimilarTrip(story)}
            onBookSimilar={() => handleBookAdventure(story)}
            onComment={() => setSelectedStoryId(story.id)}
            onSave={(e) => { e.stopPropagation(); handleSaveStory(story.id, story.is_saved || false); }}
            currentUser={user}
          />
        </motion.div>
      ))}
    </div>
  );

  // Full-screen TikTok-style feed view
  if (showFeedView) {
    return (
      <div className="relative h-[100dvh] bg-black overflow-hidden">
        {/* Top nav */}
        <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none">
          <div className="bg-gradient-to-b from-black/70 via-black/40 to-transparent pb-8">
            <div className="flex items-center justify-between px-4 pointer-events-auto" style={{ paddingTop: 'calc(env(safe-area-inset-top, 12px) + 12px)' }}>
              <button onClick={() => setShowSearchOverlay(p => !p)} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/15 shadow-lg z-40">
                <Search className="w-4 h-4 text-white" />
              </button>
              <div className="flex gap-5">
                <button className="text-sm font-bold text-white border-b-2 border-white pb-1">{t('storyTabs.explore', { defaultValue: 'Explore' })}</button>
                <button onClick={() => { setShowFeedView(false); setActiveTab('following'); }} className="text-sm font-bold text-white/60">{t('storyTabs.following', { defaultValue: 'Following' })}</button>
              </div>
              <button onClick={() => setShowFeedView(false)} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/15 shadow-lg z-40">
                <TrendingUp className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6 pt-20">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card rounded-3xl overflow-hidden border border-border animate-pulse h-[500px]" />
            ))}
          </div>
        ) : filteredStories.length > 0 ? (
          <StoryFeed
            stories={filteredStories}
            onStoryTap={(idx) => setViewerIndex(idx)}
            onLike={(id) => handleLikeStory(id, filteredStories.find(s => s.id === id)?.is_liked || false)}
            onCreate={() => setShowCreateForm(true)}
            onPlanSimilar={handlePlanSimilarTrip}
            onBookAdventure={handleBookAdventure}
            onComment={(id) => setSelectedStoryId(id)}
            onSave={handleSaveStory}
            fullScreen
          />
        ) : (
          <div className="max-w-lg mx-auto space-y-10 pt-24 px-6">
            {/* Empty State */}
            <div className="text-center py-16 bg-white/5 rounded-[2rem] border border-white/10 px-6">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
                <Compass className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-black text-white mb-3">
                {isArabic ? 'ابدأ رحلة الإلهام!' : 'Start the inspiration!'}
              </h3>
              <p className="text-sm text-white/60 mb-8 max-w-sm mx-auto leading-relaxed">
                {isArabic ? 'لا توجد مغامرات منشورة هنا بعد. كن السبّاق وشارك عالمك مع الآخرين!' : 'No adventures published here yet. Be the first to share your world with others!'}
              </p>
              <Button onClick={() => user ? setShowCreateForm(true) : navigate('/auth')} size="lg" className="rounded-2xl h-14 px-8 bg-primary hover:bg-primary/90 text-white font-bold shadow-xl shadow-primary/20 gap-2">
                <Plus className="w-5 h-5 font-black" />
                {isArabic ? 'أنشئ قصتك الأولى' : 'Create your first story'}
              </Button>
            </div>

            {/* Inspiration Highlights */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-white/10 pb-4">
                <Sparkles className="w-5 h-5 text-accent" />
                <h3 className="text-lg font-black text-white">
                  {isArabic ? 'أفكار لمغامرتك القادمة' : 'Inspiration for your next adventure'}
                </h3>
              </div>
              <div className="space-y-6 opacity-90">
                {DEMO_STORIES.slice(0, 2).map((story) => (
                  <StoryCard key={story.id} story={story} onLike={() => {}}
                    onPlanSimilar={() => handlePlanSimilarTrip(story)} onBookSimilar={() => handleBookAdventure(story)}
                    onComment={() => {}} currentUser={null} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bottom tab bar */}
        <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/80 backdrop-blur-md border-t border-white/10 safe-area-inset-bottom">
          <div className="flex items-center justify-around py-2 px-2">
            <button className="flex flex-col items-center gap-0.5 text-white" onClick={() => { setShowFeedView(true); }}>
              <Play className="w-5 h-5" /><span className="text-[10px]">{t('storyTabs.feed', { defaultValue: 'Feed' })}</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 text-white/60 hover:text-red-400 transition-colors" onClick={() => navigate('/stories/live')}>
              <div className="relative">
                <Radio className="w-5 h-5" />
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>
              <span className="text-[10px]">{isArabic ? 'مباشر' : 'Live'}</span>
            </button>
            <button onClick={() => setShowCreateForm(true)} className="w-12 h-8 rounded-lg bg-gradient-to-r from-accent to-primary flex items-center justify-center -mt-3 shadow-lg">
              <Plus className="w-5 h-5 text-white" />
            </button>
            <button className="flex flex-col items-center gap-0.5 text-white/60" onClick={() => { setShowFeedView(false); setActiveTab('map'); }}>
              <Map className="w-5 h-5" /><span className="text-[10px]">{t('storyTabs.map', { defaultValue: 'Map' })}</span>
            </button>
            <button className="flex flex-col items-center gap-0.5 text-white/60" onClick={() => navigate('/stories/discover')}>
              <Compass className="w-5 h-5" /><span className="text-[10px]">{t('storyTabs.explore', { defaultValue: 'Explore' })}</span>
            </button>
          </div>
        </div>

        {/* Search overlay */}
        <AnimatePresence>
          {showSearchOverlay && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="absolute top-14 left-4 right-4 z-40 bg-black/80 backdrop-blur-xl rounded-2xl p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
                <Input autoFocus placeholder={isArabic ? 'ابحث عن مغامرات...' : 'Search adventures...'} value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { fetchStories(); setShowSearchOverlay(false); } }}
                  className="pl-10 h-10 bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-xl" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dialogs */}
        <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
          <DialogContent className="w-screen h-[100dvh] max-w-full sm:max-w-2xl sm:w-auto sm:h-auto sm:max-h-[92vh] overflow-y-auto p-0 rounded-none sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
            <CreateStoryForm onSuccess={() => { setShowCreateForm(false); setPrefilledTripId(null); fetchStories(); }} onCancel={() => setShowCreateForm(false)} prefillLinkedTripId={prefilledTripId} />
          </DialogContent>
        </Dialog>
      <Dialog open={!!selectedStoryId} onOpenChange={() => setSelectedStoryId(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader><DialogTitle>{isArabic ? 'التعليقات' : 'Comments'}</DialogTitle></DialogHeader>
            {selectedStoryId && (
              <CommentsSection 
                storyId={selectedStoryId} 
                currentUser={user} 
                onCommentAdded={() => {
                  setStories(prev => prev.map(s => s.id === selectedStoryId ? { ...s, comments_count: (s.comments_count || 0) + 1 } : s));
                  toast({ title: isArabic ? 'تمت إضافة التعليق!' : 'Comment added!' });
                }} 
              />
            )}
          </DialogContent>
        </Dialog>
        {viewerIndex !== null && (
          <StoryViewer stories={filteredStories} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)}
            onLike={(id) => handleLikeStory(id, filteredStories.find(s => s.id === id)?.is_liked || false)}
            onComment={(id) => { setViewerIndex(null); setSelectedStoryId(id); }} currentUser={user} />
        )}
      </div>
    );
  }

  // Main Explore UI (default view)
  return (
    <div className="min-h-screen bg-background pt-16">
      <Navbar />

      {/* Stats bar */}
      <div className="bg-gradient-to-r from-primary/10 to-accent/10 border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-center gap-10">
          {[
            { label: isArabic ? 'مغامرات' : 'Adventures', value: stats.stories, icon: BookOpen },
            { label: isArabic ? 'وجهات' : 'Destinations', value: stats.destinations, icon: MapPin },
            { label: isArabic ? 'مسافرون' : 'Travelers', value: stats.users, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-2 text-center">
              <Icon className="w-4 h-4 text-primary" />
              <span className="text-lg font-black text-foreground">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category filters - scrollable */}
      <div className="container mx-auto px-4 py-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {ADVENTURE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = selectedCategory === cat.id;
            return (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                  isActive ? `bg-gradient-to-r ${cat.gradient} text-white border-transparent shadow-md` : 'bg-card text-foreground border-border hover:border-primary/40'
                }`}>
                <Icon className="w-4 h-4" />
                {isArabic ? cat.label : cat.labelEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured Adventures Carousel */}
      <div className="container mx-auto px-4 mb-4">
        <FeaturedAdventures onExplore={(adv) => {
          setSelectedCategory(adv.category.toLowerCase());
        }} />
      </div>

      {/* Story Highlights */}
      <div className="container mx-auto px-4 mb-4">
        <StoryHighlights stories={filteredStories} onViewStory={(idx) => setViewerIndex(idx)} userId={user?.id} isOwner={!!user} />
      </div>

      {/* Avatar row */}
      <div className="container mx-auto px-4 mb-4">
        <div className="flex gap-4 overflow-x-auto pb-3 no-scrollbar">
          <div className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer" onClick={() => setShowCreateForm(true)}>
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-primary flex items-center justify-center bg-card hover:bg-primary/5 transition-colors">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">{t('storyTabs.publish', { defaultValue: 'Publish' })}</span>
          </div>
          {filteredStories.slice(0, 10).map((story, idx) => (
            <div key={story.id} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group" onClick={() => setViewerIndex(idx)}>
              <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-accent via-primary to-emerald-400 group-hover:scale-105 transition-transform shadow-md">
                <img src={story.profiles?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${story.user_id}`}
                  alt={story.profiles?.full_name} className="w-full h-full rounded-full border-2 border-background object-cover" />
              </div>
              <span className="text-xs font-medium text-foreground w-16 truncate text-center">{story.profiles?.full_name?.split(' ')[0] || 'User'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feed button + search */}
      <div className="container mx-auto px-4 mb-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setShowFeedView(true)} className="gap-1.5 text-xs rounded-xl shrink-0">
          <Play className="w-3.5 h-3.5" />
          {t('storyTabs.feed', { defaultValue: 'Feed' })}
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input placeholder={t('storyTabs.searchAdventures', { defaultValue: 'Search adventures...' })} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchStories()} className="pl-10 h-9 rounded-xl text-sm" />
        </div>
        {!user && (
          <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="gap-1.5 text-xs rounded-xl shrink-0 border-primary/30 text-primary">
            {t('storyTabs.signInToShare', { defaultValue: 'Sign in to share' })}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 pb-20">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card/80 backdrop-blur-sm border border-border p-1.5 rounded-2xl shadow-sm mb-6 flex-wrap">
            <TabsTrigger value="explore" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <TrendingUp className="w-4 h-4" />{t('storyTabs.explore', { defaultValue: 'Explore' })}
            </TabsTrigger>
            <TabsTrigger value="map" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Map className="w-4 h-4" />{t('storyTabs.map', { defaultValue: 'Map' })}
            </TabsTrigger>
            <TabsTrigger value="following" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" disabled={!user}>
              <Users className="w-4 h-4" />{t('storyTabs.following', { defaultValue: 'Following' })}
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Award className="w-4 h-4" />{t('storyTabs.leaders', { defaultValue: 'Leaders' })}
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Flame className="w-4 h-4" />{t('storyTabs.heatmap', { defaultValue: 'Heatmap' })}
            </TabsTrigger>
            {user && (
              <TabsTrigger value="wallet" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Wallet className="w-4 h-4" />{t('storyTabs.wallet', { defaultValue: 'Wallet' })}
              </TabsTrigger>
            )}
            {user && savedTrips.length > 0 && (
              <TabsTrigger value="auto-story" className="gap-2 text-sm rounded-xl px-4 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Wand2 className="w-4 h-4" />Auto Story
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="explore">
            <div className="flex gap-2 mb-4">
              <Button variant={feedView === 'feed' ? 'default' : 'outline'} size="sm" onClick={() => setFeedView('feed')} className="rounded-xl gap-1.5 text-xs">
                <Play className="w-3.5 h-3.5" />{isArabic ? 'بطاقات' : 'Cards'}
              </Button>
              <Button variant={feedView === 'grid' ? 'default' : 'outline'} size="sm" onClick={() => setFeedView('grid')} className="rounded-xl gap-1.5 text-xs">
                <Eye className="w-3.5 h-3.5" />{isArabic ? 'شبكة' : 'Grid'}
              </Button>
            </div>
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loading" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-card rounded-3xl overflow-hidden border border-border animate-pulse">
                      <div className="h-52 bg-muted" /><div className="p-5 space-y-3"><div className="h-4 bg-muted rounded-full w-3/4" /><div className="h-3 bg-muted rounded-full w-full" /></div>
                    </div>
                  ))}
                </motion.div>
              ) : filteredStories.length > 0 ? (
                <motion.div key="feed" className="max-w-lg mx-auto">
                  <StoryFeed 
                    stories={filteredStories} 
                    onStoryTap={(idx) => setViewerIndex(idx)}
                    onLike={(id) => handleLikeStory(id, filteredStories.find(s => s.id === id)?.is_liked || false)}
                    onPlanSimilar={handlePlanSimilarTrip}
                    onBookAdventure={handleBookAdventure}
                    onComment={(id) => setSelectedStoryId(id)}
                    onSave={handleSaveStory} 
                  />
                </motion.div>
              ) : (
                <motion.div key="empty" className="max-w-lg mx-auto space-y-10 py-10">
                  <div className="text-center py-16 bg-card rounded-[2rem] border-2 border-dashed border-border/60 px-6">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                      <Compass className="w-10 h-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-black text-foreground mb-3">
                      {isArabic ? 'ابدأ رحلة الإلهام!' : 'Start the inspiration!'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
                      {isArabic ? 'لا توجد مغامرات منشورة هنا بعد. كن السبّاق وشارك عالمك مع الآخرين!' : 'No adventures published here yet. Be the first to share your world with others!'}
                    </p>
                    <Button onClick={() => user ? setShowCreateForm(true) : navigate('/auth')} size="lg" className="rounded-2xl h-14 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xl shadow-primary/20 gap-2">
                      <Plus className="w-5 h-5 font-black" />
                      {isArabic ? 'أنشئ قصتك الأولى' : 'Create your first story'}
                    </Button>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 border-b border-border pb-4">
                      <Sparkles className="w-5 h-5 text-accent" />
                      <h3 className="text-lg font-black text-foreground">
                        {isArabic ? 'أفكار لمغامرتك القادمة' : 'Inspiration for your next adventure'}
                      </h3>
                    </div>
                    <div className="space-y-6 opacity-90">
                      {DEMO_STORIES.slice(0, 2).map((story) => (
                        <StoryCard key={story.id} story={story} onLike={() => {}}
                          onPlanSimilar={() => handlePlanSimilarTrip(story)} onBookSimilar={() => handleBookAdventure(story)}
                          onComment={() => {}} currentUser={null} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="map">
            <div>
            <StoryMapView stories={storiesForInsights} onStoryClick={(story) => {
              const idx = filteredStories.findIndex(s => s.id === story.id);
              if (idx >= 0) setViewerIndex(idx);
            }} />
            </div>
          </TabsContent>

          <TabsContent value="following">
            {loading ? (
              <div className="text-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
            ) : stories.length === 0 ? (
              <div className="space-y-5">
                <div className="text-center py-6">
                  <Users className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-foreground mb-2">{isArabic ? 'عرض تجريبي للقصص' : 'Demo Stories Preview'}</h3>
                  <p className="text-muted-foreground text-sm">{isArabic ? 'لا توجد متابعات بعد، نعرض لك قصصًا تجريبية' : 'No followed creators yet, showing demo stories'}</p>
                </div>
                {renderStoryGrid(storiesForInsights.slice(0, 6))}
              </div>
            ) : renderStoryGrid(stories)}
          </TabsContent>

          <TabsContent value="leaderboard"><div><TravelLeaderboard /></div></TabsContent>
          <TabsContent value="heatmap"><div><StoryHeatmap stories={storiesForInsights} /></div></TabsContent>
          {user && (
            <TabsContent value="wallet"><WalletCard userId={user.id} /></TabsContent>
          )}
          {user && savedTrips.length > 0 && (
            <TabsContent value="auto-story"><AutoStoryGenerator savedTrips={savedTrips} userId={user.id} /></TabsContent>
          )}
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="w-screen h-[100dvh] max-w-full sm:max-w-2xl sm:w-auto sm:h-auto sm:max-h-[92vh] overflow-y-auto p-0 rounded-none sm:rounded-2xl pb-[env(safe-area-inset-bottom)]">
          <CreateStoryForm onSuccess={() => { setShowCreateForm(false); setPrefilledTripId(null); fetchStories(); }} onCancel={() => setShowCreateForm(false)} prefillLinkedTripId={prefilledTripId} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedStoryId} onOpenChange={() => setSelectedStoryId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle>{isArabic ? 'التعليقات' : 'Comments'}</DialogTitle></DialogHeader>
          {selectedStoryId && (
            <CommentsSection 
              storyId={selectedStoryId} 
              currentUser={user} 
              onCommentAdded={() => {
                setStories(prev => prev.map(s => s.id === selectedStoryId ? { ...s, comments_count: (s.comments_count || 0) + 1 } : s));
                toast({ title: isArabic ? 'تمت إضافة التعليق!' : 'Comment added!' });
              }} 
            />
          )}
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

export default StoriesPage;
