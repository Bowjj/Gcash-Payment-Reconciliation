export const CUSTOMER_HEADER = "Matched Customer";
export const CONFLICT_HEADER = "Annotation Conflict";
export const CONFLICT_MARKER = "CONFLICT — see Annotation Conflict";

export function annotationKind(value: unknown): "customer" | "conflict" | null {
  if (typeof value !== "string") return null;
  const label = value.trim().replace(/\s+/g, " ").toLowerCase();
  return label === "matched customer" ? "customer" : label === "annotation conflict" ? "conflict" : null;
}

// Annotation headers can be separate from a statement's late/repeated financial
// header. Never interpret a value on a dated transaction row as a header.
export function annotationColumns(rows: readonly (readonly unknown[])[]) {
  const customer = new Set<number>(); const conflict = new Set<number>();
  const customerHeaders: { row: number; column: number }[] = [];
  const firstTransaction = rows.findIndex((row) => /^\d{4}-\d{2}-\d{2}/.test(String(row[0] ?? "").trim()));
  rows.forEach((row, index) => {
    const first = String(row[0] ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(first)) return;
    // Accept annotation-only/cover headers before transactions, and repeated
    // real financial headers later. Footer text is not a column declaration.
    if (firstTransaction >= 0 && index >= firstTransaction && !/^DATE AND TIME/i.test(first)) return;
    row.forEach((value, column) => {
      const kind = annotationKind(value);
      if (kind === "customer") { customer.add(column); customerHeaders.push({ row: index, column }); }
      if (kind === "conflict") conflict.add(column);
    });
  });
  return { customer: [...customer].sort((a, b) => a - b), conflict: [...conflict].sort((a, b) => a - b), customerHeaders };
}
