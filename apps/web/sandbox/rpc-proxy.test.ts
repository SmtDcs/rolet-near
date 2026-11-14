import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/rpc/route";
import { startSandbox } from "./sandboxHelper";

test("F3-15: /api/rpc forwards view_account to NEAR_RPC_URL sandbox", async (t) => {
  const sb = await startSandbox();
  if (!sb) {
    t.skip("near-sandbox binary or rolet_near.wasm not found");
    return;
  }

  const prevRpc = process.env.NEAR_RPC_URL;
  process.env.NEAR_RPC_URL = sb.rpcUrl;
  try {
    const req = new NextRequest("http://127.0.0.1/api/rpc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rpc-proxy-test",
        method: "query",
        params: {
          request_type: "view_account",
          finality: "final",
          account_id: sb.rootAccountId,
        },
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      jsonrpc?: string;
      id?: string;
      result?: { amount?: string; code_hash?: string };
      error?: unknown;
    };
    assert.equal(json.jsonrpc, "2.0");
    assert.equal(json.id, "rpc-proxy-test");
    assert.equal(json.error, undefined);
    assert.ok(typeof json.result?.amount === "string" && BigInt(json.result.amount) > BigInt(0));
  } finally {
    if (prevRpc === undefined) {
      delete process.env.NEAR_RPC_URL;
    } else {
      process.env.NEAR_RPC_URL = prevRpc;
    }
    sb.stop();
  }
});
