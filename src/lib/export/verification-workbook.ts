import ExcelJS from "exceljs";
import { dateCell, excelDate, moneyCell, proofCell, sourceCheckedDate, textCell } from "./cells";
import { type ExportData, type ExportPayment, ExportLimitError, MAX_EXPORT_CELLS, MAX_EXPORT_ROWS } from "./export-data";
import { gcashSource, type SourceColumn } from "./gcash-source";

export const PAYMENT_HEADERS = ["Customer", "Account", "Billing Period", "Amount", "Method", "Reference #", "Payment Date", "Notes", "Paid By", "Received By", "Photo / Proof", "Created At", "Automated Status", "Automated Reason", "Final Status", "Manual Review", "Manual Note", "Reviewed By", "Reviewed At (UTC)", "Matched GCash Reference", "Matched GCash Amount"];
export const REQUIRED_SHEETS = ["Summary", "All Payments", "Verified", "Needs Review", "Cash", "Bank", "GCash Transactions"];
const fills: Record<string, string> = { VERIFIED: "FFDCFCE7", NEEDS_REVIEW: "FFFFEDD5", CASH: "FFF3F4F6", BANK: "FFDBEAFE" };

export function exportFilename(data: ExportData) {
  const periods = new Set(data.payments.map((p) => p.billing_period?.trim() ?? ""));
  const period = periods.size === 1 ? [...periods][0] : "";
  const sanitized = period?.normalize("NFKC").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  const date = excelDate(data.run.completed_at ?? data.run.created_at);
  const fallback = date ? date.toISOString().slice(0, 10) : data.run.id.replace(/[^a-f0-9]/gi, "").slice(0, 8);
  return `Payment_Verification_${sanitized || fallback || "Report"}.xlsx`;
}

function prepareSheet(book: ExcelJS.Workbook, name: string, headers: string[]) {
  const sheet = book.addWorksheet(name);
  const row = sheet.addRow([]);
  headers.forEach((header, index) => textCell(row.getCell(index + 1), header));
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243746" } };
  row.height = 32;
  row.alignment = { vertical: "middle", wrapText: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = /Notes|Description|Reason|Proof|Customer|transaction text/.test(header) ? 34 : 23;
    column.alignment = { vertical: "top", wrapText: true };
  });
  return sheet;
}

export function buildVerificationWorkbook(data: ExportData): ExcelJS.Workbook {
  if (data.payments.length + data.gcash.length > MAX_EXPORT_ROWS) throw new ExportLimitError("Export supports at most 20,000 combined source rows.");
  for (const row of [...data.payments, ...data.gcash]) {
    if (row.business_id !== data.run.business_id || row.verification_run_id !== data.run.id) throw new Error("Export scope mismatch.");
  }
  if (new Set(data.payments.map((p) => p.id)).size !== data.payments.length || new Set(data.gcash.map((g) => g.id)).size !== data.gcash.length) throw new Error("Duplicate export source IDs.");
  const counts = {
    total: data.payments.length,
    verified: data.payments.filter((p) => p.effective_status === "VERIFIED").length,
    needs_review: data.payments.filter((p) => p.effective_status === "NEEDS_REVIEW").length,
    cash: data.payments.filter((p) => p.effective_status === "CASH").length,
    bank: data.payments.filter((p) => p.effective_status === "BANK").length,
  };
  if (Object.entries(counts).some(([key, value]) => Reflect.get(data.run, key) !== value)) throw new Error("Export snapshot counts are inconsistent.");
  const gcashById = new Map(data.gcash.map((g) => [g.id, g]));
  const linkedCustomers = new Map<string, string>();
  for (const payment of data.payments) {
    if (!payment.gcash_transaction_id) continue;
    const g = gcashById.get(payment.gcash_transaction_id);
    if (!g || g.matched_payment_id !== payment.id || g.matched_customer !== payment.customer || payment.automated_status !== "VERIFIED" || payment.automated_reason !== "REFERENCE_MATCH" || linkedCustomers.has(g.id)) {
      throw new Error("Export contains an inconsistent persisted relationship.");
    }
    linkedCustomers.set(g.id, payment.customer);
  }
  const sourceRows = [...data.gcash].sort((a, b) => a.source_order - b.source_order || a.row_index - b.row_index || a.id.localeCompare(b.id)).map(gcashSource);
  const sourceColumns = new Map<string, SourceColumn>();
  for (const source of sourceRows) for (const column of source.columns) if (!sourceColumns.has(column.key)) sourceColumns.set(column.key, column);
  if (sourceColumns.size > 256) throw new ExportLimitError("Combined GCash source layouts exceed 256 columns.");
  if (data.payments.length * PAYMENT_HEADERS.length * 2 + data.gcash.length * (sourceColumns.size + 3) > MAX_EXPORT_CELLS) {
    throw new ExportLimitError("This report exceeds the 500,000-cell synchronous export limit.");
  }
  const book = new ExcelJS.Workbook();
  book.creator = "Payment Reconciliation System";
  book.created = excelDate(data.run.completed_at ?? data.run.created_at) ?? new Date("2000-01-01T00:00:00Z");
  const summary = prepareSheet(book, "Summary", ["Verification Report", "Value"]);
  summary.getColumn(1).width = 34;
  summary.getColumn(2).width = 80;
  const summaryRows: [string, string | number | null][] = [
    ["Workspace / Business", data.workspaceName], ["Verification Date (UTC)", data.run.completed_at],
    ["Payment Source Filename", data.run.payment_filename], ["GCash Source Filename", data.run.gcash_filename],
    ["Total Payments", data.run.total], ["Verified", data.run.verified], ["Needs Review", data.run.needs_review], ["Cash", data.run.cash], ["Bank", data.run.bank],
    ["Manual Review Count", data.payments.filter((p) => p.manual_status !== null).length],
    ["Automatically Verified Count", data.payments.filter((p) => p.automated_status === "VERIFIED").length],
    ["Counts", "Primary counts reflect final/effective status. Automated decisions remain in the payment sheets."],
    ["GCash Source Layout", "Source worksheets are combined in source order with worksheet/row provenance. Original column layouts are combined in first-seen order; unavailable legacy columns and workbook formatting cannot be reconstructed."],
    ["Matching Rule", "Persisted exact-reference relationships only. Amount differences do not affect verification. Manual status-only verification does not create a GCash customer link."],
  ];
  for (const [label, value] of summaryRows) {
    const row = summary.addRow([]);
    textCell(row.getCell(1), label);
    if (label === "Verification Date (UTC)") dateCell(row.getCell(2), data.run.completed_at, true);
    else if (typeof value === "number") row.getCell(2).value = value;
    else textCell(row.getCell(2), value);
    if (typeof value === "string" && value.length > 100) row.height = 58;
  }
  const addPayments = (name: string, payments: ExportPayment[]) => {
    const sheet = prepareSheet(book, name, PAYMENT_HEADERS);
    for (const p of payments) {
      const g = p.gcash_transaction_id ? gcashById.get(p.gcash_transaction_id) : undefined;
      const row = sheet.addRow([]);
      const values = [p.customer, p.account, p.billing_period, null, p.method, p.reference_number, null, p.notes, p.paid_by, p.received_by, null, null,
        p.automated_status, p.automated_reason, p.effective_status, p.manual_status ? "Yes" : "No", p.manual_note, p.reviewed_by, null, g?.reference_number, null];
      values.forEach((value, i) => textCell(row.getCell(i + 1), value));
      moneyCell(row.getCell(4), p.amount_decimal);
      dateCell(row.getCell(7), sourceCheckedDate(p.payment_date, p.raw_data, "payment date"));
      proofCell(row.getCell(11), p.photo_url);
      dateCell(row.getCell(12), sourceCheckedDate(p.created_at_source, p.raw_data, "created at"));
      dateCell(row.getCell(19), p.reviewed_at, true);
      moneyCell(row.getCell(21), g?.amount_decimal ?? null);
      row.getCell(15).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fills[p.effective_status] ?? "FFFFFFFF" } };
      row.height = 42;
    }
  };
  const orderedPayments = [...data.payments].sort((a, b) => a.row_index - b.row_index || a.id.localeCompare(b.id));
  addPayments("All Payments", orderedPayments);
  addPayments("Verified", orderedPayments.filter((p) => p.effective_status === "VERIFIED"));
  addPayments("Needs Review", orderedPayments.filter((p) => p.effective_status === "NEEDS_REVIEW"));
  addPayments("Cash", orderedPayments.filter((p) => p.effective_status === "CASH"));
  addPayments("Bank", orderedPayments.filter((p) => p.effective_status === "BANK"));
  const columns = [...sourceColumns.values()];
  const gcashSheet = prepareSheet(book, "GCash Transactions", ["Source Worksheet", "Source Row", ...columns.map((c) => c.label), "Matched Customer"]);
  for (const source of sourceRows) {
    const row = gcashSheet.addRow([]);
    textCell(row.getCell(1), source.worksheet);
    row.getCell(2).value = source.row.row_index;
    columns.forEach((column, i) => {
      const value = source.values.get(column.key);
      if (column.kind === "money" && (typeof value === "string" || typeof value === "number")) moneyCell(row.getCell(i + 3), String(value));
      else textCell(row.getCell(i + 3), value);
    });
    textCell(row.getCell(columns.length + 3), linkedCustomers.get(source.row.id) ?? "");
    row.height = 42;
  }
  return book;
}

export async function verificationWorkbookBuffer(data: ExportData) {
  return new Uint8Array(await buildVerificationWorkbook(data).xlsx.writeBuffer());
}
