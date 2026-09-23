import { z } from "zod";

import { parseCentavos } from "@/lib/money";

import { isValidPhotoUrl, normalizeMethod, type NormalizedMethod } from "./normalize";

export const paymentRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  customer: z.string().min(1, "Customer is required"),
  account: z.string().optional().default(""),
  billingPeriod: z.string().optional().default(""),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((value) => parseCentavos(value).success, {
      message: "Amount must be a non-negative number with at most two decimal places",
    }),
  method: z.string().min(1, "Method is required"),
  referenceNumber: z.string().optional().default(""),
  paymentDate: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  paidBy: z.string().optional().default(""),
  receivedBy: z.string().optional().default(""),
  photo: z.string().optional().default(""),
  createdAt: z.string().optional().default(""),
  raw: z.record(z.string(), z.unknown()).optional().default({}),
});

export type PaymentRowInput = z.infer<typeof paymentRowSchema>;

export interface ValidatedPayment {
  readonly rowIndex: number;
  readonly customer: string;
  readonly account: string;
  readonly billingPeriod: string;
  readonly amountCentavos: number;
  readonly method: NormalizedMethod;
  readonly referenceNumber: string;
  readonly paymentDate: string | null;
  readonly notes: string;
  readonly paidBy: string;
  readonly receivedBy: string;
  readonly photoUrl: string | null;
  readonly createdAt: string | null;
  readonly rawData: Record<string, unknown>;
}

export interface ValidationError {
  readonly rowIndex: number;
  readonly field: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: readonly ValidatedPayment[];
  readonly errors: readonly ValidationError[];
  readonly summary: {
    readonly total: number;
    readonly validCount: number;
    readonly errorCount: number;
    readonly gcashCount: number;
    readonly cashCount: number;
    readonly bankCount: number;
    readonly unknownMethodCount: number;
  };
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0] ?? null;
}

export function validateAndNormalize(
  rows: readonly PaymentRowInput[],
): ValidationResult {
  const valid: ValidatedPayment[] = [];
  const errors: ValidationError[] = [];
  let gcashCount = 0;
  let cashCount = 0;
  let bankCount = 0;
  let unknownMethodCount = 0;

  for (const row of rows) {
    const rowErrors: ValidationError[] = [];

    const rowResult = paymentRowSchema.safeParse(row);
    if (!rowResult.success) {
      for (const issue of rowResult.error.issues) {
        const path = issue.path.join(".");
        rowErrors.push({
          rowIndex: row.rowIndex,
          field: path || "unknown",
          message: issue.message,
        });
      }
    }

    const normalizedMethod = normalizeMethod(row.method);
    if (!normalizedMethod) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        field: "method",
        message: `Unknown payment method: "${row.method}"`,
      });
      unknownMethodCount++;
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    const method = normalizedMethod;
    if (!method) continue;

    if (method === "GCASH") gcashCount++;
    else if (method === "CASH") cashCount++;
    else if (method === "BANK") bankCount++;

    const amount = parseCentavos(row.amount);
    if (!amount.success) {
      errors.push({
        rowIndex: row.rowIndex,
        field: "amount",
        message: amount.error,
      });
      continue;
    }

    const photoUrl = isValidPhotoUrl(row.photo.trim()) ? row.photo.trim() : null;

    valid.push({
      rowIndex: row.rowIndex,
      customer: row.customer,
      account: row.account,
      billingPeriod: row.billingPeriod,
      amountCentavos: amount.centavos,
      method,
      referenceNumber: row.referenceNumber,
      paymentDate: parseDate(row.paymentDate),
      notes: row.notes,
      paidBy: row.paidBy,
      receivedBy: row.receivedBy,
      photoUrl,
      createdAt: parseDate(row.createdAt),
      rawData: row.raw,
    });
  }

  return {
    valid,
    errors,
    summary: {
      total: rows.length,
      validCount: valid.length,
      errorCount: errors.length,
      gcashCount,
      cashCount,
      bankCount,
      unknownMethodCount,
    },
  };
}
