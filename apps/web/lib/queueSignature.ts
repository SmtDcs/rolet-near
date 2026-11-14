import { PublicKey } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { sha256 } from "@noble/hashes/sha2.js";
import { isValidNearAccount, parseQueueMessage } from "./matchQueue";
import { readNearConfig } from "./nearConfig";

const SKEW_MS = 120_000;
const NEP413_TAG = 2147484061; // 2^31 + 413
export const QUEUE_RECIPIENT = "rolet.app";

export interface Nep413PayloadInput {
  message: string;
  nonce: Uint8Array;
  recipient: string;
  callbackUrl?: string;
}

export type ViewAccessKeyFn = (
  accountId: string,
  publicKey: string,
) => Promise<{ permission?: unknown } | null>;

export interface VerifyQueueSignatureParams {
  accountId: string;
  publicKey: string;
  message: string;
  signature: string;
  nonce: string | Uint8Array;
  recipient: string;
  callbackUrl?: string;
  now: number;
  expectedRecipient?: string;
  viewAccessKey?: ViewAccessKeyFn;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function borshU32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value, true);
  return buf;
}

function borshString(value: string): Uint8Array {
  const utf8 = new TextEncoder().encode(value);
  return concatBytes([borshU32(utf8.length), utf8]);
}

/**
 * Serializes a NEP-413 payload using Borsh matching @near-wallet-selector/core.
 */
export function serializeNep413Payload(input: Nep413PayloadInput): Uint8Array {
  if (input.nonce.length !== 32) {
    throw new Error("NEP-413 nonce must be 32 bytes");
  }
  const parts: Uint8Array[] = [
    borshU32(NEP413_TAG),
    borshString(input.message),
    input.nonce,
    borshString(input.recipient),
  ];
  if (input.callbackUrl) {
    parts.push(new Uint8Array([1]), borshString(input.callbackUrl));
  } else {
    parts.push(new Uint8Array([0]));
  }
  return concatBytes(parts);
}

/**
 * Computes the SHA-256 hash of a Borsh-serialized NEP-413 payload.
 */
export function hashNep413Payload(input: Nep413PayloadInput): Uint8Array {
  return sha256(serializeNep413Payload(input));
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 0 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

export function createRpcAccessKeyViewer(rpcUrl?: string): ViewAccessKeyFn {
  const url = rpcUrl ?? process.env.NEAR_RPC_URL ?? readNearConfig().rpcUrl;
  const provider = new JsonRpcProvider({ url });
  return async (accountId: string, publicKey: string) => {
    try {
      const res = await provider.viewAccessKey(accountId, publicKey, {
        finality: "final",
      });
      return { permission: res.permission };
    } catch {
      return null;
    }
  };
}

/**
 * Verifies a NEP-413 queue entry signature (ed25519 over sha256(borsh(payload)))
 * and checks via injected viewAccessKey that the public key belongs to accountId
 * with FullAccess permission.
 */
export async function verifyQueueSignature(
  params: VerifyQueueSignatureParams,
): Promise<{ accountId: string } | null> {
  if (!isValidNearAccount(params.accountId)) return null;
  const expectedRecipient = params.expectedRecipient ?? QUEUE_RECIPIENT;
  if (params.recipient !== expectedRecipient) return null;

  const parsed = parseQueueMessage(params.message);
  if (!parsed || parsed.accountId !== params.accountId) return null;
  if (Math.abs(params.now - parsed.at) > SKEW_MS) return null;

  const nonceBytes =
    typeof params.nonce === "string"
      ? decodeBase64(params.nonce)
      : params.nonce;
  if (!nonceBytes || nonceBytes.length !== 32) return null;

  const sigBytes = decodeBase64(params.signature);
  if (!sigBytes || sigBytes.length !== 64) return null;

  let pk: PublicKey;
  try {
    pk = PublicKey.fromString(params.publicKey);
  } catch {
    return null;
  }

  const digest = hashNep413Payload({
    message: params.message,
    nonce: nonceBytes,
    recipient: params.recipient,
    callbackUrl: params.callbackUrl,
  });

  if (!pk.verify(digest, sigBytes)) {
    return null;
  }

  const viewAccessKey = params.viewAccessKey ?? createRpcAccessKeyViewer();
  let keyInfo: { permission?: unknown } | null = null;
  try {
    keyInfo = await viewAccessKey(params.accountId, params.publicKey);
  } catch {
    return null;
  }

  if (!keyInfo || keyInfo.permission !== "FullAccess") {
    return null;
  }

  return { accountId: params.accountId };
}
