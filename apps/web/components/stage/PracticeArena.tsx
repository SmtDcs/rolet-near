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

function formatLatencyLabel(lat: number | readonly [number, number]): string {
  if (typeof lat === "number") return `${lat} ms`;
  return `${lat[0]}–${lat[1]} ms`;
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

  return (
    <main className="flex min-h-screen flex-col bg-[#050505] text-[#eaeaea]">
      {/* Practice top telemetry bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a2a] bg-[#0e0d0b] px-4 py-2 font-mono text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="border border-[#c6a15b]/40 px-2 py-1 text-[11px] text-[#c6a15b] hover:border-[#e5c378]"
          >
            ← ROLET
          </Link>
          <span className="font-bold tracking-[0.14em] text-[#eaeaea] uppercase">
            PRATİK ARENA (CÜZDANSIZ)
          </span>
          {model && (
            <span className="hidden sm:inline text-[#9a9a9a]">
              R{model.round} · SEN {model.hp[0]}/{model.maxHp} CAN · RAKİP {model.hp[1]}/{model.maxHp} CAN · İLAN: {model.announcedLive} DOLU / {model.announcedBlank} KURU
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
            <span>TOHUM:</span>
            <input
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              className="w-28 border border-[#3a3a3a] bg-[#090909] px-2 py-1 text-[11px] text-[#eaeaea]"
            />
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
            <span>GECİKME:</span>
            <select
              value={
                typeof latencySetting === "number" ? String(latencySetting) : "default"
              }
              onChange={(e) => {
                const v = e.target.value;
                setLatencySetting(v === "default" ? [300, 1500] : Number(v));
              }}
              className="border border-[#3a3a3a] bg-[#090909] px-2 py-1 text-[11px] text-[#eaeaea]"
            >
              <option value="0">0 ms (Anlık)</option>
              <option value="default">300–1500 ms (Gerçekçi)</option>
              <option value="3000">3000 ms (Yavaş)</option>
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-[#9a9a9a]">
            <span>RAKİP:</span>
            <select
              value={characterKind}
              onChange={(e) => setCharacterKind(e.target.value as CharacterKind)}
              className="border border-[#3a3a3a] bg-[#090909] px-2 py-1 text-[11px] text-[#eaeaea]"
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
            YENİ MAÇ
          </button>
        </div>
      </header>

      {/* Main 16:9 stage */}
      <div className="relative flex-1 flex items-center justify-center p-2 sm:p-4">
        <div className="h-[calc(100vh-8.5rem)] w-full max-w-6xl">
          <PlayableStage
            key={`${activeSeed}-${matchKey}-${String(latencySetting)}`}
            transport={engine}
            you={0}
            characterKind={characterKind}
            statusLabel={`PRATİK · ${formatLatencyLabel(latencySetting)}`}
            onModelChange={setModel}
          />
        </div>

        {/* Match End Overlay */}
        {model?.phase === "finished" && (
          <div className="pointer-events-auto absolute inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-md border border-[#c6a15b] bg-[#0f0d0a] p-6 text-center font-mono space-y-4">
              <div className="text-xs tracking-[0.2em] text-[#c6a15b] uppercase">
                PRATİK MAÇ SONUCU
              </div>
              <div
                className={`text-2xl font-bold uppercase ${
                  model.winner === 0 ? "text-[#52c41a]" : "text-[#e61919]"
                }`}
              >
                {model.winner === 0 ? "KAZANDIN" : "KAYBETTİN"}
              </div>
              <div className="text-xs text-[#9a9a9a]">
                SKOR: SEN {model.score[0]} — {model.score[1]} BOT · TOHUM: {activeSeed}
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleRestart()}
                  className="cursor-pointer border border-[#c6a15b] bg-[#1e180e] px-4 py-2 text-xs font-bold text-[#e5c378] hover:bg-[#2d2314]"
                >
                  AYNI TOHUMLA TEKRAR
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleRestart(`rolet-${Math.floor(Math.random() * 100_000)}`)
                  }
                  className="cursor-pointer border border-[#3a3a3a] bg-[#161616] px-4 py-2 text-xs text-[#eaeaea] hover:border-[#666]"
                >
                  RASTGELE TOHUM
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
