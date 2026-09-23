import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { WorkspaceList } from "@/components/workspace/workspace-list";
import { getActiveWorkspace } from "@/lib/auth/workspace";

export default async function SettingsPage() {
  const { membership, workspaces } = await getActiveWorkspace();
  const activeWorkspaceId = membership?.businessId ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and workspace settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceList
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Create a new workspace for a separate business or company. You can
            switch between your workspaces at any time.
          </p>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </div>
  );
}