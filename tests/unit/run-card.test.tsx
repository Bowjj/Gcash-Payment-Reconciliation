// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { RunCard } from "@/components/verification/run-card";
import { runListFixture } from "../fixtures/run-list";
import type { RunListItem } from "@/lib/verification/run-list";

afterEach(cleanup);
test("completed run has an accessible results action pointing to the existing route", () => {
  render(<RunCard run={runListFixture} />);
  expect(screen.getByRole("link", { name: "View Results" })).toHaveAttribute("href", `/verification/${runListFixture.id}`);
  expect(screen.getByText("Payments_Sept.xlsx")).toBeVisible();
  expect(screen.getByText("GCash_Sept.xlsx")).toBeVisible();
  expect(screen.getByText("Completed")).toBeVisible();
});
test("counts display persisted effective categories, including Cash and Bank", () => {
  render(<RunCard run={runListFixture} />);
  const counts = screen.getByLabelText("Run result counts");
  expect(within(counts).getAllByRole("definition").map((element) => element.textContent)).toEqual(["9", "3", "4", "1", "1"]);
  expect(within(counts).getAllByRole("term").map((element) => element.textContent)).toEqual(["Total", "Verified", "Needs Review", "Cash", "Bank"]);
});
test.each<RunListItem["status"]>(["queued", "running", "failed"])("%s run has no unsupported results navigation", (status) => {
  render(<RunCard run={{ ...runListFixture, status, completed_at: null }} />);
  expect(screen.queryByRole("link", { name: "View Results" })).toBeNull();
  expect(screen.queryByLabelText("Run result counts")).toBeNull();
});
test("card action is not nested inside another link", () => {
  const { container } = render(<RunCard run={runListFixture} />);
  expect(container.querySelector("a a")).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
