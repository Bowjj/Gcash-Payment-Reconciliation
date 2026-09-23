import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { createClient } from "@/lib/supabase/server";

interface RecentRun {
  id: string;
  createdAt: string;
  status: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function DashboardPage() {
  const { user, workspace, membership } = await getActiveWorkspace();

  let recentRuns: RecentRun[] = [];
  if (workspace && membership) {
    const supabase = await createClient();
    const { data: runs } = await supabase
      .from("verification_runs")
      .select("id, created_at, status")
      .eq("business_id", membership.businessId)
      .order("created_at", { ascending: false })
      .limit(5);

    recentRuns = (runs ?? []).map((run) => ({
      id: run.id,
      createdAt: run.created_at,
      status: run.status,
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {user.email}
        </p>
      </div>

      {workspace ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{workspace.name}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create a Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              You don&apos;t have a workspace yet. Create one to start importing
              payment records and GCash statements.
            </p>
            <CreateWorkspaceForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Verification Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRuns.length > 0 ? (
            <ul className="divide-y">
              {recentRuns.map((run) => (
                <li
                  key={run.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {run.id.slice(0, 8)}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDate(run.createdAt)}
                  </span>
                  <span className="capitalize">{run.status}</span>
                </li>
              ))}
            </ul>
          ) : workspace ? (
            <p className="text-sm text-muted-foreground">
              No verification runs yet in this workspace. Go to{" "}
              <a
                href="/verification/new"
                className="underline hover:text-foreground"
              >
                New Verification
              </a>{" "}
              to get started.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              A workspace is required to start verifying payments.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}