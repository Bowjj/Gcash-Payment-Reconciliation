import type { ReactNode } from "react";

import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { getActiveWorkspace } from "@/lib/auth/workspace";

import { AppNavigation, AuthSidebar } from "./auth-sidebar";
import { LogoutButton } from "./logout-button";
import { ThemeControl } from "@/components/theme/theme-control";

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
        <header className="space-y-3 border-b bg-card px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold md:hidden">VeriPay</span>
            <span className="hidden text-sm text-muted-foreground md:inline">Payment workspace</span>
            <ThemeControl />
          </div>
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              compact
            />
            <LogoutButton />
          </div>
          <AppNavigation mobile />
        </header>

        <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
