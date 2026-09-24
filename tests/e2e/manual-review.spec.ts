import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const emailA = `review-a-${randomUUID()}@example.com`;
const emailB = `review-b-${randomUUID()}@example.com`;
const readerEmail = `review-reader-${randomUUID()}@example.com`;
const password = "Local-review-password-123";
const userIds: string[] = [];
let readerId = "";
let businessA = "";
let runA = "";
let sharaId = "";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
function excel(name: string, rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Source Sheet");
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) };
}
async function uploadRun(page: Page, prefix: string) {
  const paymentRows: unknown[][] = [
    ["Customer", "Amount", "Method", "Reference #", "Account", "Billing Period", "Photo", "Notes", "Paid By", "Received By"],
    ["Jake Tirana", "1000", "GCASH", "0045276500984"],
    ["Different Amount Customer", "1300", "GCASH", "ABC123"],
    ["Shara Villariasa", "1000", "GCASH", "0000203966985", "ACC-001", "September 2026", "https://example.com/proof.png", "Source note", "Shara", "Cashier"],
    ["Duplicate Statement", "1000", "GCASH", "DUP-G"],
    ["Cash Customer", "1000", "CASH", ""],
    ["Bank Customer", "1000", "bank transfer", "BANKREF"],
    ...Array.from({ length: 24 }, (_, i) => [`Cash extra ${i + 1}`, "100", "CASH", ""]),
  ];
  const gcashRows: unknown[][] = [
    ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
    ...[["0045276500984", "1000"], ["ABC123", "1299"], ["DUP-G", "1000"], ["DUP-G", "999"], ["UNMATCHED", "50"]]
      .map(([ref, amount]) => ["2026-09-21 08:00 AM", null, "Cash in via bank", null, null, null, ref, null, amount]),
  ];
  await page.goto("/verification/new");
  const payment = page.getByRole("region", { name: "Payment Records", exact: true });
  const gcash = page.getByRole("region", { name: "GCash Statement", exact: true });
  await payment.locator('input[type="file"]').setInputFiles(excel(`${prefix}-payments.xlsx`, paymentRows));
  await expect(payment.getByText("Preview", { exact: true })).toBeVisible();
  await gcash.locator('input[type="file"]').setInputFiles(excel(`${prefix}-gcash.xlsx`, gcashRows));
  await page.getByRole("button", { name: "Verify Payments" }).click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verification Results", exact: true })).toBeVisible();
}
async function expectCounts(page: Page, verified: number, review: number) {
  const summary = page.getByRole("region", { name: "Effective result counts" });
  for (const [label, value] of [["Total Payments", 30], ["Verified", verified], ["Needs Review", review], ["Cash", 25], ["Bank", 1]]) {
    await expect(summary.locator("div").filter({ has: page.getByText(String(label), { exact: true }) }).locator("dd")).toHaveText(String(value));
  }
}

test.describe.serial("persisted results and manual review", () => {
  test.setTimeout(90000);
  test.beforeAll(async () => {
    for (const email of [emailA, emailB, readerEmail]) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      userIds.push(data.user.id);
      if (email === readerEmail) readerId = data.user.id;
    }
  });
  test.afterAll(async () => {
    const { error } = await admin.from("businesses").delete().in("created_by", userIds);
    if (error) throw error;
    for (const id of userIds) {
      const { error: userError } = await admin.auth.admin.deleteUser(id);
      if (userError) throw userError;
    }
  });

  test("upload, filter, inspect, review, audit, refresh and reopen through History", async ({ page }, testInfo) => {
    await login(page, emailA);
    await page.getByLabel("Workspace name").fill("Review Workspace A");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    await uploadRun(page, "review-a");
    runA = new URL(page.url()).pathname.split("/")[2] ?? "";
    const { data: run, error } = await admin.from("verification_runs").select("business_id").eq("id", runA).single();
    if (error) throw error;
    businessA = run.business_id;
    const { error: memberError } = await admin.from("business_members").insert({ business_id: businessA, user_id: readerId, role: "member" });
    if (memberError) throw memberError;
    await expectCounts(page, 2, 2);
    await expect(page.getByRole("row")).toHaveCount(26);
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.getByText("Page 2 of 2 · 30 records")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(6);

    await page.getByRole("link", { name: "Needs Review (2)", exact: true }).click();
    await expect(page).toHaveURL(/status=NEEDS_REVIEW/);
    await page.getByRole("row").filter({ hasText: "Duplicate Statement" }).getByRole("link", { name: "Details" }).click();
    await expect(page.getByText("DUPLICATE_REFERENCE", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Exact-reference candidates" }).locator("dl")).toHaveCount(2);
    await page.getByRole("link", { name: "Back to Results" }).click();
    await page.getByRole("link", { name: "Needs Review (2)", exact: true }).click();
    await expect(page).toHaveURL(/status=NEEDS_REVIEW/);
    await expect(page.locator('input[name="status"]')).toHaveValue("NEEDS_REVIEW");
    await page.getByLabel("Search customer or reference").fill("Shara");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page).toHaveURL(/status=NEEDS_REVIEW/);
    await page.getByLabel("Search customer or reference").fill("0000203966985");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "Shara Villariasa" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("results-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("article").filter({ hasText: "Shara Villariasa" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("results-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: "Details", exact: true }).click();
    await expect(page).toHaveURL(/\/payments\/[0-9a-f-]+$/);
    const detailUrl = page.url();
    sharaId = new URL(detailUrl).pathname.split("/")[4] ?? "";
    await expect(page.getByText("REFERENCE_NOT_FOUND", { exact: true })).toBeVisible();
    await expect(page.getByText("ACC-001", { exact: true })).toBeVisible();
    await expect(page.getByText("September 2026", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "View Proof" })).toHaveAttribute("href", "https://example.com/proof.png");
    await expect(page.getByRole("link", { name: "View Proof" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const stale = await page.context().newPage();
    await stale.goto(detailUrl);
    await expect(stale.getByRole("button", { name: "Save decision" })).toBeVisible();
    await page.getByLabel("Manual decision", { exact: true }).selectOption("VERIFIED");
    await page.getByLabel("Manual note (optional)").fill("Confirmed manually with admin.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByRole("region", { name: "Final decision" })).toContainText("Verified · manually reviewed");
    await expect(page.getByText("REFERENCE_NOT_FOUND", { exact: true })).toBeVisible();
    const audit = page.getByRole("region", { name: "Audit trail" });
    await expect(audit).toContainText("Confirmed manually with admin.");
    await expect(audit).toContainText(emailA);
    await expect(audit).toContainText("Revision 1");
    await stale.getByRole("button", { name: "Save decision" }).click();
    await expect(stale.locator("main").getByRole("alert")).toContainText("Another reviewer changed this decision");
    await stale.close();
    await page.reload();
    await expect(page.getByRole("region", { name: "Final decision" })).toContainText("Verified · manually reviewed");
    await expect(audit.getByRole("listitem")).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("review-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("link", { name: "Back to Results" }).click();
    await expectCounts(page, 3, 1);
    await page.getByRole("link", { name: "GCash Transactions", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "ABC123" })).toContainText("Different Amount Customer");
    await expect(page.getByRole("row").filter({ hasText: "UNMATCHED" })).toContainText("No linked payment");
    await page.getByRole("link", { name: "Payment Results", exact: true }).click();
    await page.getByRole("row").filter({ hasText: "Different Amount Customer" }).getByRole("link", { name: "Details" }).click();
    await expect(page.getByText("₱1,300.00", { exact: true })).toBeVisible();
    await expect(page.getByText("₱1,299.00", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Final decision" })).toContainText("Verified");
    await expect(page.getByText("REFERENCE_MATCH", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByText("review-a-payments.xlsx + review-a-gcash.xlsx")).toBeVisible();
    await page.getByRole("link", { name: "View Results", exact: true }).click();
    await expectCounts(page, 3, 1);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, emailA);
    await page.goto("/history");
    await page.getByRole("link", { name: "View Results", exact: true }).click();
    await expectCounts(page, 3, 1);
    await page.goto(detailUrl);
    await page.getByLabel("Manual decision", { exact: true }).selectOption("NEEDS_REVIEW");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByRole("region", { name: "Final decision" })).toContainText("Needs Review · manually reviewed");
    await expect(page.getByRole("region", { name: "Audit trail" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("link", { name: "Back to Results" }).click();
    await expectCounts(page, 2, 2);
  });

  test("read-only membership and foreign/active-workspace UUID isolation", async ({ page, browser }) => {
    await login(page, readerEmail);
    await page.goto(`/verification/${runA}/payments/${sharaId}`);
    await expect(page.getByText("Only workspace owners and admins can save manual decisions.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save decision" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Audit trail" }).getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, emailB);
    await page.getByLabel("Workspace name").fill("Review Workspace B");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    await uploadRun(page, "review-b");
    const runBUrl = page.url();
    await page.goto(`/verification/${runA}`);
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
    await page.goto(`/verification/${runA}/payments/${sharaId}`);
    await expect(page.getByText("Page not found", { exact: true })).toBeVisible();
    await page.goto("/history");
    await expect(page.locator("main")).not.toContainText("review-a-payments.xlsx");
    const context = await browser.newContext();
    try {
      const a = await context.newPage();
      await login(a, emailA);
      await a.goto(runBUrl);
      await expect(a.getByText("Page not found", { exact: true })).toBeVisible();
      await a.goto("/settings");
      await a.getByLabel("Workspace name").fill("Other Workspace A");
      await a.getByRole("button", { name: "Create workspace" }).click();
      await expect(a.locator("aside").getByRole("button", { name: "Other Workspace A" })).toBeVisible();
      await a.goto(`/verification/${runA}`);
      await expect(a.getByText("Page not found", { exact: true })).toBeVisible();
      await a.goto("/history");
      await expect(a.getByText("No completed verification runs yet in this workspace.")).toBeVisible();
      await a.locator("aside").getByRole("button", { name: "Other Workspace A" }).click();
      await a.getByRole("menuitem", { name: /Review Workspace A/ }).click();
      await expect(a.getByRole("link", { name: "View Results", exact: true })).toBeVisible();
      await a.getByRole("link", { name: "View Results", exact: true }).click();
      await expectCounts(a, 2, 2);
    } finally { await context.close(); }
  });
});
