//! Saf oyun kuralları tipleri (T-101, DESIGN §3.4/§4.5/§4.8).
//!
//! F1 kuralı: bu modül `near_sdk::env` kullanmaz. Rastgelelik sonradan
//! `ShellSource` trait'i üzerinden enjekte edilir (T-102).

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};

/// Tüfekteki fişek türü (dolu / boş).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum Shell {
    /// Dolu.
    Live,
    /// Boş.
    Blank,
}

/// Eşya kod adları (DESIGN §3.4 — etkiler Buckshot ile birebir, isim/prop özgün).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum Item {
    /// Saatçi lupu: mevcut fişeği yalnız kullanana gösterir.
    Loupe,
    /// Pipo: +1 can.
    Pipe,
    /// Matara: mevcut fişeği atar, herkese görünür.
    Flask,
    /// Zincir + asma kilit: rakip bir sırayı kaçırır.
    Shackle,
    /// Demir testeresi: bir sonraki atış 2 hasar.
    Hacksaw,
    /// Telgraf şerit makinesi: gelecekteki rastgele bir fişeği kullanana söyler.
    Ticker,
    /// Atnalı mıknatıs: mevcut fişeğin kutbunu çevirir.
    Magnet,
    /// Maymuncuk: rakibin bir eşyasını çalar ve hemen kullanır.
    Lockpick,
    /// Solmuş tentür şişesi: şansla +2 can ya da -1 can.
    Tincture,
}

/// Ateş hedefi.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum Target {
    SelfTarget,
    Opponent,
}

/// `Action::ItemUsed` sonucu. Gizli bilgi eşyalarının sonucu zincirde
/// görünür ama yalnızca kullanan tarafın istemcisi gösterir (DESIGN §4.6 v1 sınırı).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum ItemResult {
    /// Gösterilecek sonuç yok (Shackle, Hacksaw, Magnet, Lockpick).
    None,
    /// Yalnızca kullanana gösterilir: Loupe (pos = 0), Ticker (gelecek konum).
    Private { pos: u8, shell: Shell },
    /// Açıkça atılan fişek (Flask).
    Ejected { shell: Shell },
    /// Can artışı (Pipe; Tincture iyi yolu).
    Healed { amount: u8 },
    /// Can kaybı (Tincture kötü yolu).
    Damaged { amount: u8 },
}

/// Bir yükleme (DESIGN §4.5). Fişek sırası asla saklanmaz; konumlar ihtiyaç
/// anında `ShellSource`'tan çekilir (lazy draw, T-102).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub struct Load {
    /// Yüklemede gösterilen dolu sayısı; asla değişmez.
    pub announced_live: u8,
    /// Yüklemede gösterilen boş sayısı; asla değişmez.
    pub announced_blank: u8,
    /// Tüfekte kalan fişek sayısı; her zaman `fixed.len()`.
    pub remaining: u8,
    /// Gerçek kalan dolu sayısı (çekilmiş + çekilmemiş); Magnet sonrası announced'dan sapar.
    pub live_left: u8,
    /// Gerçek kalan boş sayısı.
    pub blank_left: u8,
    /// Konum 0 = sıradaki fişek; `None` = henüz çekilmemiş.
    pub fixed: Vec<Option<Shell>>,
}

/// Maçın oyun durumu (DESIGN §4.5 `Match`'in oyun kısmı; hesap ve süre
/// alanları sonradan `matches.rs`'te durur).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub struct GameState {
    /// 1..=3.
    pub round: u8,
    pub score: [u8; 2],
    pub hp: [u8; 2],
    /// Bu round başındaki can (iyileşme üst sınırı).
    pub max_hp: u8,
    /// İyileşme kesildi (R3 eşiği).
    pub heal_cut: bool,
    /// Oyuncu başına eşya; uzunluk <= `Config::max_items`.
    pub items: [Vec<Item>; 2],
    pub load: Load,
    /// Sıra hangi oyuncuda (0 | 1).
    pub turn: u8,
    /// Hangi oyuncu kelepçeli.
    pub shackled: Option<u8>,
    /// Bu sıra zincirinde kelepçe kırıldı (bu zincirde tekrar takılamaz).
    pub shackle_broke_this_turn: bool,
    /// Testere aktif: bir sonraki atış 2 hasar verir.
    pub saw_active: bool,
}

/// İstemci animasyon kuyruğu aksiyonları (DESIGN §4.8).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum Action {
    LoadStarted { live: u8, blank: u8, total: u8 },
    ItemsDealt { player: u8, items: Vec<Item> },
    ItemUsed { player: u8, item: Item, slot: u8, result: ItemResult },
    Shot { player: u8, target: Target, shell: Shell, damage: u8 },
    Ejected { shell: Shell },
    TurnSkipped { player: u8 },
    HealCut,
    RoundEnded { winner: u8, score: [u8; 2] },
    /// `reward` yoctoNEAR cinsindendir.
    MatchEnded { winner: u8, reward: u128 },
    TimeoutClaimed { by: u8 },
}

/// Saf kural katmanı hataları.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
)]
#[serde(crate = "near_sdk::serde")]
pub enum GameError {
    NotYourTurn,
    NoShellsLeft,
    PositionOutOfRange,
    SlotOutOfRange,
    SlotEmpty,
    SlotsFull,
    ItemBlocked,
    HealBlocked,
    SawAlreadyActive,
    AlreadyShackled,
    ShackleJustBroke,
    MatchFinished,
}

impl core::fmt::Display for GameError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let msg = match self {
            GameError::NotYourTurn => "not your turn",
            GameError::NoShellsLeft => "no shells left",
            GameError::PositionOutOfRange => "shell position out of range",
            GameError::SlotOutOfRange => "item slot out of range",
            GameError::SlotEmpty => "item slot is empty",
            GameError::SlotsFull => "item slots are full",
            GameError::ItemBlocked => "item cannot be used now",
            GameError::HealBlocked => "healing is disabled",
            GameError::SawAlreadyActive => "hacksaw is already active",
            GameError::AlreadyShackled => "opponent is already shackled",
            GameError::ShackleJustBroke => "shackle just broke this turn",
            GameError::MatchFinished => "match is already finished",
        };
        write!(f, "GameError: {msg}")
    }
}

impl std::error::Error for GameError {}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::borsh;

    fn sample_load() -> Load {
        Load {
            announced_live: 2,
            announced_blank: 3,
            remaining: 5,
            live_left: 2,
            blank_left: 3,
            fixed: vec![None; 5],
        }
    }

    fn sample_state() -> GameState {
        GameState {
            round: 3,
            score: [1, 0],
            hp: [4, 2],
            max_hp: 5,
            heal_cut: true,
            items: [vec![Item::Pipe, Item::Magnet], vec![]],
            load: sample_load(),
            turn: 1,
            shackled: Some(0),
            shackle_broke_this_turn: false,
            saw_active: true,
        }
    }

    /// Tüm oyun tipleri borsh + serde türevleriyle gidiş-dönüş serileşiyor.
    #[test]
    fn game_types_roundtrip() {
        let state = sample_state();
        let bytes = borsh::to_vec(&state).unwrap();
        let back: GameState = borsh::from_slice(&bytes).unwrap();
        assert_eq!(back, state);

        let action = Action::ItemUsed {
            player: 0,
            item: Item::Loupe,
            slot: 2,
            result: ItemResult::Private { pos: 0, shell: Shell::Live },
        };
        let json = near_sdk::serde_json::to_string(&action).unwrap();
        let back: Action = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(back, action);

        let err = GameError::NoShellsLeft;
        assert_eq!(err.to_string(), "GameError: no shells left");
    }
}
