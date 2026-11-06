import { test } from "node:test";
import assert from "node:assert/strict";
import { NearTestnetAdapter } from "../lib/settlement/near.ts";

test("read failures use the archival fallback after checking its network", async () => {
  const calls: { url: string; method: string }[] = [];
  const rpc = new NearTestnetAdapter("escrow.testnet", async (url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), method: body.method });
    if (String(url) === "https://test.rpc.fastnear.com")
      return new Response("Unavailable", { status: 503 });
    return Response.json({
      result:
        body.method === "status" ? { chain_id: "testnet" } : { amount: "123" },
    });
  });
  assert.deepEqual(await rpc.call("query", { request_type: "view_account" }), {
    amount: "123",
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ["query", "status", "query"],
  );
});

test("a failing owner-key read never fabricates a balance or bypasses a network mismatch", async () => {
  let fallbackQuery = false;
  const rpc = new NearTestnetAdapter("escrow.testnet", async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url) === "https://test.rpc.fastnear.com")
      throw Error("Private upstream diagnostic");
    if (body.method === "query") fallbackQuery = true;
    return Response.json({ result: { chain_id: "mainnet" } });
  });
  await assert.rejects(() => rpc.call("query", {}), /network mismatch/);
  assert.equal(fallbackQuery, false);
});

test("both unavailable endpoints produce a read error with no invented result or upstream details", async () => {
  const rpc = new NearTestnetAdapter("escrow.testnet", async () => {
    throw Error("sensitive upstream body");
  });
  await assert.rejects(
    () => rpc.call("status", {}),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("RPC read is unavailable") &&
      !error.message.includes("sensitive"),
  );
});

test("transaction submission is never allowed through the read fallback path", async () => {
  let calls = 0;
  const rpc = new NearTestnetAdapter("escrow.testnet", async () => {
    calls++;
    return Response.json({ result: {} });
  });
  await assert.rejects(() => rpc.call("broadcast_tx_commit", {}), /read-only/);
  assert.equal(calls, 0);
});
