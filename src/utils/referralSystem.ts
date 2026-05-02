import { supabase } from "@/integrations/supabase/client";
import { awardPoints } from "./pointsSystem";

/**
 * Generate or retrieve a user's unique referral code
 */
export const getOrCreateReferralCode = async (userId: string): Promise<string | null> => {
  try {
    // Check if user already has a referral code
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .single();

    if (profile?.referral_code) return profile.referral_code;

    // Generate a unique code
    const code = `REF-${userId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const { error } = await supabase
      .from("profiles")
      .update({ referral_code: code } as any)
      .eq("id", userId);

    if (error) throw error;
    return code;
  } catch (error) {
    console.error("Error creating referral code:", error);
    return null;
  }
};

/**
 * Get full referral link for sharing
 */
export const getReferralLink = (referralCode: string): string => {
  return `${window.location.origin}/auth?ref=${referralCode}`;
};

/**
 * Process a referral when a new user signs up with a referral code
 */
export const processReferral = async (referralCode: string, newUserId: string) => {
  try {
    // Find the referrer
    const { data: referrer } = await supabase
      .from("profiles")
      .select("id")
      .eq("referral_code", referralCode as any)
      .single();

    if (!referrer) return { success: false, error: "Invalid referral code" };

    // Update referred_by on new user's profile
    await supabase
      .from("profiles")
      .update({ referred_by: referrer.id } as any)
      .eq("id", newUserId);

    // Create referral record
    await supabase.from("referrals" as any).insert({
      referrer_id: referrer.id,
      referred_user_id: newUserId,
      referral_code: referralCode,
      status: "completed",
      points_awarded: true,
      completed_at: new Date().toISOString(),
    });

    // Award points to referrer
    await awardPoints({
      userId: referrer.id,
      action: "INVITE_FRIEND",
      reason: "Friend signed up via referral link",
    });

    // Award points to new user
    await awardPoints({
      userId: newUserId,
      action: "REFERRED_SIGNUP",
      reason: "Signed up via referral link",
    });

    return { success: true };
  } catch (error) {
    console.error("Error processing referral:", error);
    return { success: false, error };
  }
};

/**
 * Get user's referral stats
 */
export const getReferralStats = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from("referrals" as any)
      .select("*")
      .eq("referrer_id", userId);

    if (error) throw error;

    const referrals = data || [];
    return {
      success: true,
      total: referrals.length,
      completed: referrals.filter((r: any) => r.status === "completed").length,
      pending: referrals.filter((r: any) => r.status === "pending").length,
      pointsEarned: referrals.filter((r: any) => r.points_awarded).length * 10,
    };
  } catch (error) {
    console.error("Error fetching referral stats:", error);
    return { success: false, total: 0, completed: 0, pending: 0, pointsEarned: 0 };
  }
};
