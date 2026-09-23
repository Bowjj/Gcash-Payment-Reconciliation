"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { setActiveWorkspace } from "@/lib/auth/actions";
import type { AppWorkspace } from "@/lib/auth/active-workspace";

interface WorkspaceSwitcherProps {
  readonly workspaces: readonly AppWorkspace[];
  readonly activeWorkspaceId: string | null;
  readonly compact?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  compact = false,
}: WorkspaceSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active =
    workspaces.find((it) => it.id === activeWorkspaceId) ?? workspaces[0] ?? null;

  function handleSelect(businessId: string) {
    setOpen(false);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("businessId", businessId);
      const result = await setActiveWorkspace(formData);
      if (!result.success && result.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className={`relative min-w-0 ${compact ? "flex-1" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">
          {active ? active.name : "Select workspace"}
        </span>
        <span aria-hidden className="text-xs text-muted-foreground">
          {isPending ? "..." : "▼"}
        </span>
      </button>

      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close workspace menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className={`absolute z-50 mt-1 w-64 rounded-lg border bg-background p-1 shadow-lg ${
              compact ? "right-0" : "left-0"
            }`}
          >
            {workspaces.map((it) => {
              const isActive = it.id === active?.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(it.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  disabled={isPending}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{it.name}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {it.role}
                    </span>
                  </span>
                  {isActive ? (
                    <span className="text-xs font-medium text-primary">✓</span>
                  ) : null}
                </button>
              );
            })}

            {workspaces.length > 0 ? (
              <div className="my-1 h-px bg-border" />
            ) : null}

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
            >
              + Create Workspace
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
