
-- Fix: restrict insert to only allow system/trigger inserts by user_id match
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
