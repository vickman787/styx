import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("cloud processing requires an explicit unchecked consent and has responsive accessible rules", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/jobs/new");
  await page.locator(".steps button").nth(1).click();
  await expect(page.getByRole("radio", { name: /Local parser/ })).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /NEAR AI Cloud/ }),
  ).toBeDisabled();
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      json: {
        ...data,
        model: {
          ready: true,
          enabled: true,
          model: "test/model",
          endpoint: "https://cloud-api.near.ai/v1/chat/completions",
        },
      },
    });
  });
  await page.goto("/jobs/new");
  await page
    .getByRole("textbox", { name: "Task name" })
    .fill("Cloud processing review");
  await page.getByRole("button", { name: "Load 30 sample invoices" }).click();
  await page.locator(".steps button").nth(1).click();
  await page.getByRole("radio", { name: /NEAR AI Cloud/ }).check();
  const consent = page.getByRole("checkbox", {
    name: /I approve sending these invoices/,
  });
  await expect(consent).not.toBeChecked();
  let submissions = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/jobs")
      submissions++;
  });
  await page.locator(".steps button").nth(2).click();
  await page
    .getByRole("button", { name: "Review mandate", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /external processing consent/ }),
  ).toBeVisible();
  expect(submissions).toBe(0);
  await consent.check();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/screenshots/model-rules-${width}.png`,
      fullPage: true,
    });
    if (width !== 320) {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  }
  await page.locator(".steps button").nth(2).click();
  await expect(
    page.getByText(/NEAR AI Cloud · test\/model · external sharing approved/),
  ).toBeVisible();
  expect(submissions).toBe(0);
});
