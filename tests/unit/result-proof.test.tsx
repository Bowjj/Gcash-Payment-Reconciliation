// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ProofLink } from "@/components/verification/result-shared";

afterEach(cleanup);
test.each(["http://example.com/proof", "https://example.com/proof"])("proof link uses safe browser navigation for %s", (url) => {
  render(<ProofLink url={url} />);
  const link = screen.getByRole("link", { name: "View Proof" });
  expect(link).toHaveAttribute("href", url);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
test("malformed proof does not render any clickable link", () => {
  render(<ProofLink url="javascript:alert(1)" />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("No valid proof available")).toBeVisible();
});
