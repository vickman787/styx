import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { createSampleDemo } from "../server/sample-demo.ts";
import { accessConfig } from "../server/access.ts";

async function setup(options: Parameters<typeof createSampleDemo>[1] = {}) {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as any).port;
  const origin = `http://127.0.0.1:${port}`;
  const demo = createSampleDemo(
    accessConfig({ STYX_AUTH_MODE: "password", STYX_APP_ORIGIN: origin }),
    options,
  );
  app.use("/api/sample-demo", demo.router);
  app.use("/api", (_req, res) =>
    res.status(401).json({ error: "Owner sign-in required" }),
  );
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status || 400).json({ error: error.message }),
  );
  const client = async () => {
    const response = await fetch(origin + "/api/sample-demo/session");
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const session = await response.json();
    return {
      cookie,
      csrf: session.csrf,
      request: (
        path: string,
        body?: any,
        headers: Record<string, string> = {},
      ) =>
        fetch(origin + "/api/sample-demo" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            cookie,
            Origin: origin,
            "Content-Type": "application/json",
            "X-Styx-CSRF": session.csrf,
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
    };
  };
  return {
    origin,
    client,
    close: async () => {
      demo.close();
      server.close();
      server.closeAllConnections();
      await once(server, "close");
    },
  };
}

test("sample guests use separate databases, only synthetic inputs, and cannot reach owner, AI or wallet APIs", async () => {
  const app = await setup();
  try {
    const a = await app.client(),
      b = await app.client();
    const created = await a.request("/jobs", {
      caseId: "normal",
      budget: "5.00",
    });
    assert.equal(created.status, 201);
    const job = await created.json();
    assert.equal(job.uploads.length, 30);
    assert.equal(job.mandate.processing.engine, "local");
    assert.equal((await (await b.request("/state")).json()).jobs.length, 0);
    assert.equal((await b.request(`/jobs/${job.id}/review`)).status, 400);
    assert.equal(
      (
        await fetch(app.origin + "/api/state", {
          headers: { cookie: a.cookie },
        })
      ).status,
      401,
    );
    for (const path of [
      "/near",
      "/near/intents",
      "/near/sources",
      "/auth/login",
      "/settings",
    ])
      assert.equal((await a.request(path, {})).status, 404);
    assert.equal(
      (
        await a.request("/jobs", {
          caseId: "normal",
          budget: "5.00",
          processing: "near_ai",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await a.request("/jobs", {
          caseId: "normal",
          budget: "5.00",
          uploads: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await a.request(
          "/jobs",
          { caseId: "normal", budget: "5.00" },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await a.request(
          "/jobs",
          { caseId: "normal", budget: "5.00" },
          { "X-Styx-CSRF": "0".repeat(64) },
        )
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
});

test("sample acceptance records one simulated payment; rejection and failed checks cannot pay", async () => {
  const app = await setup();
  try {
    const a = await app.client();
    async function delivered(caseId: string) {
      let job = await (
        await a.request("/jobs", { caseId, budget: "5.00" })
      ).json();
      job = await (
        await a.request(`/jobs/${job.id}/approve`, {
          version: job.mandate.version,
          hash: job.mandate.hash,
        })
      ).json();
      assert.equal(job.state, "quoted");
      job = await (
        await a.request(`/jobs/${job.id}/reserve`, {
          quoteId: job.quotes[0].id,
        })
      ).json();
      return job;
    }
    const first = await delivered("normal");
    assert.equal(first.state, "ready_for_review");
    const paid = await (await a.request(`/jobs/${first.id}/settle`, {})).json();
    assert.equal(paid.state, "settled");
    assert.equal(paid.receipt.paid, 320);
    const beforeRetry = await (await a.request("/state")).json();
    const repeated = await (
      await a.request(`/jobs/${first.id}/settle`, {})
    ).json();
    assert.deepEqual(repeated.receipt, paid.receipt);
    const afterRetry = await (await a.request("/state")).json();
    assert.deepEqual(afterRetry.balance, beforeRetry.balance);
    const csv = await (await a.request(`/jobs/${first.id}/artifact`)).text();
    assert.match(csv, /invoice_id/);
    const review = await (await a.request(`/jobs/${first.id}/review`)).json();
    assert.equal(review.rows.length, 30);
    const rejected = await delivered("normal");
    const cancelled = await (
      await a.request(`/jobs/${rejected.id}/cancel`, {})
    ).json();
    assert.equal(cancelled.state, "refunded");
    assert.equal(cancelled.receipt, undefined);
    const invalid = await delivered("arithmetic");
    assert.equal(invalid.state, "failed");
    assert.equal(
      (await a.request(`/jobs/${invalid.id}/settle`, {})).status,
      400,
    );
  } finally {
    await app.close();
  }
});

test("sample sessions expire and have bounded capacity, jobs and spending", async () => {
  let clock = Date.now();
  const app = await setup({ now: () => clock, ttlMs: 1000, capacity: 1 });
  try {
    const a = await app.client();
    assert.equal(
      (await fetch(app.origin + "/api/sample-demo/session")).status,
      429,
    );
    assert.equal(
      (await a.request("/jobs", { caseId: "normal", budget: "99.00" })).status,
      400,
    );
    for (let n = 0; n < 5; n++)
      assert.equal(
        (await a.request("/jobs", { caseId: "normal", budget: "5.00" })).status,
        201,
      );
    assert.equal(
      (await a.request("/jobs", { caseId: "normal", budget: "5.00" })).status,
      429,
    );
    clock += 1001;
    assert.equal((await a.request("/state")).status, 401);
    const fresh = await app.client();
    assert.equal((await (await fresh.request("/state")).json()).jobs.length, 0);
  } finally {
    await app.close();
  }
});
