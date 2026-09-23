import * as XLSX from "xlsx";

import {
  buildColumnMap,
  cellToString,
  extractRowData,
  resolveReference,
} from "./parser-helpers";

export type { HeaderKey, ParseError } from "./parser-helpers";

export interface ParsedRow {
  readonly rowIndex: number;
  readonly customer: string;
  readonly account: string;
  readonly billingPeriod: string;
  readonly amount: string;
  readonly method: string;
  readonly referenceNumber: string;
  readonly paymentDate: string;
  readonly notes: string;
  readonly paidBy: string;
  readonly receivedBy: string;
  readonly photo: string;
  readonly createdAt: string;
  readonly raw: Record<string, unknown>;
}

export interface ParseResult {
  readonly rows: readonly ParsedRow[];
  readonly errors: readonly { rowIndex: number; field: string; message: string }[];
  readonly headers: readonly string[];
  readonly totalRows: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly missingHeaders: readonly string[];
  readonly warnings: readonly { rowIndex: number; field: string; message: string }[];
}

function emptyResult(
  error: string,
  extra?: {
    headers?: readonly string[];
    missingHeaders?: readonly string[];
    field?: string;
  },
): ParseResult {
  const errorField = extra?.field ?? "sheet";
  return {
    rows: [],
    errors: [{ rowIndex: 0, field: errorField, message: error }],
    headers: extra?.headers ?? [],
    totalRows: 0,
    validCount: 0,
    errorCount: 1,
    missingHeaders: extra?.missingHeaders ?? [],
    warnings: [],
  };
}

export function parseWorkbook(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    raw: true,
    cellDates: false,
    cellNF: false,
    cellStyles: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return emptyResult("Workbook has no sheets");

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return emptyResult("Sheet is empty");

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

  if (rawRows.length === 0) return emptyResult("Sheet is empty");

  const headerRow = formattedRows[0];
  if (!headerRow) return emptyResult("No header row found", { field: "headers" });

  const rawHeaders = headerRow.map(cellToString);
  const { map: columnMap, missing: missingHeaders } = buildColumnMap(rawHeaders);

  if (missingHeaders.length === rawHeaders.length) {
    return emptyResult(
      `No expected headers found. Got: ${rawHeaders.join(", ")}`,
      { field: "headers", headers: rawHeaders, missingHeaders },
    );
  }

  const dataRows = rawRows.slice(1);
  const formattedDataRows = formattedRows.slice(1);
  const rows: ParsedRow[] = [];
  const errors: { rowIndex: number; field: string; message: string }[] = [];
  const warnings: { rowIndex: number; field: string; message: string }[] = [];
  const referenceColumn = Object.entries(columnMap).find(
    ([, header]) => header === "reference #",
  );

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i];
    if (!rawRow) continue;

    const formattedRow = formattedDataRows[i] ?? [];
    const rowData = extractRowData(formattedRow, columnMap);

    const isBlank = Object.values(rowData).every((v) => v === "");
    if (isBlank) continue;

    const excelRowIndex = i + 2;
    const rawRecord: Record<string, unknown> = {};

    if (referenceColumn) {
      const referenceIndex = Number(referenceColumn[0]);
      const ref = resolveReference(
        rawRow[referenceIndex],
        rowData.referenceNumber,
      );
      if (ref?.error) {
        errors.push({
          rowIndex: excelRowIndex,
          field: "referenceNumber",
          message: ref.error,
        });
        continue;
      }
      rowData.referenceNumber = ref?.value ?? rowData.referenceNumber;
      if (ref?.warning) {
        warnings.push({
          rowIndex: excelRowIndex,
          field: "referenceNumber",
          message: ref.warning,
        });
      }
    }

    for (const [colStr, headerKey] of Object.entries(columnMap)) {
      const colIdx = Number(colStr);
      rawRecord[headerKey] = rawRow[colIdx];
    }

    if (!rowData.customer) {
      errors.push({
        rowIndex: excelRowIndex,
        field: "customer",
        message: "Customer is required",
      });
    }

    if (!rowData.amount) {
      errors.push({
        rowIndex: excelRowIndex,
        field: "amount",
        message: "Amount is required",
      });
    }

    if (!rowData.method) {
      errors.push({
        rowIndex: excelRowIndex,
        field: "method",
        message: "Method is required",
      });
    }

    rows.push({
      rowIndex: excelRowIndex,
      customer: rowData.customer,
      account: rowData.account,
      billingPeriod: rowData.billingPeriod,
      amount: rowData.amount,
      method: rowData.method,
      referenceNumber: rowData.referenceNumber,
      paymentDate: rowData.paymentDate,
      notes: rowData.notes,
      paidBy: rowData.paidBy,
      receivedBy: rowData.receivedBy,
      photo: rowData.photo,
      createdAt: rowData.createdAt,
      raw: rawRecord,
    });
  }

  return {
    rows,
    errors,
    headers: rawHeaders,
    totalRows: dataRows.length,
    validCount: rows.length,
    errorCount: errors.length,
    missingHeaders,
    warnings,
  };
}
