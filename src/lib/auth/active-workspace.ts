export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";

export interface AppWorkspace {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export function selectActiveWorkspace(
  workspaces: readonly AppWorkspace[],
  activeBusinessId: string | undefined,
): AppWorkspace | null {
  if (activeBusinessId) {
    const match = workspaces.find((it) => it.id === activeBusinessId);
    if (match) return match;
  }

  return workspaces[0] ?? null;
}