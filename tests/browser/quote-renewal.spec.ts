import { test, expect } from "@playwright/test";

test("expired quote renews explicitly before reservation review", async ({
  page,
}) => {
  let renewed = false;
  const owner = "quote-qa.testnet";
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  // UI fixture only: no customer agreement changes, model requests or signing.
  await page.route("**/api/near", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const original = body.executions[0];
    await route.fulfill({
      json: {
        ...body,
        executions: [
          {
            ...original,
            id: "QUOTE-QA",
            owner,
            state: "Approved",
            mandate: { ...original.mandate, expires: Date.now() + 600000 },
            quote: {
              ...original.quote,
              expires: renewed ? Date.now() + 600000 : Date.now() - 1000,
            },
          },
        ],
      },
    });
  });
  await page.route(
    "**/api/near/executions/QUOTE-QA/renew-quote",
    async (route) => {
      expect(route.request().method()).toBe("POST");
      renewed = true;
      await route.fulfill({ json: {} });
    },
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
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/near/wallet?*", (route) =>
    route.fulfill({ json: { amount: "0", blockHeight: 1 } }),
  );
  await page.goto("/testnet");
  const reserve = page.getByRole("button", {
    name: "Review agent reservation",
  });
  await expect(reserve).toBeDisabled();
  await page
    .getByRole("button", { name: "Renew expired provider quote" })
    .click();
  await expect(reserve).toBeEnabled();
  await expect(
    page.getByText(
      "Provider quote renewed at the same price. Review agent reservation next.",
      { exact: true },
    ),
  ).toBeVisible();
});
