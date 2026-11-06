//! SDK host tests: real wrapper/storage/receipts with simulated VM context.
//! These do not execute the compiled WASM or prove network gas/finality behavior.
use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult, PublicKey};

const CONTRACT: &str = "escrow.testnet";
const OWNER: &str = "owner.testnet";
const AGENT: &str = "agent.testnet";
const VERIFIER: &str = "verifier.testnet";
const PROVIDER: &str = "provider.testnet";
const ONE: u128 = 10u128.pow(24);

fn public_key(n: u8) -> PublicKey {
    let mut bytes = vec![0]; // ED25519 type tag + 32 bytes.
    bytes.extend([n; 32]);
    PublicKey::try_from(bytes).unwrap()
}
fn context(actor: &str, key: u8, deposit: u128, callback: Option<bool>) {
    let storage = env::storage_usage();
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(CONTRACT.parse().unwrap())
        .signer_account_id(actor.parse().unwrap())
        .predecessor_account_id(actor.parse().unwrap())
        .signer_account_pk(public_key(key))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .storage_usage(storage)
        .block_timestamp(10_000_000)
        .prepaid_gas(Gas::from_tgas(if callback.is_some() { 15 } else { 100 }));
    let results = callback
        .map(|success| {
            if success {
                PromiseResult::Successful(vec![])
            } else {
                PromiseResult::Failed
            }
        })
        .into_iter()
        .collect();
    testing_env!(
        builder.build(),
        near_sdk::test_vm_config(),
        near_parameters::RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}
fn fresh() -> Contract {
    testing_env!(VMContextBuilder::new()
        .current_account_id(CONTRACT.parse().unwrap())
        .build());
    // Clear storage retained by testing_env between contexts in the same test.
    near_sdk::mock::with_mocked_blockchain(|b| {
        b.take_storage();
    });
    context(OWNER, 1, 0, None);
    let contract = Contract::new();
    env::state_write(&contract);
    contract
}
fn funded() -> Contract {
    let mut contract = fresh();
    context(OWNER, 1, 10 * ONE, None);
    contract.fund(U128(ONE));
    contract
}
fn mandate() -> Mandate {
    Mandate {
        owner: OWNER.into(),
        owner_key: public_key(1).to_string(),
        agent: AGENT.into(),
        agent_key: public_key(2).to_string(),
        verifier: VERIFIER.into(),
        verifier_key: public_key(3).to_string(),
        recipients: vec![PROVIDER.into()],
        cap: ONE,
        expires: 1000,
        mandate_hash: "a".repeat(64),
        input_hash: "b".repeat(64),
        checks_version: "invoice-checks/v1".into(),
        asset: "near:testnet:native:24".into(),
        domain: format!("styx:testnet:{CONTRACT}"),
    }
}
fn verified() -> Contract {
    let mut c = funded();
    context(OWNER, 1, 0, None);
    c.approve("job:1".into(), mandate());
    context(AGENT, 2, 0, None);
    c.reserve(
        "job:1".into(),
        Quote {
            id: "quote:1".into(),
            recipient: PROVIDER.into(),
            amount: ONE,
            expires: 500,
            mandate_hash: "a".repeat(64),
            asset: "near:testnet:native:24".into(),
        },
    );
    context(PROVIDER, 4, 0, None);
    c.deliver("job:1".into(), "c".repeat(64));
    context(VERIFIER, 3, 0, None);
    c.attest(
        "job:1".into(),
        Attestation {
            job_id: "job:1".into(),
            mandate_hash: "a".repeat(64),
            input_hash: "b".repeat(64),
            artifact_hash: "c".repeat(64),
            checks_version: "invoice-checks/v1".into(),
            domain: format!("styx:testnet:{CONTRACT}"),
            expires: 900,
            pass: true,
        },
    );
    c
}

#[test]
fn funding_separates_spendable_balance_and_charges_exact_storage_growth() {
    let mut c = fresh();
    let before = env::storage_usage();
    context(OWNER, 1, 10 * ONE, None);
    c.fund(U128(ONE));
    assert_eq!(c.engine.available[OWNER], 9 * ONE);
    assert_eq!(
        c.storage_credit[OWNER],
        ONE - u128::from(env::storage_usage() - before) * env::storage_byte_cost().as_yoctonear()
    );
    let persisted: Contract = env::state_read().unwrap();
    assert_eq!(persisted.storage_credit[OWNER], c.storage_credit[OWNER]);
}

#[test]
fn release_receipts_transfer_only_to_provider_and_callback_is_bounded() {
    let mut c = verified();
    context(OWNER, 1, 0, None);
    drop(c.release("job:1".into(), "c".repeat(64)));
    assert_eq!(c.engine.jobs["job:1"].state, State::PaymentPending);
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 2);
    assert_eq!(receipts[0].receiver_id.as_str(), PROVIDER);
    assert_eq!(receipts[1].receiver_id.as_str(), CONTRACT);
    assert!(
        matches!(&receipts[0].actions[0], MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == ONE)
    );
    match &receipts[1].actions[0] {
        MockAction::FunctionCallWeight {
            method_name,
            args,
            prepaid_gas,
            attached_deposit,
            ..
        } => {
            assert_eq!(method_name, b"on_transfer");
            assert_eq!(*prepaid_gas, Gas::from_tgas(15));
            assert_eq!(attached_deposit.as_yoctonear(), 0);
            assert_eq!(
                near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap(),
                near_sdk::serde_json::json!({"job_id":"job:1","attempt":1})
            );
        }
        _ => panic!("expected private callback"),
    }
    context(CONTRACT, 1, 0, Some(true));
    c.on_transfer("job:1".into(), 1);
    assert_eq!(c.engine.jobs["job:1"].state, State::Paid);
    assert!(env::used_gas() < Gas::from_tgas(15));
    println!("small-job callback host gas: {}", env::used_gas().as_gas());
}

#[test]
fn failed_transfer_restores_reservation_and_storage_credit() {
    let mut c = verified();
    context(OWNER, 1, 0, None);
    drop(c.release("job:1".into(), "c".repeat(64)));
    let credit = c.storage_credit[OWNER];
    context(CONTRACT, 1, 0, Some(false));
    c.on_transfer("job:1".into(), 1);
    assert_eq!(c.engine.jobs["job:1"].state, State::Reserved);
    assert!(c.engine.jobs["job:1"].attestation.is_none());
    assert!(c.storage_credit[OWNER] > credit);
    assert_eq!(c.engine.available[OWNER], 8 * ONE);
}

#[test]
fn withdrawal_receipts_bind_owner_and_failure_restores_once() {
    let mut c = funded();
    context(OWNER, 1, 0, None);
    drop(c.withdraw("withdraw:1".into(), U128(ONE)));
    assert_eq!(get_created_receipts()[0].receiver_id.as_str(), OWNER);
    assert_eq!(c.engine.available[OWNER], 8 * ONE);
    context(CONTRACT, 1, 0, Some(false));
    c.on_withdrawal("withdraw:1".into());
    assert_eq!(c.engine.available[OWNER], 9 * ONE);
    assert_eq!(
        c.engine.withdrawals["withdraw:1"].state,
        TransferState::Failed
    );
}

#[test]
#[should_panic(expected = "private callback required")]
fn outside_account_cannot_call_transfer_callback() {
    let mut c = verified();
    context(OWNER, 1, 0, None);
    drop(c.release("job:1".into(), "c".repeat(64)));
    context("attacker.testnet", 9, 0, Some(true));
    c.on_transfer("job:1".into(), 1);
}

#[test]
#[should_panic(expected = "private callback required")]
fn outside_account_cannot_call_withdrawal_callback() {
    let mut c = funded();
    context(OWNER, 1, 0, None);
    drop(c.withdraw("withdraw:1".into(), U128(ONE)));
    context("attacker.testnet", 9, 0, Some(false));
    c.on_withdrawal("withdraw:1".into());
}

#[test]
#[should_panic(expected = "direct signed calls required")]
fn forwarded_funding_is_rejected() {
    let mut c = fresh();
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(CONTRACT.parse().unwrap())
        .signer_account_id(OWNER.parse().unwrap())
        .predecessor_account_id("forwarder.testnet".parse().unwrap())
        .attached_deposit(NearToken::from_near(2));
    testing_env!(builder.build());
    c.fund(U128(ONE));
}

#[test]
#[should_panic(expected = "Insufficient storage credit")]
fn missing_storage_deposit_fails_instead_of_spending_escrow() {
    let mut c = fresh();
    context(OWNER, 1, ONE, None);
    c.fund(U128(0));
}
