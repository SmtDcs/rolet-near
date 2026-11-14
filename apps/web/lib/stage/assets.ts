export type CharacterKind = "Kuleci" | "Ayarci" | "Kacak";

export type RivalClipId =
  | "idle"
  | "idle_alt"
  | "aimed_at"
  | "hit_knockback"
  | "recover"
  | "relief"
  | "take_gun"
  | "hold_gun"
  | "aim_self"
  | "aim_you"
  | "fire_recoil"
  | "use_mouth"
  | "use_hands"
  | "shackled"
  | "round_end";

export type StageAssetId =
  | "G-01"
  | "G-02-live"
  | "G-02-blank"
  | "V-01"
  | "V-02"
  | "V-03"
  | "V-04"
  | "V-05"
  | "V-06"
  | "V-10"
  | "V-11"
  | "V-12"
  | "V-13"
  | "V-14"
  | "V-15"
  | "V-16"
  | "V-17"
  | "V-18"
  | "V-19"
  | "V-20"
  | "V-21"
  | "V-22"
  | "V-23"
  | "V-24"
  | "V-30-kuleci"
  | "V-30-ayarci"
  | "V-30-kacak";

export type PreloadTier = "initial" | "background";

interface StageAssetBase {
  id: StageAssetId;
  budgetBytes: number;
  preloadTier: PreloadTier;
  description: string;
}

export type StageAssetEntry =
  | (StageAssetBase & {
      type: "procedural";
      proceduralId: string;
    })
  | (StageAssetBase & {
      type: "video";
      src: string;
      fallbackSrc?: string;
      posterSrc?: string;
      loop?: boolean;
      alpha?: boolean;
    })
  | (StageAssetBase & {
      type: "image";
      src: string;
    })
  | (StageAssetBase & {
      type: "glb";
      src: string;
    });

const KB = 1024;
const MB = 1024 * 1024;

export const INITIAL_LOAD_BUDGET_BYTES = 8 * MB;
export const TOTAL_STAGE_BUDGET_BYTES = 20 * MB;

/**
 * Single manifest for all 3D, video, image, and procedural placeholder stage assets (PLAN-F3 §3).
 * Replacing a procedural placeholder with a real file only requires changing its entry here.
 */
export const STAGE_ASSETS: Readonly<Record<StageAssetId, StageAssetEntry>> = {
  "G-01": {
    id: "G-01",
    type: "procedural",
    proceduralId: "revolver-8-chamber",
    budgetBytes: 2 * MB,
    preloadTier: "initial",
    description: "8-chamber clockwork revolver 3D model",
  },
  "G-02-live": {
    id: "G-02-live",
    type: "procedural",
    proceduralId: "shell-live",
    budgetBytes: 120 * KB,
    preloadTier: "background",
    description: "Live cartridge geometry",
  },
  "G-02-blank": {
    id: "G-02-blank",
    type: "procedural",
    proceduralId: "shell-blank",
    budgetBytes: 120 * KB,
    preloadTier: "background",
    description: "Blank cartridge geometry",
  },
  "V-01": {
    id: "V-01",
    type: "procedural",
    proceduralId: "room-ambient-loop",
    budgetBytes: 3 * MB,
    preloadTier: "initial",
    description: "Clocktower workshop ambient room loop",
  },
  "V-02": {
    id: "V-02",
    type: "procedural",
    proceduralId: "table-front-plate",
    budgetBytes: 400 * KB,
    preloadTier: "initial",
    description: "Foreground table alpha plate",
  },
  "V-03": {
    id: "V-03",
    type: "procedural",
    proceduralId: "lamp-light-pool",
    budgetBytes: 150 * KB,
    preloadTier: "background",
    description: "Swinging lamp light pool and flicker overlay",
  },
  "V-04": {
    id: "V-04",
    type: "procedural",
    proceduralId: "item-sprites-atlas",
    budgetBytes: 400 * KB,
    preloadTier: "initial",
    description: "9 item tabletop sprites",
  },
  "V-05": {
    id: "V-05",
    type: "procedural",
    proceduralId: "shells-tubes-notches-atlas",
    budgetBytes: 200 * KB,
    preloadTier: "initial",
    description: "Shell, HP tube, and score notch sprites",
  },
  "V-06": {
    id: "V-06",
    type: "procedural",
    proceduralId: "fx-sprites-atlas",
    budgetBytes: 300 * KB,
    preloadTier: "background",
    description: "Muzzle flash, smoke, and spark FX sprites",
  },
  "V-10": {
    id: "V-10",
    type: "procedural",
    proceduralId: "rival-idle",
    budgetBytes: 1.5 * MB,
    preloadTier: "initial",
    description: "Rival idle breathing and blink loop",
  },
  "V-11": {
    id: "V-11",
    type: "procedural",
    proceduralId: "rival-idle-alt",
    budgetBytes: 1.5 * MB,
    preloadTier: "background",
    description: "Rival alternate idle loop",
  },
  "V-12": {
    id: "V-12",
    type: "procedural",
    proceduralId: "rival-aimed-at",
    budgetBytes: 1 * MB,
    preloadTier: "background",
    description: "Rival reaction while player aims at them",
  },
  "V-13": {
    id: "V-13",
    type: "procedural",
    proceduralId: "rival-hit-knockback",
    budgetBytes: 600 * KB,
    preloadTier: "background",
    description: "Rival hit knockback clip",
  },
  "V-14": {
    id: "V-14",
    type: "procedural",
    proceduralId: "rival-recover",
    budgetBytes: 600 * KB,
    preloadTier: "background",
    description: "Rival recovery clip",
  },
  "V-15": {
    id: "V-15",
    type: "procedural",
    proceduralId: "rival-relief",
    budgetBytes: 400 * KB,
    preloadTier: "background",
    description: "Rival relief after blank self-shot",
  },
  "V-16": {
    id: "V-16",
    type: "procedural",
    proceduralId: "rival-take-gun",
    budgetBytes: 600 * KB,
    preloadTier: "background",
    description: "Rival taking or putting down revolver",
  },
  "V-17": {
    id: "V-17",
    type: "procedural",
    proceduralId: "rival-hold-gun",
    budgetBytes: 600 * KB,
    preloadTier: "background",
    description: "Rival holding revolver loop",
  },
  "V-18": {
    id: "V-18",
    type: "procedural",
    proceduralId: "rival-aim-self",
    budgetBytes: 800 * KB,
    preloadTier: "background",
    description: "Rival aiming revolver at self",
  },
  "V-19": {
    id: "V-19",
    type: "procedural",
    proceduralId: "rival-aim-you",
    budgetBytes: 800 * KB,
    preloadTier: "background",
    description: "Rival aiming revolver at camera",
  },
  "V-20": {
    id: "V-20",
    type: "procedural",
    proceduralId: "rival-fire-recoil",
    budgetBytes: 500 * KB,
    preloadTier: "background",
    description: "Rival firing recoil",
  },
  "V-21": {
    id: "V-21",
    type: "procedural",
    proceduralId: "rival-use-mouth",
    budgetBytes: 700 * KB,
    preloadTier: "background",
    description: "Rival using mouth item (Pipe/Tincture)",
  },
  "V-22": {
    id: "V-22",
    type: "procedural",
    proceduralId: "rival-use-hands",
    budgetBytes: 700 * KB,
    preloadTier: "background",
    description: "Rival using hands item (Loupe/Hacksaw/Magnet/Ticker/Flask/Lockpick)",
  },
  "V-23": {
    id: "V-23",
    type: "procedural",
    proceduralId: "rival-shackled",
    budgetBytes: 800 * KB,
    preloadTier: "background",
    description: "Rival shackled loop and struggle",
  },
  "V-24": {
    id: "V-24",
    type: "procedural",
    proceduralId: "rival-round-end",
    budgetBytes: 1.5 * MB,
    preloadTier: "background",
    description: "Rival round lost / match result clip",
  },
  "V-30-kuleci": {
    id: "V-30-kuleci",
    type: "procedural",
    proceduralId: "portrait-kuleci",
    budgetBytes: 150 * KB,
    preloadTier: "background",
    description: "Kuleci character portrait",
  },
  "V-30-ayarci": {
    id: "V-30-ayarci",
    type: "procedural",
    proceduralId: "portrait-ayarci",
    budgetBytes: 150 * KB,
    preloadTier: "background",
    description: "Ayarci character portrait",
  },
  "V-30-kacak": {
    id: "V-30-kacak",
    type: "procedural",
    proceduralId: "portrait-kacak",
    budgetBytes: 150 * KB,
    preloadTier: "background",
    description: "Kacak character portrait",
  },
};

export const RIVAL_CLIP_ASSET_MAP: Readonly<Record<RivalClipId, StageAssetId>> = {
  idle: "V-10",
  idle_alt: "V-11",
  aimed_at: "V-12",
  hit_knockback: "V-13",
  recover: "V-14",
  relief: "V-15",
  take_gun: "V-16",
  hold_gun: "V-17",
  aim_self: "V-18",
  aim_you: "V-19",
  fire_recoil: "V-20",
  use_mouth: "V-21",
  use_hands: "V-22",
  shackled: "V-23",
  round_end: "V-24",
};

/**
 * Resolves a rival clip manifest entry; P0 falls back all CharacterKinds to the Kuleci set.
 */
export function resolveRivalClipAsset(
  clipId: RivalClipId,
  characterKind: CharacterKind = "Kuleci",
): StageAssetEntry {
  void characterKind;
  const assetId = RIVAL_CLIP_ASSET_MAP[clipId];
  return STAGE_ASSETS[assetId];
}

export function getStageAsset(id: StageAssetId): StageAssetEntry {
  return STAGE_ASSETS[id];
}

export function listStageAssets(): StageAssetEntry[] {
  return Object.values(STAGE_ASSETS);
}
