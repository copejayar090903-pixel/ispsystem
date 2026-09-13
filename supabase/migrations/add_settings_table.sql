-- =====================================================================
-- Migration: Create settings table for system configuration
-- Run this in Supabase SQL Editor → New Query → Run
-- =====================================================================

-- 1. Create settings table (safe to run even if it exists already)
CREATE TABLE IF NOT EXISTS public.settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Admin full access policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'settings' AND policyname = 'admin_all_settings'
  ) THEN
    EXECUTE 'CREATE POLICY admin_all_settings ON public.settings FOR ALL TO public USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- 2. Insert default reminder schedule (skip if already exists)
INSERT INTO public.settings (key, value) VALUES (
  'reminder_schedule',
  '{
    "enabled": false,
    "hour": 8,
    "minute": 0,
    "daysBeforeDue": 3,
    "channels": ["email", "sms"],
    "lastRunAt": null,
    "nextRunAt": null
  }'::jsonb
) ON CONFLICT (key) DO NOTHING;
