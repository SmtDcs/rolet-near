import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  GUN_POSES,
  MAX_HAND_SWAY_POS,
  MAX_HAND_SWAY_ROT,
  craneAngleRad,
  cylinderAngleRad,
  gunPoseAt,
  hammerAngleRad,
  handSwayOffset,
  poseDistance,
} from "./gunPoses";

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

test("F3-11 gunPoses: endpoints match exact calibrated poses and clamp beyond [-1, 1]", () => {
  assert.deepEqual(gunPoseAt(0), GUN_POSES.LIFTED);
  assert.deepEqual(gunPoseAt(1), GUN_POSES.AIM_OPP);
  assert.deepEqual(gunPoseAt(-1), GUN_POSES.AIM_SELF);
  assert.deepEqual(gunPoseAt(5), GUN_POSES.AIM_OPP);
  assert.deepEqual(gunPoseAt(-5), GUN_POSES.AIM_SELF);
});

test("F3-11 gunPoses: intermediate values are continuous and monotonic", () => {
  let prev = gunPoseAt(-1);
  for (let i = -9; i <= 10; i += 1) {
    const aim = i / 10;
    const curr = gunPoseAt(aim);
    const stepDist = poseDistance(prev, curr);
    assert.ok(stepDist > 0, `expected smooth movement at aim=${aim}`);
    assert.ok(stepDist < 1.2, `unexpected jump ${stepDist} at aim=${aim}`);
    prev = curr;
  }
});

test("F3-11 gunPoses: sway and mechanism angles stay within mechanical bounds", () => {
  for (let t = 0; t < 20; t += 0.25) {
    const sway = handSwayOffset(t, 1);
    for (const p of sway.posOffset) {
      assert.ok(Math.abs(p) <= MAX_HAND_SWAY_POS + 1e-9);
    }
    for (const r of sway.rotOffset) {
      assert.ok(Math.abs(r) <= MAX_HAND_SWAY_ROT + 1e-9);
    }
  }

  assert.ok(Math.abs(cylinderAngleRad(1) - Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(cylinderAngleRad(8) - Math.PI * 2) < 1e-9);
  assert.ok(craneAngleRad(true) < 0 && craneAngleRad(false) === 0);
  assert.ok(hammerAngleRad(true) < 0 && hammerAngleRad(false) === 0);
});

test("F3-11 CSP & offline compliance: stage sources never reference Environment preset or remote decoders", () => {
  const dirs = [
    resolve(process.cwd(), "lib/stage"),
    resolve(process.cwd(), "components/stage"),
    resolve(process.cwd(), "app/dev/stage"),
  ];
  const forbiddenEnv = /Environment[^>]*preset/i;
  const forbiddenDraco = new RegExp(["dra", "co"].join(""), "i");

  for (const dir of dirs) {
    for (const file of collectSourceFiles(dir)) {
      const src = readFileSync(file, "utf8");
      assert.equal(forbiddenEnv.test(src), false, `Forbidden Environment preset in ${file}`);
      assert.equal(forbiddenDraco.test(src), false, `Forbidden decoder reference in ${file}`);
    }
  }
});
