import type { createClient } from "@/lib/supabase/server";
import { exportDataSchema, ExportLimitError } from "./export-data";

export async function loadVerificationExport(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, runId: string) {
  const { data, error } = await supabase.rpc("get_verification_export", { p_business_id: businessId, p_run_id: runId });
  if (error?.code === "PT413") throw new ExportLimitError(error.message);
  if (error) throw new Error("Could not read the authorized export snapshot.");
  const snapshot = exportDataSchema.parse(data);
  if (snapshot.run.id !== runId || snapshot.run.business_id !== businessId || [...snapshot.payments, ...snapshot.gcash].some((row) => row.business_id !== businessId || row.verification_run_id !== runId)) {
    throw new Error("Export scope mismatch.");
  }
  return snapshot;
}
