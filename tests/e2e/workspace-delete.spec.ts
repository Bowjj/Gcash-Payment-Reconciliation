import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { captureSourceWorkbook } from "@/lib/export/source-workbook";
import { reconcileVerificationRun } from "@/lib/verification/run-reconciliation";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const anon = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !anon || !service || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const password = "Local-workspace-delete-123";
const emails = Array.from({ length: 5 }, () => `ws-delete-${randomUUID()}@example.com`);
const users: string[] = [];
const a = randomUUID(); const b = randomUUID(); const c = randomUUID(); const foreign = randomUUID(); const last = randomUUID();
const runs: string[] = [];
const nameB = "Workspace B - Payment Office";
async function count(table: string, column: string, id: string) {
  const result = await db.from(table).select("*", { count: "exact", head: true }).eq(column, id);
  if (result.error) throw result.error; return result.count;
}
async function login(page: Page, index: number) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(emails[index] ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function openConfirmation(page: Page) {
  await page.getByRole("button", { name: "Delete Workspace", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete Workspace?" });
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  return dialog;
}
function source(rows: unknown[][], kind: "payments" | "gcash") {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return captureSourceWorkbook(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), kind);
}
test.describe("Settings workspace deletion", () => {
  test.setTimeout(120000);
  test.beforeAll(async () => {
    for (const email of emails) {
      const result = await db.auth.admin.createUser({ email, password, email_confirm: true }); if (result.error) throw result.error;
      users.push(result.data.user.id);
    }
    const created = await db.from("businesses").insert([
      { id: a, name: "Workspace A", created_by: users[0] }, { id: b, name: nameB, created_by: users[0] },
      { id: c, name: "Workspace C", created_by: users[0] }, { id: foreign, name: "Foreign Workspace", created_by: users[3] },
      { id: last, name: "Last Workspace", created_by: users[4] },
    ]); if (created.error) throw created.error;
    const members = await db.from("business_members").insert([
      ...[a, b, c].map((id, i) => ({ business_id: id, user_id: users[0], role: "owner", created_at: `2026-01-0${i + 1}T00:00:00Z` })),
      { business_id: b, user_id: users[1], role: "admin", created_at: "2026-01-01T00:00:00Z" }, { business_id: b, user_id: users[2], role: "member", created_at: "2026-01-01T00:00:00Z" },
      { business_id: foreign, user_id: users[3], role: "owner", created_at: "2026-01-01T00:00:00Z" }, { business_id: last, user_id: users[4], role: "owner", created_at: "2026-01-01T00:00:00Z" },
    ]); if (members.error) throw members.error;
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email: emails[0] ?? "", password }); if (signed.error) throw signed.error;
    for (const businessId of [a, b, b, c]) {
      const imported = await client.rpc("create_dual_file_import", {
        p_business_id: businessId, p_session_id: randomUUID(),
        p_payments: [{ customer: "Manual", amount: "1300", method: "GCASH", reference_number: "NOT-FOUND", row_index: 2, raw_data: { filename: "Payment.xlsx" } }],
        p_gcash: [{ amount: "1299", reference_number: "0045276500984", direction: "incoming", reference_occurrence_count: 1, row_index: 2, raw_data: { filename: "GCash.xlsx", sheet_name: "Sheet1" } }],
        p_payment_source: source([["Customer", "Amount", "Method", "Reference #"], ["Manual", 1300, "GCash", "NOT-FOUND"]], "payments"),
        p_gcash_source: source([["Date and Time", "", "Description", "", "", "", "REF NO", "", "AMOUNT"], ["2026-09-26 08:00 AM", "", "Transfer", "", "", "", "0045276500984", "", 1299]], "gcash"),
      }); if (imported.error || typeof imported.data !== "string") throw imported.error ?? new Error("Import failed");
      runs.push(imported.data); await reconcileVerificationRun(client, businessId, imported.data);
      const payment = await db.from("payments").select("id").eq("verification_run_id", imported.data).single(); if (payment.error) throw payment.error;
      const review = await client.rpc("review_payment", { p_business_id: businessId, p_run_id: imported.data, p_payment_id: payment.data.id, p_status: "VERIFIED", p_note: "Audit fixture", p_expected_revision: 0 }); if (review.error) throw review.error;
    }
  });
  test.afterAll(async () => {
    const removed = await db.from("businesses").delete().in("created_by", users); if (removed.error) throw removed.error;
    for (const id of users) { const result = await db.auth.admin.deleteUser(id); if (result.error) throw result.error; }
  });

  test("admin/member denied; forged workspace UUID fails safely", async ({ page }) => {
    for (const index of [1, 2]) {
      await login(page, index); await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Delete Workspace", exact: true })).toHaveCount(0);
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await client.auth.signInWithPassword({ email: emails[index] ?? "", password }); if (signed.error) throw signed.error;
      const denied = await client.from("businesses").delete().eq("id", b).select("id"); expect(denied.data).toEqual([]);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
    }
    await login(page, 0); await page.goto("/settings");
    const dialog = await openConfirmation(page);
    await dialog.getByLabel("Type workspace name exactly").fill("Workspace A");
    await page.route("**/settings", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) await route.continue({ postData: (req.postData() ?? "").replaceAll(a, foreign).replaceAll("Workspace A", "Foreign Workspace") });
      else await route.continue();
    });
    await dialog.getByRole("button", { name: "Delete Workspace Permanently" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not delete workspace. Please try again.");
    expect(await count("businesses", "id", a)).toBe(1); expect(await count("businesses", "id", foreign)).toBe(1);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("owner cancels then confirms exact name; data cleanup preserves user/other workspaces and selects remaining", async ({ page }, info) => {
    await login(page, 0); await page.goto("/settings");
    await page.locator("aside").getByRole("button", { name: "Workspace A", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(nameB) }).click();
    await expect(page.getByRole("region", { name: "Danger Zone" })).toContainText(nameB);
    await page.getByRole("button", { name: "Delete Workspace", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.screenshot({ path: info.outputPath("workspace-delete-light.png") });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await count("verification_runs", "business_id", b)).toBe(2);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await openConfirmation(page);
    const input = dialog.getByLabel("Type workspace name exactly"); const confirm = dialog.getByRole("button", { name: "Delete Workspace Permanently" });
    await expect(confirm).toBeDisabled();
    for (const wrong of [nameB.toLowerCase(), ` ${nameB}`, `${nameB} `, "Workspace A"]) { await input.fill(wrong); await expect(confirm).toBeDisabled(); }
    await input.fill(nameB); await expect(confirm).toBeEnabled();
    await page.screenshot({ path: info.outputPath("workspace-delete-dark.png") });
    await confirm.click();
    await expect(page).toHaveURL(/\/dashboard\?workspaceDeleted=1$/);
    await expect(page.getByRole("status")).toHaveText("Workspace deleted.");
    await expect(page.locator("aside").getByRole("button", { name: "Workspace A", exact: true })).toBeVisible();
    expect((await page.context().cookies()).find((cookie) => cookie.name === "active_workspace_id")?.value).toBe(a);
    expect(await count("businesses", "id", b)).toBe(0);
    for (const table of ["business_members", "verification_runs", "payments", "gcash_transactions", "payment_matches", "verification_actions", "verification_source_workbooks"]) expect(await count(table, "business_id", b)).toBe(0);
    for (const id of [a, c]) {
      expect(await count("businesses", "id", id)).toBe(1); expect(await count("verification_runs", "business_id", id)).toBe(1);
      expect(await count("verification_actions", "business_id", id)).toBe(1); expect(await count("verification_source_workbooks", "business_id", id)).toBe(2);
    }
    const account = await db.auth.admin.getUserById(users[0] ?? ""); expect(account.data.user?.id).toBe(users[0]);
    await page.goto(`/verification/${runs[1]}`); await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
    for (const kind of ["payments", "gcash"]) expect((await page.request.get(`/verification/${runs[1]}/export?file=${kind}`)).status()).toBe(404);
  });

  test("last empty workspace: mobile dialog, exact name, onboarding and authenticated recreation", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 }); await login(page, 4); await page.goto("/settings");
    const dialog = await openConfirmation(page);
    await expect(dialog.getByRole("button", { name: "Delete Workspace Permanently" })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(); expect(await count("businesses", "id", last)).toBe(1);
    await openConfirmation(page); await dialog.getByLabel("Type workspace name exactly").fill("Last Workspace");
    await page.screenshot({ path: info.outputPath("workspace-delete-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Delete Workspace Permanently" }).click();
    await expect(page).toHaveURL(/\/dashboard\?workspaceDeleted=1$/); await expect(page.getByText("Create a Workspace", { exact: true })).toBeVisible();
    expect((await page.context().cookies()).some((cookie) => cookie.name === "active_workspace_id")).toBe(false);
    expect((await db.auth.admin.getUserById(users[4] ?? "")).data.user?.id).toBe(users[4]);
    await page.getByLabel("Workspace name").fill("New Workspace After Deletion"); await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Workspace After Deletion", exact: true })).toBeVisible();
  });
});
