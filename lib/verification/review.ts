import { parse } from "csv-parse/sync";
import type { Job, Invoice } from "../domain/types.ts";
import {
  reviewFields,
  type ReviewValues,
  type ReviewRow,
  type DeliveryReview,
} from "../domain/review-types.ts";
import { columns, parseUpload } from "../providers/index.ts";
import { hash, cents, insist } from "../domain/policy.ts";
import { validReport } from "./index.ts";
const values = (r: Invoice): ReviewValues =>
  Object.fromEntries(
    ["source_id", ...reviewFields].map((k) => [
      k,
      String(r[k as keyof Invoice] ?? ""),
    ]),
  ) as ReviewValues;
const pair = (r: ReviewValues) => JSON.stringify([r.source_id, r.invoice_id]);
const exact = (r: ReviewValues) =>
  JSON.stringify([r.source_id, ...reviewFields.map((k) => r[k])]);
export function deliveryReview(job: Job): DeliveryReview {
  insist(job.artifact, "This job has no delivered CSV to review.");
  const names = new Map(job.uploads.map((u) => [u.id, u.name]));
  const inputs = job.uploads.flatMap(parseUpload).map(values);
  let parsed: Invoice[] = [],
    parseError: string | null = null,
    schemaValid = false;
  try {
    insist(
      Buffer.byteLength(job.artifact.csv) <= 10 * 1024 * 1024,
      "CSV exceeds review limit.",
    );
    parsed = parse(job.artifact.csv, {
      columns: true,
      skip_empty_lines: true,
      max_record_size: 1024 * 1024,
    }) as Invoice[];
    schemaValid =
      parsed.length > 0 &&
      Object.keys(parsed[0]).join(",") === columns.join(",");
    if (!schemaValid)
      parseError =
        "The CSV headers do not match the required delivery schema. Download the bytes for inspection; this view cannot establish a valid delivery.";
  } catch {
    parseError =
      "The delivered CSV cannot be parsed safely. No rows are presented as verified.";
  }
  const queues = new Map<string, { items: number[]; offset: number }>();
  inputs.forEach((r, index) => {
    for (const key of ["pair:" + pair(r), "exact:" + exact(r)]) {
      if (!queues.has(key)) queues.set(key, { items: [], offset: 0 });
      queues.get(key)!.items.push(index);
    }
  });
  const used = new Set<number>();
  function take(key: string) {
    const q = queues.get(key);
    if (!q) return undefined;
    while (q.offset < q.items.length && used.has(q.items[q.offset])) q.offset++;
    if (q.offset === q.items.length) return undefined;
    const n = q.items[q.offset++];
    used.add(n);
    return n;
  }
  const delivered = parsed.map(values),
    groups = new Map<string, number>();
  const duplicateKey = (r: ReviewValues) =>
    JSON.stringify([
      r.vendor.trim().toLowerCase(),
      r.invoice_id.trim().toLowerCase(),
      r.currency,
    ]);
  for (const row of delivered)
    groups.set(duplicateKey(row), (groups.get(duplicateKey(row)) || 0) + 1);
  // Match all unchanged occurrences first, so a changed row cannot consume
  // another occurrence's exact original when repeated identifiers are reordered.
  const matches = delivered.map((row) => take("exact:" + exact(row)));
  const rows: ReviewRow[] = delivered.map((row, index) => {
    const inputIndex = matches[index] ?? take("pair:" + pair(row));
    const original = inputIndex === undefined ? null : inputs[inputIndex];
    const changed = original
      ? reviewFields.filter((k) => original[k] !== row[k])
      : [...reviewFields];
    const flags: ReviewRow["flags"] = [];
    if (groups.get(duplicateKey(row))! > 1) flags.push("duplicate");
    if (!row.vendor.trim()) flags.push("uncertain");
    if (!original || changed.length) flags.push("mismatch");
    try {
      if (Math.abs(cents(row.subtotal) + cents(row.tax) - cents(row.total)) > 1)
        flags.push("arithmetic");
    } catch {
      flags.push("arithmetic");
    }
    return {
      number: index + 1,
      values: row,
      sourceName: names.get(row.source_id) || "Unknown source",
      sourceKnown: names.has(row.source_id),
      original,
      changed,
      flags,
    };
  });
  return {
    jobId: job.id,
    name: job.name,
    observedAt: Date.now(),
    artifactHash: hash(job.artifact.csv),
    expectedArtifactHash: job.artifact.hash,
    artifactIntact: hash(job.artifact.csv) === job.artifact.hash,
    schemaValid,
    parseError,
    reportCurrent: validReport(job),
    report: job.report || null,
    rows,
    missing: inputs.flatMap((row, index) =>
      used.has(index)
        ? []
        : [
            {
              values: row,
              sourceName: names.get(row.source_id) || "Unknown source",
            },
          ],
    ),
  };
}
