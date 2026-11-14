import assert from "node:assert/strict";
import test from "node:test";
import {
  createQueue,
  enterQueue,
  isValidNearAccount,
  leaveQueue,
  parseQueueMessage,
  queueMessage,
  statusQueue,
} from "./matchQueue";

const ALICE = "alice.testnet";
const BOB = "bob-1_2.testnet";
const IMPLICIT = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("isValidNearAccount enforces NEAR account syntax and 2..64 length", () => {
  assert.equal(isValidNearAccount("ab"), true);
  assert.equal(isValidNearAccount(ALICE), true);
  assert.equal(isValidNearAccount(BOB), true);
  assert.equal(isValidNearAccount(IMPLICIT), true);

  assert.equal(isValidNearAccount("a"), false);
  assert.equal(isValidNearAccount("a".repeat(65)), false);
  assert.equal(isValidNearAccount("Alice.testnet"), false);
  assert.equal(isValidNearAccount(".alice.testnet"), false);
  assert.equal(isValidNearAccount("alice..testnet"), false);
  assert.equal(isValidNearAccount("alice.testnet."), false);
  assert.equal(isValidNearAccount("-alice.testnet"), false);
  assert.equal(isValidNearAccount("alice.testnet!"), false);
});

test("first account waits and second creates symmetric paired view for both", () => {
  const q = createQueue();
  const first = enterQueue(q, ALICE, 1_000);
  assert.equal(first.view.status, "waiting");

  const second = enterQueue(q, BOB, 2_000);
  assert.equal(second.view.status, "paired");
  if (second.view.status !== "paired") return;
  assert.equal(second.view.opponent, ALICE);
  assert.ok(/^\d+$/.test(second.view.matchId));

  const firstView = statusQueue(q, first.token, 2_100);
  assert.equal(firstView?.status, "paired");
  if (firstView?.status !== "paired") return;
  assert.equal(firstView.opponent, BOB);
  assert.equal(firstView.matchId, second.view.matchId);
  assert.equal(q.pairs.length, 1);
  assert.equal(q.waiters.length, 0);
});

test("a third account waits for the next pair", () => {
  const q = createQueue();
  enterQueue(q, ALICE, 1_000);
  enterQueue(q, BOB, 2_000);
  const third = enterQueue(q, IMPLICIT, 3_000);
  assert.equal(third.view.status, "waiting");
  assert.equal(q.waiters.length, 1);
});

test("same account cannot sit twice and reuses token", () => {
  const q = createQueue();
  const first = enterQueue(q, ALICE, 1_000);
  const again = enterQueue(q, ALICE, 1_500);
  assert.equal(first.duplicate, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.token, first.token);
  assert.equal(again.view.status, "waiting");
  assert.equal(q.waiters.length, 1);
});

test("a stale waiter is dropped and a pair expires after TTL", () => {
  const q = createQueue();
  enterQueue(q, ALICE, 1_000);
  const next = enterQueue(q, BOB, 1_000 + 180_000);
  assert.equal(next.view.status, "waiting");
  assert.equal(q.waiters.length, 1);
  assert.equal(q.waiters[0].accountId, BOB);

  const paired = enterQueue(q, ALICE, 182_000);
  assert.equal(paired.view.status, "paired");
  const expired = statusQueue(q, paired.token, 182_000 + 180_000);
  assert.equal(expired?.status, "expired");
});

test("leaving drops the pair so the peer sees expired", () => {
  const q = createQueue();
  const first = enterQueue(q, ALICE, 1_000);
  const second = enterQueue(q, BOB, 2_000);
  leaveQueue(q, first.token, 2_100);
  const peerView = statusQueue(q, second.token, 2_200);
  assert.equal(peerView?.status, "expired");
});

test("a status poll keeps the seat alive past the original token lifetime", () => {
  const q = createQueue();
  const first = enterQueue(q, ALICE, 0);
  let now = 0;
  for (let i = 0; i < 5; i += 1) {
    now += 150_000;
    const seen = statusQueue(q, first.token, now);
    assert.equal(seen?.status, "waiting", `poll ${i}`);
  }
});

test("queueMessage and parseQueueMessage validate NEAR accounts", () => {
  const msg = queueMessage(ALICE, 123_456);
  assert.deepEqual(parseQueueMessage(msg), { accountId: ALICE, at: 123_456 });
  assert.equal(parseQueueMessage("ROLET queue\nInvalid.NEAR\n123"), null);
  assert.equal(parseQueueMessage("nope"), null);
});
