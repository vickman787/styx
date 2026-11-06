import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("live deployed contract data and owner uploads replace default demo content", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/app");
  await expect(page.locator("main h1")).toBeVisible();
  const status = await (await page.request.get("/api/near")).json();
  test.skip(
    !status.ready,
    "Requires the explicitly configured live testnet profile.",
  );
  await expect(
    page.getByRole("heading", { name: "Testnet escrow", exact: true }),
  ).toBeVisible();
  const chain = await page.request.get("/api/near/network");
  expect(chain.ok(), await chain.text()).toBe(true);
  const live = await chain.json();
  expect(live.network).toBe("testnet");
  expect(live.codeHash).toBe(status.codeHash);
  expect(live.blockHeight).toBeGreaterThan(0);
  await expect(
    page.getByRole("region", { name: "Live testnet connection" }),
  ).toContainText("Deployed code verified", { timeout: 30000 });
  const native = await page.request.get(
    `/api/near/wallet?owner=${status.contractId}`,
  );
  expect(native.ok(), await native.text()).toBe(true);
  expect(BigInt((await native.json()).amount)).toBeGreaterThan(0n);
  await expect(page.getByLabel("Include local demo deliveries")).toHaveCount(0);
  const before = await (await page.request.get("/api/state")).json();
  await page.getByLabel("Delivery name").fill("Browser acceptance invoice");
  await page.getByLabel("Invoice files").setInputFiles({
    name: "acceptance.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        invoice_id: "BROWSER-OWN-1",
        vendor: "Acceptance test vendor",
        date: "2026-10-27",
        currency: "USD",
        subtotal: "12.00",
        tax: "1.00",
        total: "13.00",
      }),
    ),
  });
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/near/sources") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Prepare invoice evidence", exact: true })
    .click();
  const response = await createdResponse;
  expect(response.ok(), await response.text()).toBe(true);
  const job = await response.json();
  try {
    await expect(
      page.getByRole("link", { name: "Inspect your invoices and CSV" }),
    ).toBeVisible();
    expect(job.sourceOnly).toBe(true);
    expect(job.state).toBe("ready_for_review");
    expect(job.selected).toBeUndefined();
    const after = await (await page.request.get("/api/state")).json();
    expect(after.balance).toEqual(before.balance);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (width !== 320)
        await page.screenshot({
          path: `docs/verification/live-testnet-${width}.png`,
          fullPage: true,
        });
    }
  } finally {
    const { csrf } = await (await page.request.get("/api/session")).json();
    const cancelled = await page.request.post(`/api/jobs/${job.id}/cancel`, {
      headers: { "X-Styx-CSRF": csrf, Origin: "http://127.0.0.1:4173" },
      data: {},
    });
    expect(cancelled.ok(), await cancelled.text()).toBe(true);
  }
});

test("live provider and invoice pages exclude the seeded demo service data", async ({
  page,
}) => {
  await page.goto("/providers");
  await expect(page.locator("main h1")).toBeVisible();
  const status = await (await page.request.get("/api/near")).json();
  test.skip(!status.ready, "Requires configured live testnet profile.");
  await expect(
    page.getByRole("heading", { name: "Testnet providers" }),
  ).toBeVisible();
  await expect(page.locator("main")).toContainText(
    status.providers[0].recipient,
  );
  await expect(page.locator("main")).toContainText("0.01 NEAR");
  await expect(page.locator("main")).not.toContainText(".demo");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: "Invoice deliveries" }),
  ).toBeVisible();
  await expect(page.locator("main")).not.toContainText("STX-1042");
  await expect(page.locator("main")).not.toContainText("100.00");
  expect(
    status.sourceJobs.every((job: { sourceOnly: boolean }) => job.sourceOnly),
  ).toBe(true);
  for (const path of ["/activity", "/settings", "/app"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("STX-1042");
    await expect(page.locator("footer.footer")).not.toContainText(
      "transactions require",
    );
    await expect(page.locator("footer.footer")).not.toContainText("Local demo");
    await expect(page.locator(".workspace-identity")).not.toContainText(
      "Acme Studio",
    );
  }
  await expect(page.getByLabel("Include local demo deliveries")).toHaveCount(0);
});
