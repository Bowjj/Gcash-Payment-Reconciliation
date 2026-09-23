"use server";

import { getActiveWorkspace } from "@/lib/auth/workspace";
import { prepareGcashImport } from "@/lib/gcash/import";
import { gcashImportRows } from "@/lib/verification/import-rows";

export interface GcashUploadParseResult {
  readonly success: boolean;
  readonly filename?: string;
  readonly totalRows?: number;
  readonly validCount?: number;
  readonly errorCount?: number;
  readonly sheetsProcessed?: readonly string[];
  readonly errors?: readonly { rowIndex: number; field: string; message: string; sheetName?: string }[];
  readonly warnings?: readonly { rowIndex: number; field: string; message: string; sheetName?: string }[];
  readonly summary?: {
    readonly incomingCount: number;
    readonly outgoingCount: number;
    readonly unknownDirectionCount: number;
    readonly duplicateReferenceCount: number;
    readonly duplicateTransactionCount: number;
  };
  readonly preview?: readonly {
    readonly rowIndex: number;
    readonly transactionDate: string | null;
    readonly description: string;
    readonly referenceNumber: string;
    readonly amountCentavos: number;
    readonly direction: "incoming" | "outgoing" | "unknown";
    readonly referenceOccurrenceCount: number;
  }[];
}

export async function parseGcashUploadAction(
  formData: FormData,
): Promise<GcashUploadParseResult> {
  await getActiveWorkspace();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      success: false,
      errors: [{ rowIndex: 0, field: "file", message: "No file provided" }],
    };
  }

  const result = prepareGcashImport(Buffer.from(await file.arrayBuffer()));

  if (result.valid.length === 0) {
    return {
      success: false,
      filename: file.name,
      errors: [...result.parseErrors, ...result.errors],
    };
  }

  return {
    success: true,
    filename: file.name,
    totalRows: result.totalRows,
    validCount: result.valid.length,
    errorCount: result.parseErrors.length + result.errors.length,
    sheetsProcessed: result.sheetsProcessed,
    errors: [...result.parseErrors, ...result.errors],
    warnings: result.warnings,
    summary: result.summary,
    preview: result.preview.map((r) => ({
      rowIndex: r.rowIndex,
      transactionDate: r.transactionDate,
      description: r.description,
      referenceNumber: r.referenceNumber,
      amountCentavos: r.amountCentavos,
      direction: r.direction,
      referenceOccurrenceCount: r.referenceOccurrenceCount,
    })),
  };
}

export interface GcashConfirmImportResult {
  readonly success: boolean;
  readonly insertedCount?: number;
  readonly error?: string;
}

export async function confirmGcashImportAction(
  formData: FormData,
): Promise<GcashConfirmImportResult> {
  const file = formData.get("file");
  const verificationRunId = formData.get("verificationRunId");
  if (!(file instanceof File) || typeof verificationRunId !== "string") {
    return { success: false, error: "GCash file and verification run are required." };
  }
  const prepared = prepareGcashImport(Buffer.from(await file.arrayBuffer()));
  if (prepared.valid.length === 0) {
    return { success: false, error: "The GCash file has no valid transactions to import." };
  }

  const { user, workspace, membership } = await getActiveWorkspace();

  if (!workspace || !membership) {
    return { success: false, error: "No workspace found." };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  // Verify the verification run belongs to this workspace
  const { data: run, error: runError } = await supabase
    .from("verification_runs")
    .select("id")
    .eq("id", verificationRunId)
    .eq("business_id", membership.businessId)
    .single();

  if (runError || !run) {
    return { success: false, error: "Verification run not found" };
  }

  const transactions = gcashImportRows(prepared, file.name).map((r) => ({
    ...r,
    verification_run_id: run.id,
    business_id: membership.businessId,
    imported_by: user.id,
  }));

  const { error: insertError } = await supabase
    .from("gcash_transactions")
    .insert(transactions);

  if (insertError) {
    return {
      success: false,
      error: `Failed to insert GCash transactions: ${insertError.message}`,
    };
  }

  return { success: true, insertedCount: transactions.length };
}
