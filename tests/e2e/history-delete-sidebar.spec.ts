import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { reconcileVerificationRun } from "@/lib/verification/run-reconciliation";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !service || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const password = "Local-delete-test-123";
const emails = Array.from({ length: 4 }, () => `delete-${randomUUID()}@example.com`);
const users: string[] = [];
const runs: string[] = [];
let business = "";
let foreignBusiness = "";
let foreignRun = "";
let reviewedPayment = "";

function runAt(index: number) { const run = runs[index]; if (!run) throw new Error("Missing run fixture"); return run; }
async function login(page: Page, index = 0) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(emails[index] ?? "");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function count(table: string, column: string, id: string) {
  const response = await db.from(table).select("*", { count: "exact", head: true }).eq(column, id);
  if (response.error) throw response.error;
  return response.count;
}
async function seedRun(client: typeof db, businessId: string, name: string) {
  const result = await client.rpc("create_dual_file_import", {
    p_business_id: businessId, p_session_id: randomUUID(),
    p_payments: [
      { customer: "Jake Tirana", method: "GCASH", amount: "1300", reference_number: "0045276500984", row_index: 2, raw_data: { filename: `${name} Payments.xlsx` } },
      { customer: "Manual Review", method: "GCASH", amount: "1000", reference_number: "NOT-FOUND", row_index: 3, raw_data: { filename: `${name} Payments.xlsx` } },
    ],
    p_gcash: [{ amount: "1299", reference_number: "0045276500984", direction: "incoming", reference_occurrence_count: 1, row_index: 2, raw_data: { filename: `${name} GCash.xlsx` } }],
  });
  if (result.error || typeof result.data !== "string") throw result.error ?? new Error("Import failed");
  await reconcileVerificationRun(client, businessId, result.data);
  return result.data;
}

test.describe("History deletion and persistent sidebar", () => {
  test.setTimeout(120000);
  test.beforeAll(async () => {
    for (const email of emails) {
      const result = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (result.error) throw result.error;
      users.push(result.data.user.id);
    }
    const owner = users[0]; const foreign = users[3];
    if (!owner || !foreign) throw new Error("Missing users");
    business = randomUUID(); foreignBusiness = randomUUID();
    const created = await db.from("businesses").insert([
      { id: business, name: "Delete Workspace", created_by: owner },
      { id: foreignBusiness, name: "Foreign Delete Workspace", created_by: foreign },
    ]);
    if (created.error) throw created.error;
    const members = await db.from("business_members").insert(users.map((id, index) => ({
      business_id: index === 3 ? foreignBusiness : business, user_id: id,
      role: index === 1 ? "admin" : index === 2 ? "member" : "owner",
    })));
    if (members.error) throw members.error;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email: emails[0] ?? "", password });
    if (signed.error) throw signed.error;
    for (let n = 1; n <= 28; n++) runs.push(await seedRun(client, business, `Run ${n}`));
    const payment = await db.from("payments").select("id").eq("verification_run_id", runAt(1)).eq("customer", "Manual Review").single();
    if (payment.error) throw payment.error;
    reviewedPayment = payment.data.id;
    const reviewed = await client.rpc("review_payment", { p_business_id: business, p_run_id: runAt(1), p_payment_id: reviewedPayment, p_status: "VERIFIED", p_note: "Delete fixture audit", p_expected_revision: 0 });
    if (reviewed.error) throw reviewed.error;
    // Place the deletion target in Dashboard's cached recent-runs list and History page 1.
    const dated = await db.from("verification_runs").update({ created_at: "2026-12-01T00:00:00Z", completed_at: "2026-12-01T00:00:00Z" }).eq("id", runAt(1));
    if (dated.error) throw dated.error;
    const otherSigned = await client.auth.signInWithPassword({ email: emails[3] ?? "", password });
    if (otherSigned.error) throw otherSigned.error;
    foreignRun = await seedRun(client, foreignBusiness, "Foreign");
  });
  test.afterAll(async () => {
    const removed = await db.from("businesses").delete().in("created_by", users);
    if (removed.error) throw removed.error;
    for (const id of users) { const result = await db.auth.admin.deleteUser(id); if (result.error) throw result.error; }
  });

  test("owner confirmation, cancel, full cleanup, live lists, deleted URLs and export", async ({ page }, info) => {
    await login(page);
    const target = runAt(1);
    await expect(page.getByRole("article", { name: `Verification ${target.slice(0, 8)}` })).toBeVisible();
    await page.goto(`/verification/${target}`);
    await expect(page.getByRole("heading", { name: "Verification Results" })).toBeVisible();
    await page.getByRole("link", { name: "Back to History" }).click();
    const card = page.getByRole("article", { name: `Verification ${target.slice(0, 8)}` });
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Verification Run?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(dialog).toContainText("Run 2 Payments.xlsx");
    await expect(dialog).toContainText("Run 2 GCash.xlsx");
    await expect(dialog).toContainText("cannot be undone");
    await page.screenshot({ path: info.outputPath("delete-confirmation-light.png") });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toBeVisible();
    expect(await count("verification_runs", "id", target)).toBe(1);
    expect(await count("verification_actions", "verification_run_id", target)).toBe(1);
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete Verification", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Verification run deleted.");
    await expect(card).toHaveCount(0);
    await expect(page.getByText("27 runs", { exact: true })).toBeVisible();
    for (const table of ["payments", "gcash_transactions", "payment_matches", "verification_actions"]) expect(await count(table, "verification_run_id", target)).toBe(0);
    for (const id of [runAt(0), runAt(2), foreignRun]) {
      expect(await count("verification_runs", "id", id)).toBe(1);
      expect(await count("payments", "verification_run_id", id)).toBe(2);
    }
    expect(await count("businesses", "id", business)).toBe(1);
    expect(await count("business_members", "business_id", business)).toBe(3);
    await page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("article", { name: `Verification ${target.slice(0, 8)}` })).toHaveCount(0);
    await page.goto(`/verification/${target}`);
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
    await page.goto(`/verification/${target}/payments/${reviewedPayment}`);
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
    const exportResponse = await page.request.get(`/verification/${target}/export`);
    expect(exportResponse.status()).toBe(404);
    expect(exportResponse.headers()["content-type"] ?? "").not.toContain("spreadsheetml");
  });

  test("forged run UUID and revoked role fail safely; member has no Delete; admin can delete", async ({ page }, info) => {
    await login(page);
    await page.goto("/history");
    await page.getByLabel("Search payment or GCash filename").fill("Run 4 Payments");
    await page.getByRole("button", { name: "Search History" }).click();
    const card = page.getByRole("article", { name: `Verification ${runAt(3).slice(0, 8)}` });
    await expect(card).toBeVisible();
    // Tamper with the real Server Action body, leaving the expected workspace unchanged.
    await page.route("**/history", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.continue({ postData: (request.postData() ?? "").replaceAll(runAt(3), foreignRun) });
      } else await route.continue();
    });
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete Verification", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Could not delete verification run.");
    expect(await count("verification_runs", "id", foreignRun)).toBe(1);
    expect(await count("verification_runs", "id", runAt(3))).toBe(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.unroute("**/history");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await page.screenshot({ path: info.outputPath("delete-confirmation-dark.png") });
    // Permission changes after the dialog opened must be checked again on the server.
    const demoted = await db.from("business_members").update({ role: "member" }).eq("business_id", business).eq("user_id", users[0] ?? "");
    if (demoted.error) throw demoted.error;
    try {
      await dialog.getByRole("button", { name: "Delete Verification", exact: true }).click();
      await expect(dialog.getByRole("alert")).toHaveText("Could not delete verification run.");
      expect(await count("verification_runs", "id", runAt(3))).toBe(1);
      await page.reload();
      await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    } finally {
      const restored = await db.from("business_members").update({ role: "owner" }).eq("business_id", business).eq("user_id", users[0] ?? "");
      if (restored.error) throw restored.error;
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, 2);
    await page.goto("/history");
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    const member = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await member.auth.signInWithPassword({ email: emails[2] ?? "", password });
    if (signed.error) throw signed.error;
    const denied = await member.from("verification_runs").delete().eq("id", runAt(3)).select("id");
    expect(denied.error).toBeNull(); expect(denied.data).toEqual([]);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, 1);
    await page.goto("/history");
    await page.getByLabel("Search payment or GCash filename").fill("Run 4 Payments");
    await page.getByRole("button", { name: "Search History" }).click();
    await card.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete Verification", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Verification run deleted.");
    await expect(page.getByText("No verification runs match this filter.")).toBeVisible();
    expect(await count("verification_runs", "id", runAt(3))).toBe(0);
  });

  test("long History scroll keeps desktop navigation accessible; tablet and mobile work", async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    for (const mode of ["light", "dark"]) {
      if (mode === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await nav.getByRole("link", { name: "History", exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(25);
      await expect(nav.getByRole("link", { name: "History", exact: true })).toHaveAttribute("aria-current", "page");
      for (const destination of ["Dashboard", "New Verification"]) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
        for (const name of ["Dashboard", "New Verification", "History", "Settings"]) await expect(nav.getByRole("link", { name, exact: true })).toBeInViewport();
        const sidebar = page.getByRole("complementary", { name: "Workspace sidebar" });
        const box = await sidebar.boundingBox();
        expect(box?.y).toBe(0);
        await page.screenshot({ path: info.outputPath(`sidebar-${mode}-${destination.replaceAll(" ", "-")}.png`) });
        await nav.getByRole("link", { name: destination, exact: true }).click();
        await expect(page).toHaveURL(destination === "Dashboard" ? /\/dashboard$/ : /\/verification\/new$/);
        await nav.getByRole("link", { name: "History", exact: true }).click();
        await expect(page.getByRole("article")).toHaveCount(25);
      }
    }
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(nav.getByRole("link", { name: "History", exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath("history-tablet.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toBeHidden();
    const mobile = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
    for (const [name, path] of [["Dashboard", "/dashboard"], ["History", "/history"], ["New Verification", "/verification/new"]] as const) {
      await mobile.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await mobile.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByRole("heading", { name: "History", exact: true, level: 1 })).toBeVisible();
    await page.screenshot({ path: info.outputPath("history-mobile.png") });
    await page.getByRole("article").first().getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("delete-confirmation-mobile.png") });
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 200 });
    const sidebar = page.getByRole("complementary", { name: "Workspace sidebar" });
    expect(await sidebar.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await sidebar.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(sidebar.getByRole("button", { name: "Sign out", exact: true })).toBeInViewport();
  });

  test("clearing All History including unfinished runs also empties the cached Dashboard", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.getByLabel("Workspace name").fill("Mixed Run Cleanup");
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.locator("aside").getByRole("button", { name: "Mixed Run Cleanup", exact: true })).toBeVisible();
    await page.goto("/dashboard");
    const workspace = await db.from("businesses").select("id").eq("created_by", users[0] ?? "").eq("name", "Mixed Run Cleanup").single();
    if (workspace.error) throw workspace.error;
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email: emails[0] ?? "", password });
    if (signed.error) throw signed.error;
    await seedRun(client, workspace.data.id, "Completed");
    const seeded = await db.from("verification_runs").insert(["queued", "running", "failed"].map((status) => ({
      business_id: workspace.data.id, requested_by: users[0], status,
      started_at: status === "queued" ? null : new Date().toISOString(),
      completed_at: status === "failed" ? new Date().toISOString() : null,
    })));
    if (seeded.error) throw seeded.error;
    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(4);
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    await nav.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(4);
    await page.getByRole("button", { name: "No Outstanding Review", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(4);
    for (let remaining = 4; remaining > 0; remaining--) {
      await page.getByRole("article").first().getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete Verification", exact: true }).click();
      await expect(page.getByRole("article")).toHaveCount(remaining - 1);
      await expect(page.getByText(`${remaining - 1} run${remaining - 1 === 1 ? "" : "s"}`, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("No verification runs yet in this workspace.")).toBeVisible();
    expect(await count("verification_runs", "business_id", workspace.data.id)).toBe(0);
    await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByText("No verification runs yet.", { exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("No verification runs yet.", { exact: true })).toBeVisible();
  });
});
