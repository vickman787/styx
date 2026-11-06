import { z } from "zod";
import { Store } from "../storage/db.ts";
import { hash, id, insist } from "../domain/policy.ts";
import { validReport } from "../verification/index.ts";
import { CHECK_VERSION } from "../domain/types.ts";
import { NearTestnetAdapter, canonical } from "./near.ts";
import { nearConfig, type NearConfig, type Role } from "./near-config.ts";
import { signRoleTransaction } from "./near-signer.ts";
import {
  accountPattern,
  NEAR_ASSET,
  NEAR_VERSION,
  parseNear,
  type NearAction,
  type NearExecution,
  type NearIntent,
  type NearTransaction,
} from "./near-types.ts";

const account = z
  .string()
  .regex(accountPattern, "Use a testnet or implicit NEAR account.");
const publicKey = z
  .string()
  .regex(
    /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/,
    "Choose the owner wallet's Ed25519 public key.",
  );
// The Meteor SDK defaults to near-final. Use finalized reads for preparation.
const walletFinality = z
  .enum(["final", "optimistic", "near-final"])
  .transform((value) => (value === "near-final" ? "final" : value));
const createSchema = z
  .object({
    jobId: z.string().max(100),
    owner: account,
    ownerKey: publicKey,
    provider: z.string().max(40),
    cap: z.string(),
    expires: z.number().int(),
  })
  .strict();
const requestSchema = z
  .object({
    executionId: z.string().max(150).optional(),
    owner: account,
    action: z.enum([
      "fund",
      "withdraw",
      "approve",
      "reserve",
      "deliver",
      "attest",
      "release",
      "refund",
    ]),
    amount: z.string().optional(),
    storageDeposit: z.string().optional(),
  })
  .strict();
type Request = z.infer<typeof requestSchema>;
const roleSigning = new Set<string>();
export class NearService {
  private signing = roleSigning;
  constructor(
    public store: Store,
    public config: NearConfig = nearConfig(),
    private adapter?: NearTestnetAdapter,
    private signer: (
      role: Role,
      tx: NearTransaction,
    ) => Promise<string> = signRoleTransaction,
  ) {}
  private rpc() {
    insist(
      this.config.contractId && this.config.codeHash,
      "Configure a deployed testnet contract and its reviewed code hash first.",
    );
    return (
      this.adapter ||
      new NearTestnetAdapter(
        this.config.contractId,
        fetch,
        this.config.codeHash,
      )
    );
  }
  private save(
    table: "near_execution" | "near_intent",
    record: NearExecution | NearIntent,
  ) {
    this.store.db
      .prepare(
        `INSERT INTO ${table} VALUES(?,?,?,?)`.replace(
          "?,?,?,?",
          table === "near_execution" ? "?,?,?,?" : "?,?,?",
        ),
      )
      .run(
        ...(table === "near_execution"
          ? [
              record.id,
              this.store.workspace,
              (record as NearExecution).jobId,
              JSON.stringify(record),
            ]
          : [record.id, this.store.workspace, JSON.stringify(record)]),
      );
  }
  private update(
    table: "near_execution" | "near_intent",
    record: NearExecution | NearIntent,
  ) {
    this.store.db
      .prepare(`UPDATE ${table} SET payload=? WHERE id=? AND workspace_id=?`)
      .run(JSON.stringify(record), record.id, this.store.workspace);
  }
  private all<T>(table: "near_execution" | "near_intent"): T[] {
    return this.store.db
      .prepare(
        `SELECT payload FROM ${table} WHERE workspace_id=? ORDER BY rowid DESC`,
      )
      .all(this.store.workspace)
      .map((r) => JSON.parse(String(r.payload)));
  }
  execution(executionId: string): NearExecution {
    const r = this.store.db
      .prepare(
        "SELECT payload FROM near_execution WHERE id=? AND workspace_id=?",
      )
      .get(executionId, this.store.workspace);
    insist(r, "Testnet agreement not found in this workspace.");
    return JSON.parse(String(r.payload));
  }
  intent(intentId: string): NearIntent {
    const r = this.store.db
      .prepare("SELECT payload FROM near_intent WHERE id=? AND workspace_id=?")
      .get(intentId, this.store.workspace);
    insist(r, "Signing intent not found in this workspace.");
    return JSON.parse(String(r.payload));
  }
  status() {
    const executions = this.all<NearExecution>("near_execution");
    const intents = this.all<NearIntent>("near_intent");
    const domain = `styx:testnet:${this.config.contractId}`;
    return {
      network: "testnet",
      asset: NEAR_ASSET,
      version: NEAR_VERSION,
      contractId: this.config.contractId || null,
      codeHash: this.config.codeHash || null,
      ready: this.config.issues.length === 0,
      issues: this.config.issues,
      roles: {
        agent: this.config.agent
          ? {
              accountId: this.config.agent.accountId,
              publicKey: this.config.agent.publicKey,
            }
          : null,
        verifier: this.config.verifier
          ? {
              accountId: this.config.verifier.accountId,
              publicKey: this.config.verifier.publicKey,
            }
          : null,
      },
      providers: this.config.providers.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        recipient: p.role.accountId,
      })),
      executions: executions.filter((e) => e.mandate.domain === domain),
      intents: intents.filter(
        (i) => i.transaction.receiverId === this.config.contractId,
      ),
      archivedExecutions: executions.filter((e) => e.mandate.domain !== domain),
      archivedIntents: intents.filter(
        (i) => i.transaction.receiverId !== this.config.contractId,
      ),
    };
  }
  async walletPreparationRpc(input: unknown) {
    const data = z
      .object({
        jsonrpc: z.literal("2.0"),
        id: z.union([z.string().max(100), z.number()]),
        method: z.enum(["query", "block", "status"]),
        params: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(input);
    let params: Record<string, unknown>;
    if (data.method === "query") {
      params = z
        .object({
          request_type: z.enum([
            "view_access_key_list",
            "view_access_key",
            "view_account",
          ]),
          account_id: account,
          public_key: publicKey.optional(),
          finality: walletFinality.default("final"),
        })
        .strict()
        .parse(data.params);
    } else
      params = z
        .object({ finality: walletFinality.optional() })
        .strict()
        .parse(data.params);
    await this.rpc().ensureNetwork();
    return {
      jsonrpc: "2.0",
      id: data.id,
      result: await this.rpc().call(data.method, params),
    };
  }
  async balance(owner: string) {
    account.parse(owner);
    await this.rpc().ensureContract();
    return this.rpc().view("get_balance", { owner });
  }
  async walletAccount(owner: string) {
    account.parse(owner);
    const rpc =
      this.adapter ||
      new NearTestnetAdapter(this.config.contractId || "unconfigured.testnet");
    await rpc.ensureNetwork();
    const state = await rpc.call("query", {
      request_type: "view_account",
      finality: "final",
      account_id: owner,
    });
    insist(
      typeof state.amount === "string" &&
        /^\d+$/.test(state.amount) &&
        Number.isSafeInteger(state.block_height),
      "Malformed testnet account response.",
    );
    return {
      accountId: owner,
      amount: state.amount,
      blockHeight: state.block_height,
      network: "testnet",
      checkedAt: Date.now(),
    };
  }
  async networkStatus() {
    await this.rpc().ensureContract();
    const state = await this.rpc().call("query", {
      request_type: "view_account",
      finality: "final",
      account_id: this.config.contractId,
    });
    return {
      network: "testnet",
      contractId: this.config.contractId,
      codeHash: state.code_hash,
      blockHeight: state.block_height,
      checkedAt: Date.now(),
    };
  }
  async ownerKeys(owner: string) {
    account.parse(owner);
    await this.rpc().ensureNetwork();
    return (await this.rpc().accessKeys(owner))
      .filter(
        (k: any) =>
          k.access_key?.permission === "FullAccess" &&
          typeof k.public_key === "string" &&
          k.public_key.startsWith("ed25519:"),
      )
      .map((k: any) => k.public_key);
  }
  async create(input: unknown) {
    const data = createSchema.parse(input);
    insist(
      this.config.issues.length === 0,
      "Testnet signing roles and explicit provider quotes must be configured first.",
    );
    await this.rpc().ensureContract();
    const job = this.store.get(data.jobId);
    insist(
      !job.sourceOnly || job.state === "ready_for_review",
      "This invoice evidence is no longer available for a new agreement.",
    );
    insist(
      job.artifact && job.report && validReport(job),
      "Select a source job with a current passing verification report. Request correction to refresh expired evidence.",
    );
    const provider = this.config.providers.find((p) => p.id === data.provider);
    insist(provider, "Provider is not configured for testnet.");
    const cap = parseNear(data.cap);
    insist(
      BigInt(cap) > 0n && BigInt(cap) >= BigInt(provider.price),
      "The explicit NEAR cap must cover the selected testnet quote.",
    );
    insist(
      data.expires > Date.now() && data.expires <= job.report.expires,
      "Agreement must expire while its source verification remains valid (at most one hour).",
    );
    const roles = [this.config.agent!, this.config.verifier!, provider.role];
    insist(
      roles.every(
        (r) => r.accountId !== data.owner && r.publicKey !== data.ownerKey,
      ),
      "Owner, agent, provider and verifier must have distinct accounts and keys.",
    );
    insist(
      (await this.ownerKeys(data.owner)).includes(data.ownerKey),
      "Choose a current full-access owner public key. No owner private key is stored on the server.",
    );
    const executionId = `${job.id}:near:${id()}`;
    const domain = `styx:testnet:${this.config.contractId}`;
    const binding = {
      jobId: job.id,
      localMandateHash: job.mandate.hash,
      artifactHash: job.artifact.hash,
      inputHash: job.mandate.inputHash,
      owner: data.owner,
      ownerKey: data.ownerKey,
      cap,
      provider: provider.id,
      recipient: provider.role.accountId,
      quote: provider.price,
      expires: data.expires,
      domain,
    };
    const mandate = {
      owner: data.owner,
      owner_key: data.ownerKey,
      agent: this.config.agent!.accountId,
      agent_key: this.config.agent!.publicKey,
      verifier: this.config.verifier!.accountId,
      verifier_key: this.config.verifier!.publicKey,
      recipients: [provider.role.accountId],
      cap,
      expires: data.expires,
      mandate_hash: hash(binding),
      input_hash: job.mandate.inputHash,
      checks_version: CHECK_VERSION,
      asset: NEAR_ASSET,
      domain,
    };
    const record: NearExecution = {
      id: executionId,
      jobId: job.id,
      name: job.name,
      owner: data.owner,
      ownerKey: data.ownerKey,
      provider: provider.id,
      mandate,
      quote: {
        id: id(),
        recipient: provider.role.accountId,
        amount: provider.price,
        expires: Math.min(Date.now() + 900000, data.expires),
        mandate_hash: mandate.mandate_hash,
        asset: NEAR_ASSET,
      },
      artifactHash: job.artifact.hash,
      reportHash: job.report.hash,
      state: "Planned",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.store.transaction(() => {
      this.save("near_execution", record);
      this.store.event(
        job.id,
        "near_planned",
        "Separate NEAR testnet agreement prepared; local demo balances unchanged.",
      );
    });
    return record;
  }
  private source(record: NearExecution) {
    const job = this.store.get(record.jobId);
    insist(
      validReport(job) &&
        job.artifact?.hash === record.artifactHash &&
        job.mandate.inputHash === record.mandate.input_hash &&
        job.report?.hash === record.reportHash,
      "Source artifact, inputs or verification changed/expired. This testnet agreement cannot attest or release.",
    );
    return job;
  }
  private async chain(record: NearExecution) {
    const chain = await this.rpc().view("get_job", { job_id: record.id });
    insist(
      canonical(chain.mandate) === canonical(record.mandate),
      "Onchain mandate differs from the approved local proposal.",
    );
    if (chain.quote)
      insist(
        canonical(chain.quote) === canonical(record.quote),
        "Onchain quote differs from the reserved recipient, price or scope.",
      );
    if (chain.artifact_hash)
      insist(
        chain.artifact_hash === record.artifactHash,
        "Onchain delivery hash differs from verified source bytes.",
      );
    return chain;
  }
  async prepare(input: unknown) {
    const data = requestSchema.parse(input);
    await this.rpc().ensureContract();
    return this.buildIntent(data);
  }
  private async buildIntent(data: Request) {
    let record: NearExecution | undefined;
    let signer = data.owner;
    const args: Record<string, unknown> = {};
    let deposit = "0";
    let gas = "80000000000000";
    if (data.action === "fund") {
      const amount = parseNear(data.amount || "");
      const storage = parseNear(data.storageDeposit || "0");
      insist(BigInt(amount) > 0n, "Funding must be positive.");
      args.storage_deposit = storage;
      deposit = (BigInt(amount) + BigInt(storage)).toString();
      gas = "50000000000000";
    } else if (data.action === "withdraw") {
      const amount = parseNear(data.amount || "");
      insist(BigInt(amount) > 0n, "Withdrawal must be positive.");
      const balance = await this.rpc().view("get_balance", {
        owner: data.owner,
      });
      insist(
        BigInt(balance.available) >= BigInt(amount),
        "Withdrawal exceeds available escrow. Reserved funds cannot be withdrawn.",
      );
      args.withdrawal_id = id();
      args.amount = amount;
    } else {
      insist(data.executionId, "Choose a testnet agreement.");
      record = this.execution(data.executionId);
      insist(
        record.owner === data.owner,
        "Wallet account differs from this agreement's owner.",
      );
      insist(
        record.mandate.domain === `styx:testnet:${this.config.contractId}`,
        "Agreement belongs to a different contract.",
      );
      args.job_id = record.id;
      const existing = this.all<NearIntent>("near_intent").find(
        (i) =>
          i.executionId === record!.id &&
          i.action === data.action &&
          (i.state === "submitted" ||
            (i.state === "prepared" && i.expires > Date.now())),
      );
      insist(
        !existing,
        "This action already has a pending signing intent. Reconcile it before creating another.",
      );
      if (data.action === "approve") {
        insist(
          record.state === "Planned" && record.mandate.expires > Date.now(),
          "Agreement is already approved or expired.",
        );
        args.mandate = record.mandate;
      } else {
        const chain = await this.chain(record);
        insist(
          !["Paid", "Refunded"].includes(chain.state),
          "The onchain agreement is already finalized.",
        );
        if (data.action === "reserve") {
          insist(this.config.agent, "Buyer agent signing is not configured.");
          insist(
            chain.state === "Approved" &&
              record.quote.expires > Date.now() &&
              record.mandate.expires > Date.now(),
            record.mandate.expires <= Date.now()
              ? "The approved agreement has expired. Prepare a new agreement."
              : "The provider quote has expired. Use Renew expired provider quote before reviewing reservation.",
          );
          const balance = await this.rpc().view("get_balance", {
            owner: record.owner,
          });
          insist(
            BigInt(balance.available) >= BigInt(record.quote.amount),
            "Insufficient testnet escrow. Fund the owner balance first.",
          );
          signer = record.mandate.agent;
          args.quote = record.quote;
        }
        if (data.action === "deliver") {
          this.source(record);
          insist(
            chain.state === "Reserved" && !chain.artifact_hash,
            "Reservation required; this delivery is already submitted or unavailable.",
          );
          signer = record.quote.recipient;
          args.artifact_hash = record.artifactHash;
        }
        if (data.action === "attest") {
          const job = this.source(record);
          insist(
            chain.state === "Reserved" &&
              chain.artifact_hash === record.artifactHash &&
              !chain.attestation,
            "Verified provider delivery required before attestation.",
          );
          signer = record.mandate.verifier;
          args.attestation = {
            job_id: record.id,
            mandate_hash: record.mandate.mandate_hash,
            input_hash: record.mandate.input_hash,
            artifact_hash: record.artifactHash,
            checks_version: CHECK_VERSION,
            domain: record.mandate.domain,
            expires: Math.min(job.report!.expires, record.mandate.expires),
            pass: true,
          };
        }
        if (data.action === "release") {
          this.source(record);
          insist(
            chain.state === "Reserved" &&
              chain.attestation?.pass &&
              chain.attestation.expires > Date.now() &&
              record.mandate.expires > Date.now(),
            "A current verifier attestation is required before owner acceptance.",
          );
          insist(
            chain.attestation.job_id === record.id &&
              chain.attestation.domain === record.mandate.domain &&
              chain.attestation.artifact_hash === record.artifactHash &&
              chain.attestation.input_hash === record.mandate.input_hash &&
              chain.attestation.mandate_hash === record.mandate.mandate_hash &&
              chain.attestation.checks_version === CHECK_VERSION,
            "Verifier attestation binding mismatch.",
          );
          args.artifact_hash = record.artifactHash;
          gas = "120000000000000";
        }
        if (data.action === "refund")
          insist(
            ["Approved", "Reserved"].includes(chain.state),
            "A pending transfer cannot race a reservation refund.",
          );
      }
    }
    const intent: NearIntent = {
      ...(record && data.action !== "refund"
        ? { agreementExpires: record.mandate.expires }
        : {}),
      ...(record && ["approve", "release", "refund"].includes(data.action)
        ? { ownerKey: record.ownerKey }
        : {}),
      codeHash: this.config.codeHash,
      id: id(),
      executionId: record?.id,
      action: data.action,
      transaction: {
        signerId: signer,
        receiverId: this.config.contractId,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName: data.action, args, deposit, gas },
          },
        ],
      },
      state: "prepared",
      createdAt: Date.now(),
      expires: Math.min(
        Date.now() + 600000,
        record && data.action !== "refund" ? record.mandate.expires : Infinity,
        record && data.action === "reserve" ? record.quote.expires : Infinity,
      ),
    };
    this.store.transaction(() => {
      if (record) {
        insist(
          !this.all<NearIntent>("near_intent").some(
            (i) =>
              i.executionId === record.id &&
              i.action === data.action &&
              (i.state === "submitted" ||
                (i.state === "prepared" && i.expires > Date.now())),
          ),
          "This action already has a pending signing intent. Reconcile it before creating another.",
        );
      }
      this.save("near_intent", intent);
      this.store.event(
        record?.jobId || null,
        "near_intent",
        `Prepared ${data.action} signing request on testnet; no completion claimed.`,
      );
    });
    return intent;
  }
  async confirm(intentId: string, txHash: string) {
    const intent = this.intent(intentId);
    insist(
      intent.transaction.receiverId === this.config.contractId &&
        intent.codeHash === this.config.codeHash,
      "Signing intent belongs to a different reviewed contract/code hash.",
    );
    if (intent.state === "confirmed") {
      insist(
        intent.txHash === txHash,
        "Intent already confirmed with a different transaction.",
      );
      return intent;
    }
    if (intent.txHash)
      insist(
        intent.txHash === txHash,
        "A submitted intent cannot change transaction hash.",
      );
    const record = intent.executionId
      ? this.execution(intent.executionId)
      : undefined;
    await this.rpc().ensureContract();
    const result = await this.rpc().confirm(
      txHash,
      intent.transaction,
      record && ["approve", "release", "refund"].includes(intent.action)
        ? record.ownerKey
        : undefined,
    );
    // Save the RPC-validated hash immediately; reloads cannot reinterpret the action.
    intent.txHash = txHash;
    intent.state = result.state === "failed" ? "failed" : "submitted";
    if (result.state === "failed") intent.error = result.error;
    this.store.transaction(() => this.update("near_intent", intent));
    if (result.state !== "confirmed") return intent;
    if (record) {
      const chain = await this.chain(record);
      const expected: Partial<Record<NearAction, string>> = {
        approve: "Approved",
        reserve: "Reserved",
        deliver: "Reserved",
        attest: "Reserved",
        release: "Paid",
        refund: "Refunded",
      };
      insist(
        chain.state === expected[intent.action],
        "Final transaction observed, but its contract callback/state is not confirmed. Reconcile again; no successful settlement is recorded.",
      );
      if (intent.action === "deliver")
        insist(
          chain.artifact_hash === record.artifactHash,
          "Provider delivery was not confirmed.",
        );
      if (intent.action === "attest")
        insist(
          chain.attestation?.pass &&
            chain.attestation.artifact_hash === record.artifactHash,
          "Verifier attestation was not confirmed.",
        );
      record.state = chain.state;
      record.delivered = Boolean(chain.artifact_hash);
      record.attested = Boolean(chain.attestation?.pass);
      record.updatedAt = Date.now();
      if (intent.action === "release")
        record.receipt = {
          txHash,
          at: Date.now(),
          paid: record.quote.amount,
          recipient: record.quote.recipient,
          artifactHash: record.artifactHash,
          domain: record.mandate.domain,
        };
    }
    if (intent.action === "withdraw") {
      const w = await this.rpc().view("get_withdrawal", {
        withdrawal_id: intent.transaction.actions[0].params.args.withdrawal_id,
      });
      insist(
        w.owner === intent.transaction.signerId &&
          w.amount === intent.transaction.actions[0].params.args.amount &&
          w.state === "Completed",
        "Withdrawal callback has not confirmed a successful owner transfer.",
      );
    }
    intent.state = "confirmed";
    intent.confirmedAt = Date.now();
    delete intent.error;
    this.store.transaction(() => {
      if (record) this.update("near_execution", record);
      this.update("near_intent", intent);
      this.store.event(
        record?.jobId || null,
        "near_confirmed",
        `NEAR testnet ${intent.action} finalized and reconciled against contract state.`,
      );
    });
    return intent;
  }
  async renewQuote(executionId: string) {
    const record = this.execution(executionId);
    await this.rpc().ensureContract();
    const chain = await this.chain(record);
    insist(
      chain.state === "Approved" && !chain.quote,
      "Only an approved, unreserved agreement can renew its quote.",
    );
    this.source(record);
    const provider = this.config.providers.find(
      (p) => p.id === record.provider,
    );
    insist(
      provider &&
        provider.role.accountId === record.quote.recipient &&
        provider.price === record.quote.amount &&
        BigInt(provider.price) <= BigInt(record.mandate.cap),
      "Provider or price changed. Prepare a new owner agreement.",
    );
    return this.store.transaction(() => {
      const current = this.execution(executionId);
      insist(
        current.quote.id === record.quote.id &&
          current.state === "Approved" &&
          current.mandate.expires > Date.now() &&
          current.quote.expires <= Date.now(),
        "Only an expired quote within a current approved agreement can be renewed.",
      );
      insist(
        !this.all<NearIntent>("near_intent").some(
          (i) =>
            i.executionId === executionId &&
            (i.state === "submitted" ||
              (i.state === "prepared" && i.expires > Date.now())),
        ),
        "Reconcile pending signing requests before renewing the quote.",
      );
      current.quote = {
        ...current.quote,
        id: id(),
        expires: Math.min(Date.now() + 900000, current.mandate.expires),
      };
      current.updatedAt = Date.now();
      this.update("near_execution", current);
      this.store.event(
        current.jobId,
        "near_quote_renewed",
        "Expired provider quote renewed at the same price and recipient within the approved mandate. No transaction submitted.",
      );
      return current;
    });
  }
  async refreshExecution(executionId: string) {
    const record = this.execution(executionId);
    insist(
      record.mandate.domain === `styx:testnet:${this.config.contractId}`,
      "This agreement belongs to an earlier contract. Its saved history is read-only.",
    );
    await this.rpc().ensureContract();
    const chain = await this.chain(record);
    record.delivered = Boolean(chain.artifact_hash);
    record.attested = Boolean(chain.attestation?.pass);
    if (chain.state === "Paid" && !record.receipt) {
      record.lastError =
        "Chain reports Paid. Reconcile the release transaction to create a verified receipt; this screen does not yet claim settlement.";
    } else {
      record.state = chain.state;
      delete record.lastError;
    }
    record.updatedAt = Date.now();
    this.store.transaction(() => this.update("near_execution", record));
    return record;
  }
  async submitRole(intentId: string) {
    const intent = this.intent(intentId);
    insist(
      intent.transaction.receiverId === this.config.contractId &&
        intent.codeHash === this.config.codeHash,
      "Signing intent belongs to a different reviewed contract/code hash.",
    );
    insist(
      ["reserve", "deliver", "attest"].includes(intent.action),
      "Owner actions must be signed in the owner's wallet.",
    );
    insist(
      intent.state === "prepared" && intent.expires > Date.now(),
      "Role intent is already submitted or expired; reconcile instead of replaying.",
    );
    insist(
      this.config.issues.length === 0,
      "Testnet signing roles are not configured.",
    );
    const role = [
      this.config.agent,
      this.config.verifier,
      ...this.config.providers.map((p) => p.role),
    ].find((r) => r?.accountId === intent.transaction.signerId);
    insist(role, "Configured role does not match this signing intent.");
    insist(
      !this.signing.has(role.accountId),
      "This role has another submission in progress. Retry once it is reconciled.",
    );
    this.signing.add(role.accountId);
    try {
      await this.rpc().ensureContract();
      const current = this.intent(intentId);
      insist(
        current.state === "prepared",
        "This intent was already submitted by another request.",
      );
      insist(
        current.expires > Date.now(),
        "Role intent expired before signing.",
      );
      const execution = this.execution(intent.executionId!);
      const expectedKey =
        intent.action === "reserve"
          ? execution.mandate.agent_key
          : intent.action === "attest"
            ? execution.mandate.verifier_key
            : this.config.providers.find((p) => p.id === execution.provider)
                ?.role.publicKey;
      insist(
        role.publicKey === expectedKey,
        "Configured role key differs from the saved agreement.",
      );
      if (intent.action !== "reserve") this.source(execution);
      intent.state = "submitted";
      this.store.transaction(() => this.update("near_intent", intent));
      const txHash = await this.signer(role, intent.transaction);
      intent.txHash = txHash;
      this.store.transaction(() => this.update("near_intent", intent));
      return await this.confirm(intent.id, txHash);
    } catch {
      if (intent.state === "submitted") {
        intent.error =
          "Role submission outcome is uncertain or failed. Reconcile its transaction and contract state before retrying.";
        this.store.transaction(() => this.update("near_intent", intent));
      }
      throw Error(
        intent.error || "Testnet role submission rejected before signing.",
      );
    } finally {
      this.signing.delete(role.accountId);
    }
  }
}
