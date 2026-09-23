"use server";

import { revalidatePath } from "next/cache";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { preparePaymentImport } from "@/lib/payments/import";
import { prepareGcashImport } from "@/lib/gcash/import";
import { createClient } from "@/lib/supabase/server";
import { paymentImportRows, gcashImportRows } from "@/lib/verification/import-rows";
import { reconcileVerificationRun } from "@/lib/verification/run-reconciliation";
import type { ReconciliationSummary } from "@/lib/verification/reconcile";

export type VerifyUploadsResult =
  | { success: true; verificationRunId: string; paymentCount: number; gcashCount: number; summary: ReconciliationSummary }
  | { success: false; error: string; verificationRunId?: string };

export async function verifyUploadsAction(formData: FormData): Promise<VerifyUploadsResult> {
  const { workspace } = await getActiveWorkspace();
  if (!workspace || formData.get("workspaceId") !== workspace.id) {
    return { success: false, error: "The active workspace changed. Reload New Verification and select your files again." };
  }
  const payment = formData.get("payment");
  const gcash = formData.get("gcash");
  const sessionId = formData.get("sessionId");
  if (!(payment instanceof File) || !(gcash instanceof File) ||
      typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return { success: false, error: "Both files and a verification session are required." };
  }
  if (payment.size > 10 * 1024 * 1024 || gcash.size > 10 * 1024 * 1024) {
    return { success: false, error: "Each file must be 10 MB or smaller." };
  }
  const payments = preparePaymentImport(Buffer.from(await payment.arrayBuffer()));
  const transactions = prepareGcashImport(Buffer.from(await gcash.arrayBuffer()));
  if (!payments.valid.length || !transactions.valid.length) {
    return { success: false, error: "Both files must contain valid rows. Review the validation messages." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_dual_file_import", {
    p_business_id: workspace.id,
    p_session_id: sessionId,
    p_payments: paymentImportRows(payments, payment.name),
    p_gcash: gcashImportRows(transactions, gcash.name),
  });
  if (error || typeof data !== "string") {
    return { success: false, error: "Could not save both datasets. Retry with the same files." };
  }
  try {
    const reconciliation = await reconcileVerificationRun(supabase, workspace.id, data);
    revalidatePath("/history");
    revalidatePath("/dashboard");
    return { success: true, verificationRunId: data, ...reconciliation };
  } catch {
    return { success: false, verificationRunId: data, error: "Both files are saved, but reconciliation has not completed. Retry Verify Payments to resume this same run." };
  }
}
