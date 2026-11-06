import { createHash, randomUUID } from "node:crypto";
import type { Job, State, Quote } from "./types.ts";
import { ASSET, VERIFIER } from "./types.ts";
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export const id = () => randomUUID();
export function insist(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function cents(s: string): number {
  insist(
    /^\d{1,9}(\.\d{1,2})?$/.test(s),
    "Amount must be nonnegative with at most two decimals.",
  );
  const [a, b = ""] = s.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
export function assertRecipient(j: Job, q: Quote) {
  insist(
    j.mandate.providers.includes(q.provider) &&
      q.recipient === j.mandate.recipients[q.provider],
    "Recipient must match the owner-approved mandate and accepted quote.",
  );
}
const next: Partial<Record<State, State[]>> = {
  draft: ["awaiting_approval", "cancelled"],
  awaiting_approval: ["quoting", "cancelled", "expired"],
  quoting: ["quoted", "failed"],
  quoted: [
    "running",
    "reserved",
    "blocked",
    "expired",
    "cancelled",
    "awaiting_approval",
  ],
  reserved: ["running", "refund_pending", "blocked"],
  running: ["delivered", "failed", "blocked"],
  delivered: ["verifying", "correction_requested"],
  verifying: ["ready_for_review", "failed", "correction_requested"],
  ready_for_review: [
    "cancelled",
    "settlement_pending",
    "correction_requested",
    "blocked",
    "refund_pending",
  ],
  settlement_pending: ["settled", "ready_for_review"],
  failed: [
    "correction_requested",
    "refund_pending",
    "awaiting_approval",
    "cancelled",
  ],
  blocked: ["refund_pending", "awaiting_approval", "cancelled"],
  correction_requested: ["running", "refund_pending"],
  refund_pending: ["refunded"],
};
export function transition(j: Job, state: State) {
  insist(
    next[j.state]?.includes(state),
    `Cannot move from ${j.state} to ${state}.`,
  );
  j.state = state;
  j.updatedAt = Date.now();
  j.transitions.push({ state, at: j.updatedAt });
}
export function assertQuote(
  j: Job,
  q: Quote,
  available: number,
  now = Date.now(),
) {
  insist(
    j.state === "quoted",
    "Job must have an approved mandate and current quotes.",
  );
  insist(j.mandate.approvedAt, "Owner approval is required.");
  insist(
    j.mandate.expires > now,
    "Mandate expired. Review and reapprove new rules.",
  );
  insist(q.expires > now, "Quote expired. Refresh provider quotes.");
  insist(
    q.mandateHash === j.mandate.hash,
    "Quote refers to a different mandate version.",
  );
  insist(
    q.asset === ASSET && j.mandate.asset === ASSET,
    "Asset or network mismatch.",
  );
  insist(j.mandate.providers.includes(q.provider), "Provider not allowed.");
  assertRecipient(j, q);
  insist(
    q.price > 0 && q.price <= j.mandate.cap,
    "Quote exceeds the approved budget.",
  );
  insist(
    q.price <= available,
    "Insufficient available funds. Cancel another reservation or use a smaller job.",
  );
  insist(j.mandate.verifier === VERIFIER, "Unrecognized verifier.");
}
