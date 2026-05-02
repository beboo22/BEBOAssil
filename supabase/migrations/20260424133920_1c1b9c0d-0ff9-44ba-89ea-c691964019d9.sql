-- Live stream comments table
CREATE TABLE public.live_stream_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id uuid,
  user_name text NOT NULL DEFAULT 'Guest',
  avatar_url text,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lsc_stream_created ON public.live_stream_comments(stream_id, created_at DESC);

ALTER TABLE public.live_stream_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live stream comments"
ON public.live_stream_comments FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can post comments"
ON public.live_stream_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
ON public.live_stream_comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_comments;

-- Storage bucket for stream thumbnails
INSERT INTO storage.buckets (id, name, public)
VALUES ('stream-thumbnails', 'stream-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Stream thumbnails are public"
ON storage.objects FOR SELECT
USING (bucket_id = 'stream-thumbnails');

CREATE POLICY "Users can upload their own thumbnails"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'stream-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own thumbnails"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'stream-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own thumbnails"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'stream-thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);