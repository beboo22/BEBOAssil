import { useState, useEffect } from "react";
import { Trophy, Save, Coins, Gift, Star, Users, Search, Eye, Plus, Trash2, Zap, Flame, Clock, Cake, PartyPopper, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STREAK_CHALLENGES, type StreakChallenge } from "@/utils/pointsSystem";

interface PointsConfig {
  [key: string]: number;
}

interface DisabledActions {
  [key: string]: boolean; // true = disabled
}

interface RewardThreshold {
  points: number;
  reward: string;
  rewardEn: string;
  type: string;
  freeGenerations: number;
  enabled?: boolean;
}

interface AutoDiscountConfig {
  birthday_enabled: boolean;
  birthday_discount_percent: number;
  birthday_bonus_points: number;
  birthday_code_prefix: string;
  occasions: OccasionDiscount[];
}

interface OccasionDiscount {
  id: string;
  name: string;
  nameAr: string;
  date: string; // MM-DD
  enabled: boolean;
  discount_percent: number;
  bonus_points: number;
  target: 'all' | 'country';
  target_country?: string;
}

const POINT_LABELS: Record<string, { en: string; ar: string }> = {
  CREATE_STORY: { en: 'Create Story', ar: 'نشر قصة' },
  LIKE_STORY: { en: 'Like Story', ar: 'إعجاب' },
  COMMENT_ON_STORY: { en: 'Comment', ar: 'تعليق' },
  SHARE_STORY: { en: 'Share Story', ar: 'مشاركة' },
  FOLLOW_USER: { en: 'Follow User', ar: 'متابعة' },
  COMPLETE_PROFILE: { en: 'Complete Profile', ar: 'إكمال الملف' },
  BOOK_TRIP: { en: 'Book Trip', ar: 'حجز رحلة' },
  FIRST_LOGIN: { en: 'First Login', ar: 'أول تسجيل' },
  INVITE_FRIEND: { en: 'Invite Friend', ar: 'دعوة صديق' },
  DAILY_LOGIN: { en: 'Daily Login', ar: 'تسجيل يومي' },
  REFERRED_SIGNUP: { en: 'Referred Signup', ar: 'تسجيل مُحال' },
};

const AdminRewards = () => {
  const [points, setPoints] = useState<PointsConfig>({});
  const [rewards, setRewards] = useState<RewardThreshold[]>([]);
  const [streaks, setStreaks] = useState<StreakChallenge[]>([]);
  const [disabledActions, setDisabledActions] = useState<DisabledActions>({});
  const [autoDiscount, setAutoDiscount] = useState<AutoDiscountConfig>({
    birthday_enabled: false, birthday_discount_percent: 10, birthday_bonus_points: 20,
    birthday_code_prefix: 'BDAY', occasions: [
      { id: 'new_year', name: 'New Year', nameAr: 'رأس السنة', date: '01-01', enabled: false, discount_percent: 15, bonus_points: 10, target: 'all' },
      { id: 'womens_day', name: "Women's Day", nameAr: 'يوم المرأة', date: '03-08', enabled: false, discount_percent: 10, bonus_points: 5, target: 'all' },
      { id: 'national_day_sa', name: 'Saudi National Day', nameAr: 'اليوم الوطني السعودي', date: '09-23', enabled: false, discount_percent: 20, bonus_points: 15, target: 'country', target_country: 'Saudi Arabia' },
      { id: 'national_day_ae', name: 'UAE National Day', nameAr: 'اليوم الوطني الإماراتي', date: '12-02', enabled: false, discount_percent: 20, bonus_points: 15, target: 'country', target_country: 'United Arab Emirates' },
    ]
  });
  const [topUsers, setTopUsers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [totalPointsIssued, setTotalPointsIssued] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const [settingsRes, usersRes, pointsRes] = await Promise.all([
      supabase.from("site_settings").select("points_config, rewards_config, streak_challenges_config").eq("id", "default").single(),
      supabase.from("profiles").select("id, full_name, username, avatar_url, total_points, email").order("total_points", { ascending: false }),
      supabase.from("user_points").select("points"),
    ]);

    if (settingsRes.data) {
      const pc = (settingsRes.data as any).points_config || {};
      // Separate disabled_actions from points_config
      if (pc._disabled_actions) {
        setDisabledActions(pc._disabled_actions);
        const { _disabled_actions, _auto_discount, ...rest } = pc;
        setPoints(rest);
        if (_auto_discount) setAutoDiscount(prev => ({ ...prev, ..._auto_discount }));
      } else {
        setPoints(pc);
      }
      const rc = (settingsRes.data as any).rewards_config || [];
      setRewards(rc.map((r: any) => ({ ...r, enabled: r.enabled !== false })));
      const sc = (settingsRes.data as any).streak_challenges_config;
      setStreaks(Array.isArray(sc) && sc.length > 0 ? sc : [...DEFAULT_STREAK_CHALLENGES]);
    }
    
    const users = usersRes.data || [];
    setTopUsers(users.filter(u => (u.total_points || 0) > 0).slice(0, 10));
    setAllUsers(users);
    
    const total = (pointsRes.data || []).reduce((sum, p) => sum + (p.points > 0 ? p.points : 0), 0);
    setTotalPointsIssued(total);
    setLoading(false);
  };

  const saveConfig = async () => {
    const configToSave = { ...points, _disabled_actions: disabledActions, _auto_discount: autoDiscount };
    const { error } = await supabase.from("site_settings").update({
      points_config: configToSave as any,
      rewards_config: rewards as any,
      streak_challenges_config: streaks as any,
    }).eq("id", "default");
    
    if (error) toast.error("Failed to save");
    else toast.success("✅ All settings saved!");
  };

  const updateReward = (index: number, field: keyof RewardThreshold, value: string | number) => {
    setRewards(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const addRewardTier = () => {
    setRewards(prev => [...prev, { points: 0, reward: '', rewardEn: '', type: 'custom', freeGenerations: 0 }]);
  };

  const removeRewardTier = (index: number) => {
    setRewards(prev => prev.filter((_, i) => i !== index));
  };

  const viewUserPoints = async (user: any) => {
    setSelectedUser(user);
    const { data } = await supabase.from("user_points").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    setUserHistory(data || []);
  };

  const filteredUsers = allUsers.filter(u =>
    (u.full_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.username || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUserRewardTier = (totalPoints: number) => {
    const sorted = [...rewards].sort((a, b) => b.points - a.points);
    return sorted.find(r => totalPoints >= r.points);
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Coins className="mx-auto mb-1 text-accent" size={20} />
          <p className="text-2xl font-bold text-foreground">{totalPointsIssued}</p>
          <p className="text-xs text-muted-foreground">Total Points Issued</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Users className="mx-auto mb-1 text-primary" size={20} />
          <p className="text-2xl font-bold text-foreground">{allUsers.filter(u => (u.total_points || 0) > 0).length}</p>
          <p className="text-xs text-muted-foreground">Users with Points</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Gift className="mx-auto mb-1 text-accent" size={20} />
          <p className="text-2xl font-bold text-foreground">{rewards.length}</p>
          <p className="text-xs text-muted-foreground">Reward Tiers</p>
        </div>
      </div>

      {/* Points Configuration */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Coins className="w-4 h-4 text-accent" /> Points Per Action
          </h3>
          <Button size="sm" onClick={saveConfig} className="text-xs gap-1"><Save className="w-3 h-3" /> Save All</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.keys(POINT_LABELS).map(key => (
            <div key={key} className={`space-y-1 p-2 rounded-lg border ${disabledActions[key] ? 'opacity-50 border-destructive/30 bg-destructive/5' : 'border-transparent'}`}>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{POINT_LABELS[key]?.en}</Label>
                <Switch checked={!disabledActions[key]} onCheckedChange={v => setDisabledActions(prev => ({ ...prev, [key]: !v }))} />
              </div>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={100} value={points[key] || 0}
                  onChange={e => setPoints(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="h-8 text-sm" disabled={disabledActions[key]} />
                <Badge className="bg-accent/10 text-accent border-0 text-xs shrink-0">+{points[key] || 0}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reward Thresholds */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" /> Reward Thresholds
          </h3>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={addRewardTier}>
            <Plus className="w-3 h-3" /> Add Tier
          </Button>
        </div>
        <div className="space-y-3">
          {rewards.map((reward, i) => (
            <div key={i} className={`rounded-xl p-3 space-y-2 ${reward.enabled !== false ? 'bg-muted/30' : 'bg-destructive/5 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Switch checked={reward.enabled !== false} onCheckedChange={v => setRewards(prev => prev.map((r, idx) => idx === i ? { ...r, enabled: v } : r))} />
                <span className="text-xs font-medium">{reward.enabled !== false ? '✅ Visible' : '🚫 Hidden from users'}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Points Required</Label>
                  <Input type="number" value={reward.points}
                    onChange={e => updateReward(i, 'points', parseInt(e.target.value) || 0)}
                    className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Reward (EN)</Label>
                  <Input value={reward.rewardEn}
                    onChange={e => updateReward(i, 'rewardEn', e.target.value)}
                    className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Reward (AR)</Label>
                  <Input value={reward.reward} dir="rtl"
                    onChange={e => updateReward(i, 'reward', e.target.value)}
                    className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Free Generations
                  </Label>
                  <div className="flex gap-1">
                    <Input type="number" min={0} value={reward.freeGenerations || 0}
                      onChange={e => updateReward(i, 'freeGenerations', parseInt(e.target.value) || 0)}
                      className="h-8 text-sm" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeRewardTier(i)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto Discount Codes Section */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Cake className="w-4 h-4 text-pink-500" /> Auto Discount Codes
          </h3>
        </div>
        
        {/* Birthday */}
        <div className="bg-muted/30 rounded-xl p-3 space-y-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cake className="w-4 h-4 text-pink-500" />
              <span className="text-sm font-medium">Birthday Auto Discount</span>
            </div>
            <Switch checked={autoDiscount.birthday_enabled} onCheckedChange={v => setAutoDiscount(prev => ({ ...prev, birthday_enabled: v }))} />
          </div>
          {autoDiscount.birthday_enabled && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px]">Discount %</Label>
                <Input type="number" min={0} max={100} value={autoDiscount.birthday_discount_percent}
                  onChange={e => setAutoDiscount(prev => ({ ...prev, birthday_discount_percent: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Bonus Points</Label>
                <Input type="number" min={0} value={autoDiscount.birthday_bonus_points}
                  onChange={e => setAutoDiscount(prev => ({ ...prev, birthday_bonus_points: Number(e.target.value) }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px]">Code Prefix</Label>
                <Input value={autoDiscount.birthday_code_prefix}
                  onChange={e => setAutoDiscount(prev => ({ ...prev, birthday_code_prefix: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* Occasions */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <PartyPopper className="w-3 h-3" /> Special Occasions
          </span>
          <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={() => setAutoDiscount(prev => ({
            ...prev, occasions: [...prev.occasions, {
              id: `custom_${Date.now()}`, name: 'New Occasion', nameAr: 'مناسبة جديدة',
              date: '01-01', enabled: false, discount_percent: 10, bonus_points: 5, target: 'all'
            }]
          }))}>
            <Plus className="w-3 h-3" /> Add
          </Button>
        </div>
        <div className="space-y-2">
          {autoDiscount.occasions.map((occ, i) => (
            <div key={occ.id} className={`rounded-xl p-3 space-y-2 ${occ.enabled ? 'bg-accent/5 border border-accent/20' : 'bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={occ.enabled} onCheckedChange={v => setAutoDiscount(prev => ({
                    ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, enabled: v } : o)
                  }))} />
                  <span className="text-xs font-medium">{occ.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setAutoDiscount(prev => ({
                  ...prev, occasions: prev.occasions.filter((_, idx) => idx !== i)
                }))}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              {occ.enabled && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[10px]">Name (EN)</Label>
                    <Input value={occ.name} onChange={e => setAutoDiscount(prev => ({
                      ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, name: e.target.value } : o)
                    }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Date (MM-DD)</Label>
                    <Input value={occ.date} onChange={e => setAutoDiscount(prev => ({
                      ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, date: e.target.value } : o)
                    }))} className="h-7 text-xs" placeholder="MM-DD" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Discount %</Label>
                    <Input type="number" min={0} max={100} value={occ.discount_percent} onChange={e => setAutoDiscount(prev => ({
                      ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, discount_percent: Number(e.target.value) } : o)
                    }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Target</Label>
                    <select className="w-full h-7 text-xs rounded-md border border-input bg-background px-2" value={occ.target}
                      onChange={e => setAutoDiscount(prev => ({
                        ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, target: e.target.value as 'all' | 'country' } : o)
                      }))}>
                      <option value="all">All Users</option>
                      <option value="country">By Country</option>
                    </select>
                  </div>
                  {occ.target === 'country' && (
                    <div className="col-span-2">
                      <Label className="text-[10px]">Target Country</Label>
                      <Input value={occ.target_country || ''} onChange={e => setAutoDiscount(prev => ({
                        ...prev, occasions: prev.occasions.map((o, idx) => idx === i ? { ...o, target_country: e.target.value } : o)
                      }))} className="h-7 text-xs" placeholder="e.g. Saudi Arabia" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Streak Challenges */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" /> Streak Challenges
          </h3>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => {
            setStreaks(prev => [...prev, {
              id: `custom-${Date.now()}`, action: 'CREATE_STORY', requiredCount: 3,
              withinDays: 7, bonusPoints: 10, titleEn: 'New Challenge', titleAr: 'تحدي جديد', enabled: true
            }]);
          }}>
            <Plus className="w-3 h-3" /> Add Challenge
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Configure time-based challenges. Users earn bonus points when they complete X actions within Y days.</p>
        <div className="space-y-3">
          {streaks.map((streak, i) => (
            <div key={streak.id} className="bg-muted/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Switch checked={streak.enabled} onCheckedChange={v => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, enabled: v } : s))} />
                <span className="text-xs font-medium">{streak.enabled ? '✅ Active' : '⏸ Disabled'}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px]">Action</Label>
                  <select className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                    value={streak.action}
                    onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, action: e.target.value } : s))}>
                    {Object.keys(POINT_LABELS).map(key => (
                      <option key={key} value={key}>{POINT_LABELS[key]?.en}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[10px]">Required Count</Label>
                  <Input type="number" min={1} value={streak.requiredCount}
                    onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, requiredCount: Number(e.target.value) } : s))}
                    className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] flex items-center gap-1"><Clock className="w-3 h-3" /> Within (days)</Label>
                  <Input type="number" min={1} value={streak.withinDays}
                    onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, withinDays: Number(e.target.value) } : s))}
                    className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px]">🎁 Bonus Points</Label>
                  <Input type="number" min={0} value={streak.bonusPoints}
                    onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, bonusPoints: Number(e.target.value) } : s))}
                    className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Title (EN)</Label>
                  <Input value={streak.titleEn}
                    onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, titleEn: e.target.value } : s))}
                    className="h-8 text-xs" />
                </div>
                <div className="flex gap-1">
                  <div className="flex-1">
                    <Label className="text-[10px]">Title (AR)</Label>
                    <Input value={streak.titleAr} dir="rtl"
                      onChange={e => setStreaks(prev => prev.map((s, idx) => idx === i ? { ...s, titleAr: e.target.value } : s))}
                      className="h-8 text-xs" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 mt-4 text-destructive shrink-0"
                    onClick={() => setStreaks(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-primary" /> User Points Management
        </h3>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredUsers.slice(0, 30).map((u, i) => {
            const tier = getUserRewardTier(u.total_points || 0);
            return (
              <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`}
                  alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate block">{u.full_name || 'User'}</span>
                  <span className="text-[10px] text-muted-foreground">{u.username ? `@${u.username} · ` : ''}{u.email}</span>
                </div>
                {tier && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{tier.rewardEn}</Badge>
                )}
                <Badge className="bg-accent/10 text-accent border-0 shrink-0">{u.total_points || 0} pts</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => viewUserPoints(u)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Users */}
      {topUsers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-accent" /> Top Users by Points
          </h3>
          <div className="space-y-2">
            {topUsers.map((u, i) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                <img src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`}
                  alt="" className="w-8 h-8 rounded-full" />
                <span className="text-sm font-medium text-foreground flex-1 truncate">{u.full_name || 'User'}</span>
                <Badge className="bg-accent/10 text-accent border-0">{u.total_points || 0} pts</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Points History Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-accent" />
              {selectedUser?.full_name || 'User'} - Points History
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
              <img src={selectedUser?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser?.id}`}
                alt="" className="w-10 h-10 rounded-full" />
              <div>
                <p className="font-semibold">{selectedUser?.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedUser?.email}</p>
              </div>
              <Badge className="ml-auto bg-accent/10 text-accent text-lg border-0">{selectedUser?.total_points || 0} pts</Badge>
            </div>
            
            {(() => {
              const tier = selectedUser ? getUserRewardTier(selectedUser.total_points || 0) : null;
              if (!tier) return null;
              return (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <p className="text-xs text-muted-foreground">Current Tier</p>
                  <p className="font-semibold text-sm">{tier.rewardEn}</p>
                  {tier.freeGenerations > 0 && (
                    <p className="text-xs text-primary mt-1">🎁 {tier.freeGenerations} free generations included</p>
                  )}
                </div>
              );
            })()}

            <p className="text-xs font-semibold text-muted-foreground mt-3">Transaction History</p>
            {userHistory.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">No points history</p>}
            {userHistory.map(h => (
              <div key={h.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                <div>
                  <p className="text-sm">{h.reason}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleString()}</p>
                </div>
                <Badge className={h.points > 0 ? "bg-green-500/10 text-green-600 border-0" : "bg-red-500/10 text-red-600 border-0"}>
                  {h.points > 0 ? '+' : ''}{h.points}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRewards;
