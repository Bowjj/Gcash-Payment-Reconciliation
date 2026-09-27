import { parseWorkbook } from "@/lib/excel/parser";

import { validateAndNormalize } from "./schema";

export async function preparePaymentImport(buffer: Buffer) {
  const parsed = await parseWorkbook(buffer);
  const validated = validateAndNormalize(parsed.rows);
  return {
    ...validated,
    parseErrors: parsed.errors,
    warnings: parsed.warnings,
    missingHeaders: parsed.missingHeaders,
    totalRows: parsed.totalRows,
    preview: validated.valid.slice(0, 50),
  };
}
