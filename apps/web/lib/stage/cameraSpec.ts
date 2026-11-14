export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;
export const STAGE_ASPECT = STAGE_WIDTH / STAGE_HEIGHT;

export interface CameraSpec {
  readonly fovDeg: number;
  readonly position: readonly [number, number, number];
  readonly lookAt: readonly [number, number, number];
  readonly near: number;
  readonly far: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
}

/**
 * Shared first-person camera calibration matching 2D rendered plates and the R3F 3D revolver layer.
 */
export const CAMERA_SPEC: CameraSpec = {
  fovDeg: 42,
  position: [0, 1.28, 1.15],
  lookAt: [0, 0.72, -1.2],
  near: 0.05,
  far: 30,
  targetWidth: STAGE_WIDTH,
  targetHeight: STAGE_HEIGHT,
};

export function computeCameraPitchRad(spec: CameraSpec = CAMERA_SPEC): number {
  const dy = spec.lookAt[1] - spec.position[1];
  const dz = spec.lookAt[2] - spec.position[2];
  const horiz = Math.hypot(spec.lookAt[0] - spec.position[0], dz);
  return Math.atan2(dy, horiz);
}

export interface LetterboxRect {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function computeStageLetterbox(
  viewportWidth: number,
  viewportHeight: number,
): LetterboxRect {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);
  const viewportAspect = safeW / safeH;

  if (viewportAspect > STAGE_ASPECT) {
    const height = safeH;
    const width = height * STAGE_ASPECT;
    return {
      width,
      height,
      offsetX: (safeW - width) / 2,
      offsetY: 0,
      scale: height / STAGE_HEIGHT,
    };
  }

  const width = safeW;
  const height = width / STAGE_ASPECT;
  return {
    width,
    height,
    offsetX: 0,
    offsetY: (safeH - height) / 2,
    scale: width / STAGE_WIDTH,
  };
}
