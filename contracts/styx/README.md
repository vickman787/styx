# STYX NEAR testnet escrow infrastructure

Current capacity finding (3 November 2026): the deployed whole-map layout fails its payment callback at 100 stored jobs. A separate keyed-storage candidate passes the 100-job benchmark and expanded 30-transaction VM safety suite. It requires a fresh deployment and is not active on the funded contract. See [candidate design and evidence](../../docs/CONTRACT_KEYED_CANDIDATE.md). Historical small-case results below do not establish scale safety.

The dependency-free Rust `Escrow` engine is the exact policy implementation called by the `near` feature wrapper. Native tests cover principal/key separation, recipient/cap/asset/expiry restrictions, cumulative reservations, quote replay, report binding, changed artifacts, failed transfers, stale callbacks and payment/refund races.

```powershell
cargo test --manifest-path contracts/styx/Cargo.toml
cargo test --manifest-path contracts/styx/Cargo.toml --features sdk-tests
cargo build --manifest-path contracts/styx/Cargo.toml --target wasm32-unknown-unknown --features near --release
```

Entry points: `new`, payable `fund(storage_deposit)`, `approve`, `reserve`, `deliver`, `attest`, `release`, private `on_transfer`, `refund`, `withdraw`, private `on_withdrawal`, `get_balance`, `get_job`, `get_withdrawal`, `get_config`. Use distinct owner/agent/verifier accounts **and** distinct configured public keys. Mutations that grant capabilities require direct signed calls and validate the principal/key pair. Owner funding is a deposit; agent reservation is deposit-free and must use a restricted key scoped to the deployed contract and authorized methods. Mandates use the domain `styx:testnet:<contract-account>` and asset `near:testnet:native:24`.

Callbacks additionally enforce their predecessor in the method body. Stored identifiers and mandate fields now have explicit per-record size limits, and approval validates role account/key formats. The optional SDK host suite, its compiler requirements and the distinction from real WASM execution are documented in [contract testing](../../docs/CONTRACT_TESTING.md).

Amounts in the contract are integer **yoctoNEAR**, never local demo cents. Contract JSON encodes 128-bit amounts as decimal strings to avoid JavaScript number precision loss. A mandate version uses a unique onchain job/version identifier; the immutable engine rejects identifier reuse. Recipient is an allowlisted provider account. Provider records an artifact hash, then the separately authorized verifier submits its attestation. Owner release must accept that exact artifact hash. Release locks the job before issuing an asynchronous NEAR transfer. Only the private callback marks Paid; failure restores Reserved and clears verification so owner payment cannot be silently retried. Refund releases a reservation into internal available escrow and cannot race a pending/paid transfer.

v2 adds owner withdrawal of available escrow: funds lock before the promise, transfer only to the signing owner, and restore once on failure. Pending reservations cannot be withdrawn. Storage credits are separate from spendable escrow; state growth debits the relevant owner's credit. Unused storage credit has no external withdrawal method. Serialized maps and callback gas budgets need VM measurement and scalability work. **Fresh v2 deployment required**: v1 serialized state is incompatible and no migration is supplied.

**Deployed to testnet on 27 October 2026; no independent audit.** The exact compiled WASM passed an actual NEAR sandbox VM smoke with 18 transactions covering deposits, payout/withdrawal callbacks, storage panic rollback, unauthorized actions and failed-transfer recovery. The public testnet deployment and restricted service keys are confirmed; its code hash matches that artifact. See [live setup](../../docs/TESTNET_LIVE.md) and [VM evidence](../../docs/verification/near-vm-report.json). Actual user-wallet login/signing, public-network settlement, large-state gas/storage scaling and independent review remain acceptance work. A small-case VM pass is not a scalability guarantee.

Official references checked during implementation:

- [NEAR SDK 5.29.1](https://docs.rs/near-sdk/5.29.1/near_sdk/)
- [Promise transfers and callbacks](https://docs.rs/near-sdk/5.29.1/near_sdk/struct.Promise.html)
- [Access key restrictions](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [NEAR RPC network endpoints](https://docs.near.org/api/rpc/providers)
- [NEAR AI Cloud request example](https://near.ai/models/deepseek/deepseek-v3.2)
