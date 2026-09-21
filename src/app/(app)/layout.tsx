import type { ReactNode } from "react";

import { getActiveWorkspace } from "@/lib/auth/workspace";

import { AuthSidebar } from "./auth-sidebar";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, workspace } = await getActiveWorkspace();

  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <AuthSidebar user={user} workspace={workspace} />

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3 md:hidden">
          <span className="text-sm font-semibold">Payment Reconciliation</span>
          <LogoutButton />
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
