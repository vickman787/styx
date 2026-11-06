import type { NearIntent } from "../lib/settlement/near-types";

export function walletRequestExpiry(
  intent: NearIntent,
  agreementExpires?: number,
) {
  if (intent.action === "refund") return intent.expires;
  const mandate = intent.transaction.actions[0]?.params.args.mandate;
  const embeddedExpiry =
    intent.action === "approve" &&
    mandate &&
    typeof mandate === "object" &&
    "expires" in mandate &&
    typeof mandate.expires === "number"
      ? mandate.expires
      : Infinity;
  return Math.min(
    intent.expires,
    intent.agreementExpires ?? Infinity,
    agreementExpires ?? Infinity,
    embeddedExpiry,
  );
}
export function checkWalletRequest(
  intent: NearIntent,
  agreementExpires?: number,
) {
  if (
    intent.state !== "prepared" ||
    walletRequestExpiry(intent, agreementExpires) <= Date.now()
  )
    throw Error(
      "This signing request or its agreement has expired. Close review and prepare a fresh review or agreement before signing. No transaction was sent.",
    );
}

export function chooseOwnerKey(
  keys: string[],
  walletKey: string,
  previous = "",
) {
  if (walletKey && keys.includes(walletKey)) return walletKey;
  if (keys.includes(previous)) return previous;
  return keys.length === 1 ? keys[0] : "";
}

export function checkWalletSigningKey(
  intent: NearIntent,
  walletId: string,
  accounts: { accountId: string; publicKey?: string }[],
  fullAccessKeys: string[],
) {
  if (
    walletId !== "meteor-wallet" ||
    !["approve", "release", "refund"].includes(intent.action)
  )
    return;
  const mandate = intent.transaction.actions[0]?.params.args.mandate;
  const expected =
    intent.ownerKey ||
    (intent.action === "approve"
      ? mandate && typeof mandate === "object" && "owner_key" in mandate
        ? mandate.owner_key
        : undefined
      : undefined);
  const account = accounts.find(
    (a) => a.accountId === intent.transaction.signerId,
  );
  if (!account)
    throw Error(
      "Switch Meteor to this agreement’s owner account before signing.",
    );
  if (typeof expected !== "string" || !fullAccessKeys.includes(expected))
    throw Error(
      "The agreement key is not in the verified full-access key list. Refresh wallet keys before signing.",
    );
  // Meteor getAccounts() reads its SDK-local connection key. That key is not
  // necessarily the full-access key used by the wallet popup to sign.
  // Even if the local key is FullAccess, it does not prove which key the
  // popup will use. The contract and finalized receipt enforce expected.
}
