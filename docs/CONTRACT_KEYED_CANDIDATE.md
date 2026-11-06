# Keyed-storage contract candidate — 3 November 2026

The deployed whole-map artifact is suitable only for the existing small testnet pilot. It is **not approved for public rollout**. The VM scale reproduction fails on its payout callback at 100 stored jobs; the job remains PaymentPending. Existing small-case and owner acceptance receipts are still valid evidence for those runs, not capacity guarantees. See [legacy scale reproduction](verification/near-vm-scale-report.json).

The separate `persistent-state` candidate fixes the growing callback work by storing jobs, owner balances, used quotes, withdrawals and storage credits in independent keyed maps. Per-owner reservation and pending-withdrawal counters replace full-history scans. Each call loads the exact records into the same tested policy engine, applies the transition, then persists the affected records. Quote IDs remain globally replay-protected, and callbacks still enforce private predecessor, attempt and pending-state checks. The existing 15 Tgas callback allocation is retained.

**Candidate code hash:** `Fvxj2r1j4k9fJXpPzVDGUoeRQ8SNZWHfsfbJ1Dsf6fZW`.

| Stored jobs | Legacy payment callback | Candidate payment callback |
| --- | --- | --- |
| 1 | 2.255 Tgas | 2.729 Tgas |
| 10 | 4.010 Tgas | 2.734 Tgas |
| 25 | 6.880 Tgas | 2.744 Tgas |
| 50 | 11.417 Tgas | 2.739 Tgas |
| 100 | Callback fails; job remains pending | 2.735 Tgas; Paid confirmed |

The candidate benchmark executes 100 approvals and five full reserve/deliver/attest/release paths: 121 measured transactions including initial funding. All five transfers and callbacks complete. These are local sandbox measurements, not public-network throughput, maximum-capacity certification or an independent audit. [Candidate scale report](verification/near-vm-scale-keyed-report.json).

The expanded VM safety run passes 30 measured transactions and 11 checks: real deposits/storage charges, unauthorized approval rollback, storage-credit failure rollback, private callback rejection, real payment and duplicate-payment rejection, withdrawal callback, failed-transfer recovery/refund, owner isolation/global quote replay, and aggregate reservation counters across multiple jobs. [Candidate VM report](verification/near-vm-keyed-report.json). The native policy engine also passes its 15 tests.

## Reproduce without changing the deployed artifact

Keep the existing reviewed WASM under `contracts/styx/target/` intact. Build the candidate separately:

```powershell
cargo build --manifest-path contracts/styx/Cargo.toml --target wasm32-unknown-unknown --features persistent-state --release --offline --target-dir data/contract-candidate
node --import tsx scripts/near-vm-smoke.ts --candidate
node --import tsx scripts/near-vm-scale.ts --candidate
```

The VM scripts accept only the fixed loopback RPC on port 3030 and reject mainnet/testnet chain IDs. They use the sandbox validator and newly generated simulated accounts. Run the VM safety and scale scripts sequentially because both create accounts through that validator. `--candidate` writes separate evidence files and never replaces the deployed-artifact evidence or application configuration.

## Deployment boundary

This candidate has a different serialized state layout (`keyed/v3`) while retaining the existing transaction API. **Fresh contract deployment is required. Do not deploy it over the current funded contract.** No migration method is provided. On 3 November it was deployed fresh to `styx-contract-bf76f42ba5.testnet` and activated locally. Finalized hash, configuration, and all four restricted service-key scopes/allowances were verified. [Deployment evidence](verification/keyed-testnet-deployment.json). The original funded contract remains unchanged; its saved receipts are accessible under Earlier contract history.

Next perform [owner-wallet acceptance](KEYED_WALLET_ACCEPTANCE.md), including ParseLab and reservation release. Handle any remaining legacy available escrow separately with an explicitly reviewed owner withdrawal. Unused storage credit still has no withdrawal method. Independent review, more owner/withdrawal/record-size benchmarks and storage-credit cleanup remain open before broader funded use.
