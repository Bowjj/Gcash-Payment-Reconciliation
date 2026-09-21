---
slug: sprint-1-foundation
status: approved-bootstrap
intent: clear
review_required: false
pending-action: write .omo/plans/sprint-1-foundation.md
approach: Bootstrap a strict Next.js App Router application, establish Supabase SSR authentication and fail-closed multi-tenant data access, then add the authenticated shell, tests, and operator documentation without implementing any Sprint 2+ feature.
---

# Draft: sprint-1-foundation

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
foundation | Current stable Next.js/TypeScript/Tailwind/shadcn project with deterministic tooling | active | repository baseline and official Next.js research
database | Minimal businesses, memberships, and verification-runs schema with recursion-safe RLS | active | official Supabase RLS research
authentication | Supabase SSR login/logout/session refresh and protected routes | active | official Supabase SSR research
workspace-domain | Server-side membership lookup and active-workspace authorization | active | user Sprint 1 requirements
application-ui | Responsive authenticated shell, dashboard, placeholders, loading/error states | active | user Sprint 1 requirements
quality-and-operations | Unit/integration/E2E coverage, environment template, setup and migration docs | active | user completion requirements

## Open assumptions (announced defaults)
<!-- Record any default you adopt instead of asking, so the user can veto it at the gate. -->
package manager | pnpm with a committed lockfile | deterministic installs and official tooling support | yes
runtime | Node.js 22.12 or newer | satisfies current Next.js/Vitest/Playwright compatibility | yes
authentication | email/password login only; no signup/reset UI | user asked for login/logout, not account lifecycle UI | yes
workspace selection | first accessible membership is active; empty state when none | no workspace switcher was requested in Sprint 1 | yes
workspace creation | atomic SQL RPC exists, but no creation UI | secure schema bootstrap without inventing product UX | yes
testing | failing-first tests where seams exist, plus Playwright for server-component route behavior | matches production risk and framework limitations | yes

## Findings (cited - path:lines)

- Repository contains no product code, Git repository, package manifest, migration, or tests; only `.codegraph/` and `.omo/` tooling metadata exist.
- Current official guidance uses Next.js App Router, `proxy.ts` for Next.js 16 request interception, Tailwind CSS v4 CSS-first configuration, and explicit ESLint CLI execution.
- Current Supabase Next.js SSR guidance uses `@supabase/ssr`, request-scoped server clients, `createBrowserClient`, cookie refresh through Proxy, and `getClaims()`/`getUser()` rather than trusting `getSession()` for server authorization.
- RLS membership lookup must avoid recursive policies; use a narrowly granted `security definer` helper in a non-exposed schema with an empty search path.

## Decisions (with rationale)

- Use a `src/` layout and `@/*` alias to keep application boundaries explicit.
- Use only a publishable Supabase key in Sprint 1; do not configure or consume a secret/service-role key.
- Model roles as `owner`, `admin`, and `member`, but Sprint 1 ships no membership-management UI.
- Create workspaces atomically through a database RPC that inserts the business and owner membership in one transaction.
- Treat database RLS as the final authorization boundary and repeat membership authorization in server-side application helpers.
- Keep verification runs as foundation records only; no upload, processing, reconciliation, or export behavior is permitted.

## Scope IN

- Next.js application/tooling foundation, Supabase clients/auth, three-table migration and RLS, authenticated shell, dashboard/placeholders, loading/error states, tests, `.env.example`, and setup documentation.

## Scope OUT (Must NOT have)

- Excel uploads, payment/GCash importers, reconciliation, manual verification, exports, Main List integration, subscriptions, and billing.
- Payment, transaction, match, proof, audit-action, profile, subscription, invoice, or storage tables.
- Signup, password reset, invitations, workspace switcher/management UI, and verification-run processing.

## Open questions

None. The `/start-work` no-plan bootstrap constitutes approval; reversible internal defaults are recorded above.

## Approval gate
status: approved-bootstrap
Approved by the user's explicit `/start-work` invocation and “Begin Sprint 1 only” instruction. Next action: execute `.omo/plans/sprint-1-foundation.md` and stop after Sprint 1 reporting.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
