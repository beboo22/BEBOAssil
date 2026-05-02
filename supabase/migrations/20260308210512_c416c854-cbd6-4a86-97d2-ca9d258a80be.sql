create extension if not exists pgcrypto;
CREATE TABLE public.shared_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text UNIQUE NOT NULL DEFAULT substring(md5(random()::text), 1, 16),
  trip_id text NOT NULL,
  trip_data jsonb NOT NULL,
  destination text NOT NULL,
  shared_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view shared trips"
ON public.shared_trips
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Authenticated users can create shared trips"
ON public.shared_trips
FOR INSERT
TO authenticated
WITH CHECK (shared_by = auth.uid());

CREATE POLICY "Users can delete their own shared trips"
ON public.shared_trips
FOR DELETE
TO authenticated
USING (shared_by = auth.uid());

CREATE POLICY "Admins can manage all shared trips"
ON public.shared_trips
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));