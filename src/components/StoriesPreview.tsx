import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Heart, MapPin, Camera, Video, BookOpen, Share2, Award,
  Sparkles, Play, ChevronLeft, ChevronRight, Radio, Film, MessageCircle,
  Bookmark, Users, Star, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { attachProfiles } from "@/utils/publicProfiles";

interface StoryPreview {
  id: string;
  title: string;
  location_name: string | null;
  media_urls: string[] | null;
  likes_count: number | null;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
}

const PLACEHOLDER_STORIES = [
  {
    id: "p1", title: "Exploring the Streets of Tokyo", location_name: "Tokyo, Japan",
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=800&h=600",
    desc: "Neon lights and ancient temples create a magical contrast",
    author: "Omar Ali", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=omar",
    likes: 189, comments: 8, category: "city",
  },
  {
    id: "p2", title: "Sunset at Santorini", location_name: "Santorini, Greece",
    image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&q=80&w=800&h=600",
    desc: "The most breathtaking sunset views over the Aegean Sea",
    author: "Sarah Ahmed", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah",
    likes: 234, comments: 12, category: "beach",
  },
  {
    id: "p3", title: "Food Tour in Marrakech", location_name: "Marrakech, Morocco",
    image: "https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?auto=format&fit=crop&q=80&w=800&h=600",
    desc: "Vibrant souks, exotic spices, and authentic cuisine",
    author: "Amira Benali", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=amira",
    likes: 178, comments: 14, category: "cultural",
  },
  {
    id: "p4", title: "Swiss Alps Adventure", location_name: "Interlaken, Switzerland",
    image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&q=80&w=800&h=600",
    desc: "Breathtaking mountain landscapes and thrilling hikes",
    author: "Youssef Khalid", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=youssef",
    likes: 298, comments: 22, category: "mountain",
  },
];

const StoriesPreview = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language?.startsWith("ar");
  const [stories, setStories] = useState<StoryPreview[]>([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [phoneSlide, setPhoneSlide] = useState(0);

  useEffect(() => {
    supabase
      .from("travel_stories")
      .select("id, title, location_name, media_urls, likes_count, user_id")
      .order("created_at", { ascending: false })
      .limit(6)
      .then(async ({ data }) => {
        if (data) {
          const enriched = await attachProfiles(data as any[]);
          setStories(enriched as any);
        }
      });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setActiveSlide(p => (p + 1) % PLACEHOLDER_STORIES.length), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setPhoneSlide(p => (p + 1) % PLACEHOLDER_STORIES.length), 3000);
    return () => clearInterval(timer);
  }, []);

  const hasRealStories = stories.length > 0;
  const currentSlide = PLACEHOLDER_STORIES[activeSlide];
  const currentPhone = PLACEHOLDER_STORIES[phoneSlide];

  const features = [
    { icon: Camera, title: t('storiesPreview.captureMoments'), desc: t('storiesPreview.captureMomentsDesc'), color: "from-rose-500 to-pink-600" },
    { icon: Film, title: t('storiesPreview.reelsExport'), desc: t('storiesPreview.reelsExportDesc'), color: "from-violet-500 to-purple-600" },
    { icon: Share2, title: t('storiesPreview.importFromTrips'), desc: t('storiesPreview.importFromTripsDesc'), color: "from-blue-500 to-cyan-600" },
    { icon: Award, title: t('storiesPreview.earnPoints'), desc: t('storiesPreview.earnPointsDesc'), color: "from-amber-500 to-orange-600" },
  ];

  return (
    <section className="py-16 bg-gradient-to-b from-background to-secondary/10 overflow-hidden">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
          <span className="inline-flex items-center gap-2 text-primary text-sm font-semibold tracking-wider uppercase bg-primary/10 px-4 py-1.5 rounded-full mb-3">
            <Sparkles size={14} /> {t('storiesPreview.badge')}
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold mt-3 mb-3 gradient-text">
            {t('storiesPreview.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            {t('storiesPreview.subtitle')}
          </p>
        </motion.div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
          {features.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 15, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1, type: "spring", stiffness: 200 }}
              whileHover={{ y: -6, scale: 1.03 }}
              className="bg-card border border-border rounded-2xl p-4 text-center shadow-sm hover:shadow-lg transition-all cursor-pointer"
              onClick={() => navigate("/stories")}
            >
              <motion.div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 bg-gradient-to-br ${f.color}`}
                whileHover={{ rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5 }}
              >
                <f.icon className="w-6 h-6 text-white" />
              </motion.div>
              <h4 className="text-sm font-bold text-foreground mb-1">{f.title}</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Phone Mockup + Feature Description Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center mb-12">
          {/* Phone Mockup - Animated Feed Preview */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? 40 : -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex justify-center"
          >
            <div className="relative w-[280px] h-[560px]">
              {/* Phone frame */}
              <div className="absolute inset-0 bg-foreground/10 rounded-[3rem] border-4 border-foreground/20 shadow-2xl overflow-hidden">
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-foreground/20 rounded-b-2xl z-20" />
                
                {/* Screen content */}
                <div className="absolute inset-1 rounded-[2.5rem] overflow-hidden bg-black">
                  {/* Feed image */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentPhone.id}
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.6 }}
                      className="absolute inset-0"
                    >
                      <img src={currentPhone.image} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                    </motion.div>
                  </AnimatePresence>

                  {/* Top bar */}
                  <div className="absolute top-8 left-0 right-0 px-4 z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={currentPhone.avatar} alt="" className="w-7 h-7 rounded-full border border-white/50" />
                      <div>
                        <p className="text-white text-[10px] font-bold">{currentPhone.author}</p>
                        <p className="text-white/50 text-[8px]">2h ago</p>
                      </div>
                    </div>
                    <Badge className="bg-white/15 text-white border-0 text-[8px] px-2 py-0.5 backdrop-blur-sm">
                      <MapPin className="w-2.5 h-2.5 mr-0.5" />{currentPhone.location_name}
                    </Badge>
                  </div>

                  {/* Category badge */}
                  <Badge className="absolute top-16 left-4 z-10 bg-accent text-accent-foreground border-0 text-[8px] uppercase font-bold px-2 py-0.5">
                    {currentPhone.category}
                  </Badge>

                  {/* Right side actions */}
                  <div className="absolute right-3 bottom-36 z-10 flex flex-col items-center gap-4">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                        <Heart className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-white text-[8px] font-bold">{currentPhone.likes}</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-white text-[8px] font-bold">{currentPhone.comments}</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                      <Bookmark className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* Bottom content */}
                  <div className="absolute bottom-12 left-0 right-0 px-4 z-10">
                    <motion.div
                      key={`phone-content-${currentPhone.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h4 className="text-white font-bold text-sm mb-0.5">{currentPhone.title}</h4>
                      <p className="text-white/60 text-[9px] line-clamp-2">{currentPhone.desc}</p>
                    </motion.div>
                  </div>

                  {/* Bottom nav */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md px-3 py-2 z-10 flex items-center justify-around">
                    <button onClick={(e) => { e.stopPropagation(); navigate("/stories"); }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-transform">
                      <Play className="w-4 h-4 text-white" />
                      <span className="text-white text-[7px]">Feed</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); navigate("/stories"); }} className="flex flex-col items-center gap-0.5 relative hover:scale-110 transition-transform">
                      <Radio className="w-4 h-4 text-white/60" />
                      <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-white/60 text-[7px]">Live</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); navigate("/stories", { state: { openCreateForm: true } }); }} className="w-8 h-6 rounded-lg bg-gradient-to-r from-accent to-primary flex items-center justify-center -mt-2 hover:scale-110 transition-transform">
                      <span className="text-white text-lg font-bold">+</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); navigate("/stories"); }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-transform">
                      <Globe className="w-4 h-4 text-white/60" />
                      <span className="text-white/60 text-[7px]">Map</span>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); navigate("/stories/discover"); }} className="flex flex-col items-center gap-0.5 hover:scale-110 transition-transform">
                      <Star className="w-4 h-4 text-white/60" />
                      <span className="text-white/60 text-[7px]">Explore</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Clickable overlay to open feed */}
              <button
                onClick={() => navigate("/stories")}
                aria-label={t('storiesPreview.discoverStories')}
                className="absolute inset-0 z-10 cursor-pointer"
                style={{ background: "transparent" }}
              />

              {/* Glow effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-[4rem] blur-2xl -z-10 opacity-50" />
            </div>
          </motion.div>

          {/* Feature description */}
          <motion.div
            initial={{ opacity: 0, x: isArabic ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h3 className="text-2xl md:text-3xl font-extrabold text-foreground">
              {t('storiesPreview.interactiveFeedTitle')}
            </h3>
            <p className="text-muted-foreground">
              {t('storiesPreview.interactiveFeedDesc')}
            </p>

            <div className="space-y-4">
              {[
                { icon: Play, title: t('storiesPreview.feedTitle'), desc: t('storiesPreview.feedDesc'), color: "text-primary" },
                { icon: Radio, title: t('storiesPreview.liveTitle'), desc: t('storiesPreview.liveDesc'), color: "text-red-500" },
                { icon: Film, title: t('storiesPreview.reelsTitle'), desc: t('storiesPreview.reelsDesc'), color: "text-violet-500", link: "/stories/reels" },
                { icon: MapPin, title: t('storiesPreview.storyMapTitle'), desc: t('storiesPreview.storyMapDesc'), color: "text-emerald-500" },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: isArabic ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate((item as any).link || "/stories")}
                >
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-foreground">{item.title}</h5>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Story Slider */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden mb-8 h-72 md:h-80 group cursor-pointer"
          onClick={() => navigate("/stories")}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.7 }}
              className="absolute inset-0"
            >
              <img src={currentSlide.image} alt={currentSlide.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            </motion.div>
          </AnimatePresence>

          <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
            <motion.div key={`content-${currentSlide.id}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
              <Badge className="bg-white/20 backdrop-blur-sm text-white border-0 text-xs mb-2">
                <MapPin className="w-3 h-3 mr-1" />{currentSlide.location_name}
              </Badge>
              <h3 className="text-white font-extrabold text-2xl md:text-3xl mb-1">{currentSlide.title}</h3>
              <p className="text-white/70 text-sm">{currentSlide.desc}</p>
            </motion.div>
          </div>

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.div whileHover={{ scale: 1.1 }} className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Play className="w-7 h-7 text-white ml-1" />
            </motion.div>
          </div>

          <button onClick={(e) => { e.stopPropagation(); setActiveSlide(p => (p - 1 + PLACEHOLDER_STORIES.length) % PLACEHOLDER_STORIES.length); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setActiveSlide(p => (p + 1) % PLACEHOLDER_STORIES.length); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <ChevronRight className="w-5 h-5 text-white" />
          </button>

          <div className="absolute bottom-3 right-6 z-10 flex gap-1.5">
            {PLACEHOLDER_STORIES.map((_, i) => (
              <button key={i} onClick={(e) => { e.stopPropagation(); setActiveSlide(i); }}
                className={`h-1.5 rounded-full transition-all ${i === activeSlide ? 'bg-white w-6' : 'bg-white/40 w-1.5'}`} />
            ))}
          </div>
        </motion.div>

        {/* Story cards grid */}
        {hasRealStories ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {stories.map((story, i) => {
              const img = story.media_urls?.[0];
              const profile = story.profiles as any;
              return (
                <motion.div key={story.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -5 }} onClick={() => navigate("/stories")} className="cursor-pointer group">
                  <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-all h-64">
                    {img ? (
                      <img src={img} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <MapPin className="w-12 h-12 text-primary/40" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white font-bold text-sm line-clamp-2 mb-1">{story.title}</h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} className="w-5 h-5 rounded-full border border-white/50" alt="" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-primary/30" />
                          )}
                          <span className="text-white/80 text-[10px]">{profile?.full_name || t('storiesPreview.traveler')}</span>
                        </div>
                        <span className="text-white/70 text-[10px] flex items-center gap-0.5">
                          <Heart className="w-3 h-3" /> {story.likes_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            {PLACEHOLDER_STORIES.slice(0, 3).map((ps, i) => (
              <motion.div key={ps.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5 }} onClick={() => navigate("/stories")} className="cursor-pointer group">
                <div className="relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-lg transition-all h-64">
                  <img src={ps.image} alt={ps.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <img src={ps.avatar} alt="" className="w-5 h-5 rounded-full border border-white/50" />
                      <span className="text-white/80 text-[10px]">{ps.author}</span>
                    </div>
                    <h3 className="text-white font-bold text-sm mb-1">{ps.title}</h3>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-white/20 text-white border-0 text-[9px] px-1.5 py-0">
                        <MapPin className="w-2.5 h-2.5 mr-0.5" />{ps.location_name}
                      </Badge>
                      <span className="text-white/70 text-[10px] flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> {ps.likes}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Button onClick={() => navigate("/stories")} className="rounded-full px-8 gap-2 bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg">
            {t('storiesPreview.discoverStories')} <ArrowRight className="w-4 h-4" />
          </Button>
          <Button onClick={() => navigate("/stories", { state: { openCreateForm: true } })} variant="outline" className="rounded-full px-8 gap-2">
            <BookOpen className="w-4 h-4" /> {t('storiesPreview.publishStory')}
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default StoriesPreview;