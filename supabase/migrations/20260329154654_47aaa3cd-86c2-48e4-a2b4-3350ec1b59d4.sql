ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS regen_costs_config jsonb DEFAULT '{"activity": 0.25, "day": 0.5, "full": 1.0}'::jsonb,
ADD COLUMN IF NOT EXISTS flex_plan_config jsonb DEFAULT '{"enabled": false, "base_price": 5, "per_trip": 2, "per_day": 1, "per_activity": 0.5, "min_price": 5, "currency": "USD", "duration_days": 30}'::jsonb;