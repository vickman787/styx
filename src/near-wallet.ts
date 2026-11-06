import {
  setupWalletSelector,
  type WalletSelector,
} from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { actionCreators } from "@near-js/transactions";
import "@near-wallet-selector/modal-ui/styles.css";
import type { NearIntent } from "../lib/settlement/near-types";
import {
  checkWalletSigningKey,
  checkWalletRequest,
} from "./near-wallet-policy";
let instance: Promise<WalletSelector> | undefined;
export function selector() {
  if (!instance)
    instance = setupWalletSelector({
      network: {
        networkId: "testnet",
        nodeUrl: location.origin + "/api/near/wallet-rpc",
        helperUrl: "https://helper.testnet.near.org",
        explorerUrl: "https://testnet.nearblocks.io",
        indexerUrl: "https://test.api.fastnear.com/v0",
      },
      debug: false,
      modules: [
        setupMeteorWallet(),
        setupMyNearWallet({
          walletUrl: "https://testnet.mynearwallet.com",
          successUrl: location.origin + "/testnet",
          failureUrl: location.origin + "/testnet",
        }),
      ],
    }).catch((error) => {
      instance = undefined;
      throw error;
    });
  return instance;
}
export async function connect() {
  const s = await selector();
  setupModal(s, {
    theme: "light",
    description:
      "Connect your NEAR testnet wallet. Owner funding and payment always require wallet confirmation.",
  }).show();
}
export async function walletAccounts() {
  return (await selector()).store.getState().accounts;
}
export async function disconnect() {
  const s = await selector();
  if (s.isSignedIn()) await (await s.wallet()).signOut();
}
export async function sendToWallet(
  intent: NearIntent,
  current: {
    contractId: string | null;
    codeHash: string | null;
    ownerKeys: string[];
    agreementExpires?: number;
  },
) {
  if (
    intent.transaction.receiverId !== current.contractId ||
    intent.codeHash !== current.codeHash
  )
    throw Error(
      "Signing intent belongs to a different reviewed contract/code hash.",
    );
  checkWalletRequest(intent, current.agreementExpires);
  const s = await selector();
  if (
    !s.store
      .getState()
      .accounts.some((a) => a.accountId === intent.transaction.signerId)
  )
    throw Error(
      "Switch the connected wallet to the agreement owner before signing.",
    );
  if (["reserve", "deliver", "attest"].includes(intent.action))
    throw Error("This action belongs to a separate server role.");
  const wallet = await s.wallet();
  if (wallet.id === "meteor-wallet")
    checkWalletSigningKey(
      intent,
      wallet.id,
      await wallet.getAccounts(),
      current.ownerKeys,
    );
  checkWalletRequest(intent, current.agreementExpires);
  localStorage.setItem("styx-near-pending-intent", intent.id);
  const outcomes = await wallet.signAndSendTransactions({
    transactions: [
      {
        ...intent.transaction,
        actions: intent.transaction.actions.map(({ params }) =>
          actionCreators.functionCall(
            params.methodName,
            params.args,
            BigInt(params.gas),
            BigInt(params.deposit),
          ),
        ),
      },
    ],
    callbackUrl:
      location.origin + "/testnet?intent=" + encodeURIComponent(intent.id),
  });
  return outcomes?.[0]?.transaction?.hash;
}
