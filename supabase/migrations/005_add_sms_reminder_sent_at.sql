-- Migration: Add sms_reminder_sent_at column to bills table
-- Run this in your Supabase SQL editor or via supabase db push

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS sms_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.bills.sms_reminder_sent_at
  IS 'Timestamp when the last billing reminder SMS was sent to the customer. NULL means no SMS reminder has been sent yet.';
