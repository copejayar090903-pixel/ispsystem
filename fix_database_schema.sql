-- ⚠️  WARNING: The DROP TABLE statements below are DESTRUCTIVE and IRREVERSIBLE!
-- ⚠️  Only run them if the database truly has no important data.
-- DROP TABLE IF EXISTS public.payments CASCADE;
-- DROP TABLE IF EXISTS public.billings CASCADE;
-- DROP TABLE IF EXISTS public.bills CASCADE;
-- DROP TABLE IF EXISTS public.customers CASCADE;

-- 1. Recreate Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text UNIQUE NOT NULL,
  full_name text NOT NULL,
  address text,
  contact_number text,
  email text,
  installation_date date,
  due_date timestamptz,
  pppoe_username text UNIQUE NOT NULL,
  plan_id uuid REFERENCES public.plans(id) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Recreate Bills Table
CREATE TABLE public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  billing_year integer NOT NULL,
  billing_month integer NOT NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- 3. Recreate Payments Table
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  billing_id uuid REFERENCES public.bills(id) ON DELETE CASCADE,
  method text NOT NULL,
  reference_number text,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  proof_url text,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Enable Row Level Security (RLS) on new tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create default policies allowing all access (Server-side routes bypass RLS via service role keys anyway)
CREATE POLICY admin_all_customers ON public.customers FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY admin_all_bills ON public.bills FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY admin_all_payments ON public.payments FOR ALL TO public USING (true) WITH CHECK (true);
