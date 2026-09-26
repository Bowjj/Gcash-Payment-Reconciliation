import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { weeklyPayments, weeklySource } from "../fixtures/weekly-gcash";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `weekly-${randomUUID()}@example.com`;
const password = "Local-weekly-gcash-123";
let userId = "";
async function workspace(page: Page) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/settings"); const name = `Weekly ${randomUUID()}`;
  await page.getByLabel("Workspace name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.locator("aside").getByRole("button", { name, exact: true })).toBeVisible();
}
async function cycle(page: Page, bytes: Buffer, customer: string, reference: string) {
  await page.goto("/verification/new");
  const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  await page.getByRole("region", { name: "Payment Records", exact: true }).locator('input[type="file"]').setInputFiles({ name: "Weekly Payments.xlsx", mimeType, buffer: await weeklyPayments(customer, reference) });
  await page.getByRole("region", { name: "GCash Statement", exact: true }).locator('input[type="file"]').setInputFiles({ name: "Weekly GCash - Matched.xlsx", mimeType, buffer: bytes });
  await page.getByRole("button", { name: "Verify Payments", exact: true }).click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verification Results", exact: true })).toBeVisible();
  const runId = new URL(page.url()).pathname.split("/")[2] ?? "";
  const responsePromise = page.waitForResponse((r) => r.url().includes(`/verification/${runId}/export?file=gcash`));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GCash", exact: true }).click();
  const response = await responsePromise; expect(response.status()).toBe(200);
  const download = await downloadPromise; expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream(); if (!stream) throw new Error("Empty download");
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const output = Buffer.concat(chunks); const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(output).buffer);
  const sheet = book.getWorksheet("Weekly GCash"); if (!sheet) throw new Error("Missing weekly sheet");
  const columns: number[] = []; sheet.getRow(1).eachCell((c, n) => { if (c.text === "Matched Customer") columns.push(n); });
  expect(columns).toHaveLength(1); const annotation = columns[0]; if (!annotation) throw new Error("Missing annotation");
  return { runId, output, book, sheet, annotation, conflicts: response.headers()["x-gcash-annotation-conflicts"] };
}
test.describe("Weekly GCash operational cycle", () => {
  test.setTimeout(180000);
  test.beforeAll(async () => {
    const result = await db.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error; userId = result.data.user.id;
  });
  test.afterAll(async () => {
    if (!userId) return;
    const deleted = await db.from("businesses").delete().eq("created_by", userId); if (deleted.error) throw deleted.error;
    const user = await db.auth.admin.deleteUser(userId); if (user.error) throw user.error;
  });
  test("four real upload/persist/reconcile/download/re-upload cycles preserve names, amounts, rows and one column", async ({ page }) => {
    await workspace(page);
    let bytes = await weeklySource([10, 11], [["Existing Customer A", "Existing Customer A"], ["", "Existing Customer B"], [], []]);
    const expected = ["Existing Customer A", "Existing Customer B", "", ""];
    for (const [index, [ref, name]] of [["C", "New Customer C"], ["D", "New Customer D"], ["0045276500984", "Jake Tirana"], ["A", "Existing Customer A"]].entries()) {
      if (!ref || !name) throw new Error("Missing cycle");
      const result = await cycle(page, bytes, name, ref);
      if (index === 0) expected[2] = "New Customer C";
      if (index === 1) expected[3] = "New Customer D";
      expect([2, 3, 4, 5].map((r) => result.sheet.getCell(r, result.annotation).text)).toEqual(expected);
      expect(result.conflicts).toBe("0"); expect(result.sheet.getCell("A9").text).toBe("Statement footer");
      const transactions = await db.from("gcash_transactions").select("row_index,amount,reference_number").eq("verification_run_id", result.runId).order("row_index");
      if (transactions.error) throw transactions.error;
      expect(transactions.data).toHaveLength(index < 2 ? 4 : 5);
      expect(transactions.data.map((r) => r.row_index)).toEqual(index < 2 ? [2, 3, 4, 5] : [2, 3, 4, 5, 6]);
      expect(transactions.data.every((r) => r.amount === 1299)).toBe(true);
      const decision = await db.from("payment_results").select("effective_status,amount_decimal").eq("verification_run_id", result.runId).single();
      if (decision.error) throw decision.error; expect(decision.data.effective_status).toBe("VERIFIED"); expect(Number(decision.data.amount_decimal)).toBe(1300);
      bytes = result.output;
      if (index === 1) {
        result.sheet.getRow(6).values = ["2026-09-27 08:00 AM", "", "Cash in via bank", "", "", "", "0045276500984", "", 1299];
        bytes = Buffer.from(await result.book.xlsx.writeBuffer());
      }
      if (index >= 2) { expect(result.sheet.getCell("G6").text).toBe("0045276500984"); expect(result.sheet.getCell(6, result.annotation).text).toBe("Jake Tirana"); }
    }
  });
  test("export warns about historical/current conflicts and duplicated disagreements without changing verification", async ({ page }, info) => {
    await workspace(page);
    const result = await cycle(page, await weeklySource([12, 13], [["Alice", "Alice"], ["Ben", "Beth"], [], []]), "Bob", "A");
    expect(result.conflicts).toBe("2");
    await expect(page.getByRole("status")).toContainText("GCash downloaded with 2 annotation conflicts");
    expect(result.sheet.getCell("L2").text).toBe("Alice"); expect(result.sheet.getCell("N2").text).toContain('current exact-reference customer: "Bob"');
    expect(result.sheet.getCell("L3").text).toBe("CONFLICT — see Annotation Conflict"); expect(result.sheet.getCell("N3").text).toContain('["Ben","Beth"]');
    expect(result.sheet.getCell("I2").value).toBe(1299);
    const decision = await db.from("payment_results").select("effective_status").eq("verification_run_id", result.runId).single();
    if (decision.error) throw decision.error; expect(decision.data.effective_status).toBe("VERIFIED");
    await page.screenshot({ path: info.outputPath("annotation-conflict-warning.png"), fullPage: true });
    const again = await cycle(page, result.output, "Bob", "A");
    expect(again.sheet.columnCount).toBe(result.sheet.columnCount); expect(again.conflicts).toBe("2");
    expect(again.sheet.getCell("N2").text).toBe(result.sheet.getCell("N2").text); expect(again.sheet.getCell("N3").text).toBe(result.sheet.getCell("N3").text);
  });
});
