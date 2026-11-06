export const NEAR_ASSET = "near:testnet:native:24";
export const NEAR_VERSION = "styx-escrow/2";
export const accountPattern =
  /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet|[a-f0-9]{64})$/;
export type NearAction =
  | "fund"
  | "withdraw"
  | "approve"
  | "reserve"
  | "deliver"
  | "attest"
  | "release"
  | "refund";
export interface NearTransaction {
  signerId: string;
  receiverId: string;
  actions: {
    type: "FunctionCall";
    params: {
      methodName: NearAction;
      args: Record<string, unknown>;
      gas: string;
      deposit: string;
    };
  }[];
}
export interface NearMandate {
  owner: string;
  owner_key: string;
  agent: string;
  agent_key: string;
  verifier: string;
  verifier_key: string;
  recipients: string[];
  cap: string;
  expires: number;
  mandate_hash: string;
  input_hash: string;
  checks_version: string;
  asset: string;
  domain: string;
}
export interface NearQuote {
  id: string;
  recipient: string;
  amount: string;
  expires: number;
  mandate_hash: string;
  asset: string;
}
export interface NearExecution {
  id: string;
  jobId: string;
  name: string;
  owner: string;
  ownerKey: string;
  provider: string;
  mandate: NearMandate;
  quote: NearQuote;
  artifactHash: string;
  reportHash: string;
  state:
    | "Planned"
    | "Approved"
    | "Reserved"
    | "PaymentPending"
    | "Paid"
    | "Refunded";
  delivered?: boolean;
  attested?: boolean;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
  receipt?: {
    txHash: string;
    at: number;
    paid: string;
    recipient: string;
    artifactHash: string;
    domain: string;
  };
}
export interface NearIntent {
  agreementExpires?: number;
  ownerKey?: string;
  codeHash: string;
  id: string;
  executionId?: string;
  action: NearAction;
  transaction: NearTransaction;
  state: "prepared" | "submitted" | "confirmed" | "failed";
  createdAt: number;
  expires: number;
  txHash?: string;
  error?: string;
  confirmedAt?: number;
}
export function parseNear(value: string): string {
  if (!/^\d{1,12}(?:\.\d{1,24})?$/.test(value))
    throw Error(
      "Enter NEAR as a nonnegative decimal with at most 24 decimal places.",
    );
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** 24n +
    BigInt(fraction.padEnd(24, "0"))
  ).toString();
}
export function formatNear(value: string): string {
  const n = BigInt(value);
  const whole = n / 10n ** 24n;
  const fraction = (n % 10n ** 24n)
    .toString()
    .padStart(24, "0")
    .replace(/0+$/, "");
  return `${whole}${fraction ? "." + fraction : ""}`;
}
