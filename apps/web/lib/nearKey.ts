/**
 * Browser FunctionCall access key generation, injected storage persistence,
 * and NEAR RPC / @near-js error predicates (T-202).
 */

import { KeyPair } from "@near-js/crypto";

export interface GeneratedKeyPair {
  publicKey: string;
  secretKey: string;
}

export interface StoredKeyRecord {
  secretKey: string;
  publicKey: string;
  createdAt: number;
  allowanceYocto: string;
}

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Generates a fresh Ed25519 keypair using @near-js/crypto.
 */
export function generateKeyPair(): GeneratedKeyPair {
  const kp = KeyPair.fromRandom("ed25519");
  return {
    publicKey: kp.getPublicKey().toString(),
    secretKey: kp.toString(),
  };
}

/**
 * Returns the deterministic storage key for a (account, contract) FC key record.
 */
export function storageKey(account: string, contract: string): string {
  return `rolet:fck:${account}:${contract}`;
}

/**
 * Persists an FC key record into the injected storage.
 */
export function saveKey(
  storage: KeyStorage,
  account: string,
  contract: string,
  record: StoredKeyRecord,
): void {
  storage.setItem(storageKey(account, contract), JSON.stringify(record));
}

/**
 * Loads and validates an FC key record from storage; returns null if absent or malformed.
 */
export function loadKey(
  storage: KeyStorage,
  account: string,
  contract: string,
): StoredKeyRecord | null {
  const raw = storage.getItem(storageKey(account, contract));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.secretKey !== "string" ||
      !obj.secretKey.startsWith("ed25519:") ||
      typeof obj.publicKey !== "string" ||
      !obj.publicKey.startsWith("ed25519:") ||
      typeof obj.createdAt !== "number" ||
      !Number.isFinite(obj.createdAt) ||
      typeof obj.allowanceYocto !== "string"
    ) {
      return null;
    }
    return {
      secretKey: obj.secretKey,
      publicKey: obj.publicKey,
      createdAt: obj.createdAt,
      allowanceYocto: obj.allowanceYocto,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes an FC key record from injected storage.
 */
export function deleteKey(
  storage: KeyStorage,
  account: string,
  contract: string,
): void {
  storage.removeItem(storageKey(account, contract));
}

interface CollectedErrorInfo {
  keys: Set<string>;
  strings: string[];
}

function collectErrorInfo(err: unknown): CollectedErrorInfo {
  const keys = new Set<string>();
  const strings: string[] = [];
  const seen = new Set<object>();

  function visit(val: unknown, depth: number): void {
    if (depth > 12 || val == null) return;
    if (typeof val === "string") {
      strings.push(val);
      return;
    }
    if (typeof val !== "object") return;
    if (seen.has(val)) return;
    seen.add(val);

    if (val instanceof Error) {
      if (val.name) strings.push(val.name);
      if (val.message) strings.push(val.message);
      const record = val as unknown as Record<string, unknown>;
      for (const k of Object.keys(record)) {
        keys.add(k);
        visit(record[k], depth + 1);
      }
      if ("cause" in val && val.cause !== undefined) {
        visit(val.cause, depth + 1);
      }
      return;
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        visit(item, depth + 1);
      }
      return;
    }

    const obj = val as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      keys.add(k);
      visit(v, depth + 1);
    }
  }

  visit(err, 0);
  return { keys, strings };
}

function hasToken(info: CollectedErrorInfo, token: string): boolean {
  if (info.keys.has(token)) return true;
  return info.strings.some((s) => s === token || s.includes(token));
}

/**
 * Returns true if the error indicates the FC access key ran out of allowance.
 */
export function isAllowanceError(err: unknown): boolean {
  const info = collectErrorInfo(err);
  if (hasToken(info, "NotEnoughAllowance")) return true;
  return info.strings.some((s) =>
    /access key .* does not have enough balance|not enough allowance/i.test(s),
  );
}

/**
 * Returns true if the error indicates the access key does not exist on chain.
 */
export function isAccessKeyMissing(err: unknown): boolean {
  const info = collectErrorInfo(err);
  if (
    hasToken(info, "AccessKeyDoesNotExist") ||
    hasToken(info, "AccessKeyNotFound") ||
    hasToken(info, "UNKNOWN_ACCESS_KEY") ||
    hasToken(info, "UnknownAccessKey")
  ) {
    return true;
  }
  const hasInvalidAk = hasToken(info, "InvalidAccessKeyError");
  const hasMissingText = info.strings.some((s) =>
    /does not exist|doesn't exist|access key .* not found|unknown access key/i.test(s),
  );
  if (hasInvalidAk && hasMissingText) return true;
  return info.strings.some((s) =>
    /access key .* does not exist while viewing|access key .* doesn't exist/i.test(s),
  );
}

/**
 * Returns true if the FC key rejected the call because the method is disallowed or deposit > 0.
 */
export function isMethodDenied(err: unknown): boolean {
  const info = collectErrorInfo(err);
  if (
    hasToken(info, "MethodNameMismatch") ||
    hasToken(info, "DepositWithFunctionCall")
  ) {
    return true;
  }
  return info.strings.some((s) =>
    /method name .* isn't allowed by the access key|deposit.*function call/i.test(s),
  );
}
