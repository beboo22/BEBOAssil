import { supabase } from "@/integrations/supabase/client";

export type PublicProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

/**
 * Fetch public profile fields for a single user.
 * Bypasses RLS via SECURITY DEFINER function — only safe fields exposed.
 */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("get_public_profile", { _user_id: userId });
  if (error) {
    console.warn("[publicProfiles] fetch single error:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name ?? null,
    username: row.username ?? null,
    avatar_url: row.avatar_url ?? null,
  };
}

/**
 * Fetch public profile fields for multiple users in one round-trip.
 */
export async function fetchPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const map = new Map<string, PublicProfile>();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await supabase.rpc("get_public_profiles", { _user_ids: unique });
  if (error) {
    console.warn("[publicProfiles] fetch batch error:", error.message);
    return map;
  }
  (data || []).forEach((p: any) => {
    if (p?.id) {
      map.set(p.id, {
        id: p.id,
        full_name: p.full_name ?? null,
        username: p.username ?? null,
        avatar_url: p.avatar_url ?? null,
      });
    }
  });
  return map;
}

/**
 * Attach `profiles` field to a list of items that have `user_id`.
 * Mutates returned new array; original items unchanged.
 */
export async function attachProfiles<T extends { user_id?: string; profiles?: any }>(
  items: T[],
): Promise<(T & { profiles: PublicProfile | null })[]> {
  const ids = items.map((i) => i.user_id).filter(Boolean) as string[];
  const map = await fetchPublicProfiles(ids);
  return items.map((it) => ({
    ...it,
    profiles: it.user_id ? map.get(it.user_id) ?? null : null,
  }));
}

/**
 * Extended public profile (for user profile pages).
 */
export type ExtendedPublicProfile = PublicProfile & {
  total_points: number;
  travel_interests: string[] | null;
  created_at: string | null;
};

export async function fetchExtendedPublicProfile(userId: string): Promise<ExtendedPublicProfile | null> {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("get_public_profile", { _user_id: userId });
  if (error) {
    console.warn("[publicProfiles] fetch extended error:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name ?? null,
    username: row.username ?? null,
    avatar_url: row.avatar_url ?? null,
    total_points: Number(row.total_points) || 0,
    travel_interests: Array.isArray(row.travel_interests) ? row.travel_interests : null,
    created_at: row.created_at ?? null,
  };
}
