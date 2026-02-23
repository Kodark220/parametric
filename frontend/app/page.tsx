"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/genlayer/wallet";
import type { WalletType } from "@/lib/genlayer/client";
import {
  useCreatePolicyOffer,
  useCreateValidatorPolicyOffer,
  usePayPremium,
  usePayPremiumForBuyer,
  usePolicies,
  useVerifyAndSettlePolicy,
  useVerifyAndSettleValidatorPolicy,
  useWithdrawableBalance,
} from "@/lib/hooks/useDroughtCover";

const SESSION_KEY = "proofpay_auth_session";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const POLICY_EMAIL_ASSIGNMENTS_KEY = "proofpay_policy_email_assignments";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function getAdminWallets(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_WALLETS || "";
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

function getAdminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="brand-card rounded-xl p-5">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </article>
  );
}

const POLICY_TYPE_CATALOG = [
  {
    id: "weather_drought",
    label: "Drought Cover",
    description: "Pays when rainfall is below threshold.",
  },
  {
    id: "event_rainfall",
    label: "Event Rain Cover",
    description: "Weather-based event cover with custom rainfall threshold.",
  },
  {
    id: "validator_downtime",
    label: "Validator Downtime",
    description: "Pays when validator uptime falls below SLA.",
  },
] as const;

function makePolicyId(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const n = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${prefix}-${date}-${n}`;
}

export default function HomePage() {
  const buyerCreatePanelRef = useRef<HTMLElement | null>(null);
  const {
    address,
    isConnected,
    isMetaMaskInstalled,
    isOkxInstalled,
    connectWallet,
    disconnectWallet,
  } = useWallet();
  const { data: policies = [] } = usePolicies();
  const { data: withdrawable = 0 } = useWithdrawableBalance();

  const createOffer = useCreatePolicyOffer();
  const createValidatorOffer = useCreateValidatorPolicyOffer();
  const payPremium = usePayPremium();
  const payPremiumForBuyer = usePayPremiumForBuyer();
  const verifyAndSettle = useVerifyAndSettlePolicy();
  const verifyAndSettleValidator = useVerifyAndSettleValidatorPolicy();

  const [session, setSession] = useState<{ mode: "email" | "wallet"; email?: string } | null>(
    null
  );
  const [authMethod, setAuthMethod] = useState<"email" | "wallet">("email");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [healthCheck, setHealthCheck] = useState<{
    checked: boolean;
    apiReachable: boolean;
    mismatch: boolean;
    apiContract: string;
    error: string;
  }>({
    checked: false,
    apiReachable: false,
    mismatch: false,
    apiContract: "",
    error: "",
  });
  const [autoSettleStatus, setAutoSettleStatus] = useState<{
    loaded: boolean;
    available: boolean;
    running: boolean;
    lastTickAt: string;
    settledCount: number;
    failedCount: number;
    lastError: string;
    message: string;
  }>({
    loaded: false,
    available: false,
    running: false,
    lastTickAt: "",
    settledCount: 0,
    failedCount: 0,
    lastError: "",
    message: "",
  });

  const [createForm, setCreateForm] = useState({
    policyId: "demo-001",
    buyerAddress: address ?? "",
    buyerEmail: "",
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

  const [verifyForm, setVerifyForm] = useState({
    policyId: "demo-001",
    sourceAUrl: "https://open-meteo.com/en/docs/climate-api",
    sourceBUrl: "https://www.weatherapi.com/docs/",
    tolerance: "5",
    currentDate: todayDate(),
  });
  const [validatorCreateForm, setValidatorCreateForm] = useState({
    policyId: "validator-weekly-001",
    buyerAddress: address ?? "",
    buyerEmail: "",
    validatorAddress: "0xValidatorAddress",
    startDate: "2026-03-01",
    endDate: "2026-03-07",
    thresholdUptimeBps: "9800",
    payoutUsd: "1500",
    premiumUsd: "90",
  });
  const [validatorVerifyForm, setValidatorVerifyForm] = useState({
    policyId: "validator-weekly-001",
    sourceAUrl: "https://beaconcha.in",
    sourceBUrl: "https://rated.network",
    toleranceBps: "50",
    currentDate: todayDate(),
  });
  const [policyEmailAssignments, setPolicyEmailAssignments] = useState<Record<string, string>>(
    {}
  );
  const [buyerCreateType, setBuyerCreateType] = useState<"weather_drought" | "event_rainfall" | "validator_downtime">("weather_drought");
  const [buyerFlowTab, setBuyerFlowTab] = useState<"create" | "activate">("create");

  const adminWallets = useMemo(() => getAdminWallets(), []);
  const adminEmails = useMemo(() => getAdminEmails(), []);
  const frontendContractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").toLowerCase();
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const isWalletSession = session?.mode === "wallet";
  const isEmailSession = session?.mode === "email";
  const isAdminWallet = useMemo(
    () => !!address && isWalletSession && adminWallets.includes(address.toLowerCase()),
    [address, adminWallets, isWalletSession]
  );
  const isAdminEmail = useMemo(
    () => !!session?.email && isEmailSession && adminEmails.includes(session.email.toLowerCase()),
    [session?.email, isEmailSession, adminEmails]
  );
  const isProviderWallet = useMemo(
    () => !!address && isWalletSession && policies.some((p) => sameAddress(p.provider, address)),
    [policies, address, isWalletSession]
  );
  const hasFullAccess = isAdminWallet || isAdminEmail || isProviderWallet;

  const sessionEmail = (session?.email || "").toLowerCase();
  const getAssignedEmailForPolicy = (policyId: string): string =>
    (policyEmailAssignments[policyId] || "").toLowerCase();
  const matchesSessionEmail = (policyId: string): boolean =>
    !!sessionEmail && getAssignedEmailForPolicy(policyId) === sessionEmail;

  const availablePolicies = useMemo(
    () => policies.filter((p) => p.status === "FUNDED"),
    [policies]
  );
  const visibleAvailablePolicies = useMemo(
    () => {
      if (hasFullAccess) return availablePolicies;
      if (isWalletSession && address) {
        return availablePolicies.filter((p) => sameAddress(p.buyer, address));
      }
      if (isEmailSession && sessionEmail) {
        return availablePolicies.filter((p) => matchesSessionEmail(p.id));
      }
      return [];
    },
    [hasFullAccess, availablePolicies, isWalletSession, address, isEmailSession, sessionEmail, policyEmailAssignments]
  );
  const myPolicies = useMemo(
    () => {
      if (isWalletSession && address) {
        return policies.filter((p) => sameAddress(p.buyer, address));
      }
      if (isEmailSession && sessionEmail) {
        return policies.filter((p) => matchesSessionEmail(p.id));
      }
      return [];
    },
    [policies, isWalletSession, address, isEmailSession, sessionEmail, policyEmailAssignments]
  );

  const visibleValidatorPolicies = useMemo(
    () => visibleAvailablePolicies.filter((p) => p.policy_type === "validator_downtime"),
    [visibleAvailablePolicies]
  );
  const myValidatorPolicies = useMemo(
    () => myPolicies.filter((p) => p.policy_type === "validator_downtime"),
    [myPolicies]
  );
  const adminBuyerPolicies = useMemo(
    () => (hasFullAccess ? policies : []),
    [hasFullAccess, policies]
  );
  const canUseValidatorDemo =
    hasFullAccess || visibleValidatorPolicies.length > 0 || myValidatorPolicies.length > 0;

  const paidCount = useMemo(
    () => myPolicies.filter((p) => p.status === "PAID").length,
    [myPolicies]
  );
  const activeCount = useMemo(
    () => myPolicies.filter((p) => p.status === "ACTIVE").length,
    [myPolicies]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(POLICY_EMAIL_ASSIGNMENTS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        setPolicyEmailAssignments(parsed);
      }
    } catch {
      // ignore invalid local assignment cache
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { mode: "email" | "wallet"; email?: string };
      // Only auto-restore email sessions. Wallet sessions require explicit reconnect.
      if (parsed?.mode === "email") {
        setSession(parsed);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // ignore invalid session
    }
  }, []);

  useEffect(() => {
    if (!apiBaseUrl) {
      setHealthCheck((prev) => ({
        ...prev,
        checked: true,
        apiReachable: false,
        error: "NEXT_PUBLIC_API_URL not set",
      }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/health`);
        if (!res.ok) throw new Error(`Health check failed (${res.status})`);
        const data = await res.json();
        const apiContract = String(data?.contract_address || "").toLowerCase();
        const mismatch =
          frontendContractAddress.length > 0 &&
          apiContract.length > 0 &&
          frontendContractAddress !== apiContract;
        if (!cancelled) {
          setHealthCheck({
            checked: true,
            apiReachable: true,
            mismatch,
            apiContract,
            error: "",
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setHealthCheck({
            checked: true,
            apiReachable: false,
            mismatch: false,
            apiContract: "",
            error: err?.message || "Unable to reach API health endpoint",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, frontendContractAddress]);

  useEffect(() => {
    if (!apiBaseUrl || !hasFullAccess) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/auto-settle/status`);
        const data = await res.json();
        if (cancelled) return;
        setAutoSettleStatus({
          loaded: true,
          available: !!data?.ok,
          running: !!data?.running,
          lastTickAt: String(data?.last_tick_at || ""),
          settledCount: Number(data?.settled_count || 0),
          failedCount: Number(data?.failed_count || 0),
          lastError: String(data?.last_error || ""),
          message: String(data?.message || ""),
        });
      } catch (err: any) {
        if (cancelled) return;
        setAutoSettleStatus({
          loaded: true,
          available: false,
          running: false,
          lastTickAt: "",
          settledCount: 0,
          failedCount: 0,
          lastError: "",
          message: err?.message || "Auto-settle status unavailable",
        });
      }
    };

    void run();
    const id = setInterval(() => {
      void run();
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiBaseUrl, hasFullAccess]);

  const startEmailSession = () => {
    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    const next = { mode: "email" as const, email };
    setSession(next);
    setEmailError("");
    if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  };

  const startWalletSession = async (wallet: WalletType) => {
    try {
      await connectWallet(wallet);
      const next = { mode: "wallet" as const };
      setSession(next);
      if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // toasts handled by wallet provider
    }
  };

  const logoutSession = () => {
    disconnectWallet();
    setSession(null);
    setAuthMethod("email");
    if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
  };

  const createPolicy = () => {
    const email = createForm.buyerEmail.trim().toLowerCase();
    if (email) {
      const next = { ...policyEmailAssignments, [createForm.policyId]: email };
      setPolicyEmailAssignments(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(POLICY_EMAIL_ASSIGNMENTS_KEY, JSON.stringify(next));
      }
    }

    createOffer.mutate({
      policyId: createForm.policyId,
      buyerAddress: createForm.buyerAddress || "",
      region: createForm.location,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      thresholdMm: Number(createForm.thresholdMm),
      payoutAmount: Number(createForm.payoutUsd),
      premiumAmount: Number(createForm.premiumUsd),
      collateralAmount: Number(createForm.payoutUsd),
    });
  };

  const activateFromPolicy = (policyId: string, premiumAmount: number) => {
    payPremium.mutate({ policyId, premiumPayment: premiumAmount });
  };

  const sponsorFromPolicy = (policyId: string, premiumAmount: number) => {
    payPremiumForBuyer.mutate({ policyId, premiumPayment: premiumAmount });
  };

  const verifyLive = () => {
    verifyAndSettle.mutate({
      policyId: verifyForm.policyId,
      sourceAUrl: verifyForm.sourceAUrl,
      sourceBUrl: verifyForm.sourceBUrl,
      toleranceMm: Number(verifyForm.tolerance),
      currentDate: verifyForm.currentDate,
    });
  };

  const createValidatorPolicy = () => {
    const email = validatorCreateForm.buyerEmail.trim().toLowerCase();
    if (email) {
      const next = { ...policyEmailAssignments, [validatorCreateForm.policyId]: email };
      setPolicyEmailAssignments(next);
      if (typeof window !== "undefined") {
        localStorage.setItem(POLICY_EMAIL_ASSIGNMENTS_KEY, JSON.stringify(next));
      }
    }

    createValidatorOffer.mutate({
      policyId: validatorCreateForm.policyId,
      buyerAddress: validatorCreateForm.buyerAddress || "",
      validatorAddress: validatorCreateForm.validatorAddress,
      startDate: validatorCreateForm.startDate,
      endDate: validatorCreateForm.endDate,
      thresholdUptimeBps: Number(validatorCreateForm.thresholdUptimeBps),
      payoutAmount: Number(validatorCreateForm.payoutUsd),
      premiumAmount: Number(validatorCreateForm.premiumUsd),
      collateralAmount: Number(validatorCreateForm.payoutUsd),
    });
  };

  const verifyValidatorLive = () => {
    verifyAndSettleValidator.mutate({
      policyId: validatorVerifyForm.policyId,
      sourceAUrl: validatorVerifyForm.sourceAUrl,
      sourceBUrl: validatorVerifyForm.sourceBUrl,
      toleranceBps: Number(validatorVerifyForm.toleranceBps),
      currentDate: validatorVerifyForm.currentDate,
    });
  };

  const createBuyerPolicy = async () => {
    if (!isWalletSession || !isConnected || !address) return;
    if (buyerCreateType === "validator_downtime") {
      const policyId = validatorCreateForm.policyId.trim() || makePolicyId("validator");
      if (!validatorCreateForm.policyId.trim()) {
        setValidatorCreateForm((p) => ({ ...p, policyId }));
      }
      await createValidatorOffer.mutateAsync({
        policyId,
        buyerAddress: address,
        validatorAddress: validatorCreateForm.validatorAddress,
        startDate: validatorCreateForm.startDate,
        endDate: validatorCreateForm.endDate,
        thresholdUptimeBps: Number(validatorCreateForm.thresholdUptimeBps),
        payoutAmount: Number(validatorCreateForm.payoutUsd),
        premiumAmount: Number(validatorCreateForm.premiumUsd),
        collateralAmount: Number(validatorCreateForm.payoutUsd),
      });
      return;
    }

    const policyId = createForm.policyId.trim() || makePolicyId("drought");
    if (!createForm.policyId.trim()) {
      setCreateForm((p) => ({ ...p, policyId }));
    }
    await createOffer.mutateAsync({
      policyId,
      buyerAddress: address,
      region: createForm.location,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      thresholdMm: Number(createForm.thresholdMm),
      payoutAmount: Number(createForm.payoutUsd),
      premiumAmount: Number(createForm.premiumUsd),
      collateralAmount: Number(createForm.payoutUsd),
    });
  };

  const createAndActivateBuyerPolicy = async () => {
    if (!isWalletSession || !isConnected || !address) return;
    if (buyerCreateType === "validator_downtime") {
      const policyId = validatorCreateForm.policyId.trim() || makePolicyId("validator");
      if (!validatorCreateForm.policyId.trim()) {
        setValidatorCreateForm((p) => ({ ...p, policyId }));
      }
      await createValidatorOffer.mutateAsync({
        policyId,
        buyerAddress: address,
        validatorAddress: validatorCreateForm.validatorAddress,
        startDate: validatorCreateForm.startDate,
        endDate: validatorCreateForm.endDate,
        thresholdUptimeBps: Number(validatorCreateForm.thresholdUptimeBps),
        payoutAmount: Number(validatorCreateForm.payoutUsd),
        premiumAmount: Number(validatorCreateForm.premiumUsd),
        collateralAmount: Number(validatorCreateForm.payoutUsd),
      });
      await payPremium.mutateAsync({
        policyId,
        premiumPayment: Number(validatorCreateForm.premiumUsd),
      });
      return;
    }

    const policyId = createForm.policyId.trim() || makePolicyId("drought");
    if (!createForm.policyId.trim()) {
      setCreateForm((p) => ({ ...p, policyId }));
    }
    await createOffer.mutateAsync({
      policyId,
      buyerAddress: address,
      region: createForm.location,
      startDate: createForm.startDate,
      endDate: createForm.endDate,
      thresholdMm: Number(createForm.thresholdMm),
      payoutAmount: Number(createForm.payoutUsd),
      premiumAmount: Number(createForm.premiumUsd),
      collateralAmount: Number(createForm.payoutUsd),
    });
    await payPremium.mutateAsync({
      policyId,
      premiumPayment: Number(createForm.premiumUsd),
    });
  };

  const applyBuyerPreset = (type: "weather_drought" | "event_rainfall" | "validator_downtime") => {
    if (type === "validator_downtime") {
      setBuyerCreateType("validator_downtime");
      setValidatorCreateForm((p) => ({
        ...p,
        policyId: makePolicyId("validator"),
        validatorAddress: p.validatorAddress || "0xValidatorAddress",
        startDate: todayDate(),
        endDate: todayDate(),
        thresholdUptimeBps: "9800",
        payoutUsd: "1500",
        premiumUsd: "90",
      }));
      return;
    }

    if (type === "event_rainfall") {
      setBuyerCreateType("event_rainfall");
      setCreateForm((p) => ({
        ...p,
        policyId: makePolicyId("event"),
        location: "Lagos, NG",
        startDate: todayDate(),
        endDate: todayDate(),
        thresholdMm: "60",
        payoutUsd: "2000",
        premiumUsd: "120",
      }));
      return;
    }

    setBuyerCreateType("weather_drought");
    setCreateForm((p) => ({
      ...p,
      policyId: makePolicyId("drought"),
      location: "Lagos, NG",
      startDate: todayDate(),
      endDate: todayDate(),
      thresholdMm: "20",
      payoutUsd: "1000",
      premiumUsd: "50",
    }));
  };

  const selectBuyerPolicyType = (
    type: "weather_drought" | "event_rainfall" | "validator_downtime"
  ) => {
    setBuyerFlowTab("create");
    applyBuyerPreset(type);
    setTimeout(() => {
      buyerCreatePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const applyAgricultureTemplate = () => {
    setCreateForm({
      policyId: "agri-drought-001",
      buyerAddress: address ?? "",
      buyerEmail: "",
      location: "Kaduna, NG",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      thresholdMm: "20",
      payoutUsd: "1000",
      premiumUsd: "50",
    });
    setActivateForm({ policyId: "agri-drought-001", premiumUsd: "50" });
    setVerifyForm((v) => ({ ...v, policyId: "agri-drought-001", currentDate: todayDate() }));
  };

  const applyEventsTemplate = () => {
    setCreateForm({
      policyId: "event-rain-001",
      buyerAddress: address ?? "",
      buyerEmail: "",
      location: "Lagos, NG",
      startDate: "2026-04-10",
      endDate: "2026-04-16",
      thresholdMm: "60",
      payoutUsd: "2000",
      premiumUsd: "120",
    });
    setActivateForm({ policyId: "event-rain-001", premiumUsd: "120" });
    setVerifyForm((v) => ({ ...v, policyId: "event-rain-001", currentDate: todayDate() }));
  };

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card/90 via-secondary/60 to-background p-8">
            <div className="pointer-events-none absolute -right-20 -top-16 h-52 w-52 rounded-full bg-primary/20 blur-3xl" />
            <h1 className="relative text-4xl font-semibold tracking-tight">Proofpay</h1>
            <p className="relative mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              Automated financial guarantees triggered by objective data. No claims process. Faster settlement.
            </p>
            <div className="relative mt-8 space-y-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">1. Choose policy terms</div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">2. Activate coverage</div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">3. Verify event and settle on-chain</div>
            </div>
          </section>

          <section className="brand-card rounded-2xl p-8">
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Continue with email or wallet to access your dashboard.
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant={authMethod === "email" ? "default" : "outline"} onClick={() => setAuthMethod("email")}>
                Email
              </Button>
              <Button variant={authMethod === "wallet" ? "default" : "outline"} onClick={() => setAuthMethod("wallet")}>
                Wallet
              </Button>
            </div>

            {authMethod === "email" ? (
              <div className="mt-5 space-y-3">
                <div>
                  <Label htmlFor="login-email">Work Email</Label>
                  <Input
                    id="login-email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@company.com"
                  />
                  {emailError ? <p className="mt-1 text-xs text-destructive">{emailError}</p> : null}
                </div>
                <Button className="w-full" onClick={startEmailSession}>
                  Continue with Email
                </Button>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Choose your wallet to connect.
                </p>
                {isMetaMaskInstalled || isOkxInstalled ? (
                  <div className="grid grid-cols-1 gap-2">
                    {isMetaMaskInstalled ? (
                      <Button className="w-full" onClick={() => startWalletSession("metamask")}>
                        Connect MetaMask
                      </Button>
                    ) : null}
                    {isOkxInstalled ? (
                      <Button className="w-full" variant="outline" onClick={() => startWalletSession("okx")}>
                        Connect OKX
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Install MetaMask or OKX wallet extension first.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {healthCheck.checked && healthCheck.mismatch ? (
          <section className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-200">
              Contract mismatch detected: frontend uses{" "}
              <code>{process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}</code>, API uses{" "}
              <code>{healthCheck.apiContract}</code>. Update one of them so both point to the same contract.
            </p>
          </section>
        ) : null}

        {healthCheck.checked && !healthCheck.apiReachable ? (
          <section className="rounded-xl border border-white/20 bg-black/20 p-4">
            <p className="text-sm text-muted-foreground">
              API health check unavailable: {healthCheck.error}
            </p>
          </section>
        ) : null}

        {hasFullAccess ? (
          <section className="brand-card rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium">Auto-settle Status</div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs">
                {autoSettleStatus.loaded
                  ? autoSettleStatus.running
                    ? "RUNNING"
                    : "OFFLINE"
                  : "LOADING"}
              </div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                Settled: {autoSettleStatus.settledCount}
              </div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                Failed: {autoSettleStatus.failedCount}
              </div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                Last tick: {autoSettleStatus.lastTickAt || "-"}
              </div>
            </div>
            {autoSettleStatus.message ? (
              <p className="mt-2 text-xs text-muted-foreground">{autoSettleStatus.message}</p>
            ) : null}
            {autoSettleStatus.lastError ? (
              <p className="mt-2 text-xs text-destructive">
                Last error: {autoSettleStatus.lastError}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-card/90 via-secondary/50 to-background p-6 md:p-8">
          <div className="pointer-events-none absolute -right-28 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-blue/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                Demo Mode | Live GenLayer Contract
              </div>
              <h1 className="text-3xl font-semibold md:text-4xl">Proofpay</h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                Configure coverage, activate policies, and verify outcomes on-chain.
              </p>
              <div className="grid max-w-xl grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-muted-foreground">Active Policies</p>
                  <p className="text-sm font-semibold">{activeCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-muted-foreground">Paid Out</p>
                  <p className="text-sm font-semibold">{paidCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-muted-foreground">Withdrawable</p>
                  <p className="text-sm font-semibold">{withdrawable}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 space-y-2">
              <Button variant="outline" size="sm" onClick={logoutSession} className="w-full">
                Sign Out
              </Button>
              {isWalletSession ? (
                <AccountPanel />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setAuthMethod("wallet")}
                >
                  Switch to Wallet Mode
                </Button>
              )}
            </div>
          </div>
        </section>

        {isWalletSession && !isConnected ? (
          <section className="brand-card rounded-xl p-4">
            <p className="text-sm text-muted-foreground">
              Wallet mode is active, but no wallet is connected. Use Connect Wallet to continue.
            </p>
          </section>
        ) : null}

        {hasFullAccess ? (
          <section className="grid gap-4 lg:grid-cols-3">
            <Panel title="Create Policy" subtitle="Provider controls and template presets">
              <div className="mb-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={applyAgricultureTemplate}>
                  Agriculture Template
                </Button>
                <Button size="sm" variant="outline" onClick={applyEventsTemplate}>
                  Events Template
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-id">Policy ID</Label>
                <Input id="policy-id" value={createForm.policyId} onChange={(e) => setCreateForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={createForm.location} onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input id="start-date" value={createForm.startDate} onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <Input id="end-date" value={createForm.endDate} onChange={(e) => setCreateForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="threshold">Threshold</Label>
                    <Input id="threshold" value={createForm.thresholdMm} onChange={(e) => setCreateForm((p) => ({ ...p, thresholdMm: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="payout">Payout</Label>
                    <Input id="payout" value={createForm.payoutUsd} onChange={(e) => setCreateForm((p) => ({ ...p, payoutUsd: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="premium">Premium</Label>
                    <Input id="premium" value={createForm.premiumUsd} onChange={(e) => setCreateForm((p) => ({ ...p, premiumUsd: e.target.value }))} />
                  </div>
                </div>
                <Label htmlFor="buyer-address">Buyer Address</Label>
                <Input id="buyer-address" value={createForm.buyerAddress} onChange={(e) => setCreateForm((p) => ({ ...p, buyerAddress: e.target.value }))} placeholder="Leave empty for open offer" />
                <Label htmlFor="buyer-email">Buyer Email (Optional)</Label>
                <Input id="buyer-email" value={createForm.buyerEmail} onChange={(e) => setCreateForm((p) => ({ ...p, buyerEmail: e.target.value }))} placeholder="buyer@company.com" />
                <p className="text-xs text-muted-foreground">Assign by wallet and/or email. Buyers only see policies tied to their wallet or email.</p>
                <Button className="w-full" onClick={createPolicy} disabled={!isConnected || createOffer.isPending}>
                  {createOffer.isPending ? "Creating..." : "Create Policy"}
                </Button>
              </div>
            </Panel>

            <Panel title="Activate Coverage" subtitle="Manual activation controls">
              <div className="space-y-2">
                <Label htmlFor="activate-policy">Policy ID</Label>
                <Input id="activate-policy" value={activateForm.policyId} onChange={(e) => setActivateForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="activate-premium">Premium</Label>
                <Input id="activate-premium" value={activateForm.premiumUsd} onChange={(e) => setActivateForm((p) => ({ ...p, premiumUsd: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button onClick={() => activateFromPolicy(activateForm.policyId, Number(activateForm.premiumUsd))} disabled={!isConnected || payPremium.isPending}>
                    {payPremium.isPending ? "Activating..." : "Buyer Activates"}
                  </Button>
                  <Button variant="outline" onClick={() => sponsorFromPolicy(activateForm.policyId, Number(activateForm.premiumUsd))} disabled={!isConnected || payPremiumForBuyer.isPending}>
                    {payPremiumForBuyer.isPending ? "Sponsoring..." : "Sponsor"}
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="GenLayer Verification" subtitle="Live on-chain verification and settlement">
              <div className="space-y-2">
                <Label htmlFor="verify-policy">Policy ID</Label>
                <Input id="verify-policy" value={verifyForm.policyId} onChange={(e) => setVerifyForm((p) => ({ ...p, policyId: e.target.value }))} />
                <Label htmlFor="source-a">Source A URL</Label>
                <Input id="source-a" value={verifyForm.sourceAUrl} onChange={(e) => setVerifyForm((p) => ({ ...p, sourceAUrl: e.target.value }))} />
                <Label htmlFor="source-b">Source B URL</Label>
                <Input id="source-b" value={verifyForm.sourceBUrl} onChange={(e) => setVerifyForm((p) => ({ ...p, sourceBUrl: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="tolerance">Tolerance</Label>
                    <Input id="tolerance" value={verifyForm.tolerance} onChange={(e) => setVerifyForm((p) => ({ ...p, tolerance: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="current-date">Current Date</Label>
                    <Input id="current-date" value={verifyForm.currentDate} onChange={(e) => setVerifyForm((p) => ({ ...p, currentDate: e.target.value }))} />
                  </div>
                </div>
                <Button className="w-full" onClick={verifyLive} disabled={!isConnected || verifyAndSettle.isPending}>
                  {verifyAndSettle.isPending ? "Submitting..." : "Verify & Settle"}
                </Button>
              </div>
            </Panel>
          </section>
        ) : null}

        {canUseValidatorDemo ? (
          <section className="grid gap-4 lg:grid-cols-2">
            {hasFullAccess ? (
              <>
                <Panel title="Create Validator Policy" subtitle="Validator downtime trigger offer">
                  <div className="space-y-2">
                    <Label htmlFor="validator-policy-id">Policy ID</Label>
                    <Input id="validator-policy-id" value={validatorCreateForm.policyId} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, policyId: e.target.value }))} />
                    <Label htmlFor="validator-address">Validator Address</Label>
                    <Input id="validator-address" value={validatorCreateForm.validatorAddress} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, validatorAddress: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="validator-start-date">Start Date</Label>
                        <Input id="validator-start-date" value={validatorCreateForm.startDate} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, startDate: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="validator-end-date">End Date</Label>
                        <Input id="validator-end-date" value={validatorCreateForm.endDate} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, endDate: e.target.value }))} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="validator-threshold">Threshold (bps)</Label>
                        <Input id="validator-threshold" value={validatorCreateForm.thresholdUptimeBps} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, thresholdUptimeBps: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="validator-payout">Payout</Label>
                        <Input id="validator-payout" value={validatorCreateForm.payoutUsd} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, payoutUsd: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="validator-premium">Premium</Label>
                        <Input id="validator-premium" value={validatorCreateForm.premiumUsd} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, premiumUsd: e.target.value }))} />
                      </div>
                    </div>
                    <Label htmlFor="validator-buyer-address">Buyer Address</Label>
                    <Input id="validator-buyer-address" value={validatorCreateForm.buyerAddress} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, buyerAddress: e.target.value }))} placeholder="Leave empty for open offer" />
                    <Label htmlFor="validator-buyer-email">Buyer Email (Optional)</Label>
                    <Input id="validator-buyer-email" value={validatorCreateForm.buyerEmail} onChange={(e) => setValidatorCreateForm((p) => ({ ...p, buyerEmail: e.target.value }))} placeholder="buyer@company.com" />
                    <Button className="w-full" onClick={createValidatorPolicy} disabled={!isConnected || createValidatorOffer.isPending}>
                      {createValidatorOffer.isPending ? "Creating..." : "Create Validator Policy"}
                    </Button>
                  </div>
                </Panel>

                <Panel title="Validator Verification" subtitle="Verify uptime and settle">
                  <div className="space-y-2">
                    <Label htmlFor="verify-validator-policy">Policy ID</Label>
                    <Input id="verify-validator-policy" value={validatorVerifyForm.policyId} onChange={(e) => setValidatorVerifyForm((p) => ({ ...p, policyId: e.target.value }))} />
                    <Label htmlFor="verify-validator-source-a">Source A URL</Label>
                    <Input id="verify-validator-source-a" value={validatorVerifyForm.sourceAUrl} onChange={(e) => setValidatorVerifyForm((p) => ({ ...p, sourceAUrl: e.target.value }))} />
                    <Label htmlFor="verify-validator-source-b">Source B URL</Label>
                    <Input id="verify-validator-source-b" value={validatorVerifyForm.sourceBUrl} onChange={(e) => setValidatorVerifyForm((p) => ({ ...p, sourceBUrl: e.target.value }))} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="verify-validator-tolerance">Tolerance (bps)</Label>
                        <Input id="verify-validator-tolerance" value={validatorVerifyForm.toleranceBps} onChange={(e) => setValidatorVerifyForm((p) => ({ ...p, toleranceBps: e.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="verify-validator-date">Current Date</Label>
                        <Input id="verify-validator-date" value={validatorVerifyForm.currentDate} onChange={(e) => setValidatorVerifyForm((p) => ({ ...p, currentDate: e.target.value }))} />
                      </div>
                    </div>
                    <Button className="w-full" onClick={verifyValidatorLive} disabled={!isConnected || verifyAndSettleValidator.isPending}>
                      {verifyAndSettleValidator.isPending ? "Submitting..." : "Verify Validator & Settle"}
                    </Button>
                  </div>
                </Panel>
              </>
            ) : (
              <Panel title="Validator Policies" subtitle="Only policies assigned to your wallet/email">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground">
                        <th className="py-2 pr-3">Policy</th>
                        <th className="py-2 pr-3">Validator</th>
                        <th className="py-2 pr-3">Window</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2">Premium</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myValidatorPolicies.map((policy) => (
                        <tr key={policy.id} className="border-b border-white/5">
                          <td className="py-3 pr-3 font-medium">{policy.id}</td>
                          <td className="py-3 pr-3">{policy.validator_address || "-"}</td>
                          <td className="py-3 pr-3">{policy.start_date} to {policy.end_date}</td>
                          <td className="py-3 pr-3">{policy.status}</td>
                          <td className="py-3">{policy.premium_amount}</td>
                        </tr>
                      ))}
                      {myValidatorPolicies.length === 0 ? (
                        <tr>
                          <td className="py-4 text-muted-foreground" colSpan={5}>
                            No validator policies assigned to this wallet/email.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </section>
        ) : null}

        {!hasFullAccess ? (
          <section className="brand-card rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-lg font-semibold">Available Policy Types</h3>
              <p className="text-sm text-muted-foreground">
                Pick a policy type and create it instantly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {POLICY_TYPE_CATALOG.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/10 bg-black/20 px-4 py-3"
                >
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => selectBuyerPolicyType(item.id)}
                  >
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!hasFullAccess ? (
          <section className="grid gap-4 lg:grid-cols-1" ref={buyerCreatePanelRef}>
            <Panel
              title="Create Policy"
              subtitle="Create first, then activate assigned policies"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Mode</p>
                <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={buyerFlowTab === "create" ? "default" : "outline"}
                  onClick={() => setBuyerFlowTab("create")}
                >
                  Create
                </Button>
                <Button
                  size="sm"
                  variant={buyerFlowTab === "activate" ? "default" : "outline"}
                  onClick={() => setBuyerFlowTab("activate")}
                >
                  Activate
                </Button>
                </div>
              </div>

              {buyerFlowTab === "create" ? (
                <>
              <div className="mb-3 flex gap-2">
                <Button
                  size="sm"
                  variant={buyerCreateType === "weather_drought" ? "default" : "outline"}
                  onClick={() => setBuyerCreateType("weather_drought")}
                >
                  Drought
                </Button>
                <Button
                  size="sm"
                  variant={buyerCreateType === "event_rainfall" ? "default" : "outline"}
                  onClick={() => setBuyerCreateType("event_rainfall")}
                >
                  Event
                </Button>
                <Button
                  size="sm"
                  variant={buyerCreateType === "validator_downtime" ? "default" : "outline"}
                  onClick={() => setBuyerCreateType("validator_downtime")}
                >
                  Validator
                </Button>
              </div>
              {buyerCreateType !== "validator_downtime" ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor="buyer-policy-id">Policy ID</Label>
                      <Input
                        id="buyer-policy-id"
                        value={createForm.policyId}
                        onChange={(e) => setCreateForm((p) => ({ ...p, policyId: e.target.value }))}
                        placeholder="e.g. demo-001"
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-location">Location</Label>
                      <Input
                        id="buyer-location"
                        value={createForm.location}
                        onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))}
                        placeholder="e.g. Lagos, NG"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor="buyer-start-date">Start Date</Label>
                      <Input
                        id="buyer-start-date"
                        type="date"
                        className="max-w-[180px]"
                        value={createForm.startDate}
                        onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-end-date">End Date</Label>
                      <Input
                        id="buyer-end-date"
                        type="date"
                        className="max-w-[180px]"
                        value={createForm.endDate}
                        onChange={(e) => setCreateForm((p) => ({ ...p, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label htmlFor="buyer-threshold">
                        {buyerCreateType === "event_rainfall" ? "Rain Threshold (mm)" : "Threshold"}
                      </Label>
                      <Input
                        id="buyer-threshold"
                        type="number"
                        value={createForm.thresholdMm}
                        onChange={(e) => setCreateForm((p) => ({ ...p, thresholdMm: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-payout">Payout</Label>
                      <Input
                        id="buyer-payout"
                        type="number"
                        value={createForm.payoutUsd}
                        onChange={(e) => setCreateForm((p) => ({ ...p, payoutUsd: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-premium">Premium</Label>
                      <Input
                        id="buyer-premium"
                        type="number"
                        value={createForm.premiumUsd}
                        onChange={(e) => setCreateForm((p) => ({ ...p, premiumUsd: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor="buyer-validator-policy-id">Policy ID</Label>
                      <Input
                        id="buyer-validator-policy-id"
                        value={validatorCreateForm.policyId}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, policyId: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-validator-address">Validator Address</Label>
                      <Input
                        id="buyer-validator-address"
                        value={validatorCreateForm.validatorAddress}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, validatorAddress: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor="buyer-validator-start-date">Start Date</Label>
                      <Input
                        id="buyer-validator-start-date"
                        type="date"
                        className="max-w-[180px]"
                        value={validatorCreateForm.startDate}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, startDate: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-validator-end-date">End Date</Label>
                      <Input
                        id="buyer-validator-end-date"
                        type="date"
                        className="max-w-[180px]"
                        value={validatorCreateForm.endDate}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label htmlFor="buyer-validator-threshold">Threshold (bps)</Label>
                      <Input
                        id="buyer-validator-threshold"
                        type="number"
                        value={validatorCreateForm.thresholdUptimeBps}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, thresholdUptimeBps: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-validator-payout">Payout</Label>
                      <Input
                        id="buyer-validator-payout"
                        type="number"
                        value={validatorCreateForm.payoutUsd}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, payoutUsd: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="buyer-validator-premium">Premium</Label>
                      <Input
                        id="buyer-validator-premium"
                        type="number"
                        value={validatorCreateForm.premiumUsd}
                        onChange={(e) => setValidatorCreateForm((p) => ({ ...p, premiumUsd: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <Button
                  onClick={createBuyerPolicy}
                  disabled={!isWalletSession || !isConnected || createOffer.isPending || createValidatorOffer.isPending}
                >
                  Create Policy
                </Button>
              </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Policies assigned to you and ready for activation.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-muted-foreground">
                          <th className="py-2 pr-3">Policy</th>
                          <th className="py-2 pr-3">Type</th>
                          <th className="py-2 pr-3">Window</th>
                          <th className="py-2 pr-3">Premium</th>
                          <th className="py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAvailablePolicies.map((policy) => (
                          <tr key={policy.id} className="border-b border-white/5">
                            <td className="py-3 pr-3 font-medium">{policy.id}</td>
                            <td className="py-3 pr-3">{policy.policy_type}</td>
                            <td className="py-3 pr-3">
                              {policy.start_date} to {policy.end_date}
                            </td>
                            <td className="py-3 pr-3">{policy.premium_amount}</td>
                            <td className="py-3">
                              <Button
                                size="sm"
                                onClick={() => activateFromPolicy(policy.id, policy.premium_amount)}
                                disabled={!isWalletSession || !isConnected || payPremium.isPending}
                              >
                                Activate
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {visibleAvailablePolicies.length === 0 ? (
                          <tr>
                            <td className="py-4 text-muted-foreground" colSpan={5}>
                              No assigned funded policies yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!isWalletSession || !isConnected ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Connect wallet mode to create and activate policies.
                </p>
              ) : null}
            </Panel>
          </section>
        ) : null}

        {hasFullAccess ? (
          <section className="brand-card rounded-xl p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h3 className="text-lg font-semibold">Available Policies</h3>
                <p className="text-sm text-muted-foreground">
                  All funded offers available for activation.
                </p>
              </div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                {visibleAvailablePolicies.length} offer(s)
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className="py-2 pr-3">Policy</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Window</th>
                    <th className="py-2 pr-3">Premium</th>
                    <th className="py-2 pr-3">Buyer</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAvailablePolicies.map((policy) => {
                    const isOpenOffer = sameAddress(policy.buyer, ZERO_ADDRESS);
                    const canBuyerActivate = isWalletSession && isConnected && sameAddress(policy.buyer, address);
                    const canProviderSponsor = hasFullAccess && sameAddress(policy.provider, address);
                    return (
                      <tr key={policy.id} className="border-b border-white/5">
                        <td className="py-3 pr-3 font-medium">{policy.id}</td>
                        <td className="py-3 pr-3">{policy.region}</td>
                        <td className="py-3 pr-3">{policy.start_date} to {policy.end_date}</td>
                        <td className="py-3 pr-3">{policy.premium_amount}</td>
                        <td className="py-3 pr-3">{isOpenOffer ? "OPEN" : policy.buyer}</td>
                        <td className="py-3 pr-3">{policy.provider}</td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button size="sm" disabled={!canBuyerActivate || payPremium.isPending} onClick={() => activateFromPolicy(policy.id, policy.premium_amount)}>
                              Activate
                            </Button>
                            <Button size="sm" variant="outline" disabled={!canProviderSponsor || payPremiumForBuyer.isPending} onClick={() => sponsorFromPolicy(policy.id, policy.premium_amount)}>
                              Sponsor
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleAvailablePolicies.length === 0 ? (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={7}>
                        No funded offers at the moment.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="brand-card rounded-xl p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h3 className="text-lg font-semibold">My Policies</h3>
              <p className="text-sm text-muted-foreground">
                Policies purchased by this wallet/email only.
              </p>
            </div>
            <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
              {myPolicies.length} policy(ies)
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className="py-2 pr-3">Policy</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Decision</th>
                  <th className="py-2 pr-3">Premium Payer</th>
                  <th className="py-2">Proof</th>
                </tr>
              </thead>
              <tbody>
                {myPolicies.map((policy) => {
                  return (
                    <tr key={policy.id} className="border-b border-white/5">
                      <td className="py-3 pr-3 font-medium">{policy.id}</td>
                      <td className="py-3 pr-3">{policy.status}</td>
                      <td className="py-3 pr-3">{policy.settlement_result}</td>
                      <td className="py-3 pr-3">{policy.premium_payer || "-"}</td>
                      <td className="py-3">{policy.settlement_proof_hash || "-"}</td>
                    </tr>
                  );
                })}
                {myPolicies.length === 0 ? (
                  <tr>
                    <td className="py-4 text-muted-foreground" colSpan={5}>
                      No policies assigned to this account.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {hasFullAccess ? (
          <section className="brand-card rounded-xl p-5">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h3 className="text-lg font-semibold">Buyer Policy Information</h3>
                <p className="text-sm text-muted-foreground">
                  Full buyer/provider policy view for admin access.
                </p>
              </div>
              <div className="rounded-md border border-white/10 px-2 py-1 text-xs text-muted-foreground">
                {adminBuyerPolicies.length} policy(ies)
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-muted-foreground">
                    <th className="py-2 pr-3">Policy</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Buyer</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Premium</th>
                    <th className="py-2 pr-3">Payout</th>
                    <th className="py-2">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {adminBuyerPolicies.map((policy) => (
                    <tr key={policy.id} className="border-b border-white/5">
                      <td className="py-3 pr-3 font-medium">{policy.id}</td>
                      <td className="py-3 pr-3">{policy.policy_type}</td>
                      <td className="py-3 pr-3">{policy.buyer || "-"}</td>
                      <td className="py-3 pr-3">{policy.provider || "-"}</td>
                      <td className="py-3 pr-3">{policy.status}</td>
                      <td className="py-3 pr-3">{policy.premium_amount}</td>
                      <td className="py-3 pr-3">{policy.payout_amount}</td>
                      <td className="py-3">{policy.settlement_proof_hash || "-"}</td>
                    </tr>
                  ))}
                  {adminBuyerPolicies.length === 0 ? (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={8}>
                        No policies found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
