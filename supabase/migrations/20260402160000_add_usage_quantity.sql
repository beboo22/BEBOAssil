-- Migration: Add quantity column to usage_tracking for granular activity credits
-- Path: supabase/migrations/20260402160000_add_usage_quantity.sql

-- 1. Add quantity column
ALTER TABLE public.usage_tracking ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- 2. Update existing records
-- If we assume old records were "1 trip = 1 activity" for consistency, we leave them as 1.
-- If we want to assume they were 5 activities, we could UPDATE.
-- For now, default 1 is safe.

-- 3. Create a function to sum usage for a user
-- This is more efficient than a raw SUM in the client
CREATE OR REPLACE FUNCTION public.get_total_used_activities(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM public.usage_tracking
  WHERE user_id = p_user_id
    AND used_at >= p_since
    AND feature = 'planner';
  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
