import { readFileSync, readdirSync } from "node:fs";
import { z } from "zod";
import { Store } from "../storage/db.ts";
import { ASSET, CHECK_VERSION, VERIFIER, type Job } from "./types.ts";
import {
  hash,
  id,
  insist,
  cents,
  transition,
  assertQuote,
  assertRecipient,
} from "./policy.ts";
import { providers, manifest, parseUpload } from "../providers/index.ts";
import { verify, validReport } from "../verification/index.ts";
import { NearAIClient } from "../providers/model.ts";
import { localCases } from "./local-cases.ts";
const uploadSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(160)
      .refine(
        (n) => /\.(json|csv)$/i.test(n),
        "Only structured JSON and CSV invoices are supported. PDF, encrypted documents and images are not supported.",
      ),
    content: z
      .string()
      .min(1)
      .max(1024 * 1024)
      .refine(
        (content) => Buffer.byteLength(content, "utf8") <= 1024 * 1024,
        "File exceeds 1 MB.",
      ),
  })
  .strict();
export const jobSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    instructions: z.string().min(10).max(8000),
    budget: z.string(),
    deadline: z.number().int(),
    allowedProviders: z.array(z.enum(["ledgerworks", "parselab"])).min(1),
    requirements: z.string().min(1).max(2000),
    uploads: z.array(uploadSchema).max(100),
    processing: z.enum(["local", "near_ai"]).default("local"),
    externalConsent: z.boolean().default(false),
    scenario: z
      .enum([
        "normal",
        "slow",
        "timeout",
        "malformed",
        "missing_coverage",
        "arithmetic",
        "changed_recipient",
        "payout_failure",
      ])
      .default("normal"),
  })
  .strict();
export class Service {
  private processing = new Set<string>();
  constructor(
    public store: Store,
    public model = new NearAIClient(),
  ) {}
  updateDraft(jobId: string, input: unknown) {
    const data = jobSchema.parse(input);
    const cap = cents(data.budget);
    insist(
      cap > 0 && cap <= 100000 && data.deadline > Date.now(),
      "Provide a positive cap and future deadline.",
    );
    const uploads = data.uploads.map((u) => ({
      id: id(),
      name: u.name,
      size: Buffer.byteLength(u.content),
      hash: hash(u.content),
      content: u.content,
    }));
    insist(
      uploads.reduce((n, u) => n + u.size, 0) <= 5 * 1024 * 1024,
      "Total upload size exceeds 5 MB.",
    );
    uploads.forEach(parseUpload);
    const processing = this.model.policy(
      data.processing,
      data.externalConsent,
      uploads,
      data.scenario,
    );
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(j.state === "draft", "Only unsubmitted drafts can be edited.");
      Object.assign(j, {
        name: data.name,
        instructions: data.instructions,
        cap,
        deadline: data.deadline,
        allowedProviders: data.allowedProviders,
        requirements: data.requirements,
        scenario: data.scenario,
        uploads,
        updatedAt: Date.now(),
      });
      const { hash: _h, ...old } = j.mandate;
      const base = {
        ...old,
        processing,
        cap,
        expires: data.deadline,
        providers: data.allowedProviders,
        recipients: Object.fromEntries(
          providers
            .filter((p) =>
              data.allowedProviders.includes(
                p.id as "ledgerworks" | "parselab",
              ),
            )
            .map((p) => [p.id, p.recipient]),
        ),
        inputHash: manifest(uploads),
        scopeHash: hash({
          name: data.name,
          instructions: data.instructions,
          requirements: data.requirements,
        }),
      };
      j.mandate = { ...base, hash: hash(base) };
      this.store.db
        .prepare(
          "UPDATE mandate_version SET payload=? WHERE id=? AND workspace_id=?",
        )
        .run(JSON.stringify(j.mandate), `${j.id}:1`, this.store.workspace);
      this.store.db
        .prepare("DELETE FROM upload WHERE job_id=? AND workspace_id=?")
        .run(j.id, this.store.workspace);
      for (const u of uploads) this.store.record("upload", j.id, u, u.id);
      this.store.save(j);
      this.store.event(
        j.id,
        "draft_saved",
        "Draft updated before owner approval.",
      );
      return j;
    });
  }
  createLocalTest(caseId: string) {
    const selected = localCases.find((item) => item.id === caseId);
    insist(selected, "Unknown local test case.");
    const uploads = readdirSync(
      new URL("../../fixtures/invoices/", import.meta.url),
    )
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => ({
        name,
        content: readFileSync(
          new URL(`../../fixtures/invoices/${name}`, import.meta.url),
          "utf8",
        ),
      }));
    return this.create(
      {
        name: `Local test · ${selected.title}`,
        instructions:
          "Convert the 30 synthetic sample invoices into an accounting CSV. Account for every invoice, reconcile totals, and flag duplicates and uncertain fields.",
        budget: "5.00",
        deadline: Date.now() + 7 * 86400000,
        allowedProviders: ["ledgerworks", "parselab"],
        requirements:
          "CSV schema; complete invoice coverage; arithmetic reconciliation; duplicate and uncertainty flags.",
        uploads,
        scenario: selected.id,
        processing: "local",
        externalConsent: false,
      },
      false,
      undefined,
      selected.id,
    );
  }
  async prepareTestnetSource(input: unknown, principal = "local-owner") {
    const data = z
      .object({
        name: z.string().trim().min(3).max(120),
        uploads: z.array(uploadSchema).min(1).max(100),
        processing: z.enum(["local", "near_ai"]).default("local"),
        externalConsent: z.boolean().default(false),
      })
      .strict()
      .parse(input);
    const job = this.create({
      ...data,
      instructions:
        "Prepare accounting CSV evidence from these owner supplied invoices for a separately wallet-approved testnet agreement.",
      budget: "0.01",
      deadline: Date.now() + 7 * 86400000,
      allowedProviders: ["ledgerworks"],
      requirements:
        "Account for every source invoice and verify amounts independently.",
    });
    this.store.transaction(() => {
      job.sourceOnly = true;
      job.mandate.approvedAt = Date.now();
      this.store.record("approval", job.id, {
        kind: "invoice_processing",
        principal,
        engine: job.mandate.processing?.engine,
        model:
          job.mandate.processing?.engine === "near_ai"
            ? job.mandate.processing.model
            : undefined,
        mandateHash: job.mandate.hash,
        at: job.mandate.approvedAt,
      });
      job.state = "running";
      job.transitions.push({ state: "running", at: Date.now() });
      this.store.save(job);
      this.store.event(
        job.id,
        "source_preparation",
        `Owner approved ${job.mandate.processing?.engine === "near_ai" ? "NEAR AI" : "local"} invoice preparation. No demo reservation or payment; NEAR agreement requires a separate wallet approval.`,
      );
    });
    return this.process(job.id);
  }
  create(
    input: unknown,
    draft = false,
    forcedId?: string,
    localTestCase?: Job["localTestCase"],
  ) {
    const data = jobSchema.parse(input);
    const cap = cents(data.budget);
    insist(
      cap > 0 && cap <= 100000,
      "Budget must be between 0.01 and 1000.00 demo units.",
    );
    insist(data.deadline > Date.now(), "Deadline must be in the future.");
    insist(
      draft || data.uploads.length > 0,
      "Attach at least one invoice or use the sample set.",
    );
    const uploads = data.uploads.map((u) => ({
      id: id(),
      name: u.name,
      size: Buffer.byteLength(u.content),
      hash: hash(u.content),
      content: u.content,
    }));
    insist(
      uploads.reduce((n, u) => n + u.size, 0) <= 5 * 1024 * 1024,
      "Total upload size exceeds 5 MB.",
    );
    uploads.forEach(parseUpload);
    const processing = this.model.policy(
      data.processing,
      data.externalConsent,
      uploads,
      data.scenario,
    );
    const now = Date.now();
    const prefix =
      this.store.workspace === "acme-local"
        ? "STX"
        : `STX-${hash(this.store.workspace).slice(0, 8)}`;
    const jobId = forcedId || `${prefix}-${1042 + this.store.jobs().length}`;
    const mandateBase = {
      processing,
      version: 1,
      jobId,
      cap,
      asset: ASSET,
      network: "local",
      expires: data.deadline,
      providers: data.allowedProviders,
      recipients: Object.fromEntries(
        providers
          .filter((p) =>
            data.allowedProviders.includes(p.id as "ledgerworks" | "parselab"),
          )
          .map((p) => [p.id, p.recipient]),
      ),
      verifier: VERIFIER,
      checks: CHECK_VERSION,
      approvalMode: "owner" as const,
      inputHash: manifest(uploads),
      scopeHash: hash({
        name: data.name,
        instructions: data.instructions,
        requirements: data.requirements,
      }),
    };
    const j: Job = {
      ...(localTestCase ? { localTestCase } : {}),
      workspaceId: this.store.workspace,
      id: jobId,
      name: data.name,
      instructions: data.instructions,
      cap,
      deadline: data.deadline,
      allowedProviders: data.allowedProviders,
      requirements: data.requirements,
      state: "draft",
      createdAt: now,
      updatedAt: now,
      uploads,
      mandate: { ...mandateBase, hash: hash(mandateBase) },
      quotes: [],
      scenario: data.scenario,
      transitions: [{ state: "draft", at: now }],
    };
    if (!draft) transition(j, "awaiting_approval");
    this.store.transaction(() => {
      this.store.save(j);
      this.store.record("mandate_version", j.id, j.mandate, `${j.id}:1`);
      for (const u of uploads) this.store.record("upload", j.id, u, u.id);
      this.store.event(
        j.id,
        "created",
        draft ? "Draft saved." : "Job created; owner approval required.",
      );
    });
    return j;
  }
  submit(jobId: string) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(j.uploads.length, "Attach invoices before submitting.");
      transition(j, "awaiting_approval");
      this.store.save(j);
      return j;
    });
  }
  approve(
    jobId: string,
    version: number,
    mandateHash: string,
    principal = "local-owner",
  ) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        j.state === "awaiting_approval",
        "This mandate cannot be approved in the current state.",
      );
      insist(
        j.mandate.version === version && j.mandate.hash === mandateHash,
        "Mandate changed. Review the current immutable version.",
      );
      insist(
        j.deadline > Date.now(),
        "Mandate expired. Create a new version with a future deadline.",
      );
      j.mandate.approvedAt = Date.now();
      this.store.record("approval", j.id, {
        kind: "mandate",
        version,
        hash: mandateHash,
        at: Date.now(),
        principal,
      });
      transition(j, "quoting");
      j.quotes = providers
        .filter((p) => j.allowedProviders.includes(p.id))
        .map((p) => p.quote(j));
      for (const q of j.quotes) this.store.record("quote", j.id, q, q.id);
      transition(j, "quoted");
      this.store.save(j);
      this.store.event(
        j.id,
        "approved",
        `Owner approved mandate v${version}; ${j.quotes.length} quotes received.`,
      );
      return j;
    });
  }
  refresh(jobId: string) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(j.state === "quoted", "Only unreserved quotes can be refreshed.");
      insist(j.deadline > Date.now(), "Mandate expired. Reapprove new rules.");
      j.quotes = providers
        .filter((p) => j.allowedProviders.includes(p.id))
        .map((p) => p.quote(j));
      for (const q of j.quotes) this.store.record("quote", j.id, q, q.id);
      this.store.save(j);
      this.store.event(j.id, "quotes", "Provider quotes refreshed.");
      return j;
    });
  }
  revise(jobId: string, budget: string, deadline: number) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        ["awaiting_approval", "quoted", "failed", "blocked"].includes(j.state),
        "Rules can only change before reservation; cancel a reserved job first.",
      );
      const r = this.store.db
        .prepare("SELECT * FROM reservation WHERE job_id=?")
        .get(jobId);
      insist(
        !r,
        "A reserved mandate is immutable. Cancel and create a new job.",
      );
      const cap = cents(budget);
      insist(
        cap > 0 && cap <= 100000 && deadline > Date.now(),
        "Provide a positive cap and future deadline.",
      );
      const { hash: _hash, approvedAt: _approved, ...previous } = j.mandate;
      const base = {
        ...previous,
        version: j.mandate.version + 1,
        cap,
        expires: deadline,
      };
      j.mandate = { ...base, hash: hash(base) };
      j.cap = cap;
      j.deadline = deadline;
      j.quotes = [];
      if (j.state !== "awaiting_approval") transition(j, "awaiting_approval");
      this.store.record(
        "mandate_version",
        j.id,
        j.mandate,
        `${j.id}:${j.mandate.version}`,
      );
      this.store.save(j);
      this.store.event(
        j.id,
        "rules_changed",
        `Mandate v${j.mandate.version} requires explicit owner reapproval. Prior quotes invalidated.`,
      );
      return j;
    });
  }
  reserve(jobId: string, quoteId: string) {
    try {
      return this.store.transaction(() => {
        const j = this.store.get(jobId);
        const q = j.quotes.find((q) => q.id === quoteId);
        insist(q, "Quote not found.");
        assertQuote(j, q, this.store.balance().available);
        this.store.db
          .prepare("INSERT INTO reservation VALUES(?,?,?,'reserved')")
          .run(j.id, this.store.workspace, q.price);
        j.selected = q;
        transition(j, "reserved");
        transition(j, "running");
        this.store.save(j);
        this.store.event(
          j.id,
          "reserved",
          `${q.price} base units reserved for ${q.provider}; processing started.`,
        );
        return j;
      });
    } catch (e) {
      this.store.event(jobId, "rejected", (e as Error).message);
      throw e;
    }
  }
  async process(jobId: string) {
    const snapshot = this.store.get(jobId);
    if (snapshot.state !== "running" || this.processing.has(jobId))
      return snapshot;
    this.processing.add(jobId);
    try {
      if (snapshot.scenario === "changed_recipient") return this.attack(jobId);
      const provider = providers.find(
        (p) =>
          p.id ===
          (snapshot.sourceOnly ? "ledgerworks" : snapshot.selected?.provider),
      )!;
      const live = snapshot.mandate.processing?.engine === "near_ai";
      const rows = live
        ? await this.model.extract(snapshot)
        : await provider.start(snapshot);
      return this.store.transaction(() => {
        const j = this.store.get(jobId);
        insist(j.state === "running", "Processing no longer active.");
        j.artifact = {
          id: id(),
          hash: "",
          csv: provider.fetchDelivery(rows),
          rows,
          execution: {
            engine: live ? "near_ai" : "local",
            model:
              snapshot.mandate.processing?.engine === "near_ai"
                ? snapshot.mandate.processing.model
                : undefined,
            at: Date.now(),
          },
        };
        j.artifact.hash = hash(j.artifact.csv);
        transition(j, "delivered");
        this.store.record("artifact", j.id, j.artifact, j.artifact.id);
        transition(j, "verifying");
        j.report = verify(j);
        this.store.record("verification_report", j.id, j.report);
        if (j.report.pass) {
          transition(j, "ready_for_review");
          delete j.error;
        } else {
          transition(j, "failed");
          j.error =
            "Verification failed. Inspect the evidence, request correction, or cancel to release reserved funds.";
        }
        this.store.save(j);
        this.store.event(
          j.id,
          j.report.pass ? "verified" : "verification_failed",
          j.report.pass
            ? "Delivery verified; awaiting owner acceptance."
            : "Delivery failed independent checks.",
        );
        return j;
      });
    } catch (e) {
      return this.store.transaction(() => {
        const j = this.store.get(jobId);
        if (j.state === "running") {
          transition(j, "failed");
          j.error = (e as Error).message;
          this.store.save(j);
          this.store.event(j.id, "provider_failed", j.error);
        }
        return j;
      });
    } finally {
      this.processing.delete(jobId);
    }
  }
  attack(jobId: string) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        ["quoted", "running", "ready_for_review"].includes(j.state),
        "Recipient attack demo is available before settlement.",
      );
      const q = j.selected || j.quotes[0];
      insist(q, "Obtain a quote first.");
      let reason = "";
      try {
        assertRecipient(j, { ...q, recipient: "unapproved-recipient.demo" });
      } catch (e) {
        reason = (e as Error).message;
      }
      insist(
        reason,
        "The demonstration must be rejected by the real policy validator.",
      );
      j.blocked = {
        approved: q.recipient,
        attempted: "unapproved-recipient.demo",
        amount: q.price,
        at: Date.now(),
        reason,
      };
      transition(j, "blocked");
      this.store.save(j);
      this.store.event(
        j.id,
        "blocked",
        "Recipient change rejected by policy before any payout. No funds moved.",
      );
      return j;
    });
  }
  reverify(jobId: string, principal = "local-owner") {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        j.sourceOnly &&
          j.state === "ready_for_review" &&
          j.artifact &&
          j.report,
        "Only a verified owner invoice delivery can be re-checked.",
      );
      insist(
        j.mandate.expires > Date.now(),
        "The source mandate has expired. Upload a new delivery.",
      );
      const bound = Boolean(
        this.store.db
          .prepare(
            "SELECT 1 FROM near_execution WHERE workspace_id=? AND job_id=? LIMIT 1",
          )
          .get(this.store.workspace, jobId),
      );
      const { hash: stored, ...base } = j.report!;
      const report = verify(j);
      insist(
        base.pass &&
          stored === hash(base) &&
          base.jobId === j.id &&
          base.mandateHash === j.mandate.hash &&
          base.artifactHash === report.artifactHash &&
          base.inputHash === report.inputHash &&
          base.verifier === VERIFIER &&
          base.checksVersion === CHECK_VERSION &&
          base.domain === report.domain &&
          report.pass,
        "Saved invoice evidence has changed or failed verification.",
      );
      if (bound) {
        // Keep every existing agreement's source/report binding immutable.
        const copy = structuredClone(j);
        copy.sourceVersionOf = j.sourceVersionOf || j.id;
        const prefix =
          this.store.workspace === "acme-local"
            ? "STX"
            : `STX-${hash(this.store.workspace).slice(0, 8)}`;
        copy.id = `${prefix}-${1042 + this.store.jobs().length}`;
        const { hash: _previousHash, approvedAt, ...mandate } = copy.mandate;
        const nextMandate = { ...mandate, jobId: copy.id };
        copy.mandate = { ...nextMandate, hash: hash(nextMandate), approvedAt };
        copy.createdAt = copy.updatedAt = Date.now();
        copy.transitions = [{ state: "ready_for_review", at: copy.createdAt }];
        copy.artifact!.id = id();
        copy.report = verify(copy);
        this.store.save(copy);
        this.store.record("mandate_version", copy.id, copy.mandate);
        for (const upload of copy.uploads)
          this.store.record("upload", copy.id, upload);
        this.store.record("artifact", copy.id, copy.artifact);
        this.store.record("verification_report", copy.id, copy.report);
        this.store.record("approval", copy.id, {
          kind: "saved_evidence_refresh",
          principal,
          sourceJobId: j.id,
          at: Date.now(),
        });
        this.store.event(
          copy.id,
          "source_reverified",
          `${principal} re-checked saved evidence from ${j.id} as a new delivery version. Existing agreements unchanged; no AI request or wallet payment was made.`,
        );
        return copy;
      }
      j.report = report;
      j.updatedAt = Date.now();
      this.store.save(j);
      this.store.record("verification_report", j.id, report);
      this.store.event(
        j.id,
        "source_reverified",
        `${principal} re-checked saved invoice evidence. No AI request or wallet payment was made.`,
      );
      return j;
    });
  }
  correct(jobId: string) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        ["ready_for_review", "failed"].includes(j.state),
        "Correction is unavailable in this state.",
      );
      insist(j.sourceOnly || j.selected, "No provider reservation exists.");
      insist(
        j.deadline > Date.now(),
        "Mandate expired. Cancel reservation and create a new job.",
      );
      transition(j, "correction_requested");
      j.scenario = "normal";
      j.artifact = undefined;
      j.report = undefined;
      transition(j, "running");
      this.store.save(j);
      this.store.event(
        j.id,
        "correction",
        "Owner requested a fresh extraction under the same approved rules.",
      );
      return j;
    });
  }
  settle(jobId: string, principal = "local-owner") {
    try {
      return this.store.transaction(() => {
        const j = this.store.get(jobId);
        insist(
          !j.sourceOnly,
          "Invoice evidence is paid only through its separate NEAR testnet agreement.",
        );
        if (j.state === "settled") return j;
        insist(
          j.state === "ready_for_review",
          "Only a verified delivery can be accepted.",
        );
        insist(
          j.deadline > Date.now(),
          "Mandate expired. Cancel and release reserved funds.",
        );
        insist(
          validReport(j),
          "Artifact or verification binding is invalid or expired. Request correction.",
        );
        insist(
          j.selected &&
            j.selected.recipient === j.mandate.recipients[j.selected.provider],
          "Recipient violates mandate.",
        );
        const r = this.store.db
          .prepare(
            "SELECT amount FROM reservation WHERE job_id=? AND workspace_id=? AND state='reserved'",
          )
          .get(j.id, this.store.workspace);
        insist(
          r && Number(r.amount) === j.selected.price,
          "Reservation does not match the accepted quote.",
        );
        transition(j, "settlement_pending");
        const attempt = {
          id: id(),
          at: Date.now(),
          state: j.scenario === "payout_failure" ? "failed" : "succeeded",
          mode: "local",
        };
        this.store.record("settlement_attempt", j.id, attempt, attempt.id);
        if (j.scenario === "payout_failure") {
          transition(j, "ready_for_review");
          j.error =
            "Local payout simulation failed. Funds remain reserved; cancel or request correction before retrying.";
          this.store.save(j);
          this.store.event(
            j.id,
            "payout_failed",
            "Payout failed; no payment ledger entry created.",
          );
          return j;
        }
        const at = Date.now();
        this.store.record("approval", j.id, {
          kind: "delivery",
          principal,
          reportHash: j.report!.hash,
          at,
        });
        this.store.db
          .prepare("INSERT INTO ledger VALUES(?,?,?,'payment',?)")
          .run(id(), this.store.workspace, j.id, j.selected.price);
        this.store.db
          .prepare("UPDATE reservation SET state='paid' WHERE job_id=?")
          .run(j.id);
        j.receipt = {
          id: `RCP-${j.id}`,
          paid: j.selected.price,
          approvedAt: at,
          settledAt: at,
        };
        this.store.record("receipt", j.id, j.receipt, j.receipt.id);
        transition(j, "settled");
        delete j.error;
        this.store.save(j);
        this.store.event(
          j.id,
          "settled",
          "Owner accepted delivery; local ledger payment recorded once.",
        );
        return j;
      });
    } catch (e) {
      this.store.event(jobId, "rejected", (e as Error).message);
      throw e;
    }
  }
  cancel(jobId: string) {
    return this.store.transaction(() => {
      const j = this.store.get(jobId);
      insist(
        ![
          "settled",
          "settlement_pending",
          "running",
          "refunded",
          "cancelled",
        ].includes(j.state),
        "Cannot cancel while processing, paying, or after finalization.",
      );
      const r = this.store.db
        .prepare(
          "SELECT * FROM reservation WHERE job_id=? AND workspace_id=? AND state='reserved'",
        )
        .get(j.id, this.store.workspace);
      if (r) {
        transition(j, "refund_pending");
        this.store.db
          .prepare(
            "UPDATE reservation SET state='refunded' WHERE job_id=? AND state='reserved'",
          )
          .run(j.id);
        this.store.db
          .prepare("INSERT INTO ledger VALUES(?,?,?,'refund',?)")
          .run(id(), this.store.workspace, j.id, Number(r.amount));
        transition(j, "refunded");
        this.store.event(
          j.id,
          "refunded",
          "Reservation released to available balance; no external refund transfer.",
        );
      } else transition(j, "cancelled");
      this.store.save(j);
      return j;
    });
  }
  seed() {
    if (this.store.jobs().length) return;
    const uploads = readdirSync(
      new URL("../../fixtures/invoices/", import.meta.url),
    )
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((name) => ({
        name,
        content: readFileSync(
          new URL(`../../fixtures/invoices/${name}`, import.meta.url),
          "utf8",
        ),
      }));
    this.create(
      {
        name: "October invoices",
        instructions:
          "Convert these 30 October invoices into an accounting CSV. Account for every invoice, reconcile totals, and flag duplicates and uncertain fields.",
        budget: "5.00",
        deadline: Date.now() + 7 * 86400000,
        allowedProviders: ["ledgerworks", "parselab"],
        requirements:
          "CSV schema; complete invoice coverage; arithmetic reconciliation; duplicate and uncertainty flags.",
        uploads,
        scenario: "normal",
      },
      false,
      "STX-1042",
    );
    for (const p of providers)
      this.store.db
        .prepare("INSERT OR IGNORE INTO provider VALUES(?,?)")
        .run(
          p.id,
          JSON.stringify({ id: p.id, name: p.name, recipient: p.recipient }),
        );
  }
  recover() {
    for (const j of this.store.jobs()) {
      if (j.state === "running") {
        transition(j, "failed");
        j.error =
          "Server restarted during processing. Request correction to safely retry; funds remain reserved.";
        this.store.save(j);
        this.store.event(j.id, "interrupted", j.error);
      }
    }
  }
}
