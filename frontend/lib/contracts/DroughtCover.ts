import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { DroughtPolicy, TransactionReceipt } from "./types";

function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = normalize(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  return value;
}

function toPolicy(value: unknown): DroughtPolicy {
  const obj = normalize(value) as Record<string, unknown>;
  return {
    id: String(obj.id ?? ""),
    policy_type: String(obj.policy_type ?? "weather_drought"),
    buyer: String(obj.buyer ?? ""),
    provider: String(obj.provider ?? ""),
    region: String(obj.region ?? ""),
    validator_address: String(obj.validator_address ?? ""),
    start_date: String(obj.start_date ?? ""),
    end_date: String(obj.end_date ?? ""),
    metric: String(obj.metric ?? ""),
    trigger_operator: String(obj.trigger_operator ?? ""),
    threshold_mm: Number(obj.threshold_mm ?? 0),
    threshold_uptime_bps: Number(obj.threshold_uptime_bps ?? 0),
    payout_amount: Number(obj.payout_amount ?? 0),
    premium_amount: Number(obj.premium_amount ?? 0),
    collateral_amount: Number(obj.collateral_amount ?? 0),
    premium_paid: Boolean(obj.premium_paid),
    premium_payer: String(obj.premium_payer ?? ""),
    status: String(obj.status ?? ""),
    source_a_url: String(obj.source_a_url ?? ""),
    source_b_url: String(obj.source_b_url ?? ""),
    source_a_mm: String(obj.source_a_mm ?? ""),
    source_b_mm: String(obj.source_b_mm ?? ""),
    source_a_hash: String(obj.source_a_hash ?? ""),
    source_b_hash: String(obj.source_b_hash ?? ""),
    resolved_by: String(obj.resolved_by ?? ""),
    settlement_result: String(obj.settlement_result ?? ""),
    settlement_proof_hash: String(obj.settlement_proof_hash ?? ""),
    decision_reason: String(obj.decision_reason ?? ""),
  };
}

class DroughtCover {
  private contractAddress: `0x${string}`;
  private client: ReturnType<typeof createClient>;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;

    const config: { chain: typeof studionet; account?: `0x${string}`; endpoint?: string } = {
      chain: studionet,
    };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;

    this.client = createClient(config);
  }

  async getAllPolicies(): Promise<DroughtPolicy[]> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_all_policies",
      args: [],
    });

    const normalized = normalize(result);
    const obj = (normalized ?? {}) as Record<string, unknown>;
    return Object.values(obj).map((value) => toPolicy(value));
  }

  async getWithdrawableBalance(accountAddress: string): Promise<number> {
    const result = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_withdrawable_balance",
      args: [accountAddress],
    });
    return Number(result ?? 0);
  }

  async createPolicyOffer(input: {
    policyId: string;
    buyerAddress: string;
    region: string;
    startDate: string;
    endDate: string;
    thresholdMm: number;
    payoutAmount: number;
    premiumAmount: number;
    collateralAmount: number;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "create_policy_offer",
      args: [
        input.policyId,
        input.buyerAddress,
        input.region,
        input.startDate,
        input.endDate,
        input.thresholdMm,
        input.payoutAmount,
        input.premiumAmount,
        input.collateralAmount,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async createValidatorPolicyOffer(input: {
    policyId: string;
    buyerAddress: string;
    validatorAddress: string;
    startDate: string;
    endDate: string;
    thresholdUptimeBps: number;
    payoutAmount: number;
    premiumAmount: number;
    collateralAmount: number;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "create_validator_policy_offer",
      args: [
        input.policyId,
        input.buyerAddress,
        input.validatorAddress,
        input.startDate,
        input.endDate,
        input.thresholdUptimeBps,
        input.payoutAmount,
        input.premiumAmount,
        input.collateralAmount,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async payPremium(policyId: string, premiumPayment: number): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "pay_premium",
      args: [policyId, premiumPayment],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async payPremiumForBuyer(policyId: string, premiumPayment: number): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "pay_premium_for_buyer",
      args: [policyId, premiumPayment],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async resolvePolicyWithValues(input: {
    policyId: string;
    sourceAMm: number;
    sourceBMm: number;
    toleranceMm: number;
    currentDate: string;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "resolve_policy_with_values",
      args: [
        input.policyId,
        input.sourceAMm,
        input.sourceBMm,
        input.toleranceMm,
        input.currentDate,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async verifyAndSettlePolicy(input: {
    policyId: string;
    sourceAUrl: string;
    sourceBUrl: string;
    toleranceMm: number;
    currentDate: string;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "verify_and_settle_policy",
      args: [
        input.policyId,
        input.sourceAUrl,
        input.sourceBUrl,
        input.toleranceMm,
        input.currentDate,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async verifyAndSettleValidatorPolicy(input: {
    policyId: string;
    sourceAUrl: string;
    sourceBUrl: string;
    toleranceBps: number;
    currentDate: string;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "verify_and_settle_validator_policy",
      args: [
        input.policyId,
        input.sourceAUrl,
        input.sourceBUrl,
        input.toleranceBps,
        input.currentDate,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  async resolveValidatorPolicyWithValues(input: {
    policyId: string;
    sourceABps: number;
    sourceBBps: number;
    toleranceBps: number;
    currentDate: string;
  }): Promise<TransactionReceipt> {
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName: "resolve_validator_policy_with_values",
      args: [
        input.policyId,
        input.sourceABps,
        input.sourceBBps,
        input.toleranceBps,
        input.currentDate,
      ],
      value: BigInt(0),
    });
    return this.waitReceipt(txHash as string);
  }

  private async waitReceipt(hash: string): Promise<TransactionReceipt> {
    const receipt = await this.client.waitForTransactionReceipt({
      hash: hash as unknown as any,
      status: "ACCEPTED" as never,
      retries: 24,
      interval: 5000,
    });
    return receipt as unknown as TransactionReceipt;
  }
}

export default DroughtCover;
