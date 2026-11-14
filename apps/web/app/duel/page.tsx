"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Nav } from "@/components/Nav";
import { useNearWallet } from "@/components/NearProvider";
import { PlayableStage } from "@/components/stage/PlayableStage";
import { useRoletNear, type OwnedCharacter } from "@/hooks/useRoletNear";
import {
  createInitialDuelFlow,
  reduceDuelFlow,
  shouldAutoReveal,
} from "@/lib/duelFlow";
import {
  canClaimRevealTimeout,
  claimable,
  remainingSeconds,
} from "@/lib/game/clock";
import type { GameModel } from "@/lib/game/model";
import { NearTransport } from "@/lib/game/nearTransport";
import { queueMessage, type QueueView } from "@/lib/matchQueue";
import { checkKeyOnChain } from "@/lib/nearKeyFlow";
import { bytesToBase64 } from "@/lib/nearCommit";
import { loadKey } from "@/lib/nearKey";
import type { MatchView } from "@/lib/nearTypes";
import { QUEUE_RECIPIENT } from "@/lib/queueSignature";
import type { CharacterKind } from "@/lib/stage/assets";
import { preloadStage } from "@/lib/stage/preload";

function formatYoctoNear(yocto: string): string {
  try {
    const val = BigInt(yocto || "0");
    const whole = val / BigInt("1000000000000000000000000");
    const frac = (val % BigInt("1000000000000000000000000"))
      .toString()
      .padStart(24, "0")
      .slice(0, 2);
    return `${whole}.${frac} NEAR`;
  } catch {
    return "0.00 NEAR";
  }
}

function DuelClient() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("match");

  const { selector, accountId, connected, connect } = useNearWallet();
  const {
    config: roletConfig,
    views: roletViews,
    getMatch,
    getPlayer,
    getOwnedCharacters,
    ensureGameKey,
    sendGameCall,
    buyCharacter,
    claimReward,
    joinMatch,
    revealMatch,
    cancelMatch,
    claimTimeout,
  } = useRoletNear();

  const [flow, dispatch] = useReducer(
    reduceDuelFlow,
    undefined,
    () => createInitialDuelFlow(null, urlMatchId),
  );

  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [timeoutBusy, setTimeoutBusy] = useState(false);
  const [queueToken, setQueueToken] = useState<string | null>(null);
  const [queueWaiting, setQueueWaiting] = useState(false);
  const [matchSnapshot, setMatchSnapshot] = useState<MatchView | null>(null);
  const [playModel, setPlayModel] = useState<GameModel | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [mintKind, setMintKind] = useState<CharacterKind>("Kuleci");

  const autoRevealLockRef = useRef<string | null>(null);
  const autoResyncRef = useRef<string | null>(null);

  // Sync wallet + player owed/active_match + stored game key state
  useEffect(() => {
    let active = true;
    dispatch({
      type: "WALLET_CHANGED",
      accountId: connected && accountId ? accountId : null,
    });

    if (!connected || !accountId) {
      autoResyncRef.current = null;
      return;
    }

    void (async () => {
      try {
        const [player, owned] = await Promise.all([
          getPlayer(accountId).catch(() => null),
          getOwnedCharacters(accountId).catch(() => []),
        ]);
        if (!active) return;

        if (player) {
          dispatch({
            type: "PLAYER_UPDATED",
            owedYocto: player.owed,
          });
        }
        setCharacters(owned);

        const usable = owned.find(
          (c) =>
            !c.state || (c.state.durability > 0 && c.state.locked_in === null),
        );
        if (usable) {
          dispatch({ type: "CHARACTER_SELECTED", tokenId: usable.token_id });
        }

        if (typeof window !== "undefined" && roletConfig.contractId) {
          const stored = loadKey(
            window.localStorage,
            accountId,
            roletConfig.contractId,
          );
          if (stored) {
            const chainStatus = await checkKeyOnChain(
              roletConfig.rpcUrl,
              accountId,
              stored.publicKey,
              roletConfig.contractId,
            );
            if (!active) return;
            dispatch({ type: "KEY_READY", ready: chainStatus === "present" });
          } else {
            dispatch({ type: "KEY_READY", ready: false });
          }
        }

        const reconnectId =
          urlMatchId?.trim() ||
          (player?.active_match !== null && player?.active_match !== undefined
            ? String(player.active_match)
            : null);

        if (reconnectId && autoResyncRef.current !== `${accountId}:${reconnectId}`) {
          autoResyncRef.current = `${accountId}:${reconnectId}`;
          const snap = await getMatch(reconnectId).catch(() => null);
          if (!active) return;
          if (snap) {
            setMatchSnapshot(snap);
            dispatch({
              type: "RECONNECT_MATCH",
              matchId: reconnectId,
              match: snap,
            });
          } else {
            dispatch({ type: "RECONNECT_MATCH", matchId: reconnectId });
          }
        }
      } catch (err) {
        if (!active) return;
        dispatch({
          type: "ERROR",
          message: err instanceof Error ? err.message : "NEAR durumu okunamadı",
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [
    accountId,
    connected,
    getMatch,
    getOwnedCharacters,
    getPlayer,
    roletConfig.contractId,
    roletConfig.rpcUrl,
    urlMatchId,
  ]);

  // Preload stage assets lazily while in queue or waiting
  useEffect(() => {
    if (flow.step === "queue" || flow.step === "join" || flow.step === "reveal") {
      void preloadStage({ tier: "initial" });
    }
  }, [flow.step]);

  // Poll /api/matchmaking while waiting in queue
  useEffect(() => {
    if (flow.step !== "queue" || !queueWaiting || !queueToken) return;
    let active = true;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch("/api/matchmaking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", token: queueToken }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            view?: QueueView;
            error?: string;
          };
          if (!active) return;
          if (!data.ok || !data.view) {
            setQueueWaiting(false);
            setQueueToken(null);
            dispatch({ type: "QUEUE_EXPIRED" });
            return;
          }
          if (data.view.status === "paired") {
            setQueueWaiting(false);
            setQueueToken(null);
            dispatch({
              type: "QUEUE_PAIRED",
              matchId: data.view.matchId,
              opponent: data.view.opponent,
            });
          } else if (data.view.status === "expired") {
            setQueueWaiting(false);
            setQueueToken(null);
            dispatch({ type: "QUEUE_EXPIRED" });
          }
        } catch {
          // Keep polling on transient HTTP error
        }
      })();
    }, 2_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [flow.step, queueToken, queueWaiting]);

  // Poll getMatch during join/reveal waiting phases
  useEffect(() => {
    if (
      (flow.step !== "join" && flow.step !== "reveal") ||
      !flow.matchId ||
      !accountId
    ) {
      return;
    }

    let active = true;
    const matchId = flow.matchId;
    const playersHint =
      flow.players ??
      (flow.opponent ? ([accountId, flow.opponent] as [string, string]) : undefined);

    const poll = async () => {
      const snap = await getMatch(matchId, playersHint).catch(() => null);
      if (!active) return;
      if (snap) {
        setMatchSnapshot(snap);
        dispatch({ type: "SYNC_MATCH", match: snap });
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1_200);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [accountId, flow.matchId, flow.opponent, flow.players, flow.step, getMatch]);

  // Automatic reveal once on-chain status enters Revealing
  useEffect(() => {
    if (!shouldAutoReveal(flow) || !flow.matchId) return;
    const key = `${flow.matchId}:${flow.you}`;
    if (autoRevealLockRef.current === key) return;
    autoRevealLockRef.current = key;

    let active = true;
    void (async () => {
      try {
        await revealMatch(flow.matchId!);
        if (!active) return;
        dispatch({ type: "REVEAL_SUBMITTED" });
      } catch (err) {
        if (!active) return;
        autoRevealLockRef.current = null;
        dispatch({
          type: "ERROR",
          message: err instanceof Error ? err.message : "Reveal işlemi başarısız",
          recoverableStep: "reveal",
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [flow, revealMatch]);

  // Clock ticker during reveal & play phases
  useEffect(() => {
    if (flow.step !== "play" && flow.step !== "reveal") return;
    const initTimer = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => {
      window.clearTimeout(initTimer);
      window.clearInterval(id);
    };
  }, [flow.step]);

  // Active NearTransport for play phase
  const transport = useMemo(() => {
    if (
      flow.step !== "play" ||
      !flow.matchId ||
      !flow.players ||
      flow.you === null ||
      !matchSnapshot
    ) {
      return null;
    }
    return new NearTransport({
      matchId: flow.matchId,
      players: flow.players,
      you: flow.you,
      views: roletViews,
      submitCall: (method, args) => sendGameCall(method, args),
      initialMatch: matchSnapshot,
      onResync: (snap) => {
        setMatchSnapshot(snap);
        dispatch({ type: "SYNC_MATCH", match: snap });
      },
      onError: () => {
        // Poller handles exponential backoff silently
      },
    });
  }, [
    flow.matchId,
    flow.players,
    flow.step,
    flow.you,
    matchSnapshot,
    roletViews,
    sendGameCall,
  ]);

  useEffect(() => {
    return () => {
      transport?.dispose();
    };
  }, [transport]);

  // Sync terminal phase from PlayableStage model back into duelFlow + refresh player owed
  useEffect(() => {
    if (
      flow.step !== "play" ||
      !playModel ||
      (playModel.phase !== "finished" && playModel.phase !== "cancelled") ||
      !flow.matchId ||
      !accountId
    ) {
      return;
    }

    let active = true;
    void (async () => {
      const [freshMatch, freshPlayer] = await Promise.all([
        getMatch(flow.matchId!, flow.players ?? undefined).catch(() => null),
        getPlayer(accountId).catch(() => null),
      ]);
      if (!active) return;
      if (freshPlayer) {
        dispatch({ type: "PLAYER_UPDATED", owedYocto: freshPlayer.owed });
      }
      if (freshMatch) {
        setMatchSnapshot(freshMatch);
        dispatch({ type: "SYNC_MATCH", match: freshMatch });
      }
    })();

    return () => {
      active = false;
    };
  }, [accountId, flow.matchId, flow.players, flow.step, getMatch, getPlayer, playModel]);

  const handleEnsureKey = useCallback(async () => {
    setActionBusy(true);
    try {
      await ensureGameKey();
      dispatch({ type: "KEY_READY", ready: true });
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Oyun anahtarı oluşturulamadı",
        recoverableStep: "key",
      });
    } finally {
      setActionBusy(false);
    }
  }, [ensureGameKey]);

  const handleMintCharacter = useCallback(async () => {
    if (!accountId) return;
    setActionBusy(true);
    try {
      const tokenId = await buyCharacter(mintKind);
      const refreshed = await getOwnedCharacters(accountId);
      setCharacters(refreshed);
      if (tokenId) {
        dispatch({ type: "CHARACTER_SELECTED", tokenId });
      }
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Karakter satın alınamadı",
        recoverableStep: "character",
      });
    } finally {
      setActionBusy(false);
    }
  }, [accountId, buyCharacter, getOwnedCharacters, mintKind]);

  const handleRefreshChars = useCallback(async () => {
    if (!accountId) return;
    setCharsLoading(true);
    try {
      setCharacters(await getOwnedCharacters(accountId));
    } finally {
      setCharsLoading(false);
    }
  }, [accountId, getOwnedCharacters]);

  const handleEnterQueue = useCallback(async () => {
    if (!selector || !accountId) return;
    setActionBusy(true);
    try {
      const wallet = await selector.wallet();
      if (!wallet.signMessage) {
        throw new Error("Bu cüzdan NEP-413 mesaj imzalamayı desteklemiyor");
      }
      const nonceBytes = new Uint8Array(32);
      crypto.getRandomValues(nonceBytes);
      const message = queueMessage(accountId, Date.now());
      const callbackUrl =
        typeof window !== "undefined" ? window.location.href : undefined;

      const signed = await wallet.signMessage({
        message,
        recipient: QUEUE_RECIPIENT,
        nonce: nonceBytes as unknown as Buffer,
        callbackUrl,
      });

      if (!signed) {
        throw new Error("İmza yanıtı alınamadı");
      }

      const res = await fetch("/api/matchmaking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enter",
          accountId: signed.accountId ?? accountId,
          publicKey: signed.publicKey,
          message,
          signature: signed.signature,
          nonce: bytesToBase64(nonceBytes),
          recipient: QUEUE_RECIPIENT,
          callbackUrl,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        token?: string;
        view?: QueueView;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.view) {
        throw new Error(data.error ?? "Sıraya girilemedi");
      }

      if (data.view.status === "paired") {
        dispatch({
          type: "QUEUE_PAIRED",
          matchId: data.view.matchId,
          opponent: data.view.opponent,
        });
      } else if (data.view.status === "waiting") {
        setQueueToken(data.token ?? null);
        setQueueWaiting(true);
      }
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Eşleşme sırası hatası",
        recoverableStep: "queue",
      });
    } finally {
      setActionBusy(false);
    }
  }, [accountId, selector]);

  const handleLeaveQueue = useCallback(async () => {
    const token = queueToken;
    setQueueWaiting(false);
    setQueueToken(null);
    if (!token) return;
    await fetch("/api/matchmaking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", token }),
    }).catch(() => undefined);
  }, [queueToken]);

  const handleJoinMatch = useCallback(async () => {
    if (!flow.matchId || !flow.opponent || !flow.selectedTokenId) return;
    setActionBusy(true);
    try {
      await joinMatch(flow.matchId, flow.opponent, flow.selectedTokenId);
      dispatch({
        type: "JOIN_SUBMITTED",
        matchId: flow.matchId,
        opponent: flow.opponent,
      });
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Maça katılım başarısız",
        recoverableStep: "join",
      });
    } finally {
      setActionBusy(false);
    }
  }, [flow.matchId, flow.opponent, flow.selectedTokenId, joinMatch]);

  const handleCancelMatch = useCallback(async () => {
    if (!flow.matchId) return;
    setActionBusy(true);
    try {
      await cancelMatch(flow.matchId);
      dispatch({ type: "MATCH_CANCELLED" });
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Maç iptal edilemedi",
        recoverableStep: "join",
      });
    } finally {
      setActionBusy(false);
    }
  }, [cancelMatch, flow.matchId]);

  const handleClaimTimeout = useCallback(async () => {
    if (!flow.matchId || !accountId) return;
    setTimeoutBusy(true);
    try {
      await claimTimeout(flow.matchId);
      const [freshMatch, freshPlayer] = await Promise.all([
        getMatch(flow.matchId, flow.players ?? undefined).catch(() => null),
        getPlayer(accountId).catch(() => null),
      ]);
      if (freshPlayer) {
        dispatch({ type: "PLAYER_UPDATED", owedYocto: freshPlayer.owed });
      }
      if (freshMatch) {
        setMatchSnapshot(freshMatch);
        dispatch({ type: "SYNC_MATCH", match: freshMatch });
      } else {
        dispatch({ type: "MATCH_CANCELLED" });
      }
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Zaman aşımı talebi başarısız",
        recoverableStep: flow.step === "reveal" ? "reveal" : "play",
      });
    } finally {
      setTimeoutBusy(false);
    }
  }, [accountId, claimTimeout, flow.matchId, flow.players, flow.step, getMatch, getPlayer]);

  const handleClaimReward = useCallback(async () => {
    setActionBusy(true);
    try {
      await claimReward();
      dispatch({ type: "REWARD_CLAIMED" });
    } catch (err) {
      dispatch({
        type: "ERROR",
        message: err instanceof Error ? err.message : "Ödül çekilemedi",
        recoverableStep: flow.step,
      });
    } finally {
      setActionBusy(false);
    }
  }, [claimReward, flow.step]);

  const selectedCharacter = characters.find(
    (c) => c.token_id === flow.selectedTokenId,
  );
  const characterKind: CharacterKind = selectedCharacter?.state?.kind ?? "Kuleci";

  const activeDeadline = matchSnapshot?.deadline_ms ?? 0;
  const revealDeadline = matchSnapshot?.reveal_deadline_ms ?? 0;
  const deadlineSecondsLeft =
    flow.step === "play" && activeDeadline > 0
      ? remainingSeconds(activeDeadline, nowMs)
      : null;

  const canClaimTurnTimeout =
    flow.step === "play" &&
    flow.you !== null &&
    playModel !== null &&
    activeDeadline > 0 &&
    claimable(playModel, flow.you, activeDeadline, nowMs);

  const canClaimRevealTo =
    flow.step === "reveal" &&
    flow.you !== null &&
    revealDeadline > 0 &&
    canClaimRevealTimeout(flow.revealed, flow.you, revealDeadline, nowMs);

  // Fullscreen play step matches /practice viewport ergonomics
  if (flow.step === "play" && transport && flow.you !== null) {
    return (
      <main className="flex min-h-screen flex-col bg-[#050505] text-[#eaeaea]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2a2a] bg-[#0e0d0b] px-4 py-2 font-mono text-xs">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="border border-[#c6a15b]/40 px-2 py-1 text-[11px] text-[#c6a15b] hover:border-[#e5c378]"
            >
              ← ROLET
            </Link>
            <span className="font-bold tracking-[0.14em] text-[#eaeaea] uppercase">
              DÜELLO #{flow.matchId}
            </span>
            <span className="text-[#9a9a9a]">RAKİP: {flow.opponent}</span>
          </div>
          {flow.claimSuggested && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleClaimReward}
              className="cursor-pointer border border-[#c6a15b] bg-[#2a1f10] px-3 py-1 text-[11px] text-[#e5c378] uppercase"
            >
              ÖDÜL AL ({formatYoctoNear(flow.owedYocto)})
            </button>
          )}
        </header>

        <div className="relative flex-1 min-h-0">
          <PlayableStage
            transport={transport}
            you={flow.you}
            characterKind={characterKind}
            statusLabel={`NEAR · #${flow.matchId}`}
            deadlineSecondsLeft={deadlineSecondsLeft}
            canClaimTimeout={canClaimTurnTimeout}
            onClaimTimeout={handleClaimTimeout}
            claimTimeoutBusy={timeoutBusy}
            onModelChange={setPlayModel}
          />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-[#eaeaea]">
      <Nav />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-24 pb-16">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#242424] pb-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#c6a15b] uppercase">
              NEAR Testnet · Zincir Üstü Düello
            </p>
            <h1 className="font-display text-3xl tracking-wide text-[#f0ede6] uppercase">
              Masa Düellosu
            </h1>
          </div>
          <Link
            href="/practice"
            className="border border-[#3a3a3a] px-3 py-1.5 font-mono text-xs text-[#c6a15b] uppercase hover:border-[#c6a15b]"
          >
            Cüzdansız Pratik
          </Link>
        </header>

        {flow.claimSuggested && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[#c6a15b]/60 bg-[#1c160d] p-4 font-mono text-xs">
            <div>
              <span className="font-bold text-[#e5c378]">
                ÇEKİLEBİLİR ÖDÜL: {formatYoctoNear(flow.owedYocto)}
              </span>
              <p className="mt-1 text-[#b8b1a3]">
                Önceki maçlarından biriken ödülün sözleşmede bekliyor. Cüzdan onayıyla çekebilirsin.
              </p>
            </div>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleClaimReward}
              className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-4 py-2 font-bold text-[#090909] uppercase hover:bg-[#e5c378] disabled:opacity-50"
            >
              {actionBusy ? "ONAYLANIYOR..." : "Ödülü Çek (claim_reward)"}
            </button>
          </div>
        )}

        <section className="border border-[#242424] bg-[#0e0d0b] p-6 font-mono">
          {flow.step === "connect" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-[#b8b1a3]">
                1 / 6 — Düelloya katılmak için NEAR cüzdanını bağla.
              </p>
              <button
                type="button"
                onClick={connect}
                className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold tracking-[0.14em] text-[#090909] uppercase hover:bg-[#e5c378]"
              >
                NEAR Cüzdan Bağla
              </button>
            </div>
          )}

          {flow.step === "key" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-[#f0ede6]">
                2 / 6 — Maç içi hamleleri pop-up olmadan göndermek için kısıtlı oyun anahtarı ekle.
              </p>
              <p className="text-xs text-[#8f897e]">
                Yalnızca join, reveal, cancel, fire, use_item ve claim_timeout metotlarına izin verilir (0.25 NEAR gas izni).
              </p>
              <button
                type="button"
                disabled={actionBusy}
                onClick={handleEnsureKey}
                className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold tracking-[0.14em] text-[#090909] uppercase hover:bg-[#e5c378] disabled:opacity-50"
              >
                {actionBusy ? "EKLENİYOR..." : "Oyun Anahtarı Oluştur"}
              </button>
            </div>
          )}

          {flow.step === "character" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[#f0ede6]">
                  3 / 6 — Düelloda kullanacağın karakter NFT&apos;sini seç.
                </p>
                <button
                  type="button"
                  disabled={charsLoading}
                  onClick={handleRefreshChars}
                  className="cursor-pointer border border-[#3a3a3a] px-3 py-1 text-[11px] text-[#9a9a9a] uppercase hover:text-[#eaeaea]"
                >
                  {charsLoading ? "..." : "Yenile"}
                </button>
              </div>

              {characters.length === 0 ? (
                <div className="flex flex-col items-start gap-3 border border-[#2a241c] bg-[#12100d] p-4">
                  <p className="text-xs text-[#b8b1a3]">
                    Hesabında karakter NFT bulunmuyor. Buradan satın alabilir veya{" "}
                    <Link href="/profile" className="text-[#c6a15b] underline">
                      Karakterler sayfasını
                    </Link>{" "}
                    açabilirsin.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["Kuleci", "Ayarci", "Kacak"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setMintKind(k)}
                        className={`cursor-pointer border px-3 py-1.5 text-xs uppercase ${
                          mintKind === k
                            ? "border-[#c6a15b] bg-[#2a1f10] text-[#e5c378]"
                            : "border-[#3a3a3a] text-[#9a9a9a]"
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleMintCharacter}
                      className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-4 py-1.5 text-xs font-bold text-[#090909] uppercase disabled:opacity-50"
                    >
                      {actionBusy ? "SATIN ALINIYOR..." : `${mintKind} Satın Al (1 NEAR)`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {characters.map((ch) => {
                    const usable =
                      !ch.state ||
                      (ch.state.durability > 0 && ch.state.locked_in === null);
                    return (
                      <button
                        key={ch.token_id}
                        type="button"
                        disabled={!usable}
                        onClick={() =>
                          dispatch({
                            type: "CHARACTER_SELECTED",
                            tokenId: ch.token_id,
                          })
                        }
                        className={`flex flex-col items-start gap-1 border p-3 text-left text-xs ${
                          usable
                            ? "cursor-pointer border-[#3a3a3a] hover:border-[#c6a15b]"
                            : "cursor-not-allowed border-[#222] opacity-45"
                        }`}
                      >
                        <span className="font-bold text-[#e5c378]">
                          #{ch.token_id} · {ch.state?.kind ?? "Karakter"}
                        </span>
                        <span className="text-[#9a9a9a]">
                          Dayanıklılık: {ch.state?.durability ?? "?"}
                        </span>
                        {ch.state?.locked_in !== null &&
                          ch.state?.locked_in !== undefined && (
                            <span className="text-[#e61919]">
                              Maçta kilitli (#{ch.state.locked_in})
                            </span>
                          )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {flow.step === "queue" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-[#f0ede6]">
                4 / 6 — Seçili karakter: #{flow.selectedTokenId}. Rakip bulmak için eşleşme sırasına gir.
              </p>
              {queueWaiting ? (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="border border-[#c6a15b]/50 bg-[#1c160d] px-3 py-2 text-xs text-[#e5c378]">
                    RAKİP BEKLENİYOR (NEP-413 İMZALI OTURUM AKTİF)...
                  </span>
                  <button
                    type="button"
                    onClick={handleLeaveQueue}
                    className="cursor-pointer border border-[#e61919]/60 px-4 py-2 text-xs text-[#ff8080] uppercase"
                  >
                    Sıradan Çık
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleEnterQueue}
                    className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold tracking-[0.14em] text-[#090909] uppercase hover:bg-[#e5c378] disabled:opacity-50"
                  >
                    {actionBusy ? "İMZALANIYOR..." : "Eşleşme Sırasına Gir"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: "CHARACTER_SELECTED", tokenId: null })
                    }
                    className="cursor-pointer border border-[#3a3a3a] px-4 py-2.5 text-xs text-[#9a9a9a] uppercase"
                  >
                    Karakter Değiştir
                  </button>
                </div>
              )}
            </div>
          )}

          {flow.step === "join" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-[#f0ede6]">
                5 / 6 — Eşleşme #{flow.matchId} · Rakip: {flow.opponent}
              </p>
              <p className="text-xs text-[#9a9a9a]">
                Gizli tohum taahhüdün (commit) tarayıcı oturumunda güvenle saklanır.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={actionBusy || flow.committed}
                  onClick={handleJoinMatch}
                  className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold text-[#090909] uppercase disabled:opacity-50"
                >
                  {flow.committed
                    ? "RAKİP KATILIMI BEKLENİYOR..."
                    : actionBusy
                      ? "GÖNDERİLİYOR..."
                      : "Maça Katıl (Join)"}
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleCancelMatch}
                  className="cursor-pointer border border-[#e61919]/60 px-4 py-2.5 text-xs text-[#ff8080] uppercase"
                >
                  İptal Et
                </button>
              </div>
            </div>
          )}

          {flow.step === "reveal" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm text-[#f0ede6]">
                6 / 6 — Tohum Açıklama (Reveal) · Maç #{flow.matchId}
              </p>
              <p className="text-xs text-[#b8b1a3]">
                {flow.you !== null && flow.revealed[flow.you]
                  ? "Tohumun açıklandı, rakibin açıklaması bekleniyor..."
                  : "Taahhüt edilen gizli tohum otomatik açıklanıyor..."}
              </p>
              {canClaimRevealTo && (
                <button
                  type="button"
                  disabled={timeoutBusy}
                  onClick={handleClaimTimeout}
                  className="cursor-pointer border border-[#e61919] bg-[#3b0b0b] px-4 py-2 text-xs font-bold text-[#ffd6d6] uppercase"
                >
                  {timeoutBusy ? "İŞLENİYOR..." : "Süre Doldu — İptal / Kazan"}
                </button>
              )}
            </div>
          )}

          {flow.step === "result" && (
            <div className="flex flex-col items-start gap-4">
              <h2 className="text-xl font-bold text-[#e5c378] uppercase">
                {flow.cancelled
                  ? "Maç İptal Edildi"
                  : flow.you !== null && flow.winner === flow.you
                    ? "Kazandın!"
                    : "Maç Tamamlandı"}
              </h2>
              <p className="text-xs text-[#b8b1a3]">
                Maç #{flow.matchId} · Rakip: {flow.opponent ?? "-"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {flow.claimSuggested && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={handleClaimReward}
                    className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold text-[#090909] uppercase"
                  >
                    Ödülü Çek ({formatYoctoNear(flow.owedYocto)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispatch({ type: "RESET" })}
                  className="cursor-pointer border border-[#c6a15b] px-5 py-2.5 text-xs text-[#c6a15b] uppercase"
                >
                  Yeni Düello Ara
                </button>
              </div>
            </div>
          )}

          {flow.step === "error" && (
            <div className="flex flex-col items-start gap-4">
              <p className="text-sm font-bold text-[#ff8080]">
                Hata: {flow.error?.message ?? "Bilinmeyen hata"}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => dispatch({ type: "RETRY" })}
                  className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-4 py-2 text-xs font-bold text-[#090909] uppercase"
                >
                  Tekrar Dene
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "RESET" })}
                  className="cursor-pointer border border-[#3a3a3a] px-4 py-2 text-xs text-[#9a9a9a] uppercase"
                >
                  Sıraya Dön
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function DuelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#070707] font-mono text-xs text-[#9a9a9a]">
          YÜKLENİYOR...
        </div>
      }
    >
      <DuelClient />
    </Suspense>
  );
}
