-- Migration: Alter due_date column in customers table to support date and time
-- Run this in your Supabase SQL editor or via supabase db push

ALTER TABLE public.customers
  ALTER COLUMN due_date TYPE timestamptz USING due_date::timestamptz;
