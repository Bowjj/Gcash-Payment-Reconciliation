import type { RunListItem } from "@/lib/verification/run-list";

export const runListFixture: RunListItem = {
  id: "20000000-0000-4000-8000-000000000001", business_id: "10000000-0000-4000-8000-000000000001",
  status: "succeeded", created_at: "2026-09-25T08:00:00Z", completed_at: "2026-09-25T08:01:00Z",
  payment_filename: "Payments_Sept.xlsx", gcash_filename: "GCash_Sept.xlsx", total: 9, verified: 3, needs_review: 4, cash: 1, bank: 1,
};
