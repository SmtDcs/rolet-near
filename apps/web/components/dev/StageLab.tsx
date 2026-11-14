"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSound } from "@/hooks/useSound";
import { BEAT_CATALOG, createBeat, type BeatId } from "@/lib/game/beats";
import { fromSnapshot } from "@/lib/game/model";
import type { Action, MatchView } from "@/lib/nearTypes";
import type { CharacterKind, RivalClipId } from "@/lib/stage/assets";
import { RIVAL_CLIP_META, nextClipOnAim } from "@/lib/stage/clipSchedule";
import {
  GUN_POSES,
  type GunPose,
  type GunPoseId,
} from "@/lib/stage/gunPoses";
import { preloadStage } from "@/lib/stage/preload";
import { Stage } from "@/components/stage/Stage";
import { createDefaultStageVisual, type GunHolder } from "@/components/stage/types";
import { useDirector, visualFromModel } from "@/components/stage/useDirector";

const ALL_CLIPS = Object.keys(RIVAL_CLIP_META) as RivalClipId[];
const ALL_BEATS = Object.keys(BEAT_CATALOG) as BeatId[];
const POSE_IDS: GunPoseId[] = ["TABLE", "LIFTED", "AIM_OPP", "AIM_SELF", "RIVAL_HAND"];

function subscribeVisibility(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

function getVisibilitySnapshot(): boolean {
  return typeof document !== "undefined" ? document.hidden : false;
}

function makeScenarioSnapshot(): MatchView {
  return {
    id: "dev-scenario",
    status: "Active",
    players: ["you.local", "rival.local"],
    tokens: ["k-0", "k-1"],
    revealed: [true, true],
    game: {
      round: 1,
      score: [0, 0],
      hp: [4, 4],
      max_hp: 4,
      heal_cut: [false, false],
      items: [[], []],
      load: {
        announced_live: 0,
        announced_blank: 0,
        remaining: 0,
        live_left: 0,
        blank_left: 0,
        fixed: [],
      },
      turn: 0,
      shackled: null,
      shackle_broke_this_turn: false,
      saw_active: false,
      deck_counts: [4, 4, 4, 4, 4, 4, 4, 4, 4],
    },
    reveal_deadline_ms: 0,
    deadline_ms: 0,
    winner: null,
    seq: 0,
    log: [],
  };
}

const FULL_LOAD_SCENARIO: readonly Action[] = [
  { kind: "LoadStarted", live: 3, blank: 5, total: 8 },
  { kind: "ItemsDealt", player: 0, items: ["Loupe", "Flask", "Hacksaw", "Pipe"] },
  { kind: "ItemsDealt", player: 1, items: ["Shackle", "Ticker", "Magnet", "Tincture"] },
  { kind: "ItemUsed", player: 0, item: "Loupe", slot: 0, result: { kind: "Private", pos: 0, shell: "Blank" } },
  { kind: "ItemUsed", player: 0, item: "Flask", slot: 0, result: { kind: "Ejected", shell: "Blank" } },
  { kind: "Ejected", shell: "Blank" },
  { kind: "ItemUsed", player: 0, item: "Hacksaw", slot: 0, result: { kind: "None" } },
  { kind: "Shot", player: 0, target: "Opponent", shell: "Live", damage: 2 },
  { kind: "Ejected", shell: "Live" },
  { kind: "Shot", player: 1, target: "Opponent", shell: "Live", damage: 1 },
  { kind: "Ejected", shell: "Live" },
  { kind: "RoundEnded", winner: 0, score: [1, 0] },
];

export function StageLab() {
  const { playCue, muted, toggleMute } = useSound();
  const tabHidden = useSyncExternalStore(
    subscribeVisibility,
    getVisibilitySnapshot,
    () => false,
  );
  useEffect(() => {
    void preloadStage({ tier: "initial" });
  }, []);
  const [characterKind, setCharacterKind] = useState<CharacterKind>("Kuleci");
  const [aim, setAim] = useState(0);
  const [gunHolderOverride, setGunHolderOverride] = useState<GunHolder | null>(null);
  const [cylOverride, setCylOverride] = useState<number | null>(null);
  const [craneOverride, setCraneOverride] = useState<boolean | null>(null);
  const [hammerOverride, setHammerOverride] = useState<boolean | null>(null);
  const [sawOverride, setSawOverride] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [`[${new Date().toISOString().slice(11, 19)}] ${line}`, ...prev].slice(0, 24));
  }, []);

  const {
    visual,
    fx,
    rivalClip,
    activeBeatId,
    isBusy,
    enqueueBeats,
    enqueueActions,
    setRivalClip,
    handleRivalClipEnded,
    resetStage,
  } = useDirector({
    you: 0,
    playCue,
    onIdle: () => appendLog("Director -> anim_idle"),
  });

  // Revolver calibration state
  const [poses, setPoses] = useState<Record<GunPoseId, GunPose>>(() => ({
    TABLE: { ...GUN_POSES.TABLE, position: [...GUN_POSES.TABLE.position], rotation: [...GUN_POSES.TABLE.rotation] },
    LIFTED: { ...GUN_POSES.LIFTED, position: [...GUN_POSES.LIFTED.position], rotation: [...GUN_POSES.LIFTED.rotation] },
    AIM_OPP: { ...GUN_POSES.AIM_OPP, position: [...GUN_POSES.AIM_OPP.position], rotation: [...GUN_POSES.AIM_OPP.rotation] },
    AIM_SELF: { ...GUN_POSES.AIM_SELF, position: [...GUN_POSES.AIM_SELF.position], rotation: [...GUN_POSES.AIM_SELF.rotation] },
    RIVAL_HAND: { ...GUN_POSES.RIVAL_HAND, position: [...GUN_POSES.RIVAL_HAND.position], rotation: [...GUN_POSES.RIVAL_HAND.rotation] },
  }));
  const [calibratingPose, setCalibratingPose] = useState<GunPoseId | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const effectiveVisual = useMemo(
    () => ({
      ...visual,
      gunHolder: gunHolderOverride ?? visual.gunHolder,
      gunAim: aim !== 0 ? aim : visual.gunAim,
      cylinderIndex: cylOverride ?? visual.cylinderIndex,
      craneOpen: craneOverride ?? visual.craneOpen,
      hammerCocked: hammerOverride ?? visual.hammerCocked,
      sawActive: sawOverride ?? visual.sawActive,
    }),
    [aim, craneOverride, cylOverride, gunHolderOverride, hammerOverride, sawOverride, visual],
  );

  const effectiveClip = useMemo(
    () =>
      nextClipOnAim(
        rivalClip,
        effectiveVisual.gunAim,
        effectiveVisual.gunHolder === "rival",
        effectiveVisual.shackledSeat === 1,
      ),
    [effectiveVisual.gunAim, effectiveVisual.gunHolder, effectiveVisual.shackledSeat, rivalClip],
  );

  const clearOverrides = () => {
    setGunHolderOverride(null);
    setCylOverride(null);
    setCraneOverride(null);
    setHammerOverride(null);
    setSawOverride(null);
    setAim(0);
  };

  const handleClipClick = (clip: RivalClipId) => {
    setRivalClip(clip);
    appendLog(`Clip -> ${clip}`);
  };

  const handleBeatPreview = (beatId: BeatId) => {
    clearOverrides();
    enqueueBeats(
      createBeat(beatId, {
        isLocal: beatId.startsWith("aim_") || beatId === "gun_pickup" || beatId === "gun_putdown",
        actor: 0,
        player: 0,
        live: 3,
        blank: 5,
        total: 8,
        damage: 1,
        amount: 1,
        shell: "Live",
        pos: 0,
        items: ["Loupe", "Pipe"],
        winner: 0,
        score: [1, 0],
      }),
    );
    appendLog(`Beat queued -> ${beatId} (${BEAT_CATALOG[beatId].durationMs} ms)`);
  };

  const handleFullLoadScenario = () => {
    clearOverrides();
    setCalibratingPose(null);
    const snap = makeScenarioSnapshot();
    const initModel = fromSnapshot(snap, 0);
    resetStage(visualFromModel(initModel, 0));
    enqueueActions(FULL_LOAD_SCENARIO, initModel, false);
    appendLog(`Tam yükleme senaryosu başlatıldı (${FULL_LOAD_SCENARIO.length} aksiyon)`);
  };

  const updatePoseAxis = (
    poseId: GunPoseId,
    group: "position" | "rotation" | "scale",
    axis: 0 | 1 | 2,
    value: number,
  ) => {
    setPoses((prev) => {
      const target = prev[poseId];
      if (group === "scale") {
        return { ...prev, [poseId]: { ...target, scale: value } };
      }
      const tuple: [number, number, number] = [...target[group]] as [number, number, number];
      tuple[axis] = value;
      return { ...prev, [poseId]: { ...target, [group]: tuple } };
    });
  };

  const handleCopyPosesJson = async () => {
    const json = JSON.stringify(poses, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 1800);
      appendLog("Kalibrasyon poz JSON panoya kopyalandı.");
    } catch {
      appendLog(`Poz JSON:\n${json}`);
    }
  };

  const activePoseData = calibratingPose ? poses[calibratingPose] : null;

  return (
    <main className="min-h-screen bg-[#070707] text-[#eaeaea] p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border border-[#2a2a2a] bg-[#111] px-4 py-2.5 font-mono text-xs">
        <div>
          <span className="font-bold text-[#c6a15b]">ROLET /dev/stage</span>{" "}
          <span className="text-[#9a9a9a]">— F3-12 Director, Beat & Kalibrasyon Laboratuvarı</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleFullLoadScenario}
            className="cursor-pointer border border-[#52c41a] bg-[#10260d] px-3 py-1 font-bold text-[#c8f7b8] hover:bg-[#173612]"
          >
            TAM YÜKLEME SENARYOSU
          </button>
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
            <span className="text-[#9a9a9a]">TUTAN:</span>
            <select
              value={effectiveVisual.gunHolder}
              onChange={(e) => setGunHolderOverride(e.target.value as GunHolder)}
              className="border border-[#3a3a3a] bg-[#0a0a0a] px-2 py-1 text-xs text-[#eaeaea]"
            >
              <option value="table">table</option>
              <option value="local">local</option>
              <option value="rival">rival</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-[#9a9a9a]">AIM ({effectiveVisual.gunAim.toFixed(2)}):</span>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={effectiveVisual.gunAim}
              onChange={(e) => setAim(Number(e.target.value))}
              className="w-28 accent-[#c6a15b]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              clearOverrides();
              setCalibratingPose(null);
              resetStage(createDefaultStageVisual(0));
              appendLog("Sahne sıfırlandı.");
            }}
            className="cursor-pointer border border-[#c6a15b]/50 px-2.5 py-1 text-[11px] text-[#c6a15b] hover:bg-[#1e1a12]"
          >
            SIFIRLA
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl">
        <Stage
          visual={effectiveVisual}
          rivalClip={effectiveClip}
          characterKind={characterKind}
          fx={fx}
          paused={tabHidden}
          customGunPoses={poses}
          overrideGunPose={activePoseData}
          hud={{
            txPhase: "idle",
            canAct: !isBusy,
            aimState: {
              active: Math.abs(effectiveVisual.gunAim) > 0.05,
              aim: effectiveVisual.gunAim,
              zone:
                effectiveVisual.gunAim >= 0.25
                  ? "opp"
                  : effectiveVisual.gunAim <= -0.25
                    ? "self"
                    : "dead",
              canConfirm: Math.abs(effectiveVisual.gunAim) >= 0.6,
            },
            lockpickSlot: null,
            activeBeatId,
            muted,
            onToggleMute: toggleMute,
            statusLabel: isBusy ? "OYNATILIYOR" : "DEV STAGE",
          }}
          onRivalClipEnded={handleRivalClipEnded}
        />
      </div>

      {/* Revolver Node Controls & Pose Calibration */}
      <section className="mx-auto max-w-6xl border border-[#2a2a2a] bg-[#111] p-3 font-mono text-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold tracking-[0.14em] text-[#c6a15b] uppercase">
            Revolver Düğümleri & Poz Kalibrasyonu
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCylOverride((effectiveVisual.cylinderIndex + 1) % 8)}
              className="cursor-pointer border border-[#3a3a3a] bg-[#171717] px-2.5 py-1 text-[11px] hover:border-[#c6a15b]"
            >
              Hazne +45° ({effectiveVisual.cylinderIndex})
            </button>
            <button
              type="button"
              onClick={() => setCraneOverride(!effectiveVisual.craneOpen)}
              className={`cursor-pointer border px-2.5 py-1 text-[11px] ${
                effectiveVisual.craneOpen
                  ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                  : "border-[#3a3a3a] bg-[#171717]"
              }`}
            >
              Crane: {effectiveVisual.craneOpen ? "AÇIK" : "KAPALI"}
            </button>
            <button
              type="button"
              onClick={() => setHammerOverride(!effectiveVisual.hammerCocked)}
              className={`cursor-pointer border px-2.5 py-1 text-[11px] ${
                effectiveVisual.hammerCocked
                  ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                  : "border-[#3a3a3a] bg-[#171717]"
              }`}
            >
              Horoz: {effectiveVisual.hammerCocked ? "KURULU" : "İNİK"}
            </button>
            <button
              type="button"
              onClick={() => setSawOverride(!effectiveVisual.sawActive)}
              className={`cursor-pointer border px-2.5 py-1 text-[11px] ${
                effectiveVisual.sawActive
                  ? "border-[#e61919] bg-[#2d0c0c] text-[#fff]"
                  : "border-[#3a3a3a] bg-[#171717]"
              }`}
            >
              Namlu Ucu: {effectiveVisual.sawActive ? "KESİK" : "TAM"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyPosesJson()}
              className="cursor-pointer border border-[#c6a15b] bg-[#1e180e] px-2.5 py-1 text-[11px] text-[#e5c378] hover:bg-[#2c2214]"
            >
              {copiedNotice ? "KOPYALANDI!" : "POZ JSON KOPYALA"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCalibratingPose(null)}
            className={`cursor-pointer border px-2 py-1 text-[11px] ${
              calibratingPose === null
                ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                : "border-[#2e2e2e] bg-[#171717] text-[#9a9a9a]"
            }`}
          >
            Otomatik (gunHolder/aim)
          </button>
          {POSE_IDS.map((pid) => (
            <button
              key={pid}
              type="button"
              onClick={() => setCalibratingPose(pid)}
              className={`cursor-pointer border px-2 py-1 text-[11px] ${
                calibratingPose === pid
                  ? "border-[#e5c378] bg-[#2a2114] text-[#fff]"
                  : "border-[#2e2e2e] bg-[#171717] text-[#bdbdbd]"
              }`}
            >
              {pid}
            </button>
          ))}
        </div>

        {calibratingPose && activePoseData && (
          <div className="grid gap-3 border border-[#2a241b] bg-[#0c0b09] p-3 sm:grid-cols-3">
            {(["X", "Y", "Z"] as const).map((label, idx) => (
              <label key={`pos-${label}`} className="flex flex-col gap-1 text-[11px]">
                <span className="text-[#9a9a9a]">
                  pos.{label}: {activePoseData.position[idx].toFixed(2)}
                </span>
                <input
                  type="range"
                  min={-2}
                  max={2}
                  step={0.02}
                  value={activePoseData.position[idx]}
                  onChange={(e) =>
                    updatePoseAxis(
                      calibratingPose,
                      "position",
                      idx as 0 | 1 | 2,
                      Number(e.target.value),
                    )
                  }
                  className="accent-[#c6a15b]"
                />
              </label>
            ))}
            {(["rotX", "rotY", "rotZ"] as const).map((label, idx) => (
              <label key={label} className="flex flex-col gap-1 text-[11px]">
                <span className="text-[#9a9a9a]">
                  {label}: {activePoseData.rotation[idx].toFixed(2)}
                </span>
                <input
                  type="range"
                  min={-Math.PI * 1.5}
                  max={Math.PI * 1.5}
                  step={0.02}
                  value={activePoseData.rotation[idx]}
                  onChange={(e) =>
                    updatePoseAxis(
                      calibratingPose,
                      "rotation",
                      idx as 0 | 1 | 2,
                      Number(e.target.value),
                    )
                  }
                  className="accent-[#c6a15b]"
                />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="text-[#9a9a9a]">
                scale: {activePoseData.scale.toFixed(2)}
              </span>
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.02}
                value={activePoseData.scale}
                onChange={(e) =>
                  updatePoseAxis(calibratingPose, "scale", 0, Number(e.target.value))
                }
                className="accent-[#c6a15b]"
              />
            </label>
          </div>
        )}
      </section>

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
          <div>Henüz olay yok. Yukarıdan TAM YÜKLEME SENARYOSU, bir klip veya beat seçin.</div>
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
