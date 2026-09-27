// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { PreviewTable } from "@/components/verification/preview-table";

const row = {
  rowIndex: 2, customer: "Customer", amountCentavos: 10000, method: "GCASH", referenceNumber: "REF", paymentDate: null,
};

test("preview only renders proof links with a safe URL", () => {
  const { rerender } = render(<PreviewTable rows={[{ ...row, photoUrl: "javascript:alert(1)" }]} totalCount={1} />);
  expect(screen.queryByRole("link", { name: "View Proof" })).toBeNull();
  rerender(<PreviewTable rows={[{ ...row, photoUrl: "https://example.com/proof" }]} totalCount={1} />);
  expect(screen.getByRole("link", { name: "View Proof" })).toHaveAttribute("href", "https://example.com/proof");
});
