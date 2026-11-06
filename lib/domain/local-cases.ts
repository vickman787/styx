import type { Scenario } from "./types.ts";

export const localCases: {
  id: Scenario;
  title: string;
  description: string;
  expected: string;
  next: string;
}[] = [
  {
    id: "normal",
    title: "Successful delivery",
    description: "Process all 30 sample invoices and inspect the actual CSV.",
    expected:
      "Verification passes with duplicate and uncertain-field flags. Payment waits for your acceptance.",
    next: "Download the CSV, review all invoices, then accept delivery to see a receipt.",
  },
  {
    id: "slow",
    title: "Slow provider",
    description: "Watch a provider take longer to return its delivery.",
    expected:
      "Processing remains visible for about three seconds, then verified delivery appears.",
    next: "Leave the job and return while it runs; confirm that the delivery is preserved.",
  },
  {
    id: "timeout",
    title: "Provider timeout",
    description: "The provider fails before returning a delivery.",
    expected:
      "The job needs attention. Funds remain reserved; no payment is recorded.",
    next: "Request correction for a normal retry, or cancel to release the reservation.",
  },
  {
    id: "malformed",
    title: "Invalid CSV fields",
    description: "The provider returns an empty invoice identifier.",
    expected: "Independent verification fails and payment is unavailable.",
    next: "Inspect the failed check, then request correction or cancel.",
  },
  {
    id: "missing_coverage",
    title: "Missing invoice",
    description: "One source invoice is omitted from the delivered CSV.",
    expected:
      "Coverage verification fails. The original source remains available for comparison.",
    next: "Open the full delivery review and inspect the missing-input evidence.",
  },
  {
    id: "arithmetic",
    title: "Changed amount",
    description: "A provider changes one invoice total to 999.99.",
    expected:
      "Source/arithmetic checks reject the delivery. The changed amount cannot be paid.",
    next: "Compare the delivered row with its original source, then request correction.",
  },
  {
    id: "changed_recipient",
    title: "Changed payment recipient",
    description:
      "The selected provider attempts to use an unapproved recipient.",
    expected:
      "Payment is blocked and the approved/attempted recipients are shown. No payment occurs.",
    next: "Inspect the security evidence, then cancel the job to release its reservation.",
  },
  {
    id: "payout_failure",
    title: "Payout failure",
    description:
      "Delivery verifies, but the local payout fails when you accept it.",
    expected:
      "A failed payout stays a failure, with the reservation held and no successful receipt.",
    next: "Try owner acceptance, inspect the failure, then cancel to release funds.",
  },
];
