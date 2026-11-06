import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { actionCreators } from "@near-js/transactions";
import { baseEncode } from "@near-js/utils";

// Fixed local sandbox only. This script cannot be pointed at a public RPC.
const rpc = new JsonRpcProvider({ url: "http://127.0.0.1:3030" });
const candidate = process.argv.includes("--candidate");
if (process.argv.slice(2).some((arg) => arg !== "--candidate"))
  throw Error(
    "Use --candidate or no arguments; RPC is fixed to the local sandbox.",
  );
const wasm = readFileSync(
  candidate
    ? "data/contract-candidate/wasm32-unknown-unknown/release/styx_escrow.wasm"
    : "contracts/styx/target/wasm32-unknown-unknown/release/styx_escrow.wasm",
);
const codeHash = baseEncode(createHash("sha256").update(wasm).digest());
const unit = 10n ** 24n;
const measurements: any[] = [];
const transactions: any[] = [];
let runtime: unknown;
let contract = "";
const report = (passed: boolean) => ({
  passed,
  variant: candidate
    ? "keyed storage fresh-deployment candidate"
    : "deployed whole-map layout",
  checkedAt: new Date().toISOString(),
  codeHash,
  runtime,
  network: "isolated local sandbox",
  contract,
  measurements,
  transactions,
  limits:
    "Bounded benchmark through 100 job records, five full payment callbacks, one owner. Not a maximum-capacity guarantee, independent audit, multi-owner benchmark or production throughput test.",
});
const save = (passed: boolean) =>
  writeFileSync(
    candidate
      ? "docs/verification/near-vm-scale-keyed-report.json"
      : "docs/verification/near-vm-scale-report.json",
    JSON.stringify(report(passed), null, 2),
  );
async function main() {
  const status = await rpc.viewNodeStatus();
  assert.ok(
    !["testnet", "mainnet"].includes(status.chain_id),
    "Only a local sandbox may be used",
  );
  runtime = status.version;
  const validator = JSON.parse(
    readFileSync("data/near-testnet/vm-home/validator_key.json", "utf8"),
  );
  const account = (id: string, secret: string) =>
    new Account(
      id,
      rpc,
      KeyPairSigner.fromSecretKey(secret as `ed25519:${string}`),
    );
  const root = account(validator.account_id, validator.secret_key);
  const suffix = Date.now().toString(36);
  const actors: Record<string, { id: string; pk: string; account: Account }> =
    {};
  for (const name of ["contract", "owner", "agent", "provider", "verifier"]) {
    const key = KeyPair.fromRandom("ed25519");
    const id = `scale-${name}-${suffix}.${validator.account_id}`;
    await root.createAccount({
      newAccountId: id,
      publicKey: key.getPublicKey(),
      nearToTransfer: 20n * unit,
    });
    actors[name] = {
      id,
      pk: key.getPublicKey().toString(),
      account: account(id, key.toString()),
    };
  }
  contract = actors.contract.id;
  await actors.contract.account.signAndSendTransaction({
    receiverId: contract,
    actions: [
      actionCreators.deployContract(wasm),
      actionCreators.functionCall("new", {}, 100000000000000n, 0n),
    ],
    waitUntil: "FINAL",
  });
  assert.equal(
    (
      await rpc.viewAccount({
        accountId: contract,
        blockQuery: { finality: "final" },
      })
    ).code_hash,
    codeHash,
  );
  const view = (method: string, args: any) =>
    rpc.callFunction<any>({
      contractId: contract,
      method,
      args,
      blockQuery: { finality: "final" },
    });
  async function call(
    role: string,
    method: string,
    args: any,
    count: number,
    deposit = 0n,
  ) {
    const result = await actors[role].account.signAndSendTransaction({
      receiverId: contract,
      actions: [
        actionCreators.functionCall(method, args, 100000000000000n, deposit),
      ],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const outcomes = [result.transaction_outcome, ...result.receipts_outcome];
    const failed = outcomes.filter(
      (o) =>
        typeof o.outcome.status === "object" &&
        o.outcome.status !== null &&
        "Failure" in o.outcome.status,
    );
    if (failed.length) {
      transactions.push({
        action: method,
        jobs: count,
        hash: result.transaction.hash,
        failures: failed.map((o) => o.outcome.status),
      });
      save(false);
    }
    assert.ok(
      outcomes.every(
        (o) =>
          typeof o.outcome.status === "object" &&
          o.outcome.status !== null &&
          !("Failure" in o.outcome.status),
      ),
      `VM call failed: ${method} at ${count} jobs`,
    );
    const gas = result.receipts_outcome.reduce(
      (n, o) => n + BigInt(o.outcome.gas_burnt),
      0n,
    );
    const callback = result.receipts_outcome.find(
      (o) =>
        o.outcome.executor_id === contract &&
        o.outcome.logs.some((log) => log.includes('"event":"paid"')),
    );
    const row = {
      action: method,
      jobs: count,
      hash: result.transaction.hash,
      receiptGas: gas.toString(),
      paidCallbackGas: callback?.outcome.gas_burnt?.toString(),
    };
    transactions.push(row);
    return row;
  }
  await call(
    "owner",
    "fund",
    { storage_deposit: (5n * unit).toString() },
    0,
    10n * unit,
  );
  const expires = Date.now() + 86400000;
  const milestones = new Set([1, 10, 25, 50, 100]);
  for (let count = 1; count <= 100; count++) {
    const id = `scale-${suffix}-${count}`;
    const mandate = {
      owner: actors.owner.id,
      owner_key: actors.owner.pk,
      agent: actors.agent.id,
      agent_key: actors.agent.pk,
      verifier: actors.verifier.id,
      verifier_key: actors.verifier.pk,
      recipients: [actors.provider.id],
      cap: (unit / 10n).toString(),
      expires,
      mandate_hash: createHash("sha256").update(id).digest("hex"),
      input_hash: "b".repeat(64),
      checks_version: "scale-checks/1",
      asset: "near:testnet:native:24",
      domain: `styx:testnet:${contract}`,
    };
    const approval = await call(
      "owner",
      "approve",
      { job_id: id, mandate },
      count,
    );
    if (count % 10 === 0) console.log(JSON.stringify({ approvedJobs: count }));
    if (!milestones.has(count)) continue;
    const storageAfterApproval = (
      await rpc.viewAccount({
        accountId: contract,
        blockQuery: { finality: "final" },
      })
    ).storage_usage;
    const quote = {
      id: `quote-${id}`,
      recipient: actors.provider.id,
      amount: (unit / 100n).toString(),
      expires,
      mandate_hash: mandate.mandate_hash,
      asset: mandate.asset,
    };
    await call("agent", "reserve", { job_id: id, quote }, count);
    await call(
      "provider",
      "deliver",
      { job_id: id, artifact_hash: "c".repeat(64) },
      count,
    );
    await call(
      "verifier",
      "attest",
      {
        job_id: id,
        attestation: {
          job_id: id,
          mandate_hash: mandate.mandate_hash,
          input_hash: mandate.input_hash,
          artifact_hash: "c".repeat(64),
          checks_version: mandate.checks_version,
          domain: mandate.domain,
          expires,
          pass: true,
        },
      },
      count,
    );
    const release = await call(
      "owner",
      "release",
      { job_id: id, artifact_hash: "c".repeat(64) },
      count,
    );
    assert.ok(
      release.paidCallbackGas,
      "Successful payment callback must be measured",
    );
    assert.equal((await view("get_job", { job_id: id })).state, "Paid");
    const balance = await view("get_balance", { owner: actors.owner.id });
    assert.equal(balance.reserved, "0");
    const storageAfterPayment = (
      await rpc.viewAccount({
        accountId: contract,
        blockQuery: { finality: "final" },
      })
    ).storage_usage;
    const measurement = {
      jobs: count,
      storageAfterApproval,
      storageAfterPayment,
      approvalReceiptGas: approval.receiptGas,
      releaseReceiptGas: release.receiptGas,
      paidCallbackGas: release.paidCallbackGas,
      storageCredit: balance.storage_credit,
    };
    measurements.push(measurement);
    save(false);
    console.log(JSON.stringify(measurement));
  }
  save(true);
  console.log(
    JSON.stringify({
      passed: true,
      jobs: 100,
      milestones: measurements.length,
      transactions: transactions.length,
    }),
  );
}
main().catch(() => {
  save(false);
  console.error(
    "Isolated VM scale benchmark did not finish; partial measurements retained. No public-network action was attempted.",
  );
  process.exitCode = 1;
});
