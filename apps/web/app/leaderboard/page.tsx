"use client";

import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";

/**
 * Temporary NEAR migration shell for /leaderboard during F3-16.
 * Full NEAR contract leaderboard view replaces this in F3-22.
 */
export default function LeaderboardPage() {
  return (
    <main className="relative min-h-screen bg-[#0b0d10] text-[#E6E1D6] flex flex-col justify-between">
      <Nav />
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
        <span className="text-[10px] tracking-[0.5em] text-[#B88A2E] uppercase">
          NEAR MATCH REGISTRY
        </span>
        <h1 className="mt-3 font-display text-4xl tracking-[0.14em] uppercase">
          LEADERBOARD MIGRATING TO NEAR
        </h1>
        <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
          On-chain top-100 standings are being wired to the NEAR contract view.
        </p>
        <div className="mt-8">
          <Link
            href="/practice"
            className="border border-zinc-700 bg-black/60 px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-zinc-200 hover:border-[#B88A2E]"
          >
            Play Practice
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
