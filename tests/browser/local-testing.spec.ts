import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("local cases fit desktop and mobile and create resumable owner-controlled jobs", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/app");
  await page
    .getByRole("link", { name: "Local testing", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Local testing", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".testing-case")).toHaveCount(8);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: `docs/verification/local-testing-${width}.png`,
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = page.getByRole("region", {
    name: "Successful delivery",
    exact: true,
  });
  await card.getByRole("button", { name: /Start/ }).click();
  await expect(page).toHaveURL(/\/jobs\/[^/]+\/mandate$/);
  const id = page.url().split("/").at(-2)!;
  await expect(
    page.getByText("Local test with synthetic invoices.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve mandate v1", exact: true })
    .click();
  await expect(page).toHaveURL(/\/quotes$/);
  await page
    .getByRole("button", { name: "Reserve & start", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: /Accept & release/ }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Cancel & release reservation", exact: true })
    .click();
  await page.goto("/testing");
  await page.reload();
  await expect(card).toContainText(id);
  await expect(card).toContainText("Reservation refunded");
  await card.getByRole("link", { name: "Continue latest run" }).click();
  await expect(page).toHaveURL(new RegExp(`/jobs/${id}$`));
});
