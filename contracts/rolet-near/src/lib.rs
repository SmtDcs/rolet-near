//! Rolet NEAR kontratı — kök state (T-108, DESIGN §4.5).
//!
//! Tek kontrat: oyun kuralları + NFT + treasury aynı hesapta (DESIGN §4.1).
//! Saf kural katmanı `game.rs`'tedir (`near_sdk::env` kullanmaz); bu dosya
//! ve kardeş modüller zincire bağlı katmanı oluşturur.

pub mod config;
pub mod events;
pub mod game;
pub mod matches;
pub mod nft;
pub mod rng;
pub mod treasury;
pub mod views;

use config::Config;
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault};

/// Kontrat durumu (DESIGN §4.5). Maç, oyuncu ve NFT koleksiyonları ilgili
/// görevlerde (T-109/T-110) eklenir.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// Admin; `set_config`, `pause`, `withdraw_ops` yalnız onda.
    owner: AccountId,
    /// Fiyatlar, ödül, süreler, round tablosu (tek yerden yönetim).
    config: Config,
    /// Ödül muhasebesi; gerçek bakiye kontrat hesabındadır (§4.5).
    treasury: NearToken,
    /// Karakter satışlarının `ops_bps` payı (§4.9).
    ops_balance: NearToken,
    /// Duraklatıldı; yeni maç kabulü T-110'da buna bağlanır.
    paused: bool,
}

#[near]
impl Contract {
    /// Kontratı kurar; `#[init]` makrosu ikinci kurulumu otomatik reddeder.
    #[init]
    pub fn new(owner: AccountId, config: Config) -> Self {
        Self {
            owner,
            config,
            treasury: NearToken::ZERO,
            ops_balance: NearToken::ZERO,
            paused: false,
        }
    }

    /// Yalnız owner'ın çağırabildiği metodların ortak bekçisi.
    pub fn assert_owner(&self) {
        near_sdk::require!(env::predecessor_account_id() == self.owner, "owner only");
    }

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        self.config = config;
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;

    fn setup(owner: &str, predecessor: &str) -> Contract {
        let ctx = VMContextBuilder::new()
            .predecessor_account_id(predecessor.parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);
        Contract::new(owner.parse().unwrap(), Config::default())
    }

    /// T-108: init owner'ı ve varsayılanları kurar.
    #[test]
    fn init_sets_owner_and_defaults() {
        let c = setup("owner.testnet", "deployer.testnet");
        assert_eq!(c.owner, "owner.testnet".parse::<AccountId>().unwrap());
        assert_eq!(c.config, Config::default());
        assert_eq!(c.treasury, NearToken::ZERO);
        assert_eq!(c.ops_balance, NearToken::ZERO);
        assert!(!c.paused);
    }

    /// T-108: owner config'i değiştirir, pause/unpause çalışır.
    #[test]
    fn owner_can_set_config_and_toggle_pause() {
        let mut c = setup("owner.testnet", "owner.testnet");
        let mut cfg = Config::default();
        cfg.turn_ms = 30_000;
        c.set_config(cfg.clone());
        assert_eq!(c.config, cfg);
        c.pause();
        assert!(c.paused);
        c.unpause();
        assert!(!c.paused);
    }

    /// T-108 bitti kuralı: owner olmayan reddedilir.
    #[test]
    #[should_panic(expected = "owner only")]
    fn non_owner_cannot_set_config() {
        let mut c = setup("owner.testnet", "mallory.testnet");
        c.set_config(Config::default());
    }

    /// T-108: owner olmayan pause da açamaz.
    #[test]
    #[should_panic(expected = "owner only")]
    fn non_owner_cannot_pause_or_unpause() {
        let mut c = setup("owner.testnet", "mallory.testnet");
        c.unpause();
    }
}
