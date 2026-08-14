# BB Sales (بي بي سيلز)

Production-ready, zero-state multi-tenant sales management system for distribution trucks.
Built with React + Vite + TypeScript + Supabase. Arabic RTL UI.

## Architecture

- **Frontend:** React 18, Vite 6, Tailwind CSS v4, react-router-dom, Leaflet (live map), html2canvas (invoice images), lucide-react
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime)
- **Roles:** `manager` (GM dashboard, sees all company data) / `sales_rep` (isolated mobile portal)

## Key URLs

| Route | Access | Description |
|-------|--------|-------------|
| `/signup` | public | Register a manager (store name + email + password) |
| `/login` | public | Sign in by role |
| `/admin/dashboard` | manager only | GM dashboard (ProtectedRoute blocks reps) |
| `/rep-portal/:token` | rep only | Isolated rep portal via unique access link |

## Getting Started (local)

```bash
npm install
cp .env.example .env.local   # fill Supabase URL + anon key
npm run dev                  # http://localhost:5173
```

Without `.env.local` values the app runs in **Zero-State Local Mode** (in-browser
persistence, no demo accounts or fake figures) so the full flow can be previewed.

## Supabase Setup (one-time)

1. Create a Supabase project.
2. Open **SQL Editor** and run the full contents of `supabase/schema.sql`.
   - Creates: `stores`, `users`, `trucks_inventory`, `customers`, `sales_transactions`,
     `transaction_items`, `rep_locations`, `daily_reconciliation`.
   - Row Level Security with strict rep isolation (validated).
   - Security-definer RPCs: `complete_manager_signup()`, `create_sales_rep()`.
   - `product-images` storage bucket + public-read policies.
   - Realtime publication for live syncing.
3. Copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into `.env.local`.

No seed data — the system starts fully empty (zero-state).

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | For Supabase mode | Project URL |
| `VITE_SUPABASE_ANON_KEY` | For Supabase mode | Anon/public key |

See `.env.example`.

## Vercel Deployment (24/7 hosting)

The repo is pre-configured for Vercel:

1. Push the repo to GitHub.
2. In Vercel, **Import Project** → point at the GitHub repo.
   - Framework Preset: **Vite** (auto-detected).
   - Build Command: `npm run build` — Output: `dist`.
   - `vercel.json` provides the SPA rewrite so `/admin/dashboard` and `/rep-portal/:token`
     deep links work in production.
3. Add environment variables in **Project → Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Every `git push` to the default branch auto-deploys.

## Repository Layout

```
src/
  App.tsx                 # Routes + ProtectedRoute/RepRoute guards + role redirects
  lib/
    store.tsx             # Auth, data, Realtime, Storage uploads, RPC calls
    local.ts              # Zero-state local backend (preview only)
    supabase.ts           # Supabase client init
    selectors.ts          # Computed joins + rep daily totals + latest locations
    image.ts              # Client-side image compression
  components/Invoice.tsx  # Digital invoice (html2canvas download + WhatsApp share)
  pages/
    auth/                 # Login, Signup
    manager/              # Dashboard, Reps, Invoices, LiveMap
    rep/                  # 4-tab mobile portal (Financials, Inventory, Customers, Sale)
supabase/
  schema.sql              # Full idempotent database schema + RLS + RPCs + Storage + Realtime
  seed.sql                # Intentionally empty (zero-state)
```
