// @vitest-environment node
import { describe, expect, it } from "vitest";

import { workbookBuffer } from "@/../tests/fixtures/workbook";
import { preparePaymentImport } from "@/lib/payments/import";

describe("preparePaymentImport", () => {
  it("caps the preview without truncating valid payment rows", async () => {
    const rows: (string | number)[][] = [["Customer", "Amount", "Method", "Reference #"]];
    for (let index = 0; index < 75; index++) {
      rows.push([`Customer ${index}`, "1,000.00", "gcash", `REF${String(index).padStart(4, "0")}`]);
    }
    const result = await preparePaymentImport(await workbookBuffer([{ name: "Payments", rows }]));

    expect(result.valid).toHaveLength(75);
    expect(result.preview).toHaveLength(50);
    expect(result.summary.validCount).toBe(75);
    expect(result.valid[0]?.amountCentavos).toBe(100000);
  });
});
