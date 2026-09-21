import * as XLSX from "xlsx";

const EXPECTED_HEADERS = [
  "customer",
  "account",
  "billing period",
  "amount",
  "method",
  "reference #",
  "payment date",
  "notes",
  "paid by",
  "received by",
  "photo",
  "created at",
] as const;

type HeaderKey = (typeof EXPECTED_HEADERS)[number];

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

export interface ParseError {
  readonly rowIndex: number;
  readonly field: string;
  readonly message: string;
}

export interface ParseResult {
  readonly rows: readonly ParsedRow[];
  readonly errors: readonly ParseError[];
  readonly headers: readonly string[];
  readonly totalRows: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly missingHeaders: readonly string[];
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, " ");
}

function buildColumnMap(
  rawHeaders: readonly string[],
): { map: Record<number, HeaderKey>; missing: string[] } {
  const normalized = rawHeaders.map((h) => normalizeHeader(h));
  const map: Record<number, HeaderKey> = {};
  const missing: string[] = [];

  for (const expected of EXPECTED_HEADERS) {
    const idx = normalized.indexOf(expected);
    if (idx === -1) {
      missing.push(expected);
    } else {
      map[idx] = expected;
    }
  }

  return { map, missing };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) {
    return value.toISOString().split("T")[0] ?? "";
  }
  return String(value).trim();
}

interface RowData {
  customer: string;
  account: string;
  billingPeriod: string;
  amount: string;
  method: string;
  referenceNumber: string;
  paymentDate: string;
  notes: string;
  paidBy: string;
  receivedBy: string;
  photo: string;
  createdAt: string;
}

function extractRowData(
  rawRow: unknown[],
  columnMap: Record<number, HeaderKey>,
): RowData {
  const result: RowData = {
    customer: "",
    account: "",
    billingPeriod: "",
    amount: "",
    method: "",
    referenceNumber: "",
    paymentDate: "",
    notes: "",
    paidBy: "",
    receivedBy: "",
    photo: "",
    createdAt: "",
  };

  for (const [colStr, headerKey] of Object.entries(columnMap)) {
    const colIdx = Number(colStr);
    const value = rawRow[colIdx];
    const strValue = cellToString(value);

    switch (headerKey) {
      case "customer":
        result.customer = strValue;
        break;
      case "account":
        result.account = strValue;
        break;
      case "billing period":
        result.billingPeriod = strValue;
        break;
      case "amount":
        result.amount = strValue;
        break;
      case "method":
        result.method = strValue;
        break;
      case "reference #":
        result.referenceNumber = strValue;
        break;
      case "payment date":
        result.paymentDate = strValue;
        break;
      case "notes":
        result.notes = strValue;
        break;
      case "paid by":
        result.paidBy = strValue;
        break;
      case "received by":
        result.receivedBy = strValue;
        break;
      case "photo":
        result.photo = strValue;
        break;
      case "created at":
        result.createdAt = strValue;
        break;
    }
  }

  return result;
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
  if (!sheetName) {
    return {
      rows: [],
      errors: [
        { rowIndex: 0, field: "sheet", message: "Workbook has no sheets" },
      ],
      headers: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      missingHeaders: [],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ rowIndex: 0, field: "sheet", message: "Sheet is empty" }],
      headers: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      missingHeaders: [],
    };
  }

  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  if (allRows.length === 0) {
    return {
      rows: [],
      errors: [{ rowIndex: 0, field: "sheet", message: "Sheet is empty" }],
      headers: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      missingHeaders: [],
    };
  }

  const headerRow = allRows[0];
  if (!headerRow) {
    return {
      rows: [],
      errors: [
        { rowIndex: 0, field: "headers", message: "No header row found" },
      ],
      headers: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      missingHeaders: [],
    };
  }

  const rawHeaders = headerRow.map(cellToString);
  const { map: columnMap, missing: missingHeaders } = buildColumnMap(rawHeaders);

  if (missingHeaders.length === rawHeaders.length) {
    return {
      rows: [],
      errors: [
        {
          rowIndex: 0,
          field: "headers",
          message: `No expected headers found. Got: ${rawHeaders.join(", ")}`,
        },
      ],
      headers: rawHeaders,
      totalRows: 0,
      validCount: 0,
      errorCount: 1,
      missingHeaders,
    };
  }

  const dataRows = allRows.slice(1);
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rawRow = dataRows[i];
    if (!rawRow) continue;

    const rowData = extractRowData(rawRow, columnMap);

    const isBlank = Object.values(rowData).every((v) => v === "");
    if (isBlank) continue;

    const excelRowIndex = i + 2;
    const rawRecord: Record<string, unknown> = {};

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
  };
}
