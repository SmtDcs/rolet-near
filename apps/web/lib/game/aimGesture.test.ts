import assert from "node:assert/strict";
import test from "node:test";

import { AimGesture } from "./aimGesture";

test("F3-8 aimGesture: normalized threshold table (dead / opp / self / confirm)", () => {
  // stageHeight = 1000, spanFraction = 0.4 => full +/-1.0 is +/-400px drag
  const gesture = new AimGesture({ stageHeight: 1000 });

  const cases: Array<{
    dyUp: number;
    expectedAim: number;
    expectedZone: "opp" | "self" | "dead";
    expectedConfirm: boolean;
    expectedRelease: "Opponent" | "SelfTarget" | "cancel";
  }> = [
    { dyUp: 0, expectedAim: 0, expectedZone: "dead", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: 96, expectedAim: 0.24, expectedZone: "dead", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: -96, expectedAim: -0.24, expectedZone: "dead", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: 100, expectedAim: 0.25, expectedZone: "opp", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: -100, expectedAim: -0.25, expectedZone: "self", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: 236, expectedAim: 0.59, expectedZone: "opp", expectedConfirm: false, expectedRelease: "cancel" },
    { dyUp: 240, expectedAim: 0.6, expectedZone: "opp", expectedConfirm: true, expectedRelease: "Opponent" },
    { dyUp: -240, expectedAim: -0.6, expectedZone: "self", expectedConfirm: true, expectedRelease: "SelfTarget" },
    { dyUp: 600, expectedAim: 1, expectedZone: "opp", expectedConfirm: true, expectedRelease: "Opponent" },
    { dyUp: -600, expectedAim: -1, expectedZone: "self", expectedConfirm: true, expectedRelease: "SelfTarget" },
  ];

  for (const c of cases) {
    gesture.pointerDown(500);
    const st = gesture.pointerMove(500 - c.dyUp);
    assert.equal(st.aim, c.expectedAim);
    assert.equal(st.zone, c.expectedZone);
    assert.equal(st.canConfirm, c.expectedConfirm);
    const rel = gesture.pointerUp();
    if (c.expectedRelease === "cancel") {
      assert.equal(rel.kind, "cancel");
    } else {
      assert.deepEqual(rel, { kind: "confirm", target: c.expectedRelease });
    }
    assert.equal(gesture.state.active, false);
    assert.equal(gesture.state.aim, 0);
  }
});

test("F3-8 aimGesture: fast flick on pointerUp confirms without damping lag", () => {
  const gesture = new AimGesture({ stageHeight: 800 });
  gesture.pointerDown(400);
  // Instant release at top (dyUp = +260 / 320 = 0.8125 >= 0.6)
  const rel = gesture.pointerUp(140);
  assert.deepEqual(rel, { kind: "confirm", target: "Opponent" });

  // Fast flick released inside dead zone cancels
  gesture.pointerDown(400);
  assert.equal(gesture.pointerUp(360).kind, "cancel");
});

test("F3-8 aimGesture: keyboard ArrowUp/ArrowDown adjust, Enter confirms, Escape cancels", () => {
  const gesture = new AimGesture();

  // Single ArrowUp reaches 0.3 (opp, below confirm 0.6) -> Enter keeps updating without confirm
  const k1 = gesture.handleKey("ArrowUp");
  assert.equal(k1?.kind, "update");
  assert.equal(gesture.state.zone, "opp");
  assert.equal(gesture.state.canConfirm, false);
  const enterEarly = gesture.handleKey("Enter");
  assert.equal(enterEarly?.kind, "update");

  // Second ArrowUp reaches 0.6 -> Enter confirms Opponent and resets
  gesture.handleKey("ArrowUp");
  assert.equal(gesture.state.canConfirm, true);
  assert.deepEqual(gesture.handleKey("Enter"), { kind: "confirm", target: "Opponent" });
  assert.equal(gesture.state.aim, 0);

  // Two ArrowDown reach -0.6 -> Escape cancels cleanly
  gesture.handleKey("ArrowDown");
  gesture.handleKey("ArrowDown");
  assert.equal(gesture.state.zone, "self");
  assert.equal(gesture.state.canConfirm, true);
  assert.deepEqual(gesture.handleKey("Escape"), { kind: "cancel" });
  assert.equal(gesture.state.aim, 0);
  assert.equal(gesture.state.active, false);

  // Two ArrowDown + Enter confirms SelfTarget
  gesture.handleKey("ArrowDown");
  gesture.handleKey("ArrowDown");
  assert.deepEqual(gesture.handleKey("Enter"), { kind: "confirm", target: "SelfTarget" });
});
