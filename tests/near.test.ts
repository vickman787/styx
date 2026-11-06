import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { NearService } from "../lib/settlement/near-service.ts";
import { NearTestnetAdapter } from "../lib/settlement/near.ts";
import { nearConfig, type NearConfig } from "../lib/settlement/near-config.ts";
import {
  parseNear,
  formatNear,
  type NearTransaction,
} from "../lib/settlement/near-types.ts";

const key = (n: string) => "ed25519:" + n.repeat(44);
const txHash = "A".repeat(44);
const role = (name: string, n: string) => ({
  accountId: name + ".testnet",
  publicKey: key(n),
  secret: "redacted-test-secret-" + name,
});
const config: NearConfig = {
  contractId: "escrow.testnet",
  codeHash: "B".repeat(44),
  agent: role("agent", "2"),
  verifier: role("verifier", "3"),
  providers: [
    {
      id: "ledgerworks",
      name: "LedgerWorks",
      price: parseNear("0.0032"),
      role: role("provider", "4"),
    },
  ],
  issues: [],
};
const owner = "owner.testnet";
const ownerKey = key("5");
const transaction: NearTransaction = {
  signerId: owner,
  receiverId: config.contractId,
  actions: [
    {
      type: "FunctionCall",
      params: {
        methodName: "fund",
        args: { storage_deposit: "10" },
        deposit: "100",
        gas: "50000000000000",
      },
    },
  ],
};
function rpcFixture() {
  let chainId = "testnet",
    codeHash = config.codeHash;
  let result: any = {
    final_execution_status: "FINAL",
    transaction: {
      hash: txHash,
      signer_id: owner,
      receiver_id: config.contractId,
      public_key: ownerKey,
      actions: [
        {
          FunctionCall: {
            method_name: "fund",
            args: Buffer.from(
              JSON.stringify({ storage_deposit: "10" }),
            ).toString("base64"),
            gas: "50000000000000",
            deposit: "100",
          },
        },
      ],
    },
    status: { SuccessValue: "" },
    transaction_outcome: { outcome: { status: { SuccessReceiptId: "r" } } },
    receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }],
  };
  const adapter = new NearTestnetAdapter(
    config.contractId,
    (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      let value: any;
      if (body.method === "status") value = { chain_id: chainId };
      else if (body.method === "tx") value = result;
      else if (body.params.request_type === "view_account")
        value = { code_hash: codeHash };
      else
        value = {
          result: [
            ...Buffer.from(
              JSON.stringify({
                version: "styx-escrow/2",
                network: "testnet",
                domain: "styx:testnet:escrow.testnet",
              }),
            ),
          ],
        };
      return new Response(JSON.stringify({ result: value }));
    }) as typeof fetch,
    config.codeHash,
  );
  return {
    adapter,
    get result() {
      return result;
    },
    set result(v) {
      result = v;
    },
    set chainId(v: string) {
      chainId = v;
    },
    set codeHash(v: string) {
      codeHash = v;
    },
  };
}
test("wallet preparation proxy accepts only account/key/block reads and never broadcasts", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  const adapter = new NearTestnetAdapter(config.contractId);
  adapter.ensureNetwork = async () => {};
  adapter.call = async (method, params) => {
    calls++;
    return { method, params };
  };
  const near = new NearService(store, config, adapter);
  const result = await near.walletPreparationRpc({
    jsonrpc: "2.0",
    id: "qa",
    method: "block",
    params: { finality: "final" },
  });
  assert.equal(result.id, "qa");
  await near.walletPreparationRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "query",
    params: {
      request_type: "view_access_key_list",
      account_id: owner,
      finality: "near-final",
    },
  });
  for (const method of ["broadcast_tx_commit", "send_tx", "tx"])
    await assert.rejects(() =>
      near.walletPreparationRpc({ jsonrpc: "2.0", id: 1, method, params: {} }),
    );
  await assert.rejects(() =>
    near.walletPreparationRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        account_id: owner,
        method_name: "approve",
      },
    }),
  );
  assert.equal(calls, 2);
  store.close();
});

test("signing requests never outlive the owner agreement deadline", async () => {
  const c = await context();
  const expires = Date.now() + 120000;
  const execution = await c.near.create({
    jobId: c.job.id,
    owner,
    ownerKey,
    provider: "ledgerworks",
    cap: "0.005",
    expires,
  });
  const request = await c.near.prepare({
    owner,
    executionId: execution.id,
    action: "approve",
  });
  assert.equal(request.expires, expires);
  assert.equal(request.agreementExpires, expires);
  assert.equal(c.signs, 0);
  c.store.close();
});

test("NEAR decimals preserve all 24 places without floating point", () => {
  for (const amount of [
    "0",
    "1",
    "0.000000000000000000000001",
    "123456789012.123456789012345678901234",
  ])
    assert.equal(formatNear(parseNear(amount)), amount);
  for (const invalid of [
    "-1",
    "1e3",
    "NaN",
    " 1",
    "1.0000000000000000000000001",
    "",
    "1.",
  ])
    assert.throws(() => parseNear(invalid));
});
test("RPC rejects a wrong network or deployed code hash", async () => {
  const f = rpcFixture();
  await f.adapter.ensureContract();
  f.chainId = "mainnet";
  await assert.rejects(() => f.adapter.ensureContract(), /network mismatch/);
  f.chainId = "testnet";
  f.codeHash = "unreviewed";
  await assert.rejects(() => f.adapter.ensureContract(), /code hash/);
});
test("only FINAL success with successful receipts confirms a transaction", async () => {
  const f = rpcFixture();
  assert.equal(
    (await f.adapter.confirm(txHash, transaction, ownerKey)).state,
    "confirmed",
  );
  f.result.final_execution_status = "EXECUTED_OPTIMISTIC";
  assert.equal((await f.adapter.confirm(txHash, transaction)).state, "pending");
  f.result.final_execution_status = "FINAL";
  f.result.receipts_outcome.push({
    outcome: { status: { Failure: { ActionError: {} } } },
  });
  assert.equal((await f.adapter.confirm(txHash, transaction)).state, "failed");
});
test("RPC binds hash, signer, receiver, key, action, gas, deposit and arguments to the intent", async () => {
  const mutations = [
    (r: any) => (r.transaction.hash = "C".repeat(44)),
    (r: any) => (r.transaction.signer_id = "attacker.testnet"),
    (r: any) => (r.transaction.receiver_id = "attacker.testnet"),
    (r: any) => (r.transaction.public_key = key("6")),
    (r: any) => r.transaction.actions.push(r.transaction.actions[0]),
    (r: any) =>
      (r.transaction.actions[0].FunctionCall.method_name = "withdraw"),
    (r: any) => (r.transaction.actions[0].FunctionCall.gas = "1"),
    (r: any) => (r.transaction.actions[0].FunctionCall.deposit = "101"),
    (r: any) =>
      (r.transaction.actions[0].FunctionCall.args = Buffer.from(
        '{"storage_deposit":"11"}',
      ).toString("base64")),
  ];
  for (const mutate of mutations) {
    const f = rpcFixture();
    mutate(f.result);
    await assert.rejects(() =>
      f.adapter.confirm(txHash, transaction, ownerKey),
    );
  }
});
async function context() {
  const store = new Store(":memory:");
  const local = new Service(store);
  local.seed();
  let job = store.get("STX-1042");
  job = local.approve(job.id, job.mandate.version, job.mandate.hash);
  local.reserve(job.id, job.quotes[0].id);
  job = await local.process(job.id);
  let confirmation: "pending" | "confirmed" | "failed" = "confirmed";
  const adapter = new NearTestnetAdapter(config.contractId);
  adapter.ensureContract = async () => {};
  adapter.ensureNetwork = async () => {};
  adapter.accessKeys = async () => [
    { public_key: ownerKey, access_key: { permission: "FullAccess" } },
  ];
  adapter.view = async (method) =>
    method === "get_balance"
      ? {
          available: parseNear("1"),
          reserved: "0",
          withdrawal_pending: "0",
          storage_credit: "0",
        }
      : chain;
  adapter.confirm = async (hash) =>
    confirmation === "failed"
      ? { state: "failed", txHash: hash, error: "receipt failed" }
      : { state: confirmation, txHash: hash };
  let signs = 0;
  const near = new NearService(store, config, adapter, async () => {
    signs++;
    return txHash;
  });
  const execution = await near.create({
    jobId: job.id,
    owner,
    ownerKey,
    provider: "ledgerworks",
    cap: "0.005",
    expires: Date.now() + 600000,
  });
  const chain: any = {
    mandate: execution.mandate,
    quote: null,
    state: "Approved",
    artifact_hash: null,
    attestation: null,
  };
  return {
    store,
    near,
    job,
    execution,
    adapter,
    get chain() {
      return chain;
    },
    get signs() {
      return signs;
    },
    set confirmation(v: "pending" | "confirmed" | "failed") {
      confirmation = v;
    },
  };
}
test("contract switch preserves history and rejects refreshing an old agreement through the new contract", async () => {
  const c = await context();
  const intent = await c.near.prepare({
    action: "approve",
    owner,
    executionId: c.execution.id,
  });
  const switched = new NearService(
    c.store,
    { ...config, contractId: "fresh.testnet" },
    c.adapter,
  );
  const status = switched.status();
  assert.equal(status.executions.length, 0);
  assert.equal(status.intents.length, 0);
  assert.equal(status.archivedExecutions[0].id, c.execution.id);
  assert.equal(status.archivedIntents[0].id, intent.id);
  await assert.rejects(
    () => switched.refreshExecution(c.execution.id),
    /earlier contract/,
  );
  await assert.rejects(
    () =>
      switched.prepare({
        action: "approve",
        owner,
        executionId: c.execution.id,
      }),
    /different contract/,
  );
  assert.deepEqual(switched.execution(c.execution.id), c.execution);
  assert.equal(c.signs, 0);
  c.store.close();
});
test("expired unreserved quotes renew only at the approved price without signing", async () => {
  const c = await context();
  await c.near.refreshExecution(c.execution.id);
  const record = c.near.execution(c.execution.id);
  record.quote.expires = Date.now() - 1000;
  c.store.db
    .prepare("UPDATE near_execution SET payload=? WHERE id=?")
    .run(JSON.stringify(record), record.id);
  const before = structuredClone(record);
  const next = await c.near.renewQuote(record.id);
  assert.deepEqual(next.mandate, before.mandate);
  assert.equal(next.quote.recipient, before.quote.recipient);
  assert.equal(next.quote.amount, before.quote.amount);
  assert.notEqual(next.quote.id, before.quote.id);
  assert.ok(
    next.quote.expires > Date.now() &&
      next.quote.expires <= next.mandate.expires,
  );
  assert.equal(c.signs, 0);
  await assert.rejects(() => c.near.renewQuote(record.id), /expired quote/);
  c.chain.state = "Reserved";
  c.chain.quote = next.quote;
  await assert.rejects(() => c.near.renewQuote(record.id), /unreserved/);
  c.store.close();
});

test("second provider keeps its own quote, recipient and delivery signer without spending on selection", async () => {
  const c = await context();
  const second = {
    id: "parselab",
    name: "ParseLab",
    price: parseNear("0.0041"),
    role: role("second-provider", "6"),
  };
  c.near.config = { ...config, providers: [...config.providers, second] };
  const execution = await c.near.create({
    jobId: c.job.id,
    owner,
    ownerKey,
    provider: second.id,
    cap: "0.005",
    expires: Date.now() + 300000,
  });
  assert.equal(execution.quote.amount, second.price);
  assert.deepEqual(execution.mandate.recipients, [second.role.accountId]);
  assert.equal(c.signs, 0);
  await assert.rejects(
    () =>
      c.near.create({
        jobId: c.job.id,
        owner,
        ownerKey,
        provider: second.id,
        cap: "0.004",
        expires: Date.now() + 300000,
      }),
    /cap must cover/,
  );
  c.chain.mandate = execution.mandate;
  c.chain.quote = execution.quote;
  c.chain.state = "Reserved";
  const delivery = await c.near.prepare({
    owner,
    executionId: execution.id,
    action: "deliver",
  });
  assert.equal(delivery.transaction.signerId, second.role.accountId);
  assert.equal(c.signs, 0);
  c.chain.quote = {
    ...execution.quote,
    recipient: config.providers[0].role.accountId,
  };
  await assert.rejects(
    () => c.near.refreshExecution(execution.id),
    /quote differs/,
  );
  c.store.close();
});

test("reservation refund remains owner-signed after expiry and cannot race a pending payment", async () => {
  const c = await context();
  const record = c.near.execution(c.execution.id);
  record.mandate.expires = Date.now() - 1000;
  c.store.db
    .prepare("UPDATE near_execution SET payload=? WHERE id=?")
    .run(JSON.stringify(record), record.id);
  c.chain.mandate = record.mandate;
  c.chain.quote = record.quote;
  c.chain.state = "PaymentPending";
  await assert.rejects(
    () => c.near.prepare({ owner, executionId: record.id, action: "refund" }),
    /cannot race/,
  );
  c.chain.state = "Reserved";
  const intent = await c.near.prepare({
    owner,
    executionId: record.id,
    action: "refund",
  });
  assert.equal(intent.transaction.signerId, owner);
  assert.equal(intent.agreementExpires, undefined);
  assert.ok(intent.expires > Date.now());
  assert.equal(c.signs, 0);
  c.chain.state = "Refunded";
  const confirmed = await c.near.confirm(intent.id, "C".repeat(44));
  assert.equal(confirmed.state, "confirmed");
  assert.equal(c.near.execution(record.id).state, "Refunded");
  assert.equal(c.near.execution(record.id).receipt, undefined);
  await assert.rejects(
    () => c.near.prepare({ owner, executionId: record.id, action: "release" }),
    /already finalized/,
  );
  c.store.close();
});

test("quote renewal rejects changed prices and pending signing requests", async () => {
  for (const mode of ["price", "pending"]) {
    const c = await context();
    await c.near.refreshExecution(c.execution.id);
    const record = c.near.execution(c.execution.id);
    record.quote.expires = Date.now() - 1000;
    c.store.db
      .prepare("UPDATE near_execution SET payload=? WHERE id=?")
      .run(JSON.stringify(record), record.id);
    if (mode === "price")
      c.near.config = {
        ...config,
        providers: [{ ...config.providers[0], price: parseNear("0.004") }],
      };
    else
      c.store.db.prepare("INSERT INTO near_intent VALUES(?,?,?)").run(
        "pending-qa",
        c.store.workspace,
        JSON.stringify({
          id: "pending-qa",
          executionId: record.id,
          state: "submitted",
        }),
      );
    await assert.rejects(
      () => c.near.renewQuote(record.id),
      /price changed|pending signing/,
    );
    assert.deepEqual(c.near.execution(record.id), record);
    assert.equal(c.signs, 0);
    c.store.close();
  }
});

test("testnet lifecycle confirms chain state and creates one receipt only after final payment", async () => {
  const c = await context();
  const { near, execution, store } = c;
  const localBefore = store.balance();
  let n = 0;
  const prepare = (action: string) =>
    near.prepare({ owner, executionId: execution.id, action });
  const confirm = async (i: any) => near.confirm(i.id, String(++n).repeat(44));
  await confirm(await prepare("approve"));
  const reserve = await prepare("reserve");
  assert.equal(reserve.transaction.signerId, config.agent!.accountId);
  c.chain.state = "Reserved";
  c.chain.quote = execution.quote;
  await confirm(reserve);
  const deliver = await prepare("deliver");
  assert.equal(deliver.transaction.signerId, execution.quote.recipient);
  c.chain.artifact_hash = execution.artifactHash;
  await confirm(deliver);
  const attest = await prepare("attest");
  assert.equal(attest.transaction.signerId, config.verifier!.accountId);
  c.chain.attestation = attest.transaction.actions[0].params.args.attestation;
  await confirm(attest);
  const release = await prepare("release");
  c.confirmation = "pending";
  await confirm(release);
  assert.equal(near.execution(execution.id).receipt, undefined);
  c.confirmation = "confirmed";
  await assert.rejects(
    () => near.confirm(release.id, release.id),
    /change transaction hash/,
  );
  await assert.rejects(
    () => near.confirm(release.id, String(n).repeat(44)),
    /callback\/state/,
  );
  c.chain.state = "Paid";
  const hash = String(n).repeat(44);
  await near.confirm(release.id, hash);
  await near.confirm(release.id, hash);
  assert.equal(near.execution(execution.id).receipt!.paid, parseNear("0.0032"));
  assert.deepEqual(store.balance(), localBefore);
  assert.equal(c.signs, 0);
  store.close();
});
test("owner requests never use server keys; funding includes explicit storage and withdrawal bounds", async () => {
  const c = await context();
  const fund = await c.near.prepare({
    owner,
    action: "fund",
    amount: "0.1",
    storageDeposit: "0.01",
  });
  assert.equal(fund.transaction.actions[0].params.deposit, parseNear("0.11"));
  await assert.rejects(() => c.near.submitRole(fund.id), /owner's wallet/);
  await assert.rejects(
    () => c.near.prepare({ owner, action: "withdraw", amount: "2" }),
    /exceeds available/,
  );
  assert.equal(c.signs, 0);
  assert.equal(
    JSON.stringify(c.near.status()).includes("redacted-test-secret"),
    false,
  );
  c.store.close();
});
test("intent duplicate prevention and source tampering block signing", async () => {
  const c = await context();
  await c.near.prepare({
    owner,
    executionId: c.execution.id,
    action: "approve",
  });
  await assert.rejects(
    () =>
      c.near.prepare({ owner, executionId: c.execution.id, action: "approve" }),
    /pending signing intent/,
  );
  c.chain.state = "Reserved";
  c.chain.quote = c.execution.quote;
  const changed = c.store.get(c.job.id);
  changed.artifact!.csv = "tampered";
  c.store.save(changed);
  await assert.rejects(
    () =>
      c.near.prepare({ owner, executionId: c.execution.id, action: "deliver" }),
    /changed\/expired/,
  );
  c.store.close();
});
test("failed receipts never create a payment receipt; chain observations alone do not claim settlement", async () => {
  const c = await context();
  c.chain.state = "Reserved";
  c.chain.quote = c.execution.quote;
  c.chain.artifact_hash = c.execution.artifactHash;
  const attest = await c.near.prepare({
    owner,
    executionId: c.execution.id,
    action: "attest",
  });
  c.chain.attestation = attest.transaction.actions[0].params.args.attestation;
  const release = await c.near.prepare({
    owner,
    executionId: c.execution.id,
    action: "release",
  });
  c.confirmation = "failed";
  assert.equal((await c.near.confirm(release.id, txHash)).state, "failed");
  c.chain.state = "Paid";
  await c.near.refreshExecution(c.execution.id);
  assert.equal(c.near.execution(c.execution.id).receipt, undefined);
  assert.match(c.near.execution(c.execution.id).lastError!, /Reconcile/);
  c.store.close();
});
test("configuration errors redact invalid private keys", () => {
  const status = nearConfig({
    NEAR_AGENT_ACCOUNT_ID: "agent.testnet",
    NEAR_AGENT_PRIVATE_KEY: "SECRET-INVALID",
  });
  assert.equal(JSON.stringify(status.issues).includes("SECRET-INVALID"), false);
  assert.ok(status.issues.length > 0);
});

test("simultaneous preparation cannot create duplicate execution actions", async () => {
  const c = await context();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      c.near.prepare({ owner, executionId: c.execution.id, action: "reserve" }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  c.store.close();
});

test("a validated transaction hash cannot be reused by a second intent", async () => {
  const c = await context();
  const a = await c.near.prepare({ owner, action: "fund", amount: "0.1" });
  const b = await c.near.prepare({ owner, action: "fund", amount: "0.1" });
  await c.near.confirm(a.id, txHash);
  await assert.rejects(() => c.near.confirm(b.id, txHash), /UNIQUE/);
  c.store.close();
});

test("uncertain role submission stays submitted and is never automatically retried", async () => {
  const c = await context();
  let signs = 0;
  const near = new NearService(c.store, config, c.adapter, async () => {
    signs++;
    throw Error("timeout-secret-should-not-leak");
  });
  const intent = await near.prepare({
    owner,
    executionId: c.execution.id,
    action: "reserve",
  });
  const results = await Promise.allSettled([
    near.submitRole(intent.id),
    near.submitRole(intent.id),
  ]);
  assert.equal(
    results.every((r) => r.status === "rejected"),
    true,
  );
  assert.equal(signs, 1);
  assert.equal(near.intent(intent.id).state, "submitted");
  assert.equal(near.intent(intent.id).error!.includes("timeout-secret"), false);
  await assert.rejects(() => near.submitRole(intent.id), /already submitted/);
  assert.equal(signs, 1);
  c.store.close();
});

test("saved signing intents cannot cross a changed contract or reviewed code hash", async () => {
  const c = await context();
  const intent = await c.near.prepare({
    owner,
    executionId: c.execution.id,
    action: "reserve",
  });
  for (const change of [
    { contractId: "different.testnet" },
    { codeHash: "C".repeat(44) },
  ]) {
    let signs = 0;
    const near = new NearService(
      c.store,
      { ...config, ...change },
      c.adapter,
      async () => {
        signs++;
        return txHash;
      },
    );
    await assert.rejects(
      () => near.submitRole(intent.id),
      /different reviewed contract/,
    );
    await assert.rejects(
      () => near.confirm(intent.id, txHash),
      /different reviewed contract/,
    );
    assert.equal(signs, 0);
  }
  c.store.close();
});
