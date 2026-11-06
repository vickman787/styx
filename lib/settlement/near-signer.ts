import { Account, JsonRpcProvider, KeyPairSigner } from "near-api-js";
import type { NearTransaction } from "./near-types.ts";
import type { Role } from "./near-config.ts";
export async function signRoleTransaction(
  role: Role,
  tx: NearTransaction,
): Promise<string> {
  const signer = KeyPairSigner.fromSecretKey(
    role.secret as `ed25519:${string}`,
  );
  const provider = new JsonRpcProvider({
    url: "https://test.rpc.fastnear.com",
  });
  const account = new Account(role.accountId, provider, signer);
  const action = tx.actions[0].params;
  // SDK owns nonce/block-hash selection; do not log signer objects or private keys.
  try {
    const outcome = await account.callFunctionRaw({
      contractId: tx.receiverId,
      methodName: action.methodName,
      args: action.args,
      gas: BigInt(action.gas),
      deposit: BigInt(action.deposit),
      waitUntil: "FINAL",
    });
    return outcome.transaction.hash;
  } catch {
    throw Error(
      "Testnet role submission failed or timed out. Reconcile the saved intent and chain state before retrying.",
    );
  }
}
