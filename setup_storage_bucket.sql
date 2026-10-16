-- ─────────────────────────────────────────────────────────────────────────────
-- SUPABASE STORAGE SETUP — Payment Proof Receipts
-- Run this in Supabase Dashboard → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create the storage bucket (public so admin/owner email can view images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  true,
  10485760,  -- 10 MB max per file
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/gif', 'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS Policies

-- Anyone can upload (customers don't have auth sessions)
CREATE POLICY "Allow public uploads to payment-proofs"
  ON storage.objects
  FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'payment-proofs');

-- Anyone can read/view (needed so email receipt link works for admin)
CREATE POLICY "Allow public reads from payment-proofs"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'payment-proofs');

-- Only service role can delete (cleanup old files via server)
CREATE POLICY "Allow service role delete from payment-proofs"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id = 'payment-proofs');
