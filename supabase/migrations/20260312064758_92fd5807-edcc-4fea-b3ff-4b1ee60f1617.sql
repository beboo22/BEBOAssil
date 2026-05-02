-- Reports for travel stories moderation
CREATE TABLE IF NOT EXISTS public.story_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.travel_stories(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'other',
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.story_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own story reports" ON public.story_reports;
CREATE POLICY "Users can create their own story reports"
ON public.story_reports
FOR INSERT
TO authenticated
WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS "Users can view their own story reports" ON public.story_reports;
CREATE POLICY "Users can view their own story reports"
ON public.story_reports
FOR SELECT
TO authenticated
USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all story reports" ON public.story_reports;
CREATE POLICY "Admins can manage all story reports"
ON public.story_reports
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_story_reports_story_id ON public.story_reports(story_id);
CREATE INDEX IF NOT EXISTS idx_story_reports_status ON public.story_reports(status);
CREATE INDEX IF NOT EXISTS idx_story_reports_created_at ON public.story_reports(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_story_reports_story_reporter ON public.story_reports(story_id, reported_by);