import { KeyPair } from "near-api-js";
import { accountPattern, parseNear } from "./near-types.ts";
export type Role = { accountId: string; publicKey: string; secret: string };
export interface NearConfig {
  contractId: string;
  codeHash: string;
  agent?: Role;
  verifier?: Role;
  providers: { id: string; name: string; price: string; role: Role }[];
  issues: string[];
}
export function nearConfig(env: NodeJS.ProcessEnv = process.env): NearConfig {
  const issues: string[] = [];
  const contractId = env.NEAR_CONTRACT_ID || "",
    codeHash = env.NEAR_CONTRACT_CODE_HASH || "";
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(codeHash))
    issues.push(
      "NEAR_CONTRACT_CODE_HASH must match the compiled, reviewed WASM (base58 SHA-256).",
    );
  if (!contractId) issues.push("NEAR_CONTRACT_ID is not configured.");
  else if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId))
    issues.push("NEAR_CONTRACT_ID must be a named testnet account.");
  function role(prefix: string): Role | undefined {
    const accountId = env[`${prefix}_ACCOUNT_ID`],
      secret = env[`${prefix}_PRIVATE_KEY`];
    if (!accountId || !secret) {
      issues.push(
        `${prefix} needs an account ID and a server-side signing key.`,
      );
      return;
    }
    if (!accountPattern.test(accountId)) {
      issues.push(`${prefix} must use a testnet or implicit account.`);
      return;
    }
    try {
      const publicKey = KeyPair.fromString(secret as `ed25519:${string}`)
        .getPublicKey()
        .toString();
      if (!publicKey.startsWith("ed25519:")) throw Error();
      return { accountId, publicKey, secret };
    } catch {
      issues.push(
        `${prefix} signing key is invalid; its value has been redacted.`,
      );
    }
  }
  const agent = role("NEAR_AGENT"),
    verifier = role("NEAR_VERIFIER");
  const providers: NearConfig["providers"] = [];
  for (const [id, name, prefix] of [
    ["ledgerworks", "LedgerWorks", "NEAR_LEDGERWORKS"],
    ["parselab", "ParseLab", "NEAR_PARSELAB"],
  ]) {
    if (id === "parselab" && !env[`${prefix}_ACCOUNT_ID`]) continue;
    const signer = role(prefix);
    try {
      const amount = env[`${prefix}_PRICE_NEAR`];
      if (!amount) throw Error();
      const price = parseNear(amount);
      if (BigInt(price) <= 0n) throw Error();
      if (signer) providers.push({ id, name, price, role: signer });
    } catch {
      issues.push(
        `${prefix}_PRICE_NEAR must be a positive explicit NEAR quote; demo prices are never converted.`,
      );
    }
  }
  const roles = [agent, verifier, ...providers.map((p) => p.role)].filter(
    (r): r is Role => Boolean(r),
  );
  if (
    new Set(roles.map((r) => r.accountId)).size !== roles.length ||
    new Set(roles.map((r) => r.publicKey)).size !== roles.length
  )
    issues.push(
      "Agent, verifier and provider accounts and keys must be distinct.",
    );
  return { contractId, codeHash, agent, verifier, providers, issues };
}
