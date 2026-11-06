# STYX demonstration

## Primary demo: real NEAR testnet

Use the current [testnet setup instructions](TESTNET_LIVE.md). A fresh checkout needs its own private service configuration; no keys are committed or included in the demo. Mainnet is disabled. Use synthetic, non-sensitive JSON/CSV invoices; PDF and image uploads are not supported.

1. Open `/app`, confirm the live contract check and connect a testnet wallet. Connection alone makes no payment. Escrow funding is a separate reviewed wallet transaction; storage credit and available escrow are different balances.
2. Upload your invoice JSON/CSV. Choose local parsing, or explicitly consent to external invoice processing and API costs for NEAR AI. Inspect the real CSV, source comparisons and verification report.
3. Use **Continue with NEAR testnet** from the invoice delivery. The link carries that source job into the agreement form. Compare the configured services: LedgerWorks 0.01 NEAR and ParseLab 0.012 NEAR on this installation. Both are STYX-operated testnet accounts, not independent commercial providers. Prices are configuration, not universal rates.
4. Choose a service and enter an explicit spending cap. Selecting a quote does not reserve or pay. A cap below the quote is rejected before preparation and checked again by the server. Review the prepared agreement's recipient, cap, artifact and expiry.
5. Follow Job progress: owner approval in the wallet, agent reservation, provider delivery, verifier attestation, then owner acceptance. Each step has a transaction review; agent/provider/verifier use separate restricted service keys. Complete before expiry. Never approve a popup without reviewing its contents.
6. On successful release, show **Paid**, the FINAL transaction and actual receipt. Open **Full payment receipt**, download the CSV, and use **Print / save receipt PDF**. Reload to show persistence. Do not repeat payment for the sake of another screenshot.

The owner completed the LedgerWorks flow on 2 November 2026; release `2ZN5ioUTu2oVfR5zQVgZKmdpLaXkqpFmf1XNewpQ7JCT` paid 0.01 testnet NEAR. ParseLab account/key provisioning is verified, but a full owner-funded ParseLab payment is not yet accepted. See [verification evidence](verification/RESULTS.md).

For a security demonstration, use isolated practice/test fixtures to show changed-recipient rejection, altered-output verification failure and payment/refund race protection. Explicitly identify these as deterministic or automated checks. Do not represent them as transactions from the owner's successful agreement. Preserve the paid receipt.

For a wallet interruption, open Requests & reconciliation and identify the same saved request. If a transaction hash is known, reconcile that hash; do not submit a replacement payment. If role submission lost its hash, locate it in public account history before retrying. Reconciliation reads final transaction and contract state; a wallet redirect alone is not success.

## Separate local practice demonstration (no chain payments)

Open `/testing` and explicitly start **Successful delivery**, or open `/jobs/new?local=1` to create a practice job. Startup does not seed STX-1042 or expose samples as real testnet deliveries. Practice jobs use demo units and deterministic adapters. The historical fixture numbers below apply only to an explicitly created canonical practice case.

1. Run `npm ci` then `npm run dev`. Open `http://127.0.0.1:4173/testing`. Practice balance is separate from actual testnet escrow; use its displayed value rather than assuming the wallet has funds.
2. Start a practice case or explicitly create a local job. Review its actual ID, 30 synthetic inputs, rules, 5.00 demo-unit cap, future deadline and permitted providers. IDs are assigned by the database and need not be STX-1042. Draft creation is supported in the explicit local editor.
3. Inspect immutable v1 SHA-256, recipients, owner approval and verifier identity. Approve v1. Compare LedgerWorks 3.20 against ParseLab 4.10. Selecting a radio does not reserve funds.
4. For the security demonstration, use a **separate job**. On its quote screen expand **Inspect the recipient policy** and demonstrate a recipient change. Inspect approved and attempted recipient plus the persisted rejection event. Keep the job paused or cancel it. There is no bypass. A blocked reserved job must be cancelled rather than silently resuming.
5. On the legitimate job choose LedgerWorks and **Reserve & start**. 3.20 moves from available to reserved. The deterministic adapter parses all 30 real input documents. Delivery becomes Ready for review after checks pass.
6. Download `october-invoices.csv`. Inspect 30 records, 2 duplicate identifiers (INV-1011 and INV-1021), 3 missing vendor fields (INV-1005, INV-1015, INV-1025), and separate USD/EUR totals. Invoice 29 contains a malicious instruction; it cannot alter the recipient or cap.
7. Accept & release 3.20. Inspect the local receipt, cap 5.00, paid 3.20, unused allocation 1.80, actual output SHA-256, approval/settlement times and accepted checks. Print/save PDF. Reload; the receipt persists and repeating acceptance cannot pay twice.
8. If starting with only the canonical job, balances now reconcile as 96.80 available, 0 reserved, 3.20 spent. Unused allocation is unspent cap, not a refund transaction.

## Failure demonstrations

In creation's Rules step expand **Deterministic failure scenarios**. `slow` takes about 3 seconds; `timeout` becomes a provider error; `malformed`, `missing_coverage` and `arithmetic` fail actual verification; `changed_recipient` blocks payment; `payout_failure` keeps funds reserved and creates a failed settlement attempt without a payment entry. Request correction reruns a normal extraction under the unchanged mandate, or cancel an eligible failed job to release its reservation. Server and contract tests cover expiry, insufficient funding, cumulative reservation limits, tampering and replays.

Quotes expire after 15 minutes. Refresh only before reservation. Expired mandates can be revised before reservation; reserved jobs must be cancelled and recreated. Rule revisions create a new immutable hash/version and demand owner reapproval.

All provider execution here is demo-owned deterministic code; no live inference or blockchain transfers occur. Screenshots are test-generated evidence, not fabricated financial history.
