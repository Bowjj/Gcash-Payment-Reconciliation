import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { reconcilePayments } from "./reconcile";

const scopedRow = z.object({ id: z.string(), business_id: z.string(), verification_run_id: z.string(), reference_number: z.string().nullable() });
const inputSchema = z.object({
  payments: z.array(scopedRow.extend({ method: z.string() })),
  gcash: z.array(scopedRow.extend({ reference_occurrence_count: z.number().int().positive() })),
});
const summarySchema = z.object({
  total: z.number().int().nonnegative(), verified: z.number().int().nonnegative(),
  needsReview: z.number().int().nonnegative(), cash: z.number().int().nonnegative(), bank: z.number().int().nonnegative(),
});

export async function reconcileVerificationRun(
  supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, runId: string,
) {
  const args = { p_business_id: businessId, p_run_id: runId };
  const { data, error } = await supabase.rpc("get_reconciliation_inputs", args);
  if (error) throw new Error("Could not read the saved verification datasets.");
  const inputs = inputSchema.parse(data);
  const results = reconcilePayments({ business_id: businessId, verification_run_id: runId }, inputs.payments, inputs.gcash);
  const { data: summary, error: commitError } = await supabase.rpc("commit_reconciliation", { ...args, p_results: results });
  if (commitError) throw new Error("Could not finalize reconciliation. Retry the same session.");
  return { summary: summarySchema.parse(summary), paymentCount: inputs.payments.length, gcashCount: inputs.gcash.length };
}
