# Sprint 7A Security Hardening

Sprint 7A hardens local development before any cloud or Vercel work. Migration
`00011_remove_direct_update_access.sql` is local-only in this sprint.

## Workbook policy

Production uploads accept `.xlsx` only. Legacy `.xls` is rejected before
parsing because the previous SheetJS dependency was removed after published
high-severity advisories. ExcelJS handles both XLSX import and source-style
export. The upload guard enforces a per-file 10 MiB limit and validates XLSX
ZIP structure before ExcelJS loads it.

The parser compatibility tests cover worksheet/source-row identity, headers,
formatted leading-zero references, dates, money, hyperlinks, blank cells,
late/repeated/headerless GCash layouts, annotations, conflicts, weekly
re-upload, and source-style exports.

## Tenant updates

Application mutations use scoped RPCs. Direct table UPDATE access was not a
supported product behavior and is revoked by migration 00011. Database attack
tests cover cross-workspace membership/run/payment/GCash reassignment and
same-workspace source tampering.

## Operational rules

- Do not apply migration 00011 to cloud until Sprint 7 Gate B approves the
  target and forward-only migration plan.
- Do not commit `.env` files, generated signing keys, workbooks, or exports.
- Do not reset or seed cloud Supabase.
