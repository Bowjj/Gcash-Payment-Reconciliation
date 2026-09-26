import * as XLSX from "xlsx";
import { z } from "zod";

export const sourceWorkbookSchema = z.object({
  version: z.literal(1), base64: z.string().max(14_000_000),
  sheets: z.array(z.object({
    name: z.string(), rowOffset: z.number().int().nonnegative(),
    headerRow: z.number().int().positive().nullable(), lastColumn: z.number().int().min(1).max(16382),
  })),
});
export type SourceWorkbook = z.infer<typeof sourceWorkbookSchema>;
export type ExportKind = "payments" | "gcash";

export function captureSourceWorkbook(bytes: Buffer, kind: ExportKind): SourceWorkbook {
  const book = XLSX.read(bytes, { type: "buffer", cellNF: true });
  let cells = 0;
  const sheets = book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(sheet?.["!ref"] ?? "A1");
    cells += (range.e.r + 1) * (range.e.c + 3);
    if (cells > 500000 || range.e.c > 16381) throw new Error("Source workbook exceeds the 500,000-cell export limit.");
    const rows: unknown[][] = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) : [];
    const header = kind === "payments" ? 0 : rows.findIndex((row) => String(row[0] ?? "").trim().toUpperCase().startsWith("DATE AND TIME"));
    return { name, rowOffset: range.s.r, headerRow: header < 0 ? null : range.s.r + header + 1, lastColumn: range.e.c + 1 };
  });
  return { version: 1, base64: bytes.toString("base64"), sheets };
}
