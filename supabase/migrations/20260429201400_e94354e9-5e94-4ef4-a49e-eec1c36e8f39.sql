
CREATE TABLE IF NOT EXISTS public.price_variance_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('flight','hotel')),
  origin TEXT,
  destination TEXT,
  provider TEXT,
  estimated_price NUMERIC,
  api_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  variance_pct NUMERIC,
  threshold_pct NUMERIC NOT NULL DEFAULT 25,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  metadata JSONB DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_variance_alerts_created_at ON public.price_variance_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_variance_alerts_ack ON public.price_variance_alerts(acknowledged, created_at DESC);

ALTER TABLE public.price_variance_alerts ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage
CREATE POLICY "Admins can view price variance alerts"
  ON public.price_variance_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update price variance alerts"
  ON public.price_variance_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can insert (logging from client) - validated by edge function ideally but allow log
CREATE POLICY "Authenticated users can insert price variance alerts"
  ON public.price_variance_alerts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));
