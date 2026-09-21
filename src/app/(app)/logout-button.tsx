"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/actions";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(async () => {
          await logout();
        });
      }}
    >
      <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
        {isPending ? "Signing out..." : "Sign out"}
      </Button>
    </form>
  );
}
