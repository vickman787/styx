import { test, expect } from "@playwright/test";

test("earlier contract receipt stays available without old signing controls", async ({
  page,
}) => {
  let writes = 0;
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/testnet");
  const panel = page
    .locator(".near-section")
    .filter({
      has: page.getByRole("heading", { name: "Earlier contract history" }),
    });
  await expect(panel).toBeVisible();
  await panel.locator("summary").filter({ hasText: "Paid" }).click();
  await expect(panel).toContainText("styx-contract-1effc31636.testnet");
  await panel.getByText("Full payment receipt", { exact: true }).click();
  await expect(panel.locator(".near-receipt-details")).toContainText(
    "0.01 NEAR",
  );
  await expect(
    panel.getByRole("link", { name: "Download invoice CSV" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: /Review|Accept & release|Refresh chain/,
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(panel).toBeVisible();
  expect(writes).toBe(0);
});
