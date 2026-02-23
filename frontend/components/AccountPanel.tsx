"use client";

import { useState } from "react";
import { User, LogOut, AlertCircle, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import type { WalletType } from "@/lib/genlayer/client";
import { error, userRejected } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

const METAMASK_INSTALL_URL = "https://metamask.io/download/";
const OKX_INSTALL_URL = "https://www.okx.com/web3";

export function AccountPanel() {
  const {
    address,
    isConnected,
    isMetaMaskInstalled,
    isOkxInstalled,
    selectedWallet,
    isOnCorrectNetwork,
    isLoading,
    connectWallet,
    disconnectWallet,
    switchWalletAccount,
  } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleConnect = async (wallet: WalletType) => {
    try {
      setIsConnecting(true);
      setConnectionError("");
      await connectWallet(wallet);
      setIsModalOpen(false);
    } catch (err: any) {
      setConnectionError(err.message || "Failed to connect wallet");
      if (err.message?.includes("rejected")) {
        userRejected("Connection cancelled");
      } else {
        error("Failed to connect wallet", {
          description: err.message || "Please check your wallet and try again.",
        });
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setIsModalOpen(false);
  };

  const handleSwitchAccount = async () => {
    try {
      setIsSwitching(true);
      setConnectionError("");
      await switchWalletAccount();
    } catch (err: any) {
      if (!err.message?.includes("rejected")) {
        setConnectionError(err.message || "Failed to switch account");
        error("Failed to switch account", {
          description: err.message || "Please try again.",
        });
      } else {
        userRejected("Account switch cancelled");
      }
    } finally {
      setIsSwitching(false);
    }
  };

  if (!isConnected) {
    return (
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
          <Button variant="gradient" disabled={isLoading}>
            <User className="w-4 h-4 mr-2" />
            Connect Wallet
          </Button>
        </DialogTrigger>
        <DialogContent className="brand-card border-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Connect Wallet</DialogTitle>
            <DialogDescription>Choose your wallet and continue.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {!isMetaMaskInstalled && !isOkxInstalled ? (
              <>
                <Alert variant="default" className="bg-accent/10 border-accent/20">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No wallet detected</AlertTitle>
                  <AlertDescription>
                    Install MetaMask or OKX wallet extension to continue.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => window.open(METAMASK_INSTALL_URL, "_blank")}
                    variant="outline"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    MetaMask
                  </Button>
                  <Button onClick={() => window.open(OKX_INSTALL_URL, "_blank")} variant="outline">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    OKX
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {isMetaMaskInstalled ? (
                  <Button
                    onClick={() => handleConnect("metamask")}
                    variant="gradient"
                    className="w-full"
                    disabled={isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Connect MetaMask"}
                  </Button>
                ) : null}
                {isOkxInstalled ? (
                  <Button
                    onClick={() => handleConnect("okx")}
                    variant="outline"
                    className="w-full"
                    disabled={isConnecting}
                  >
                    {isConnecting ? "Connecting..." : "Connect OKX"}
                  </Button>
                ) : null}
              </div>
            )}

            {connectionError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Connection Error</AlertTitle>
                <AlertDescription>{connectionError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <div className="flex items-center gap-4">
        <div className="brand-card px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-accent" />
            <AddressDisplay address={address} maxLength={12} />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="text-xs text-muted-foreground">
            {selectedWallet === "okx" ? "OKX" : "MetaMask"}
          </div>
        </div>

        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <User className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="brand-card border-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Wallet Details</DialogTitle>
          <DialogDescription>Your connected wallet information</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="brand-card p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Address</p>
            <code className="text-sm font-mono break-all">{address}</code>
          </div>

          <div className="brand-card p-4 space-y-2">
            <p className="text-sm text-muted-foreground">Network Status</p>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnCorrectNetwork ? "bg-green-500" : "bg-yellow-500 animate-pulse"
                }`}
              />
              <span className="text-sm">
                {isOnCorrectNetwork ? "Connected to GenLayer" : "Wrong Network"}
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 space-y-3">
            <Button
              onClick={handleSwitchAccount}
              variant="outline"
              className="w-full"
              disabled={isSwitching || isLoading}
            >
              {isSwitching ? "Switching..." : "Switch Account"}
            </Button>
            <Button
              onClick={handleDisconnect}
              className="w-full text-destructive hover:text-destructive"
              variant="outline"
              disabled={isSwitching || isLoading}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Disconnect Wallet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
