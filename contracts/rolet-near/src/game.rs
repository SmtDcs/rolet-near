//! Saf oyun kuralları tipleri (T-101, DESIGN §3.4/§4.5/§4.8).
//!
//! F1 kuralı: bu modül `near_sdk::env` kullanmaz. Rastgelelik sonradan
//! `ShellSource` trait'i üzerinden enjekte edilir (T-102).

use crate::config::Config;
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

/// Fişek ve olasılık kaynağı. Kontratta zincir tabanlı lazy-draw kaynağı
/// (T-107 `rng.rs`), testlerde `ScriptedSource` kullanılır (DESIGN §4.6).
pub trait ShellSource {
    /// Çekilmemiş konumlardan bir fişek türü belirler.
    /// P(dolu) = live_unfixed / (live_unfixed + blank_unfixed).
    fn draw(&mut self, live_unfixed: u8, blank_unfixed: u8) -> Shell;
    /// [0, n) aralığında üniform değer (yükleme boyutu, eşya dağıtımı, şans).
    fn roll(&mut self, n: u32) -> u32;
}

/// Test kaynağı: fişekleri çağrılma sırasıyla döner, `roll` değerleri de
/// sırayla (tükenince 0). Deterministik test kurulumları içindir.
#[cfg(test)]
pub struct ScriptedSource {
    shells: Vec<Shell>,
    rolls: Vec<u32>,
    shell_idx: usize,
    roll_idx: usize,
}

#[cfg(test)]
impl ScriptedSource {
    pub fn new(shells: Vec<Shell>) -> Self {
        Self { shells, rolls: Vec::new(), shell_idx: 0, roll_idx: 0 }
    }

    pub fn with_rolls(shells: Vec<Shell>, rolls: Vec<u32>) -> Self {
        Self { shells, rolls, shell_idx: 0, roll_idx: 0 }
    }
}

#[cfg(test)]
impl ShellSource for ScriptedSource {
    fn draw(&mut self, _live_unfixed: u8, _blank_unfixed: u8) -> Shell {
        let shell = self
            .shells
            .get(self.shell_idx)
            .copied()
            .expect("ScriptedSource: scripted shells exhausted");
        self.shell_idx += 1;
        shell
    }

    fn roll(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        let v = self.rolls.get(self.roll_idx).copied().unwrap_or(0);
        self.roll_idx += 1;
        v % n
    }
}

impl Load {
    /// Tüm konumları çekilmemiş bir yükleme kurar (`new_load` ve testler için).
    pub fn new(live: u8, blank: u8) -> Self {
        let remaining = live + blank;
        Self {
            announced_live: live,
            announced_blank: blank,
            remaining,
            live_left: live,
            blank_left: blank,
            fixed: vec![None; remaining as usize],
        }
    }

    pub fn is_empty(&self) -> bool {
        self.remaining == 0
    }

    /// Çekilmiş dolu konum sayısı.
    pub fn fixed_live(&self) -> u8 {
        self.fixed.iter().filter(|s| matches!(s, Some(Shell::Live))).count() as u8
    }

    /// Çekilmiş boş konum sayısı.
    pub fn fixed_blank(&self) -> u8 {
        self.fixed.iter().filter(|s| matches!(s, Some(Shell::Blank))).count() as u8
    }

    /// Henüz çekilmemiş konumlardaki dolu sayısı.
    pub fn live_unfixed(&self) -> u8 {
        self.live_left - self.fixed_live()
    }

    /// Henüz çekilmemiş konumlardaki boş sayısı.
    pub fn blank_unfixed(&self) -> u8 {
        self.blank_left - self.fixed_blank()
    }

    /// Sıradaki (0. konumdaki) fişeği döndürür; çekilmemişse kaynaktan çeker.
    pub fn current(&mut self, src: &mut dyn ShellSource) -> Result<Shell, GameError> {
        self.fix(0, src)
    }

    /// `pos` konumundaki (0 = sıradaki) fişeği döndürür; çekilmemişse
    /// kaynaktan çekip `fixed`'e yazar (unfixed sayıları buna bağlı güncellenir).
    pub fn peek_at(&mut self, pos: usize, src: &mut dyn ShellSource) -> Result<Shell, GameError> {
        self.fix(pos, src)
    }

    /// Lazy draw çekirdeği (DESIGN §4.6): konum daha önce çekildiyse
    /// kaynağı tüketmeden aynı sonucu döner.
    pub fn fix(&mut self, pos: usize, src: &mut dyn ShellSource) -> Result<Shell, GameError> {
        if self.remaining == 0 {
            return Err(GameError::NoShellsLeft);
        }
        if pos >= self.remaining as usize {
            return Err(GameError::PositionOutOfRange);
        }
        if let Some(shell) = self.fixed[pos] {
            return Ok(shell);
        }
        let live_unfixed = self.live_unfixed();
        let blank_unfixed = self.blank_unfixed();
        let shell = src.draw(live_unfixed, blank_unfixed);
        self.fixed[pos] = Some(shell);
        Ok(shell)
    }
}

/// Yeni yükleme üretir (DESIGN §4.6): `total = 2 + roll(7) % 7` (2–8),
/// R1'de `total <= 4` [KARAR]; `live = clamp(total/2 + delta, 1, total-1)`,
/// `delta = roll(3) - 1`. Yalnızca sayılar yazılır; hiçbir konum çekilmez.
pub fn new_load(round: u8, src: &mut dyn ShellSource) -> Load {
    let total = 2 + (src.roll(7) % 7) as u8;
    let total = if round == 1 { total.min(4) } else { total };
    let delta = src.roll(3) as i16 - 1;
    let live = ((total as i16) / 2 + delta).clamp(1, total as i16 - 1) as u8;
    Load::new(live, total - live)
}

/// Eşya torbası (DESIGN §4.6 [KARAR]): R2'de orijinal beşli + Ticker,
/// R3'te dokuzun tamamı. R1'de eşya dağıtılmaz.
pub fn item_bag(round: u8) -> &'static [Item] {
    const R2_BAG: &[Item] =
        &[Item::Loupe, Item::Pipe, Item::Flask, Item::Shackle, Item::Hacksaw, Item::Ticker];
    const R3_BAG: &[Item] = &[
        Item::Loupe,
        Item::Pipe,
        Item::Flask,
        Item::Shackle,
        Item::Hacksaw,
        Item::Ticker,
        Item::Magnet,
        Item::Lockpick,
        Item::Tincture,
    ];
    match round {
        2 => R2_BAG,
        3 => R3_BAG,
        _ => &[],
    }
}

/// Her yüklemede iki tarafa da round tablosundaki sayıda eşya dağıtır
/// (DESIGN §2.2.4/§4.6). Slot doluysa fazlası düşer; R1'de eşya yok.
pub fn deal_items(state: &mut GameState, cfg: &Config, src: &mut dyn ShellSource) -> Vec<Action> {
    let round = state.round;
    let per_player = cfg
        .rounds
        .get(round.saturating_sub(1) as usize)
        .map(|r| r.items_per_load as usize)
        .unwrap_or(0);
    let bag = item_bag(round);
    let mut actions = Vec::new();
    if per_player == 0 || bag.is_empty() {
        return actions;
    }
    for player in 0..2usize {
        let free = (cfg.max_items as usize).saturating_sub(state.items[player].len());
        let count = per_player.min(free);
        let mut dealt = Vec::with_capacity(count);
        for _ in 0..count {
            let item = bag[src.roll(bag.len() as u32) as usize];
            state.items[player].push(item);
            dealt.push(item);
        }
        if !dealt.is_empty() {
            actions.push(Action::ItemsDealt { player: player as u8, items: dealt });
        }
    }
    actions
}

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

    /// Deterministik test RNG'si (xorshift64) — T-103 sınır testleri için.
    struct XorshiftRng(u64);

    impl XorshiftRng {
        fn new(seed: u64) -> Self {
            XorshiftRng(seed.wrapping_add(0x9E37_79B9_7F4A_7C15) | 1)
        }

        fn next_u32(&mut self) -> u32 {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            (x >> 32) as u32
        }
    }

    impl ShellSource for XorshiftRng {
        fn draw(&mut self, live_unfixed: u8, blank_unfixed: u8) -> Shell {
            let total = live_unfixed + blank_unfixed;
            if total == 0 || self.next_u32() % (total as u32) < live_unfixed as u32 {
                Shell::Live
            } else {
                Shell::Blank
            }
        }

        fn roll(&mut self, n: u32) -> u32 {
            if n == 0 {
                0
            } else {
                self.next_u32() % n
            }
        }
    }

    fn state_for_round(round: u8, load: Load, cfg: &Config) -> GameState {
        let rc = &cfg.rounds[(round - 1) as usize];
        GameState {
            round,
            score: [0, 0],
            hp: [rc.start_hp, rc.start_hp],
            max_hp: rc.start_hp,
            heal_cut: false,
            items: [vec![], vec![]],
            load,
            turn: 0,
            shackled: None,
            shackle_broke_this_turn: false,
            saw_active: false,
        }
    }

    /// T-103: DESIGN §4.6 formülü birebir uygulanıyor.
    #[test]
    fn new_load_follows_design_formula() {
        // total = 2 + roll(7) % 7 = 7; delta = 0 - 1 = -1; live = 3 - 1 = 2.
        let mut src = ScriptedSource::with_rolls(vec![], vec![5, 0]);
        let load = new_load(3, &mut src);
        assert_eq!((load.announced_live, load.announced_blank), (2, 5));
        // R1: total 8 -> 4'e kesilir; delta = 2 - 1 = +1; live = 2 + 1 = 3.
        let mut src = ScriptedSource::with_rolls(vec![], vec![6, 2]);
        let load = new_load(1, &mut src);
        assert_eq!((load.announced_live, load.announced_blank), (3, 1));
        // total = 2; delta = 0 - 1 = -1; clamp -> live = 1.
        let mut src = ScriptedSource::with_rolls(vec![], vec![0, 0]);
        let load = new_load(2, &mut src);
        assert_eq!((load.announced_live, load.announced_blank), (1, 1));
    }

    /// T-103: 10 000 deterministik tohumla yükleme ve dağıtım sınırları asla aşılmıyor.
    #[test]
    fn new_load_and_deal_bounds_hold_for_10000_seeds() {
        let cfg = Config::default();
        for seed in 1..=10_000u64 {
            let mut src = XorshiftRng::new(seed);
            for round in 1u8..=3 {
                let load = new_load(round, &mut src);
                let total = load.remaining;
                assert!(total >= 2 && total <= 8, "total {total} (seed {seed}, round {round})");
                if round == 1 {
                    assert!(total <= 4, "R1 total {total} (seed {seed})");
                }
                assert!(load.live_left >= 1, "live {} (seed {seed}, round {round})", load.live_left);
                assert!(load.blank_left >= 1, "blank {}", load.blank_left);
                assert_eq!(load.live_left + load.blank_left, total);
                assert_eq!(load.announced_live, load.live_left);
                assert_eq!(load.announced_blank, load.blank_left);
                assert_eq!(load.fixed.len(), total as usize);
                assert!(load.fixed.iter().all(|s| s.is_none()));

                let mut state = state_for_round(round, load, &cfg);
                let actions = deal_items(&mut state, &cfg, &mut src);
                let expected = cfg.rounds[(round - 1) as usize].items_per_load as usize;
                let bag = item_bag(round);
                for player in 0..2usize {
                    assert_eq!(state.items[player].len(), expected);
                    assert!(state.items[player].iter().all(|i| bag.contains(i)));
                    assert!(state.items[player].len() <= cfg.max_items as usize);
                }
                if expected == 0 {
                    assert!(actions.is_empty(), "R1'de eşya aksiyonu olmamalı");
                } else {
                    assert_eq!(actions.len(), 2);
                }
            }
        }
    }

    /// T-103: slot dolu iken fazlası düşer; yalnız yer açılan oyuncuya aksiyon üretilir.
    #[test]
    fn deal_items_drops_extras_when_slots_full() {
        let cfg = Config::default();
        let mut src = XorshiftRng::new(42);
        let mut state = state_for_round(2, Load::new(2, 2), &cfg);
        state.items[0] = vec![Item::Pipe; 8];
        state.items[1] = vec![Item::Pipe; 7];
        let actions = deal_items(&mut state, &cfg, &mut src);
        assert_eq!(state.items[0].len(), 8);
        assert_eq!(state.items[1].len(), 8);
        assert_eq!(actions.len(), 1);
        match &actions[0] {
            Action::ItemsDealt { player, items } => {
                assert_eq!(*player, 1);
                assert_eq!(items.len(), 1);
                assert!(item_bag(2).contains(&items[0]));
            }
            other => panic!("beklenmedik aksiyon: {other:?}"),
        }
    }

    /// T-102 (a): tüm konumlar çekildiğinde dolu sayısı başlangıçtaki dolu sayısına eşit.
    #[test]
    fn all_positions_drawn_match_announced_live() {
        // 2 dolu + 3 boş; kaynak sırayla [B, L, B, L, B] döner.
        let mut src = ScriptedSource::new(vec![
            Shell::Blank,
            Shell::Live,
            Shell::Blank,
            Shell::Live,
            Shell::Blank,
        ]);
        let mut load = Load::new(2, 3);
        assert_eq!(load.remaining, 5);
        for pos in 0..5 {
            load.peek_at(pos, &mut src).unwrap();
        }
        assert_eq!(load.fixed_live(), 2);
        assert_eq!(load.fixed_blank(), 3);
        assert_eq!(load.live_unfixed(), 0);
        assert_eq!(load.blank_unfixed(), 0);
        assert_eq!(load.live_left, 2);
        assert_eq!(load.blank_left, 3);
    }

    /// T-102 (b): önce ileri konum (`peek_at(3)`) sonra 0..2 çekilince sayaçlar tutarlı.
    #[test]
    fn forward_peek_keeps_counts_consistent() {
        let mut src = ScriptedSource::new(vec![Shell::Live, Shell::Blank, Shell::Live, Shell::Blank]);
        let mut load = Load::new(2, 2);
        assert_eq!(load.peek_at(3, &mut src).unwrap(), Shell::Live);
        // Aynı konum tekrar sorulursa kaynağı tüketmeden aynı fişek döner.
        assert_eq!(load.peek_at(3, &mut src).unwrap(), Shell::Live);
        assert_eq!(load.fixed_live(), 1);
        assert_eq!(load.live_unfixed(), 1);
        assert_eq!(load.blank_unfixed(), 2);
        for pos in 0..3 {
            load.peek_at(pos, &mut src).unwrap();
        }
        assert_eq!(load.fixed_live(), 2);
        assert_eq!(load.fixed_blank(), 2);
        assert_eq!(load.live_unfixed(), 0);
        assert_eq!(load.blank_unfixed(), 0);
        assert_eq!(load.live_left + load.blank_left, load.remaining);
    }

    /// T-102 (c): `remaining == 0` iken çekme hata verir.
    #[test]
    fn draw_on_empty_load_errors() {
        let mut src = ScriptedSource::new(vec![]);
        let mut load = Load::new(0, 0);
        assert!(load.is_empty());
        assert_eq!(load.current(&mut src), Err(GameError::NoShellsLeft));
        assert_eq!(load.peek_at(0, &mut src), Err(GameError::NoShellsLeft));
        // Dolu yükte kapsam dışı konum ayrı hatadır.
        let mut src2 = ScriptedSource::new(vec![Shell::Live]);
        let mut load2 = Load::new(1, 0);
        assert_eq!(load2.peek_at(1, &mut src2), Err(GameError::PositionOutOfRange));
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
