import Link from "next/link";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { RunCard } from "@/components/verification/run-card";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { runListItemSchema, type RunListItem } from "@/lib/verification/run-list";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { user, workspace } = await getActiveWorkspace();
  let runs: RunListItem[] = [];
  if (workspace) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("verification_run_summaries").select("*")
      .eq("business_id", workspace.id).order("created_at", { ascending: false }).order("id").limit(5);
    if (error) throw new Error("Could not load recent verification runs.");
    runs = z.array(runListItemSchema).parse(data ?? []);
  }
  return <div className="mx-auto w-full max-w-6xl space-y-6">
    {params["workspaceDeleted"] === "1" && <p role="status" className="rounded-lg border p-3 text-sm">Workspace deleted.</p>}
    <header className="flex flex-wrap items-start justify-between gap-4"><div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="break-words text-sm text-muted-foreground">Welcome back, {user.email}</p>
    </div>{workspace && <Link className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" href="/verification/new">New Verification</Link>}</header>
    {workspace ? <Card><CardHeader><CardTitle className="text-base">Active Workspace</CardTitle></CardHeader><CardContent><p className="font-medium">{workspace.name}</p></CardContent></Card>
      : <Card><CardHeader><CardTitle className="text-base">Create a Workspace</CardTitle></CardHeader><CardContent>
        <p className="mb-4 text-sm text-muted-foreground">You don&apos;t have a workspace yet. Create one to start importing payment records and GCash statements.</p><CreateWorkspaceForm />
      </CardContent></Card>}
    <section aria-labelledby="recent-runs-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="recent-runs-title" className="font-semibold">Recent Verification Runs</h2>
        {workspace && <Link href="/history" className="rounded text-sm font-medium underline underline-offset-4">View History</Link>}
      </div>
      {runs.length > 0 ? <ul className="space-y-4">{runs.map((run) => <li key={run.id}><RunCard run={run} /></li>)}</ul>
        : <div className="space-y-3 rounded-xl border border-dashed bg-card p-6 text-center sm:p-10">
          <p className="font-medium">No verification runs yet.</p>
          <p className="text-sm text-muted-foreground">{workspace ? "Upload your Payment Records and GCash statement to begin." : "A workspace is required to start verifying payments."}</p>
          {workspace && <Link href="/verification/new" className="inline-flex min-h-11 items-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted">New Verification</Link>}
        </div>}
    </section>
  </div>;
}
