import ExcelJS from "exceljs";
import { beforeAll, describe, expect, test } from "vitest";
import { buildVerificationWorkbook, exportFilename, REQUIRED_SHEETS, verificationWorkbookBuffer } from "@/lib/export/verification-workbook";
import { excelDate, moneyCell, safeText, sourceCheckedDate } from "@/lib/export/cells";
import { exportFixture, transactionId } from "../fixtures/export";

let workbook: ExcelJS.Workbook;
let bytes: Uint8Array;
function sheet(name: string) {
  const value = workbook.getWorksheet(name);
  if (!value) throw new Error(`Missing sheet ${name}`);
  return value;
}
function cell(sheetName: string, row: number, column: string) {
  const s = sheet(sheetName);
  const index = Array.from({ length: s.columnCount }, (_, i) => i + 1).find((i) => s.getRow(1).getCell(i).text === column);
  if (!index) throw new Error(`Missing column ${column}`);
  return s.getRow(row).getCell(index);
}
function customers(name: string) {
  return Array.from({ length: sheet(name).rowCount - 1 }, (_, i) => cell(name, i + 2, "Customer").text);
}
beforeAll(async () => {
  const buffer = await verificationWorkbookBuffer(exportFixture());
  bytes = buffer;
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer);
});

test("workbook generates and round-trips through ExcelJS as a valid XLSX ZIP", () => {
  expect(bytes.length).toBeGreaterThan(1000);
  expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
  expect(workbook.worksheets.map((s) => s.name)).toEqual(REQUIRED_SHEETS);
});
test.each(REQUIRED_SHEETS)("required sheet exists with bold frozen filterable headers: %s", (name) => {
  expect(sheet(name).getRow(1).font.bold).toBe(true);
  expect(sheet(name).views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  expect(sheet(name).autoFilter).toBeTruthy();
});
test("Summary uses persisted final counts and identifies manual vs automated totals", () => {
  const values = new Map<string, ExcelJS.CellValue>();
  sheet("Summary").eachRow((row) => values.set(row.getCell(1).text, row.getCell(2).value));
  expect(values.get("Total Payments")).toBe(9);
  expect(values.get("Verified")).toBe(3);
  expect(values.get("Needs Review")).toBe(4);
  expect(values.get("Cash")).toBe(1);
  expect(values.get("Bank")).toBe(1);
  expect(values.get("Manual Review Count")).toBe(1);
  expect(values.get("Automatically Verified Count")).toBe(2);
});
test("All Payments contains every payment, including records outside review categories", () => expect(sheet("All Payments").rowCount).toBe(10));
test("Verified includes automatic payments", () => expect(customers("Verified")).toContain("Jake Tirana"));
test("Verified includes manual-only verified payments", () => expect(customers("Verified")).toContain("Manual Only Customer"));
test("manual verification retains automated status, reason, note and reviewer", () => {
  const row = customers("Verified").indexOf("Manual Only Customer") + 2;
  expect(cell("Verified", row, "Automated Status").text).toBe("NEEDS_REVIEW");
  expect(cell("Verified", row, "Automated Reason").text).toBe("REFERENCE_NOT_FOUND");
  expect(cell("Verified", row, "Final Status").text).toBe("VERIFIED");
  expect(cell("Verified", row, "Manual Review").text).toBe("Yes");
  expect(cell("Verified", row, "Manual Note").text).toBe("Confirmed manually with admin");
  expect(cell("Verified", row, "Reviewed By").text).toBe("reviewer@example.com");
  expect(cell("Verified", row, "Reviewed At (UTC)").value).toBeInstanceOf(Date);
  expect(cell("Verified", row, "Matched GCash Reference").text).toBe("");
});
test("Needs Review contains unresolved final statuses only", () => {
  expect(customers("Needs Review")).toHaveLength(4);
  expect(customers("Needs Review")).not.toContain("Manual Only Customer");
  expect(cell("Needs Review", 2, "Automated Reason").text).toBe("REFERENCE_NOT_FOUND");
});
test("Cash sheet contains CASH only", () => expect(customers("Cash")).toEqual(["Cash Customer"]));
test("Bank sheet contains BANK only", () => expect(customers("Bank")).toEqual(["Bank Customer"]));
test("GCash unique persisted relationship attaches the correct customer at far right", () => {
  const s = sheet("GCash Transactions");
  expect(s.getRow(1).getCell(s.columnCount).text).toBe("Matched Customer");
  expect(s.getRow(2).getCell(s.columnCount).text).toBe("Jake Tirana");
});
test("1300 payment / 1299 GCash stays VERIFIED with the customer attached", () => {
  expect(cell("All Payments", 2, "Amount").value).toBe(1300);
  expect(cell("All Payments", 2, "Matched GCash Amount").value).toBe(1299);
  expect(cell("All Payments", 2, "Final Status").text).toBe("VERIFIED");
  expect(cell("GCash Transactions", 2, "Debit").value).toBe(1299);
  expect(cell("GCash Transactions", 2, "Matched Customer").text).toBe("Jake Tirana");
});
test("unmatched GCash transaction is retained with a blank customer", () => {
  expect(sheet("GCash Transactions").rowCount).toBe(7);
  expect(cell("GCash Transactions", 6, "REF NO").text).toBe("UNMATCHED");
  expect(cell("GCash Transactions", 6, "Matched Customer").text).toBe("");
});
test("manual-only verification cannot fabricate any GCash customer", () => {
  for (let row = 2; row <= 7; row++) expect(cell("GCash Transactions", row, "Matched Customer").text).not.toBe("Manual Only Customer");
});
test("duplicate candidates both retain blank customers", () => {
  for (const row of [3, 4]) {
    expect(cell("GCash Transactions", row, "REF NO").text).toBe("DUPLICATE");
    expect(cell("GCash Transactions", row, "Matched Customer").text).toBe("");
  }
});
test("source order is preserved despite unordered input rows and worksheet row-number overlap", () => {
  const fixture = exportFixture(); fixture.gcash.reverse();
  const rebuilt = buildVerificationWorkbook(fixture).getWorksheet("GCash Transactions");
  expect(rebuilt?.getRow(2).getCell(1).text).toBe("September");
  expect(rebuilt?.getRow(5).getCell(1).text).toBe("October");
  expect(rebuilt?.getRow(2).getCell(2).value).toBe(2);
  expect(rebuilt?.getRow(5).getCell(2).value).toBe(2);
  expect(rebuilt?.getRow(2).getCell(rebuilt.columnCount).text).toBe("Jake Tirana");
});
test("original extra columns and displayed source values survive export", () => {
  expect(cell("GCash Transactions", 2, "Extra Bank Field").text).toBe("Preserved 0");
  expect(cell("GCash Transactions", 2, "Account").text).toBe("00001234");
  expect(cell("GCash Transactions", 2, "Channel").text).toBe("Original channel");
});
test.each([[2, "0045276500984"], [9, "0000203966985"]])("Payment reference on row %s is text without lost zeros", (row, reference) => {
  const c = cell("All Payments", Number(row), "Reference #");
  expect(c.value).toBe(reference);
  expect(c.type).toBe(ExcelJS.ValueType.String);
  expect(c.numFmt).toBe("@");
});
test.each([[2, "0045276500984"], [5, "0000203966985"]])("GCash reference on row %s is text without scientific notation", (row, reference) => {
  const c = cell("GCash Transactions", Number(row), "REF NO");
  expect(c.value).toBe(reference);
  expect(c.type).toBe(ExcelJS.ValueType.String);
  expect(c.numFmt).toBe("@");
});
test("matched reconciliation reference fields are also text", () => expect(cell("All Payments", 2, "Matched GCash Reference").numFmt).toBe("@"));
test("money uses pesos with two decimal formatting rather than centavos", () => {
  expect(cell("All Payments", 2, "Amount").numFmt).toBe("#,##0.00");
  expect(cell("All Payments", 2, "Matched GCash Amount").value).toBe(1299);
});
test.each([[2, "https://example.com/proof.png"], [3, "http://example.com/proof.png"]])("safe proof URL on row %s is a hyperlink", (row, url) => expect(cell("All Payments", Number(row), "Photo / Proof").hyperlink).toBe(url));
test("invalid proof creates no hyperlink", () => expect(cell("All Payments", 4, "Photo / Proof").hyperlink).toBeUndefined());
test.each(["Customer", "Notes"])("formula-like Payment %s is inert text", (column) => {
  const c = cell("All Payments", 10, column);
  expect(c.text).toMatch(/^'/);
  expect(c.type).toBe(ExcelJS.ValueType.String);
  expect(c.formula).toBeUndefined();
});
test("formula-like GCash description is inert text", () => {
  const c = cell("GCash Transactions", 7, "Description");
  expect(c.text).toBe("'@untrusted-description");
  expect(c.formula).toBeUndefined();
});
test.each(["=SUM(1,2)", "+CMD", "-1+2", "@SUM(A1)", "\t=HYPERLINK(\"x\")"])("safe-text helper neutralizes %s", (value) => expect(safeText(value)).toBe(`'${value}`));
test("valid dates are Excel dates; invalid and null dates stay blank", () => {
  expect(cell("All Payments", 2, "Payment Date").value).toBeInstanceOf(Date);
  expect(cell("All Payments", 4, "Payment Date").value).toBeNull();
  expect(cell("All Payments", 5, "Payment Date").value).toBeNull();
  expect(excelDate("not a date")).toBeNull();
});
test("invalid original calendar date cannot export as a silently rolled-over date", () => {
  expect(sourceCheckedDate("2026-03-02", { source: { "payment date": "2026-02-30" } }, "payment date")).toBeNull();
  expect(sourceCheckedDate("2026-09-21", { source: { "payment date": "2026-09-21" } }, "payment date")).toBe("2026-09-21");
});
test("filename uses a sanitized unambiguous billing period", () => {
  const fixture = exportFixture();
  expect(exportFilename(fixture)).toBe("Payment_Verification_Sep_2026.xlsx");
  fixture.payments.forEach((p) => { p.billing_period = '../Sep\\2026\r\n"unsafe'; });
  expect(exportFilename(fixture)).toMatch(/^Payment_Verification_[A-Za-z0-9_]+\.xlsx$/);
});
test("mixed or missing billing periods use deterministic run-date fallback", () => {
  const fixture = exportFixture();
  const first = fixture.payments[0]; if (first) first.billing_period = null;
  expect(exportFilename(fixture)).toBe("Payment_Verification_2026-09-23.xlsx");
});
test("empty categories still include their headers", () => {
  const fixture = exportFixture(); fixture.payments = []; fixture.gcash = [];
  Object.assign(fixture.run, { total: 0, verified: 0, needs_review: 0, cash: 0, bank: 0 });
  const book = buildVerificationWorkbook(fixture);
  for (const name of REQUIRED_SHEETS.slice(1)) expect(book.getWorksheet(name)?.rowCount).toBe(1);
});
test("legacy selected source fields are retained when original column metadata is unavailable", () => {
  const fixture = exportFixture(); fixture.gcash.forEach((g) => { g.raw_data = { sheet_name: "Legacy", source: { date: g.transaction_date, description: g.description, ref: 45276500984, debit: g.amount_decimal, credit: "" } }; });
  const s = buildVerificationWorkbook(fixture).getWorksheet("GCash Transactions");
  expect(s?.getRow(1).getCell(5).text).toBe("Reference");
  expect(s?.getRow(2).getCell(5).text).toBe("0045276500984");
});
test("legacy concatenated source is retained, not destructively split", () => {
  const fixture = exportFixture(); fixture.gcash.forEach((g) => { g.raw_data = { source: { col0: `2026-09-21 Transfer ${g.reference_number} ${g.amount_decimal}` } }; });
  const s = buildVerificationWorkbook(fixture).getWorksheet("GCash Transactions");
  expect(s?.getRow(1).getCell(3).text).toBe("Original transaction text");
  expect(s?.getRow(2).getCell(3).text).toContain("0045276500984");
  expect(s?.getRow(2).getCell(s.columnCount).text).toBe("Jake Tirana");
});
test("extreme amounts use exact text rather than losing Excel numeric precision", () => {
  const c = new ExcelJS.Workbook().addWorksheet("Test").getCell("A1");
  moneyCell(c, "90071992547409.91");
  expect(c.value).toBe("90071992547409.91");
  expect(c.type).toBe(ExcelJS.ValueType.String);
});
describe.each(["business_id", "verification_run_id"])("export scope guard %s", (key) => {
  test("rejects foreign payment scope", () => {
    const fixture = exportFixture(); const p = fixture.payments[0]; if (p) Reflect.set(p, key, "foreign");
    expect(() => buildVerificationWorkbook(fixture)).toThrow("scope mismatch");
  });
  test("rejects foreign GCash scope", () => {
    const fixture = exportFixture(); const g = fixture.gcash[0]; if (g) Reflect.set(g, key, "foreign");
    expect(() => buildVerificationWorkbook(fixture)).toThrow("scope mismatch");
  });
});
test("fabricated manual-only transaction association fails closed", () => {
  const fixture = exportFixture(); const p = fixture.payments[6]; if (p) p.gcash_transaction_id = transactionId(5);
  expect(() => buildVerificationWorkbook(fixture)).toThrow("inconsistent persisted relationship");
});
test("over-limit export rejects rather than truncating data", () => {
  const fixture = exportFixture(); fixture.payments = Array.from({ length: 20001 }, () => fixture.payments[0]).filter((p) => p !== undefined);
  expect(() => buildVerificationWorkbook(fixture)).toThrow("20,000");
});
test("Excel's maximum text length is enforced without silent truncation", () => expect(() => safeText("x".repeat(32768))).toThrow("32,767"));
