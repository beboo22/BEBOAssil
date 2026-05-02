
-- Create storage bucket for story media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('story-media', 'story-media', true, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);

-- Allow authenticated users to upload to story-media bucket
CREATE POLICY "Authenticated users can upload story media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'story-media');

-- Allow anyone to view story media
CREATE POLICY "Anyone can view story media"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'story-media');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own story media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'story-media' AND (storage.foldername(name))[1] = auth.uid()::text);
