# Escrow testing and limits

## 3 November 2026 — measured capacity defect and separate fix

The deployed whole-map artifact reproduced a payout-callback failure at 100 stored jobs; public readiness now blocks that artifact. A separate `persistent-state` candidate replaces whole-history serialization/scans with keyed records and per-owner counters. It passed 100 job approvals/five actual sandbox payouts (121 measured transactions), with the 100-job callback using 2.735 Tgas under the same 15 Tgas budget. The expanded candidate VM safety suite passed 30 transactions including multi-owner isolation, global quote replay, independent reservation refunds and failed-transfer recovery. See [candidate design, evidence and fresh-deployment boundary](CONTRACT_KEYED_CANDIDATE.md). It is not deployed over the funded contract and is not independently audited. The historical small-case results below remain valid for their original scope.

Run the policy engine independently of NEAR SDK host dependencies:

```powershell
npm run test:contract
```

The optional SDK host suite exercises the actual Rust contract wrapper against NEAR SDK's `MockedBlockchain`: account/predecessor/key context, storage writes and credits, emitted transfer/callback receipts, and successful/failed promise results.

```powershell
npm run test:contract:sdk
```

This suite uses the `sdk-tests` feature and additional native cryptographic dependencies. It does not execute compiled WASM, simulate transaction-level rollback after panic, or connect to a validator. Storage byte changes are observable in the SDK host; its native execution does not charge WASM instruction gas for Rust serialization. A small-case host gas assertion therefore cannot certify the 15 Tgas callback budget on-chain or at scale.

On Windows, a complete MSVC Rust toolchain and Visual Studio C++ Build Tools may be needed for these dependencies. The default GNU Rust distribution's self-contained linker does not provide a complete C/assembler toolchain. From a Visual Studio x64 developer prompt, a matching installed toolchain can be selected explicitly:

```text
cargo +1.97.1-x86_64-pc-windows-msvc test --manifest-path contracts/styx/Cargo.toml --features sdk-tests -- --nocapture
```

No global Rust default needs to be changed. SDK crypto dependencies may require additional native compiler/assembler tools. Use a supported Linux build environment if the Windows dependency build remains unavailable. Successful policy tests or WASM compilation do not imply the SDK suite passed; actual execution results are recorded in [verification evidence](verification/RESULTS.md).

## Contract hardening

Both callbacks explicitly check that the predecessor is the contract itself, in addition to the SDK's private entry-point guard. Each callback requires exactly one promise result. The engine binds payment callbacks to the saved attempt and rejects replay; withdrawal callbacks finalize only a pending withdrawal.

Job, quote and withdrawal identifiers must be nonempty, contain no control characters and be at most 128 UTF-8 bytes. Checks-version identifiers are 1–64 bytes; domains are at most 100 bytes; a mandate allows at most eight recipients, with role/recipient account strings limited to 64 bytes and role keys to 128 bytes. The wrapper also parses all configured role accounts, role public keys and recipient accounts before approval. Hashes remain exactly 64 ASCII hexadecimal characters. These checks reject malformed configuration before it becomes an immutable on-chain agreement. They bound individual stored records; they do not bound total contract state.

## Remaining deployment gates

Update 27 October 2026: compiled WASM now runs in the official NEAR sandbox under Ubuntu. The 18-transaction smoke passed deployment/init, deposits, transfer/withdrawal callbacks, unauthorized actions, storage rollback, payout replay rejection and failed-transfer recovery. The matching artifact is deployed on public testnet. See [actual VM report](verification/near-vm-report.json) and [live guide](TESTNET_LIVE.md). The Windows SDK host suite remains unexecuted; scale measurements and independent review are still open. The paragraph below describes the broader VM/scalability coverage still to expand, not a claim that VM execution is unavailable.

Execute compiled WASM in a NEAR sandbox/VM and test entry-point deserialization, attached-deposit restrictions, private callbacks, rollback after storage failure, promise graph execution and failed-transfer refunds. Measure actual gas and storage across increasing job/account counts, including callbacks with the full serialized state. Whole-map serialization remains a scalability risk, and unused storage-credit withdrawal/record cleanup is still absent. No funded deployment is authorized or performed by running these local tests.

Official API references: [NEAR SDK test utilities](https://docs.rs/near-sdk/5.29.1/near_sdk/test_utils/index.html), [testing environment macro](https://docs.rs/near-sdk/5.29.1/near_sdk/macro.testing_env.html), [promise API](https://docs.rs/near-sdk/5.29.1/near_sdk/struct.Promise.html).
