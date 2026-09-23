import { describe, expect, it } from "vitest";

import { centavosToDecimal, formatCentavos, parseCentavos } from "@/lib/money";

describe("parseCentavos", () => {
  it.each([
    ["1000", 100000],
    ["1000.00", 100000],
    ["1,000.00", 100000],
    [" 999.99 ", 99999],
    ["0", 0],
    ["0.01", 1],
  ])("normalizes %s to %i centavos", (input, expected) => {
    expect(parseCentavos(input)).toEqual({ success: true, centavos: expected });
  });

  it.each([
    "",
    "NaN",
    "Infinity",
    "1.001",
    "1,00.00",
    "1,000,00",
    "12 34",
    "-1.00",
    "+1.00",
    "1e3",
  ])("rejects malformed amount %s", (input) => {
    expect(parseCentavos(input).success).toBe(false);
  });
});

describe("centavo formatting", () => {
  it("formats database decimal values without floating point", () => {
    expect(centavosToDecimal(99999)).toBe("999.99");
    expect(centavosToDecimal(100000)).toBe("1000.00");
  });

  it("formats display values without converting to a decimal number", () => {
    expect(formatCentavos(99999)).toBe("999.99");
    expect(formatCentavos(100000)).toBe("1,000.00");
  });
});
