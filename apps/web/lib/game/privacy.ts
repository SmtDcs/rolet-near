import type { Action, MatchView, Shell } from "../nearTypes";

/**
 * Redacts opponent Private item results (Loupe/Ticker) before entering model,
 * director, or UI state (DESIGN §4.6 v1, CLIENT-CONTRACT (b)).
 */
export function redactAction(action: Action, you: number): Action {
  if (
    action.kind === "ItemUsed" &&
    action.result.kind === "Private" &&
    action.player !== you
  ) {
    return {
      ...action,
      result: { kind: "None" },
    };
  }
  return action;
}

/**
 * Redacts unfired shell positions in MatchView.game.load.fixed and opponent
 * Private actions in MatchView.log, restoring only positions known by `you`
 * from `ownPrivate`.
 */
export function redactSnapshot(
  view: MatchView,
  you: number,
  ownPrivate?: ReadonlyMap<number, Shell>,
): MatchView {
  const origFixed = view.game.load.fixed;
  const total = origFixed.length;
  const startRedact = Math.max(0, total - view.game.load.remaining);
  const fixed: (Shell | null)[] = new Array(total);
  for (let i = 0; i < total; i++) {
    if (i >= startRedact) {
      const localPos = i - startRedact;
      fixed[i] = ownPrivate?.get(localPos) ?? ownPrivate?.get(i) ?? null;
    } else {
      fixed[i] = origFixed[i];
    }
  }

  return {
    ...view,
    game: {
      ...view.game,
      load: {
        ...view.game.load,
        fixed,
      },
    },
    log: view.log.map((a) => redactAction(a, you)),
  };
}
