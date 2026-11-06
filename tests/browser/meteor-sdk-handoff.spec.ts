import { test, expect } from "@playwright/test";
import { KeyPair } from "@near-js/crypto";
import { Store } from "../../lib/storage/db.ts";
import { NearService } from "../../lib/settlement/near-service.ts";
import { NearTestnetAdapter } from "../../lib/settlement/near.ts";

for (const failRead of [false, true])
  test(`actual Meteor adapter ${failRead ? "closes the unused popup on preparation error" : "transforms a synthetic request and loads the reserved popup"}`, async ({
    page,
    context,
  }) => {
    const owner = "meteor-sdk-qa.testnet";
    const syntheticKey = KeyPair.fromRandom("ed25519");
    const publicKey = syntheticKey.getPublicKey().toString();
    await page.addInitScript(
      ({ owner, publicKey, secret }) => {
        localStorage.setItem(
          "near-wallet-selector:selectedWalletId",
          JSON.stringify("meteor-wallet"),
        );
        localStorage.setItem(
          "default_meteor_wallet_auth_key",
          JSON.stringify({ accountId: owner, allKeys: [publicKey] }),
        );
        localStorage.setItem(`_meteor_wallet${owner}:testnet`, secret);
      },
      { owner, publicKey, secret: syntheticKey.toString() },
    );
    let broadcasts = 0;
    const store = new Store(":memory:");
    const adapter = new NearTestnetAdapter("escrow.testnet");
    adapter.ensureNetwork = async () => {};
    adapter.call = async (method) =>
      method === "query"
        ? {
            keys: [
              {
                public_key: publicKey,
                access_key: { nonce: 1, permission: "FullAccess" },
              },
            ],
          }
        : { header: { hash: "1".repeat(32) } };
    const preparation = new NearService(
      store,
      {
        contractId: "escrow.testnet",
        codeHash: "qa",
        providers: [],
        issues: [],
      },
      adapter,
    );
    const finalities: string[] = [];
    await context.route("**/api/near/wallet-rpc", async (route) => {
      const body = route.request().postDataJSON();
      if (body.method === "query") finalities.push(body.params.finality);
      if (body.method.includes("broadcast") || body.method === "send_tx")
        broadcasts++;
      if (failRead) {
        await route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: body.id,
            error: {
              code: -32000,
              message: "Wallet preparation RPC unavailable",
            },
          },
        });
        return;
      }
      await route.fulfill({
        json: await preparation.walletPreparationRpc(body),
      });
    });
    await context.route("https://wallet.meteorwallet.app/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Actual Meteor SDK handoff intercepted</h1>",
      }),
    );
    await page.route("**/api/near/keys?*", (route) =>
      route.fulfill({ json: [publicKey] }),
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
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto("/testnet");
    await page.evaluate(
      async ({ owner, publicKey }) => {
        const wallet = await import("/src/near-wallet.ts" as string);
        const { reserveMeteorPopup } = await import(
          "/src/wallet-popup.ts" as string
        );
        await wallet.selector();
        const button = document.createElement("button");
        button.textContent = "Actual SDK QA";
        button.style.cssText =
          "position:fixed;right:24px;top:24px;z-index:99999";
        button.onclick = () => {
          const reservation = reserveMeteorPopup("meteor-wallet");
          void wallet
            .sendToWallet(
              {
                id: "QA",
                action: "approve",
                ownerKey: publicKey,
                state: "prepared",
                expires: Date.now() + 60000,
                codeHash: "qa",
                transaction: {
                  signerId: owner,
                  receiverId: "escrow.testnet",
                  actions: [
                    {
                      type: "FunctionCall",
                      params: {
                        methodName: "approve",
                        args: {},
                        gas: "80000000000000",
                        deposit: "0",
                      },
                    },
                  ],
                },
              },
              {
                contractId: "escrow.testnet",
                codeHash: "qa",
                ownerKeys: [publicKey],
              },
            )
            .catch((error: Error) => {
              document.body.dataset.sdkError = error.message;
            })
            .finally(() => reservation?.dispose());
        };
        document.body.append(button);
      },
      { owner, publicKey },
    );
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("button", { name: "Actual SDK QA", exact: true })
      .click();
    const popup = await popupPromise;
    if (failRead) {
      await expect(page.locator("body")).toHaveAttribute(
        "data-sdk-error",
        /Wallet preparation RPC unavailable/,
      );
      await expect.poll(() => popup.isClosed()).toBe(true);
    } else
      await expect(
        popup.getByRole("heading", {
          name: "Actual Meteor SDK handoff intercepted",
        }),
      ).toBeVisible({ timeout: 15000 });
    expect(broadcasts).toBe(0);
    expect(failures).toEqual([]);
    if (!failRead) expect(finalities).toContain("near-final");
    store.close();
  });
