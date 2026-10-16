-- ============================================================
-- FULL DATA RECOVERY SCRIPT
-- Run this in Supabase SQL Editor to restore everything
-- Generated from: MikroTik PPPoE accounts + Activity Logs
-- ============================================================

-- ============================================
-- STEP 1: Recreate Tables
-- ============================================
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

CREATE TABLE IF NOT EXISTS public.bills (
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

CREATE TABLE IF NOT EXISTS public.payments (
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

-- ============================================
-- STEP 2: Enable RLS + Policies
-- ============================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_customers' AND tablename = 'customers') THEN
    CREATE POLICY admin_all_customers ON public.customers FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_bills' AND tablename = 'bills') THEN
    CREATE POLICY admin_all_bills ON public.bills FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_all_payments' AND tablename = 'payments') THEN
    CREATE POLICY admin_all_payments ON public.payments FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- ============================================
-- STEP 3: Re-insert ALL 25 customers
-- Data sources:
--   - Full names & profiles: MikroTik PPPoE secrets
--   - Due dates: activity_logs (payment metadata new_due_date)
--   - Plans: plans table (30mbps = PLAN 700, Expired-Profile = Expired)
-- ============================================

-- Plan IDs (from your plans table):
--   30mbps          = 5a30c8aa-6fc8-46e8-a36f-9bf31767535e (PLAN 700)
--   50mbps          = 12dc8c9b-38ef-4e60-b181-7a3f8d30a4e7 (PLAN 1299)
--   100mbps         = a1fae539-f138-4a9a-a35c-60c2cc852eb1 (PLAN 999)
--   Expired-Profile = 3617bc1f-817f-4090-bbc9-728806acc244 (Expired)

INSERT INTO public.customers (account_number, full_name, pppoe_username, plan_id, status, due_date, contact_number, installation_date)
VALUES
  -- Customers on 30mbps (PLAN 700) - Active
  -- Due dates = LATEST "next due" from most recent payment in activity_logs
  (floor(random() * 900000000 + 100000000)::text, 'Daisy tesorero',            'atedaise30Mbps', '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-20T06:41:08.335Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Michelle R. debelen',        'bunso30M',       '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-11-04T01:11:04.703Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Criza Poluoriza reodique',   'Customer1',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-20T08:57:22.798Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'EUNICE O. FLORES',           'Customer10',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-19T06:09:36.680Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Vinice Rañada Lanuza',       'Customer12',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-18T14:09:13.387Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Crisvin Jay',                'Customer15',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-11-04T01:13:30.848Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Cecil Martinez',             'Customer17',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-11-07T02:07:53.893Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'James Saralde',              'Customer21',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-16T00:57:56.346Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Cherry Ann O. Fabon',        'Customer22',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-15T01:43:04.408Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Hazel Ragodon Arbilon',      'Customer24',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-20T00:41:44.675Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Jorichel may B. Loure',      'Customer25',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-22T13:57:49.825Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Shane mejes saralde',        'Customer26',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-25T14:34:29.228Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Aldo Sapo',                  'Customer27',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-18T14:01:19.072Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Olayon',                     'Customer3',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-18T14:15:07.480Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Eduardo Sanado',             'Customer30',     '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  NULL, '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'testing',                    'Customer4',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-08-25T10:29:26.074Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Nico Bongcalos Ballaran',    'Customer5',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-27T01:06:25.298Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Arlene Reodique',            'Customer8',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-18T14:08:42.593Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Jayvee Reforsado',           'Customer9',      '5a30c8aa-6fc8-46e8-a36f-9bf31767535e', 'active',  '2026-10-18T14:05:56.967Z', '-', CURRENT_DATE),

  -- Customers on Expired-Profile - Overdue/Unpaid
  (floor(random() * 900000000 + 100000000)::text, 'John Redjel',                'atejen30Mbps',   '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  '2026-10-08T13:57:25.552Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Maynaga BRGY Hall',          'Customer11',     '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  '2026-10-07T05:26:25.787Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Kuya noli',                  'Customer19',     '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  '2026-08-28T01:55:58.690Z', '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Mylene Z. Brillante',        'Customer2',      '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  NULL, '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Andy B. Toralde',            'Customer6',      '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  NULL, '-', CURRENT_DATE),
  (floor(random() * 900000000 + 100000000)::text, 'Nancy Saduaeste',            'Customer7',      '3617bc1f-817f-4090-bbc9-728806acc244', 'unpaid',  '2026-08-31T14:02:34.325Z', '-', CURRENT_DATE)
ON CONFLICT (pppoe_username) DO NOTHING;

-- ============================================
-- STEP 4: Verify the recovery
-- ============================================
SELECT
  full_name,
  pppoe_username,
  status,
  due_date,
  account_number
FROM public.customers
ORDER BY full_name;
