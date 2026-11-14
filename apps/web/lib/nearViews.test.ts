import assert from "node:assert/strict";
import test from "node:test";
import {
  createJsonRpcViewFn,
  createNearViewClient,
  decodeArgsBase64,
  decodeViewResult,
  encodeArgsBase64,
  type ViewCallParams,
} from "./nearViews";

function toByteArray(value: unknown): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

test("encodeArgsBase64 and decodeArgsBase64 round-trip JSON args", () => {
  const original = { match_id: "42", since_seq: 3, players: ["a.near", "b.near"] };
  const encoded = encodeArgsBase64(original);
  assert.deepEqual(decodeArgsBase64(encoded), original);
});

test("decodeViewResult accepts Uint8Array and number[]", () => {
  const json = { ok: true, count: 7 };
  const bytes = toByteArray(json);
  assert.deepEqual(decodeViewResult(bytes), json);
  assert.deepEqual(decodeViewResult(Uint8Array.from(bytes)), json);
});

test("createNearViewClient encodes args and decodes every view method", async () => {
  const calls: Array<{
    contractId: string;
    methodName: string;
    args: Record<string, unknown>;
  }> = [];

  const mockResponses: Record<string, unknown> = {
    get_match: {
      id: "10",
      status: "Active",
      players: ["alice.testnet", "bob.testnet"],
      tokens: ["1", "2"],
      revealed: [true, true],
      game: {
        round: 1,
        score: [0, 0],
        hp: [4, 4],
        max_hp: 4,
        heal_cut: [false, false],
        items: [[], []],
        load: {
          announced_live: 3,
          announced_blank: 5,
          remaining: 8,
          live_left: 3,
          blank_left: 5,
          fixed: [],
        },
        turn: 0,
        shackled: null,
        shackle_broke_this_turn: false,
        saw_active: false,
        deck_counts: [],
      },
      reveal_deadline_ms: 0,
      deadline_ms: 123456,
      winner: null,
      seq: 1,
      log: [],
    },
    get_actions: {
      first_seq: 0,
      actions: [],
    },
    get_player: {
      active_match: "10",
      wins: 3,
      losses: 1,
      played: 4,
      owed: "5000",
    },
    get_character: {
      kind: "Kacak",
      durability: 9,
      locked_in: null,
    },
    nft_tokens_for_owner: [
      {
        token_id: "1",
        owner_id: "alice.testnet",
        metadata: { title: "Rolet #1", description: null, media: null, extra: null },
      },
    ],
    get_config: {
      rounds: [{ start_hp: 4, items_per_load: 4, heal_cut_at: 2 }],
      turn_ms: 45000,
      reveal_ms: 30000,
      reward: "1500000000000000000000000",
      price: "1000000000000000000000000",
      ops_bps: 500,
      durability: 10,
      allowance_hint: "250000000000000000000000",
      tincture_good_pct: 50,
      max_items: 4,
      min_treasury: "5000000000000000000000000",
      load_size: 8,
      min_live: 1,
      max_live: 7,
      copies_per_item: 4,
    },
    get_treasury: "9000000000000000000000000",
    leaderboard: [
      { account_id: "alice.testnet", wins: 3, losses: 1, played: 4 },
    ],
  };

  const client = createNearViewClient({
    contractId: "rolet.testnet",
    viewCall: async ({ contractId, methodName, argsBase64 }: ViewCallParams) => {
      calls.push({
        contractId,
        methodName,
        args: decodeArgsBase64<Record<string, unknown>>(argsBase64),
      });
      return toByteArray(mockResponses[methodName]);
    },
  });

  const m = await client.getMatch("10", ["alice.testnet", "bob.testnet"]);
  assert.equal(m?.id, "10");

  const mNoPlayers = await client.getMatch("10");
  assert.equal(mNoPlayers?.id, "10");

  const actions = await client.getActions("10", 4, ["alice.testnet", "bob.testnet"]);
  assert.equal(actions.first_seq, 0);

  const player = await client.getPlayer("alice.testnet");
  assert.equal(player.owed, "5000");

  const char = await client.getCharacter("1");
  assert.equal(char?.kind, "Kacak");

  const tokens = await client.nftTokensForOwner("alice.testnet");
  assert.equal(tokens.length, 1);

  const tokensPaged = await client.nftTokensForOwner("alice.testnet", "1", 10);
  assert.equal(tokensPaged[0]?.token_id, "1");

  const cfg = await client.getConfig();
  assert.equal(cfg.load_size, 8);

  const treasury = await client.getTreasury();
  assert.equal(treasury, "9000000000000000000000000");

  const lb = await client.leaderboard(2, 20);
  assert.equal(lb[0]?.account_id, "alice.testnet");

  assert.deepEqual(
    calls.map((c) => [c.contractId, c.methodName, c.args]),
    [
      [
        "rolet.testnet",
        "get_match",
        { match_id: "10", players: ["alice.testnet", "bob.testnet"] },
      ],
      ["rolet.testnet", "get_match", { match_id: "10", players: null }],
      [
        "rolet.testnet",
        "get_actions",
        { match_id: "10", since_seq: 4, players: ["alice.testnet", "bob.testnet"] },
      ],
      ["rolet.testnet", "get_player", { account_id: "alice.testnet" }],
      ["rolet.testnet", "get_character", { token_id: "1" }],
      [
        "rolet.testnet",
        "nft_tokens_for_owner",
        { account_id: "alice.testnet", from_index: null, limit: 50 },
      ],
      [
        "rolet.testnet",
        "nft_tokens_for_owner",
        { account_id: "alice.testnet", from_index: "1", limit: 10 },
      ],
      ["rolet.testnet", "get_config", {}],
      ["rolet.testnet", "get_treasury", {}],
      ["rolet.testnet", "leaderboard", { from: 2, limit: 20 }],
    ],
  );
});

test("createNearViewClient rejects missing contractId", async () => {
  const client = createNearViewClient({
    contractId: "",
    viewCall: async () => [],
  });
  await assert.rejects(() => client.getConfig(), /Contract ID is not configured/);
});

test("createJsonRpcViewFn formats call_function RPC request and handles errors", async () => {
  let seenBody: Record<string, unknown> | null = null;
  const okFetch: typeof fetch = async (_url, init) => {
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        result: { result: toByteArray({ ok: true }) },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const rpc = createJsonRpcViewFn("/api/rpc", okFetch);
  const res = await rpc({
    contractId: "rolet.testnet",
    methodName: "get_treasury",
    argsBase64: encodeArgsBase64({}),
  });
  assert.deepEqual(decodeViewResult(res), { ok: true });
  assert.equal((seenBody as unknown as { method: string }).method, "query");

  const httpFail = createJsonRpcViewFn("/api/rpc", async () => {
    return new Response("upstream down", { status: 502 });
  });
  await assert.rejects(
    () =>
      httpFail({
        contractId: "rolet.testnet",
        methodName: "get_config",
        argsBase64: encodeArgsBase64({}),
      }),
    /HTTP 502/,
  );

  const rpcErr = createJsonRpcViewFn("/api/rpc", async () => {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { message: "MethodNotFound" } }),
      { status: 200 },
    );
  });
  await assert.rejects(
    () =>
      rpcErr({
        contractId: "rolet.testnet",
        methodName: "bad_method",
        argsBase64: encodeArgsBase64({}),
      }),
    /MethodNotFound/,
  );

  const malformed = createJsonRpcViewFn("/api/rpc", async () => {
    return new Response(JSON.stringify({ jsonrpc: "2.0", result: {} }), {
      status: 200,
    });
  });
  await assert.rejects(
    () =>
      malformed({
        contractId: "rolet.testnet",
        methodName: "get_config",
        argsBase64: encodeArgsBase64({}),
      }),
    /Malformed NEAR RPC/,
  );
});
