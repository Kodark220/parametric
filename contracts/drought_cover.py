# { "Depends": "py-genlayer:test" }

import json
from dataclasses import dataclass
from genlayer import *

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"


@allow_storage
@dataclass
class Policy:
    id: str
    buyer: Address
    provider: Address
    region: str
    start_date: str
    end_date: str
    metric: str
    trigger_operator: str
    threshold_mm: u256
    payout_amount: u256
    premium_amount: u256
    collateral_amount: u256
    premium_paid: bool
    premium_payer: str
    status: str
    source_a_url: str
    source_b_url: str
    source_a_mm: str
    source_b_mm: str
    source_a_hash: str
    source_b_hash: str
    resolved_by: str
    settlement_result: str
    settlement_proof_hash: str
    decision_reason: str


class DroughtCover(gl.Contract):
    owner: Address
    policies: TreeMap[str, Policy]
    withdrawable_balances: TreeMap[Address, u256]

    def __init__(self):
        self.owner = gl.message.sender_address

    def _require_owner(self) -> None:
        if gl.message.sender_address != self.owner:
            raise Exception("Only owner can execute this action")

    def _require_policy(self, policy_id: str) -> Policy:
        if policy_id not in self.policies:
            raise Exception("Policy not found")
        return self.policies[policy_id]

    def _is_zero_address(self, address: Address) -> bool:
        return address.as_hex.lower() == ZERO_ADDRESS

    def _validate_date(self, date_str: str) -> None:
        parts = date_str.split("-")
        if len(parts) != 3:
            raise Exception("Date must use YYYY-MM-DD format")
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])
        if year < 2020 or year > 2100:
            raise Exception("Date year out of accepted range")
        if month < 1 or month > 12:
            raise Exception("Date month is invalid")
        if day < 1 or day > 31:
            raise Exception("Date day is invalid")

    def _validate_period(self, start_date: str, end_date: str) -> None:
        self._validate_date(start_date)
        self._validate_date(end_date)
        if end_date < start_date:
            raise Exception("End date must be after start date")

    def _require_after_end_date(self, policy: Policy, current_date: str) -> None:
        self._validate_date(current_date)
        if current_date < policy.end_date:
            raise Exception("Settlement allowed only after policy end date")

    def _validate_source_url(self, source_url: str) -> None:
        if not source_url.startswith("https://"):
            raise Exception("Source URL must be HTTPS")
        if (
            "open-meteo.com" not in source_url
            and "weatherapi.com" not in source_url
            and "openweathermap.org" not in source_url
        ):
            raise Exception("Source URL is not trusted")

    def _credit(self, address: Address, amount: int) -> None:
        if amount <= 0:
            return
        self.withdrawable_balances[address] = self.withdrawable_balances.get(address, 0) + amount

    def _extract_monthly_rainfall_mm(
        self, source_url: str, region: str, start_date: str, end_date: str
    ) -> tuple[int, str]:
        def fetch_rainfall() -> str:
            web_data = gl.nondet.web.render(source_url, mode="text")
            task = f"""
Extract total rainfall in millimeters for:
Region: {region}
Window: {start_date} to {end_date}

Web content:
{web_data}

Respond only with valid JSON:
{{
  "rainfall_mm": int
}}
            """
            result = gl.nondet.exec_prompt(task, response_format="json")
            return json.dumps(result, sort_keys=True)

        canonical_result = gl.eq_principle.strict_eq(fetch_rainfall)
        rainfall_json = json.loads(canonical_result)
        rainfall_mm = int(rainfall_json["rainfall_mm"])
        payload = (
            f"url={source_url}|region={region}|start={start_date}|end={end_date}|"
            f"result={canonical_result}"
        )
        return rainfall_mm, payload

    def _evaluate_trigger(
        self, operator: str, threshold_mm: int, source_a_mm: int, source_b_mm: int, tolerance_mm: int
    ) -> tuple[bool, str]:
        if operator not in ["<", "<="]:
            raise Exception("Unsupported trigger operator")

        def compare(value: int) -> bool:
            if operator == "<":
                return value < threshold_mm
            return value <= threshold_mm

        source_a_match = compare(source_a_mm)
        source_b_match = compare(source_b_mm)

        if source_a_match and source_b_match:
            return True, "Both sources satisfy trigger condition"
        if (not source_a_match) and (not source_b_match):
            return False, "Both sources do not satisfy trigger condition"

        if abs(source_a_mm - source_b_mm) <= tolerance_mm:
            average_mm = (source_a_mm + source_b_mm) // 2
            return compare(average_mm), "Sources disagreed; tie-break used average rainfall"

        raise Exception("Sources disagree beyond tolerance. Manual review required")

    def _apply_settlement(
        self, policy_id: str, result: bool, proof_hash: str, decision_reason: str
    ) -> None:
        policy = self.policies[policy_id]
        if policy.status != "ACTIVE":
            raise Exception("Only ACTIVE policies can be settled")
        if len(proof_hash.strip()) == 0:
            raise Exception("Proof hash cannot be empty")

        policy.resolved_by = gl.message.sender_address.as_hex
        policy.settlement_result = "YES" if result else "NO"
        policy.settlement_proof_hash = proof_hash
        policy.decision_reason = decision_reason

        if result:
            self._credit(policy.buyer, policy.collateral_amount)
            self._credit(policy.provider, policy.premium_amount)
            policy.status = "PAID"
        else:
            self._credit(policy.provider, policy.collateral_amount + policy.premium_amount)
            policy.status = "EXPIRED"
        self.policies[policy_id] = policy

    @gl.public.write
    def create_policy_offer(
        self,
        policy_id: str,
        buyer_address: str,
        region: str,
        start_date: str,
        end_date: str,
        threshold_mm: int,
        payout_amount: int,
        premium_amount: int,
        collateral_amount: int,
    ) -> None:
        if len(policy_id.strip()) == 0:
            raise Exception("Policy id cannot be empty")
        if len(region.strip()) == 0:
            raise Exception("Region cannot be empty")
        if policy_id in self.policies:
            raise Exception("Policy id already exists")
        self._validate_period(start_date, end_date)
        if threshold_mm <= 0:
            raise Exception("Threshold must be greater than zero")
        if payout_amount <= 0:
            raise Exception("Payout amount must be greater than zero")
        if premium_amount <= 0:
            raise Exception("Premium amount must be greater than zero")
        if collateral_amount != payout_amount:
            raise Exception("Provider collateral must equal payout amount")

        buyer = (
            Address(ZERO_ADDRESS)
            if len(buyer_address.strip()) == 0
            else Address(buyer_address)
        )

        self.policies[policy_id] = Policy(
            id=policy_id,
            buyer=buyer,
            provider=Address(gl.message.sender_address.as_hex),
            region=region,
            start_date=start_date,
            end_date=end_date,
            metric="rainfall_mm",
            trigger_operator="<",
            threshold_mm=u256(threshold_mm),
            payout_amount=u256(payout_amount),
            premium_amount=u256(premium_amount),
            collateral_amount=u256(collateral_amount),
            premium_paid=False,
            premium_payer="",
            status="FUNDED",
            source_a_url="",
            source_b_url="",
            source_a_mm="",
            source_b_mm="",
            source_a_hash="",
            source_b_hash="",
            resolved_by="",
            settlement_result="PENDING",
            settlement_proof_hash="",
            decision_reason="",
        )

    @gl.public.write
    def pay_premium(self, policy_id: str, premium_payment: int) -> None:
        policy = self._require_policy(policy_id)
        if policy.status != "FUNDED":
            raise Exception("Policy cannot accept premium in current status")
        if self._is_zero_address(policy.buyer):
            # Open offer: first buyer that pays becomes the buyer.
            policy.buyer = Address(gl.message.sender_address.as_hex)
        elif gl.message.sender_address != policy.buyer:
            raise Exception("Only buyer can pay premium")
        if premium_payment != policy.premium_amount:
            raise Exception("Incorrect premium amount")

        policy.premium_paid = True
        policy.premium_payer = gl.message.sender_address.as_hex
        policy.status = "ACTIVE"
        self.policies[policy_id] = policy

    @gl.public.write
    def pay_premium_for_buyer(self, policy_id: str, premium_payment: int) -> None:
        policy = self._require_policy(policy_id)
        if policy.status != "FUNDED":
            raise Exception("Policy cannot accept premium in current status")
        if gl.message.sender_address != policy.provider:
            raise Exception("Only provider can sponsor buyer premium")
        if self._is_zero_address(policy.buyer):
            raise Exception("Cannot sponsor an open offer without a buyer")
        if premium_payment != policy.premium_amount:
            raise Exception("Incorrect premium amount")

        policy.premium_paid = True
        policy.premium_payer = gl.message.sender_address.as_hex
        policy.status = "ACTIVE"
        self.policies[policy_id] = policy

    @gl.public.write
    def cancel_policy_before_activation(self, policy_id: str) -> None:
        policy = self._require_policy(policy_id)
        if policy.status != "FUNDED":
            raise Exception("Only FUNDED policies can be cancelled")
        if gl.message.sender_address != policy.provider and gl.message.sender_address != self.owner:
            raise Exception("Only provider or owner can cancel")

        self._credit(policy.provider, policy.collateral_amount)
        policy.status = "CANCELLED"
        policy.decision_reason = "Cancelled before buyer premium payment"
        self.policies[policy_id] = policy

    @gl.public.write
    def settle_policy(
        self,
        policy_id: str,
        result: bool,
        proof_hash: str,
        decision_reason: str,
        current_date: str,
    ) -> None:
        self._require_owner()
        policy = self._require_policy(policy_id)
        if policy.status != "ACTIVE":
            raise Exception("Policy is not active")
        self._require_after_end_date(policy, current_date)
        self._apply_settlement(policy_id, bool(result), proof_hash, decision_reason)
        policy = self.policies[policy_id]
        self.policies[policy_id] = policy

    @gl.public.write
    def verify_and_settle_policy(
        self,
        policy_id: str,
        source_a_url: str,
        source_b_url: str,
        tolerance_mm: int,
        current_date: str,
    ) -> None:
        self._require_owner()
        policy = self._require_policy(policy_id)
        if policy.status != "ACTIVE":
            raise Exception("Policy is not active")
        if tolerance_mm < 0 or tolerance_mm > 100:
            raise Exception("Tolerance must be between 0 and 100mm")
        self._require_after_end_date(policy, current_date)
        self._validate_source_url(source_a_url)
        self._validate_source_url(source_b_url)

        source_a_mm, source_a_hash = self._extract_monthly_rainfall_mm(
            source_a_url, policy.region, policy.start_date, policy.end_date
        )
        source_b_mm, source_b_hash = self._extract_monthly_rainfall_mm(
            source_b_url, policy.region, policy.start_date, policy.end_date
        )

        policy.source_a_url = source_a_url
        policy.source_b_url = source_b_url
        policy.source_a_mm = str(source_a_mm)
        policy.source_b_mm = str(source_b_mm)
        policy.source_a_hash = source_a_hash
        policy.source_b_hash = source_b_hash
        self.policies[policy_id] = policy

        triggered, reason = self._evaluate_trigger(
            policy.trigger_operator,
            int(policy.threshold_mm),
            source_a_mm,
            source_b_mm,
            int(tolerance_mm),
        )

        proof_hash = (
            f"{policy_id}:{source_a_url}:{source_b_url}:{source_a_mm}:{source_b_mm}:{int(tolerance_mm)}"
        )
        self._apply_settlement(policy_id, triggered, proof_hash, reason)
        policy = self.policies[policy_id]
        self.policies[policy_id] = policy

    @gl.public.write
    def resolve_policy_with_values(
        self,
        policy_id: str,
        source_a_mm: int,
        source_b_mm: int,
        tolerance_mm: int,
        current_date: str,
    ) -> None:
        self._require_owner()
        policy = self._require_policy(policy_id)
        if policy.status != "ACTIVE":
            raise Exception("Policy is not active")
        if tolerance_mm < 0 or tolerance_mm > 100:
            raise Exception("Tolerance must be between 0 and 100mm")
        self._require_after_end_date(policy, current_date)

        a_mm = int(source_a_mm)
        b_mm = int(source_b_mm)
        policy.source_a_url = "manual://source-a"
        policy.source_b_url = "manual://source-b"
        policy.source_a_mm = str(a_mm)
        policy.source_b_mm = str(b_mm)
        policy.source_a_hash = f"manual-a:{a_mm}"
        policy.source_b_hash = f"manual-b:{b_mm}"
        self.policies[policy_id] = policy

        triggered, reason = self._evaluate_trigger(
            policy.trigger_operator, int(policy.threshold_mm), a_mm, b_mm, int(tolerance_mm)
        )
        proof_hash = f"manual:{policy_id}:{a_mm}:{b_mm}:{int(tolerance_mm)}:{current_date}"
        self._apply_settlement(policy_id, triggered, proof_hash, reason)
        policy = self.policies[policy_id]
        self.policies[policy_id] = policy

    @gl.public.view
    def get_policy(self, policy_id: str) -> dict:
        policy = self._require_policy(policy_id)
        return {
            "id": policy.id,
            "buyer": policy.buyer.as_hex,
            "provider": policy.provider.as_hex,
            "region": policy.region,
            "start_date": policy.start_date,
            "end_date": policy.end_date,
            "metric": policy.metric,
            "trigger_operator": policy.trigger_operator,
            "threshold_mm": int(policy.threshold_mm),
            "payout_amount": int(policy.payout_amount),
            "premium_amount": int(policy.premium_amount),
            "collateral_amount": int(policy.collateral_amount),
            "premium_paid": bool(policy.premium_paid),
            "premium_payer": policy.premium_payer,
            "status": policy.status,
            "source_a_url": policy.source_a_url,
            "source_b_url": policy.source_b_url,
            "source_a_mm": policy.source_a_mm,
            "source_b_mm": policy.source_b_mm,
            "source_a_hash": policy.source_a_hash,
            "source_b_hash": policy.source_b_hash,
            "resolved_by": policy.resolved_by,
            "settlement_result": policy.settlement_result,
            "settlement_proof_hash": policy.settlement_proof_hash,
            "decision_reason": policy.decision_reason,
        }

    @gl.public.view
    def get_all_policies(self) -> dict:
        return {policy_id: self.get_policy(policy_id) for policy_id in self.policies}

    @gl.public.view
    def get_withdrawable_balance(self, account_address: str) -> int:
        return int(self.withdrawable_balances.get(Address(account_address), 0))
