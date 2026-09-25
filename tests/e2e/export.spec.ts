import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { exportFixture } from "../fixtures/export";

const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local Supabase required");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `export-${randomUUID()}@example.com`;
const otherEmail = `export-other-${randomUUID()}@example.com`;
const readerEmail = `export-reader-${randomUUID()}@example.com`;
const password = "Local-export-password-123";
const users: string[] = [];
let readerId = "";
let runId = "";
let businessId = "";

function file(name: string, sheets: { name: string; rows: unknown[][] }[]) {
  const book = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }) };
}
async function login(page: Page, loginEmail: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(loginEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.serial("Excel report download", () => {
  test.setTimeout(90000);
  test.beforeAll(async () => {
    for (const userEmail of [email, otherEmail, readerEmail]) {
      const { data, error } = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      if (userEmail === readerEmail) readerId = data.user.id;
    }
  });
  test.afterAll(async () => {
    const { error } = await admin.from("businesses").delete().in("created_by", users);
    if (error) throw error;
    for (const id of users) {
      const { error: userError } = await admin.auth.admin.deleteUser(id);
      if (userError) throw userError;
    }
  });

  test("History download opens with original GCash columns, exact references and final decisions", async ({ page }, testInfo) => {
    const fixture = exportFixture();
    await login(page, email);
    await page.getByLabel("Workspace name").fill("Export Business");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    const { data: business, error } = await admin.from("businesses").select("id").eq("created_by", users[0]).single();
    if (error) throw error;
    businessId = business.id;
    const { error: memberError } = await admin.from("business_members").insert({ business_id: businessId, user_id: readerId, role: "member" });
    if (memberError) throw memberError;
    await page.goto("/verification/new");
    const payments = file("PAYMENTS.xlsx", [{ name: "Payments", rows: [
      ["Customer", "Account", "Billing Period", "Amount", "Method", "Reference #", "Payment Date", "Notes", "Paid By", "Received By", "Photo", "Created At"],
      ...fixture.payments.map((p) => [p.customer, p.account, p.billing_period, p.amount_decimal, p.method, p.reference_number, p.payment_date, p.notes, p.paid_by, p.received_by, p.photo_url, p.created_at_source]),
    ] }]);
    const headers = ["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit", "Unused", "Credit", "Extra Bank Field"];
    const gcash = file("GCash.xlsx", ["September", "October"].map((name, index) => ({ name, rows: [headers,
      ...fixture.gcash.slice(index * 3, index * 3 + 3).map((g) => ["2026-09-21 08:00 AM", "00001234", g.description, "Original channel", "Original note", "5000", g.reference_number, "Original type", g.amount_decimal, "", "", `Extra ${g.source_order}`]),
    ] })));
    await page.getByRole("region", { name: "Payment Records", exact: true }).locator('input[type="file"]').setInputFiles(payments);
    await expect(page.getByRole("region", { name: "Payment Records", exact: true }).getByText("Preview", { exact: true })).toBeVisible();
    await page.getByRole("region", { name: "GCash Statement", exact: true }).locator('input[type="file"]').setInputFiles(gcash);
    await page.getByRole("button", { name: "Verify Payments" }).click();
    await expect(page.getByText("Verification Complete", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View Results", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verification Results" })).toBeVisible();
    runId = new URL(page.url()).pathname.split("/")[2] ?? "";
    await page.getByRole("row").filter({ hasText: "Manual Only Customer" }).getByRole("link", { name: "Details" }).click();
    await page.getByLabel("Manual decision", { exact: true }).selectOption("VERIFIED");
    await page.getByLabel("Manual note (optional)").fill("Confirmed manually with admin");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByRole("region", { name: "Final decision" })).toContainText("Verified · manually reviewed");
    await page.getByRole("link", { name: "History", exact: true }).click();
    await page.getByRole("link", { name: "View Results", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Excel Report", exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("Payment_Verification_Sep_2026.xlsx");
    await download.saveAs(testInfo.outputPath(download.suggestedFilename()));
    expect(await download.failure()).toBeNull();
    expect(await download.path()).toBeTruthy();
    const stream = await download.createReadStream();
    if (!stream) throw new Error("Download is empty");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = new Uint8Array(Buffer.concat(chunks));
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer);
    expect(book.worksheets.map((s) => s.name)).toEqual(["Summary", "All Payments", "Verified", "Needs Review", "Cash", "Bank", "GCash Transactions"]);
    const statement = book.getWorksheet("GCash Transactions");
    const all = book.getWorksheet("All Payments");
    const verified = book.getWorksheet("Verified");
    if (!statement || !all || !verified) throw new Error("Missing report sheets");
    expect(statement.rowCount).toBe(7);
    expect(statement.getRow(1).getCell(statement.columnCount).text).toBe("Matched Customer");
    expect(statement.getRow(2).getCell(9).value).toBe("0045276500984");
    expect(statement.getRow(2).getCell(9).type).toBe(ExcelJS.ValueType.String);
    expect(statement.getRow(2).getCell(11).value).toBe(1299);
    expect(statement.getRow(2).getCell(statement.columnCount).text).toBe("Jake Tirana");
    expect(statement.getRow(2).getCell(14).text).toBe("Extra 0");
    expect(statement.getRow(5).getCell(1).text).toBe("October");
    expect(statement.getRow(5).getCell(9).text).toBe("0000203966985");
    for (const row of [3, 4, 6, 7]) expect(statement.getRow(row).getCell(statement.columnCount).text).toBe("");
    expect(statement.getRow(7).getCell(5).text).toBe("'@untrusted-description");
    expect(all.getRow(2).getCell(4).value).toBe(1300);
    expect(all.getRow(2).getCell(6).value).toBe("0045276500984");
    expect(all.getRow(2).getCell(15).text).toBe("VERIFIED");
    const manual = verified.getRow(3);
    expect(manual.getCell(1).text).toBe("Manual Only Customer");
    expect(manual.getCell(13).text).toBe("NEEDS_REVIEW");
    expect(manual.getCell(15).text).toBe("VERIFIED");
    expect(manual.getCell(16).text).toBe("Yes");
    expect(manual.getCell(20).text).toBe("");
    expect(all.getRow(5).getCell(7).value).toBeNull();
  });

  test("read-only member may export; foreign and inactive workspace requests cannot", async ({ page }) => {
    await login(page, readerEmail);
    const response = await page.request.get(`/verification/${runId}/export`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheetml.sheet");
    expect(response.headers()["cache-control"]).toContain("no-store");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, otherEmail);
    await page.getByLabel("Workspace name").fill("Other Export Business");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    const denied = await page.request.get(`/verification/${runId}/export`);
    expect(denied.status()).toBe(404);
    expect(denied.headers()["content-type"] ?? "").not.toContain("spreadsheetml.sheet");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, email);
    await page.goto("/settings");
    await page.getByLabel("Workspace name").fill("Inactive Export Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.locator("aside").getByRole("button", { name: "Inactive Export Workspace" })).toBeVisible();
    const inactiveStatus = await page.evaluate(async (path) => (await fetch(path, { cache: "no-store" })).status, `/verification/${runId}/export`);
    expect(inactiveStatus).toBe(404);
  });
});
