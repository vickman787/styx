import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { baseEncode } from "@near-js/utils";
import { actionCreators } from "@near-js/transactions";

// Only the isolated WSL sandbox may be used by this test. Never accept a remote RPC.
const provider = new JsonRpcProvider({ url: "http://127.0.0.1:3030" });
const dir = "data/near-testnet";
const candidate = process.argv.includes("--candidate");
if (process.argv.slice(2).some((arg) => arg !== "--candidate"))
  throw Error("Use --candidate or no arguments; sandbox RPC is fixed.");
const reportPath = candidate
  ? "docs/verification/near-vm-keyed-report.json"
  : `${dir}/vm-report.json`;
const wasm = readFileSync(
  candidate
    ? "data/contract-candidate/wasm32-unknown-unknown/release/styx_escrow.wasm"
    : "contracts/styx/target/wasm32-unknown-unknown/release/styx_escrow.wasm",
);
const codeHash = baseEncode(createHash("sha256").update(wasm).digest());
const receipts: { action: string; hash: string; gas: string }[] = [];
const checks: string[] = [];
const unit = 10n ** 24n;
function account(id: string, secret: string) {
  return new Account(
    id,
    provider,
    KeyPairSigner.fromSecretKey(secret as `ed25519:${string}`),
  );
}
async function main() {
  const status = await provider.viewNodeStatus();
  assert.notEqual(status.chain_id, "testnet");
  assert.notEqual(status.chain_id, "mainnet");
  const validator = JSON.parse(
    readFileSync(`${dir}/vm-home/validator_key.json`, "utf8"),
  );
  const root = account(validator.account_id, validator.secret_key);
  const actors: Record<string, { id: string; pk: string; account: Account }> =
    {};
  const suffix = Date.now().toString(36);
  for (const role of [
    "contract",
    "owner",
    "agent",
    "verifier",
    "provider",
    ...(candidate ? ["other"] : []),
  ]) {
    const key = KeyPair.fromRandom("ed25519"),
      id = `${role}-${suffix}.${validator.account_id}`;
    await root.createAccount({
      newAccountId: id,
      publicKey: key.getPublicKey(),
      nearToTransfer: 20n * unit,
    });
    actors[role] = {
      id,
      pk: key.getPublicKey().toString(),
      account: account(id, key.toString()),
    };
  }
  const contract = actors.contract.id;
  const outcome = await actors.contract.account.signAndSendTransaction({
    receiverId: contract,
    actions: [
      actionCreators.deployContract(wasm),
      actionCreators.functionCall("new", {}, 100_000_000_000_000n, 0n),
    ],
    waitUntil: "FINAL",
  });
  assert.ok(
    typeof outcome.status === "object" &&
      outcome.status !== null &&
      !("Failure" in outcome.status),
  );
  const deployed = await provider.viewAccount({
    accountId: contract,
    blockQuery: { finality: "final" },
  });
  assert.equal(deployed.code_hash, codeHash);
  checks.push("compiled WASM deployment, initialization and code hash");
  const view = (method: string, args: any) =>
    provider.callFunction<any>({
      contractId: contract,
      method,
      args,
      blockQuery: { finality: "final" },
    });
  const call = async (
    role: string,
    method: string,
    args: any,
    deposit = 0n,
    success = true,
  ) => {
    const r = await actors[role].account.signAndSendTransaction({
      receiverId: contract,
      actions: [
        actionCreators.functionCall(
          method,
          args,
          100_000_000_000_000n,
          deposit,
        ),
      ],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const failures = [r.transaction_outcome, ...r.receipts_outcome].filter(
      (item: any) => item?.outcome?.status?.Failure,
    );
    assert.equal(
      failures.length === 0,
      success,
      `${method}: ${JSON.stringify(failures.map((f: any) => f.outcome.status))}`,
    );
    receipts.push({
      action: method,
      hash: r.transaction.hash,
      gas: r.receipts_outcome
        .reduce(
          (sum: bigint, item: any) => sum + BigInt(item.outcome.gas_burnt),
          0n,
        )
        .toString(),
    });
    return r;
  };
  await call(
    "owner",
    "fund",
    { storage_deposit: (unit / 10n).toString() },
    unit,
  );
  const balance = () => view("get_balance", { owner: actors.owner.id });
  assert.equal((await balance()).available, ((unit * 9n) / 10n).toString());
  checks.push("real attached deposit separated from storage credit");
  const expires = Date.now() + 86_400_000;
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
    mandate_hash: "a".repeat(64),
    input_hash: "b".repeat(64),
    checks_version: "vm-smoke/1",
    asset: "near:testnet:native:24",
    domain: `styx:testnet:${contract}`,
  };
  const job = `vm-${suffix}`;
  await call("agent", "approve", { job_id: job, mandate }, 0n, false);
  await assert.rejects(() => view("get_job", { job_id: job }));
  checks.push("unauthorized approval rolls back state");
  const unfunded = `${job}-unfunded`;
  await call(
    "provider",
    "approve",
    {
      job_id: unfunded,
      mandate: {
        ...mandate,
        owner: actors.provider.id,
        owner_key: actors.provider.pk,
      },
    },
    0n,
    false,
  );
  await assert.rejects(() => view("get_job", { job_id: unfunded }));
  checks.push("storage-credit panic rolls back an already-written approval");
  await call("owner", "approve", { job_id: job, mandate });
  const quote = {
    id: `quote-${suffix}`,
    recipient: actors.provider.id,
    amount: (unit / 100n).toString(),
    expires,
    mandate_hash: mandate.mandate_hash,
    asset: mandate.asset,
  };
  await call("agent", "reserve", { job_id: job, quote });
  assert.equal((await balance()).reserved, quote.amount);
  await call(
    "owner",
    "release",
    { job_id: job, artifact_hash: "c".repeat(64) },
    0n,
    false,
  );
  await call("provider", "deliver", {
    job_id: job,
    artifact_hash: "c".repeat(64),
  });
  const attestation = {
    job_id: job,
    mandate_hash: mandate.mandate_hash,
    input_hash: mandate.input_hash,
    artifact_hash: "c".repeat(64),
    checks_version: mandate.checks_version,
    domain: mandate.domain,
    expires,
    pass: true,
  };
  await call("verifier", "attest", { job_id: job, attestation });
  await call("owner", "on_transfer", { job_id: job, attempt: 1 }, 0n, false);
  checks.push("private callback rejects external signer");
  const beforeProvider = await provider.viewAccount({
    accountId: actors.provider.id,
    blockQuery: { finality: "final" },
  });
  await call("owner", "release", {
    job_id: job,
    artifact_hash: "c".repeat(64),
  });
  assert.equal((await view("get_job", { job_id: job })).state, "Paid");
  const afterProvider = await provider.viewAccount({
    accountId: actors.provider.id,
    blockQuery: { finality: "final" },
  });
  assert.equal(
    afterProvider.amount - beforeProvider.amount,
    BigInt(quote.amount),
  );
  assert.equal((await balance()).reserved, "0");
  checks.push(
    "real VM transfer and 15 Tgas callback mark Paid and release reservation",
  );
  await call(
    "owner",
    "release",
    { job_id: job, artifact_hash: "c".repeat(64) },
    0n,
    false,
  );
  checks.push("second payout rejected");
  await call("owner", "withdraw", {
    withdrawal_id: `wd-${suffix}`,
    amount: (unit / 100n).toString(),
  });
  assert.equal((await balance()).withdrawal_pending, "0");
  checks.push("withdrawal transfer/callback completes");
  if (candidate) {
    const ownerBefore = await balance();
    const otherBalance = () => view("get_balance", { owner: actors.other.id });
    await call(
      "other",
      "fund",
      { storage_deposit: (unit / 10n).toString() },
      unit,
    );
    const otherJob = `${job}-other-owner`;
    await call("other", "approve", {
      job_id: otherJob,
      mandate: {
        ...mandate,
        owner: actors.other.id,
        owner_key: actors.other.pk,
      },
    });
    // The quote was already consumed by the first owner's paid job.
    await call("agent", "reserve", { job_id: otherJob, quote }, 0n, false);
    assert.equal((await otherBalance()).reserved, "0");
    await call("agent", "reserve", {
      job_id: otherJob,
      quote: { ...quote, id: `${quote.id}-other-owner` },
    });
    assert.equal((await otherBalance()).reserved, quote.amount);
    await call("owner", "refund", { job_id: otherJob }, 0n, false);
    assert.deepEqual(await balance(), ownerBefore);
    await call("other", "refund", { job_id: otherJob });
    assert.equal((await otherBalance()).reserved, "0");
    assert.equal(
      (await otherBalance()).available,
      ((9n * unit) / 10n).toString(),
    );
    checks.push(
      "keyed owner balances are isolated and quote replay is global across owners",
    );
    for (const part of ["a", "b"]) {
      await call("owner", "approve", {
        job_id: `${job}-parallel-${part}`,
        mandate,
      });
      await call("agent", "reserve", {
        job_id: `${job}-parallel-${part}`,
        quote: { ...quote, id: `${quote.id}-parallel-${part}` },
      });
    }
    assert.equal(
      (await balance()).reserved,
      (2n * BigInt(quote.amount)).toString(),
    );
    await call("owner", "refund", { job_id: `${job}-parallel-a` });
    assert.equal((await balance()).reserved, quote.amount);
    await call("owner", "refund", { job_id: `${job}-parallel-b` });
    assert.equal((await balance()).reserved, "0");
    assert.equal((await balance()).available, ownerBefore.available);
    checks.push(
      "keyed reservation counters aggregate multiple jobs and refund independently",
    );
  }
  const failedJob = `${job}-failed-transfer`;
  await call("owner", "approve", { job_id: failedJob, mandate });
  await call("agent", "reserve", {
    job_id: failedJob,
    quote: { ...quote, id: `${quote.id}-failed` },
  });
  await call("provider", "deliver", {
    job_id: failedJob,
    artifact_hash: attestation.artifact_hash,
  });
  await call("verifier", "attest", {
    job_id: failedJob,
    attestation: { ...attestation, job_id: failedJob },
  });
  await actors.provider.account.deleteAccount(validator.account_id);
  await call(
    "owner",
    "release",
    { job_id: failedJob, artifact_hash: attestation.artifact_hash },
    0n,
    false,
  );
  const failedState = await view("get_job", { job_id: failedJob });
  assert.equal(failedState.state, "Reserved");
  assert.equal(failedState.attestation, null);
  assert.equal((await balance()).reserved, quote.amount);
  await call("owner", "refund", { job_id: failedJob });
  assert.equal((await balance()).reserved, "0");
  checks.push(
    "failed transfer callback preserves reservation, clears attestation and permits refund",
  );
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        passed: true,
        codeHash,
        checkedAt: new Date().toISOString(),
        runtime: status.version,
        checks,
        receipts,
        limits:
          "Small-case VM smoke; no scalability certification or independent audit.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      codeHash,
      checks,
      transactions: receipts.length,
    }),
  );
}
main().catch((error) => {
  writeFileSync(
    reportPath,
    JSON.stringify({ passed: false, codeHash, checks, receipts }),
  );
  console.error(
    "VM smoke failed; deployment blocked. Check sandbox diagnostics and assertion locally.",
  );
  console.error(
    String(error?.message || "Unknown VM error")
      .replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, "[key redacted]")
      .slice(0, 2500),
  );
  process.exitCode = 1;
});
