import { parseExcelIdentifier } from "./identifier";

export const EXPECTED_HEADERS = [
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

export type HeaderKey = (typeof EXPECTED_HEADERS)[number];

export function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/\s+/g, " ");
}

export function buildColumnMap(
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

export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value instanceof Date) {
    return value.toISOString().split("T")[0] ?? "";
  }
  return String(value).trim();
}

export interface RowData {
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

export function extractRowData(
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

export interface ParseError {
  readonly rowIndex: number;
  readonly field: string;
  readonly message: string;
}

export function resolveReference(
  rawValue: unknown,
  formattedValue: string,
): { value: string; error?: string; warning?: string } | null {
  const reference = parseExcelIdentifier(rawValue, formattedValue);
  if (!reference.success) {
    return { value: "", error: reference.error };
  }
  return reference.warning
    ? { value: reference.value, warning: reference.warning }
    : { value: reference.value };
}
