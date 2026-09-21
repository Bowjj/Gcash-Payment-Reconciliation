# sprint-1-foundation - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A secure, production-oriented application foundation with login/logout, protected pages, workspace-aware access, an authenticated business dashboard, and the initial database security model.

**Why this approach:** Authentication is handled by Supabase rather than duplicated locally, while both server checks and database row-level security enforce workspace isolation. The schema and UI remain deliberately minimal so later payment features can be added without leaking into Sprint 1.

**What it will NOT do:** It will not upload spreadsheets, import payments or GCash statements, reconcile or manually verify payments, export reports, integrate a Main List, or add subscriptions and billing.

**Effort:** Large
**Risk:** High - authentication cookies and multi-tenant RLS must fail closed across browser, server, and database boundaries.
**Decisions to sanity-check:** Email/password login only; users without a membership receive a clear empty state; workspace creation is an SQL RPC without a Sprint 1 creation UI.

Your next move: Execute this approved Sprint 1 plan through the active `/start-work` session. Full execution detail follows below.

---

> TL;DR (machine): Large/high-risk foundation: strict Next.js app, Supabase SSR auth, tenant schema/RLS, protected shell/dashboard, tests, and operator docs; no Sprint 2+ behavior.

## Scope
### Must have
- Current stable Next.js App Router project under `src/`, strict TypeScript, Tailwind CSS v4, ESLint, pnpm lockfile, and only required shadcn/ui primitives.
- Supabase browser/server clients using `@supabase/ssr`, validated public environment variables, cookie refresh proxy, login/logout, and server-protected application routes.
- One SQL migration defining `businesses`, `business_members`, and `verification_runs`, constrained enums/columns/indexes/timestamps, atomic workspace creation, and recursion-safe RLS.
- Server-side workspace authorization helper and dashboard active-workspace resolution that never trusts a client-provided business ID.
- Responsive application shell with Dashboard, New Verification, History, and Settings navigation; dashboard user/workspace context, CTA, and recent-runs placeholder; placeholder pages for all required routes.
- Segment loading/error boundaries, accessible authentication errors, automated unit/integration/E2E tests, `.env.example`, and exact local/Supabase/migration documentation.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No ExcelJS, upload forms/endpoints, payment or GCash models, import/parsing logic, reconciliation, manual verification, proof handling, report/export logic, Main List integration, subscriptions, or billing.
- No duplicate password/user table, service-role or secret key in browser code, authorization based only on hidden UI, or direct trust in client business IDs/user metadata.
- No speculative payment-era abstractions, APIs, background workers, persistent local storage, or unrelated dependencies.
- Do not initialize Git or create commits unless separately authorized; this directory has no Git repository.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for domain/auth helpers with Vitest + Testing Library; SQL policy tests with Supabase pgTAP where local Docker is available; Playwright for protected-route/login/navigation critical flows and async server-component behavior.
- Evidence: <attemptDir>/task-<N>-sprint-1-foundation.<ext> (attemptDir = currentAttemptDir from 'omo ulw-loop status --json', .omo/evidence/ulw/<session>/<goalId>/a<attempt>; outside ulw-loop use .omo/evidence/)

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.
Wave 1: Todo 1 (foundation bootstrap; named dependency for every product task).
Wave 2: Todos 2, 3, and 4 in parallel after tooling exists (database, Supabase boundary, test harness).
Wave 3: Todo 5 after 2+3 (authentication, authorization, and protected route-group ownership).
Wave 4: Todo 6 after 5 (application shell/page ownership), then Todo 7 after 4+6, then Todo 8 after all implementation tasks.
Final wave: F1-F4 in parallel after Todo 8.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2-8 | none |
| 2 | 1 | 5, 7, 8 | 3, 4 |
| 3 | 1 | 5, 6, 7, 8 | 2, 4 |
| 4 | 1 | 7, 8 | 2, 3 |
| 5 | 2, 3 | 6, 7, 8 | none |
| 6 | 5 | 7, 8 | none |
| 7 | 4, 5, 6 | 8 | none |
| 8 | 2-7 | final wave | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Bootstrap the strict Next.js application and deterministic tooling
  What to do / Must NOT do: Create the current stable Next.js App Router app in the existing root using pnpm, `src/`, strict TypeScript, Tailwind CSS v4, ESLint, Node `>=22.12`, and `@/*`; add only the shadcn/ui primitives required by Sprint 1 and scripts for `dev`, `build`, `start`, `lint`, `typecheck`, `test`, and `test:e2e`. Preserve `.codegraph/` and `.omo/`; do not initialize Git, add Sprint 2 packages, or accept generated demo UI as final product behavior.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2-8
  References (executor has NO interview context - be exhaustive): empty repository baseline; https://nextjs.org/docs/app/getting-started/installation; https://tailwindcss.com/docs/installation/framework-guides/nextjs; https://ui.shadcn.com/docs/installation/next
  Acceptance criteria (agent-executable): `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm build` exit 0; `tsconfig.json` has `strict: true`; package/lock files contain no ExcelJS or out-of-scope dependency.
  QA scenarios (name the exact tool + invocation): happy—worker runs `pnpm dev`, then `curl -I http://localhost:3000` and records an HTTP response; failure—run `pnpm typecheck` against strict configuration and prove no implicit-any bypasses or `@ts-ignore`; Evidence `.omo/evidence/task-1-sprint-1-foundation.txt`.
  Commit: N | repository is not initialized as Git

- [x] 2. Add the Sprint 1 Supabase schema, atomic workspace bootstrap, and fail-closed RLS
  What to do / Must NOT do: Add `supabase/config.toml`, a single ordered migration under `supabase/migrations/`, and pgTAP policy tests under `supabase/tests/database/`. Define only `businesses`, `business_members`, `verification_runs`; roles `owner/admin/member`; minimal run lifecycle suitable for placeholders; UUID keys, constraints, FK actions, timestamps, update triggers, and query indexes. Put recursion-safe membership helpers in a non-exposed `private` schema as tightly granted `security definer` functions with `search_path=''`. Add atomic `create_business(name)` using `auth.uid()`. Enable RLS on every public table and explicitly test anonymous, non-member, cross-business member, member, admin, and owner permissions. Ordinary clients must not mutate immutable ownership/tenant keys or privileged run state.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 7, 8
  References (executor has NO interview context - be exhaustive): https://supabase.com/docs/guides/database/postgres/row-level-security; https://supabase.com/docs/guides/auth/managing-user-data; planner RLS finding in `.omo/drafts/sprint-1-foundation.md`; user requirements 5-7
  Acceptance criteria (agent-executable): `pnpm exec supabase db reset` and `pnpm exec supabase test db` exit 0 when Docker is available; SQL tests prove Business A cannot select/update/delete Business B data, anonymous access is denied, members can read their own business/runs, and only authorized roles perform allowed writes; migration contains no payment/Sprint 2 table.
  QA scenarios (name the exact tool + invocation): happy—Supabase CLI SQL creates two users/workspaces and shows each user only its own rows; failure—impersonate user A and query user B’s business UUID, expecting zero rows/permission denial; Evidence `.omo/evidence/task-2-sprint-1-foundation.txt`.
  Commit: N | repository is not initialized as Git

- [x] 3. Implement validated Supabase browser/server boundaries and session-refresh proxy
  What to do / Must NOT do: Add Zod-backed public environment parsing, `src/lib/supabase/client.ts`, `server.ts`, and request-specific proxy/session-refresh utilities following current `@supabase/ssr` APIs and Next.js 16 `proxy.ts`. Preserve refreshed request and response cookies. Add focused tests using dependency seams rather than network calls. Never create a module-scoped server client, expose a secret/service-role key, authorize with untrusted `getSession()`, or cache authenticated responses.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5, 6, 7, 8
  References (executor has NO interview context - be exhaustive): https://supabase.com/docs/guides/auth/server-side/creating-a-client; https://supabase.com/docs/guides/auth/server-side/advanced-guide; https://nextjs.org/docs/app/api-reference/file-conventions/proxy; `.omo/drafts/sprint-1-foundation.md`
  Acceptance criteria (agent-executable): Vitest proves invalid/missing URL or publishable key fails with a safe configuration error; server client is request-scoped; proxy tests prove refreshed cookies are copied to the outgoing response; static search finds no `service_role`, `SUPABASE_SECRET_KEY`, or browser import of server-only modules.
  QA scenarios (name the exact tool + invocation): happy—start app with syntactically valid local public values and `curl -I /login` returns without leaking secrets; failure—start/build a validation probe with missing `NEXT_PUBLIC_SUPABASE_URL` and assert a safe non-secret error; Evidence `.omo/evidence/task-3-sprint-1-foundation.txt`.
  Commit: N | repository is not initialized as Git

- [x] 4. Configure Vitest, Testing Library, and Playwright quality harnesses
  What to do / Must NOT do: Add version-compatible Vitest/jsdom/React Testing Library setup, Playwright configuration against a production build, deterministic test scripts, ignored evidence/output paths, and reusable non-secret Supabase test-environment seams. Do not attempt to unit-test async Server Components in Vitest; reserve those flows for Playwright.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): https://nextjs.org/docs/app/guides/testing/vitest; https://nextjs.org/docs/app/guides/testing/playwright; https://playwright.dev/docs/test-webserver
  Acceptance criteria (agent-executable): a meaningful smoke test passes under `pnpm test`; `pnpm exec playwright test --list` discovers Sprint 1 projects/tests; configs honor the `@/*` alias and production server command.
  QA scenarios (name the exact tool + invocation): happy—`pnpm test` executes an assertion and Playwright lists tests; failure—invoke an intentionally unmatched Playwright grep and record nonzero/no-tests behavior without changing production code; Evidence `.omo/evidence/task-4-sprint-1-foundation.txt`.
  Commit: N | repository is not initialized as Git

- [x] 5. Implement login, logout, protected routes, and workspace authorization services
  What to do / Must NOT do: Create `/login` with accessible email/password inputs, safe generic errors, pending state, password sign-in, and authenticated redirect; add logout as a server action; protect `/dashboard`, `/verification/new`, `/history`, and `/settings` in the app layout using a verified server identity. Add a focused data-access/domain layer that resolves memberships from the authenticated user and validates workspace access server-side; redirect unauthenticated users to `/login` with a safe relative return path. Add unit/integration tests first for auth helper outcomes, open-redirect rejection, unauthenticated redirects, empty membership, and cross-business denial. Do not add signup/reset/invitations or trust a client user/business ID.
  Parallelization: Wave 3 | Blocked by: 2, 3 | Blocks: 6, 7, 8
  References (executor has NO interview context - be exhaustive): https://nextjs.org/docs/app/guides/authentication; https://supabase.com/docs/guides/auth/passwords; required routes in user Sprint 1; schema/RLS from Todo 2
  Acceptance criteria (agent-executable): Vitest tests verify valid sign-in redirect, generic invalid-credential response, sanitized return path, protected-route redirect, logout, membership/no-membership outcomes, and Business A denial for Business B; server code uses validated auth claims/user plus RLS-backed membership lookup.
  QA scenarios (name the exact tool + invocation): happy—Playwright signs in a seeded user, reaches `/dashboard`, logs out, then receives `/login`; failure—anonymous `curl -I /settings` redirects to login and a malicious `next=https://evil.example` never redirects off-origin; Evidence `.omo/evidence/task-5-sprint-1-foundation.txt` and `.png`.
  Commit: N | repository is not initialized as Git

- [x] 6. Build the responsive application shell, dashboard, placeholders, and route states
  What to do / Must NOT do: Starting from Todo 5's protected `(app)` route-group layout, use the `frontend-design` skill and selected shadcn primitives to create a professional business-tool shell with desktop sidebar and responsive mobile navigation for Dashboard, New Verification, History, and Settings. Todo 6 exclusively owns the final `(app)/layout.tsx`, dashboard/page components, navigation components, and route-state files; Todo 5 must not continue editing them after handoff. Dashboard must show product title, authenticated user basics, active workspace or actionable no-membership state, New Verification link, and Recent Verification Runs placeholder. Add `/verification/new`, `/history`, `/settings`, `loading.tsx`, route/global `error.tsx`, not-found behavior, active navigation semantics, keyboard/focus accessibility, and safe empty states. Placeholder pages must explicitly say the feature is not yet available; no upload controls or fake reconciliation data.
  Parallelization: Wave 4 | Blocked by: 5 | Blocks: 7, 8
  References (executor has NO interview context - be exhaustive): user Sprint 1 requirements 8-11; https://nextjs.org/docs/app/getting-started/error-handling; https://nextjs.org/docs/app/getting-started/layouts-and-pages
  Acceptance criteria (agent-executable): Testing Library checks navigation labels/links, dashboard content, workspace empty state, and error fallback reset affordance; strict typecheck and lint pass; no prohibited feature terms/components appear except explicit “not implemented” copy/docs.
  QA scenarios (name the exact tool + invocation): happy—Playwright at desktop and mobile widths traverses all four nav entries and captures dashboard screenshots; failure—inject the test-only error seam and verify `error.tsx` renders a recovery action without stack/secret disclosure; Evidence `.omo/evidence/task-6-sprint-1-foundation-desktop.png`, `-mobile.png`, and `.txt`.
  Commit: N | repository is not initialized as Git

- [x] 7. Add critical authenticated E2E and authorization regression coverage
  What to do / Must NOT do: Add local-only `scripts/seed-e2e.mjs` and cleanup companions that read the ephemeral local admin key from `pnpm exec supabase status -o env` (never from browser/app code and never commit the value), call the local Auth admin API to idempotently create two deterministic users from ignored `E2E_USER_A_*`/`E2E_USER_B_*` values, and invoke normal SQL/RPC paths to create isolated workspaces/memberships. Add Playwright projects/fixtures that invoke reset → seed → tests → cleanup, never commit storage state or secrets, and fail clearly when local Supabase is unavailable. Cover unauthenticated redirects for every protected route, login failure/success/logout, desktop/mobile navigation, no-workspace dashboard, workspace dashboard, and cross-workspace denial. Use stable role/label selectors and capture traces/screenshots on failure. Tests must be independently repeatable and cleanup only records/users carrying the test namespace.
  Parallelization: Wave 4 | Blocked by: 4, 5, 6 | Blocks: 8
  References (executor has NO interview context - be exhaustive): https://playwright.dev/docs/auth; user completion requirement 12; Todo 2 authorization matrix; Todo 5 route contract
  Acceptance criteria (agent-executable): `pnpm exec supabase start && pnpm exec supabase db reset && pnpm seed:e2e && pnpm build && pnpm test:e2e && pnpm cleanup:e2e` exits 0; running the same sequence twice is idempotent; tests assert final URLs and visible user/workspace identity, not only status codes; secret scan confirms the emitted local admin key and Playwright storage state are ignored and absent from source/evidence.
  QA scenarios (name the exact tool + invocation): happy—run the exact reset/seed/build/Chromium/cleanup chain and verify both users see only their own workspace; failure—run `pnpm seed:e2e` with Supabase stopped and expect a concise non-secret failure, then attempt protected routes without cookies and Business B access as Business A, expecting login redirect/denial with no leaked business name; Evidence `.omo/evidence/task-7-sprint-1-foundation/`.
  Commit: N | repository is not initialized as Git

- [x] 8. Finalize environment contract and exact Sprint 1 operating documentation
  What to do / Must NOT do: Add `.env.example` with placeholders for public URL/publishable key and isolated E2E user credentials only; ensure real env files/secrets/test auth state are ignored. Write README sections for prerequisites, exact pnpm commands, local run, Supabase project creation, Auth email/password settings and redirect URLs, CLI linking/local Docker option, ordered migration/policy application, deterministic local E2E reset/seed/cleanup, tests/typecheck/lint/build, Vercel variables, troubleshooting, manual Sprint 1 checklist, known limitations, and explicit Sprint 2 exclusions. Document that deployed Sprint 1 application code requires no secret/service-role key; the local-only seed script obtains an ephemeral local admin key from the Supabase CLI and must never be used in browser/deployment code.
  Parallelization: Wave 4 | Blocked by: 2-7 | Blocks: final wave
  References (executor has NO interview context - be exhaustive): user completion requirements 1-11; https://supabase.com/docs/guides/cli/local-development; https://vercel.com/docs/frameworks/full-stack/nextjs; actual scripts and migration produced by Todos 1-7
  Acceptance criteria (agent-executable): a clean-shell setup review can follow README commands without unstated values; `.env.example` contains no secret-shaped values; every required migration filename and command is named; docs include all requested manual checks and known limitations and no claim that Sprint 2 exists.
  QA scenarios (name the exact tool + invocation): happy—copy `.env.example` to a temporary ignored file, substitute local public values, and run documented verification commands; failure—secret scanner/grep confirms no service-role/secret key or real credential in source/docs; Evidence `.omo/evidence/task-8-sprint-1-foundation.txt`.
  Commit: N | repository is not initialized as Git

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [x] F1. Plan compliance audit
  Reviewer: independent read-only reviewer runs `pnpm test && pnpm typecheck && pnpm lint && pnpm build`, maps every Sprint 1 requirement/exclusion to exact changed files and `.omo/evidence/task-*`, searches for prohibited Sprint 2 modules/dependencies, and writes `APPROVE` or `REJECT: <requirement + evidence>` to `.omo/evidence/final-f1-plan-compliance.txt`.
- [x] F2. Code quality review
  Reviewer: independent reviewer reads every product/migration/test file, runs `pnpm typecheck && pnpm lint && pnpm test`, checks strict typing, server/client imports, dependency necessity, safe errors, auth-cookie response preservation, secret-key absence, SQL security-definer search paths/grants and RLS operation coverage, then writes `APPROVE` or actionable `REJECT` to `.omo/evidence/final-f2-code-quality.txt`.
- [x] F3. Real manual QA
  Reviewer: independent QA worker runs `pnpm exec supabase start`, `pnpm exec supabase db reset`, `pnpm seed:e2e`, `pnpm build`, and the production server; drives Chromium with Playwright at 1440×900 and 390×844 through invalid login, valid login, all four nav routes, logout, anonymous protected-route redirect, no-workspace state, error recovery, and Business A→B denial; requires zero browser console errors/secret disclosure; saves screenshots/trace plus `APPROVE` or `REJECT` under `.omo/evidence/final-f3-manual-qa/`, then runs `pnpm cleanup:e2e` and stops app/Supabase processes.
- [x] F4. Scope fidelity
  Reviewer: independent reviewer runs `pnpm why exceljs`, allowing the expected nonzero “not installed” result, inspects `package.json`, migration table declarations, routes/actions and `.env.example`, and executes the cross-workspace pgTAP/Playwright denial tests; it must prove there is no upload/import/reconciliation/export/Main List/subscription/billing implementation, duplicate credential store, committed secret, client service-role use, or undocumented dependency, then writes `APPROVE` or `REJECT` to `.omo/evidence/final-f4-scope-fidelity.txt`.

## Commit strategy
No commits in this sprint because the supplied directory is not a Git repository and the user did not authorize repository initialization. Preserve a clean, deterministic pnpm lockfile and report this limitation.

## Success criteria
- `pnpm test` succeeds.
- `pnpm typecheck` succeeds with strict TypeScript.
- `pnpm lint` succeeds.
- `pnpm build` succeeds.
- `pnpm exec supabase db reset && pnpm exec supabase test db` succeeds when Docker/local Supabase is available; otherwise the exact environmental blocker is reported and SQL remains independently reviewed.
- `pnpm test:e2e` succeeds against configured test Supabase credentials; never weaken tests to pass without authentication.
- Independent F1-F4 reviewers all return APPROVE.
- Final report gives exact setup, Supabase configuration, migration/policy application, manual checklist, verification results, known limitations, and explicitly stops before Sprint 2.
