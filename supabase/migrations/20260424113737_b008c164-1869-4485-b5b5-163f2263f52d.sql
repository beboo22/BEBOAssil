
-- ============ USER ROLES ============
-- Drop any permissive insert/update/delete policies for non-admins
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============ PROFILES ============
-- Drop any broadly permissive read policies
DROP POLICY IF EXISTS "Anon can view profiles by id" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
-- Existing safe policies remain:
--  - "Users can view their own profile" (id = auth.uid())
--  - "Admins can view all profiles"
-- Public profile lookups should use get_public_profile / get_public_profiles RPCs.

-- ============ SEARCH ANALYTICS ============
DROP POLICY IF EXISTS "Anyone can view search analytics" ON public.search_analytics;
DROP POLICY IF EXISTS "Public can view search analytics" ON public.search_analytics;
-- Existing safe policies kept:
--  - Admins can view all search analytics
--  - Users can view their own search analytics
--  - Authenticated users can insert search analytics

-- ============ DISCOUNT CODES ============
DROP POLICY IF EXISTS "Anyone can view active discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Authenticated users can view active discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Authenticated can read active discount codes" ON public.discount_codes;
-- Only "Admins can manage discount codes" remains (covers ALL incl. SELECT for admins).
-- Validation/redemption of a specific code by users should go through a SECURITY DEFINER function.
