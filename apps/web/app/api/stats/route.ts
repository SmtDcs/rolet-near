import { NextResponse } from "next/server";
import { encodeArgsBase64, decodeViewResult, createNearViewClient } from "@/lib/nearViews";
import { readNearConfig } from "@/lib/nearConfig";

export const revalidate = 60;

function yoctoToNearNumber(yocto: string): number {
  try {
    const val = BigInt(yocto || "0");
    const milli = val / BigInt("1000000000000000000000");
    return Number(milli) / 1000;
  } catch {
    return 0;
  }
}

export async function GET() {
  const cfg = readNearConfig();
  if (!cfg.contractId || !cfg.rpcUrl) {
    return NextResponse.json(
      {
        characters: null,
        matches: null,
        treasuryNear: null,
        rewardNear: 0.1,
        source: "unconfigured",
      },
      { status: 200 },
    );
  }

  try {
    const views = createNearViewClient({
      contractId: cfg.contractId,
      rpcUrl: cfg.rpcUrl,
    });

    const supplyRes = await fetch(cfg.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "stats:nft_total_supply",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "optimistic",
          account_id: cfg.contractId,
          method_name: "nft_total_supply",
          args_base64: encodeArgsBase64({}),
        },
      }),
    });

    let characters: number | null = null;
    if (supplyRes.ok) {
      const json = (await supplyRes.json()) as {
        result?: { result?: number[] };
      };
      if (Array.isArray(json.result?.result)) {
        const rawSupply = decodeViewResult<string>(json.result.result);
        const n = Number(rawSupply);
        if (Number.isFinite(n)) characters = n;
      }
    }

    const [treasuryYocto, contractCfg, lb] = await Promise.all([
      views.getTreasury(),
      views.getConfig(),
      views.leaderboard(0, 100),
    ]);

    const totalPlayed = lb.reduce((acc, row) => acc + row.played, 0);

    return NextResponse.json(
      {
        characters,
        matches: Math.floor(totalPlayed / 2),
        treasuryNear: yoctoToNearNumber(treasuryYocto),
        rewardNear: yoctoToNearNumber(contractCfg.reward),
        source: cfg.networkId,
      },
      {
        headers: {
          "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        characters: null,
        matches: null,
        treasuryNear: null,
        rewardNear: 0.1,
        source: "unavailable",
      },
      { status: 200 },
    );
  }
}
