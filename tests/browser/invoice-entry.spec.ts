import { test, expect } from "@playwright/test";

test("old job entry redirects to the actual invoice upload form", async ({
  page,
}) => {
  await page.goto("/jobs/new");
  await expect(page).toHaveURL(/\/testnet#upload$/);
  await expect(
    page.getByRole("region", { name: "Your invoice evidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Create a job", exact: true }),
  ).toHaveCount(0);
});

test("invoice list starts an upload and refreshes its count after preparation", async ({
  page,
}) => {
  test.setTimeout(120000);
  let prepared = false;
  const job = {
    id: "STX-ENTRY-QA",
    name: "My upload navigation check",
    sourceOnly: true,
    state: "ready_for_review",
    updatedAt: Date.now(),
    uploads: [{ name: "qa.json" }],
    artifact: { execution: { engine: "local" } },
  };
  // UI callback regression only: no workspace writes, AI requests or transactions.
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), jobs: prepared ? [job] : [] },
    });
  });
  await page.route("**/api/near/sources", async (route) => {
    prepared = true;
    await route.fulfill({ status: 201, json: job });
  });
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: "No invoice deliveries yet" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Upload invoices", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/testnet#upload$/);
  const form = page.getByRole("region", { name: "Your invoice evidence" });
  await form.getByLabel("Delivery name").fill(job.name);
  await form.getByLabel("Invoice files").setInputFiles({
    name: "qa.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"invoice_id":"QA-1"}'),
  });
  await form.getByRole("button", { name: "Prepare invoice evidence" }).click();
  await expect(form).toContainText("Invoice evidence verified");
  await page
    .getByRole("link", { name: "Invoice deliveries 1", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: job.name, exact: true }),
  ).toBeVisible();
});
