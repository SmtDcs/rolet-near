/** Detects upstream HTTP 429 / rate-limit responses for backoff retries. */
export function rateLimitedError(message: string): boolean {
  return /too many requests/i.test(message) || message.includes("429");
}

/**
 * Fixed-window rate limiter for `/api/rpc`.
 */
export function rateLimitPlan(input: {
  hits: number;
  windowStart: number;
  now: number;
  limit: number;
  windowMs: number;
}): { allow: boolean; hits: number; windowStart: number } {
  const expired = input.now - input.windowStart >= input.windowMs;
  const hits = expired ? 0 : input.hits;
  const windowStart = expired ? input.now : input.windowStart;
  if (hits >= input.limit) return { allow: false, hits, windowStart };
  return { allow: true, hits: hits + 1, windowStart };
}
