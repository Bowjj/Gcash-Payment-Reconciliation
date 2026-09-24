"use server";

import { revalidatePath } from "next/cache";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { reviewInputSchema } from "@/lib/verification/review";

export interface ReviewActionState { error?: string; success?: string }
export async function saveManualReview(_previous: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const { workspace, membership } = await getActiveWorkspace();
  const parsed = reviewInputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid decision or note. Notes must be at most 1,000 characters." };
  const input = parsed.data;
  if (!workspace || workspace.id !== input.workspaceId || !membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "The active workspace changed or you do not have permission to review this payment." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_payment", {
    p_business_id: workspace.id, p_run_id: input.runId, p_payment_id: input.paymentId,
    p_status: input.status, p_note: input.note, p_expected_revision: input.revision,
  });
  if (error) return { error: error.code === "PT409"
    ? "Another reviewer changed this decision. Refresh this page and inspect the latest audit entry before saving again."
    : "Could not save this review. Check that the payment belongs to this run and is eligible for manual review." };
  revalidatePath(`/verification/${input.runId}`);
  revalidatePath(`/verification/${input.runId}/payments/${input.paymentId}`);
  revalidatePath("/history");
  return { success: "Manual decision saved. The automated result is unchanged." };
}
