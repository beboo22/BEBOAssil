-- Inflight request coordination table for deduplicating concurrent identical SerpAPI lookups
CREATE TABLE IF NOT EXISTS public.inflight_lookups (
  cache_key text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),
  worker_id text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inflight_lookups_expires ON public.inflight_lookups(expires_at);

ALTER TABLE public.inflight_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages inflight lookups"
  ON public.inflight_lookups
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Cleanup function for stale inflight markers
CREATE OR REPLACE FUNCTION public.cleanup_stale_inflight_lookups()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.inflight_lookups WHERE expires_at < now();
$$;

-- Try-acquire helper: returns true if this worker won the lock, false if another worker is already running
CREATE OR REPLACE FUNCTION public.try_acquire_lookup_lock(_cache_key text, _worker_id text, _ttl_seconds integer DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired boolean := false;
BEGIN
  -- Clean stale locks first
  DELETE FROM public.inflight_lookups WHERE cache_key = _cache_key AND expires_at < now();

  -- Try to insert; on conflict, another worker has the lock
  INSERT INTO public.inflight_lookups (cache_key, worker_id, expires_at)
  VALUES (_cache_key, _worker_id, now() + make_interval(secs => _ttl_seconds))
  ON CONFLICT (cache_key) DO NOTHING;

  GET DIAGNOSTICS v_acquired = ROW_COUNT;
  RETURN v_acquired > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_lookup_lock(_cache_key text, _worker_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.inflight_lookups WHERE cache_key = _cache_key AND worker_id = _worker_id;
$$;

-- Ensure venue cache stores coordinates for each activity (extends places_cache via JSONB results — no schema change needed)
-- Add explicit columns on places_cache for fast lookup of single venue details
ALTER TABLE public.places_cache
  ADD COLUMN IF NOT EXISTS venue_latitude numeric,
  ADD COLUMN IF NOT EXISTS venue_longitude numeric,
  ADD COLUMN IF NOT EXISTS venue_address text;

CREATE INDEX IF NOT EXISTS idx_places_cache_source_key ON public.places_cache(source, cache_key);