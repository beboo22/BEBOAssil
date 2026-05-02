
CREATE TABLE IF NOT EXISTS public.user_generation_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  override_type TEXT NOT NULL DEFAULT 'bonus_generations',
  value INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  granted_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_generation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own overrides"
  ON public.user_generation_overrides
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage overrides"
  ON public.user_generation_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
