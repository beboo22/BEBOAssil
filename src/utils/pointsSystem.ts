import { supabase } from "@/integrations/supabase/client";

// Default points (fallback if DB not loaded)
export const POINTS_SYSTEM = {
  CREATE_STORY: 5, LIKE_STORY: 1, COMMENT_ON_STORY: 2, SHARE_STORY: 3,
  FOLLOW_USER: 1, COMPLETE_PROFILE: 10, BOOK_TRIP: 20, FIRST_LOGIN: 5,
  INVITE_FRIEND: 10, DAILY_LOGIN: 2, REFERRED_SIGNUP: 15,
} as const;

export const REWARD_THRESHOLDS = [
  { points: 50, reward: 'خصم 5% على الرحلة التالية', rewardEn: '5% off next trip', type: 'discount', freeGenerations: 0 },
  { points: 100, reward: 'توليد رحلة مجانية إضافية', rewardEn: 'Free extra trip generation', type: 'free_generation', freeGenerations: 2 },
  { points: 200, reward: 'شارة مسافر ذهبي', rewardEn: 'Gold Traveler Badge', type: 'badge', freeGenerations: 5 },
  { points: 500, reward: 'شارة مسافر ماسي + أولوية الدعم', rewardEn: 'Diamond Badge + Priority Support', type: 'premium_badge', freeGenerations: 15 },
] as const;

export interface StreakChallenge {
  id: string;
  action: string;
  requiredCount: number;
  withinDays: number;
  bonusPoints: number;
  titleEn: string;
  titleAr: string;
  enabled: boolean;
}

export const DEFAULT_STREAK_CHALLENGES: StreakChallenge[] = [
  { id: 'stories_3_5d', action: 'CREATE_STORY', requiredCount: 3, withinDays: 5, bonusPoints: 10, titleEn: 'Storyteller: 3 stories in 5 days', titleAr: 'راوي قصص: 3 قصص في 5 أيام', enabled: true },
  { id: 'likes_10_7d', action: 'LIKE_STORY', requiredCount: 10, withinDays: 7, bonusPoints: 5, titleEn: 'Supporter: 10 likes in 7 days', titleAr: 'داعم: 10 إعجابات في 7 أيام', enabled: true },
  { id: 'comments_5_7d', action: 'COMMENT_ON_STORY', requiredCount: 5, withinDays: 7, bonusPoints: 8, titleEn: 'Commenter: 5 comments in 7 days', titleAr: 'معلّق نشط: 5 تعليقات في 7 أيام', enabled: true },
  { id: 'login_7_7d', action: 'DAILY_LOGIN', requiredCount: 7, withinDays: 7, bonusPoints: 15, titleEn: 'Streak: 7-day login', titleAr: 'سلسلة: تسجيل 7 أيام متتالية', enabled: true },
  { id: 'invite_3_30d', action: 'INVITE_FRIEND', requiredCount: 3, withinDays: 30, bonusPoints: 20, titleEn: 'Ambassador: 3 invites in 30 days', titleAr: 'سفير: 3 دعوات في 30 يوم', enabled: true },
];

export type PointsAction = keyof typeof POINTS_SYSTEM;

// Cache for DB config
let cachedPointsConfig: Record<string, number> | null = null;
let cachedRewardsConfig: any[] | null = null;
let cachedStreakChallenges: StreakChallenge[] | null = null;
let lastFetch = 0;
const CACHE_TTL = 60000;

export const getPointsConfig = async (): Promise<Record<string, number>> => {
  if (cachedPointsConfig && Date.now() - lastFetch < CACHE_TTL) return cachedPointsConfig;
  try {
    const { data } = await supabase.from("site_settings").select("points_config, rewards_config, streak_challenges_config").eq("id", "default").single();
    if (data) {
      const rawConfig = (data as any).points_config || { ...POINTS_SYSTEM };
      // Store internal configs separately
      const { _disabled_actions, _auto_discount, ...pointsOnly } = rawConfig;
      cachedPointsConfig = pointsOnly;
      // Store full config for internal use
      (cachedPointsConfig as any).__disabled_actions = _disabled_actions || {};
      (cachedPointsConfig as any).__auto_discount = _auto_discount || {};
      cachedRewardsConfig = (data as any).rewards_config || [...REWARD_THRESHOLDS];
      cachedStreakChallenges = (data as any).streak_challenges_config || [...DEFAULT_STREAK_CHALLENGES];
      lastFetch = Date.now();
      return cachedPointsConfig;
    }
  } catch (e) { console.error("Error loading points config:", e); }
  return { ...POINTS_SYSTEM };
};

export const getRewardsConfig = async () => {
  if (cachedRewardsConfig && Date.now() - lastFetch < CACHE_TTL) return cachedRewardsConfig;
  await getPointsConfig();
  return cachedRewardsConfig || [...REWARD_THRESHOLDS];
};

export const getStreakChallenges = async (): Promise<StreakChallenge[]> => {
  if (cachedStreakChallenges && Date.now() - lastFetch < CACHE_TTL) return cachedStreakChallenges;
  await getPointsConfig();
  return cachedStreakChallenges || [...DEFAULT_STREAK_CHALLENGES];
};

interface AwardPointsOptions {
  userId: string;
  action: PointsAction;
  reason: string;
  metadata?: Record<string, any>;
}

export const awardPoints = async ({ userId, action, reason }: AwardPointsOptions) => {
  try {
    const config = await getPointsConfig();
    // Check if this action is disabled by admin
    const disabledActions = (config as any).__disabled_actions || {};
    if (disabledActions[action]) return { success: true, points: 0, newTotal: 0 };
    
    const points = config[action] ?? POINTS_SYSTEM[action] ?? 0;
    if (points <= 0) return { success: true, points: 0, newTotal: 0 };

    const { error: pointsError } = await supabase.from("user_points").insert({
      user_id: userId, points, reason: `${reason} (+${points} نقطة)`,
    });
    if (pointsError) throw pointsError;

    const { data: currentProfile, error: profileFetchError } = await supabase
      .from("profiles").select("total_points").eq("id", userId).single();
    if (profileFetchError) throw profileFetchError;

    const oldTotal = currentProfile?.total_points || 0;
    const newTotal = oldTotal + points;
    
    const { error: updateError } = await supabase
      .from("profiles").update({ total_points: newTotal }).eq("id", userId);
    if (updateError) throw updateError;

    await Promise.all([
      checkMilestoneRewards(userId, oldTotal, newTotal),
      checkStreakChallenges(userId, action),
    ]);
    return { success: true, points, newTotal };
  } catch (error) {
    console.error("Error awarding points:", error);
    return { success: false, error };
  }
};

const checkStreakChallenges = async (userId: string, action: string) => {
  try {
    const challenges = await getStreakChallenges();
    const activeChallenges = challenges.filter(c => c.enabled && c.action === action);
    if (activeChallenges.length === 0) return;

    for (const challenge of activeChallenges) {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - challenge.withinDays);
      
      const { count } = await supabase.from("user_points")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .ilike("reason", `%${action}%`)
        .gte("created_at", sinceDate.toISOString());

      if ((count || 0) >= challenge.requiredCount) {
        // Check if already awarded this streak recently
        const { count: alreadyAwarded } = await supabase.from("user_points")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .ilike("reason", `%streak:${challenge.id}%`)
          .gte("created_at", sinceDate.toISOString());

        if ((alreadyAwarded || 0) === 0) {
          // Award streak bonus
          const { error } = await supabase.from("user_points").insert({
            user_id: userId,
            points: challenge.bonusPoints,
            reason: `🔥 streak:${challenge.id} - ${challenge.titleEn} (+${challenge.bonusPoints} bonus)`,
          });
          if (!error) {
            const { data: profile } = await supabase.from("profiles").select("total_points").eq("id", userId).single();
            const newTotal = (profile?.total_points || 0) + challenge.bonusPoints;
            await supabase.from("profiles").update({ total_points: newTotal }).eq("id", userId);
            await supabase.from("notifications").insert({
              user_id: userId, type: 'streak_bonus',
              title: '🔥 تحدي مكتمل!',
              message: `أكملت تحدي "${challenge.titleAr}" وحصلت على ${challenge.bonusPoints} نقطة إضافية!`,
              metadata: { challenge_id: challenge.id, bonus_points: challenge.bonusPoints },
            });
          }
        }
      }
    }
  } catch (e) { console.error("Error checking streak challenges:", e); }
};

const checkMilestoneRewards = async (userId: string, oldTotal: number, newTotal: number) => {
  const rewards = await getRewardsConfig();
  for (const threshold of rewards) {
    if (oldTotal < threshold.points && newTotal >= threshold.points) {
      try {
        await supabase.from("notifications").insert({
          user_id: userId, type: 'reward_milestone',
          title: `🎉 مكافأة جديدة! ${threshold.points} نقطة`,
          message: `تهانينا! وصلت إلى ${threshold.points} نقطة وحصلت على: ${threshold.reward}`,
          metadata: { points: threshold.points, reward_type: threshold.type, reward_en: threshold.rewardEn, free_generations: threshold.freeGenerations || 0 },
        });
      } catch (e) { console.error("Error sending milestone notification:", e); }
    }
  }
};

export const getUserPointsHistory = async (userId: string, limit = 20) => {
  try {
    const { data, error } = await supabase.from("user_points").select("*")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return { success: true, data };
  } catch (error) { return { success: false, error }; }
};

export const getUserTotalPoints = async (userId: string) => {
  try {
    const { data, error } = await supabase.from("profiles").select("total_points").eq("id", userId).single();
    if (error) throw error;
    return { success: true, totalPoints: data?.total_points || 0 };
  } catch (error) { return { success: false, error }; }
};

export const getPointsLeaderboard = async (limit = 10) => {
  try {
    const { data, error } = await supabase.from("profiles")
      .select("id, full_name, username, avatar_url, total_points")
      .not("total_points", "is", null).order("total_points", { ascending: false }).limit(limit);
    if (error) throw error;
    return { success: true, leaderboard: data };
  } catch (error) { return { success: false, error }; }
};

export const canAffordReward = async (userId: string, requiredPoints: number) => {
  const result = await getUserTotalPoints(userId);
  return result.success ? result.totalPoints >= requiredPoints : false;
};

export const redeemPoints = async (userId: string, pointsToRedeem: number, rewardDescription: string) => {
  try {
    const { success, totalPoints } = await getUserTotalPoints(userId);
    if (!success || totalPoints < pointsToRedeem) return { success: false, error: "Insufficient points" };

    const newTotal = totalPoints - pointsToRedeem;
    const { error: updateError } = await supabase.from("profiles").update({ total_points: newTotal }).eq("id", userId);
    if (updateError) throw updateError;

    const { error: pointsError } = await supabase.from("user_points").insert({
      user_id: userId, points: -pointsToRedeem, reason: `استبدال نقاط: ${rewardDescription}`,
    });
    if (pointsError) throw pointsError;

    return { success: true, newTotal, pointsRedeemed: pointsToRedeem };
  } catch (error) { return { success: false, error }; }
};

export const getUserRewardBenefits = async (userId: string) => {
  try {
    const { totalPoints } = await getUserTotalPoints(userId);
    const rewards = await getRewardsConfig();
    const sorted = [...rewards].sort((a: any, b: any) => b.points - a.points);
    const currentTier = sorted.find((r: any) => totalPoints >= r.points);
    return {
      totalPoints,
      currentTier: currentTier || null,
      freeGenerations: currentTier?.freeGenerations || 0,
      allTiers: rewards,
    };
  } catch (error) { return { totalPoints: 0, currentTier: null, freeGenerations: 0, allTiers: [] }; }
};

export const getUserStreakProgress = async (userId: string): Promise<{ challenge: StreakChallenge; current: number; completed: boolean }[]> => {
  try {
    const challenges = await getStreakChallenges();
    const results = [];
    for (const challenge of challenges.filter(c => c.enabled)) {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - challenge.withinDays);
      const { count } = await supabase.from("user_points")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .ilike("reason", `%${challenge.action}%`)
        .gte("created_at", sinceDate.toISOString());
      const current = Math.min(count || 0, challenge.requiredCount);
      results.push({ challenge, current, completed: current >= challenge.requiredCount });
    }
    return results;
  } catch { return []; }
};
