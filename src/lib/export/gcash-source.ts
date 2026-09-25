import { z } from "zod";
import type { ExportGcash } from "./export-data";
import { ExportLimitError } from "./export-data";

const envelopeSchema = z.object({ sheet_name: z.string().optional(), source: z.record(z.string(), z.unknown()).optional() });
const preservedSchema = z.object({ headers: z.array(z.unknown()), cells: z.array(z.unknown()), reference_column: z.number().int().nonnegative().nullable() });
export interface SourceColumn { key: string; label: string; kind: "text" | "money" }
export interface SourceRow { row: ExportGcash; worksheet: string; columns: SourceColumn[]; values: Map<string, unknown> }

export function gcashSource(row: ExportGcash): SourceRow {
  const envelope = envelopeSchema.safeParse(row.raw_data);
  const worksheet = envelope.success ? envelope.data.sheet_name || "Original worksheet unavailable" : "Original worksheet unavailable";
  const source = envelope.success ? envelope.data.source ?? {} : {};
  const preserved = preservedSchema.safeParse(source["export_source"]);
  const columns: SourceColumn[] = [];
  const values = new Map<string, unknown>();
  if (preserved.success) {
    const data = preserved.data;
    const width = Math.max(data.headers.length, data.cells.length);
    if (width > 128) throw new ExportLimitError("GCash export supports at most 128 original source columns.");
    for (let i = 0; i < width; i++) {
      const label = String(data.headers[i] ?? "").trim() || `Column ${i + 1}`;
      const key = `source:${i}:${label}`;
      const reference = data.reference_column === i;
      columns.push({ key, label, kind: !reference && /^(amount|debit|credit)(\b|_)/i.test(label) ? "money" : "text" });
      values.set(key, reference ? row.reference_number : data.cells[i] ?? "");
    }
  } else {
    const labels: Record<string, string> = { date: "Date", description: "Description", ref: "Reference", debit: "Debit", credit: "Credit", col0: "Original transaction text" };
    const keys = ["date", "description", "ref", "debit", "credit", "col0"].filter((key) => key in source);
    keys.push(...Object.keys(source).filter((key) => !(key in labels) && key !== "export_source").sort());
    if (keys.length === 0) {
      Object.assign(source, { date: row.transaction_date, description: row.description, ref: row.reference_number, amount: row.amount_decimal });
      keys.push("date", "description", "ref", "amount");
    }
    for (const key of keys) {
      const id = `legacy:${key}`;
      columns.push({ key: id, label: labels[key] ?? key, kind: ["debit", "credit", "amount"].includes(key) ? "money" : "text" });
      values.set(id, key === "ref" ? row.reference_number : source[key]);
    }
  }
  return { row, worksheet, columns, values };
}
