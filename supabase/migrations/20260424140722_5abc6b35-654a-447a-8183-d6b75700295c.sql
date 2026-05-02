-- Add scheduling and viewer analytics to live_streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS description text;

-- status values: 'scheduled' | 'live' | 'ended'
-- For backward compatibility, existing rows stay with status='live'
-- New scheduled streams should set status='scheduled' and is_active=false until they go live

-- Track viewer joins for time-bucketed analytics (unique viewers over time)
CREATE TABLE IF NOT EXISTS public.live_stream_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  viewer_key text NOT NULL,
  user_id uuid,
  user_name text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_live_stream_viewers_stream ON public.live_stream_viewers(stream_id, joined_at);

ALTER TABLE public.live_stream_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert viewer joins"
  ON public.live_stream_viewers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Stream host can view their viewers"
  ON public.live_stream_viewers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_streams ls
      WHERE ls.id = live_stream_viewers.stream_id AND ls.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all viewers"
  ON public.live_stream_viewers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));