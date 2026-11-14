import assert from "node:assert/strict";
import test from "node:test";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";
import { claimable, TIMEOUT_GRACE_MS } from "../lib/game/clock";
import { fromSnapshot } from "../lib/game/model";
import { ContractPanicError, createGameCaller } from "../lib/nearCall";
import { bytesToBase64, commitment, generateSecret } from "../lib/nearCommit";
import { FC_ALLOWANCE_YOCTO, GAME_METHODS } from "../lib/nearConfig";
import { generateKeyPair } from "../lib/nearKey";
import { createNearViewClient } from "../lib/nearViews";
import { deployRoletContract, startSandbox } from "./sandboxHelper";

async function getChainNowMs(
  provider: { block: (q: { finality: "final" }) => Promise<{ header: { timestamp_nanosec: string | number } }> },
): Promise<number> {
  const blk = await provider.block({ finality: "final" });
  return Number(BigInt(blk.header.timestamp_nanosec) / BigInt(1_000_000));
}

test(
  "F3-20 timeout: claim_timeout rejects before deadline and succeeds after deadline + grace",
  { timeout: 90_000 },
  async (t) => {
    const sb = await startSandbox();
    if (!sb) {
      t.skip("near-sandbox binary or rolet_near.wasm not found");
      return;
    }

    try {
      const { contractId } = await deployRoletContract(sb, "timeout-rolet", {
        turn_ms: 15_000,
        reveal_ms: 15_000,
      });

      const aliceFull = KeyPair.fromRandom("ed25519");
      const bobFull = KeyPair.fromRandom("ed25519");
      const aliceId = `alice-to.${sb.rootAccountId}`;
      const bobId = `bob-to.${sb.rootAccountId}`;

      await sb.rootAccount.createAccount(
        aliceId,
        aliceFull.getPublicKey(),
        BigInt("20000000000000000000000000"),
      );
      await sb.rootAccount.createAccount(
        bobId,
        bobFull.getPublicKey(),
        BigInt("20000000000000000000000000"),
      );

      const aliceAcc = new Account(aliceId, sb.provider, new KeyPairSigner(aliceFull));
      const bobAcc = new Account(bobId, sb.provider, new KeyPairSigner(bobFull));
      const views = createNearViewClient({ contractId, rpcUrl: sb.rpcUrl });
      const cfg = await views.getConfig();
      const price = BigInt(cfg.price);

      const aliceToken = await aliceAcc.callFunction<string>({
        contractId,
        methodName: "buy_character",
        args: { kind: "Kuleci" },
        deposit: price,
        gas: BigInt("50000000000000"),
      });
      const bobToken = await bobAcc.callFunction<string>({
        contractId,
        methodName: "buy_character",
        args: { kind: "Ayarci" },
        deposit: price,
        gas: BigInt("50000000000000"),
      });

      const aliceFc = generateKeyPair();
      const bobFc = generateKeyPair();
      await aliceAcc.addFunctionCallAccessKey({
        publicKey: aliceFc.publicKey,
        contractId,
        methodNames: [...GAME_METHODS],
        allowance: BigInt(FC_ALLOWANCE_YOCTO),
      });
      await bobAcc.addFunctionCallAccessKey({
        publicKey: bobFc.publicKey,
        contractId,
        methodNames: [...GAME_METHODS],
        allowance: BigInt(FC_ALLOWANCE_YOCTO),
      });

      const callers = [
        createGameCaller({
          accountId: aliceId,
          contractId,
          keyPair: aliceFc,
          rpcUrl: sb.rpcUrl,
        }),
        createGameCaller({
          accountId: bobId,
          contractId,
          keyPair: bobFc,
          rpcUrl: sb.rpcUrl,
        }),
      ] as const;

      const matchId = "1";
      const aliceSecret = generateSecret();
      const bobSecret = generateSecret();

      await callers[0].sendGameCall("join", {
        match_id: matchId,
        opponent: bobId,
        commit: bytesToBase64(commitment(aliceSecret, aliceId, matchId)),
        token_id: aliceToken,
      });
      await callers[1].sendGameCall("join", {
        match_id: matchId,
        opponent: aliceId,
        commit: bytesToBase64(commitment(bobSecret, bobId, matchId)),
        token_id: bobToken,
      });
      await callers[0].sendGameCall("reveal", {
        match_id: matchId,
        secret: bytesToBase64(aliceSecret),
      });
      await callers[1].sendGameCall("reveal", {
        match_id: matchId,
        secret: bytesToBase64(bobSecret),
      });

      const match = await views.getMatch(matchId, [aliceId, bobId]);
      assert.ok(match);
      assert.equal(match.status, "Active");

      const turnSeat = match.game.turn as 0 | 1;
      const waitingSeat = (1 - turnSeat) as 0 | 1;
      const turnCaller = callers[turnSeat];
      const waitingCaller = callers[waitingSeat];

      // Before deadline: waiting player cannot claim yet, and turn player can never claim
      await assert.rejects(
        () => waitingCaller.sendGameCall("claim_timeout", { match_id: matchId }),
        (err: unknown) => err instanceof ContractPanicError,
      );
      await assert.rejects(
        () => turnCaller.sendGameCall("claim_timeout", { match_id: matchId }),
        (err: unknown) => err instanceof ContractPanicError,
      );

      // Advance wall clock until sandbox final block timestamp passes deadline + grace
      const targetMs = match.deadline_ms + TIMEOUT_GRACE_MS + 1_000;
      let chainNow = await getChainNowMs(
        sb.provider as unknown as {
          block: (q: { finality: "final" }) => Promise<{ header: { timestamp_nanosec: string | number } }>;
        },
      );
      const waitUntil = Date.now() + 35_000;
      while (chainNow < targetMs && Date.now() < waitUntil) {
        await new Promise((r) => setTimeout(r, 1_000));
        chainNow = await getChainNowMs(
          sb.provider as unknown as {
            block: (q: { finality: "final" }) => Promise<{ header: { timestamp_nanosec: string | number } }>;
          },
        );
      }

      assert.ok(
        chainNow >= match.deadline_ms + TIMEOUT_GRACE_MS,
        `sandbox clock (${chainNow}) did not pass deadline + grace (${match.deadline_ms + TIMEOUT_GRACE_MS})`,
      );

      const waitingModel = fromSnapshot(match, waitingSeat);
      assert.equal(
        claimable(waitingModel, waitingSeat, match.deadline_ms, chainNow),
        true,
      );

      const outcome = await waitingCaller.sendGameCall("claim_timeout", {
        match_id: matchId,
      });
      assert.ok(
        outcome.events.some(
          (e) => e.kind === "TimeoutClaimed" && e.by === waitingSeat,
        ),
      );
      assert.ok(
        outcome.events.some(
          (e) => e.kind === "MatchEnded" && e.winner === waitingSeat,
        ),
      );

      const after = await views.getMatch(matchId, [aliceId, bobId]);
      assert.equal(after?.status, "Finished");
      assert.equal(after?.winner, waitingSeat);
    } finally {
      sb.stop();
    }
  },
);
