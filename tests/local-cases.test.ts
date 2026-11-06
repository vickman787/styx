import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { localCases } from "../lib/domain/local-cases.ts";
import { NearAIClient } from "../lib/providers/model.ts";

test("all local cases create real sample jobs without approval, reservations, payment or external calls", () => {
  const store = new Store(":memory:");
  let external = 0;
  const service = new Service(
    store,
    new NearAIClient(
      {
        NEAR_AI_ENABLED: "true",
        NEAR_AI_API_KEY: "synthetic",
        NEAR_AI_MODEL: "synthetic",
      },
      async () => {
        external++;
        throw Error("No external call allowed");
      },
    ),
  );
  try {
    const before = store.balance();
    for (const item of localCases) {
      const job = service.createLocalTest(item.id);
      assert.equal(job.localTestCase, item.id);
      assert.equal(job.scenario, item.id);
      assert.equal(job.state, "awaiting_approval");
      assert.equal(job.uploads.length, 30);
      assert.equal(job.cap, 500);
      assert.equal(job.mandate.processing?.engine, "local");
      assert.equal(job.mandate.approvedAt, undefined);
      assert.equal(job.selected, undefined);
      assert.equal(job.receipt, undefined);
      assert.ok(
        job.uploads.every((upload) => upload.content.includes("invoice_id")),
      );
      assert.equal(store.get(job.id).localTestCase, item.id);
    }
    assert.deepEqual(store.balance(), before);
    assert.equal(external, 0);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM reservation").get()!.n,
      0,
    );
  } finally {
    store.close();
  }
});

test("sample failure cases use the real verifier/security/payout paths and correction preserves test provenance", async () => {
  const store = new Store(":memory:"),
    service = new Service(store);
  try {
    for (const item of localCases.filter((item) => item.id !== "slow")) {
      let job = service.createLocalTest(item.id);
      job = service.approve(job.id, job.mandate.version, job.mandate.hash);
      service.reserve(job.id, job.quotes[0].id);
      job = await service.process(job.id);
      if (item.id === "changed_recipient") {
        assert.equal(job.state, "blocked");
        assert.ok(job.blocked);
      } else if (["normal", "payout_failure"].includes(item.id)) {
        assert.equal(job.state, "ready_for_review");
        assert.equal(job.report?.pass, true);
        job = service.settle(job.id);
        assert.equal(
          job.state,
          item.id === "normal" ? "settled" : "ready_for_review",
        );
        assert.equal(Boolean(job.receipt), item.id === "normal");
      } else {
        assert.equal(job.state, "failed");
        if (item.id !== "timeout") assert.equal(job.report?.pass, false);
        assert.equal(job.receipt, undefined);
        service.correct(job.id);
        job = await service.process(job.id);
        assert.equal(job.state, "ready_for_review");
        assert.equal(job.scenario, "normal");
        assert.equal(job.localTestCase, item.id);
      }
      if (job.state !== "settled") service.cancel(job.id);
    }
    assert.equal(store.balance().reserved, 0);
    assert.equal(store.balance().spent, 320);
  } finally {
    store.close();
  }
});

test("unknown case IDs cannot read arbitrary files or create jobs, and case histories stay workspace-scoped", () => {
  const store = new Store(":memory:"),
    service = new Service(store);
  try {
    for (const id of ["unknown", "../secrets", "", "near_ai"])
      assert.throws(
        () => service.createLocalTest(id),
        /Unknown local test case/,
      );
    assert.equal(store.jobs().length, 0);
    store.db
      .prepare("INSERT INTO workspace VALUES(?,?,?)")
      .run("another", "Another", "owner");
    const other = store.forWorkspace("another"),
      job = new Service(other).createLocalTest("normal");
    assert.equal(store.jobs().length, 0);
    assert.equal(other.jobs().length, 1);
    assert.throws(() => store.get(job.id));
  } finally {
    store.close();
  }
});
