"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/active-workspace";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ workspaceId: z.uuid(), confirmation: z.string().min(1).max(200) });
export async function deleteWorkspace(input: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const failure = { success: false as const, error: "Could not delete workspace. Please try again." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return failure;
  try {
    const { user, workspace, membership } = await getActiveWorkspace();
    if (!user || !workspace || workspace.id !== parsed.data.workspaceId || workspace.name !== parsed.data.confirmation
      || membership?.businessId !== workspace.id || membership.role !== "owner") return failure;
    const supabase = await createClient();
    // Name is also compared in the DELETE, so a concurrent rename cannot bypass confirmation.
    // Existing owner-only RLS and workspace/run cascades provide atomic cleanup.
    const { data, error } = await supabase.from("businesses").delete().eq("id", workspace.id)
      .eq("name", parsed.data.confirmation).select("id").maybeSingle();
    if (error || data?.id !== workspace.id) return failure;
  } catch { return failure; }
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
  // Resolve again from live membership data, using the normal deterministic fallback.
  const { workspace: remaining } = await getActiveWorkspace();
  if (remaining) cookieStore.set(ACTIVE_WORKSPACE_COOKIE, remaining.id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180, path: "/",
  });
  revalidatePath("/", "layout");
  return { success: true };
}
