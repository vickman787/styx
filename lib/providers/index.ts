import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import type { Invoice, Job, Quote, Upload } from "../domain/types.ts";
import { ASSET } from "../domain/types.ts";
import { hash, id, insist, cents } from "../domain/policy.ts";
export const invoiceSchema = z
  .object({
    invoice_id: z.string().min(1).max(100),
    vendor: z.string().max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    subtotal: z.string(),
    tax: z.string(),
    total: z.string(),
    notes: z.string().max(4000).optional(),
  })
  .strict();
export const columns = [
  "source_id",
  "invoice_id",
  "vendor",
  "date",
  "currency",
  "subtotal",
  "tax",
  "total",
];
export function parseUpload(u: Upload): Invoice[] {
  let data: any;
  try {
    data = u.name.toLowerCase().endsWith(".json")
      ? JSON.parse(u.content)
      : parse(u.content, { columns: true, skip_empty_lines: true, bom: true });
  } catch {
    throw new Error(
      `${u.name}: malformed JSON or CSV. Use the fixture schema.`,
    );
  }
  const list = Array.isArray(data) ? data : [data];
  insist(
    list.length > 0 && list.length <= 1000,
    `${u.name}: must contain 1–1000 invoices.`,
  );
  return list.map((raw: any) => {
    const result = invoiceSchema.safeParse(raw);
    insist(
      result.success,
      `${u.name}: required invoice fields are missing or invalid (invoice_id, vendor, date, currency, subtotal, tax, total).`,
    );
    const row = result.data;
    [row.subtotal, row.tax, row.total].forEach(cents);
    return { ...row, source_id: u.id };
  });
}
export interface ProviderAdapter {
  id: string;
  name: string;
  recipient: string;
  price: number;
  seconds: number;
  quote(j: Job): Quote;
  start(j: Job): Promise<Invoice[]>;
  status(j: Job): string;
  fetchDelivery(rows: Invoice[]): string;
  requestCorrection(j: Job): Promise<Invoice[]>;
}
function adapter(
  provider: string,
  name: string,
  price: number,
  seconds: number,
): ProviderAdapter {
  return {
    id: provider,
    name,
    recipient: `${provider}.demo`,
    price,
    seconds,
    quote(j) {
      return {
        id: id(),
        provider,
        recipient: this.recipient,
        price,
        seconds,
        asset: ASSET,
        mandateHash: j.mandate.hash,
        expires: Date.now() + 15 * 60 * 1000,
      };
    },
    async start(j) {
      await new Promise((r) =>
        setTimeout(r, j.scenario === "slow" ? 3000 : 30),
      );
      if (j.scenario === "timeout")
        throw Error(
          "Provider timed out. Request correction to retry, or cancel and release the reservation.",
        );
      let rows = j.uploads.flatMap(parseUpload);
      if (j.scenario === "missing_coverage") rows = rows.slice(1);
      if (j.scenario === "arithmetic")
        rows[0] = { ...rows[0], total: "999.99" };
      if (j.scenario === "malformed") rows[0] = { ...rows[0], invoice_id: "" };
      return rows;
    },
    status: (j) => j.state,
    fetchDelivery: (rows) =>
      stringify(
        rows.map((r) =>
          Object.fromEntries(
            columns.map((c) => [c, r[c as keyof Invoice] ?? ""]),
          ),
        ),
        { header: true, columns, escape_formulas: true },
      ),
    requestCorrection(j) {
      return this.start(j);
    },
  };
}
export const providers = [
  adapter("ledgerworks", "LedgerWorks", 320, 4),
  adapter("parselab", "ParseLab", 410, 6),
];
export function manifest(uploads: Upload[]) {
  return hash(uploads.map((u) => ({ id: u.id, hash: hash(u.content) })));
}
