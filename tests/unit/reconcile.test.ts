import { describe, expect, test } from "vitest";
import { reconcilePayments, summarizeMatches, type ReconciliationPayment, type ReconciliationTransaction } from "@/lib/verification/reconcile";

const scope = { business_id: "business-a", verification_run_id: "run-a" };
function payment(reference: string | null = "ABC123456", method = "GCASH", id = "p1"): ReconciliationPayment {
  return { ...scope, id, method, reference_number: reference };
}
function gcash(reference = "ABC123456", id = "g1"): ReconciliationTransaction {
  return { ...scope, id, reference_number: reference, reference_occurrence_count: 1 };
}
function decide(p = payment(), transactions = [gcash()]) {
  return reconcilePayments(scope, [p], transactions)[0];
}

test("unique exact reference verifies and stores the payment/customer relationship", () => {
  expect(decide()).toEqual({ payment_id: "p1", gcash_transaction_id: "g1", status: "VERIFIED", reason: "REFERENCE_MATCH" });
});
test.each([[1300, 1300], [1300, 1299], [0, 9000]])("amounts %s and %s never alter reference verification", (paymentAmount, gcashAmount) => {
  const p = { ...payment(), amount: paymentAmount };
  const g = { ...gcash(), amount: gcashAmount };
  expect(decide(p, [g])).toMatchObject({ status: "VERIFIED", reason: "REFERENCE_MATCH", gcash_transaction_id: "g1" });
});
test("absent reference is not found", () => {
  expect(decide(payment("999999999"))).toMatchObject({ status: "NEEDS_REVIEW", reason: "REFERENCE_NOT_FOUND", gcash_transaction_id: null });
});
test.each([null, ""])("missing GCASH reference %s is review", (reference) => {
  expect(decide(payment(reference))).toMatchObject({ status: "NEEDS_REVIEW", reason: "MISSING_REFERENCE", gcash_transaction_id: null });
});
test("duplicate GCash reference cannot select a candidate even with a matching amount", () => {
  const candidates = [{ ...gcash(), amount: 1300 }, { ...gcash("ABC123456", "g2"), amount: 1299 }];
  const p = { ...payment(), amount: 1300 };
  expect(decide(p, candidates)).toMatchObject({ status: "NEEDS_REVIEW", reason: "DUPLICATE_REFERENCE", gcash_transaction_id: null });
});
test("duplicate occurrence flagged during import remains ambiguous", () => {
  expect(decide(payment(), [{ ...gcash(), reference_occurrence_count: 2 }])).toMatchObject({ reason: "DUPLICATE_REFERENCE", gcash_transaction_id: null });
});
test.each(["", "ABC123456"])("CASH skips matching with reference '%s'", (reference) => {
  expect(decide(payment(reference, "CASH"))).toMatchObject({ status: "CASH", reason: "CASH_PAYMENT", gcash_transaction_id: null });
});
test.each([null, "ABC123456"])("BANK skips matching with reference '%s'", (reference) => {
  expect(decide(payment(reference, "BANK"))).toMatchObject({ status: "BANK", reason: "BANK_MANUAL_VERIFICATION", gcash_transaction_id: null });
});
test("unknown method is never guessed or searched", () => {
  expect(decide(payment("ABC123456", "MYSTERY"))).toMatchObject({ status: "NEEDS_REVIEW", reason: "UNKNOWN_PAYMENT_METHOD", gcash_transaction_id: null });
});
test.each(["0045276500984", "0000203966985"])("leading zeros preserved for %s", (reference) => {
  expect(decide(payment(reference), [gcash(reference)])).toMatchObject({ status: "VERIFIED" });
});
test.each(["0045276500985", "5276500984", "45276500984", "00452765009840"])("similar or partial reference %s never matches", (reference) => {
  expect(decide(payment("0045276500984"), [gcash(reference)])).toMatchObject({ reason: "REFERENCE_NOT_FOUND", gcash_transaction_id: null });
});
test("reference case is significant", () => {
  expect(decide(payment("abc123456"))).toMatchObject({ reason: "REFERENCE_NOT_FOUND" });
});
test("two GCASH payments claiming the same reference both need review", () => {
  const results = reconcilePayments(scope, [payment(), payment("ABC123456", "GCASH", "p2")], [gcash()]);
  expect(results).toHaveLength(2);
  for (const result of results) expect(result).toMatchObject({ status: "NEEDS_REVIEW", reason: "DUPLICATE_PAYMENT_REFERENCE", gcash_transaction_id: null });
});
test("CASH and BANK references do not compete with a GCASH payment", () => {
  const results = reconcilePayments(scope, [payment(), payment("ABC123456", "CASH", "p2"), payment("ABC123456", "BANK", "p3")], [gcash()]);
  expect(results[0]?.status).toBe("VERIFIED");
});
test("unmatched GCash receives no payment or customer association and source stays unchanged", () => {
  const transactions = [gcash(), gcash("OTHER", "g2")];
  const original = structuredClone(transactions);
  const results = reconcilePayments(scope, [payment()], transactions);
  expect(results.filter((r) => r.gcash_transaction_id === "g2")).toEqual([]);
  expect(transactions).toEqual(original);
});
test("rerun is deterministic without accumulated logical results", () => {
  const first = reconcilePayments(scope, [payment()], [gcash()]);
  expect(reconcilePayments(scope, [payment()], [gcash()])).toEqual(first);
  expect(first).toHaveLength(1);
});
describe.each(["business_id", "verification_run_id"])("scope guard: %s", (field) => {
  test("rejects a payment outside the scope", () => {
    expect(() => reconcilePayments(scope, [{ ...payment(), [field]: "other" }], [gcash()])).toThrow("same business and verification run");
  });
  test("rejects a GCash transaction outside the scope even with an identical reference", () => {
    expect(() => reconcilePayments(scope, [payment()], [{ ...gcash(), [field]: "other" }])).toThrow("same business and verification run");
  });
});
test("summary counts derive from explicit statuses", () => {
  const results = reconcilePayments(scope, [payment(), payment(null, "GCASH", "p2"), payment(null, "CASH", "p3"), payment(null, "BANK", "p4"), payment(null, "OTHER", "p5")], [gcash()]);
  expect(summarizeMatches(results)).toEqual({ total: 5, verified: 1, needsReview: 2, cash: 1, bank: 1 });
});
test("duplicate input IDs are rejected instead of creating conflicting logical results", () => {
  expect(() => reconcilePayments(scope, [payment(), payment()], [gcash()])).toThrow("duplicate row IDs");
});
