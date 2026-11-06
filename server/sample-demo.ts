import express from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { NearAIClient } from "../lib/providers/model.ts";
import { hash } from "../lib/domain/policy.ts";
import { providers } from "../lib/providers/index.ts";
import { deliveryReview } from "../lib/verification/review.ts";
import type { Job } from "../lib/domain/types.ts";
import type { accessConfig } from "./access.ts";

// Guest data never shares a database, cookie or signer with the owner workspace.
export function createSampleDemo(
  config: ReturnType<typeof accessConfig>,
  options: { now?: () => number; ttlMs?: number; capacity?: number } = {},
) {
  const router = express.Router();
  const now = options.now || Date.now;
  const ttl = options.ttlMs || 30 * 60000;
  const capacity = options.capacity || 24;
  const cookieName = config.secure ? "__Secure-styx_sample" : "styx_sample";
  type Guest = {
    store: Store;
    service: Service;
    csrf: string;
    expires: number;
    active: number;
    busy: boolean;
    writes: number;
  };
  const guests = new Map<string, Guest>();
  let created = 0,
    windowStart = now();
  function prune() {
    for (const [token, guest] of guests) {
      if (guest.expires <= now() && !guest.active && !guest.busy) {
        guest.store.close();
        guests.delete(token);
      }
    }
  }
  const timer = setInterval(prune, 60000);
  timer.unref();
  const fail = (message: string, status = 400) =>
    Object.assign(new Error(message), { status });
  const clean = (job: Job) => ({
    ...job,
    uploads: job.uploads.map(({ content: _content, ...upload }) => upload),
    artifact: job.artifact ? { ...job.artifact, csv: undefined } : undefined,
  });
  router.use((req, res, next) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      if (req.headers.host !== config.host) throw fail("Untrusted host.", 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw fail("Cross-site demo access rejected.", 403);
      if (req.headers.origin && req.headers.origin !== config.origin)
        throw fail("Cross-origin demo access rejected.", 403);
      prune();
      let token = req.headers.cookie
        ?.split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      let guest =
        token && /^[a-f0-9]{64}$/.test(token)
          ? guests.get(hash(token))
          : undefined;
      if (guest && guest.expires <= now()) guest = undefined;
      if (req.path === "/session" && req.method === "GET") {
        if (!guest) {
          if (now() - windowStart >= 15 * 60000) {
            created = 0;
            windowStart = now();
          }
          if (guests.size >= capacity || created >= 60)
            throw fail("The sample demo is busy. Please try again later.", 429);
          const store = new Store(":memory:");
          token = randomBytes(32).toString("hex");
          guest = {
            store,
            service: new Service(store, new NearAIClient({})),
            csrf: randomBytes(32).toString("hex"),
            expires: now() + ttl,
            active: 0,
            busy: false,
            writes: 0,
          };
          guests.set(hash(token), guest);
          created++;
          res.cookie(cookieName, token, {
            httpOnly: true,
            secure: config.secure,
            sameSite: "strict",
            path: "/api/sample-demo",
            maxAge: ttl,
          });
        }
        res.json({ csrf: guest.csrf, expires: guest.expires, sample: true });
        return;
      }
      if (!guest)
        throw fail("Sample session expired. Start a new sample demo.", 401);
      if (!["GET", "POST"].includes(req.method))
        throw fail("Demo method unavailable.", 405);
      if (req.method === "POST") {
        const csrf = req.headers["x-styx-csrf"];
        if (
          req.headers.origin !== config.origin ||
          typeof csrf !== "string" ||
          !/^[a-f0-9]{64}$/.test(csrf) ||
          !timingSafeEqual(Buffer.from(csrf), Buffer.from(guest.csrf))
        )
          throw fail("Demo CSRF validation failed.", 403);
        if (guest.busy)
          throw fail("A sample action is already running. Please wait.", 409);
        if (++guest.writes > 150)
          throw fail(
            "Sample action limit reached. Start again after this session expires.",
            429,
          );
        guest.busy = true;
      }
      guest.active++;
      const current = guest;
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        current.active--;
        if (req.method === "POST" && !res.locals.processing)
          current.busy = false;
      };
      res.once("finish", complete);
      res.once("close", complete);
      res.locals.guest = guest;
      next();
    } catch (error) {
      next(error);
    }
  });
  router.get("/state", (_req, res) => {
    const guest: Guest = res.locals.guest;
    res.json({
      jobs: guest.store.jobs().map(clean),
      balance: guest.store.balance(),
      expires: guest.expires,
      providers: providers.map(({ id, name, price }) => ({ id, name, price })),
    });
  });
  router.post("/jobs", (req, res) => {
    const input = z
      .object({
        caseId: z.enum(["normal", "arithmetic", "missing_coverage", "timeout"]),
        budget: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/),
      })
      .strict()
      .parse(req.body);
    if (Number(input.budget) <= 0 || Number(input.budget) > 10)
      throw fail("Choose a cap from 0.01 to 10.00 demo units.");
    const guest: Guest = res.locals.guest;
    if (guest.store.jobs().length >= 5)
      throw fail("This temporary session supports five sample jobs.", 429);
    const job = guest.service.createLocalTest(input.caseId);
    res
      .status(201)
      .json(clean(guest.service.revise(job.id, input.budget, job.deadline)));
  });
  router.post("/jobs/:id/:action", async (req, res) => {
    const guest: Guest = res.locals.guest;
    const jobId = String(req.params.id),
      action = String(req.params.action);
    guest.store.get(jobId);
    let job: Job;
    switch (action) {
      case "approve": {
        const input = z
          .object({ version: z.number().int(), hash: z.string() })
          .strict()
          .parse(req.body);
        job = guest.service.approve(
          jobId,
          input.version,
          input.hash,
          "sample-visitor",
        );
        break;
      }
      case "reserve": {
        const input = z
          .object({ quoteId: z.string() })
          .strict()
          .parse(req.body);
        guest.service.reserve(jobId, input.quoteId);
        res.locals.processing = true;
        try {
          job = await guest.service.process(jobId);
        } finally {
          res.locals.processing = false;
          if (res.destroyed) guest.busy = false;
        }
        break;
      }
      case "settle":
        z.object({}).strict().parse(req.body);
        job = guest.service.settle(jobId, "sample-visitor");
        break;
      case "cancel":
        z.object({}).strict().parse(req.body);
        job = guest.service.cancel(jobId);
        break;
      default:
        throw fail("This action is unavailable in the sample demo.", 403);
    }
    res.json(clean(job));
  });
  router.get("/jobs/:id/review", (req, res) =>
    res.json(deliveryReview(res.locals.guest.store.get(String(req.params.id)))),
  );
  router.get("/jobs/:id/artifact", (req, res) => {
    const job = res.locals.guest.store.get(String(req.params.id));
    if (!job.artifact) throw fail("No sample delivery yet.");
    res
      .attachment("sample-invoices.csv")
      .type("text/csv")
      .send(job.artifact.csv);
  });
  // No wildcard delegation: owner APIs, uploads, AI and NEAR routes are absent.
  router.use((_req, res) =>
    res
      .status(404)
      .json({
        error:
          "Not available in the sample demo. No wallet or AI actions are enabled.",
      }),
  );
  return {
    router,
    close: () => {
      clearInterval(timer);
      for (const guest of guests.values()) guest.store.close();
      guests.clear();
    },
  };
}
