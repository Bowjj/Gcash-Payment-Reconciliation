"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { logout } from "@/lib/auth/actions";
import type { AppWorkspace } from "@/lib/auth/active-workspace";
import type { User } from "@supabase/supabase-js";

interface AuthSidebarProps {
  user: User;
  workspaces: readonly AppWorkspace[];
  activeWorkspaceId: string | null;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/verification/new", label: "New Verification" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function AuthSidebar({ user, workspaces, activeWorkspaceId }: AuthSidebarProps) {

  return (
    <aside aria-label="Workspace sidebar" className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:self-start md:flex-col md:overflow-y-auto">
      <div className="flex min-h-16 shrink-0 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          Payment Reconciliation
        </span>
      </div>

      <div className="flex-1"><AppNavigation /></div>

      <div className="border-t p-4">
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
        <form action={logout} className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start text-xs">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}

export function AppNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"} className={mobile ? "flex flex-wrap gap-1 md:hidden" : "space-y-1 p-3"}>
    {navItems.map((item) => {
      const isActive = pathname.startsWith(item.href) || (item.href === "/history" && pathname.startsWith("/verification/") && !pathname.startsWith("/verification/new"));
      return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}
        className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-primary font-semibold text-primary-foreground underline underline-offset-4" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        {item.label}
      </Link>;
    })}
  </nav>;
}
