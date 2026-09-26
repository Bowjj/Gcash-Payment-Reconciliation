import { beforeEach, expect, test, vi } from "vitest";
import { deleteVerificationRun } from "@/app/(app)/history/delete-action";
import { runListFixture } from "../fixtures/run-list";

const { active, from, invalidate, query } = vi.hoisted(() => ({
  active: vi.fn(), from: vi.fn(), invalidate: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), delete: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock("@/lib/auth/workspace", () => ({ getActiveWorkspace: active }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("next/cache", () => ({ revalidatePath: invalidate }));
const request = { workspaceId: runListFixture.business_id, runId: runListFixture.id };
const context = { user: { id: "user" }, workspace: { id: request.workspaceId }, membership: { businessId: request.workspaceId, role: "owner" } };
const failure = { success: false, error: "Could not delete verification run." };
beforeEach(() => {
  vi.resetAllMocks();
  active.mockResolvedValue(context);
  from.mockReturnValue(query);
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.delete.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: { id: request.runId }, error: null });
});
test.each(["owner", "admin"])("%s deletes only the run in the server-resolved active workspace", async (role) => {
  active.mockResolvedValue({ ...context, membership: { ...context.membership, role } });
  expect(await deleteVerificationRun(request)).toEqual({ success: true });
  expect(query.delete).toHaveBeenCalledTimes(1);
  expect(from.mock.calls.every(([table]) => table === "verification_runs")).toBe(true);
  expect(query.eq).toHaveBeenCalledWith("id", request.runId);
  expect(query.eq).toHaveBeenCalledWith("business_id", context.workspace.id);
  expect(invalidate.mock.calls).toEqual([["/history"], ["/dashboard"], [`/verification/${request.runId}`, "layout"]]);
});
test.each(["member", "readonly", "", "forged"])("rejects unauthorized role %s before database access", async (role) => {
  active.mockResolvedValue({ ...context, membership: { ...context.membership, role } });
  expect(await deleteVerificationRun(request)).toEqual(failure);
  expect(from).not.toHaveBeenCalled();
});
test.each([{ user: null }, { workspace: null }, { membership: null }, { membership: { businessId: "foreign", role: "owner" } }])("rejects missing/inconsistent authentication scope %o", async (change) => {
  active.mockResolvedValue({ ...context, ...change });
  expect(await deleteVerificationRun(request)).toEqual(failure);
  expect(from).not.toHaveBeenCalled();
});
test.each([null, {}, { ...request, runId: "invalid" }, { ...request, workspaceId: "invalid" }])("rejects malformed request %o", async (input) => {
  expect(await deleteVerificationRun(input)).toEqual(failure);
  expect(from).not.toHaveBeenCalled();
});
test("forged or stale workspace does not issue deletion", async () => {
  expect(await deleteVerificationRun({ ...request, workspaceId: "10000000-0000-4000-8000-000000000099" })).toEqual(failure);
  expect(from).not.toHaveBeenCalled();
});
test("forged foreign/missing run UUID fails scoped lookup", async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  expect(await deleteVerificationRun(request)).toEqual(failure);
  expect(query.delete).not.toHaveBeenCalled();
});
test.each([{ data: null, error: null }, { data: null, error: { message: "SQL private details" } }])("does not pretend a failed/racing delete succeeded: %o", async (response) => {
  query.maybeSingle.mockResolvedValueOnce({ data: { id: request.runId }, error: null }).mockResolvedValueOnce(response);
  expect(await deleteVerificationRun(request)).toEqual(failure);
  expect(invalidate).not.toHaveBeenCalled();
});
test("authentication/service errors return a safe error", async () => {
  active.mockRejectedValue(new Error("private error"));
  expect(await deleteVerificationRun(request)).toEqual(failure);
  expect(from).not.toHaveBeenCalled();
});
