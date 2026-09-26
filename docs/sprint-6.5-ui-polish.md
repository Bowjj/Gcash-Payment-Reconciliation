# Sprint 6.5 - Final local report

Status: COMPLETE. Date: September 26, 2026. No deployment. Sprint 7 has not
started. Changes remain local and uncommitted.

Weekly GCash re-upload is now supported with a single reusable customer column,
preserved historical names, duplicate recovery, and visible annotation conflicts.
See [the weekly re-upload report](sprint-6.5-weekly-gcash.md) for the policy and
additional test evidence.

## Regression gates

| Gate | Result |
| --- | --- |
| Unit tests | PASS - 334/334 across 24 files |
| TypeScript typecheck | PASS |
| ESLint, zero warnings | PASS |
| Production build | PASS |
| Database/RLS pgTAP tests | PASS - 193/193 across 7 files |
| Full Playwright browser suite | PASS - 22/22 |

## Two-file export

Sprint 6.5 replaces the old Summary/All Payments/Verified/Needs Review/Cash/
Bank/GCash Transactions multi-sheet report. Results now show exactly two download
actions:

| Source | Output | Annotation |
| --- | --- | --- |
| `Payment Testing.xlsx` | `Payment Testing - Verified.xlsx` | `Verification Status`, `Verification Note` at far right |
| `Gcash Testing.xlsx` | `Gcash Testing - Matched.xlsx` | `Matched Customer` at far right |

New imports retain the original Payment and GCash workbook binaries in
`verification_source_workbooks`, atomically with parsed source rows, through
`00010_source_workbooks.sql`. Exports annotate the retained source workbook using
persisted source row IDs/positions and persisted final results. They never rematch
by customer, amount, date, or reference during export.

Original sheet names/order, original columns/order, rows/order, blank rows,
non-transaction content, merges, dimensions, freeze panes, displayed formats and
safe hyperlinks are preserved where ExcelJS supports them. Original formulas are
frozen to their cached value, rather than exported as executable formulas. New
status/note/customer cells use formula-safe text. Unsafe source hyperlinks are
retained as plain text rather than live links.

| Requirement | Result |
| --- | --- |
| TWO-FILE EXPORT | PASS |
| PAYMENT SOURCE STRUCTURE PRESERVED (new runs) | PASS |
| PAYMENT ORIGINAL VALUES PRESERVED | PASS |
| PAYMENT VERIFICATION STATUS / NOTE | PASS / PASS |
| VERIFIED GREEN / NEEDS REVIEW RED / CASH BLUE / BANK YELLOW | PASS / PASS / PASS / PASS |
| GCASH SOURCE STRUCTURE / VALUES PRESERVED (new runs) | PASS / PASS |
| GCASH MATCHED CUSTOMER / FAR RIGHT | PASS / PASS |
| 1300 PAYMENT <-> 1299 GCASH | VERIFIED |
| LEADING ZERO REFERENCES | PASS |
| UNMATCHED GCASH PRESERVED | PASS |
| DUPLICATES NOT GUESSED | PASS |
| MANUAL-ONLY VERIFIED DOES NOT FABRICATE GCASH MATCH | PASS |
| FORMULA-INJECTION / HYPERLINK PROTECTION | PASS |
| CROSS-WORKSPACE EXPORT PROTECTION | PASS |
| OLD MULTI-SHEET REPORT REMOVED | YES |

Status cells show text as well as color. Notes use spreadsheet language such as
`Exact reference found`, `Reference not found`, `Missing reference`, `Duplicate
reference`, `Cash payment`, or `Bank payment`. A manual decision keeps its final
status and states that it was manually marked; it never invents a GCash link.

Known limitation: runs created before Sprint 6.5 have no retained source binary.
Their two exports use a clearly identified recovered-row fallback based on stored
imported fields and source positions. Original styling, skipped/unimported content,
and exact original workbook layout cannot be fabricated. New runs retain source
workbooks. Google Sheets and interactive Excel manual QA remain deferred; XLSX
round-trip tests pass.

## History and dashboard

History **All** now includes queued, processing, failed and completed runs. This
fixes the prior mismatch where deleting everything visible in completed-only
History could leave queued runs on Dashboard. Needs Attention and No Outstanding
Review remain completed-result filters. Successful History deletion updates
History and Dashboard; a new E2E test deletes all mixed-status runs and verifies
the Dashboard empty state after refresh.

| Requirement | Result |
| --- | --- |
| DELETE VERIFICATION RUN / CONFIRMATION / CANCEL | PASS / PASS / PASS |
| OWNER/ADMIN DELETE / READ-ONLY PROTECTION | PASS / PASS |
| CROSS-WORKSPACE DELETE PROTECTION | PASS |
| RUN-OWNED PAYMENT / GCASH / MATCH / AUDIT CLEANUP | PASS |
| OTHER RUNS / WORKSPACE / MEMBERSHIPS PRESERVED | PASS |
| DELETED RESULTS URL / EXPORT PROTECTION | PASS |
| DASHBOARD / HISTORY UPDATE AFTER DELETE | PASS |
| PERSISTENT DESKTOP SIDEBAR / HISTORY SCROLL | PASS |
| SIDEBAR DARK MODE / ACTIVE NAVIGATION | PASS |
| TABLET LAYOUT / MOBILE NAVIGATION | PASS |
| SIDEBAR SCROLL ACCEPTANCE (browser-driven) | PASS |

Delete is intentionally understated: a quiet trash-icon action next to View
Results, then a compact destructive confirmation. It is distinct from workspace
deletion. The desktop sidebar remains visible through a browser-driven History
scroll beyond 2,000px, then navigates to Dashboard and New Verification without
scrolling back.

## Settings workspace deletion

Settings has a separate owner-only Danger Zone for the currently active workspace.
Delete Workspace opens a two-step accessible Base UI alert dialog. The first step
states scope; the second requires an exact case- and whitespace-sensitive workspace
name before `Delete Workspace Permanently` enables. Cancel/Escape, wrong names,
stale IDs, concurrent rename, role revocation and forged IDs delete nothing.

The authenticated server client performs a scoped `DELETE id + name` under
existing owner RLS. Existing workspace cascades delete memberships, runs,
Payment/GCash rows, matches, review audit, and source workbooks; they do not
delete auth users or other workspaces. The active-workspace cookie is cleared then
set to the ordinary deterministic first remaining membership. Last-workspace
deletion retains authentication and returns to Create Workspace onboarding.

| Requirement | Result |
| --- | --- |
| SETTINGS DANGER ZONE / DELETE WORKSPACE | PASS / PASS |
| WORKSPACE NAME CONFIRMATION / CANCEL | PASS / PASS |
| OWNER AUTHORIZATION / MEMBER PROTECTION | PASS / PASS |
| CROSS-WORKSPACE DELETE PROTECTION | PASS |
| USER ACCOUNT / OTHER WORKSPACES / OTHER DATA PRESERVED | PASS |
| WORKSPACE RUN / PAYMENT / GCASH / MATCH / AUDIT CLEANUP | PASS |
| SOURCE-WORKBOOK CLEANUP / ORPHAN CHECK | PASS / PASS |
| ACTIVE WORKSPACE CLEANUP / REMAINING SELECTION | PASS / PASS |
| LAST WORKSPACE ONBOARDING | PASS |
| DARK MODE DANGER ZONE / MOBILE DIALOG | PASS / PASS |

## Earlier Sprint 6.5 requirements retained

| Requirement | Result |
| --- | --- |
| Light/dark icon toggle, System default, persistence, keyboard use | PASS |
| Dashboard recent runs and View Results | PASS |
| History grouped counts, filtering/search, empty states, responsive layout | PASS |
| Exact-reference reconciliation, 1300/1299 rule | PASS |
| Manual review/effective status/audit | PASS |
| Workspace switching, import, results and export regression | PASS |

## Files and migrations

- Migration added: `supabase/migrations/00010_source_workbooks.sql`.
- New source/export code: `src/lib/export/source-workbook.ts`, revised
  `verification-workbook.ts`, two-file export route/UI.
- New workspace deletion code: `src/app/(app)/settings/delete-workspace-action.ts`,
  `src/components/workspace/delete-workspace-dialog.tsx`.
- New test suites: source-workbook/workspace pgTAP, workspace delete E2E, expanded
  export E2E/unit coverage, mixed-status History cleanup coverage.
- Security issues found by executed checks: NONE.
