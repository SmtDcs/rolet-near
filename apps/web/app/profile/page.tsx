"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { useNearWallet } from "@/components/NearProvider";
import {
  useRoletNear,
  type CharacterKind,
  type ContractConfigView,
  type OwnedCharacter,
  type PlayerStateView,
} from "@/hooks/useRoletNear";

const CHARACTER_CATALOG: Array<{
  kind: CharacterKind;
  title: string;
  subtitle: string;
  description: string;
}> = [
  {
    kind: "Kuleci",
    title: "Tower Keeper",
    subtitle: "The Warden",
    description: "The unflappable sentry of the iron barricades. Sits down with ten duels of durability.",
  },
  {
    kind: "Ayarci",
    title: "Tuner",
    subtitle: "The Tinkerer",
    description: "A master of hammer, cylinder and bolt. Takes calculated risks with an eight-chamber cylinder.",
  },
  {
    kind: "Kacak",
    title: "Fugitive",
    subtitle: "The Smuggler",
    description: "The shadow name behind covert item trades. Knows how to hide his hand when the time comes.",
  },
];

function formatYoctoNear(yocto: string | null | undefined): string {
  if (!yocto) return "1.00 NEAR";
  try {
    const val = BigInt(yocto);
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

export default function ProfilePage() {
  const { accountId, connected, connect } = useNearWallet();
  const {
    config,
    busy,
    getConfig,
    getPlayer,
    getOwnedCharacters,
    buyCharacter,
    claimReward,
  } = useRoletNear();

  const [contractConfig, setContractConfig] =
    useState<ContractConfigView | null>(null);
  const [player, setPlayer] = useState<PlayerStateView | null>(null);
  const [characters, setCharacters] = useState<OwnedCharacter[]>([]);
  const [loading, setLoading] = useState(false);
  const [buyingKind, setBuyingKind] = useState<CharacterKind | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!config.contractId) return;
    setLoading(true);
    try {
      const cfg = await getConfig().catch(() => null);
      if (cfg) setContractConfig(cfg);
      if (accountId) {
        const [p, owned] = await Promise.all([
          getPlayer(accountId).catch(() => null),
          getOwnedCharacters(accountId).catch(() => []),
        ]);
        setPlayer(p);
        setCharacters(owned);
      } else {
        setPlayer(null);
        setCharacters([]);
      }
    } finally {
      setLoading(false);
    }
  }, [accountId, config.contractId, getConfig, getOwnedCharacters, getPlayer]);

  useEffect(() => {
    if (!config.contractId) return;
    let active = true;
    void (async () => {
      const cfg = await getConfig().catch(() => null);
      if (!active) return;
      if (cfg) setContractConfig(cfg);
      if (accountId) {
        const [p, owned] = await Promise.all([
          getPlayer(accountId).catch(() => null),
          getOwnedCharacters(accountId).catch(() => []),
        ]);
        if (!active) return;
        setPlayer(p);
        setCharacters(owned);
      } else {
        setPlayer(null);
        setCharacters([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [accountId, config.contractId, getConfig, getOwnedCharacters, getPlayer]);

  const handleBuy = async (kind: CharacterKind) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBuyingKind(kind);
    try {
      const tokenId = await buyCharacter(kind, contractConfig?.price);
      setStatusMsg(
        tokenId
          ? `${kind} character minted (#${tokenId}).`
          : `${kind} character purchased.`,
      );
      await refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBuyingKind(null);
    }
  };

  const handleClaim = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await claimReward();
      setStatusMsg("Reward claimed to your wallet.");
      await refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not claim reward");
    }
  };

  const hasOwed = (() => {
    try {
      return BigInt(player?.owed ?? "0") > BigInt(0);
    } catch {
      return false;
    }
  })();

  const maxDurability = contractConfig?.durability ?? 10;

  return (
    <div className="min-h-screen bg-[#070707] text-[#eaeaea]">
      <Nav />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-24 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#242424] pb-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#c6a15b] uppercase">
              NEAR NFT Characters · NEP-171
            </p>
            <h1 className="font-display text-3xl tracking-wide text-[#f0ede6] uppercase">
              Character &amp; Profile
            </h1>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="cursor-pointer border border-[#3a3a3a] px-3 py-1.5 text-[#9a9a9a] uppercase hover:text-[#eaeaea]"
            >
              {loading ? "LOADING..." : "Refresh"}
            </button>
            <Link
              href="/duel"
              className="border border-[#c6a15b] bg-[#c6a15b] px-4 py-1.5 font-bold text-[#090909] uppercase hover:bg-[#e5c378]"
            >
              Enter Duel
            </Link>
          </div>
        </header>

        {!connected ? (
          <section className="flex flex-col items-start gap-4 border border-[#242424] bg-[#0e0d0b] p-6 font-mono">
            <p className="text-sm text-[#b8b1a3]">
              Connect your NEAR wallet to buy characters and see the NFTs you own.
            </p>
            <button
              type="button"
              onClick={connect}
              className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-5 py-2.5 text-xs font-bold text-[#090909] uppercase"
            >
              Connect NEAR Wallet
            </button>
          </section>
        ) : (
          <section className="grid gap-4 border border-[#242424] bg-[#0e0d0b] p-5 font-mono text-xs sm:grid-cols-4">
            <div>
              <div className="text-[#8f897e] uppercase">Account</div>
              <div className="mt-1 truncate font-bold text-[#eaeaea]">
                {accountId}
              </div>
            </div>
            <div>
              <div className="text-[#8f897e] uppercase">Wins / Matches</div>
              <div className="mt-1 font-bold text-[#e5c378]">
                {player ? `${player.wins}G · ${player.losses}M (${player.played})` : "-"}
              </div>
            </div>
            <div>
              <div className="text-[#8f897e] uppercase">Pending Reward</div>
              <div className="mt-1 font-bold text-[#52c41a]">
                {player ? formatYoctoNear(player.owed) : "0.00 NEAR"}
              </div>
            </div>
            <div className="flex items-center sm:justify-end">
              {hasOwed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleClaim}
                  className="cursor-pointer border border-[#c6a15b] bg-[#c6a15b] px-4 py-2 font-bold text-[#090909] uppercase hover:bg-[#e5c378] disabled:opacity-50"
                >
                  Claim Reward
                </button>
              ) : (
                <span className="text-[#6e6a61] uppercase">No claimable reward</span>
              )}
            </div>
          </section>
        )}

        {(statusMsg || errorMsg) && (
          <div
            className={`border p-3 font-mono text-xs ${
              errorMsg
                ? "border-[#e61919]/60 bg-[#2a0909]/60 text-[#ff8080]"
                : "border-[#52c41a]/60 bg-[#0d210b]/60 text-[#9ce284]"
            }`}
          >
            {errorMsg ?? statusMsg}
          </div>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between font-mono">
            <h2 className="text-sm font-bold tracking-[0.16em] text-[#eaeaea] uppercase">
              Character Shop (10-Match Durability)
            </h2>
            <span className="text-xs text-[#c6a15b]">
              Unit Price: {formatYoctoNear(contractConfig?.price)}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {CHARACTER_CATALOG.map((item) => (
              <article
                key={item.kind}
                className="flex flex-col justify-between border border-[#242424] bg-[#0e0d0b] p-4"
              >
                <div>
                  <div className="relative mb-4 aspect-[4/3] w-full overflow-hidden border border-[#242424] bg-[#070707]">
                    <Image
                      src="/character/seat.webp"
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 90vw, 300px"
                      className="object-cover opacity-85"
                    />
                  </div>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-[#c6a15b] uppercase">
                    {item.subtitle}
                  </p>
                  <h3 className="mt-1 font-display text-xl text-[#f0ede6] uppercase">
                    {item.title}
                  </h3>
                  <p className="mt-2 font-sans text-xs leading-relaxed text-[#9a9a9a]">
                    {item.description}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!connected || busy || !config.contractId}
                  onClick={() => void handleBuy(item.kind)}
                  className="mt-4 cursor-pointer border border-[#c6a15b] bg-[#1c160d] px-4 py-2 font-mono text-xs font-bold text-[#e5c378] uppercase hover:bg-[#c6a15b] hover:text-[#090909] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {buyingKind === item.kind
                    ? "CONFIRMING..."
                    : `${item.title} Buy (${formatYoctoNear(contractConfig?.price)})`}
                </button>
              </article>
            ))}
          </div>
        </section>

        {connected && (
          <section className="flex flex-col gap-4">
            <h2 className="font-mono text-sm font-bold tracking-[0.16em] text-[#eaeaea] uppercase">
              Your Characters ({characters.length})
            </h2>

            {characters.length === 0 ? (
              <div className="border border-[#242424] bg-[#0e0d0b] p-5 font-mono text-xs text-[#8f897e]">
                You have no character NFTs yet. Buy one above.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {characters.map((ch) => {
                  const dur = ch.state?.durability ?? maxDurability;
                  const locked = ch.state?.locked_in;
                  return (
                    <div
                      key={ch.token_id}
                      className="border border-[#2a241c] bg-[#0e0d0b] p-4 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#e5c378]">
                          #{ch.token_id} · {ch.state?.kind ?? "Rolet"}
                        </span>
                        <span
                          className={
                            locked !== null && locked !== undefined
                              ? "text-[#ff8080]"
                              : dur > 0
                                ? "text-[#52c41a]"
                                : "text-[#777]"
                          }
                        >
                          {locked !== null && locked !== undefined
                            ? `Match #${locked}`
                            : dur > 0
                              ? "Ready"
                              : "Depleted"}
                        </span>
                      </div>
                      <div className="mt-3 h-1.5 w-full bg-[#1f1d19]">
                        <div
                          className="h-full bg-[#c6a15b]"
                          style={{
                            width: `${Math.min(100, Math.round((dur / Math.max(1, maxDurability)) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px] text-[#8f897e]">
                        Durability: {dur} / {maxDurability}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
