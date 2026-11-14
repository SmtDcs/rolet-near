"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNearWallet } from "@/components/NearProvider";

const LINKS = [
  { href: "/", label: "HOME" },
  { href: "/duel", label: "ARENA" },
  { href: "/practice", label: "PRACTICE" },
  { href: "/profile", label: "PROFILE" },
  { href: "/leaderboard", label: "LEADERBOARD" },
];

function formatAccountLabel(accountId: string): string {
  if (accountId.length <= 22) return accountId;
  return `${accountId.slice(0, 10)}…${accountId.slice(-8)}`;
}

export function Nav() {
  const path = usePathname();
  const { accountId, connected, ready, connect, disconnect } = useNearWallet();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-6 py-3 border-b border-rust/40 bg-black/70 backdrop-blur-sm">
      <Link href="/" className="font-display text-xl text-bleed crt-text">
        ROLET
      </Link>
      <div className="flex gap-6 items-center">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-[10px] tracking-[0.4em] crt-text ${
              path === l.href ? "text-red-400" : "text-rust hover:text-red-500"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {connected && accountId ? (
          <>
            <span
              className="border border-rust/50 bg-black/70 px-3 py-1.5 text-[10px] tracking-[0.18em] text-[#E6E1D6]"
              title={accountId}
            >
              {formatAccountLabel(accountId)}
            </span>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="border border-red-800/70 bg-black/80 px-3 py-1.5 text-[10px] tracking-[0.25em] text-red-400 hover:border-red-500 hover:text-red-200 cursor-pointer"
            >
              DISCONNECT
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!ready}
            onClick={connect}
            className="border border-[#B88A2E] bg-[#1E2227] px-4 py-1.5 text-[10px] tracking-[0.28em] text-[#E6E1D6] hover:bg-[#2E333A] disabled:opacity-50 cursor-pointer"
          >
            {ready ? "CONNECT NEAR" : "LOADING…"}
          </button>
        )}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-rust/30 px-6 py-3 text-[9px] tracking-[0.4em] text-zinc-600 flex justify-between crt-text">
      <span>{"// NEAR TESTNET · 2026"}</span>
      <span>github.com/SmtDcs/rolet</span>
    </footer>
  );
}
