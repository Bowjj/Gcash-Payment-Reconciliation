import * as XLSX from "xlsx";

import { parseGcashRow } from "./row-parser";
import type { GcashParseIssue, GcashParseResult, GcashParsedRow } from "./types";

export type { GcashParseIssue, GcashParseResult, GcashParsedRow } from "./types";

export function parseGcashWorkbook(buffer: Buffer): GcashParseResult {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: false,
    cellDates: false,
    cellNF: true,
    cellStyles: false,
  });
  const rows: GcashParsedRow[] = [];
  const errors: GcashParseIssue[] = [];
  const warnings: GcashParseIssue[] = [];
  const sheetsProcessed: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    const formattedRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    if (rawRows.length === 0) continue;
    sheetsProcessed.push(sheetName);

    for (let index = 0; index < rawRows.length; index++) {
      const rawRow = rawRows[index];
      if (!rawRow) continue;
      const formattedRow = formattedRows[index] ?? [];
      const rowIndex = index + 1;
      const result = parseGcashRow(rawRow, formattedRow);

      switch (result.kind) {
        case "skip":
          break;
        case "unsupported":
          warnings.push({ rowIndex, sheetName, field: "row", message: result.message });
          break;
        case "error":
          errors.push({ rowIndex, sheetName, field: result.field, message: result.message });
          break;
        case "transaction":
          rows.push({ rowIndex, sheetName, ...result.data });
          if (result.data.warning) {
            warnings.push({
              rowIndex,
              sheetName,
              field: "referenceNumber",
              message: result.data.warning,
            });
          }
          break;
      }
    }
  }

  return {
    rows,
    errors,
    warnings,
    totalRows: rows.length + errors.length + warnings.filter((issue) => issue.field === "row").length,
    validCount: rows.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    sheetsProcessed,
  };
}
