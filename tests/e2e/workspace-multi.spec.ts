import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

const userAEmail = `ws-a-${randomUUID()}@example.com`;
const userBEmail = `ws-b-${randomUUID()}@example.com`;
const password = "Local-ws-password-123";
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

const userIds: string[] = [];
const businessIds: string[] = [];

async function createUser(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userIds.push(data.user.id);
  return data.user.id;
}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function createFirstWorkspace(page: import("@playwright/test").Page, name: string) {
  await expect(page.getByText("Create a Workspace")).toBeVisible();
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByText("Active Workspace")).toBeVisible();
  await expect(page.locator("main").getByText(name)).toBeVisible();
}

async function createWorkspaceFromSettings(page: import("@playwright/test").Page, name: string) {
  await page.goto("/settings");
  await page.getByLabel("Workspace name").fill(name);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.locator("main").getByText(name)).toBeVisible();
}

async function switchWorkspace(page: import("@playwright/test").Page, from: string, to: string) {
  await page.locator("aside").getByRole("button", { name: new RegExp(from, "i") }).click();
  await page.locator("aside").getByRole("menuitem", { name: new RegExp(to, "i") }).click();
  await expect(page.locator("aside").getByRole("button", { name: new RegExp(to, "i") })).toBeVisible();
}

async function expectActiveWorkspaceBanner(page: import("@playwright/test").Page, name: string) {
  await page.goto("/verification/new");
  await expect(page.locator("main").getByText("Workspace:", { exact: false })).toBeVisible();
  await expect(page.locator("main").getByText(name, { exact: false })).toBeVisible();
}

async function importPaymentsAndGcash(
  page: import("@playwright/test").Page,
  count: number,
  prefix: string,
) {
  const paymentPanel = page.getByRole("region", { name: "Payment Records", exact: true });
  const gcashPanel = page.getByRole("region", { name: "GCash Statement", exact: true });
  const paymentWorkbook = XLSX.utils.book_new();
  const paymentRows: (string | number)[][] = [
    ["Customer", "Amount", "Method", "Reference #"],
  ];
  for (let index = 0; index < count; index++) {
    paymentRows.push([
      `${prefix} Customer ${index}`,
      "1,000.00",
      "gcash",
      `${prefix}P${index}`,
    ]);
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
  await expect(page.getByText(new RegExp(`Preview \\(\\d+ of ${count} rows\\)`))).toBeVisible();

  const gcashWorkbook = XLSX.utils.book_new();
  const gcashRows: unknown[][] = [
    ["Date and Time", null, "ACCOUNTS TO", null, null, null, "REF NO", null, "AMOUNT"],
  ];
  for (let index = 0; index < count; index++) {
    gcashRows.push([
      "2026-08-20 08:00 AM",
      null,
      "Cash in via bank",
      null,
      null,
      null,
      `${prefix}G${index}`,
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
  await expect(
    page.getByText(new RegExp(`Preview \\(\\d+ of ${count} transactions\\)`)),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verify Payments" }).click();
  await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
}

async function getBusinessId(userId: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("created_by", userId)
    .eq("name", name)
    .single();
  if (error) throw error;
  return data.id;
}

async function countsFor(
  businessId: string,
): Promise<{ payments: number; gcash: number; runs: number }> {
  const { count: payments, error: paymentError } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (paymentError) throw paymentError;
  const { count: gcash, error: gcashError } = await supabase
    .from("gcash_transactions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (gcashError) throw gcashError;
  const { count: runs, error: runsError } = await supabase
    .from("verification_runs")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (runsError) throw runsError;
  return { payments: payments ?? 0, gcash: gcash ?? 0, runs: runs ?? 0 };
}

test.describe.serial("workspace management", () => {
  let userAId = "";
  let userBId = "";
  let annieId = "";
  let testBizId = "";
  let bobCoId = "";

  test.beforeAll(async () => {
    userAId = await createUser(userAEmail);
    userBId = await createUser(userBEmail);
  });

  test.afterAll(async () => {
    for (const id of businessIds) {
      await supabase.from("businesses").delete().eq("id", id);
    }
    for (const id of userIds) {
      await supabase
        .from("businesses")
        .delete()
        .eq("created_by", id);
      await supabase.auth.admin.deleteUser(id);
    }
  });

  test("single user: create two workspaces, imports stay isolated after switching", async ({
    page,
  }) => {
    await login(page, userAEmail);
    await createFirstWorkspace(page, "Annie Internet");
    annieId = await getBusinessId(userAId, "Annie Internet");
    businessIds.push(annieId);

    const annieInitial = await countsFor(annieId);
    expect(annieInitial).toEqual({ payments: 0, gcash: 0, runs: 0 });

    await createWorkspaceFromSettings(page, "Test Business");
    testBizId = await getBusinessId(userAId, "Test Business");
    businessIds.push(testBizId);
    expect(testBizId).not.toBe(annieId);

    await expectActiveWorkspaceBanner(page, "Test Business");

    await switchWorkspace(page, "Test Business", "Annie Internet");
    await expectActiveWorkspaceBanner(page, "Annie Internet");
    await importPaymentsAndGcash(page, 5, "ANNIE");

    const annieAfter = await countsFor(annieId);
    expect(annieAfter.payments).toBe(5);
    expect(annieAfter.gcash).toBe(5);
    expect(annieAfter.runs).toBe(1);

    await switchWorkspace(page, "Annie Internet", "Test Business");
    await expectActiveWorkspaceBanner(page, "Test Business");
    await importPaymentsAndGcash(page, 5, "TESTBIZ");

    const testBizAfter = await countsFor(testBizId);
    expect(testBizAfter.payments).toBe(5);
    expect(testBizAfter.gcash).toBe(5);
    expect(testBizAfter.runs).toBe(1);

    const annieStill = await countsFor(annieId);
    expect(annieStill).toEqual(annieAfter);

    const { data: annieRuns } = await supabase
      .from("verification_runs")
      .select("business_id")
      .eq("business_id", annieId);
    const { data: testRuns } = await supabase
      .from("verification_runs")
      .select("business_id")
      .eq("business_id", testBizId);
    expect(annieRuns?.every((r) => r.business_id === annieId)).toBe(true);
    expect(testRuns?.every((r) => r.business_id === testBizId)).toBe(true);
  });

  test("cross-user: workspaces are not visible or reachable across users", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    try {
      const pageB = await contextB.newPage();
      await login(pageB, userBEmail);
      await createFirstWorkspace(pageB, "BobCo");
      bobCoId = await getBusinessId(userBId, "BobCo");
      businessIds.push(bobCoId);
      await expectActiveWorkspaceBanner(pageB, "BobCo");
      await importPaymentsAndGcash(pageB, 2, "BOB");

      const pageA = await contextA.newPage();
      await login(pageA, userAEmail);
      await expectActiveWorkspaceBanner(pageA, "Annie Internet");

      await pageA.goto("/history");
      await expect(
        pageA.locator("main").getByText("Verification Runs", { exact: true }),
      ).toBeVisible();
      await expect(pageA.locator("main")).not.toContainText("BobCo");
      await expect(pageA.locator("aside")).not.toContainText("BobCo");
      await expect(pageA.locator("aside").getByRole("menuitem", { name: /BobCo/ })).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
