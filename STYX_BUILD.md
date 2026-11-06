# STYX — Product, UI/UX, and Implementation Brief

Version: 1.0 · Prepared 26 October 2026 · Reissued copy

## 1. Instruction to the coding agent

Build STYX in the project folder containing this file. Deliver working code, not only a plan or static screens. Read this entire document, inspect the repository and applicable repository instructions, preserve existing work, then implement the required scope. Make routine implementation decisions yourself and record them. Ask only for information that actually blocks progress. Do not start another chat or delegate work unless the user requests it.

Use the Canva references below as visual references and this document as the functional specification. Rebuild the interface as responsive HTML/CSS and accessible components. Do not ship screenshots as the application interface. Do not copy transcription mistakes, inconsistent numbers, or inaccessible text from generated designs.

Start with a brief plan, then implement, run meaningful checks, inspect the UI in a browser, fix failures, and write exact setup/run instructions. Keep `IMPLEMENTATION_STATUS.md` current with completed work, evidence, limitations, and credential-dependent work. Continue independent work when an external integration is blocked. Never claim an untested integration works.

## 2. Product definition

**STYX helps owners give agents a measurable job and a limited budget, hire a service, verify its delivery, and settle payment under approved rules.**

First customer: a small business buying invoice-to-CSV processing services through an assistant.

Core request: “Convert these 30 October invoices into an accounting CSV. Spend at most 5 demo units. Account for every invoice, reconcile totals, and flag duplicates and uncertain fields.”

One complete journey:

1. Create a job and attach invoices.
2. Review and approve structured spending rules and acceptance checks.
3. Obtain quotes from two provider services.
4. Select an allowed quote and reserve its price from the approved budget.
5. Run the provider and receive a real downloadable CSV.
6. Independently validate delivery and display the report.
7. In the default mode, the owner confirms acceptance before payment.
8. Release payment once, show settlement evidence, and produce a receipt.

The advanced contribution is the connection between a versioned job agreement, reserved funds, verifiable delivery evidence, and settlement. A spending dashboard alone does not satisfy the brief.

## 3. Canva source of truth and logo

The designs were generated in Canva and converted into editable elements. They are design references, not source code, a validated design system, or a functioning prototype. Some elements may need manual refinement. The main file has eight pages; page 8 is portrait mobile.

### Main editable file

- [STYX — App UI & UX](https://www.canva.com/d/SRB70nYdQ5Oe47u)
- Canva design ID: `DAHZGnKrgH0`
- Page order: Overview; Create job; Review mandate; Provider quotes; Review delivery; Blocked payment; Receipt; Mobile job detail.

### Exact existing logo

- [STYX logo in Canva](https://www.canva.com/M/MAHZGTgjTdw)
- Canva media ID: `MAHZGTgjTdw`
- Appearance: angular interlocking S, ivory with a mint segment, uppercase STYX wordmark on black.
- Preserve this identity. Obtain the original asset through Canva tools or normal export where possible. Store local brand assets under `public/brand/`. Prefer an SVG if a genuine vector export exists; otherwise use the best available raster asset without inventing vector provenance.
- Do not redraw an unrelated S, replace the logo with an icon-library shield, or ask a generator to reinterpret it.
- If original export is unavailable, document it and use a clearly temporary text wordmark while finishing the application. Do not pretend the exact asset was imported.
- Use full mark in desktop sidebar and receipt; compact mark in mobile header and favicon only when a suitable exported icon asset is available. Give meaningful images accessible labels; decorative repetitions should be hidden from assistive technology.

### Individual screen references

| Page | Screen | Original image | Editable source design ID |
| --- | --- | --- | --- |
| 1 | Overview | [Open screen](https://www.canva.com/M/MAHZGct7peY) | `DAHZGRH3VZg` |
| 2 | Create job | [Open screen](https://www.canva.com/M/MAHZGWv-424) | `DAHZGkTLjyM` |
| 3 | Review mandate | [Open screen](https://www.canva.com/M/MAHZGRGMboI) | `DAHZGm0u9Gg` |
| 4 | Provider quotes | [Open screen](https://www.canva.com/M/MAHZGfkOaJk) | `DAHZGtPiXg4` |
| 5 | Review delivery | [Open screen](https://www.canva.com/M/MAHZGczovTQ) | `DAHZGjUZUlI` |
| 6 | Blocked payment | [Open screen](https://www.canva.com/M/MAHZGTJc6Co) | `DAHZGoB3T34` |
| 7 | Receipt | [Open screen](https://www.canva.com/M/MAHZGUK12Mg) | `DAHZGtFS8Xs` |
| 8 | Mobile job detail | [Open screen](https://www.canva.com/M/MAHZGefEPDo) | `DAHZGkcL91I` |

Canva access can depend on the connected account. If the links cannot be inspected, use the design rules and screen specifications below, record that visual comparison is blocked, and keep building. Never claim to have viewed inaccessible designs. Do not embed expiring Canva CDN URLs as permanent application assets. Download/export permitted assets into the repository instead.

## 4. Visual direction: restrained and professional

Build an operations product where users can read rules, inspect evidence, and understand financial state.

```css
:root {
  --canvas: #f5f3eb;
  --surface: #fffefa;
  --sidebar: #101211;
  --text: #171b19;
  --muted: #606963;
  --border: #d8dcd5;
  --accent: #5be8c3;
  --accent-text: #10231c;
  --success: #17694e;
  --warning: #825511;
  --danger: #a33333;
  --radius: 6px;
}
```

- Desktop reference: about 1440×900; 224px sidebar, 64px toolbar, 32px content gutters. Adapt fluidly rather than forcing a fixed canvas.
- Use one well-supported sans-serif family, such as Inter, with system fallback. Body 14–16px, labels at least 12px, main headings around 28px. Use tabular figures for amounts.
- Use subtle borders and tonal hierarchy; keep actions and selected rows clear. Validate actual color contrast. Mint buttons need dark text.
- Use a consistent spacing scale of 4/8/12/16/24/32/48px.
- Use simple, consistent line icons only where they help comprehension. Icons supplement labels.
- Use compact financial summaries, readable tables, and purposeful forms. Display statuses with text as well as color.
- Avoid gradients, glow, glass effects, floating decorative objects, crypto coin art, AI sparkles, generic robot illustrations, oversized metric cards, fake charts, excessive rounded cards, and landing-page slogans inside the app.
- Use explicit copy: “Reserve & start”, “Request correction”, “Payment blocked”, “No funds moved”. Avoid vague “Optimize”, “Unlock”, “Revolutionize”, or “AI-powered magic”.
- Put the logo in brand touchpoints, not on every card or button.

Responsive behavior:

- Below roughly 900px, replace fixed sidebar with a compact header/menu.
- On mobile, stack evidence and payment summary; use a reachable primary action and Jobs / Activity / Settings navigation.
- Convert dense job rows into readable cards or deliberately horizontally scrollable tables with visible cues. No accidental page overflow.
- Respect reduced motion and visible keyboard focus. Include proper form labels, semantic tables, dialogs with focus management, and loading announcements.

## 5. Required screens and routes

Suggested routes may be adjusted to fit an existing router. Preserve the full workflow.

### `/` — Overview

STYX logo; Acme Studio workspace; navigation Overview / Jobs / Providers / Activity / Settings; network/mode label; Create job action. Show available funds, reserved funds, and spending as compact summaries derived from persisted records. Main jobs table: job, provider, budget, status, updated time. Search/filter and row navigation must work. Add recent activity with human-readable events. Include a useful empty state.

### `/jobs/new` — Create job

Steps: Brief / Rules / Review. Fields: task name, instructions, invoice uploads, output format, acceptance requirements, budget, deadline, allowed providers. Validate input and display inline errors. Persist a draft. Show filenames, sizes, accepted formats, and removable uploads. Explain supported document types; reject unsupported or encrypted files clearly. Review mandate must use actual submitted values.

### `/jobs/:id/mandate` — Review and approve rules

Present the exact budget cap, asset/network, permitted providers, recipient restrictions, expiry, acceptance-check versions, verifier identity, and approval mode. Owner approves a specific immutable version. Later rule changes require explicit reapproval and invalidate incompatible quotes. Agent-supplied instructions cannot silently alter approved rules. Explain that arithmetic/schema checks do not prove every field is semantically correct.

### `/jobs/:id/quotes` — Compare providers

LedgerWorks and ParseLab return quotes via a shared provider interface. Show exact price, estimated time, capabilities, expiration, and recipient. Select a provider; show the reservation amount and remaining allocation before Reserve & start. Expired quotes cannot be accepted. Disable invalid choices with a reason. Selecting a row must not itself spend funds.

### `/jobs/:id` — Running job and delivery review

Display honest execution states and timestamps. When delivered, expose CSV download and preview with evidence-backed flags. Verification rows: schema, invoice coverage, arithmetic, duplicate detection, uncertainty flags. Right summary: reserved amount, provider, verifier, shortened output hash, approval mode. Default action: Accept & release [amount]. Secondary: Request correction. Repeated clicks/reloads cannot trigger duplicate settlement. Show RPC/payout failures as failures, not completion.

### `/jobs/:id/security` — Blocked payment

Display approved versus attempted recipient, amount, violated rule, timestamp, and “No funds moved” only when supported by evidence. Include Keep job paused and Review mandate. Do not include an instant bypass that defeats the approved policy. Use the same page for the demonstration of a malicious recipient change.

### `/jobs/:id/receipt` — Receipt

STYX logo; receipt/job IDs; provider; original cap; reserved amount; paid amount; unused allocation; asset/network; delivery link/hash; acceptance checks; verifier; approval and settlement timestamps. Offer CSV and printable/downloadable receipt. A browser print view is sufficient for receipt export if documented. Only show a real explorer link when there is a genuine confirmed transaction; otherwise say Local demo receipt. No invented transaction hashes.

### Supporting routes

- `/jobs`: working status filters/search and pagination if needed.
- `/providers`: two provider profiles, capabilities, quote behavior, and integration status. No invented ratings or user counts.
- `/activity`: persisted audit events, filters, reasons, and receipt links.
- `/settings`: workspace and mode settings, wallet connection when configured, default approval policy, integration readiness. Never expose private keys or API secrets.

Include loading, no-data, validation, provider timeout, verifier failure, insufficient funds, expired mandate, expired quote, failed payout, and successful settlement states.

## 6. Demonstration fixtures and money terminology

Canonical sample job: `STX-1042`, October invoices, 30 input files, approved cap 5.00, LedgerWorks quote 3.20, ParseLab quote 4.10, reserved 3.20, unused allocation 1.80. Deliver `october-invoices.csv`. Provide a seeded fixture set and a deterministic way to reproduce reported duplicates and uncertain fields. Never hard-code passing results independently of uploaded content.

Keep modes explicit:

1. **Local demo:** credits called “demo units”; no blockchain funds move. Deterministic fixture execution is labeled. Works without API keys or a wallet.
2. **NEAR testnet:** amounts are actual testnet NEAR (or a verified test token if deliberately implemented), with asset symbols and real receipts. Testnet NEAR is not USD; do not present a 5 NEAR cap as $5. Do not silently equate demo credits and stablecoin dollars.
3. **Mainnet:** out of required scope and disabled by default.

Seeded ledger balances must reconcile with ledger entries. Unused allocation means cap minus accepted quote; distinguish it from a completed refund transfer. Refunding a canceled reservation is a separate stateful operation.

The app should default to owner-confirmed payout. Automatic payout is optional and requires a separately approved mode and passing checks. This resolves the design's manual acceptance button with the longer-term autonomous-commerce vision.

## 7. Recommended implementation structure

Use existing repository choices if sound. For a fresh project, a reasonable default is TypeScript, Next.js with a server runtime, React, Tailwind CSS, a small accessible component library, and simple line icons. Use a real database: SQLite for local development with a migration path to Postgres. Use a schema validator, migrations, and environment validation. Pick compatible maintained package versions after checking current official documentation; commit a lockfile.

```text
app/ or src/app/       routes and server handlers
components/           shared UI and product components
lib/domain/           policies, jobs, money, state transitions
lib/providers/        provider protocol and adapters
lib/verification/     deterministic acceptance checks
lib/settlement/       local ledger and NEAR adapters
lib/storage/          private document and artifact handling
contracts/styx/       NEAR contract and contract tests
fixtures/invoices/    synthetic input documents and expected outcomes
public/brand/         original local logo assets
docs/design/          exported references, source inventory, screenshots
tests/                meaningful integration and browser tests
```

Do not overengineer microservices. The two providers can be separate modules/processes in the same repository with a documented HTTP protocol. Label demo-owned providers honestly; they are not independent commercial adoption.

## 8. Domain model and state machine

Persist at least Workspace, Job, MandateVersion, Upload, Provider, Quote, Reservation, Artifact, VerificationReport, Approval, SettlementAttempt, Receipt, and AuditEvent. Associate every private record with its workspace. Use authenticated authorization in any shared deployment; local demo identity is explicitly development-only.

Money is integer base units plus asset identifier and decimals. Never use binary floating point for financial calculations. Validate network and asset identity, not just display symbols.

```text
draft → awaiting_approval → quoting → quoted → reserved → running
running → delivered → verifying → ready_for_review → settlement_pending → settled
delivered/verifying → correction_requested → running
pre-settlement states → blocked / failed / expired / cancelled
eligible cancellation → refund_pending → refunded
```

Define allowed transitions explicitly. Verification failure cannot produce ready_for_review or settlement. A reserved job cannot be canceled in a way that permits both payment and refund. Final states cannot be replayed. Keep rejected actions in an audit trail without accepting their unauthorized state changes.

Acceptance report binds job ID, mandate version/hash, artifact hash, input manifest hash, check version, verifier identity, result, expiry, and network/contract domain where appropriate. Avoid signatures whose meaning can be replayed across jobs, networks, or deployments.

## 9. Provider and verification behavior

Provider interface: quote, start job, retrieve status, fetch delivery, and request correction if supported. Quotes bind provider identity, recipient, job scope/mandate hash, asset, price, expiry, and quote ID. Validate these on acceptance. Support deterministic slow, malformed-output, changed-recipient, and timeout scenarios for tests.

For the first working release, process synthetic text-based PDFs and/or structured CSV/JSON invoices. State exact supported formats in the UI. Implement genuine parsing/extraction for those formats. Add scanned-document OCR only after the supported path works. A configured model may extract fields using a strict schema; validate its output and retain source references. Do not send private documents to an external service without an approved configuration and a disclosed data path.

Buyer agent may structure a brief and recommend a quote. Provider agent may extract fields. Neither can approve its own payment or rewrite policy. Offer a configured model adapter, preferably a documented NEAR AI option for ecosystem fit; retain a clearly labeled deterministic local mode. Never label canned text as live inference.

Verifier requirements:

- CSV schema and required field validation.
- Input manifest coverage: every input mapped to an output record or explicit exception.
- Arithmetic consistency with a documented tolerance and currency grouping; never sum unrelated currencies together.
- Duplicates based on documented identifiers/content signals, with evidence.
- Uncertain fields must be flagged, not fabricated.
- Recompute artifact hash from actual bytes; reject changed artifacts.
- Explain what checks do not establish. A correctly summed invented invoice is not thereby authentic.

Version one can use an explicitly trusted server-side verifier. Its signature is evidence of attestation, not a trustless proof of document accuracy. A TEE is a later enhancement and cannot by itself establish business correctness.

## 10. Policy enforcement and NEAR integration

Required: implement a testable policy/escrow contract and a settlement adapter. Produce local contract tests even if deployment credentials are unavailable. Target NEAR testnet, verify current SDK/RPC/network details from official docs, and avoid invented endpoints or contract addresses.

Contract responsibilities:

- Accept owner-funded escrow and maintain per-owner available/reserved balances.
- Record owner-approved mandate versions and authorize the agent principal correctly.
- Restrict provider recipient, asset, cap, expiry, quote ID, and required verifier.
- Reserve funds atomically with policy validation.
- Require valid verification binding and the required owner approval before release.
- Prevent replay/double payment with a unique job/settlement identifier and explicit state transitions.
- Lock state before asynchronous transfer; process callbacks and restore/reconcile balances on failure. Report final settlement only after required successful receipts/finality checks.
- Handle expiry/refund races without paying and refunding the same reservation.
- Emit enough events for an auditable lifecycle, with no private invoice content onchain.

Important NEAR distinction: function-call key restrictions scope which contract/methods can be called. Their allowance is a gas allowance, not the business spending cap. These keys cannot attach NEAR deposits directly; design owner funding and restricted agent calls accordingly. Enforce actual spending limits in the contract, including cumulative reservations. Do not give the model an owner full-access key.

Keep owner, buyer agent, provider, and verifier roles distinct in authorization. Checking an owner account name alone is not sufficient if several authorized keys can call the same entry points; validate the intended authorized principal/key and capabilities for the selected design. No agent may call arbitrary owner-administration or funding methods.

NEAR Intents cross-chain funding is optional after native settlement works. Confirm current token support, funding route, confirmations, failure handling, and refund semantics first. Do not imply the swap and service escrow are an atomic cross-chain transaction unless you actually implement and prove that property.

No mainnet deployment, real purchases, wallet funding, token transfers, or paid third-party services are authorized merely by this build file. Finish code and local/test infrastructure; request missing credentials through normal secure channels. Never commit secrets or print private keys in logs.

## 11. Security and privacy implementation requirements

- Treat invoice text and provider output as untrusted data, never instructions granting payment authority.
- A deterministic policy layer rejects an attempted recipient change even if an LLM recommends it.
- Validate all API inputs and repeat critical checks on the server/contract, not only in disabled buttons.
- Use idempotency keys and database transactions/constraints where applicable.
- Store documents privately, use opaque IDs and authorized downloads, and avoid public upload directories. Validate size/type and avoid trusting filenames. Prevent path traversal and arbitrary URL fetching.
- Keep file content and secrets out of audit logs. Store hashes and minimum necessary metadata onchain; explain that hashes can still reveal associations and are not encryption.
- Redact sensitive telemetry. Do not claim encryption-at-rest, confidential inference, compliance certification, an audit, or trustlessness without implementation evidence.
- Add `.env.example`, ignore real environment files, and validate missing configuration clearly.

## 12. Build sequence

1. Inspect repository and current tools. Write a short implementation checklist and integration readiness record.
2. Acquire exact logo/reference assets when possible. Implement tokens, navigation, responsive shell, and base components.
3. Implement the state machine, persisted job flow, both provider adapters, real artifacts, and deterministic verifier. Make the local end-to-end journey work.
4. Implement the contract, settlement adapter, adversarial scenarios, and meaningful contract tests. Wire testnet when credentials are available.
5. Finish every required screen, accessibility, empty/error/loading states, responsive layouts, and exports.
6. Run application and contract checks. Inspect key desktop and mobile routes in a browser and compare against available references. Fix visible issues.
7. Write README, configuration/run commands, threat assumptions, known limitations, and a demo script. Provide screenshots and actual test results.

Do not sacrifice the complete local journey for a broad collection of unfinished integrations. A local mode is useful, but it is not proof of onchain settlement; keep deployment and integration readiness explicit.

## 13. Verification and definition of done

Required application checks:

- Typecheck, lint, and production build pass using repository scripts.
- One browser test creates a job, approves its mandate, accepts a quote, runs processing, verifies the artifact, accepts delivery, and sees a persisted receipt.
- Reloading and reopening a job preserves state and downloads remain authorized.
- Invalid/unsupported upload, missing input coverage, arithmetic mismatch, expired quote, insufficient balance, and provider timeout show actionable errors.
- Tampered artifact/verifier binding fails verification.
- Changed recipient, expired mandate, over-budget request, and simultaneous reservations cannot bypass policy.
- Repeated payment clicks/replayed requests produce at most one successful payout.
- Contract tests cover failed transfer callbacks and payment-versus-refund races.
- A malicious invoice instruction is treated as text and cannot change the approved recipient or spending limit.
- Check at least 1440px desktop and 390px mobile for layout, overflow, focus, contrast, and usable action placement. Save screenshots.

Required deliverables:

- Functional app implementing all eight reference screens and supporting routes.
- Working persisted local demo and fixture dataset with documented expected results.
- Contract source and substantive tests; deployment details only if actually deployed.
- Model integration adapter with honest live/fixture mode labels.
- Original brand assets where accessible and documented reference sources.
- `.env.example`, migrations, reproducible setup, and lockfile.
- `README.md`, `IMPLEMENTATION_STATUS.md`, and `docs/DEMO.md`.
- A concise final report: what works, exact commands run, test evidence, screenshots, and remaining external blockers.

Do not call the build complete while required functionality is a dead button, a fabricated success state, or an unreported mock. If credentials block testnet/live inference, deliver and verify everything independent of them and explicitly mark those capabilities unverified.

## 14. Demo story

Suggested three-minute sequence (a presentation recommendation, not a verified organizer video limit): create the invoice job; inspect the approved budget and recipient; compare quotes; attempt a malicious recipient change and show rejection; process legitimate invoices; inspect verification evidence; accept delivery; show the receipt and real transaction evidence if configured. Clearly identify demo-owned providers and local versus testnet execution.

No invented savings, customer adoption, performance numbers, or security guarantees. Record measured processing time, actual fees where applicable, fixture outcomes, and blocked requests.

## 15. Out of required scope

No new token, mainnet money, general-purpose agent marketplace, decentralized arbitration, guaranteed semantic truth, autonomous corporate formation, complete accounting platform, or speculative trading. Optional later enhancements: cross-chain funding through NEAR Intents, attested verifier execution, OCR, automatic payout under explicit policy, and external provider onboarding.

## 16. Useful official references

- [Hackathon website](https://nearhackathon.com/)
- [Official hackathon announcement](https://www.near.org/blog/near-hackathon-build-beyond-boundaries)
- [NEAR docs](https://docs.near.org/)
- [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [NEAR Intents docs](https://docs.near-intents.org/)
- [NEAR AI docs](https://docs.near.ai/)
- [Codex command reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli)

Verify current rules before submission. The reviewed announcement describes a November 1–14, 2026 build window, a public repository and X demo post, and one final submission per team. Do not let this handoff imply the project has been built, tested, submitted, or approved by judges.

## 17. Launch prompt and command

Move this file to the root of your intended project. Open that project in your coding assistant and paste:

```text
Read STYX_BUILD.md completely and implement STYX in this project. Treat it as the product and acceptance specification. Inspect the repository first, preserve existing work, and inspect the Canva references and exact logo when accessible. Build the full responsive application and persisted end-to-end flow, not a static mockup. Implement the contract and meaningful tests, keep local-demo and testnet behavior honest, and document any credential blockers while completing independent work. Make routine decisions yourself. Run the checks, inspect desktop and mobile layouts in a browser, fix issues, and provide exact run commands, evidence, and remaining limitations. Start implementing now.
```

If Codex CLI is already installed and authenticated, run from a PowerShell terminal in the project folder:

```powershell
codex 'Read STYX_BUILD.md completely and implement STYX in this project. Follow its product, Canva design, workflow, security, and acceptance requirements. Preserve existing work. Build and test the full app, inspect desktop and mobile layouts, and document real integration blockers. Start implementing now; do not stop at a plan.'
```

Use normal permission controls. Do not add flags that disable approvals or sandbox protections. Application setup/run commands must be generated from the actual resulting repository rather than guessed in advance.
