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

test("restored production workflows deny anonymous data access and writes", async ({
  request,
}) => {
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  const projectId = "11111111-1111-4111-8111-111111111111";
  const query = `workspaceId=${workspaceId}&projectId=${projectId}`;
  const [settings, prompts, layers] = await Promise.all([
    request.get(`/api/project-settings?${query}`),
    request.get(`/api/prompt-versions?${query}`),
    request.post("/api/assets/edit-layers", {
      headers: { Origin: "http://127.0.0.1:3000" },
      data: {
        workspaceId,
        projectId,
        name: "Anonymous composite",
        layers: [
          {
            assetId: "33333333-3333-4333-8333-333333333333",
            opacity: 1,
            blend: "over",
          },
        ],
        adjustments: {
          brightness: 1,
          saturation: 1,
          blur: 0,
          sharpen: 0,
          rotate: 0,
        },
      },
    }),
  ]);
  expect([settings.status(), prompts.status(), layers.status()]).toEqual([
    401, 401, 401,
  ]);
});
