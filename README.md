# ISP Billing System

Modern ISP billing and operations platform for a MikroTik + PPPoE network stack.

Tech stack:

- Next.js (App Router)
- Supabase (Postgres + Auth + Storage)
- MikroTik RouterOS API (`node-routeros`)
- VPN for secure network reachability

## Current Implemented Modules

- PPPoE account listing from MikroTik
- PPPoE account enable/disable actions
- PPPoE profile listing
- Customer upsert to Supabase from admin UI

## Project Structure Notes

Main application source is under `src/`.

Important paths:

- `src/app/admin/pppoe/page.tsx`
- `src/app/admin/customers/page.tsx`
- `src/app/api/mikrotik/*`
- `src/app/api/customers/route.ts`
- `src/lib/mikrotik.ts`
- `src/lib/supabase.ts`

## Environment Variables

Configure in `.env`:

```env
MIKROTIK_HOST=
MIKROTIK_PORT=8728
MIKROTIK_USER=
MIKROTIK_PASS=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase Setup

Run the initial schema migration:

- `supabase/migrations/001_init_isp_billing.sql`

This migration creates:

- `plans`
- `customers`
- `bills`
- `payments`
- `pppoe_sessions`
- `activity_logs`

It also seeds default plans:

- Plan 999 - 20Mbps
- Plan 1299 - 30Mbps
- Plan 1499 - 50Mbps
- Plan 1999 - 100Mbps

## MVP Blueprint

See implementation roadmap:

- `docs/mvp-implementation-blueprint.md`

Includes:

- feature scope
- route design
- automation jobs
- security baseline
- build order for production MVP
