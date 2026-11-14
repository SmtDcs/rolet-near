"use client";

import "@near-wallet-selector/modal-ui/styles.css";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  setupWalletSelector,
  type AccountState,
  type WalletSelector,
} from "@near-wallet-selector/core";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { GAME_METHODS, readNearConfig, type NearConfig } from "@/lib/nearConfig";
import { signOutKey } from "@/lib/nearKeyFlow";

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

export interface NearWalletContextValue {
  selector: WalletSelector | null;
  modal: WalletSelectorModal | null;
  accounts: AccountState[];
  accountId: string | null;
  walletId: string | null;
  connected: boolean;
  ready: boolean;
  config: NearConfig;
  connect: () => void;
  disconnect: () => Promise<void>;
}

const NearWalletContext = createContext<NearWalletContextValue | null>(null);

export function NearProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readNearConfig(), []);
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accounts, setAccounts] = useState<AccountState[]>([]);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    async function init() {
      const preset = NETWORK_PRESETS[config.networkId];
      const contractId = config.contractId || undefined;
      const ws = await setupWalletSelector({
        network: {
          networkId: config.networkId,
          nodeUrl: config.rpcUrl,
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
        contractId,
        methodNames: contractId ? [...GAME_METHODS] : undefined,
        theme: "dark",
      });

      const sync = () => {
        const st = ws.store.getState();
        setAccounts(st.accounts);
        setWalletId(st.selectedWalletId ?? null);
      };

      sync();
      const sub = ws.store.observable.subscribe(() => {
        sync();
      });
      unsub = () => sub.unsubscribe();

      setSelector(ws);
      setModal(m);
      setReady(true);
    }

    init().catch(() => {
      if (active) setReady(true);
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, [config]);

  const activeAccount =
    accounts.find((a) => a.active) ?? accounts[0] ?? null;
  const accountId = activeAccount?.accountId ?? null;

  const connect = useCallback(() => {
    modal?.show();
  }, [modal]);

  const disconnect = useCallback(async () => {
    if (accountId && config.contractId && typeof window !== "undefined") {
      signOutKey(window.localStorage, accountId, config.contractId);
    }
    if (!selector) return;
    try {
      const wallet = await selector.wallet();
      await wallet.signOut();
    } catch {
      // Ignore disconnect errors when no active wallet is loaded.
    }
  }, [accountId, config.contractId, selector]);

  const value = useMemo<NearWalletContextValue>(
    () => ({
      selector,
      modal,
      accounts,
      accountId,
      walletId,
      connected: accountId !== null,
      ready,
      config,
      connect,
      disconnect,
    }),
    [selector, modal, accounts, accountId, walletId, ready, config, connect, disconnect],
  );

  return (
    <NearWalletContext.Provider value={value}>
      {children}
    </NearWalletContext.Provider>
  );
}

export function useNearWallet(): NearWalletContextValue {
  const ctx = useContext(NearWalletContext);
  if (!ctx) {
    throw new Error("useNearWallet must be used inside NearProvider");
  }
  return ctx;
}
