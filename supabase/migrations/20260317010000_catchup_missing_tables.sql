
-- Catch-up migration to align local project with database-backup.sql
-- These tables and logic were found in the backup but were missing from local migrations.

-- ===================== TABLES =====================

-- search_analytics
CREATE TABLE IF NOT EXISTS public.search_analytics (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid,
    guest_id text,
    search_query text,
    search_type text DEFAULT 'trip',
    destination text,
    results_count integer DEFAULT 0,
    clicked_result text,
    session_id text,
    user_agent text,
    ip_address inet,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- travel_stories
CREATE TABLE IF NOT EXISTS public.travel_stories (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    title text NOT NULL,
    content text NOT NULL,
    location_name text,
    latitude numeric,
    longitude numeric,
    media_urls text[] DEFAULT '{}',
    video_url text,
    trip_data jsonb,
    likes_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- story_comments
CREATE TABLE IF NOT EXISTS public.story_comments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.travel_stories(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    content text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- story_likes
CREATE TABLE IF NOT EXISTS public.story_likes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES public.travel_stories(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- user_follows
CREATE TABLE IF NOT EXISTS public.user_follows (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id uuid NOT NULL REFERENCES public.profiles(id),
    following_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now()
);

-- user_points
CREATE TABLE IF NOT EXISTS public.user_points (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id),
    points integer NOT NULL,
    reason text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- user_vehicles
CREATE TABLE IF NOT EXISTS public.user_vehicles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    make text NOT NULL,
    model text NOT NULL,
    year integer,
    color text,
    license_plate text,
    fuel_type text DEFAULT 'gasoline',
    fuel_consumption numeric,
    fuel_capacity numeric,
    is_primary boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- vehicle_analytics
CREATE TABLE IF NOT EXISTS public.vehicle_analytics (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    vehicle_id uuid,
    destination text,
    trip_distance numeric,
    fuel_cost numeric,
    fuel_stops integer DEFAULT 0,
    trip_date date,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ===================== RLS POLICIES =====================

ALTER TABLE public.search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_analytics ENABLE ROW LEVEL SECURITY;

-- Add policies (Simplified for catch-up)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert search analytics') THEN
        CREATE POLICY "Authenticated users can insert search analytics" ON public.search_analytics FOR INSERT TO public WITH CHECK ((user_id IS NOT NULL AND user_id = auth.uid()) OR (user_id IS NULL AND guest_id IS NOT NULL));
    END IF;
    -- Note: Many other policies are expected to be present from the backup.
END $$;
