import { test, expect } from "@playwright/test";

test("expired agreement has one fresh-proposal action with identical owner terms and no signing", async ({
  page,
}) => {
  const owner = "expiry-qa.testnet";
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  let fresh = false;
  let original: any;
  let signingRequests = 0;
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    original = {
      ...body.executions[0],
      id: "EXPIRED-AGREEMENT-QA",
      jobId: "OLD-SOURCE-QA",
      name: "Expiry workflow check",
      owner,
      state: "Planned",
      mandate: {
        ...body.executions[0].mandate,
        cap: "10000000000000000000000",
        expires: Date.now() - 60000,
      },
      createdAt: Date.now() - 3600000,
    };
    const next = {
      ...original,
      id: "FRESH-AGREEMENT-QA",
      jobId: "FRESH-SOURCE-QA",
      mandate: { ...original.mandate, expires: Date.now() + 1800000 },
      createdAt: Date.now(),
    };
    await route.fulfill({
      json: { ...body, executions: fresh ? [next, original] : [original] },
    });
  });
  await page.route("**/api/jobs/OLD-SOURCE-QA/reverify", (route) =>
    route.fulfill({
      json: {
        id: "FRESH-SOURCE-QA",
        report: { expires: Date.now() + 3600000 },
      },
    }),
  );
  await page.route("**/api/near/executions", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      jobId: "FRESH-SOURCE-QA",
      owner,
      ownerKey: original.ownerKey,
      provider: original.provider,
      cap: "0.01",
    });
    fresh = true;
    await route.fulfill({ json: { id: "FRESH-AGREEMENT-QA" } });
  });
  await page.route("**/api/near/intents", (route) => {
    signingRequests++;
    return route.abort();
  });
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill({ json: [] }),
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
  await page.goto("/testnet");
  await expect(
    page.getByRole("button", { name: "Review owner approval", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Agreement", { exact: true }).locator("option"),
  ).toContainText(["Expired"]);
  await page
    .getByRole("button", { name: "Prepare fresh agreement", exact: true })
    .click();
  await expect(page.getByLabel("Agreement", { exact: true })).toHaveValue(
    "FRESH-AGREEMENT-QA",
  );
  await expect(
    page.getByRole("button", { name: "Review owner approval", exact: true }),
  ).toBeEnabled();
  expect(signingRequests).toBe(0);
});
