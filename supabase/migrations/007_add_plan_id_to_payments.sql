-- Migration: add plan_id column to payments table
-- This lets us track which plan the customer selected when they submitted a payment,
-- so that on approval the PPPoE profile and customer plan can be updated accordingly.

alter table public.payments
  add column if not exists plan_id uuid references public.plans(id) on update cascade;

comment on column public.payments.plan_id is
  'The plan the customer selected when submitting this payment. Used to update the PPPoE profile on approval.';
