export const ASSET = "local:demo-units:2";
export const VERIFIER = "styx-server-verifier/v1";
export const CHECK_VERSION = "invoice-checks/v1";
export type State =
  | "draft"
  | "awaiting_approval"
  | "quoting"
  | "quoted"
  | "reserved"
  | "running"
  | "delivered"
  | "verifying"
  | "ready_for_review"
  | "settlement_pending"
  | "settled"
  | "correction_requested"
  | "blocked"
  | "failed"
  | "expired"
  | "cancelled"
  | "refund_pending"
  | "refunded";
export type Scenario =
  | "normal"
  | "slow"
  | "timeout"
  | "malformed"
  | "missing_coverage"
  | "arithmetic"
  | "changed_recipient"
  | "payout_failure";
export interface Upload {
  id: string;
  name: string;
  size: number;
  hash: string;
  content: string;
}
export interface Invoice {
  source_id: string;
  invoice_id: string;
  vendor: string;
  date: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  notes?: string;
}
export interface Mandate {
  processing?: Processing;
  version: number;
  hash: string;
  jobId: string;
  cap: number;
  asset: string;
  network: string;
  expires: number;
  providers: string[];
  recipients: Record<string, string>;
  verifier: string;
  checks: string;
  approvalMode: "owner";
  inputHash: string;
  scopeHash: string;
  approvedAt?: number;
}
export type Processing =
  | { engine: "local" }
  | {
      engine: "near_ai";
      model: string;
      consent: true;
      endpoint: "https://cloud-api.near.ai/v1/chat/completions";
    };
export interface Quote {
  id: string;
  provider: string;
  recipient: string;
  price: number;
  asset: string;
  mandateHash: string;
  expires: number;
  seconds: number;
}
export interface Check {
  name: string;
  pass: boolean;
  detail: string;
}
export interface Report {
  jobId: string;
  mandateHash: string;
  artifactHash: string;
  inputHash: string;
  checksVersion: string;
  verifier: string;
  expires: number;
  domain: string;
  pass: boolean;
  checks: Check[];
  duplicates: string[];
  uncertain: string[];
  totals: Record<string, number>;
  hash: string;
}
export interface Job {
  sourceVersionOf?: string;
  sourceOnly?: boolean;
  localTestCase?: Scenario;
  workspaceId?: string;
  id: string;
  name: string;
  instructions: string;
  cap: number;
  deadline: number;
  allowedProviders: string[];
  requirements: string;
  state: State;
  createdAt: number;
  updatedAt: number;
  uploads: Upload[];
  mandate: Mandate;
  quotes: Quote[];
  selected?: Quote;
  artifact?: {
    id: string;
    hash: string;
    csv: string;
    rows: Invoice[];
    execution?: { engine: "local" | "near_ai"; model?: string; at: number };
  };
  report?: Report;
  receipt?: { id: string; paid: number; approvedAt: number; settledAt: number };
  error?: string;
  blocked?: {
    approved: string;
    attempted: string;
    amount: number;
    at: number;
    reason: string;
  };
  scenario: Scenario;
  transitions: { state: State; at: number }[];
}
export const labels: Record<State, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  quoting: "Getting quotes",
  quoted: "Quotes ready",
  reserved: "Funds reserved",
  running: "Processing",
  delivered: "Delivered",
  verifying: "Verifying",
  ready_for_review: "Ready for review",
  settlement_pending: "Payment pending",
  settled: "Settled",
  correction_requested: "Correction requested",
  blocked: "Payment blocked",
  failed: "Needs attention",
  expired: "Expired",
  cancelled: "Cancelled",
  refund_pending: "Refund pending",
  refunded: "Reservation refunded",
};
export const money = (n: number) => (n / 100).toFixed(2);
