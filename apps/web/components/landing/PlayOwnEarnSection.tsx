const ROWS = [
  {
    index: "01",
    title: "Play",
    body: "One wallet prompt registers a scoped Function Call access key. Every turn after that is signed directly on NEAR with sub-second confirmation.",
  },
  {
    index: "02",
    title: "Own",
    body: "Your character is a NEP-171 NFT with ten matches of durability. It is yours to keep, trade, or retire. The contract never custodies it outside a live match.",
  },
  {
    index: "03",
    title: "Earn",
    body: "Win and the treasury credits a fixed 0.10 NEAR reward you claim directly to your wallet. Nothing is printed or inflated.",
  },
] as const;

export function PlayOwnEarnSection() {
  return (
    <section className="grid-field border-t border-[var(--color-line)] bg-[var(--color-void)]">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="label">Why it is built this way</h2>
        <h3 className="macro-sm mt-3">A duel, not a lottery</h3>

        <div className="mt-12 grid grid-cols-1 gap-px bg-[var(--color-line)] lg:grid-cols-3">
          {ROWS.map((r) => (
            <article key={r.title} className="bg-[var(--color-void)] p-7">
              <p className="readout text-[var(--color-brass)]">{r.index}</p>
              <h4 className="mt-4 font-display text-2xl uppercase tracking-[0.1em] text-[var(--color-phosphor)]">
                {r.title}
              </h4>
              <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--color-phosphor-dim)]">
                {r.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
