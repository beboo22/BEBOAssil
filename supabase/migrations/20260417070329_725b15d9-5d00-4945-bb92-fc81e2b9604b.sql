-- Extension for fast fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- World cities table (GeoNames cities15000 + custom)
CREATE TABLE public.world_cities (
  id BIGINT PRIMARY KEY, -- GeoNames ID
  name TEXT NOT NULL,
  ascii_name TEXT NOT NULL,
  name_ar TEXT,
  alt_names TEXT, -- comma-separated alternate names (multi-language)
  country_code TEXT NOT NULL, -- ISO 3166-1 alpha-2
  country_name TEXT NOT NULL,
  admin1 TEXT, -- region/state
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  population BIGINT NOT NULL DEFAULT 0,
  feature_code TEXT, -- PPL, PPLA, PPLC, etc.
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast search
CREATE INDEX idx_world_cities_name_trgm ON public.world_cities USING gin (ascii_name gin_trgm_ops);
CREATE INDEX idx_world_cities_name_ar_trgm ON public.world_cities USING gin (name_ar gin_trgm_ops) WHERE name_ar IS NOT NULL;
CREATE INDEX idx_world_cities_alt_trgm ON public.world_cities USING gin (alt_names gin_trgm_ops) WHERE alt_names IS NOT NULL;
CREATE INDEX idx_world_cities_country ON public.world_cities (country_code);
CREATE INDEX idx_world_cities_population ON public.world_cities (population DESC);

-- RLS: public read, only admin write
ALTER TABLE public.world_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read world cities"
ON public.world_cities FOR SELECT
USING (true);

CREATE POLICY "Admins can manage world cities"
ON public.world_cities FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));