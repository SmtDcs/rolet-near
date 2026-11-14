import type { Action, GameStateView, MatchStatus, MatchView } from "../nearTypes";
import { parseIntent, type Intent } from "../stage/protocol";
import { chooseBotIntent } from "./bot";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "./config";
import { applyAction, fromSnapshot, type GameModel } from "./model";
import { redactAction, redactSnapshot } from "./privacy";
import { createMatchState, fire, playItem } from "./rules";
import { SeededSource } from "./shellSource";
import type { GameTransport } from "./transport";

export interface PracticeClock {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface PracticeEngineOptions {
  seed: Uint8Array | string | number;
  you?: 0 | 1;
  firstTurn?: 0 | 1;
  cfg?: GameConfig;
  clock?: PracticeClock;
  /** Fixed ms delay or [minMs, maxMs] inclusive range. Defaults to [300, 1500]. */
  latencyMs?: number | readonly [number, number];
  botChooser?: (model: GameModel, botSeat: number, seq: number) => Intent;
}

const DEFAULT_CLOCK: PracticeClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

const LOG_CAP = 32;

function cloneGameStateView(g: GameStateView): GameStateView {
  return {
    round: g.round,
    score: [g.score[0], g.score[1]],
    hp: [g.hp[0], g.hp[1]],
    max_hp: g.max_hp,
    heal_cut: [g.heal_cut[0], g.heal_cut[1]],
    items: [[...g.items[0]], [...g.items[1]]],
    load: {
      announced_live: g.load.announced_live,
      announced_blank: g.load.announced_blank,
      live_left: g.load.live_left,
      blank_left: g.load.blank_left,
      remaining: g.load.remaining,
      fixed: [...g.load.fixed],
    },
    turn: g.turn,
    shackled: g.shackled,
    shackle_broke_this_turn: g.shackle_broke_this_turn,
    saw_active: g.saw_active,
    deck_counts: [...g.deck_counts],
  };
}

/**
 * Local practice-mode GameTransport backed by TS game rules + SeededSource.
 * Maintains separate redacted models so neither client nor bot sees private opponent info.
 */
export class PracticeEngine implements GameTransport {
  private readonly cfg: GameConfig;
  private readonly you: 0 | 1;
  private readonly botSeat: 0 | 1;
  private readonly src: SeededSource;
  private readonly latencyPrng: SeededSource;
  private readonly clock: PracticeClock;
  private readonly latencyRange: readonly [number, number];
  private readonly botChooser: (model: GameModel, botSeat: number, seq: number) => Intent;

  private readonly state: GameStateView;
  private readonly log: Action[] = [];
  private readonly subscribers = new Set<(actions: Action[]) => void>();
  private readonly timers = new Set<unknown>();

  private youModel: GameModel;
  private botModel: GameModel;
  private seq = 0;
  private botIntentSeq = 0;
  private botTimer: unknown = null;
  private disposed = false;

  constructor(options: PracticeEngineOptions) {
    this.cfg = options.cfg ?? DEFAULT_GAME_CONFIG;
    this.you = options.you ?? 0;
    this.botSeat = (1 - this.you) as 0 | 1;
    this.src = new SeededSource(options.seed);
    this.latencyPrng = new SeededSource(`latency:${String(options.seed)}`);
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.latencyRange =
      options.latencyMs === undefined
        ? [300, 1500]
        : typeof options.latencyMs === "number"
          ? [options.latencyMs, options.latencyMs]
          : options.latencyMs;
    this.botChooser = options.botChooser ?? chooseBotIntent;

    const firstTurn = options.firstTurn ?? 0;
    const init = createMatchState(this.cfg, firstTurn, this.src);
    this.state = init.state;
    this.recordRawActions(init.actions);

    const initialRaw = this.rawSnapshot();
    this.youModel = fromSnapshot(initialRaw, this.you);
    this.botModel = fromSnapshot(initialRaw, this.botSeat);

    if (this.state.turn === this.botSeat && this.winner === null) {
      this.scheduleBotTurn();
    }
  }

  get winner(): number | null {
    if (this.state.score[0] >= 2) return 0;
    if (this.state.score[1] >= 2) return 1;
    return null;
  }

  snapshot(): MatchView {
    return redactSnapshot(this.rawSnapshot(), this.you, this.youModel.knownShells);
  }

  onActions(cb: (actions: Action[]) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  submitIntent(rawIntent: Intent): Promise<Action[]> {
    if (this.disposed) {
      return Promise.reject(new Error("tx failed: engine disposed"));
    }

    const delay = this.nextLatencyMs();
    return new Promise<Action[]>((resolve, reject) => {
      const timer = this.clock.setTimeout(() => {
        this.timers.delete(timer);
        if (this.disposed) {
          reject(new Error("tx failed: engine disposed"));
          return;
        }
        try {
          const valid = parseIntent(rawIntent, this.cfg.max_items);
          if (valid === null) {
            throw new Error("InvalidIntent");
          }
          const rawActions = this.executeMove(this.you, valid);
          const clientActions = this.applyAndRecord(rawActions);
          if (this.state.turn === this.botSeat && this.winner === null) {
            this.scheduleBotTurn();
          }
          resolve(clientActions);
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          reject(new Error(`tx failed: ${reason}`));
        }
      }, delay);
      this.timers.add(timer);
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.botTimer !== null) {
      this.clock.clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    for (const timer of this.timers) {
      this.clock.clearTimeout(timer);
    }
    this.timers.clear();
    this.subscribers.clear();
  }

  private rawSnapshot(): MatchView {
    const w = this.winner;
    const status: MatchStatus = w !== null ? "Finished" : "Active";
    return {
      id: "practice",
      status,
      players: [
        this.you === 0 ? "you.local" : "bot.local",
        this.you === 1 ? "you.local" : "bot.local",
      ],
      tokens: ["practice-0", "practice-1"],
      revealed: [true, true],
      game: cloneGameStateView(this.state),
      reveal_deadline_ms: 0,
      deadline_ms: 0,
      winner: w,
      seq: this.seq,
      log: [...this.log],
    };
  }

  private executeMove(actor: number, intent: Intent): Action[] {
    if (intent.kind === "fire") {
      return fire(this.state, this.cfg, actor, intent.target, this.src);
    }
    return playItem(
      this.state,
      this.cfg,
      actor,
      intent.slot,
      intent.stealSlot ?? null,
      this.src,
    );
  }

  private recordRawActions(actions: readonly Action[]): void {
    this.seq += actions.length;
    this.log.push(...actions);
    if (this.log.length > LOG_CAP) {
      this.log.splice(0, this.log.length - LOG_CAP);
    }
  }

  private applyAndRecord(rawActions: readonly Action[]): Action[] {
    this.recordRawActions(rawActions);
    const clientActions: Action[] = [];
    for (const action of rawActions) {
      this.youModel = applyAction(this.youModel, action, this.you, this.cfg);
      this.botModel = applyAction(this.botModel, action, this.botSeat, this.cfg);
      clientActions.push(redactAction(action, this.you));
    }
    for (const cb of this.subscribers) {
      cb(clientActions);
    }
    return clientActions;
  }

  private scheduleBotTurn(): void {
    if (this.disposed || this.botTimer !== null) {
      return;
    }
    if (this.winner !== null || this.state.turn !== this.botSeat) {
      return;
    }
    const delay = this.nextLatencyMs();
    this.botTimer = this.clock.setTimeout(() => {
      this.botTimer = null;
      if (this.disposed || this.winner !== null || this.state.turn !== this.botSeat) {
        return;
      }
      const botIntent = this.botChooser(this.botModel, this.botSeat, ++this.botIntentSeq);
      const rawActions = this.executeMove(this.botSeat, botIntent);
      this.applyAndRecord(rawActions);
      if (this.winner === null && this.state.turn === this.botSeat) {
        this.scheduleBotTurn();
      }
    }, delay);
  }

  private nextLatencyMs(): number {
    const [min, max] = this.latencyRange;
    if (max <= min) return Math.max(0, min);
    return min + this.latencyPrng.roll(max - min + 1);
  }
}
