-- Migration: Create expenses table for tracking monthly ISP operational costs
-- Run this in your Supabase SQL editor or via supabase db push

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                          -- e.g. "Bandwidth", "Electricity", "Rent"
  category text NOT NULL DEFAULT 'operational', -- operational, bandwidth, utilities, other
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  billing_year integer NOT NULL,
  billing_month integer NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_expenses_year_month ON public.expenses(billing_year, billing_month);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_expenses_updated_at ON public.expenses;
CREATE TRIGGER trg_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Allow all access (server-side routes bypass RLS via service role keys)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='expenses' AND policyname='admin_all_expenses'
  ) THEN
    CREATE POLICY admin_all_expenses ON public.expenses
      FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END
$$;
