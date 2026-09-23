export type CentavoParseResult =
  | { readonly success: true; readonly centavos: number }
  | { readonly success: false; readonly error: string };

const MONEY_PATTERN = /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;

export function parseCentavos(value: string): CentavoParseResult {
  const normalized = value.trim();
  const match = MONEY_PATTERN.exec(normalized);
  if (!match) {
    return { success: false, error: "Amount must be a non-negative number with at most two decimal places" };
  }

  const decimalDigits = match[1] ?? "";
  const wholeDigits = normalized.split(".", 1)[0]?.replaceAll(",", "") ?? "";
  const centavos = BigInt(wholeDigits) * BigInt(100) + BigInt(decimalDigits.padEnd(2, "0"));
  if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { success: false, error: "Amount is too large" };
  }

  return { success: true, centavos: Number(centavos) };
}

export function centavosToDecimal(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError("Centavos must be a non-negative safe integer");
  }

  const digits = String(centavos).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function formatCentavos(centavos: number): string {
  const decimal = centavosToDecimal(centavos);
  const [whole = "0", fraction = "00"] = decimal.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}
