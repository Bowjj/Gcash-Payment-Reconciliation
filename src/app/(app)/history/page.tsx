import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

interface HistoryRun {
  id: string;
  createdAt: string;
  status: string;
  paymentCount: number;
  gcashCount: number;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function HistoryPage() {
  const { workspace, membership, workspaces } = await getActiveWorkspace();

  const runs: HistoryRun[] = [];
  if (workspace && membership) {
    const supabase = await createClient();
    const [runsResult, paymentsResult, gcashResult] = await Promise.all([
      supabase
        .from("verification_runs")
        .select("id, created_at, status")
        .eq("business_id", membership.businessId)
        .order("created_at", { ascending: false }),
      supabase.from("payments").select("id, verification_run_id"),
      supabase.from("gcash_transactions").select("id, verification_run_id"),
    ]);

    const paymentCounts = new Map<string, number>();
    for (const row of paymentsResult.data ?? []) {
      paymentCounts.set(
        row.verification_run_id,
        (paymentCounts.get(row.verification_run_id) ?? 0) + 1,
      );
    }

    const gcashCounts = new Map<string, number>();
    for (const row of gcashResult.data ?? []) {
      gcashCounts.set(
        row.verification_run_id,
        (gcashCounts.get(row.verification_run_id) ?? 0) + 1,
      );
    }

    for (const run of runsResult.data ?? []) {
      runs.push({
        id: run.id,
        createdAt: run.created_at,
        status: run.status,
        paymentCount: paymentCounts.get(run.id) ?? 0,
        gcashCount: gcashCounts.get(run.id) ?? 0,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          {workspace
            ? `Verification runs for ${workspace.name}`
            : "View past verification runs and their results."}
        </p>
      </div>

      {!workspace ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Workspace Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a workspace before starting a verification.
            </p>
            <CreateWorkspaceForm />
          </CardContent>
        </Card>
      ) : runs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="grid grid-cols-2 gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(run.createdAt)}
                  </span>
                  <span>
                    {run.paymentCount} payments
                  </span>
                  <span>
                    {run.gcashCount} GCash
                  </span>
                  <span className="capitalize">{run.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No verification runs yet in this workspace.
          </CardContent>
        </Card>
      )}

      {workspace && workspaces.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          Showing runs for {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"}.
          Use the workspace switcher to view another workspace.
        </p>
      ) : null}
    </div>
  );
}