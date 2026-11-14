"use client";

import { useEffect, useRef, useState } from "react";
import {
  resolveRivalClipAsset,
  type CharacterKind,
  type RivalClipId,
  type StageAssetEntry,
} from "@/lib/stage/assets";
import { CLIP_CROSSFADE_MS, RIVAL_CLIP_META } from "@/lib/stage/clipSchedule";
import { RivalPlaceholder } from "./RivalPlaceholder";

export interface ClipPlayerProps {
  clipId: RivalClipId;
  characterKind?: CharacterKind;
  blinking?: boolean;
  paused?: boolean;
  onClipEnded?: (clipId: RivalClipId) => void;
}

type VideoSlot = "A" | "B";

/**
 * Dual-slot A/B clip player supporting 120 ms crossfade for real VP9-alpha videos
 * and seamless procedural SVG/CSS fallback while Meshy video assets are placeholders.
 */
export function ClipPlayer({
  clipId,
  characterKind = "Kuleci",
  blinking = false,
  paused = false,
  onClipEnded,
}: ClipPlayerProps) {
  const asset: StageAssetEntry = resolveRivalClipAsset(clipId, characterKind);
  const meta = RIVAL_CLIP_META[clipId];

  const [activeSlot, setActiveSlot] = useState<VideoSlot>("A");
  const [slotClips, setSlotClips] = useState<{ A: RivalClipId; B: RivalClipId }>({
    A: clipId,
    B: clipId,
  });

  const videoARef = useRef<HTMLVideoElement | null>(null);
  const videoBRef = useRef<HTMLVideoElement | null>(null);
  const lastClipRef = useRef<RivalClipId>(clipId);
  const onClipEndedRef = useRef(onClipEnded);

  useEffect(() => {
    onClipEndedRef.current = onClipEnded;
  }, [onClipEnded]);

  // Alternate A/B slots on clip change for 120ms crossfade.
  useEffect(() => {
    if (lastClipRef.current === clipId) return;
    lastClipRef.current = clipId;
    setActiveSlot((prev) => {
      const next: VideoSlot = prev === "A" ? "B" : "A";
      setSlotClips((curr) => ({ ...curr, [next]: clipId }));
      return next;
    });
  }, [clipId]);

  // Pause/resume video elements when tab visibility or paused prop changes.
  useEffect(() => {
    const activeEl = activeSlot === "A" ? videoARef.current : videoBRef.current;
    const inactiveEl = activeSlot === "A" ? videoBRef.current : videoARef.current;
    if (inactiveEl && !inactiveEl.paused) {
      inactiveEl.pause();
    }
    if (!activeEl || asset.type !== "video") return;
    if (paused) {
      activeEl.pause();
    } else {
      activeEl.currentTime = 0;
      activeEl.play().catch(() => {
        // Autoplay policy ignored silently
      });
    }
  }, [activeSlot, asset.type, clipId, paused]);

  // Procedural clip-ended timer for non-looping clips.
  useEffect(() => {
    if (asset.type !== "procedural" || meta.loop || paused) {
      return;
    }
    const timer = window.setTimeout(() => {
      onClipEndedRef.current?.(clipId);
    }, meta.defaultDurationMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [asset.type, clipId, meta.defaultDurationMs, meta.loop, paused]);

  if (asset.type !== "video") {
    return (
      <div className="relative h-full w-full">
        <RivalPlaceholder
          clipId={clipId}
          characterKind={characterKind}
          blinking={blinking}
          paused={paused}
        />
      </div>
    );
  }

  const assetA = resolveRivalClipAsset(slotClips.A, characterKind);
  const assetB = resolveRivalClipAsset(slotClips.B, characterKind);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {(["A", "B"] as const).map((slot) => {
        const slotAsset = slot === "A" ? assetA : assetB;
        const slotClip = slot === "A" ? slotClips.A : slotClips.B;
        const isCurrent = activeSlot === slot;
        const slotMeta = RIVAL_CLIP_META[slotClip];

        if (slotAsset.type !== "video") {
          return null;
        }
        return (
          <video
            key={slot}
            ref={slot === "A" ? videoARef : videoBRef}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              opacity: isCurrent ? 1 : 0,
              transition: `opacity ${CLIP_CROSSFADE_MS}ms linear`,
            }}
            muted
            playsInline
            loop={slotMeta.loop}
            preload="auto"
            poster={slotAsset.posterSrc}
            onEnded={() => {
              if (isCurrent && !slotMeta.loop) {
                onClipEndedRef.current?.(slotClip);
              }
            }}
          >
            <source src={slotAsset.src} type="video/webm" />
            {slotAsset.fallbackSrc && <source src={slotAsset.fallbackSrc} type="video/mp4" />}
          </video>
        );
      })}
    </div>
  );
}
