-- Fix RLS policies for logos bucket to allow authenticated users to upload
-- First drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view logos" ON storage.objects;

-- Allow authenticated users to upload to logos bucket
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Allow anyone to view logos (public bucket)
CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'logos');