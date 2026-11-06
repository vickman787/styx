# Delivery and source review

Open a delivered job and choose **Review all invoices & sources** below its short preview. The full review URL is `/jobs/:id/review`. It is available for successful or failed deliveries and remains read-only: it cannot edit an invoice, remove duplicates, accept a delivery or move money. Return to the delivery page for owner acceptance or correction.

- Search by invoice, vendor, source filename or other delivered fields. The table includes every parsed CSV record, with 15 rows per page and working Previous/Next controls.
- Filter repeated identifiers, missing vendors, source mismatches, arithmetic issues or all flagged rows. Repeated-identifier flags include **all** rows in repeated normalized vendor + invoice ID + currency groups. The saved verifier report counts additional duplicate occurrences instead: the canonical 30-row sample therefore has four flagged rows in two duplicate groups and two additional duplicate occurrences. Nothing is silently removed.
- Inspect a row to compare each delivered field with an independently parsed source occurrence. Every source occurrence is consumed at most once; unchanged exact occurrences are matched first, so reordered repeated IDs do not steal one another's originals. Changed or unmatched fields remain explicit. Missing original records appear in a separate panel.
- View the original JSON/CSV as plain, untrusted text. Its content hash is recomputed and compared with the stored upload hash. The visible preview is capped at 20,000 characters; **Download original** retrieves the complete content with a fixed safe filename. Document instructions are data, never payment authority.
- Download the full CSV or a JSON verification report. The report contains the observed/saved artifact hashes, integrity status, saved verifier report, expiry/current-validity state, missing-input count and row-flag counts. It excludes raw invoice/source content. Keep it private: invoice identifiers, hashes and associations can still be sensitive.

The review parses actual CSV bytes, not the cached row preview. If parsing fails, headers differ, hashes change or the saved report expires, the page does not claim a current valid delivery. CSV review is limited to 10 MiB with a 1 MiB maximum CSV record; the original delivery download remains available. A saved passing report is historical evidence when expired; `reportCurrent` expresses current eligibility and does not reverse a past settlement.

Endpoints (`GET`, under the existing local session/workspace boundary):

| Endpoint | Result |
| --- | --- |
| `/api/jobs/:id/review` | Parsed rows, original comparisons, flags, missing occurrences and integrity state |
| `/api/jobs/:id/report` | Downloadable `verification-report.json` |
| `/api/jobs/:id/inputs/:sourceId` | Private source text and observed/stored upload hashes |
| `/api/jobs/:id/inputs/:sourceId?download=1` | Original input attachment (`original-invoice.json` or `.csv`) |

These are development-local authorization checks, not production user authentication. Source data stays on the local server/browser during review; no model call, external upload or chain transaction runs. Verification does not establish invoice authenticity, vendor identity or business correctness. Existing live-model and testnet configuration blockers remain documented separately.
