# NEAR testnet console

Current status (2 November 2026): the contract is deployed, code hash and service key restrictions are verified, the compiled WASM passed a real sandbox VM smoke, and the owner completed the real funding-to-payment journey through Meteor. LedgerWorks and ParseLab now have distinct configured testnet service accounts; only LedgerWorks has a complete owner-paid acceptance run. Use the [live setup and testing guide](TESTNET_LIVE.md) for the current localhost profile, receipts and public deployment links. The manual provisioning steps below are for a fresh installation.

Open `http://127.0.0.1:4173/testnet` or choose **Testnet escrow** in the workspace. This optional console signs real testnet transactions when configured. Existing jobs, demo credits and local receipts remain separate. A verified local delivery becomes the evidence for a new, explicitly priced NEAR agreement; there is no exchange rate from demo units.

## What is implemented

- MyNearWallet connection through the official NEAR Wallet Selector, restricted to testnet. Owner private keys remain in the wallet. Owner approval, funding, withdrawal, acceptance/release and reservation refund require explicit wallet confirmation.
- Independently configured buyer agent, provider and verifier server signers. The server cannot sign owner actions. Each action has a persisted, reviewable transaction intent containing its signer, receiver, method, arguments, gas and deposit.
- Final RPC reconciliation binds the transaction hash, signer, receiver, actions, arguments, gas, deposit and owner key where required. Only `FINAL` success with no failed receipt, plus the expected final contract state, creates a paid receipt. The explorer link is formed from that validated hash.
- Exact decimal-string yoctoNEAR accounting, owner-specific escrow balances, separate storage credits, reservation protection and asynchronous owner withdrawal callbacks. Failed withdrawals restore available escrow once. Failed provider transfers preserve reservations and clear the attestation.
- Network, contract version/domain and compiled code-hash checks before preparing/submitting transactions. No arbitrary RPC URL is accepted from the browser.

## Configuration and deployment prerequisites

Dedicated contract/service accounts and restricted keys have been provisioned. Contract deployment, live RPC reads and the owner Meteor funding-to-payment walkthrough are verified. Actual WASM VM deposits, transfers, callbacks and rollback passed in the sandbox. Independent review, second-provider owner acceptance, failure-path operator acceptance and larger-state gas/storage validation remain open.

1. Compile the v2 WASM with the command in `contracts/styx/README.md`. Review/test it in a NEAR VM environment. **Use a fresh contract account and initialize `new` exactly once.** v2 adds withdrawal/storage maps and is incompatible with v1 serialized state; this repository does not contain a state migration.
2. Deploy the reviewed artifact to a named `.testnet` contract account. Deployment is an operator action, not performed by the app. Keep the deployment account/key outside the application. Determine the deployed `code_hash` via finalized `view_account` and compare it with the locally compiled artifact hash. `node scripts/near-code-hash.mjs` prints the local base58 SHA-256 hash without contacting a network.
3. Configure `.env` from `.env.example`. Set `NEAR_CONTRACT_ID`, `NEAR_CONTRACT_CODE_HASH`, independent agent/verifier/provider account IDs and Ed25519 private keys. Set an explicit `NEAR_LEDGERWORKS_PRICE_NEAR`; ParseLab is optional and requires its own account/key/price. Distinct roles need distinct accounts and keys. Never configure an owner private key on the server.
4. Install role keys on their own accounts as restricted function-call keys for this contract: agent `reserve`, provider `deliver`, verifier `attest`. Give them an appropriate gas allowance, which is **not** a spending cap. Restricted keys cannot attach deposits; the owner funds through their wallet. This console does not install keys or fund role accounts.
5. Restart with `node --env-file=.env --import tsx server/index.ts`. Environment changes require a restart. Keep loopback binding; this is a trusted local development workspace, not a multiuser service.

Do not paste secrets into chat, screenshots, source files or the browser. The status API returns role account IDs/public keys and configuration field names only. Invalid private key values are redacted from errors.

## Owner workflow

1. Complete a local job until its independent verification passes. Source reports expire within one hour; request a correction/reverification if needed.
2. Connect the owner testnet wallet. Select its full-access Ed25519 **public** key. The wallet must sign owner approval/release with that same key; a different key is rejected. No owner access key is granted to the server or model.
3. Enter a testnet funding amount and a separate storage deposit, review the exact transaction, then confirm in the wallet. Storage deposit defaults to 0.01 NEAR as an editable example, not a guaranteed sufficient amount. Available escrow excludes storage credits. Insufficient storage credit causes a transaction failure rather than spending reserved funds.
4. Select the verified delivery, configured provider quote and an explicit NEAR cap. Prepare the separate agreement, review its immutable mandate, then approve in the owner wallet.
5. Review/submit the agent reservation, provider hash delivery and independent verifier attestation using their separate server roles. Source bytes/report and expiry are checked again before delivery/attestation/release. Invoice contents never go onchain; hashes and account associations are public.
6. Review owner acceptance/release and confirm in the wallet. A paid receipt appears only after finalized transfer/callback success is reconciled. Reservation refund returns funds to internal available escrow. Review a withdrawal separately to transfer available escrow back to the signing owner; reserved funds cannot be withdrawn.

## Interrupted transactions and remaining limits

Saved intents survive server restarts. Wallet redirects carry the intent ID and transaction hash; reopen the console to reconcile. A pending transaction must be reconciled, not blindly resubmitted. The requests panel accepts a transaction hash for manual reconciliation if the redirect was interrupted. Only the exact saved transaction can confirm that intent. Hash reuse across intents is rejected.

A server signer timeout may occur after broadcast without returning a hash. Such an intent remains submitted and automatic retry is blocked. An operator must locate the transaction using the role account history, reconcile it, and investigate absence/failure before any new submission. There is no automatic account-history discovery or forced reset UI. Failed transfer receipts never produce a success receipt. Failed provider payment requires fresh verification before any retry.

Unused storage credit remains in the contract; external storage-credit withdrawal/record cleanup is not implemented. Serialized maps rewrite whole contract state and need bounded storage/gas scalability work. Storage economics and the 15 Tgas callback budget require VM measurement. Historical intent reconciliation expects the relevant contract state and may need operator investigation if another client has already advanced the agreement. Provider quotes are configured prices from demo-owned services, not authenticated third-party commercial offers. The verifier/server/database remain trusted; this is not a proof of invoice authenticity or trustless verification.

Wallet dependency review remains open; current recorded findings are in `BUILD_QUEUE.md`. Do not force a breaking SDK downgrade to clear an audit report. The lazy-loaded wallet bundle retains upstream eval/browser-util and size warnings. Isolated browser tests exercise SDK serialization and popup handoff without broadcasting. Separately, the owner completed actual Meteor approval and release on testnet; that live acceptance is recorded in `docs/verification/RESULTS.md`. The SDK remote font import is removed so chooser loading does not depend on Google Fonts.

## Sources

- [NEAR RPC transaction finality](https://docs.near.org/api/rpc/transactions)
- [Wallet Selector wallet API](https://github.com/near/wallet-selector/blob/main/packages/core/docs/api/wallet.md)
- [MyNearWallet module](https://github.com/near/wallet-selector/blob/main/packages/my-near-wallet/README.md)
- [NEAR access key restrictions](https://docs.near.org/protocol/accounts-contracts/access-keys)

## Connect a wallet before contract setup

You can test wallet connection on localhost without Vercel, GitHub or a deployed contract. From Local testing choose **Connect a NEAR testnet wallet**, or open `/testnet` directly. Click **Connect testnet wallet**, choose **MyNearWallet**, and create/sign in to a testnet account in the wallet. After the wallet returns to STYX, your account should appear with a Disconnect action. Reopening the page restores the wallet selector's session.

Connection only identifies the selected testnet wallet account. Funding, balance queries against escrow, agreement preparation and settlement still require the configured reviewed contract, matching code hash and signing roles described above. Disabled transaction buttons reflect that missing setup. Do not use a mainnet wallet for this test. STYX does not request your seed phrase or private key.

The browser checks verify that the chooser opens without contract configuration and funding/withdrawal remain disabled. Actual wallet login, redirect and signing require your own wallet interaction and remain live acceptance steps.

## Header wallet

Connect wallet is now available in the top bar throughout the workspace on desktop and mobile. It opens the testnet chooser directly. Once connected, click the account name for the full account ID, testnet label, escrow link and Disconnect wallet. The AS settings shortcut has been removed; use the explicitly named Settings navigation item for settings. Actual wallet login remains a user acceptance step.
