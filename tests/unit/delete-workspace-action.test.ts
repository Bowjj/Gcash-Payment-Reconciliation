import { beforeEach, expect, test, vi } from "vitest";
import { deleteWorkspace } from "@/app/(app)/settings/delete-workspace-action";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/auth/active-workspace";

const { active, from, invalidate, cookie, query } = vi.hoisted(() => ({
  active: vi.fn(), from: vi.fn(), invalidate: vi.fn(), cookie: { set: vi.fn(), delete: vi.fn() },
  query: { delete: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock("@/lib/auth/workspace", () => ({ getActiveWorkspace: active }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("next/cache", () => ({ revalidatePath: invalidate }));
vi.mock("next/headers", () => ({ cookies: async () => cookie }));
const id = "10000000-0000-4000-8000-000000000001";
const remaining = "10000000-0000-4000-8000-000000000002";
const context = { user: { id: "user" }, workspace: { id, name: "My Workspace" }, membership: { businessId: id, role: "owner" } };
const request = { workspaceId: id, confirmation: "My Workspace" };
const failure = { success: false, error: "Could not delete workspace. Please try again." };
beforeEach(() => {
  vi.resetAllMocks(); active.mockResolvedValueOnce(context).mockResolvedValue({ workspace: { id: remaining } });
  from.mockReturnValue(query); query.delete.mockReturnValue(query); query.eq.mockReturnValue(query); query.select.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id }, error: null });
});
test("owner exact-name deletion uses RLS client and selects live remaining workspace", async () => {
  expect(await deleteWorkspace(request)).toEqual({ success: true });
  expect(from).toHaveBeenCalledExactlyOnceWith("businesses");
  expect(query.eq.mock.calls).toEqual([["id", id], ["name", "My Workspace"]]);
  expect(cookie.delete).toHaveBeenCalledWith(ACTIVE_WORKSPACE_COOKIE);
  expect(cookie.set).toHaveBeenCalledWith(ACTIVE_WORKSPACE_COOKIE, remaining, expect.objectContaining({ httpOnly: true, path: "/", sameSite: "lax" }));
  expect(invalidate).toHaveBeenCalledWith("/", "layout");
});
test("last workspace clears stale preference without assigning an invalid workspace", async () => {
  active.mockReset().mockResolvedValueOnce(context).mockResolvedValue({ workspace: null });
  expect(await deleteWorkspace(request)).toEqual({ success: true });
  expect(cookie.delete).toHaveBeenCalledWith(ACTIVE_WORKSPACE_COOKIE); expect(cookie.set).not.toHaveBeenCalled();
});
test.each(["admin", "member", "readonly", ""])("role %s cannot delete entire workspace", async (role) => {
  active.mockReset().mockResolvedValue({ ...context, membership: { businessId: id, role } });
  expect(await deleteWorkspace(request)).toEqual(failure); expect(from).not.toHaveBeenCalled();
});
test.each(["", "my workspace", "My Workspace ", " My Workspace", "Other Workspace"])("requires exact confirmation: '%s'", async (confirmation) => {
  expect(await deleteWorkspace({ ...request, confirmation })).toEqual(failure); expect(from).not.toHaveBeenCalled();
});
test("forged/stale workspace UUID is rejected even if the caller owns it elsewhere", async () => {
  expect(await deleteWorkspace({ ...request, workspaceId: remaining })).toEqual(failure); expect(from).not.toHaveBeenCalled();
});
test.each([null, {}, { workspaceId: "bad", confirmation: "My Workspace" }])("invalid request %o is rejected", async (input) => {
  expect(await deleteWorkspace(input)).toEqual(failure); expect(from).not.toHaveBeenCalled();
});
test.each([{ user: null }, { workspace: null }, { membership: null }])("unauthenticated or missing context %o cannot delete", async (change) => {
  active.mockReset().mockResolvedValue({ ...context, ...change });
  expect(await deleteWorkspace(request)).toEqual(failure); expect(from).not.toHaveBeenCalled();
});
test.each([{ data: null, error: null }, { data: null, error: { message: "secret SQL details" } }])("failed/renamed/revoked deletion does not update cookies or pretend success: %o", async (response) => {
  query.maybeSingle.mockResolvedValue(response);
  expect(await deleteWorkspace(request)).toEqual(failure); expect(cookie.delete).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
});
