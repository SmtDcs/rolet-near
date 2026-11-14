export interface GunPose {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
}

export type GunPoseId = "TABLE" | "LIFTED" | "AIM_OPP" | "AIM_SELF" | "RIVAL_HAND";

/**
 * Default calibrated poses for the 8-chamber revolver in camera-matched world space.
 * Tuned via /dev/stage calibration sliders.
 */
export const GUN_POSES: Readonly<Record<GunPoseId, GunPose>> = {
  TABLE: {
    position: [0.0, 0.44, 0.14],
    rotation: [0.0, 0.52, Math.PI / 2],
    scale: 0.95,
  },
  LIFTED: {
    position: [0.08, 0.96, 0.64],
    rotation: [-0.1, -0.06, 0.04],
    scale: 1.0,
  },
  AIM_OPP: {
    position: [0.03, 1.02, 0.48],
    rotation: [-0.04, 0.0, 0.0],
    scale: 1.0,
  },
  AIM_SELF: {
    position: [0.0, 1.14, 0.86],
    rotation: [0.18, Math.PI - 0.14, 0.05],
    scale: 1.14,
  },
  RIVAL_HAND: {
    position: [0.09, 0.86, -0.82],
    rotation: [0.12, Math.PI + 0.32, -0.08],
    scale: 0.58,
  },
};

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPose(a: GunPose, b: GunPose, t: number): GunPose {
  const k = clamp(t, 0, 1);
  if (k === 0) return a;
  if (k === 1) return b;
  return {
    position: [
      lerp(a.position[0], b.position[0], k),
      lerp(a.position[1], b.position[1], k),
      lerp(a.position[2], b.position[2], k),
    ],
    rotation: [
      lerp(a.rotation[0], b.rotation[0], k),
      lerp(a.rotation[1], b.rotation[1], k),
      lerp(a.rotation[2], b.rotation[2], k),
    ],
    scale: lerp(a.scale, b.scale, k),
  };
}

export function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  if (dt <= 0) return current;
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dampPose(current: GunPose, target: GunPose, lambda: number, dt: number): GunPose {
  const alpha = dt <= 0 ? 0 : 1 - Math.exp(-lambda * dt);
  return lerpPose(current, target, alpha);
}

/**
 * Computes interpolated local aim pose across [-1, 1]:
 * -1 => AIM_SELF, 0 => LIFTED, +1 => AIM_OPP.
 */
export function gunPoseAt(
  aim: number,
  poses: Partial<Record<GunPoseId, GunPose>> = GUN_POSES,
): GunPose {
  const a = clamp(aim, -1, 1);
  const lifted = poses.LIFTED ?? GUN_POSES.LIFTED;
  const opp = poses.AIM_OPP ?? GUN_POSES.AIM_OPP;
  const self = poses.AIM_SELF ?? GUN_POSES.AIM_SELF;

  if (a >= 0) {
    return lerpPose(lifted, opp, a);
  }
  return lerpPose(lifted, self, -a);
}

export interface HandSway {
  readonly posOffset: readonly [number, number, number];
  readonly rotOffset: readonly [number, number, number];
}

export const MAX_HAND_SWAY_POS = 0.015;
export const MAX_HAND_SWAY_ROT = 0.03;

/**
 * Procedural subtle hand-sway noise while revolver is lifted/aimed without visible hand models.
 */
export function handSwayOffset(timeSec: number, intensity = 1): HandSway {
  const k = clamp(intensity, 0, 1);
  const px = Math.sin(timeSec * 1.7) * 0.006 * k + Math.cos(timeSec * 3.1) * 0.002 * k;
  const py = Math.cos(timeSec * 2.3) * 0.007 * k + Math.sin(timeSec * 1.1) * 0.002 * k;
  const pz = Math.sin(timeSec * 1.3) * 0.003 * k;

  const rx = Math.sin(timeSec * 1.9) * 0.012 * k;
  const ry = Math.cos(timeSec * 1.5) * 0.014 * k;
  const rz = Math.sin(timeSec * 2.7) * 0.009 * k;

  return {
    posOffset: [
      clamp(px, -MAX_HAND_SWAY_POS, MAX_HAND_SWAY_POS),
      clamp(py, -MAX_HAND_SWAY_POS, MAX_HAND_SWAY_POS),
      clamp(pz, -MAX_HAND_SWAY_POS, MAX_HAND_SWAY_POS),
    ],
    rotOffset: [
      clamp(rx, -MAX_HAND_SWAY_ROT, MAX_HAND_SWAY_ROT),
      clamp(ry, -MAX_HAND_SWAY_ROT, MAX_HAND_SWAY_ROT),
      clamp(rz, -MAX_HAND_SWAY_ROT, MAX_HAND_SWAY_ROT),
    ],
  };
}

/**
 * 8-chamber revolver cylinder angle (45 deg = PI/4 per advance).
 */
export function cylinderAngleRad(chamberIndex: number): number {
  return chamberIndex * (Math.PI / 4);
}

export function craneAngleRad(open: boolean): number {
  return open ? -0.68 : 0;
}

export function hammerAngleRad(cocked: boolean): number {
  return cocked ? -0.58 : 0;
}

export function poseDistance(a: GunPose, b: GunPose): number {
  let maxDelta = Math.abs(a.scale - b.scale);
  for (let i = 0; i < 3; i += 1) {
    maxDelta = Math.max(
      maxDelta,
      Math.abs(a.position[i] - b.position[i]),
      Math.abs(a.rotation[i] - b.rotation[i]),
    );
  }
  return maxDelta;
}
