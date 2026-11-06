import { insist } from "../domain/policy.ts";
import { NEAR_VERSION, type NearTransaction } from "./near-types.ts";

export function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
      .join(",") +
    "}"
  );
}
export class NearTestnetAdapter {
  readonly network = "testnet";
  readonly rpc = "https://test.rpc.fastnear.com";
  constructor(
    public contractId: string,
    private transport: typeof fetch = fetch,
    public codeHash?: string,
  ) {
    insist(
      /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(contractId),
      "Configure a named .testnet contract account.",
    );
  }
  async call(method: string, params: Record<string, unknown>): Promise<any> {
    insist(
      ["status", "query", "tx", "block"].includes(method),
      "Only read-only NEAR RPC methods are allowed here.",
    );
    for (const endpoint of [
      this.rpc,
      "https://archival-rpc.testnet.near.org",
    ]) {
      try {
        if (endpoint !== this.rpc && method !== "status") {
          const identity = await this.readAt(endpoint, "status", {});
          insist(
            identity.chain_id === "testnet",
            "RPC network mismatch: only NEAR testnet is allowed.",
          );
        }
        return await this.readAt(endpoint, method, params);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("network mismatch")
        )
          throw error;
      }
    }
    throw Error(
      "NEAR RPC read is unavailable. Refresh chain data or escrow balance to retry. Reconcile any submitted transaction before submitting it again.",
    );
  }
  private async readAt(
    endpoint: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<any> {
    const response = await this.transport(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "styx-testnet",
        method,
        params,
      }),
      signal: AbortSignal.timeout(8000),
    });
    insist(response.ok, "NEAR RPC read is unavailable.");
    const body = await response.json();
    insist(!body.error, "NEAR RPC read failed.");
    insist(
      body.result !== undefined && body.result !== null,
      "Malformed NEAR RPC response.",
    );
    return body.result;
  }
  async ensureNetwork() {
    const result = await this.call("status", {});
    insist(
      result.chain_id === "testnet",
      "RPC network mismatch: only NEAR testnet is allowed.",
    );
  }
  async ensureContract() {
    await this.ensureNetwork();
    insist(
      this.codeHash,
      "Configure the reviewed contract code hash before signing.",
    );
    const account = await this.call("query", {
      request_type: "view_account",
      finality: "final",
      account_id: this.contractId,
    });
    insist(
      account.code_hash === this.codeHash,
      "Deployed code hash differs from the reviewed WASM. Signing is blocked.",
    );
    const config = await this.view("get_config", {});
    insist(
      config.version === NEAR_VERSION &&
        config.network === "testnet" &&
        config.domain === `styx:testnet:${this.contractId}`,
      "Deployed escrow version/domain mismatch. Deploy the matching v2 contract before signing.",
    );
  }
  async view(method: string, args: Record<string, unknown>) {
    insist(
      ["get_config", "get_balance", "get_job", "get_withdrawal"].includes(
        method,
      ),
      "Unsupported contract view.",
    );
    const result = await this.call("query", {
      request_type: "call_function",
      finality: "final",
      account_id: this.contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    });
    insist(Array.isArray(result.result), "Malformed NEAR view response.");
    return JSON.parse(Buffer.from(result.result).toString("utf8"));
  }
  async accessKeys(accountId: string) {
    const result = await this.call("query", {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: accountId,
    });
    insist(Array.isArray(result.keys), "Unable to read account access keys.");
    return result.keys;
  }
  async confirm(
    txHash: string,
    expected: NearTransaction,
    expectedKey?: string,
  ) {
    insist(
      /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash),
      "Invalid NEAR transaction hash.",
    );
    await this.ensureNetwork();
    const result = await this.call("tx", {
      tx_hash: txHash,
      sender_account_id: expected.signerId,
      wait_until: "FINAL",
    });
    const tx = result.transaction;
    insist(
      tx &&
        tx.hash === txHash &&
        tx.signer_id === expected.signerId &&
        tx.receiver_id === this.contractId &&
        expected.receiverId === this.contractId,
      "Transaction signer/receiver/hash does not match the saved signing intent.",
    );
    if (expectedKey)
      insist(
        tx.public_key === expectedKey,
        "The wallet signed with a different key than the approved owner principal. Review and create a new agreement.",
      );
    insist(
      Array.isArray(tx.actions) &&
        tx.actions.length === 1 &&
        expected.actions.length === 1,
      "Unexpected transaction actions.",
    );
    const actual = tx.actions[0].FunctionCall,
      wanted = expected.actions[0].params;
    insist(
      actual &&
        actual.method_name === wanted.methodName &&
        String(actual.deposit) === wanted.deposit &&
        String(actual.gas) === wanted.gas,
      "Transaction method, gas or deposit differs from the saved intent.",
    );
    let args;
    try {
      args = JSON.parse(Buffer.from(actual.args, "base64").toString("utf8"));
    } catch {
      throw Error("Transaction arguments are malformed.");
    }
    insist(
      canonical(args) === canonical(wanted.args),
      "Transaction arguments do not match the saved signing intent.",
    );
    if (result.final_execution_status !== "FINAL")
      return { state: "pending" as const, txHash };
    const outcomes = [
      result.transaction_outcome,
      ...(result.receipts_outcome || []),
    ];
    if (
      result.status?.Failure ||
      outcomes.some((o: any) => o?.outcome?.status?.Failure)
    )
      return {
        state: "failed" as const,
        txHash,
        error:
          "A finalized transaction or receipt failed. Inspect contract state before retrying; no successful payout is claimed.",
      };
    insist(
      result.status && Object.hasOwn(result.status, "SuccessValue"),
      "NEAR final execution did not return a successful result.",
    );
    return { state: "confirmed" as const, txHash };
  }
}
