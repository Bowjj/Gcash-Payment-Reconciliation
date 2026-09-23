import { z } from "zod";

export const gcashRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  sheetName: z.string().optional().default(""),
  transactionDate: z.string().optional().default(""),
  description: z.string().optional().default(""),
  referenceNumber: z.string().optional().default(""),
  amountCentavos: z.number().int().nonnegative().safe(),
  direction: z.enum(["incoming", "outgoing", "unknown"]),
  raw: z.record(z.string(), z.unknown()).optional().default({}),
});

export type GcashRowInput = z.infer<typeof gcashRowSchema>;

export interface ValidatedGcashTransaction {
  readonly rowIndex: number;
  readonly sheetName: string;
  readonly transactionDate: string | null;
  readonly description: string;
  readonly referenceNumber: string;
  readonly amountCentavos: number;
  readonly direction: "incoming" | "outgoing" | "unknown";
  readonly referenceOccurrenceCount: number;
  readonly rawData: Record<string, unknown>;
}

export interface GcashValidationError {
  readonly rowIndex: number;
  readonly field: string;
  readonly message: string;
}

export interface GcashValidationResult {
  readonly valid: readonly ValidatedGcashTransaction[];
  readonly errors: readonly GcashValidationError[];
  readonly summary: {
    readonly total: number;
    readonly validCount: number;
    readonly errorCount: number;
    readonly incomingCount: number;
    readonly outgoingCount: number;
    readonly unknownDirectionCount: number;
    readonly duplicateReferenceCount: number;
    readonly duplicateTransactionCount: number;
  };
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0] ?? null;
}

export function validateGcashRows(
  rows: readonly GcashRowInput[],
): GcashValidationResult {
  const valid: ValidatedGcashTransaction[] = [];
  const errors: GcashValidationError[] = [];
  let incomingCount = 0;
  let outgoingCount = 0;
  let unknownDirectionCount = 0;
  const referenceCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.referenceNumber) {
      referenceCounts.set(
        row.referenceNumber,
        (referenceCounts.get(row.referenceNumber) ?? 0) + 1,
      );
    }
  }
  const duplicateReferences = new Set(
    [...referenceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([reference]) => reference),
  );

  for (const row of rows) {
    const rowErrors: GcashValidationError[] = [];

    const rowResult = gcashRowSchema.safeParse(row);
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

    if (!row.referenceNumber) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        field: "referenceNumber",
        message: "Reference number is missing",
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    switch (row.direction) {
      case "incoming":
        incomingCount++;
        break;
      case "outgoing":
        outgoingCount++;
        break;
      default:
        unknownDirectionCount++;
        break;
    }

    valid.push({
      rowIndex: row.rowIndex,
      sheetName: row.sheetName,
      transactionDate: parseDate(row.transactionDate),
      description: row.description,
      referenceNumber: row.referenceNumber,
      amountCentavos: row.amountCentavos,
      direction: row.direction,
      referenceOccurrenceCount: referenceCounts.get(row.referenceNumber) ?? 1,
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
      incomingCount,
      outgoingCount,
      unknownDirectionCount,
      duplicateReferenceCount: duplicateReferences.size,
      duplicateTransactionCount: valid.filter(
        (row) => row.referenceOccurrenceCount > 1,
      ).length,
    },
  };
}
