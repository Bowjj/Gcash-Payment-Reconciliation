// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";

import { workbookBuffer } from "@/../tests/fixtures/workbook";
import { captureSourceWorkbook } from "@/lib/export/source-workbook";
import { parseWorkbook } from "@/lib/excel/parser";
import { parseGcashWorkbook } from "@/lib/gcash/parser";

const paymentHeaders = ["Customer", "Account", "Billing Period", "Amount", "Method", "Reference #", "Payment Date", "Notes", "Paid By", "Received By", "Photo", "Created At"];
const gcashHeader = ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT", null, null, "Matched Customer"];

describe("ExcelJS import compatibility", () => {
  test("preserves payment source sheet, row order, formatted cells, blank cells, and hyperlink text", async () => {
    const book = new ExcelJS.Workbook();
    const payments = book.addWorksheet("Payment Source");
    book.addWorksheet("Ignored").addRow(["not parsed"]);
    payments.addRow(paymentHeaders);
    payments.addRow([]);
    payments.addRow(["Alice", "", "September", 1300, "GCASH", 45276500984, new Date("2026-09-21T00:00:00Z"), "", "", "", { text: "Proof", hyperlink: "https://example.com/proof" }, ""]);
    payments.getCell("D3").numFmt = "#,##0.00";
    payments.getCell("F3").numFmt = "0000000000000";
    payments.getCell("G3").numFmt = "yyyy-mm-dd";
    const bytes = Buffer.from(await book.xlsx.writeBuffer());

    const parsed = await parseWorkbook(bytes);
    const source = await captureSourceWorkbook(bytes, "payments");
    expect(source.sheets.map((sheet) => sheet.name)).toEqual(["Payment Source", "Ignored"]);
    expect(source.sheets[0]).toMatchObject({ rowOffset: 0, headerRow: 1 });
    expect(parsed.rows[0]).toMatchObject({ rowIndex: 3, amount: "1,300.00", referenceNumber: "0045276500984", paymentDate: "2026-09-21", photo: "Proof" });
    expect(parsed.rows[0]?.raw["amount"]).toBe(1300);
  });

  test("preserves GCash sheet/source rows through late and repeated headers without using annotations as amounts", async () => {
    const bytes = await workbookBuffer([{ name: "Weekly GCash", rows: [
      ["Statement title"], gcashHeader,
      ["2026-09-21 08:00 AM", null, "Cash in via bank", null, null, null, "0045276500984", null, 1299, null, null, "Alice"],
      gcashHeader,
      ["2026-09-22 08:00 AM", null, "Cash in via bank", null, null, null, "0000203966985", null, 100, null, null, ""],
      ["2026-09-23 08:00 AM", null, "Cash in via bank", null, null, null, "UNMATCHED", null, 50, null, null, "Historical"],
    ] }]);
    const parsed = await parseGcashWorkbook(bytes);
    const source = await captureSourceWorkbook(bytes, "gcash");
    expect(source.sheets[0]).toMatchObject({ name: "Weekly GCash", headerRow: 2 });
    expect(parsed.rows.map((row) => [row.sheetName, row.rowIndex, row.referenceNumber, row.amountCentavos])).toEqual([
      ["Weekly GCash", 3, "0045276500984", 129900],
      ["Weekly GCash", 5, "0000203966985", 10000],
      ["Weekly GCash", 6, "UNMATCHED", 5000],
    ]);
  });

  test("retains supported headerless GCash rows", async () => {
    const parsed = await parseGcashWorkbook(await workbookBuffer([{ name: "Headerless", rows: [["2026-04-18 05:41 Transfer from 09331953428 to 09203778483 2039915534650 32000.00 161469.49"]] }]));
    expect(parsed.rows[0]).toMatchObject({ sheetName: "Headerless", rowIndex: 1, referenceNumber: "2039915534650", amountCentavos: 3200000 });
  });
});
