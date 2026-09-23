import { parseGcashWorkbook } from "./parser";
import { validateGcashRows } from "./schema";

export function prepareGcashImport(buffer: Buffer) {
  const parsed = parseGcashWorkbook(buffer);
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
