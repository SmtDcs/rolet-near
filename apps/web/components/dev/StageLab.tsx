"use client";

import { useCallback, useMemo, useState } from "react";
import { BEAT_CATALOG, type BeatId } from "@/lib/game/beats";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import {
  RIVAL_CLIP_META,
  clipForBeat,
  nextClipOnAim,
  resolveClipEnded,
} from "@/lib/stage/clipSchedule";
import { Stage } from "@/components/stage/Stage";
import {
  INITIAL_FX_STATE,
  createDefaultStageVisual,
  type StageFxState,
} from "@/components/stage/types";

const ALL_CLIPS = Object.keys(RIVAL_CLIP_META) as RivalClipId[];
const ALL_BEATS = Object.keys(BEAT_CATALOG) as BeatId[];

export function StageLab() {
  const [visual, setVisual] = useState(() => createDefaultStageVisual(0));
  const [rivalClip, setRivalClip] = useState<RivalClipId>("idle");
  const [characterKind, setCharacterKind] = useState<CharacterKind>("Kuleci");
  const [aim, setAim] = useState(0);
  const [muted, setMuted] = useState(true);
  const [activeBeatId, setActiveBeatId] = useState<BeatId | null>(null);
  const [fx, setFx] = useState<StageFxState>(INITIAL_FX_STATE);
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [`[${new Date().toISOString().slice(11, 19)}] ${line}`, ...prev].slice(0, 24));
  }, []);

  const effectiveClip = useMemo(
    () =>
      nextClipOnAim(
        rivalClip,
        aim,
        visual.gunHolder === "rival",
        visual.shackledSeat === 1,
      ),
    [aim, rivalClip, visual.gunHolder, visual.shackledSeat],
  );

  const handleClipClick = (clip: RivalClipId) => {
    setRivalClip(clip);
    appendLog(`Clip -> ${clip}`);
  };

  const handleBeatPreview = (beatId: BeatId) => {
    setActiveBeatId(beatId);
    const clip = clipForBeat(beatId, { isLocal: beatId.startsWith("aim_") });
    if (clip) {
      setRivalClip(clip);
    }
    setFx({
      ...INITIAL_FX_STATE,
      muzzleFlash: beatId.startsWith("fire_live"),
      blackoutStage: beatId === "fire_live_self" ? "black" : "none",
      shake: beatId === "fire_live_self" ? "heavy" : beatId === "fire_live_opp" ? "light" : "none",
      bannerText: `BEAT PREVIEW: ${beatId}`,
      bannerTone: beatId.startsWith("fire_live") ? "alert" : "brass",
    });
    appendLog(`Beat preview -> ${beatId} (${BEAT_CATALOG[beatId].durationMs} ms)`);
  };

  return (
    <main className="min-h-screen bg-[#070707] text-[#eaeaea] p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-[#2a2a2a] bg-[#111] px-4 py-2.5 font-mono text-xs">
        <div>
          <span className="font-bold text-[#c6a15b]">ROLET /dev/stage</span>{" "}
          <span className="text-[#9a9a9a]">— F3-10 Sahne İskeleti & Klip/Beat Laboratuvarı</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-[#9a9a9a]">KARAKTER:</span>
            <select
              value={characterKind}
              onChange={(e) => setCharacterKind(e.target.value as CharacterKind)}
              className="border border-[#3a3a3a] bg-[#0a0a0a] px-2 py-1 text-xs text-[#eaeaea]"
            >
              <option value="Kuleci">Kuleci</option>
              <option value="Ayarci">Ayarci</option>
              <option value="Kacak">Kacak</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[#9a9a9a]">AIM ({aim.toFixed(2)}):</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={aim}
              onChange={(e) => setAim(Number(e.target.value))}
              className="w-28 accent-[#c6a15b]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setFx(INITIAL_FX_STATE);
              setActiveBeatId(null);
              setRivalClip("idle");
              setAim(0);
              setVisual(createDefaultStageVisual(0));
            }}
            className="cursor-pointer border border-[#c6a15b]/50 px-2.5 py-1 text-[11px] text-[#c6a15b] hover:bg-[#1e1a12]"
          >
            SIFIRLA
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl">
        <Stage
          visual={visual}
          rivalClip={effectiveClip}
          characterKind={characterKind}
          fx={fx}
          hud={{
            txPhase: "idle",
            canAct: true,
            aimState: {
              active: Math.abs(aim) > 0.05,
              aim,
              zone: aim >= 0.25 ? "opp" : aim <= -0.25 ? "self" : "dead",
              canConfirm: Math.abs(aim) >= 0.6,
            },
            lockpickSlot: null,
            activeBeatId,
            muted,
            onToggleMute: () => setMuted((m) => !m),
            statusLabel: "DEV STAGE",
          }}
          onRivalClipEnded={(ended) => {
            setRivalClip((curr) =>
              curr === ended
                ? resolveClipEnded(ended, visual.gunHolder === "rival", visual.shackledSeat === 1)
                : curr,
            );
          }}
        />
      </div>

      <section className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
        <div className="border border-[#2a2a2a] bg-[#111] p-3">
          <h2 className="mb-2 font-mono text-xs font-bold tracking-[0.14em] text-[#c6a15b] uppercase">
            Rakip Klipleri ({ALL_CLIPS.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CLIPS.map((clip) => (
              <button
                key={clip}
                type="button"
                onClick={() => handleClipClick(clip)}
                className={`cursor-pointer border px-2 py-1 font-mono text-[11px] ${
                  effectiveClip === clip
                    ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                    : "border-[#2e2e2e] bg-[#171717] text-[#bdbdbd] hover:border-[#666]"
                }`}
              >
                {clip}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-[#2a2a2a] bg-[#111] p-3">
          <h2 className="mb-2 font-mono text-xs font-bold tracking-[0.14em] text-[#c6a15b] uppercase">
            Beat Kataloğu ({ALL_BEATS.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {ALL_BEATS.map((beatId) => (
              <button
                key={beatId}
                type="button"
                onClick={() => handleBeatPreview(beatId)}
                className={`cursor-pointer border px-2 py-1 font-mono text-[11px] ${
                  activeBeatId === beatId
                    ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                    : "border-[#2e2e2e] bg-[#171717] text-[#bdbdbd] hover:border-[#666]"
                }`}
              >
                {beatId}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl border border-[#2a2a2a] bg-[#0c0c0c] p-3 font-mono text-[11px] text-[#9a9a9a]">
        <div className="mb-1 text-[#c6a15b] uppercase">Olay Günlüğü</div>
        {logs.length === 0 ? (
          <div>Henüz olay yok. Yukarıdan bir klip veya beat seçin.</div>
        ) : (
          <ul className="space-y-0.5">
            {logs.map((entry, i) => (
              <li key={`${i}-${entry}`}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
