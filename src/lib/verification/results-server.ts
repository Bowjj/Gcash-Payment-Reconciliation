import { notFound } from "next/navigation";
import { z } from "zod";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { runSummarySchema } from "./results-data";

export async function authorizedRun(runId: string) {
  const { workspace, membership } = await getActiveWorkspace();
  if (!workspace || !membership || !z.uuid().safeParse(runId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("verification_run_summaries").select("*")
    .eq("id", runId).eq("business_id", workspace.id).eq("status", "succeeded").maybeSingle();
  if (error) throw new Error("Could not load verification results.");
  if (!data) notFound();
  return { workspace, membership, supabase, run: runSummarySchema.parse(data) };
}
