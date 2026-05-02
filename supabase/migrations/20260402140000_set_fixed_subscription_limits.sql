-- Migration: Set fixed-quota limits for existing subscription plans
-- Path: supabase/migrations/20260402140000_set_fixed_subscription_limits.sql

-- 1. Ensure the column exists (already added in 20260330193424)
-- ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_total_activities integer NOT NULL DEFAULT 0;

-- 2. Update existing plans with sensible defaults
-- Free Plan: 5 total trips
UPDATE public.subscription_plans 
SET max_total_activities = 5 
WHERE lower(name) LIKE '%free%' OR lower(name) LIKE '%مجاني%';

-- Pro/Standard Plan: 50 total trips
UPDATE public.subscription_plans 
SET max_total_activities = 50 
WHERE lower(name) LIKE '%pro%' OR lower(name) LIKE '%standard%' OR lower(name) LIKE '%احترافي%';

-- Business/Ultimate Plan: 500 total trips
UPDATE public.subscription_plans 
SET max_total_activities = 500 
WHERE lower(name) LIKE '%business%' OR lower(name) LIKE '%ultimate%' OR lower(name) LIKE '%أعمال%';

-- Any other plans: 20 total trips (safety default)
UPDATE public.subscription_plans 
SET max_total_activities = 20 
WHERE max_total_activities = 0;
