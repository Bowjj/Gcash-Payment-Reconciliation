import { describe, it, expect } from "vitest";

import { validateAndNormalize, type PaymentRowInput } from "@/lib/payments/schema";

function makeRow(overrides: Partial<PaymentRowInput> = {}): PaymentRowInput {
  return {
    rowIndex: 1,
    customer: "Test User",
    account: "",
    billingPeriod: "September 2026",
    amount: "1000",
    method: "gcash",
    referenceNumber: "8045281328410",
    paymentDate: "2026-09-21",
    notes: "",
    paidBy: "",
    receivedBy: "Alain Cabando",
    photo: "",
    createdAt: "2026-09-21 03:00:51",
    raw: {},
    ...overrides,
  };
}

describe("validateAndNormalize", () => {
  it("validates a correct row", () => {
    const result = validateAndNormalize([makeRow()]);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.validCount).toBe(1);
    expect(result.summary.gcashCount).toBe(1);
  });

  it("normalizes GCASH method", () => {
    const result = validateAndNormalize([makeRow({ method: "gcash" })]);
    expect(result.valid[0]?.method).toBe("GCASH");
    expect(result.summary.gcashCount).toBe(1);
  });

  it("normalizes CASH method", () => {
    const result = validateAndNormalize([makeRow({ method: "cash" })]);
    expect(result.valid[0]?.method).toBe("CASH");
    expect(result.summary.cashCount).toBe(1);
  });

  it("normalizes bank_transfer to BANK", () => {
    const result = validateAndNormalize([makeRow({ method: "bank_transfer" })]);
    expect(result.valid[0]?.method).toBe("BANK");
    expect(result.summary.bankCount).toBe(1);
  });

  it("normalizes 'bank transfer' to BANK", () => {
    const result = validateAndNormalize([makeRow({ method: "bank transfer" })]);
    expect(result.valid[0]?.method).toBe("BANK");
    expect(result.summary.bankCount).toBe(1);
  });

  it("reports unknown method as error", () => {
    const result = validateAndNormalize([makeRow({ method: "bitcoin" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.field).toBe("method");
    expect(result.summary.unknownMethodCount).toBe(1);
  });

  it("reports missing customer as error", () => {
    const result = validateAndNormalize([makeRow({ customer: "" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("customer");
  });

  it("reports invalid amount as error", () => {
    const result = validateAndNormalize([makeRow({ amount: "abc" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports negative amount as error", () => {
    const result = validateAndNormalize([makeRow({ amount: "-100" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles multiple rows with mixed validity", () => {
    const result = validateAndNormalize([
      makeRow({ rowIndex: 1, customer: "Valid User", amount: "1000", method: "gcash" }),
      makeRow({ rowIndex: 2, customer: "", amount: "500", method: "cash" }),
      makeRow({ rowIndex: 3, customer: "Another User", amount: "200", method: "bitcoin" }),
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.summary.gcashCount).toBe(1);
    expect(result.summary.unknownMethodCount).toBe(1);
  });

  it("preserves reference numbers with leading zeros", () => {
    const result = validateAndNormalize([
      makeRow({ referenceNumber: "0045276500984" }),
    ]);

    expect(result.valid[0]?.referenceNumber).toBe("0045276500984");
  });

  it("parses amount as integer centavos", () => {
    const result = validateAndNormalize([makeRow({ amount: "1299" })]);
    expect(result.valid[0]?.amountCentavos).toBe(129900);
  });

  it.each(["1000", "1000.00", "1,000.00"])(
    "normalizes %s to the same centavo value",
    (amount) => {
      const result = validateAndNormalize([makeRow({ amount })]);
      expect(result.valid[0]?.amountCentavos).toBe(100000);
    },
  );

  it("rejects excessive decimal precision", () => {
    const result = validateAndNormalize([makeRow({ amount: "1.001" })]);
    expect(result.valid).toHaveLength(0);
  });

  it("handles empty photo field", () => {
    const result = validateAndNormalize([makeRow({ photo: "" })]);
    expect(result.valid[0]?.photoUrl).toBeNull();
  });

  it("handles View Photo text as non-URL", () => {
    const result = validateAndNormalize([makeRow({ photo: "View Photo" })]);
    expect(result.valid[0]?.photoUrl).toBeNull();
  });

  it.each([
    "https://example.com/proof.png",
    "http://example.com/proof.png",
    "  https://example.com/proof.png  ",
  ])("accepts safe proof URL %s", (photo) => {
    const result = validateAndNormalize([makeRow({ photo })]);
    expect(result.valid[0]?.photoUrl).toBe(photo.trim());
  });

  it.each([
    "ftp://example.com/file",
    "javascript:alert(1)",
    "httpx-not-a-url",
    "malformed URL",
  ])("normalizes unsafe proof value %s to null", (photo) => {
    const result = validateAndNormalize([makeRow({ photo })]);
    expect(result.valid[0]?.photoUrl).toBeNull();
  });
});
