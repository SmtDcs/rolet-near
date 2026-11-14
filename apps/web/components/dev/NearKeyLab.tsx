"use client";

import "@near-wallet-selector/modal-ui/styles.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import {
  actionCreators,
  setupWalletSelector,
  type BrowserWallet,
  type InjectedWallet,
  type WalletSelector,
} from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { createGameCaller } from "@/lib/nearCall";
import {
  bytesToBase64,
  clearSecret,
  commitment,
  generateSecret,
  loadSecret,
  saveSecret,
} from "@/lib/nearCommit";
import { FC_ALLOWANCE_YOCTO, GAME_METHODS, readNearConfig } from "@/lib/nearConfig";
import { generateKeyPair, loadKey, saveKey, type StoredKeyRecord } from "@/lib/nearKey";
import {
  checkKeyOnChain,
  decideKeyAction,
  readKeyAllowance,
  signOutKey,
  type KeyFlowAction,
  type OnChainKeyStatus,
} from "@/lib/nearKeyFlow";
import { parseOutcome } from "@/lib/nearOutcome";
import type { Action, MatchView, Target } from "@/lib/nearTypes";

type CharacterKind = "Kuleci" | "Ayarci" | "Kacak";

const NETWORK_PRESETS = {
  testnet: {
    helperUrl: "https://helper.testnet.near.org",
    explorerUrl: "https://testnet.nearblocks.io",
    indexerUrl: "https://testnet-api.kitwallet.app",
  },
  mainnet: {
    helperUrl: "https://helper.mainnet.near.org",
    explorerUrl: "https://nearblocks.io",
    indexerUrl: "https://api.kitwallet.app",
  },
  localnet: {
    helperUrl: "http://127.0.0.1:3000",
    explorerUrl: "http://127.0.0.1:3000",
    indexerUrl: "http://127.0.0.1:3000",
  },
} as const;

function listWalletKeystoreNames(): string[] {
  if (typeof window === "undefined") return [];
  const names: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith("rolet:fck:") ||
      key.startsWith("near-api-js:") ||
      key.startsWith("near_app") ||
      key.includes("wallet-selector") ||
      key.includes("meteor")
    ) {
      names.push(key);
    }
  }
  return names.sort();
}

function formatYoctoAsNear(yocto: string | null): string {
  if (!yocto) return "-";
  try {
    const val = BigInt(yocto);
    const divisor = BigInt("1000000000000000000"); // 1e18 -> 6 decimals
    const micro = val / divisor;
    const whole = micro / BigInt(1_000_000);
    const frac = (micro % BigInt(1_000_000)).toString().padStart(6, "0");
    return `${whole.toString()}.${frac} NEAR (${yocto} yocto)`;
  } catch {
    return yocto;
  }
}

export function NearKeyLab() {
  const envConfig = useMemo(() => readNearConfig(), []);
  const [contractInput, setContractInput] = useState(envConfig.contractId);
  const contractId = contractInput.trim();

  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);

  const [storedRecord, setStoredRecord] = useState<StoredKeyRecord | null>(null);
  const [onChainStatus, setOnChainStatus] = useState<OnChainKeyStatus>("unknown");
  const [decision, setDecision] = useState<KeyFlowAction>("addkey");
  const [keystoreKeys, setKeystoreKeys] = useState<string[]>([]);

  const [charKind, setCharKind] = useState<CharacterKind>("Kuleci");
  const [matchIdInput, setMatchIdInput] = useState("1");
  const [opponentInput, setOpponentInput] = useState("");
  const [tokenIdInput, setTokenIdInput] = useState("");
  const [targetInput, setTargetInput] = useState<Target>("Opponent");

  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [actionsJson, setActionsJson] = useState<Action[] | null>(null);
  const [matchSnapshot, setMatchSnapshot] = useState<MatchView | null>(null);
  const [measureResult, setMeasureResult] = useState<{
    before: string | null;
    after: string | null;
    delta: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const appendLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setStatusLog((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    async function init() {
      const preset = NETWORK_PRESETS[envConfig.networkId];
      const ws = await setupWalletSelector({
        network: {
          networkId: envConfig.networkId,
          nodeUrl: envConfig.rpcUrl,
          helperUrl: preset.helperUrl,
          explorerUrl: preset.explorerUrl,
          indexerUrl: preset.indexerUrl,
        },
        modules: [setupMyNearWallet(), setupMeteorWallet()],
        createAccessKeyFor: contractId
          ? { contractId, methodNames: [...GAME_METHODS] }
          : undefined,
      });

      if (!active) return;

      const m = setupModal(ws, {
        contractId: contractId || undefined,
        methodNames: contractId ? [...GAME_METHODS] : undefined,
      });

      const syncState = () => {
        const st = ws.store.getState();
        const activeAcc = st.accounts.find((a) => a.active) ?? st.accounts[0] ?? null;
        setAccountId(activeAcc?.accountId ?? null);
        setWalletId(st.selectedWalletId ?? null);
      };

      syncState();
      const sub = ws.store.observable.subscribe(() => {
        syncState();
      });
      unsub = () => sub.unsubscribe();

      setSelector(ws);
      setModal(m);
    }

    init().catch((err) => {
      appendLog(`WalletSelector init error: ${err instanceof Error ? err.message : String(err)}`);
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, [appendLog, contractId, envConfig.networkId, envConfig.rpcUrl]);

  const computeKeySnapshot = useCallback(async () => {
    const keys = listWalletKeystoreNames();
    if (!accountId || !contractId || typeof window === "undefined") {
      return {
        keys,
        rec: null as StoredKeyRecord | null,
        chainStatus: "unknown" as OnChainKeyStatus,
        nextDecision: decideKeyAction({
          stored: null,
          onChain: "missing",
          walletSupportsFcKey: false,
        }),
      };
    }

    const rec = loadKey(window.localStorage, accountId, contractId);
    const chainStatus = rec
      ? await checkKeyOnChain(envConfig.rpcUrl, accountId, rec.publicKey, contractId)
      : "missing";
    const nextDecision = decideKeyAction({
      stored: rec,
      onChain: chainStatus,
      walletSupportsFcKey: walletId === "my-near-wallet",
    });
    return { keys, rec, chainStatus, nextDecision };
  }, [accountId, contractId, envConfig.rpcUrl, walletId]);

  const refreshKeyStatus = useCallback(async () => {
    const snap = await computeKeySnapshot();
    setKeystoreKeys(snap.keys);
    setStoredRecord(snap.rec);
    setOnChainStatus(snap.chainStatus);
    setDecision(snap.nextDecision);
  }, [computeKeySnapshot]);

  useEffect(() => {
    let active = true;
    void computeKeySnapshot().then((snap) => {
      if (!active) return;
      setKeystoreKeys(snap.keys);
      setStoredRecord(snap.rec);
      setOnChainStatus(snap.chainStatus);
      setDecision(snap.nextDecision);
    });
    return () => {
      active = false;
    };
  }, [computeKeySnapshot]);

  const handleSignOut = async () => {
    if (!selector) return;
    setBusy(true);
    try {
      const wallet = await selector.wallet();
      await wallet.signOut();
      if (accountId && contractId && typeof window !== "undefined") {
        signOutKey(window.localStorage, accountId, contractId);
      }
      appendLog("Signed out and the stored FC key was deleted.");
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`Sign-out error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSignInWithMethods = async () => {
    if (!selector || !contractId) {
      appendLog("Enter the contract address first.");
      return;
    }
    setBusy(true);
    try {
      if (walletId) {
        const wallet = await selector.wallet<BrowserWallet | InjectedWallet>();
        const accounts = await wallet.signIn({
          contractId,
          methodNames: [...GAME_METHODS],
        });
        appendLog(`signIn(methodNames) completed: ${accounts.map((a) => a.accountId).join(", ")}`);
      } else {
        modal?.show();
      }
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`signIn error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddKeyFallback = async () => {
    if (!selector || !accountId || !contractId || typeof window === "undefined") {
      appendLog("Connected account and contract are required.");
      return;
    }
    setBusy(true);
    try {
      const kp = generateKeyPair();
      const wallet = await selector.wallet();
      const action = actionCreators.addKey(
        PublicKey.fromString(kp.publicKey),
        actionCreators.functionCallAccessKey(
          contractId,
          [...GAME_METHODS],
          BigInt(FC_ALLOWANCE_YOCTO),
        ),
      );
      const outcome = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: accountId,
        actions: [action],
      });
      saveKey(window.localStorage, accountId, contractId, {
        secretKey: kp.secretKey,
        publicKey: kp.publicKey,
        createdAt: Date.now(),
        allowanceYocto: FC_ALLOWANCE_YOCTO,
      });
      const txHash = outcome?.transaction?.hash ?? "(unknown)";
      appendLog(`Fallback AddKey succeeded (${kp.publicKey}), tx: ${txHash}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`AddKey error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBuyCharacter = async () => {
    if (!selector || !accountId || !contractId) {
      appendLog("Connected account and contract are required.");
      return;
    }
    setBusy(true);
    try {
      const wallet = await selector.wallet();
      const outcome = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: contractId,
        actions: [
          actionCreators.functionCall(
            "buy_character",
            { kind: charKind },
            BigInt("30000000000000"),
            BigInt("1000000000000000000000000"),
          ),
        ],
      });
      const parsed = outcome ? parseOutcome(outcome) : null;
      if (parsed && typeof parsed.returnValue === "string") {
        setTokenIdInput(parsed.returnValue);
      }
      appendLog(
        `buy_character(${charKind}) tx: ${outcome?.transaction?.hash ?? "-"}, token: ${String(parsed?.returnValue ?? "-")}`,
      );
    } catch (err) {
      appendLog(`buy_character error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const getCaller = () => {
    if (!accountId || !contractId || !storedRecord) {
      throw new Error("Create or store an FC key first.");
    }
    return createGameCaller({
      accountId,
      contractId,
      keyPair: storedRecord,
      rpcUrl: envConfig.rpcUrl,
    });
  };

  const handleJoinAndCancel = async () => {
    if (!accountId || !contractId || !opponentInput.trim() || !tokenIdInput.trim()) {
      appendLog("match_id, opponent and token_id are required.");
      return;
    }
    setBusy(true);
    try {
      const caller = getCaller();
      const matchId = BigInt(matchIdInput.trim());
      const secret = generateSecret();
      const commitBytes = commitment(secret, accountId, matchId);

      const joinRes = await caller.sendGameCall("join", {
        match_id: matchId.toString(),
        opponent: opponentInput.trim(),
        commit: bytesToBase64(commitBytes),
        token_id: tokenIdInput.trim(),
      });
      appendLog(`join tx: ${joinRes.txHash}`);

      const cancelRes = await caller.sendGameCall("cancel", {
        match_id: matchId.toString(),
      });
      appendLog(`cancel tx: ${cancelRes.txHash}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`join→cancel error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!accountId || !contractId || !opponentInput.trim() || !tokenIdInput.trim()) {
      appendLog("match_id, opponent and token_id are required.");
      return;
    }
    setBusy(true);
    try {
      const caller = getCaller();
      const matchId = BigInt(matchIdInput.trim());
      const secret = generateSecret();
      saveSecret(window.sessionStorage, accountId, contractId, matchId, secret);
      const commitBytes = commitment(secret, accountId, matchId);

      const res = await caller.sendGameCall("join", {
        match_id: matchId.toString(),
        opponent: opponentInput.trim(),
        commit: bytesToBase64(commitBytes),
        token_id: tokenIdInput.trim(),
      });
      appendLog(`join tx: ${res.txHash}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`join error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (!accountId || !contractId) {
      appendLog("Connected account and contract are required.");
      return;
    }
    setBusy(true);
    try {
      const caller = getCaller();
      const matchId = BigInt(matchIdInput.trim());
      const secret = loadSecret(window.sessionStorage, accountId, contractId, matchId);
      if (!secret) {
        appendLog("No secret found in sessionStorage for this match.");
        return;
      }
      const res = await caller.sendGameCall("reveal", {
        match_id: matchId.toString(),
        secret: bytesToBase64(secret),
      });
      clearSecret(window.sessionStorage, accountId, contractId, matchId);
      if (res.events.length > 0) setActionsJson(res.events);
      appendLog(`reveal tx: ${res.txHash}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`reveal error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFire = async () => {
    setBusy(true);
    try {
      const caller = getCaller();
      const matchId = BigInt(matchIdInput.trim());
      const res = await caller.sendGameCall("fire", {
        match_id: matchId.toString(),
        target: targetInput,
      });
      const returnedActions = Array.isArray(res.returnValue)
        ? (res.returnValue as Action[])
        : res.events;
      setActionsJson(returnedActions);
      appendLog(`fire(${targetInput}) tx: ${res.txHash}, actions: ${returnedActions.length}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`fire error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleFetchMatch = async () => {
    if (!contractId) return;
    setBusy(true);
    try {
      const provider = new JsonRpcProvider({ url: envConfig.rpcUrl });
      const players =
        accountId && opponentInput.trim()
          ? ([accountId, opponentInput.trim()] as [string, string])
          : undefined;
      const view = await provider.callFunction<MatchView>(contractId, "get_match", {
        match_id: matchIdInput.trim(),
        ...(players ? { players } : {}),
      });
      setMatchSnapshot(view ?? null);
      appendLog(`get_match(${matchIdInput.trim()}): ${view ? view.status : "not found"}`);
    } catch (err) {
      appendLog(`get_match error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleMeasureJoinCancel = async () => {
    if (!accountId || !contractId || !storedRecord || !opponentInput.trim() || !tokenIdInput.trim()) {
      appendLog("Measurement needs a connected account, FC key, opponent and token_id.");
      return;
    }
    setBusy(true);
    try {
      const before = await readKeyAllowance(
        envConfig.rpcUrl,
        accountId,
        storedRecord.publicKey,
      );
      const caller = getCaller();
      const matchId = BigInt(matchIdInput.trim());
      const secret = generateSecret();
      const commitBytes = commitment(secret, accountId, matchId);
      await caller.sendGameCall("join", {
        match_id: matchId.toString(),
        opponent: opponentInput.trim(),
        commit: bytesToBase64(commitBytes),
        token_id: tokenIdInput.trim(),
      });
      await caller.sendGameCall("cancel", {
        match_id: matchId.toString(),
      });
      const after = await readKeyAllowance(
        envConfig.rpcUrl,
        accountId,
        storedRecord.publicKey,
      );
      const delta =
        before && after ? (BigInt(before) - BigInt(after)).toString() : null;
      setMeasureResult({ before, after, delta });
      appendLog(`Measurement (join→cancel) delta: ${formatYoctoAsNear(delta)}`);
      await refreshKeyStatus();
    } catch (err) {
      appendLog(`Measurement error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative z-10 mx-auto max-w-4xl space-y-6 p-6 font-mono text-sm">
      <header className="rounded border border-slate-700 bg-slate-900/80 p-4">
        <h1 className="text-xl font-bold text-amber-300">
          Rolet NEAR — Dev FC Key Lab (T-201 / T-203 / T-204)
        </h1>
        <p className="mt-1 text-slate-300">
          Network: <strong>{envConfig.networkId}</strong> · RPC:{" "}
          <span className="text-sky-300">{envConfig.rpcUrl}</span>
        </p>
        <label className="mt-3 block text-xs text-slate-400">
          Contract ID (`NEXT_PUBLIC_ROLET_CONTRACT`):
          <input
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
            placeholder="rolet.testnet"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
          />
        </label>
      </header>

      {/* 1. Connect / sign out */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4">
        <h2 className="font-bold text-slate-100">1. Connect / Sign Out (MNW & Meteor)</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !modal}
            onClick={() => modal?.show()}
            className="rounded bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
          >
            Connect Wallet
          </button>
          <button
            type="button"
            disabled={busy || !accountId}
            onClick={handleSignOut}
            className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 disabled:opacity-50"
          >
            Sign Out
          </button>
          <span className="text-slate-300">
            Account: <strong>{accountId ?? "not connected"}</strong> · Wallet:{" "}
            <strong>{walletId ?? "-"}</strong>
          </span>
        </div>
      </section>

      {/* 2. Key status */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-100">2. Key Status</h2>
          <button
            type="button"
            onClick={() => void refreshKeyStatus()}
            className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-200"
          >
            Refresh
          </button>
        </div>
        <div className="grid gap-1 text-xs text-slate-300">
          <div>Stored publicKey: {storedRecord?.publicKey ?? "none"}</div>
          <div>Chain status (view_access_key): {onChainStatus}</div>
          <div>Decision (decideKeyAction): {decision}</div>
          <div>
            Browser keystore key names (names only):{" "}
            {keystoreKeys.length > 0 ? keystoreKeys.join(", ") : "none"}
          </div>
        </div>
      </section>

      {/* 3. signIn(methodNames) and fallback AddKey */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 space-y-2">
        <h2 className="font-bold text-slate-100">3. Obtaining an FC Key</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || !contractId}
            onClick={handleSignInWithMethods}
            className="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
          >
            signIn(methodNames)
          </button>
          <button
            type="button"
            disabled={busy || !accountId || !contractId}
            onClick={handleAddKeyFallback}
            className="rounded bg-emerald-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
          >
            Fallback AddKey
          </button>
        </div>
      </section>

      {/* 4. buy_character */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 space-y-2">
        <h2 className="font-bold text-slate-100">4. buy_character (wallet, 1 NEAR)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={charKind}
            onChange={(e) => setCharKind(e.target.value as CharacterKind)}
            className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
          >
            <option value="Kuleci">Kuleci</option>
            <option value="Ayarci">Ayarci</option>
            <option value="Kacak">Kacak</option>
          </select>
          <button
            type="button"
            disabled={busy || !accountId || !contractId}
            onClick={handleBuyCharacter}
            className="rounded bg-violet-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
          >
            buy_character (1 NEAR)
          </button>
        </div>
      </section>

      {/* 5 & 6. Match fields, join -> cancel, join, reveal, fire */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 space-y-3">
        <h2 className="font-bold text-slate-100">5 & 6. Match Calls with FC Key</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">
            match_id
            <input
              value={matchIdInput}
              onChange={(e) => setMatchIdInput(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            opponent
            <input
              value={opponentInput}
              onChange={(e) => setOpponentInput(e.target.value)}
              placeholder="bob.testnet"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            token_id
            <input
              value={tokenIdInput}
              onChange={(e) => setTokenIdInput(e.target.value)}
              placeholder="kuleci:1"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !storedRecord}
            onClick={handleJoinAndCancel}
            className="rounded bg-amber-400 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
          >
            join → cancel
          </button>
          <button
            type="button"
            disabled={busy || !storedRecord}
            onClick={handleJoin}
            className="rounded border border-sky-500 px-3 py-1.5 text-sky-300 disabled:opacity-50"
          >
            join
          </button>
          <button
            type="button"
            disabled={busy || !storedRecord}
            onClick={handleReveal}
            className="rounded border border-emerald-500 px-3 py-1.5 text-emerald-300 disabled:opacity-50"
          >
            reveal
          </button>
          <select
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value as Target)}
            className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-slate-100"
          >
            <option value="Opponent">Opponent</option>
            <option value="SelfTarget">SelfTarget</option>
          </select>
          <button
            type="button"
            disabled={busy || !storedRecord}
            onClick={handleFire}
            className="rounded bg-rose-500 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            fire
          </button>
          <button
            type="button"
            disabled={busy || !contractId}
            onClick={handleFetchMatch}
            className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 disabled:opacity-50"
          >
            get_match
          </button>
        </div>

        {actionsJson && (
          <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-emerald-300">
            {JSON.stringify(actionsJson, null, 2)}
          </pre>
        )}
        {matchSnapshot && (
          <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-sky-300">
            {JSON.stringify(matchSnapshot, null, 2)}
          </pre>
        )}
      </section>

      {/* 7. Measure */}
      <section className="rounded border border-slate-700 bg-slate-900/70 p-4 space-y-2">
        <h2 className="font-bold text-slate-100">7. Allowance Drop Measurement</h2>
        <button
          type="button"
          disabled={busy || !storedRecord}
          onClick={handleMeasureJoinCancel}
          className="rounded border border-amber-400 px-3 py-1.5 text-amber-300 disabled:opacity-50"
        >
          Measure (join → cancel)
        </button>
        {measureResult && (
          <div className="text-xs text-slate-300 space-y-1">
            <div>Before: {formatYoctoAsNear(measureResult.before)}</div>
            <div>After: {formatYoctoAsNear(measureResult.after)}</div>
            <div>Delta: {formatYoctoAsNear(measureResult.delta)}</div>
          </div>
        )}
      </section>

      {/* Log */}
      <section className="rounded border border-slate-800 bg-slate-950 p-4">
        <h2 className="font-bold text-slate-300">Transaction Log</h2>
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
          {statusLog.map((entry, idx) => (
            <li key={`${idx}-${entry}`}>{entry}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
