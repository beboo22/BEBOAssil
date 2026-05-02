-- Migration: Allow guest users to save trips for caching pool
-- Path: supabase/migrations/20260402130000_allow_guest_saved_trips.sql

-- 1. Make user_id nullable to allow guest trips
ALTER TABLE public.saved_trips ALTER COLUMN user_id DROP NOT NULL;

-- 2. Add guest_id column for anonymous tracking
ALTER TABLE public.saved_trips ADD COLUMN IF NOT EXISTS guest_id TEXT;

-- 3. Update unique constraint
-- The old constraint was UNIQUE(user_id, trip_id).
-- Since trip_id is a unique random string per generation, it's safer to just make trip_id unique.
ALTER TABLE public.saved_trips DROP CONSTRAINT IF EXISTS saved_trips_user_id_trip_id_key;
ALTER TABLE public.saved_trips ADD CONSTRAINT saved_trips_trip_id_key UNIQUE (trip_id);

-- 4. Update RLS to allow anonymous inserts
-- This is necessary so that even guests can contribute to the caching pool.
DROP POLICY IF EXISTS "Users can manage their own trips" ON public.saved_trips;

-- Policy for viewing/managing (Users see their own, guests see none from DB but can insert)
CREATE POLICY "Users can manage own trips" ON public.saved_trips
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can insert trips" ON public.saved_trips
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Ensure admins can still see everything
CREATE POLICY "Admins can view all trips" ON public.saved_trips
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
