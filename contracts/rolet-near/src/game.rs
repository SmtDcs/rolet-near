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
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
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
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
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

/// Ortak eşya destesinde bulunan 9 eşya türü (EK2: `deck_counts` indeks sırası).
pub const ALL_ITEMS: [Item; 9] = [
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

/// Maç başında `copies_per_item` × 9 kartlık ortak deste oluşturur.
pub fn new_deck(copies_per_item: u8) -> [u8; 9] {
    [copies_per_item; 9]
}

/// Ateş hedefi.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub enum Target {
    SelfTarget,
    Opponent,
}

/// `Action::ItemUsed` sonucu. Gizli bilgi eşyalarının sonucu zincirde
/// görünür ama yalnızca kullanan tarafın istemcisi gösterir (DESIGN §4.6 v1 sınırı).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde", tag = "kind")]
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
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
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
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct GameState {
    /// 1..=3.
    pub round: u8,
    pub score: [u8; 2],
    pub hp: [u8; 2],
    /// Bu round başındaki can (iyileşme üst sınırı).
    pub max_hp: u8,
    /// İyileşme kesildi (R3 eşiği; oyuncu başına).
    pub heal_cut: [bool; 2],
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
    /// Ortak eşya destesinde her türden kalan kart sayısı (`ALL_ITEMS` sırasıyla).
    pub deck_counts: [u8; 9],
}

impl GameState {
    /// Ortak eşya destesinde kalan toplam kart sayısı.
    pub fn deck_remaining(&self) -> u16 {
        self.deck_counts.iter().map(|&c| c as u16).sum()
    }
}

/// Maçın `Revealing` aşamasındaki (oyunun kurulmadan önceki) yer tutucusu.
/// Gerçek değerler ikinci `reveal`'da yazılır (matches.rs T-111).
impl Default for GameState {
    fn default() -> Self {
        Self {
            round: 1,
            score: [0, 0],
            hp: [0, 0],
            max_hp: 0,
            heal_cut: [false, false],
            items: [Vec::new(), Vec::new()],
            load: Load::new(0, 0),
            turn: 0,
            shackled: None,
            shackle_broke_this_turn: false,
            saw_active: false,
            deck_counts: [0; 9],
        }
    }
}

/// İstemci animasyon kuyruğu aksiyonları (DESIGN §4.8). JSON'da iç etiket
/// (`kind`) ile serileşir; NEP-297 `data` payload'ı da bu formattır (T-114).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde", tag = "kind")]
pub enum Action {
    LoadStarted { live: u8, blank: u8, total: u8 },
    ItemsDealt { player: u8, items: Vec<Item> },
    ItemUsed { player: u8, item: Item, slot: u8, result: ItemResult },
    Shot { player: u8, target: Target, shell: Shell, damage: u8 },
    Ejected { shell: Shell },
    TurnSkipped { player: u8 },
    HealCut { player: u8 },
    RoundEnded { winner: u8, score: [u8; 2] },
    /// `reward` yoctoNEAR cinsindendir; `U128` JSON'da string serileşir
    /// (serde_json u128 sayı aralığını aşamaz, NEAR miktarları string taşır).
    MatchEnded { winner: u8, reward: near_sdk::json_types::U128 },
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

    /// Konum 0'daki (atılan) fişeği tüketir (her atıştan sonra pompa çekilir;
    /// DESIGN §2.3.4). `live_left`/`blank_left` gerçek kalanlarla senkron kalır.
    pub fn advance(&mut self, shell: Shell) {
        self.fixed.remove(0);
        self.remaining -= 1;
        match shell {
            Shell::Live => self.live_left -= 1,
            Shell::Blank => self.blank_left -= 1,
        }
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

/// Yeni yükleme üretir (Rolet 8 gözlü tabanca + rastgele dolu sayısı):
/// Toplam fişek `cfg.load_size` (vars. 8), dolu sayısı `src.roll` ile
/// `cfg.min_live..=cfg.max_live` (vars. 2..=6) aralığından seçilir, kalanlar
/// kuru sıkıdır. Yalnızca duyurulan sayılar yazılır; sıra gizli kalır ve atış
/// anında lazy draw ile çekilir.
pub fn new_load(cfg: &Config, src: &mut dyn ShellSource) -> Load {
    let min = cfg.min_live.min(cfg.max_live);
    let max = cfg.max_live.max(min).min(cfg.load_size.saturating_sub(1));
    let span = (max - min) as u32 + 1;
    let live = min + src.roll(span) as u8;
    let blank = cfg.load_size.saturating_sub(live);
    Load::new(live, blank)
}

/// Ortak eşya destesinden (9 tür × `cfg.copies_per_item`) iadesiz olarak her
/// tarafa `items_per_load` kart dağıtır (R1 dahil her round 4 eşya). Tür seçimi
/// dağıtım anında `ChainSource::roll` ile kalan kart sayılarına göre ağırlıklı
/// yapılır; deste bittiğinde `cfg.copies_per_item` ile yeniden doldurulur (EK2).
pub fn deal_items(state: &mut GameState, cfg: &Config, src: &mut dyn ShellSource) -> Vec<Action> {
    let round = state.round;
    let per_player = cfg
        .rounds
        .get(round.saturating_sub(1) as usize)
        .map(|r| r.items_per_load as usize)
        .unwrap_or(0);
    let mut actions = Vec::new();
    if per_player == 0 || cfg.copies_per_item == 0 {
        return actions;
    }
    for player in 0..2usize {
        let free = (cfg.max_items as usize).saturating_sub(state.items[player].len());
        let count = per_player.min(free);
        let mut dealt = Vec::with_capacity(count);
        for _ in 0..count {
            let mut total: u32 = state.deck_counts.iter().map(|&c| c as u32).sum();
            if total == 0 {
                state.deck_counts = new_deck(cfg.copies_per_item);
                total = (ALL_ITEMS.len() as u32) * (cfg.copies_per_item as u32);
            }
            let mut pick = src.roll(total);
            let mut drawn = ALL_ITEMS[0];
            for (idx, count_slot) in state.deck_counts.iter_mut().enumerate() {
                let c = *count_slot as u32;
                if pick < c {
                    *count_slot -= 1;
                    drawn = ALL_ITEMS[idx];
                    break;
                }
                pick -= c;
            }
            state.items[player].push(drawn);
            dealt.push(drawn);
        }
        if !dealt.is_empty() {
            actions.push(Action::ItemsDealt { player: player as u8, items: dealt });
        }
    }
    actions
}

/// `state.load`'a yeni yükleme kurar ve `LoadStarted` + (R2/R3'te) eşya
/// dağıtım aksiyonlarını üretir — `fire` ve `Flask`/`Tincture` ortak yolu.
fn reload(state: &mut GameState, cfg: &Config, src: &mut dyn ShellSource, actions: &mut Vec<Action>) {
    // Yeni yükte kelepçe ve zincir kilidi temizlenir (FIX-11 / G-05).
    state.shackled = None;
    state.shackle_broke_this_turn = false;
    state.load = new_load(cfg, src);
    actions.push(Action::LoadStarted {
        live: state.load.announced_live,
        blank: state.load.announced_blank,
        total: state.load.remaining,
    });
    actions.extend(deal_items(state, cfg, src));
}

/// `victim` oyuncusuna `dmg` hasar uygular. Can 0 olursa round biter ve
/// kazanan döner; `actions` içine `RoundEnded` (+ `HealCut` eşik ihlali
/// değilse) ve yeni round kurulumu ya da `MatchEnded` eklenmiştir.
/// Değişmez: round sonunda tüm round durumu sıfırlanır (§3.2 kural 6),
/// yeni round'u kaybeden başlatır (§3.1 [KARAR]).
fn apply_damage(
    state: &mut GameState,
    cfg: &Config,
    victim: usize,
    dmg: u8,
    actions: &mut Vec<Action>,
    src: &mut dyn ShellSource,
) -> Option<u8> {
    state.hp[victim] = state.hp[victim].saturating_sub(dmg);
    if dmg > 0 && state.hp[victim] > 0 && !state.heal_cut[victim] {
        if let Some(threshold) = cfg
            .rounds
            .get(state.round.saturating_sub(1) as usize)
            .and_then(|r| r.heal_cut_at)
        {
            if state.hp[victim] <= threshold {
                state.heal_cut[victim] = true;
                actions.push(Action::HealCut { player: victim as u8 });
            }
        }
    }
    if state.hp[victim] > 0 {
        return None;
    }
    let winner = (1 - victim) as u8;
    state.score[winner as usize] += 1;
    actions.push(Action::RoundEnded { winner, score: state.score });
    if state.score[winner as usize] >= 2 {
        actions.push(Action::MatchEnded { winner, reward: cfg.reward.as_yoctonear().into() });
        return Some(winner);
    }
    // Skorlar 2'nin altında olduğundan en fazla 2 round oynanmıştır;
    // `cfg.rounds` 3 girdilidir, indeks güvenli.
    state.round += 1;
    let rc = &cfg.rounds[state.round as usize - 1];
    state.hp = [rc.start_hp, rc.start_hp];
    state.max_hp = rc.start_hp;
    state.heal_cut = [false, false];
    state.items = [Vec::new(), Vec::new()];
    state.shackled = None;
    state.shackle_broke_this_turn = false;
    state.saw_active = false;
    state.turn = victim as u8;
    reload(state, cfg, src, actions);
    Some(winner)
}

/// Sıra geçişi (`fire` ve son fişekte `Flask` ortak yolu — G-04): sırayı rakibe
/// geçirir; rakip kelepçeliyse sırası atlanır, kelepçe kırılır ve sıra kullanana döner.
fn end_turn(state: &mut GameState, actor: usize, actions: &mut Vec<Action>) {
    let next = 1 - actor;
    state.turn = next as u8;
    state.shackle_broke_this_turn = false;
    if state.shackled == Some(next as u8) {
        actions.push(Action::TurnSkipped { player: next as u8 });
        state.shackled = None;
        state.shackle_broke_this_turn = true;
        state.turn = actor as u8;
    }
}

/// Ateş etme (T-104, DESIGN §3.2 kural 1–7). `actor` sıra sahibi olmalıdır;
/// tüm durum geçişleri `Action` olarak döner (istemci animasyon kuyruğu §4.8).
///
/// - Hasar: dolu → 1 (testere aktifken 2), boş → 0 (§2.3).
/// - Testere atışla biter (dolu veya boş fark etmez; kural 3/5).
/// - Boşla kendine ateşte sıra kalır; aksi halde rakibe geçer (kural 5).
/// - Sıra kelepçeli oyuncuya geçerken atlanır, kelepçe kırılır ve sıra
///   tekrar kullanana döner; kırılma bu "sıra zinciri"nde hatırlanır (kural 4).
/// - Can 0 → round sonu; skor 2 → maç sonu; fişek bitti → yeni yükleme
///   + dağıtım (kural 6/7, §3.1).
pub fn fire(
    state: &mut GameState,
    cfg: &Config,
    actor: u8,
    target: Target,
    src: &mut dyn ShellSource,
) -> Result<Vec<Action>, GameError> {
    if state.score[0] >= 2 || state.score[1] >= 2 {
        return Err(GameError::MatchFinished);
    }
    if actor > 1 || actor != state.turn {
        return Err(GameError::NotYourTurn);
    }
    let shell = state.load.current(src)?;
    let actor = actor as usize;
    let damage = match shell {
        Shell::Blank => 0,
        Shell::Live if state.saw_active => 2,
        Shell::Live => 1,
    };
    let mut actions = vec![Action::Shot { player: actor as u8, target, shell, damage }];
    state.load.advance(shell);
    actions.push(Action::Ejected { shell });
    state.saw_active = false;
    let victim = match target {
        Target::Opponent => 1 - actor,
        Target::SelfTarget => actor,
    };
    if apply_damage(state, cfg, victim, damage, &mut actions, src).is_some() {
        return Ok(actions);
    }
    if !(shell == Shell::Blank && target == Target::SelfTarget) {
        end_turn(state, actor, &mut actions);
    }
    if state.load.is_empty() {
        reload(state, cfg, src, &mut actions);
    }
    Ok(actions)
}

/// Eşya kullanımı (T-105/T-106, DESIGN §3.2 kural 8–9). `actor` sıra
/// sahibi olmalı; reddedilen kullanımda **hiçbir şey tüketilmez**.
///
/// Orijinal beşli (§2.4/§3.4): Loupe, Pipe, Flask, Shackle, Hacksaw.
/// Hiçbir eşya sırayı geçirmez; Flask "atış sayılmaz" (§2.4).
pub fn use_item(
    state: &mut GameState,
    cfg: &Config,
    actor: u8,
    slot: u8,
    steal_slot: Option<u8>,
    src: &mut dyn ShellSource,
) -> Result<Vec<Action>, GameError> {
    if state.score[0] >= 2 || state.score[1] >= 2 {
        return Err(GameError::MatchFinished);
    }
    if actor > 1 || actor != state.turn {
        return Err(GameError::NotYourTurn);
    }
    if slot >= cfg.max_items {
        return Err(GameError::SlotOutOfRange);
    }
    let actor = actor as usize;
    if slot as usize >= state.items[actor].len() {
        return Err(GameError::SlotEmpty);
    }
    let item = state.items[actor].remove(slot as usize);
    match apply_item(state, cfg, actor, item, slot, steal_slot, src) {
        Ok(actions) => Ok(actions),
        Err(err) => {
            state.items[actor].insert(slot as usize, item);
            Err(err)
        }
    }
}

/// Eşyanın şu an uygulanabilir olup olmadığını state'i **değiştirmeden** sınar
/// (Lockpick'in "hiçbir şey tüketilmez" atomikliği, §3.2 kural 9).
fn check_item(
    state: &GameState,
    cfg: &Config,
    actor: usize,
    item: Item,
    steal_slot: Option<u8>,
) -> Result<(), GameError> {
    match item {
        // Tüfeğe bakan eşyalar boş tüfekte anlamsız.
        Item::Loupe | Item::Flask | Item::Magnet => {
            if state.load.is_empty() {
                return Err(GameError::NoShellsLeft);
            }
        }
        // Ticker: ≤1 fişekte tüketilir ve `ItemResult::None` üretir (DECISIONS #8).
        Item::Ticker => {}
        Item::Pipe => {
            if state.heal_cut[actor] {
                return Err(GameError::HealBlocked);
            }
            // Maksimum candayken kullanım anlamsızdır: red, eşya korunur.
            if state.hp[actor] >= state.max_hp {
                return Err(GameError::ItemBlocked);
            }
        }
        // Tincture: iyileşme kesildiyse tamamen kapalı (TASKS varsayılanı;
        // T-001 sonucuna göre yalnızca -1 yolu açılabilir).
        Item::Tincture => {
            if state.heal_cut[actor] {
                return Err(GameError::HealBlocked);
            }
        }
        Item::Shackle => {
            if state.shackled == Some((1 - actor) as u8) {
                return Err(GameError::AlreadyShackled);
            }
            if state.shackle_broke_this_turn {
                return Err(GameError::ShackleJustBroke);
            }
        }
        Item::Hacksaw => {
            if state.saw_active {
                return Err(GameError::SawAlreadyActive);
            }
        }
        Item::Lockpick => {
            let steal = steal_slot.ok_or(GameError::SlotOutOfRange)? as usize;
            if steal >= cfg.max_items as usize {
                return Err(GameError::SlotOutOfRange);
            }
            let opponent = 1 - actor;
            if steal >= state.items[opponent].len() {
                return Err(GameError::SlotEmpty);
            }
            let stolen = state.items[opponent][steal];
            if stolen == Item::Lockpick {
                // Adrenalin çalınamaz (§2.4); Rolet karşılığı da aynı.
                return Err(GameError::ItemBlocked);
            }
            // Çalınan eşya hemen uygulanacak: uygulanamazsa işlem reddedilir
            // ve hiçbir şey tüketilmez (§3.2 kural 9). `stolen` Lockpick
            // olamayacağı için özyineleme tek seviyede kalır.
            check_item(state, cfg, actor, stolen, None)?;
        }
    }
    Ok(())
}

/// Eşyanın etkisini uygular ve tüm aksiyonları döner. Ön koşullar
/// `check_item` ile doğrulandıktan sonra mutasyonlar yapılır; hata
/// durumunda state bozulmaz.
fn apply_item(
    state: &mut GameState,
    cfg: &Config,
    actor: usize,
    item: Item,
    slot: u8,
    steal_slot: Option<u8>,
    src: &mut dyn ShellSource,
) -> Result<Vec<Action>, GameError> {
    check_item(state, cfg, actor, item, steal_slot)?;
    let mut actions = Vec::new();
    let item_used = |result: ItemResult| Action::ItemUsed {
        player: actor as u8,
        item,
        slot,
        result,
    };
    match item {
        Item::Loupe => {
            let shell = state.load.current(src)?;
            actions.push(item_used(ItemResult::Private { pos: 0, shell }));
        }
        Item::Pipe => {
            state.hp[actor] += 1;
            actions.push(item_used(ItemResult::Healed { amount: 1 }));
        }
        Item::Flask => {
            let shell = state.load.current(src)?;
            state.load.advance(shell);
            actions.push(item_used(ItemResult::Ejected { shell }));
            actions.push(Action::Ejected { shell });
            // Son fişekse tur biter: testere sıfırlanır, sıra geçer (G-04), sonra yeni yükleme.
            if state.load.is_empty() {
                state.saw_active = false;
                end_turn(state, actor, &mut actions);
                reload(state, cfg, src, &mut actions);
            }
        }
        Item::Shackle => {
            state.shackled = Some((1 - actor) as u8);
            actions.push(item_used(ItemResult::None));
        }
        Item::Hacksaw => {
            state.saw_active = true;
            actions.push(item_used(ItemResult::None));
        }
        Item::Ticker => {
            if state.load.remaining < 2 {
                actions.push(item_used(ItemResult::None));
            } else {
                // Gelecek konumlar [1, remaining-1]; mevcut (0) hariç.
                let max = state.load.remaining as u32 - 1;
                let pos = 1 + src.roll(max) as usize;
                let shell = state.load.peek_at(pos, src)?;
                actions.push(item_used(ItemResult::Private { pos: pos as u8, shell }));
            }
        }
        Item::Magnet => {
            let shell = state.load.current(src)?;
            let flipped = match shell {
                Shell::Live => Shell::Blank,
                Shell::Blank => Shell::Live,
            };
            state.load.fixed[0] = Some(flipped);
            match shell {
                Shell::Live => {
                    state.load.live_left -= 1;
                    state.load.blank_left += 1;
                }
                Shell::Blank => {
                    state.load.blank_left -= 1;
                    state.load.live_left += 1;
                }
            }
            actions.push(item_used(ItemResult::None));
        }
        Item::Lockpick => {
            let steal = steal_slot.expect("check_item doğruladı") as usize;
            let opponent = 1 - actor;
            let stolen = state.items[opponent].remove(steal);
            actions.push(item_used(ItemResult::None));
            // Çalınan eşya anında kullanılır; `slot` alanı onun rakip
            // ızgarasındaki (boşaltılan) konumunu gösterir.
            let mut stolen_actions = apply_item(state, cfg, actor, stolen, steal as u8, None, src)?;
            actions.append(&mut stolen_actions);
        }
        Item::Tincture => {
            if src.roll(100) < cfg.tincture_good_pct {
                let healed = state.max_hp.saturating_sub(state.hp[actor]).min(2);
                state.hp[actor] += healed;
                actions.push(item_used(ItemResult::Healed { amount: healed }));
            } else {
                actions.push(item_used(ItemResult::Damaged { amount: 1 }));
                apply_damage(state, cfg, actor, 1, &mut actions, src);
            }
        }
    }
    Ok(actions)
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
            max_hp: 4,
            heal_cut: [false, true],
            items: [vec![Item::Pipe, Item::Magnet], vec![]],
            load: sample_load(),
            turn: 1,
            shackled: Some(0),
            shackle_broke_this_turn: false,
            saw_active: true,
            deck_counts: [4; 9],
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
            heal_cut: [false, false],
            items: [vec![], vec![]],
            load,
            turn: 0,
            shackled: None,
            shackle_broke_this_turn: false,
            saw_active: false,
            deck_counts: new_deck(cfg.copies_per_item),
        }
    }

    /// T-103: 8 gözlü tabancada `min_live..=max_live` aralığından rastgele dolu/boş seçimi.
    #[test]
    fn new_load_follows_design_formula() {
        let cfg = Config::default();
        let mut src = ScriptedSource::with_rolls(vec![], vec![0, 3, 4]);
        let l0 = new_load(&cfg, &mut src);
        assert_eq!((l0.announced_live, l0.announced_blank, l0.remaining), (2, 6, 8));
        let l1 = new_load(&cfg, &mut src);
        assert_eq!((l1.announced_live, l1.announced_blank, l1.remaining), (5, 3, 8));
        let l2 = new_load(&cfg, &mut src);
        assert_eq!((l2.announced_live, l2.announced_blank, l2.remaining), (6, 2, 8));

        // Sabit dolu sayısı Config üzerinden ayarlanabilir (min_live == max_live).
        let mut fixed_cfg = Config::default();
        fixed_cfg.min_live = 5;
        fixed_cfg.max_live = 5;
        let lf = new_load(&fixed_cfg, &mut src);
        assert_eq!((lf.announced_live, lf.announced_blank, lf.remaining), (5, 3, 8));
    }

    /// T-103: 10 000 tohumda 8 gözlü yükleme sınırları (`2..=6` dolu, `2..=6` boş),
    /// duyurulan sayıların çekilen fişeklerle eşleşmesi ve R1/R2/R3 eşya dağıtımı.
    #[test]
    fn new_load_and_deal_bounds_hold_for_10000_seeds() {
        let cfg = Config::default();
        let mut seen_live = [false; 9];
        for seed in 1..=10_000u64 {
            let mut src = XorshiftRng::new(seed);
            for round in [1u8, 2u8, 3u8] {
                let mut load = new_load(&cfg, &mut src);
                let total = load.remaining;
                assert_eq!(total, cfg.load_size, "total {total} (seed {seed}, round {round})");
                assert!(
                    load.announced_live >= cfg.min_live && load.announced_live <= cfg.max_live,
                    "live {} aralık dışı (seed {seed}, round {round})",
                    load.announced_live
                );
                assert_eq!(load.announced_blank, cfg.load_size - load.announced_live);
                assert_eq!(load.live_left, load.announced_live);
                assert_eq!(load.blank_left, load.announced_blank);
                assert_eq!(load.fixed.len(), total as usize);
                assert!(load.fixed.iter().all(|s| s.is_none()));
                seen_live[load.announced_live as usize] = true;

                let expected_live = load.announced_live;
                let expected_blank = load.announced_blank;
                let mut drawn_live = 0u8;
                let mut drawn_blank = 0u8;
                while !load.is_empty() {
                    let shell = load.current(&mut src).unwrap();
                    load.advance(shell);
                    match shell {
                        Shell::Live => drawn_live += 1,
                        Shell::Blank => drawn_blank += 1,
                    }
                }
                assert_eq!(drawn_live, expected_live, "seed {seed}, round {round}");
                assert_eq!(drawn_blank, expected_blank, "seed {seed}, round {round}");

                let mut state = state_for_round(round, new_load(&cfg, &mut src), &cfg);
                let actions = deal_items(&mut state, &cfg, &mut src);
                let expected = cfg.rounds[(round - 1) as usize].items_per_load as usize;
                for player in 0..2usize {
                    assert_eq!(state.items[player].len(), expected);
                    assert!(state.items[player].iter().all(|i| ALL_ITEMS.contains(i)));
                    assert!(state.items[player].len() <= cfg.max_items as usize);
                }
                assert_eq!(state.deck_remaining(), 36 - (expected as u16) * 2);
                if expected == 0 {
                    assert!(actions.is_empty(), "R1'de eşya aksiyonu olmamalı");
                } else {
                    assert_eq!(actions.len(), 2);
                }
            }
        }
        for live in cfg.min_live..=cfg.max_live {
            assert!(seen_live[live as usize], "live={live} 10000 tohumda hiç görülmedi");
        }
    }

    /// T-103: el dolu iken boş slot kadar dağıtılır (`max_items = 4`), çekilmeyen kart destede kalır; yalnız yer açılan oyuncuya aksiyon üretilir.
    #[test]
    fn deal_items_drops_extras_when_slots_full() {
        let cfg = Config::default();
        let mut src = XorshiftRng::new(42);
        let mut state = state_for_round(2, Load::new(2, 2), &cfg);
        state.items[0] = vec![Item::Pipe; 4];
        state.items[1] = vec![Item::Pipe; 3];
        let actions = deal_items(&mut state, &cfg, &mut src);
        assert_eq!(state.items[0].len(), 4);
        assert_eq!(state.items[1].len(), 4);
        assert_eq!(actions.len(), 1);
        match &actions[0] {
            Action::ItemsDealt { player, items } => {
                assert_eq!(*player, 1);
                assert_eq!(items.len(), 1);
                assert!(ALL_ITEMS.contains(&items[0]));
                assert_eq!(state.deck_remaining(), 35);
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

    // ------------------------------------------------------------------
    // T-104: ateş etme ve sıra mantığı
    // ------------------------------------------------------------------

    fn fire_state(round: u8, load: Load) -> GameState {
        let cfg = Config::default();
        state_for_round(round, load, &cfg)
    }

    /// T-104: kendine boş → hasar yok, sıra sende kalır (DESIGN §2.3).
    #[test]
    fn blank_self_shot_keeps_turn() {
        let mut src = ScriptedSource::new(vec![Shell::Blank]);
        let mut st = fire_state(1, Load::new(1, 1));
        let actions = fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![
                Action::Shot { player: 0, target: Target::SelfTarget, shell: Shell::Blank, damage: 0 },
                Action::Ejected { shell: Shell::Blank },
            ]
        );
        assert_eq!(st.turn, 0);
        assert_eq!(st.hp, [4, 4]);
        assert_eq!(st.load.remaining, 1);
        assert_eq!((st.load.live_left, st.load.blank_left), (1, 0));
    }

    /// T-104: kendine dolu → 1 hasar, sıra rakibe geçer.
    #[test]
    fn live_self_shot_passes_turn() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(1, Load::new(1, 1));
        fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        assert_eq!(st.hp, [3, 4]);
        assert_eq!(st.turn, 1);
    }

    /// T-104: rakibe boş → hasar yok, sıra rakibe geçer.
    #[test]
    fn blank_opponent_shot_passes_turn() {
        let mut src = ScriptedSource::new(vec![Shell::Blank]);
        let mut st = fire_state(1, Load::new(1, 1));
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.hp, [4, 4]);
        assert_eq!(st.turn, 1);
        assert_eq!(
            actions[0],
            Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Blank, damage: 0 }
        );
    }

    /// T-104: rakibe dolu → 1 hasar, sıra rakibe geçer.
    #[test]
    fn live_opponent_shot_deals_damage() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(1, Load::new(1, 1));
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.hp, [4, 3]);
        assert_eq!(st.turn, 1);
        assert_eq!(
            actions[0],
            Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Live, damage: 1 }
        );
    }

    /// T-104: testereli dolu → 2 hasar, atıştan sonra testere kapalı.
    #[test]
    fn sawed_live_shot_deals_two_damage_and_resets_saw() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(2, Load::new(2, 2));
        st.saw_active = true;
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.hp, [4, 2]);
        assert!(!st.saw_active);
        assert_eq!(actions[0], Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Live, damage: 2 });
    }

    /// T-104: testereli boş → hasar yok ama testere yine kapanır (kural 5).
    #[test]
    fn sawed_blank_shot_resets_saw() {
        let mut src = ScriptedSource::new(vec![Shell::Blank]);
        let mut st = fire_state(2, Load::new(2, 2));
        st.saw_active = true;
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.hp, [4, 4]);
        assert!(!st.saw_active);
        assert_eq!(
            actions[0],
            Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Blank, damage: 0 }
        );
    }

    /// T-104: kelepçeli rakip → sırası atlanır, kelepçe kırılır, sıra
    /// kullanana döner; kırılma bilgisi aynı sıra zincirinde kalır, sıra
    /// gerçekten rakibe geçtiğinde temizlenir (§3.2 kural 4).
    #[test]
    fn shackled_opponent_is_skipped_then_shackle_broken() {
        let mut src = ScriptedSource::new(vec![Shell::Blank, Shell::Blank, Shell::Blank]);
        let mut st = fire_state(1, Load::new(1, 3));
        st.shackled = Some(1);
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![
                Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Blank, damage: 0 },
                Action::Ejected { shell: Shell::Blank },
                Action::TurnSkipped { player: 1 },
            ]
        );
        assert_eq!(st.turn, 0);
        assert_eq!(st.shackled, None);
        assert!(st.shackle_broke_this_turn);
        // Boşla kendine ateş sırayı kullananda tutar → aynı zincir.
        fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        assert!(st.shackle_broke_this_turn);
        // Sıra rakibe gerçekten geçince yeni zincir başlar.
        fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.turn, 1);
        assert!(!st.shackle_broke_this_turn);
    }

    /// FIX-11 (G-05): Son fişekte boşla kendine ateşten sonra yeni yükte kelepçe kalkar.
    #[test]
    fn reload_clears_shackles_after_blank_self_shot_on_last_shell() {
        let mut src = ScriptedSource::with_rolls(vec![Shell::Blank], vec![0; 12]);
        let mut st = fire_state(2, Load::new(0, 1));
        st.shackled = Some(1);
        st.shackle_broke_this_turn = true;
        fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        assert_eq!(st.shackled, None);
        assert!(!st.shackle_broke_this_turn);
        assert_eq!(st.turn, 0);
        // Yeni yükte rakip yeniden kelepçelenebilir.
        st.items[0][0] = Item::Shackle;
        use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(st.shackled, Some(1));
    }

    /// T-104: son fişek → yeni yükleme + R2/R3'te eşya dağıtımı (kural 7).
    #[test]
    fn last_shell_triggers_reload_with_items() {
        let mut src =
            ScriptedSource::with_rolls(vec![Shell::Blank, Shell::Live], vec![0; 12]);
        let mut st = fire_state(2, Load::new(1, 1));
        let mut actions = fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        actions.extend(fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap());
        assert_eq!(
            actions,
            vec![
                Action::Shot { player: 0, target: Target::SelfTarget, shell: Shell::Blank, damage: 0 },
                Action::Ejected { shell: Shell::Blank },
                Action::Shot { player: 0, target: Target::SelfTarget, shell: Shell::Live, damage: 1 },
                Action::Ejected { shell: Shell::Live },
                Action::LoadStarted { live: 2, blank: 6, total: 8 },
                Action::ItemsDealt { player: 0, items: vec![Item::Loupe; 4] },
                Action::ItemsDealt { player: 1, items: vec![Item::Pipe; 4] },
            ]
        );
        assert_eq!(st.deck_remaining(), 28);
        assert_eq!(st.load.remaining, 8);
        assert_eq!(st.turn, 1); // ikinci atış dolu → sıra geçti
        assert_eq!(st.hp, [3, 4]);
    }

    /// T-104 + VALUES-FIX-01: son fişek R1'de → 8 gözlü yeni yük (roll 3 -> 5/3), R1'de de 4'er eşya dağıtılır.
    #[test]
    fn r1_reload_deals_items() {
        let mut src = ScriptedSource::with_rolls(vec![Shell::Blank, Shell::Live], vec![3, 0, 1, 2, 3, 4, 0, 1, 2]);
        let mut st = fire_state(1, Load::new(1, 1));
        let mut actions = fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        actions.extend(fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap());
        assert_eq!(actions.len(), 7);
        assert_eq!(actions[4], Action::LoadStarted { live: 5, blank: 3, total: 8 });
        assert!(matches!(actions[5], Action::ItemsDealt { player: 0, .. }));
        assert!(matches!(actions[6], Action::ItemsDealt { player: 1, .. }));
        assert_eq!(st.items[0].len(), 4);
        assert_eq!(st.items[1].len(), 4);
    }

    /// T-104: can 0 → round biter, kaybeden yeni round'u başlatır (§3.1 [KARAR]),
    /// round durumu sıfırlanır ve yeni yükleme + dağıtım gelir (kural 6).
    #[test]
    fn death_ends_round_and_loser_starts_next() {
        let mut src = ScriptedSource::with_rolls(vec![Shell::Live], vec![0; 12]);
        let mut st = fire_state(1, Load::new(1, 1));
        st.hp = [4, 1];
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(actions[2], Action::RoundEnded { winner: 0, score: [1, 0] });
        assert_eq!(actions[3], Action::LoadStarted { live: 2, blank: 6, total: 8 });
        assert_eq!(st.round, 2);
        assert_eq!(st.hp, [4, 4]);
        assert_eq!(st.max_hp, 4);
        assert_eq!(st.turn, 1); // kaybeden başlar
        assert_eq!(st.items[0].len(), 4);
        assert_eq!(st.heal_cut, [false, false]);
    }

    /// T-104: 2. round galibiyeti → maç sonu (2 puan; §3.1).
    #[test]
    fn second_round_win_ends_match() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(2, Load::new(1, 1));
        st.score = [1, 0];
        st.hp = [4, 1];
        let cfg = Config::default();
        let actions = fire(&mut st, &cfg, 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![
                Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Live, damage: 1 },
                Action::Ejected { shell: Shell::Live },
                Action::RoundEnded { winner: 0, score: [2, 0] },
                Action::MatchEnded { winner: 0, reward: cfg.reward.as_yoctonear().into() },
            ]
        );
        assert_eq!(st.round, 2);
        // Maç bitti; sıra anlamsızdır ve kullananda kalır.
        assert_eq!(st.turn, 0);
    }

    /// T-104: R3'te can eşiğin (2) altına inince iyileşme kesilir (§3.2 kural 8).
    #[test]
    fn heal_cut_triggers_at_threshold() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(3, Load::new(2, 2));
        st.hp = [4, 3];
        st.saw_active = true;
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.heal_cut, [false, true]);
        assert_eq!(st.hp, [4, 1]);
        assert_eq!(actions[2], Action::HealCut { player: 1 });
    }

    /// T-104: öldüren atış HealCut üretmez — round zaten bitiyor.
    /// (R3'e 1-1 girilir; R3 galibi maçı alır → MatchEnded.)
    #[test]
    fn fatal_shot_does_not_emit_heal_cut() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = fire_state(3, Load::new(2, 2));
        st.score = [1, 1];
        st.hp = [4, 2];
        st.saw_active = true;
        let actions = fire(&mut st, &Config::default(), 0, Target::Opponent, &mut src).unwrap();
        assert_eq!(st.heal_cut, [false, false]);
        assert!(matches!(actions[2], Action::RoundEnded { winner: 0, .. }));
        assert!(matches!(actions[3], Action::MatchEnded { winner: 0, .. }));
        assert!(!actions.iter().any(|a| matches!(a, Action::HealCut { .. })));
    }

    /// T-104: sırası olmayan oyuncu → hata; boş tüfek → hata; maç bitti → hata.
    #[test]
    fn fire_rejects_wrong_turn_empty_load_and_finished_match() {
        let mut src = ScriptedSource::new(vec![Shell::Blank]);
        let mut st = fire_state(1, Load::new(1, 1));
        assert_eq!(
            fire(&mut st, &Config::default(), 1, Target::Opponent, &mut src),
            Err(GameError::NotYourTurn)
        );
        let mut empty = fire_state(1, Load::new(1, 1));
        empty.load = Load::new(0, 0);
        assert_eq!(
            fire(&mut empty, &Config::default(), 0, Target::Opponent, &mut src),
            Err(GameError::NoShellsLeft)
        );
        let mut done = fire_state(1, Load::new(1, 1));
        done.score = [2, 0];
        assert_eq!(
            fire(&mut done, &Config::default(), 0, Target::Opponent, &mut src),
            Err(GameError::MatchFinished)
        );
    }

    // ------------------------------------------------------------------
    // T-105: eşyalar — orijinal beşli
    // ------------------------------------------------------------------

    fn item_state(round: u8, load: Load, items: Vec<Item>) -> GameState {
        let mut st = fire_state(round, load);
        st.items[0] = items;
        st
    }

    fn use_at(st: &mut GameState, slot: u8, src: &mut dyn ShellSource) -> Result<Vec<Action>, GameError> {
        use_item(st, &Config::default(), 0, slot, None, src)
    }

    /// T-105: Loupe — mevcut fişeği kullanana gizlice gösterir; fişek/sıra değişmez.
    #[test]
    fn loupe_reveals_current_shell_privately() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Loupe]);
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Loupe,
                slot: 0,
                result: ItemResult::Private { pos: 0, shell: Shell::Live },
            }]
        );
        assert!(st.items[0].is_empty());
        assert_eq!(st.turn, 0);
        assert_eq!(st.load.remaining, 2);
        assert_eq!(st.load.fixed[0], Some(Shell::Live));
        // Boş tüfekle Loupe reddedilir, eşya korunur.
        let mut src2 = ScriptedSource::new(vec![]);
        let mut st2 = item_state(3, Load::new(0, 0), vec![Item::Loupe]);
        assert_eq!(use_at(&mut st2, 0, &mut src2), Err(GameError::NoShellsLeft));
        assert_eq!(st2.items[0], vec![Item::Loupe]);
    }

    /// T-105: Pipe — +1 can; heal_cut'ta ve maksimum candayken red.
    #[test]
    fn pipe_heals_but_not_at_cut_or_full_hp() {
        let mut src = ScriptedSource::new(vec![]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Pipe]);
        st.hp = [3, 4];
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Pipe,
                slot: 0,
                result: ItemResult::Healed { amount: 1 },
            }]
        );
        assert_eq!(st.hp, [4, 4]);
        assert!(st.items[0].is_empty());
        // heal_cut'ta red.
        let mut cut = item_state(3, Load::new(1, 1), vec![Item::Pipe]);
        cut.heal_cut = [true, false];
        cut.hp = [3, 3];
        assert_eq!(use_at(&mut cut, 0, &mut src), Err(GameError::HealBlocked));
        assert_eq!(cut.items[0], vec![Item::Pipe]);
        assert_eq!(cut.hp, [3, 3]);
        // Maksimum candayken red.
        let mut full = item_state(2, Load::new(1, 1), vec![Item::Pipe]);
        assert_eq!(use_at(&mut full, 0, &mut src), Err(GameError::ItemBlocked));
        assert_eq!(full.items[0], vec![Item::Pipe]);
        assert_eq!(full.hp, [4, 4]);
    }

    /// T-105: Flask — fişek atılır (herkese açık), sıra geçmez, testere
    /// etkilenmez; son fişekse yeni yükleme + dağıtım.
    #[test]
    fn flask_ejects_shell_without_passing_turn() {
        let mut src = ScriptedSource::new(vec![Shell::Blank]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Flask]);
        st.saw_active = true;
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![
                Action::ItemUsed {
                    player: 0,
                    item: Item::Flask,
                    slot: 0,
                    result: ItemResult::Ejected { shell: Shell::Blank },
                },
                Action::Ejected { shell: Shell::Blank },
            ]
        );
        assert_eq!(st.turn, 0); // atış sayılmaz
        assert_eq!(st.load.remaining, 1);
        assert_eq!(st.load.blank_left, 0);
        assert!(st.saw_active); // bira testereyi düşürmez (kural 3)
        // Son fişek: tur biter, testere sıfırlanır, yeni yükleme + R2 dağıtımı (G-04).
        let mut src2 = ScriptedSource::with_rolls(vec![Shell::Blank], vec![0; 12]);
        let mut st2 = item_state(2, Load::new(1, 1), vec![Item::Flask]);
        st2.load = Load::new(0, 1);
        st2.saw_active = true;
        let actions2 = use_at(&mut st2, 0, &mut src2).unwrap();
        assert_eq!(actions2.len(), 5);
        assert_eq!(actions2[2], Action::LoadStarted { live: 2, blank: 6, total: 8 });
        assert_eq!(st2.load.remaining, 8);
        assert_eq!(st2.items[0], vec![Item::Loupe; 4]);
        assert_eq!(st2.turn, 1);
        assert!(!st2.saw_active);

        // Son fişekte rakip kelepçeliyse atlanıp kullanana döner.
        let mut src_shackle = ScriptedSource::with_rolls(vec![Shell::Blank], vec![0; 12]);
        let mut st_sh = item_state(2, Load::new(0, 1), vec![Item::Flask]);
        st_sh.shackled = Some(1);
        let actions_sh = use_at(&mut st_sh, 0, &mut src_shackle).unwrap();
        assert!(actions_sh.contains(&Action::TurnSkipped { player: 1 }));
        assert_eq!(st_sh.turn, 0);
        assert_eq!(st_sh.shackled, None);
        // Boş tüfekle red.
        let mut src3 = ScriptedSource::new(vec![]);
        let mut st3 = item_state(2, Load::new(0, 0), vec![Item::Flask]);
        assert_eq!(use_at(&mut st3, 0, &mut src3), Err(GameError::NoShellsLeft));
        assert_eq!(st3.items[0], vec![Item::Flask]);
    }

    /// T-105: Shackle — rakibi kelepçeler; zaten kelepçeliyse veya bu
    /// zincirde kırıldıysa red.
    #[test]
    fn shackle_skips_opponent_but_rejects_repeat() {
        let mut src = ScriptedSource::new(vec![]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Shackle]);
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Shackle,
                slot: 0,
                result: ItemResult::None,
            }]
        );
        assert_eq!(st.shackled, Some(1));
        assert_eq!(st.turn, 0);
        // Rakip zaten kelepçeli → red, eşya korunur.
        let mut again = item_state(2, Load::new(1, 1), vec![Item::Shackle]);
        again.shackled = Some(1);
        assert_eq!(use_at(&mut again, 0, &mut src), Err(GameError::AlreadyShackled));
        assert_eq!(again.items[0], vec![Item::Shackle]);
        // Bu zincirde kelepçe yeni kırıldı → red.
        let mut broke = item_state(2, Load::new(1, 1), vec![Item::Shackle]);
        broke.shackle_broke_this_turn = true;
        assert_eq!(use_at(&mut broke, 0, &mut src), Err(GameError::ShackleJustBroke));
        assert_eq!(broke.items[0], vec![Item::Shackle]);
    }

    /// T-105: Hacksaw — sonraki atışa testere kurar; zaten aktifken red.
    #[test]
    fn hacksaw_arms_next_shot_but_not_twice() {
        let mut src = ScriptedSource::new(vec![]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Hacksaw]);
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Hacksaw,
                slot: 0,
                result: ItemResult::None,
            }]
        );
        assert!(st.saw_active);
        // Zaten aktif → red, eşya korunur.
        let mut twice = item_state(2, Load::new(1, 1), vec![Item::Hacksaw]);
        twice.saw_active = true;
        assert_eq!(use_at(&mut twice, 0, &mut src), Err(GameError::SawAlreadyActive));
        assert_eq!(twice.items[0], vec![Item::Hacksaw]);
    }

    /// T-105: ortak reddi yolları — sıra, slot aralığı, boş slot, bitmiş maç.
    #[test]
    fn use_item_rejects_common_violations() {
        let mut src = ScriptedSource::new(vec![]);
        // Sıra değil.
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Pipe]);
        assert_eq!(
            use_item(&mut st, &Config::default(), 1, 0, None, &mut src),
            Err(GameError::NotYourTurn)
        );
        assert_eq!(st.items[0], vec![Item::Pipe]);
        // Slot ızgara dışı.
        assert_eq!(
            use_item(&mut st, &Config::default(), 0, 8, None, &mut src),
            Err(GameError::SlotOutOfRange)
        );
        // Slot boş.
        assert_eq!(
            use_item(&mut st, &Config::default(), 0, 1, None, &mut src),
            Err(GameError::SlotEmpty)
        );
        // Maç bitmiş.
        let mut done = item_state(2, Load::new(1, 1), vec![Item::Pipe]);
        done.score = [2, 0];
        assert_eq!(
            use_item(&mut done, &Config::default(), 0, 0, None, &mut src),
            Err(GameError::MatchFinished)
        );
    }

    // ------------------------------------------------------------------
    // T-106: eşyın — ek dörtlü (Ticker, Magnet, Lockpick, Tincture)
    // ------------------------------------------------------------------

    /// T-106: Ticker — mevcut hariç gelecekteki rastgele bir konumu
    /// kullanana gizlice söyler; tek fişek kaldıysa red.
    #[test]
    fn ticker_reveals_a_future_shell() {
        // 3 fişek: roll(2)=0 → pos 1; peek_at(1) kaynaktan Live çeker.
        let mut src = ScriptedSource::with_rolls(vec![Shell::Live], vec![0]);
        let mut st = item_state(3, Load::new(1, 2), vec![Item::Ticker]);
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Ticker,
                slot: 0,
                result: ItemResult::Private { pos: 1, shell: Shell::Live },
            }]
        );
        assert!(st.items[0].is_empty());
        assert_eq!(st.load.remaining, 3); // fişek tüketilmez
        assert_eq!(st.load.fixed[1], Some(Shell::Live));
        assert_eq!(st.turn, 0);
        // Tek fişek kaldıysa bilgi yok → eşya boşa gider (tüketilir, ItemResult::None, DECISIONS #8).
        let mut src2 = ScriptedSource::new(vec![]);
        let mut load = Load::new(1, 1);
        load.advance(Shell::Live);
        let mut st2 = item_state(3, load, vec![Item::Ticker]);
        let actions2 = use_at(&mut st2, 0, &mut src2).unwrap();
        assert_eq!(
            actions2,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Ticker,
                slot: 0,
                result: ItemResult::None,
            }]
        );
        assert!(st2.items[0].is_empty());
        assert_eq!(st2.load.remaining, 1);
    }

    /// T-106: Magnet — mevcut fişeğin kutbunu çevirir; `announced_*`
    /// değişmez, `live_left`/`blank_left` güncellenir.
    #[test]
    fn magnet_flips_current_shell_and_keeps_announced() {
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let mut st = item_state(3, Load::new(1, 1), vec![Item::Magnet]);
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Magnet,
                slot: 0,
                result: ItemResult::None,
            }]
        );
        assert_eq!((st.load.announced_live, st.load.announced_blank), (1, 1));
        assert_eq!((st.load.live_left, st.load.blank_left), (0, 2));
        assert_eq!(st.load.fixed[0], Some(Shell::Blank)); // Live çevrildi
        // Çevrilen fişek atışta gerçekten boş çıkar.
        let actions = fire(&mut st, &Config::default(), 0, Target::SelfTarget, &mut src).unwrap();
        assert_eq!(
            actions[0],
            Action::Shot { player: 0, target: Target::SelfTarget, shell: Shell::Blank, damage: 0 }
        );
        assert_eq!(st.hp, [4, 4]);
        assert_eq!(st.turn, 0);
    }

    /// T-106: Magnet — fişek Loupe ile biliniyorsa kaynak tüketilmeden çevrilir.
    #[test]
    fn magnet_flips_known_shell_without_drawing() {
        // Boş scripted kaynak: draw çağrılırsa panic eder.
        let mut src = ScriptedSource::new(vec![]);
        let mut st = item_state(3, Load::new(1, 1), vec![Item::Magnet]);
        st.load.fixed[0] = Some(Shell::Blank); // Loupe ile açılmış gibi
        use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(st.load.fixed[0], Some(Shell::Live));
        assert_eq!((st.load.live_left, st.load.blank_left), (2, 0));
        assert_eq!(st.load.announced_live, 1);
        // Boş tüfekte red.
        let mut src2 = ScriptedSource::new(vec![]);
        let mut st2 = item_state(3, Load::new(0, 0), vec![Item::Magnet]);
        assert_eq!(use_at(&mut st2, 0, &mut src2), Err(GameError::NoShellsLeft));
        assert_eq!(st2.items[0], vec![Item::Magnet]);
    }

    /// T-106: Lockpick — rakibin eşyasını çalar ve hemen kullanır
    /// (§3.2 kural 9). Çalınan Pipe actor'a uygulanır.
    #[test]
    fn lockpick_steals_and_uses_stolen_item() {
        let mut src = ScriptedSource::new(vec![]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Lockpick]);
        st.items[1] = vec![Item::Pipe];
        st.hp = [3, 4];
        let actions =
            use_item(&mut st, &Config::default(), 0, 0, Some(0), &mut src).unwrap();
        assert_eq!(
            actions,
            vec![
                Action::ItemUsed {
                    player: 0,
                    item: Item::Lockpick,
                    slot: 0,
                    result: ItemResult::None,
                },
                Action::ItemUsed {
                    player: 0,
                    item: Item::Pipe,
                    slot: 0, // rakip ızgarasındaki boşaltılan konum
                    result: ItemResult::Healed { amount: 1 },
                },
            ]
        );
        assert_eq!(st.hp, [4, 4]);
        assert!(st.items[0].is_empty());
        assert!(st.items[1].is_empty());
    }

    /// T-106: Lockpick — Lockpick çalınamaz; uygulanamazsa hiçbir şey
    /// tüketilmez (rakip kelepçeliyken Shackle çalmak vb.).
    #[test]
    fn lockpick_rejections_preserve_everything() {
        let mut src = ScriptedSource::new(vec![]);
        // Lockpick çalınamaz.
        let mut st = item_state(3, Load::new(1, 1), vec![Item::Lockpick]);
        st.items[1] = vec![Item::Lockpick];
        assert_eq!(
            use_item(&mut st, &Config::default(), 0, 0, Some(0), &mut src),
            Err(GameError::ItemBlocked)
        );
        assert_eq!(st.items[0], vec![Item::Lockpick]);
        assert_eq!(st.items[1], vec![Item::Lockpick]);
        // Çalınan Shackle uygulanamaz (rakip zaten kelepçeli) → atomik red.
        let mut st2 = item_state(3, Load::new(1, 1), vec![Item::Lockpick]);
        st2.items[1] = vec![Item::Shackle];
        st2.shackled = Some(1);
        assert_eq!(
            use_item(&mut st2, &Config::default(), 0, 0, Some(0), &mut src),
            Err(GameError::AlreadyShackled)
        );
        assert_eq!(st2.items[0], vec![Item::Lockpick]);
        assert_eq!(st2.items[1], vec![Item::Shackle]);
        // steal_slot yok / aralık dışı.
        assert_eq!(
            use_item(&mut st2, &Config::default(), 0, 0, None, &mut src),
            Err(GameError::SlotOutOfRange)
        );
        assert_eq!(
            use_item(&mut st2, &Config::default(), 0, 0, Some(1), &mut src),
            Err(GameError::SlotEmpty)
        );
    }

    /// T-106: Lockpick — çalınan Flask son fişeği atarsa yeni yükleme ve
    /// dağıtım da işler; Lockpick yine de tüketilir.
    #[test]
    fn lockpick_stolen_flask_can_trigger_reload() {
        let mut src = ScriptedSource::with_rolls(vec![Shell::Blank], vec![0; 12]);
        let mut st = item_state(2, Load::new(1, 1), vec![Item::Lockpick]);
        st.load = Load::new(0, 1);
        st.items[1] = vec![Item::Flask];
        let actions =
            use_item(&mut st, &Config::default(), 0, 0, Some(0), &mut src).unwrap();
        assert_eq!(actions.len(), 6);
        assert_eq!(
            actions[1],
            Action::ItemUsed {
                player: 0,
                item: Item::Flask,
                slot: 0,
                result: ItemResult::Ejected { shell: Shell::Blank },
            }
        );
        assert_eq!(actions[2], Action::Ejected { shell: Shell::Blank });
        assert_eq!(actions[3], Action::LoadStarted { live: 2, blank: 6, total: 8 });
        assert_eq!(st.load.remaining, 8);
        assert_eq!(st.items[0], vec![Item::Loupe; 4]);
        assert_eq!(st.items[1], vec![Item::Pipe; 4]);
        assert_eq!(st.deck_remaining(), 28);
    }

    /// T-106: Tincture — `tincture_good_pct` altında +2 can (max'a kelepçeli),
    /// üstünde -1 can; ölürse round biter; heal_cut'ta tamamen red.
    #[test]
    fn tincture_gamble_heals_damages_or_ends_round() {
        let mut src = ScriptedSource::with_rolls(vec![], vec![30]);
        let mut st = item_state(3, Load::new(1, 1), vec![Item::Tincture]);
        st.hp = [2, 2];
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Tincture,
                slot: 0,
                result: ItemResult::Healed { amount: 2 },
            }]
        );
        assert_eq!(st.hp, [4, 2]);
        // İyi yol maksimumu aşamaz.
        let mut src2 = ScriptedSource::with_rolls(vec![], vec![10]);
        let mut st2 = item_state(3, Load::new(1, 1), vec![Item::Tincture]);
        st2.hp = [3, 3];
        let actions2 = use_at(&mut st2, 0, &mut src2).unwrap();
        assert_eq!(
            actions2[0],
            Action::ItemUsed {
                player: 0,
                item: Item::Tincture,
                slot: 0,
                result: ItemResult::Healed { amount: 1 },
            }
        );
        assert_eq!(st2.hp, [4, 3]);
        // Kötü yol: -1 can, R3 eşiğine (2) düşünce HealCut.
        let mut src3 = ScriptedSource::with_rolls(vec![], vec![60]);
        let mut st3 = item_state(3, Load::new(1, 1), vec![Item::Tincture]);
        st3.hp = [3, 3];
        let actions3 = use_at(&mut st3, 0, &mut src3).unwrap();
        assert_eq!(
            actions3,
            vec![
                Action::ItemUsed {
                    player: 0,
                    item: Item::Tincture,
                    slot: 0,
                    result: ItemResult::Damaged { amount: 1 },
                },
                Action::HealCut { player: 0 },
            ]
        );
        assert_eq!(st3.hp, [2, 3]);
        assert_eq!(st3.heal_cut, [true, false]);
        // heal_cut'ta tamamen red.
        let mut src4 = ScriptedSource::with_rolls(vec![], vec![0]);
        let mut st4 = item_state(3, Load::new(1, 1), vec![Item::Tincture]);
        st4.heal_cut = [true, false];
        assert_eq!(use_at(&mut st4, 0, &mut src4), Err(GameError::HealBlocked));
        assert_eq!(st4.items[0], vec![Item::Tincture]);
        // Sınır kontrolü (varsayılan 50): roll 49 iyi (+2), roll 50 kötü (-1).
        let mut src_good = ScriptedSource::with_rolls(vec![], vec![49]);
        let mut st_good = item_state(1, Load::new(1, 1), vec![Item::Tincture]);
        st_good.hp = [2, 4];
        assert_eq!(
            use_at(&mut st_good, 0, &mut src_good).unwrap()[0],
            Action::ItemUsed {
                player: 0,
                item: Item::Tincture,
                slot: 0,
                result: ItemResult::Healed { amount: 2 },
            }
        );
        let mut src_bad = ScriptedSource::with_rolls(vec![], vec![50]);
        let mut st_bad = item_state(1, Load::new(1, 1), vec![Item::Tincture]);
        st_bad.hp = [3, 4];
        assert_eq!(
            use_at(&mut st_bad, 0, &mut src_bad).unwrap()[0],
            Action::ItemUsed {
                player: 0,
                item: Item::Tincture,
                slot: 0,
                result: ItemResult::Damaged { amount: 1 },
            }
        );
    }

    /// T-106: Tincture kötü yolu öldürebilir (§2.4) → round biter,
    /// kaybeden yeni round'u başlatır.
    #[test]
    fn tincture_bad_roll_can_kill() {
        let mut src = ScriptedSource::with_rolls(vec![], vec![99, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let mut st = item_state(1, Load::new(1, 1), vec![Item::Tincture]);
        st.hp = [1, 4];
        let actions = use_at(&mut st, 0, &mut src).unwrap();
        assert_eq!(
            actions[0],
            Action::ItemUsed {
                player: 0,
                item: Item::Tincture,
                slot: 0,
                result: ItemResult::Damaged { amount: 1 },
            }
        );
        assert_eq!(actions[1], Action::RoundEnded { winner: 1, score: [0, 1] });
        assert_eq!(st.round, 2);
        assert_eq!(st.hp, [4, 4]);
        assert_eq!(st.turn, 0); // kaybeden (0) başlar
        assert!(matches!(actions[2], Action::LoadStarted { .. }));
    }

    /// FIX-02 (S-07): Yüksek slotta (max_items=4 iken son slot 3) ölümcül Tincture
    /// R1'de panik vermez ve R2'de yeni dağıtılan eşyalar bozulmaz.
    #[test]
    fn tincture_bad_roll_high_slot_does_not_panic_or_corrupt_new_items() {
        // roll 0 = 99 (Tincture kötü yol), sonraki rollar new_load + deal_items (8 item)
        let mut src =
            ScriptedSource::with_rolls(vec![], vec![99, 0, 0, 1, 2, 3, 4, 0, 1, 2]);
        let items = vec![
            Item::Loupe,
            Item::Pipe,
            Item::Flask,
            Item::Tincture,
        ];
        let mut st = item_state(1, Load::new(1, 1), items);
        st.hp = [1, 4];
        let actions = use_at(&mut st, 3, &mut src).unwrap();
        assert_eq!(actions[1], Action::RoundEnded { winner: 1, score: [0, 1] });
        assert_eq!(st.round, 2);
        // R2 dağıtımı her iki oyuncuya tam 4 eşya vermiş ve silinmemiş olmalı.
        assert_eq!(st.items[0].len(), 4);
        assert_eq!(st.items[1].len(), 4);
    }

    /// FIX-02 (S-07): Tam dolu 4 slotta Flask son fişeği atarsa boşalan 4. slota
    /// yeni eşya dağıtılır; hata durumunda ise eşya eski slotuna geri konur.
    #[test]
    fn flask_at_full_slots_frees_slot_before_reload_and_errors_restore_slot() {
        let mut src = ScriptedSource::with_rolls(vec![Shell::Blank], vec![0; 12]);
        let mut items = vec![Item::Pipe; 3];
        items.push(Item::Flask);
        let mut st = item_state(2, Load::new(0, 1), items);
        use_at(&mut st, 3, &mut src).unwrap();
        assert_eq!(st.items[0].len(), 4);

        // Hata yolunda slot sırası birebir korunur.
        let mut err_st = item_state(2, Load::new(1, 1), vec![Item::Loupe, Item::Pipe, Item::Flask]);
        err_st.hp[0] = err_st.max_hp;
        assert_eq!(use_at(&mut err_st, 1, &mut src), Err(GameError::ItemBlocked));
        assert_eq!(err_st.items[0], vec![Item::Loupe, Item::Pipe, Item::Flask]);
    }

    /// FIX-07 (G-01): Oyuncu başına kablo — A kesikken B Pipe kullanabiliyor,
    /// B de ≤2'ye düşünce ayrı bir `HealCut { player: 1 }` aksiyonu çıkıyor.
    #[test]
    fn per_player_heal_cut_allows_other_to_heal_and_emits_separate_event() {
        let mut src = ScriptedSource::new(vec![Shell::Live, Shell::Live]);
        let cfg = Config::default();
        let mut st = fire_state(3, Load::new(2, 2));
        st.hp = [3, 3];
        st.items = [vec![Item::Pipe], vec![Item::Pipe]];
        st.turn = 1; // B başlar → A'yı 2'ye düşürür.

        let a1 = fire(&mut st, &cfg, 1, Target::Opponent, &mut src).unwrap();
        assert!(a1.contains(&Action::HealCut { player: 0 }));
        assert_eq!(st.heal_cut, [true, false]);

        // Sıra A'da: kendi Pipe'ı engelli (kendi kablosu kesik).
        assert_eq!(use_item(&mut st, &cfg, 0, 0, None, &mut src), Err(GameError::HealBlocked));

        // B ise hâlâ Pipe kullanabiliyor; A ateş etti (B->1 veya durup önce B'ye geçelim):
        st.turn = 1;
        st.hp[1] = 3;
        let b_pipe = use_item(&mut st, &cfg, 1, 0, None, &mut src).unwrap();
        assert_eq!(st.hp[1], 4);
        assert!(matches!(b_pipe[0], Action::ItemUsed { item: Item::Pipe, .. }));

        // Şimdi B ≤ 2'ye düşünce ayrı bir HealCut { player: 1 } çıkar.
        st.turn = 0;
        st.hp[1] = 3;
        let a2 = fire(&mut st, &cfg, 0, Target::Opponent, &mut src).unwrap();
        assert!(a2.contains(&Action::HealCut { player: 1 }));
        assert_eq!(st.heal_cut, [true, true]);
    }

    /// EK2: Ortak deste başlangıçta 9×4 = 36 kart içerir, iadesiz dağıtılır,
    /// bitince `copies_per_item` ile yeniden doldurulur ve `deck_remaining()` bunu yansıtır.
    #[test]
    fn shared_deck_deals_without_replacement_and_refills() {
        let cfg = Config::default();
        let mut src = XorshiftRng::new(98765);
        let mut st = state_for_round(1, Load::new(4, 4), &cfg);
        assert_eq!(st.deck_remaining(), 36);
        assert_eq!(st.deck_counts, [4; 9]);

        let mut counts = [0u8; 9];
        // 4 tam çift el dağıtımı (4 × 8 = 32) + 1 tek el (4) = tam 36 kart (iadesiz).
        for round_step in 0..4 {
            let dealt_actions = deal_items(&mut st, &cfg, &mut src);
            assert_eq!(dealt_actions.len(), 2);
            for p in 0..2 {
                assert_eq!(st.items[p].len(), 4);
                for it in st.items[p].drain(..) {
                    let idx = ALL_ITEMS.iter().position(|&x| x == it).unwrap();
                    counts[idx] += 1;
                }
            }
            assert_eq!(st.deck_remaining(), 36 - ((round_step + 1) * 8) as u16);
        }
        // Şu an destede 4 kart kaldı; sadece player 0'ın elini boşaltıp 4 kart çekelim,
        // player 1'in eli dolu olsun ki tam 36. kartta deste 0'a insin.
        st.items[1] = vec![Item::Pipe; 4];
        let last_4 = deal_items(&mut st, &cfg, &mut src);
        assert_eq!(last_4.len(), 1);
        for it in st.items[0].drain(..) {
            let idx = ALL_ITEMS.iter().position(|&x| x == it).unwrap();
            counts[idx] += 1;
        }
        assert_eq!(counts, [4; 9], "36 çekimde her 9 tür tam olarak 4 kez gelmeli");
        assert_eq!(st.deck_remaining(), 0);
        assert_eq!(st.deck_counts, [0; 9]);

        // Deste bitti → bir sonraki dağıtımda otomatik [4; 9] (36) olarak yenilenir ve 8 kart dağıtır.
        st.items = [Vec::new(), Vec::new()];
        let refilled = deal_items(&mut st, &cfg, &mut src);
        assert_eq!(refilled.len(), 2);
        assert_eq!(st.items[0].len(), 4);
        assert_eq!(st.items[1].len(), 4);
        assert_eq!(st.deck_remaining(), 28);
    }

    /// EK2: `Config.copies_per_item` deste boyutunu ve yenileme miktarını belirler.
    #[test]
    fn shared_deck_respects_custom_copies_per_item() {
        let mut cfg = Config::default();
        cfg.copies_per_item = 2; // 9 × 2 = 18 kart
        let mut src = XorshiftRng::new(13579);
        let mut st = state_for_round(1, Load::new(4, 4), &cfg);
        assert_eq!(st.deck_remaining(), 18);

        let mut counts = [0u8; 9];
        // İlk 16 kart (2× 8 kart) + sonraki turun ilk oyuncusunun 2 kartı = 18 kart (tam boşalma),
        // ardından aynı dağıtım içinde deste yenilenir ve 2+4 = 6 kart yeni desteden gelir.
        for _ in 0..2 {
            deal_items(&mut st, &cfg, &mut src);
            for p in 0..2 {
                for it in st.items[p].drain(..) {
                    let idx = ALL_ITEMS.iter().position(|&x| x == it).unwrap();
                    counts[idx] += 1;
                }
            }
        }
        assert_eq!(st.deck_remaining(), 2);
        // Kalan son 2 kartı ve sonraki yenilemeden 6 kartı çek:
        st.items = [Vec::new(), Vec::new()];
        deal_items(&mut st, &cfg, &mut src);
        assert_eq!(st.items[0].len(), 4);
        assert_eq!(st.items[1].len(), 4);
        // İlk 18 karttan her biri tam 2 kez çıkmış olmalı:
        // player 0'ın ilk 2 kartı önceki 16 kartı 18'e tamamlar.
        for it in &st.items[0][..2] {
            let idx = ALL_ITEMS.iter().position(|&x| x == *it).unwrap();
            counts[idx] += 1;
        }
        assert_eq!(counts, [2; 9], "18 çekimde her 9 tür tam 2 kez gelmeli");
        // Yeni desteden 2 (p0 sonu) + 4 (p1) = 6 kart eksildi → 18 - 6 = 12 kalmalı.
        assert_eq!(st.deck_remaining(), 12);
    }
}
