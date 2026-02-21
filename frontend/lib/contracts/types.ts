export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}

export interface DroughtPolicy {
  id: string;
  buyer: string;
  provider: string;
  region: string;
  start_date: string;
  end_date: string;
  metric: string;
  trigger_operator: string;
  threshold_mm: number;
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
