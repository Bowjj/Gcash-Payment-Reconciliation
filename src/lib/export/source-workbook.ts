import { z } from "zod";
import { loadWorkbook, workbookTraversalBudget, worksheetRows } from "@/lib/excel/workbook";

export const sourceWorkbookSchema = z.object({
  version: z.literal(1), base64: z.string().max(14_000_000),
  sheets: z.array(z.object({
    name: z.string(), rowOffset: z.number().int().nonnegative(),
    headerRow: z.number().int().positive().nullable(), lastColumn: z.number().int().min(1).max(16382),
  })),
});
export type SourceWorkbook = z.infer<typeof sourceWorkbookSchema>;
export type ExportKind = "payments" | "gcash";

export async function captureSourceWorkbook(bytes: Buffer, kind: ExportKind): Promise<SourceWorkbook> {
  const book = await loadWorkbook(bytes);
  const budget = workbookTraversalBudget(book);
  const sheets = book.worksheets.map((sheet) => {
    const { raw, formatted: rows } = worksheetRows(sheet, budget);
    const occupied = raw.flatMap((row, rowIndex) => row.flatMap((value, columnIndex) => value === "" ? [] : [[rowIndex, columnIndex] as const]));
    const firstRow = occupied.length ? Math.min(...occupied.map(([row]) => row)) : 0;
    const lastColumn = Math.max(...occupied.map(([, column]) => column + 1), 1);
    const header = kind === "payments"
      ? rows.findIndex((row) => row.some((value) => String(value).trim()))
      : rows.findIndex((row) => String(row[0] ?? "").trim().toUpperCase().startsWith("DATE AND TIME"));
    return { name: sheet.name, rowOffset: firstRow, headerRow: header < 0 ? null : header + 1, lastColumn };
  });
  return { version: 1, base64: bytes.toString("base64"), sheets };
}
