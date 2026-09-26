import ExcelJS from "exceljs";
import { captureSourceWorkbook } from "@/lib/export/source-workbook";
import { exportFixture } from "./export";

export async function operationalFixture() {
  const data = exportFixture();
  const names = ["Jake Tirana", "Shara Test", "Missing Reference", "Duplicate Reference", "Cash Test", "Bank Test"];
  data.payments.forEach((p, i) => { if (names[i]) p.customer = names[i]; });
  const shara = data.payments[1]; if (shara) shara.reference_number = "DETAILSAV4";
  const paymentBook = new ExcelJS.Workbook();
  const p = paymentBook.addWorksheet("Payment Testing");
  p.addRow(["Customer", "Account", "Billing Period", "Amount", "Method", "Reference #", "Payment Date", "Notes", "Paid By", "Received By", "Photo", "Created At"]);
  data.payments.forEach((row, index) => p.addRow([row.customer, row.account, row.billing_period, index === 1 ? "1000" : Number(row.amount_decimal), row.method === "GCASH" ? "GCash" : row.method, row.reference_number, row.payment_date, row.notes, row.paid_by, row.received_by, row.photo_url, row.created_at_source]));
  p.getCell("G2").value = new Date("2026-09-21T00:00:00Z"); p.getCell("G2").numFmt = "dd mmm yyyy";
  p.getCell("K2").value = { text: "Receipt", hyperlink: "https://example.com/proof.png" };
  p.getCell("K4").value = { text: "Unsafe receipt", hyperlink: "javascript:alert(1)" };
  p.getCell("H2").value = "=original literal text";
  p.getCell("D2").numFmt = "#,##0.00";
  p.getColumn(1).width = 32; p.getRow(1).height = 30; p.getRow(1).font = { bold: true };
  p.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  p.views = [{ state: "frozen", ySplit: 1 }];
  p.mergeCells("A13:C13"); p.getCell("A13").value = "Keep original footer";
  p.getCell("H13").value = { formula: "1+1", result: 2 };
  const instructions = paymentBook.addWorksheet("Original Instructions");
  instructions.getCell("B3").value = "Non-payment content";
  const gcashBook = new ExcelJS.Workbook();
  const headers = ["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit", "Unused", "Credit", "Extra Bank Field"];
  for (const [index, name] of ["September", "October"].entries()) {
    const g = gcashBook.addWorksheet(name); g.addRow(headers);
    data.gcash.slice(index * 3, index * 3 + 3).forEach((row) => g.addRow(["2026-09-21 08:00 AM", "00001234", row.description, "Original channel", "Original note", 5000, row.reference_number, "Original type", Number(row.amount_decimal), "", "", `Preserved ${row.source_order}`]));
    g.getCell("I2").numFmt = "#,##0.00"; g.getColumn(3).width = 40;
    g.getCell("A6").value = "Statement footer";
  }
  gcashBook.addWorksheet("Cover").getCell("A1").value = "Original statement cover";
  const paymentBytes = Buffer.from(await paymentBook.xlsx.writeBuffer());
  const gcashBytes = Buffer.from(await gcashBook.xlsx.writeBuffer());
  data.sources = { payments: captureSourceWorkbook(paymentBytes, "payments"), gcash: captureSourceWorkbook(gcashBytes, "gcash") };
  data.run.payment_filename = "Payment Testing.xlsx"; data.run.gcash_filename = "Gcash Testing.xlsx";
  return { data, paymentBook, gcashBook, paymentBytes, gcashBytes };
}
