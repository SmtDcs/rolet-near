import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators, createTransaction } from "@near-js/transactions";
import { baseDecode } from "@near-js/utils";
import { createGameCaller } from "../lib/nearCall";
import { bytesToBase64, commitment, generateSecret } from "../lib/nearCommit";
import { ACTION_GAS, FC_ALLOWANCE_YOCTO, GAME_METHODS } from "../lib/nearConfig";
import { generateKeyPair } from "../lib/nearKey";
import { classifyError } from "../lib/nearOutcome";
import { isAction, type MatchView } from "../lib/nearTypes";

const REPO_ROOT = resolve(__dirname, "../../..");
const CONTRACT_DIR = resolve(REPO_ROOT, "contracts/rolet-near");
const WASM_PATH = resolve(CONTRACT_DIR, "target/near/rolet_near.wasm");
const INIT_CONFIG_PATH = resolve(CONTRACT_DIR, "init-config.json");
const FIXTURES_DIR = resolve(REPO_ROOT, "apps/web/lib/__fixtures__");

function findSandboxBinary(): string | null {
  const fromEnv = process.env.NEAR_SANDBOX_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const buildDir = resolve(CONTRACT_DIR, "target/debug/build");
  if (!existsSync(buildDir)) return null;

  for (const entry of readdirSync(buildDir)) {
    if (!entry.startsWith("near-sandbox-")) continue;
    const nearDir = resolve(buildDir, entry, "out/.near");
    if (!existsSync(nearDir)) continue;
    for (const verDir of readdirSync(nearDir)) {
      if (!verDir.startsWith("near-sandbox-")) continue;
      const bin = resolve(nearDir, verDir, "near-sandbox");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("failed to allocate port")));
        return;
      }
      const { port } = addr;
      srv.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
}

async function waitForSandboxRpc(rpcUrl: string, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${rpcUrl}/status`);
      if (res.ok) return;
    } catch {
      // Sandbox still starting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`near-sandbox RPC did not become ready at ${rpcUrl}`);
}

interface ValidatorKeyFile {
  account_id: string;
  public_key: string;
  secret_key?: string;
  private_key?: string;
}

function writeFixture(relPath: string, data: unknown): void {
  if (process.env.UPDATE_FIXTURES !== "1") return;
  const fullPath = resolve(FIXTURES_DIR, relPath);
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    return {
      name: obj.name,
      type: obj.type,
      message: obj.message,
      cause: obj.cause,
      data: obj.data,
    };
  }
  return { message: String(err) };
}

test("local near-sandbox E2E match with FC access keys and error classifications", async (t) => {
  const sandboxBin = findSandboxBinary();
  if (!sandboxBin) {
    t.skip(
      "near-sandbox binary not found; set NEAR_SANDBOX_BIN or run cargo test in contracts/rolet-near",
    );
    return;
  }
  if (!existsSync(WASM_PATH)) {
    t.skip(
      `rolet_near.wasm not found at ${WASM_PATH}; run cargo near build non-reproducible-wasm`,
    );
    return;
  }

  const homeDir = mkdtempSync(join(tmpdir(), "rolet-web-sandbox-"));
  let child: ChildProcess | null = null;

  try {
    execFileSync(sandboxBin, ["--home", homeDir, "init", "--fast"], {
      stdio: "ignore",
    });

    const rpcPort = await getFreePort();
    const netPort = await getFreePort();
    const rpcUrl = `http://127.0.0.1:${rpcPort}`;

    child = spawn(
      sandboxBin,
      [
        "--home",
        homeDir,
        "run",
        "--rpc-addr",
        `127.0.0.1:${rpcPort}`,
        "--network-addr",
        `127.0.0.1:${netPort}`,
      ],
      { stdio: "ignore" },
    );

    await waitForSandboxRpc(rpcUrl);

    const vk = JSON.parse(
      readFileSync(join(homeDir, "validator_key.json"), "utf8"),
    ) as ValidatorKeyFile;
    const rootSecret = vk.secret_key ?? vk.private_key;
    assert.ok(rootSecret, "validator_key.json missing secret_key/private_key");

    const provider = new JsonRpcProvider({ url: rpcUrl });
    const rootKp = KeyPair.fromString(rootSecret as KeyPairString);
    const rootAccount = new Account(vk.account_id, provider, new KeyPairSigner(rootKp));

    const contractId = `rolet.${vk.account_id}`;
    const aliceId = `alice.${vk.account_id}`;
    const bobId = `bob.${vk.account_id}`;

    const contractKp = KeyPair.fromRandom("ed25519");
    const aliceFullKp = KeyPair.fromRandom("ed25519");
    const bobFullKp = KeyPair.fromRandom("ed25519");

    const oneNear = BigInt("1000000000000000000000000");
    await rootAccount.createAccount(
      contractId,
      contractKp.getPublicKey(),
      BigInt("50000000000000000000000000"),
    );
    await rootAccount.createAccount(
      aliceId,
      aliceFullKp.getPublicKey(),
      BigInt("50000000000000000000000000"),
    );
    await rootAccount.createAccount(
      bobId,
      bobFullKp.getPublicKey(),
      BigInt("50000000000000000000000000"),
    );

    const contractAccount = new Account(
      contractId,
      provider,
      new KeyPairSigner(contractKp),
    );
    const aliceAccount = new Account(
      aliceId,
      provider,
      new KeyPairSigner(aliceFullKp),
    );
    const bobAccount = new Account(bobId, provider, new KeyPairSigner(bobFullKp));

    const wasmBytes = new Uint8Array(readFileSync(WASM_PATH));
    await contractAccount.deployContract(wasmBytes);

    const initConfig = JSON.parse(readFileSync(INIT_CONFIG_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    await rootAccount.callFunction({
      contractId,
      methodName: "new",
      args: { owner: vk.account_id, config: initConfig },
      gas: BigInt("50000000000000"),
    });
    await rootAccount.callFunction({
      contractId,
      methodName: "fund_treasury",
      args: {},
      deposit: BigInt("5000000000000000000000000"),
      gas: BigInt("30000000000000"),
    });

    const aliceToken = await aliceAccount.callFunction<string>({
      contractId,
      methodName: "buy_character",
      args: { kind: "Kuleci" },
      deposit: oneNear,
      gas: BigInt("50000000000000"),
    });
    const bobToken = await bobAccount.callFunction<string>({
      contractId,
      methodName: "buy_character",
      args: { kind: "Ayarci" },
      deposit: oneNear,
      gas: BigInt("50000000000000"),
    });
    assert.ok(aliceToken && bobToken);

    // Add FC access keys (T-203 AddKey path)
    const aliceFc = generateKeyPair();
    const bobFc = generateKeyPair();
    await aliceAccount.addFunctionCallAccessKey({
      publicKey: aliceFc.publicKey,
      contractId,
      methodNames: [...GAME_METHODS],
      allowance: BigInt(FC_ALLOWANCE_YOCTO),
    });
    await bobAccount.addFunctionCallAccessKey({
      publicKey: bobFc.publicKey,
      contractId,
      methodNames: [...GAME_METHODS],
      allowance: BigInt(FC_ALLOWANCE_YOCTO),
    });

    const aliceCaller = createGameCaller({
      accountId: aliceId,
      contractId,
      keyPair: aliceFc,
      rpcUrl,
    });
    const bobCaller = createGameCaller({
      accountId: bobId,
      contractId,
      keyPair: bobFc,
      rpcUrl,
    });

    const matchId = BigInt(1);
    const aliceSecret = generateSecret();
    const bobSecret = generateSecret();

    await aliceCaller.sendGameCall("join", {
      match_id: "1",
      opponent: bobId,
      commit: bytesToBase64(commitment(aliceSecret, aliceId, matchId)),
      token_id: aliceToken,
    });
    await bobCaller.sendGameCall("join", {
      match_id: "1",
      opponent: aliceId,
      commit: bytesToBase64(commitment(bobSecret, bobId, matchId)),
      token_id: bobToken,
    });

    await aliceCaller.sendGameCall("reveal", {
      match_id: "1",
      secret: bytesToBase64(aliceSecret),
    });
    await bobCaller.sendGameCall("reveal", {
      match_id: "1",
      secret: bytesToBase64(bobSecret),
    });

    let matchEnded = false;
    let capturedFireOutcome: unknown = null;

    for (let step = 0; step < 60; step += 1) {
      const view = await provider.callFunction<MatchView>(contractId, "get_match", {
        match_id: "1",
        players: [aliceId, bobId],
      });
      assert.ok(view, "get_match returned undefined");
      if (view.status === "Finished") {
        matchEnded = true;
        break;
      }

      const actorCaller = view.game.turn === 0 ? aliceCaller : bobCaller;
      const res = await actorCaller.sendGameCall("fire", {
        match_id: "1",
        target: "Opponent",
      });

      assert.equal(res.ok, true);
      assert.ok(Array.isArray(res.returnValue), "fire returnValue must be Action[]");
      const actions = res.returnValue as unknown[];
      assert.ok(actions.length > 0, "fire must produce at least one Action");
      for (const a of actions) {
        assert.equal(isAction(a), true, `invalid action: ${JSON.stringify(a)}`);
      }
      assert.ok(res.events.length > 0, "fire must emit rolet NEP-297 events");

      if (!capturedFireOutcome) {
        const actorId = view.game.turn === 0 ? aliceId : bobId;
        capturedFireOutcome = await provider.viewTransactionStatus(
          res.txHash,
          actorId,
          "EXECUTED_OPTIMISTIC",
        );
      }

      if (res.events.some((ev) => ev.kind === "MatchEnded")) {
        matchEnded = true;
        break;
      }
    }

    assert.equal(matchEnded, true, "match must reach MatchEnded within 60 turns");
    if (capturedFireOutcome) {
      writeFixture("outcomes/fire-success.json", capturedFireOutcome);
    }

    // 1. Disallowed method (claim_reward) with FC key -> methodDenied
    const aliceFcKp = KeyPair.fromString(aliceFc.secretKey as KeyPairString);
    const aliceFcSigner = new KeyPairSigner(aliceFcKp);
    const ak = await provider.viewAccessKey(aliceId, aliceFc.publicKey, {
      finality: "optimistic",
    });
    const forbiddenTx = createTransaction(
      aliceId,
      aliceFcKp.getPublicKey(),
      contractId,
      BigInt(ak.nonce) + BigInt(1),
      [actionCreators.functionCall("claim_reward", {}, ACTION_GAS, BigInt(0))],
      baseDecode(ak.block_hash),
    );
    const [, signedForbiddenTx] = await aliceFcSigner.signTransaction(forbiddenTx);
    let methodErr: unknown;
    try {
      await provider.sendTransaction(signedForbiddenTx);
    } catch (e) {
      methodErr = e;
    }
    assert.ok(methodErr, "claim_reward with FC key must fail");
    assert.equal(classifyError(methodErr), "methodDenied");
    writeFixture("near-errors/method-name-mismatch.json", serializeError(methodErr));

    // 2. Tiny allowance (1 yoctoNEAR) FC key -> allowance
    const tinyFc = generateKeyPair();
    await aliceAccount.addFunctionCallAccessKey({
      publicKey: tinyFc.publicKey,
      contractId,
      methodNames: [...GAME_METHODS],
      allowance: BigInt(1),
    });
    const tinyCaller = createGameCaller({
      accountId: aliceId,
      contractId,
      keyPair: tinyFc,
      rpcUrl,
    });
    let allowanceErr: unknown;
    try {
      await tinyCaller.sendGameCall("cancel", { match_id: "999" });
    } catch (e) {
      allowanceErr = e;
    }
    assert.ok(allowanceErr, "1-yocto FC key call must fail");
    assert.equal(classifyError(allowanceErr), "allowance");
    const rawAllowanceErr = (allowanceErr as { causeError?: unknown }).causeError ?? allowanceErr;
    writeFixture("near-errors/not-enough-allowance.json", serializeError(rawAllowanceErr));
    writeFixture("outcomes/allowance-error.json", serializeError(rawAllowanceErr));

    // 3. Deleted FC key -> missingKey
    await aliceAccount.deleteKey(aliceFc.publicKey);
    let missingErr: unknown;
    try {
      await aliceCaller.sendGameCall("cancel", { match_id: "999" });
    } catch (e) {
      missingErr = e;
    }
    assert.ok(missingErr, "deleted FC key call must fail");
    assert.equal(classifyError(missingErr), "missingKey");
    const rawMissingErr = (missingErr as { causeError?: unknown }).causeError ?? missingErr;
    writeFixture("near-errors/access-key-not-found.json", serializeError(rawMissingErr));
  } finally {
    if (child && !child.killed) {
      child.kill("SIGKILL");
    }
    rmSync(homeDir, { recursive: true, force: true });
  }
});
