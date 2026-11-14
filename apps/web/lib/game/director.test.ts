import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import type { Action, MatchView } from "../nearTypes";
import { BEAT_CATALOG, planBeats, type Beat } from "./beats";
import { Director } from "./director";
import { fromSnapshot } from "./model";

function makeSnapshot(remaining = 4, turn = 0): MatchView {
  return {
    id: "d-1",
    status: "Active",
    players: ["p0", "p1"],
    tokens: ["t0", "t1"],
    revealed: [true, true],
    game: {
      round: 1,
      score: [0, 0],
      hp: [4, 4],
      max_hp: 4,
      heal_cut: [false, false],
      items: [["Loupe", "Flask"], ["Pipe"]],
      load: {
        announced_live: 2,
        announced_blank: 2,
        live_left: 2,
        blank_left: 2,
        remaining,
        fixed: ["Live", "Blank", "Live", "Blank"],
      },
      turn,
      saw_active: false,
      shackled: null,
      shackle_broke_this_turn: false,
      deck_counts: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 0,
    winner: null,
    seq: 1,
    log: [],
  };
}

class FakeClock {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  schedule(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + ms, fn });
    return id;
  }

  async advance(ms: number): Promise<void> {
    const target = this.nowMs + ms;
    while (true) {
      let earliestId: number | null = null;
      let earliestAt = Infinity;
      for (const [id, task] of this.tasks.entries()) {
        if (task.at <= target && task.at < earliestAt) {
          earliestAt = task.at;
          earliestId = id;
        }
      }
      if (earliestId === null) {
        break;
      }
      const task = this.tasks.get(earliestId)!;
      this.tasks.delete(earliestId);
      this.nowMs = task.at;
      task.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    this.nowMs = target;
  }
}

test("F3-6 beats: local Shot with prep vs rival Shot beat sequences", () => {
  const model = fromSnapshot(makeSnapshot(4, 0), 0);

  const localOppShot: Action = {
    kind: "Shot",
    player: 0,
    target: "Opponent",
    shell: "Live",
    damage: 1,
  };
  assert.deepEqual(
    planBeats(localOppShot, { you: 0, localPrepPlayed: true, model }).map((b) => b.id),
    ["tension_release", "fire_live_opp", "cylinder_advance", "gun_putdown"],
  );

  const localBlankSelf: Action = {
    kind: "Shot",
    player: 0,
    target: "SelfTarget",
    shell: "Blank",
    damage: 0,
  };
  assert.deepEqual(
    planBeats(localBlankSelf, { you: 0, localPrepPlayed: true, model }).map((b) => b.id),
    ["tension_release", "fire_blank", "cylinder_advance"],
  );

  const rivalOppShot: Action = {
    kind: "Shot",
    player: 1,
    target: "Opponent",
    shell: "Live",
    damage: 1,
  };
  assert.deepEqual(
    planBeats(rivalOppShot, { you: 0, localPrepPlayed: false, model }).map((b) => b.id),
    ["rival_take", "rival_aim_opp", "fire_live_self", "cylinder_advance", "gun_putdown"],
  );
});

test("F3-6 beats: durations within +-20% of DESIGN 3.7 table", () => {
  const expected: Record<string, number> = {
    round_intro: 2500,
    shells_reveal: 2500,
    shells_load: 2000,
    items_deal: 350,
    gun_pickup: 500,
    aim_opp: 400,
    aim_self: 500,
    tension_hold: 700,
    fire_live_opp: 1600,
    fire_live_self: 3000,
    fire_blank: 800,
    cylinder_advance: 800,
    gun_putdown: 500,
    opponent_knockback_return: 1200,
    item_loupe: 1400,
    item_pipe: 1600,
    item_flask: 1800,
    item_shackle: 1400,
    item_hacksaw: 1600,
    barrel_restore: 400,
    item_ticker: 1600,
    item_magnet: 1200,
    item_lockpick: 1000,
    item_tincture: 1600,
    heal_cut: 1200,
    round_end: 2500,
    match_end: 4000,
  };
  for (const [id, targetMs] of Object.entries(expected)) {
    const actual = BEAT_CATALOG[id as keyof typeof BEAT_CATALOG].durationMs;
    assert.ok(
      actual >= targetMs * 0.8 && actual <= targetMs * 1.2,
      `${id} duration ${actual}ms outside +-20% of ${targetMs}ms`,
    );
  }
});

test("F3-6 privacy: rival Loupe/Ticker beat params contain no shell and Flask describes crane open", () => {
  const model = fromSnapshot(makeSnapshot(4, 1), 0);
  const rivalLoupe: Action = {
    kind: "ItemUsed",
    player: 1,
    item: "Loupe",
    slot: 0,
    result: { kind: "Private", pos: 0, shell: "Live" },
  };
  const rivalBeats = planBeats(rivalLoupe, { you: 0, localPrepPlayed: false, model });
  assert.equal(rivalBeats.length, 1);
  assert.equal(rivalBeats[0].id, "item_loupe");
  assert.equal(rivalBeats[0].params?.shell, undefined);

  const ownLoupe: Action = {
    kind: "ItemUsed",
    player: 0,
    item: "Loupe",
    slot: 0,
    result: { kind: "Private", pos: 0, shell: "Live" },
  };
  const ownBeats = planBeats(ownLoupe, { you: 0, localPrepPlayed: false, model });
  assert.equal(ownBeats[0].params?.shell, "Live");

  const flask: Action = {
    kind: "ItemUsed",
    player: 0,
    item: "Flask",
    slot: 1,
    result: { kind: "Ejected", shell: "Blank" },
  };
  const flaskBeats = planBeats(flask, { you: 0, localPrepPlayed: false, model });
  assert.equal(flaskBeats[0].id, "item_flask");
  assert.equal(flaskBeats[0].params?.mechanic, "crane_open_eject");
  assert.equal(flaskBeats[0].params?.shell, "Blank");
});

test("F3-6 Director: sequential playback, deferred snapshot, single anim_idle on drain", async () => {
  const clock = new FakeClock();
  const events: string[] = [];
  let idleCount = 0;

  const director = new Director({
    execute: (beat: Beat) => {
      events.push(`start:${beat.id}@${clock.nowMs}`);
      return new Promise<void>((resolve) => {
        clock.schedule(() => {
          events.push(`end:${beat.id}@${clock.nowMs}`);
          resolve();
        }, beat.durationMs);
      });
    },
    onDeferredSnapshot: (snap) => {
      events.push(`snapshot:${snap.seq}@${clock.nowMs}`);
    },
    onIdle: () => {
      idleCount += 1;
      events.push(`idle#${idleCount}@${clock.nowMs}`);
    },
  });

  const model = fromSnapshot(makeSnapshot(4, 0), 0);
  const beats = planBeats(
    { kind: "Shot", player: 0, target: "Opponent", shell: "Live", damage: 1 },
    { you: 0, localPrepPlayed: true, model },
  );

  director.enqueue(beats);
  assert.equal(director.isBusy, true);
  assert.equal(idleCount, 0);

  const deferredSnap = makeSnapshot(3, 1);
  deferredSnap.seq = 99;
  const appliedImmediately = director.applyOrDeferSnapshot(deferredSnap);
  assert.equal(appliedImmediately, false);

  await clock.advance(150);
  assert.equal(events.some((e) => e.startsWith("snapshot:")), false);
  assert.equal(idleCount, 0);

  await clock.advance(1600);
  await clock.advance(800);
  await clock.advance(500);

  assert.equal(director.isBusy, false);
  assert.equal(idleCount, 1);
  assert.deepEqual(events, [
    "start:tension_release@0",
    "end:tension_release@150",
    "start:fire_live_opp@150",
    "end:fire_live_opp@1750",
    "start:cylinder_advance@1750",
    "end:cylinder_advance@2550",
    "start:gun_putdown@2550",
    "end:gun_putdown@3050",
    "snapshot:99@3050",
    "idle#1@3050",
  ]);
});

test("F3-6 audit: beats.ts and director.ts contain no console.*", () => {
  const dir = resolve(process.cwd(), "lib/game");
  for (const name of ["beats.ts", "director.ts"]) {
    const src = readFileSync(resolve(dir, name), "utf8");
    assert.equal(src.includes("console."), false, `${name} must not call console.*`);
  }
});
