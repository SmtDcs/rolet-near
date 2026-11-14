"use client";

import { Suspense, useEffect } from "react";
import { ContactShadows } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getStageAsset } from "@/lib/stage/assets";
import { CAMERA_SPEC } from "@/lib/stage/cameraSpec";
import {
  RevolverGlbModel,
  RevolverPlaceholder,
  type RevolverModelProps,
} from "./RevolverPlaceholder";

function CameraRig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(
      CAMERA_SPEC.position[0],
      CAMERA_SPEC.position[1],
      CAMERA_SPEC.position[2],
    );
    camera.lookAt(
      new THREE.Vector3(
        CAMERA_SPEC.lookAt[0],
        CAMERA_SPEC.lookAt[1],
        CAMERA_SPEC.lookAt[2],
      ),
    );
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

export function RevolverCanvas(props: RevolverModelProps) {
  const revolverAsset = getStageAsset("G-01");

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={props.paused ? "never" : "demand"}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{
        fov: CAMERA_SPEC.fovDeg,
        near: CAMERA_SPEC.near,
        far: CAMERA_SPEC.far,
        position: [
          CAMERA_SPEC.position[0],
          CAMERA_SPEC.position[1],
          CAMERA_SPEC.position[2],
        ],
      }}
      className="h-full w-full"
    >
      <CameraRig />

      {/* Local workshop lighting (offline, zero external HDR/CDN fetches) */}
      <ambientLight intensity={0.7} color="#d6c6ad" />
      <directionalLight position={[0.4, 2.4, 0.8]} intensity={2.2} color="#ffd99a" />
      <pointLight position={[-1.2, 1.5, 0.6]} intensity={1.1} color="#8ba6c4" />
      <pointLight position={[0.9, 0.9, 1.1]} intensity={0.9} color="#e5c378" />

      <Suspense fallback={null}>
        {revolverAsset.type === "glb" ? (
          <RevolverGlbModel src={revolverAsset.src} {...props} />
        ) : (
          <RevolverPlaceholder {...props} />
        )}
      </Suspense>

      {/* Contact shadow on table surface */}
      {props.gunHolder === "table" && (
        <ContactShadows
          position={[0, 0.39, 0.14]}
          opacity={0.62}
          scale={1.4}
          blur={1.8}
          far={0.6}
          frames={1}
          resolution={256}
          color="#050403"
        />
      )}
    </Canvas>
  );
}
