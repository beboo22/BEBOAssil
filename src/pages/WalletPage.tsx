import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Wallet, Star, Gift, Trophy, TrendingUp, Sparkles, Coins, Zap, ArrowDown, ArrowUp, CheckCircle2, AlertCircle, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getUserTotalPoints, getUserPointsHistory, getRewardsConfig, getPointsConfig, redeemPoints, POINTS_SYSTEM, REWARD_THRESHOLDS, getUserStreakProgress, type StreakChallenge } from "@/utils/pointsSystem";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart, CartesianGrid } from "recharts";

const WalletPage = () => {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language?.startsWith("ar");
  const { user } = useAuth();
  const navigate = useNavigate();
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [rewardsConfig, setRewardsConfig] = useState<any[]>([...REWARD_THRESHOLDS]);
  const [pointsConfig, setPointsConfig] = useState<Record<string, number>>({ ...POINTS_SYSTEM });
  const [remainingGens, setRemainingGens] = useState<number | null>(null);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; reward: any } | null>(null);
  const [streakProgress, setStreakProgress] = useState<{ challenge: StreakChallenge; current: number; completed: boolean }[]>([]);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const [pts, hist, rewards, config, streaks] = await Promise.all([
      getUserTotalPoints(user.id),
      getUserPointsHistory(user.id, 50),
      getRewardsConfig(),
      getPointsConfig(),
      getUserStreakProgress(user.id),
    ]);
    if (pts.success) setTotalPoints(pts.totalPoints);
    if (hist.success) setHistory(hist.data || []);
    setRewardsConfig(rewards as any[]);
    setPointsConfig(config);
    setStreakProgress(streaks);

    const { count } = await supabase.from("usage_tracking").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("feature", "planner")
      .gte("used_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
    setRemainingGens(Math.max(0, 5 - (count || 0)));
  };

  const handleRedeem = async (reward: any) => {
    if (!user) return;
    setRedeemingId(reward.points);
    const result = await redeemPoints(user.id, reward.points, isAr ? reward.reward : reward.rewardEn);
    if (result.success) {
      await supabase.from("notifications").insert({
        user_id: user.id, type: "reward_redeemed",
        title: isAr ? "🎁 تم استبدال مكافأة" : "🎁 Reward Redeemed",
        message: isAr ? `تم خصم ${reward.points} نقطة واستبدالها بـ: ${reward.reward}` : `${reward.points} points deducted for: ${reward.rewardEn}`,
        metadata: { reward_type: reward.type, points_spent: reward.points, free_generations: reward.freeGenerations || 0 },
      });
      if (reward.freeGenerations > 0) {
        await supabase.from("user_generation_overrides").insert({
          user_id: user.id, override_type: "bonus_generations", value: reward.freeGenerations,
          reason: isAr ? `استبدال مكافأة: ${reward.reward}` : `Reward redemption: ${reward.rewardEn}`,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
      toast.success(t('wallet.redeemed', { count: reward.points }));
      setConfirmDialog(null);
      loadData();
    } else {
      toast.error(t('wallet.insufficientPoints'));
    }
    setRedeemingId(null);
  };

  // Build chart data from history (cumulative points over time)
  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let cumulative = totalPoints;
    // Calculate backwards from current total
    const reverseSorted = [...sorted].reverse();
    const dataPoints: { date: string; points: number; label: string }[] = [];
    let runningTotal = totalPoints;
    
    // Build from newest to oldest, then reverse
    for (const item of reverseSorted) {
      dataPoints.unshift({
        date: new Date(item.created_at).toLocaleDateString(isAr ? "ar-SA" : "en-US", { month: "short", day: "numeric" }),
        points: runningTotal,
        label: item.reason,
      });
      runningTotal -= item.points;
    }
    // Add starting point
    dataPoints.unshift({
      date: isAr ? "البداية" : t('wallet.start'),
      points: runningTotal,
      label: "",
    });
    return dataPoints;
  }, [history, totalPoints, isAr]);

  // Get disabled actions from config
  const disabledActions: Record<string, boolean> = (pointsConfig as any)?._disabled_actions || {};

  // Filter out disabled rewards
  const visibleRewards = rewardsConfig.filter((r: any) => r.enabled !== false);

  if (!user) return null;

  const nextReward = visibleRewards.find((r: any) => r.points > totalPoints);
  const prevThreshold = [...visibleRewards].reverse().find((r: any) => r.points <= totalPoints);
  const progressToNext = nextReward
    ? ((totalPoints - (prevThreshold?.points || 0)) / (nextReward.points - (prevThreshold?.points || 0))) * 100
    : 100;

  const earnMethods = [
    { action: t('wallet.postStory'), pts: pointsConfig.CREATE_STORY || 5, icon: "📝", key: "CREATE_STORY" },
    { action: t('wallet.like'), pts: pointsConfig.LIKE_STORY || 1, icon: "❤️", key: "LIKE_STORY" },
    { action: t('wallet.comment'), pts: pointsConfig.COMMENT_ON_STORY || 2, icon: "💬", key: "COMMENT_ON_STORY" },
    { action: t('wallet.shareAction'), pts: pointsConfig.SHARE_STORY || 3, icon: "🔗", key: "SHARE_STORY" },
    { action: t('wallet.follow'), pts: pointsConfig.FOLLOW_USER || 1, icon: "👥", key: "FOLLOW_USER" },
    { action: t('wallet.bookTrip'), pts: pointsConfig.BOOK_TRIP || 20, icon: "✈️", key: "BOOK_TRIP" },
    { action: t('wallet.inviteFriend'), pts: pointsConfig.INVITE_FRIEND || 10, icon: "🎁", key: "INVITE_FRIEND" },
    { action: t('wallet.dailyLogin'), pts: pointsConfig.DAILY_LOGIN || 2, icon: "📅", key: "DAILY_LOGIN" },
    { action: t('wallet.referralSignup'), pts: pointsConfig.REFERRED_SIGNUP || 15, icon: "🌟", key: "REFERRED_SIGNUP" },
  ].filter(m => !disabledActions[m.key]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen pt-20 pb-10 bg-gradient-to-b from-background to-secondary/10">
      <div className="container mx-auto px-4 max-w-2xl space-y-6">

        {/* Header Card */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5 rounded-3xl p-6 border border-primary/20 shadow-lg">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('wallet.pointsBalance')}</p>
              <p className="text-4xl font-black text-foreground">{totalPoints}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-background/60 rounded-xl p-3 text-center">
              <Coins className="w-4 h-4 mx-auto mb-1 text-accent" />
              <p className="text-lg font-bold">{totalPoints}</p>
              <p className="text-[10px] text-muted-foreground">{t('wallet.totalPoints')}</p>
            </div>
            <div className="bg-background/60 rounded-xl p-3 text-center">
              <Trophy className="w-4 h-4 mx-auto mb-1 text-primary" />
              <p className="text-lg font-bold">{visibleRewards.filter((r: any) => totalPoints >= r.points).length}</p>
              <p className="text-[10px] text-muted-foreground">{t('wallet.rewardsEarned')}</p>
            </div>
            <div className="bg-background/60 rounded-xl p-3 text-center">
              <Zap className="w-4 h-4 mx-auto mb-1 text-orange-500" />
              <p className="text-lg font-bold">{remainingGens ?? "..."}</p>
              <p className="text-[10px] text-muted-foreground">{t('wallet.gensLeft')}</p>
            </div>
          </div>

          {nextReward && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('wallet.nextReward')}</span>
                <span className="text-primary font-semibold">{nextReward.points - totalPoints} {t('wallet.ptsLeft')}</span>
              </div>
              <Progress value={progressToNext} className="h-2.5" />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Gift className="w-3.5 h-3.5" />
                {isAr ? nextReward.reward : nextReward.rewardEn}
              </p>
            </div>
          )}
        </motion.div>

        {/* Points Chart */}
        {chartData.length > 1 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-5 border border-border shadow-sm">
            <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              {t('wallet.pointsOverTime')}
            </p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="pointsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [`${value} ${t('wallet.pts')}`, t('wallet.totalPoints')]}
                  />
                  <Area type="monotone" dataKey="points" stroke="hsl(var(--primary))" fill="url(#pointsGradient)" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* How to earn */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl p-5 border border-border shadow-sm">
          <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            {t('wallet.howToEarn')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {earnMethods.map(item => (
              <div key={item.action} className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">{item.action}</span>
                <span className="text-xs font-bold text-accent">+{item.pts}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Streak Challenges */}
        {streakProgress.length > 0 && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}
            className="bg-card rounded-2xl p-5 border border-border shadow-sm">
            <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              🔥 {t('wallet.activeChallenges')}
            </p>
            <div className="space-y-2.5">
              {streakProgress.map(({ challenge, current, completed }) => (
                <div key={challenge.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${completed ? "bg-accent/10 border-accent/30" : "bg-muted/30 border-transparent"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${completed ? "bg-accent/20" : "bg-muted"}`}>
                    {completed ? <CheckCircle2 className="w-5 h-5 text-accent" /> : <span className="text-base">🔥</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{isAr ? challenge.titleAr : challenge.titleEn}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={(current / challenge.requiredCount) * 100} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground shrink-0">{current}/{challenge.requiredCount}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t('wallet.withinDays', { count: challenge.withinDays })}</p>
                  </div>
                  <Badge className={`shrink-0 text-[10px] ${completed ? "bg-accent/20 text-accent border-0" : "bg-muted text-muted-foreground border-0"}`}>
                    +{challenge.bonusPoints}
                  </Badge>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Rewards / Redeem */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-card rounded-2xl p-5 border border-border shadow-sm">
          <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            {t('wallet.redeemRewards')}
          </p>
          <div className="space-y-3">
            {visibleRewards.map((reward: any) => {
              const canRedeem = totalPoints >= reward.points;
              return (
                <motion.div key={reward.points} whileHover={{ scale: 1.01 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${canRedeem ? "bg-accent/5 border-accent/20" : "bg-muted/30 border-transparent"}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${canRedeem ? "bg-accent/20" : "bg-muted"}`}>
                    {canRedeem ? <Star className="w-5 h-5 text-accent fill-accent" /> : <Star className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${canRedeem ? "text-foreground" : "text-muted-foreground"}`}>
                      {isAr ? reward.reward : reward.rewardEn}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{reward.points} {t('wallet.pts')}</span>
                      {reward.freeGenerations > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">{reward.freeGenerations} {t('wallet.gens')}</Badge>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant={canRedeem ? "default" : "outline"} disabled={!canRedeem || redeemingId === reward.points}
                    className="shrink-0 text-xs h-8" onClick={() => setConfirmDialog({ open: true, reward })}>
                    {redeemingId === reward.points ? "..." : t('wallet.redeem')}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* History */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
          className="bg-card rounded-2xl p-5 border border-border shadow-sm">
          <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t('wallet.pointsHistory')}
          </p>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">{t('wallet.noHistory')}</p>
          ) : (
            <div className="space-y-1">
              {history.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${item.points > 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                    {item.points > 0 ? <ArrowUp className="w-3.5 h-3.5 text-green-500" /> : <ArrowDown className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{item.reason}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${item.points > 0 ? "text-green-500" : "text-red-500"}`}>
                    {item.points > 0 ? "+" : ""}{item.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Confirm redeem dialog */}
      <Dialog open={confirmDialog?.open || false} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">
              {t('wallet.confirmRedemption')}
            </DialogTitle>
          </DialogHeader>
          {confirmDialog?.reward && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <Gift className="w-8 h-8 text-accent" />
              </div>
              <div>
                <p className="font-semibold">{isAr ? confirmDialog.reward.reward : confirmDialog.reward.rewardEn}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('wallet.willBeDeducted', { count: confirmDialog.reward.points })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('wallet.remaining', { count: totalPoints - confirmDialog.reward.points })}
                </p>
              </div>
              {confirmDialog.reward.freeGenerations > 0 && (
                <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
                  <p className="text-xs flex items-center justify-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    {t('wallet.willGetGens', { count: confirmDialog.reward.freeGenerations })}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmDialog(null)}>
                  {t('wallet.cancel')}
                </Button>
                <Button className="flex-1" onClick={() => handleRedeem(confirmDialog.reward)}
                  disabled={redeemingId === confirmDialog.reward.points}>
                  {redeemingId === confirmDialog.reward.points ? t('wallet.confirming') : t('wallet.confirm')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default WalletPage;
