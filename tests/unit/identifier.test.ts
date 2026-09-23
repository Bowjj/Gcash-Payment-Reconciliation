import { describe, expect, it } from "vitest";

import { parseExcelIdentifier } from "@/lib/excel/identifier";

describe("parseExcelIdentifier", () => {
  it("preserves text identifiers exactly", () => {
    expect(parseExcelIdentifier("0045276500984", "0045276500984")).toEqual({
      success: true,
      value: "0045276500984",
    });
  });

  it("preserves leading zeros supplied by an Excel number format", () => {
    expect(parseExcelIdentifier(203966985, "0000203966985")).toEqual({
      success: true,
      value: "0000203966985",
    });
  });

  it("warns when a numeric cell has no recoverable leading-zero metadata", () => {
    expect(parseExcelIdentifier(5044150941509, "5044150941509")).toEqual({
      success: true,
      value: "5044150941509",
      warning: "Numeric reference has no recoverable leading-zero information",
    });
  });

  it("rejects scientific notation", () => {
    expect(parseExcelIdentifier(2007900000000, "2.0079E+12").success).toBe(false);
  });

  it("rejects unsafe numeric identifiers", () => {
    expect(
      parseExcelIdentifier(Number.MAX_SAFE_INTEGER + 1, "9007199254740992").success,
    ).toBe(false);
  });
});
