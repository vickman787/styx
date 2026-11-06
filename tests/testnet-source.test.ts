import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { validReport } from "../lib/verification/index.ts";
import { NearAIClient } from "../lib/providers/model.ts";
import { hash } from "../lib/domain/policy.ts";
const input = {
  name: "Owner uploaded invoices",
  uploads: [
    {
      name: "invoice.json",
      content: JSON.stringify({
        invoice_id: "OWN-1",
        vendor: "Owner supplied vendor",
        date: "2026-10-27",
        currency: "USD",
        subtotal: "20.00",
        tax: "2.00",
        total: "22.00",
      }),
    },
  ],
};
test("testnet invoice preparation verifies owner files without demo quotes, reservations or settlement", async () => {
  const store = new Store(":memory:"),
    service = new Service(store);
  const before = store.balance();
  const job = await service.prepareTestnetSource(input);
  assert.equal(job.sourceOnly, true);
  assert.equal(job.state, "ready_for_review");
  assert.equal(validReport(job), true);
  assert.equal(job.artifact?.rows[0].invoice_id, "OWN-1");
  assert.deepEqual(job.quotes, []);
  assert.equal(job.selected, undefined);
  assert.deepEqual(store.balance(), before);
  assert.throws(
    () => service.settle(job.id),
    /separate NEAR testnet agreement/,
  );
  service.correct(job.id);
  await service.process(job.id);
  assert.equal(validReport(store.get(job.id)), true);
  service.cancel(job.id);
  assert.deepEqual(store.balance(), before);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM reservation").get()!.n,
    0,
  );
  store.close();
});

test("saved evidence re-check rejects tampering and expired mandates", async () => {
  for (const mode of ["csv", "source", "report", "deadline"]) {
    const store = new Store(":memory:");
    const service = new Service(store);
    const job = await service.prepareTestnetSource(input);
    if (mode === "csv") job.artifact!.csv += "changed";
    if (mode === "source") job.uploads[0].content += " ";
    if (mode === "report") job.report!.hash = "changed";
    if (mode === "deadline") job.mandate.expires = Date.now() - 1000;
    store.save(job);
    const before = structuredClone(store.get(job.id));
    assert.throws(
      () => service.reverify(job.id),
      /changed|failed|expired|bound/,
    );
    assert.deepEqual(store.get(job.id), before);
    assert.equal(
      store.db
        .prepare("SELECT COUNT(*) AS n FROM verification_report WHERE job_id=?")
        .get(job.id)!.n,
      1,
    );
    store.close();
  }
});

test("testnet AI intake requires consent and configuration before creating a job or calling the model", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  const transport = async () => {
    calls++;
    throw Error("No call permitted");
  };
  const enabled = new Service(
    store,
    new NearAIClient(
      {
        NEAR_AI_ENABLED: "true",
        NEAR_AI_API_KEY: "synthetic-key",
        NEAR_AI_MODEL: "synthetic/model",
      },
      transport,
    ),
  );
  await assert.rejects(
    () => enabled.prepareTestnetSource({ ...input, processing: "near_ai" }),
    /Approve external/,
  );
  const disabled = new Service(store, new NearAIClient({}, transport));
  await assert.rejects(
    () =>
      disabled.prepareTestnetSource({
        ...input,
        processing: "near_ai",
        externalConsent: true,
      }),
    /unavailable/,
  );
  assert.equal(calls, 0);
  assert.equal(store.jobs().length, 0);
  store.close();
});

test("re-checking agreement-bound evidence creates a fresh version and preserves old bindings", async () => {
  const store = new Store(":memory:");
  const service = new Service(store);
  const job = await service.prepareTestnetSource(input);
  const { hash: _oldHash, ...expired } = job.report!;
  expired.expires = Date.now() - 1000;
  job.report = { ...expired, hash: hash(expired) };
  store.save(job);
  store.db
    .prepare("INSERT INTO near_execution VALUES(?,?,?,?)")
    .run("bound", store.workspace, job.id, "{}");
  const before = structuredClone(store.get(job.id));
  const balance = store.balance();
  const refreshed = service.reverify(job.id);
  assert.notEqual(refreshed.id, job.id);
  assert.equal(refreshed.sourceVersionOf, job.id);
  assert.equal(validReport(refreshed), true);
  assert.equal(refreshed.mandate.jobId, refreshed.id);
  assert.equal(refreshed.mandate.expires, before.mandate.expires);
  assert.equal(refreshed.artifact!.hash, before.artifact!.hash);
  assert.deepEqual(refreshed.uploads, before.uploads);
  assert.deepEqual(store.get(job.id), before);
  assert.deepEqual(store.balance(), balance);
  assert.equal(
    store.db
      .prepare("SELECT payload FROM near_execution WHERE id='bound'")
      .get()!.payload,
    "{}",
  );
  store.close();
});

test("testnet AI extraction records owner approval before the request, verifies output and cannot charge the demo ledger", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  const settings = {
    NEAR_AI_ENABLED: "true",
    NEAR_AI_API_KEY: "synthetic-key",
    NEAR_AI_MODEL: "synthetic/model",
  };
  const service = new Service(
    store,
    new NearAIClient(settings, async (_url, init) => {
      calls++;
      const job = store.jobs()[0];
      assert.ok(job.mandate.approvedAt);
      assert.equal(job.sourceOnly, true);
      assert.equal(
        job.mandate.processing?.engine === "near_ai" &&
          job.mandate.processing.consent,
        true,
      );
      const approval = store.db
        .prepare("SELECT payload FROM approval WHERE job_id=?")
        .get(job.id);
      assert.equal(
        JSON.parse(String(approval!.payload)).principal,
        "owner-test",
      );
      const body = JSON.parse(String(init!.body));
      assert.equal(body.model, settings.NEAR_AI_MODEL);
      assert.deepEqual(body.response_format, { type: "json_object" });
      const rows = JSON.parse(body.messages[1].content).map(
        ({ notes: _notes, ...row }: any) => row,
      );
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify({ invoices: rows }) },
            },
          ],
        }),
      );
    }),
  );
  const before = store.balance();
  const job = await service.prepareTestnetSource(
    { ...input, processing: "near_ai", externalConsent: true },
    "owner-test",
  );
  assert.equal(calls, 1);
  assert.equal(validReport(job), true);
  assert.equal(job.artifact!.execution?.engine, "near_ai");
  assert.equal(job.artifact!.execution?.model, settings.NEAR_AI_MODEL);
  assert.deepEqual(store.balance(), before);
  const artifactBefore = structuredClone(job.artifact);
  const mandateBefore = structuredClone(job.mandate);
  const { hash: _oldHash, ...expired } = job.report!;
  expired.expires = Date.now() - 1000;
  job.report = { ...expired, hash: hash(expired) };
  store.save(job);
  const refreshed = service.reverify(job.id, "owner-test");
  assert.equal(validReport(refreshed), true);
  assert.equal(calls, 1, "re-check never calls the AI provider again");
  assert.deepEqual(refreshed.artifact, artifactBefore);
  assert.deepEqual(refreshed.mandate, mandateBefore);
  assert.deepEqual(store.balance(), before);
  assert.equal(
    store.db
      .prepare("SELECT COUNT(*) AS n FROM verification_report WHERE job_id=?")
      .get(job.id)!.n,
    2,
  );
  assert.equal(job.selected, undefined);
  assert.throws(() => service.settle(job.id), /separate NEAR/);
  settings.NEAR_AI_MODEL = "changed/model";
  service.correct(job.id);
  const failed = await service.process(job.id);
  assert.equal(failed.state, "failed");
  assert.equal(calls, 1);
  assert.equal(failed.artifact, undefined);
  assert.deepEqual(store.balance(), before);
  store.close();
});

test("hallucinated AI amounts fail independent testnet evidence checks; upstream failures never silently fall back or retry", async () => {
  for (const mode of ["hallucination", "timeout"]) {
    const store = new Store(":memory:");
    let calls = 0;
    const service = new Service(
      store,
      new NearAIClient(
        {
          NEAR_AI_ENABLED: "true",
          NEAR_AI_API_KEY: "synthetic-key",
          NEAR_AI_MODEL: "synthetic/model",
        },
        async (_url, init) => {
          calls++;
          if (mode === "timeout") throw Error("synthetic timeout");
          const body = JSON.parse(String(init!.body));
          const rows = JSON.parse(body.messages[1].content);
          rows[0].total = "999.99";
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: JSON.stringify(rows) },
                },
              ],
            }),
          );
        },
      ),
    );
    const before = store.balance();
    const job = await service.prepareTestnetSource({
      ...input,
      processing: "near_ai",
      externalConsent: true,
    });
    assert.equal(job.state, "failed");
    assert.equal(validReport(job), false);
    assert.equal(calls, 1);
    if (mode === "timeout") assert.equal(job.artifact, undefined);
    await service.process(job.id);
    assert.equal(calls, 1);
    assert.deepEqual(store.balance(), before);
    service.cancel(job.id);
    store.close();
  }
});
test("testnet source intake rejects scenario injection and malformed invoices before creating a job", async () => {
  const store = new Store(":memory:"),
    service = new Service(store);
  await assert.rejects(() =>
    service.prepareTestnetSource({ ...input, scenario: "normal" }),
  );
  await assert.rejects(() =>
    service.prepareTestnetSource({
      ...input,
      uploads: [{ name: "bad.json", content: "{}" }],
    }),
  );
  assert.equal(store.jobs().length, 0);
  store.close();
});
