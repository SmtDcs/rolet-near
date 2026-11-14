import assert from "node:assert/strict";
import test from "node:test";

import { preloadStage } from "./preload";

test("F3-14 preloadStage: handles procedural placeholder manifest with zero failed loads", async () => {
  const calls: string[] = [];
  const report = await preloadStage({
    tier: "all",
    preloadGlb: async (src) => {
      calls.push(`glb:${src}`);
    },
    preloadImage: async (src) => {
      calls.push(`img:${src}`);
    },
    preloadVideo: async (src) => {
      calls.push(`vid:${src}`);
    },
  });

  assert.ok(report.total >= 25);
  assert.equal(report.failed, 0);
  assert.equal(report.procedural + report.preloaded, report.total);
  assert.equal(calls.length, report.preloaded);
});

test("F3-14 preloadStage: initial tier filters only initial preload entries", async () => {
  const initialReport = await preloadStage({ tier: "initial" });
  const fullReport = await preloadStage({ tier: "all" });
  assert.ok(initialReport.total > 0);
  assert.ok(initialReport.total < fullReport.total);
  assert.equal(initialReport.failed, 0);
});
