import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getActiveWorkspace } from "@/lib/auth/workspace";

export default async function DashboardPage() {
  const { user, workspace } = await getActiveWorkspace();

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
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            No workspace assigned. Contact an administrator to get started.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Verification Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No verification runs yet. Go to{" "}
            <a href="/verification/new" className="underline hover:text-foreground">
              New Verification
            </a>{" "}
            to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
