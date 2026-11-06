import type { Report } from "./types.ts";
export const reviewFields = [
  "invoice_id",
  "vendor",
  "date",
  "currency",
  "subtotal",
  "tax",
  "total",
] as const;
export type ReviewField = (typeof reviewFields)[number];
export type ReviewValues = Record<ReviewField, string> & { source_id: string };
export type ReviewFlag = "duplicate" | "uncertain" | "mismatch" | "arithmetic";
export interface ReviewRow {
  number: number;
  values: ReviewValues;
  sourceName: string;
  sourceKnown: boolean;
  original: ReviewValues | null;
  changed: ReviewField[];
  flags: ReviewFlag[];
}
export interface DeliveryReview {
  jobId: string;
  name: string;
  observedAt: number;
  artifactHash: string;
  expectedArtifactHash: string;
  artifactIntact: boolean;
  schemaValid: boolean;
  parseError: string | null;
  reportCurrent: boolean;
  report: Report | null;
  rows: ReviewRow[];
  missing: { sourceName: string; values: ReviewValues }[];
}
