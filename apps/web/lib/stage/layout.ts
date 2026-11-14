export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const RIVAL_FRAME: NormalizedRect = {
  x: 0.33,
  y: 0.08,
  width: 0.34,
  height: 0.56,
};

/**
 * Normalized anchor where the 3D revolver flies when picked up by the rival.
 */
export const RIVAL_HAND_ANCHOR: NormalizedPoint = {
  x: 0.54,
  y: 0.45,
};

export const TABLE_PLATE_RECT: NormalizedRect = {
  x: 0,
  y: 0.54,
  width: 1,
  height: 0.46,
};

export const REVOLVER_TABLE_ANCHOR: NormalizedPoint = {
  x: 0.5,
  y: 0.72,
};

export const SHELL_RACK_ANCHOR: NormalizedPoint = {
  x: 0.5,
  y: 0.615,
};

export const SCORE_NOTCH_ANCHOR: NormalizedPoint = {
  x: 0.5,
  y: 0.562,
};

export const RIVAL_HP_ANCHOR: NormalizedPoint = {
  x: 0.145,
  y: 0.59,
};

export const LOCAL_HP_ANCHOR: NormalizedPoint = {
  x: 0.855,
  y: 0.80,
};

export const RIVAL_ITEM_SLOTS: readonly NormalizedPoint[] = [
  { x: 0.24, y: 0.60 },
  { x: 0.33, y: 0.60 },
  { x: 0.67, y: 0.60 },
  { x: 0.76, y: 0.60 },
];

export const LOCAL_ITEM_SLOTS: readonly NormalizedPoint[] = [
  { x: 0.19, y: 0.80 },
  { x: 0.30, y: 0.80 },
  { x: 0.70, y: 0.80 },
  { x: 0.81, y: 0.80 },
];
