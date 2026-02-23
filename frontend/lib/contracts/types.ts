export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}

export interface DroughtPolicy {
  id: string;
  policy_type: string;
  buyer: string;
  provider: string;
  region: string;
  validator_address: string;
  start_date: string;
  end_date: string;
  metric: string;
  trigger_operator: string;
  threshold_mm: number;
  threshold_uptime_bps: number;
  payout_amount: number;
  premium_amount: number;
  collateral_amount: number;
  premium_paid: boolean;
  premium_payer: string;
  status: string;
  source_a_url: string;
  source_b_url: string;
  source_a_mm: string;
  source_b_mm: string;
  source_a_hash: string;
  source_b_hash: string;
  resolved_by: string;
  settlement_result: string;
  settlement_proof_hash: string;
  decision_reason: string;
}
