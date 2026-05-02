ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS parent_stream_id uuid REFERENCES public.live_streams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_streams_parent ON public.live_streams(parent_stream_id) WHERE parent_stream_id IS NOT NULL;