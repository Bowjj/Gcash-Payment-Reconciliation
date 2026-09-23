"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ACTIVE_WORKSPACE_COOKIE } from "./active-workspace";

const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 180,
  path: "/",
};

export interface CreateWorkspaceResult {
  readonly success: boolean;
  readonly error?: string;
}

export async function createWorkspace(
  _prevState: CreateWorkspaceResult | null,
  formData: FormData,
): Promise<CreateWorkspaceResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to create a workspace." };
  }

  const raw = formData.get("name");
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length === 0) {
    return { success: false, error: "Workspace name is required." };
  }

  const { data: business, error } = await supabase.rpc("create_business", {
    p_name: trimmed,
  });

  if (error) {
    return { success: false, error: `Failed to create workspace: ${error.message}` };
  }

  const businessId = getBusinessId(business);

  if (businessId) {
    const cookieStore = await cookies();
    cookieStore.set(
      ACTIVE_WORKSPACE_COOKIE,
      businessId,
      ACTIVE_WORKSPACE_COOKIE_OPTIONS,
    );
  }

  revalidatePath("/", "layout");
  return { success: true };
}

function getBusinessId(data: unknown): string | null {
  if (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof data.id === "string"
  ) {
    return data.id;
  }
  return null;
}

export interface SetActiveWorkspaceResult {
  readonly success: boolean;
  readonly error?: string;
}

export async function setActiveWorkspace(
  formData: FormData,
): Promise<SetActiveWorkspaceResult> {
  const rawBusinessId = formData.get("businessId");
  if (typeof rawBusinessId !== "string" || rawBusinessId.trim() === "") {
    return { success: false, error: "Workspace is required." };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("business_id", rawBusinessId)
    .maybeSingle();

  if (membershipError || !membership) {
    return { success: false, error: "Workspace not found." };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_WORKSPACE_COOKIE,
    rawBusinessId,
    ACTIVE_WORKSPACE_COOKIE_OPTIONS,
  );

  revalidatePath("/", "layout");
  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
