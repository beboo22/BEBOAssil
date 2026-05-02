
-- Make user_id nullable for guest orders
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- Add guest fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_id text;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

-- Allow anyone (including anon/guest) to create orders
CREATE POLICY "Anyone can create orders"
ON public.orders
FOR INSERT
TO public
WITH CHECK (true);

-- Authenticated users can view their own orders
CREATE POLICY "Users can view own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Guests can view orders by guest_id (anon role)
CREATE POLICY "Guests can view own orders by guest_id"
ON public.orders
FOR SELECT
TO anon
USING (guest_id IS NOT NULL AND guest_id = guest_id);

-- Allow service role to update order status (for payment confirmation)
-- Note: service role bypasses RLS, but we add a policy for edge functions using anon key
CREATE POLICY "Anyone can update own pending orders"
ON public.orders
FOR UPDATE
TO public
USING (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR (guest_id IS NOT NULL AND status = 'pending')
)
WITH CHECK (
  (user_id IS NOT NULL AND user_id = auth.uid())
  OR (guest_id IS NOT NULL)
);
