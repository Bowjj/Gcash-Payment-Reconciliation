"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";

interface AuthSidebarProps {
  user: User;
  workspace: { id: string; name: string } | null;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/verification/new", label: "New Verification" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];

export function AuthSidebar({ user, workspace }: AuthSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          Payment Reconciliation
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        {workspace ? (
          <p className="truncate text-xs font-medium">{workspace.name}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No workspace</p>
        )}
        <form action="/logout" method="post" className="mt-2">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start text-xs">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
