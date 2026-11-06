import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { actionCreators } from "@near-js/transactions";
import { baseEncode } from "@near-js/utils";
import { setTimeout as delay } from "node:timers/promises";

const candidate = process.argv.includes("--candidate");
if (process.argv.slice(3).some((arg) => arg !== "--candidate"))
  throw Error("Only --candidate is supported.");
const dir = candidate ? "data/near-keyed-candidate" : "data/near-testnet";
const path = `${dir}/deployment.private.json`;
const wasmPath = candidate
  ? "data/contract-candidate/wasm32-unknown-unknown/release/styx_escrow.wasm"
  : "contracts/styx/target/wasm32-unknown-unknown/release/styx_escrow.wasm";
const rpc = new JsonRpcProvider({ url: "https://test.rpc.fastnear.com" });
const wasm = () => readFileSync(wasmPath);
const codeHash = () => baseEncode(createHash("sha256").update(wasm()).digest());
type Identity = {
  accountId: string;
  secret: string;
  publicKey: string;
  requested?: boolean;
  created?: boolean;
  restricted?: { secret: string; publicKey: string };
};
type Plan = {
  network: "testnet";
  codeHash: string;
  roles: Record<string, Identity>;
  deployed?: boolean;
  pending?: string;
  transactions: { action: string; hash: string }[];
};
const save = (plan: Plan) =>
  writeFileSync(path, JSON.stringify(plan, null, 2), { mode: 0o600 });
function identity(accountId: string, restricted: boolean): Identity {
  const key = KeyPair.fromRandom("ed25519");
  const result: Identity = {
    accountId,
    secret: key.toString(),
    publicKey: key.getPublicKey().toString(),
  };
  if (restricted) {
    const k = KeyPair.fromRandom("ed25519");
    result.restricted = {
      secret: k.toString(),
      publicKey: k.getPublicKey().toString(),
    };
  }
  return result;
}
function signer(role: Identity) {
  return new Account(
    role.accountId,
    rpc,
    KeyPairSigner.fromSecretKey(role.secret as `ed25519:${string}`),
  );
}
async function accountState(accountId: string) {
  try {
    return await rpc.query<any>({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
  } catch (e) {
    if (
      String(e).includes("does not exist") ||
      String(e).includes("UNKNOWN_ACCOUNT")
    )
      return null;
    throw Error("Testnet account lookup failed; no mutation attempted.");
  }
}
function record(plan: Plan, action: string, outcome: any) {
  if (
    outcome.status?.Failure ||
    outcome.receipts_outcome?.some((r: any) => r.outcome.status?.Failure)
  )
    throw Error(
      `Testnet ${action} failed. Inspect its chain transaction before retrying.`,
    );
  const hash = outcome.transaction.hash;
  plan.transactions.push({ action, hash });
  save(plan);
  console.log(JSON.stringify({ action, hash }));
}
async function main() {
  const command = process.argv[2];
  const verifiedScopes: Record<string, unknown> = {};
  if (candidate) {
    for (const reportPath of [
      "docs/verification/near-vm-keyed-report.json",
      "docs/verification/near-vm-scale-keyed-report.json",
    ]) {
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      if (!report.passed || report.codeHash !== codeHash())
        throw Error(
          "Matching successful candidate safety and scale reports required.",
        );
    }
  }
  mkdirSync(dir, { recursive: true });
  if (command === "prepare") {
    if (!existsSync(path)) {
      const suffix = randomBytes(5).toString("hex");
      const roles = Object.fromEntries(
        [
          "contract",
          "agent",
          "verifier",
          "provider",
          ...(candidate ? ["parselab"] : []),
        ].map((role) => [
          role,
          identity(`styx-${role}-${suffix}.testnet`, role !== "contract"),
        ]),
      );
      save({
        network: "testnet",
        codeHash: codeHash(),
        roles,
        transactions: [],
      });
    }
  }
  if (!existsSync(path)) throw Error("Run prepare first.");
  const plan: Plan = JSON.parse(readFileSync(path, "utf8"));
  if (plan.network !== "testnet" || plan.codeHash !== codeHash())
    throw Error("Plan/WASM mismatch; refusing deployment.");
  if (command === "create") {
    const status = await rpc.viewNodeStatus();
    if (status.chain_id !== "testnet") throw Error("Network mismatch.");
    for (const [name, role] of Object.entries(plan.roles)) {
      const existing = await accountState(role.accountId);
      if (!existing) {
        if (role.requested)
          throw Error(
            `Creation of ${name} is unresolved. Check the faucet/account before retrying; no duplicate request sent.`,
          );
        role.requested = true;
        save(plan);
        const response = await fetch(
          "https://helper.nearprotocol.com/account",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              newAccountId: role.accountId,
              newAccountPublicKey: role.publicKey,
            }),
            signal: AbortSignal.timeout(45000),
          },
        );
        if (!response.ok)
          throw Error(
            `Faucet returned HTTP ${response.status} for ${name}. Account request retained for reconciliation.`,
          );
        await response.text();
      }
      let verified = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          await rpc.query({
            request_type: "view_access_key",
            finality: "final",
            account_id: role.accountId,
            public_key: role.publicKey,
          });
          verified = true;
          break;
        } catch {
          await delay(2000);
        }
      }
      if (!verified)
        throw Error(
          `Finalized account key for ${name} not yet readable; rerun create to reconcile without repeating its faucet request.`,
        );
      role.created = true;
      save(plan);
      console.log(
        JSON.stringify({
          role: name,
          accountId: role.accountId,
          verified: true,
        }),
      );
    }
  } else if (command === "deploy") {
    if ((await rpc.viewNodeStatus()).chain_id !== "testnet")
      throw Error("Network mismatch.");
    const report = JSON.parse(
      readFileSync(
        candidate
          ? "docs/verification/near-vm-keyed-report.json"
          : `${dir}/vm-report.json`,
        "utf8",
      ),
    );
    if (!report.passed || report.codeHash !== plan.codeHash)
      throw Error("Matching successful VM report required before deploying.");
    if (Object.values(plan.roles).some((r) => !r.created))
      throw Error("Create and verify dedicated testnet accounts first.");
    const contract = plan.roles.contract;
    const state = await accountState(contract.accountId);
    if (!state) throw Error("Contract account missing.");
    if (state.code_hash === "11111111111111111111111111111111") {
      if (plan.pending)
        throw Error(
          "Unresolved deployment submission; reconcile before retrying.",
        );
      plan.pending = "deploy-and-initialize";
      save(plan);
      record(
        plan,
        "deploy-and-initialize",
        await signer(contract).signAndSendTransaction({
          receiverId: contract.accountId,
          actions: [
            actionCreators.deployContract(wasm()),
            actionCreators.functionCall("new", {}, 100_000_000_000_000n, 0n),
          ],
          waitUntil: "FINAL",
        }),
      );
    } else if (state.code_hash !== plan.codeHash)
      throw Error("Existing code differs; refusing to overwrite.");
    const deployed = await accountState(contract.accountId);
    if (deployed?.code_hash !== plan.codeHash)
      throw Error("Final deployed hash mismatch.");
    const config: any = await rpc.callFunction({
      contractId: contract.accountId,
      method: "get_config",
      args: {},
      blockQuery: { finality: "final" },
    });
    if (
      candidate &&
      (config.storage_layout !== "keyed/v3" ||
        config.network !== "testnet" ||
        config.domain !== `styx:testnet:${contract.accountId}`)
    )
      throw Error("Candidate contract configuration mismatch.");
    if (plan.pending === "deploy-and-initialize") {
      delete plan.pending;
      save(plan);
    }
    const scopes: [string, string[]][] = [
      ["agent", ["reserve"]],
      ["verifier", ["attest"]],
      ["provider", ["deliver"]],
      ...(candidate ? [["parselab", ["deliver"]] as [string, string[]]] : []),
    ];
    for (const [name, methods] of scopes) {
      const role = plan.roles[name];
      const key = role.restricted!;
      const keys: any = await rpc.query({
        request_type: "view_access_key_list",
        finality: "final",
        account_id: role.accountId,
      });
      if (!keys.keys.some((k: any) => k.public_key === key.publicKey)) {
        if (plan.pending)
          throw Error("Unresolved key submission; reconcile before retrying.");
        plan.pending = `restrict-${name}`;
        save(plan);
        record(
          plan,
          `restrict-${name}`,
          await signer(role).addFunctionCallAccessKey({
            publicKey: key.publicKey,
            contractId: contract.accountId,
            methodNames: [...methods],
            allowance: 250_000_000_000_000_000_000_000n,
          }),
        );
      }
      let installed: any;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          installed = await rpc.query({
            request_type: "view_access_key",
            finality: "final",
            account_id: role.accountId,
            public_key: key.publicKey,
          });
          break;
        } catch {
          await delay(2000);
        }
      }
      if (!installed)
        throw Error(
          `Finalized restricted key for ${name} not yet readable; rerun deploy to reconcile.`,
        );
      const permission = installed.permission?.FunctionCall;
      if (
        permission?.receiver_id !== contract.accountId ||
        JSON.stringify(permission.method_names) !== JSON.stringify(methods) ||
        permission.allowance !== "250000000000000000000000"
      )
        throw Error("Restricted role key scope mismatch.");
      verifiedScopes[name] = {
        accountId: role.accountId,
        publicKey: key.publicKey,
        permission,
      };
      if (plan.pending === `restrict-${name}`) {
        delete plan.pending;
        save(plan);
      }
    }
    const lines = [
      "HOST=127.0.0.1",
      "PORT=4173",
      `NEAR_CONTRACT_ID=${contract.accountId}`,
      `NEAR_CONTRACT_CODE_HASH=${plan.codeHash}`,
    ];
    for (const [name, prefix] of [
      ["agent", "NEAR_AGENT"],
      ["verifier", "NEAR_VERIFIER"],
      ["provider", "NEAR_LEDGERWORKS"],
      ...(candidate ? [["parselab", "NEAR_PARSELAB"]] : []),
    ]) {
      const role = plan.roles[name];
      lines.push(
        `${prefix}_ACCOUNT_ID=${role.accountId}`,
        `${prefix}_PRIVATE_KEY=${role.restricted!.secret}`,
      );
    }
    lines.push("NEAR_LEDGERWORKS_PRICE_NEAR=0.01");
    if (candidate) lines.push("NEAR_PARSELAB_PRICE_NEAR=0.012");
    writeFileSync(`${dir}/app.env`, lines.join("\n") + "\n", { mode: 0o600 });
    plan.deployed = true;
    save(plan);
  } else if (!["prepare", "status"].includes(command))
    throw Error("Use prepare, create, deploy or status.");
  const publicReport = {
    network: plan.network,
    codeHash: plan.codeHash,
    deployed: Boolean(plan.deployed),
    accounts: Object.fromEntries(
      Object.entries(plan.roles).map(([name, r]) => [
        name,
        { accountId: r.accountId, created: Boolean(r.created) },
      ]),
    ),
    transactions: plan.transactions,
    ...(command === "deploy" ? { verifiedScopes } : {}),
    ...(candidate
      ? { storageLayout: "keyed/v3", checkedAt: new Date().toISOString() }
      : {}),
  };
  writeFileSync(
    `${dir}/deployment.public.json`,
    JSON.stringify(publicReport, null, 2),
  );
  if (candidate && plan.deployed)
    writeFileSync(
      "docs/verification/keyed-testnet-deployment.json",
      JSON.stringify(publicReport, null, 2),
    );
  console.log(JSON.stringify(publicReport));
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      !/ed25519:|secret|private_key/i.test(error.message)
      ? error.message
      : "Testnet setup failed; sensitive diagnostics withheld.",
  );
  process.exitCode = 1;
});
