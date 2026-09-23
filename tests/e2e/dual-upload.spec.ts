import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Local Supabase credentials required");
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `dual-${randomUUID()}@example.com`;
const password = "Dual-upload-test-123";
let userId = "";
let businessId = "";

function workbook(kind: "payment" | "gcash", name: string, count: number) {
  const rows = kind === "payment"
    ? [["Customer", "Amount", "Method", "Reference #"], ...Array.from({ length: count }, (_, i) => [`${name} ${i}`, "100.25", "gcash", `000${i}`])]
    : [["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"], ...Array.from({ length: count }, (_, i) => ["2026-08-20 08:00 AM", null, name, null, null, null, `000${i}`, null, "100.25"])];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return { name: `${name}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) };
}

async function upload(page: Page, kind: "payment" | "gcash", name: string, count: number) {
  const panel = page.getByRole("region", { name: kind === "payment" ? "Payment Records" : "GCash Statement", exact: true });
  await panel.locator('input[type="file"]').setInputFiles(workbook(kind, name, count));
  await expect(panel.getByText("Preview", { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});
test.afterAll(async () => {
  if (userId) {
    const { error } = await admin.from("businesses").delete().eq("created_by", userId);
    if (error) throw error;
    await admin.auth.admin.deleteUser(userId);
  }
});

test("GCash first, independent replacement, invalid files, and one full dataset pair", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByLabel("Workspace name").fill("Dual Upload Business");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
  const { data, error } = await admin.from("businesses").select("id").eq("created_by", userId).single();
  if (error) throw error;
  businessId = data.id;
  await page.goto("/verification/new");
  const verify = page.getByRole("button", { name: "Verify Payments" });
  const payment = page.getByRole("region", { name: "Payment Records", exact: true });
  const gcash = page.getByRole("region", { name: "GCash Statement", exact: true });
  await upload(page, "gcash", "old-gcash", 2);
  await expect(verify).toBeDisabled();
  await upload(page, "payment", "old-payments", 2);
  await expect(verify).toBeEnabled();

  await payment.getByRole("button", { name: "Replace Payment File" }).click();
  await expect(verify).toBeDisabled();
  await expect(gcash.getByText("old-gcash.xlsx", { exact: true })).toBeVisible();
  await upload(page, "payment", "invalid-empty", 0);
  await expect(verify).toBeDisabled();
  await expect(payment.getByRole("alert")).toContainText("No valid rows");
  await payment.getByRole("button", { name: "Replace Payment File" }).click();
  await upload(page, "payment", "final-payments", 76);
  await expect(verify).toBeEnabled();

  await gcash.getByRole("button", { name: "Replace GCash File" }).click();
  await expect(verify).toBeDisabled();
  await expect(payment.getByText("final-payments.xlsx", { exact: true })).toBeVisible();
  await upload(page, "gcash", "final-gcash", 81);
  await expect(verify).toBeEnabled();
  const desktopPayment = await payment.boundingBox();
  const desktopGcash = await gcash.boundingBox();
  expect(desktopPayment?.y).toBe(desktopGcash?.y);
  await page.screenshot({ path: testInfo.outputPath("dual-upload-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePayment = await payment.boundingBox();
  const mobileGcash = await gcash.boundingBox();
  expect(mobileGcash?.y).toBeGreaterThan((mobilePayment?.y ?? 0) + (mobilePayment?.height ?? 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dual-upload-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const { count: before, error: beforeError } = await admin.from("verification_runs").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  if (beforeError) throw beforeError;
  expect(before).toBe(0);
  await verify.click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
  const { data: runs, error: runError } = await admin.from("verification_runs").select("id").eq("business_id", businessId);
  if (runError) throw runError;
  expect(runs).toHaveLength(1);
  const run = runs?.[0];
  if (!run) throw new Error("Missing run");
  const { data: payments, error: paymentError } = await admin.from("payments").select("verification_run_id, raw_data, amount, reference_number").eq("business_id", businessId);
  const { data: transactions, error: gcashError } = await admin.from("gcash_transactions").select("verification_run_id, raw_data, amount, reference_number").eq("business_id", businessId);
  if (paymentError || gcashError) throw paymentError ?? gcashError;
  expect(payments).toHaveLength(76);
  expect(transactions).toHaveLength(81);
  for (const { rows, filename } of [{ rows: payments, filename: "final-payments.xlsx" }, { rows: transactions, filename: "final-gcash.xlsx" }]) {
    for (const row of rows ?? []) {
      expect(row.verification_run_id).toBe(run.id);
      expect(row.raw_data.filename).toBe(filename);
      expect(row.amount).toBe(100.25);
      expect(row.reference_number).toMatch(/^000/);
    }
  }
});
