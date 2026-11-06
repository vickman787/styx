import { test, expect } from "@playwright/test";
import { decodeTransaction } from "@near-js/transactions";

test("funding confirmation serializes exact arguments and opens the wallet without broadcasting", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const owner = "signing-qa.testnet";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((account) => {
    localStorage.setItem(
      "near-wallet-selector:selectedWalletId",
      JSON.stringify("my-near-wallet"),
    );
    localStorage.setItem("signedAccountId", account);
  }, owner);
  await page.route("**/api/near/wallet?*", (route) =>
    route.fulfill({
      json: { amount: "1000000000000000000000000", blockHeight: 100 },
    }),
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
    route.fulfill({ json: ["ed25519:" + "1".repeat(32)] }),
  );
  await page.route("**/api/near/network", (route) =>
    route.fulfill({ status: 503, json: { error: "Read-only UI QA" } }),
  );
  let broadcasts = 0;
  await context.route("**/api/near/wallet-rpc", async (route) => {
    const request = route.request().postDataJSON();
    if (request.method.includes("broadcast")) broadcasts++;
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        result: { header: { hash: "1".repeat(32) } },
      },
    });
  });
  let walletRequest: URL | undefined;
  await context.route("https://testnet.mynearwallet.com/**", async (route) => {
    walletRequest = new URL(route.request().url());
    await route.fulfill({
      contentType: "text/html",
      body: "<h1>Wallet handoff intercepted for QA</h1>",
    });
  });
  await page.goto("/testnet");
  await expect(page.locator("header.toolbar")).toContainText(owner, {
    timeout: 20000,
  });
  const status = await (await page.request.get("/api/near")).json();
  await page.route("**/api/near/intents", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      owner,
      action: "fund",
      amount: "0.05",
      storageDeposit: "0.05",
    });
    await route.fulfill({
      json: {
        id: "NI-signing-qa",
        action: "fund",
        state: "prepared",
        codeHash: status.codeHash,
        expires: Date.now() + 60000,
        transaction: {
          signerId: owner,
          receiverId: status.contractId,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: "fund",
                args: { storage_deposit: "50000000000000000000000" },
                gas: "50000000000000",
                deposit: "100000000000000000000000",
              },
            },
          ],
        },
      },
    });
  });
  await page.getByLabel("Amount (testnet NEAR)").fill("0.05");
  await page.getByLabel("Additional storage credit (NEAR)").fill("0.05");
  await page
    .getByRole("button", { name: "Review funding", exact: true })
    .click();
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Confirm in owner wallet", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: "Wallet handoff intercepted for QA" }),
  ).toBeVisible();
  expect(walletRequest?.pathname).toBe("/sign");
  const encoded = walletRequest!.searchParams.get("transactions")!;
  const transaction = decodeTransaction(Buffer.from(encoded, "base64"));
  expect(transaction.signerId).toBe(owner);
  expect(transaction.receiverId).toBe(status.contractId);
  const action = transaction.actions[0].functionCall!;
  expect(action.methodName).toBe("fund");
  expect(action.deposit.toString()).toBe("100000000000000000000000");
  expect(action.gas.toString()).toBe("50000000000000");
  expect(
    JSON.parse(new TextDecoder().decode(new Uint8Array(action.args))),
  ).toEqual({
    storage_deposit: "50000000000000000000000",
  });
  expect(errors).toEqual([]);
  expect(broadcasts).toBe(0);
  // All signing intent/RPC/wallet responses were intercepted. No user key or transaction was used.
});
