"use server";

import { redirect } from "next/navigation";

import { parseWorkbook } from "@/lib/excel/parser";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { validateAndNormalize } from "@/lib/payments/schema";

export interface UploadParseResult {
  readonly success: boolean;
  readonly filename?: string;
  readonly totalRows?: number;
  readonly validCount?: number;
  readonly errorCount?: number;
  readonly missingHeaders?: readonly string[];
  readonly errors?: readonly { rowIndex: number; field: string; message: string }[];
  readonly summary?: {
    readonly gcashCount: number;
    readonly cashCount: number;
    readonly bankCount: number;
    readonly unknownMethodCount: number;
  };
  readonly preview?: readonly {
    readonly rowIndex: number;
    readonly customer: string;
    readonly amount: number;
    readonly method: string;
    readonly referenceNumber: string;
    readonly paymentDate: string | null;
    readonly photoUrl: string | null;
  }[];
}

export async function parseUploadAction(
  formData: FormData,
): Promise<UploadParseResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, errors: [{ rowIndex: 0, field: "file", message: "No file provided" }] };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parseResult = parseWorkbook(buffer);

  if (parseResult.missingHeaders.length > 0 && parseResult.rows.length === 0) {
    return {
      success: false,
      filename: file.name,
      errors: parseResult.errors,
      missingHeaders: parseResult.missingHeaders,
    };
  }

  const { valid, errors, summary } = validateAndNormalize(parseResult.rows);

  return {
    success: true,
    filename: file.name,
    totalRows: parseResult.totalRows,
    validCount: valid.length,
    errorCount: errors.length,
    missingHeaders: parseResult.missingHeaders,
    errors,
    summary,
    preview: valid.slice(0, 50).map((r) => ({
      rowIndex: r.rowIndex,
      customer: r.customer,
      amount: r.amount,
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
  rows: readonly {
    readonly rowIndex: number;
    readonly customer: string;
    readonly account: string;
    readonly billingPeriod: string;
    readonly amount: number;
    readonly method: string;
    readonly referenceNumber: string;
    readonly paymentDate: string | null;
    readonly notes: string;
    readonly paidBy: string;
    readonly receivedBy: string;
    readonly photoUrl: string | null;
    readonly createdAt: string | null;
  }[],
  filename: string,
): Promise<ConfirmImportResult> {
  const { user, workspace, membership } = await getActiveWorkspace();

  if (!workspace || !membership) {
    return { success: false, error: "No workspace found. Create a workspace first." };
  }

  const supabase = await import("@/lib/supabase/server").then((m) =>
    m.createClient(),
  );

  const { data: run, error: runError } = await supabase
    .from("verification_runs")
    .insert({
      business_id: membership.businessId,
      requested_by: user.id,
      status: "queued",
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { success: false, error: "Failed to create verification run" };
  }

  const payments = rows.map((r) => ({
    verification_run_id: run.id,
    business_id: membership.businessId,
    imported_by: user.id,
    customer: r.customer,
    account: r.account || null,
    billing_period: r.billingPeriod || null,
    amount: r.amount,
    method: r.method,
    reference_number: r.referenceNumber || null,
    payment_date: r.paymentDate || null,
    notes: r.notes || null,
    paid_by: r.paidBy || null,
    received_by: r.receivedBy || null,
    photo_url: r.photoUrl || null,
    created_at_source: r.createdAt || null,
    row_index: r.rowIndex,
    raw_data: { filename },
  }));

  const { error: insertError } = await supabase.from("payments").insert(payments);

  if (insertError) {
    return { success: false, error: `Failed to insert payments: ${insertError.message}` };
  }

  redirect(`/verification/${run.id}`);
}
