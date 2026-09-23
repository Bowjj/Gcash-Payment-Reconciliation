// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { prepareGcashImport } from "@/lib/gcash/import";
import { gcashImportRows } from "@/lib/verification/import-rows";

describe("prepareGcashImport", () => {
  it("preserves sheet identity, row position and source order across multiple worksheets", () => {
    const workbook = XLSX.utils.book_new();
    for (const sheetName of ["September", "October"]) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
        ["2026-09-21 08:00 AM", null, `Original ${sheetName}`, null, null, null, `000${sheetName}`, null, "1299"],
      ]), sheetName);
    }
    const prepared = prepareGcashImport(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const rows = gcashImportRows(prepared, "original.xlsx");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ row_index: 2, description: "Original September", raw_data: { filename: "original.xlsx", sheet_name: "September", source_order: 0 } });
    expect(rows[1]).toMatchObject({ row_index: 2, description: "Original October", raw_data: { filename: "original.xlsx", sheet_name: "October", source_order: 1 } });
    expect(rows[0]?.raw_data.source).toEqual(prepared.valid[0]?.rawData);
    expect(rows[1]?.raw_data.source).toEqual(prepared.valid[1]?.rawData);
  });
  it("caps preview independently from the complete valid import", () => {
    const workbook = XLSX.utils.book_new();
    const rows: unknown[][] = [
      ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
    ];
    for (let index = 0; index < 75; index++) {
      rows.push([
        `2026-08-20 08:${String(index % 60).padStart(2, "0")} AM`,
        null,
        "Cash in via bank",
        null,
        null,
        null,
        `REF${String(index).padStart(4, "0")}`,
        null,
        "1,000.00",
      ]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "GCash");

    const result = prepareGcashImport(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    expect(result.valid).toHaveLength(75);
    expect(result.preview).toHaveLength(50);
    expect(result.summary.validCount).toBe(75);
    expect(result.valid[0]?.amountCentavos).toBe(100000);
  });

  it("detects duplicate references without discarding transactions", () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
      ["2026-08-20 08:00 AM", null, "Cash in via bank", null, null, null, "123456789", null, "100"],
      ["2026-08-20 08:01 AM", null, "Cash in via bank", null, null, null, "123456789", null, "200"],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "GCash");

    const result = prepareGcashImport(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    expect(result.valid).toHaveLength(2);
    expect(result.summary.duplicateReferenceCount).toBe(1);
    expect(result.summary.duplicateTransactionCount).toBe(2);
    expect(result.valid.every((row) => row.referenceOccurrenceCount === 2)).toBe(true);
  });
});
