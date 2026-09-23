import type { ReactNode } from "react";

import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { getActiveWorkspace } from "@/lib/auth/workspace";

import { AuthSidebar } from "./auth-sidebar";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, membership, workspaces } = await getActiveWorkspace();
  const activeWorkspaceId = membership?.businessId ?? null;

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <AuthSidebar
        user={user}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col gap-3 border-b px-6 py-3 sm:flex-row sm:items-center sm:justify-between md:hidden">
          <span className="text-sm font-semibold">Payment Reconciliation</span>
          <div className="flex min-w-0 items-center gap-2">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              compact
            />
            <LogoutButton />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
