import { expect, test } from "@playwright/test";

test("shows the public foundation page when unauthenticated", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Payment reconciliation" }),
  ).toBeVisible();
});
