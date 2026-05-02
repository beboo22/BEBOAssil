
-- Shared SerpApi results cache
CREATE TABLE public.places_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query text NOT NULL,
  city text,
  cuisine text,
  interest text,
  meal_type text,
  language text DEFAULT 'en',
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  results_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'serpapi',
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  last_accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_places_cache_key ON public.places_cache(cache_key);
CREATE INDEX idx_places_cache_city ON public.places_cache(city);
CREATE INDEX idx_places_cache_expires ON public.places_cache(expires_at);

ALTER TABLE public.places_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached places"
ON public.places_cache FOR SELECT
USING (expires_at > now());

CREATE POLICY "Service role manages cache"
ON public.places_cache FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Per-place usage tracking for diversity engine
CREATE TABLE public.places_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_key text NOT NULL,
  place_name text,
  city text,
  category text,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  UNIQUE(place_key, user_id)
);

CREATE INDEX idx_places_usage_key ON public.places_usage(place_key);
CREATE INDEX idx_places_usage_user ON public.places_usage(user_id);
CREATE INDEX idx_places_usage_city ON public.places_usage(city);

ALTER TABLE public.places_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage"
ON public.places_usage FOR SELECT
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users write own usage"
ON public.places_usage FOR INSERT
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users update own usage"
ON public.places_usage FOR UPDATE
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Service role manages usage"
ON public.places_usage FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
