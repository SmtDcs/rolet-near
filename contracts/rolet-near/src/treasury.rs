//! Treasury ve ops muhasebesi (T-108, DESIGN §4.7/§4.9).

use crate::Contract;
// `#[near] impl Contract` bloğunun ürettiği ext sarmalayıcıları bu tipe
// ekler; struct tanımı `#[near(contract_state)]` tarafından crate kökünde
// üretilir.
use crate::ContractExt;
use near_sdk::{env, near, NearToken, Promise};

#[near]
impl Contract {
    /// Treasury'ye fon aktarır; herkes çağırabilir (DESIGN §4.7).
    #[payable]
    pub fn fund_treasury(&mut self) {
        self.treasury = self.treasury.saturating_add(env::attached_deposit());
    }

    /// Biriken ops payını owner'a gönderir (§4.9: satış payının %5'u).
    pub fn withdraw_ops(&mut self) {
        self.assert_owner();
        let amount = self.ops_balance;
        if amount > NearToken::ZERO {
            self.ops_balance = NearToken::ZERO;
            Promise::new(self.owner.clone()).transfer(amount).detach();
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::{Config, Contract};
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::{NearToken};

    fn setup(attached: NearToken, predecessor: &str) -> Contract {
        let ctx = VMContextBuilder::new()
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(attached)
            .build();
        near_sdk::testing_env!(ctx);
        Contract::new("owner.testnet".parse().unwrap(), Config::default())
    }

    /// T-108 bitti kuralı: fund_treasury treasury'yi artırır.
    #[test]
    fn fund_treasury_increases_treasury() {
        let mut c = setup(NearToken::from_millinear(250), "donor.testnet");
        c.fund_treasury();
        assert_eq!(c.treasury, NearToken::from_millinear(250));
        assert_eq!(c.ops_balance, NearToken::ZERO);
    }

    /// T-108: withdraw_ops biriken payı owner'a transfer eder ve sıfırlar.
    #[test]
    fn withdraw_ops_transfers_to_owner() {
        let mut c = setup(NearToken::ZERO, "owner.testnet");
        c.ops_balance = NearToken::from_millinear(50);
        c.treasury = NearToken::from_millinear(500);
        c.withdraw_ops();
        assert_eq!(c.ops_balance, NearToken::ZERO);
        assert_eq!(c.treasury, NearToken::from_millinear(500)); // treasury'e dokunmaz
        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id, "owner.testnet".parse::<near_sdk::AccountId>().unwrap());
        assert!(receipts[0].actions.iter().any(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } =>
                *deposit == NearToken::from_millinear(50),
            _ => false,
        }));
    }

    /// T-108: bakiye sıfırsa gereksiz transfer üretmez.
    #[test]
    fn withdraw_ops_noop_when_empty() {
        let mut c = setup(NearToken::ZERO, "owner.testnet");
        c.withdraw_ops();
        assert!(get_created_receipts().is_empty());
    }

    /// T-108 bitti kuralı: owner olmayan withdraw edemez.
    #[test]
    #[should_panic(expected = "owner only")]
    fn non_owner_cannot_withdraw_ops() {
        let mut c = setup(NearToken::ZERO, "mallory.testnet");
        c.ops_balance = NearToken::from_millinear(50);
        c.withdraw_ops();
    }
}
