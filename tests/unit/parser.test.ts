// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { workbookBuffer } from "@/../tests/fixtures/workbook";
import { parseWorkbook } from "@/lib/excel/parser";
import { captureSourceWorkbook } from "@/lib/export/source-workbook";

const headers = ["Customer", "Account", "Billing Period", "Amount", "Method", "Reference #", "Payment Date", "Notes", "Paid By", "Received By", "Photo", "Created At"];
const row = ["Jake Tirana", "", "September 2026", "1,000.00", "gcash", "8045281328410", "2026-09-21", "", "", "Alain Cabando", "View Photo", "2026-09-21 03:00:51"];
const paymentBook = (rows: readonly unknown[][]) => workbookBuffer([{ name: "Payments", rows: [headers, ...rows] }]);

describe("parseWorkbook", () => {
  it("parses formatted money, dates, and hyperlinks from the first worksheet", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Payments");
    sheet.addRow(headers); sheet.addRow(row); sheet.getCell("D2").numFmt = "#,##0.00";
    sheet.getCell("G2").value = new Date("2026-09-21T00:00:00Z"); sheet.getCell("G2").numFmt = "yyyy-mm-dd";
    sheet.getCell("K2").value = { text: "View Photo", hyperlink: "https://example.com/proof" };
    const result = await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
    expect(result.rows[0]).toMatchObject({ customer: "Jake Tirana", amount: "1,000.00", paymentDate: "2026-09-21", photo: "View Photo" });
  });

  it("preserves string and formatted numeric leading-zero references", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Payments"); sheet.addRow(headers); sheet.addRow([...row.slice(0, 5), 45276500984, ...row.slice(6)]);
    sheet.getCell("F2").numFmt = "0000000000000";
    const numeric = await parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()));
    const text = await parseWorkbook(await paymentBook([[...row.slice(0, 5), "0045276500984", ...row.slice(6)]]));
    expect(numeric.rows[0]?.referenceNumber).toBe("0045276500984");
    expect(text.rows[0]?.referenceNumber).toBe("0045276500984");
  });

  it("keeps raw source values while using formatted values for validation", async () => {
    const result = await parseWorkbook(await paymentBook([row]));
    expect(result.rows[0]?.raw["amount"]).toBe("1,000.00");
    expect(result.rows[0]?.amount).toBe("1,000.00");
  });

  it("uses only the first worksheet and preserves source row indices", async () => {
    const result = await parseWorkbook(await workbookBuffer([{ name: "Payments", rows: [headers, [], row] }, { name: "Ignored", rows: [headers, row] }]));
    expect(result.rows).toHaveLength(1); expect(result.rows[0]?.rowIndex).toBe(3); expect(result.totalRows).toBe(2);
  });

  it("finds headers at B5 and preserves absolute row and source provenance", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Payments");
    sheet.getCell("B5").value = "Customer"; sheet.getCell("C5").value = "Amount"; sheet.getCell("D5").value = "Method"; sheet.getCell("E5").value = "Reference #";
    sheet.getCell("B6").value = "Offset Customer"; sheet.getCell("C6").value = "1,300.00"; sheet.getCell("D6").value = "GCash"; sheet.getCell("E6").value = "0045276500984";
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const result = await parseWorkbook(bytes); const source = await captureSourceWorkbook(bytes, "payments");
    expect(result.rows[0]).toMatchObject({ rowIndex: 6, customer: "Offset Customer" });
    expect(source.sheets[0]).toMatchObject({ rowOffset: 4, headerRow: 5, lastColumn: 5 });
  });

  it("rejects a sparse far-away cell before dense worksheet traversal", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Payments");
    sheet.getCell("XFD1048576").value = "far";
    await expect(parseWorkbook(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow("500,000-cell");
  });

  it("reports missing headers and malformed header rows", async () => {
    const missing = await parseWorkbook(await workbookBuffer([{ name: "Payments", rows: [["Customer", "Amount", "Method"], ["A", "1", "cash"]] }]));
    const invalid = await parseWorkbook(await workbookBuffer([{ name: "Payments", rows: [["Unknown"], ["A"]] }]));
    expect(missing.missingHeaders).toContain("reference #"); expect(invalid.missingHeaders).toHaveLength(headers.length);
  });

  it("reports required-field errors without dropping the source row", async () => {
    const result = await parseWorkbook(await paymentBook([["", "", "", "", "", "R1", "", "", "", "", "", ""]]));
    expect(result.rows).toHaveLength(1); expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining(["customer", "amount", "method"]));
  });
});
