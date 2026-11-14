/**
 * NEAR FinalExecutionOutcome parser (SuccessValue + NEP-297 rolet events)
 * and error classifier for retry/key-rotation decisions (F2-4).
 */

import { rateLimitedError } from "./rateLimit";
import { base64ToBytes } from "./nearCommit";
import { isAllowanceError, isAccessKeyMissing, isMethodDenied } from "./nearKey";
import { isAction, type Action } from "./nearTypes";

export type NearErrorKind =
  | "allowance"
  | "missingKey"
  | "methodDenied"
  | "nonce"
  | "rateLimit"
  | "contractPanic"
  | "network"
  | "other";

export interface ParsedOutcome {
  ok: boolean;
  returnValue: unknown;
  events: Action[];
  failure?: unknown;
}

export interface OutcomeLike {
  status?: unknown;
  transaction_outcome?: {
    outcome?: {
      logs?: unknown;
      status?: unknown;
    };
  };
  receipts_outcome?: Array<{
    outcome?: {
      logs?: unknown;
      status?: unknown;
    };
  }>;
}

const EVENT_PREFIX = "EVENT_JSON:";

function decodeSuccessValue(b64: string): unknown {
  if (b64.length === 0) return undefined;
  const text = new TextDecoder().decode(base64ToBytes(b64));
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractLogs(outcome: OutcomeLike): string[] {
  const logs: string[] = [];
  const pushLogs = (raw: unknown) => {
    if (!Array.isArray(raw)) return;
    for (const line of raw) {
      if (typeof line === "string") logs.push(line);
    }
  };
  pushLogs(outcome.transaction_outcome?.outcome?.logs);
  if (Array.isArray(outcome.receipts_outcome)) {
    for (const r of outcome.receipts_outcome) {
      pushLogs(r?.outcome?.logs);
    }
  }
  return logs;
}

function extractRoletEvents(logs: string[]): Action[] {
  const events: Action[] = [];
  for (const line of logs) {
    if (!line.startsWith(EVENT_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(line.slice(EVENT_PREFIX.length));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        continue;
      }
      const obj = parsed as Record<string, unknown>;
      if (obj.standard !== "rolet" || !Array.isArray(obj.data)) continue;
      for (const item of obj.data) {
        if (isAction(item)) {
          events.push(item);
        }
      }
    } catch {
      // Ignore malformed EVENT_JSON lines.
    }
  }
  return events;
}

function findFailureInOutcomes(outcome: OutcomeLike): unknown {
  const txStatus = outcome.transaction_outcome?.outcome?.status;
  if (typeof txStatus === "object" && txStatus !== null && "Failure" in txStatus) {
    return (txStatus as { Failure: unknown }).Failure;
  }
  if (Array.isArray(outcome.receipts_outcome)) {
    for (const r of outcome.receipts_outcome) {
      const st = r?.outcome?.status;
      if (typeof st === "object" && st !== null && "Failure" in st) {
        return (st as { Failure: unknown }).Failure;
      }
    }
  }
  return undefined;
}

/**
 * Parses a NEAR FinalExecutionOutcome into status, decoded return value, and rolet Action events.
 */
export function parseOutcome(finalOutcome: OutcomeLike | null | undefined): ParsedOutcome {
  if (!finalOutcome || typeof finalOutcome !== "object") {
    return { ok: false, returnValue: undefined, events: [], failure: "missing outcome" };
  }

  const events = extractRoletEvents(extractLogs(finalOutcome));
  const status = finalOutcome.status;

  if (typeof status === "object" && status !== null) {
    const rec = status as Record<string, unknown>;
    if ("Failure" in rec && rec.Failure !== undefined) {
      return {
        ok: false,
        returnValue: undefined,
        events,
        failure: rec.Failure,
      };
    }
    if ("SuccessValue" in rec && typeof rec.SuccessValue === "string") {
      return {
        ok: true,
        returnValue: decodeSuccessValue(rec.SuccessValue),
        events,
      };
    }
  }

  if (status === "Failure") {
    return {
      ok: false,
      returnValue: undefined,
      events,
      failure: findFailureInOutcomes(finalOutcome) ?? "Failure",
    };
  }

  const nestedFailure = findFailureInOutcomes(finalOutcome);
  if (nestedFailure !== undefined) {
    return {
      ok: false,
      returnValue: undefined,
      events,
      failure: nestedFailure,
    };
  }

  return { ok: true, returnValue: undefined, events };
}

function isHttpStatusCode(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}

function flattenErrorStrings(err: unknown): {
  keys: Set<string>;
  strings: string[];
  statusCode?: number;
} {
  const keys = new Set<string>();
  const strings: string[] = [];
  const seen = new Set<object>();
  let statusCode: number | undefined;

  function recordStatusCode(key: string, value: unknown): void {
    if (
      statusCode === undefined &&
      (key === "status" || key === "statusCode" || key === "cause") &&
      isHttpStatusCode(value)
    ) {
      statusCode = value;
    }
  }

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
        recordStatusCode(k, record[k]);
        visit(record[k], depth + 1);
      }
      if ("cause" in val && val.cause !== undefined) {
        recordStatusCode("cause", val.cause);
        visit(val.cause, depth + 1);
      }
      return;
    }

    if (Array.isArray(val)) {
      for (const item of val) visit(item, depth + 1);
      return;
    }

    const obj = val as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      keys.add(k);
      recordStatusCode(k, v);
      visit(v, depth + 1);
    }
  }

  visit(err, 0);
  return { keys, strings, statusCode };
}

function hasAnyToken(
  info: { keys: Set<string>; strings: string[] },
  tokens: string[],
): boolean {
  for (const t of tokens) {
    if (info.keys.has(t)) return true;
    if (info.strings.some((s) => s === t || s.includes(t))) return true;
  }
  return false;
}

/**
 * Classifies an RPC, transaction, or outcome error into a canonical recovery category.
 */
export function classifyError(err: unknown): NearErrorKind {
  if (isAllowanceError(err)) return "allowance";
  if (isAccessKeyMissing(err)) return "missingKey";
  if (isMethodDenied(err)) return "methodDenied";

  const info = flattenErrorStrings(err);

  if (
    hasAnyToken(info, ["InvalidNonce"]) ||
    info.strings.some((s) => /must be larger than nonce|invalid nonce/i.test(s))
  ) {
    return "nonce";
  }

  if (
    info.statusCode === 429 ||
    info.strings.some((s) => rateLimitedError(s) || /rate limit/i.test(s))
  ) {
    return "rateLimit";
  }

  if (
    hasAnyToken(info, [
      "GuestPanic",
      "FunctionCallError",
      "Smart contract panicked",
      "ExecutionError",
      "HostError",
      "ActionError",
    ]) ||
    info.strings.some((s) => /panicked|insufficient gas/i.test(s))
  ) {
    return "contractPanic";
  }

  if (
    (info.statusCode !== undefined && info.statusCode >= 500) ||
    hasAnyToken(info, [
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "FetchError",
      "NetworkError",
      "Timeout",
      "Closed",
    ]) ||
    info.strings.some((s) =>
      /failed to fetch|fetch failed|network|socket hang up|econnrefused|timed out/i.test(s),
    )
  ) {
    return "network";
  }

  return "other";
}
