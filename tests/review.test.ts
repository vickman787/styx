import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/storage/db.ts";
import { Service } from "../lib/domain/service.ts";
import { deliveryReview } from "../lib/verification/review.ts";
import { providers } from "../lib/providers/index.ts";
import { hash } from "../lib/domain/policy.ts";
async function fixture() {
  const store = new Store(":memory:"),
    service = new Service(store);
  service.seed();
  let job = store.get("STX-1042");
  job = service.approve(job.id, 1, job.mandate.hash);
  service.reserve(job.id, job.quotes[0].id);
  job = await service.process(job.id);
  return { store, job };
}
test("all CSV records have source comparisons and flags include every member of repeated groups", async () => {
  const { store, job } = await fixture();
  const data = deliveryReview(job);
  assert.equal(data.rows.length, 30);
  assert.equal(
    data.rows.filter((r) => r.flags.includes("duplicate")).length,
    4,
  );
  assert.equal(
    data.rows.filter((r) => r.flags.includes("uncertain")).length,
    3,
  );
  assert.equal(data.missing.length, 0);
  assert.equal(
    data.rows.every((r) => r.original && r.changed.length === 0),
    true,
  );
  assert.equal(data.reportCurrent, true);
  store.close();
});
test("review uses actual CSV bytes instead of cached artifact rows", async () => {
  const { store, job } = await fixture();
  job.artifact!.rows[0].invoice_id = "FAKE-CACHED-ROW";
  const data = deliveryReview(job);
  assert.notEqual(data.rows[0].values.invoice_id, "FAKE-CACHED-ROW");
  assert.equal(data.artifactIntact, true);
  assert.equal(data.reportCurrent, true);
  store.close();
});
test("changed bytes and fields are exposed without claiming valid current evidence", async () => {
  const { store, job } = await fixture();
  job.artifact!.rows[0].total = "999.99";
  job.artifact!.csv = providers[0].fetchDelivery(job.artifact!.rows);
  const data = deliveryReview(job);
  assert.equal(data.artifactIntact, false);
  assert.equal(data.reportCurrent, false);
  assert.deepEqual(data.rows[0].changed, ["total"]);
  assert.ok(data.rows[0].flags.includes("arithmetic"));
  store.close();
});
test("missing originals and unknown source references remain explicit", async () => {
  const { store, job } = await fixture();
  job.artifact!.rows[0].source_id = "unknown-source";
  job.artifact!.csv = providers[0].fetchDelivery(job.artifact!.rows);
  const data = deliveryReview(job);
  assert.equal(data.missing.length, 1);
  assert.equal(data.rows[0].original, null);
  assert.equal(data.rows[0].sourceKnown, false);
  assert.ok(data.rows[0].flags.includes("mismatch"));
  store.close();
});
test("reordered repeated identifiers match exact occurrences before changed rows and never reuse an original", async () => {
  const { store, job } = await fixture();
  const a = {
    ...job.artifact!.rows[0],
    invoice_id: "REPEAT",
    subtotal: "10.00",
    tax: "1.00",
    total: "11.00",
  };
  const b = { ...a, subtotal: "20.00", tax: "2.00", total: "22.00" };
  job.uploads = [
    {
      ...job.uploads[0],
      content: JSON.stringify([a, b].map(({ source_id: _source, ...r }) => r)),
    },
  ];
  const altered = { ...b, subtotal: "30.00", tax: "3.00", total: "33.00" };
  job.artifact!.csv = providers[0].fetchDelivery([altered, a, a]);
  const data = deliveryReview(job);
  assert.equal(data.rows[1].changed.length, 0);
  assert.equal(data.rows[0].original!.total, "22.00");
  assert.equal(data.rows[2].original, null);
  assert.equal(data.missing.length, 0);
  store.close();
});
test("malformed CSV and expired reports do not appear currently verified", async () => {
  const { store, job } = await fixture();
  job.report!.expires = Date.now() - 1;
  const { hash: _stored, ...base } = job.report!;
  job.report!.hash = hash(base);
  assert.equal(deliveryReview(job).reportCurrent, false);
  job.artifact!.csv = 'invoice_id,vendor\n"unclosed';
  const result = deliveryReview(job);
  assert.ok(result.parseError);
  assert.equal(result.schemaValid, false);
  assert.equal(result.rows.length, 0);
  assert.equal(result.missing.length, 30);
  store.close();
});
