-- ISP Billing MVP schema for Supabase (Postgres)

create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'customer_status') then
    create type customer_status as enum ('active', 'inactive', 'disconnected', 'overdue', 'suspended');
  end if;

  -- If the enum already exists from a previous iteration, ensure it supports the
  -- current app's value (`inactive`).
  begin
    alter type customer_status add value if not exists 'inactive';
  exception
    when undefined_object then
      null;
    when duplicate_object then
      null;
  end;

  if not exists (select 1 from pg_type where typname = 'bill_status') then
    create type bill_status as enum ('paid', 'unpaid', 'overdue', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'verified', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum ('gcash', 'maya', 'bank_transfer', 'cash');
  end if;
end
$$;

-- ---------- Utility trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------- Plans ----------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_fee numeric(12,2) not null check (monthly_fee >= 0),
  speed_mbps integer not null check (speed_mbps > 0),
  mikrotik_profile text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Ensure columns exist (safe re-run if table existed already).
alter table public.plans add column if not exists code text;
alter table public.plans add column if not exists name text;
alter table public.plans add column if not exists monthly_fee numeric(12,2);
alter table public.plans add column if not exists speed_mbps integer;
alter table public.plans add column if not exists mikrotik_profile text;
alter table public.plans add column if not exists is_active boolean;
alter table public.plans add column if not exists created_at timestamptz;
alter table public.plans add column if not exists updated_at timestamptz;

-- ---------- Customers ----------
-- Customers table is aligned to the current Next.js app payload shape.
-- If you already have `public.customers`, the ALTER TABLE statements below will
-- add missing columns without dropping existing data.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  account_number text unique,
  name text not null,
  address text,
  phone text,
  email text,
  installation_date date,
  pppoe_username text not null unique,
  pppoe_profile text not null,
  plan_id uuid references public.plans(id) on update cascade,
  status customer_status not null default 'active',
  last_status_change_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.customers add column if not exists account_number text;
alter table public.customers add column if not exists installation_date date;
alter table public.customers add column if not exists plan_id uuid;
alter table public.customers add column if not exists last_status_change_at timestamptz;
alter table public.customers add column if not exists notes text;

-- Best-effort foreign key add (skips if it already exists).
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_plan_id_fkey'
  ) then
    begin
      alter table public.customers
        add constraint customers_plan_id_fkey
        foreign key (plan_id) references public.plans(id) on update cascade;
    exception
      when others then
        -- If the column exists with an incompatible type, or the referenced table
        -- isn't ready yet, skip constraint creation.
        null;
    end;
  end if;
end
$$;

create index if not exists idx_customers_status on public.customers(status);
create index if not exists idx_customers_plan_id on public.customers(plan_id);
create index if not exists idx_customers_name on public.customers(name);

-- ---------- Bills ----------
-- Bills reference customers by PPPoE username so the migration works even if an
-- existing `customers` table doesn't have a stable UUID PK.
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  pppoe_username text not null,
  billing_year integer not null,
  billing_month integer not null check (billing_month between 1 and 12),
  billing_period_start date not null,
  billing_period_end date not null,
  due_date date not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  status bill_status not null default 'unpaid',
  paid_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (pppoe_username, billing_year, billing_month)
);

alter table public.bills add column if not exists pppoe_username text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bills_pppoe_username_fkey'
  ) then
    -- Only add the FK if `customers.pppoe_username` is unique (required by Postgres).
    if exists (
      select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
      where t.relnamespace = 'public'::regnamespace
        and t.relname = 'customers'
        and i.indisunique
        and a.attname = 'pppoe_username'
    ) then
      begin
        alter table public.bills
          add constraint bills_pppoe_username_fkey
          foreign key (pppoe_username) references public.customers(pppoe_username)
          on update cascade on delete cascade;
      exception
        when others then
          null;
      end;
    end if;
  end if;
end
$$;

create index if not exists idx_bills_pppoe_username on public.bills(pppoe_username);
create index if not exists idx_bills_status on public.bills(status);
create index if not exists idx_bills_due_date on public.bills(due_date);

-- ---------- Payments ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid,
  pppoe_username text,
  method payment_method not null,
  reference_number text,
  amount_paid numeric(12,2) not null check (amount_paid >= 0),
  proof_url text,
  submitted_at timestamptz not null default timezone('utc', now()),
  status payment_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- If `public.payments` already existed, ensure the expected columns are present.
alter table public.payments add column if not exists bill_id uuid;
alter table public.payments add column if not exists pppoe_username text;
alter table public.payments add column if not exists method payment_method;
alter table public.payments add column if not exists reference_number text;
alter table public.payments add column if not exists amount_paid numeric(12,2);
alter table public.payments add column if not exists proof_url text;
alter table public.payments add column if not exists submitted_at timestamptz;
alter table public.payments add column if not exists status payment_status;
alter table public.payments add column if not exists reviewed_by uuid;
alter table public.payments add column if not exists reviewed_at timestamptz;
alter table public.payments add column if not exists rejection_reason text;
alter table public.payments add column if not exists created_at timestamptz;
alter table public.payments add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_bill_id_fkey'
  ) then
    begin
      alter table public.payments
        add constraint payments_bill_id_fkey
        foreign key (bill_id) references public.bills(id) on delete cascade;
    exception
      when others then
        null;
    end;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_pppoe_username_fkey'
  ) then
    if exists (
      select 1
      from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = any(i.indkey)
      where t.relnamespace = 'public'::regnamespace
        and t.relname = 'customers'
        and i.indisunique
        and a.attname = 'pppoe_username'
    ) then
      begin
        alter table public.payments
          add constraint payments_pppoe_username_fkey
          foreign key (pppoe_username) references public.customers(pppoe_username)
          on update cascade on delete cascade;
      exception
        when others then
          null;
      end;
    end if;
  end if;
end
$$;

create index if not exists idx_payments_bill_id on public.payments(bill_id);
create index if not exists idx_payments_pppoe_username on public.payments(pppoe_username);
create index if not exists idx_payments_status on public.payments(status);

-- ---------- PPPoE session snapshots ----------
create table if not exists public.pppoe_sessions (
  id uuid primary key default gen_random_uuid(),
  pppoe_username text not null,
  profile text,
  status text,
  ip_address inet,
  uptime text,
  last_seen_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pppoe_sessions_username on public.pppoe_sessions(pppoe_username);
create index if not exists idx_pppoe_sessions_created_at on public.pppoe_sessions(created_at desc);

-- ---------- Activity logs ----------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null, -- admin | system | customer
  actor_id text,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_action on public.activity_logs(action);

-- ---------- Triggers ----------
drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- ---------- Initial plan seed ----------
insert into public.plans (code, name, monthly_fee, speed_mbps, mikrotik_profile)
values
  ('PLAN-999', 'Plan 999 - 20Mbps', 999.00, 20, 'plan-20mbps'),
  ('PLAN-1299', 'Plan 1299 - 30Mbps', 1299.00, 30, 'plan-30mbps'),
  ('PLAN-1499', 'Plan 1499 - 50Mbps', 1499.00, 50, 'plan-50mbps'),
  ('PLAN-1999', 'Plan 1999 - 100Mbps', 1999.00, 100, 'plan-100mbps')
on conflict (code) do nothing;

-- ---------- RLS baseline ----------
alter table public.plans enable row level security;
alter table public.customers enable row level security;
alter table public.bills enable row level security;
alter table public.payments enable row level security;
alter table public.pppoe_sessions enable row level security;
alter table public.activity_logs enable row level security;

-- Example admin-only policy using custom JWT claim: role=admin
-- Adjust to your auth strategy.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='plans' and policyname='admin_all_plans'
  ) then
    create policy admin_all_plans on public.plans
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='admin_all_customers'
  ) then
    create policy admin_all_customers on public.customers
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='bills' and policyname='admin_all_bills'
  ) then
    create policy admin_all_bills on public.bills
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='payments' and policyname='admin_all_payments'
  ) then
    create policy admin_all_payments on public.payments
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='pppoe_sessions' and policyname='admin_all_pppoe_sessions'
  ) then
    create policy admin_all_pppoe_sessions on public.pppoe_sessions
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='activity_logs' and policyname='admin_all_activity_logs'
  ) then
    create policy admin_all_activity_logs on public.activity_logs
      for all
      using (coalesce(auth.jwt() ->> 'role', '') = 'admin')
      with check (coalesce(auth.jwt() ->> 'role', '') = 'admin');
  end if;
end
$$;
