"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ workspaceId: z.uuid(), runId: z.uuid() });

export async function deleteVerificationRun(input: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const failure = { success: false as const, error: "Could not delete verification run." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure;
  try {
    const { user, workspace, membership } = await getActiveWorkspace();
    if (!user || !workspace || !membership || workspace.id !== parsed.data.workspaceId
      || membership.businessId !== workspace.id || !["owner", "admin"].includes(membership.role)) return failure;
    const supabase = await createClient();
    const { data: run, error: lookupError } = await supabase.from("verification_runs").select("id")
      .eq("id", parsed.data.runId).eq("business_id", workspace.id).maybeSingle();
    if (lookupError || !run) return failure;
    // One transactional DELETE, protected by owner/admin RLS. Existing scoped FKs
    // cascade through payments/GCash -> matches -> run-specific review audit.
    const { data: deleted, error } = await supabase.from("verification_runs").delete()
      .eq("id", parsed.data.runId).eq("business_id", workspace.id).select("id").maybeSingle();
    if (error || deleted?.id !== parsed.data.runId) return failure;
  } catch {
    return failure;
  }
  revalidatePath("/history");
  revalidatePath("/dashboard");
  revalidatePath(`/verification/${parsed.data.runId}`, "layout");
  return { success: true };
}
