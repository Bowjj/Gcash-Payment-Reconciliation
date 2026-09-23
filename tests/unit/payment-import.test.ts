// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { preparePaymentImport } from "@/lib/payments/import";

describe("preparePaymentImport", () => {
  it("caps the preview without truncating valid payment rows", () => {
    const workbook = XLSX.utils.book_new();
    const rows: (string | number)[][] = [
      ["Customer", "Amount", "Method", "Reference #"],
    ];
    for (let index = 0; index < 75; index++) {
      rows.push([
        `Customer ${index}`,
        "1,000.00",
        "gcash",
        `REF${String(index).padStart(4, "0")}`,
      ]);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Payments");

    const result = preparePaymentImport(
      XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    );

    expect(result.valid).toHaveLength(75);
    expect(result.preview).toHaveLength(50);
    expect(result.summary.validCount).toBe(75);
    expect(result.valid[0]?.amountCentavos).toBe(100000);
  });
});
