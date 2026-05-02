CREATE OR REPLACE FUNCTION public.try_acquire_lookup_lock(_cache_key text, _worker_id text, _ttl_seconds integer DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acquired integer := 0;
BEGIN
  DELETE FROM public.inflight_lookups WHERE cache_key = _cache_key AND expires_at < now();
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

CREATE OR REPLACE FUNCTION public.cleanup_stale_inflight_lookups()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.inflight_lookups WHERE expires_at < now();
$$;