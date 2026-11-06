import { createPortal } from "react-dom";
import {
  formatNear,
  type NearExecution,
  type NearIntent,
} from "../lib/settlement/near-types";

export default function NearReceipt({
  job,
  intents,
}: {
  job: NearExecution;
  intents: NearIntent[];
}) {
  const receipt = job.receipt;
  if (job.state !== "Paid" || !receipt) return null;
  const approved = intents.find(
    (i) =>
      i.executionId === job.id &&
      i.action === "approve" &&
      i.state === "confirmed",
  );
  const rows = [
    ["Job", job.name],
    ["Agreement / receipt reference", job.id],
    ["Owner", job.owner],
    ["Provider", job.provider],
    ["Paid recipient", receipt.recipient],
    ["Network / asset", "NEAR testnet / native NEAR"],
    ["Approved cap", `${formatNear(job.mandate.cap)} NEAR`],
    ["Reserved quote", `${formatNear(job.quote.amount)} NEAR`],
    ["Paid", `${formatNear(receipt.paid)} NEAR`],
    [
      "Unused allocation (cap minus quote)",
      `${formatNear((BigInt(job.mandate.cap) - BigInt(job.quote.amount)).toString())} NEAR`,
    ],
    ["Approval mode", "Owner-confirmed payment"],
    [
      "Approval reconciled",
      approved?.confirmedAt
        ? new Date(approved.confirmedAt).toLocaleString()
        : "Not available in saved request history",
    ],
    ["Payment finality reconciled", new Date(receipt.at).toLocaleString()],
    ["Verifier", job.mandate.verifier],
    ["Acceptance check version", job.mandate.checks_version],
    ["Verification report hash", job.reportHash],
    ["Delivered artifact hash", receipt.artifactHash],
    ["Contract domain", receipt.domain],
    ["Transaction", receipt.txHash],
  ];
  const details = (
    <>
      <img
        className="near-receipt-logo"
        src="/brand/styx-original.png"
        alt="STYX"
      />
      <h2>STYX · NEAR testnet payment receipt</h2>
      <p>Confirmed payment for {job.name}</p>
      <dl className="definition">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>
        Unused allocation is a budget difference, not a separate refund
        transfer. Testnet NEAR has no stated cash value. Network gas and AI API
        charges are separate from this payment.
      </p>
      <p>
        Verification checks source consistency and the configured acceptance
        rules; it does not establish invoice authenticity.
      </p>
      <a
        href={`https://testnet.nearblocks.io/txns/${receipt.txHash}`}
        target="_blank"
        rel="noreferrer"
      >
        View confirmed transaction
      </a>
    </>
  );
  return (
    <>
      <details className="near-receipt-details">
        <summary>Full payment receipt</summary>
        {details}
      </details>
      <div className="near-buttons top-space">
        <a
          className="button secondary"
          href={`/api/jobs/${encodeURIComponent(job.jobId)}/artifact`}
        >
          Download invoice CSV
        </a>
        <button className="button secondary" onClick={() => window.print()}>
          Print / save receipt PDF
        </button>
      </div>
      {createPortal(
        <article className="near-print-receipt">{details}</article>,
        document.body,
      )}
    </>
  );
}
