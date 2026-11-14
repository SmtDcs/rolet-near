import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { SignedTransaction } from "@near-js/transactions";
import {
  AccessKeyMissingError,
  AllowanceExhaustedError,
  NonceRetryExhaustedError,
  WalletRequiredError,
  createGameCaller,
  type NearCallTransport,
} from "./nearCall";
import type { GameMethod } from "./nearConfig";
import { generateKeyPair } from "./nearKey";
import type { OutcomeLike } from "./nearOutcome";

const FAKE_BLOCK_HASH = "11111111111111111111111111111111";

function loadOutcomeFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, "__fixtures__/outcomes", name), "utf8"));
}

test("sendGameCall succeeds and returns parsed outcome with actions", async () => {
  const kp = generateKeyPair();
  const fireOutcome = loadOutcomeFixture("fire-success.json") as OutcomeLike;
  const seenNonces: bigint[] = [];

  const transport: NearCallTransport = {
    async viewAccessKey() {
      return { nonce: BigInt(10), blockHash: FAKE_BLOCK_HASH };
    },
    async sendTransaction(signedTx: SignedTransaction) {
      seenNonces.push(signedTx.transaction.nonce);
      assert.equal(signedTx.transaction.actions[0].functionCall?.deposit, BigInt(0));
      return fireOutcome;
    },
  };

  const caller = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport,
  });

  const res = await caller.sendGameCall("fire", { match_id: "7", target: "Opponent" });
  assert.equal(res.ok, true);
  assert.equal(res.events.length, 2);
  assert.equal(res.events[0].kind, "Shot");
  assert.deepEqual(seenNonces, [BigInt(11)]);
  assert.equal(res.txHash, "8u1firetxhash");
});

test("sendGameCall retries up to 3 times on InvalidNonce and throws on 4th failure", async () => {
  const kp = generateKeyPair();
  const invalidNonce = loadOutcomeFixture("invalid-nonce.json");
  const fireOutcome = loadOutcomeFixture("fire-success.json") as OutcomeLike;

  let nonceCounter = 10;
  let sendCalls = 0;
  const transportSuccessOn3rd: NearCallTransport = {
    async viewAccessKey() {
      nonceCounter += 1;
      return { nonce: BigInt(nonceCounter), blockHash: FAKE_BLOCK_HASH };
    },
    async sendTransaction() {
      sendCalls += 1;
      if (sendCalls <= 2) throw invalidNonce;
      return fireOutcome;
    },
  };

  const caller1 = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: transportSuccessOn3rd,
  });

  const ok = await caller1.sendGameCall("fire", { match_id: "7", target: "Opponent" });
  assert.equal(ok.ok, true);
  assert.equal(sendCalls, 3);

  let failCalls = 0;
  const transportAlwaysInvalidNonce: NearCallTransport = {
    async viewAccessKey() {
      return { nonce: BigInt(100 + failCalls), blockHash: FAKE_BLOCK_HASH };
    },
    async sendTransaction() {
      failCalls += 1;
      throw invalidNonce;
    },
  };

  const caller2 = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: transportAlwaysInvalidNonce,
  });

  await assert.rejects(
    () => caller2.sendGameCall("join", { match_id: "7" }),
    (err) => err instanceof NonceRetryExhaustedError,
  );
  assert.equal(failCalls, 4);
});

test("sendGameCall backs off with increasing delays on HTTP 429", async () => {
  const kp = generateKeyPair();
  const http429 = loadOutcomeFixture("http-429.json");
  const fireOutcome = loadOutcomeFixture("fire-success.json") as OutcomeLike;

  const delays: number[] = [];
  let attempts = 0;
  const transport: NearCallTransport = {
    async viewAccessKey() {
      return { nonce: BigInt(5), blockHash: FAKE_BLOCK_HASH };
    },
    async sendTransaction() {
      attempts += 1;
      if (attempts <= 3) throw http429;
      return fireOutcome;
    },
  };

  const caller = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });

  const res = await caller.sendGameCall("fire", {});
  assert.equal(res.ok, true);
  assert.equal(delays.length, 3);
  assert.ok(delays[0] < delays[1] && delays[1] < delays[2], `delays: ${delays}`);
});

test("sendGameCall does not retry allowance or missingKey errors and throws typed errors", async () => {
  const kp = generateKeyPair();
  const allowanceErr = loadOutcomeFixture("allowance-error.json");
  let calls = 0;

  const callerAllowance = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: {
      async viewAccessKey() {
        return { nonce: BigInt(1), blockHash: FAKE_BLOCK_HASH };
      },
      async sendTransaction() {
        calls += 1;
        throw allowanceErr;
      },
    },
  });

  await assert.rejects(
    () => callerAllowance.sendGameCall("fire", {}),
    (err) => err instanceof AllowanceExhaustedError,
  );
  assert.equal(calls, 1);

  let missingCalls = 0;
  const callerMissing = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: {
      async viewAccessKey() {
        missingCalls += 1;
        throw { cause: { name: "UNKNOWN_ACCESS_KEY" } };
      },
      async sendTransaction() {
        throw new Error("should not reach sendTransaction");
      },
    },
  });

  await assert.rejects(
    () => callerMissing.sendGameCall("fire", {}),
    (err) => err instanceof AccessKeyMissingError,
  );
  assert.equal(missingCalls, 1);
});

test("sendGameCall rejects non-game methods like claim_reward with WalletRequiredError", async () => {
  const kp = generateKeyPair();
  let transportCalled = false;
  const caller = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: {
      async viewAccessKey() {
        transportCalled = true;
        return { nonce: BigInt(1), blockHash: FAKE_BLOCK_HASH };
      },
      async sendTransaction() {
        transportCalled = true;
        return {};
      },
    },
  });

  await assert.rejects(
    () => caller.sendGameCall("claim_reward" as unknown as GameMethod, {}),
    (err) => err instanceof WalletRequiredError && err.method === "claim_reward",
  );
  assert.equal(transportCalled, false);
});

test("concurrent sendGameCall invocations execute sequentially with ordered nonces", async () => {
  const kp = generateKeyPair();
  const fireOutcome = loadOutcomeFixture("fire-success.json") as OutcomeLike;
  let chainNonce = BigInt(20);
  const sentNonces: bigint[] = [];
  let activeSends = 0;
  let maxConcurrent = 0;

  const caller = createGameCaller({
    accountId: "alice.testnet",
    contractId: "rolet.testnet",
    keyPair: kp,
    rpcUrl: "http://127.0.0.1:0",
    transport: {
      async viewAccessKey() {
        return { nonce: chainNonce, blockHash: FAKE_BLOCK_HASH };
      },
      async sendTransaction(signedTx: SignedTransaction) {
        activeSends += 1;
        maxConcurrent = Math.max(maxConcurrent, activeSends);
        await new Promise((r) => setTimeout(r, 15));
        sentNonces.push(signedTx.transaction.nonce);
        chainNonce = signedTx.transaction.nonce;
        activeSends -= 1;
        return fireOutcome;
      },
    },
  });

  await Promise.all([
    caller.sendGameCall("join", { match_id: "1" }),
    caller.sendGameCall("reveal", { match_id: "1" }),
  ]);

  assert.equal(maxConcurrent, 1);
  assert.deepEqual(sentNonces, [BigInt(21), BigInt(22)]);
});
