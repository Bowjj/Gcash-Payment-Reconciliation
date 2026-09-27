import { parseGcashWorkbook } from "./parser";
import { validateGcashRows } from "./schema";

export async function prepareGcashImport(buffer: Buffer) {
  const parsed = await parseGcashWorkbook(buffer);
  const validated = validateGcashRows(parsed.rows);
  return {
    ...validated,
    parseErrors: parsed.errors,
    warnings: parsed.warnings,
    sheetsProcessed: parsed.sheetsProcessed,
    totalRows: parsed.totalRows,
    preview: validated.valid.slice(0, 50),
  };
}
