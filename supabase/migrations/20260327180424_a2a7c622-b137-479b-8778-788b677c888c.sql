-- Allow authenticated users to activate their own subscriptions (needed for free-plan activation)
CREATE POLICY "Users can create own subscriptions"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());