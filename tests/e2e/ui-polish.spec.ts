import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { workbookUpload } from "../fixtures/workbook";
import { reconcileVerificationRun } from "@/lib/verification/run-reconciliation";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const anonKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !serviceKey || !anonKey || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local Supabase credentials required");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `polish-${randomUUID()}@example.com`;
const otherEmail = `polish-other-${randomUUID()}@example.com`;
const emptyEmail = `polish-empty-${randomUUID()}@example.com`;
const password = "Local-polish-password-123";
const userIds: string[] = [];
let attentionId = "";
let clearId = "";
let queuedId = "";
let foreignId = "";
let paymentId = "";

async function login(page: Page, loginEmail = email) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(loginEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function setTheme(page: Page, mode: "light" | "dark") {
  if (await page.locator("html").evaluate((el, next) => el.classList.contains(next), mode)) return;
  await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
  await expect(page.locator("html")).toHaveClass(mode === "dark" ? /dark/ : /light/);
}
async function seedBusiness(userId: string, name: string) {
  const { data, error } = await admin.from("businesses").insert({ name, created_by: userId }).select("id").single();
  if (error) throw error;
  const { error: memberError } = await admin.from("business_members").insert({ business_id: data.id, user_id: userId, role: "owner" });
  if (memberError) throw memberError;
  return String(data.id);
}
async function seedRun(client: typeof admin, business: string, month: string, needsReview: boolean) {
  const payments = [
    { customer: "Jake Tirana", amount: "1300.00", method: "GCASH", reference_number: "0045276500984", row_index: 2, raw_data: { filename: `Payments_${month}_2026_Internet_Collection.xlsx` } },
    { customer: "Cash Customer", amount: "1000.00", method: "CASH", reference_number: null, row_index: 3, raw_data: { filename: `Payments_${month}_2026_Internet_Collection.xlsx` } },
    { customer: "Bank Customer", amount: "1000.00", method: "BANK", reference_number: "BANK", row_index: 4, raw_data: { filename: `Payments_${month}_2026_Internet_Collection.xlsx` } },
  ];
  if (needsReview) payments.push({ customer: "Shara Review", amount: "1000.00", method: "GCASH", reference_number: "NOT-FOUND", row_index: 5, raw_data: { filename: `Payments_${month}_2026_Internet_Collection.xlsx` } });
  const { data, error } = await client.rpc("create_dual_file_import", { p_business_id: business, p_session_id: randomUUID(), p_payments: payments,
    p_gcash: [{ amount: "1299.00", direction: "incoming", description: "Cash in via bank", reference_number: "0045276500984", reference_occurrence_count: 1, row_index: 2, raw_data: { filename: `GCash_${month}_2026_Statement.xlsx`, sheet_name: "Statement", source_order: 0 } }],
  });
  if (error || typeof data !== "string") throw error ?? new Error("Run creation failed");
  await reconcileVerificationRun(client, business, data);
  return data;
}
async function contrast(locator: Locator) {
  const ratio = await locator.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    function rgba(color: string) {
      if (!context) throw new Error("Canvas unavailable");
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    }
    let background = [255, 255, 255];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    for (const current of ancestors) {
      const color = rgba(getComputedStyle(current).backgroundColor);
      const alpha = (color[3] ?? 0) / 255;
      background = background.map((channel, i) => (color[i] ?? 0) * alpha + channel * (1 - alpha));
    }
    function luminance(color: number[]) {
      const values = color.slice(0, 3).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return (values[0] ?? 0) * 0.2126 + (values[1] ?? 0) * 0.7152 + (values[2] ?? 0) * 0.0722;
    }
    const fg = luminance(rgba(getComputedStyle(element).color));
    const bg = luminance(background);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}
async function screenshots(page: Page, name: string, info: TestInfo) {
  for (const size of [{ width: 1280, height: 800, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await contrast(page.locator("main h1").first().or(page.locator('[data-slot="card-title"]').first()).first());
    await page.screenshot({ path: info.outputPath(`${name}-${size.name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe("Sprint 6.5 polish", () => {
  test.setTimeout(120000);
  test.beforeAll(async () => {
    for (const userEmail of [email, otherEmail, emptyEmail]) {
      const { data, error } = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true });
      if (error) throw error;
      userIds.push(data.user.id);
    }
    const ownerId = userIds[0]; const otherId = userIds[1];
    if (!ownerId || !otherId) throw new Error("Missing fixture users");
    const business = await seedBusiness(ownerId, "Annie Internet");
    const otherBusiness = await seedBusiness(otherId, "Other Business");
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    attentionId = await seedRun(client, business, "September", true);
    clearId = await seedRun(client, business, "October", false);
    const { data: queued, error: queuedError } = await admin.from("verification_runs").insert({ business_id: business, requested_by: ownerId }).select("id").single();
    if (queuedError) throw queuedError;
    queuedId = queued.id;
    const { data: payment, error: paymentError } = await admin.from("payments").select("id").eq("verification_run_id", attentionId).eq("customer", "Shara Review").single();
    if (paymentError) throw paymentError;
    paymentId = payment.id;
    const signedOther = await client.auth.signInWithPassword({ email: otherEmail, password });
    if (signedOther.error) throw signedOther.error;
    foreignId = await seedRun(client, otherBusiness, "Foreign", true);
  });
  test.afterAll(async () => {
    const { error } = await admin.from("businesses").delete().in("created_by", userIds);
    if (error) throw error;
    for (const id of userIds) { const { error: userError } = await admin.auth.admin.deleteUser(id); if (userError) throw userError; }
  });

  test("theme follows system by default, toggles on click and persists across refresh/logout/login", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match/i.test(message.text())) errors.push(message.text()); });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");
    const toggle = page.getByRole("button", { name: "Switch to light mode" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await toggle.press("Enter");
    await expect(page.locator("html")).toHaveClass(/light/);
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe("light");
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
    await login(page);
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("html")).toHaveClass(/light/);
    await login(page);
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.evaluate(() => localStorage.removeItem("theme"));
    await page.reload();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(errors).toEqual([]);
  });

  test("light/dark desktop and mobile screens, usable run actions, grouped counts and filename filters", async ({ page }, info) => {
    await page.goto("/login");
    await setTheme(page, "dark");
    await screenshots(page, "dark-login", info);
    await login(page);
    const completed = page.getByRole("article").filter({ hasText: "Payments_September_2026_Internet_Collection.xlsx" });
    await expect(completed.getByRole("link", { name: "View Results" })).toHaveAttribute("href", `/verification/${attentionId}`);
    await expect(page.getByRole("article", { name: `Verification ${queuedId.slice(0, 8)}` }).getByRole("link")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Foreign");
    await completed.getByRole("link", { name: "View Results" }).click();
    await expect(page).toHaveURL(new RegExp(`/verification/${attentionId}$`));
    for (const mode of ["light", "dark"] as const) {
      await setTheme(page, mode);
      for (const [name, path] of [["dashboard", "/dashboard"], ["history", "/history"], ["results", `/verification/${attentionId}`]]) {
        await page.goto(path ?? "/dashboard");
        await expect(page.locator("html")).toHaveClass(new RegExp(mode));
        await screenshots(page, `${mode}-${name}`, info);
        if (name === "results") for (const status of ["VERIFIED", "NEEDS_REVIEW", "CASH", "BANK"]) await contrast(page.locator(`[data-status="${status}"]`).first());
      }
    }
    for (const [name, path] of [["new-verification", "/verification/new"], ["payment-details", `/verification/${attentionId}/payments/${paymentId}`], ["settings", "/settings"]]) {
      await page.goto(path ?? "/settings");
      await screenshots(page, `dark-${name}`, info);
    }
    await page.goto(`/verification/${attentionId}?view=gcash`);
    await screenshots(page, "dark-gcash-view", info);
    await page.goto("/history");
    const historyRun = page.getByRole("article").filter({ hasText: "Payments_September_2026_Internet_Collection.xlsx" });
    await expect(historyRun.getByRole("link", { name: "View Results" })).toHaveAttribute("href", `/verification/${attentionId}`);
    await expect(historyRun.getByLabel("Run result counts").getByRole("definition")).toHaveText(["4", "1", "1", "1", "1"]);
    const box = await historyRun.boundingBox(); const actionBox = await historyRun.getByRole("link").boundingBox();
    if (!box || !actionBox) throw new Error("Missing run layout");
    expect(box.x + box.width - actionBox.x - actionBox.width).toBeGreaterThanOrEqual(20);
    expect(actionBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator("a a")).toHaveCount(0);
    await page.getByRole("button", { name: "Needs Attention", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("September");
    await page.getByRole("button", { name: "No Outstanding Review", exact: true }).click();
    await expect(page.getByRole("article")).toContainText("October");
    await expect(page.getByRole("article").getByRole("link")).toHaveAttribute("href", `/verification/${clearId}`);
    await expect(page.locator("main")).not.toContainText("Fully Verified");
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.getByLabel("Search payment or GCash filename").fill("Payments_Sept");
    await page.getByRole("button", { name: "Search History" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("article")).toContainText("September");
    await page.getByLabel("Search payment or GCash filename").fill("GCash_October");
    await page.getByRole("button", { name: "Search History" }).click();
    await expect(page.getByRole("article")).toContainText("October");
    expect(new URL(page.url()).search).toBe("");
    await page.getByRole("button", { name: "Needs Attention", exact: true }).click();
    await expect(page.getByText("No verification runs match this filter.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("article")).toHaveCount(3);
    await page.setViewportSize({ width: 820, height: 1180 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("dark-history-tablet.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/verification/${foreignId}`);
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
  });

  test("dark upload previews and empty Dashboard/History states", async ({ page }, info) => {
    await login(page, emptyEmail);
    await expect(page.getByText("No verification runs yet.")).toBeVisible();
    await page.getByLabel("Workspace name").fill("Empty Polish Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    await setTheme(page, "dark");
    await expect(page.getByRole("region", { name: "Recent Verification Runs" }).getByRole("link", { name: "New Verification", exact: true })).toBeVisible();
    await screenshots(page, "dark-empty-dashboard", info);
    await page.goto("/history");
    await expect(page.getByText("No verification runs yet in this workspace.")).toBeVisible();
    await screenshots(page, "dark-empty-history", info);
    await page.goto("/verification/new");
    const paymentsPanel = page.getByRole("region", { name: "Payment Records", exact: true });
    const gcashPanel = page.getByRole("region", { name: "GCash Statement", exact: true });
    await paymentsPanel.locator('input[type="file"]').setInputFiles(await workbookUpload("payments.xlsx", [{ name: "Payments", rows: [["Customer", "Amount", "Method", "Reference #"], ["Preview Customer", "1300", "gcash", "0045276500984"], ["Unknown Method", "1000", "unrecognized", "X"]] }]));
    await paymentsPanel.getByText("Preview", { exact: true }).click();
    await paymentsPanel.getByText("Validation messages", { exact: true }).click();
    await gcashPanel.locator('input[type="file"]').setInputFiles(await workbookUpload("gcash.xlsx", [{ name: "GCash", rows: [["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"], ["2026-09-25 08:00 AM", null, "Cash in via bank", null, null, null, "0045276500984", null, "1299"], ["2026-09-25 08:00 AM", null, "Sent GCash", null, null, null, "0045276500984", null, "1000"]] }]));
    await gcashPanel.getByText("Preview", { exact: true }).click();
    await screenshots(page, "dark-upload-previews", info);
  });
});
