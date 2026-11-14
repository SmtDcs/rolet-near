import type { Target } from "../nearTypes";

export type AimZone = "opp" | "self" | "dead";

export interface AimState {
  active: boolean;
  aim: number;
  zone: AimZone;
  canConfirm: boolean;
}

export type AimReleaseResult =
  | { kind: "confirm"; target: Target }
  | { kind: "cancel" };

export type AimKeyAction =
  | { kind: "update"; state: AimState }
  | { kind: "confirm"; target: Target }
  | { kind: "cancel" };

export interface AimGestureOptions {
  stageHeight?: number;
  spanFraction?: number;
  deadZone?: number;
  confirmThreshold?: number;
  keyStep?: number;
}

export const AIM_DEAD_ZONE = 0.25;
export const AIM_CONFIRM_THRESHOLD = 0.6;
export const DEFAULT_SPAN_FRACTION = 0.4;
export const DEFAULT_KEY_STEP = 0.3;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function classifyAimZone(
  aim: number,
  deadZone: number = AIM_DEAD_ZONE,
): AimZone {
  if (aim >= deadZone) return "opp";
  if (aim <= -deadZone) return "self";
  return "dead";
}

/**
 * Tracks normalized vertical pointer drag (positive = up toward opponent,
 * negative = down toward self) and keyboard Up/Down/Enter/Escape aiming.
 */
export class AimGesture {
  private stageHeight: number;
  private readonly spanFraction: number;
  private readonly deadZone: number;
  private readonly confirmThreshold: number;
  private readonly keyStep: number;

  private active = false;
  private startY = 0;
  private aim = 0;

  constructor(options: AimGestureOptions = {}) {
    this.stageHeight = Math.max(1, options.stageHeight ?? 800);
    this.spanFraction = options.spanFraction ?? DEFAULT_SPAN_FRACTION;
    this.deadZone = options.deadZone ?? AIM_DEAD_ZONE;
    this.confirmThreshold = options.confirmThreshold ?? AIM_CONFIRM_THRESHOLD;
    this.keyStep = options.keyStep ?? DEFAULT_KEY_STEP;
  }

  setStageHeight(height: number): void {
    this.stageHeight = Math.max(1, height);
  }

  get state(): AimState {
    return {
      active: this.active,
      aim: this.aim,
      zone: classifyAimZone(this.aim, this.deadZone),
      canConfirm: Math.abs(this.aim) >= this.confirmThreshold,
    };
  }

  pointerDown(clientY: number): AimState {
    this.active = true;
    this.startY = clientY;
    this.aim = 0;
    return this.state;
  }

  pointerMove(clientY: number): AimState {
    if (!this.active) {
      return this.state;
    }
    const span = Math.max(1, this.stageHeight * this.spanFraction);
    const normalized = (this.startY - clientY) / span;
    this.aim = clamp(normalized, -1, 1);
    return this.state;
  }

  pointerUp(clientY?: number): AimReleaseResult {
    if (!this.active) {
      return { kind: "cancel" };
    }
    if (clientY !== undefined) {
      this.pointerMove(clientY);
    }
    const finalAim = this.aim;
    this.reset();
    if (Math.abs(finalAim) >= this.confirmThreshold) {
      return {
        kind: "confirm",
        target: finalAim > 0 ? "Opponent" : "SelfTarget",
      };
    }
    return { kind: "cancel" };
  }

  pointerCancel(): AimReleaseResult {
    this.reset();
    return { kind: "cancel" };
  }

  handleKey(key: string): AimKeyAction | null {
    switch (key) {
      case "ArrowUp": {
        this.active = true;
        this.aim = clamp(Math.round((this.aim + this.keyStep) * 1000) / 1000, -1, 1);
        return { kind: "update", state: this.state };
      }
      case "ArrowDown": {
        this.active = true;
        this.aim = clamp(Math.round((this.aim - this.keyStep) * 1000) / 1000, -1, 1);
        return { kind: "update", state: this.state };
      }
      case "Enter": {
        if (Math.abs(this.aim) >= this.confirmThreshold) {
          const target: Target = this.aim > 0 ? "Opponent" : "SelfTarget";
          this.reset();
          return { kind: "confirm", target };
        }
        return { kind: "update", state: this.state };
      }
      case "Escape": {
        this.reset();
        return { kind: "cancel" };
      }
      default:
        return null;
    }
  }

  reset(): void {
    this.active = false;
    this.aim = 0;
  }
}
