import type { Action } from "../nearTypes";
import type { Intent } from "../stage/protocol";
import { createBeat, type Beat } from "./beats";
import type { GameModel } from "./model";

export type IntentPhase =
  | "idle"
  | "preparing"
  | "sent"
  | "holding"
  | "resolved"
  | "failed";

export interface IntentClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export interface IntentFlowState {
  phase: IntentPhase;
  activeIntent: Intent | null;
  startedAt: number | null;
  lastError: string | null;
  stallEmitted: boolean;
}

export interface IntentFlowOptions {
  clock: IntentClock;
  submit: (intent: Intent) => Promise<Action[]>;
  emitBeat: (beat: Beat) => void;
  onResolved?: (intent: Intent, actions: Action[]) => void;
  onFailed?: (intent: Intent, reason: string) => void;
  onStateChange?: (state: IntentFlowState) => void;
  minHoldMs?: number;
  stallDelayMs?: number;
  timeoutMs?: number;
}

export interface StartIntentResult {
  accepted: boolean;
  reason?: "busy" | "disposed";
}

export const DEFAULT_MIN_HOLD_MS = 700;
export const DEFAULT_STALL_DELAY_MS = 4000;
export const DEFAULT_INTENT_TIMEOUT_MS = 20_000;

/**
 * Pure interaction gate: user can trigger a new stage intent only on their active
 * turn while both Director and IntentFlow are ready.
 */
export function canAct(
  model: GameModel,
  you: number,
  directorBusy: boolean,
  intentPhase: IntentPhase,
): boolean {
  if (model.phase !== "active" || model.turn !== you || directorBusy) {
    return false;
  }
  return intentPhase === "idle" || intentPhase === "resolved" || intentPhase === "failed";
}

/**
 * Masks network/on-chain transaction latency behind revolver preparation and tension hold beats.
 */
export class IntentFlow {
  private readonly clock: IntentClock;
  private readonly submitFn: (intent: Intent) => Promise<Action[]>;
  private readonly emitBeatFn: (beat: Beat) => void;
  private readonly onResolvedFn?: (intent: Intent, actions: Action[]) => void;
  private readonly onFailedFn?: (intent: Intent, reason: string) => void;
  private readonly onStateChangeFn?: (state: IntentFlowState) => void;
  private readonly minHoldMs: number;
  private readonly stallDelayMs: number;
  private readonly timeoutMs: number;

  private current: IntentFlowState = {
    phase: "idle",
    activeIntent: null,
    startedAt: null,
    lastError: null,
    stallEmitted: false,
  };
  private generation = 0;
  private holdElapsed = false;
  private pendingActions: Action[] | null = null;
  private holdTimer: unknown = null;
  private stallTimer: unknown = null;
  private timeoutTimer: unknown = null;
  private disposed = false;

  constructor(options: IntentFlowOptions) {
    this.clock = options.clock;
    this.submitFn = options.submit;
    this.emitBeatFn = options.emitBeat;
    this.onResolvedFn = options.onResolved;
    this.onFailedFn = options.onFailed;
    this.onStateChangeFn = options.onStateChange;
    this.minHoldMs = options.minHoldMs ?? DEFAULT_MIN_HOLD_MS;
    this.stallDelayMs = options.stallDelayMs ?? DEFAULT_STALL_DELAY_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_INTENT_TIMEOUT_MS;
  }

  get state(): IntentFlowState {
    return { ...this.current };
  }

  get isBusy(): boolean {
    return (
      this.current.phase === "preparing" ||
      this.current.phase === "sent" ||
      this.current.phase === "holding"
    );
  }

  startIntent(intent: Intent): StartIntentResult {
    if (this.disposed) {
      return { accepted: false, reason: "disposed" };
    }
    if (this.isBusy) {
      return { accepted: false, reason: "busy" };
    }

    this.clearTimers();
    const gen = ++this.generation;
    this.holdElapsed = false;
    this.pendingActions = null;

    this.setState({
      phase: "preparing",
      activeIntent: intent,
      startedAt: this.clock.now(),
      lastError: null,
      stallEmitted: false,
    });

    if (intent.kind === "fire") {
      this.emitBeatFn(createBeat("gun_pickup", { isLocal: true, intentId: intent.id }));
      this.emitBeatFn(
        createBeat(intent.target === "Opponent" ? "aim_opp" : "aim_self", {
          isLocal: true,
          intentId: intent.id,
          target: intent.target,
        }),
      );
    }
    this.emitBeatFn(createBeat("tension_hold", { isLocal: true, intentId: intent.id }));

    this.holdTimer = this.clock.setTimeout(() => {
      if (this.disposed || this.generation !== gen || !this.isBusy) {
        return;
      }
      this.holdElapsed = true;
      if (this.pendingActions !== null) {
        this.finishResolved(gen, intent, this.pendingActions);
      } else if (this.current.phase === "sent") {
        this.setState({ ...this.current, phase: "holding" });
      }
    }, this.minHoldMs);

    this.stallTimer = this.clock.setTimeout(() => {
      if (this.disposed || this.generation !== gen || !this.isBusy) {
        return;
      }
      if (!this.current.stallEmitted) {
        this.setState({
          ...this.current,
          phase: "holding",
          stallEmitted: true,
        });
        this.emitBeatFn(
          createBeat("tension_stall", {
            isLocal: true,
            intentId: intent.id,
            caption: "mechanism jammed",
          }),
        );
      }
    }, this.stallDelayMs);

    this.timeoutTimer = this.clock.setTimeout(() => {
      if (this.disposed || this.generation !== gen || !this.isBusy) {
        return;
      }
      this.finishFailed(gen, intent, "timeout");
    }, this.timeoutMs);

    this.setState({ ...this.current, phase: "sent" });

    let submission: Promise<Action[]>;
    try {
      submission = Promise.resolve(this.submitFn(intent));
    } catch (err: unknown) {
      submission = Promise.reject(err);
    }
    void submission.then(
      (actions) => {
        if (this.disposed || this.generation !== gen || !this.isBusy) {
          return;
        }
        if (this.holdElapsed) {
          this.finishResolved(gen, intent, actions);
        } else {
          this.pendingActions = actions;
          this.setState({ ...this.current, phase: "holding" });
        }
      },
      (err: unknown) => {
        if (this.disposed || this.generation !== gen || !this.isBusy) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        this.finishFailed(gen, intent, message);
      },
    );

    return { accepted: true };
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.clearTimers();
  }

  private finishResolved(gen: number, intent: Intent, actions: Action[]): void {
    if (this.generation !== gen) return;
    this.clearTimers();
    this.pendingActions = null;
    this.setState({
      phase: "resolved",
      activeIntent: intent,
      startedAt: this.current.startedAt,
      lastError: null,
      stallEmitted: this.current.stallEmitted,
    });
    this.onResolvedFn?.(intent, actions);
  }

  private finishFailed(gen: number, intent: Intent, reason: string): void {
    if (this.generation !== gen) return;
    this.clearTimers();
    this.pendingActions = null;
    this.setState({
      phase: "failed",
      activeIntent: intent,
      startedAt: this.current.startedAt,
      lastError: reason,
      stallEmitted: this.current.stallEmitted,
    });
    this.emitBeatFn(
      createBeat(intent.kind === "fire" ? "rollback_gun" : "rollback_item", {
        isLocal: true,
        intentId: intent.id,
        reason,
      }),
    );
    this.onFailedFn?.(intent, reason);
  }

  private clearTimers(): void {
    if (this.holdTimer !== null) {
      this.clock.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.stallTimer !== null) {
      this.clock.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
    if (this.timeoutTimer !== null) {
      this.clock.clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private setState(next: IntentFlowState): void {
    this.current = next;
    this.onStateChangeFn?.({ ...next });
  }
}
