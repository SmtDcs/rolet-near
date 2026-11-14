import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  INITIAL_LOAD_BUDGET_BYTES,
  RIVAL_CLIP_ASSET_MAP,
  STAGE_ASSETS,
  TOTAL_STAGE_BUDGET_BYTES,
  listStageAssets,
  resolveRivalClipAsset,
} from "./assets";

test("F3-10 assets: every manifest entry is procedural or an existing public/ file", () => {
  const publicRoot = resolve(process.cwd(), "public");
  const entries = listStageAssets();
  assert.ok(entries.length >= 25);

  for (const entry of entries) {
    assert.ok(entry.budgetBytes > 0, `${entry.id} budgetBytes must be positive`);
    if (entry.type === "procedural") {
      assert.ok(entry.proceduralId.length > 0, `${entry.id} proceduralId non-empty`);
    } else {
      const rel = entry.src.replace(/^\/+/, "");
      const filePath = resolve(publicRoot, rel);
      assert.ok(existsSync(filePath), `Missing public asset for ${entry.id}: ${filePath}`);
      if (entry.type === "video" && entry.fallbackSrc) {
        const fbPath = resolve(publicRoot, entry.fallbackSrc.replace(/^\/+/, ""));
        assert.ok(existsSync(fbPath), `Missing fallback video for ${entry.id}: ${fbPath}`);
      }
      if (entry.type === "video" && entry.posterSrc) {
        const posterPath = resolve(publicRoot, entry.posterSrc.replace(/^\/+/, ""));
        assert.ok(existsSync(posterPath), `Missing poster for ${entry.id}: ${posterPath}`);
      }
    }
  }
});

test("F3-10 assets: initial & total declared budgets fit §3 limits and character fallback works", () => {
  const initialTotal = listStageAssets()
    .filter((a) => a.preloadTier === "initial")
    .reduce((sum, a) => sum + a.budgetBytes, 0);
  const overallTotal = listStageAssets().reduce((sum, a) => sum + a.budgetBytes, 0);

  assert.ok(initialTotal <= INITIAL_LOAD_BUDGET_BYTES, `initial ${initialTotal} <= 8MB`);
  assert.ok(overallTotal <= TOTAL_STAGE_BUDGET_BYTES, `total ${overallTotal} <= 20MB`);

  // Every RivalClipId maps to a valid asset entry, and Ayarci/Kacak fall back safely in P0.
  for (const [clipId, assetId] of Object.entries(RIVAL_CLIP_ASSET_MAP)) {
    assert.ok(STAGE_ASSETS[assetId], `Missing STAGE_ASSETS[${assetId}]`);
    const resolved = resolveRivalClipAsset(clipId as keyof typeof RIVAL_CLIP_ASSET_MAP, "Ayarci");
    assert.equal(resolved.id, assetId);
  }
});
