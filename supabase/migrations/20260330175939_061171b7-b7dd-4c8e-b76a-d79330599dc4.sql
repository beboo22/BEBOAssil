
CREATE TABLE IF NOT EXISTS public.event_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.global_events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid,
  platform text NOT NULL DEFAULT 'link',
  referral_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert event shares" ON public.event_shares FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can view all event shares" ON public.event_shares FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
