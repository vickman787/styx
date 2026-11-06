import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("testnet AI choice requires fresh consent and sends the selected engine without a real paid request", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    await route.fulfill({
      json: {
        ...status,
        model: { ready: true, enabled: true, model: "synthetic/consent-qa" },
      },
    });
  });
  let calls = 0;
  let submitted: any;
  await page.route("**/api/near/sources", async (route) => {
    calls++;
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      json: {
        error: "Consent QA intercepted the request; no model call was made.",
      },
    });
  });
  await page.goto("/testnet");
  const form = page.getByRole("region", { name: "Your invoice evidence" });
  await form.getByLabel("Delivery name").fill("AI consent QA");
  await form
    .getByLabel("Invoice files")
    .setInputFiles({
      name: "qa.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          invoice_id: "QA-1",
          vendor: "Synthetic test",
          date: "2026-10-27",
          currency: "USD",
          subtotal: "10.00",
          tax: "1.00",
          total: "11.00",
        }),
      ),
    });
  const engine = form.getByLabel("Invoice processing");
  await engine.selectOption("near_ai");
  const consent = form.getByRole("checkbox", {
    name: /I approve sending these invoice fields/,
  });
  const prepare = form.getByRole("button", {
    name: "Prepare invoice evidence",
  });
  await expect(consent).not.toBeChecked();
  await expect(prepare).toBeDisabled();
  expect(calls).toBe(0);
  await consent.check();
  await expect(prepare).toBeEnabled();
  await engine.selectOption("local");
  await engine.selectOption("near_ai");
  await expect(consent).not.toBeChecked();
  await expect(prepare).toBeDisabled();
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
        path: `docs/verification/testnet-ai-consent-${width}.png`,
        fullPage: true,
      });
  }
  await consent.check();
  await prepare.click();
  await expect(form.getByRole("alert")).toContainText("no model call was made");
  expect(calls).toBe(1);
  expect(submitted.processing).toBe("near_ai");
  expect(submitted.externalConsent).toBe(true);
});
