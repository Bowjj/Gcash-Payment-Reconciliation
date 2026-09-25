# Sprint 6 Excel report

## Download and authorization

Completed verification results offer **Download Excel Report**. The Node.js GET
route `/verification/[runId]/export` uses the existing authenticated active-workspace
authorization, then calls `get_verification_export` with that workspace and run.
The RPC independently checks membership and completed-run ownership, and retains
RLS. No service-role client is used to export. Responses are private and non-cacheable.

The RPC reads one consistent snapshot of sources, latest manual decisions and
summary counts. It returns the full selected run rather than the results page's
25-row page or the upload preview. Export fails if any persisted payment lacks a
reconciliation result. Workbook generation never runs matching logic.

## Workbook layout

The seven sheets are Summary, All Payments, Verified, Needs Review, Cash, Bank,
and GCash Transactions. Empty categories retain headers. Primary counts and
category sheets use effective status. Payment details retain automated status,
reason, manual decision/note, reviewer, review timestamp, proof and matched
transaction information.

GCash Transactions places **Source Worksheet** and **Source Row** first, followed
by original source columns, then **Matched Customer** at the far right. Rows retain
persisted source order. Multiple worksheets are combined with their worksheet
identity intact; differing column layouts are combined in first-seen order.
Columns with originally blank headers are labeled `Column N`.

Only persisted automatic payment/transaction relationships supply a customer.
Manual status-only verification never creates a GCash link. Unmatched and
ambiguous GCash transactions remain present with blank customer cells. Amounts
do not affect matching or customer association.

## Source fidelity

New GCash imports retain displayed source cells, original header labels and the
reference-column position in existing JSON source metadata. This is additive
provenance capture; SheetJS import parsing and validation decisions are unchanged.

Earlier imports retained selected fields (date, description, reference, debit,
credit) or a combined `col0` transaction string. Exports preserve those available
fields and cannot reconstruct missing historical columns, original styles,
merged cells, balance/footer rows, or rows excluded by import validation. A legacy
combined transaction string is kept intact. Reports are not binary copies of the
original workbook. ExcelJS is used only for export; SheetJS remains the importer.
Rows predating worksheet/order metadata use persisted source-row order and label
the worksheet identity as unavailable rather than inventing that provenance.

## Safety and limits

- References and identifier-like source fields are explicit text cells with `@`
  formatting. Normalized references preserve supported leading zeros.
- Imported text has XML-illegal controls removed and formula-leading text escaped.
  No source value is passed as an Excel formula object.
- Money uses the existing deterministic centavo parser and decimal formatter.
  Numeric values have two decimal places. Amounts beyond Excel's reliable
  15-digit precision are retained as exact decimal text.
- Valid normalized dates become Excel dates; timestamps are labeled UTC. Invalid
  or absent dates remain blank. When preserved source dates expose an invalid
  calendar date, export does not reproduce a normalized rolled-over date.
  Original GCash date display text remains preserved in its source column.
- Only validated HTTP/HTTPS proof URLs become hyperlinks. No proof is fetched or
  embedded. Invalid proof links remain blank.
- Filenames use a single unambiguous sanitized billing period, otherwise the run
  date (or a safe short run identifier).
- Synchronous limits: 20,000 combined source rows, 32 MiB snapshot data, 500,000
  report cells, 128 columns per original source layout, 256 combined GCash source
  columns, and Excel's 32,767-character text-cell limit. Exceeding a limit returns
  an error, never a silently truncated report.

## QA

Tests cover workbook generation/serialization, all categories, source metadata,
manual vs automatic decisions, money, identifiers, formula injection, scope
checks, and browser downloads. The E2E workbook artifact is saved under
`test-results/export-Excel-report-*/Payment_Verification_Sep_2026.xlsx`.

Microsoft Excel 16.0 was used through read-only COM automation with macros and
link updates disabled. It opened the generated E2E workbook and confirmed seven
sheets, reference `0045276500984` as a string, Payment 1300, GCash 1299, VERIFIED,
and Jake Tirana in the far-right Matched Customer cell. No formula cells were
present and invalid proof hyperlinks were absent. Summary and GCash worksheets
were rendered by Excel into temporary PDFs and inspected for counts, source
columns, ordering and the far-right customer. This is an actual Excel open/read
and rendered-output check, not an interactive Excel UI test. Google Sheets testing
is not performed.

Excel export is Sprint 6 only. No Main List integration, billing, or subscriptions
are included.
