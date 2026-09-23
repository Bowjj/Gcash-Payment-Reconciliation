import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  ACTIVE_WORKSPACE_COOKIE,
  selectActiveWorkspace,
  type AppWorkspace,
} from "./active-workspace";

export { type AppWorkspace } from "./active-workspace";

interface MembershipRow {
  business_id: string;
  role: string;
  businesses: { id: string; name: string } | { id: string; name: string }[];
}

export async function requireAuth() {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { user, supabase };
}

function toWorkspaceList(memberships: readonly MembershipRow[]): AppWorkspace[] {
  const workspaces: AppWorkspace[] = [];

  for (const row of memberships) {
    const business = Array.isArray(row.businesses)
      ? row.businesses[0]
      : row.businesses;
    if (!business) continue;
    workspaces.push({
      id: row.business_id,
      name: business.name,
      role: row.role,
    });
  }

  return workspaces;
}

export async function getActiveWorkspace() {
  const { user, supabase } = await requireAuth();

  const { data: memberships, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const workspaces = toWorkspaceList(memberships ?? []);

  if (error) {
    return { user, workspace: null, membership: null, workspaces };
  }

  const cookieStore = await cookies();
  const activeBusinessId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active = selectActiveWorkspace(workspaces, activeBusinessId);

  return {
    user,
    workspace: active ? { id: active.id, name: active.name } : null,
    membership: active ? { businessId: active.id, role: active.role } : null,
    workspaces,
  };
}