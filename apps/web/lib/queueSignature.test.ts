import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  QUEUE_RECIPIENT,
  serializeNep413Payload,
  verifyQueueSignature,
  type ViewAccessKeyFn,
} from "./queueSignature";

interface VectorFixture {
  accountId: string;
  publicKey: string;
  message: string;
  now: number;
  recipient: string;
  nonceBase64: string;
  signatureBase64: string;
  borshHex: string;
}

const vector = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/nep413-queue-vector.json"), "utf8"),
) as VectorFixture;

const allowFullAccess: ViewAccessKeyFn = async () => ({ permission: "FullAccess" });

test("serializeNep413Payload matches @near-wallet-selector/core fixed Borsh vector", () => {
  const bytes = serializeNep413Payload({
    message: vector.message,
    nonce: new Uint8Array(Buffer.from(vector.nonceBase64, "base64")),
    recipient: vector.recipient,
  });
  assert.equal(Buffer.from(bytes).toString("hex"), vector.borshHex);
});

test("verifyQueueSignature accepts valid NEP-413 vector when key has FullAccess", async () => {
  let queriedAccount = "";
  let queriedKey = "";
  const ok = await verifyQueueSignature({
    accountId: vector.accountId,
    publicKey: vector.publicKey,
    message: vector.message,
    signature: vector.signatureBase64,
    nonce: vector.nonceBase64,
    recipient: vector.recipient,
    now: vector.now + 5_000,
    expectedRecipient: QUEUE_RECIPIENT,
    viewAccessKey: async (acc, pk) => {
      queriedAccount = acc;
      queriedKey = pk;
      return { permission: "FullAccess" };
    },
  });

  assert.deepEqual(ok, { accountId: vector.accountId });
  assert.equal(queriedAccount, vector.accountId);
  assert.equal(queriedKey, vector.publicKey);
});

test("verifyQueueSignature rejects tampered payload, wrong recipient, stale time, or non-FullAccess key", async () => {
  const base = {
    accountId: vector.accountId,
    publicKey: vector.publicKey,
    message: vector.message,
    signature: vector.signatureBase64,
    nonce: vector.nonceBase64,
    recipient: vector.recipient,
    now: vector.now,
    viewAccessKey: allowFullAccess,
  };

  assert.equal(
    await verifyQueueSignature({ ...base, now: vector.now + 121_000 }),
    null,
  );
  assert.equal(
    await verifyQueueSignature({ ...base, recipient: "evil.app" }),
    null,
  );
  assert.equal(
    await verifyQueueSignature({
      ...base,
      message: `ROLET queue\n${vector.accountId}\n${vector.now + 1}`,
    }),
    null,
  );
  assert.equal(
    await verifyQueueSignature({ ...base, accountId: "bob.testnet" }),
    null,
  );
  assert.equal(
    await verifyQueueSignature({
      ...base,
      viewAccessKey: async () => ({
        permission: { FunctionCall: { receiver_id: "rolet.testnet", method_names: ["fire"] } },
      }),
    }),
    null,
  );
  assert.equal(
    await verifyQueueSignature({
      ...base,
      viewAccessKey: async () => null,
    }),
    null,
  );
});
