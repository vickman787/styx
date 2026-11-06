import { test, expect } from "@playwright/test";

test("configured provider comparison selects no default, preserves exact quotes and never submits on selection", async ({
  page,
}) => {
  const owner = "comparison-qa.testnet";
  const ownerKey = "ed25519:" + "5".repeat(44);
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  let mutations = 0;
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    expect(body.providers.map((p: any) => p.id)).toEqual([
      "ledgerworks",
      "parselab",
    ]);
    await route.fulfill({
      json: {
        ...body,
        sourceJobs: [
          {
            id: "COMPARISON-SOURCE",
            name: "Comparison invoice",
            sourceOnly: true,
            reportExpires: Date.now() + 600000,
            artifactHash: "a".repeat(64),
          },
        ],
      },
    });
  });
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill({ json: [ownerKey] }),
  );
  await page.route("**/api/near/balance?*", (route) =>
    route.fulfill({
      json: {
        available: "0",
        reserved: "0",
        withdrawal_pending: "0",
        storage_credit: "0",
      },
    }),
  );
  await page.route("**/api/near/wallet?*", (route) =>
    route.fulfill({ json: { amount: "0", blockHeight: 1 } }),
  );
  await page.route("**/api/near/intents", (route) => {
    mutations++;
    return route.abort();
  });
  await page.route("**/api/near/executions", (route) => {
    mutations++;
    return route.abort();
  });
  await page.goto("/testnet?job=COMPARISON-SOURCE");
  const comparison = page.getByRole("group", {
    name: "Compare testnet service quotes",
  });
  await expect(comparison.getByRole("radio")).toHaveCount(2);
  await expect(comparison.locator("input:checked")).toHaveCount(0);
  await expect(page.getByLabel("Verified source job")).toHaveValue(
    "COMPARISON-SOURCE",
  );
  await expect(page.getByLabel("Owner public key")).toHaveValue(ownerKey);
  await page.getByLabel("Maximum spend (testnet NEAR)").fill("0.01");
  await comparison.getByRole("radio", { name: "ParseLab" }).check();
  await expect(comparison).toContainText("0.012 NEAR");
  await expect(
    page.getByText("The selected quote is 0.012 NEAR.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare agreement", exact: true }),
  ).toBeDisabled();
  await comparison.getByRole("radio", { name: "LedgerWorks" }).check();
  await expect(
    page.getByRole("button", { name: "Prepare agreement", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Maximum spend (testnet NEAR)").fill("1e3");
  await expect(
    page.getByRole("button", { name: "Prepare agreement", exact: true }),
  ).toBeDisabled();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await comparison.screenshot({
    path: "test-results/provider-comparison.png",
  });
  expect(mutations).toBe(0);
});
