// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

import { parseWorkbook } from "@/lib/excel/parser";

function createWorkbook(
  headers: string[],
  rows: (string | number)[][],
): Buffer {
  const wb = XLSX.utils.book_new();
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Payments");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseWorkbook", () => {
  const validHeaders = [
    "Customer",
    "Account",
    "Billing Period",
    "Amount",
    "Method",
    "Reference #",
    "Payment Date",
    "Notes",
    "Paid By",
    "Received By",
    "Photo",
    "Created At",
  ];

  it("parses a valid workbook with correct headers", () => {
    const buffer = createWorkbook(validHeaders, [
      ["Jake Tirana", "", "September 2026", "1000", "gcash", "8045281328410", "2026-09-21", "", "", "Alain Cabando", "View Photo", "2026-09-21 03:00:51"],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.customer).toBe("Jake Tirana");
    expect(result.rows[0]?.amount).toBe("1000");
    expect(result.rows[0]?.method).toBe("gcash");
    expect(result.rows[0]?.referenceNumber).toBe("8045281328410");
    expect(result.totalRows).toBe(1);
    expect(result.validCount).toBe(1);
  });

  it("preserves leading-zero reference numbers as strings", () => {
    const buffer = createWorkbook(validHeaders, [
      ["John Dale", "", "Sep 2026", "1000", "gcash", "0045276500984", "2026-09-21", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.rows[0]?.referenceNumber).toBe("0045276500984");
    expect(result.rows[0]?.referenceNumber).not.toBe("45276500984");
  });

  it("preserves leading zeros from an Excel number format", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      validHeaders,
      ["John Dale", "", "Sep 2026", "1000", "gcash", 45276500984, "2026-09-21", "", "", "", "", ""],
    ]);
    const referenceCell = ws["F2"];
    if (referenceCell) referenceCell.z = "0000000000000";
    XLSX.utils.book_append_sheet(wb, ws, "Payments");

    const result = parseWorkbook(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    expect(result.rows[0]?.referenceNumber).toBe("0045276500984");
    expect(result.warnings).toHaveLength(0);
  });

  it("warns when a numeric reference has no leading-zero metadata", () => {
    const buffer = createWorkbook(validHeaders, [
      ["John Dale", "", "Sep 2026", "1000", "gcash", 45276500984, "2026-09-21", "", "", "", "", ""],
    ]);

    const result = parseWorkbook(buffer);

    expect(result.rows[0]?.referenceNumber).toBe("45276500984");
    expect(result.warnings[0]?.field).toBe("referenceNumber");
  });

  it("handles reordered columns", () => {
    const reorderedHeaders = [
      "Method",
      "Amount",
      "Customer",
      "Reference #",
      "Payment Date",
      "Account",
      "Billing Period",
      "Notes",
      "Paid By",
      "Received By",
      "Photo",
      "Created At",
    ];
    const buffer = createWorkbook(reorderedHeaders, [
      ["cash", "500", "Jane Doe", "REF123", "2026-09-21", "", "", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.customer).toBe("Jane Doe");
    expect(result.rows[0]?.amount).toBe("500");
    expect(result.rows[0]?.method).toBe("cash");
    expect(result.rows[0]?.referenceNumber).toBe("REF123");
  });

  it("handles extra columns gracefully", () => {
    const buffer = createWorkbook(
      [...validHeaders, "Extra Column", "Another Extra"],
      [
        ["Test User", "", "Sep 2026", "100", "gcash", "REF001", "2026-09-21", "", "", "", "", "", "extra data", "more extra"],
      ],
    );
    const result = parseWorkbook(buffer);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.customer).toBe("Test User");
  });

  it("reports missing required headers", () => {
    const buffer = createWorkbook(
      ["Customer", "Amount", "Method"],
      [["Test", "100", "cash"]],
    );
    const result = parseWorkbook(buffer);

    expect(result.missingHeaders).toContain("reference #");
    expect(result.missingHeaders).toContain("payment date");
    expect(result.missingHeaders).toContain("notes");
  });

  it("skips blank rows", () => {
    const buffer = createWorkbook(validHeaders, [
      ["User 1", "", "Sep 2026", "100", "gcash", "R1", "2026-09-21", "", "", "", "", ""],
      [],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
      ["User 2", "", "Sep 2026", "200", "cash", "R2", "2026-09-21", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(4);
  });

  it("reports missing Customer as error", () => {
    const buffer = createWorkbook(validHeaders, [
      ["", "", "Sep 2026", "100", "gcash", "R1", "2026-09-21", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("customer");
  });

  it("reports missing Amount as error", () => {
    const buffer = createWorkbook(validHeaders, [
      ["Test User", "", "Sep 2026", "", "gcash", "R1", "2026-09-21", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("amount");
  });

  it("reports missing Method as error", () => {
    const buffer = createWorkbook(validHeaders, [
      ["Test User", "", "Sep 2026", "100", "", "R1", "2026-09-21", "", "", "", "", ""],
    ]);
    const result = parseWorkbook(buffer);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("method");
  });

  it("returns error for empty workbook", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const result = parseWorkbook(buffer);

    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles malformed workbook with no expected headers", () => {
    const buffer = createWorkbook(
      ["Col1", "Col2", "Col3"],
      [["a", "b", "c"]],
    );
    const result = parseWorkbook(buffer);

    expect(result.missingHeaders.length).toBeGreaterThan(0);
  });
});
