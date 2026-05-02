import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Medal, Crown, User, BookOpen, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface LeaderEntry {
  user_id: string;
  full_name: string;
  avatar_url: string;
  total_points: number;
  stories_count: number;
  latest_story?: { title: string; media_url?: string; location?: string };
}

type SortBy = 'points' | 'stories';
type TimePeriod = 'all' | 'monthly' | 'weekly';

export const TravelLeaderboard = () => {
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('points');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language?.startsWith('ar');

  useEffect(() => { fetchLeaderboard(); }, [timePeriod]);

  const getTimeCutoff = (): string | null => {
    const now = new Date();
    if (timePeriod === 'weekly') {
      now.setDate(now.getDate() - 7);
      return now.toISOString();
    }
    if (timePeriod === 'monthly') {
      now.setMonth(now.getMonth() - 1);
      return now.toISOString();
    }
    return null;
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const cutoff = getTimeCutoff();

      if (timePeriod === 'all') {
        // Use total_points from profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, total_points")
          .order("total_points", { ascending: false })
          .limit(20);

        if (!profiles || profiles.length === 0) { setLeaders([]); setLoading(false); return; }

        const entries: LeaderEntry[] = await Promise.all(
          profiles.map(async (p) => {
            const [{ count }, { data: latestStory }] = await Promise.all([
              supabase.from("travel_stories").select("*", { count: "exact", head: true }).eq("user_id", p.id),
              supabase.from("travel_stories").select("title, media_urls, location_name").eq("user_id", p.id).order("created_at", { ascending: false }).limit(1),
            ]);
            const story = latestStory?.[0];
            return {
              user_id: p.id,
              full_name: p.full_name || (isArabic ? 'مسافر' : 'Traveler'),
              avatar_url: p.avatar_url || "",
              total_points: p.total_points || 0,
              stories_count: count || 0,
              latest_story: story ? { title: story.title, media_url: (story.media_urls as string[])?.[0], location: story.location_name || undefined } : undefined,
            };
          })
        );
        setLeaders(entries);
      } else {
        // Sum points from user_points table within the time period
        const { data: pointsData } = await supabase
          .from("user_points")
          .select("user_id, points")
          .gte("created_at", cutoff!);

        if (!pointsData || pointsData.length === 0) { setLeaders([]); setLoading(false); return; }

        // Aggregate points per user
        const userPoints: Record<string, number> = {};
        pointsData.forEach(r => {
          userPoints[r.user_id] = (userPoints[r.user_id] || 0) + r.points;
        });

        const userIds = Object.keys(userPoints);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);

        if (!profiles) { setLeaders([]); setLoading(false); return; }

        const entries: LeaderEntry[] = await Promise.all(
          profiles.map(async (p) => {
            const [{ count }, { data: latestStory }] = await Promise.all([
              supabase.from("travel_stories").select("*", { count: "exact", head: true }).eq("user_id", p.id).gte("created_at", cutoff!),
              supabase.from("travel_stories").select("title, media_urls, location_name").eq("user_id", p.id).order("created_at", { ascending: false }).limit(1),
            ]);
            const story = latestStory?.[0];
            return {
              user_id: p.id,
              full_name: p.full_name || (isArabic ? 'مسافر' : 'Traveler'),
              avatar_url: p.avatar_url || "",
              total_points: userPoints[p.id] || 0,
              stories_count: count || 0,
              latest_story: story ? { title: story.title, media_url: (story.media_urls as string[])?.[0], location: story.location_name || undefined } : undefined,
            };
          })
        );
        setLeaders(entries);
      }
    } catch {
      setLeaders([]);
    } finally { setLoading(false); }
  };

  const sorted = [...leaders].sort((a, b) => sortBy === 'points' ? b.total_points - a.total_points : b.stories_count - a.stories_count);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-500 drop-shadow" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">{rank}</span>;
  };

  const getBadge = (points: number) => {
    if (points >= 500) return { label: isArabic ? '💎 ماسي' : '💎 Diamond', color: "bg-violet-500/20 text-violet-700 dark:text-violet-400" };
    if (points >= 200) return { label: isArabic ? '🥇 ذهبي' : '🥇 Gold', color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" };
    if (points >= 100) return { label: isArabic ? '🌍 رحالة' : '🌍 Globe Trotter', color: "bg-primary/20 text-primary" };
    if (points >= 50) return { label: isArabic ? '🧭 مستكشف' : '🧭 Explorer', color: "bg-blue-500/20 text-blue-700 dark:text-blue-400" };
    if (points >= 20) return { label: isArabic ? '⚡ نشط' : '⚡ Active', color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" };
    return { label: isArabic ? '🌱 مبتدئ' : '🌱 Beginner', color: "bg-green-500/20 text-green-700 dark:text-green-400" };
  };

  const handleClick = (leader: LeaderEntry) => {
    navigate(`/profile/${leader.user_id}`);
  };

  const timePeriodLabel = (v: TimePeriod) => {
    if (v === 'weekly') return isArabic ? 'أسبوعي' : 'Weekly';
    if (v === 'monthly') return isArabic ? 'شهري' : 'Monthly';
    return isArabic ? 'كل الأوقات' : 'All Time';
  };

  if (loading) return <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}</div>;

  if (leaders.length === 0) return (
    <div className="text-center py-16">
      <Trophy className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
      <h3 className="text-base font-bold text-foreground mb-1">{isArabic ? 'المتصدرون' : 'Leaderboard'}</h3>
      <p className="text-xs text-muted-foreground">{isArabic ? 'لا يوجد مسافرون بعد' : 'No travelers yet'}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header with filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h3 className="font-bold text-foreground">{isArabic ? 'المتصدرون' : 'Leaderboard'}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timePeriod} onValueChange={(v) => setTimePeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[110px] h-8 text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{timePeriodLabel('all')}</SelectItem>
              <SelectItem value="monthly">{timePeriodLabel('monthly')}</SelectItem>
              <SelectItem value="weekly">{timePeriodLabel('weekly')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[110px] h-8 text-xs rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="points">{isArabic ? 'الأعلى نقاطاً' : 'Most Points'}</SelectItem>
              <SelectItem value="stories">{isArabic ? 'الأكثر قصصاً' : 'Most Stories'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Top 3 podium */}
      {sorted.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[sorted[1], sorted[0], sorted[2]].map((leader, i) => {
            const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
            const badge = getBadge(leader.total_points);
            const isFirst = rank === 1;
            return (
              <motion.div key={leader.user_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }}
                onClick={() => handleClick(leader)}
                className={`cursor-pointer text-center ${isFirst ? 'order-1 -mt-4' : i === 0 ? 'order-0 mt-4' : 'order-2 mt-4'}`}>
                <Card className={`p-3 rounded-2xl border-border relative overflow-hidden ${isFirst ? 'bg-gradient-to-b from-yellow-50 to-card dark:from-yellow-900/20 dark:to-card shadow-lg ring-2 ring-yellow-500/30' : 'bg-card hover:shadow-md transition-shadow'}`}>
                  {leader.latest_story?.media_url && (
                    <div className="absolute inset-0 opacity-10">
                      <img src={leader.latest_story.media_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="relative z-10">
                    <div className="flex justify-center mb-1">{getRankIcon(rank)}</div>
                    <Avatar className={`mx-auto mb-1.5 ${isFirst ? 'w-14 h-14 ring-4 ring-yellow-500/40' : 'w-11 h-11 ring-2 ring-border'}`}>
                      <AvatarImage src={leader.avatar_url} />
                      <AvatarFallback className="bg-primary/10 text-primary"><User className="w-5 h-5" /></AvatarFallback>
                    </Avatar>
                    <p className="font-bold text-xs text-foreground truncate">{leader.full_name}</p>
                    <p className="text-base font-black text-primary">{leader.total_points.toLocaleString('en-US')}</p>
                    <p className="text-[10px] text-muted-foreground">{isArabic ? 'نقطة' : 'pts'}</p>
                    <Badge className={`text-[9px] mt-1 ${badge.color} border-0`}>{badge.label}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-0.5">
                      <BookOpen className="w-2.5 h-2.5" />{leader.stories_count}
                    </p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* If less than 3, show as list */}
      {sorted.length > 0 && sorted.length < 3 && (
        <div className="space-y-2">
          {sorted.map((leader, index) => {
            const badge = getBadge(leader.total_points);
            const rank = index + 1;
            return (
              <Card key={leader.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-card border-border cursor-pointer"
                onClick={() => handleClick(leader)}>
                <span className="w-6 text-center text-sm font-bold text-primary">{rank}</span>
                <Avatar className="w-10 h-10">
                  <AvatarImage src={leader.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary"><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{leader.full_name}</p>
                  <Badge className={`text-[9px] ${badge.color} border-0`}>{badge.label}</Badge>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary text-sm">{leader.total_points.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-muted-foreground">{isArabic ? 'نقطة' : 'pts'}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rest of leaderboard (rank 4+) */}
      <div className="space-y-2">
        {sorted.slice(3).map((leader, index) => {
          const badge = getBadge(leader.total_points);
          const rank = index + 4;
          return (
            <motion.div key={leader.user_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + index * 0.04 }}>
              <Card className="flex items-center gap-3 p-3 rounded-xl bg-card border-border hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group"
                onClick={() => handleClick(leader)}>
                <span className="w-6 text-center text-sm font-bold text-muted-foreground">{rank}</span>
                <Avatar className="w-10 h-10 group-hover:ring-2 group-hover:ring-primary/30 transition-all">
                  <AvatarImage src={leader.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-primary"><User className="w-4 h-4" /></AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">{leader.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={`text-[9px] ${badge.color} border-0`}>{badge.label}</Badge>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <BookOpen className="w-2.5 h-2.5" />{leader.stories_count}
                    </span>
                    {leader.latest_story?.location && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate max-w-[100px]">
                        <MapPin className="w-2.5 h-2.5 shrink-0" />{leader.latest_story.location}
                      </span>
                    )}
                  </div>
                </div>
                {leader.latest_story?.media_url && (
                  <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-border">
                    <img src={leader.latest_story.media_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary text-sm">{leader.total_points.toLocaleString('en-US')}</p>
                  <p className="text-[10px] text-muted-foreground">{isArabic ? 'نقطة' : 'pts'}</p>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
