"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setActiveWorkspace } from "@/lib/auth/actions";
import type { AppWorkspace } from "@/lib/auth/active-workspace";

interface WorkspaceListProps {
  readonly workspaces: readonly AppWorkspace[];
  readonly activeWorkspaceId: string | null;
}

export function WorkspaceList({ workspaces, activeWorkspaceId }: WorkspaceListProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen(businessId: string) {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("businessId", businessId);
      const result = await setActiveWorkspace(formData);
      if (!result.success && result.error) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
    });
  }

  return (
    <div className="space-y-3">
      {workspaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workspaces yet. Create one below to get started.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {workspaces.map((it) => {
            const isActive = it.id === activeWorkspaceId;
            return (
              <li
                key={it.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {it.role}
                  </p>
                </div>
                {isActive ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    Active
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpen(it.id)}
                    disabled={isPending}
                  >
                    Open Workspace
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}