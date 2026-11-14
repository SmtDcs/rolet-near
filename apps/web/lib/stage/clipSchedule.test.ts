import assert from "node:assert/strict";
import test from "node:test";

import {
  BLINK_MAX_MS,
  BLINK_MIN_MS,
  clipForBeat,
  createStageRng,
  nextBlinkDelayMs,
  nextClipOnAim,
  resolveClipEnded,
  selectIdleVariant,
} from "./clipSchedule";

test("F3-10 clipSchedule: seeded blink interval stays in [2500, 6000] ms", () => {
  const rng = createStageRng(42);
  for (let i = 0; i < 200; i += 1) {
    const ms = nextBlinkDelayMs(rng);
    assert.ok(ms >= BLINK_MIN_MS && ms <= BLINK_MAX_MS, `blink ${ms}ms out of bounds`);
  }
  assert.equal(nextBlinkDelayMs(() => 0), BLINK_MIN_MS);
  assert.equal(nextBlinkDelayMs(() => 0.9999999), BLINK_MAX_MS);
});

test("F3-10 clipSchedule: idle variant selection & shackled override", () => {
  assert.equal(selectIdleVariant(() => 0.1), "idle_alt");
  assert.equal(selectIdleVariant(() => 0.5), "idle");
  assert.equal(selectIdleVariant(() => 0.1, true), "shackled");
});

test("F3-10 clipSchedule: aim > 0.6 transitions to aimed_at and drops back when lowered", () => {
  assert.equal(nextClipOnAim("idle", 0.61, false, false), "aimed_at");
  assert.equal(nextClipOnAim("idle", 0.59, false, false), "idle");
  assert.equal(nextClipOnAim("aimed_at", 0.3, false, false), "idle");
  assert.equal(nextClipOnAim("aimed_at", 0.3, false, true), "shackled");
  // Rival holding gun or playing knockback ignores local aim reaction.
  assert.equal(nextClipOnAim("hold_gun", 0.9, true, false), "hold_gun");
  assert.equal(nextClipOnAim("hit_knockback", 0.9, false, false), "hit_knockback");
});

test("F3-10 clipSchedule: beat triggers and clip-ended transitions return to idle/hold_gun", () => {
  assert.equal(clipForBeat("rival_take", { isLocal: false }), "take_gun");
  assert.equal(clipForBeat("rival_aim_opp", { isLocal: false }), "aim_you");
  assert.equal(clipForBeat("rival_aim_self", { isLocal: false }), "aim_self");
  assert.equal(clipForBeat("fire_live_opp", { isLocal: true }), "hit_knockback");
  assert.equal(clipForBeat("fire_live_opp", { isLocal: false }), "fire_recoil");
  assert.equal(clipForBeat("fire_blank", { isLocal: false, target: "SelfTarget" }), "relief");
  assert.equal(clipForBeat("item_pipe", { isLocal: false }), "use_mouth");
  assert.equal(clipForBeat("item_loupe", { isLocal: false }), "use_hands");
  assert.equal(clipForBeat("item_loupe", { isLocal: true }), null);

  assert.equal(resolveClipEnded("take_gun", true, false), "hold_gun");
  assert.equal(resolveClipEnded("hit_knockback", false, false), "recover");
  assert.equal(resolveClipEnded("recover", false, false), "idle");
  assert.equal(resolveClipEnded("use_mouth", false, true), "shackled");
  assert.equal(resolveClipEnded("aim_you", true, false), "hold_gun");
  assert.equal(resolveClipEnded("idle", false, false), "idle");
});
