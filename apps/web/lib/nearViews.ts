import { base64ToBytes, bytesToBase64 } from "./nearCommit";
import type { ActionsPage, MatchView } from "./nearTypes";

export type CharacterKind = "Kuleci" | "Ayarci" | "Kacak";

export interface RoundConfigView {
  start_hp: number;
  items_per_load: number;
  heal_cut_at: number | null;
}

export interface ContractConfigView {
  rounds: RoundConfigView[];
  turn_ms: number;
  reveal_ms: number;
  reward: string;
  price: string;
  ops_bps: number;
  durability: number;
  allowance_hint: string;
  tincture_good_pct: number;
  max_items: number;
  min_treasury: string;
  load_size: number;
  min_live: number;
  max_live: number;
  copies_per_item: number;
}

export interface PlayerStateView {
  active_match: number | string | null;
  wins: number;
  losses: number;
  played: number;
  owed: string;
}

export interface CharacterStateView {
  kind: CharacterKind;
  durability: number;
  locked_in: number | null;
}

export interface NftTokenMetadataView {
  title?: string | null;
  description?: string | null;
  media?: string | null;
  extra?: string | null;
}

export interface NftTokenView {
  token_id: string;
  owner_id: string;
  metadata?: NftTokenMetadataView | null;
}

export interface LeaderboardEntryView {
  account_id: string;
  wins: number;
  losses: number;
  played: number;
}

export interface ViewCallParams {
  contractId: string;
  methodName: string;
  argsBase64: string;
}

export type ViewRpcFn = (params: ViewCallParams) => Promise<Uint8Array | number[]>;

export interface NearViewClientOptions {
  contractId: string;
  rpcUrl?: string;
  viewCall?: ViewRpcFn;
  fetchFn?: typeof fetch;
}

export interface NearViewClient {
  getMatch(matchId: string, players?: [string, string]): Promise<MatchView | null>;
  getActions(
    matchId: string,
    sinceSeq: number,
    players?: [string, string],
  ): Promise<ActionsPage>;
  getPlayer(accountId: string): Promise<PlayerStateView>;
  getCharacter(tokenId: string): Promise<CharacterStateView | null>;
  nftTokensForOwner(
    accountId: string,
    fromIndex?: string,
    limit?: number,
  ): Promise<NftTokenView[]>;
  getConfig(): Promise<ContractConfigView>;
  getTreasury(): Promise<string>;
  leaderboard(from?: number, limit?: number): Promise<LeaderboardEntryView[]>;
}

/**
 * Encodes JSON arguments as base64 for NEAR JSON-RPC `call_function`.
 */
export function encodeArgsBase64(args: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  return bytesToBase64(bytes);
}

/**
 * Decodes base64 JSON arguments back to a plain object (useful in tests and diagnostics).
 */
export function decodeArgsBase64<T = unknown>(argsBase64: string): T {
  const bytes = base64ToBytes(argsBase64);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/**
 * Decodes raw NEAR JSON-RPC `call_function` byte array result into JSON.
 */
export function decodeViewResult<T>(bytes: Uint8Array | number[]): T {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  const text = new TextDecoder().decode(arr);
  return JSON.parse(text) as T;
}

/**
 * Creates a default HTTP JSON-RPC `call_function` caller targeting `rpcUrl`.
 */
export function createJsonRpcViewFn(
  rpcUrl: string,
  fetchFn: typeof fetch = globalThis.fetch,
): ViewRpcFn {
  return async ({ contractId, methodName, argsBase64 }: ViewCallParams) => {
    const res = await fetchFn(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `view:${methodName}`,
        method: "query",
        params: {
          request_type: "call_function",
          finality: "optimistic",
          account_id: contractId,
          method_name: methodName,
          args_base64: argsBase64,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`NEAR RPC HTTP ${res.status} calling ${methodName}`);
    }

    const payload = (await res.json()) as {
      result?: { result?: number[] };
      error?: { message?: string; data?: unknown };
    };

    if (payload.error) {
      throw new Error(
        payload.error.message ?? `NEAR RPC error calling ${methodName}`,
      );
    }

    const raw = payload.result?.result;
    if (!Array.isArray(raw)) {
      throw new Error(`Malformed NEAR RPC call_function result for ${methodName}`);
    }
    return raw;
  };
}

/**
 * Pure read-only NEAR contract view client with injected RPC transport.
 */
export function createNearViewClient(opts: NearViewClientOptions): NearViewClient {
  const rpcUrl = opts.rpcUrl ?? "";
  const callView: ViewRpcFn =
    opts.viewCall ?? createJsonRpcViewFn(rpcUrl, opts.fetchFn);

  async function query<T>(
    methodName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    if (!opts.contractId) {
      throw new Error("Contract ID is not configured");
    }
    const raw = await callView({
      contractId: opts.contractId,
      methodName,
      argsBase64: encodeArgsBase64(args),
    });
    return decodeViewResult<T>(raw);
  }

  return {
    getMatch(matchId: string, players?: [string, string]) {
      return query<MatchView | null>("get_match", {
        match_id: matchId,
        players: players ?? null,
      });
    },

    getActions(matchId: string, sinceSeq: number, players?: [string, string]) {
      return query<ActionsPage>("get_actions", {
        match_id: matchId,
        since_seq: sinceSeq,
        players: players ?? null,
      });
    },

    getPlayer(accountId: string) {
      return query<PlayerStateView>("get_player", { account_id: accountId });
    },

    getCharacter(tokenId: string) {
      return query<CharacterStateView | null>("get_character", {
        token_id: tokenId,
      });
    },

    nftTokensForOwner(accountId: string, fromIndex?: string, limit = 50) {
      return query<NftTokenView[]>("nft_tokens_for_owner", {
        account_id: accountId,
        from_index: fromIndex ?? null,
        limit,
      });
    },

    getConfig() {
      return query<ContractConfigView>("get_config", {});
    },

    getTreasury() {
      return query<string>("get_treasury", {});
    },

    leaderboard(from?: number, limit = 50) {
      return query<LeaderboardEntryView[]>("leaderboard", {
        from: from ?? null,
        limit,
      });
    },
  };
}
