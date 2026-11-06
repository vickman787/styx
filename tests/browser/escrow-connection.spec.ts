import { test, expect } from "@playwright/test";

test("connected wallet stays connected through independent escrow/key failures and read recovery", async ({
  page,
}) => {
  test.setTimeout(120000);
  const owner = "connection-qa.testnet";
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  await page.route("**/api/near/wallet?*", (route) =>
    route.fulfill({
      json: { amount: "12000000000000000000000000", blockHeight: 100 },
    }),
  );
  await page.route("**/api/near/network", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Read QA: network unavailable" },
    }),
  );
  let balanceFails = true;
  let keysFail = false;
  await page.route("**/api/near/balance?*", (route) =>
    route.fulfill(
      balanceFails
        ? { status: 503, json: { error: "Read QA: balance unavailable" } }
        : {
            json: {
              available: "0",
              reserved: "0",
              withdrawal_pending: "0",
              storage_credit: "0",
            },
          },
    ),
  );
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill(
      keysFail
        ? { status: 503, json: { error: "Read QA: keys unavailable" } }
        : { json: ["ed25519:" + "1".repeat(32)] },
    ),
  );
  await page.goto("/testnet");
  const escrow = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Escrow balance", exact: true }),
  });
  await expect(page.locator("header.toolbar")).toContainText(owner, {
    timeout: 20000,
  });
  await expect(escrow).toContainText("Your wallet is still connected");
  await expect(escrow).not.toContainText("Connect a wallet to read");
  await expect(page.getByLabel("Owner public key")).toHaveValue(
    "ed25519:" + "1".repeat(32),
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  balanceFails = false;
  keysFail = true;
  await page
    .getByRole("button", { name: "Refresh escrow balance", exact: true })
    .click();
  await expect(escrow.locator(".near-balances")).toBeVisible();
  await expect(
    page.getByText("Owner signing keys could not be read.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("header.toolbar")).toContainText(owner);
  await expect(page.getByLabel("Owner public key")).toHaveValue(
    "ed25519:" + "1".repeat(32),
  );
  await expect(page.getByLabel("Owner public key")).toBeDisabled();
  keysFail = false;
  await page
    .getByRole("button", { name: "Retry wallet keys", exact: true })
    .click();
  await expect(page.getByLabel("Owner public key")).toHaveValue(
    "ed25519:" + "1".repeat(32),
  );
  await expect(
    page.getByText("Owner signing keys could not be read.", { exact: false }),
  ).toHaveCount(0);
  const secondKey = "ed25519:" + "2".repeat(32);
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill({
      json: ["ed25519:" + "1".repeat(32), secondKey],
    }),
  );
  await page
    .getByRole("button", { name: "Refresh escrow balance", exact: true })
    .click();
  await expect(page.getByLabel("Owner public key")).toBeEnabled();
  await expect(page.getByLabel("Owner public key")).toHaveValue(
    "ed25519:" + "1".repeat(32),
  );
  await page.getByLabel("Owner public key").selectOption("");
  await expect(
    page.getByText(
      "Choose your wallet’s Owner public key before preparing an agreement.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare agreement", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Choose owner public key", exact: true })
    .click();
  await expect(page.getByLabel("Owner public key")).toBeFocused();
  await expect(
    page.getByText("This account has multiple full-access keys.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Owner public key").selectOption(secondKey);
  await expect(page.getByLabel("Owner public key")).toHaveValue(secondKey);
  // Isolated browser metadata and mocked reads only; no login, signing or deposit.
});

test("wallet key retry works on first-load failure while escrow read is still pending", async ({
  page,
}) => {
  const owner = "key-retry-qa.testnet";
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  let keysFail = true;
  let releaseBalance!: () => void;
  const balanceReady = new Promise<void>((resolve) => {
    releaseBalance = resolve;
  });
  await page.route("**/api/near/balance?*", async (route) => {
    await balanceReady;
    await route.fulfill({
      json: {
        available: "0",
        reserved: "0",
        withdrawal_pending: "0",
        storage_credit: "0",
      },
    });
  });
  await page.route("**/api/near/keys?*", (route) =>
    route.fulfill(
      keysFail
        ? { status: 503, json: { error: "temporary key read failure" } }
        : { json: ["ed25519:" + "1".repeat(32)] },
    ),
  );
  await page.route("**/api/near/wallet?*", (route) =>
    route.fulfill({ json: { amount: "0", blockHeight: 1 } }),
  );
  await page.goto("/testnet");
  await expect(
    page.getByRole("button", { name: "Retry wallet keys", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Owner public key")).toBeDisabled();
  keysFail = false;
  await page
    .getByRole("button", { name: "Retry wallet keys", exact: true })
    .click();
  await expect(page.getByLabel("Owner public key")).toBeEnabled();
  await expect(page.getByLabel("Owner public key")).toHaveValue(
    "ed25519:" + "1".repeat(32),
  );
  releaseBalance();
  await expect(page.locator(".near-balances")).toBeVisible();
});
