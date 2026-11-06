import { test, expect } from "@playwright/test";

test("expired source can be re-checked without uploading or choosing a payment cap", async ({
  page,
}) => {
  let checked = false;
  // Isolated UI fixture: no AI call, saved owner data change or chain transaction.
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        executions: [],
        sourceJobs: [
          {
            id: "RECHECK-QA",
            sourceRootId: "ORIGINAL-QA",
            name: "Re-check UI fixture",
            sourceOnly: true,
            reportExpires: checked ? Date.now() + 3600000 : Date.now() - 1000,
            artifactHash: "qa",
          },
          {
            id: "ORIGINAL-QA",
            sourceRootId: "ORIGINAL-QA",
            name: "Re-check UI fixture",
            sourceOnly: true,
            reportExpires: Date.now() - 1000,
            artifactHash: "qa",
          },
        ],
      },
    });
  });
  await page.route("**/api/jobs/RECHECK-QA/reverify", async (route) => {
    expect(route.request().method()).toBe("POST");
    checked = true;
    await route.fulfill({ json: { id: "RECHECK-QA" } });
  });
  await page.goto("/testnet");
  await expect(
    page.getByRole("button", { name: "Re-check saved invoice" }),
  ).toHaveCount(1);
  await expect(
    page
      .getByLabel("Verified source job")
      .locator("option[value='ORIGINAL-QA']"),
  ).toHaveCount(0);
  await page
    .getByText("Earlier verification versions (1)", { exact: true })
    .click();
  await expect(
    page.getByText("ORIGINAL-QA · Re-check UI fixture · Verification expired", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Re-check saved invoice" }).click();
  await expect(page.getByLabel("Verified source job")).toHaveValue(
    "RECHECK-QA",
  );
  await expect(page.getByLabel("Maximum spend (testnet NEAR)")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Re-check saved invoice" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Saved invoice and CSV re-checked. No AI request or wallet payment was made.",
      { exact: true },
    ),
  ).toBeVisible();
});
