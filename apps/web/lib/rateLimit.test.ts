import assert from "node:assert/strict";
import test from "node:test";
import { rateLimitedError, rateLimitPlan } from "./rateLimit";

test("rateLimitedError recognizes HTTP 429 and rate-limit phrasing", () => {
  assert.equal(rateLimitedError("HTTP 429 Too Many Requests"), true);
  assert.equal(rateLimitedError("429 from upstream"), true);
  assert.equal(rateLimitedError("execution failed"), false);
});

test("rateLimitPlan counts inside a fixed window and resets after expiry", () => {
  const win = 60_000;
  let state = { hits: 0, windowStart: 1_000 };

  const first = rateLimitPlan({
    ...state,
    now: 1_000,
    limit: 2,
    windowMs: win,
  });
  assert.equal(first.allow, true);
  assert.equal(first.hits, 1);

  state = { hits: first.hits, windowStart: first.windowStart };
  const second = rateLimitPlan({
    ...state,
    now: 2_000,
    limit: 2,
    windowMs: win,
  });
  assert.equal(second.allow, true);
  assert.equal(second.hits, 2);

  state = { hits: second.hits, windowStart: second.windowStart };
  const blocked = rateLimitPlan({
    ...state,
    now: 3_000,
    limit: 2,
    windowMs: win,
  });
  assert.equal(blocked.allow, false);
  assert.equal(blocked.hits, 2);

  const reset = rateLimitPlan({
    ...state,
    now: 1_000 + win,
    limit: 2,
    windowMs: win,
  });
  assert.equal(reset.allow, true);
  assert.equal(reset.hits, 1);
  assert.equal(reset.windowStart, 1_000 + win);
});
