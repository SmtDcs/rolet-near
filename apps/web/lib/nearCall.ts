/**
 * FunctionCall access-key transaction signing, submission, nonce-queue serialization,
 * and retry/typed-error handling (T-204 / F2-5).
 */

import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import {
  actionCreators,
  createTransaction,
  type SignedTransaction,
} from "@near-js/transactions";
import { baseDecode, baseEncode } from "@near-js/utils";
import {
  ACTION_GAS,
  isGameMethod,
  type GameMethod,
} from "./nearConfig";
import {
  classifyError,
  parseOutcome,
  type NearErrorKind,
  type OutcomeLike,
  type ParsedOutcome,
} from "./nearOutcome";

export class WalletRequiredError extends Error {
  readonly method: string;
  constructor(method: string) {
    super(`Method "${method}" requires full wallet approval`);
    this.name = "WalletRequiredError";
    this.method = method;
  }
}

export class AllowanceExhaustedError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("FunctionCall access key allowance exhausted");
    this.name = "AllowanceExhaustedError";
    this.causeError = causeError;
  }
}

export class AccessKeyMissingError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("FunctionCall access key missing on chain");
    this.name = "AccessKeyMissingError";
    this.causeError = causeError;
  }
}

export class MethodDeniedError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("Method or deposit denied by FunctionCall access key");
    this.name = "MethodDeniedError";
    this.causeError = causeError;
  }
}

export class ContractPanicError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("Smart contract panicked during execution");
    this.name = "ContractPanicError";
    this.causeError = causeError;
  }
}

export class NonceRetryExhaustedError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("Transaction nonce retry limit exceeded");
    this.name = "NonceRetryExhaustedError";
    this.causeError = causeError;
  }
}

export class RateLimitExceededError extends Error {
  readonly causeError: unknown;
  constructor(causeError: unknown) {
    super("RPC rate limit exceeded after retries");
    this.name = "RateLimitExceededError";
    this.causeError = causeError;
  }
}

export interface AccessKeyQueryResult {
  nonce: bigint | number | string;
  blockHash: string;
}

export interface NearCallTransport {
  viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyQueryResult>;
  sendTransaction(signedTransaction: SignedTransaction): Promise<OutcomeLike>;
}

export type KeyPairInput = KeyPair | { secretKey: string } | string;

export interface GameCallerOptions {
  accountId: string;
  contractId: string;
  keyPair: KeyPairInput;
  rpcUrl: string;
  transport?: NearCallTransport;
  sleep?: (ms: number) => Promise<void>;
  maxNonceRetries?: number;
  maxRateLimitRetries?: number;
}

export interface SendGameCallOptions {
  gas?: bigint;
}

export interface GameCallResult extends ParsedOutcome {
  txHash: string;
}

export interface GameCaller {
  sendGameCall(
    method: GameMethod,
    args?: Record<string, unknown>,
    options?: SendGameCallOptions,
  ): Promise<GameCallResult>;
}

/**
 * Exponential backoff delay in milliseconds for HTTP 429 rate-limit retries.
 */
export function backoffMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(250 * 2 ** Math.min(n, 5), 8000);
}

function resolveKeyPair(input: KeyPairInput): KeyPair {
  if (input instanceof KeyPair) return input;
  const raw = typeof input === "string" ? input : input.secretKey;
  return KeyPair.fromString(raw as KeyPairString);
}

/**
 * Builds the default JsonRpcProvider-backed transport for a NEAR RPC endpoint.
 */
export function createRpcTransport(rpcUrl: string): NearCallTransport {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  return {
    async viewAccessKey(accountId: string, publicKey: string): Promise<AccessKeyQueryResult> {
      const view = await provider.viewAccessKey(accountId, publicKey, {
        finality: "optimistic",
      });
      return {
        nonce: view.nonce,
        blockHash: view.block_hash,
      };
    },
    async sendTransaction(signedTransaction: SignedTransaction): Promise<OutcomeLike> {
      return provider.sendTransaction(signedTransaction);
    },
  };
}

function toTypedError(kind: NearErrorKind, err: unknown): Error {
  switch (kind) {
    case "allowance":
      return new AllowanceExhaustedError(err);
    case "missingKey":
      return new AccessKeyMissingError(err);
    case "methodDenied":
      return new MethodDeniedError(err);
    case "contractPanic":
      return new ContractPanicError(err);
    default:
      return err instanceof Error ? err : new Error(String(err));
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a serialized FunctionCall caller with nonce retry and 429 backoff.
 */
export function createGameCaller(opts: GameCallerOptions): GameCaller {
  const kp = resolveKeyPair(opts.keyPair);
  const publicKey = kp.getPublicKey();
  const publicKeyStr = publicKey.toString();
  const signer = new KeyPairSigner(kp);
  const transport = opts.transport ?? createRpcTransport(opts.rpcUrl);
  const sleep = opts.sleep ?? defaultSleep;
  const maxNonceRetries = opts.maxNonceRetries ?? 3;
  const maxRateLimitRetries = opts.maxRateLimitRetries ?? 5;

  let queue: Promise<unknown> = Promise.resolve();

  async function executeAttempt(
    method: GameMethod,
    args: Record<string, unknown>,
    gas: bigint,
  ): Promise<GameCallResult> {
    let nonceRetries = 0;
    let rateLimitRetries = 0;

    while (true) {
      let ak: AccessKeyQueryResult;
      try {
        ak = await transport.viewAccessKey(opts.accountId, publicKeyStr);
      } catch (err) {
        const kind = classifyError(err);
        if (kind === "rateLimit") {
          if (rateLimitRetries >= maxRateLimitRetries) {
            throw new RateLimitExceededError(err);
          }
          await sleep(backoffMs(rateLimitRetries));
          rateLimitRetries += 1;
          continue;
        }
        throw toTypedError(kind, err);
      }

      const nextNonce = BigInt(ak.nonce) + BigInt(1);
      const action = actionCreators.functionCall(method, args, gas, BigInt(0));
      const tx = createTransaction(
        opts.accountId,
        publicKey,
        opts.contractId,
        nextNonce,
        [action],
        baseDecode(ak.blockHash),
      );
      const [txHashBytes, signedTx] = await signer.signTransaction(tx);
      const fallbackHash = baseEncode(txHashBytes);

      let outcome: OutcomeLike;
      try {
        outcome = await transport.sendTransaction(signedTx);
      } catch (err) {
        const kind = classifyError(err);
        if (kind === "nonce") {
          if (nonceRetries >= maxNonceRetries) {
            throw new NonceRetryExhaustedError(err);
          }
          nonceRetries += 1;
          continue;
        }
        if (kind === "rateLimit") {
          if (rateLimitRetries >= maxRateLimitRetries) {
            throw new RateLimitExceededError(err);
          }
          await sleep(backoffMs(rateLimitRetries));
          rateLimitRetries += 1;
          continue;
        }
        throw toTypedError(kind, err);
      }

      const parsed = parseOutcome(outcome);
      if (!parsed.ok) {
        const kind = classifyError(parsed.failure);
        if (kind === "nonce") {
          if (nonceRetries >= maxNonceRetries) {
            throw new NonceRetryExhaustedError(parsed.failure);
          }
          nonceRetries += 1;
          continue;
        }
        throw toTypedError(kind, parsed.failure);
      }

      const txHash = extractTxHash(outcome) ?? fallbackHash;
      return { ...parsed, txHash };
    }
  }

  return {
    sendGameCall(
      method: GameMethod,
      args: Record<string, unknown> = {},
      callOpts?: SendGameCallOptions,
    ): Promise<GameCallResult> {
      if (!isGameMethod(method)) {
        return Promise.reject(new WalletRequiredError(String(method)));
      }
      const gas = callOpts?.gas ?? ACTION_GAS;
      const run = () => executeAttempt(method, args, gas);
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

function extractTxHash(outcome: OutcomeLike): string | undefined {
  const rec = outcome as {
    transaction?: { hash?: unknown };
    transaction_outcome?: { id?: unknown };
  };
  if (typeof rec.transaction?.hash === "string") return rec.transaction.hash;
  if (typeof rec.transaction_outcome?.id === "string") return rec.transaction_outcome.id;
  return undefined;
}
