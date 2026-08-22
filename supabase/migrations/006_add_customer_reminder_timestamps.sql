-- Migration: Add reminder tracking timestamps directly to the customers table
-- Run this in your Supabase SQL editor or via supabase db push

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.customers.reminder_sent_at
  IS 'Timestamp when the last email reminder was sent. NULL means no reminder has been sent.';

COMMENT ON COLUMN public.customers.sms_reminder_sent_at
  IS 'Timestamp when the last SMS reminder was sent. NULL means no reminder has been sent.';
