# Test STYX locally

Run `npm run dev` and open [Local testing](http://127.0.0.1:4173/testing). The workspace sidebar and overview also link to it.

Choose one of eight cases. Each creates a real job containing 30 synthetic invoice files, with a 5.00 demo-unit budget cap. Starting a case does not approve a mandate, reserve funds or pay anyone. Approve the mandate yourself, select a provider quote and inspect the result.

| Case                      | Expected result                                            |
| ------------------------- | ---------------------------------------------------------- |
| Successful delivery       | Verified CSV; owner acceptance creates a demo receipt.     |
| Slow provider             | About three seconds processing, then delivery.             |
| Provider timeout          | Needs attention; no delivery or payment.                   |
| Invalid CSV fields        | Empty invoice identifier fails verification.               |
| Missing invoice           | Source coverage fails; inspect missing-input evidence.     |
| Changed amount            | Independent source/arithmetic verification fails.          |
| Changed payment recipient | Security blocks payment and shows recipient evidence.      |
| Payout failure            | Acceptance fails; no paid receipt; reservation stays held. |

Use correction to retry a failed delivery normally, or cancel to release a held reservation. Runs remain in your workspace and appear on their case cards after refreshing. The case count means cases started, not tests passed. Existing jobs are preserved; there is no destructive reset button.

These cases force local processing and require no cloud storage, AI key, wallet, GitHub or Vercel. They use the workspace's demo balance. Private original documents and generated CSV files stay in the local application database. Owner/viewer permissions still apply: viewers cannot start test jobs.

Cloud authentication, off-device backups, real AI and blockchain payments require separate verification; these sample cases do not establish that those integrations work.

Wallet connection is available separately at `/testnet` even before contract setup. Use the link on Local testing, select MyNearWallet, and complete testnet login in the wallet. Transactions remain unavailable until the reviewed contract and separate role signers are configured. Wallet login and live signing are separate from the local sample cases.
