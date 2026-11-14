"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { useSound } from "@/hooks/useSound";
import { AimGesture, type AimState } from "@/lib/game/aimGesture";
import { IntentFlow, canAct, type IntentPhase } from "@/lib/game/intentFlow";
import { applyAction, fromSnapshot, type GameModel } from "@/lib/game/model";
import type { GameTransport } from "@/lib/game/transport";
import type { Action } from "@/lib/nearTypes";
import type { CharacterKind } from "@/lib/stage/assets";
import type { Intent, StageOutput } from "@/lib/stage/protocol";
import { Stage } from "./Stage";
import { useDirector } from "./useDirector";

export interface PlayableStageProps {
  transport: GameTransport;
  you?: 0 | 1;
  characterKind?: CharacterKind;
  statusLabel?: string;
  deadlineSecondsLeft?: number | null;
  onStageOutput?: (event: StageOutput) => void;
  onModelChange?: (model: GameModel) => void;
}

const INITIAL_AIM_STATE: AimState = {
  active: false,
  aim: 0,
  zone: "dead",
  canConfirm: false,
};

function firstActor(actions: readonly Action[]): number | null {
  for (const a of actions) {
    if (a.kind === "Shot" || a.kind === "ItemUsed") {
      return a.player;
    }
  }
  return null;
}

function subscribeVisibility(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function getVisibilitySnapshot(): boolean {
  return typeof document !== "undefined" ? document.hidden : false;
}

/**
 * Fully wired interactive Stage connecting GameTransport -> GameModel -> IntentFlow -> Director -> Layers.
 * Used identically by /practice (PracticeEngine) and /duel (NearTransport).
 */
export function PlayableStage({
  transport,
  you = 0,
  characterKind = "Kuleci",
  statusLabel,
  deadlineSecondsLeft = null,
  onStageOutput,
  onModelChange,
}: PlayableStageProps) {
  const { playCue, muted, toggleMute } = useSound();
  const [model, setModel] = useState<GameModel | null>(null);
  const [txPhase, setTxPhase] = useState<IntentPhase>("idle");
  const [aimState, setAimState] = useState<AimState>(INITIAL_AIM_STATE);
  const [lockpickSlot, setLockpickSlot] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const tabHidden = useSyncExternalStore(
    subscribeVisibility,
    getVisibilitySnapshot,
    () => false,
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const modelRef = useRef<GameModel | null>(null);
  const intentSeqRef = useRef(0);
  const aimGestureRef = useRef<AimGesture | null>(null);
  const intentFlowRef = useRef<IntentFlow | null>(null);
  const handledBatchesRef = useRef<WeakSet<readonly Action[]>>(new WeakSet());
  const onOutputRef = useRef(onStageOutput);
  const onModelChangeRef = useRef(onModelChange);

  useEffect(() => {
    onOutputRef.current = onStageOutput;
  }, [onStageOutput]);

  useEffect(() => {
    onModelChangeRef.current = onModelChange;
  }, [onModelChange]);

  const {
    visual,
    fx,
    rivalClip,
    activeBeatId,
    isBusy: directorBusy,
    enqueueBeats,
    enqueueActions,
    syncImmediately,
    setLiveAim,
    cancelLocalAim,
    handleRivalClipEnded,
    resetStage,
  } = useDirector({
    you,
    playCue,
    onIdle: () => {
      onOutputRef.current?.({ type: "anim_idle" });
    },
    onModelSyncedFromSnapshot: (synced) => {
      modelRef.current = synced;
      setModel(synced);
      onModelChangeRef.current?.(synced);
    },
  });

  // Tab visibility is tracked via useSyncExternalStore(subscribeVisibility) above.

  // Initialize AimGesture, IntentFlow, initial snapshot, and transport subscription.
  useEffect(() => {
    let active = true;
    const gesture = new AimGesture();
    aimGestureRef.current = gesture;

    const flow = new IntentFlow({
      clock: {
        now: () => Date.now(),
        setTimeout: (fn, ms) => window.setTimeout(fn, ms),
        clearTimeout: (id) => window.clearTimeout(id as number),
      },
      submit: (intent) => transport.submitIntent(intent),
      emitBeat: (beat) => enqueueBeats(beat),
      onStateChange: (state) => {
        if (!active) return;
        setTxPhase(state.phase);
        if (state.phase === "failed" && state.lastError) {
          setLocalError(state.lastError);
        } else if (state.phase === "preparing") {
          setLocalError(null);
        }
      },
      onResolved: (intent, actions) => {
        if (!active) return;
        handledBatchesRef.current.add(actions);
        const curr = modelRef.current;
        if (!curr) return;
        let nextModel = curr;
        for (const action of actions) {
          nextModel = applyAction(nextModel, action, you);
        }
        modelRef.current = nextModel;
        setModel(nextModel);
        onModelChangeRef.current?.(nextModel);
        enqueueActions(actions, curr, intent.kind === "fire");
      },
      onFailed: (_intent, reason) => {
        if (!active) return;
        setLocalError(reason);
      },
    });
    intentFlowRef.current = flow;

    const unsubActions = transport.onActions((actions) => {
      if (!active || actions.length === 0) return;
      if (handledBatchesRef.current.has(actions)) return;
      // If IntentFlow is currently holding our own in-flight intent, wait for onResolved (>=700ms hold).
      if (flow.isBusy && firstActor(actions) === you) {
        return;
      }
      handledBatchesRef.current.add(actions);
      const curr = modelRef.current;
      if (!curr) return;
      let nextModel = curr;
      for (const action of actions) {
        nextModel = applyAction(nextModel, action, you);
      }
      modelRef.current = nextModel;
      setModel(nextModel);
      onModelChangeRef.current?.(nextModel);
      enqueueActions(actions, curr, false);
    });

    void Promise.resolve(transport.snapshot()).then((snap) => {
      if (!active) return;
      const initialModel = fromSnapshot(snap, you);
      modelRef.current = initialModel;
      setModel(initialModel);
      onModelChangeRef.current?.(initialModel);
      resetStage();
      syncImmediately(initialModel, you);
      onOutputRef.current?.({ type: "ready" });
    });

    return () => {
      active = false;
      unsubActions();
      flow.dispose();
      intentFlowRef.current = null;
      aimGestureRef.current = null;
    };
  }, [enqueueActions, enqueueBeats, resetStage, syncImmediately, transport, you]);

  const userCanAct = useMemo(() => {
    if (!model) return false;
    return canAct(model, you, directorBusy, txPhase);
  }, [directorBusy, model, txPhase, you]);

  const submitUserIntent = useCallback((intent: Intent) => {
    setLockpickSlot(null);
    onOutputRef.current?.({ type: "intent", intent });
    intentFlowRef.current?.startIntent(intent);
  }, []);

  const nextIntentId = () => `intent-${++intentSeqRef.current}`;

  const handleGunPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!userCanAct || lockpickSlot !== null) return;
      const gesture = aimGestureRef.current;
      if (!gesture) return;
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect && rect.height > 0) {
        gesture.setStageHeight(rect.height);
      }
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const st = gesture.pointerDown(e.clientY);
      setAimState(st);
      setLiveAim(0);
      playCue("gun_pickup");
    },
    [lockpickSlot, playCue, setLiveAim, userCanAct],
  );

  const handleStagePointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const gesture = aimGestureRef.current;
      if (!gesture || !gesture.state.active) return;
      const st = gesture.pointerMove(e.clientY);
      setAimState(st);
      setLiveAim(st.aim);
    },
    [setLiveAim],
  );

  const handleStagePointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const gesture = aimGestureRef.current;
      if (!gesture || !gesture.state.active) return;
      const res = gesture.pointerUp(e.clientY);
      setAimState(gesture.state);
      if (res.kind === "confirm") {
        submitUserIntent({
          id: nextIntentId(),
          kind: "fire",
          target: res.target,
        });
      } else {
        cancelLocalAim();
      }
    },
    [cancelLocalAim, submitUserIntent],
  );

  const handleStagePointerCancel = useCallback(() => {
    const gesture = aimGestureRef.current;
    if (!gesture || !gesture.state.active) return;
    gesture.pointerCancel();
    setAimState(gesture.state);
    cancelLocalAim();
  }, [cancelLocalAim]);

  // Keyboard aiming support (ArrowUp / ArrowDown / Enter / Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!userCanAct || lockpickSlot !== null) return;
      const gesture = aimGestureRef.current;
      if (!gesture) return;
      if (
        e.key !== "ArrowUp" &&
        e.key !== "ArrowDown" &&
        e.key !== "Enter" &&
        e.key !== "Escape"
      ) {
        return;
      }
      const action = gesture.handleKey(e.key);
      if (!action) return;
      e.preventDefault();
      if (action.kind === "update") {
        setAimState(action.state);
        setLiveAim(action.state.aim);
      } else if (action.kind === "confirm") {
        setAimState(gesture.state);
        submitUserIntent({
          id: nextIntentId(),
          kind: "fire",
          target: action.target,
        });
      } else {
        setAimState(gesture.state);
        cancelLocalAim();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelLocalAim, lockpickSlot, setLiveAim, submitUserIntent, userCanAct]);

  const handleUseItem = useCallback(
    (slot: number) => {
      if (!userCanAct || !model) return;
      const item = model.items[you][slot];
      if (!item) return;

      if (item === "Lockpick") {
        const oppItems = model.items[1 - you];
        const hasStealable = oppItems.some((it) => it !== "Lockpick");
        if (!hasStealable) {
          setLocalError("Rakipte çalınacak eşya yok");
          return;
        }
        setLocalError(null);
        setLockpickSlot(slot);
        playCue("ui_select");
        return;
      }

      submitUserIntent({
        id: nextIntentId(),
        kind: "item",
        slot,
      });
    },
    [model, playCue, submitUserIntent, userCanAct, you],
  );

  const handleSelectStealSlot = useCallback(
    (stealSlot: number) => {
      if (!userCanAct || lockpickSlot === null) return;
      const slot = lockpickSlot;
      submitUserIntent({
        id: nextIntentId(),
        kind: "item",
        slot,
        stealSlot,
      });
    },
    [lockpickSlot, submitUserIntent, userCanAct],
  );

  const mergedFx = useMemo(
    () => ({
      ...fx,
      errorText: fx.errorText ?? localError,
    }),
    [fx, localError],
  );

  return (
    <Stage
      stageRef={stageRef}
      visual={visual}
      rivalClip={rivalClip}
      characterKind={characterKind}
      fx={mergedFx}
      paused={tabHidden}
      deadlineSecondsLeft={deadlineSecondsLeft}
      hud={{
        txPhase,
        canAct: userCanAct,
        aimState,
        lockpickSlot,
        activeBeatId,
        muted,
        onToggleMute: toggleMute,
        onCancelLockpick: () => setLockpickSlot(null),
        statusLabel,
      }}
      onRivalClipEnded={handleRivalClipEnded}
      onUseItem={handleUseItem}
      onSelectStealSlot={handleSelectStealSlot}
      onGunPointerDown={handleGunPointerDown}
      onStagePointerMove={handleStagePointerMove}
      onStagePointerUp={handleStagePointerUp}
      onStagePointerCancel={handleStagePointerCancel}
    />
  );
}
