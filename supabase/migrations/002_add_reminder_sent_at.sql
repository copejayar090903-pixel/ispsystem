-- Migration: Add reminder_sent_at column to bills table
-- Run this in your Supabase SQL editor or via supabase db push

alter table public.bills
  add column if not exists reminder_sent_at timestamptz;

comment on column public.bills.reminder_sent_at
  is 'Timestamp when the last billing reminder email was sent to the customer. NULL means no reminder has been sent yet.';
