import express from "express";
import { healthRouter } from "./health.ts";
import { AccessService } from "../lib/auth/service.ts";
import { accessConfig, accessMiddleware } from "./access.ts";
import { resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { insist } from "../lib/domain/policy.ts";
import { providers } from "../lib/providers/index.ts";
import { z } from "zod";
import { NearService } from "../lib/settlement/near-service.ts";
import { deliveryReview } from "../lib/verification/review.ts";
import { hash } from "../lib/domain/policy.ts";
import { listenerConfig } from "./listener.ts";
import { createSampleDemo } from "./sample-demo.ts";
const config = listenerConfig();
const app = express(),
  rootStore = new Store();
const authConfig = accessConfig(process.env, config.PORT);
const auth = new AccessService(rootStore, authConfig.mode);
if (authConfig.mode === "local") {
  const local = new Service(rootStore);
  local.recover();
}
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(
  "/health",
  healthRouter(
    rootStore.db,
    process.argv.includes("--production")
      ? resolve("dist/index.html")
      : undefined,
  ),
);
// Separate in-memory sample workspaces; never routed into owner authentication.
app.use("/api/sample-demo", createSampleDemo(authConfig).router);
app.use("/api", accessMiddleware(auth, authConfig));
function workspaceRouter(store: Store) {
  const router = express.Router(),
    service = new Service(store),
    near = new NearService(store);
  service.recover();
  const clean = (j: any) => ({
    ...j,
    uploads: j.uploads.map(({ content: _content, ...u }: any) => u),
    artifact: j.artifact ? { ...j.artifact, csv: undefined } : undefined,
  });
  router.get("/state", (_req, res) => {
    res.json({
      jobs: store.jobs().map(clean),
      balance: store.balance(),
      events: store.events(),
      auth: res.locals.access,
      workspace: store.db
        .prepare("SELECT name FROM workspace WHERE id=?")
        .get(store.workspace),
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        recipient: p.recipient,
        price: p.price,
        seconds: p.seconds,
      })),
      mode: "local",
      model: service.model.status(),
      testnet: {
        ready: near.config.issues.length === 0,
        contractId: near.config.contractId || null,
      },
    });
  });
  router.get("/fixtures", (_req, res) =>
    res.json(
      readdirSync("fixtures/invoices")
        .filter((n) => n.endsWith(".json"))
        .sort()
        .map((name) => ({
          name,
          content: readFileSync(resolve("fixtures/invoices", name), "utf8"),
        })),
    ),
  );
  router.get("/near", (_req, res) => {
    const jobs = store.jobs();
    const parents = new Map(jobs.map((j) => [j.id, j.sourceVersionOf]));
    // Earlier saved-evidence versions recorded their parent in approval history.
    for (const row of store.db
      .prepare("SELECT job_id,payload FROM approval WHERE workspace_id=?")
      .all(store.workspace)) {
      const approval = JSON.parse(String(row.payload));
      if (
        approval.kind === "saved_evidence_refresh" &&
        typeof approval.sourceJobId === "string" &&
        !parents.get(String(row.job_id))
      )
        parents.set(String(row.job_id), approval.sourceJobId);
    }
    const root = (jobId: string) => {
      const visited = new Set<string>();
      let current = jobId;
      while (parents.get(current) && parents.has(parents.get(current)!)) {
        if (visited.has(current)) return jobId;
        visited.add(current);
        current = parents.get(current)!;
      }
      return current;
    };
    res.json({
      ...near.status(),
      model: service.model.status(),
      sourceJobs: store
        .jobs()
        .filter(
          (j) =>
            j.sourceOnly &&
            j.report?.pass &&
            j.artifact &&
            (!j.sourceOnly || j.state === "ready_for_review"),
        )
        .map((j) => ({
          id: j.id,
          sourceRootId: root(j.id),
          createdAt: j.createdAt,
          name: j.name,
          sourceOnly: Boolean(j.sourceOnly),
          engine: j.artifact?.execution?.engine,
          model: j.artifact?.execution?.model,
          reportExpires: j.report!.expires,
          artifactHash: j.artifact!.hash,
        })),
    });
  });
  router.post("/near/wallet-rpc", async (req, res) => {
    try {
      res.json(await near.walletPreparationRpc(req.body));
    } catch (error) {
      res.json({
        jsonrpc: "2.0",
        id:
          typeof req.body?.id === "string" || typeof req.body?.id === "number"
            ? req.body.id
            : null,
        error: { code: -32000, message: (error as Error).message },
      });
    }
  });
  router.get("/near/balance", async (req, res) =>
    res.json(await near.balance(z.string().parse(req.query.owner))),
  );
  router.get("/near/wallet", async (req, res) =>
    res.json(await near.walletAccount(z.string().parse(req.query.owner))),
  );
  router.post("/near/sources", async (req, res) =>
    res
      .status(201)
      .json(
        clean(
          await service.prepareTestnetSource(
            req.body,
            res.locals.access.userId || "local-owner",
          ),
        ),
      ),
  );
  router.get("/near/network", async (_req, res) =>
    res.json(await near.networkStatus()),
  );
  router.get("/near/keys", async (req, res) =>
    res.json(await near.ownerKeys(z.string().parse(req.query.owner))),
  );
  router.post("/near/executions", async (req, res) => {
    insist(
      store.get(req.body.jobId).sourceOnly,
      "Testnet agreements require your own invoice delivery. Sample jobs stay in Local testing.",
    );
    res.status(201).json(await near.create(req.body));
  });
  router.post("/near/intents", async (req, res) =>
    res.status(201).json(await near.prepare(req.body)),
  );
  router.post("/near/intents/:id/confirm", async (req, res) =>
    res.json(
      await near.confirm(
        String(req.params.id),
        z.string().parse(req.body.txHash),
      ),
    ),
  );
  router.post("/near/intents/:id/submit-role", async (req, res) =>
    res.json(await near.submitRole(String(req.params.id))),
  );
  router.post("/near/executions/:id/renew-quote", async (req, res) =>
    res.json(await near.renewQuote(String(req.params.id))),
  );
  router.post("/near/executions/:id/refresh", async (req, res) =>
    res.json(await near.refreshExecution(String(req.params.id))),
  );
  router.post("/jobs", (req, res) => {
    const { draft, ...data } = req.body;
    res.status(201).json(clean(service.create(data, Boolean(draft))));
  });
  router.post("/testing/jobs", (req, res) => {
    const input = z.object({ caseId: z.string() }).strict().parse(req.body);
    res.status(201).json(clean(service.createLocalTest(input.caseId)));
  });
  router.post("/jobs/:id/:action", async (req, res) => {
    const jobId = String(req.params.id),
      action = String(req.params.action);
    store.get(jobId);
    let j;
    switch (action) {
      case "save":
        j = service.updateDraft(jobId, req.body);
        break;
      case "submit":
        j = service.submit(jobId);
        break;
      case "approve":
        j = service.approve(
          jobId,
          req.body.version,
          req.body.hash,
          res.locals.access.userId
            ? `user:${res.locals.access.userId}`
            : "local-owner",
        );
        break;
      case "refresh":
        j = service.refresh(jobId);
        break;
      case "revise":
        j = service.revise(
          jobId,
          z.string().parse(req.body.budget),
          z.number().int().parse(req.body.deadline),
        );
        break;
      case "reserve":
        j = service.reserve(jobId, z.string().parse(req.body.quoteId));
        void service.process(jobId);
        break;
      case "reverify":
        j = service.reverify(
          jobId,
          res.locals.access.userId
            ? `user:${res.locals.access.userId}`
            : "local-owner",
        );
        break;
      case "correct":
        j = service.correct(jobId);
        void service.process(jobId);
        break;
      case "attack":
        j = service.attack(jobId);
        break;
      case "settle":
        j = service.settle(
          jobId,
          res.locals.access.userId
            ? `user:${res.locals.access.userId}`
            : "local-owner",
        );
        break;
      case "cancel":
        j = service.cancel(jobId);
        break;
      default:
        return res.status(404).json({ error: "Unknown action." });
    }
    res.json(clean(j));
  });
  router.get("/jobs/:id/draft", (req, res) => {
    const j = store.get(String(req.params.id));
    insist(j.state === "draft", "Only drafts can be edited.");
    res.json(j);
  });
  router.get("/jobs/:id/artifact", (req, res) => {
    const j = store.get(String(req.params.id));
    insist(j.artifact, "No delivery yet.");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="october-invoices.csv"',
    );
    res.type("text/csv").send(j.artifact.csv);
  });
  router.get("/jobs/:id/review", (req, res) =>
    res.json(deliveryReview(store.get(String(req.params.id)))),
  );
  router.get("/jobs/:id/report", (req, res) => {
    const review = deliveryReview(store.get(String(req.params.id)));
    const { rows: _rows, missing, ...evidence } = review;
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="verification-report.json"',
    );
    res.type("application/json").send(
      JSON.stringify(
        {
          ...evidence,
          missingInputCount: missing.length,
          flagCounts: Object.fromEntries(
            ["duplicate", "uncertain", "mismatch", "arithmetic"].map((flag) => [
              flag,
              review.rows.filter((r) => r.flags.includes(flag as any)).length,
            ]),
          ),
          explanation:
            "Observed CSV integrity and saved verification report. A report is not a proof of invoice authenticity. Duplicate counts here include all rows in repeated groups; saved report counts additional occurrences.",
        },
        null,
        2,
      ),
    );
  });
  router.get("/jobs/:id/inputs/:sourceId", (req, res) => {
    const job = store.get(String(req.params.id));
    const source = job.uploads.find(
      (u) => u.id === String(req.params.sourceId),
    );
    insist(source, "Input not found in this job/workspace.");
    if (req.query.download === "1") {
      const ext = source.name.toLowerCase().endsWith(".csv") ? "csv" : "json";
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="original-invoice.${ext}"`,
      );
      res.type("application/octet-stream").send(source.content);
      return;
    }
    res.json({
      id: source.id,
      name: source.name,
      expectedHash: source.hash,
      actualHash: hash(source.content),
      intact: hash(source.content) === source.hash,
      content: source.content,
    });
  });
  router.post("/settings", (req, res) => {
    const name = z.string().trim().min(1).max(80).parse(req.body.name);
    store.db
      .prepare("UPDATE workspace SET name=? WHERE id=?")
      .run(name, store.workspace);
    store.event(null, "settings", "Workspace name updated by workspace owner.");
    res.json({ name });
  });
  return router;
}
const routers = new Map<string, ReturnType<typeof workspaceRouter>>();
app.use("/api", (req, res, next) => {
  const workspace = res.locals.access.workspaceId;
  if (!routers.has(workspace))
    routers.set(workspace, workspaceRouter(rootStore.forWorkspace(workspace)));
  routers.get(workspace)!(req, res, next);
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API route not found." }),
);
app.use((err: any, _req: any, res: any, _next: any) => {
  const error =
    err.type === "entity.parse.failed"
      ? "Malformed JSON request."
      : err.type === "entity.too.large"
        ? "Request body exceeds the allowed size."
        : err instanceof z.ZodError
          ? err.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")
          : err.message || "Request failed.";
  res.status(err.status || 400).json({ error });
});
if (process.argv.includes("--production")) {
  app.use(express.static("dist"));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.listen(config.PORT, config.HOST, (error?: Error) => {
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`STYX workspace: http://${config.HOST}:${config.PORT}`);
});
