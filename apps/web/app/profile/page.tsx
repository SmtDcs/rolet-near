"use client";

import Link from "next/link";
import { Nav, Footer } from "@/components/Nav";
import { useNearWallet } from "@/components/NearProvider";

/**
 * Temporary NEAR migration shell for /profile during F3-16.
 * Full NEAR character purchase and durability view replaces this in F3-22.
 */
export default function ProfilePage() {
  const { accountId, connected, connect } = useNearWallet();

  return (
    <main className="relative min-h-screen bg-[#0b0d10] text-[#E6E1D6] flex flex-col justify-between">
      <Nav />
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-32 text-center">
        <span className="text-[10px] tracking-[0.5em] text-[#B88A2E] uppercase">
          NEAR CHARACTER REGISTRY
        </span>
        <h1 className="mt-3 font-display text-4xl tracking-[0.14em] uppercase">
          PROFILE MIGRATING TO NEAR
        </h1>
        <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
          Character NFT minting and durability tracking are being wired to the NEAR contract.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {connected && accountId ? (
            <span className="border border-[#B88A2E]/60 bg-black/60 px-4 py-2 text-xs tracking-[0.2em] text-[#E6E1D6]">
              Connected: {accountId}
            </span>
          ) : (
            <button
              type="button"
              onClick={connect}
              className="border border-[#B88A2E] bg-[#2E333A] px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-[#E6E1D6] hover:bg-[#3A3F47] cursor-pointer"
            >
              Connect NEAR Wallet
            </button>
          )}
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
