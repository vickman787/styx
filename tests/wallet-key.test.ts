import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseOwnerKey,
  checkWalletSigningKey,
  walletRequestExpiry,
  checkWalletRequest,
} from "../src/near-wallet-policy.ts";
import type { NearIntent } from "../lib/settlement/near-types.ts";

const intent = (
  action: "approve" | "release" | "refund" | "fund",
): NearIntent => ({
  id: "key-qa",
  codeHash: "qa",
  ownerKey: "current-key",
  action,
  state: "prepared",
  createdAt: Date.now(),
  expires: Date.now() + 60000,
  transaction: {
    signerId: "owner.testnet",
    receiverId: "escrow.testnet",
    actions: [
      {
        type: "FunctionCall",
        params: { methodName: action, args: {}, gas: "1", deposit: "0" },
      },
    ],
  },
});
test("legacy requests with a future TTL cannot sign an expired embedded mandate", () => {
  const request = intent("approve");
  const expired = Date.now() - 1000;
  request.transaction.actions[0].params.args = {
    mandate: { expires: expired },
  };
  assert.equal(walletRequestExpiry(request), expired);
  assert.throws(() => checkWalletRequest(request), /expired/);
  const current = intent("release");
  assert.throws(() => checkWalletRequest(current, expired), /expired/);
  const refund = intent("refund");
  assert.equal(walletRequestExpiry(refund, expired), refund.expires);
  assert.doesNotThrow(() => checkWalletRequest(refund, expired));
});
test("wallet-reported full-access key wins over an old selection; unknown keys are never guessed", () => {
  assert.equal(
    chooseOwnerKey(["old-key", "current-key"], "current-key", "old-key"),
    "current-key",
  );
  assert.equal(
    chooseOwnerKey(["old-key", "current-key"], "function-call-key"),
    "",
  );
  assert.equal(chooseOwnerKey(["only-key"], ""), "only-key");
});
test("Meteor validates owner and approved key without treating SDK metadata as signing proof", () => {
  for (const action of ["approve", "release", "refund"] as const) {
    assert.doesNotThrow(() =>
      checkWalletSigningKey(
        intent(action),
        "meteor-wallet",
        [{ accountId: "owner.testnet", publicKey: "old-key" }],
        ["old-key", "current-key"],
      ),
    );
    assert.throws(
      () =>
        checkWalletSigningKey(
          intent(action),
          "meteor-wallet",
          [{ accountId: "owner.testnet" }],
          [],
        ),
      /verified full-access/,
    );
    assert.doesNotThrow(() =>
      checkWalletSigningKey(
        intent(action),
        "meteor-wallet",
        [{ accountId: "owner.testnet", publicKey: "current-key" }],
        ["current-key"],
      ),
    );
    assert.doesNotThrow(() =>
      checkWalletSigningKey(
        intent(action),
        "meteor-wallet",
        [{ accountId: "owner.testnet", publicKey: "sdk-connection-key" }],
        ["old-key", "current-key"],
      ),
    );
  }
  assert.throws(
    () =>
      checkWalletSigningKey(
        intent("approve"),
        "meteor-wallet",
        [],
        ["current-key"],
      ),
    /owner account/,
  );
  assert.doesNotThrow(() =>
    checkWalletSigningKey(intent("fund"), "meteor-wallet", [], []),
  );
  assert.doesNotThrow(() =>
    checkWalletSigningKey(intent("approve"), "my-near-wallet", [], []),
  );
});
