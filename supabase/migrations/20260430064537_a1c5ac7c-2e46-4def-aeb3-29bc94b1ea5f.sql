ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS regen_activity_cost numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regen_day_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS regen_full_multiplier numeric NOT NULL DEFAULT 1.5;