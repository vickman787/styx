# NEAR AI invoice processing

The live testnet upload form now offers local parsing or NEAR AI. AI extraction runs only after an owner explicitly approves external processing and its separate API charges. Its actual CSV is checked independently against source documents before it can supply evidence for a NEAR agreement. The model never receives wallet keys or payment authority.

## Private configuration

Create an account at https://cloud.near.ai and generate a dedicated API key with a small usage limit. Credits are real API credits, separate from free testnet NEAR. NEAR AI's console manages credits, pricing and key limits; STYX does not purchase credits or set provider billing policies automatically.

For manual setup, run `npm run ai:setup` from the project terminal. It asks for the model ID and a hidden API-key input. Never paste a key into chat, screenshots, source code or browser configuration fields. The helper writes only `data/near-ai.env`, which is ignored along with the rest of `data/`. It does not overwrite NEAR contract or role keys. `npm run dev` and `npm start` load the optional private testnet file and then the optional AI file. Restart after configuration changes.

Server fields:

```dotenv
NEAR_AI_ENABLED=true
NEAR_AI_MODEL=deepseek/deepseek-v3.2
NEAR_AI_API_KEY=<private server-side key>
```

The example model is documented at https://near.ai/models/deepseek/deepseek-v3.2 with the chat-completions API. Select a model actually available to your account. STYX uses HTTPS but does not verify TEE attestations, gateway signatures or model identity cryptographically; it does not claim that proof.

`npm run ai:check` prints only configuration readiness and the model. It does not authenticate the key or prove inference works. `npm run ai:smoke` makes one real model request with a synthetic invoice, independently verifies its output and writes `docs/verification/ai-live-check.json`. It can incur API charges and does not automatically retry or make any payment. Run it only with an appropriately funded/limited API account. The in-memory smoke does not add sample records to your workspace.

## Owner workflow

Open `/app` or `/testnet`, upload structured JSON/CSV invoices, select NEAR AI and check the approval for sending invoice fields and paying API charges. Changing the engine clears consent. Submitting records the owner, processing policy and mandate hash before calling the model. The selected engine/model/endpoint and consent are immutable for that job. The invoice preparation has no demo quote, reservation or payment.

Input is limited to 50 invoice rows and 64 KiB of normalized data. Invoice fields, source references and notes go to `https://cloud-api.near.ai/v1/chat/completions`. Business instructions, provider pricing, caps, payment rules, wallet keys and signing credentials are not sent. The prompt treats document notes as data, never instructions. The server rejects redirects.

The resulting job and source picker show whether actual extraction used AI and which configured model. Failed extraction remains a failed job with a review link and an explicit correction/retry action. A retry can cost more. Local parsing is available as an explicit separate choice, never as a hidden success fallback.

A successful report is only invoice evidence. NEAR agreement preparation, wallet approval, separate agent/provider/verifier actions and owner release remain the chain workflow; actual finalized transfer/callback evidence is required for paid status. AI API charges are outside testnet escrow and are not limited by its NEAR cap. The provider's key spending cap is separate.

## Failure and validation

The request uses JSON-object mode and asks for an `invoices` array inside the object, with expected fields and known source IDs. Legacy bare arrays also pass through the same strict invoice validation. Refusals, truncation, malformed/oversized responses, unknown sources and payment fields fail. Independent verification checks the actual CSV against original source values, arithmetic and coverage, and flags duplicates and uncertain fields. Even schema-valid invented amounts cannot pass. No model output chooses the recipient, raises a cap, attests to its own payment or releases escrow.

Requests time out after 30 seconds; output is limited to 512 KiB and 8,192 requested tokens. Configuration/model changes stop an old policy before transmission. Upstream errors and credentials are redacted. Concurrent processing is locked; failure does not automatically retry. Interrupted processing needs explicit owner recovery. Distributed worker idempotency and comprehensive live model-quality/cost testing remain open.

## Current setup status

27 October 2026: the user funded the account with $1 in credits. The dedicated STYX-local key has a $1 usage limit and is saved only in ignored private configuration. The first inference incurred $0.0003 but its output was rejected. After adding JSON-object mode and safe validation-stage diagnostics, the user approved one additional synthetic check. It passed at 21:17:14 UTC using deepseek/deepseek-v3.2: CSV schema, invoice coverage, arithmetic/source match, duplicate detection, uncertainty flags, and artifact/mandate binding. See [actual inference report](verification/ai-live-check.json). No customer files or wallet payment were involved. This is one extraction check, not model-quality certification or cryptographic attestation.

All 85 application tests passed before the output-format fix; all 12 targeted model/source tests and build/TypeScript/lint passed afterward. Browser consent tests passed with readiness and submission mocked; those are separate from the actual inference evidence. Live RPC and own-invoice browser checks also passed. The local server has been restarted with the tested configuration.

Official setup reference: https://docs.near.ai/cloud/quickstart. Model request example: https://near.ai/models/deepseek/deepseek-v3.2.
