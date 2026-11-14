import type { Action, MatchView } from "../nearTypes";
import type { NearViewClient } from "../nearViews";
import { mergeActionsPage } from "./actionSync";

export const DEFAULT_ACTIVE_POLL_MS = 600;
export const DEFAULT_HIDDEN_POLL_MS = 3_000;
export const DEFAULT_MAX_BACKOFF_MS = 10_000;

export interface PollerClock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const DEFAULT_CLOCK: PollerClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

function defaultIsHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

export interface ActionPollerOptions {
  matchId: string;
  players: [string, string];
  initialSeq: number;
  views: Pick<NearViewClient, "getActions" | "getMatch">;
  onActions: (actions: Action[], nextSeq: number) => void;
  onResync?: (match: MatchView) => void;
  onError?: (err: unknown) => void;
  activeIntervalMs?: number;
  hiddenIntervalMs?: number;
  maxBackoffMs?: number;
  clock?: PollerClock;
  isHidden?: () => boolean;
}

export class ActionPoller {
  private readonly matchId: string;
  private readonly players: [string, string];
  private readonly views: Pick<NearViewClient, "getActions" | "getMatch">;
  private readonly onActionsCb: (actions: Action[], nextSeq: number) => void;
  private readonly onResyncCb?: (match: MatchView) => void;
  private readonly onErrorCb?: (err: unknown) => void;
  private readonly activeIntervalMs: number;
  private readonly hiddenIntervalMs: number;
  private readonly maxBackoffMs: number;
  private readonly clock: PollerClock;
  private readonly isHidden: () => boolean;

  private lastSeq: number;
  private consecutiveErrors = 0;
  private running = false;
  private inFlight = false;
  private timer: unknown = null;

  constructor(opts: ActionPollerOptions) {
    this.matchId = opts.matchId;
    this.players = opts.players;
    this.lastSeq = opts.initialSeq;
    this.views = opts.views;
    this.onActionsCb = opts.onActions;
    this.onResyncCb = opts.onResync;
    this.onErrorCb = opts.onError;
    this.activeIntervalMs = opts.activeIntervalMs ?? DEFAULT_ACTIVE_POLL_MS;
    this.hiddenIntervalMs = opts.hiddenIntervalMs ?? DEFAULT_HIDDEN_POLL_MS;
    this.maxBackoffMs = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    this.clock = opts.clock ?? DEFAULT_CLOCK;
    this.isHidden = opts.isHidden ?? defaultIsHidden;
  }

  getLastSeq(): number {
    return this.lastSeq;
  }

  setLastSeq(seq: number): void {
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
    }
  }

  getConsecutiveErrors(): number {
    return this.consecutiveErrors;
  }

  nextDelayMs(): number {
    const base = this.isHidden() ? this.hiddenIntervalMs : this.activeIntervalMs;
    if (this.consecutiveErrors <= 0) {
      return base;
    }
    const exp = base * Math.pow(2, this.consecutiveErrors);
    return Math.min(this.maxBackoffMs, exp);
  }

  start(immediate = false): void {
    if (this.running) return;
    this.running = true;
    if (immediate) {
      void this.pollNow();
    } else {
      this.scheduleNext();
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async pollNow(): Promise<void> {
    if (this.inFlight) return;
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }

    this.inFlight = true;
    try {
      const page = await this.views.getActions(
        this.matchId,
        this.lastSeq,
        this.players,
      );
      this.consecutiveErrors = 0;

      const merged = mergeActionsPage(this.lastSeq, page, this.lastSeq);
      if (merged.resync) {
        const match = await this.views.getMatch(this.matchId, this.players);
        if (match && this.running) {
          this.lastSeq = match.seq;
          this.onResyncCb?.(match);
        }
      } else if (merged.apply.length > 0) {
        this.lastSeq = merged.nextSeq;
        if (this.running) {
          this.onActionsCb(merged.apply, merged.nextSeq);
        }
      }
    } catch (err) {
      this.consecutiveErrors += 1;
      this.onErrorCb?.(err);
    } finally {
      this.inFlight = false;
      if (this.running) {
        this.scheduleNext();
      }
    }
  }

  private scheduleNext(): void {
    if (!this.running || this.timer !== null) return;
    const delay = this.nextDelayMs();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      if (this.running) {
        void this.pollNow();
      }
    }, delay);
  }
}
