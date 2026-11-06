import { parse } from "csv-parse/sync";
import type { Invoice, Job, Report } from "../domain/types.ts";
import { CHECK_VERSION, VERIFIER } from "../domain/types.ts";
import { hash, cents } from "../domain/policy.ts";
import { columns, manifest, parseUpload } from "../providers/index.ts";
export function verify(j: Job): Report {
  const artifact = j.artifact!;
  let rows: Invoice[] = [];
  let schema = true;
  try {
    const parsed = parse(artifact.csv, {
      columns: true,
      skip_empty_lines: true,
    }) as Invoice[];
    schema =
      parsed.length > 0 &&
      Object.keys(parsed[0]).join(",") === columns.join(",");
    rows = parsed;
    schema =
      schema &&
      rows.every(
        (r) =>
          columns.every((c) => typeof r[c as keyof Invoice] === "string") &&
          !!r.invoice_id &&
          /^[A-Z]{3}$/.test(r.currency),
      );
  } catch {
    schema = false;
  }
  const inputs = j.uploads.flatMap(parseUpload);
  const expected = inputs.map((r) => `${r.source_id}:${r.invoice_id}`).sort();
  const actual = rows.map((r) => `${r.source_id}:${r.invoice_id}`).sort();
  const coverage = JSON.stringify(expected) === JSON.stringify(actual);
  let arithmetic = true;
  const totals: Record<string, number> = {};
  for (const r of rows) {
    try {
      const total = cents(r.total);
      if (Math.abs(cents(r.subtotal) + cents(r.tax) - total) > 1)
        arithmetic = false;
      const aggregate = (totals[r.currency] || 0) + total;
      if (!Number.isSafeInteger(aggregate)) arithmetic = false;
      else totals[r.currency] = aggregate;
    } catch {
      arithmetic = false;
    }
  }
  const duplicates: string[] = [];
  const seen = new Map<string, string>();
  const uncertain: string[] = [];
  for (const r of rows) {
    const vendor = String(r.vendor ?? "");
    const invoiceId = String(r.invoice_id ?? "");
    const key = `${vendor.trim().toLowerCase()}:${invoiceId.trim().toLowerCase()}:${r.currency}`;
    if (seen.has(key))
      duplicates.push(`${r.invoice_id}: ${seen.get(key)} and ${r.source_id}`);
    else seen.set(key, r.source_id);
    if (!vendor.trim())
      uncertain.push(
        `${r.invoice_id}: vendor is missing; owner review required.`,
      );
  }
  // Compare extracted fields with independently parsed originals, in addition to arithmetic.
  const canonical = (list: Invoice[]) =>
    list
      .map((r) =>
        JSON.stringify(columns.map((c) => String(r[c as keyof Invoice] ?? ""))),
      )
      .sort();
  const sourceMatch =
    JSON.stringify(canonical(rows)) === JSON.stringify(canonical(inputs));
  const checks = [
    {
      name: "CSV schema",
      pass: schema,
      detail: `${rows.length} records; ${columns.length} required columns.`,
    },
    {
      name: "Invoice coverage",
      pass: coverage,
      detail: `${rows.length} output records for ${inputs.length} input records across ${j.uploads.length} files.`,
    },
    {
      name: "Arithmetic & source match",
      pass: arithmetic && sourceMatch,
      detail:
        "Subtotal + tax = total within 0.01 per invoice; source fields compared. Totals grouped by currency.",
    },
    {
      name: "Duplicate detection",
      pass: true,
      detail: `${duplicates.length} duplicate identifier(s); vendor + invoice ID + currency. Duplicates are included and flagged.`,
    },
    {
      name: "Uncertainty flags",
      pass: true,
      detail: `${uncertain.length} uncertain field(s). Missing vendors remain blank.`,
    },
    {
      name: "Artifact & mandate binding",
      pass:
        hash(artifact.csv) === artifact.hash &&
        manifest(j.uploads) === j.mandate.inputHash,
      detail: "SHA-256 recomputed from actual output bytes and input manifest.",
    },
  ];
  const base = {
    jobId: j.id,
    mandateHash: j.mandate.hash,
    artifactHash: hash(artifact.csv),
    inputHash: manifest(j.uploads),
    checksVersion: CHECK_VERSION,
    verifier: VERIFIER,
    expires: Math.min(j.mandate.expires, Date.now() + 3600000),
    domain: `styx:local:${j.workspaceId || "acme-local"}:v1`,
    pass: checks.every((c) => c.pass),
    checks,
    duplicates,
    uncertain,
    totals,
  };
  return { ...base, hash: hash(base) };
}
export function validReport(j: Job) {
  try {
    const r = j.report;
    if (!r || !r.pass || r.expires <= Date.now() || !j.artifact) return false;
    const { hash: stored, ...base } = r;
    const recomputed = verify(j);
    return (
      stored === hash(base) &&
      r.jobId === j.id &&
      r.mandateHash === j.mandate.hash &&
      r.artifactHash === hash(j.artifact.csv) &&
      r.inputHash === manifest(j.uploads) &&
      r.verifier === VERIFIER &&
      r.checksVersion === CHECK_VERSION &&
      r.domain === `styx:local:${j.workspaceId || "acme-local"}:v1` &&
      recomputed.pass
    );
  } catch {
    return false;
  }
}
