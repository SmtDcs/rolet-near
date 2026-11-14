import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { KeyPair } from "@near-js/crypto";
import { TypedError } from "@near-js/types";
import {
  deleteKey,
  generateKeyPair,
  isAccessKeyMissing,
  isAllowanceError,
  isMethodDenied,
  loadKey,
  saveKey,
  storageKey,
  type KeyStorage,
} from "./nearKey";

function makeMemoryStorage(): KeyStorage {
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

function loadErrorFixture(name: string): unknown {
  const p = resolve(__dirname, "__fixtures__/near-errors", name);
  return JSON.parse(readFileSync(p, "utf8"));
}

test("generateKeyPair creates valid ed25519 keypairs", () => {
  const kp1 = generateKeyPair();
  const kp2 = generateKeyPair();
  assert.ok(kp1.publicKey.startsWith("ed25519:"));
  assert.ok(kp1.secretKey.startsWith("ed25519:"));
  assert.notEqual(kp1.publicKey, kp2.publicKey);
  const parsed = KeyPair.fromString(kp1.secretKey as `ed25519:${string}`);
  assert.equal(parsed.getPublicKey().toString(), kp1.publicKey);
});

test("saveKey -> loadKey -> deleteKey roundtrip and isolation across account/contract", () => {
  const storage = makeMemoryStorage();
  const kpA = generateKeyPair();
  const kpB = generateKeyPair();

  assert.equal(
    storageKey("alice.testnet", "rolet.testnet"),
    "rolet:fck:alice.testnet:rolet.testnet",
  );

  saveKey(storage, "alice.testnet", "rolet1.testnet", {
    secretKey: kpA.secretKey,
    publicKey: kpA.publicKey,
    createdAt: 1000,
    allowanceYocto: "500000000000000000000000",
  });
  saveKey(storage, "bob.testnet", "rolet1.testnet", {
    secretKey: kpB.secretKey,
    publicKey: kpB.publicKey,
    createdAt: 2000,
    allowanceYocto: "500000000000000000000000",
  });

  const loadedA = loadKey(storage, "alice.testnet", "rolet1.testnet");
  assert.equal(loadedA?.publicKey, kpA.publicKey);
  assert.equal(loadedA?.secretKey, kpA.secretKey);
  assert.equal(loadKey(storage, "alice.testnet", "rolet2.testnet"), null);
  assert.equal(loadKey(storage, "bob.testnet", "rolet1.testnet")?.publicKey, kpB.publicKey);

  deleteKey(storage, "alice.testnet", "rolet1.testnet");
  assert.equal(loadKey(storage, "alice.testnet", "rolet1.testnet"), null);
  assert.equal(loadKey(storage, "bob.testnet", "rolet1.testnet")?.publicKey, kpB.publicKey);
});

test("loadKey returns null on corrupted or incomplete JSON", () => {
  const storage = makeMemoryStorage();
  const key = storageKey("alice.testnet", "rolet.testnet");
  storage.setItem(key, "{not valid json");
  assert.equal(loadKey(storage, "alice.testnet", "rolet.testnet"), null);

  storage.setItem(key, JSON.stringify({ publicKey: "ed25519:abc" }));
  assert.equal(loadKey(storage, "alice.testnet", "rolet.testnet"), null);
});

test("error predicates classify their own fixtures and reject others", () => {
  const allowance = loadErrorFixture("not-enough-allowance.json");
  const missing = loadErrorFixture("access-key-not-found.json");
  const mismatch = loadErrorFixture("method-name-mismatch.json");
  const deposit = loadErrorFixture("deposit-with-function-call.json");
  const typedJson = loadErrorFixture("typed-error-allowance.json") as {
    type: string;
    message: string;
  };
  const typedErr = new TypedError(typedJson.message, typedJson.type);

  assert.equal(isAllowanceError(allowance), true);
  assert.equal(isAccessKeyMissing(allowance), false);
  assert.equal(isMethodDenied(allowance), false);

  assert.equal(isAllowanceError(typedErr), true);
  assert.equal(isAccessKeyMissing(typedErr), false);
  assert.equal(isMethodDenied(typedErr), false);

  assert.equal(isAccessKeyMissing(missing), true);
  assert.equal(isAllowanceError(missing), false);
  assert.equal(isMethodDenied(missing), false);

  assert.equal(isMethodDenied(mismatch), true);
  assert.equal(isAllowanceError(mismatch), false);
  assert.equal(isAccessKeyMissing(mismatch), false);

  assert.equal(isMethodDenied(deposit), true);
  assert.equal(isAllowanceError(deposit), false);
  assert.equal(isAccessKeyMissing(deposit), false);
});
