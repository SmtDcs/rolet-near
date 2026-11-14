/**
 * Commit-reveal secret generation, SHA-256 commitment matching contracts/rolet-near/src/rng.rs,
 * base64 helpers, and injected sessionStorage persistence (T-302 / F2-3).
 */

import { sha256 } from "@noble/hashes/sha2.js";

export interface SecretStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SECRET_LEN = 32;
const U64_MAX = BigInt("18446744073709551615");

/**
 * Generates a cryptographically random 32-byte secret using Web Crypto.
 */
export function generateSecret(): Uint8Array {
  const out = new Uint8Array(SECRET_LEN);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/**
 * Encodes bytes to standard base64 (works in both browser and Node).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(bin);
}

/**
 * Decodes standard base64 to bytes.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/**
 * Computes `sha256(secret || utf8(accountId) || u64_le(matchId))` matching rng.rs.
 */
export function commitment(
  secret: Uint8Array,
  accountId: string,
  matchId: bigint | number | string,
): Uint8Array {
  if (secret.length !== SECRET_LEN) {
    throw new Error(`secret must be ${SECRET_LEN} bytes`);
  }
  const id = typeof matchId === "bigint" ? matchId : BigInt(matchId);
  if (id < BigInt(0) || id > U64_MAX) {
    throw new Error("matchId out of u64 range");
  }

  const accountBytes = new TextEncoder().encode(accountId);
  const buf = new Uint8Array(SECRET_LEN + accountBytes.length + 8);
  buf.set(secret, 0);
  buf.set(accountBytes, SECRET_LEN);

  const view = new DataView(buf.buffer, buf.byteOffset + SECRET_LEN + accountBytes.length, 8);
  view.setBigUint64(0, id, true);

  return sha256(buf);
}

/**
 * Returns the storage key `rolet:secret:<account>:<contract>:<matchId>`.
 */
export function secretStorageKey(
  account: string,
  contract: string,
  matchId: bigint | number | string,
): string {
  const id = typeof matchId === "bigint" ? matchId : BigInt(matchId);
  return `rolet:secret:${account}:${contract}:${id.toString()}`;
}

/**
 * Saves the 32-byte secret as base64 in the injected session storage.
 */
export function saveSecret(
  storage: SecretStorage,
  account: string,
  contract: string,
  matchId: bigint | number | string,
  secret: Uint8Array,
): void {
  if (secret.length !== SECRET_LEN) {
    throw new Error(`secret must be ${SECRET_LEN} bytes`);
  }
  storage.setItem(secretStorageKey(account, contract, matchId), bytesToBase64(secret));
}

/**
 * Loads the 32-byte secret from injected storage; returns null if absent or invalid.
 */
export function loadSecret(
  storage: SecretStorage,
  account: string,
  contract: string,
  matchId: bigint | number | string,
): Uint8Array | null {
  const raw = storage.getItem(secretStorageKey(account, contract, matchId));
  if (!raw) return null;
  try {
    const bytes = base64ToBytes(raw);
    return bytes.length === SECRET_LEN ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Removes a match secret from injected storage.
 */
export function clearSecret(
  storage: SecretStorage,
  account: string,
  contract: string,
  matchId: bigint | number | string,
): void {
  storage.removeItem(secretStorageKey(account, contract, matchId));
}
