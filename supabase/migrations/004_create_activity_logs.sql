-- Migration: Create activity_logs table for tracking system events
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text        NOT NULL,
  pppoe_username text,
  customer_name  text,
  description text        NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at  ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type  ON public.activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_pppoe_user  ON public.activity_logs(pppoe_username);

-- RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all_activity_logs ON public.activity_logs FOR ALL TO public USING (true) WITH CHECK (true);
