import ExcelJS from "exceljs";
import { prepareGcashImport } from "@/lib/gcash/import";
import { preparePaymentImport } from "@/lib/payments/import";
import { gcashImportRows, paymentImportRows } from "@/lib/verification/import-rows";
import { reconcilePayments, summarizeMatches } from "@/lib/verification/reconcile";
import { captureSourceWorkbook } from "@/lib/export/source-workbook";
import { operationalWorkbookExport } from "@/lib/export/verification-workbook";
import { exportFixture, paymentId, transactionId } from "./export";
import type { ExportData, ExportGcash, ExportPayment } from "@/lib/export/export-data";

export async function weeklySource(columns: number[] = [12], names: string[][] = [["Existing Customer A"], ["Existing Customer B"], [], []], extraColumn = false) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Weekly GCash");
  sheet.addRow(["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit"]);
  if (!columns.includes(11)) sheet.getCell("K1").value = "Credit";
  columns.forEach((column) => { sheet.getCell(1, column).value = "Matched Customer"; });
  for (let i = 0; i < 4; i++) {
    sheet.getRow(i + 2).values = ["2026-09-26 08:00 AM", "Account", "Cash in via bank", "Channel", "Original note", 5000, ["A", "B", "C", "D"][i], "Type", 1299];
    columns.forEach((column, j) => { sheet.getCell(i + 2, column).value = names[i]?.[j] ?? ""; });
    if (extraColumn) sheet.getCell(i + 2, Math.max(...columns, 11) + 1).value = `Extra original ${i}`;
  }
  if (extraColumn) sheet.getCell(1, Math.max(...columns, 11) + 1).value = "Later bank column";
  sheet.getCell("A9").value = "Statement footer";
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function weeklyPayments(customer: string, reference: string) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Payments");
  sheet.addRow(["Customer", "Amount", "Method", "Reference #"]); sheet.addRow([customer, 1300, "GCash", reference]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function weeklyCycle(bytes: Buffer, customer: string, reference: string) {
  const prepared = await prepareGcashImport(bytes);
  const pBytes = await weeklyPayments(customer, reference);
  const pPrepared = await preparePaymentImport(pBytes);
  const fixture = exportFixture(); const template = fixture.payments[0]; if (!template) throw new Error("Missing Payment template");
  const scope = { business_id: fixture.run.business_id, verification_run_id: fixture.run.id };
  // Use the actual import payload shape and a JSON serialization round trip, just
  // as persistence does. Browser coverage separately exercises the real DB RPC.
  const importedG = gcashImportRows(prepared, "Weekly.xlsx");
  const importedP = paymentImportRows(pPrepared, "Payments.xlsx");
  const payments: ExportPayment[] = importedP.map((row, i) => ({ ...template, ...row, ...scope, id: paymentId(i + 1), amount_decimal: row.amount, manual_status: null, gcash_transaction_id: null }));
  const gcash: ExportGcash[] = importedG.map((row, i) => ({ ...row, ...scope, id: transactionId(i + 1), amount_decimal: row.amount, source_order: i, matched_payment_id: null, matched_customer: null }));
  const matches = reconcilePayments(scope, payments, importedG.map((row, i) => ({ ...row, ...scope, id: transactionId(i + 1) })));
  for (const match of matches) {
    const p = payments.find((row) => row.id === match.payment_id); if (!p) throw new Error("Missing Payment");
    Object.assign(p, { automated_status: match.status, automated_reason: match.reason, effective_status: match.status, gcash_transaction_id: match.gcash_transaction_id });
    const g = gcash.find((row) => row.id === match.gcash_transaction_id);
    if (g) { g.matched_payment_id = p.id; g.matched_customer = p.customer; }
  }
  const summary = summarizeMatches(matches);
  const data: ExportData = { ...fixture, payments, gcash,
    run: { ...fixture.run, total: summary.total, verified: summary.verified, needs_review: summary.needsReview, cash: summary.cash, bank: summary.bank },
    sources: { payments: await captureSourceWorkbook(pBytes, "payments"), gcash: await captureSourceWorkbook(bytes, "gcash") },
  };
  const output = await operationalWorkbookExport(JSON.parse(JSON.stringify(data)), "gcash");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(output.buffer.buffer);
  const sheet = book.getWorksheet("Weekly GCash"); if (!sheet) throw new Error("Missing weekly sheet");
  return { ...output, bytes: Buffer.from(output.buffer), book, sheet, data, prepared, matches };
}
