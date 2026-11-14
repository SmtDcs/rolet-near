import assert from "node:assert/strict";
import test from "node:test";
import { buildCspHeader } from "./csp";

test("production CSP disallows third-party scripts and unsafe-eval while allowing NEAR RPC and wallets", () => {
  const csp = buildCspHeader({
    isDev: false,
    rpcUrls: ["https://custom-near-rpc.example/v1", "not-a-url", "javascript:alert(1)"],
  });

  const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "));
  assert.ok(scriptSrc);
  assert.equal(scriptSrc.includes("'unsafe-eval'"), false);
  assert.equal(scriptSrc.includes("https:"), false);
  assert.equal(scriptSrc.includes("http:"), false);
  assert.ok(scriptSrc.includes("'self'"));

  const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src "));
  assert.ok(connectSrc);
  assert.ok(connectSrc.includes("https://rpc.testnet.near.org"));
  assert.ok(connectSrc.includes("https://rpc.mainnet.near.org"));
  assert.ok(connectSrc.includes("https://wallet.meteorwallet.app"));
  assert.ok(connectSrc.includes("https://app.mynearwallet.com"));
  assert.ok(connectSrc.includes("https://custom-near-rpc.example"));
  assert.equal(connectSrc.includes("http://localhost:*"), false);
  assert.equal(connectSrc.includes("ws://localhost:*"), false);
  assert.equal(connectSrc.includes("javascript:"), false);
});

test("dev CSP adds unsafe-eval and localnet/HMR connect-src relaxations only in dev", () => {
  const csp = buildCspHeader({ isDev: true });
  const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "));
  assert.ok(scriptSrc?.includes("'unsafe-eval'"));

  const connectSrc = csp.split("; ").find((d) => d.startsWith("connect-src "));
  assert.ok(connectSrc?.includes("http://127.0.0.1:*"));
  assert.ok(connectSrc?.includes("http://localhost:*"));
  assert.ok(connectSrc?.includes("ws://localhost:*"));
});
