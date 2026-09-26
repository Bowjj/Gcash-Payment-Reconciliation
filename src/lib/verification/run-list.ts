import { z } from "zod";
import { runSummarySchema } from "./results-data";

export const runListItemSchema = runSummarySchema.extend({ status: z.enum(["queued", "running", "succeeded", "failed"]) });
export type RunListItem = z.infer<typeof runListItemSchema>;
export const historyCategorySchema = z.enum(["all", "attention", "clear"]);
export type HistoryCategory = z.infer<typeof historyCategorySchema>;
export const historyRequestSchema = z.object({
  workspaceId: z.uuid(), category: historyCategorySchema,
  search: z.string().max(100).trim().refine((text) => !text.includes("*"), "Use filename text rather than * wildcards."),
  page: z.number().int().min(1).max(100000),
});
export interface HistoryPageData {
  runs: RunListItem[];
  total: number;
  page: number;
  category: HistoryCategory;
  search: string;
}
export function historyCategoryMatches(run: Pick<RunListItem, "status" | "needs_review">, category: HistoryCategory) {
  return category === "all" || (run.status === "succeeded" && (category === "attention" ? run.needs_review > 0 : run.needs_review === 0));
}
export function filenameSearchFilter(search: string) {
  const pattern = search.replace(/[\\%_]/g, (char) => `\\${char}`).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `payment_filename.ilike."%${pattern}%",gcash_filename.ilike."%${pattern}%"`;
}
