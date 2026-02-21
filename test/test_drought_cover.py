from gltest import get_contract_factory, default_account
from gltest.assertions import tx_execution_succeeded
from gltest.helpers import load_fixture


def deploy_contract():
    factory = get_contract_factory("DroughtCover")
    contract = factory.deploy()
    assert contract.get_withdrawable_balance(args=[default_account.address]) == 0
    return contract


def test_policy_triggers_and_pays_out_with_collateralized_escrow():
    contract = load_fixture(deploy_contract)

    create_offer_result = contract.create_policy_offer(
        args=[
            "drought-jan-2026",
            default_account.address,
            "ng-kaduna",
            "2026-01-01",
            "2026-01-31",
            20,
            500,
            25,
            500,
        ]
    )
    assert tx_execution_succeeded(create_offer_result)

    pay_premium_result = contract.pay_premium(args=["drought-jan-2026", 25])
    assert tx_execution_succeeded(pay_premium_result)

    resolve_result = contract.resolve_policy_with_values(
        args=["drought-jan-2026", 12, 18, 5, "2026-02-01"]
    )
    assert tx_execution_succeeded(resolve_result)

    policy = contract.get_policy(args=["drought-jan-2026"])
    assert policy["status"] == "PAID"
    assert policy["settlement_result"] == "YES"
    assert policy["premium_paid"] is True
    assert len(policy["settlement_proof_hash"]) > 0
    assert contract.get_withdrawable_balance(args=[default_account.address]) == 525


def test_policy_expires_and_provider_gets_refund_on_no():
    contract = load_fixture(deploy_contract)

    create_offer_result = contract.create_policy_offer(
        args=[
            "drought-feb-2026",
            default_account.address,
            "ng-kaduna",
            "2026-02-01",
            "2026-02-28",
            20,
            500,
            25,
            500,
        ]
    )
    assert tx_execution_succeeded(create_offer_result)

    pay_premium_result = contract.pay_premium(args=["drought-feb-2026", 25])
    assert tx_execution_succeeded(pay_premium_result)

    resolve_result = contract.resolve_policy_with_values(
        args=["drought-feb-2026", 24, 31, 5, "2026-03-01"]
    )
    assert tx_execution_succeeded(resolve_result)

    policy = contract.get_policy(args=["drought-feb-2026"])
    assert policy["status"] == "EXPIRED"
    assert policy["settlement_result"] == "NO"
    assert contract.get_withdrawable_balance(args=[default_account.address]) == 525


def test_manual_settle_policy_with_external_result():
    contract = load_fixture(deploy_contract)

    create_offer_result = contract.create_policy_offer(
        args=[
            "drought-mar-2026",
            default_account.address,
            "ng-kaduna",
            "2026-03-01",
            "2026-03-31",
            20,
            500,
            25,
            500,
        ]
    )
    assert tx_execution_succeeded(create_offer_result)

    pay_premium_result = contract.pay_premium(args=["drought-mar-2026", 25])
    assert tx_execution_succeeded(pay_premium_result)

    settle_result = contract.settle_policy(
        args=[
            "drought-mar-2026",
            True,
            "0xabc123proofhash",
            "Verified by external GenLayer decision flow",
            "2026-04-01",
        ]
    )
    assert tx_execution_succeeded(settle_result)

    policy = contract.get_policy(args=["drought-mar-2026"])
    assert policy["status"] == "PAID"
    assert policy["settlement_result"] == "YES"
    assert policy["settlement_proof_hash"] == "0xabc123proofhash"
    assert policy["decision_reason"] == "Verified by external GenLayer decision flow"
