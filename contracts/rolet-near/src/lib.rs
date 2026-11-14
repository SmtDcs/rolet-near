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
use matches::{Match, PlayerState};
use near_contract_standards::non_fungible_token::{NonFungibleToken, TokenId};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::{env, near, BorshStorageKey, AccountId, NearToken, PanicOnDefault};
use nft::CharacterState;
use views::LeaderboardScore;

/// Kontrat state borsh şeması sürümü (FIX-F2-4).
pub const STATE_VERSION: u32 = 1;

/// Kontrat durumu (DESIGN §4.5). Maç, oyuncu ve NFT koleksiyonlarının
/// metodları `nft.rs` (T-109) ve `matches.rs` (T-110..) modüllerindedir.
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
    /// NEP-171/177/181 karakter koleksiyonu (T-109).
    tokens: NonFungibleToken,
    /// Token başına oyun durumu: kind, durability, maç kilidi.
    character: LookupMap<TokenId, CharacterState>,
    /// Basılan token sayacı; `token_id = "<kind>:<nonce>"`.
    mint_nonce: u64,
    /// Oyuncu başına maç/istatistik/ödül durumu (DESIGN §4.5, T-110).
    players: LookupMap<AccountId, PlayerState>,
    /// Maçlar: `sha256(min(a,b) || 0 || max(a,b) || 0 || match_id)` anahtarlı (T-110, FIX-05).
    matches: LookupMap<[u8; 32], Match>,
    /// Oyuncunun aktif/bekleyen maç anahtarı (S-04).
    active_keys: LookupMap<AccountId, [u8; 32]>,
    /// `match_id` -> son maç anahtarı dizini (`get_match(id, None)` ve dışarıdan doğrulama için).
    match_id_index: LookupMap<u64, [u8; 32]>,
    /// Leaderboard için oyuncu listesi (T-115; S-02 `assert_solvent` taraması için korunur).
    player_index: UnorderedSet<AccountId>,
    /// Artımlı güncellenen top-100 sıralama tablosu (S-09 / FIX-14 / FIX-F2-6):
    /// `top_scores` yalnızca 9 baytlık `(wins, losses, slot)` özetini (<1 KB) tutar,
    /// hesap adları `top_slots` (`LookupMap<u8, AccountId>`) ve `top_slot_of` içinde
    /// ayrı anahtarlarda saklanır; böylece kök sabit kalır, `settle_storage` tüm
    /// büyümeyi sayar ve mevcut üyelerin skor güncellemesinde `AccountId` yazılmaz.
    top_scores: LazyOption<Vec<LeaderboardScore>>,
    top_slots: LookupMap<u8, AccountId>,
    top_slot_of: LookupMap<AccountId, u8>,
    /// Durum düzeni sürümü (FIX-F2-4).
    state_version: u32,
}

/// near-sdk koleksiyonları için önekler (birbirinden benzersiz).
#[derive(BorshStorageKey, near_sdk::borsh::BorshSerialize)]
enum StorageKey {
    Tokens,
    TokenMetadata,
    TokensPerOwner,
    Character,
    Players,
    Matches,
    PlayerIndex,
    ActiveKeys,
    MatchIdIndex,
    TopScores,
    TopSlots,
    TopSlotOf,
}

#[near]
impl Contract {
    /// Kontratı kurar; `#[init]` makrosu ikinci kurulumu otomatik reddeder.
    #[init]
    pub fn new(owner: AccountId, config: Config) -> Self {
        config.validate();
        Self {
            owner: owner.clone(),
            config,
            treasury: NearToken::ZERO,
            ops_balance: NearToken::ZERO,
            paused: false,
            tokens: NonFungibleToken::new(
                StorageKey::Tokens,
                owner,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::TokensPerOwner),
                None::<Vec<u8>>,
            ),
            character: LookupMap::new(StorageKey::Character),
            mint_nonce: 0,
            players: LookupMap::new(StorageKey::Players),
            matches: LookupMap::new(StorageKey::Matches),
            active_keys: LookupMap::new(StorageKey::ActiveKeys),
            match_id_index: LookupMap::new(StorageKey::MatchIdIndex),
            player_index: UnorderedSet::new(StorageKey::PlayerIndex),
            top_scores: LazyOption::new(StorageKey::TopScores, None),
            top_slots: LookupMap::new(StorageKey::TopSlots),
            top_slot_of: LookupMap::new(StorageKey::TopSlotOf),
            state_version: STATE_VERSION,
        }
    }

    /// Durum şeması sürüm göçü iskeleti (FIX-F2-4).
    /// Kırıcı borsh düzeni değişikliğinde yeni hesaba yeniden deploy yapılır veya
    /// önceki düzeni okuyup güncel `STATE_VERSION`'a taşıyan göç dalı buraya eklenir.
    #[init(ignore_state)]
    #[private]
    pub fn migrate() -> Self {
        let mut state: Contract = env::state_read().expect("state must exist");
        if state.state_version == STATE_VERSION {
            return state;
        }
        state.state_version = STATE_VERSION;
        state
    }

    /// Mevcut kontrat state sürümünü döner (FIX-F2-4).
    pub fn get_state_version(&self) -> u32 {
        self.state_version
    }

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        config.validate();
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

impl Contract {
    /// Yalnız owner'ın çağırabildiği metodların ortak bekçisi (ABI dışı, S-13).
    pub(crate) fn assert_owner(&self) {
        near_sdk::require!(env::predecessor_account_id() == self.owner, "owner only");
    }

    /// Kontratın depolama kilidi dışındaki serbest bakiyesi (S-02).
    pub(crate) fn free_balance(&self) -> NearToken {
        let stake = NearToken::from_yoctonear(
            env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear(),
        );
        env::account_balance().saturating_sub(stake)
    }

    /// İşlem sırasında artan depolama maliyetini `treasury`'den düşer,
    /// azalan depolama bedelini `treasury`'ye geri ekler (S-02, FIX-03-R).
    pub(crate) fn settle_storage(&mut self, storage_before: u64) {
        let storage_after = env::storage_usage();
        if storage_after > storage_before {
            let delta = (storage_after - storage_before) as u128;
            let cost = NearToken::from_yoctonear(delta * env::storage_byte_cost().as_yoctonear());
            self.treasury = self.treasury.saturating_sub(cost);
        } else if storage_after < storage_before {
            let freed = (storage_before - storage_after) as u128;
            let refund = NearToken::from_yoctonear(freed * env::storage_byte_cost().as_yoctonear());
            self.treasury = self.treasury.saturating_add(refund);
        }
    }

    /// S-02 değişmezi: `free_balance >= treasury + ops_balance + Σowed`.
    #[cfg(test)]
    pub(crate) fn assert_solvent(&self) {
        let owed_sum = self.player_index.iter().fold(NearToken::ZERO, |acc, id| {
            acc.saturating_add(self.player_state(&id).owed)
        });
        let liabilities = self
            .treasury
            .saturating_add(self.ops_balance)
            .saturating_add(owed_sum);
        let free = self.free_balance();
        assert!(
            free >= liabilities,
            "insolvent contract: free={free} < liabilities={liabilities} (treasury={}, ops={}, owed={owed_sum})",
            self.treasury,
            self.ops_balance,
        );
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
        assert_eq!(c.state_version, STATE_VERSION);
        assert_eq!(c.get_state_version(), STATE_VERSION);
    }

    /// FIX-F2-4: `migrate` mevcut state'i korur ve `state_version`'ı günceller.
    #[test]
    fn migrate_preserves_state_and_updates_version() {
        let mut c = setup("owner.testnet", "owner.testnet");
        c.treasury = NearToken::from_near(3);
        c.state_version = 0;
        env::state_write(&c);

        let ctx = VMContextBuilder::new()
            .current_account_id("contract.testnet".parse().unwrap())
            .predecessor_account_id("contract.testnet".parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);

        let migrated = Contract::migrate();
        assert_eq!(migrated.state_version, STATE_VERSION);
        assert_eq!(migrated.get_state_version(), STATE_VERSION);
        assert_eq!(migrated.owner, "owner.testnet".parse::<AccountId>().unwrap());
        assert_eq!(migrated.treasury, NearToken::from_near(3));
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
        c.assert_solvent();
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

    #[test]
    #[should_panic(expected = "ops_bps cannot exceed 10_000")]
    fn set_config_rejects_invalid_config() {
        let mut c = setup("owner.testnet", "owner.testnet");
        let mut bad = Config::default();
        bad.ops_bps = 10_001;
        c.set_config(bad);
    }

    #[test]
    #[should_panic(expected = "rounds must have length 3")]
    fn init_rejects_invalid_config() {
        let ctx = VMContextBuilder::new()
            .predecessor_account_id("deployer.testnet".parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);
        let mut bad = Config::default();
        bad.rounds.truncate(2);
        Contract::new("owner.testnet".parse().unwrap(), bad);
    }
}
