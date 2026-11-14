import type { Item, Shell } from "@/lib/nearTypes";
import type { AimState } from "@/lib/game/aimGesture";
import type { BeatId } from "@/lib/game/beats";
import type { IntentPhase } from "@/lib/game/intentFlow";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";

export type GunHolder = "table" | "local" | "rival";

export interface StageVisualState {
  round: number;
  score: [number, number];
  hp: [number, number];
  maxHp: number;
  healCut: [boolean, boolean];
  items: [Item[], Item[]];
  announcedLive: number;
  announcedBlank: number;
  remaining: number;
  knownShells: ReadonlyMap<number, Shell>;
  turn: number;
  you: 0 | 1;
  sawActive: boolean;
  shackledSeat: number | null;
  gunHolder: GunHolder;
  gunAim: number; // -1 (self) .. 0 (lifted) .. +1 (opp)
  cylinderIndex: number;
  craneOpen: boolean;
  hammerCocked: boolean;
  ejectedShell: Shell | null;
  phase: "revealing" | "active" | "finished" | "cancelled";
  winner: number | null;
}

export interface StageFxState {
  muzzleFlash: boolean;
  blackoutStage: "none" | "white" | "black" | "recover";
  shake: "none" | "light" | "heavy";
  bannerText: string | null;
  bannerTone: "neutral" | "alert" | "brass" | "patina";
  loupeRevealShell: Shell | null;
  stallCaption: string | null;
  errorText: string | null;
}

export interface StageHudProps {
  txPhase: IntentPhase;
  canAct: boolean;
  aimState: AimState;
  lockpickSlot: number | null;
  activeBeatId: BeatId | null;
  muted: boolean;
  onToggleMute: () => void;
  onCancelLockpick?: () => void;
  statusLabel?: string;
  canClaimTimeout?: boolean;
  onClaimTimeout?: () => void;
  claimTimeoutBusy?: boolean;
}

export const INITIAL_FX_STATE: StageFxState = {
  muzzleFlash: false,
  blackoutStage: "none",
  shake: "none",
  bannerText: null,
  bannerTone: "neutral",
  loupeRevealShell: null,
  stallCaption: null,
  errorText: null,
};

export function createDefaultStageVisual(you: 0 | 1 = 0): StageVisualState {
  return {
    round: 1,
    score: [0, 0],
    hp: [4, 4],
    maxHp: 4,
    healCut: [false, false],
    items: [
      ["Loupe", "Pipe", "Flask", "Hacksaw"],
      ["Shackle", "Ticker", "Magnet", "Tincture"],
    ],
    announcedLive: 3,
    announcedBlank: 5,
    remaining: 8,
    knownShells: new Map(),
    turn: 0,
    you,
    sawActive: false,
    shackledSeat: null,
    gunHolder: "table",
    gunAim: 0,
    cylinderIndex: 0,
    craneOpen: false,
    hammerCocked: false,
    ejectedShell: null,
    phase: "active",
    winner: null,
  };
}

export interface RivalStageProps {
  clipId: RivalClipId;
  characterKind: CharacterKind;
  paused?: boolean;
  seed?: number;
  onClipEnded?: (clipId: RivalClipId) => void;
}
