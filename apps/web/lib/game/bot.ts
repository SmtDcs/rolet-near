import type { Target } from "../nearTypes";
import type { Intent } from "../stage/protocol";
import type { GameModel } from "./model";

/**
 * Pure heuristic bot decision operating strictly on a redacted GameModel
 * (so it only knows shells revealed by its own Loupe/Ticker actions).
 */
export function chooseBotIntent(
  model: GameModel,
  you: number,
  intentSeq = 0,
): Intent {
  const hand = model.items[you];
  const knownCurrent = model.knownShells.get(0);

  if (model.hp[you] < model.maxHp && !model.healCut[you]) {
    const pipeSlot = hand.indexOf("Pipe");
    if (pipeSlot >= 0) {
      return { id: `bot-${intentSeq}-pipe`, kind: "item", slot: pipeSlot };
    }
  }

  if (knownCurrent === "Live" && !model.saw) {
    const sawSlot = hand.indexOf("Hacksaw");
    if (sawSlot >= 0) {
      return { id: `bot-${intentSeq}-hacksaw`, kind: "item", slot: sawSlot };
    }
  }

  if (
    model.remaining >= 3 &&
    model.shackled === null &&
    !model.shackleBrokeThisTurn
  ) {
    const shackleSlot = hand.indexOf("Shackle");
    if (shackleSlot >= 0) {
      return { id: `bot-${intentSeq}-shackle`, kind: "item", slot: shackleSlot };
    }
  }

  if (knownCurrent === undefined && model.remaining > 0) {
    const loupeSlot = hand.indexOf("Loupe");
    if (loupeSlot >= 0) {
      return { id: `bot-${intentSeq}-loupe`, kind: "item", slot: loupeSlot };
    }
  }

  const pLive =
    knownCurrent === "Live"
      ? 1
      : knownCurrent === "Blank"
        ? 0
        : model.remaining > 0
          ? model.leftLive / model.remaining
          : 0.5;

  const target: Target = pLive > 0.5 ? "Opponent" : "SelfTarget";
  return {
    id: `bot-${intentSeq}-fire`,
    kind: "fire",
    target,
  };
}
