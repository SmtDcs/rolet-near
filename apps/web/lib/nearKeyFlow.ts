/**
 * Pure decision table and on-chain verification for FunctionCall access key
 * lifecycle: use existing key, signIn with methods, AddKey fallback, or rotate (T-203 / F2-7).
 */

import { JsonRpcProvider } from "@near-js/providers";
import { GAME_METHODS } from "./nearConfig";
import {
  deleteKey,
  isAccessKeyMissing,
  isAllowanceError,
  type KeyStorage,
  type StoredKeyRecord,
} from "./nearKey";
import { classifyError, type NearErrorKind } from "./nearOutcome";

export type OnChainKeyStatus = "present" | "missing" | "unknown";

export type KeyFlowAction =
  | "use"
  | "signin-with-methods"
  | "addkey"
  | "rotate";

export interface DecideKeyActionInput {
  stored: StoredKeyRecord | null;
  onChain: OnChainKeyStatus;
  lastError?: NearErrorKind | Error | unknown;
  walletSupportsFcKey: boolean;
}

export interface AccessKeyViewer {
  viewAccessKey(
    accountId: string,
    publicKey: string,
  ): Promise<{
    permission: unknown;
  }>;
}

function isAllowanceFailure(lastError: unknown): boolean {
  if (lastError == null) return false;
  if (lastError === "allowance") return true;
  if (isAllowanceError(lastError)) return true;
  return classifyError(lastError) === "allowance";
}

function isMissingFailure(lastError: unknown): boolean {
  if (lastError == null) return false;
  if (lastError === "missingKey") return true;
  if (isAccessKeyMissing(lastError)) return true;
  return classifyError(lastError) === "missingKey";
}

/**
 * Decides the next key-lifecycle action with minimal wallet prompts.
 * - Allowance exhaustion -> "rotate" (fresh key, single prompt)
 * - Missing key on chain or no stored key -> "signin-with-methods" or "addkey"
 * - Stored key present on chain (or unknown RPC status) -> "use" (0 prompts)
 */
export function decideKeyAction(input: DecideKeyActionInput): KeyFlowAction {
  if (isAllowanceFailure(input.lastError)) {
    return "rotate";
  }

  const acquireAction: KeyFlowAction = input.walletSupportsFcKey
    ? "signin-with-methods"
    : "addkey";

  if (!input.stored || isMissingFailure(input.lastError)) {
    return acquireAction;
  }

  if (input.onChain === "missing") {
    return acquireAction;
  }

  return "use";
}

/**
 * Clears the stored FC access key on wallet sign-out.
 */
export function signOutKey(
  storage: KeyStorage,
  account: string,
  contract: string,
): void {
  deleteKey(storage, account, contract);
}

function hasValidFcPermission(
  permission: unknown,
  contractId: string | undefined,
  requiredMethods: readonly string[],
): boolean {
  if (typeof permission !== "object" || permission === null) return false;
  const fc = (permission as { FunctionCall?: unknown }).FunctionCall;
  if (typeof fc !== "object" || fc === null) return false;
  const { receiver_id, method_names, allowance } = fc as {
    receiver_id?: unknown;
    method_names?: unknown;
    allowance?: unknown;
  };

  if (typeof receiver_id !== "string") return false;
  if (contractId && receiver_id !== contractId) return false;

  if (!Array.isArray(method_names)) return false;
  for (const m of requiredMethods) {
    if (!method_names.includes(m)) return false;
  }

  if (allowance !== null && allowance !== undefined) {
    try {
      if (BigInt(String(allowance)) <= BigInt(0)) return false;
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Queries view_access_key on chain and verifies FC permission (receiver_id, GAME_METHODS, allowance > 0).
 */
export async function checkKeyOnChain(
  rpc: string | AccessKeyViewer,
  account: string,
  publicKey: string,
  contractId?: string,
  requiredMethods: readonly string[] = GAME_METHODS,
): Promise<OnChainKeyStatus> {
  const viewer: AccessKeyViewer =
    typeof rpc === "string"
      ? {
          viewAccessKey: (acc, pk) =>
            new JsonRpcProvider({ url: rpc }).viewAccessKey(acc, pk, {
              finality: "optimistic",
            }),
        }
      : rpc;

  try {
    const view = await viewer.viewAccessKey(account, publicKey);
    return hasValidFcPermission(view.permission, contractId, requiredMethods)
      ? "present"
      : "missing";
  } catch (err) {
    if (isAccessKeyMissing(err)) return "missing";
    return "unknown";
  }
}

/**
 * Reads the current remaining allowance (in yoctoNEAR string) for an FC access key, or null.
 */
export async function readKeyAllowance(
  rpc: string | AccessKeyViewer,
  account: string,
  publicKey: string,
): Promise<string | null> {
  const viewer: AccessKeyViewer =
    typeof rpc === "string"
      ? {
          viewAccessKey: (acc, pk) =>
            new JsonRpcProvider({ url: rpc }).viewAccessKey(acc, pk, {
              finality: "optimistic",
            }),
        }
      : rpc;
  try {
    const view = await viewer.viewAccessKey(account, publicKey);
    if (typeof view.permission !== "object" || view.permission === null) return null;
    const fc = (view.permission as { FunctionCall?: { allowance?: unknown } }).FunctionCall;
    if (!fc || fc.allowance == null) return null;
    return String(fc.allowance);
  } catch {
    return null;
  }
}
