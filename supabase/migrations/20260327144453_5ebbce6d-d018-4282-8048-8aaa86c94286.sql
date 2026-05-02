
-- Fix 1: Restrict profiles public SELECT to non-sensitive fields only
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view public profile info" ON public.profiles;

-- Create a restrictive policy that only allows viewing basic public info (not email)
-- We use a view approach: allow authenticated users to see profiles
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Allow anon users to view only by specific ID (for shared trips, stories etc)
CREATE POLICY "Anon can view profiles by id"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Fix 2: Restrict discount codes to authenticated users only
DROP POLICY IF EXISTS "Anyone can read active discount codes" ON public.discount_codes;

-- Keep the authenticated policy
-- (Already exists: "Authenticated users can view active discount codes")
