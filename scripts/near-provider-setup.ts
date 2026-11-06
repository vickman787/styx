// Provision only a fresh faucet-funded ParseLab testnet service account.
// Never reads deployment.private.json or uses an owner's signing key.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { parseNear } from "../lib/settlement/near-types.ts";

const dir = "data/near-testnet";
const privatePath = `${dir}/parselab.private.json`;
const envPath = `${dir}/app.env`;
const rpc = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
type Plan = {
  accountId: string;
  fullSecret: string;
  fullPublic: string;
  restrictedSecret: string;
  restrictedPublic: string;
  contractId: string;
  codeHash: string;
  price: string;
  requested?: boolean;
  keyRequested?: boolean;
  restrictedTx?: string;
};
const save = (p: Plan) =>
  writeFileSync(privatePath, JSON.stringify(p, null, 2), { mode: 0o600 });
async function main() {
  if (process.argv[2] !== "provision" || !process.argv[3])
    throw Error(
      "Usage: near-provider-setup.ts provision <explicit-price-NEAR>",
    );
  const price = process.argv[3];
  if (BigInt(parseNear(price)) <= 0n)
    throw Error("Provider price must be positive.");
  const contractId = process.env.NEAR_CONTRACT_ID || "";
  const codeHash = process.env.NEAR_CONTRACT_CODE_HASH || "";
  if (!contractId.endsWith(".testnet") || !codeHash)
    throw Error("Verified testnet contract configuration required.");
  if ((await rpc.viewNodeStatus()).chain_id !== "testnet")
    throw Error("Wrong network.");
  const contract: any = await rpc.query({
    request_type: "view_account",
    finality: "final",
    account_id: contractId,
  });
  if (contract.code_hash !== codeHash)
    throw Error("Deployed contract hash mismatch.");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(privatePath)) {
    if (process.env.NEAR_PARSELAB_ACCOUNT_ID)
      throw Error(
        "Existing ParseLab configuration found; refusing replacement.",
      );
    const full = KeyPair.fromRandom("ed25519");
    const restricted = KeyPair.fromRandom("ed25519");
    save({
      accountId: `styx-parselab-${randomBytes(5).toString("hex")}.testnet`,
      fullSecret: full.toString(),
      fullPublic: full.getPublicKey().toString(),
      restrictedSecret: restricted.toString(),
      restrictedPublic: restricted.getPublicKey().toString(),
      contractId,
      codeHash,
      price,
    });
  }
  const plan: Plan = JSON.parse(readFileSync(privatePath, "utf8"));
  if (
    plan.contractId !== contractId ||
    plan.codeHash !== codeHash ||
    plan.price !== price
  )
    throw Error("Saved provider plan differs; refusing mutation.");
  async function keys() {
    // Some RPCs return an empty key list for an account that does not exist.
    // Check account existence explicitly before deciding to request the faucet.
    const response = await fetch("https://test.rpc.fastnear.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "provider-exists",
        method: "query",
        params: {
          request_type: "view_account",
          finality: "final",
          account_id: plan.accountId,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = (await response.json()) as any;
    if (payload.error) {
      if (/UNKNOWN_ACCOUNT|does not exist/.test(JSON.stringify(payload.error)))
        return null;
      throw Error("Provider existence check failed.");
    }
    if (!response.ok || !payload.result?.code_hash)
      throw Error("Provider existence response invalid.");
    try {
      return await rpc.query<any>({
        request_type: "view_access_key_list",
        finality: "final",
        account_id: plan.accountId,
      });
    } catch (e) {
      if (/UNKNOWN_ACCOUNT|does not exist/.test(String(e))) return null;
      throw Error("Provider account lookup failed; no retry was sent.");
    }
  }
  let installed = await keys();
  async function waitForKeys(predicate: (value: any) => boolean) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await keys();
      if (current && predicate(current)) return current;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return null;
  }
  if (!installed) {
    if (plan.requested)
      throw Error(
        "Faucet request unresolved. Check the saved account before retrying; no duplicate request sent.",
      );
    plan.requested = true;
    save(plan);
    const response = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        newAccountId: plan.accountId,
        newAccountPublicKey: plan.fullPublic,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok)
      throw Error(
        `Faucet returned HTTP ${response.status}; request retained for reconciliation.`,
      );
    await response.text();
    installed = await waitForKeys((value) =>
      value.keys.some((k: any) => k.public_key === plan.fullPublic),
    );
    if (!installed)
      throw Error(
        "Provider creation not yet finalized; rerun to reconcile the same account.",
      );
  }
  if (
    !installed.keys.some(
      (k: any) =>
        k.public_key === plan.fullPublic &&
        k.access_key.permission === "FullAccess",
    )
  )
    throw Error("Fresh provider administrative key not verified.");
  let restricted = installed.keys.find(
    (k: any) => k.public_key === plan.restrictedPublic,
  );
  if (!restricted) {
    if (plan.keyRequested)
      throw Error(
        "Restricted-key submission unresolved; inspect account history before another submission.",
      );
    plan.keyRequested = true;
    save(plan);
    const account = new Account(
      plan.accountId,
      rpc,
      KeyPairSigner.fromSecretKey(plan.fullSecret as `ed25519:${string}`),
    );
    const result = await account.addFunctionCallAccessKey({
      publicKey: plan.restrictedPublic,
      contractId,
      methodNames: ["deliver"],
      allowance: 250000000000000000000000n,
    });
    if (
      result.status &&
      typeof result.status === "object" &&
      "Failure" in result.status
    )
      throw Error("Provider key installation failed; inspect chain history.");
    plan.restrictedTx = result.transaction.hash;
    save(plan);
    installed = await waitForKeys((value) =>
      value.keys.some((k: any) => k.public_key === plan.restrictedPublic),
    );
    restricted = installed?.keys.find(
      (k: any) => k.public_key === plan.restrictedPublic,
    );
  }
  const scope = restricted?.access_key?.permission?.FunctionCall;
  if (
    scope?.receiver_id !== contractId ||
    JSON.stringify(scope.method_names) !== JSON.stringify(["deliver"]) ||
    BigInt(scope.allowance || "0") > 250000000000000000000000n
  )
    throw Error("Provider key scope/allowance not verified.");
  const existing = readFileSync(envPath, "utf8");
  if (/^NEAR_PARSELAB_/m.test(existing)) {
    if (
      process.env.NEAR_PARSELAB_ACCOUNT_ID !== plan.accountId ||
      process.env.NEAR_PARSELAB_PRIVATE_KEY !== plan.restrictedSecret ||
      process.env.NEAR_PARSELAB_PRICE_NEAR !== price
    )
      throw Error("Existing provider environment differs; refusing overwrite.");
  } else {
    writeFileSync(
      envPath,
      existing.trimEnd() +
        `\nNEAR_PARSELAB_ACCOUNT_ID=${plan.accountId}\nNEAR_PARSELAB_PRIVATE_KEY=${plan.restrictedSecret}\nNEAR_PARSELAB_PRICE_NEAR=${price}\n`,
      { mode: 0o600 },
    );
  }
  const report = {
    network: "testnet",
    provider: "parselab",
    operator: "STYX",
    accountId: plan.accountId,
    publicKey: plan.restrictedPublic,
    contractId,
    codeHash,
    methodNames: scope.method_names,
    allowance: scope.allowance,
    priceNear: price,
    restrictedTx: plan.restrictedTx,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(
    "docs/verification/parselab-setup.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
main().catch(() => {
  console.error(
    "ParseLab setup did not complete. Sensitive diagnostics withheld; reconcile the saved account before retrying. No owner funds were used.",
  );
  process.exitCode = 1;
});
