"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import { createStageRng, nextBlinkDelayMs } from "@/lib/stage/clipSchedule";
import { RIVAL_FRAME } from "@/lib/stage/layout";
import { ClipPlayer } from "../ClipPlayer";

export interface RivalLayerProps {
  clipId: RivalClipId;
  characterKind?: CharacterKind;
  paused?: boolean;
  seed?: number;
  onClipEnded?: (clipId: RivalClipId) => void;
}

/**
 * L1: Opponent clip layer positioned behind the table plate.
 */
export function RivalLayer({
  clipId,
  characterKind = "Kuleci",
  paused = false,
  seed = 101,
  onClipEnded,
}: RivalLayerProps) {
  const [blinking, setBlinking] = useState(false);
  const rngRef = useRef<() => number>(createStageRng(seed));

  useEffect(() => {
    rngRef.current = createStageRng(seed);
  }, [seed]);

  useEffect(() => {
    if (paused) return;
    let blinkTimeout: number | null = null;
    let unblinkTimeout: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = nextBlinkDelayMs(rngRef.current);
      blinkTimeout = window.setTimeout(() => {
        if (cancelled) return;
        setBlinking(true);
        unblinkTimeout = window.setTimeout(() => {
          if (cancelled) return;
          setBlinking(false);
          scheduleNext();
        }, 140);
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (blinkTimeout !== null) window.clearTimeout(blinkTimeout);
      if (unblinkTimeout !== null) window.clearTimeout(unblinkTimeout);
    };
  }, [paused]);

  return (
    <div
      data-testid="rival-layer"
      className="pointer-events-none absolute z-10 overflow-visible"
      style={{
        left: `${RIVAL_FRAME.x * 100}%`,
        top: `${RIVAL_FRAME.y * 100}%`,
        width: `${RIVAL_FRAME.width * 100}%`,
        height: `${RIVAL_FRAME.height * 100}%`,
      }}
    >
      <ClipPlayer
        clipId={clipId}
        characterKind={characterKind}
        blinking={blinking}
        paused={paused}
        onClipEnded={onClipEnded}
      />
    </div>
  );
}
