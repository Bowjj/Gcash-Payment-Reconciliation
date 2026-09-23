export type ExcelIdentifierResult =
  | { readonly success: true; readonly value: string; readonly warning?: string }
  | { readonly success: false; readonly error: string };

export function parseExcelIdentifier(
  rawValue: unknown,
  formattedValue: string,
): ExcelIdentifierResult {
  const displayed = formattedValue.trim();
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { success: true, value: "" };
  }

  if (typeof rawValue === "string") {
    return { success: true, value: rawValue.trim() };
  }

  if (typeof rawValue !== "number" || !Number.isSafeInteger(rawValue)) {
    return { success: false, error: "Reference number is not a safe exact identifier" };
  }

  if (/[eE][+-]?\d+/.test(displayed)) {
    return { success: false, error: "Scientific-notation reference cannot be imported safely" };
  }

  if (!/^\d+$/.test(displayed)) {
    return { success: false, error: "Numeric reference has an unsupported Excel format" };
  }

  if (displayed !== String(rawValue)) {
    return { success: true, value: displayed };
  }

  return {
    success: true,
    value: displayed,
    warning: "Numeric reference has no recoverable leading-zero information",
  };
}
