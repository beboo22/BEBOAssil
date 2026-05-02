ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_weather_uses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_emergency_uses integer NOT NULL DEFAULT 0;