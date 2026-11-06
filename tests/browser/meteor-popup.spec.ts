import { test, expect } from "@playwright/test";

test("Meteor reuses the click-opened window after delayed preparation", async ({
  page,
  context,
}) => {
  await context.route("https://wallet.meteorwallet.app/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Meteor handoff intercepted for QA</h1>",
    }),
  );
  await page.goto("/testnet");
  await page.evaluate(async () => {
    const { reserveMeteorPopup } = await import(
      "/src/wallet-popup.ts" as string
    );
    const original = window.open;
    const button = document.createElement("button");
    button.style.cssText = "position:fixed;right:24px;top:24px;z-index:99999";
    button.textContent = "Popup regression QA";
    button.onclick = async () => {
      const handle = reserveMeteorPopup("meteor-wallet");
      // RPC preparation can outlast browser transient click activation.
      await new Promise((resolve) => setTimeout(resolve, 6000));
      const popup = window.open(
        "https://wallet.meteorwallet.app/connect/testnet/sign?connectionUid=qa",
        "_blank",
        "popup=1",
      );
      document.body.dataset.popupReused = String(Boolean(popup));
      document.body.dataset.popupRestored = String(window.open === original);
      handle?.dispose();
    };
    document.body.append(button);
  });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Popup regression QA" }).click();
  const popup = await popupPromise;
  await expect(
    popup.getByRole("heading", { name: "Meteor handoff intercepted for QA" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("body")).toHaveAttribute(
    "data-popup-reused",
    "true",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-popup-restored",
    "true",
  );
  expect(context.pages()).toHaveLength(2);
});

test("expired request cannot navigate the reserved popup after delayed preparation", async ({
  page,
}) => {
  await page.goto("/testnet");
  await page.evaluate(async () => {
    const { reserveMeteorPopup } = await import(
      "/src/wallet-popup.ts" as string
    );
    const button = document.createElement("button");
    button.textContent = "Expiry race QA";
    button.style.cssText = "position:fixed;right:24px;top:24px;z-index:99999";
    button.onclick = async () => {
      const handle = reserveMeteorPopup("meteor-wallet", Date.now() + 1000);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        window.open(
          "https://wallet.meteorwallet.app/connect/testnet/sign?connectionUid=expired-qa",
          "_blank",
        );
      } catch (error) {
        document.body.dataset.expiryError = (error as Error).message;
      } finally {
        handle?.dispose();
      }
    };
    document.body.append(button);
  });
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Expiry race QA", exact: true })
    .click();
  const popup = await popupPromise;
  await expect(page.locator("body")).toHaveAttribute(
    "data-expiry-error",
    /expired while preparing Meteor/,
  );
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("blocked popup reports an actionable error and does not change the opener", async ({
  page,
}) => {
  await page.goto("/testnet");
  const result = await page.evaluate(async () => {
    const { reserveMeteorPopup } = await import(
      "/src/wallet-popup.ts" as string
    );
    const original = window.open;
    const blocked = () => null;
    window.open = blocked;
    try {
      reserveMeteorPopup("meteor-wallet");
      return { error: "", unchanged: false };
    } catch (error) {
      return {
        error: (error as Error).message,
        unchanged: window.open === blocked,
      };
    } finally {
      window.open = original;
    }
  });
  expect(result.error).toContain("Allow popups");
  expect(result.error).toContain("No transaction was sent");
  expect(result.unchanged).toBe(true);
});
