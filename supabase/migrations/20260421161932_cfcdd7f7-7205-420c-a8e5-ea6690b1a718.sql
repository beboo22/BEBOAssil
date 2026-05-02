
-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  user_id uuid,
  subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_name text,
  amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'paid',
  payment_method text,
  payment_reference text,
  billing_name text,
  billing_email text,
  billing_country text,
  metadata jsonb DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all invoices"
  ON public.invoices FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can create own invoices"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Invoice number auto-generator
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_count integer;
  v_number text;
BEGIN
  v_year := to_char(now(), 'YYYY');
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.invoices
  WHERE issued_at >= date_trunc('year', now());
  v_number := 'INV-' || v_year || '-' || lpad(v_count::text, 6, '0');
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := public.generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_number ON public.invoices;
CREATE TRIGGER trg_set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

-- Function to transfer remaining credits when upgrading
CREATE OR REPLACE FUNCTION public.grant_remaining_credits_on_upgrade(
  _user_id uuid,
  _new_plan_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_sub RECORD;
  v_old_plan RECORD;
  v_used integer := 0;
  v_remaining integer := 0;
  v_bonus integer := 0;
BEGIN
  -- Get previous active subscription (excluding the one just created for the new plan)
  SELECT us.*, sp.max_total_activities
  INTO v_old_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = _user_id
    AND us.status = 'active'
    AND us.plan_id IS DISTINCT FROM _new_plan_id
    AND us.expires_at > now()
  ORDER BY us.expires_at DESC
  LIMIT 1;

  IF v_old_sub.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Count used activities in the old subscription period
  SELECT COALESCE(public.get_total_used_activities(_user_id, v_old_sub.starts_at), 0)
  INTO v_used;

  -- Add any previous bonus activities
  SELECT COALESCE(SUM(value), 0) INTO v_bonus
  FROM public.user_generation_overrides
  WHERE user_id = _user_id
    AND override_type = 'bonus_activities'
    AND (expires_at IS NULL OR expires_at > now());

  v_remaining := GREATEST(0, (COALESCE(v_old_sub.max_total_activities, 0) + v_bonus) - v_used);

  IF v_remaining > 0 THEN
    INSERT INTO public.user_generation_overrides (user_id, override_type, value, reason, granted_by)
    VALUES (_user_id, 'bonus_activities', v_remaining, 'Carried over from previous plan on upgrade', _user_id);
  END IF;

  -- Mark old subscription as superseded
  UPDATE public.user_subscriptions
  SET status = 'superseded'
  WHERE id = v_old_sub.id;

  RETURN v_remaining;
END;
$$;
