import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("wallet connection is in the header across workspace routes on desktop and mobile", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/app", "/jobs", "/testing", "/testnet"]) {
      await page.goto(path);
      const header = page.locator("header.toolbar");
      await expect(
        header.getByRole("button", { name: "Connect wallet", exact: true }),
      ).toBeVisible();
      await expect(header.getByRole("link", { name: /settings/i })).toHaveCount(
        0,
      );
      await expect(header).not.toContainText("AS");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `docs/verification/header-wallet-${width}.png`,
    });
  }
  await page.goto("/app");
  await page
    .locator("header.toolbar")
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.getByText("MyNearWallet", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("Meteor Wallet", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/verification/wallet-chooser-320.png",
    animations: "disabled",
  });
  await expect(page).toHaveURL(/\/app$/);
  expect(errors).toEqual([]);
});
