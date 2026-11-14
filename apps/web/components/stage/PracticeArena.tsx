"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PlayableStage } from "@/components/stage/PlayableStage";
import type { GameModel } from "@/lib/game/model";
import { PracticeEngine } from "@/lib/game/practiceEngine";
import type { CharacterKind } from "@/lib/stage/assets";
import { preloadStage } from "@/lib/stage/preload";

function parseLatencyParam(raw: string | null): number | readonly [number, number] {
  if (!raw) return [300, 1500];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return [300, 1500];
  return Math.min(10_000, Math.round(n));
}

export function PracticeArena() {
  const searchParams = useSearchParams();
  const urlSeed = searchParams.get("seed");
  const urlLatency = searchParams.get("latency");

  const [seedInput, setSeedInput] = useState<string>(() => urlSeed ?? "rolet-practice-1");
  const [activeSeed, setActiveSeed] = useState<string>(() => urlSeed ?? "rolet-practice-1");
  const [latencySetting, setLatencySetting] = useState<number | readonly [number, number]>(() =>
    parseLatencyParam(urlLatency),
  );
  const [characterKind, setCharacterKind] = useState<CharacterKind>("Kuleci");
  const [matchKey, setMatchKey] = useState(0);
  const [model, setModel] = useState<GameModel | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const engine = useMemo(
    () =>
      new PracticeEngine({
        seed: `${activeSeed}#${matchKey}`,
        you: 0,
        firstTurn: 0,
        latencyMs: latencySetting,
      }),
    [activeSeed, latencySetting, matchKey],
  );

  useEffect(() => {
    void preloadStage({ tier: "initial" });
    return () => {
      engine.dispose();
    };
  }, [engine]);

  const handleRestart = (newSeed?: string) => {
    const nextSeed = (newSeed ?? seedInput).trim() || "rolet-practice-1";
    setSeedInput(nextSeed);
    setActiveSeed(nextSeed);
    setMatchKey((k) => k + 1);
  };

  const ctl =
    "border border-[#3a3a3a] bg-[#090909] px-2 py-1 text-[11px] text-[#eaeaea]";

  return (
    <main className="relative flex min-h-screen flex-col bg-[#050505] text-[#eaeaea]">
      {/* Unobtrusive corner controls */}
      <div className="absolute top-2 left-3 z-[80] flex items-start gap-3 font-mono text-xs">
        <Link
          href="/"
          className="text-[11px] tracking-[0.2em] text-[#c6a15b]/50 uppercase transition hover:text-[#e5c378]"
        >
          ← Rolet
        </Link>
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label="Settings"
          aria-expanded={panelOpen}
          title="Settings"
          className="cursor-pointer text-sm leading-none text-[#c6a15b]/40 transition hover:text-[#e5c378]"
        >
          ⚙
        </button>
        {panelOpen && (
          <div className="flex flex-wrap items-center gap-2 border border-[#2a2a2a] bg-[#0e0d0b]/95 px-3 py-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
              <span>Seed</span>
              <input
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                className={`w-28 ${ctl}`}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
              <span>Latency</span>
              <select
                value={typeof latencySetting === "number" ? String(latencySetting) : "default"}
                onChange={(e) => {
                  const v = e.target.value;
                  setLatencySetting(v === "default" ? [300, 1500] : Number(v));
                }}
                className={ctl}
              >
                <option value="0">0 ms (instant)</option>
                <option value="default">300–1500 ms (realistic)</option>
                <option value="3000">3000 ms (slow)</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
              <span>Rival</span>
              <select
                value={characterKind}
                onChange={(e) => setCharacterKind(e.target.value as CharacterKind)}
                className={ctl}
              >
                <option value="Kuleci">Kuleci</option>
                <option value="Ayarci">Ayarci</option>
                <option value="Kacak">Kacak</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => handleRestart()}
              className="cursor-pointer border border-[#c6a15b] bg-[#1d170d] px-2.5 py-1 text-[11px] font-bold text-[#e5c378] hover:bg-[#2a2113]"
            >
              New match
            </button>
          </div>
        )}
      </div>

      {/* Main 16:9 stage */}
      <div className="relative flex flex-1 items-center justify-center p-2 sm:p-4">
        <div className="h-[calc(100vh-2rem)] w-full max-w-6xl">
          <PlayableStage
            key={`${activeSeed}-${matchKey}-${String(latencySetting)}`}
            transport={engine}
            you={0}
            characterKind={characterKind}
            onModelChange={setModel}
          />
        </div>

        {model?.phase === "finished" && (
          <div className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-sm space-y-5 text-center font-mono">
              <div
                className={`text-4xl font-bold tracking-[0.3em] uppercase ${
                  model.winner === 0
                    ? "text-[#f2c46a] [text-shadow:0_0_24px_rgba(242,196,106,0.5)]"
                    : "text-[#e04545] [text-shadow:0_0_24px_rgba(224,69,69,0.5)]"
                }`}
              >
                {model.winner === 0 ? "YOU WIN" : "YOU LOSE"}
              </div>
              <div className="text-xs tracking-[0.2em] text-[#9a9a9a] uppercase">
                {model.score[0]} — {model.score[1]}
              </div>
              <button
                type="button"
                onClick={() => handleRestart(`rolet-${Math.floor(Math.random() * 100_000)}`)}
                className="cursor-pointer border border-[#c6a15b] bg-[#1e180e] px-6 py-2.5 text-xs font-bold tracking-[0.2em] text-[#e5c378] uppercase transition hover:bg-[#2d2314]"
              >
                New match
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
