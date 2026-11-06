# Public sample demo

Open https://usestyx.xyz/try-demo, or run locally and open `/try-demo`.

## Visitor journey

1. Choose a sample case and a maximum allocation between 0.01 and 10.00 demo units.
2. Load 30 fictional invoice files. Both STYX-operated local services are allowed.
3. Review and approve the cap and sample rules.
4. Compare demo-unit quotes. A price above the cap cannot be reserved.
5. Reserve only the selected quote and process locally.
6. Inspect the actual CSV, source totals and verifier checks. Download the sample CSV if desired.
7. Accept a passing delivery to record a simulated payment, or reject/cancel to release a reservation.

Arithmetic mismatch, missing coverage and provider timeout cases show nonpayment paths. Repeated acceptance returns the original receipt without a second ledger payment.

## Separation from the owner workspace

- `/try-demo` uses only `/api/sample-demo/*`; it never initializes the wallet selector or the owner session API.
- A separate HttpOnly, SameSite=Strict cookie is scoped to `/api/sample-demo`. HTTPS also sets Secure.
- Each visitor receives a distinct SQLite `:memory:` database and service instance. Owner databases and memberships are never passed to the sample router.
- The model client is explicitly constructed with an empty environment. Only local parsing and server-owned synthetic fixtures are accepted.
- There are no upload, NEAR, signing, AI, password or workspace-switch endpoints in the sample API. Unknown endpoints terminate there rather than falling through to owner routing.
- Mutation requests require an exact origin and a per-session CSRF token. The request host must match the configured origin.
- The owner's existing session is not cleared, replaced or upgraded when opening the demo. A guest cookie cannot authenticate an owner request.

## Resource and lifetime limits

Sessions expire after 30 minutes without renewal. Expired idle stores are closed on a one-minute sweep or the next request; an active processor finishes before its store is discarded. A server restart clears all sample data. The UI offers reconnection after expiry.

Each session supports five sample jobs and at most 150 mutation requests. Allocation is at most 10.00 demo units per job. The process permits 24 simultaneous sessions and at most 60 new sessions per 15-minute window. These pilot limits can cause a busy message under public load; they do not establish production-scale availability. Cookies shared by tabs in one browser profile share that guest session; separate browser profiles receive separate sessions.

## Labels and proof

A persistent banner says **Sample workspace / simulated payments / no blockchain transactions**. Amounts and receipts explicitly use demo units. No testnet badge, wallet connection or explorer link is attached to a sample payment.

The proof section links to two separate earlier owner-completed testnet agreements: a 0.012 NEAR payment and a reservation release with no provider payment. Guest actions do not generate or change these transactions.

The public homepage also identifies NEAR testnet as live, while stating that the separate sample uses fictional inputs. Inside the protected app, local demo routes identify simulated payments; chain routes retain testnet labels and wallet controls.

## Verification

`tests/sample-demo.test.ts` covers isolated stores, owner denial, unsupported endpoints and injected fields, CSRF/origin enforcement, successful/idempotent acceptance, failed verification, reservation release, quotas and expiry.

`tests/browser/sample-demo.spec.ts` covers the real browser-to-API journey, source review/CSV download, reload, separate visitors, simulated-payment labels, rejection, mobile overflow and serious/critical accessibility violations. It uses an isolated app instance, not the owner database.
