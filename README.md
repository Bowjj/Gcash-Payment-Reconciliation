# Payment Reconciliation & Verification System

A production-quality web application for reconciling customer payment records against GCash transaction statements.

## Prerequisites

- **Node.js** 22.12 or later
- **pnpm** 12.x (project manages via `corepack`)
- **Docker Desktop** (required for local Supabase)
- **Supabase CLI** (`npm install -g supabase` or use `corepack pnpm exec supabase`)

## Quick Start

```bash
# 1. Install dependencies
corepack pnpm install

# 2. Copy environment file
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Start local Supabase (optional, for full functionality)
corepack pnpm exec supabase start

# 4. Apply database migrations
corepack pnpm exec supabase db reset

# 5. Run tests
corepack pnpm test

# 6. Start development server
corepack pnpm dev
```

## Supabase Project Setup

### Creating a New Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Publishable Key** (Settings → API)
3. Go to **Authentication → Providers** and enable Email/Password
4. Set **Site URL** to `http://localhost:3000` for local development
5. Add `http://localhost:3000` to **Redirect URLs**

### Applying Database Migrations

```bash
# Link to your remote project
corepack pnpm exec supabase link --project-ref your-project-ref

# Push migrations to remote
corepack pnpm exec supabase db push

# Or apply locally with Docker
corepack pnpm exec supabase db reset
```

### SQL Migrations to Apply

The following SQL must be applied to your Supabase database:

1. `supabase/migrations/00001_initial_schema.sql` — Creates:
   - `businesses` table (tenant workspaces)
   - `business_members` table (membership junction)
   - `verification_runs` table (placeholder for future reconciliation)
   - Row Level Security policies for all tables
   - `create_business(name)` RPC for atomic workspace creation
   - `private.member_role(business_id, user_id)` helper function

### Row Level Security Policies

The migration creates the following access rules:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| businesses | members | — (use RPC) | owner | owner |
| business_members | members | admin (non-owner) | admin (non-owner) | admin (non-owner) |
| verification_runs | members | member (queued only) | admin | admin |

## Running Tests

```bash
# Unit/integration tests (Vitest)
corepack pnpm test

# End-to-end tests (Playwright, requires running Supabase + app)
corepack pnpm exec supabase start
corepack pnpm exec supabase db reset
corepack pnpm build && corepack pnpm start &
corepack pnpm exec playwright test

# Or use the full E2E chain (after seed scripts are added)
corepack pnpm seed:e2e
corepack pnpm test:e2e
corepack pnpm cleanup:e2e
```

## Quality Gates

```bash
corepack pnpm typecheck    # Strict TypeScript
corepack pnpm lint         # ESLint with zero warnings
corepack pnpm test         # Vitest unit tests
corepack pnpm build        # Production build
```

## Deployment to Vercel

1. Push your code to a Git repository
2. Import the project in [vercel.com](https://vercel.com)
3. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable key
4. Deploy — Vercel auto-detects Next.js

### Vercel Environment Variables

| Variable | Environment | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | All | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All | Yes |
| `E2E_USER_A_EMAIL` | Preview only | No |
| `E2E_USER_A_PASSWORD` | Preview only | No |
| `E2E_USER_B_EMAIL` | Preview only | No |
| `E2E_USER_B_PASSWORD` | Preview only | No |

## Manual Testing Checklist (Sprint 1)

- [ ] Application starts without errors
- [ ] `/login` page renders with email/password form
- [ ] Login with valid credentials redirects to `/dashboard`
- [ ] Login with invalid credentials shows generic error
- [ ] `/dashboard` shows user email and workspace name
- [ ] Sidebar shows all four navigation links
- [ ] Clicking each nav link loads the correct page
- [ ] Sign out returns to `/login`
- [ ] Accessing `/dashboard` while logged out redirects to `/login`
- [ ] Desktop layout shows sidebar
- [ ] Mobile layout shows header with sign out
- [ ] No console errors during navigation
- [ ] Loading states appear briefly during navigation

## Known Limitations (Sprint 1)

- **No signup flow**: Users must be created via Supabase dashboard or API
- **No password reset**: Not implemented in Sprint 1
- **No workspace creation UI**: Workspaces created via SQL RPC only
- **No workspace switcher**: First accessible workspace is always active
- **Test harness incomplete**: Local E2E seed/cleanup scripts not yet implemented
- **No Git repository**: This directory is not initialized as a Git repo

## Sprint 2+ Exclusions

This foundation does **not** include:
- Excel spreadsheet uploads or imports
- Payment record processing
- GCash transaction import
- Payment reconciliation engine
- Manual verification workflow
- Excel report exports
- Main List integration
- Subscriptions or billing

## Tech Stack

- **Framework**: Next.js 16.3.5 (App Router, Turbopack)
- **Language**: TypeScript 5.9.3 (strict)
- **Styling**: Tailwind CSS 4.3.3
- **UI**: shadcn/ui (base-nova style)
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (@supabase/ssr)
- **Testing**: Vitest 5.0.1 + Playwright 1.63.0
- **Deployment**: Vercel
