DROP POLICY IF EXISTS "Authenticated users can post comments" ON public.live_stream_comments;

CREATE POLICY "Users and guests can post live comments"
ON public.live_stream_comments
FOR INSERT
TO public
WITH CHECK (
  (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND length(btrim(content)) > 0
  )
  OR (
    auth.uid() IS NULL
    AND user_id IS NULL
    AND length(btrim(content)) > 0
  )
);