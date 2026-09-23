// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

import { parseGcashWorkbook } from "@/lib/gcash/parser";

/**
 * Helper: create a workbook with a single sheet containing structured GCash data.
 * GCash structured format uses columns:
 *   0: Date and Time, 2: Description, 6: Reference No, 8: Debit, 10: Credit
 */
function createStructuredSheet(
  data: unknown[][],
  sheetName = "BOB September 2026",
): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const HEADER_ROW = [
  "Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT",
];

describe("parseGcashWorkbook", () => {
  it("parses structured rows with debit column (incoming)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, "5044150941509", null, "1000.00"],
      ["2026-08-20 08:56 AM", null, "Transfer from 09275335521 to 09331953428", null, null, null, "9044151844250", null, "1000.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.transactionDate).toBe("2026-08-20 08:20 AM");
    expect(result.rows[0]?.description).toBe("Transfer from 09685863685 to 09331953428");
    expect(result.rows[0]?.referenceNumber).toBe("5044150941509");
    expect(result.rows[0]?.amountCentavos).toBe(100000);
    expect(result.rows[0]?.direction).toBe("unknown");
    expect(result.rows[0]?.sheetName).toBe("BOB September 2026");
  });

  it("parses structured rows with credit column (outgoing fallback)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 10:48 AM", null, "Miscellaneous charge", null, null, null, "7044155055639", null, null, null, "40.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amountCentavos).toBe(4000);
    expect(result.rows[0]?.direction).toBe("unknown");
  });

  it("parses concatenated row format", () => {
    const buffer = createStructuredSheet([
      ["2026-04-18 05:41 Transfer from 09331953428 to 09203778483 2039915534650 32000.00 161469.49"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.transactionDate).toBe("2026-04-18 05:41");
    expect(result.rows[0]?.description).toBe("Transfer from 09331953428 to 09203778483");
    expect(result.rows[0]?.referenceNumber).toBe("2039915534650");
    expect(result.rows[0]?.amountCentavos).toBe(3200000);
  });

  it("preserves leading-zero reference numbers as strings", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 09:40 AM", null, "Buy Load Transaction for 09693506828", null, null, null, "0000203966985", null, "100"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows[0]?.referenceNumber).toBe("0000203966985");
  });

  it("preserves a leading-zero GCash reference from Excel formatting", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      HEADER_ROW,
      ["2026-08-20 09:40 AM", null, "Buy Load Transaction", null, null, null, 203966985, null, "100"],
    ]);
    const referenceCell = sheet["G2"];
    if (referenceCell) referenceCell.z = "0000000000000";
    XLSX.utils.book_append_sheet(workbook, sheet, "GCash");

    const result = parseGcashWorkbook(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    expect(result.rows[0]?.referenceNumber).toBe("0000203966985");
  });

  it("rejects scientific-notation GCash references", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      HEADER_ROW,
      ["2026-08-20 09:40 AM", null, "Buy Load Transaction", null, null, null, 2007900000000, null, "100"],
    ]);
    const referenceCell = sheet["G2"];
    if (referenceCell) referenceCell.z = "0.0000E+00";
    XLSX.utils.book_append_sheet(workbook, sheet, "GCash");

    const result = parseGcashWorkbook(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]?.field).toBe("referenceNumber");
  });

  it("processes multiple sheets", () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([
      HEADER_ROW,
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, "5044150941509", null, "1000.00"],
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      HEADER_ROW,
      ["2026-08-20 05:57 AM", null, "Transfer from 09998014444 to 09190777226", null, null, null, "7044148502619", null, "1599.00"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, "BOB September 2026");
    XLSX.utils.book_append_sheet(wb, ws2, "Penny September 2026");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(2);
    expect(result.sheetsProcessed).toContain("BOB September 2026");
    expect(result.sheetsProcessed).toContain("Penny September 2026");
    expect(result.rows[0]?.sheetName).toBe("BOB September 2026");
    expect(result.rows[1]?.sheetName).toBe("Penny September 2026");
  });

  it("skips metadata rows (BALANCE, Total, headers)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["STARTING BALANCE 6763.01"],
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, "5044150941509", null, "1000.00"],
      ["ENDING BALANCE 7763.01"],
      ["Total Debit 317248.30", null, "Total Credit 295297.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.referenceNumber).toBe("5044150941509");
  });

  it("skips blank rows", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      [],
      [null, null, null, null, null, null, null, null, null],
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, "5044150941509", null, "1000.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
  });

  it("uses unknown direction for transfer text without wallet ownership", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, "5044150941509", null, "1000.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows[0]?.direction).toBe("unknown");
  });

  it("detects direction from description keywords (Buy Load = outgoing)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 09:40 AM", null, "Buy Load Transaction for 09693506828", null, null, null, "0000203966985", null, "50"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows[0]?.direction).toBe("outgoing");
  });

  it("detects direction from description keywords (Sent GCash = outgoing)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-05-18 05:02 AM", null, "Sent GCash to Metropolitan Bank and Trust Co.", null, null, null, "2040920724131", null, "500"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows[0]?.direction).toBe("outgoing");
  });

  it("detects direction from description keywords (Cash in = incoming)", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 10:00 AM", null, "Cash in via BDO", null, null, null, "1234567890123", null, "5000"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows[0]?.direction).toBe("incoming");
  });

  it("returns empty rows for empty workbook", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(0);
  });

  it("reports errors for rows missing reference number", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-08-20 08:20 AM", null, "Transfer from 09685863685 to 09331953428", null, null, null, null, null, "1000.00"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.field).toBe("referenceNumber");
  });

  it("reports structured rows without an amount", () => {
    const buffer = createStructuredSheet([
      HEADER_ROW,
      ["2026-05-18 05:02 AM", null, "Sent GCash to Metropolitan Bank", null, null, null, "2040920724131"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]?.field).toBe("amount");
  });

  it("parses concatenated row with Cash in description", () => {
    const buffer = createStructuredSheet([
      ["2026-05-01 10:19 Transfer from 09928259265 to 09331953428 9040338581289 1000.00 12962.49"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amountCentavos).toBe(100000);
    expect(result.rows[0]?.direction).toBe("unknown");
    expect(result.rows[0]?.referenceNumber).toBe("9040338581289");
  });

  it("parses concatenated outgoing row (Sent GCash)", () => {
    const buffer = createStructuredSheet([
      ["2026-05-14 07:02 Sent GCash to GoTyme Bank with account ending in 9623 2040801901789 515.00 104164.38"],
    ]);
    const result = parseGcashWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amountCentavos).toBe(51500);
    expect(result.rows[0]?.direction).toBe("outgoing");
    expect(result.rows[0]?.referenceNumber).toBe("2040801901789");
  });
});
