import { test, expect } from "@playwright/test";

test("testnet progress and receipt survive reload, print only the paid receipt and fit mobile", async ({
  page,
}) => {
  let paid = true;
  let writes = 0;
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const job = [...body.executions, ...(body.archivedExecutions || [])].find(
      (j: any) => j.state === "Paid",
    );
    expect(job).toBeTruthy();
    await route.fulfill({
      json: {
        ...body,
        archivedExecutions: [],
        executions: [
          {
            ...job,
            state: paid ? "Paid" : "Approved",
            delivered: paid,
            attested: paid,
            receipt: paid ? job.receipt : undefined,
            mandate: { ...job.mandate, expires: Date.now() + 1800000 },
          },
        ],
      },
    });
  });
  await page.route("**/api/near/**", (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/testnet");
  const progress = page.getByRole("region", { name: "Job progress" });
  await expect(
    progress.getByText("Payment confirmed. Review or save your receipt below."),
  ).toBeVisible();
  await expect(progress.getByText("Complete", { exact: true })).toHaveCount(5);
  await page.getByText("Full payment receipt", { exact: true }).click();
  const receipt = page.locator(".near-receipt-details");
  await expect(receipt).toContainText("0.01 NEAR");
  await expect(receipt).toContainText("Owner-confirmed payment");
  await expect(receipt).toContainText("Verification report hash");
  await expect(
    page.getByRole("link", { name: "Download invoice CSV" }),
  ).toHaveAttribute("href", /\/api\/jobs\/[^/]+\/artifact$/);
  await page.evaluate(() => {
    (window as any).receiptPrintCalls = 0;
    window.print = () => {
      (window as any).receiptPrintCalls++;
    };
  });
  await page.getByRole("button", { name: "Print / save receipt PDF" }).click();
  expect(await page.evaluate(() => (window as any).receiptPrintCalls)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".near-print-receipt")).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  await page.screenshot({
    path: "test-results/near-receipt-print.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Print / save receipt PDF" }),
  ).toBeVisible();
  paid = false;
  await page.reload();
  await expect(
    page.getByText("Next: review agent reservation", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print / save receipt PDF" }),
  ).toHaveCount(0);
  await expect(page.locator(".near-print-receipt")).toHaveCount(0);
  expect(writes).toBe(0);
});
