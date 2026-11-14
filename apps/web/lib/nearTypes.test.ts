import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { isAction, type ActionsPage, type MatchView } from "./nearTypes";

test("all actions in docs/near/schema/actions-page.json pass isAction", () => {
  const path = resolve(__dirname, "../../../docs/near/schema/actions-page.json");
  const page = JSON.parse(readFileSync(path, "utf8")) as ActionsPage;
  assert.ok(page.actions.length > 0);
  for (const action of page.actions) {
    assert.equal(isAction(action), true, `failed action: ${JSON.stringify(action)}`);
  }
});

test("all actions in docs/near/schema/match-view.json pass isAction", () => {
  const path = resolve(__dirname, "../../../docs/near/schema/match-view.json");
  const view = JSON.parse(readFileSync(path, "utf8")) as MatchView;
  assert.ok(view.log.length > 0);
  for (const action of view.log) {
    assert.equal(isAction(action), true, `failed action: ${JSON.stringify(action)}`);
  }
});

test("isAction rejects malformed or unknown payloads", () => {
  assert.equal(isAction(null), false);
  assert.equal(isAction({}), false);
  assert.equal(isAction({ kind: "Unknown" }), false);
  assert.equal(isAction({ kind: "Shot", player: 2, target: "Opponent", shell: "Live", damage: 1 }), false);
  assert.equal(isAction({ kind: "MatchEnded", winner: 0, reward: 100 }), false);
  assert.equal(
    isAction({ kind: "ItemUsed", player: 0, item: "Loupe", slot: 0, result: { kind: "Private", pos: 0, shell: "Gold" } }),
    false,
  );
});
