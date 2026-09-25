import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/(app)/verification/[runId]/export/route";
import { createClient } from "@/lib/supabase/server";
import { exportFixture, exportRunId, exportBusinessId } from "../fixtures/export";
import { loadVerificationExport } from "@/lib/export/load-export";
import { XLSX_MIME } from "@/lib/export/export-data";

const { rpc, authorize } = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("@/lib/verification/results-server", () => ({ authorizedRun: authorize }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
const context = () => ({ params: Promise.resolve({ runId: exportRunId }) });
beforeEach(async () => {
  vi.clearAllMocks();
  const data = exportFixture();
  rpc.mockResolvedValue({ data, error: null });
  authorize.mockResolvedValue({ workspace: { id: exportBusinessId, name: data.workspaceName }, run: data.run, supabase: await createClient() });
});
test("download authorizes selected run and uses one scoped data RPC", async () => {
  const response = await GET(new Request(`http://localhost/verification/${exportRunId}/export?business_id=forged`), context());
  expect(authorize).toHaveBeenCalledWith(exportRunId);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_verification_export", { p_business_id: exportBusinessId, p_run_id: exportRunId });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(XLSX_MIME);
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="Payment_Verification_Sep_2026.xlsx"');
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000);
});
test("failed active-workspace authorization prevents all data retrieval", async () => {
  authorize.mockRejectedValue(new Error("run not found in active workspace"));
  await expect(GET(new Request("http://localhost/export"), context())).rejects.toThrow("active workspace");
  expect(rpc).not.toHaveBeenCalled();
});
test("server snapshot with a different run is rejected", async () => {
  const data = exportFixture(); data.run.id = "20000000-0000-4000-8000-000000000099";
  rpc.mockResolvedValue({ data, error: null });
  await expect(loadVerificationExport(await createClient(), exportBusinessId, exportRunId)).rejects.toThrow("scope mismatch");
});
test("foreign workspace rows fail closed before generation", async () => {
  const data = exportFixture(); const g = data.gcash[0]; if (g) g.business_id = "10000000-0000-4000-8000-000000000099";
  rpc.mockResolvedValue({ data, error: null });
  const response = await GET(new Request("http://localhost/export"), context());
  expect(response.status).toBe(500);
  expect(response.headers.get("content-type")).not.toBe(XLSX_MIME);
});
test("oversized runs return a clear 413 without a partial workbook", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "PT413", message: "Export supports at most 20,000 combined source rows." } });
  const response = await GET(new Request("http://localhost/export"), context());
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ error: expect.stringContaining("20,000") });
});
