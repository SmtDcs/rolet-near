import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  ACTION_GAS,
  DEFAULT_NEAR_NETWORK,
  DEFAULT_NEAR_RPC_URL,
  FC_ALLOWANCE_YOCTO,
  GAME_METHODS,
  WALLET_ONLY_METHODS,
  isGameMethod,
  readNearConfig,
} from "./nearConfig";

test("GAME_METHODS matches the exact 6 FC key methods in order", () => {
  assert.deepEqual(GAME_METHODS, [
    "join",
    "reveal",
    "cancel",
    "fire",
    "use_item",
    "claim_timeout",
  ]);
  for (const m of WALLET_ONLY_METHODS) {
    assert.equal(isGameMethod(m), false);
  }
  assert.equal(isGameMethod("fire"), true);
});

test("FC_ALLOWANCE_YOCTO matches contracts/rolet-near/init-config.json allowance_hint", () => {
  const configPath = resolve(__dirname, "../../../contracts/rolet-near/init-config.json");
  const initConfig = JSON.parse(readFileSync(configPath, "utf8")) as {
    allowance_hint: string;
  };
  assert.equal(FC_ALLOWANCE_YOCTO, initConfig.allowance_hint);
});

test("ACTION_GAS is within [15 Tgas, 20 Tgas]", () => {
  const gasNum = Number(ACTION_GAS);
  assert.ok(gasNum >= 15e12 && gasNum <= 20e12, `unexpected gas: ${ACTION_GAS}`);
});

test("readNearConfig uses defaults and accepts injected env values", () => {
  const defaults = readNearConfig({});
  assert.deepEqual(defaults, {
    networkId: DEFAULT_NEAR_NETWORK,
    contractId: "",
    rpcUrl: DEFAULT_NEAR_RPC_URL,
  });

  const customUrl = readNearConfig({
    NEXT_PUBLIC_NEAR_NETWORK: "mainnet",
    NEXT_PUBLIC_ROLET_CONTRACT: "rolet.near",
    NEXT_PUBLIC_NEAR_RPC_URL: "https://rpc.mainnet.near.org",
  });
  assert.deepEqual(customUrl, {
    networkId: "mainnet",
    contractId: "rolet.near",
    rpcUrl: "https://rpc.mainnet.near.org",
  });

  const fallbackRpc = readNearConfig({
    NEXT_PUBLIC_NEAR_RPC: "https://fastnear.example",
  });
  assert.equal(fallbackRpc.rpcUrl, "https://fastnear.example");
});
