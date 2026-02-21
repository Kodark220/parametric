"use client";

import { useMemo, useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/genlayer/wallet";
import {
  useCreatePolicyOffer,
  usePayPremium,
  usePayPremiumForBuyer,
  usePolicies,
  useVerifyAndSettlePolicy,
  useWithdrawableBalance,
} from "@/lib/hooks/useDroughtCover";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getAdminWallets(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_WALLETS || "";
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

export default function HomePage() {
  const { address } = useWallet();
  const { data: policies = [] } = usePolicies();
  const { data: withdrawable = 0 } = useWithdrawableBalance();

  const createOffer = useCreatePolicyOffer();
  const payPremium = usePayPremium();
  const payPremiumForBuyer = usePayPremiumForBuyer();
  const verifyAndSettle = useVerifyAndSettlePolicy();

  const [createForm, setCreateForm] = useState({
    policyId: "demo-001",
    buyerAddress: address ?? "",
    location: "Lagos, NG",
    startDate: "2026-02-13",
    endDate: "2026-02-19",
    thresholdMm: "20",
    payoutUsd: "1000",
    premiumUsd: "50",
  });
  const [activateForm, setActivateForm] = useState({
    policyId: "demo-001",
    premiumUsd: "50",
  });

  const [liveVerifyForm, setLiveVerifyForm] = useState({
    policyId: "demo-001",
    sourceAUrl: "https://open-meteo.com/en/docs/climate-api",
    sourceBUrl: "https://www.weatherapi.com/docs/",
    tolerance: "5",
    currentDate: todayDate(),
  });

  const adminWallets = useMemo(() => getAdminWallets(), []);
  const isAdminWallet = useMemo(
    () => !!address && adminWallets.includes(address.toLowerCase()),
    [address, adminWallets]
  );
  const isProviderWallet = useMemo(
    () => policies.some((p) => sameAddress(p.provider, address)),
    [policies, address]
  );
  const hasFullAccess = isAdminWallet || isProviderWallet;

  const availablePolicies = useMemo(
    () => policies.filter((p) => p.status === "FUNDED"),
    [policies]
  );
  const visibleAvailablePolicies = useMemo(
    () =>
      hasFullAccess
        ? availablePolicies
        : availablePolicies.filter(
            (p) => sameAddress(p.buyer, address) || sameAddress(p.buyer, ZERO_ADDRESS)
          ),
    [hasFullAccess, availablePolicies, address]
  );

  const myPolicies = useMemo(
    () =>
      policies.filter(
        (p) =>
          sameAddress(p.buyer, address) || sameAddress(p.provider, address)
      ),
    [policies, address]
  );

  const createPolicy = () => {
    createOffer.mutate({
      policyId: createForm.policyId,
      buyerAddress: createForm.buyerAddress || address || "",
      region: createForm.location,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      thresholdMm: Number(createForm.thresholdMm),
      payoutAmount: Number(createForm.payoutUsd),
      premiumAmount: Number(createForm.premiumUsd),
      collateralAmount: Number(createForm.payoutUsd),
    });
  };

  const applyAgricultureTemplate = () => {
    setCreateForm({
      policyId: "agri-drought-001",
      buyerAddress: address ?? "",
      location: "Kaduna, NG",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      thresholdMm: "20",
      payoutUsd: "1000",
      premiumUsd: "50",
    });
    setActivateForm({
      policyId: "agri-drought-001",
      premiumUsd: "50",
    });
    setLiveVerifyForm((p) => ({
      ...p,
      policyId: "agri-drought-001",
      currentDate: todayDate(),
    }));
  };

  const applyEventsTemplate = () => {
    setCreateForm({
      policyId: "event-rain-001",
      buyerAddress: address ?? "",
      location: "Lagos, NG",
      startDate: "2026-04-10",
      endDate: "2026-04-16",
      thresholdMm: "60",
      payoutUsd: "2000",
      premiumUsd: "120",
    });
    setActivateForm({
      policyId: "event-rain-001",
      premiumUsd: "120",
    });
    setLiveVerifyForm((p) => ({
      ...p,
      policyId: "event-rain-001",
      currentDate: todayDate(),
    }));
  };

  const activateFromPolicy = (policyId: string, premiumAmount: number) => {
    payPremium.mutate({
      policyId,
      premiumPayment: premiumAmount,
    });
  };

  const sponsorFromPolicy = (policyId: string, premiumAmount: number) => {
    payPremiumForBuyer.mutate({
      policyId,
      premiumPayment: premiumAmount,
    });
  };

  const verifyLive = () => {
    verifyAndSettle.mutate({
      policyId: liveVerifyForm.policyId,
      sourceAUrl: liveVerifyForm.sourceAUrl,
      sourceBUrl: liveVerifyForm.sourceBUrl,
      toleranceMm: Number(liveVerifyForm.tolerance),
      currentDate: liveVerifyForm.currentDate,
    });
  };

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="glass-card rounded-xl p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Proofpay</h1>
              <p className="text-sm text-muted-foreground">
                Demo UI using live GenLayer contract execution.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mode: Demo presentation | Execution: Live GenLayer contract
              </p>
              <p className="mt-2 text-sm">
                Role:{" "}
                <span className="font-semibold">
                  {hasFullAccess ? "Provider/Admin" : "Buyer (Limited)"}
                </span>
              </p>
              <p className="text-sm">
                Withdrawable balance:{" "}
                <span className="font-semibold">{withdrawable}</span>
              </p>
            </div>
            <AccountPanel />
          </div>
        </header>

        {hasFullAccess ? (
          <section className="grid gap-6 md:grid-cols-3">
            <article className="glass-card rounded-xl p-5">
              <h2 className="text-lg font-semibold">Create Policy</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Provider/Admin only.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={applyAgricultureTemplate}>
                  Agriculture: Drought Cover
                </Button>
                <Button size="sm" variant="outline" onClick={applyEventsTemplate}>
                  Events: Rain Disruption Cover
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="policyId">Policy ID</Label>
                <Input id="policyId" value={createForm.policyId} onChange={(e) => setCreateForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={createForm.location} onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))} />
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" value={createForm.startDate} onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))} />
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" value={createForm.endDate} onChange={(e) => setCreateForm((p) => ({ ...p, endDate: e.target.value }))} />
                <Label htmlFor="thresholdMm">Threshold (mm)</Label>
                <Input id="thresholdMm" value={createForm.thresholdMm} onChange={(e) => setCreateForm((p) => ({ ...p, thresholdMm: e.target.value }))} />
                <Label htmlFor="payoutUsd">Payout (USD)</Label>
                <Input id="payoutUsd" value={createForm.payoutUsd} onChange={(e) => setCreateForm((p) => ({ ...p, payoutUsd: e.target.value }))} />
                <Label htmlFor="premiumUsd">Premium (USD)</Label>
                <Input id="premiumUsd" value={createForm.premiumUsd} onChange={(e) => setCreateForm((p) => ({ ...p, premiumUsd: e.target.value }))} />
                <Label htmlFor="buyerAddress">Buyer Address</Label>
                <Input id="buyerAddress" value={createForm.buyerAddress} onChange={(e) => setCreateForm((p) => ({ ...p, buyerAddress: e.target.value }))} placeholder={address ?? "0x..."} />
                <p className="text-xs text-muted-foreground">
                  Leave buyer address empty to create an open offer anyone can buy.
                </p>
                <Button className="w-full" onClick={createPolicy} disabled={createOffer.isPending}>
                  {createOffer.isPending ? "Creating..." : "Create Policy"}
                </Button>
              </div>
            </article>

            <article className="glass-card rounded-xl p-5">
              <h2 className="text-lg font-semibold">Activate Coverage</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Provider/Admin view. Buyer can activate, or provider can sponsor.
              </p>
              <div className="space-y-2">
                <Label htmlFor="activatePolicyId">Policy ID</Label>
                <Input id="activatePolicyId" value={activateForm.policyId} onChange={(e) => setActivateForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="activatePremium">Premium</Label>
                <Input id="activatePremium" value={activateForm.premiumUsd} onChange={(e) => setActivateForm((p) => ({ ...p, premiumUsd: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => activateFromPolicy(activateForm.policyId, Number(activateForm.premiumUsd))}
                    disabled={payPremium.isPending}
                  >
                    {payPremium.isPending ? "Activating..." : "Buyer Activates"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => sponsorFromPolicy(activateForm.policyId, Number(activateForm.premiumUsd))}
                    disabled={payPremiumForBuyer.isPending}
                  >
                    {payPremiumForBuyer.isPending ? "Sponsoring..." : "Sponsor Activation"}
                  </Button>
                </div>
              </div>
            </article>

            <article className="glass-card rounded-xl p-5">
              <h2 className="text-lg font-semibold">Run GenLayer Verification (Demo Live)</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                Provider/Admin only. This demo calls live `verify_and_settle_policy` on-chain.
              </p>
              <div className="space-y-2">
                <Label htmlFor="livePolicyId">Policy ID</Label>
                <Input id="livePolicyId" value={liveVerifyForm.policyId} onChange={(e) => setLiveVerifyForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="sourceAUrl">Source A URL</Label>
                <Input id="sourceAUrl" value={liveVerifyForm.sourceAUrl} onChange={(e) => setLiveVerifyForm((p) => ({ ...p, sourceAUrl: e.target.value }))} />
                <Label htmlFor="sourceBUrl">Source B URL</Label>
                <Input id="sourceBUrl" value={liveVerifyForm.sourceBUrl} onChange={(e) => setLiveVerifyForm((p) => ({ ...p, sourceBUrl: e.target.value }))} />
                <Label htmlFor="liveTolerance">Tolerance (mm)</Label>
                <Input id="liveTolerance" value={liveVerifyForm.tolerance} onChange={(e) => setLiveVerifyForm((p) => ({ ...p, tolerance: e.target.value }))} />
                <Label htmlFor="liveDate">Current Date</Label>
                <Input id="liveDate" value={liveVerifyForm.currentDate} onChange={(e) => setLiveVerifyForm((p) => ({ ...p, currentDate: e.target.value }))} />
                <Button className="w-full" onClick={verifyLive} disabled={verifyAndSettle.isPending}>
                  {verifyAndSettle.isPending ? "Submitting..." : "Verify & Settle"}
                </Button>
              </div>
            </article>
          </section>
        ) : (
          <section className="glass-card rounded-xl p-5">
            <h2 className="text-lg font-semibold">Buyer View</h2>
            <p className="text-sm text-muted-foreground">
              You can only view and activate policies assigned to your wallet.
            </p>
          </section>
        )}

        <section className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold">Available Policies</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFullAccess
              ? "Funded policies waiting for activation."
              : "Policies assigned to your wallet, plus open offers you can buy."}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className="py-2 pr-3">Policy</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Window</th>
                  <th className="py-2 pr-3">Premium</th>
                  <th className="py-2 pr-3">Buyer</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleAvailablePolicies.map((policy) => {
                  const isOpenOffer = sameAddress(policy.buyer, ZERO_ADDRESS);
                  const canBuyerActivate = sameAddress(policy.buyer, address) || isOpenOffer;
                  const canProviderSponsor = hasFullAccess && sameAddress(policy.provider, address);
                  return (
                    <tr key={policy.id} className="border-b border-white/5 align-top">
                      <td className="py-3 pr-3">{policy.id}</td>
                      <td className="py-3 pr-3">{policy.region}</td>
                      <td className="py-3 pr-3">{policy.start_date} to {policy.end_date}</td>
                      <td className="py-3 pr-3">{policy.premium_amount}</td>
                      <td className="py-3 pr-3">{isOpenOffer ? "OPEN" : policy.buyer}</td>
                      <td className="py-3 pr-3">{policy.provider}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!canBuyerActivate || payPremium.isPending}
                            onClick={() => activateFromPolicy(policy.id, policy.premium_amount)}
                          >
                            Activate
                          </Button>
                          {hasFullAccess ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canProviderSponsor || payPremiumForBuyer.isPending}
                              onClick={() => sponsorFromPolicy(policy.id, policy.premium_amount)}
                            >
                              Sponsor
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleAvailablePolicies.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={7}>
                      {hasFullAccess
                        ? "No funded policies available right now."
                        : "No policies are currently assigned to your wallet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-card rounded-xl p-6">
          <h3 className="text-lg font-semibold">My Policies</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Policies where your wallet is buyer or provider.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className="py-2 pr-3">Policy</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Decision</th>
                  <th className="py-2 pr-3">Premium Payer</th>
                  <th className="py-2">Proof</th>
                </tr>
              </thead>
              <tbody>
                {myPolicies.map((policy) => {
                  const role = sameAddress(policy.buyer, address)
                    ? "Buyer"
                    : sameAddress(policy.provider, address)
                      ? "Provider"
                      : "-";
                  return (
                    <tr key={policy.id} className="border-b border-white/5">
                      <td className="py-3 pr-3">{policy.id}</td>
                      <td className="py-3 pr-3">{role}</td>
                      <td className="py-3 pr-3">{policy.status}</td>
                      <td className="py-3 pr-3">{policy.settlement_result}</td>
                      <td className="py-3 pr-3">{policy.premium_payer || "-"}</td>
                      <td className="py-3">{policy.settlement_proof_hash || "-"}</td>
                    </tr>
                  );
                })}
                {myPolicies.length === 0 ? (
                  <tr>
                    <td className="py-3 text-muted-foreground" colSpan={6}>
                      Connect wallet to see your policies.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
