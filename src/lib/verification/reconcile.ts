export type ReconciliationStatus = "VERIFIED" | "NEEDS_REVIEW" | "CASH" | "BANK";
export type ReconciliationReason =
  | "REFERENCE_MATCH" | "REFERENCE_NOT_FOUND" | "MISSING_REFERENCE"
  | "DUPLICATE_REFERENCE" | "DUPLICATE_PAYMENT_REFERENCE"
  | "CASH_PAYMENT" | "BANK_MANUAL_VERIFICATION" | "UNKNOWN_PAYMENT_METHOD";

export interface ReconciliationScope {
  readonly business_id: string;
  readonly verification_run_id: string;
}

export interface ReconciliationPayment extends ReconciliationScope {
  readonly id: string;
  readonly method: string;
  readonly reference_number: string | null;
}

export interface ReconciliationTransaction extends ReconciliationScope {
  readonly id: string;
  readonly reference_number: string | null;
  readonly reference_occurrence_count: number;
}

export interface PaymentMatch {
  readonly payment_id: string;
  readonly gcash_transaction_id: string | null;
  readonly status: ReconciliationStatus;
  readonly reason: ReconciliationReason;
}

export interface ReconciliationSummary {
  readonly total: number;
  readonly verified: number;
  readonly needsReview: number;
  readonly cash: number;
  readonly bank: number;
}

export function summarizeMatches(matches: readonly PaymentMatch[]): ReconciliationSummary {
  return {
    total: matches.length,
    verified: matches.filter((r) => r.status === "VERIFIED").length,
    needsReview: matches.filter((r) => r.status === "NEEDS_REVIEW").length,
    cash: matches.filter((r) => r.status === "CASH").length,
    bank: matches.filter((r) => r.status === "BANK").length,
  };
}

// Inputs contain the parser's normalized string identifiers; amounts intentionally have no role here.
export function reconcilePayments(
  scope: ReconciliationScope,
  payments: readonly ReconciliationPayment[],
  transactions: readonly ReconciliationTransaction[],
): PaymentMatch[] {
  const inScope = (row: ReconciliationScope) => row.business_id === scope.business_id && row.verification_run_id === scope.verification_run_id;
  if (payments.some((p) => !inScope(p)) || transactions.some((g) => !inScope(g))) {
    throw new Error("Reconciliation inputs must belong to the same business and verification run.");
  }
  if (new Set(payments.map((p) => p.id)).size !== payments.length ||
      new Set(transactions.map((g) => g.id)).size !== transactions.length) {
    throw new Error("Reconciliation inputs contain duplicate row IDs.");
  }
  const gcashByReference = new Map<string, ReconciliationTransaction[]>();
  const paymentReferences = new Map<string, number>();
  for (const transaction of transactions) {
    const ref = transaction.reference_number;
    if (ref) {
      const candidates = gcashByReference.get(ref);
      if (candidates) candidates.push(transaction);
      else gcashByReference.set(ref, [transaction]);
    }
  }
  for (const payment of payments) {
    const ref = payment.reference_number;
    if (payment.method === "GCASH" && ref) paymentReferences.set(ref, (paymentReferences.get(ref) ?? 0) + 1);
  }
  return payments.map((payment): PaymentMatch => {
    const decision = (status: ReconciliationStatus, reason: ReconciliationReason, gcashId: string | null = null): PaymentMatch => ({
      payment_id: payment.id, gcash_transaction_id: gcashId, status, reason,
    });
    if (payment.method === "CASH") return decision("CASH", "CASH_PAYMENT");
    if (payment.method === "BANK") return decision("BANK", "BANK_MANUAL_VERIFICATION");
    if (payment.method !== "GCASH") return decision("NEEDS_REVIEW", "UNKNOWN_PAYMENT_METHOD");
    const ref = payment.reference_number;
    if (!ref) return decision("NEEDS_REVIEW", "MISSING_REFERENCE");
    if ((paymentReferences.get(ref) ?? 0) > 1) return decision("NEEDS_REVIEW", "DUPLICATE_PAYMENT_REFERENCE");
    const candidates = gcashByReference.get(ref) ?? [];
    if (candidates.length === 0) return decision("NEEDS_REVIEW", "REFERENCE_NOT_FOUND");
    const candidate = candidates[0];
    if (candidates.length > 1 || !candidate || candidate.reference_occurrence_count > 1) {
      return decision("NEEDS_REVIEW", "DUPLICATE_REFERENCE");
    }
    return decision("VERIFIED", "REFERENCE_MATCH", candidate.id);
  });
}
