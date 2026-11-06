# Verification evidence — 26 October 2026

## Fresh acceptance and VPS preparation — 5 November 2026

Fresh contract payment and reservation release independently verified FINAL with no failed receipts and matching Paid/Refunded states. [Evidence](keyed-owner-acceptance.json). Separate ARM VPS image built and isolated production-page, anonymous-private-API denial, owner login, secure cookie, authenticated data and session-after-restart checks passed. No external network, real credentials, host mounts or public ports were used by that check. [Preparation report](vps-preparation.json). Janus continues to respond HTTP 200. STYX public hosting is still pending domain, owner setup and final private-data cutover.

Application tests: 105 passed, 0 failed. Login HTTP/browser tests: 2 passed; an initial failure was an obsolete Overview heading assertion and was corrected to Testnet escrow. TypeScript, focused lint and hidden-password helper PowerShell syntax checks passed. No owner password was created by the agent or disclosed. Public TLS/login/wallet-origin acceptance remains unrun.

## Fresh contract deployment and activation — 3 November 2026

Fresh keyed contract `styx-contract-bf76f42ba5.testnet` is initialized and active locally. Finalized code hash/configuration and all four service-key receiver/method/allowance restrictions were independently read back. [Public deployment evidence](keyed-testnet-deployment.json). No existing contract was upgraded or funded owner balance moved. The old paid receipt remains readable after reload in Earlier contract history, with CSV/print controls and no signing controls. Contract-switch isolation regression passes. Application suite: **102 passed**; receipt/recovery/provider browser checks: **3 passed**; archive receipt browser check: **1 passed**. New owner-wallet payment and reservation-release acceptance remain pending; see [steps](../KEYED_WALLET_ACCEPTANCE.md).

Readiness now hashes both separately preserved artifact paths, requiring exact configured hash equality; a new regression rejects missing/modified candidate bytes. All seven readiness checks pass their targeted test suite. Refreshed public configuration report still fails `access` and `owners`; [report](public-readiness.json). TypeScript, targeted lint and production build pass; existing upstream wallet eval/util/chunk-size warnings remain. Passing configuration checks would not certify manual wallet acceptance, independent review or public deployment.

## Capacity and production-runtime follow-up — 3 November 2026

- Legacy whole-map artifact: scale reproduction fails at 100 stored jobs on release, with actual receipt `Exceeded the prepaid gas`. [Failure report](near-vm-scale-report.json). This intentionally failing reproduction is separate from passing application checks.
- Fresh keyed-storage candidate `Fvxj2r1j4k9fJXpPzVDGUoeRQ8SNZWHfsfbJ1Dsf6fZW`: 100 approvals and five complete payment paths pass, 121 measured transactions; callback 2.735 Tgas at 100 jobs under the unchanged 15 Tgas allocation. [Scale report](near-vm-scale-keyed-report.json).
- Candidate VM safety: 30 measured transactions/11 checks pass, including cross-owner balances/global quote replay, aggregate reservation refunds, private callbacks, rollback and failed-transfer recovery. [VM report](near-vm-keyed-report.json). Native policy engine: 15 pass.
- Application suite: 101 pass, 0 fail. TypeScript, targeted lint and production build pass. New public-readiness gate rejects the old artifact; it does not claim that another artifact is audited.
- Clean offline production-only dependency installation and isolated startup pass: compiled app/assets 200; anonymous private API 401; no copied live DB or configuration; external integrations disabled. `tsx` is now a runtime dependency. [Latest install report](production-install.json). Earlier paused/loaded runs were rerun; only the completed final run is counted.
- Fresh post-payment recovery smoke: 1,496 application records match across 19 tables, restored sessions cleared, isolated production app 200/private API 401, live DB unchanged. This remains local recovery evidence, not a cloud restore.

The fresh deployment above supersedes the earlier undeployed-candidate status. The original funded testnet contract and existing owner receipt remain unchanged. Full scope and commands: [candidate notes](../CONTRACT_KEYED_CANDIDATE.md). No independent audit, mainnet readiness or public-hosting readiness is claimed.

## Real owner wallet acceptance — 2 November 2026

### Second provider and recovery follow-up

Live ParseLab provisioning verified distinct account `styx-parselab-2ae3a5a7e7.testnet`, delivery-only contract permission and bounded allowance. Key installation transaction: `HF8buvwPhq2qgaKhPF5MbHisCu56beNWPSGvtGu5JNGr`. Setup used only fresh faucet-funded service funds. [Public report](parselab-setup.json) contains no private keys. Both providers are STYX-operated; ParseLab's configured 0.012 NEAR price is a testnet service quote. Complete owner-paid ParseLab lifecycle remains untested.

The running authenticated API reports ready with LedgerWorks and ParseLab and no configuration issues. Owner escrow remained 0.04 NEAR available, zero reserved/withdrawal pending, 0.02993 NEAR storage credit; the existing Paid receipt remained unchanged and no signing requests were pending.

`node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts`: **100 passed, 0 failed**. New service cases verify second-provider quote/recipient/delivery-signer isolation, cap enforcement and owner-signed refund eligibility after expiry while rejecting a refund during PaymentPending. These use isolated stores/mocked RPC; they are not extra owner transactions.

Browser checks passed for `provider-comparison.spec.ts`, `near-recovery.spec.ts`, `near-receipt.spec.ts`, `source-recheck.spec.ts` and `quote-renewal.spec.ts`. They intercept mutations and do not make payments or AI requests. Comparison covers no default selection, correct configured prices, deep-linked source selection, cap errors, no submission on selection and 320/390/1440px layout. Recovery proves uncertain submissions remain visible beyond completed history and reconciles the saved hash without a new signing intent. Provider screenshot visually inspected. TypeScript, targeted lint and production build passed; existing wallet dependency/bundle warnings remain.

### Guided agreement and printable receipt follow-up

Implemented five-stage progress and next-action guidance plus full Paid-only testnet receipts, authorized CSV downloads and receipt-only browser Print / Save PDF. The original logo, amounts, domain, verifier/check version, hashes and saved reconciliation timestamps are included. Export does not create a signing request or submit a transaction.

Validation: `tests/browser/near-receipt.spec.ts` passed reload persistence, print isolation, unpaid gating and 320/390/1440px overflow checks using intercepted read responses and no mutations. The print screenshot was visually inspected. The six existing expired-agreement/Meteor-popup/actual-SDK-handoff browser cases passed. All 27 targeted settlement, wallet-key and testnet-source tests passed. TypeScript, targeted lint and Vite production build passed; existing dependency/bundle warnings remain. This follow-up made no new model calls or blockchain submissions.

The owner manually completed the real NEAR testnet payment flow for **My first invoice check**, execution `STX-1082:near:d3307236-4355-482c-a7eb-62e6848d61e3`. Owner approval and release used Meteor; reservation, delivery and attestation used the configured separate role accounts. This was an actual testnet payment, not an isolated browser fixture.

| Action | Confirmed transaction |
| --- | --- |
| Owner approve | `9d6VsbBTmTJidPBbB52kk4G9emXciRSASbf2zb1jMLUX` |
| Agent reserve | `7m45MNaQb6DRm7y3PvyRKwNC3WYBw2oDT47hJ9D3AayK` |
| Provider deliver | `6jBqGfMvqNeS1e7rCMBceJmxr3fKdsWt4p1jd1s8ymNN` |
| Verifier attest | `JQWwUMyQDnJ1GV9r8SzrwbcEMZXkpfv7NmgNgnHiU3w` |
| Owner release | `2ZN5ioUTu2oVfR5zQVgZKmdpLaXkqpFmf1XNewpQ7JCT` |

Read-only verification after the owner's release returned `final_execution_status: FINAL`, successful overall status, successful provider receipt, and the contract's `paid` callback event. The persisted reconciled execution is **Paid**, with **0.01 NEAR** paid to `styx-provider-1effc31636.testnet` by contract `styx-contract-1effc31636.testnet`. Artifact hash: `6a8f837b3678bc8d942ef2c6a5404c17acc7e5ca92e561a9bb3f4d127021053d`.

Finalized escrow read for `kafanchan.testnet`: available **0.04 NEAR**, reserved **0**, withdrawal pending **0**, storage credit **0.02993 NEAR**. Storage credit is separate from spendable escrow. [Public release transaction](https://testnet.nearblocks.io/txns/2ZN5ioUTu2oVfR5zQVgZKmdpLaXkqpFmf1XNewpQ7JCT).

This completes the owner funding-to-payment acceptance item. It does not establish mainnet readiness, independent contract audit, large-state gas safety, off-device backup readiness or public deployment readiness. The provider is a STYX-operated testnet service account.

The remaining sections below retain their original verification dates and historical scope.

Executed from `C:\Projects\STYX` using Node 24.15.0, npm 11.14.1 and Rust 1.97.1.

| Command | Actual result |
| --- | --- |
| `npm install` / subsequent locked package updates | 343 packages audited after wallet SDK integration; 11 low-severity upstream entries remain after compatible audit fix; details in `docs/NEAR_TESTNET.md` |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` | 77 pass, 0 fail (16 local workflow, 13 NEAR adapter/service, 7 model-service, 6 review, 9 access/security, 4 operations/recovery, 5 deployment-check, 4 recovery-drill, 7 encrypted-backup/B2, 6 backup-runner; external integrations mocked) |
| `npm run build` | Pass; TypeScript check and Vite 8.3.5 production bundle |
| `npm start` | Production server successfully served loopback port 4173 |
| `npm run test:browser` | 6 pass, 0 fail against production server; 1.7 minutes |
| `npm run test:contract` | 15 native policy tests pass, 0 fail (latest contract hardening rerun) |
| `cargo build --manifest-path contracts/styx/Cargo.toml --target wasm32-unknown-unknown --features near --release --offline` | Pass; latest v2 `styx_escrow.wasm` emitted (488,018 bytes); local code hash `CdBNyKSJ5vEj5k85MSLzpfpUhxBx7NZGNzG1yjvSwck1` |
| `node scripts/print-check.mjs` | Print view inspected; receipt dimensions 700×1003.48 CSS pixels |

The native Rust tests invoke the exact engine used by NEAR entry points. They are not NEAR VM, deployed-contract or chain-finality tests. No external settlement or inference was executed.

## Browser evidence

The functional test creates a new job through the UI, loads all 30 real fixture documents, approves mandate v1, selects LedgerWorks, reserves 3.20 demo units, receives a parsed CSV, checks the 2 duplicate / 3 uncertain field results, downloads the artifact, accepts delivery on mobile, and reloads a persisted receipt. Other tests exercise blocked recipients, sessions and CSRF, saved-draft reopening/editing, settings persistence and mobile page-width assertions.

Axe reports no violations across 24 combinations of desktop/mobile routes with WCAG 2 A/AA and 2.1 AA tags, including the new testnet console. Keyboard entry tests verify the actual skip link receives focus. See [machine-readable report](../design/accessibility-results.json). This does not claim complete accessibility certification.

Screenshots under `docs/design/screenshots/` include desktop overview, mandate, quotes, delivery, blocked payment, receipt; mobile overview, jobs, creation, providers, activity, settings, delivery, blocked payment and receipt; plus the print receipt. The browser viewport is 1440×900 on desktop and 390×844 on mobile; full-page captures may be taller. The evidence reflects actual persisted test jobs and ledger values, not fabricated sample history.

## Fixes discovered during verification

- Port 3000 belonged to another application; moved STYX to 4173 and added explicit bind-error handling.
- Installed the matching Playwright browser; the existing installed Chromium revision was incompatible.
- Fixed mobile page overflow from absolute hidden table-header text and a grid child's minimum content width.
- Corrected secondary-text contrast and made horizontal invoice tables keyboard-focusable.
- Fixed test timing/selectors for asynchronously loaded UI; preserved real workflow assertions.
- Corrected the NEAR wrapper's function-call argument type, used bounded callback result reads, and serialized 128-bit amounts as decimal strings.

External readiness and missing implementation are in `IMPLEMENTATION_STATUS.md`; commands to reproduce are in `README.md`.

## Approved landing-page integration

Homepage `/` now serves the approved landing page. The overview moved to `/app`; existing workflow routes are preserved. Updated browser tests enter via **Open workspace** and still pass the full job-to-receipt journey. Post-integration `npm run test:browser`: 6 passed in 2.4 minutes against the development server. Manual browser automation verified desktop/mobile create-job and workspace CTAs, `/landing-preview` → `/` redirection, and the app's return-to-website link. Production build and lint pass after wiring.

## Testnet console extension

The current suite contains eight browser scenarios. The five existing journey/security/draft scenarios passed in the full run. After correcting the new empty-state contrast, targeted accessibility plus unconfigured testnet checks passed (2 tests, 2.9 minutes). A separate chooser-loading test passed in development. Production `tests/browser/near.spec.ts` passed both tests in 20.3 seconds against a separate port-4174 server/database: desktop/mobile configuration state and wallet chooser loading with external fonts blocked. The public configuration fixture does not log into a wallet or sign anything. The SDK's remote Google Fonts import was removed after production CSS preload verification exposed its dependency. No horizontal page overflow at 320, 390 or 1440px. Saved screenshots: `docs/design/screenshots/testnet-{width}.png`.

Contract deployment, real NEAR VM execution, wallet redirects/signing, storage/gas economics and actual chain settlement are unverified. Mocked tests reject saved intents after contract/code-hash configuration changes and never record success for nonfinal or failed receipts. See `docs/NEAR_TESTNET.md` for setup and known integration/dependency limits.

## Model-processing extension — 27 October 2026

Seven new model/service tests pass; the full app suite now has 36 passing tests. The HTTP transport is mocked: no actual API call or charge occurred. `npx playwright test tests/browser/model.spec.ts tests/browser/journey.spec.ts` passes all six cases in 2.1 minutes. The new UI test uses a public readiness fixture, proves unchecked consent prevents submission, checks rules/review at 320/390/1440px with no horizontal overflow, and reports zero axe violations on the desktop/phone rules form. Screenshots: `docs/design/screenshots/model-rules-{width}.png`. Real API/model compatibility and TEE verification remain unverified. Data-path/cost disclosures and configuration: `docs/NEAR_AI.md`.

## Delivery review — 27 October 2026

The app suite now passes all 42 tests, including six new cases covering actual-byte parsing instead of cached preview rows, sample duplicate/uncertainty counts, altered values/hashes, unknown sources/missing originals, reordered repeated occurrence matching without reuse, malformed CSV and expired reports. Typecheck/lint/production build pass.

Five existing journey/security/draft browser cases passed in the full run. `npx playwright test tests/browser/review.spec.ts` passed its new complete review scenario in 25.9 seconds after fixing its searchbox locator. It verifies all 30 rows with two pages, search, four repeated-group rows, three uncertain rows, original field comparison, actual private source/report downloads and JSON content, anonymous endpoint rejection, missing source rejection and navigation back to acceptance. Desktop/phone axe scans report zero violations; 320/390/1440px have no horizontal page overflow. Screenshots: `docs/design/screenshots/review-{width}.png`. Guide: `docs/DELIVERY_REVIEW.md`. No new external integration or live model/chain operation was used.

## Password access — 27 October 2026

Final `npm test`: **51 passed, 0 failed**, 53.6 seconds. Nine new access tests cover salted password hashing/limits, preauthentication token rotation, logout/mode isolation, persistent sessions and expiry, dynamic membership/revocation/disabled accounts, password-change session revocation, persistent throttles, scoped jobs/demo balances and anonymous issuance limits. Verification domains include the workspace, retaining legacy acme-local compatibility. Build/typecheck and lint pass; existing upstream wallet dependency/build warnings remain.

`npx playwright test tests/browser/access.spec.ts tests/browser/journey.spec.ts tests/browser/review.spec.ts`: **8 passed**, 1.7 minutes. After final anonymous-session and approval-principal hardening, `npx playwright test tests/browser/access.spec.ts`: **2 passed**, 1.1 minutes. The access tests start a production-build server on loopback port 4175 with random test credentials in a temporary database; they remove that server/directory afterward. No real accounts were provisioned in the main database.

HTTP assertions cover missing/rotated cookies, CSRF/Origin, owner/viewer permissions, private cross-workspace originals/CSV/reports/review rejection, unauthorized switching, live membership revocation, isolated balances/settings and authenticated approval principals. Browser checks exercise sign-in errors, session persistence across process restart, account settings, switching, viewer restrictions and logout. Sign-in at 320/390/1440px and account settings at desktop/mobile widths show no page overflow; axe scans on both screens report zero violations. Screenshots: `docs/design/screenshots/sign-in-{width}.png`, `account-{width}.png`.

Main server remains local-owner mode on port 4173. Authenticated HTTPS/proxy deployment and external security review remain unverified, as do live model/chain integrations. Operator setup and explicit limits: `docs/ACCESS.md`.

## Operations extension — 27 October 2026

Full unit/integration suite: 55 pass, 0 fail in 44.1 seconds. Typecheck, lint and production build passed. Recovery tests exercise an open WAL database, preservation of workspace/balance records, clearing restored sessions/throttles, refusal to overwrite existing files, corrupt/unsupported sources, cleanup and generic readiness failures. The running development server returned HTTP 200 for both health endpoints with Cache-Control: no-store. Existing wallet build warnings persist. No frontend changes in this extension; no new desktop/mobile visual audit was needed. Operational limits and commands: [operations](../OPERATIONS.md).

## Contract hardening extension — 27 October 2026

Executed native policy tests: 15 pass, 0 fail. Rust formatting check passed. Actual wrapper release WASM build passed; current size 488,018 bytes and code hash CdBNyKSJ5vEj5k85MSLzpfpUhxBx7NZGNzG1yjvSwck1. New tests reject malformed/oversized immutable fields and identifiers before creating records or locking balances.

Optional SDK host suite: NOT RUN SUCCESSFULLY. GNU native dependency build failed on dlltool/assembler support; a separate MSVC compiler download stalled and was stopped. The eight-case harness is retained as unverified preparation, with setup and limitations in [contract testing](../CONTRACT_TESTING.md). No WASM execution, on-chain gas/rollback measurement, deployment or live funds validation occurred. Existing application tests/layout evidence are unchanged; server readiness returned ready after this extension.

## Deployment configuration checker — 27 October 2026

Full npm test suite: 60 pass, 0 fail in 40.6 seconds; typecheck and lint passed. Five new tests cover read-only diagnostics, secret redaction, owner coverage, invalid/stale/live-alias backups, access profiles and partial integrations. Actual CLI exit codes: invalid usage 1, incomplete setup 2, isolated synthetic complete configuration 0. Successful synthetic output still said launchStatus unverified. No external service was called. No frontend changes or new layout claims; running server readiness remained ready. See [deployment check scope](../DEPLOYMENT_CHECK.md).

## Real recovery and production rehearsal — 27 October 2026

Full application suite: 64 pass, 0 fail in 40.2 seconds. Typecheck and lint passed. New tests cover seeded private document restoration, same-row-count balance/document tampering, resurrected sessions/throttles and source aliases/missing inputs.

Real local backup retained; recovered 1,257 records across 19 tables matched their snapshot. Isolated production startup passed readiness/homepage 200 and private API 401, then stopped and reverified all records. Restored authentication state was cleared; live app stayed ready. No external keys were inherited by the rehearsal server; no live integration, upload or public deployment occurred. Operator reports remain under ignored data/. Remaining work and current dependencies are tracked in [BUILD_QUEUE.md](../../BUILD_QUEUE.md).

## Backblaze encrypted backup integration — 27 October 2026

Full application tests: 71 passed, 0 failed in 61.0 seconds. Typecheck/lint passed. Seven new tests cover authenticated archive encryption, private-record recovery, restricted B2 scopes/private bucket, trusted endpoints, disabled configuration, encrypted mock upload metadata and no uncertain retries. B2 requests are mocked; no live provider verification is claimed.

Actual local encrypted archive: 1,462,315 bytes; random recovery key stored locally without printing it. Encryption/recovery comparison passed for 1,257 records across 19 tables. Key/archives remain ignored under data/. No B2 upload, remote retention rule, schedule or account provisioning was performed. See docs/BACKBLAZE.md and BUILD_QUEUE.md for setup/dependencies.

## Backup runner — 27 October 2026

Full tests: 77 pass, 0 fail in 42.2 seconds; typecheck/lint passed. Six runner tests cover object identity recorded before submission, lock protection, no cloud replay of uncertain attempts, failure redaction, local-only semantics and invalid/stale journals. Cloud tests are mocked.

Actual local-only attempt verified 1,257 records/1,462,315 encrypted bytes, retained the archive, removed its newly created plaintext snapshot and released its lock. Status correctly returned no_cloud_backup, with schedule/alert delivery unverified. No external connection, upload, access grant, recurring task or alert occurred. Live B2 file-access approval remains pending. Operator behavior and limitations: [backup runner](../BACKUP_RUNNER.md).

## 27 October 2026 — Local testing page

- `npm test`: 80 passed, 0 failed, including three new local-case tests. Every sample creates a real local-only job without approval, reservation or external calls; actual verifier, security, correction and payout paths are exercised.
- `npx playwright test tests/browser/local-testing.spec.ts`: 1 passed. Real sample approval/reservation/delivery/cancellation, refunded reservation, persisted case history and navigation verified.
- Page width and axe checks passed at 1440, 768, 390 and 320 CSS pixels. Zero horizontal overflow and zero axe violations on this page. Desktop/mobile screenshots visually inspected: `local-testing-1440.png`, `local-testing-390.png`.
- Existing account shortcut label fixed to include visible initials after the browser check identified a mismatch.
- TypeScript/lint and production build pass. Local dev server remains at http://127.0.0.1:4173; no public deployment or live external integration claimed.

Wallet connection follow-up: targeted `near.spec.ts` and `local-testing.spec.ts` passed all 3 tests. The unconfigured wallet chooser opens without contract configuration; funding/withdrawal remain disabled. Contract-dependent transaction guards were not relaxed. Build/TypeScript and lint pass. No actual wallet login, redirect, signature or live transaction was performed by the test.

## 27 October 2026 — Header wallet verification

Wallet controls moved into the shared workspace header; unexplained AS settings shortcut removed. Connection opens the real testnet wallet chooser without a contract. An app sidebar CSS collision with the wallet SDK's `.sidebar` class was found during mobile testing and fixed by scoping app sidebar selectors to `aside.sidebar`. This prevents wallet options from being hidden on phones. Transaction guards remain unchanged. Actual account login, redirect, signing and chain payment remain separate live verification requirements.

Final header verification: targeted header browser test passed (1/1), with the two Testnet escrow browser tests passing separately. Header checked across four routes at 1440/390/320px; no width overflow or axe violations on the checked testnet page. Desktop and phone header screenshots visually inspected. Build/TypeScript and lint passed. No actual wallet login or payment claimed.

## 27 October 2026 — Actual VM and public testnet

- `npm test`: **82 passed, 0 failed**, including own-invoice intake with no demo quote/reservation/payment, correction/cancellation and invalid input rejection.
- `cargo test --manifest-path contracts/styx/Cargo.toml --offline`: **15 passed**.
- Official NEAR sandbox (Ubuntu, build 8bdca22): actual compiled WASM ran **18 transactions** and passed nine grouped checks. Real deposits/transfers and callback graph, successful withdrawal, private/unauthorized rejection, storage failure rollback, replay rejection, failed transfer restoration/refund. See near-vm-report.json. This does not certify scale or constitute an audit.
- Public NEAR testnet contract deployed and initialized; finalized code hash matches tested artifact. Three restricted service keys verified on chain. See testnet-deployment.json.
- Localhost `/api/near/network` verified chain, contract code/domain/version and finalized block **275012972** during the direct check; subsequent UI reads remain live. Native contract account balance returned from the real RPC, not a fixture.
- `npx playwright test tests/browser/live-testnet.spec.ts`: **1 passed**, actual configured testnet profile; live RPC/contract verification and balance, owner-structure invoice upload, unchanged demo balance, active source verification, cancellation cleanup, 1440/390/320px width checks and zero axe violations. An initial run skipped before session initialization; the test was corrected to wait for the app session and then actually passed.
- Build/TypeScript and lint pass. Existing wallet dependency bundle/eval/util warnings remain. Actual user wallet login, redirects, signing and public testnet funding-to-settlement were not performed by these tests.

Final UI follow-up: the targeted live provider/invoice browser check passed (1/1): actual configured recipient and 0.01 NEAR price, 320px layout, seeded STX-1042/demo balance excluded from the default delivery page. Cancelled acceptance evidence remains in private history but is hidden from the active delivery list and source picker. Live testnet desktop/mobile screenshots were visually inspected. The retained app reports ready=true for the deployed contract and zero testnet agreements before the user's first wallet walkthrough.

## 27 October 2026 — Testnet AI processing

- `npm test`: **85 passed, 0 failed**. New source-flow tests cover consent/configuration before job creation or transport, owner approval before model call, exact evidence verification without demo settlement, changed configuration, hallucinated totals, timeout/failure and no fallback/retry.
- `npx tsx --test tests/testnet-source.test.ts tests/model.test.ts`: **12 passed**.
- `npx playwright test tests/browser/testnet-ai.spec.ts`: **1 passed**. Mocked readiness/submission only, no actual upstream calls or real AI success claimed. Engine selection, fresh consent on changes, disabled submit before approval, correct request payload, 1440/390/320px no-overflow and zero axe violations.
- Build/TypeScript and lint pass. The consent browser test uses mocks; actual inference evidence is recorded separately below.

### Actual AI inference after funding

The user completed the approved $1 credit purchase; the dedicated key retains its $1 usage limit. The first actual request cost $0.0003 and failed output parsing. After adding JSON-object response mode and strict envelope parsing, the user approved one additional synthetic request. At 21:17:14 UTC it passed all six independent checks using deepseek/deepseek-v3.2. See [actual report](ai-live-check.json): schema, coverage, arithmetic/source match, duplicate detection, uncertainty flags, and artifact/mandate binding. No customer files, workspace samples or wallet payment were involved. This bounded check does not certify general model quality or attestations.

After the format fix, the 12 targeted model/source tests, TypeScript/build and lint passed. The two live RPC/own-invoice browser tests passed separately; no owner wallet signatures were performed. Localhost was restarted with the verified fix. No further paid model requests were run.

## 28 October 2026 — Additional testnet wallet

Added the official Meteor Wallet adapter 10.1.4 alongside the existing MyNearWallet adapter. Selector remains testnet-only; current account restoration, contract/code-hash checks, signer checks and owner transaction confirmation are unchanged. MyNearWallet's displayed sunset notice is documented in the testnet guide. No wallet account export/import, recovery phrase handling or owner transaction was performed.

The adapter's older NEAR SDK required browser Buffer resolution, globalThis and an empty browser process.env definition; actual environment values are not embedded. Its nanoid dependency is overridden to patched 5.1.16. Audit reports 0 high/critical, 14 low and 4 moderate findings (the moderate chain is the SDK's query-string/decode-uri-component). Broader dependency maintenance remains on BUILD_QUEUE.md; an incompatible ESM decoder override was not retained.

Header browser acceptance passed: four workspace routes at 1440/390/320px, no horizontal overflow, zero axe violations on checked pages, both Meteor Wallet and MyNearWallet visible and no uncaught page errors. Build/TypeScript and lint passed. This proves chooser availability, not completed Meteor account login or payment. Live RPC availability is separate and can fail visibly.

## 28 October 2026 — Payment mode labels

Corrected the shared toolbar/footer mode on configured testnet workspace pages; local testing, demo overview, new local jobs and existing demo-ledger jobs keep local-demo labels. Source-only invoice evidence uses the testnet workspace label without implying it is a chain payment. Updated obsolete landing FAQ/footer claims about unavailable testnet signing/AI. Direct browser checks passed for /app, /providers, /settings, /testing, /demo and homepage copy. No inference or wallet transaction performed.

## 28 October 2026 — Clean testnet workspace

- All 85 application tests passed, 0 failed.
- Expanded live-provider browser regression passed (1/1): configured service account/NEAR price, owner-upload-only sources, no seeded STX-1042 or demo balance in invoice list, no sample events on Activity, no old Acme Studio identity, no persistent payment-mode footer and no sample source toggle.
- Startup sample seeding disabled; historical practice records retained. API rejects sample jobs as testnet agreement sources; no owner signing, inference or payment was used by cleanup checks.
- Removed obsolete demo wording in real invoice preparation, wallet details, settings and source summary. Actual local practice routes remain explicitly separate.
Final cleanup verification: sample agreement request rejected before any chain action; Settings checked at 1440/390px with no horizontal overflow and screenshots visually inspected. Final production build/TypeScript and lint passed. The local server remains on port 4173.

Header badge follow-up: removed the remaining route-dependent Demo balance text. The shared header consistently names the selected network, NEAR testnet, including practice routes. Browser checks passed on /app, /jobs, /settings, /testing, /demo and /jobs/new. Practice data remains explicitly explained within Local testing rather than presented as a wallet balance.

## 30 October 2026 — Blank owner-entry forms

Removed preset instructions, acceptance requirements, budget, deadline and provider checkboxes from new job forms. Removed the fixed mandate revision amount and prefilled testnet storage credit; testnet source/provider selection now requires an explicit choice. Funding requires the storage-credit field to be entered rather than silently sending a preset. Read-only contract, wallet and service data remain actual configured/on-chain values.

Browser autosaves now carry version and edited-field provenance. Known legacy template instructions/requirements and their untouched preset fields are cleaned on load, including old versioned drafts without provenance. Custom text/uploads remain; saved server drafts restore as owner-authored data. New owner edits are tracked so matching text is not confused with a historical automatic default. Validation now reports missing instructions/requirements/deadline. Explicit textarea accessible names ensure restored text is addressable consistently after reload.

Validation: empty-forms browser regression passed 2/2 (new forms blank; old template removed; owner text/requirements/budget retained on reload). Build/TypeScript passed; targeted lint covers changed UI and regression spec. Tests used isolated browser storage and no new workspace job, AI request or wallet transaction.

## 30 October 2026 — One invoice entry flow

Fixed the empty Invoice deliveries CTA and landing CTA: both now say Upload invoices and open /testnet#upload. Normal /jobs/new visits redirect to the same real upload section. The old practice editor requires an explicit local=1 link or an existing local draft; it is no longer the default new-job entry. The upload section scrolls into view after it mounts.

After invoice preparation, the testnet page now refreshes the shared workspace snapshot as well as its own status. This fixes a stale sidebar count/list that could otherwise remain zero after successful preparation.

Browser checks: invoice-entry.spec.ts plus empty-forms.spec.ts, 4/4 passed. Redirect and empty-list navigation verified; the preparation callback/count/list regression intercepts requests in an isolated browser and writes no actual invoice or chain records. No live AI request, wallet signature or payment was made. Build/TypeScript and targeted lint passed.

## 30 October 2026 — Connected-wallet read recovery

Corrected the escrow panel's null-balance state: a connected account with a failed chain read now remains connected and gets a specific balance-read error/loading state, rather than Connect a wallet. Escrow balance and full-access-key reads settle independently; failure of one no longer discards the other's successful result. Refresh escrow balance retries both read resources. Owner changes/unmounts discard stale read results, and late selector initialization does not leave a subscription after unmount. A balance refresh after transaction confirmation no longer overwrites a confirmed result with a generic read error.

NEAR reads now use the standard official testnet RPC first, with a bounded fallback to the official archival endpoint. The fallback checks testnet identity, malformed/unavailable responses remain failures, and only status/query/tx read methods are allowed. Broadcast methods cannot use this fallback. Server-role SDK provider uses the standard endpoint; no new transaction retry mechanism was added, and uncertain submission reconciliation is unchanged.

Both official status endpoints returned testnet/HTTP 200 during diagnosis. After restart, actual owner wallet, contract escrow and full-access-key reads returned HTTP 200; no account-specific balances/keys are stored in this report. No wallet signature, deposit, AI request or payment was made.

Validation: 89/89 application tests pass; 17/17 targeted RPC/settlement tests pass. The connected-wallet browser regression passes, including independent balance/key failures, recovery, preserved connection and 390/320px width checks. This browser test uses isolated public-account metadata and mocked read responses, not a real login or funding flow. Build/TypeScript and targeted lint passed. Live owner funding-to-payment acceptance is still outstanding.

## 31 October 2026 — Funding confirmation Buffer runtime fix

Fixed Buffer is not defined on Confirm in owner wallet. The NEAR action serializer references a global Buffer when encoding JSON arguments; Vite's module alias alone did not install that global. A small browser-runtime initializer imports the existing buffer dependency and runs before React/wallet modules. Existing Buffer implementations are retained. Contract/code-hash, expiry, signer and server-role guards are unchanged.

Browser signing regression passed (1/1): actual application Confirm handler constructs the funding transaction, SDK obtains a mocked recent block and opens the MyNearWallet signing popup. The intercepted unsigned payload is decoded and checked for exact signer, receiver, fund method, 0.10 NEAR attached deposit, 0.05 NEAR storage argument and gas. All intent, RPC and wallet responses in this test are isolated/intercepted; no private owner key, real signature or broadcast is used. This proves handoff/serialization, not external wallet approval or final settlement. Build/TypeScript and targeted lint pass.

Read-only inspection found the user's saved fund reviews prepared but expired, with no transaction hash recorded. No new funding request was created or submitted by the agent. User should refresh, enter funding/storage values and prepare a fresh review before manually approving in the wallet.
# 2026-10-31: saved evidence refresh

Six source-intake tests pass, including AI re-check with no additional provider call, unchanged artifact/mandate/balance, report history retention, and rejection of changed CSV/source/report, expired mandates and agreement-bound sources. TypeScript passes. Owner-funded escrow now shows 0.05 NEAR available and 0.04926 NEAR storage credit; this is funding evidence, not completed provider payout acceptance.
