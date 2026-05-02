
-- Public profile reader (safe fields only)
CREATE OR REPLACE FUNCTION public.get_public_profile(_user_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  total_points integer,
  travel_interests text[],
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, username, avatar_url,
         COALESCE(total_points, 0)::int AS total_points,
         travel_interests, created_at
  FROM public.profiles
  WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_public_profiles(_user_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  username text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, username, avatar_url
  FROM public.profiles
  WHERE id = ANY(_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_public_profile(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profiles(uuid[]) TO anon, authenticated;
