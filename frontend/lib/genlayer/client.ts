"use client";

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { createWalletClient, custom, type WalletClient } from "viem";

export type WalletType = "metamask" | "okx";

export const GENLAYER_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID || "61999"
);
export const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID
  .toString(16)
  .toUpperCase()}`;

export const GENLAYER_NETWORK = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_NAME || "GenLayer Studio",
  nativeCurrency: {
    name: process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN",
    symbol: process.env.NEXT_PUBLIC_GENLAYER_SYMBOL || "GEN",
    decimals: 18,
  },
  rpcUrls: [process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api"],
  blockExplorerUrls: [],
};

interface EthereumProvider {
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  providers?: EthereumProvider[];
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    okxwallet?: { ethereum?: EthereumProvider };
  }
}

function getInjectedProviders(): EthereumProvider[] {
  if (typeof window === "undefined" || !window.ethereum) return [];
  if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
    return window.ethereum.providers;
  }
  return [window.ethereum];
}

export function getStudioUrl(): string {
  return process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";
}

export function getContractAddress(): string {
  return process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
}

export function getEthereumProvider(wallet: WalletType = "metamask"): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const providers = getInjectedProviders();

  if (wallet === "okx") {
    return (
      window.okxwallet?.ethereum ||
      providers.find((p) => !!p.isOkxWallet) ||
      (window.ethereum?.isOkxWallet ? window.ethereum : null) ||
      null
    );
  }

  return (
    providers.find((p) => !!p.isMetaMask) ||
    (window.ethereum?.isMetaMask ? window.ethereum : null) ||
    null
  );
}

export function isMetaMaskInstalled(): boolean {
  return !!getEthereumProvider("metamask");
}

export function isOkxInstalled(): boolean {
  return !!getEthereumProvider("okx");
}

export function getAvailableWallets(): WalletType[] {
  const wallets: WalletType[] = [];
  if (isMetaMaskInstalled()) wallets.push("metamask");
  if (isOkxInstalled()) wallets.push("okx");
  return wallets;
}

export async function requestAccounts(
  wallet: WalletType,
  options?: { forcePrompt?: boolean }
): Promise<string[]> {
  const provider = getEthereumProvider(wallet);
  if (!provider) {
    throw new Error(`${wallet === "okx" ? "OKX" : "MetaMask"} is not installed`);
  }

  try {
    if (options?.forcePrompt) {
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        // Some wallets don't support forced permissions prompt.
      }
    }
    return await provider.request({ method: "eth_requestAccounts" });
  } catch (error: any) {
    if (error.code === 4001) throw new Error("User rejected the connection request");
    throw new Error(`Failed to connect wallet: ${error.message}`);
  }
}

export async function getAccounts(wallet: WalletType = "metamask"): Promise<string[]> {
  const provider = getEthereumProvider(wallet);
  if (!provider) return [];
  try {
    return await provider.request({ method: "eth_accounts" });
  } catch {
    return [];
  }
}

export async function getCurrentChainId(wallet: WalletType): Promise<string | null> {
  const provider = getEthereumProvider(wallet);
  if (!provider) return null;
  try {
    return await provider.request({ method: "eth_chainId" });
  } catch {
    return null;
  }
}

export async function addGenLayerNetwork(wallet: WalletType): Promise<void> {
  const provider = getEthereumProvider(wallet);
  if (!provider) {
    throw new Error(`${wallet === "okx" ? "OKX" : "MetaMask"} is not installed`);
  }
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [GENLAYER_NETWORK],
  });
}

export async function switchToGenLayerNetwork(wallet: WalletType): Promise<void> {
  const provider = getEthereumProvider(wallet);
  if (!provider) {
    throw new Error(`${wallet === "okx" ? "OKX" : "MetaMask"} is not installed`);
  }
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (error: any) {
    if (error.code === 4902) {
      await addGenLayerNetwork(wallet);
      return;
    }
    if (error.code === 4001) {
      throw new Error("User rejected switching the network");
    }
    throw new Error(`Failed to switch network: ${error.message}`);
  }
}

export async function isOnGenLayerNetwork(wallet: WalletType): Promise<boolean> {
  const chainId = await getCurrentChainId(wallet);
  if (!chainId) return false;
  return parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
}

export async function switchAccount(wallet: WalletType): Promise<string> {
  const provider = getEthereumProvider(wallet);
  if (!provider) {
    throw new Error(`${wallet === "okx" ? "OKX" : "MetaMask"} is not installed`);
  }

  try {
    await provider.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Not all wallets support this method; fallback below.
  }

  const accounts = await requestAccounts(wallet, { forcePrompt: true });
  if (!accounts?.length) throw new Error("No account selected");
  return accounts[0];
}

export function createMetaMaskWalletClient(): WalletClient | null {
  const provider = getEthereumProvider("metamask");
  if (!provider) return null;
  try {
    return createWalletClient({
      chain: studionet as any,
      transport: custom(provider),
    });
  } catch {
    return null;
  }
}

export function createGenLayerClient(address?: string) {
  const config: any = { chain: studionet };
  if (address) config.account = address as `0x${string}`;
  return createClient(config);
}

export async function getClient() {
  const accounts = await getAccounts("metamask");
  return createGenLayerClient(accounts[0]);
}
