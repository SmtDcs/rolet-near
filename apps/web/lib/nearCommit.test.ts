import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  base64ToBytes,
  bytesToBase64,
  clearSecret,
  commitment,
  generateSecret,
  loadSecret,
  saveSecret,
  secretStorageKey,
  type SecretStorage,
} from "./nearCommit";

function makeMemoryStorage(): SecretStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

test("commitment matches contracts/rolet-near/src/rng.rs fixed vector and sensitivity", () => {
  const secret = new Uint8Array(32).fill(0x11);
  const digest = commitment(secret, "alice.testnet", BigInt(7));
  assert.equal(
    toHex(digest),
    "bfd4433fc4571479b34eca63f5a7883a2e7b71f97f22afa32e217a01753a479b",
  );

  const flipped = new Uint8Array(secret);
  flipped[0] = 0x12;
  assert.notEqual(toHex(commitment(flipped, "alice.testnet", BigInt(7))), toHex(digest));
  assert.notEqual(toHex(commitment(secret, "bob.testnet", BigInt(7))), toHex(digest));
  assert.notEqual(toHex(commitment(secret, "alice.testnet", BigInt(8))), toHex(digest));
});

test("generateSecret returns 32 distinct random bytes per call", () => {
  const s1 = generateSecret();
  const s2 = generateSecret();
  assert.equal(s1.length, 32);
  assert.equal(s2.length, 32);
  assert.notEqual(toHex(s1), toHex(s2));
});

test("base64 and secret storage helpers roundtrip cleanly", () => {
  const storage = makeMemoryStorage();
  const secret = generateSecret();
  const b64 = bytesToBase64(secret);
  assert.deepEqual(base64ToBytes(b64), secret);

  assert.equal(
    secretStorageKey("alice.testnet", "rolet.testnet", BigInt(42)),
    "rolet:secret:alice.testnet:rolet.testnet:42",
  );

  saveSecret(storage, "alice.testnet", "rolet.testnet", BigInt(42), secret);
  assert.deepEqual(loadSecret(storage, "alice.testnet", "rolet.testnet", BigInt(42)), secret);
  assert.equal(loadSecret(storage, "alice.testnet", "rolet.testnet", BigInt(43)), null);

  clearSecret(storage, "alice.testnet", "rolet.testnet", BigInt(42));
  assert.equal(loadSecret(storage, "alice.testnet", "rolet.testnet", BigInt(42)), null);
});

test("nearCommit.ts never references console.", () => {
  const source = readFileSync(resolve(__dirname, "nearCommit.ts"), "utf8");
  assert.equal(source.includes("console."), false);
});
