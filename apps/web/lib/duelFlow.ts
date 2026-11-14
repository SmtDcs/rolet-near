import type { MatchStatus, MatchView } from "./nearTypes";

export type DuelStep =
  | "connect"
  | "key"
  | "character"
  | "queue"
  | "join"
  | "reveal"
  | "play"
  | "result"
  | "error";

export interface DuelError {
  message: string;
  recoverableStep: DuelStep;
}

export interface DuelFlowState {
  step: DuelStep;
  accountId: string | null;
  hasGameKey: boolean;
  selectedTokenId: string | null;
  pendingMatchId: string | null;
  matchId: string | null;
  opponent: string | null;
  players: [string, string] | null;
  you: 0 | 1 | null;
  matchStatus: MatchStatus | null;
  committed: boolean;
  revealed: [boolean, boolean];
  winner: number | null;
  cancelled: boolean;
  owedYocto: string;
  claimSuggested: boolean;
  error: DuelError | null;
}

export type DuelFlowEvent =
  | { type: "WALLET_CHANGED"; accountId: string | null; owedYocto?: string }
  | { type: "KEY_READY"; ready: boolean }
  | { type: "CHARACTER_SELECTED"; tokenId: string | null }
  | { type: "PLAYER_UPDATED"; owedYocto: string }
  | { type: "REWARD_CLAIMED" }
  | { type: "QUEUE_PAIRED"; matchId: string; opponent: string }
  | { type: "QUEUE_EXPIRED" }
  | { type: "JOIN_SUBMITTED"; matchId: string; opponent: string }
  | { type: "REVEAL_SUBMITTED" }
  | { type: "SYNC_MATCH"; match: MatchView | null }
  | { type: "RECONNECT_MATCH"; matchId: string; match?: MatchView | null }
  | { type: "MATCH_CANCELLED" }
  | { type: "ERROR"; message: string; recoverableStep?: DuelStep }
  | { type: "RETRY" }
  | { type: "RESET" };

export function hasOwedReward(owedYocto: string): boolean {
  try {
    return BigInt(owedYocto || "0") > BigInt(0);
  } catch {
    return false;
  }
}

export function createInitialDuelFlow(
  accountId: string | null = null,
  matchIdFromUrl: string | null = null,
): DuelFlowState {
  const cleanMatch = matchIdFromUrl?.trim() ? matchIdFromUrl.trim() : null;
  return {
    step: accountId ? "key" : "connect",
    accountId,
    hasGameKey: false,
    selectedTokenId: null,
    pendingMatchId: cleanMatch,
    matchId: cleanMatch,
    opponent: null,
    players: null,
    you: null,
    matchStatus: null,
    committed: false,
    revealed: [false, false],
    winner: null,
    cancelled: false,
    owedYocto: "0",
    claimSuggested: false,
    error: null,
  };
}

export function shouldAutoReveal(state: DuelFlowState): boolean {
  if (state.step !== "reveal") return false;
  if (!state.hasGameKey || !state.matchId || state.you === null) return false;
  if (state.matchStatus !== "Revealing") return false;
  return !state.revealed[state.you];
}

function readyBaseStep(state: DuelFlowState): DuelStep {
  if (!state.accountId) return "connect";
  if (!state.hasGameKey) return "key";
  if (!state.selectedTokenId) return "character";
  return "queue";
}

function applyMatchSnapshot(
  state: DuelFlowState,
  match: MatchView | null,
): DuelFlowState {
  if (!match) {
    return state;
  }

  const idx =
    state.accountId === match.players[0]
      ? 0
      : state.accountId === match.players[1]
        ? 1
        : null;
  const opponent =
    idx === 0 ? match.players[1] : idx === 1 ? match.players[0] : state.opponent;

  let nextStep: DuelStep = state.step;
  if (match.status === "Pending") {
    nextStep = state.hasGameKey ? "join" : state.accountId ? "key" : "connect";
  } else if (match.status === "Revealing") {
    nextStep = state.hasGameKey ? "reveal" : state.accountId ? "key" : "connect";
  } else if (match.status === "Active") {
    nextStep = "play";
  } else if (match.status === "Finished" || match.status === "Cancelled") {
    nextStep = "result";
  }

  return {
    ...state,
    step: nextStep,
    matchId: match.id,
    pendingMatchId: null,
    opponent,
    players: match.players,
    you: idx,
    matchStatus: match.status,
    committed:
      state.committed ||
      match.status === "Revealing" ||
      match.status === "Active" ||
      match.status === "Finished",
    revealed: [...match.revealed] as [boolean, boolean],
    winner: match.winner,
    cancelled: match.status === "Cancelled",
    error: null,
  };
}

export function reduceDuelFlow(
  state: DuelFlowState,
  event: DuelFlowEvent,
): DuelFlowState {
  switch (event.type) {
    case "WALLET_CHANGED": {
      const owedYocto = event.owedYocto ?? (event.accountId === state.accountId ? state.owedYocto : "0");
      if (!event.accountId) {
        return createInitialDuelFlow(null, state.pendingMatchId ?? state.matchId);
      }
      if (event.accountId !== state.accountId) {
        return {
          ...createInitialDuelFlow(event.accountId, state.pendingMatchId),
          owedYocto,
          claimSuggested: hasOwedReward(owedYocto),
        };
      }
      return {
        ...state,
        step: state.step === "connect" ? "key" : state.step,
        owedYocto,
        claimSuggested: hasOwedReward(owedYocto),
      };
    }

    case "PLAYER_UPDATED": {
      return {
        ...state,
        owedYocto: event.owedYocto,
        claimSuggested: hasOwedReward(event.owedYocto),
      };
    }

    case "REWARD_CLAIMED": {
      return {
        ...state,
        owedYocto: "0",
        claimSuggested: false,
      };
    }

    case "KEY_READY": {
      const updated = { ...state, hasGameKey: event.ready };
      if (!state.accountId) {
        return { ...updated, step: "connect" };
      }
      if (!event.ready) {
        if (
          state.step === "character" ||
          state.step === "queue" ||
          state.step === "join" ||
          state.step === "reveal"
        ) {
          return { ...updated, step: "key" };
        }
        return updated;
      }
      if (state.step === "key" || state.step === "connect") {
        if (state.pendingMatchId) {
          return {
            ...updated,
            step: state.selectedTokenId ? "join" : "character",
            matchId: state.pendingMatchId,
          };
        }
        return {
          ...updated,
          step: state.selectedTokenId ? "queue" : "character",
        };
      }
      return updated;
    }

    case "CHARACTER_SELECTED": {
      const updated = { ...state, selectedTokenId: event.tokenId };
      if (!state.accountId || !state.hasGameKey) {
        return updated;
      }
      if (!event.tokenId) {
        if (state.step === "queue") {
          return { ...updated, step: "character" };
        }
        return updated;
      }
      if (state.step === "character") {
        if (state.pendingMatchId) {
          return { ...updated, step: "join", matchId: state.pendingMatchId };
        }
        return { ...updated, step: "queue" };
      }
      return updated;
    }

    case "QUEUE_PAIRED": {
      if (!state.accountId || !state.hasGameKey || !state.selectedTokenId) {
        return state;
      }
      return {
        ...state,
        step: "join",
        matchId: event.matchId,
        pendingMatchId: null,
        opponent: event.opponent,
        players: null,
        you: null,
        matchStatus: "Pending",
        committed: false,
        revealed: [false, false],
        winner: null,
        cancelled: false,
        error: null,
      };
    }

    case "QUEUE_EXPIRED": {
      if (state.step !== "queue") return state;
      return {
        ...state,
        matchId: null,
        opponent: null,
      };
    }

    case "JOIN_SUBMITTED": {
      return {
        ...state,
        step: "reveal",
        matchId: event.matchId,
        pendingMatchId: null,
        opponent: event.opponent,
        committed: true,
        error: null,
      };
    }

    case "REVEAL_SUBMITTED": {
      if (state.you === null) {
        return state;
      }
      const nextRevealed: [boolean, boolean] = [...state.revealed] as [
        boolean,
        boolean,
      ];
      nextRevealed[state.you] = true;
      return {
        ...state,
        revealed: nextRevealed,
      };
    }

    case "SYNC_MATCH": {
      return applyMatchSnapshot(state, event.match);
    }

    case "RECONNECT_MATCH": {
      const next: DuelFlowState = {
        ...state,
        matchId: event.matchId,
        pendingMatchId: state.accountId ? null : event.matchId,
      };
      if (event.match) {
        return applyMatchSnapshot(next, event.match);
      }
      return next;
    }

    case "MATCH_CANCELLED": {
      return {
        ...state,
        step: "result",
        matchStatus: "Cancelled",
        winner: null,
        cancelled: true,
      };
    }

    case "ERROR": {
      const fallback =
        state.step === "error"
          ? state.error?.recoverableStep ?? readyBaseStep(state)
          : state.step;
      return {
        ...state,
        step: "error",
        error: {
          message: event.message,
          recoverableStep: event.recoverableStep ?? fallback,
        },
      };
    }

    case "RETRY": {
      if (state.step !== "error" || !state.error) return state;
      return {
        ...state,
        step: state.error.recoverableStep,
        error: null,
      };
    }

    case "RESET": {
      return {
        ...state,
        step: readyBaseStep(state),
        pendingMatchId: null,
        matchId: null,
        opponent: null,
        players: null,
        you: null,
        matchStatus: null,
        committed: false,
        revealed: [false, false],
        winner: null,
        cancelled: false,
        error: null,
      };
    }
  }
}
