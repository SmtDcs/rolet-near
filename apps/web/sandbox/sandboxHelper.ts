import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair, type KeyPairString } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";

export const REPO_ROOT = resolve(__dirname, "../../..");
export const CONTRACT_DIR = resolve(REPO_ROOT, "contracts/rolet-near");
export const WASM_PATH = resolve(CONTRACT_DIR, "target/near/rolet_near.wasm");
export const INIT_CONFIG_PATH = resolve(CONTRACT_DIR, "init-config.json");

export function findSandboxBinary(): string | null {
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

export function getFreePort(): Promise<number> {
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

export interface SandboxInstance {
  rpcUrl: string;
  provider: JsonRpcProvider;
  rootAccount: Account;
  rootAccountId: string;
  stop: () => void;
}

export async function startSandbox(): Promise<SandboxInstance | null> {
  const sandboxBin = findSandboxBinary();
  if (!sandboxBin || !existsSync(WASM_PATH)) {
    return null;
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
    if (!rootSecret) {
      throw new Error("validator_key.json missing secret_key/private_key");
    }

    const provider = new JsonRpcProvider({ url: rpcUrl });
    const rootKp = KeyPair.fromString(rootSecret as KeyPairString);
    const rootAccount = new Account(vk.account_id, provider, new KeyPairSigner(rootKp));

    return {
      rpcUrl,
      provider,
      rootAccount,
      rootAccountId: vk.account_id,
      stop: () => {
        if (child && !child.killed) {
          child.kill("SIGKILL");
        }
        rmSync(homeDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    if (child && !child.killed) {
      child.kill("SIGKILL");
    }
    rmSync(homeDir, { recursive: true, force: true });
    throw err;
  }
}

export async function deployRoletContract(
  sb: SandboxInstance,
  subAccount = "rolet",
  configOverrides: Record<string, unknown> = {},
): Promise<{ contractId: string; contractAccount: Account }> {
  const contractId = `${subAccount}.${sb.rootAccountId}`;
  const contractKp = KeyPair.fromRandom("ed25519");
  await sb.rootAccount.createAccount(
    contractId,
    contractKp.getPublicKey(),
    BigInt("50000000000000000000000000"),
  );
  const contractAccount = new Account(
    contractId,
    sb.provider,
    new KeyPairSigner(contractKp),
  );
  const wasmBytes = new Uint8Array(readFileSync(WASM_PATH));
  await contractAccount.deployContract(wasmBytes);

  const baseConfig = JSON.parse(
    readFileSync(INIT_CONFIG_PATH, "utf8"),
  ) as Record<string, unknown>;
  const config = { ...baseConfig, ...configOverrides };

  await sb.rootAccount.callFunction({
    contractId,
    methodName: "new",
    args: { owner: sb.rootAccountId, config },
    gas: BigInt("50000000000000"),
  });
  await sb.rootAccount.callFunction({
    contractId,
    methodName: "fund_treasury",
    args: {},
    deposit: BigInt("5000000000000000000000000"),
    gas: BigInt("30000000000000"),
  });

  return { contractId, contractAccount };
}
