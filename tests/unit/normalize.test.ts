import { describe, it, expect } from "vitest";

import { normalizeMethod, isValidPhotoUrl } from "@/lib/payments/normalize";

describe("normalizeMethod", () => {
  it("normalizes gcash to GCASH", () => {
    expect(normalizeMethod("gcash")).toBe("GCASH");
  });

  it("normalizes cash to CASH", () => {
    expect(normalizeMethod("cash")).toBe("CASH");
  });

  it("normalizes bank_transfer to BANK", () => {
    expect(normalizeMethod("bank_transfer")).toBe("BANK");
  });

  it("normalizes 'bank transfer' to BANK", () => {
    expect(normalizeMethod("bank transfer")).toBe("BANK");
  });

  it("normalizes bank to BANK", () => {
    expect(normalizeMethod("bank")).toBe("BANK");
  });

  it("returns null for unknown method", () => {
    expect(normalizeMethod("bitcoin")).toBeNull();
    expect(normalizeMethod("")).toBeNull();
    expect(normalizeMethod("  ")).toBeNull();
  });

  it("handles case insensitivity", () => {
    expect(normalizeMethod("GCASH")).toBe("GCASH");
    expect(normalizeMethod("Cash")).toBe("CASH");
    expect(normalizeMethod("BANK_TRANSFER")).toBe("BANK");
  });

  it("handles whitespace and underscores", () => {
    expect(normalizeMethod("  gcash  ")).toBe("GCASH");
    expect(normalizeMethod("bank_transfer")).toBe("BANK");
    expect(normalizeMethod("bank  transfer")).toBe("BANK");
  });
});

describe("isValidPhotoUrl", () => {
  it("returns false for empty string", () => {
    expect(isValidPhotoUrl("")).toBe(false);
  });

  it("returns false for 'View Photo' text", () => {
    expect(isValidPhotoUrl("View Photo")).toBe(false);
  });

  it("returns true for valid http URL", () => {
    expect(isValidPhotoUrl("http://example.com/photo.jpg")).toBe(true);
  });

  it("returns true for valid https URL", () => {
    expect(isValidPhotoUrl("https://example.com/photo.png")).toBe(true);
  });

  it("returns false for invalid URL", () => {
    expect(isValidPhotoUrl("not-a-url")).toBe(false);
    expect(isValidPhotoUrl("ftp://example.com/file.jpg")).toBe(false);
  });
});
