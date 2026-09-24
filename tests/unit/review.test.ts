import { describe, expect, test } from "vitest";
import { canReview, displayMoney, effectiveStatus, matchesResult, proofHref, resultsQuerySchema, reviewInputSchema } from "@/lib/verification/review";
import { paymentResultSchema } from "@/lib/verification/results-data";
import { reconcilePayments, summarizeMatches } from "@/lib/verification/reconcile";
import type { ReconciliationStatus, PaymentMatch } from "@/lib/verification/reconcile";

const ids = { workspaceId: "10000000-0000-4000-8000-000000000001", runId: "20000000-0000-4000-8000-000000000001", paymentId: "30000000-0000-4000-8000-000000000001" };
const input = { ...ids, status: "VERIFIED", revision: 0, note: "Confirmed manually with admin" };
test.each<ReconciliationStatus>(["VERIFIED", "NEEDS_REVIEW", "CASH", "BANK"])("automated %s without review stays unchanged", (status) => {
  expect(effectiveStatus(status, null)).toBe(status);
});
test("manual verification changes effective status without mutating automated data", () => {
  const automatic = { status: "NEEDS_REVIEW", reason: "REFERENCE_NOT_FOUND" };
  expect(effectiveStatus("NEEDS_REVIEW", "VERIFIED")).toBe("VERIFIED");
  expect(automatic).toEqual({ status: "NEEDS_REVIEW", reason: "REFERENCE_NOT_FOUND" });
});
test("latest manual decision governs effective status while previous decisions remain intact", () => {
  const actions: ("VERIFIED" | "NEEDS_REVIEW")[] = ["VERIFIED", "NEEDS_REVIEW"];
  expect(effectiveStatus("NEEDS_REVIEW", actions[1] ?? null)).toBe("NEEDS_REVIEW");
  expect(actions).toEqual(["VERIFIED", "NEEDS_REVIEW"]);
});
test.each(["Confirmed manually with admin", "", "  checked  "])("optional note is accepted: %s", (note) => {
  expect(reviewInputSchema.parse({ ...input, note }).note).toBe(note.trim());
});
test("omitted optional note defaults to empty", () => {
  expect(reviewInputSchema.parse({ ...ids, status: "VERIFIED", revision: 0 }).note).toBe("");
});
test.each(["x".repeat(1001), 123, null])("invalid or oversized note rejected", (note) => {
  expect(reviewInputSchema.safeParse({ ...input, note }).success).toBe(false);
});
test.each<ReconciliationStatus>(["CASH", "BANK"])("%s cannot be overridden", (status) => {
  expect(effectiveStatus(status, "VERIFIED")).toBe(status);
  expect(canReview("owner", status)).toBe(false);
});
test("members cannot manually review; owner/admin can review eligible payments", () => {
  expect(canReview("member", "NEEDS_REVIEW")).toBe(false);
  expect(canReview("owner", "NEEDS_REVIEW")).toBe(true);
  expect(canReview("admin", "NEEDS_REVIEW")).toBe(true);
  expect(canReview("owner", "VERIFIED")).toBe(false);
});
test("1300/1299 unique reference still produces and displays verified", () => {
  const scope = { business_id: "business", verification_run_id: "run" };
  const p = { ...scope, id: "p", reference_number: "ABC123", method: "GCASH", amount: 1300 };
  const g = { ...scope, id: "g", reference_number: "ABC123", reference_occurrence_count: 1, amount: 1299 };
  const matches = reconcilePayments(scope, [p], [g]);
  expect(effectiveStatus(matches[0]?.status ?? "NEEDS_REVIEW", null)).toBe("VERIFIED");
  expect(displayMoney("1300")).toBe("₱1,300.00");
  expect(displayMoney("1299")).toBe("₱1,299.00");
});
test("leading-zero reference stays unchanged in result data", () => {
  const parsed = paymentResultSchema.parse({ id: ids.paymentId, customer: "Jake", method: "GCASH", amount_decimal: "1000", reference_number: "0045276500984", payment_date: null, photo_url: null, automated_status: "VERIFIED", automated_reason: "REFERENCE_MATCH", effective_status: "VERIFIED", manual_status: null, row_index: 2 });
  expect(parsed.reference_number).toBe("0045276500984");
});
test.each(["http://example.com/proof", "https://example.com/proof"])("valid proof %s is viewable", (url) => {
  expect(proofHref(url)).toBe(url);
});
test.each([null, "", "javascript:alert(1)", "data:text/html,hi", "//example.com", "bad url"])("invalid proof %s is not clickable", (url) => {
  expect(proofHref(url)).toBeNull();
});
const rows = [
  { customer: "Shara Villariasa", reference_number: "0000123", effective_status: "NEEDS_REVIEW" },
  { customer: "Shara Verified", reference_number: "ABC123", effective_status: "VERIFIED" },
  { customer: "Jake", reference_number: null, effective_status: "CASH" },
];
describe("deterministic result querying", () => {
  test("search by customer", () => expect(rows.filter((r) => matchesResult(r, { status: "ALL", q: "shara" }))).toHaveLength(2));
  test("search by reference", () => expect(rows.filter((r) => matchesResult(r, { status: "ALL", q: "0000123" }))).toEqual([rows[0]]));
  test("status filtering", () => expect(rows.filter((r) => matchesResult(r, { status: "CASH", q: "" }))).toEqual([rows[2]]));
  test("filter and search combined", () => expect(rows.filter((r) => matchesResult(r, { status: "NEEDS_REVIEW", q: "shara" }))).toEqual([rows[0]]));
  test("wildcards are literal text", () => expect(rows.filter((r) => matchesResult(r, { status: "ALL", q: "%" }))).toHaveLength(0));
  test("invalid pagination/sorting cannot become executable query input", () => expect(resultsQuerySchema.parse({ page: -1, sort: "drop table", status: "other" })).toMatchObject({ page: 1, sort: "source", status: "ALL" }));
});
test("summary counts use effective status after manual review", () => {
  const matches: PaymentMatch[] = [{ payment_id: "p", gcash_transaction_id: null, status: effectiveStatus("NEEDS_REVIEW", "VERIFIED"), reason: "REFERENCE_NOT_FOUND" }];
  expect(summarizeMatches(matches)).toMatchObject({ total: 1, verified: 1, needsReview: 0 });
});
test("duplicate candidates remain unselected even when final status is manually verified", () => {
  const scope = { business_id: "b", verification_run_id: "r" };
  const match = reconcilePayments(scope, [{ ...scope, id: "p", method: "GCASH", reference_number: "DUP" }], [1, 2].map((id) => ({ ...scope, id: `g${id}`, reference_number: "DUP", reference_occurrence_count: 2 })))[0];
  expect(match?.reason).toBe("DUPLICATE_REFERENCE");
  expect(effectiveStatus(match?.status ?? "NEEDS_REVIEW", "VERIFIED")).toBe("VERIFIED");
  expect(match?.gcash_transaction_id).toBeNull();
});
