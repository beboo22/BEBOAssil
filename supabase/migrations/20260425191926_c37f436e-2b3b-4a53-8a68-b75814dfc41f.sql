ALTER TABLE public.site_settings
ADD COLUMN IF NOT EXISTS serpapi_bank_config jsonb NOT NULL DEFAULT jsonb_build_object(
  'maxPages', 3,
  'pageSize', 20,
  'freshThreshold', 10,
  'refreshMode', 'manual',
  'refreshIntervalDays', 7,
  'refreshAfterGenerations', 100,
  'lastRefreshedAt', null,
  'generationsSinceRefresh', 0
);