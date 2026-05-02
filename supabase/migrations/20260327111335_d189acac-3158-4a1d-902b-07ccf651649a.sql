CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  memory_type text NOT NULL DEFAULT 'trip',
  trip_id text,
  activity_name text,
  location_name text,
  latitude numeric,
  longitude numeric,
  media_urls text[] DEFAULT '{}',
  video_url text,
  trip_data jsonb,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own memories"
  ON public.memories FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view published memories"
  ON public.memories FOR SELECT
  TO public
  USING (is_published = true);