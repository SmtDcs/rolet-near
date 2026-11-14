/** In-memory symmetric pair queue for NEAR accounts. One Node process. */

const WAIT_MS = 180_000;
const PAIR_MS = 180_000;
const TOKEN_MS = 10 * 60_000;

/**
 * NEAR account ID rules:
 * - length 2..64
 * - named accounts with dot-separated `[a-z0-9_-]` segments, or 64-hex implicit accounts
 */
const NEAR_ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function isValidNearAccount(accountId: string): boolean {
  return (
    typeof accountId === "string" &&
    accountId.length >= 2 &&
    accountId.length <= 64 &&
    NEAR_ACCOUNT_RE.test(accountId)
  );
}

export type QueueView =
  | { status: "waiting" }
  | { status: "paired"; matchId: string; opponent: string }
  | { status: "expired" };

type Waiter = { accountId: string; since: number };
type Pair = {
  matchId: string;
  players: [string, string];
  createdAt: number;
};
type Token = { token: string; accountId: string; expiresAt: number };

export type QueueState = {
  seq: number;
  waiters: Waiter[];
  pairs: Pair[];
  tokens: Token[];
};

export function createQueue(): QueueState {
  return { seq: 0, waiters: [], pairs: [], tokens: [] };
}

export function queueMessage(accountId: string, now: number): string {
  return `ROLET queue\n${accountId}\n${now}`;
}

export function parseQueueMessage(
  message: string,
): { accountId: string; at: number } | null {
  const lines = message.split("\n");
  if (lines.length !== 3 || lines[0] !== "ROLET queue") return null;
  if (!isValidNearAccount(lines[1])) return null;
  if (!/^\d+$/.test(lines[2])) return null;
  const at = Number(lines[2]);
  if (!Number.isSafeInteger(at)) return null;
  return { accountId: lines[1], at };
}

function tokenOf(state: QueueState, token: string, now: number): Token | null {
  const row = state.tokens.find((t) => t.token === token);
  if (!row || row.expiresAt < now) return null;
  return row;
}

function sweep(state: QueueState, now: number) {
  state.waiters = state.waiters.filter((w) => now - w.since < WAIT_MS);
  state.pairs = state.pairs.filter((p) => now - p.createdAt < PAIR_MS);
  state.tokens = state.tokens.filter((t) => t.expiresAt >= now);
}

function viewFor(state: QueueState, accountId: string): QueueView {
  const pair = state.pairs.find(
    (p) => p.players[0] === accountId || p.players[1] === accountId,
  );
  if (pair) {
    const opponent =
      pair.players[0] === accountId ? pair.players[1] : pair.players[0];
    return {
      status: "paired",
      matchId: pair.matchId,
      opponent,
    };
  }
  if (state.waiters.some((w) => w.accountId === accountId)) {
    return { status: "waiting" };
  }
  return { status: "expired" };
}

function issue(state: QueueState, accountId: string, now: number): string {
  const existing = state.tokens.find(
    (t) => t.accountId === accountId && t.expiresAt >= now,
  );
  if (existing) {
    existing.expiresAt = now + TOKEN_MS;
    return existing.token;
  }
  state.tokens = state.tokens.filter((t) => t.accountId !== accountId);
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  state.tokens.push({ token, accountId, expiresAt: now + TOKEN_MS });
  return token;
}

function randomMatchId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  const raw = view.getBigUint64(0, true);
  return (raw === BigInt(0) ? BigInt(1) : raw).toString();
}

export function enterQueue(
  state: QueueState,
  accountId: string,
  now: number,
): { token: string; view: QueueView; duplicate: boolean } {
  if (!isValidNearAccount(accountId)) {
    throw new Error(`Invalid NEAR account ID: ${accountId}`);
  }
  sweep(state, now);
  const sitting = viewFor(state, accountId);
  if (sitting.status === "waiting") {
    const waiter = state.waiters.find((w) => w.accountId === accountId);
    if (waiter) waiter.since = now;
    return { token: issue(state, accountId, now), view: sitting, duplicate: true };
  }
  if (sitting.status === "paired") {
    return { token: issue(state, accountId, now), view: sitting, duplicate: true };
  }

  const other = state.waiters.shift();
  if (!other || other.accountId === accountId) {
    state.waiters.push({ accountId, since: now });
    return {
      token: issue(state, accountId, now),
      view: { status: "waiting" },
      duplicate: false,
    };
  }

  state.seq = (state.seq + 1) % 1000;
  const matchId = randomMatchId();
  state.pairs.push({
    matchId,
    players: [other.accountId, accountId],
    createdAt: now,
  });
  return {
    token: issue(state, accountId, now),
    view: { status: "paired", matchId, opponent: other.accountId },
    duplicate: false,
  };
}

export function statusQueue(
  state: QueueState,
  token: string,
  now: number,
): QueueView | null {
  sweep(state, now);
  const row = tokenOf(state, token, now);
  if (!row) return null;
  row.expiresAt = now + TOKEN_MS;
  const waiter = state.waiters.find((w) => w.accountId === row.accountId);
  if (waiter) waiter.since = now;
  return viewFor(state, row.accountId);
}

export function leaveQueue(state: QueueState, token: string, now: number): void {
  sweep(state, now);
  const row = tokenOf(state, token, now);
  if (!row) return;
  state.waiters = state.waiters.filter((w) => w.accountId !== row.accountId);
  state.pairs = state.pairs.filter(
    (p) => p.players[0] !== row.accountId && p.players[1] !== row.accountId,
  );
  state.tokens = state.tokens.filter((t) => t.accountId !== row.accountId);
}

const globalQueue = globalThis as typeof globalThis & {
  __roletMatchQueue?: QueueState;
};

export function getMatchQueue(): QueueState {
  if (!globalQueue.__roletMatchQueue) globalQueue.__roletMatchQueue = createQueue();
  return globalQueue.__roletMatchQueue;
}

let chain: Promise<void> = Promise.resolve();

export function withMatchQueue<T>(fn: (state: QueueState) => T): Promise<T> {
  const run = chain.then(() => fn(getMatchQueue()));
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
