"use server";

import { getActiveWorkspace } from "@/lib/auth/workspace";
import { paymentImportRows } from "@/lib/verification/import-rows";
import { preparePaymentImport } from "@/lib/payments/import";

export interface UploadParseResult {
  readonly success: boolean;
  readonly filename?: string;
  readonly totalRows?: number;
  readonly validCount?: number;
  readonly errorCount?: number;
  readonly missingHeaders?: readonly string[];
  readonly errors?: readonly { rowIndex: number; field: string; message: string }[];
  readonly warnings?: readonly { rowIndex: number; field: string; message: string }[];
  readonly summary?: {
    readonly gcashCount: number;
    readonly cashCount: number;
    readonly bankCount: number;
    readonly unknownMethodCount: number;
  };
  readonly preview?: readonly {
    readonly rowIndex: number;
    readonly customer: string;
    readonly account: string;
    readonly billingPeriod: string;
    readonly amountCentavos: number;
    readonly method: string;
    readonly referenceNumber: string;
    readonly paymentDate: string | null;
    readonly photoUrl: string | null;
  }[];
}

export async function parseUploadAction(
  formData: FormData,
): Promise<UploadParseResult> {
  await getActiveWorkspace();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, errors: [{ rowIndex: 0, field: "file", message: "No file provided" }] };
  }

  const result = preparePaymentImport(Buffer.from(await file.arrayBuffer()));

  if (result.missingHeaders.length > 0 && result.valid.length === 0) {
    return {
      success: false,
      filename: file.name,
      errors: result.parseErrors,
      missingHeaders: result.missingHeaders,
    };
  }

  const errors = [...result.parseErrors, ...result.errors];

  return {
    success: true,
    filename: file.name,
    totalRows: result.totalRows,
    validCount: result.valid.length,
    errorCount: errors.length,
    missingHeaders: result.missingHeaders,
    errors,
    warnings: result.warnings,
    summary: result.summary,
    preview: result.preview.map((r) => ({
      rowIndex: r.rowIndex,
      customer: r.customer,
      account: r.account,
      billingPeriod: r.billingPeriod,
      amountCentavos: r.amountCentavos,
      method: r.method,
      referenceNumber: r.referenceNumber,
      paymentDate: r.paymentDate,
      photoUrl: r.photoUrl,
    })),
  };
}

export interface ConfirmImportResult {
  readonly success: boolean;
  readonly verificationRunId?: string;
  readonly insertedCount?: number;
  readonly error?: string;
}

export async function confirmImportAction(
  formData: FormData,
): Promise<ConfirmImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, error: "No payment file provided." };
  }

  const prepared = preparePaymentImport(Buffer.from(await file.arrayBuffer()));
  if (prepared.missingHeaders.length > 0 && prepared.valid.length === 0) {
    return { success: false, error: "The payment file is missing required headers." };
  }

  if (prepared.valid.length === 0) {
    return { success: false, error: "The payment file has no valid rows to import." };
  }

  const { workspace, membership } = await getActiveWorkspace();

  if (!workspace || !membership) {
    return { success: false, error: "No workspace found. Create a workspace first." };
  }

  const supabase = await import("@/lib/supabase/server").then((m) =>
    m.createClient(),
  );

  const payments = paymentImportRows(prepared, file.name);

  const { data: verificationRunId, error: insertError } = await supabase.rpc(
    "create_payment_import",
    {
      p_business_id: membership.businessId,
      p_rows: payments,
    },
  );

  if (insertError || typeof verificationRunId !== "string") {
    return {
      success: false,
      error: `Failed to insert payments: ${insertError?.message ?? "No verification run was returned"}`,
    };
  }

  return { success: true, verificationRunId, insertedCount: payments.length };
}
