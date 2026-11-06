//! The exact policy engine used by the NEAR entry points is dependency-free and
//! tested natively. Enable `near` and build wasm32-unknown-unknown for deployment.
use std::collections::BTreeMap;

#[cfg(feature = "near")]
mod decimal {
    use near_sdk::serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(amount: &u128, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&amount.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u128, D::Error> {
        let value = String::deserialize(deserializer)?;
        value.parse().map_err(near_sdk::serde::de::Error::custom)
    }
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "near",
    derive(
        borsh::BorshDeserialize,
        borsh::BorshSerialize,
        near_sdk::serde::Serialize,
        near_sdk::serde::Deserialize
    )
)]
#[cfg_attr(feature = "near", serde(crate = "near_sdk::serde"))]
pub enum State {
    Approved,
    Reserved,
    PaymentPending,
    Paid,
    Refunded,
}

#[derive(Clone, Debug)]
#[cfg_attr(
    feature = "near",
    derive(
        borsh::BorshDeserialize,
        borsh::BorshSerialize,
        near_sdk::serde::Serialize,
        near_sdk::serde::Deserialize
    )
)]
#[cfg_attr(feature = "near", serde(crate = "near_sdk::serde"))]
pub struct Mandate {
    pub owner: String,
    pub owner_key: String,
    pub agent: String,
    pub agent_key: String,
    pub verifier: String,
    pub verifier_key: String,
    pub recipients: Vec<String>,
    #[cfg_attr(feature = "near", serde(with = "decimal"))]
    pub cap: u128,
    pub expires: u64,
    pub mandate_hash: String,
    pub input_hash: String,
    pub checks_version: String,
    pub asset: String,
    pub domain: String,
}

#[derive(Clone, Debug)]
#[cfg_attr(
    feature = "near",
    derive(
        borsh::BorshDeserialize,
        borsh::BorshSerialize,
        near_sdk::serde::Serialize,
        near_sdk::serde::Deserialize
    )
)]
#[cfg_attr(feature = "near", serde(crate = "near_sdk::serde"))]
pub struct Quote {
    pub id: String,
    pub recipient: String,
    #[cfg_attr(feature = "near", serde(with = "decimal"))]
    pub amount: u128,
    pub expires: u64,
    pub mandate_hash: String,
    pub asset: String,
}

#[derive(Clone, Debug)]
#[cfg_attr(
    feature = "near",
    derive(
        borsh::BorshDeserialize,
        borsh::BorshSerialize,
        near_sdk::serde::Serialize,
        near_sdk::serde::Deserialize
    )
)]
#[cfg_attr(feature = "near", serde(crate = "near_sdk::serde"))]
pub struct Attestation {
    pub job_id: String,
    pub mandate_hash: String,
    pub input_hash: String,
    pub artifact_hash: String,
    pub checks_version: String,
    pub domain: String,
    pub expires: u64,
    pub pass: bool,
}

#[derive(Clone, Debug)]
#[cfg_attr(
    feature = "near",
    derive(borsh::BorshDeserialize, borsh::BorshSerialize)
)]
pub struct Job {
    pub mandate: Mandate,
    pub state: State,
    pub quote: Option<Quote>,
    pub attestation: Option<Attestation>,
    pub artifact_hash: Option<String>,
    pub attempt: u64,
}

#[derive(Default)]
#[cfg_attr(
    feature = "near",
    derive(borsh::BorshDeserialize, borsh::BorshSerialize)
)]
pub struct Escrow {
    pub available: BTreeMap<String, u128>,
    pub jobs: BTreeMap<String, Job>,
    pub used_quotes: BTreeMap<String, String>,
    pub withdrawals: BTreeMap<String, Withdrawal>,
}

#[derive(Clone, Debug, PartialEq)]
#[cfg_attr(
    feature = "near",
    derive(
        borsh::BorshDeserialize,
        borsh::BorshSerialize,
        near_sdk::serde::Serialize,
        near_sdk::serde::Deserialize
    )
)]
#[cfg_attr(feature = "near", serde(crate = "near_sdk::serde"))]
pub enum TransferState {
    Pending,
    Completed,
    Failed,
}

#[derive(Clone, Debug)]
#[cfg_attr(
    feature = "near",
    derive(borsh::BorshDeserialize, borsh::BorshSerialize)
)]
pub struct Withdrawal {
    pub owner: String,
    pub amount: u128,
    pub state: TransferState,
}

fn require(ok: bool, reason: &str) -> Result<(), String> {
    if ok {
        Ok(())
    } else {
        Err(reason.into())
    }
}
fn identifier(value: &str) -> bool {
    !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control)
}
impl Escrow {
    pub fn withdraw(&mut self, id: &str, owner: &str, amount: u128) -> Result<(), String> {
        require(identifier(id), "invalid withdrawal identifier")?;
        require(
            !self.withdrawals.contains_key(id),
            "withdrawal identifier already used",
        )?;
        require(amount > 0, "zero withdrawal")?;
        let balance = self.available.get(owner).copied().unwrap_or(0);
        require(balance >= amount, "insufficient available escrow")?;
        self.available.insert(owner.into(), balance - amount);
        self.withdrawals.insert(
            id.into(),
            Withdrawal {
                owner: owner.into(),
                amount,
                state: TransferState::Pending,
            },
        );
        Ok(())
    }
    pub fn withdrawal_callback(&mut self, id: &str, success: bool) -> Result<(), String> {
        let w = self.withdrawals.get(id).ok_or("unknown withdrawal")?;
        require(
            w.state == TransferState::Pending,
            "stale withdrawal callback",
        )?;
        if !success {
            let amount = self
                .available
                .get(&w.owner)
                .copied()
                .unwrap_or(0)
                .checked_add(w.amount)
                .ok_or("overflow")?;
            self.available.insert(w.owner.clone(), amount);
        }
        self.withdrawals.get_mut(id).unwrap().state = if success {
            TransferState::Completed
        } else {
            TransferState::Failed
        };
        Ok(())
    }
    pub fn fund(&mut self, owner: &str, amount: u128) -> Result<(), String> {
        require(amount > 0, "zero funding")?;
        let balance = self
            .available
            .get(owner)
            .copied()
            .unwrap_or(0)
            .checked_add(amount)
            .ok_or("overflow")?;
        self.available.insert(owner.into(), balance);
        Ok(())
    }
    pub fn approve(
        &mut self,
        id: &str,
        m: Mandate,
        actor: &str,
        key: &str,
        now: u64,
    ) -> Result<(), String> {
        require(identifier(id), "invalid job identifier")?;
        require(
            [&m.owner, &m.agent, &m.verifier]
                .iter()
                .all(|v| !v.is_empty() && v.len() <= 64)
                && [&m.owner_key, &m.agent_key, &m.verifier_key]
                    .iter()
                    .all(|v| identifier(v))
                && !m.checks_version.is_empty()
                && m.checks_version.len() <= 64
                && m.domain.len() <= 100
                && m.recipients.len() <= 8
                && m.recipients.iter().all(|v| !v.is_empty() && v.len() <= 64),
            "mandate fields exceed supported limits",
        )?;
        require(
            !self.jobs.contains_key(id),
            "job identifier is immutable; use a new version identifier",
        )?;
        require(
            actor == m.owner && key == m.owner_key,
            "owner principal and key required",
        )?;
        require(
            m.owner != m.agent && m.owner != m.verifier && m.agent != m.verifier,
            "roles must be distinct",
        )?;
        require(
            m.owner_key != m.agent_key
                && m.owner_key != m.verifier_key
                && m.agent_key != m.verifier_key,
            "keys must be distinct",
        )?;
        require(
            m.cap > 0 && m.expires > now && !m.recipients.is_empty(),
            "invalid mandate",
        )?;
        require(
            m.asset == "near:testnet:native:24" && m.domain.starts_with("styx:testnet:"),
            "unsupported domain or asset",
        )?;
        require(
            [&m.mandate_hash, &m.input_hash]
                .iter()
                .all(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit())),
            "invalid hash",
        )?;
        self.jobs.insert(
            id.into(),
            Job {
                mandate: m,
                state: State::Approved,
                quote: None,
                attestation: None,
                artifact_hash: None,
                attempt: 0,
            },
        );
        Ok(())
    }
    pub fn reserve(
        &mut self,
        id: &str,
        q: Quote,
        actor: &str,
        key: &str,
        now: u64,
    ) -> Result<(), String> {
        require(identifier(&q.id), "invalid quote identifier")?;
        let j = self.jobs.get(id).ok_or("unknown job")?;
        let m = &j.mandate;
        require(
            actor == m.agent && key == m.agent_key,
            "agent principal and key required",
        )?;
        require(j.state == State::Approved, "already reserved or finalized")?;
        require(
            now < m.expires && now < q.expires,
            "expired mandate or quote",
        )?;
        require(
            q.mandate_hash == m.mandate_hash && q.asset == m.asset,
            "quote binding mismatch",
        )?;
        require(m.recipients.contains(&q.recipient), "recipient not allowed")?;
        require(!self.used_quotes.contains_key(&q.id), "quote replay")?;
        require(q.amount > 0 && q.amount <= m.cap, "cap exceeded")?;
        let balance = self.available.get(&m.owner).copied().unwrap_or(0);
        require(balance >= q.amount, "insufficient funds")?;
        self.available.insert(m.owner.clone(), balance - q.amount);
        self.used_quotes.insert(q.id.clone(), id.into());
        let j = self.jobs.get_mut(id).unwrap();
        j.state = State::Reserved;
        j.quote = Some(q);
        Ok(())
    }
    pub fn deliver(&mut self, id: &str, artifact_hash: String, actor: &str) -> Result<(), String> {
        let j = self.jobs.get_mut(id).ok_or("unknown job")?;
        require(
            j.state == State::Reserved
                && j.quote.as_ref().map(|q| q.recipient.as_str()) == Some(actor),
            "reserved provider required",
        )?;
        require(
            artifact_hash.len() == 64 && artifact_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "invalid artifact hash",
        )?;
        j.artifact_hash = Some(artifact_hash);
        j.attestation = None;
        Ok(())
    }
    pub fn attest(
        &mut self,
        id: &str,
        a: Attestation,
        actor: &str,
        key: &str,
        now: u64,
    ) -> Result<(), String> {
        let j = self.jobs.get_mut(id).ok_or("unknown job")?;
        let m = &j.mandate;
        require(
            actor == m.verifier && key == m.verifier_key,
            "verifier principal and key required",
        )?;
        require(
            j.state == State::Reserved
                && now < m.expires
                && a.expires > now
                && a.expires <= m.expires
                && a.pass,
            "invalid verification state or expiry",
        )?;
        require(
            a.job_id == id
                && a.mandate_hash == m.mandate_hash
                && a.input_hash == m.input_hash
                && a.checks_version == m.checks_version
                && a.domain == m.domain
                && Some(&a.artifact_hash) == j.artifact_hash.as_ref(),
            "attestation binding mismatch",
        )?;
        j.attestation = Some(a);
        Ok(())
    }
    pub fn release(
        &mut self,
        id: &str,
        artifact_hash: &str,
        actor: &str,
        key: &str,
        now: u64,
    ) -> Result<(String, u128, u64), String> {
        let j = self.jobs.get_mut(id).ok_or("unknown job")?;
        let m = &j.mandate;
        require(
            actor == m.owner && key == m.owner_key,
            "owner principal and key required",
        )?;
        require(
            j.state == State::Reserved && now < m.expires,
            "not releasable",
        )?;
        let a = j.attestation.as_ref().ok_or("verification required")?;
        require(
            a.pass
                && a.expires > now
                && a.artifact_hash == artifact_hash
                && Some(&a.artifact_hash) == j.artifact_hash.as_ref(),
            "invalid owner acceptance or attestation",
        )?;
        let q = j.quote.as_ref().unwrap();
        j.state = State::PaymentPending;
        j.attempt += 1;
        Ok((q.recipient.clone(), q.amount, j.attempt))
    }
    // Only the private wrapper callback may invoke this engine method onchain.
    pub fn callback(&mut self, id: &str, attempt: u64, success: bool) -> Result<(), String> {
        let j = self.jobs.get_mut(id).ok_or("unknown job")?;
        require(
            j.state == State::PaymentPending && j.attempt == attempt,
            "stale callback",
        )?;
        j.state = if success {
            State::Paid
        } else {
            State::Reserved
        };
        if !success {
            j.attestation = None;
        }
        Ok(())
    }
    pub fn refund(&mut self, id: &str, actor: &str, key: &str, now: u64) -> Result<(), String> {
        let j = self.jobs.get(id).ok_or("unknown job")?;
        let m = &j.mandate;
        // Owner can cancel before payment; anyone can release an expired reservation.
        require(
            (actor == m.owner && key == m.owner_key) || now >= m.expires,
            "owner cancellation or expiry required",
        )?;
        require(
            j.state == State::Reserved || j.state == State::Approved,
            "pending/paid/final reservations cannot refund",
        )?;
        let amount = j.quote.as_ref().map(|q| q.amount).unwrap_or(0);
        let owner = m.owner.clone();
        let balance = self
            .available
            .get(&owner)
            .copied()
            .unwrap_or(0)
            .checked_add(amount)
            .ok_or("overflow")?;
        self.available.insert(owner, balance);
        self.jobs.get_mut(id).unwrap().state = State::Refunded;
        Ok(())
    }
}

#[cfg(all(feature = "near", not(feature = "persistent-state")))]
mod chain {
    use super::*;
    use near_sdk::json_types::U128;
    use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};
    #[near(contract_state)]
    #[derive(PanicOnDefault)]
    pub struct Contract {
        engine: Escrow,
        storage_credit: BTreeMap<String, u128>,
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
    fn result<T>(r: Result<T, String>) -> T {
        r.unwrap_or_else(|e| env::panic_str(&e))
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
        // Persist before measuring: the engine uses Borsh-serialized maps, whose
        // storage growth is otherwise only observable after the SDK writes state.
        fn charge_storage(&mut self, owner: &str, before: u64) {
            env::state_write(self);
            let after = env::storage_usage();
            let price = env::storage_byte_cost().as_yoctonear();
            let credit = self.storage_credit.get(owner).copied().unwrap_or(0);
            let updated = if after > before {
                credit
                    .checked_sub(u128::from(after - before) * price)
                    .expect("Insufficient storage credit; fund with an additional storage deposit")
            } else {
                credit
                    .checked_add(u128::from(before - after) * price)
                    .expect("storage credit overflow")
            };
            self.storage_credit.insert(owner.into(), updated);
            env::state_write(self);
        }
        fn job_owner(&self, job_id: &str) -> String {
            self.engine
                .jobs
                .get(job_id)
                .expect("unknown job")
                .mandate
                .owner
                .clone()
        }
    }
    #[near]
    impl Contract {
        #[init]
        pub fn new() -> Self {
            Self {
                engine: Escrow::default(),
                storage_credit: BTreeMap::new(),
            }
        }
        #[payable]
        pub fn fund(&mut self, storage_deposit: U128) {
            direct();
            let before = env::storage_usage();
            let amount = env::attached_deposit()
                .as_yoctonear()
                .checked_sub(storage_deposit.0)
                .expect("storage deposit exceeds attached deposit");
            let credit = self
                .storage_credit
                .get(&actor())
                .copied()
                .unwrap_or(0)
                .checked_add(storage_deposit.0)
                .expect("overflow");
            self.storage_credit.insert(actor(), credit);
            result(self.engine.fund(&actor(), amount));
            self.charge_storage(&actor(), before);
            emit("", "funded");
        }
        pub fn approve(&mut self, job_id: String, mandate: Mandate) {
            direct();
            let before = env::storage_usage();
            assert_eq!(
                mandate.domain,
                format!("styx:testnet:{}", env::current_account_id())
            );
            for account in [&mandate.owner, &mandate.agent, &mandate.verifier] {
                let _: AccountId = account.parse().expect("invalid role account");
            }
            for public_key in [
                &mandate.owner_key,
                &mandate.agent_key,
                &mandate.verifier_key,
            ] {
                let _: near_sdk::PublicKey = public_key.parse().expect("invalid role public key");
            }
            for recipient in &mandate.recipients {
                let _: AccountId = recipient.parse().expect("invalid recipient account");
            }
            result(
                self.engine
                    .approve(&job_id, mandate, &actor(), &key(), now()),
            );
            self.charge_storage(&actor(), before);
            emit(&job_id, "approved");
        }
        pub fn reserve(&mut self, job_id: String, quote: Quote) {
            direct();
            let before = env::storage_usage();
            let owner = self.job_owner(&job_id);
            result(self.engine.reserve(&job_id, quote, &actor(), &key(), now()));
            self.charge_storage(&owner, before);
            emit(&job_id, "reserved");
        }
        pub fn deliver(&mut self, job_id: String, artifact_hash: String) {
            direct();
            let before = env::storage_usage();
            let owner = self.job_owner(&job_id);
            result(self.engine.deliver(&job_id, artifact_hash, &actor()));
            self.charge_storage(&owner, before);
            emit(&job_id, "delivered");
        }
        pub fn attest(&mut self, job_id: String, attestation: Attestation) {
            direct();
            let before = env::storage_usage();
            let owner = self.job_owner(&job_id);
            result(
                self.engine
                    .attest(&job_id, attestation, &actor(), &key(), now()),
            );
            self.charge_storage(&owner, before);
            emit(&job_id, "verified");
        }
        pub fn release(&mut self, job_id: String, artifact_hash: String) -> Promise {
            direct();
            let before = env::storage_usage();
            let (recipient, amount, attempt) =
                result(
                    self.engine
                        .release(&job_id, &artifact_hash, &actor(), &key(), now()),
                );
            self.charge_storage(&actor(), before);
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
            let owner = self.job_owner(&job_id);
            result(self.engine.callback(&job_id, attempt, success));
            self.charge_storage(&owner, before);
            emit(&job_id, if success { "paid" } else { "transfer_failed" });
        }
        pub fn refund(&mut self, job_id: String) {
            direct();
            let before = env::storage_usage();
            let owner = self.job_owner(&job_id);
            result(self.engine.refund(&job_id, &actor(), &key(), now()));
            self.charge_storage(&owner, before);
            emit(&job_id, "reservation_refunded");
        }
        pub fn get_balance(&self, owner: String) -> near_sdk::serde_json::Value {
            let reserved: u128 = self
                .engine
                .jobs
                .values()
                .filter(|j| {
                    j.mandate.owner == owner
                        && matches!(j.state, State::Reserved | State::PaymentPending)
                })
                .map(|j| j.quote.as_ref().map(|q| q.amount).unwrap_or(0))
                .sum();
            let pending: u128 = self
                .engine
                .withdrawals
                .values()
                .filter(|w| w.owner == owner && w.state == TransferState::Pending)
                .map(|w| w.amount)
                .sum();
            near_sdk::serde_json::json!({"available": U128(self.engine.available.get(&owner).copied().unwrap_or(0)), "reserved": U128(reserved), "withdrawal_pending": U128(pending), "storage_credit": U128(self.storage_credit.get(&owner).copied().unwrap_or(0))})
        }
        pub fn get_config(&self) -> near_sdk::serde_json::Value {
            near_sdk::serde_json::json!({"version":"styx-escrow/2", "network":"testnet", "domain":format!("styx:testnet:{}", env::current_account_id())})
        }
        pub fn withdraw(&mut self, withdrawal_id: String, amount: U128) -> Promise {
            direct();
            let before = env::storage_usage();
            result(self.engine.withdraw(&withdrawal_id, &actor(), amount.0));
            self.charge_storage(&actor(), before);
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
            result(self.engine.withdrawal_callback(&withdrawal_id, success));
            emit(
                &withdrawal_id,
                if success {
                    "withdrawn"
                } else {
                    "withdrawal_failed"
                },
            );
        }
        pub fn get_withdrawal(&self, withdrawal_id: String) -> near_sdk::serde_json::Value {
            let w = self
                .engine
                .withdrawals
                .get(&withdrawal_id)
                .expect("unknown withdrawal");
            near_sdk::serde_json::json!({"owner":w.owner,"amount":U128(w.amount),"state":w.state})
        }
        pub fn get_job(&self, job_id: String) -> near_sdk::serde_json::Value {
            let j = self.engine.jobs.get(&job_id).expect("unknown job");
            near_sdk::serde_json::json!({"state":j.state,"mandate":j.mandate,"quote":j.quote,"attestation":j.attestation,"artifact_hash":j.artifact_hash,"attempt":j.attempt})
        }
    }
    #[cfg(all(test, feature = "sdk-tests"))]
    mod sdk_tests;
}

// A separate fresh-deployment candidate. Never overwrite the deployed v2 state.
#[cfg(feature = "persistent-state")]
#[path = "chain/persistent.rs"]
mod chain;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oversized_or_empty_identifiers_cannot_create_records_or_lock_balance() {
        for invalid in [String::new(), "x".repeat(129), "bad\nidentifier".into()] {
            let mut e = Escrow::default();
            e.fund("owner.testnet", 500).unwrap();
            assert!(e
                .approve(&invalid, m(), "owner.testnet", "owner-key", 1)
                .is_err());
            assert!(e.jobs.is_empty());
            assert!(e.withdraw(&invalid, "owner.testnet", 100).is_err());
            assert_eq!(e.available["owner.testnet"], 500);
            assert!(e.withdrawals.is_empty());
            let mut e = setup();
            let mut quote = q();
            quote.id = invalid;
            assert!(e
                .reserve("job:1", quote, "agent.testnet", "agent-key", 2)
                .is_err());
            assert!(e.used_quotes.is_empty());
            assert_eq!(e.available["owner.testnet"], 500);
            assert_eq!(e.jobs["job:1"].state, State::Approved);
        }
    }
    #[test]
    fn malformed_mandate_fields_fail_before_persisting() {
        for n in 0..8 {
            let mut e = Escrow::default();
            let mut mandate = m();
            match n {
                0 => mandate.checks_version = "x".repeat(65),
                1 => mandate.checks_version.clear(),
                2 => mandate.recipients = vec!["provider.testnet".into(); 9],
                3 => mandate.agent = "x".repeat(65),
                4 => mandate.verifier_key.clear(),
                5 => mandate.domain = "styx:testnet:".to_owned() + &"x".repeat(100),
                6 => mandate.recipients = vec!["x".repeat(65)],
                _ => mandate.agent_key = "x".repeat(129),
            }
            assert!(e
                .approve("job:1", mandate, "owner.testnet", "owner-key", 1)
                .is_err());
            assert!(e.jobs.is_empty());
        }
    }
    #[test]
    fn withdrawals_lock_available_and_cannot_spend_reservations() {
        let mut e = reserved();
        assert!(e.withdraw("w:overspend", "owner.testnet", 181).is_err());
        e.withdraw("w:1", "owner.testnet", 180).unwrap();
        assert_eq!(e.available["owner.testnet"], 0);
        assert_eq!(e.jobs["job:1"].state, State::Reserved);
        assert!(e.withdraw("w:2", "owner.testnet", 1).is_err());
        assert!(e.withdraw("w:3", "attacker.testnet", 1).is_err());
    }
    #[test]
    fn failed_withdrawal_restores_once_and_rejects_replay() {
        let mut e = setup();
        e.withdraw("w:1", "owner.testnet", 200).unwrap();
        e.withdrawal_callback("w:1", false).unwrap();
        assert_eq!(e.available["owner.testnet"], 500);
        assert_eq!(e.withdrawals["w:1"].state, TransferState::Failed);
        assert!(e.withdrawal_callback("w:1", false).is_err());
        assert!(e.withdraw("w:1", "owner.testnet", 100).is_err());
    }
    #[test]
    fn successful_withdrawal_cannot_be_refunded_by_callback() {
        let mut e = setup();
        e.withdraw("w:1", "owner.testnet", 500).unwrap();
        e.withdrawal_callback("w:1", true).unwrap();
        assert_eq!(e.available["owner.testnet"], 0);
        assert_eq!(e.withdrawals["w:1"].state, TransferState::Completed);
        assert!(e.withdrawal_callback("w:1", false).is_err());
    }
    #[test]
    fn pending_withdrawal_and_reservation_compete_for_one_balance() {
        let mut e = setup();
        e.withdraw("w:1", "owner.testnet", 200).unwrap();
        assert!(e
            .reserve("job:1", q(), "agent.testnet", "agent-key", 2)
            .is_err());
        e.withdrawal_callback("w:1", false).unwrap();
        e.reserve("job:1", q(), "agent.testnet", "agent-key", 2)
            .unwrap();
        assert!(e.withdraw("w:2", "owner.testnet", 200).is_err());
        assert!(e.withdraw("w:zero", "owner.testnet", 0).is_err());
    }
    fn m() -> Mandate {
        Mandate {
            owner: "owner.testnet".into(),
            owner_key: "owner-key".into(),
            agent: "agent.testnet".into(),
            agent_key: "agent-key".into(),
            verifier: "verifier.testnet".into(),
            verifier_key: "verifier-key".into(),
            recipients: vec!["provider.testnet".into()],
            cap: 500,
            expires: 1000,
            mandate_hash: "a".repeat(64),
            input_hash: "b".repeat(64),
            checks_version: "invoice-checks/v1".into(),
            asset: "near:testnet:native:24".into(),
            domain: "styx:testnet:escrow.testnet".into(),
        }
    }
    fn q() -> Quote {
        Quote {
            id: "quote-1".into(),
            recipient: "provider.testnet".into(),
            amount: 320,
            expires: 500,
            mandate_hash: "a".repeat(64),
            asset: "near:testnet:native:24".into(),
        }
    }
    fn a() -> Attestation {
        Attestation {
            job_id: "job:1".into(),
            mandate_hash: "a".repeat(64),
            input_hash: "b".repeat(64),
            artifact_hash: "c".repeat(64),
            checks_version: "invoice-checks/v1".into(),
            domain: "styx:testnet:escrow.testnet".into(),
            expires: 900,
            pass: true,
        }
    }
    fn setup() -> Escrow {
        let mut e = Escrow::default();
        e.fund("owner.testnet", 500).unwrap();
        e.approve("job:1", m(), "owner.testnet", "owner-key", 1)
            .unwrap();
        e
    }
    fn reserved() -> Escrow {
        let mut e = setup();
        e.reserve("job:1", q(), "agent.testnet", "agent-key", 2)
            .unwrap();
        e
    }
    fn verified() -> Escrow {
        let mut e = reserved();
        e.deliver("job:1", "c".repeat(64), "provider.testnet")
            .unwrap();
        e.attest("job:1", a(), "verifier.testnet", "verifier-key", 3)
            .unwrap();
        e
    }
    #[test]
    fn payout_locks_before_callback_and_is_once() {
        let mut e = verified();
        let (_, amount, attempt) = e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 4)
            .unwrap();
        assert_eq!(amount, 320);
        assert_eq!(e.jobs["job:1"].state, State::PaymentPending);
        assert!(e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 5)
            .is_err());
        e.callback("job:1", attempt, true).unwrap();
        assert_eq!(e.jobs["job:1"].state, State::Paid);
        assert!(e.callback("job:1", attempt, true).is_err());
        assert_eq!(e.available["owner.testnet"], 180);
    }
    #[test]
    fn failed_transfer_restores_reservation_requires_new_attestation() {
        let mut e = verified();
        let (_, _, n) = e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 4)
            .unwrap();
        e.callback("job:1", n, false).unwrap();
        assert_eq!(e.jobs["job:1"].state, State::Reserved);
        assert!(e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 5)
            .is_err());
        e.refund("job:1", "owner.testnet", "owner-key", 6).unwrap();
        assert_eq!(e.available["owner.testnet"], 500);
    }
    #[test]
    fn payment_refund_races() {
        let mut e = verified();
        e.release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 4)
            .unwrap();
        assert!(e.refund("job:1", "anyone", "", 1001).is_err());
        e.callback("job:1", 1, true).unwrap();
        assert!(e
            .refund("job:1", "owner.testnet", "owner-key", 1002)
            .is_err());
        let mut e = verified();
        e.refund("job:1", "owner.testnet", "owner-key", 4).unwrap();
        assert!(e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 5)
            .is_err());
        assert!(e.refund("job:1", "anyone", "", 1001).is_err());
    }
    #[test]
    fn rejects_recipient_cap_expiry_asset_and_wrong_key() {
        for n in 0..7 {
            let mut e = setup();
            let mut quote = q();
            match n {
                0 => quote.recipient = "attacker.testnet".into(),
                1 => quote.amount = 501,
                2 => quote.expires = 1,
                3 => quote.asset = "usd".into(),
                4 => quote.mandate_hash = "wrong".into(),
                _ => (),
            };
            let key = if n == 5 { "owner-key" } else { "agent-key" };
            let now = if n == 6 { 1001 } else { 2 };
            assert!(e
                .reserve("job:1", quote, "agent.testnet", key, now)
                .is_err());
            assert_eq!(e.available["owner.testnet"], 500);
        }
    }
    #[test]
    fn cumulative_reservations_and_quote_replay() {
        let mut e = reserved();
        e.approve("job:2", m(), "owner.testnet", "owner-key", 1)
            .unwrap();
        let mut quote = q();
        assert!(e
            .reserve("job:2", quote.clone(), "agent.testnet", "agent-key", 3)
            .is_err());
        quote.id = "quote-2".into();
        assert!(e
            .reserve("job:2", quote, "agent.testnet", "agent-key", 3)
            .is_err());
        assert_eq!(e.available["owner.testnet"], 180);
    }
    #[test]
    fn attestation_cannot_cross_job_domain_inputs_or_artifact() {
        for n in 0..6 {
            let mut e = reserved();
            e.deliver("job:1", "c".repeat(64), "provider.testnet")
                .unwrap();
            let mut att = a();
            match n {
                0 => att.job_id = "job:2".into(),
                1 => att.domain = "styx:mainnet:escrow.testnet".into(),
                2 => att.input_hash = "d".repeat(64),
                3 => att.artifact_hash = "d".repeat(64),
                4 => att.pass = false,
                _ => att.expires = 2,
            };
            assert!(e
                .attest("job:1", att, "verifier.testnet", "verifier-key", 3)
                .is_err());
        }
    }
    #[test]
    fn owner_and_verifier_keys_are_not_interchangeable() {
        let mut e = reserved();
        e.deliver("job:1", "c".repeat(64), "provider.testnet")
            .unwrap();
        assert!(e
            .attest("job:1", a(), "verifier.testnet", "agent-key", 3)
            .is_err());
        let mut e = verified();
        assert!(e
            .release("job:1", &"c".repeat(64), "owner.testnet", "agent-key", 4)
            .is_err());
        assert!(e
            .release("job:1", &"d".repeat(64), "owner.testnet", "owner-key", 4)
            .is_err());
    }
    #[test]
    fn artifact_change_invalidates_previous_attestation() {
        let mut e = verified();
        e.deliver("job:1", "d".repeat(64), "provider.testnet")
            .unwrap();
        assert!(e
            .release("job:1", &"c".repeat(64), "owner.testnet", "owner-key", 4)
            .is_err());
    }
    #[test]
    fn wrong_owner_key_cannot_approve_or_refund() {
        let mut e = Escrow::default();
        assert!(e
            .approve("job:1", m(), "owner.testnet", "agent-key", 1)
            .is_err());
        let mut e = reserved();
        assert!(e.refund("job:1", "owner.testnet", "agent-key", 3).is_err());
        e.refund("job:1", "unrelated.testnet", "", 1001).unwrap();
        assert_eq!(e.available["owner.testnet"], 500);
    }
}
