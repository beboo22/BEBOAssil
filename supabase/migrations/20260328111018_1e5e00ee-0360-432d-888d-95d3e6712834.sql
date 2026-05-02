
CREATE TABLE public.global_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_ar text,
  description text NOT NULL DEFAULT '',
  description_ar text,
  category text NOT NULL DEFAULT 'sports',
  city text NOT NULL,
  country text NOT NULL,
  venue text,
  image_url text,
  start_date date NOT NULL,
  end_date date,
  latitude numeric,
  longitude numeric,
  website_url text,
  ticket_url text,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active events" ON public.global_events
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage events" ON public.global_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
