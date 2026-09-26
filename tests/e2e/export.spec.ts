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

  test("two annotated source downloads preserve original sheets, values, matches and final decisions", async ({ page }, testInfo) => {
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
      ...fixture.payments.map((p) => [p.customer, p.account, p.billing_period, Number(p.amount_decimal), p.method, p.reference_number, p.payment_date, p.notes, p.paid_by, p.received_by, p.photo_url, p.created_at_source]),
    ] }, { name: "Instructions", rows: [["Keep this original content"]] }]);
    const headers = ["Date and Time", "Account", "Description", "Channel", "Note", "Balance", "REF NO", "Type", "Debit", "Unused", "Credit", "Extra Bank Field"];
    const gcash = file("GCash.xlsx", ["September", "October"].map((name, index) => ({ name, rows: [headers,
      ...fixture.gcash.slice(index * 3, index * 3 + 3).map((g) => ["2026-09-21 08:00 AM", "00001234", g.description, "Original channel", "Original note", "5000", g.reference_number, "Original type", Number(g.amount_decimal), "", "", `Extra ${g.source_order}`]),
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
    await expect(page.getByRole("button", { name: /^Download / })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Download Excel Report", exact: true })).toHaveCount(0);
    const originals = await admin.from("verification_source_workbooks").select("kind").eq("verification_run_id", runId);
    expect(originals.data).toHaveLength(2);
    for (const [label, filename] of [["Download Payment Records", "PAYMENTS - Verified.xlsx"], ["Download GCash", "GCash - Matched.xlsx"]] as const) {
      const wait = page.waitForEvent("download");
      await page.getByRole("button", { name: label, exact: true }).click();
      const download = await wait;
      expect(download.suggestedFilename()).toBe(filename);
      await download.saveAs(testInfo.outputPath(filename));
      expect(await download.failure()).toBeNull();
      const stream = await download.createReadStream(); if (!stream) throw new Error("Empty download");
      const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(Buffer.concat(chunks)).buffer);
      if (label === "Download Payment Records") {
        expect(book.worksheets.map((s) => s.name)).toEqual(["Payments", "Instructions"]);
        const sheet = book.getWorksheet("Payments"); if (!sheet) throw new Error("Missing source sheet");
        expect(sheet.rowCount).toBe(10); expect(sheet.columnCount).toBe(14);
        expect(sheet.getCell("M1").text).toBe("Verification Status"); expect(sheet.getCell("N1").text).toBe("Verification Note");
        expect(sheet.getCell("D2").value).toBe(1300); expect(sheet.getCell("F2").value).toBe("0045276500984");
        expect(sheet.getCell("M2").text).toBe("VERIFIED"); expect(sheet.getCell("M3").text).toBe("NEEDS REVIEW");
        for (const [row, fill] of [[2, "FFDCFCE7"], [3, "FFFEE2E2"], [6, "FFDBEAFE"], [7, "FFFEF9C3"]] as const) expect(sheet.getCell(row, 13).fill).toMatchObject({ fgColor: { argb: fill } });
        expect(sheet.getCell("M8").text).toBe("VERIFIED"); expect(sheet.getCell("N8").text).toContain("Manually marked verified. Confirmed manually with admin");
        expect(sheet.getCell("G5").value).toBe("2026-02-30");
        expect(book.getWorksheet("Instructions")?.getCell("A1").text).toBe("Keep this original content");
      } else {
        expect(book.worksheets.map((s) => s.name)).toEqual(["September", "October"]);
        const s = book.getWorksheet("September"); const o = book.getWorksheet("October"); if (!s || !o) throw new Error("Missing source sheet");
        expect(s.rowCount).toBe(4); expect(o.rowCount).toBe(4); expect(s.columnCount).toBe(13);
        expect(s.getCell("M1").text).toBe("Matched Customer"); expect(s.getCell("G2").value).toBe("0045276500984");
        expect(s.getCell("I2").value).toBe(1299); expect(s.getCell("M2").text).toBe("Jake Tirana");
        expect(s.getCell("L2").text).toBe("Extra 0"); expect(o.getCell("G2").text).toBe("0000203966985");
        for (const [sheet, row] of [[s, 3], [s, 4], [o, 3], [o, 4]] as const) expect(sheet.getCell(row, 13).text).toBe("");
        expect(o.getCell("C4").text).toBe("@untrusted-description"); expect(o.getCell("C4").formula).toBeUndefined();
      }
    }
  });

  test("read-only member may export; foreign and inactive workspace requests cannot", async ({ page }) => {
    await login(page, readerEmail);
    for (const kind of ["payments", "gcash"]) {
      const response = await page.request.get(`/verification/${runId}/export?file=${kind}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("spreadsheetml.sheet");
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, otherEmail);
    await page.getByLabel("Workspace name").fill("Other Export Business");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByText("Active Workspace", { exact: true })).toBeVisible();
    for (const kind of ["payments", "gcash"]) {
      const denied = await page.request.get(`/verification/${runId}/export?file=${kind}`);
      expect(denied.status()).toBe(404);
      expect(denied.headers()["content-type"] ?? "").not.toContain("spreadsheetml.sheet");
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page, email);
    await page.goto("/settings");
    await page.getByLabel("Workspace name").fill("Inactive Export Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.locator("aside").getByRole("button", { name: "Inactive Export Workspace" })).toBeVisible();
    for (const kind of ["payments", "gcash"]) {
      const inactiveStatus = await page.evaluate(async (path) => (await fetch(path, { cache: "no-store" })).status, `/verification/${runId}/export?file=${kind}`);
      expect(inactiveStatus).toBe(404);
    }
  });
});
