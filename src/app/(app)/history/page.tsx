import Link from "next/link";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { HistoryBrowser } from "@/components/verification/history-browser";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";
import { listHistoryRuns } from "@/lib/verification/history-server";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { workspace, membership } = await getActiveWorkspace();
  const params = await searchParams;
  const page = z.coerce.number().int().min(1).max(100000).catch(1).parse(params["page"]);
  const initial = workspace ? await listHistoryRuns(await createClient(), workspace.id, { category: "all", search: "", page }) : null;
  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div>
      <h1 className="text-2xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-muted-foreground">{workspace ? `All verification runs for ${workspace.name}. Completed run counts reflect final decisions.` : "Create a workspace to view its verification history."}</p>
    </div>{workspace && <Link href="/verification/new" className="inline-flex min-h-11 items-center rounded-lg border bg-card px-4 text-sm font-medium hover:bg-muted">New Verification</Link>}</header>
    {workspace && initial ? <HistoryBrowser key={workspace.id} workspaceId={workspace.id} initial={initial} canDelete={membership?.role === "owner" || membership?.role === "admin"} />
      : <Card><CardHeader><CardTitle>No Workspace Yet</CardTitle></CardHeader><CardContent><CreateWorkspaceForm /></CardContent></Card>}
  </div>;
}
