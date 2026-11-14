"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  GUN_POSES,
  craneAngleRad,
  cylinderAngleRad,
  dampPose,
  dampScalar,
  gunPoseAt,
  hammerAngleRad,
  handSwayOffset,
  poseDistance,
  type GunPose,
  type GunPoseId,
} from "@/lib/stage/gunPoses";
import type { GunHolder } from "./types";

export interface RevolverModelProps {
  gunHolder: GunHolder;
  gunAim: number;
  cylinderIndex: number;
  craneOpen: boolean;
  hammerCocked: boolean;
  sawActive: boolean;
  paused?: boolean;
  customPoses?: Partial<Record<GunPoseId, GunPose>>;
  overridePose?: GunPose | null;
}

const CHAMBER_ANGLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

function resolveTargetPose(
  gunHolder: GunHolder,
  gunAim: number,
  customPoses?: Partial<Record<GunPoseId, GunPose>>,
  overridePose?: GunPose | null,
): GunPose {
  if (overridePose) {
    return overridePose;
  }
  const poses = { ...GUN_POSES, ...customPoses };
  if (gunHolder === "table") return poses.TABLE;
  if (gunHolder === "rival") return poses.RIVAL_HAND;
  return gunPoseAt(gunAim, poses);
}

/**
 * Shared frame driver for both the procedural placeholder and the Meshy GLB revolver.
 */
function useRevolverDriver(
  rootRef: React.RefObject<THREE.Group | null>,
  nodes: {
    cylinder: () => THREE.Object3D | null | undefined;
    crane: () => THREE.Object3D | null | undefined;
    hammer: () => THREE.Object3D | null | undefined;
    barrelTip: () => THREE.Object3D | null | undefined;
  },
  props: RevolverModelProps,
) {
  const {
    gunHolder,
    gunAim,
    cylinderIndex,
    craneOpen,
    hammerCocked,
    sawActive,
    paused = false,
    customPoses,
    overridePose,
  } = props;

  const invalidate = useThree((s) => s.invalidate);

  const targetPose = useMemo(
    () => resolveTargetPose(gunHolder, gunAim, customPoses, overridePose),
    [gunHolder, gunAim, customPoses, overridePose],
  );

  const currentPoseRef = useRef<GunPose>(targetPose);
  const cylAngleRef = useRef<number>(cylinderAngleRad(cylinderIndex));
  const craneAngleRef = useRef<number>(craneAngleRad(craneOpen));
  const hammerAngleRef = useRef<number>(hammerAngleRad(hammerCocked));
  const barrelDropRef = useRef<number>(sawActive ? 1 : 0);
  const swayTimeRef = useRef<number>(0);

  // Wake demand renderer whenever inputs change.
  useEffect(() => {
    if (!paused) {
      invalidate();
    }
  }, [
    paused,
    targetPose,
    cylinderIndex,
    craneOpen,
    hammerCocked,
    sawActive,
    invalidate,
  ]);

  useFrame((_, delta) => {
    if (paused || !rootRef.current) {
      return;
    }

    const dt = Math.min(delta, 0.1);
    const nextPose = dampPose(currentPoseRef.current, targetPose, 12, dt);
    currentPoseRef.current = nextPose;

    const targetCyl = cylinderAngleRad(cylinderIndex);
    const targetCrane = craneAngleRad(craneOpen);
    const targetHammer = hammerAngleRad(hammerCocked);
    const targetBarrel = sawActive ? 1 : 0;

    cylAngleRef.current = dampScalar(cylAngleRef.current, targetCyl, 14, dt);
    craneAngleRef.current = dampScalar(craneAngleRef.current, targetCrane, 14, dt);
    hammerAngleRef.current = dampScalar(hammerAngleRef.current, targetHammer, 18, dt);
    barrelDropRef.current = dampScalar(barrelDropRef.current, targetBarrel, 14, dt);

    let px = nextPose.position[0];
    let py = nextPose.position[1];
    let pz = nextPose.position[2];
    let rx = nextPose.rotation[0];
    let ry = nextPose.rotation[1];
    let rz = nextPose.rotation[2];

    if (gunHolder === "local") {
      swayTimeRef.current += dt;
      const sway = handSwayOffset(swayTimeRef.current, 1);
      px += sway.posOffset[0];
      py += sway.posOffset[1];
      pz += sway.posOffset[2];
      rx += sway.rotOffset[0];
      ry += sway.rotOffset[1];
      rz += sway.rotOffset[2];
    }

    rootRef.current.position.set(px, py, pz);
    rootRef.current.rotation.set(rx, ry, rz);
    rootRef.current.scale.setScalar(nextPose.scale);

    const cylObj = nodes.cylinder();
    if (cylObj) {
      cylObj.rotation.z = cylAngleRef.current;
    }

    const craneObj = nodes.crane();
    if (craneObj) {
      craneObj.rotation.z = craneAngleRef.current;
    }

    const hammerObj = nodes.hammer();
    if (hammerObj) {
      hammerObj.rotation.x = hammerAngleRef.current;
    }

    const tipObj = nodes.barrelTip();
    if (tipObj) {
      const drop = barrelDropRef.current;
      tipObj.position.y = -drop * 0.14;
      tipObj.rotation.x = drop * 0.45;
      tipObj.visible = drop < 0.92;
    }

    const settling =
      poseDistance(nextPose, targetPose) > 0.001 ||
      Math.abs(cylAngleRef.current - targetCyl) > 0.002 ||
      Math.abs(craneAngleRef.current - targetCrane) > 0.002 ||
      Math.abs(hammerAngleRef.current - targetHammer) > 0.002 ||
      Math.abs(barrelDropRef.current - targetBarrel) > 0.002;

    if (settling || gunHolder === "local") {
      invalidate();
    }
  });
}

/**
 * Procedural 3D 8-chamber revolver placeholder exposing the exact §3.1 node hierarchy:
 * rolet_revolver_frame, _cylinder, _crane, _hammer, _trigger, _barrel_tip, _muzzle.
 */
export function RevolverPlaceholder(props: RevolverModelProps) {
  const rootRef = useRef<THREE.Group | null>(null);
  const cylinderRef = useRef<THREE.Group | null>(null);
  const craneRef = useRef<THREE.Group | null>(null);
  const hammerRef = useRef<THREE.Group | null>(null);
  const barrelTipRef = useRef<THREE.Group | null>(null);

  useRevolverDriver(
    rootRef,
    {
      cylinder: () => cylinderRef.current,
      crane: () => craneRef.current,
      hammer: () => hammerRef.current,
      barrelTip: () => barrelTipRef.current,
    },
    props,
  );

  // Revolver points along -Z (toward opponent) in local space; grip extends toward -Y / +Z.
  return (
    <group ref={rootRef} name="rolet_revolver_root">
      <group name="rolet_revolver_frame">
        {/* Grip */}
        <mesh position={[0, -0.075, 0.11]} rotation={[0.32, 0, 0]} castShadow>
          <boxGeometry args={[0.036, 0.14, 0.056]} />
          <meshStandardMaterial color="#3c2618" roughness={0.72} metalness={0.12} />
        </mesh>
        {/* Brass butt cap */}
        <mesh position={[0, -0.142, 0.132]} rotation={[0.32, 0, 0]}>
          <boxGeometry args={[0.04, 0.016, 0.062]} />
          <meshStandardMaterial color="#c6a15b" roughness={0.35} metalness={0.85} />
        </mesh>

        {/* Main steel frame & top strap */}
        <mesh position={[0, 0.01, 0.03]} castShadow>
          <boxGeometry args={[0.04, 0.088, 0.15]} />
          <meshStandardMaterial color="#38342f" roughness={0.42} metalness={0.82} />
        </mesh>
        {/* Brass engraving side plate */}
        <mesh position={[0, 0.002, 0.045]}>
          <boxGeometry args={[0.044, 0.042, 0.072]} />
          <meshStandardMaterial color="#b48f49" roughness={0.36} metalness={0.88} />
        </mesh>

        {/* Trigger guard */}
        <mesh position={[0, -0.042, 0.025]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.026, 0.005, 8, 16]} />
          <meshStandardMaterial color="#b48f49" roughness={0.35} metalness={0.85} />
        </mesh>

        {/* Trigger */}
        <group name="rolet_revolver_trigger" position={[0, -0.032, 0.032]}>
          <mesh rotation={[0.35, 0, 0]}>
            <boxGeometry args={[0.008, 0.026, 0.01]} />
            <meshStandardMaterial color="#d2b06b" roughness={0.3} metalness={0.9} />
          </mesh>
        </group>

        {/* Hammer pivoted at hammer pin */}
        <group ref={hammerRef} name="rolet_revolver_hammer" position={[0, 0.046, 0.095]}>
          <mesh position={[0, 0.016, 0.012]} rotation={[-0.45, 0, 0]}>
            <boxGeometry args={[0.014, 0.036, 0.018]} />
            <meshStandardMaterial color="#c6a15b" roughness={0.35} metalness={0.88} />
          </mesh>
        </group>

        {/* Crane hinge + 8-chamber cylinder */}
        <group ref={craneRef} name="rolet_revolver_crane" position={[-0.026, -0.012, 0.018]}>
          <group ref={cylinderRef} name="rolet_revolver_cylinder" position={[0.026, 0.032, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.042, 0.042, 0.078, 24]} />
              <meshStandardMaterial color="#4e4840" roughness={0.38} metalness={0.86} />
            </mesh>
            {/* 8 fluted chamber caps at 45-degree intervals */}
            {CHAMBER_ANGLES.map((angle, idx) => (
              <mesh
                key={idx}
                position={[Math.cos(angle) * 0.025, Math.sin(angle) * 0.025, 0.04]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.0075, 0.0075, 0.004, 12]} />
                <meshStandardMaterial
                  color={idx === 0 ? "#c6a15b" : "#1d1a16"}
                  roughness={0.35}
                  metalness={0.8}
                />
              </mesh>
            ))}
          </group>
        </group>

        {/* Rear barrel base (stays attached when hacksawed) */}
        <mesh position={[0, 0.034, -0.10]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.02, 0.11, 16]} />
          <meshStandardMaterial color="#464139" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.049, -0.10]}>
          <boxGeometry args={[0.014, 0.012, 0.11]} />
          <meshStandardMaterial color="#b48f49" roughness={0.36} metalness={0.85} />
        </mesh>

        {/* Sawable front barrel tip */}
        <group ref={barrelTipRef} name="rolet_revolver_barrel_tip">
          <mesh position={[0, 0.034, -0.21]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.016, 0.018, 0.11, 16]} />
            <meshStandardMaterial color="#524c43" roughness={0.38} metalness={0.86} />
          </mesh>
          {/* Front sight blade */}
          <mesh position={[0, 0.056, -0.25]}>
            <boxGeometry args={[0.008, 0.018, 0.018]} />
            <meshStandardMaterial color="#e5c378" roughness={0.3} metalness={0.9} />
          </mesh>
          {/* Empty muzzle node for flash/smoke */}
          <group name="rolet_revolver_muzzle" position={[0, 0.034, -0.268]} />
        </group>
      </group>
    </group>
  );
}

/**
 * Meshy GLB loader path (used when manifest G-01 is switched to { type: "glb", src }).
 * Uses meshopt decoder without remote CDN fetches.
 */
export function RevolverGlbModel({
  src,
  ...props
}: RevolverModelProps & { src: string }) {
  const gltf = useGLTF(src, false, true);
  const rootRef = useRef<THREE.Group | null>(null);

  const clonedScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useRevolverDriver(
    rootRef,
    {
      cylinder: () => clonedScene.getObjectByName("rolet_revolver_cylinder"),
      crane: () => clonedScene.getObjectByName("rolet_revolver_crane"),
      hammer: () => clonedScene.getObjectByName("rolet_revolver_hammer"),
      barrelTip: () => clonedScene.getObjectByName("rolet_revolver_barrel_tip"),
    },
    props,
  );

  return (
    <group ref={rootRef}>
      <primitive object={clonedScene} />
    </group>
  );
}
