# Provider and settlement protocol

`lib/providers/index.ts` defines the common adapter interface:

| Method | Behavior |
| --- | --- |
| `quote(job)` | Quote ID, provider, exact integer price, recipient, asset, mandate hash, expiry, estimate |
| `start(job)` | Parse supported private invoice inputs; return extracted rows or a real error |
| `status(job)` | Read persisted execution state |
| `fetchDelivery(rows)` | Serialize real CSV bytes with fixed schema and formula escaping |
| `requestCorrection(job)` | Extract again under the same mandate |

LedgerWorks and ParseLab are in-process demo-owned adapters, not an HTTP marketplace. An external implementation must authenticate quote/delivery origin and keep this binding. Neither adapter can approve payment or mutate rules.

Browser-to-server protocol: establish `/api/session`, send session cookie and `X-Styx-CSRF` on mutations. `/api/state` returns workspace-scoped summaries without document text/CSV bytes. `/api/fixtures` is the public synthetic sample content behind the local session. `POST /api/jobs` creates a job (or server draft via `draft:true`). Per-job action paths are `submit`, `approve`, `revise`, `refresh`, `reserve`, `correct`, `attack`, `cancel`, and `settle`. The session-authorized artifact download is `/api/jobs/:id/artifact`. All actions repeat critical policy checks server-side.

The local development owner explicitly initiates API reservations, verification acceptance and settings changes. This is a deterministic workflow, not a live buyer agent; quote comparison does not imply live model inference.

Job creation also accepts `processing: "local" | "near_ai"` (default local) and `externalConsent` (default false). Optional live processing requires server opt-in/key/model plus consent; the engine/model/endpoint/consent are saved inside the hashed mandate. Local demo provider prices and wallet actions remain separate from external API charges. `GET /api/state` exposes public model readiness, never the API key. Successful delivery metadata records the actual extraction engine/model. See `docs/NEAR_AI.md` for the disclosed external data path and limits.

Private delivery evidence uses `GET /api/jobs/:id/review` (actual CSV/source comparisons), `/report` (JSON evidence attachment) and `/inputs/:sourceId` (original text/hash metadata; `?download=1` returns the original attachment). These endpoints are read-only and enforce the existing session/workspace lookup. See `docs/DELIVERY_REVIEW.md` for row matching and duplicate-count semantics.

Optional password mode: `GET /api/session` creates a preauthentication session and returns `authenticated`, `authMode`, `csrf`, current identity/workspace/role and assigned workspaces. `POST /api/auth/login` accepts username/password with the preauthentication cookie, CSRF and exact Origin; it rotates the token. Private routes reject anonymous access. `POST /api/auth/logout`, `/auth/workspace` (`workspaceId`) and `/auth/password` (`currentPassword`,`newPassword`) also require CSRF/Origin. Tokens are HttpOnly cookies, not JSON/localStorage bearer tokens. Membership is read server-side for every request, workspace writes require owner, and each router receives the corresponding scoped store. New approval records identify the authenticated user; old local records retain their original principal. See `docs/ACCESS.md`.

NEAR attestation is an authenticated verifier transaction, distinct from provider delivery and explicit owner release. It binds immutable mandate hash, input hash, delivered artifact hash, check version, job ID, expiry, and contract/network domain. It does not assert semantic truth. The default `/testnet` workspace submits agent/provider/verifier transactions through separately configured restricted role keys; owner actions use the wallet. The current installation has a deployed contract and completed a real FINAL testnet payment. Fresh checkouts need private configuration. See `docs/TESTNET_LIVE.md` and `docs/verification/RESULTS.md` for current acceptance evidence.

Wallet SDK preparation uses `POST /api/near/wallet-rpc`, a session/origin-protected read-only bridge limited to account/key queries, block and status. It accepts SDK `near-final` and normalizes it to `final`. It cannot broadcast or call contract methods. This read-only POST alone is exempt from the CSRF header because the SDK cannot attach it; state-changing routes retain CSRF protection.

Testnet API: `GET /api/near` returns public readiness, execution records and intents; `GET /api/near/balance?owner=...` and `/keys?owner=...` read finalized chain data. `POST /api/near/executions` prepares a distinct NEAR mandate from verified local evidence. `POST /api/near/intents` saves an exact transaction for review; `POST /api/near/intents/:id/submit-role` can sign only reserve/deliver/attest. `POST /api/near/intents/:id/confirm` validates a transaction hash against the saved intent and chain state; `POST /api/near/executions/:id/refresh` observes contract state without inventing a paid receipt. All endpoints retain the local session/CSRF boundary. Amounts are decimal-string yoctoNEAR, separate from local cents. See `docs/NEAR_TESTNET.md` for configuration and reconciliation limits.
