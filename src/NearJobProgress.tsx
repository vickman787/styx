import type { NearExecution } from "../lib/settlement/near-types";

export default function NearJobProgress({
  job,
  expired,
}: {
  job: NearExecution;
  expired: boolean;
}) {
  const stages = [
    "Approve rules",
    "Reserve funds",
    "Confirm delivery",
    "Verify delivery",
    "Accept & pay",
  ];
  const completed =
    job.state === "Paid"
      ? 5
      : job.state === "PaymentPending"
        ? 4
        : job.attested
          ? 4
          : job.delivered
            ? 3
            : job.state === "Reserved"
              ? 2
              : job.state === "Approved"
                ? 1
                : 0;
  const next =
    job.state === "Paid"
      ? "Payment confirmed. Review or save your receipt below."
      : job.state === "Refunded"
        ? "Reservation released. No provider payment is recorded for this agreement."
        : job.state === "PaymentPending"
          ? "Payment is pending. Refresh chain state to check the result before taking another action."
          : expired
            ? job.state === "Reserved"
              ? "This agreement expired. Review release of the reservation before preparing another agreement."
              : "This proposal expired. Use Prepare fresh agreement below, then review the new rules."
            : [
                "Next: review owner approval, then approve the spending rules in your wallet.",
                "Next: review agent reservation to set aside the quoted amount in escrow.",
                "Next: review provider delivery to record the invoice output on the agreement.",
                "Next: review verifier attestation to bind the checked output to this agreement.",
                "Next: inspect the source delivery, then accept and release payment in your wallet if satisfied.",
              ][completed];
  return (
    <section className="near-job-progress" aria-label="Job progress">
      <ol>
        {stages.map((stage, i) => (
          <li
            key={stage}
            aria-current={
              i === completed &&
              !expired &&
              !["Refunded", "PaymentPending"].includes(job.state)
                ? "step"
                : undefined
            }
          >
            <span>{i < completed ? "✓" : i + 1}</span>
            {stage}
            <small>{i < completed ? "Complete" : "Pending"}</small>
          </li>
        ))}
      </ol>
      <p role="status">{next}</p>
    </section>
  );
}
