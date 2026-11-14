import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { classifyError, parseOutcome, type OutcomeLike } from "./nearOutcome";
import { isAction } from "./nearTypes";

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, "__fixtures__/outcomes", name), "utf8"));
}

test("parseOutcome parses successful fire outcome and skips non-rolet standards", () => {
  const fixture = loadFixture("fire-success.json") as OutcomeLike;
  const parsed = parseOutcome(fixture);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.failure, undefined);
  assert.ok(Array.isArray(parsed.returnValue));
  assert.ok((parsed.returnValue as unknown[]).length >= 1);
  for (const item of parsed.returnValue as unknown[]) {
    assert.equal(isAction(item), true);
  }
  assert.equal(parsed.events.length, (parsed.returnValue as unknown[]).length);
  assert.ok(parsed.events.every(isAction));

  const withForeignStandard = parseOutcome({
    status: { SuccessValue: "" },
    receipts_outcome: [
      {
        outcome: {
          logs: [
            'EVENT_JSON:{"standard":"nep171","version":"1.0.0","event":"nft_transfer","data":[{"old_owner_id":"a","new_owner_id":"b","token_ids":["1"]}]}',
            'EVENT_JSON:{"standard":"rolet","version":"1.0.0","event":"ejected","data":[{"kind":"Ejected","shell":"Blank"}]}',
          ],
        },
      },
    ],
  });
  assert.equal(withForeignStandard.events.length, 1);
  assert.equal(withForeignStandard.events[0].kind, "Ejected");
});

test("parseOutcome parses panic outcome as failure and classifyError returns contractPanic", () => {
  const fixture = loadFixture("panic-insufficient-gas.json") as OutcomeLike;
  const parsed = parseOutcome(fixture);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.failure);
  assert.equal(classifyError(parsed.failure), "contractPanic");
  assert.equal(classifyError(fixture), "contractPanic");
});

test("classifyError classifies allowance, nonce, rateLimit, missingKey, methodDenied, network", () => {
  assert.equal(classifyError(loadFixture("allowance-error.json")), "allowance");
  assert.equal(classifyError(loadFixture("invalid-nonce.json")), "nonce");
  assert.equal(classifyError(loadFixture("http-429.json")), "rateLimit");
  assert.equal(classifyError(new Error("fetch failed: ECONNREFUSED")), "network");
  assert.equal(classifyError({ InvalidAccessKeyError: { MethodNameMismatch: {} } }), "methodDenied");
  assert.equal(classifyError({ InvalidAccessKeyError: "AccessKeyNotFound" }), "missingKey");
  assert.equal(classifyError(new Error("something unexpected")), "other");
});
