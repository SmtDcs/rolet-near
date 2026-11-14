import assert from "node:assert/strict";
import test from "node:test";

import { parseIntent } from "./protocol";

test("F3-5 protocol: parseIntent validates fire and item intents and rejects invalid payloads", () => {
  const validCases: Array<[unknown, ReturnType<typeof parseIntent>]> = [
    [
      { id: "i-1", kind: "fire", target: "Opponent" },
      { id: "i-1", kind: "fire", target: "Opponent" },
    ],
    [
      { id: "i-2", kind: "fire", target: "SelfTarget" },
      { id: "i-2", kind: "fire", target: "SelfTarget" },
    ],
    [
      { id: "i-3", kind: "item", slot: 0 },
      { id: "i-3", kind: "item", slot: 0 },
    ],
    [
      { id: "i-4", kind: "item", slot: 3, stealSlot: 2 },
      { id: "i-4", kind: "item", slot: 3, stealSlot: 2 },
    ],
  ];

  for (const [input, expected] of validCases) {
    assert.deepEqual(parseIntent(input), expected);
  }

  const invalidCases: unknown[] = [
    null,
    undefined,
    42,
    "fire",
    [],
    {},
    { kind: "fire", target: "Opponent" },
    { id: "", kind: "fire", target: "Opponent" },
    { id: "   ", kind: "fire", target: "Opponent" },
    { id: 123, kind: "fire", target: "Opponent" },
    { id: "x1", kind: "unknown", target: "Opponent" },
    { id: "x2", kind: "fire" },
    { id: "x3", kind: "fire", target: "Self" },
    { id: "x4", kind: "fire", target: null },
    { id: "x5", kind: "item" },
    { id: "x6", kind: "item", slot: -1 },
    { id: "x7", kind: "item", slot: 4 },
    { id: "x8", kind: "item", slot: 1.5 },
    { id: "x9", kind: "item", slot: Number.NaN },
    { id: "x10", kind: "item", slot: "0" },
    { id: "x11", kind: "item", slot: 0, stealSlot: -1 },
    { id: "x12", kind: "item", slot: 0, stealSlot: 4 },
    { id: "x13", kind: "item", slot: 0, stealSlot: 0.5 },
    { id: "x14", kind: "item", slot: 0, stealSlot: null },
    { id: "x15", kind: "item", slot: 0, stealSlot: "1" },
  ];

  for (const input of invalidCases) {
    assert.equal(parseIntent(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});
