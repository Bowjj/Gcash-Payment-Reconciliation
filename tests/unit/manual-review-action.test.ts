import { beforeEach, expect, test, vi } from "vitest";
import { saveManualReview } from "@/app/(app)/verification/[runId]/payments/[paymentId]/actions";

const { rpc, active } = vi.hoisted(() => ({ rpc: vi.fn(), active: vi.fn() }));
vi.mock("@/lib/auth/workspace", () => ({ getActiveWorkspace: active }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const workspaceId = "10000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ workspaceId, runId: "20000000-0000-4000-8000-000000000001", paymentId: "30000000-0000-4000-8000-000000000001", revision: "0", status: "VERIFIED", note: "Confirmed manually" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  active.mockResolvedValue({ workspace: { id: workspaceId }, membership: { role: "owner" } });
  rpc.mockResolvedValue({ data: "action-id", error: null });
});
test("valid decision passes trusted workspace and revision, never client actor", async () => {
  const data = form();
  data.set("user_id", "forged-user");
  expect(await saveManualReview({}, data)).toHaveProperty("success");
  expect(rpc).toHaveBeenCalledWith("review_payment", {
    p_business_id: workspaceId, p_run_id: data.get("runId"), p_payment_id: data.get("paymentId"),
    p_status: "VERIFIED", p_note: "Confirmed manually", p_expected_revision: 0,
  });
});
test("changed active workspace rejects stale form", async () => {
  const data = form(); data.set("workspaceId", "10000000-0000-4000-8000-000000000002");
  expect(await saveManualReview({}, data)).toHaveProperty("error");
  expect(rpc).not.toHaveBeenCalled();
});
test("read-only member cannot submit a review", async () => {
  active.mockResolvedValue({ workspace: { id: workspaceId }, membership: { role: "member" } });
  expect(await saveManualReview({}, form())).toHaveProperty("error");
  expect(rpc).not.toHaveBeenCalled();
});
test("oversized note rejected before RPC", async () => {
  const data = form(); data.set("note", "x".repeat(1001));
  expect(await saveManualReview({}, data)).toHaveProperty("error");
  expect(rpc).not.toHaveBeenCalled();
});
test("concurrent revision conflict is surfaced without automatically retrying", async () => {
  rpc.mockResolvedValue({ error: { code: "PT409" } });
  expect(await saveManualReview({}, form())).toEqual({ error: expect.stringContaining("Another reviewer") });
  expect(rpc).toHaveBeenCalledTimes(1);
});
test("forged run/payment is reported as failure", async () => {
  rpc.mockResolvedValue({ error: { code: "42501" } });
  expect(await saveManualReview({}, form())).toHaveProperty("error");
});
