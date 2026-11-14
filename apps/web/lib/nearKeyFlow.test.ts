import assert from "node:assert/strict";
import test from "node:test";
import { GAME_METHODS } from "./nearConfig";
import { loadKey, saveKey, type KeyStorage, type StoredKeyRecord } from "./nearKey";
import {
  checkKeyOnChain,
  decideKeyAction,
  signOutKey,
  type AccessKeyViewer,
} from "./nearKeyFlow";

const STORED: StoredKeyRecord = {
  secretKey: "ed25519:fakeSecret",
  publicKey: "ed25519:fakePublic",
  createdAt: 1000,
  allowanceYocto: "500000000000000000000000",
};

test("decideKeyAction table covers all lifecycle branches", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof decideKeyAction>[0];
    expected: ReturnType<typeof decideKeyAction>;
  }> = [
    {
      name: "stored + present -> use",
      input: { stored: STORED, onChain: "present", walletSupportsFcKey: true },
      expected: "use",
    },
    {
      name: "stored + present (no signin support) -> use",
      input: { stored: STORED, onChain: "present", walletSupportsFcKey: false },
      expected: "use",
    },
    {
      name: "stored + unknown -> use (avoid unnecessary prompt)",
      input: { stored: STORED, onChain: "unknown", walletSupportsFcKey: true },
      expected: "use",
    },
    {
      name: "no stored + walletSupportsFcKey -> signin-with-methods",
      input: { stored: null, onChain: "missing", walletSupportsFcKey: true },
      expected: "signin-with-methods",
    },
    {
      name: "no stored + no walletSupportsFcKey -> addkey",
      input: { stored: null, onChain: "missing", walletSupportsFcKey: false },
      expected: "addkey",
    },
    {
      name: "stored + missing on chain + walletSupportsFcKey -> signin-with-methods",
      input: { stored: STORED, onChain: "missing", walletSupportsFcKey: true },
      expected: "signin-with-methods",
    },
    {
      name: "stored + missing on chain + no walletSupportsFcKey -> addkey",
      input: { stored: STORED, onChain: "missing", walletSupportsFcKey: false },
      expected: "addkey",
    },
    {
      name: "allowance error -> rotate regardless of stored/onChain",
      input: {
        stored: STORED,
        onChain: "present",
        lastError: "allowance",
        walletSupportsFcKey: true,
      },
      expected: "rotate",
    },
    {
      name: "missingKey lastError -> acquire key",
      input: {
        stored: STORED,
        onChain: "present",
        lastError: "missingKey",
        walletSupportsFcKey: false,
      },
      expected: "addkey",
    },
  ];

  for (const c of cases) {
    assert.equal(decideKeyAction(c.input), c.expected, c.name);
  }
});

test("signOutKey deletes stored key", () => {
  const map = new Map<string, string>();
  const storage: KeyStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
  saveKey(storage, "alice.testnet", "rolet.testnet", STORED);
  assert.ok(loadKey(storage, "alice.testnet", "rolet.testnet"));
  signOutKey(storage, "alice.testnet", "rolet.testnet");
  assert.equal(loadKey(storage, "alice.testnet", "rolet.testnet"), null);
});

test("checkKeyOnChain validates receiver_id, methods, allowance, and errors", async () => {
  const validViewer: AccessKeyViewer = {
    async viewAccessKey() {
      return {
        permission: {
          FunctionCall: {
            receiver_id: "rolet.testnet",
            method_names: [...GAME_METHODS],
            allowance: "500000000000000000000000",
          },
        },
      };
    },
  };
  assert.equal(
    await checkKeyOnChain(validViewer, "alice.testnet", "ed25519:pk", "rolet.testnet"),
    "present",
  );
  assert.equal(
    await checkKeyOnChain(validViewer, "alice.testnet", "ed25519:pk", "other.testnet"),
    "missing",
  );

  const missingMethodViewer: AccessKeyViewer = {
    async viewAccessKey() {
      return {
        permission: {
          FunctionCall: {
            receiver_id: "rolet.testnet",
            method_names: ["join"],
            allowance: "500000000000000000000000",
          },
        },
      };
    },
  };
  assert.equal(
    await checkKeyOnChain(missingMethodViewer, "alice.testnet", "ed25519:pk", "rolet.testnet"),
    "missing",
  );

  const zeroAllowanceViewer: AccessKeyViewer = {
    async viewAccessKey() {
      return {
        permission: {
          FunctionCall: {
            receiver_id: "rolet.testnet",
            method_names: [...GAME_METHODS],
            allowance: "0",
          },
        },
      };
    },
  };
  assert.equal(
    await checkKeyOnChain(zeroAllowanceViewer, "alice.testnet", "ed25519:pk", "rolet.testnet"),
    "missing",
  );

  const missingKeyViewer: AccessKeyViewer = {
    async viewAccessKey() {
      throw { cause: { name: "UNKNOWN_ACCESS_KEY" } };
    },
  };
  assert.equal(
    await checkKeyOnChain(missingKeyViewer, "alice.testnet", "ed25519:pk", "rolet.testnet"),
    "missing",
  );

  const networkErrViewer: AccessKeyViewer = {
    async viewAccessKey() {
      throw new Error("ECONNREFUSED");
    },
  };
  assert.equal(
    await checkKeyOnChain(networkErrViewer, "alice.testnet", "ed25519:pk", "rolet.testnet"),
    "unknown",
  );
});
