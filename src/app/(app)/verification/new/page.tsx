import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { getActiveWorkspace } from "@/lib/auth/workspace";

import { VerificationFlow } from "./verification-flow";

export default async function NewVerificationPage() {
  const { workspace } = await getActiveWorkspace();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Verification
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload payment records and GCash statements for reconciliation.
        </p>
      </div>

      {workspace ? (
        <>
          <Card>
            <CardContent className="flex items-center gap-2 py-3">
              <span className="text-sm text-muted-foreground">Workspace:</span>
              <span className="text-sm font-medium">{workspace.name}</span>
            </CardContent>
          </Card>
          <VerificationFlow key={workspace.id} workspaceId={workspace.id} />
        </>
      ) : (
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
      )}
    </div>
  );
}
