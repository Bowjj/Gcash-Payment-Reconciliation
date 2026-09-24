import { z } from "zod";
import { effectiveStatus, statusSchema, manualStatusSchema } from "./review";

export const runSummarySchema = z.object({
  id: z.uuid(), business_id: z.uuid(), created_at: z.string(), completed_at: z.string().nullable(),
  payment_filename: z.string().nullable(), gcash_filename: z.string().nullable(),
  total: z.number(), verified: z.number(), needs_review: z.number(), cash: z.number(), bank: z.number(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;
const paymentFields = z.object({
  id: z.uuid(), customer: z.string(), method: z.string(), amount_decimal: z.string(),
  reference_number: z.string().nullable(), payment_date: z.string().nullable(), photo_url: z.string().nullable(),
  automated_status: statusSchema, automated_reason: z.string(), effective_status: statusSchema,
  manual_status: manualStatusSchema.nullable(), row_index: z.number(),
});
const consistentStatus = (row: z.infer<typeof paymentFields>) => row.effective_status === effectiveStatus(row.automated_status, row.manual_status);
export const paymentResultSchema = paymentFields.refine(consistentStatus, "Inconsistent effective status");
export type PaymentResult = z.infer<typeof paymentResultSchema>;
export const paymentPageSchema = z.object({ total: z.number().int().nonnegative(), rows: z.array(paymentResultSchema) });
export const paymentDetailSchema = paymentFields.extend({
  account: z.string().nullable(), billing_period: z.string().nullable(), notes: z.string().nullable(),
  paid_by: z.string().nullable(), received_by: z.string().nullable(), created_at_source: z.string().nullable(),
  gcash_transaction_id: z.uuid().nullable(), review_revision: z.number().int(),
  manual_note: z.string().nullable(), reviewed_by: z.string().nullable(), reviewed_at: z.string().nullable(),
  raw_data: z.unknown(),
}).refine(consistentStatus, "Inconsistent effective status");
export const gcashResultSchema = z.object({
  id: z.uuid(), transaction_date: z.string().nullable(), description: z.string().nullable(),
  reference_number: z.string().nullable(), amount_decimal: z.string(), matched_customer: z.string().nullable(),
  row_index: z.number(), source_order: z.number(), raw_data: z.unknown(),
});
export type GcashResult = z.infer<typeof gcashResultSchema>;
export const auditSchema = z.object({
  id: z.uuid(), actor_id: z.uuid(), actor_email: z.string().nullable(), created_at: z.string(),
  previous_status: statusSchema, new_status: manualStatusSchema, note: z.string(), revision: z.number(),
});
