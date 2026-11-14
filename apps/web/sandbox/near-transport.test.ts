import assert from "node:assert/strict";
import test from "node:test";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";
import type { GameModel } from "../lib/game/model";
import { chooseBotIntent } from "../lib/game/bot";
import { NearTransport } from "../lib/game/nearTransport";
import { createGameCaller } from "../lib/nearCall";
import { bytesToBase64, commitment, generateSecret } from "../lib/nearCommit";
import { FC_ALLOWANCE_YOCTO, GAME_METHODS } from "../lib/nearConfig";
import { generateKeyPair } from "../lib/nearKey";
import type { Action } from "../lib/nearTypes";
import { createNearViewClient } from "../lib/nearViews";
import { deployRoletContract, startSandbox } from "./sandboxHelper";

test(
  "F3-19 nearTransport: two bots finish a full match on local near-sandbox without Loupe leaks",
  { timeout: 120_000 },
  async (t) => {
    const sb = await startSandbox();
    if (!sb) {
      t.skip("near-sandbox binary or rolet_near.wasm not found");
      return;
    }

    let aliceTransport: NearTransport | null = null;
    let bobTransport: NearTransport | null = null;

    try {
      const { contractId } = await deployRoletContract(sb, "transport-rolet");

      const aliceFull = KeyPair.fromRandom("ed25519");
      const bobFull = KeyPair.fromRandom("ed25519");
      const aliceId = `alice-t.${sb.rootAccountId}`;
      const bobId = `bob-t.${sb.rootAccountId}`;

      await sb.rootAccount.createAccount(
        aliceId,
        aliceFull.getPublicKey(),
        BigInt("30000000000000000000000000"),
      );
      await sb.rootAccount.createAccount(
        bobId,
        bobFull.getPublicKey(),
        BigInt("30000000000000000000000000"),
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
        args: { kind: "Kacak" },
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

      const aliceCaller = createGameCaller({
        accountId: aliceId,
        contractId,
        keyPair: aliceFc,
        rpcUrl: sb.rpcUrl,
      });
      const bobCaller = createGameCaller({
        accountId: bobId,
        contractId,
        keyPair: bobFc,
        rpcUrl: sb.rpcUrl,
      });

      const matchId = "77";
      const aliceSecret = generateSecret();
      const bobSecret = generateSecret();
      await aliceCaller.sendGameCall("join", {
        match_id: matchId,
        opponent: bobId,
        commit: bytesToBase64(commitment(aliceSecret, aliceId, matchId)),
        token_id: aliceToken,
      });
      await bobCaller.sendGameCall("join", {
        match_id: matchId,
        opponent: aliceId,
        commit: bytesToBase64(commitment(bobSecret, bobId, matchId)),
        token_id: bobToken,
      });
      await aliceCaller.sendGameCall("reveal", {
        match_id: matchId,
        secret: bytesToBase64(aliceSecret),
      });
      await bobCaller.sendGameCall("reveal", {
        match_id: matchId,
        secret: bytesToBase64(bobSecret),
      });

      const initialMatch = await views.getMatch(matchId, [aliceId, bobId]);
      assert.ok(initialMatch);
      assert.equal(initialMatch.status, "Active");

      const players = initialMatch.players;
      aliceTransport = new NearTransport({
        matchId,
        players,
        you: 0,
        views,
        submitCall: (m, a) => aliceCaller.sendGameCall(m, a),
        initialMatch,
        pollerOptions: { activeIntervalMs: 250 },
      });
      bobTransport = new NearTransport({
        matchId,
        players,
        you: 1,
        views,
        submitCall: (m, a) => bobCaller.sendGameCall(m, a),
        initialMatch,
        pollerOptions: { activeIntervalMs: 250 },
      });

      const bobObserved: Action[] = [];
      bobTransport.onActions((batch) => bobObserved.push(...batch));

      let intentSeq = 0;
      for (let step = 0; step < 120; step += 1) {
        await Promise.all([aliceTransport.pollNow(), bobTransport.pollNow()]);
        const aliceModel: GameModel | null = aliceTransport.getModel();
        const bobModel: GameModel | null = bobTransport.getModel();
        assert.ok(aliceModel && bobModel);

        if (aliceModel.phase === "finished" && bobModel.phase === "finished") {
          break;
        }
        assert.equal(
          aliceModel.turn,
          bobModel.turn,
          `model turns diverged at step ${step}`,
        );

        const activeSeat = aliceModel.turn as 0 | 1;
        const activeTransport = activeSeat === 0 ? aliceTransport : bobTransport;
        const activeModel = activeSeat === 0 ? aliceModel : bobModel;

        const intent = chooseBotIntent(activeModel, activeSeat, ++intentSeq);
        await activeTransport.submitIntent(intent);
      }

      await Promise.all([aliceTransport.pollNow(), bobTransport.pollNow()]);

      const finalChain = await views.getMatch(matchId, players);
      assert.ok(finalChain);
      assert.equal(finalChain.status, "Finished");
      assert.ok(finalChain.winner === 0 || finalChain.winner === 1);

      const finalAlice = aliceTransport.getModel()!;
      const finalBob = bobTransport.getModel()!;
      assert.equal(finalAlice.phase, "finished");
      assert.equal(finalBob.phase, "finished");
      assert.equal(finalAlice.winner, finalChain.winner);
      assert.equal(finalBob.winner, finalChain.winner);
      assert.deepEqual(finalAlice.score, finalChain.game.score);
      assert.deepEqual(finalBob.score, finalChain.game.score);
      assert.deepEqual(finalAlice.hp, finalChain.game.hp);
      assert.deepEqual(finalBob.hp, finalChain.game.hp);

      // Bob must never see Alice's Private item result (Loupe / Ticker)
      for (const action of bobObserved) {
        if (action.kind === "ItemUsed" && action.player === 0) {
          assert.notEqual(
            action.result.kind,
            "Private",
            "Bob observed Alice's Private result!",
          );
        }
      }
    } finally {
      aliceTransport?.dispose();
      bobTransport?.dispose();
      sb.stop();
    }
  },
);
