"use client";

import { useEffect, useState } from "react";

type Stats = {
  characters: number | null;
  matches: number | null;
  treasuryNear: number | null;
  rewardNear?: number | null;
};

const FALLBACK: Stats = {
  characters: null,
  matches: null,
  treasuryNear: null,
  rewardNear: 0.1,
};

function Value({ value }: { value: string | null }) {
  if (value === null) return <span className="text-[var(--color-phosphor-faint)]">--</span>;
  return <span>{value}</span>;
}

export function LedgerSection() {
  const [stats, setStats] = useState<Stats>(FALLBACK);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d: Stats) => {
        if (alive) setStats(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const cells = [
    {
      label: "Characters minted",
      value: stats.characters === null ? null : stats.characters.toLocaleString("en-US"),
      note: "NEP-171 character NFTs on NEAR",
    },
    {
      label: "Matches settled",
      value: stats.matches === null ? null : stats.matches.toLocaleString("en-US"),
      note: "Recorded on NEAR contract",
    },
    {
      label: "Treasury",
      value: stats.treasuryNear === null ? null : `${stats.treasuryNear.toFixed(3)} NEAR`,
      note: "Contract-held reward pool",
    },
    {
      label: "Reward per match",
      value:
        stats.rewardNear !== null && stats.rewardNear !== undefined
          ? `${stats.rewardNear.toFixed(2)} NEAR`
          : "0.10 NEAR",
      note: "Fixed, paid from the treasury",
    },
  ];

  return (
    <section id="ledger" className="grid-field grain-field scroll-mt-14 border-t border-[var(--color-line)] bg-[var(--color-void)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="frame" data-frame="THE LEDGER">
          <p className="label">Read from the chain, not from a dashboard</p>
          <h2 className="macro-sm mt-3">What ROLET is</h2>
          <p className="mt-4 max-w-2xl font-sans text-[0.95rem] leading-relaxed text-[var(--color-phosphor-dim)]">
            Two players, one revolver, eight chambers. Every commit, reveal, shot, and
            payout lives in the NEAR smart contract. Nothing here is simulated: the
            counters below are read straight from on-chain views.
          </p>
        </div>

        {/* Grid gap with a contrasting parent background yields hairline rules. */}
        <div className="mt-10 grid grid-cols-2 gap-px bg-[var(--color-line)] lg:grid-cols-4">
          {cells.map((c) => (
            <div key={c.label} className="bg-[var(--color-void)] px-5 py-7">
              <p className="label">{c.label}</p>
              <p className="readout mt-3 text-2xl lg:text-3xl">
                <Value value={c.value} />
              </p>
              <p className="mt-2 font-sans text-[0.75rem] leading-snug text-[var(--color-phosphor-faint)]">
                {c.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
