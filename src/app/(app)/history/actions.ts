"use server";

import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { listHistoryRuns } from "@/lib/verification/history-server";
import { historyRequestSchema, type HistoryPageData } from "@/lib/verification/run-list";

export async function searchHistory(input: unknown): Promise<{ success: true; data: HistoryPageData } | { success: false; error: string }> {
  const { workspace } = await getActiveWorkspace();
  const parsed = historyRequestSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Use filename text up to 100 characters, without * wildcards." };
  if (!workspace || workspace.id !== parsed.data.workspaceId) return { success: false, error: "Your active workspace changed. Reload History to continue." };
  try {
    return { success: true, data: await listHistoryRuns(await createClient(), workspace.id, parsed.data) };
  } catch {
    return { success: false, error: "Could not load verification history. Please try again." };
  }
}
