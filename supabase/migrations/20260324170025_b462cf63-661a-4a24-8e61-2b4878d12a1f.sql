CREATE TABLE public.activity_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id text NOT NULL,
  day_index integer NOT NULL DEFAULT 0,
  activity_id text NOT NULL,
  activity_name text,
  location_name text,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view activity media"
  ON public.activity_media FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own activity media"
  ON public.activity_media FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity media"
  ON public.activity_media FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);