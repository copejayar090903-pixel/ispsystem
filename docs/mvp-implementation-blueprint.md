# ISP Billing MVP Blueprint

This blueprint is tailored to the current codebase in this repository.

## Current State (Already Working)

- Next.js admin UI pages for:
  - `/admin/pppoe`
  - `/admin/customers`
- API routes for MikroTik:
  - `GET /api/mikrotik/pppoe`
  - `GET /api/mikrotik/profiles`
  - `POST /api/mikrotik/enable`
  - `POST /api/mikrotik/disable`
- API route for customer upsert:
  - `POST /api/customers`
- RouterOS integration via `node-routeros` in `src/lib/mikrotik.ts`
- Supabase server client in `src/lib/supabase.ts`

## MVP Scope (Version 1)

1. Dashboard metrics
2. Customer management (CRUD + search)
3. Plan management
4. Billing generation and status lifecycle
5. Payment submission and admin approval
6. Auto enable/disable PPPoE based on billing/payment status
7. Reports and exports
8. Customer portal lookup by account number

## Suggested Data Model (Supabase)

Use the migration in `supabase/migrations/001_init_isp_billing.sql`.

Core tables:

- `plans`
- `customers`
- `bills`
- `payments`
- `pppoe_sessions`
- `activity_logs`

Key workflow:

1. Customer belongs to one plan
2. Monthly bill generated per active customer
3. Payment submitted against a bill
4. Admin verifies payment
5. Bill status becomes `paid`
6. Customer status becomes `active`
7. API calls MikroTik enable endpoint

## API Map (Recommended)

Admin APIs:

- `GET /api/dashboard/stats`
- `GET /api/customers`
- `POST /api/customers`
- `PATCH /api/customers/:id`
- `DELETE /api/customers/:id`
- `GET /api/plans`
- `POST /api/plans`
- `PATCH /api/plans/:id`
- `DELETE /api/plans/:id`
- `POST /api/billing/generate`
- `GET /api/billing`
- `PATCH /api/billing/:id/status`
- `GET /api/payments`
- `POST /api/payments/:id/approve`
- `POST /api/payments/:id/reject`
- `GET /api/reports/collections`

Portal APIs:

- `POST /api/portal/lookup` (account number only)
- `POST /api/portal/payment-submit`

Automation APIs (cron/scheduled):

- `POST /api/jobs/generate-bills`
- `POST /api/jobs/overdue-disconnect`
- `POST /api/jobs/reconnect-paid`
- `POST /api/jobs/pppoe-sync`

## UI Route Map

Admin:

- `/admin` dashboard
- `/admin/customers`
- `/admin/plans`
- `/admin/billing`
- `/admin/payments`
- `/admin/reports`
- `/admin/pppoe`

Customer Portal:

- `/portal`

## Automation Design

### 1) Auto Bill Generation

- Monthly schedule (1st day, 00:05 local time)
- Insert one bill per active customer not yet billed for current period
- Default due date = configurable day of month (ex: 10th)

### 2) Auto Disconnection

- Daily schedule (ex: every 2 hours)
- Find overdue unpaid bills after grace period
- Set customer status to `suspended`
- Call MikroTik disable API for PPPoE username
- Log action to `activity_logs`

### 3) Auto Reconnection

- Trigger on payment approval
- Mark bill as `paid`
- Set customer status to `active`
- Call MikroTik enable API
- Log action to `activity_logs`

## Security Baseline

1. Admin auth via Supabase Auth
2. Role-based access (`admin`, `cashier`, `viewer`)
3. RLS policies on all core tables
4. Signed upload URLs for payment proof files
5. Audit logging for billing and payment decisions
6. Keep MikroTik credentials server-side only

## Reporting Outputs

MVP reports:

- Daily collection
- Weekly collection
- Monthly collection
- Overdue accounts
- Suspended/disconnected accounts

Export formats:

- CSV first (MVP)
- Excel/PDF as phase 2

## Recommended Build Order (Fastest to Production)

1. Run the SQL migration and seed 4 plans
2. Add plan CRUD page + API
3. Expand customer page to full CRUD/search
4. Add billing generation and billing list page
5. Build portal lookup + payment submission
6. Build payment approval flow and automate reconnect
7. Add overdue disconnection job
8. Add dashboard and reports endpoints

## Definition of Done for MVP

- Admin can manage customers/plans/bills/payments end-to-end
- Customer can view bill and submit payment by account number
- Overdue accounts are auto-disabled in MikroTik
- Approved payments auto-reconnect PPPoE
- Dashboard and collection reports are available
- All critical actions are logged
