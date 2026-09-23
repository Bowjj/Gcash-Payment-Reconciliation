export type NormalizedMethod = "GCASH" | "CASH" | "BANK";

const METHOD_MAP: Record<string, NormalizedMethod> = {
  gcash: "GCASH",
  cash: "CASH",
  bank: "BANK",
  bank_transfer: "BANK",
  "bank transfer": "BANK",
};

export function normalizeMethod(raw: string): NormalizedMethod | null {
  const normalized = raw.toLowerCase().trim().replace(/[\s_-]+/g, " ");
  const mapped = METHOD_MAP[normalized];
  return mapped ?? null;
}

export function isValidPhotoUrl(url: string): boolean {
  const normalized = url.trim();
  if (!normalized || normalized === "View Photo") return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
