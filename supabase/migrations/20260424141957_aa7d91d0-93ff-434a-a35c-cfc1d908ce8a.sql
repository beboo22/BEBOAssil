-- Co-host requests: viewers can ask the host to join their stream
CREATE TABLE IF NOT EXISTS public.live_stream_cohost_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  requester_name text,
  requester_avatar text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | declined | revoked
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (stream_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_cohost_requests_stream_status
  ON public.live_stream_cohost_requests(stream_id, status);

ALTER TABLE public.live_stream_cohost_requests ENABLE ROW LEVEL SECURITY;

-- Authenticated viewers can create their own request
CREATE POLICY "Viewers can request cohost"
  ON public.live_stream_cohost_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

-- Requester can read their own; host can read all for their streams
CREATE POLICY "Requester can read own"
  ON public.live_stream_cohost_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id);

CREATE POLICY "Host can read requests for their streams"
  ON public.live_stream_cohost_requests FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = live_stream_cohost_requests.stream_id AND ls.user_id = auth.uid()
  ));

-- Host can update (approve/decline); requester can revoke
CREATE POLICY "Host can update requests"
  ON public.live_stream_cohost_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = live_stream_cohost_requests.stream_id AND ls.user_id = auth.uid()
  ));

CREATE POLICY "Requester can revoke own"
  ON public.live_stream_cohost_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id);

-- Add allow_cohost_requests flag to streams
ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS allow_cohost_requests boolean NOT NULL DEFAULT false;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_stream_cohost_requests;