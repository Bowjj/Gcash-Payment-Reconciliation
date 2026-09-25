import type { Cell } from "exceljs";
import { centavosToDecimal, parseCentavos } from "@/lib/money";
import { proofHref } from "@/lib/verification/review";
import { ExportLimitError } from "./export-data";

export function safeText(value: unknown): string {
  const original = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Remove XML-illegal controls, then neutralize formula prefixes while keeping the cell explicitly textual.
  const text = Array.from(original).filter((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code === 9 || code === 10 || code === 13 || (code >= 32 && !(code >= 55296 && code <= 57343) && code !== 65534 && code !== 65535);
  }).join("");
  const escaped = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  if (escaped.length > 32767) throw new ExportLimitError("A source cell exceeds Excel's 32,767-character limit.");
  return escaped;
}
export function textCell(cell: Cell, value: unknown) {
  cell.value = safeText(value);
  cell.numFmt = "@";
}
export function moneyCell(cell: Cell, value: string | null) {
  if (!value) { cell.value = null; return; }
  const parsed = parseCentavos(value);
  if (!parsed.success) { textCell(cell, value); return; }
  const decimal = centavosToDecimal(parsed.centavos);
  if (String(parsed.centavos).length > 15) { textCell(cell, decimal); return; }
  cell.value = Number(decimal);
  cell.numFmt = '#,##0.00';
}
export function excelDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const midnight = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1900 ? date : null;
}
export function dateCell(cell: Cell, value: string | null, time = false) {
  cell.value = excelDate(value);
  cell.numFmt = time ? 'yyyy-mm-dd hh:mm:ss' : 'yyyy-mm-dd';
}
export function sourceCheckedDate(value: string | null, rawData: unknown, field: string) {
  if (rawData && typeof rawData === "object" && "source" in rawData && rawData.source && typeof rawData.source === "object" && field in rawData.source) {
    const original: unknown = Reflect.get(rawData.source, field);
    if (original === null || original === "") return null;
    if (typeof original === "string") {
      const text = original.trim();
      if (!text || !Number.isFinite(Date.parse(text))) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(text) && !excelDate(text.slice(0, 10))) return null;
    }
  }
  return value;
}
export function proofCell(cell: Cell, value: string | null) {
  const url = proofHref(value);
  if (!url) { cell.value = null; return; }
  cell.value = { text: safeText(url), hyperlink: url, tooltip: "View payment proof" };
  cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
}
