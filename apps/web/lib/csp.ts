/**
 * Content-Security-Policy builder for Next.js response headers (FIX-F2C-3).
 * Blocks all third-party scripts while allowing NEAR RPC and wallet-selector endpoints.
 */

const NEAR_CONNECT_ORIGINS = [
  "https://rpc.testnet.near.org",
  "https://rpc.mainnet.near.org",
  "https://archival-rpc.testnet.near.org",
  "https://archival-rpc.mainnet.near.org",
  "https://rpc.fastnear.com",
  "https://test.rpc.fastnear.com",
  "https://mw.rpc.fastnear.com",
  "https://helper.testnet.near.org",
  "https://helper.mainnet.near.org",
  "https://testnet-api.kitwallet.app",
  "https://api.kitwallet.app",
  "https://app.mynearwallet.com",
  "https://testnet.mynearwallet.com",
  "https://wallet.meteorwallet.app",
  "https://dev.wallet.meteorwallet.app",
] as const;

const WALLET_ORIGINS = [
  "https://app.mynearwallet.com",
  "https://testnet.mynearwallet.com",
  "https://wallet.meteorwallet.app",
  "https://dev.wallet.meteorwallet.app",
] as const;

const DEV_CONNECT_SOURCES = [
  "http://127.0.0.1:*",
  "http://localhost:*",
  "ws://127.0.0.1:*",
  "ws://localhost:*",
] as const;

export interface CspOptions {
  isDev: boolean;
  rpcUrls?: Array<string | undefined>;
}

function toOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function buildCspHeader(options: CspOptions): string {
  const scriptSrc = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
  if (options.isDev) {
    scriptSrc.push("'unsafe-eval'");
  }

  const connectSet = new Set<string>(["'self'", "blob:", ...NEAR_CONNECT_ORIGINS]);
  for (const url of options.rpcUrls ?? []) {
    const origin = toOrigin(url);
    if (origin) connectSet.add(origin);
  }
  if (options.isDev) {
    for (const src of DEV_CONNECT_SOURCES) {
      connectSet.add(src);
    }
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src ${Array.from(connectSet).join(" ")}`,
    `frame-src 'self' ${WALLET_ORIGINS.join(" ")}`,
    `form-action 'self' ${WALLET_ORIGINS.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ];

  return directives.join("; ");
}
