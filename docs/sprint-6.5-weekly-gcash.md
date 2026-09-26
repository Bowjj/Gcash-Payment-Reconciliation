# Sprint 6.5 — weekly GCash re-upload

Status: COMPLETE locally. No migration, deployment, or Sprint 7 work.

## Implemented behavior

- Recognize `Matched Customer` and `Annotation Conflict` headers (case/spacing
  tolerant) independently of late/repeated statement headers. Transaction values
  and footer mentions are not treated as annotation-column declarations.
- Amount parsing uses recognized financial headers and retains the legacy
  unlabeled I/K fallback. Recognized annotation columns are excluded. Genuine
  two-populated-amount ambiguity and invalid amount values still fail validation.
- Reuse the leftmost existing Matched Customer column as a deterministic
  **location**, not as an arbitrary winner between conflicting values.
- Preserve an existing name when no current persisted relationship exists.
  Fill empty annotation cells only from persisted relationships mapped by
  worksheet/source row; export does not rematch records.
- Existing names do not enter the reconciliation engine or database matching
  inputs. Exact unique references remain authoritative; amounts remain irrelevant.
- A headerless workbook reuses an existing annotation header on re-upload rather
  than inserting another header row every week.

## Duplicate normalization and conflicts

Exactly one logical Matched Customer column remains per transaction worksheet.
Duplicate values are inspected per source row:

| Historical values | Canonical annotation |
| --- | --- |
| blank + Alice | Alice |
| Alice + Alice | Alice |
| Alice + Bob | `CONFLICT — see Annotation Conflict` |

All differing historical names are recorded in the Annotation Conflict note;
none is silently selected as correct. Duplicate column headers and values are
cleared after consolidation. Their physical column slots remain blank so that
original financial columns, source positions, formatting and references do not
shift. Other source columns are not removed or moved.

For a single historical Alice versus a current exact-reference Bob, Alice stays
in Matched Customer and the note records both Alice and Bob. Payment remains
VERIFIED if its exact unique reference relationship warrants it.

Annotation Conflict is added only when required or reused if already present.
Unresolved notes survive subsequent uploads. Repeating the same conflict does
not keep appending columns or duplicating the same message. A GCash download
returns a conflict-row count header; the download UI displays an amber warning
directing the user to the workbook's notes. Conflict notes also travel with the
workbook when used outside the application.

After explicitly reviewing a conflict, the operator can set the intended name in
the canonical Matched Customer cell and clear the corresponding conflict note
in the workbook before re-upload. A still-differing current relationship will
be flagged again. This is annotation review, not a change to reconciliation or
the existing manual-review audit semantics.

## Verification

Tests use sanitized in-memory fixtures and newly created isolated local test
accounts/workspaces. Existing user verification runs and source data were not
modified, deleted, or used as writable fixtures.

| Check | Result |
| --- | --- |
| Weekly re-upload safe (supported layouts) | YES |
| Exactly one logical Matched Customer column | PASS |
| Existing names preserved | PASS |
| Existing blanks receive new matches | PASS |
| Annotation excluded from amount parsing, including J/K | PASS |
| Valid transaction count preserved | PASS |
| Four-week export/re-upload cycle | PASS |
| Newly added transaction and source-row mapping | PASS |
| Duplicate annotation recovery | PASS |
| Annotation conflict detection and visible warning | PASS |
| Conflict does not change reference reconciliation | PASS |
| Payment 1300 / GCash 1299, same unique reference | VERIFIED |
| Leading-zero references | PASS |
| Payment output, original rows and status colors | PASS |
| Unit tests | PASS — 334/334, 24 files |
| TypeScript typecheck | PASS |
| Lint | PASS |
| Production build | PASS |
| Database/RLS | PASS — 193/193, 7 files |
| Full Playwright | PASS — 22/22 |

The new browser suite exercises four actual upload/persist/reconcile/export
cycles using each downloaded binary as the next input, including an additional
transaction in week three. Another browser test verifies Alice/Bob and duplicate
historical conflicts, the download warning, unchanged financial values, stable
subsequent export, and unchanged VERIFIED status. The warning screenshot was
reviewed after the passing suite.

## Files for this change

Added:
- `src/lib/gcash/annotations.ts`
- `src/lib/export/gcash-annotations.ts`
- `tests/fixtures/weekly-gcash.ts`
- `tests/unit/weekly-gcash.test.ts`
- `tests/e2e/weekly-gcash.spec.ts`
- This document.

Updated:
- `src/lib/gcash/parser.ts`
- `src/lib/gcash/row-parser.ts`
- `src/lib/export/verification-workbook.ts`
- `src/app/(app)/verification/[runId]/export/route.ts`
- `src/components/verification/download-excel-button.tsx`
- `docs/sprint-6.5-ui-polish.md`

Migrations added for this fix: NONE.

## Known limitations

- Redundant physical annotation-column slots remain blank intentionally; one
  logical named customer column remains. This protects financial column positions.
- Conflicts require explicit review; they are never silently auto-resolved.
- Merged annotation cells are rejected rather than unmerged or overwritten.
- Existing supported GCash financial layouts still apply; this is not a universal
  bank-statement parser. Unlabeled financial I/K columns remain supported, while
  recognized application annotations are always excluded.
- Earlier source-retention/legacy-XLS formatting limitations remain as documented
  in the main Sprint 6.5 report.

Critical issues found in the executed checks: NONE.
Ready to continue Sprint 6.5: YES, awaiting approval.
