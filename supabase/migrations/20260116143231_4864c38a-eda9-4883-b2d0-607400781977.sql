-- Create storage bucket for public assets (logos, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-assets', 'public-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read public assets
CREATE POLICY "Public assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'public-assets');

-- Allow authenticated users to upload to public assets
CREATE POLICY "Authenticated users can upload public assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'public-assets' AND auth.role() = 'authenticated');

-- Allow users to update their own uploads
CREATE POLICY "Users can update their own public assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'public-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own uploads  
CREATE POLICY "Users can delete their own public assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'public-assets' AND auth.uid()::text = (storage.foldername(name))[1]);