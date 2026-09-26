import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { filenameSearchFilter, historyCategoryMatches, runListItemSchema, type HistoryCategory, type HistoryPageData } from "./run-list";

export async function listHistoryRuns(
  supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string,
  options: { category: HistoryCategory; search: string; page: number },
): Promise<HistoryPageData> {
  let query = supabase.from("verification_run_summaries").select("*", { count: "exact" })
    .eq("business_id", workspaceId);
  if (options.category !== "all") query = query.eq("status", "succeeded");
  if (options.category === "attention") query = query.gt("needs_review", 0);
  if (options.category === "clear") query = query.eq("needs_review", 0);
  if (options.search) query = query.or(filenameSearchFilter(options.search));
  const { data, count, error } = await query.order("created_at", { ascending: false }).order("id")
    .range((options.page - 1) * 25, options.page * 25 - 1);
  if (error) throw new Error("Could not load verification history.");
  const runs = z.array(runListItemSchema).parse(data ?? []);
  if (runs.some((run) => run.business_id !== workspaceId || !historyCategoryMatches(run, options.category))) throw new Error("Unexpected history scope.");
  return { ...options, runs, total: count ?? 0 };
}
