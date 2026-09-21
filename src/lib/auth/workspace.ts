import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function requireAuth() {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { user, supabase };
}

export async function getActiveWorkspace() {
  const { user, supabase } = await requireAuth();

  const { data: memberships, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(id, name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !memberships || memberships.length === 0) {
    return { user, workspace: null, membership: null };
  }

  const first = memberships[0];
  if (!first) {
    return { user, workspace: null, membership: null };
  }

  const workspace = Array.isArray(first.businesses)
    ? first.businesses[0]
    : first.businesses;

  return {
    user,
    workspace: workspace ?? null,
    membership: {
      businessId: first.business_id,
      role: first.role,
    },
  };
}
