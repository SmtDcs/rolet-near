import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { Action, GameStateView, Shell, Target } from "../nearTypes";
import type { GameConfig } from "./config";
import { GameRuleError, cloneGameState, fire, playItem } from "./rules";
import { ScriptedSource } from "./shellSource";

type VectorMove =
  | { kind: "Fire"; actor: number; target: Target }
  | { kind: "UseItem"; actor: number; slot: number; steal_slot: number | null };

interface VectorStep {
  move: VectorMove;
  ok: boolean;
  actions: Action[];
  error: string | null;
  state_after: GameStateView;
}

interface VectorScenario {
  name: string;
  initial_state: GameStateView;
  shells: Shell[];
  rolls: number[];
  steps: VectorStep[];
}

interface VectorsFile {
  version: number;
  config: GameConfig;
  scenarios: VectorScenario[];
}

test("F3-3 parity: TS rules match Rust contract vectors in docs/near/schema/vectors.json", () => {
  const path = resolve(__dirname, "../../../../docs/near/schema/vectors.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as VectorsFile;
  assert.equal(data.version, 1);
  assert.ok(data.scenarios.length >= 5);

  for (const scenario of data.scenarios) {
    const state = cloneGameState(scenario.initial_state);
    const src = ScriptedSource.withRolls(scenario.shells, scenario.rolls);

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      if (step.ok) {
        const actions =
          step.move.kind === "Fire"
            ? fire(state, data.config, step.move.actor, step.move.target, src)
            : playItem(state, data.config, step.move.actor, step.move.slot, step.move.steal_slot, src);
        assert.deepEqual(actions, step.actions, `${scenario.name} step ${i} actions mismatch`);
        assert.deepEqual(state, step.state_after, `${scenario.name} step ${i} state mismatch`);
      } else {
        let caught: unknown;
        try {
          if (step.move.kind === "Fire") {
            fire(state, data.config, step.move.actor, step.move.target, src);
          } else {
            playItem(state, data.config, step.move.actor, step.move.slot, step.move.steal_slot, src);
          }
        } catch (err) {
          caught = err;
        }
        assert.ok(caught instanceof GameRuleError, `${scenario.name} step ${i} should throw GameRuleError`);
        assert.equal(caught.code, step.error, `${scenario.name} step ${i} error code mismatch`);
        assert.deepEqual(state, step.state_after, `${scenario.name} step ${i} error state mismatch`);
      }
    }
  }
});
