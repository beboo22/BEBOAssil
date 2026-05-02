
-- Fix: make usage_tracking insert policy more specific
DROP POLICY "Anyone can insert usage" ON public.usage_tracking;

CREATE POLICY "Anyone can insert own usage"
  ON public.usage_tracking FOR INSERT
  WITH CHECK (
    (user_id IS NULL AND guest_id IS NOT NULL) OR
    (user_id = auth.uid())
  );
