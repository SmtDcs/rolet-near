"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { useNearWallet } from "@/components/NearProvider";
import {
  useRoletNear,
  type LeaderboardEntryView,
} from "@/hooks/useRoletNear";

export default function LeaderboardPage() {
  const { accountId } = useNearWallet();
  const { config, leaderboard } = useRoletNear();
  const [rows, setRows] = useState<LeaderboardEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config.contractId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await leaderboard(0, 50);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sıralama alınamadı");
    } finally {
      setLoading(false);
    }
  }, [config.contractId, leaderboard]);

  useEffect(() => {
    if (!config.contractId) return;
    let active = true;
    void leaderboard(0, 50)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Sıralama alınamadı");
        }
      });
    return () => {
      active = false;
    };
  }, [config.contractId, leaderboard]);

  return (
    <div className="min-h-screen bg-[#070707] text-[#eaeaea]">
      <Nav />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-24 pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#242424] pb-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#c6a15b] uppercase">
              NEAR Testnet · Zincir Üstü Skorlar
            </p>
            <h1 className="font-display text-3xl tracking-wide text-[#f0ede6] uppercase">
              Sıralama
            </h1>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="cursor-pointer border border-[#3a3a3a] px-3 py-1.5 text-[#9a9a9a] uppercase hover:text-[#eaeaea]"
            >
              {loading ? "YÜKLENİYOR..." : "Yenile"}
            </button>
            <Link
              href="/duel"
              className="border border-[#c6a15b] bg-[#c6a15b] px-4 py-1.5 font-bold text-[#090909] uppercase hover:bg-[#e5c378]"
            >
              Düelloya Gir
            </Link>
          </div>
        </header>

        {!config.contractId ? (
          <div className="border border-[#242424] bg-[#0e0d0b] p-6 font-mono text-xs text-[#8f897e]">
            Sözleşme adresi (`NEXT_PUBLIC_ROLET_CONTRACT`) tanımlandığında sıralama zincirden okunur.
          </div>
        ) : error ? (
          <div className="border border-[#e61919]/60 bg-[#2a0909]/60 p-4 font-mono text-xs text-[#ff8080]">
            {error}
          </div>
        ) : rows.length === 0 && !loading ? (
          <div className="border border-[#242424] bg-[#0e0d0b] p-6 font-mono text-xs text-[#8f897e]">
            Henüz tamamlanmış düello kaydı bulunmuyor.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#242424] bg-[#0e0d0b]">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-[#242424] bg-[#12100d] text-[#8f897e] uppercase">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Hesap</th>
                  <th className="px-4 py-3 text-right">Kazanma</th>
                  <th className="px-4 py-3 text-right">Kaybetme</th>
                  <th className="px-4 py-3 text-right">Maç</th>
                  <th className="px-4 py-3 text-right">Oran</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isYou = accountId === row.account_id;
                  const rate =
                    row.played > 0
                      ? `${Math.round((row.wins / row.played) * 100)}%`
                      : "-";
                  return (
                    <tr
                      key={row.account_id}
                      className={`border-b border-[#1c1a16] ${
                        isYou ? "bg-[#1c160d] text-[#e5c378]" : "text-[#d6d0c4]"
                      }`}
                    >
                      <td className="px-4 py-3 text-[#8f897e]">{idx + 1}</td>
                      <td className="px-4 py-3 font-bold">
                        {row.account_id} {isYou ? "(SEN)" : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-[#52c41a]">
                        {row.wins}
                      </td>
                      <td className="px-4 py-3 text-right text-[#ff8080]">
                        {row.losses}
                      </td>
                      <td className="px-4 py-3 text-right">{row.played}</td>
                      <td className="px-4 py-3 text-right text-[#c6a15b]">
                        {rate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
