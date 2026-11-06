# Fresh keyed contract: owner acceptance

**Completed 5 November 2026.** ParseLab payment `C6YDJehSFfu1P1nFpL8EL1H3LX9hbS3mkGteXA57G2uG` paid 0.012 NEAR. Separate reservation release `ARcXLW2RA5NDnQVKidWjP3WEdo5VgUjKsEzthcUpqNoE` finalized as Refunded. Both were independently read from public RPC as FINAL success with no failed receipts, with matching contract states. [Evidence](verification/keyed-owner-acceptance.json). The steps below are retained for reproduction, not a request to pay again.

The local app now uses `styx-contract-bf76f42ba5.testnet` with reviewed code hash `Fvxj2r1j4k9fJXpPzVDGUoeRQ8SNZWHfsfbJ1Dsf6fZW`. [Finalized deployment and restricted-key evidence](verification/keyed-testnet-deployment.json).

This is a new contract. Its owner escrow starts at zero. The original contract `styx-contract-1effc31636.testnet` retains its funds, storage credit and paid receipt. The app shows its saved agreements under **Earlier contract history**, with receipt download/printing available. No old-contract funds were transferred. The old restricted configuration is preserved privately in `data/near-testnet/app.legacy-1effc31636.env`.

## ParseLab payment

1. Open `http://127.0.0.1:4173/testnet`, refresh once and keep Meteor connected to `kafanchan.testnet`. Confirm the live contract ends in `bf76f42ba5.testnet`.
2. In **Escrow balance**, enter **0.05** as Amount and **0.05** as Additional storage credit. Review funding: attached deposit is **0.1 testnet NEAR**, plus gas. Confirm only after checking the new receiver in Meteor. Storage credit has no withdrawal method yet.
3. Re-check a saved invoice if its verification expired, or upload your own CSV/JSON. Local parsing avoids an AI request. Select the current verified delivery.
4. Select **ParseLab · 0.012 NEAR** and set maximum spend to **0.012**. Prepare one fresh agreement. Review owner approval and confirm in Meteor.
5. On that agreement, review and submit **agent reservation**, **provider delivery**, then **verifier attestation**. Wait for each request to become confirmed before proceeding.
6. Review **Accept & release 0.012 NEAR**, check the owner transaction in Meteor, and confirm. Success requires the green confirmed receipt and a confirmed release request. Save a screenshot of those two sections.

Do not repeat a submitted transaction after a timeout. Reconcile its existing request and transaction hash first. Do not reuse an expired or earlier-contract agreement.

## Reservation release

After the payment, prepare a second fresh agreement from current verified evidence. Approve it and reserve funds, then use **Release reservation** before payment. Confirm in the owner wallet. Expected result: reservation released, reserved balance returns to zero, available escrow increases by the reserved amount, and no provider-payment receipt is created. This returns internal escrow; owner withdrawal is separate.

Both acceptance runs are complete as recorded above. Public access, independent contract review, storage-credit cleanup and hosting remain separate gates.
