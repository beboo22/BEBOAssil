-- Migration: Correct all subscription plan limits to fixed-quota model
-- Path: supabase/migrations/20260402150000_correct_all_plan_limits.sql

-- 1. Enterprise Plan (المؤسسات)
UPDATE public.subscription_plans 
SET max_total_activities = 1000,
    is_active = true
WHERE lower(name) LIKE '%enterprise%' OR name_ar LIKE '%مؤسسات%';

-- 2. Pro Plan (المحترف)
UPDATE public.subscription_plans 
SET max_total_activities = 100,
    is_active = true
WHERE lower(name) LIKE '%pro%' OR name_ar LIKE '%محترف%';

-- 3. Starter Plan (البداية)
UPDATE public.subscription_plans 
SET max_total_activities = 30,
    is_active = true
WHERE lower(name) LIKE '%starter%' OR name_ar LIKE '%بداية%';

-- 4. Free Plan (المجاني)
UPDATE public.subscription_plans 
SET max_total_activities = 5,
    is_active = true
WHERE lower(name) LIKE '%free%' OR name_ar LIKE '%مجاني%';

-- 5. Any remaining plan (Safety Default)
UPDATE public.subscription_plans 
SET max_total_activities = 20 
WHERE max_total_activities = 0;
