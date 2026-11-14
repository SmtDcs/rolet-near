/**
 * NEAR network, contract, and function-call access key configuration.
 * All public values can be injected for tests without mutating process.env.
 */

export type NearNetworkId = "testnet" | "mainnet" | "localnet";

export interface NearConfig {
  networkId: NearNetworkId;
  contractId: string;
  rpcUrl: string;
}

export type NearEnvInput = {
  NEXT_PUBLIC_NEAR_NETWORK?: string;
  NEXT_PUBLIC_ROLET_CONTRACT?: string;
  NEXT_PUBLIC_NEAR_RPC_URL?: string;
  NEXT_PUBLIC_NEAR_RPC?: string;
};

export const DEFAULT_NEAR_NETWORK: NearNetworkId = "testnet";
export const DEFAULT_NEAR_RPC_URL = "https://rpc.testnet.near.org";

/**
 * Methods allowed on the browser FunctionCall access key (must match contract F2 rules).
 */
export const GAME_METHODS = [
  "join",
  "reveal",
  "cancel",
  "fire",
  "use_item",
  "claim_timeout",
] as const;

export type GameMethod = (typeof GAME_METHODS)[number];

/**
 * Methods that require a full wallet approval (deposit or excluded from FC key).
 */
export const WALLET_ONLY_METHODS = [
  "buy_character",
  "claim_reward",
  "nft_transfer",
] as const;

export type WalletOnlyMethod = (typeof WALLET_ONLY_METHODS)[number];

/**
 * Prepaid gas per FC game action: 20 Tgas (contract MIN_ACTION_GAS is 15 Tgas).
 */
export const ACTION_GAS = BigInt(20_000_000_000_000);

/**
 * FunctionCall access key allowance in yoctoNEAR (matches contracts/rolet-near/init-config.json allowance_hint).
 */
export const FC_ALLOWANCE_YOCTO = "500000000000000000000000";

function normalizeNetwork(raw: string | undefined): NearNetworkId {
  if (raw === "mainnet" || raw === "localnet" || raw === "testnet") {
    return raw;
  }
  return DEFAULT_NEAR_NETWORK;
}

/**
 * Reads NEAR config from explicit env object or Next.js public env vars.
 * Supports both NEXT_PUBLIC_NEAR_RPC_URL and NEXT_PUBLIC_NEAR_RPC.
 */
export function readNearConfig(env?: NearEnvInput): NearConfig {
  const networkRaw = env ? env.NEXT_PUBLIC_NEAR_NETWORK : process.env.NEXT_PUBLIC_NEAR_NETWORK;
  const contractRaw = env ? env.NEXT_PUBLIC_ROLET_CONTRACT : process.env.NEXT_PUBLIC_ROLET_CONTRACT;
  const rpcRaw = env
    ? env.NEXT_PUBLIC_NEAR_RPC_URL ?? env.NEXT_PUBLIC_NEAR_RPC
    : process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? process.env.NEXT_PUBLIC_NEAR_RPC;

  const rpcUrl = (rpcRaw ?? "").trim() || DEFAULT_NEAR_RPC_URL;
  const contractId = (contractRaw ?? "").trim();

  return {
    networkId: normalizeNetwork(networkRaw?.trim()),
    contractId,
    rpcUrl,
  };
}

/**
 * Returns true if the method name is allowed on the browser FC access key.
 */
export function isGameMethod(method: string): method is GameMethod {
  return (GAME_METHODS as readonly string[]).includes(method);
}
