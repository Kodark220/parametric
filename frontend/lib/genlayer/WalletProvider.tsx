"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import {
  type WalletType,
  requestAccounts,
  switchAccount,
  switchToGenLayerNetwork,
  isOnGenLayerNetwork,
  getEthereumProvider,
  isMetaMaskInstalled,
  isOkxInstalled,
  getAvailableWallets,
  getCurrentChainId,
  GENLAYER_CHAIN_ID,
} from "./client";

export interface WalletState {
  address: string | null;
  walletType: WalletType | null;
  // Compatibility alias used by current UI.
  selectedWallet: WalletType | null;
  chainId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  isMetaMaskInstalled: boolean;
  isOkxInstalled: boolean;
  availableWallets: WalletType[];
  isOnCorrectNetwork: boolean;
}

interface WalletContextValue extends WalletState {
  connectWallet: (wallet: WalletType) => Promise<string>;
  disconnectWallet: () => void;
  switchWalletAccount: () => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState(false);

  // Strict mode: never auto-restore wallet state on page load.
  useEffect(() => {}, []);

  useEffect(() => {
    if (!walletType) return;
    const provider = getEthereumProvider(walletType);
    if (!provider) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAddress(null);
        setWalletType(null);
        setChainId(null);
        setIsOnCorrectNetwork(false);
      } else {
        setAddress(accounts[0]);
      }
    };

    const handleChainChanged = (newChainId: string) => {
      setChainId(newChainId);
      setIsOnCorrectNetwork(parseInt(newChainId, 16) === GENLAYER_CHAIN_ID);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("chainChanged", handleChainChanged);
    };
  }, [walletType]);

  // Explicit user action only.
  const connectWallet = useCallback(async (wallet: WalletType): Promise<string> => {
    setIsLoading(true);
    try {
      const accounts = await requestAccounts(wallet, { forcePrompt: true });
      if (!accounts.length) throw new Error("No account returned");

      const account = accounts[0];
      setAddress(account);
      setWalletType(wallet);

      const currentChain = await getCurrentChainId(wallet);
      setChainId(currentChain);

      const onCorrect = await isOnGenLayerNetwork(wallet);
      if (!onCorrect) {
        await switchToGenLayerNetwork(wallet);
      }
      setIsOnCorrectNetwork(true);

      return account;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAddress(null);
    setWalletType(null);
    setChainId(null);
    setIsOnCorrectNetwork(false);
  }, []);

  const switchWalletAccount = useCallback(async (): Promise<string> => {
    if (!walletType) throw new Error("No wallet connected");
    setIsLoading(true);
    try {
      const account = await switchAccount(walletType);
      setAddress(account);
      return account;
    } finally {
      setIsLoading(false);
    }
  }, [walletType]);

  const value: WalletContextValue = {
    address,
    walletType,
    selectedWallet: walletType,
    chainId,
    isConnected: !!address,
    isLoading,
    isMetaMaskInstalled: isMetaMaskInstalled(),
    isOkxInstalled: isOkxInstalled(),
    availableWallets: getAvailableWallets(),
    isOnCorrectNetwork,
    connectWallet,
    disconnectWallet,
    switchWalletAccount,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
