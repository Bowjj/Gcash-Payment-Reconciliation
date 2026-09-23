import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Local Supabase credentials required");
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `reconcile-${randomUUID()}@example.com`;
const password = "Local-reconciliation-123";
let userId = "";

function excel(name: string, rows: unknown[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Original Sheet");
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) };
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
    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) throw userError;
  }
});

test("exact-reference reconciliation, amount difference, safe ambiguities and summary", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByLabel("Workspace name").fill("Reconciliation Business");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
  const { data: business, error: businessError } = await admin.from("businesses").select("id").eq("created_by", userId).single();
  if (businessError) throw businessError;
  await page.goto("/verification/new");
  await expect(page.locator("main").getByText("Reconciliation Business", { exact: true })).toBeVisible();
  const payments = excel("payments.xlsx", [
    ["Customer", "Amount", "Method", "Reference #"],
    ["Jake Tirana", "1000", "GCASH", "0045276500984"],
    ["Different Amount Customer", "1300", "GCASH", "ABC123456"],
    ["Missing Reference", "1000", "GCASH", ""],
    ["Reference Not Found", "1000", "GCASH", "999999999"],
    ["Duplicate Statement", "1000", "GCASH", "DUP-G"],
    ["Cash Customer", "1000", "CASH", ""],
    ["Bank Customer", "1000", "bank_transfer", "ABC123456"],
    ["Duplicate Payment A", "1000", "GCASH", "DUP-P"],
    ["Duplicate Payment B", "999", "GCASH", "DUP-P"],
    ["Another Leading Zero", "1000", "GCASH", "0000203966985"],
  ]);
  const gcashRows: unknown[][] = [
    ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
    ...[["0045276500984", "1000"], ["ABC123456", "1299"], ["DUP-G", "1000"], ["DUP-G", "999"], ["DUP-P", "1000"], ["0000203966985", "1000"], ["UNMATCHED", "50"]].map(([ref, amount]) => ["2026-09-21 08:00 AM", null, "Original transaction description", null, null, null, ref, null, amount]),
  ];
  const gcash = excel("gcash.xlsx", gcashRows);
  const paymentPanel = page.getByRole("region", { name: "Payment Records", exact: true });
  const gcashPanel = page.getByRole("region", { name: "GCash Statement", exact: true });
  await paymentPanel.locator('input[type="file"]').setInputFiles(payments);
  await expect(paymentPanel.getByText("Preview", { exact: true })).toBeVisible();
  await gcashPanel.locator('input[type="file"]').setInputFiles(gcash);
  await expect(page.getByRole("button", { name: "Verify Payments" })).toBeEnabled();
  await page.getByRole("button", { name: "Verify Payments" }).click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
  const summary = page.locator('dl[aria-label="Reconciliation summary"]');
  for (const { label, value } of [
    { label: "Total Payments", value: "10" }, { label: "Verified", value: "3" },
    { label: "Needs Review", value: "5" }, { label: "Cash", value: "1" }, { label: "Bank", value: "1" },
  ]) {
    await expect(summary.locator("div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(value);
  }
  await page.screenshot({ path: testInfo.outputPath("reconciliation-summary.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("reconciliation-summary-mobile.png"), fullPage: true });

  const { data: runs, error: runsError } = await admin.from("verification_runs").select("id,status").eq("business_id", business.id);
  if (runsError) throw runsError;
  expect(runs).toHaveLength(1);
  expect(runs?.[0]?.status).toBe("succeeded");
  const { data: p, error: pError } = await admin.from("payments").select("id,amount").eq("business_id", business.id).eq("customer", "Different Amount Customer").single();
  if (pError) throw pError;
  const { data: match, error: matchError } = await admin.from("payment_matches").select("status,reason,gcash_transaction_id,verification_run_id").eq("payment_id", p.id).single();
  if (matchError) throw matchError;
  expect(p.amount).toBe(1300);
  expect(match).toMatchObject({ status: "VERIFIED", reason: "REFERENCE_MATCH", verification_run_id: runs?.[0]?.id });
  const { data: g, error: gError } = await admin.from("gcash_reconciliation").select("amount,matched_customer,raw_data,description").eq("id", match.gcash_transaction_id).single();
  if (gError) throw gError;
  expect(g.amount).toBe(1299);
  expect(g.matched_customer).toBe("Different Amount Customer");
  expect(g.description).toBe("Original transaction description");
  expect(g.raw_data).toMatchObject({ filename: "gcash.xlsx", sheet_name: "Original Sheet", source_order: 1 });
  const { data: unmatched, error: unmatchedError } = await admin.from("gcash_reconciliation").select("matched_customer").eq("business_id", business.id).in("reference_number", ["DUP-G", "DUP-P", "UNMATCHED"]);
  if (unmatchedError) throw unmatchedError;
  expect(unmatched).toHaveLength(4);
  expect(unmatched?.every((row) => row.matched_customer === null)).toBe(true);
});
