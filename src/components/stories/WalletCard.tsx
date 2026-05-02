import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Star, Gift, Trophy, TrendingUp, Sparkles, Coins, Zap, Share2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from 'react-i18next';
import { getUserTotalPoints, getUserPointsHistory, REWARD_THRESHOLDS, POINTS_SYSTEM, getPointsLeaderboard } from '@/utils/pointsSystem';
import { supabase } from '@/integrations/supabase/client';
import { ReferralCard } from './ReferralCard';

interface WalletCardProps {
  userId: string;
  compact?: boolean;
}

export const WalletCard: React.FC<WalletCardProps> = ({ userId, compact = false }) => {
  const { t } = useTranslation();
  const [totalPoints, setTotalPoints] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [remainingGenerations, setRemainingGenerations] = useState<number | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [storiesCount, setStoriesCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    getUserTotalPoints(userId).then(r => { if (r.success) setTotalPoints(r.totalPoints); });
    getUserPointsHistory(userId, 10).then(r => { if (r.success) setHistory(r.data || []); });
    
    // Fetch user stats
    Promise.all([
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('travel_stories').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('usage_tracking').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('feature', 'planner').gte('used_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
    ]).then(([followers, following, stories, todayUsage]) => {
      setFollowersCount(followers.count || 0);
      setFollowingCount(following.count || 0);
      setStoriesCount(stories.count || 0);
      // Default daily limit is 5 for free users
      const used = todayUsage.count || 0;
      setRemainingGenerations(Math.max(0, 5 - used));
    });
  }, [userId]);

  const nextReward = REWARD_THRESHOLDS.find(r => r.points > totalPoints);
  const prevThreshold = [...REWARD_THRESHOLDS].reverse().find(r => r.points <= totalPoints);
  const progressToNext = nextReward 
    ? ((totalPoints - (prevThreshold?.points || 0)) / (nextReward.points - (prevThreshold?.points || 0))) * 100 
    : 100;
  const earnedRewards = REWARD_THRESHOLDS.filter(r => r.points <= totalPoints);

  if (compact) {
    return (
      <Link to="/wallet" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 hover:bg-accent/20 transition-colors">
        <Coins className="w-3.5 h-3.5 text-accent" />
        <span className="text-xs font-bold text-accent">{totalPoints}</span>
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main wallet card */}
      <div className="bg-gradient-to-br from-primary/10 via-accent/5 to-primary/5 rounded-2xl p-4 border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('wallet.pointsBalance')}</p>
              <p className="text-2xl font-black text-foreground">{totalPoints}</p>
            </div>
          </div>
          {earnedRewards.length > 0 && (
            <Badge className="bg-accent/10 text-accent border-accent/20 gap-1">
              <Trophy className="w-3 h-3" />
              {earnedRewards.length} {t('wallet.rewardsEarned')}
            </Badge>
          )}
        </div>

        {/* User stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: t('wallet.followers'), value: followersCount, icon: UserPlus },
            { label: t('wallet.following'), value: followingCount, icon: UserPlus },
            { label: t('wallet.stories'), value: storiesCount, icon: Share2 },
            { label: t('wallet.gensLeft'), value: remainingGenerations ?? '...', icon: Zap },
          ].map(item => (
            <div key={item.label} className="text-center bg-background/50 rounded-xl p-2">
              <item.icon className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
              <p className="text-sm font-bold text-foreground">{item.value}</p>
              <p className="text-[9px] text-muted-foreground leading-tight">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Progress to next reward */}
        {nextReward && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('wallet.nextReward')}</span>
              <span className="text-primary font-medium">{nextReward.points - totalPoints} {t('wallet.ptsLeft')}</span>
            </div>
            <Progress value={progressToNext} className="h-2" />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Gift className="w-3 h-3" />
              {t('wallet.nextRewardName', { defaultValue: nextReward.rewardEn })}
            </p>
          </div>
        )}
      </div>

      {/* How to earn */}
      <div className="bg-card rounded-xl p-3 border border-border">
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          {t('wallet.howToEarn')}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { action: t('wallet.postStory'), pts: POINTS_SYSTEM.CREATE_STORY },
            { action: t('wallet.like'), pts: POINTS_SYSTEM.LIKE_STORY },
            { action: t('wallet.comment'), pts: POINTS_SYSTEM.COMMENT_ON_STORY },
            { action: t('wallet.shareAction'), pts: POINTS_SYSTEM.SHARE_STORY },
            { action: t('wallet.inviteFriend'), pts: POINTS_SYSTEM.INVITE_FRIEND },
            { action: t('wallet.bookTrip'), pts: POINTS_SYSTEM.BOOK_TRIP },
            { action: t('wallet.dailyLogin'), pts: POINTS_SYSTEM.DAILY_LOGIN },
            { action: t('wallet.referralSignup'), pts: POINTS_SYSTEM.REFERRED_SIGNUP },
          ].map(item => (
            <div key={item.action} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/50 text-xs">
              <span className="text-muted-foreground">{item.action}</span>
              <span className="text-accent font-bold">+{item.pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards tier list */}
      <div className="bg-card rounded-xl p-3 border border-border">
        <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-primary" />
          {t('wallet.redeemRewards')}
        </p>
        <div className="space-y-2">
          {REWARD_THRESHOLDS.map(reward => {
            const earned = totalPoints >= reward.points;
            return (
              <div key={reward.points} className={`flex items-center gap-3 p-2 rounded-lg ${earned ? 'bg-accent/10 border border-accent/20' : 'bg-muted/30'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${earned ? 'bg-accent/20' : 'bg-muted'}`}>
                  {earned ? <Star className="w-4 h-4 text-accent fill-accent" /> : <Star className="w-4 h-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${earned ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {reward.rewardEn}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{reward.points} {t('wallet.pts')}</p>
                </div>
                {earned && <Badge className="bg-accent text-accent-foreground border-0 text-[10px] shrink-0">{t('wallet.earned', { defaultValue: 'Earned' })}</Badge>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Referral invite card */}
      <ReferralCard userId={userId} />

      {/* Recent history */}
      {history.length > 0 && (
        <div className="bg-card rounded-xl p-3 border border-border">
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            {t('wallet.pointsHistory')}
          </p>
          <div className="space-y-1.5">
            {history.slice(0, 5).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between py-1 text-xs">
                <span className="text-muted-foreground truncate flex-1 mr-2">{item.reason}</span>
                <span className={`font-bold shrink-0 ${item.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {item.points > 0 ? '+' : ''}{item.points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
