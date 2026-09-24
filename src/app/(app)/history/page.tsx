import Link from "next/link";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { Pagination } from "@/components/verification/result-shared";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { runSummarySchema } from "@/lib/verification/results-data";
import { displayDate, resultsQuerySchema } from "@/lib/verification/review";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspace } = await getActiveWorkspace();
  const { page } = resultsQuerySchema.parse(await searchParams);
  let runs: z.infer<typeof runSummarySchema>[] = [];
  let total = 0;
  if (workspace) {
    const supabase = await createClient();
    const { data, count, error } = await supabase.from("verification_run_summaries").select("*", { count: "exact" })
      .eq("business_id", workspace.id).eq("status", "succeeded").order("completed_at", { ascending: false }).order("id")
      .range((page - 1) * 25, page * 25 - 1);
    if (error) throw new Error("Could not load verification history.");
    runs = z.array(runSummarySchema).parse(data ?? []);
    total = count ?? 0;
  }
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">History</h1><p className="text-sm text-muted-foreground">{workspace ? `Completed verification runs for ${workspace.name}. Counts reflect final decisions.` : "Create a workspace to view its verification history."}</p></header>
    {!workspace ? <Card><CardHeader><CardTitle>No Workspace Yet</CardTitle></CardHeader><CardContent><CreateWorkspaceForm /></CardContent></Card>
      : <Card><CardHeader><CardTitle>Verification Runs</CardTitle></CardHeader><CardContent className="space-y-5">
        {runs.length === 0 && <p className="text-sm text-muted-foreground">No completed verification runs yet in this workspace.</p>}
        <ul className="divide-y">{runs.map((run) => <li key={run.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><time className="text-sm">{displayDate(run.completed_at)}</time><Link className="text-sm font-medium underline" href={`/verification/${run.id}`}>View Results</Link></div>
          <p className="break-all text-sm">{run.payment_filename ?? "Payment file"} + {run.gcash_filename ?? "GCash file"}</p>
          <p className="text-sm text-muted-foreground">Total: {run.total} · Verified: {run.verified} · Needs Review: {run.needs_review} · Cash: {run.cash} · Bank: {run.bank}</p>
        </li>)}</ul>
        <Pagination page={page} total={total} href={(next) => `/history?page=${next}`} />
      </CardContent></Card>}
  </div>;
}
