
-- fix search_path on helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('epi-assets', 'epi-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "epi-assets public read"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'epi-assets');

CREATE POLICY "epi-assets auth upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'epi-assets');

CREATE POLICY "epi-assets anon upload signatures"
ON storage.objects FOR INSERT TO anon
WITH CHECK (bucket_id = 'epi-assets' AND (storage.foldername(name))[1] = 'assinaturas');

CREATE POLICY "epi-assets auth update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'epi-assets');
