-- Add columns to live_streams for trip import + visual effects sync
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS imported_trip_id text,
  ADD COLUMN IF NOT EXISTS imported_trip_data jsonb,
  ADD COLUMN IF NOT EXISTS active_filter text,
  ADD COLUMN IF NOT EXISTS active_stickers jsonb DEFAULT '[]'::jsonb;

-- Likes table: one like per (stream, user) or (stream, viewer_key for guests)
CREATE TABLE IF NOT EXISTS public.live_stream_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid,
  viewer_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_stream_likes_user_unique
  ON public.live_stream_likes(stream_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS live_stream_likes_guest_unique
  ON public.live_stream_likes(stream_id, viewer_key) WHERE user_id IS NULL AND viewer_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS live_stream_likes_stream_idx ON public.live_stream_likes(stream_id);

ALTER TABLE public.live_stream_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live stream likes"
  ON public.live_stream_likes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can like once"
  ON public.live_stream_likes FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND user_id IS NULL AND viewer_key IS NOT NULL)
  );

CREATE POLICY "Users can remove their own likes"
  ON public.live_stream_likes FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_likes;