
DROP POLICY IF EXISTS "Anyone can view active discount codes" ON public.discount_codes;
CREATE POLICY "Authenticated users can view active discount codes" ON public.discount_codes
  FOR SELECT TO authenticated
  USING (is_active = true);
