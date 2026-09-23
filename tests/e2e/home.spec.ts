import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

const email = `e2e-${randomUUID()}@example.com`;
const password = "Local-e2e-password-123";
const localUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!localUrl || !serviceRoleKey) {
  throw new Error("Local Supabase E2E environment variables are required");
}

const hostname = new URL(localUrl).hostname;
if (hostname !== "127.0.0.1" && hostname !== "localhost") {
  throw new Error("E2E fixtures may only run against local Supabase");
}

const supabase = createClient(localUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId = "";
let businessId = "";

test.beforeAll(async () => {
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError) throw userError;
  userId = userData.user.id;
});

test.afterAll(async () => {
  if (businessId) await supabase.from("businesses").delete().eq("id", businessId);
  if (userId) await supabase.auth.admin.deleteUser(userId);
});

test("redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Payment Reconciliation")).toBeVisible();
});

test("creates a workspace via onboarding then imports every payment and GCash row beyond the preview limit", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByText("Create a Workspace")).toBeVisible();
  await page.getByLabel("Workspace name").fill("E2E Business");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Active Workspace")).toBeVisible();
  await expect(page.getByRole("main").getByText("E2E Business")).toBeVisible();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .eq("created_by", userId)
    .single();
  if (businessError) throw businessError;
  businessId = business.id;

  await page.goto("/verification/new");
  const paymentPanel = page.getByRole("region", { name: "Payment Records", exact: true });
  const gcashPanel = page.getByRole("region", { name: "GCash Statement", exact: true });
  await expect(page.getByRole("button", { name: "Verify Payments" })).toBeDisabled();

  const paymentWorkbook = XLSX.utils.book_new();
  const paymentRows: (string | number)[][] = [
    ["Customer", "Amount", "Method", "Reference #"],
  ];
  for (let index = 0; index < 75; index++) {
    paymentRows.push([`Customer ${index}`, "1,000.00", "gcash", `PAY${index}`]);
  }
  XLSX.utils.book_append_sheet(
    paymentWorkbook,
    XLSX.utils.aoa_to_sheet(paymentRows),
    "Payments",
  );
  const paymentChooserPromise = page.waitForEvent("filechooser");
  await paymentPanel.getByRole("button", { name: "Choose file" }).click();
  const paymentChooser = await paymentChooserPromise;
  await paymentChooser.setFiles({
    name: "payments.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(paymentWorkbook, { type: "buffer", bookType: "xlsx" }),
  });
  await paymentPanel.getByText("Preview", { exact: true }).click();
  await expect(page.getByText("Preview (50 of 75 rows)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify Payments" })).toBeDisabled();

  const gcashWorkbook = XLSX.utils.book_new();
  const gcashRows: unknown[][] = [
    ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
  ];
  for (let index = 0; index < 75; index++) {
    gcashRows.push([
      "2026-08-20 08:00 AM",
      null,
      "Cash in via bank",
      null,
      null,
      null,
      `GCASH${index}`,
      null,
      "1,000.00",
    ]);
  }
  XLSX.utils.book_append_sheet(
    gcashWorkbook,
    XLSX.utils.aoa_to_sheet(gcashRows),
    "GCash",
  );
  const gcashChooserPromise = page.waitForEvent("filechooser");
  await gcashPanel.getByRole("button", { name: "Choose file" }).click();
  const gcashChooser = await gcashChooserPromise;
  await gcashChooser.setFiles({
    name: "gcash.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(gcashWorkbook, { type: "buffer", bookType: "xlsx" }),
  });

  await gcashPanel.getByText("Preview", { exact: true }).click();
  await expect(page.getByText("Preview (50 of 75 transactions)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Verify Payments" })).toBeEnabled();
  const { count: beforeCount } = await supabase.from("verification_runs").select("id", { count: "exact", head: true }).eq("business_id", businessId);
  expect(beforeCount).toBe(0);
  await page.getByRole("button", { name: "Verify Payments" }).click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();

  const { count: paymentCount, error: paymentError } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (paymentError) throw paymentError;
  const { count: gcashCount, error: gcashError } = await supabase
    .from("gcash_transactions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (gcashError) throw gcashError;

  expect(paymentCount).toBe(75);
  expect(gcashCount).toBe(75);
  const { data: runs, error: runError } = await supabase.from("verification_runs").select("id").eq("business_id", businessId);
  if (runError) throw runError;
  expect(runs).toHaveLength(1);
  const run = runs?.[0];
  if (!run) throw new Error("Expected a verification run");
  for (const table of ["payments", "gcash_transactions", "payment_matches"]) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("verification_run_id", run.id).eq("business_id", businessId);
    if (error) throw error;
    expect(count).toBe(75);
  }
});
