ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS data_sources_config jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_models_config jsonb DEFAULT '[]'::jsonb