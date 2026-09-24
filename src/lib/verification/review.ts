import { z } from "zod";
import { isValidPhotoUrl } from "@/lib/payments/normalize";
import { formatCentavos, parseCentavos } from "@/lib/money";
import type { ReconciliationStatus } from "./reconcile";

export const statusSchema = z.enum(["VERIFIED", "NEEDS_REVIEW", "CASH", "BANK"]);
export const manualStatusSchema = z.enum(["VERIFIED", "NEEDS_REVIEW"]);
export const reviewInputSchema = z.object({
  workspaceId: z.uuid(), runId: z.uuid(), paymentId: z.uuid(),
  status: manualStatusSchema,
  note: z.string().max(1000, "Use at most 1,000 characters for the note.").trim().default(""),
  revision: z.coerce.number().int().min(0).max(2147483646),
});
export const resultsQuerySchema = z.object({
  status: z.enum(["ALL", "VERIFIED", "NEEDS_REVIEW", "CASH", "BANK"]).catch("ALL"),
  q: z.string().max(100).trim().catch(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  sort: z.enum(["source", "customer", "payment_date", "status"]).catch("source"),
  view: z.enum(["payments", "gcash"]).catch("payments"),
});
export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

export function effectiveStatus(automated: ReconciliationStatus, manual: "VERIFIED" | "NEEDS_REVIEW" | null): ReconciliationStatus {
  return automated === "NEEDS_REVIEW" && manual ? manual : automated;
}
export function canReview(role: string, automated: string) {
  return (role === "owner" || role === "admin") && automated === "NEEDS_REVIEW";
}
export function proofHref(value: string | null) {
  return value && isValidPhotoUrl(value) ? value.trim() : null;
}
export function displayMoney(value: string) {
  const parsed = parseCentavos(value);
  return parsed.success ? `₱${formatCentavos(parsed.centavos)}` : "—";
}
export function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }) : "—";
}
export function matchesResult(row: { customer: string; reference_number: string | null; effective_status: string }, query: Pick<ResultsQuery, "status" | "q">) {
  const term = query.q.toLowerCase();
  return (query.status === "ALL" || row.effective_status === query.status) &&
    (row.customer.toLowerCase().includes(term) || (row.reference_number ?? "").toLowerCase().includes(term));
}

export const statusLabels: Record<ReconciliationStatus, string> = {
  VERIFIED: "Verified", NEEDS_REVIEW: "Needs Review", CASH: "Cash", BANK: "Bank",
};
export const reasonMessages: Record<string, string> = {
  REFERENCE_MATCH: "One unique exact reference matches the uploaded GCash statement. Amount differences do not affect verification.",
  REFERENCE_NOT_FOUND: "Reference was not found in the uploaded GCash statement.",
  MISSING_REFERENCE: "This GCash payment does not contain a usable reference number.",
  DUPLICATE_REFERENCE: "More than one source GCash transaction uses this reference. No candidate was selected automatically.",
  DUPLICATE_PAYMENT_REFERENCE: "More than one Payment record is claiming this GCash reference.",
  CASH_PAYMENT: "Cash payments are not searched against GCash.",
  BANK_MANUAL_VERIFICATION: "Bank payments are not searched against GCash and require separate bank verification.",
  UNKNOWN_PAYMENT_METHOD: "The payment method could not be safely identified.",
};
