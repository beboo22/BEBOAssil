
CREATE TABLE IF NOT EXISTS public.serpapi_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  guest_id text NULL,
  endpoint text NOT NULL DEFAULT 'google_maps',
  query text NOT NULL,
  city text NULL,
  cache_hit boolean NOT NULL DEFAULT false,
  blocked_by_gate boolean NOT NULL DEFAULT false,
  results_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  context text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_serpapi_usage_created_at ON public.serpapi_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_serpapi_usage_user_id ON public.serpapi_usage(user_id);

ALTER TABLE public.serpapi_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read serpapi usage"
  ON public.serpapi_usage FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
