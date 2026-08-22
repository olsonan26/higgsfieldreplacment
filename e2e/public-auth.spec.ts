import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("private studio redirects to an accessible sign-in screen", async ({
  page,
}) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Direct the impossible." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("public metadata and copy use the VesperFrame identity", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/VesperFrame/);
  await expect(page.locator("body")).not.toContainText(
    /HF\/\/R|Higgsfield Replacement|Cinema Studio/i,
  );
});
