import ExcelJS from "exceljs";
import { expect, test } from "vitest";
import { prepareGcashImport } from "@/lib/gcash/import";
import { parseGcashRow } from "@/lib/gcash/row-parser";
import { annotationKind, CONFLICT_MARKER } from "@/lib/gcash/annotations";
import { operationalWorkbookExport } from "@/lib/export/verification-workbook";
import { weeklyCycle, weeklySource } from "../fixtures/weekly-gcash";

function columns(sheet: ExcelJS.Worksheet, label: string) {
  const found: number[] = []; sheet.getRow(1).eachCell((cell, column) => { if (cell.text === label) found.push(column); }); return found;
}
function names(sheet: ExcelJS.Worksheet) {
  const cols = columns(sheet, "Matched Customer"); expect(cols).toHaveLength(1);
  const col = cols[0]; if (!col) throw new Error("Missing annotation");
  return [2, 3, 4, 5].map((row) => sheet.getCell(row, col).text);
}
test("weekly fixture preserves A/B and fills existing C, then actual output reimports and fills D", async () => {
  const week1 = await weeklyCycle(await weeklySource(), "New Customer C", "C");
  expect(names(week1.sheet)).toEqual(["Existing Customer A", "Existing Customer B", "New Customer C", ""]);
  expect(week1.annotationConflicts).toBe(0); expect(columns(week1.sheet, "Annotation Conflict")).toHaveLength(0);
  const week2 = await weeklyCycle(week1.bytes, "New Customer D", "D");
  expect(names(week2.sheet)).toEqual(["Existing Customer A", "Existing Customer B", "New Customer C", "New Customer D"]);
  let bytes = week2.bytes;
  for (let week = 3; week <= 4; week++) {
    const result = await weeklyCycle(bytes, "New Customer C", "C"); bytes = result.bytes;
    expect(names(result.sheet)).toEqual(names(week2.sheet));
    expect(result.prepared.valid).toHaveLength(4); expect(result.prepared.parseErrors).toEqual([]);
    expect(result.sheet.rowCount).toBe(9); expect(result.sheet.getCell("A9").text).toBe("Statement footer");
    for (let row = 2; row <= 5; row++) expect(result.sheet.getCell(row, 9).value).toBe(1299);
    expect(result.prepared.valid.map((r) => r.rowIndex)).toEqual([2, 3, 4, 5]);
  }
});
test.each([{ at: [10] }, { at: [11] }, { at: [10, 11] }])("narrow layout annotations at $at never act as debit/credit values", async ({ at }) => {
  let bytes = await weeklySource(at, [["A", "A"], ["B", "B"], [], []]);
  for (let week = 0; week < 4; week++) {
    const result = await weeklyCycle(bytes, "Carla", "C"); bytes = result.bytes;
    expect(result.prepared.valid).toHaveLength(4); expect(result.prepared.parseErrors).toEqual([]);
    expect(result.matches[0]?.status).toBe("VERIFIED"); expect(names(result.sheet)).toEqual(["A", "B", "Carla", ""]);
    expect(result.prepared.valid.map((r) => r.amountCentavos)).toEqual([129900, 129900, 129900, 129900]);
  }
});
test("recognized annotations are excluded even without a DATE AND TIME header", async () => {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await weeklySource([11])).buffer);
  const sheet = book.worksheets[0]; if (!sheet) throw new Error("Missing fixture"); sheet.getCell("A1").value = "Statement";
  const result = await weeklyCycle(Buffer.from(await book.xlsx.writeBuffer()), "Carla", "C");
  expect(result.prepared.valid).toHaveLength(4); expect(result.prepared.parseErrors).toEqual([]);
  const again = await weeklyCycle(result.bytes, "Dan", "D");
  expect(again.sheet.rowCount).toBe(9); expect(again.prepared.valid.map((r) => r.rowIndex)).toEqual([2, 3, 4, 5]);
});
test("real debit and credit populated together remain an error; invalid amounts still fail", async () => {
  const row = ["2026-09-26 08:00 AM", "", "Transfer", "", "", "", "A", "", "1299", "", "100"];
  expect(parseGcashRow(row, row)).toMatchObject({ kind: "error", message: "Ambiguous debit and credit amounts" });
  row[10] = ""; row[8] = "Alice";
  expect(parseGcashRow(row, row)).toMatchObject({ kind: "error", field: "amount" });
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await weeklySource()).buffer);
  const sheet = book.worksheets[0]; if (!sheet) throw new Error("Missing fixture"); sheet.getCell("K2").value = 100;
  const parsed = await prepareGcashImport(Buffer.from(await book.xlsx.writeBuffer()));
  expect(parsed.parseErrors).toContainEqual(expect.objectContaining({ rowIndex: 2, message: "Ambiguous debit and credit amounts" }));
});
test("existing column before later bank columns is reused and financial/source values remain unchanged", async () => {
  const bytes = await weeklySource([12], [["A"], ["B"], [], []], true);
  const result = await weeklyCycle(bytes, "Carla", "C");
  expect(columns(result.sheet, "Matched Customer")).toEqual([12]); expect(result.sheet.columnCount).toBe(13);
  expect(result.sheet.getCell("M2").text).toBe("Extra original 0"); expect(result.sheet.getCell("I4").value).toBe(1299);
});
test("Alice versus current Bob preserves Alice, surfaces conflict, and leaves reference verification intact", async () => {
  const result = await weeklyCycle(await weeklySource([12], [["Alice"], ["Ben"], [], []]), "Bob", "A");
  expect(names(result.sheet)[0]).toBe("Alice"); expect(result.annotationConflicts).toBe(1);
  expect(result.matches[0]).toMatchObject({ status: "VERIFIED", reason: "REFERENCE_MATCH" });
  expect(result.sheet.getCell("M2").text).toContain('Existing customer: "Alice"; current exact-reference customer: "Bob"');
  const again = await weeklyCycle(result.bytes, "Bob", "A");
  expect(again.sheet.columnCount).toBe(result.sheet.columnCount); expect(names(again.sheet)[0]).toBe("Alice");
  expect(again.sheet.getCell("M2").text).toBe(result.sheet.getCell("M2").text);
});
test("duplicate recovery merges equal values/one blank; conflicting historical names are retained without a winner", async () => {
  const result = await weeklyCycle(await weeklySource([12, 13], [["Alice", "Alice"], ["", "Ben"], ["Carla", "Cora"], []]), "Dan", "D");
  expect(names(result.sheet)).toEqual(["Alice", "Ben", CONFLICT_MARKER, "Dan"]);
  expect(result.sheet.getCell("M1").value).toBeNull(); expect(result.sheet.getCell("M4").value).toBeNull();
  expect(result.annotationConflicts).toBe(1); expect(result.sheet.getCell("N4").text).toContain('["Carla","Cora"]');
  const again = await weeklyCycle(result.bytes, "Carla", "C");
  expect(names(again.sheet)[2]).toBe(CONFLICT_MARKER); expect(again.sheet.getCell("N4").text).toContain('["Carla","Cora"]');
  expect(again.sheet.getCell("N4").text).toContain('Current exact-reference customer: "Carla"');
  expect(again.sheet.columnCount).toBe(result.sheet.columnCount); expect(again.matches[0]?.status).toBe("VERIFIED");
});
test("historical annotations are not matching evidence; new unknown reference stays NEEDS_REVIEW", async () => {
  const result = await weeklyCycle(await weeklySource(), "Existing Customer A", "NOT-IN-STATEMENT");
  expect(result.matches[0]).toMatchObject({ status: "NEEDS_REVIEW", reason: "REFERENCE_NOT_FOUND", gcash_transaction_id: null });
  expect(names(result.sheet)).toEqual(["Existing Customer A", "Existing Customer B", "", ""]);
});
test("new transaction added in later week gains its annotation without changing existing row positions", async () => {
  const first = await weeklyCycle(await weeklySource(), "Carla", "C");
  first.sheet.getRow(6).values = ["2026-09-27 08:00 AM", "", "Cash in via bank", "", "", "", "0045276500984", "", 1299];
  const later = await weeklyCycle(Buffer.from(await first.book.xlsx.writeBuffer()), "Jake Tirana", "0045276500984");
  expect(later.prepared.valid).toHaveLength(5); expect(later.sheet.getCell("L6").text).toBe("Jake Tirana");
  expect(later.sheet.getCell("G6").value).toBe("0045276500984"); expect(later.sheet.getCell("I6").value).toBe(1299);
  expect(later.matches[0]?.status).toBe("VERIFIED"); expect(later.data.payments[0]?.amount_decimal).toBe("1300.00");
  expect(names(later.sheet)).toEqual(["Existing Customer A", "Existing Customer B", "Carla", ""]);
});
test("leading blank rows retain exact GCash rows through parse, persistence payload, and export", async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Weekly GCash");
  sheet.getRow(5).values = ["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit"];
  sheet.getRow(6).values = ["2026-09-26 08:00 AM", "Account", "Cash in via bank", "Channel", "Original note", 5000, "C", "Type", 1299];
  const result = await weeklyCycle(Buffer.from(await book.xlsx.writeBuffer()), "Carla", "C");
  expect(result.prepared.valid.map((row) => row.rowIndex)).toEqual([6]);
  expect(result.data.sources?.["gcash"]?.sheets[0]).toMatchObject({ rowOffset: 4, headerRow: 5 });
  expect(result.sheet.getCell("J6").text).toBe("Carla");
  expect(result.sheet.getCell("J10").text).toBe("");
});
test("legacy recovered exports also reuse existing annotation cells", async () => {
  const result = await weeklyCycle(await weeklySource(), "Carla", "C");
  delete result.data.sources;
  const legacy = await operationalWorkbookExport(result.data, "gcash");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(legacy.buffer.buffer);
  const sheet = book.worksheets[0]; if (!sheet) throw new Error("Missing legacy sheet");
  expect(names(sheet)).toEqual(["Existing Customer A", "Existing Customer B", "Carla", ""]);
});
test("annotation labels are recognized with harmless casing/spacing differences", () => {
  expect(annotationKind("  MATCHED   Customer ")).toBe("customer"); expect(annotationKind("Annotation Conflict")).toBe("conflict");
  expect(annotationKind("Customer")).toBeNull(); expect(annotationKind("Credit")).toBeNull();
});
test("formula-safe new names remain stable on subsequent weekly exports", async () => {
  const first = await weeklyCycle(await weeklySource(), "=Customer", "C");
  const second = await weeklyCycle(first.bytes, "=Customer", "C");
  expect(names(second.sheet)[2]).toBe("'=Customer"); expect(second.annotationConflicts).toBe(0);
  expect(second.sheet.getCell("L4").formula).toBeUndefined();
});
test("a footer mentioning Matched Customer is not mistaken for a source-column declaration", async () => {
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await weeklySource()).buffer);
  const sheet = book.worksheets[0]; if (!sheet) throw new Error("Missing fixture"); sheet.getCell("A9").value = "Matched Customer";
  const result = await weeklyCycle(Buffer.from(await book.xlsx.writeBuffer()), "Carla", "C");
  expect(result.sheet.getCell("A9").text).toBe("Matched Customer");
  expect(result.sheet.getCell("A2").text).toBe("2026-09-26 08:00 AM");
  expect(columns(result.sheet, "Matched Customer")).toEqual([12]);
});
