import { test, expect } from "@playwright/test";

test("testnet console explains missing configuration and stays usable on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/testnet");
    await expect(
      page.getByRole("heading", { name: "Testnet escrow", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Configuration required" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect testnet wallet" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Review funding" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Review withdrawal" }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/design/screenshots/testnet-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("link", { name: "STYX homepage", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
});

test("unconfigured wallet module opens its chooser while funding remains disabled", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.goto("/testnet");
  await expect(
    page.getByRole("button", { name: "Review funding" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Connect testnet wallet" }).click();
  await expect(page.getByText("MyNearWallet", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  expect(failures).toEqual([]);
});
