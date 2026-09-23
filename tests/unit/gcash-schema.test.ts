// @vitest-environment node
import { describe, it, expect } from "vitest";

import { validateGcashRows, type GcashRowInput } from "@/lib/gcash/schema";

function makeGcashRow(overrides: Partial<GcashRowInput> = {}): GcashRowInput {
  return {
    rowIndex: 1,
    sheetName: "BOB September 2026",
    transactionDate: "2026-08-20",
    description: "Transfer from 09685863685 to 09331953428",
    referenceNumber: "5044150941509",
    amountCentavos: 100000,
    direction: "incoming",
    raw: {},
    ...overrides,
  };
}

describe("validateGcashRows", () => {
  it("validates a correct row", () => {
    const result = validateGcashRows([makeGcashRow()]);

    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.summary.validCount).toBe(1);
  });

  it("preserves integer centavos", () => {
    const result = validateGcashRows([makeGcashRow({ amountCentavos: 129950 })]);
    expect(result.valid[0]?.amountCentavos).toBe(129950);
  });

  it("handles zero amount", () => {
    const result = validateGcashRows([makeGcashRow({ amountCentavos: 0 })]);
    expect(result.valid[0]?.amountCentavos).toBe(0);
  });

  it("reports missing reference as error", () => {
    const result = validateGcashRows([makeGcashRow({ referenceNumber: "" })]);
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.field).toBe("referenceNumber");
  });

  it("counts incoming transactions", () => {
    const result = validateGcashRows([
      makeGcashRow({ direction: "incoming" }),
      makeGcashRow({ rowIndex: 2, direction: "incoming" }),
    ]);
    expect(result.summary.incomingCount).toBe(2);
    expect(result.summary.outgoingCount).toBe(0);
  });

  it("counts outgoing transactions", () => {
    const result = validateGcashRows([
      makeGcashRow({ direction: "outgoing" }),
    ]);
    expect(result.summary.outgoingCount).toBe(1);
  });

  it("counts unknown direction transactions", () => {
    const result = validateGcashRows([
      makeGcashRow({ direction: "unknown" }),
    ]);
    expect(result.summary.unknownDirectionCount).toBe(1);
  });

  it("handles multiple rows with mixed validity", () => {
    const result = validateGcashRows([
      makeGcashRow({ rowIndex: 1, amountCentavos: 100000 }),
      makeGcashRow({ rowIndex: 2, referenceNumber: "" }),
    ]);

    expect(result.valid).toHaveLength(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("preserves reference numbers with leading zeros", () => {
    const result = validateGcashRows([
      makeGcashRow({ referenceNumber: "0045276500984" }),
    ]);
    expect(result.valid[0]?.referenceNumber).toBe("0045276500984");
  });

  it("marks every transaction sharing a duplicate reference", () => {
    const result = validateGcashRows([
      makeGcashRow({ rowIndex: 1, referenceNumber: "123456789" }),
      makeGcashRow({ rowIndex: 2, referenceNumber: "123456789" }),
    ]);

    expect(result.valid).toHaveLength(2);
    expect(result.summary.duplicateReferenceCount).toBe(1);
    expect(result.summary.duplicateTransactionCount).toBe(2);
    expect(result.valid[0]?.referenceOccurrenceCount).toBe(2);
  });

  it("parses date correctly", () => {
    const result = validateGcashRows([
      makeGcashRow({ transactionDate: "2026-09-21" }),
    ]);
    expect(result.valid[0]?.transactionDate).toBe("2026-09-21");
  });

  it("returns null for invalid date", () => {
    const result = validateGcashRows([
      makeGcashRow({ transactionDate: "not-a-date" }),
    ]);
    expect(result.valid[0]?.transactionDate).toBeNull();
  });

  it("returns null for empty date", () => {
    const result = validateGcashRows([
      makeGcashRow({ transactionDate: "" }),
    ]);
    expect(result.valid[0]?.transactionDate).toBeNull();
  });
});
