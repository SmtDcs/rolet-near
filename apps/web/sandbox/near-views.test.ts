import assert from "node:assert/strict";
import test from "node:test";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { KeyPairSigner } from "@near-js/signers";
import { bytesToBase64, commitment, generateSecret } from "../lib/nearCommit";
import { createNearViewClient } from "../lib/nearViews";
import { deployRoletContract, startSandbox } from "./sandboxHelper";

test(
  "nearViews queries contract state on local near-sandbox",
  { timeout: 60_000 },
  async (t) => {
    const sb = await startSandbox();
    if (!sb) {
      t.skip("near-sandbox binary or rolet_near.wasm not found");
      return;
    }

    try {
      const { contractId } = await deployRoletContract(sb, "views-rolet");

      const aliceKp = KeyPair.fromRandom("ed25519");
      const bobKp = KeyPair.fromRandom("ed25519");
      const aliceId = `alice-v.${sb.rootAccountId}`;
      const bobId = `bob-v.${sb.rootAccountId}`;

      await sb.rootAccount.createAccount(
        aliceId,
        aliceKp.getPublicKey(),
        BigInt("20000000000000000000000000"),
      );
      await sb.rootAccount.createAccount(
        bobId,
        bobKp.getPublicKey(),
        BigInt("20000000000000000000000000"),
      );

      const alice = new Account(aliceId, sb.provider, new KeyPairSigner(aliceKp));
      const bob = new Account(bobId, sb.provider, new KeyPairSigner(bobKp));

      const views = createNearViewClient({ contractId, rpcUrl: sb.rpcUrl });

      const cfg = await views.getConfig();
      assert.equal(cfg.load_size, 8);
      assert.equal(cfg.rounds.length, 3);

      const treasuryBefore = BigInt(await views.getTreasury());
      assert.ok(treasuryBefore >= BigInt("5000000000000000000000000"));

      const playerBefore = await views.getPlayer(aliceId);
      assert.equal(playerBefore.played, 0);
      assert.equal(playerBefore.active_match, null);
      assert.equal(playerBefore.owed, "0");

      assert.equal(await views.getMatch("999", [aliceId, bobId]), null);

      const price = BigInt(cfg.price);
      const aliceToken = await alice.callFunction<string>({
        contractId,
        methodName: "buy_character",
        args: { kind: "Kuleci" },
        deposit: price,
        gas: BigInt("50000000000000"),
      });
      const bobToken = await bob.callFunction<string>({
        contractId,
        methodName: "buy_character",
        args: { kind: "Ayarci" },
        deposit: price,
        gas: BigInt("50000000000000"),
      });

      const tokens = await views.nftTokensForOwner(aliceId);
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0]?.token_id, aliceToken);

      const charState = await views.getCharacter(aliceToken);
      assert.equal(charState?.kind, "Kuleci");
      assert.equal(charState?.durability, cfg.durability);
      assert.equal(charState?.locked_in, null);

      const aliceSecret = generateSecret();
      const bobSecret = generateSecret();
      await alice.callFunction({
        contractId,
        methodName: "join",
        args: {
          match_id: "1",
          opponent: bobId,
          commit: bytesToBase64(commitment(aliceSecret, aliceId, "1")),
          token_id: aliceToken,
        },
        gas: BigInt("50000000000000"),
      });
      await bob.callFunction({
        contractId,
        methodName: "join",
        args: {
          match_id: "1",
          opponent: aliceId,
          commit: bytesToBase64(commitment(bobSecret, bobId, "1")),
          token_id: bobToken,
        },
        gas: BigInt("50000000000000"),
      });
      await alice.callFunction({
        contractId,
        methodName: "reveal",
        args: { match_id: "1", secret: bytesToBase64(aliceSecret) },
        gas: BigInt("50000000000000"),
      });
      await bob.callFunction({
        contractId,
        methodName: "reveal",
        args: { match_id: "1", secret: bytesToBase64(bobSecret) },
        gas: BigInt("50000000000000"),
      });

      const match = await views.getMatch("1", [aliceId, bobId]);
      assert.ok(match);
      assert.deepEqual(match.players, [aliceId, bobId]);
      assert.equal(match.status, "Active");

      const actions = await views.getActions("1", 0, [aliceId, bobId]);
      assert.ok(actions.actions.length >= 1);

      const lb = await views.leaderboard(0, 10);
      assert.ok(Array.isArray(lb));
    } finally {
      sb.stop();
    }
  },
);
