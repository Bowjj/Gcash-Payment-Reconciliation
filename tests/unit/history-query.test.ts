import { beforeEach, expect, test, vi } from "vitest";
import { searchHistory } from "@/app/(app)/history/actions";
import { filenameSearchFilter, historyCategoryMatches, historyRequestSchema } from "@/lib/verification/run-list";
import { runListFixture } from "../fixtures/run-list";

const { active, from, query } = vi.hoisted(() => ({
  active: vi.fn(), from: vi.fn(), query: { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn() },
}));
vi.mock("@/lib/auth/workspace", () => ({ getActiveWorkspace: active }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
const request = { workspaceId: runListFixture.business_id, category: "all", search: "", page: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  active.mockResolvedValue({ workspace: { id: runListFixture.business_id } });
  from.mockReturnValue(query);
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.gt.mockReturnValue(query);
  query.or.mockReturnValue(query); query.order.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [runListFixture], count: 1, error: null });
});
test("All History uses one summary query scoped to active workspace without hiding unfinished runs", async () => {
  expect(await searchHistory(request)).toMatchObject({ success: true, data: { runs: [runListFixture], total: 1 } });
  expect(from).toHaveBeenCalledExactlyOnceWith("verification_run_summaries");
  expect(query.eq).toHaveBeenCalledWith("business_id", runListFixture.business_id);
  expect(query.eq).not.toHaveBeenCalledWith("status", "succeeded");
  expect(query.range).toHaveBeenCalledWith(0, 24);
});
test("Needs Attention filter uses persisted effective review count", async () => {
  expect(await searchHistory({ ...request, category: "attention" })).toMatchObject({ success: true });
  expect(query.gt).toHaveBeenCalledWith("needs_review", 0);
  expect(query.eq).toHaveBeenCalledWith("status", "succeeded");
});
test("No Outstanding Review allows cash and bank without calling them verified", async () => {
  const clear = { ...runListFixture, needs_review: 0 };
  query.range.mockResolvedValue({ data: [clear], count: 1, error: null });
  expect(await searchHistory({ ...request, category: "clear" })).toMatchObject({ success: true, data: { runs: [clear] } });
  expect(query.eq).toHaveBeenCalledWith("needs_review", 0);
  expect(query.eq).toHaveBeenCalledWith("status", "succeeded");
  expect(historyCategoryMatches(clear, "clear")).toBe(true);
});
test("filename search and pagination combine with category filtering on the server", async () => {
  await searchHistory({ ...request, category: "attention", search: "GCash_Sept.xlsx", page: 2 });
  expect(query.or).toHaveBeenCalledWith(filenameSearchFilter("GCash_Sept.xlsx"));
  expect(query.gt).toHaveBeenCalledWith("needs_review", 0);
  expect(query.range).toHaveBeenCalledWith(25, 49);
});
test("filename LIKE patterns escape literal underscores and percent signs", () => {
  expect(filenameSearchFilter("100%_paid")).toBe('payment_filename.ilike."%100\\\\%\\\\_paid%",gcash_filename.ilike."%100\\\\%\\\\_paid%"');
});
test("quoted filename search remains a quoted PostgREST value", () => {
  expect(filenameSearchFilter('report",other')).toBe('payment_filename.ilike."%report\\",other%",gcash_filename.ilike."%report\\",other%"');
});
test("stale or forged workspace request does not issue a database query", async () => {
  expect(await searchHistory({ ...request, workspaceId: "10000000-0000-4000-8000-000000000099" })).toMatchObject({ success: false });
  expect(from).not.toHaveBeenCalled();
});
test("missing active workspace does not issue a database query", async () => {
  active.mockResolvedValue({ workspace: null });
  expect(await searchHistory(request)).toMatchObject({ success: false });
  expect(from).not.toHaveBeenCalled();
});
test.each([{ page: -1 }, { category: "forged" }, { search: "x".repeat(101) }, { search: "*.xlsx" }])("invalid query is rejected: %o", async (change) => {
  expect(historyRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  expect(await searchHistory({ ...request, ...change })).toMatchObject({ success: false });
  expect(from).not.toHaveBeenCalled();
});
test("unexpected foreign rows are not returned to the browser", async () => {
  query.range.mockResolvedValue({ data: [{ ...runListFixture, business_id: "10000000-0000-4000-8000-000000000099" }], count: 1, error: null });
  expect(await searchHistory(request)).toMatchObject({ success: false });
});
test("empty result is a normal response", async () => {
  query.range.mockResolvedValue({ data: [], count: 0, error: null });
  expect(await searchHistory(request)).toMatchObject({ success: true, data: { runs: [], total: 0 } });
});
test.each(["queued", "running", "failed"] as const)("All includes %s runs, without treating them as completed review results", async (status) => {
  const run = { ...runListFixture, status, completed_at: null, needs_review: 0 };
  query.range.mockResolvedValue({ data: [run], count: 1, error: null });
  expect(await searchHistory(request)).toMatchObject({ success: true, data: { runs: [run] } });
  expect(historyCategoryMatches(run, "all")).toBe(true);
  expect(historyCategoryMatches(run, "attention")).toBe(false);
  expect(historyCategoryMatches(run, "clear")).toBe(false);
});
