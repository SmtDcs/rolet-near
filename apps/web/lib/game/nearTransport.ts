import type { GameCallResult } from "../nearCall";
import type { Action, MatchView } from "../nearTypes";
import type { NearViewClient } from "../nearViews";
import { parseIntent, type Intent } from "../stage/protocol";
import { ActionPoller, type ActionPollerOptions } from "./actionPoller";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "./config";
import { applyAction, fromSnapshot, type GameModel } from "./model";
import { redactAction, redactSnapshot } from "./privacy";
import type { GameTransport } from "./transport";

export type NearSubmitCallFn = (
  method: "fire" | "use_item",
  args: Record<string, unknown>,
) => Promise<GameCallResult>;

export interface NearTransportOptions {
  matchId: string;
  players: [string, string];
  you: 0 | 1;
  views: Pick<NearViewClient, "getMatch" | "getActions">;
  submitCall: NearSubmitCallFn;
  cfg?: GameConfig;
  initialMatch?: MatchView;
  pollerOptions?: Partial<
    Pick<
      ActionPollerOptions,
      "activeIntervalMs" | "hiddenIntervalMs" | "maxBackoffMs" | "clock" | "isHidden"
    >
  >;
  autoStart?: boolean;
  onResync?: (snapshot: MatchView) => void;
  onError?: (err: unknown) => void;
}

export class NearTransport implements GameTransport {
  private readonly matchId: string;
  private readonly players: [string, string];
  private readonly you: 0 | 1;
  private readonly cfg: GameConfig;
  private readonly views: Pick<NearViewClient, "getMatch" | "getActions">;
  private readonly submitCall: NearSubmitCallFn;
  private readonly poller: ActionPoller;
  private readonly subscribers = new Set<(actions: Action[]) => void>();
  private readonly resyncSubscribers = new Set<(snapshot: MatchView) => void>();

  private model: GameModel | null = null;
  private cachedSnapshot: MatchView | null = null;
  private appliedSeq: number;
  private disposed = false;

  constructor(opts: NearTransportOptions) {
    this.matchId = opts.matchId;
    this.players = opts.players;
    this.you = opts.you;
    this.cfg = opts.cfg ?? DEFAULT_GAME_CONFIG;
    this.views = opts.views;
    this.submitCall = opts.submitCall;
    this.appliedSeq = opts.initialMatch?.seq ?? 0;

    if (opts.initialMatch) {
      const redactedInit = redactSnapshot(opts.initialMatch, this.you);
      this.cachedSnapshot = redactedInit;
      this.model = fromSnapshot(redactedInit, this.you);
    }
    if (opts.onResync) {
      this.resyncSubscribers.add(opts.onResync);
    }

    this.poller = new ActionPoller({
      matchId: opts.matchId,
      players: opts.players,
      initialSeq: opts.initialMatch?.seq ?? 0,
      views: opts.views,
      activeIntervalMs: opts.pollerOptions?.activeIntervalMs,
      hiddenIntervalMs: opts.pollerOptions?.hiddenIntervalMs,
      maxBackoffMs: opts.pollerOptions?.maxBackoffMs,
      clock: opts.pollerOptions?.clock,
      isHidden: opts.pollerOptions?.isHidden,
      onError: opts.onError,
      onActions: (rawActions, nextSeq) => {
        if (this.disposed || rawActions.length === 0) return;
        const startSeq = nextSeq - rawActions.length;
        const skip = Math.max(0, this.appliedSeq - startSeq);
        if (skip >= rawActions.length) return;
        const fresh = rawActions.slice(skip);
        this.appliedSeq = Math.max(this.appliedSeq, nextSeq);
        const redacted = this.applyBatch(fresh);
        for (const cb of this.subscribers) {
          cb(redacted);
        }
      },
      onResync: (freshMatch) => {
        if (this.disposed) return;
        this.appliedSeq = freshMatch.seq;
        const redactedSnap = redactSnapshot(freshMatch, this.you);
        this.cachedSnapshot = redactedSnap;
        this.model = fromSnapshot(redactedSnap, this.you);
        for (const cb of this.resyncSubscribers) {
          cb(redactedSnap);
        }
      },
    });

    if (opts.autoStart !== false) {
      this.poller.start(opts.initialMatch === undefined);
    }
  }

  start(): void {
    if (!this.disposed) {
      this.poller.start(false);
    }
  }

  pollNow(): Promise<void> {
    return this.poller.pollNow();
  }

  getModel(): GameModel | null {
    return this.model;
  }

  onResync(cb: (snapshot: MatchView) => void): () => void {
    this.resyncSubscribers.add(cb);
    return () => {
      this.resyncSubscribers.delete(cb);
    };
  }

  onActions(cb: (actions: Action[]) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  async snapshot(): Promise<MatchView> {
    const raw = await this.views.getMatch(this.matchId, this.players);
    if (!raw) {
      if (this.cachedSnapshot) {
        return this.cachedSnapshot;
      }
      throw new Error(`Match ${this.matchId} not found`);
    }

    if (!this.model) {
      const redacted = redactSnapshot(raw, this.you);
      this.cachedSnapshot = redacted;
      this.model = fromSnapshot(redacted, this.you);
      this.appliedSeq = raw.seq;
      this.poller.setLastSeq(raw.seq);
      return redacted;
    }

    const redacted = redactSnapshot(raw, this.you, this.model.knownShells);
    this.cachedSnapshot = redacted;
    this.poller.setLastSeq(raw.seq);
    return redacted;
  }

  async submitIntent(rawIntent: Intent): Promise<Action[]> {
    if (this.disposed) {
      throw new Error("tx failed: transport disposed");
    }

    const valid = parseIntent(rawIntent, this.cfg.max_items);
    if (valid === null) {
      throw new Error("tx failed: InvalidIntent");
    }

    const seqBefore = this.appliedSeq;
    const res =
      valid.kind === "fire"
        ? await this.submitCall("fire", {
            match_id: this.matchId,
            target: valid.target,
          })
        : await this.submitCall("use_item", {
            match_id: this.matchId,
            slot: valid.slot,
            steal_slot: valid.stealSlot ?? null,
          });

    const expectedEnd = seqBefore + res.events.length;
    const redactedAll = res.events.map((a) => redactAction(a, this.you));
    if (this.appliedSeq < expectedEnd) {
      const skip = Math.max(0, this.appliedSeq - seqBefore);
      const fresh = redactedAll.slice(skip);
      this.appliedSeq = expectedEnd;
      this.poller.setLastSeq(expectedEnd);
      for (const safe of fresh) {
        if (this.model) {
          this.model = applyAction(this.model, safe, this.you, this.cfg);
        }
      }
      for (const cb of this.subscribers) {
        cb(fresh);
      }
    }
    return redactedAll;
  }

  dispose(): void {
    this.disposed = true;
    this.poller.stop();
    this.subscribers.clear();
    this.resyncSubscribers.clear();
  }

  private applyBatch(rawActions: readonly Action[]): Action[] {
    const redacted: Action[] = [];
    for (const action of rawActions) {
      const safe = redactAction(action, this.you);
      redacted.push(safe);
      if (this.model) {
        this.model = applyAction(this.model, safe, this.you, this.cfg);
      }
    }
    return redacted;
  }
}
