"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { PublicKey } from "@near-js/crypto";
import { actionCreators } from "@near-wallet-selector/core";
import { useNearWallet } from "@/components/NearProvider";
import {
  createGameCaller,
  type GameCallResult,
  type GameCaller,
} from "@/lib/nearCall";
import {
  bytesToBase64,
  clearSecret,
  commitment,
  generateSecret,
  loadSecret,
  saveSecret,
} from "@/lib/nearCommit";
import {
  FC_ALLOWANCE_YOCTO,
  GAME_METHODS,
  type GameMethod,
} from "@/lib/nearConfig";
import {
  generateKeyPair,
  loadKey,
  saveKey,
  type StoredKeyRecord,
} from "@/lib/nearKey";
import { checkKeyOnChain, decideKeyAction } from "@/lib/nearKeyFlow";
import { classifyError, parseOutcome } from "@/lib/nearOutcome";
import type { Target } from "@/lib/nearTypes";
import {
  createNearViewClient,
  type CharacterKind,
  type CharacterStateView,
  type ContractConfigView,
  type LeaderboardEntryView,
  type NftTokenView,
  type PlayerStateView,
} from "@/lib/nearViews";

export interface OwnedCharacter extends NftTokenView {
  state: CharacterStateView | null;
}

const WALLET_TX_GAS = BigInt("50000000000000");

export function useRoletNear() {
  const { selector, accountId, walletId, connected, config, connect } =
    useNearWallet();
  const [busy, setBusy] = useState(false);

  const views = useMemo(
    () =>
      createNearViewClient({
        contractId: config.contractId,
        rpcUrl: config.rpcUrl,
      }),
    [config.contractId, config.rpcUrl],
  );

  const callerCacheRef = useRef<{
    cacheKey: string;
    caller: GameCaller;
  } | null>(null);

  const ensureGameKey = useCallback(async (): Promise<StoredKeyRecord> => {
    if (!selector || !accountId || !config.contractId) {
      throw new Error("NEAR wallet and contract must be connected");
    }
    if (typeof window === "undefined") {
      throw new Error("Game keys require a browser environment");
    }

    const stored = loadKey(window.localStorage, accountId, config.contractId);
    const onChain = stored
      ? await checkKeyOnChain(
          config.rpcUrl,
          accountId,
          stored.publicKey,
          config.contractId,
        )
      : "missing";

    const action = decideKeyAction({
      stored,
      onChain,
      walletSupportsFcKey: walletId === "my-near-wallet",
    });

    if (action === "use" && stored) {
      return stored;
    }

    const kp = generateKeyPair();
    const wallet = await selector.wallet();
    await wallet.signAndSendTransaction({
      signerId: accountId,
      receiverId: accountId,
      actions: [
        actionCreators.addKey(
          PublicKey.fromString(kp.publicKey),
          actionCreators.functionCallAccessKey(
            config.contractId,
            [...GAME_METHODS],
            BigInt(FC_ALLOWANCE_YOCTO),
          ),
        ),
      ],
    });

    const record: StoredKeyRecord = {
      secretKey: kp.secretKey,
      publicKey: kp.publicKey,
      createdAt: Date.now(),
      allowanceYocto: FC_ALLOWANCE_YOCTO,
    };
    saveKey(window.localStorage, accountId, config.contractId, record);
    callerCacheRef.current = null;
    return record;
  }, [accountId, config.contractId, config.rpcUrl, selector, walletId]);

  const getCaller = useCallback(async (): Promise<GameCaller> => {
    const rec = await ensureGameKey();
    const cacheKey = `${accountId}:${config.contractId}:${rec.publicKey}`;
    if (callerCacheRef.current?.cacheKey === cacheKey) {
      return callerCacheRef.current.caller;
    }
    const caller = createGameCaller({
      accountId: accountId!,
      contractId: config.contractId,
      keyPair: rec,
      rpcUrl: config.rpcUrl,
    });
    callerCacheRef.current = { cacheKey, caller };
    return caller;
  }, [accountId, config.contractId, config.rpcUrl, ensureGameKey]);

  const sendGameCall = useCallback(
    async (
      method: GameMethod,
      args: Record<string, unknown> = {},
    ): Promise<GameCallResult> => {
      try {
        const caller = await getCaller();
        return await caller.sendGameCall(method, args);
      } catch (err) {
        const kind = classifyError(err);
        if (
          (kind === "allowance" || kind === "missingKey") &&
          selector &&
          accountId &&
          config.contractId &&
          typeof window !== "undefined"
        ) {
          const kp = generateKeyPair();
          const wallet = await selector.wallet();
          await wallet.signAndSendTransaction({
            signerId: accountId,
            receiverId: accountId,
            actions: [
              actionCreators.addKey(
                PublicKey.fromString(kp.publicKey),
                actionCreators.functionCallAccessKey(
                  config.contractId,
                  [...GAME_METHODS],
                  BigInt(FC_ALLOWANCE_YOCTO),
                ),
              ),
            ],
          });
          const rotated: StoredKeyRecord = {
            secretKey: kp.secretKey,
            publicKey: kp.publicKey,
            createdAt: Date.now(),
            allowanceYocto: FC_ALLOWANCE_YOCTO,
          };
          saveKey(window.localStorage, accountId, config.contractId, rotated);
          callerCacheRef.current = null;
          const retryCaller = createGameCaller({
            accountId,
            contractId: config.contractId,
            keyPair: rotated,
            rpcUrl: config.rpcUrl,
          });
          return retryCaller.sendGameCall(method, args);
        }
        throw err;
      }
    },
    [accountId, config.contractId, config.rpcUrl, getCaller, selector],
  );

  /**
   * Wallet-approved call: purchases a character NFT (CLIENT-CONTRACT (a)).
   */
  const buyCharacter = useCallback(
    async (kind: CharacterKind, priceYocto?: string): Promise<string | null> => {
      if (!selector || !accountId || !config.contractId) {
        throw new Error("Connect a NEAR wallet first");
      }
      setBusy(true);
      try {
        const price = priceYocto ?? (await views.getConfig()).price;
        const wallet = await selector.wallet();
        const outcome = await wallet.signAndSendTransaction({
          signerId: accountId,
          receiverId: config.contractId,
          actions: [
            actionCreators.functionCall(
              "buy_character",
              { kind },
              WALLET_TX_GAS,
              BigInt(price),
            ),
          ],
        });
        if (!outcome) return null;
        const parsed = parseOutcome(outcome);
        return typeof parsed.returnValue === "string" ? parsed.returnValue : null;
      } finally {
        setBusy(false);
      }
    },
    [accountId, config.contractId, selector, views],
  );

  /**
   * Wallet-approved call: claims owed reward balance (CLIENT-CONTRACT (a)).
   */
  const claimReward = useCallback(async (): Promise<string | null> => {
    if (!selector || !accountId || !config.contractId) {
      throw new Error("Connect a NEAR wallet first");
    }
    setBusy(true);
    try {
      const wallet = await selector.wallet();
      const outcome = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: config.contractId,
        actions: [
          actionCreators.functionCall(
            "claim_reward",
            {},
            WALLET_TX_GAS,
            BigInt(0),
          ),
        ],
      });
      if (!outcome) return null;
      const parsed = parseOutcome(outcome);
      return typeof parsed.returnValue === "string" ? parsed.returnValue : null;
    } finally {
      setBusy(false);
    }
  }, [accountId, config.contractId, selector]);

  const getOwnedCharacters = useCallback(
    async (ownerId?: string): Promise<OwnedCharacter[]> => {
      const target = ownerId ?? accountId;
      if (!target || !config.contractId) return [];
      const tokens = await views.nftTokensForOwner(target);
      const states = await Promise.all(
        tokens.map((t) => views.getCharacter(t.token_id).catch(() => null)),
      );
      return tokens.map((tok, i) => ({
        ...tok,
        state: states[i] ?? null,
      }));
    },
    [accountId, config.contractId, views],
  );

  const joinMatch = useCallback(
    async (
      matchId: string,
      opponent: string,
      tokenId: string,
    ): Promise<GameCallResult> => {
      if (!accountId || !config.contractId || typeof window === "undefined") {
        throw new Error("NEAR wallet and browser storage required");
      }
      let secret = loadSecret(
        window.sessionStorage,
        accountId,
        config.contractId,
        matchId,
      );
      if (!secret) {
        secret = generateSecret();
        saveSecret(
          window.sessionStorage,
          accountId,
          config.contractId,
          matchId,
          secret,
        );
      }
      const commitBytes = commitment(secret, accountId, matchId);
      return sendGameCall("join", {
        match_id: matchId,
        opponent,
        commit: bytesToBase64(commitBytes),
        token_id: tokenId,
      });
    },
    [accountId, config.contractId, sendGameCall],
  );

  const revealMatch = useCallback(
    async (matchId: string): Promise<GameCallResult> => {
      if (!accountId || !config.contractId || typeof window === "undefined") {
        throw new Error("NEAR wallet and browser storage required");
      }
      const secret = loadSecret(
        window.sessionStorage,
        accountId,
        config.contractId,
        matchId,
      );
      if (!secret) {
        throw new Error("Commit secret not found for this match");
      }
      const res = await sendGameCall("reveal", {
        match_id: matchId,
        secret: bytesToBase64(secret),
      });
      clearSecret(window.sessionStorage, accountId, config.contractId, matchId);
      return res;
    },
    [accountId, config.contractId, sendGameCall],
  );

  const cancelMatch = useCallback(
    async (matchId: string): Promise<GameCallResult> => {
      const res = await sendGameCall("cancel", { match_id: matchId });
      if (accountId && config.contractId && typeof window !== "undefined") {
        clearSecret(window.sessionStorage, accountId, config.contractId, matchId);
      }
      return res;
    },
    [accountId, config.contractId, sendGameCall],
  );

  const fire = useCallback(
    (matchId: string, target: Target) =>
      sendGameCall("fire", { match_id: matchId, target }),
    [sendGameCall],
  );

  const useItem = useCallback(
    (matchId: string, slot: number, stealSlot?: number) =>
      sendGameCall("use_item", {
        match_id: matchId,
        slot,
        steal_slot: stealSlot ?? null,
      }),
    [sendGameCall],
  );

  const claimTimeout = useCallback(
    (matchId: string) => sendGameCall("claim_timeout", { match_id: matchId }),
    [sendGameCall],
  );

  return {
    accountId,
    connected,
    busy,
    config,
    connect,
    views,
    getMatch: views.getMatch,
    getActions: views.getActions,
    getPlayer: views.getPlayer,
    getCharacter: views.getCharacter,
    getConfig: views.getConfig,
    getTreasury: views.getTreasury,
    leaderboard: views.leaderboard,
    getOwnedCharacters,
    ensureGameKey,
    sendGameCall,
    buyCharacter,
    claimReward,
    joinMatch,
    revealMatch,
    cancelMatch,
    fire,
    useItem,
    claimTimeout,
  };
}

export type {
  CharacterKind,
  CharacterStateView,
  ContractConfigView,
  LeaderboardEntryView,
  PlayerStateView,
};
