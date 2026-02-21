"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DroughtCover from "@/lib/contracts/DroughtCover";
import { getContractAddress, getStudioUrl } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet";
import { configError, error, success } from "@/lib/utils/toast";
import type { DroughtPolicy } from "@/lib/contracts/types";

function useDroughtCoverContract(): DroughtCover | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  return useMemo(() => {
    if (!contractAddress) {
      configError(
        "Setup Required",
        "Set NEXT_PUBLIC_CONTRACT_ADDRESS in frontend/.env to use the dApp."
      );
      return null;
    }
    return new DroughtCover(contractAddress, address, studioUrl);
  }, [address, contractAddress, studioUrl]);
}

export function usePolicies() {
  const contract = useDroughtCoverContract();
  return useQuery<DroughtPolicy[], Error>({
    queryKey: ["policies"],
    queryFn: async () => (contract ? contract.getAllPolicies() : []),
    enabled: !!contract,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });
}

export function useWithdrawableBalance() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  return useQuery<number, Error>({
    queryKey: ["withdrawable", address],
    queryFn: async () =>
      contract && address ? contract.getWithdrawableBalance(address) : 0,
    enabled: !!contract && !!address,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });
}

export function useCreatePolicyOffer() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      policyId: string;
      buyerAddress: string;
      region: string;
      startDate: string;
      endDate: string;
      thresholdMm: number;
      payoutAmount: number;
      premiumAmount: number;
      collateralAmount: number;
    }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Connect wallet first");
      return contract.createPolicyOffer(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      success("Policy offer created");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create policy offer";
      error("Create policy offer failed", { description: message });
    },
  });
}

export function usePayPremium() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { policyId: string; premiumPayment: number }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Connect wallet first");
      return contract.payPremium(input.policyId, input.premiumPayment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawable"] });
      success("Premium paid. Policy is now active.");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to pay premium";
      error("Pay premium failed", { description: message });
    },
  });
}

export function usePayPremiumForBuyer() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { policyId: string; premiumPayment: number }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Connect wallet first");
      return contract.payPremiumForBuyer(input.policyId, input.premiumPayment);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawable"] });
      success("Coverage activated by provider sponsorship.");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to sponsor premium";
      error("Sponsor activation failed", { description: message });
    },
  });
}

export function useResolvePolicyWithValues() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      policyId: string;
      sourceAMm: number;
      sourceBMm: number;
      toleranceMm: number;
      currentDate: string;
    }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Connect wallet first");
      return contract.resolvePolicyWithValues(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawable"] });
      success("Policy resolved");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to resolve policy";
      error("Resolve policy failed", { description: message });
    },
  });
}

export function useVerifyAndSettlePolicy() {
  const contract = useDroughtCoverContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      policyId: string;
      sourceAUrl: string;
      sourceBUrl: string;
      toleranceMm: number;
      currentDate: string;
    }) => {
      if (!contract) throw new Error("Contract not configured");
      if (!address) throw new Error("Connect wallet first");
      return contract.verifyAndSettlePolicy(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["withdrawable"] });
      success("Live verification submitted");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to run live verification";
      error("Live verification failed", { description: message });
    },
  });
}
