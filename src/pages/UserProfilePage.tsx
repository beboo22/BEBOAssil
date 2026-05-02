import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { VehicleSection } from "@/components/profile/VehicleSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { User, MapPin, Award, Car, BookOpen, UserPlus, UserMinus, Loader2, Grid3x3, Play, Heart, MessageCircle, Calendar, Trophy, Star, TrendingUp, X } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { fetchExtendedPublicProfile, fetchPublicProfile } from "@/utils/publicProfiles";

const UserProfilePage = () => {
  const { userId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');

  const [profile, setProfile] = useState<any>(null);
  const [stories, setStories] = useState<any[]>([]);
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [stats, setStats] = useState({ stories: 0, followers: 0, following: 0, points: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("grid");
  const [followDialog, setFollowDialog] = useState<'followers' | 'following' | null>(null);
  const [followList, setFollowList] = useState<any[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);

  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    if (userId) loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    if (!userId) return;
    setLoading(true);

    const [profileData, storiesRes, followersRes, followingRes, pointsRes, vehiclesRes, tripsRes] = await Promise.all([
      fetchExtendedPublicProfile(userId),
      supabase.from("travel_stories").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
      supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
      supabase.from("user_points").select("points").eq("user_id", userId),
      supabase.from("user_vehicles").select("*").eq("user_id", userId).order("is_primary", { ascending: false }),
      supabase.from("saved_trips").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    ]);

    if (profileData) setProfile(profileData);
    if (storiesRes.data) {
      // Attach the same author profile to every story (it's all the same user)
      const withProfile = storiesRes.data.map((s: any) => ({ ...s, profiles: profileData }));
      setStories(withProfile as any);
    }
    if (vehiclesRes.data) setVehicles(vehiclesRes.data as any);
    if (tripsRes.data) setSavedTrips(tripsRes.data as any);

    const totalPoints = (pointsRes.data || []).reduce((sum: number, p: any) => sum + p.points, 0);
    setStats({
      stories: storiesRes.data?.length || 0,
      followers: followersRes.count || 0,
      following: followingRes.count || 0,
      points: totalPoints,
    });

    if (user && user.id !== userId) {
      const { data: followData } = await supabase
        .from("user_follows").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle();
      setIsFollowing(!!followData);
    }

    setLoading(false);
  };

  const toggleFollow = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!userId || user.id === userId) return;
    
    // Optimistic UI update
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setStats(p => ({ ...p, followers: wasFollowing ? p.followers - 1 : p.followers + 1 }));
    
    try {
      if (wasFollowing) {
        const { error } = await supabase.from("user_follows").delete().eq("follower_id", user.id).eq("following_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_follows").insert({ follower_id: user.id, following_id: userId });
        if (error) throw error;
        toast({ title: "✅ " + (isArabic ? "تمت المتابعة" : "Following") });
        // Notify the followed user
        try {
          const { data: myProfile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
          await supabase.from("notifications").insert({
            user_id: userId,
            type: 'follow',
            title: isArabic ? 'متابع جديد 👤' : 'New Follower 👤',
            message: `${myProfile?.full_name || (isArabic ? 'مسافر' : 'Traveler')} ${isArabic ? 'بدأ متابعتك' : 'started following you'}`,
            metadata: { follower_id: user.id } as any,
          });
        } catch {}
      }
    } catch (err) {
      // Revert optimistic update
      setIsFollowing(wasFollowing);
      setStats(p => ({ ...p, followers: wasFollowing ? p.followers + 1 : p.followers - 1 }));
      toast({ title: isArabic ? 'حدث خطأ' : 'Error occurred', variant: 'destructive' });
      console.error(err);
    }
  };

  const openFollowList = async (type: 'followers' | 'following') => {
    if (!userId) return;
    setFollowDialog(type);
    setFollowListLoading(true);
    try {
      if (type === 'followers') {
        const { data } = await supabase.from('user_follows').select('follower_id, profiles!user_follows_follower_id_fkey(id, full_name, avatar_url, username)').eq('following_id', userId);
        setFollowList((data || []).map((d: any) => d.profiles).filter(Boolean));
      } else {
        const { data } = await supabase.from('user_follows').select('following_id, profiles!user_follows_following_id_fkey(id, full_name, avatar_url, username)').eq('follower_id', userId);
        setFollowList((data || []).map((d: any) => d.profiles).filter(Boolean));
      }
    } catch { setFollowList([]); }
    setFollowListLoading(false);
  };

  const getPointsBadge = (pts: number) => {
    if (pts >= 500) return { label: isArabic ? 'ماسي' : 'Diamond', color: 'bg-sky-500/15 text-sky-600', icon: '💎' };
    if (pts >= 200) return { label: isArabic ? 'ذهبي' : 'Gold', color: 'bg-amber-500/15 text-amber-600', icon: '🥇' };
    if (pts >= 100) return { label: isArabic ? 'فضي' : 'Silver', color: 'bg-gray-400/15 text-gray-600', icon: '🥈' };
    return { label: isArabic ? 'برونزي' : 'Bronze', color: 'bg-orange-500/15 text-orange-600', icon: '🥉' };
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center pt-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!profile) return <div className="min-h-screen flex items-center justify-center pt-20 text-muted-foreground">{isArabic ? 'المستخدم غير موجود' : 'User not found'}</div>;

  const badge = getPointsBadge(stats.points);

  return (
    <div className="min-h-screen bg-background pt-16">
      {/* Profile Header */}
      <div className="container mx-auto max-w-lg px-4 py-6">
        {/* Avatar + Stats row */}
        <div className="flex items-center gap-6 mb-4">
          <div className="relative shrink-0">
            <Avatar className="w-24 h-24 border-4 border-primary/20 shadow-xl">
              <AvatarImage src={profile.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-3xl"><User /></AvatarFallback>
            </Avatar>
            {stats.points >= 100 && (
              <span className="absolute -bottom-1 -right-1 text-lg">{badge.icon}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-lg font-extrabold text-foreground truncate">{profile.full_name || (isArabic ? "مسافر" : "Traveler")}</h1>
            </div>
            {stats.points > 0 && (
              <Badge className={`${badge.color} border-0 gap-1 text-[10px] font-bold mb-2`}>
                <Trophy className="w-3 h-3" />{badge.label} · {stats.points} {isArabic ? 'نقطة' : 'pts'}
              </Badge>
            )}
            {/* Stats row */}
            <div className="flex gap-6">
              {[
                { value: stats.stories, label: isArabic ? 'منشور' : 'Posts', action: undefined },
                { value: stats.followers, label: isArabic ? 'متابع' : 'Followers', action: () => openFollowList('followers') },
                { value: stats.following, label: isArabic ? 'يتابع' : 'Following', action: () => openFollowList('following') },
              ].map(({ value, label, action }) => (
                <div key={label} className={`text-center ${action ? 'cursor-pointer hover:opacity-70 transition-opacity' : ''}`} onClick={action}>
                  <span className="text-base font-extrabold text-foreground block">{value}</span>
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Travel interests */}
        {profile.travel_interests?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {profile.travel_interests.map((i: string) => (
              <Badge key={i} variant="outline" className="text-[10px] px-2 py-0.5 rounded-full">{i}</Badge>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 mb-4">
          {!isOwnProfile && user ? (
            <>
              <Button onClick={toggleFollow} variant={isFollowing ? "outline" : "default"} className="flex-1 gap-1.5 h-10 rounded-xl text-sm font-bold">
                {isFollowing ? <><UserMinus className="w-4 h-4" />{isArabic ? 'إلغاء المتابعة' : 'Unfollow'}</> : <><UserPlus className="w-4 h-4" />{isArabic ? 'متابعة' : 'Follow'}</>}
              </Button>
              <Button variant="outline" className="flex-1 h-10 rounded-xl text-sm font-bold">
                {isArabic ? 'رسالة' : 'Message'}
              </Button>
            </>
          ) : isOwnProfile ? (
            <Button variant="outline" onClick={() => navigate("/profile")} className="flex-1 gap-1.5 h-10 rounded-xl text-sm font-bold">
              <User className="w-3.5 h-3.5" />{isArabic ? 'تعديل الملف الشخصي' : 'Edit Profile'}
            </Button>
          ) : null}
        </div>

        {/* Quick stats cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Card className="p-3 text-center bg-primary/5 border-primary/10">
            <TrendingUp className="w-4 h-4 text-primary mx-auto mb-1" />
            <p className="text-lg font-extrabold text-foreground">{stats.stories}</p>
            <p className="text-[9px] text-muted-foreground">{isArabic ? 'قصص' : 'Stories'}</p>
          </Card>
          <Card className="p-3 text-center bg-accent/5 border-accent/10">
            <Star className="w-4 h-4 text-accent mx-auto mb-1" />
            <p className="text-lg font-extrabold text-foreground">{stats.points}</p>
            <p className="text-[9px] text-muted-foreground">{isArabic ? 'نقاط' : 'Points'}</p>
          </Card>
          <Card className="p-3 text-center bg-emerald-500/5 border-emerald-500/10">
            <MapPin className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-extrabold text-foreground">{savedTrips.length}</p>
            <p className="text-[9px] text-muted-foreground">{isArabic ? 'رحلات' : 'Trips'}</p>
          </Card>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="container mx-auto max-w-lg border-t border-border">
        <div className="flex">
          {[
            { id: 'grid', icon: Grid3x3 },
            { id: 'trips', icon: MapPin },
            { id: 'vehicles', icon: Car },
          ].map(({ id, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 py-3 flex justify-center border-b-2 transition-colors ${activeTab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}>
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </div>

        <div className="pb-20">
          {activeTab === 'grid' && (
            stories.length === 0 ? (
              <div className="py-16 text-center">
                <BookOpen className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{isArabic ? 'لم يشارك أي قصص بعد' : 'No stories yet'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-0.5">
                {stories.map((story, idx) => {
                  const img = story.media_urls?.[0];
                  const isVideo = img && /\.(mp4|webm|mov)(\?|$)/i.test(img);
                  return (
                    <motion.div key={story.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                      className="relative aspect-square cursor-pointer group overflow-hidden"
                      onClick={() => navigate(`/stories?id=${story.id}`)}>
                      {img ? (
                        <img src={img} alt={story.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
                          <MapPin className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1 text-white text-sm font-bold">
                          <Heart className="w-4 h-4 fill-white" />{story.likes_count || 0}
                        </div>
                        <div className="flex items-center gap-1 text-white text-sm font-bold">
                          <MessageCircle className="w-4 h-4 fill-white" />{story.comments_count || 0}
                        </div>
                      </div>
                      {(isVideo || story.video_url) && (
                        <div className="absolute top-1.5 right-1.5">
                          <Play className="w-4 h-4 text-white fill-white drop-shadow" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'trips' && (
            savedTrips.length === 0 ? (
              <div className="py-16 text-center">
                <MapPin className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">{isArabic ? 'لا توجد رحلات محفوظة' : 'No saved trips'}</p>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {savedTrips.map((trip, idx) => (
                  <motion.div key={trip.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                    <Card className="p-4 border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/itinerary/${trip.trip_id}`)}>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-foreground text-sm truncate">{trip.destination}</h4>
                          <div className="flex items-center gap-2 text-muted-foreground text-xs">
                            <Calendar className="w-3 h-3" />
                            {new Date(trip.created_at).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-US')}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-xs shrink-0">{isArabic ? 'عرض' : 'View'}</Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )
          )}

          {activeTab === 'vehicles' && (
            <div className="p-3">
              <VehicleSection vehicles={vehicles} isOwnProfile={isOwnProfile} userId={userId!} onUpdate={loadProfile} />
            </div>
          )}
        </div>
      </div>

      {/* Followers/Following Dialog */}
      <Dialog open={!!followDialog} onOpenChange={() => setFollowDialog(null)}>
        <DialogContent className="max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{followDialog === 'followers' ? (isArabic ? 'المتابعون' : 'Followers') : (isArabic ? 'يتابع' : 'Following')}</DialogTitle>
          </DialogHeader>
          {followListLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : followList.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">{isArabic ? 'لا يوجد' : 'None yet'}</p>
          ) : (
            <div className="space-y-2">
              {followList.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { setFollowDialog(null); navigate(`/profile/${p.id}`); }}>
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={p.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm"><User className="w-4 h-4" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{p.full_name || (isArabic ? 'مسافر' : 'Traveler')}</p>
                    {p.username && <p className="text-[11px] text-muted-foreground">@{p.username}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserProfilePage;
