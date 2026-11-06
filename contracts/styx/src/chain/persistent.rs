//! Fresh-state candidate: keyed storage keeps callbacks independent of history.
//! No migration or upgrade entry point is provided for the deployed whole-map v2.
use super::*;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    available: LookupMap<String, u128>,
    jobs: LookupMap<String, Job>,
    used_quotes: LookupMap<String, String>,
    withdrawals: LookupMap<String, Withdrawal>,
    storage_credit: LookupMap<String, u128>,
    reserved: LookupMap<String, u128>,
    withdrawal_pending: LookupMap<String, u128>,
}
fn actor() -> String {
    env::predecessor_account_id().to_string()
}
fn key() -> String {
    env::signer_account_pk().to_string()
}
fn now() -> u64 {
    env::block_timestamp_ms()
}
fn result<T>(value: Result<T, String>) -> T {
    value.unwrap_or_else(|e| env::panic_str(&e))
}
fn direct() {
    assert_eq!(
        env::signer_account_id(),
        env::predecessor_account_id(),
        "direct signed calls required"
    );
}
fn emit(id: &str, event: &str) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({"standard":"styx","version":"2.0.0","event":event,"data":[{"job_id":id}]})
    ));
}
impl Contract {
    fn balance(map: &LookupMap<String, u128>, owner: &String) -> u128 {
        map.get(owner).copied().unwrap_or(0)
    }
    fn adjust(map: &mut LookupMap<String, u128>, owner: &String, amount: u128, add: bool) {
        let before = Self::balance(map, owner);
        let next = if add {
            before.checked_add(amount)
        } else {
            before.checked_sub(amount)
        }
        .expect("balance counter overflow/underflow");
        map.insert(owner.clone(), next);
    }
    fn engine(&self, owner: &String) -> Escrow {
        let mut engine = Escrow::default();
        engine
            .available
            .insert(owner.clone(), Self::balance(&self.available, owner));
        engine
    }
    fn job_engine(&self, id: &String) -> (String, Escrow) {
        let job = self.jobs.get(id).expect("unknown job").clone();
        let owner = job.mandate.owner.clone();
        let mut engine = self.engine(&owner);
        engine.jobs.insert(id.clone(), job);
        (owner, engine)
    }
    fn store_job(&mut self, id: &String, owner: &String, engine: &Escrow) {
        self.available
            .insert(owner.clone(), *engine.available.get(owner).unwrap());
        self.jobs
            .insert(id.clone(), engine.jobs.get(id).unwrap().clone());
    }
    fn flush(&mut self) {
        self.available.flush();
        self.jobs.flush();
        self.used_quotes.flush();
        self.withdrawals.flush();
        self.storage_credit.flush();
        self.reserved.flush();
        self.withdrawal_pending.flush();
    }
    fn charge_storage(&mut self, owner: &String, before: u64) {
        self.flush();
        env::state_write(self);
        let after = env::storage_usage();
        let price = env::storage_byte_cost().as_yoctonear();
        let credit = Self::balance(&self.storage_credit, owner);
        let next = if after > before {
            credit
                .checked_sub(
                    u128::from(after - before)
                        .checked_mul(price)
                        .expect("storage cost overflow"),
                )
                .expect("Insufficient storage credit; fund with an additional storage deposit")
        } else {
            credit
                .checked_add(
                    u128::from(before - after)
                        .checked_mul(price)
                        .expect("storage cost overflow"),
                )
                .expect("storage credit overflow")
        };
        self.storage_credit.insert(owner.clone(), next);
        self.storage_credit.flush();
    }
    fn withdrawal_engine(&self, id: &String) -> (String, Escrow) {
        let withdrawal = self
            .withdrawals
            .get(id)
            .expect("unknown withdrawal")
            .clone();
        let owner = withdrawal.owner.clone();
        let mut engine = self.engine(&owner);
        engine.withdrawals.insert(id.clone(), withdrawal);
        (owner, engine)
    }
}
#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            available: LookupMap::new(b"p3:a".to_vec()),
            jobs: LookupMap::new(b"p3:j".to_vec()),
            used_quotes: LookupMap::new(b"p3:q".to_vec()),
            withdrawals: LookupMap::new(b"p3:w".to_vec()),
            storage_credit: LookupMap::new(b"p3:s".to_vec()),
            reserved: LookupMap::new(b"p3:r".to_vec()),
            withdrawal_pending: LookupMap::new(b"p3:p".to_vec()),
        }
    }
    #[payable]
    pub fn fund(&mut self, storage_deposit: U128) {
        direct();
        let before = env::storage_usage();
        let owner = actor();
        let amount = env::attached_deposit()
            .as_yoctonear()
            .checked_sub(storage_deposit.0)
            .expect("storage deposit exceeds attached deposit");
        // Create fixed-size counters before charging, including this owner's credit entry.
        Self::adjust(&mut self.storage_credit, &owner, storage_deposit.0, true);
        self.reserved.entry(owner.clone()).or_insert(0);
        self.withdrawal_pending.entry(owner.clone()).or_insert(0);
        let mut engine = self.engine(&owner);
        result(engine.fund(&owner, amount));
        self.available
            .insert(owner.clone(), engine.available[&owner]);
        self.charge_storage(&owner, before);
        emit("", "funded");
    }
    pub fn approve(&mut self, job_id: String, mandate: Mandate) {
        direct();
        let before = env::storage_usage();
        let owner = mandate.owner.clone();
        assert_eq!(
            mandate.domain,
            format!("styx:testnet:{}", env::current_account_id())
        );
        for id in [&mandate.owner, &mandate.agent, &mandate.verifier] {
            let _: AccountId = id.parse().expect("invalid role account");
        }
        for public in [
            &mandate.owner_key,
            &mandate.agent_key,
            &mandate.verifier_key,
        ] {
            let _: near_sdk::PublicKey = public.parse().expect("invalid role public key");
        }
        for recipient in &mandate.recipients {
            let _: AccountId = recipient.parse().expect("invalid recipient account");
        }
        let mut engine = self.engine(&owner);
        if let Some(existing) = self.jobs.get(&job_id) {
            engine.jobs.insert(job_id.clone(), existing.clone());
        }
        result(engine.approve(&job_id, mandate, &actor(), &key(), now()));
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "approved");
    }
    pub fn reserve(&mut self, job_id: String, quote: Quote) {
        direct();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        let quote_id = quote.id.clone();
        let amount = quote.amount;
        if let Some(existing) = self.used_quotes.get(&quote_id) {
            engine
                .used_quotes
                .insert(quote_id.clone(), existing.clone());
        }
        result(engine.reserve(&job_id, quote, &actor(), &key(), now()));
        self.used_quotes.insert(quote_id, job_id.clone());
        Self::adjust(&mut self.reserved, &owner, amount, true);
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "reserved");
    }
    pub fn deliver(&mut self, job_id: String, artifact_hash: String) {
        direct();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        result(engine.deliver(&job_id, artifact_hash, &actor()));
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "delivered");
    }
    pub fn attest(&mut self, job_id: String, attestation: Attestation) {
        direct();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        result(engine.attest(&job_id, attestation, &actor(), &key(), now()));
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "verified");
    }
    pub fn release(&mut self, job_id: String, artifact_hash: String) -> Promise {
        direct();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        let (recipient, amount, attempt) =
            result(engine.release(&job_id, &artifact_hash, &actor(), &key(), now()));
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "payment_pending");
        Promise::new(recipient.parse().unwrap())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_transfer",
                    near_sdk::serde_json::to_vec(
                        &near_sdk::serde_json::json!({"job_id":job_id,"attempt":attempt}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
    }
    #[private]
    pub fn on_transfer(&mut self, job_id: String, attempt: u64) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "private callback required"
        );
        assert_eq!(env::promise_results_count(), 1);
        let success = env::promise_result_checked(0, 1024).is_ok();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        result(engine.callback(&job_id, attempt, success));
        if success {
            Self::adjust(
                &mut self.reserved,
                &owner,
                engine.jobs[&job_id].quote.as_ref().unwrap().amount,
                false,
            );
        }
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, if success { "paid" } else { "transfer_failed" });
    }
    pub fn refund(&mut self, job_id: String) {
        direct();
        let before = env::storage_usage();
        let (owner, mut engine) = self.job_engine(&job_id);
        let amount = engine.jobs[&job_id]
            .quote
            .as_ref()
            .map(|q| q.amount)
            .unwrap_or(0);
        result(engine.refund(&job_id, &actor(), &key(), now()));
        Self::adjust(&mut self.reserved, &owner, amount, false);
        self.store_job(&job_id, &owner, &engine);
        self.charge_storage(&owner, before);
        emit(&job_id, "reservation_refunded");
    }
    pub fn withdraw(&mut self, withdrawal_id: String, amount: U128) -> Promise {
        direct();
        let before = env::storage_usage();
        let owner = actor();
        let mut engine = self.engine(&owner);
        if let Some(existing) = self.withdrawals.get(&withdrawal_id) {
            engine
                .withdrawals
                .insert(withdrawal_id.clone(), existing.clone());
        }
        result(engine.withdraw(&withdrawal_id, &owner, amount.0));
        self.available
            .insert(owner.clone(), engine.available[&owner]);
        self.withdrawals.insert(
            withdrawal_id.clone(),
            engine.withdrawals[&withdrawal_id].clone(),
        );
        Self::adjust(&mut self.withdrawal_pending, &owner, amount.0, true);
        self.charge_storage(&owner, before);
        emit(&withdrawal_id, "withdrawal_pending");
        Promise::new(env::predecessor_account_id())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_withdrawal",
                    near_sdk::serde_json::to_vec(
                        &near_sdk::serde_json::json!({"withdrawal_id":withdrawal_id}),
                    )
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(15),
                ),
            )
    }
    #[private]
    pub fn on_withdrawal(&mut self, withdrawal_id: String) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "private callback required"
        );
        assert_eq!(env::promise_results_count(), 1);
        let success = env::promise_result_checked(0, 1024).is_ok();
        let before = env::storage_usage();
        let (owner, mut engine) = self.withdrawal_engine(&withdrawal_id);
        let amount = engine.withdrawals[&withdrawal_id].amount;
        result(engine.withdrawal_callback(&withdrawal_id, success));
        Self::adjust(&mut self.withdrawal_pending, &owner, amount, false);
        self.available
            .insert(owner.clone(), engine.available[&owner]);
        self.withdrawals.insert(
            withdrawal_id.clone(),
            engine.withdrawals[&withdrawal_id].clone(),
        );
        self.charge_storage(&owner, before);
        emit(
            &withdrawal_id,
            if success {
                "withdrawn"
            } else {
                "withdrawal_failed"
            },
        );
    }
    pub fn get_balance(&self, owner: String) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({"available":U128(Self::balance(&self.available,&owner)),"reserved":U128(Self::balance(&self.reserved,&owner)),"withdrawal_pending":U128(Self::balance(&self.withdrawal_pending,&owner)),"storage_credit":U128(Self::balance(&self.storage_credit,&owner))})
    }
    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({"version":"styx-escrow/2","storage_layout":"keyed/v3","network":"testnet","domain":format!("styx:testnet:{}",env::current_account_id())})
    }
    pub fn get_withdrawal(&self, withdrawal_id: String) -> near_sdk::serde_json::Value {
        let w = self
            .withdrawals
            .get(&withdrawal_id)
            .expect("unknown withdrawal");
        near_sdk::serde_json::json!({"owner":w.owner,"amount":U128(w.amount),"state":w.state})
    }
    pub fn get_job(&self, job_id: String) -> near_sdk::serde_json::Value {
        let j = self.jobs.get(&job_id).expect("unknown job");
        near_sdk::serde_json::json!({"state":j.state,"mandate":j.mandate,"quote":j.quote,"attestation":j.attestation,"artifact_hash":j.artifact_hash,"attempt":j.attempt})
    }
}
