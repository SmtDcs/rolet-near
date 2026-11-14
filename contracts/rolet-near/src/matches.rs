//! Maç yaşam döngüsü (T-110..T-123, DESIGN §4.4/§4.5): join/cancel (T-110),
//! reveal (T-111), fire/use_item sarmalayıcıları (T-112), claim_timeout +
//! claim_reward (T-113).
//!
//! Kontrat-üzerinden-çağrı yasağı: tüm oyuncu aksiyonları
//! `predecessor_account_id == signer_account_id` şartı taşır (DESIGN §4.6) —
//! function-call key ile çağrıda predecessor yine oyuncu hesabıdır, kural
//! erişimi engellemez.

use crate::config::Config;
use crate::events;
use crate::game::{fire as game_fire, new_load, use_item as game_use_item, Action, GameError, GameState, ShellSource, Target};
use crate::rng::{commitment, ChainSource};
use crate::{Contract, ContractExt};
use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise};

/// `Match.log` kapasitesi (DESIGN §4.5: son 32 aksiyon).
pub const LOG_CAP: usize = 32;

/// S-01: rastgele çekiliş içeren metodlar (`reveal`, `fire`, `use_item`) için
/// minimum ön ödemeli gaz eşiği. Sandbox'ta ölçülen en pahalı dal (~4.1 Tgas)
/// için >2× güvenlik payı olarak 10 Tgas seçilmiştir.
pub const MIN_ACTION_GAS: Gas = Gas::from_tgas(10);

/// S-15: son saniye `fire`/`claim_timeout` yarışını önlemek için Active timeout ek süresi (ms).
pub const TIMEOUT_GRACE_MS: u64 = 2_000;

/// Maç durumu (DESIGN §4.5). `Pending → Revealing → Active → Finished`, hatalı
/// veya terk edilenler `Cancelled`.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub enum Status {
    /// Tek taraf katılmış, rakibi bekliyor.
    Pending,
    /// İki taraf katılmış, commit-reveal bekleniyor.
    Revealing,
    /// Oyun oynanıyor.
    Active,
    /// Bitti; özet durur, `log`/`fixed` budanır (T-116).
    Finished,
    /// Taraflardan biri/ikisi iade alarak ayrıldı (timeout / cancel).
    Cancelled,
}

/// Bir maçın tam kaydı (DESIGN §4.5 `Match`). `players[1]`, `Pending`
/// aşamasında beklenen rakibi (join çağrısındaki `opponent`) tutar; ikinci
/// join bu alanı doğrular — karşılıklı isimlendirme yabancıyı dışlar.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Match {
    pub id: u64,
    pub status: Status,
    /// [ilk katılan, ikinci/beklenen].
    pub players: [AccountId; 2],
    /// [ilk katılanın token'ı, ikincininki].
    pub tokens: [TokenId; 2],
    /// `join`'den gelen taahhütler (DESIGN §4.4).
    pub commits: [[u8; 32]; 2],
    /// `reveal` sırrı; `None` = henüz açılmadı.
    pub secrets: [Option<[u8; 32]>; 2],
    /// İkinci reveal'da sabitlenen maç tohumu (DESIGN §4.6).
    pub seed: [u8; 32],
    /// Lazy-draw nonce'u (T-107 `ChainSource`).
    pub draw_nonce: u64,
    /// Oyun durumu (T-101 `GameState`).
    pub game: GameState,
    /// Reveal aşaması için son zaman (ms) — Revealing'e geçişte kurulur.
    pub reveal_deadline_ms: u64,
    /// Hamle süresi sonunda (ms) — her aksiyonda yenilenir (T-112).
    pub deadline_ms: u64,
    pub winner: Option<u8>,
    /// Her aksiyonda +1; `get_actions(since_seq)` için (T-115).
    pub seq: u64,
    /// Son `LOG_CAP` aksiyon (T-114 olaylarıyla birebir).
    pub log: Vec<Action>,
    /// Maç başlangıcında sabitlenen yapılandırma anlık görüntüsü (FIX-06 / S-05).
    pub config: Config,
}

/// Oyuncu başına kayıt (DESIGN §4.5 `PlayerState`).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct PlayerState {
    /// Oyuncunun içinde olduğu maç; `None` = serbest.
    pub active_match: Option<u64>,
    pub wins: u32,
    pub losses: u32,
    pub played: u32,
    /// Treasury yetersizken hak edilen ödül (T-112/T-113 `claim_reward`).
    pub owed: NearToken,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            active_match: None,
            wins: 0,
            losses: 0,
            played: 0,
            owed: NearToken::ZERO,
        }
    }
}

/// Kontrat-üzerinden-çağrı yasağı (DESIGN §4.6): `predecessor != signer`
/// olan çağrı reddedilir. — Contractar::fn olarak değil modül fonksiyonu.
pub fn require_direct_call() {
    require!(
        env::predecessor_account_id() == env::signer_account_id(),
        "contract call rejected"
    );
}

/// Millisaniye cinsinden blok zamanı (DESIGN §4.4: `env::block_timestamp_ms`).
pub fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

/// Aksiyonu maç kaydına yazar (seq + son `LOG_CAP` giriş) ve NEP-297 olayı
/// loglar (T-114).
pub fn push_action(m: &mut Match, action: Action) {
    m.seq += 1;
    if m.log.len() >= LOG_CAP {
        let excess = m.log.len() + 1 - LOG_CAP;
        m.log.drain(0..excess);
    }
    m.log.push(action.clone());
    events::log_action(&action);
}

/// Çağırıcının maçtaki oyuncu indisi (0 | 1); katılımcı değilse panik.
fn participant_index(m: &Match, player: &AccountId) -> usize {
    if &m.players[0] == player {
        0
    } else if &m.players[1] == player {
        1
    } else {
        panic!("not a participant")
    }
}

/// Oyuncu çifti ve `match_id` için deterministik depolama anahtarı (FIX-05 / S-04).
/// Yabancı bir hesabın bilinen `match_id`'yi önceden açarak çifti engellemesini önler.
pub(crate) fn match_key(a: &AccountId, b: &AccountId, match_id: u64) -> [u8; 32] {
    let (lo, hi) = if a.as_str() <= b.as_str() { (a, b) } else { (b, a) };
    let mut buf = Vec::with_capacity(lo.as_str().len() + hi.as_str().len() + 10);
    buf.extend_from_slice(lo.as_bytes());
    buf.push(0);
    buf.extend_from_slice(hi.as_bytes());
    buf.push(0);
    buf.extend_from_slice(&match_id.to_le_bytes());
    env::sha256_array(&buf)
}

impl Contract {
    /// Oyuncunun durumu; yoksa sıfırlardan kurar (kayıt oluşturmaz).
    pub fn player_state(&self, account: &AccountId) -> PlayerState {
        self.players.get(account).unwrap_or_default()
    }

    /// `match_id` üzerinden son maç kaydı ya da panik (test ve view desteği).
    pub fn match_or_panic(&self, match_id: u64) -> Match {
        match self.match_id_index.get(&match_id).and_then(|k| self.matches.get(&k)) {
            Some(m) => m,
            None => panic!("no such match"),
        }
    }

    /// Çağırıcı ve `match_id` için maçı çözer: önce çağırıcının kendi aktif anahtarına,
    /// yoksa `match_id` dizinine bakar (yabancı/katılmamış çağrıcıların beklenen
    /// `"not a participant"` / `"only the first participant can cancel"` hatalarını
    /// üretebilmesi için).
    fn resolve_match_for_player(&self, player: &AccountId, match_id: u64) -> ([u8; 32], Match) {
        if let Some(key) = self.active_keys.get(player) {
            if let Some(m) = self.matches.get(&key) {
                if m.id == match_id {
                    return (key, m);
                }
            }
        }
        if let Some(key) = self.match_id_index.get(&match_id) {
            if let Some(m) = self.matches.get(&key) {
                return (key, m);
            }
        }
        panic!("no such match");
    }

    /// Testlerde maçı `match_key` üzerinden günceller.
    #[cfg(test)]
    pub(crate) fn save_match(&mut self, m: &Match) {
        let key = match_key(&m.players[0], &m.players[1], m.id);
        self.matches.insert(&key, m);
        self.match_id_index.insert(&m.id, &key);
    }

    /// Join maliyetini uygular: durability −1, token kilidi, `active_match`, `active_keys`.
    /// İptal/timeout yolları bunun tamamını geri alır.
    fn lock_in(&mut self, player: &AccountId, match_id: u64, key: &[u8; 32], token_id: &TokenId) {
        let mut character = self.character.get(token_id).expect("karakter durumu kayıtlı");
        require!(character.durability > 0, "durability exhausted");
        require!(character.locked_in.is_none(), "token locked in a match");
        character.durability -= 1;
        character.locked_in = Some(match_id);
        self.character.insert(token_id, &character);

        let mut state = self.player_state(player);
        require!(state.active_match.is_none(), "already in an active match");
        state.active_match = Some(match_id);
        self.players.insert(player, &state);
        self.active_keys.insert(player, key);
        // Leaderboard listesi (T-115, S-09).
        if !self.player_index.contains(player) {
            self.player_index.insert(player);
        }
        self.update_leaderboard(player, &state);
    }

    /// Bir tarafın join maliyetini geri alır (cancel / reveal-timeout).
    /// `refund_durability = false`: ceza yolu (reveal timeout'ta geciken taraf).
    /// Oyuncunun hiçbir geçmiş kaydı kalmadıysa `players`/`player_index` de silinir (S-03).
    fn release(&mut self, player: &AccountId, match_id: u64, token_id: &TokenId, refund_durability: bool) {
        let mut character = self.character.get(token_id).expect("karakter durumu kayıtlı");
        if refund_durability {
            character.durability = character.durability.saturating_add(1);
        }
        character.locked_in = None;
        self.character.insert(token_id, &character);
        self.active_keys.remove(player);

        let mut state = self.player_state(player);
        if state.active_match == Some(match_id) {
            state.active_match = None;
        }
        if state == PlayerState::default() {
            self.players.remove(player);
            self.player_index.remove(player);
            self.remove_from_leaderboard(player);
        } else {
            self.players.insert(player, &state);
        }
    }

    /// Maçı kazanan ile sonlandırır (T-112 `fire`/`use_item`, T-113 `claim_timeout`):
    /// token kilitleri açılır (durability iade edilmez), oyuncuların `active_match`i
    /// temizlenir, istatistikler yazılır, ödül treasury yeterliyse doğrudan transfer
    /// edilir, yetersizse `owed` olarak kaydedilir (DESIGN §4.7).
    pub(crate) fn finish_match(&mut self, m: &mut Match, winner: u8, storage_before: u64) {
        m.status = Status::Finished;
        m.winner = Some(winner);
        m.deadline_ms = 0;
        // T-116: bitmiş maçta büyük alanlar budanır, özet (skor, can, oyuncular, seq) kalır.
        m.log.clear();
        m.game.load.fixed.clear();
        let key = match_key(&m.players[0], &m.players[1], m.id);
        self.matches.insert(&key, m);

        for i in 0..2usize {
            let token_id = &m.tokens[i];
            if let Some(mut ch) = self.character.get(token_id) {
                if ch.locked_in == Some(m.id) {
                    ch.locked_in = None;
                    self.character.insert(token_id, &ch);
                }
            }

            let account = &m.players[i];
            self.active_keys.remove(account);
            let mut st = self.player_state(account);
            if st.active_match == Some(m.id) {
                st.active_match = None;
            }
            st.played += 1;
            if i == winner as usize {
                st.wins += 1;
            } else {
                st.losses += 1;
            }
            self.players.insert(account, &st);
            self.update_leaderboard(account, &st);
        }

        // Önce depolama farkını düş, sonra ödülü öde (S-02).
        self.settle_storage(storage_before);

        let reward = m.config.reward;
        if reward > NearToken::ZERO {
            let winner_account = &m.players[winner as usize];
            let payable_free = self.free_balance().saturating_sub(self.ops_balance);
            if self.treasury >= reward && payable_free >= reward {
                self.treasury = self.treasury.saturating_sub(reward);
                Promise::new(winner_account.clone()).transfer(reward).detach();
            } else {
                let mut st = self.player_state(winner_account);
                st.owed = st.owed.saturating_add(reward);
                self.players.insert(winner_account, &st);
            }
        }
    }

    /// `fire` ve `use_item` ortak sarmalayıcısı (T-112). Testlerde `src_override`
    /// ile `ScriptedSource` enjekte edilebilir; üretimde `None` (`ChainSource`).
    fn apply_game_action(
        &mut self,
        match_id: u64,
        src_override: Option<&mut dyn ShellSource>,
        step: impl FnOnce(&mut GameState, &Config, u8, &mut dyn ShellSource) -> Result<Vec<Action>, GameError>,
    ) -> Vec<Action> {
        require!(env::prepaid_gas() >= MIN_ACTION_GAS, "insufficient gas");
        require_direct_call();
        let storage_before = env::storage_usage();
        let player = env::predecessor_account_id();
        let (key, mut m) = self.resolve_match_for_player(&player, match_id);
        require!(m.status == Status::Active, "match is not active");
        let actor = participant_index(&m, &player) as u8;

        let actions = match src_override {
            Some(src) => step(&mut m.game, &m.config, actor, src),
            None => {
                let mut src = ChainSource::new(m.seed, &mut m.draw_nonce);
                step(&mut m.game, &m.config, actor, &mut src)
            }
        }
        .unwrap_or_else(|e| panic!("{e}"));

        let mut match_winner: Option<u8> = None;
        for action in &actions {
            if let Action::MatchEnded { winner, .. } = action {
                match_winner = Some(*winner);
            }
            push_action(&mut m, action.clone());
        }

        if let Some(winner) = match_winner {
            self.finish_match(&mut m, winner, storage_before);
        } else {
            m.deadline_ms = now_ms() + m.config.turn_ms;
            self.matches.insert(&key, &m);
            self.settle_storage(storage_before);
        }
        actions
    }

    #[cfg(test)]
    pub(crate) fn fire_with(
        &mut self,
        match_id: U64,
        target: Target,
        src: &mut dyn ShellSource,
    ) -> Vec<Action> {
        self.apply_game_action(match_id.0, Some(src), |game, cfg, actor, s| {
            game_fire(game, cfg, actor, target, s)
        })
    }

    #[cfg(test)]
    pub(crate) fn use_item_with(
        &mut self,
        match_id: U64,
        slot: u8,
        steal_slot: Option<u8>,
        src: &mut dyn ShellSource,
    ) -> Vec<Action> {
        self.apply_game_action(match_id.0, Some(src), |game, cfg, actor, s| {
            game_use_item(game, cfg, actor, slot, steal_slot, s)
        })
    }
}

#[near]
impl Contract {
    /// Maça katılım (DESIGN §4.4). `match_id` kuyruğun verdiği eşleşme kimliği;
    /// `opponent` iki tarafın da birbirini adlandırdığı rakip; `commit`
    /// `sha256(secret ‖ account ‖ match_id)` (T-107 `commitment`); `token_id`
    /// katılan karakter NFT'si.
    ///
    /// İlk join maç kaydını `Pending` kurar; beklenen rakip geldiğinde
    /// (`expects == predecessor` ve `a == opponent`) maç `Revealing` olur ve
    /// reveal süresi işler. Her iki join de durability −1 ve token kilidi uygular.
    pub fn join(&mut self, match_id: U64, opponent: AccountId, commit: Base64VecU8, token_id: TokenId) {
        require!(!self.paused, "contract is paused");
        require_direct_call();
        let storage_before = env::storage_usage();
        require!(opponent != env::predecessor_account_id(), "cannot join against yourself");
        require!(commit.0.len() == 32, "commit must be 32 bytes");
        let player = env::predecessor_account_id();
        let match_id = match_id.0;
        let commit: [u8; 32] = commit.0.try_into().expect("uzunluk yukarıda doğrulandı");
        // Token katılana ait olmalı (DESIGN §4.4: "token_id sahibi predecessor").
        require!(
            self.tokens.owner_by_id.get(&token_id) == Some(player.clone()),
            "not token owner"
        );

        let key = match_key(&player, &opponent, match_id);
        match self.matches.get(&key) {
            None => {
                require!(
                    self.treasury >= self.config.min_treasury,
                    "treasury below minimum"
                );
                let m = Match {
                    id: match_id,
                    status: Status::Pending,
                    players: [player.clone(), opponent.clone()],
                    tokens: [token_id.clone(), String::new()],
                    commits: [commit, [0u8; 32]],
                    secrets: [None, None],
                    seed: [0u8; 32],
                    draw_nonce: 0,
                    game: GameState::default(),
                    reveal_deadline_ms: 0,
                    deadline_ms: 0,
                    winner: None,
                    seq: 0,
                    log: Vec::new(),
                    config: self.config.clone(),
                };
                self.lock_in(&player, match_id, &key, &token_id);
                self.matches.insert(&key, &m);
                self.match_id_index.insert(&match_id, &key);
            }
            Some(mut m) => {
                require!(m.status == Status::Pending, "match already taken");
                require!(m.players[1] == player, "opponent mismatch");
                require!(m.players[0] == opponent, "opponent mismatch");
                m.tokens[1] = token_id.clone();
                m.commits[1] = commit;
                m.status = Status::Revealing;
                m.reveal_deadline_ms = now_ms() + m.config.reveal_ms;
                self.lock_in(&player, match_id, &key, &token_id);
                self.matches.insert(&key, &m);
                self.match_id_index.insert(&match_id, &key);
            }
        }
        self.settle_storage(storage_before);
    }

    /// Yalnızca `Pending` maçta ilk katılan iptal edebilir (DESIGN §4.4):
    /// durability iade, kilit açılır, maç kaydı silinir (S-03).
    pub fn cancel(&mut self, match_id: U64) {
        require_direct_call();
        let storage_before = env::storage_usage();
        let player = env::predecessor_account_id();
        let (key, m) = self.resolve_match_for_player(&player, match_id.0);
        require!(m.status == Status::Pending, "match is not pending");
        require!(m.players[0] == player, "only the first participant can cancel");
        self.release(&m.players[0], m.id, &m.tokens[0], true);
        self.matches.remove(&key);
        if self.match_id_index.get(&m.id) == Some(key) {
            self.match_id_index.remove(&m.id);
        }
        self.settle_storage(storage_before);
    }

    /// Commit-reveal açılımı (DESIGN §4.4/§4.6, T-111): `sha256(secret ‖
    /// account ‖ match_id) == commit` doğrulanır. İkinci reveal'da
    /// `match_seed = sha256(secret_A ‖ secret_B ‖ random_seed ‖ match_id)`
    /// sabitlenir; ilk sıra `seed[0] & 1`, R1 yüklemesi `ChainSource` ile
    /// kurulur (`load_size` = 8, `min_live..=max_live` aralığında dolu), maç
    /// `Active` olur, hamle süresi işler ve `LoadStarted` aksiyonu loglanır.
    pub fn reveal(&mut self, match_id: U64, secret: Base64VecU8) {
        require!(env::prepaid_gas() >= MIN_ACTION_GAS, "insufficient gas");
        require_direct_call();
        let storage_before = env::storage_usage();
        require!(secret.0.len() == 32, "secret must be 32 bytes");
        let player = env::predecessor_account_id();
        let (key, mut m) = self.resolve_match_for_player(&player, match_id.0);
        require!(m.status == Status::Revealing, "match is not revealing");
        let idx = participant_index(&m, &player);
        require!(m.secrets[idx].is_none(), "already revealed");
        let secret: [u8; 32] = secret.0.try_into().expect("uzunluk yukarıda doğrulandı");
        require!(
            commitment(secret, &player, m.id) == m.commits[idx],
            "commit mismatch"
        );
        m.secrets[idx] = Some(secret);

        if m.secrets.iter().all(|s| s.is_some()) {
            // İkinci reveal: tohum, ilk sıra ve R1 yüklemesi (DESIGN §4.4).
            let mut buf = Vec::with_capacity(32 * 2 + 32 + 8);
            buf.extend_from_slice(&m.secrets[0].expect("yukarıda denetlendi"));
            buf.extend_from_slice(&m.secrets[1].expect("yukarıda denetlendi"));
            buf.extend_from_slice(&env::random_seed_array());
            buf.extend_from_slice(&m.id.to_le_bytes());
            m.seed = env::sha256_array(&buf);

            let rc = m.config.rounds[0].clone();
            m.game = GameState {
                round: 1,
                score: [0, 0],
                hp: [rc.start_hp, rc.start_hp],
                max_hp: rc.start_hp,
                heal_cut: [false, false],
                items: [Vec::new(), Vec::new()],
                load: crate::game::Load::new(0, 0),
                turn: m.seed[0] & 1,
                shackled: None,
                shackle_broke_this_turn: false,
                saw_active: false,
                deck_counts: crate::game::new_deck(m.config.copies_per_item),
            };
            let dealt_actions = {
                let mut src = ChainSource::new(m.seed, &mut m.draw_nonce);
                m.game.load = new_load(&m.config, &mut src);
                crate::game::deal_items(&mut m.game, &m.config, &mut src)
            };
            m.status = Status::Active;
            m.deadline_ms = now_ms() + m.config.turn_ms;
            let action = Action::LoadStarted {
                live: m.game.load.announced_live,
                blank: m.game.load.announced_blank,
                total: m.game.load.remaining,
            };
            push_action(&mut m, action);
            for dealt in dealt_actions {
                push_action(&mut m, dealt);
            }
        }
        self.matches.insert(&key, &m);
        self.settle_storage(storage_before);
    }

    /// Sırası gelen oyuncunun ateş hamlesi (T-112, DESIGN §4.7).
    /// `ChainSource` ile anlık fişek çekilir (lazy draw); aksiyonlar loga ve
    /// NEP-297 olaylarına yazılır, `deadline_ms` yenilenir; maç biterse ödül
    /// transfer edilir (treasury yetersizse `owed`), kilitler açılır.
    pub fn fire(&mut self, match_id: U64, target: Target) -> Vec<Action> {
        require!(env::prepaid_gas() >= MIN_ACTION_GAS, "insufficient gas");
        self.apply_game_action(match_id.0, None, |game, cfg, actor, src| {
            game_fire(game, cfg, actor, target, src)
        })
    }

    /// Sırası gelen oyuncunun eşya kullanımı (T-112, DESIGN §4.7).
    /// `steal_slot` yalnızca `Lockpick` için gereklidir.
    pub fn use_item(&mut self, match_id: U64, slot: u8, steal_slot: Option<u8>) -> Vec<Action> {
        require!(env::prepaid_gas() >= MIN_ACTION_GAS, "insufficient gas");
        self.apply_game_action(match_id.0, None, |game, cfg, actor, src| {
            game_use_item(game, cfg, actor, slot, steal_slot, src)
        })
    }

    /// İki aşamalı zaman aşımı talebi (T-113, DESIGN §4.4):
    /// - `Revealing`: `reveal_deadline_ms` geçtikten sonra açmayan tarafa karşı
    ///   maç iptal edilir; zamanında açan tarafın durability'si iade edilir,
    ///   açmayan ceza olarak iade alamaz; ödül ödenmez.
    /// - `Active`: sıra sahibinin `deadline_ms`i geçtikten sonra diğer oyuncu
    ///   çağırır → çağıran kazanır, istatistikler yazılır ve ödül ödenir.
    pub fn claim_timeout(&mut self, match_id: U64) -> Vec<Action> {
        require_direct_call();
        let storage_before = env::storage_usage();
        let caller = env::predecessor_account_id();
        let (key, mut m) = self.resolve_match_for_player(&caller, match_id.0);
        let caller_idx = participant_index(&m, &caller);
        let now = now_ms();
        let mut produced = Vec::new();

        match m.status {
            Status::Revealing => {
                require!(now >= m.reveal_deadline_ms, "reveal timeout not reached");
                let other_idx = 1 - caller_idx;
                // Sadece kendisi açmamışken rakibini cezalandıramaz; ikisi de
                // açmadıysa kilitleri çözmek için çağrıya izin verilir (iadesiz).
                require!(
                    m.secrets[caller_idx].is_some() || m.secrets[other_idx].is_none(),
                    "caller did not reveal"
                );
                for i in 0..2usize {
                    let refund = m.secrets[i].is_some();
                    let acc = m.players[i].clone();
                    let tok = m.tokens[i].clone();
                    self.release(&acc, m.id, &tok, refund);
                }
                self.matches.remove(&key);
                if self.match_id_index.get(&m.id) == Some(key) {
                    self.match_id_index.remove(&m.id);
                }
                let action = Action::TimeoutClaimed { by: caller_idx as u8 };
                crate::events::log_action(&action);
                produced.push(action);
                self.settle_storage(storage_before);
            }
            Status::Active => {
                let by = caller_idx as u8;
                require!(by != m.game.turn, "cannot claim timeout on your own turn");
                require!(
                    now >= m.deadline_ms.saturating_add(TIMEOUT_GRACE_MS),
                    "turn timeout not reached"
                );
                let timeout_action = Action::TimeoutClaimed { by };
                let end_action = Action::MatchEnded {
                    winner: by,
                    reward: m.config.reward.as_yoctonear().into(),
                };
                push_action(&mut m, timeout_action.clone());
                push_action(&mut m, end_action.clone());
                produced.push(timeout_action);
                produced.push(end_action);
                self.finish_match(&mut m, by, storage_before);
            }
            _ => panic!("match cannot be timed out in current status"),
        }

        produced
    }

    /// Treasury veya serbest bakiye yetersizken `owed` olarak birikmiş ödülü çeker (T-113, S-02).
    pub fn claim_reward(&mut self) -> NearToken {
        require_direct_call();
        let player = env::predecessor_account_id();
        let mut st = self.player_state(&player);
        require!(st.owed > NearToken::ZERO, "no reward owed");
        let payable_free = self.free_balance().saturating_sub(self.ops_balance);
        let claimable = st.owed.min(self.treasury).min(payable_free);
        require!(claimable > NearToken::ZERO, "insufficient treasury");
        st.owed = st.owed.saturating_sub(claimable);
        self.treasury = self.treasury.saturating_sub(claimable);
        self.players.insert(&player, &st);
        Promise::new(player).transfer(claimable).detach();
        claimable
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nft::Kind;
    use crate::Config;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{AccountId, NearToken};

    /// signer == predecessor: function-call key akışını taklit eder (depolamayı korur).
    fn switch(account: &str, attached: NearToken) {
        let ctx = VMContextBuilder::new()
            .signer_account_id(account.parse().unwrap())
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(attached)
            .storage_usage(env::storage_usage())
            .build();
        near_sdk::testing_env!(ctx);
    }

    fn owner_ctx() {
        let ctx = VMContextBuilder::new()
            .signer_account_id("owner.testnet".parse().unwrap())
            .predecessor_account_id("owner.testnet".parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);
    }

    fn owner_ctx_at(ts_ms: u64) {
        let ctx = VMContextBuilder::new()
            .signer_account_id("owner.testnet".parse().unwrap())
            .predecessor_account_id("owner.testnet".parse().unwrap())
            .block_timestamp(ts_ms * 1_000_000)
            .build();
        near_sdk::testing_env!(ctx);
    }

    fn setup() -> Contract {
        owner_ctx();
        let mut c = Contract::new("owner.testnet".parse().unwrap(), Config::default());
        c.treasury = NearToken::from_near(10); // ödül ödemesi için fon
        for (who, kind) in [
            ("alice.testnet", Kind::Kuleci),
            ("bob.testnet", Kind::Ayarci),
        ] {
            switch(who, NearToken::from_near(1));
            c.buy_character(kind);
        }
        switch("alice.testnet", NearToken::ZERO);
        c
    }

    fn alice_token(_c: &Contract) -> TokenId {
        "kuleci:1".to_string()
    }

    fn bob_token(_c: &Contract) -> TokenId {
        "ayarci:2".to_string()
    }

    fn commitment_bytes(tag: u8) -> Base64VecU8 {
        Base64VecU8([tag; 32].to_vec())
    }

    /// T-110: tek join → Pending; kayıtlar doğru.
    #[test]
    fn single_join_creates_pending() {
        let mut c = setup();
        let (id, opp, token) = (U64(7), "bob.testnet".parse().unwrap(), alice_token(&c));
        c.join(id, opp, commitment_bytes(1), token);
        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Pending);
        assert_eq!(m.players[0], "alice.testnet".parse::<AccountId>().unwrap());
        assert_eq!(m.players[1], "bob.testnet".parse::<AccountId>().unwrap());
        assert_eq!(m.commits[0], [1u8; 32]);
        assert_eq!(m.tokens[0], "kuleci:1");
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().durability, 9);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, Some(7));
        assert_eq!(c.player_state(&"alice.testnet".parse().unwrap()).active_match, Some(7));
        // Bob henüz dokunulmadı.
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().durability, 10);
        assert_eq!(c.player_state(&"bob.testnet".parse().unwrap()).active_match, None);
        c.assert_solvent();
    }

    /// T-110: karşılıklı join → Revealing; süre işler.
    #[test]
    fn mutual_join_moves_to_revealing() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(2), bob_token(&c));
        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Revealing);
        assert_eq!(m.reveal_deadline_ms, now_ms() + 60_000);
        assert_eq!(m.commits[1], [2u8; 32]);
        assert_eq!(m.tokens[1], "ayarci:2");
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().durability, 9);
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().locked_in, Some(7));
        assert_eq!(c.player_state(&"bob.testnet".parse().unwrap()).active_match, Some(7));
        c.assert_solvent();
    }

    /// T-110: Revealing durumundaki çifte tekrar join çağrılamaz.
    #[test]
    #[should_panic(expected = "match already taken")]
    fn third_account_cannot_join_taken_match() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(2), bob_token(&c));
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(3), bob_token(&c));
    }

    /// T-110: aynı başlatan kendi bekleyen maçına ikinci kez rakip olarak giremez.
    #[test]
    #[should_panic(expected = "opponent mismatch")]
    fn opponent_mismatch_rejected() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        c.join(
            U64(7),
            "bob.testnet".parse().unwrap(),
            commitment_bytes(2),
            alice_token(&c),
        );
    }

    /// FIX-05 (S-04): yabancı hesabın aynı `match_id` ile ön-katılımı çiftin maçını engellemez/kapatamaz.
    #[test]
    fn uninvited_account_cannot_join_pending() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        // Charlie aynı match_id=7 ile Alice veya Dave'i hedefleyerek kendi anahtarında Pending açar;
        // bu durum (alice, bob, 7) maçını etkilemez.
        switch("charlie.testnet", NearToken::from_near(1));
        c.buy_character(Kind::Kacak);
        c.join(
            U64(7),
            "alice.testnet".parse().unwrap(),
            commitment_bytes(3),
            "kacak:3".to_string(),
        );
        // Bob çiftin maçına normal şekilde katılır.
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(2), bob_token(&c));
        let ab = c
            .get_match(
                U64(7),
                Some(["alice.testnet".parse().unwrap(), "bob.testnet".parse().unwrap()]),
            )
            .unwrap();
        assert_eq!(ab.status, Status::Revealing);
        assert_eq!(ab.players, ["alice.testnet", "bob.testnet"]);
        c.assert_solvent();
    }

    /// T-110: durability 0 karakterle join red; hiçbir şey yazılmaz.
    #[test]
    #[should_panic(expected = "durability exhausted")]
    fn zero_durability_cannot_join() {
        let mut c = setup();
        let token = alice_token(&c);
        let mut state = c.character_state(&token).unwrap();
        state.durability = 0;
        c.character.insert(&token, &state);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), token);
    }

    /// T-110: başkasının token'ı ile join red.
    #[test]
    #[should_panic(expected = "not token owner")]
    fn foreign_token_rejected() {
        let mut c = setup();
        // Alice bağlamında (setup'tan kalan) Bob'un token'ı — sahiplik Alice'te değil.
        let bob = bob_token(&c);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), bob);
    }

    /// T-110: aynı oyuncu iki maça aynı anda giremez (token kilidi değil,
    /// oyuncu kontrolü): DESIGN §4.4 sırası durability → token kilidi →
    /// aktif maç; ikisinden ayırmak için ikinci karakterle denenir.
    #[test]
    #[should_panic(expected = "already in an active match")]
    fn same_player_cannot_join_two_matches() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        // İkinci bir karakter alınır; token kilidi bu yolda tetiklenmez.
        switch("alice.testnet", NearToken::from_near(1));
        let second = c.buy_character(Kind::Kacak);
        c.join(U64(8), "carol.testnet".parse().unwrap(), commitment_bytes(1), second);
    }

    /// T-110: kilitli token ikinci maça sokulamaz.
    #[test]
    #[should_panic(expected = "token locked in a match")]
    fn locked_token_cannot_join_another_match() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        // aynı token, başka maç — active_match kontrolünden önce değil ama
        // lock_in sırası: durability → lock. active_match ilk patlamasın
        // diye farklı hesapla deniyoruz olmaz; burada kilit yolu.
        // Alice zaten aktif maçta; bu test için state'i elle ayırıyoruz:
        let alice = "alice.testnet".parse::<AccountId>().unwrap();
        let mut st = c.player_state(&alice);
        st.active_match = None;
        c.players.insert(&alice, &st);
        c.join(U64(8), "carol.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
    }

    /// T-110 + FIX-05 + FIX-03-R: cancel iade eder (durability + kilit + active_match),
    /// maçı siler, depolamayı ve treasury'yi başlangıca döndürür.
    #[test]
    fn cancel_refunds_and_unlocks() {
        let mut c = setup();
        let storage_before = env::storage_usage();
        let treasury_before = c.treasury;
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        assert!(env::storage_usage() > storage_before);
        assert!(c.treasury < treasury_before);
        c.cancel(U64(7));
        assert!(c.get_match(U64(7), None).is_none());
        assert_eq!(env::storage_usage(), storage_before);
        assert_eq!(c.treasury, treasury_before);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().durability, 10);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, None);
        assert_eq!(c.player_state(&"alice.testnet".parse::<AccountId>().unwrap()).active_match, None);
        c.assert_solvent();
    }

    /// T-110: Revealing'de cancel red.
    #[test]
    #[should_panic(expected = "match is not pending")]
    fn cancel_rejected_in_revealing() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(2), bob_token(&c));
        switch("alice.testnet", NearToken::ZERO);
        c.cancel(U64(7));
    }

    /// T-110: sadece ilk katılan iptal edebilir.
    #[test]
    #[should_panic(expected = "only the first participant can cancel")]
    fn only_first_participant_cancels() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.cancel(U64(7));
    }

    /// T-110: kontrat-üzerinden-çağrı reddi (predecessor != signer).
    #[test]
    #[should_panic(expected = "contract call rejected")]
    fn contract_mediated_call_rejected() {
        let mut c = setup();
        let ctx = VMContextBuilder::new()
            .signer_account_id("alice.testnet".parse().unwrap())
            .predecessor_account_id("contract.testnet".parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
    }

    /// T-110: pause'dayken join yok.
    #[test]
    #[should_panic(expected = "contract is paused")]
    fn paused_contract_rejects_join() {
        let mut c = setup();
        owner_ctx();
        c.pause();
        switch("alice.testnet", NearToken::ZERO);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
    }

    /// T-110: olmayan maç iptal edilemez; kendine karşı join olmaz.
    #[test]
    #[should_panic(expected = "no such match")]
    fn cancel_missing_match_panics() {
        let mut c = setup();
        c.cancel(U64(99));
    }

    #[test]
    #[should_panic(expected = "cannot join against yourself")]
    fn cannot_join_against_yourself() {
        let mut c = setup();
        let alice = "alice.testnet".parse().unwrap();
        c.join(U64(7), alice, commitment_bytes(1), alice_token(&c));
    }

    // ------------------------------------------------------------------
    // T-111: reveal ve maç başlangıcı
    // ------------------------------------------------------------------

    use crate::rng;

    fn real_commit(tag: u8, account: &str, match_id: u64) -> Base64VecU8 {
        Base64VecU8(
            rng::commitment([tag; 32], &account.parse().unwrap(), match_id).to_vec(),
        )
    }

    /// Gerçek taahhütlerle Revealing aşamasında maç kurar (alice:1, bob:2).
    fn setup_revealing() -> Contract {
        let mut c = setup();
        let commit_a = real_commit(1, "alice.testnet", 7);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commit_a, alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        let commit_b = real_commit(2, "bob.testnet", 7);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commit_b, bob_token(&c));
        switch("alice.testnet", NearToken::ZERO);
        c
    }

    fn secret_of(tag: u8) -> Base64VecU8 {
        Base64VecU8([tag; 32].to_vec())
    }

    /// T-111: yanlış secret → commit uyuşmazlığı red.
    #[test]
    #[should_panic(expected = "commit mismatch")]
    fn reveal_with_wrong_secret_rejected() {
        let mut c = setup_revealing();
        c.reveal(U64(7), secret_of(9));
    }

    /// T-111: tekrar reveal red.
    #[test]
    #[should_panic(expected = "already revealed")]
    fn reveal_twice_rejected() {
        let mut c = setup_revealing();
        c.reveal(U64(7), secret_of(1));
        c.reveal(U64(7), secret_of(1));
    }

    /// T-111: maça katılmayan reveal çağıramaz.
    #[test]
    #[should_panic(expected = "not a participant")]
    fn reveal_by_non_participant_rejected() {
        let mut c = setup_revealing();
        switch("charlie.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(3));
    }

    /// T-111: 32 bayt olmayan secret reddedilir.
    #[test]
    #[should_panic(expected = "secret must be 32 bytes")]
    fn reveal_rejects_bad_secret_length() {
        let mut c = setup_revealing();
        c.reveal(U64(7), Base64VecU8(vec![1u8; 31]));
    }

    /// T-111: Pending maçta reveal çağrılamaz.
    #[test]
    #[should_panic(expected = "match is not revealing")]
    fn reveal_rejected_in_pending() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 7), alice_token(&c));
        c.reveal(U64(7), secret_of(1));
    }

    /// T-111: iki reveal → Active; hp = R1 canı, ilk sıra seed'den,
    /// R1 yüklemesi sınırlarda, LoadStarted + ItemsDealt logda ve NEP-297 olayında, süre işler.
    #[test]
    fn both_reveals_activate_match() {
        let mut c = setup_revealing();
        c.reveal(U64(7), secret_of(1));
        switch("bob.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(2));

        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Active);
        assert_eq!(m.game.hp, [4, 4]);
        assert_eq!(m.game.max_hp, 4);
        assert_eq!(m.game.round, 1);
        assert_eq!(m.game.turn, m.seed[0] & 1);
        assert_eq!(m.game.items[0].len(), 4);
        assert_eq!(m.game.items[1].len(), 4);
        let load = &m.game.load;
        assert_eq!(load.remaining, 8);
        assert!((2..=6).contains(&load.announced_live));
        assert_eq!(load.announced_blank, 8 - load.announced_live);
        assert!(load.fixed.iter().all(|s| s.is_none()), "hiçbir konum çekilmemiş olmalı");
        assert_ne!(m.seed, [0u8; 32]);
        assert_eq!(m.deadline_ms, now_ms() + 45_000);
        assert_eq!(m.seq, 3);
        assert_eq!(m.log.len(), 3);
        assert_eq!(
            m.log[0],
            Action::LoadStarted {
                live: load.announced_live,
                blank: load.announced_blank,
                total: load.remaining,
            }
        );
        assert!(matches!(m.log[1], Action::ItemsDealt { player: 0, .. }));
        assert!(matches!(m.log[2], Action::ItemsDealt { player: 1, .. }));
        let logs = near_sdk::test_utils::get_logs();
        assert_eq!(logs.len(), 3);
        assert!(logs[0].starts_with("EVENT_JSON:"));
        assert!(logs[0].contains("\"event\":\"load_started\""));
        assert!(logs[1].contains("\"event\":\"items_dealt\""));
        assert!(logs[2].contains("\"event\":\"items_dealt\""));
        c.assert_solvent();
    }

    /// T-111: ikinci oyuncu (Bob) önce reveal edebilir; simetrik çalışır.
    #[test]
    fn second_player_can_reveal_first() {
        let mut c = setup_revealing();
        switch("bob.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(2));
        assert_eq!(c.match_or_panic(7).status, Status::Revealing);
        switch("alice.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(1));
        assert_eq!(c.match_or_panic(7).status, Status::Active);
    }

    /// T-111: tek reveal yalnızca sırrı açar; maç Revealing kalır.
    #[test]
    fn single_reveal_keeps_match_revealing() {
        let mut c = setup_revealing();
        c.reveal(U64(7), secret_of(1));
        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Revealing);
        assert_eq!(m.secrets[0], Some([1u8; 32]));
        assert_eq!(m.seq, 0);
        assert!(m.log.is_empty());
    }

    // ------------------------------------------------------------------
    // T-112: fire / use_item kontrat metodları
    // ------------------------------------------------------------------

    use crate::game::{Item, ItemResult, Load, ScriptedSource, Shell};
    use near_sdk::test_utils::{get_created_receipts, get_logs};

    fn switch_at(account: &str, attached: NearToken, ts_ms: u64) {
        let ctx = VMContextBuilder::new()
            .signer_account_id(account.parse().unwrap())
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(attached)
            .block_timestamp(ts_ms * 1_000_000)
            .storage_usage(env::storage_usage())
            .build();
        near_sdk::testing_env!(ctx);
    }

    /// Revealing'i tamamlayıp Active maç döndürür (başlangıç zamanı `ts_ms = 1_000`).
    fn setup_active() -> Contract {
        owner_ctx_at(1_000);
        let mut c = Contract::new("owner.testnet".parse().unwrap(), Config::default());
        c.treasury = NearToken::from_near(10);
        for (who, kind) in [("alice.testnet", Kind::Kuleci), ("bob.testnet", Kind::Ayarci)] {
            switch_at(who, NearToken::from_near(1), 1_000);
            c.buy_character(kind);
        }
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 7), alice_token(&c));
        switch_at("bob.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "alice.testnet".parse().unwrap(), real_commit(2, "bob.testnet", 7), bob_token(&c));
        c.reveal(U64(7), secret_of(2));
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c.reveal(U64(7), secret_of(1));
        c
    }

    /// T-112 bitti kuralı: ScriptedSource ile senaryolu tam maç → ödül
    /// kazanan hesabına transfer edilir, treasury düşer, token kilitleri
    /// ve active_match temizlenir, istatistikler yazılır.
    #[test]
    fn full_scripted_match_pays_winner_and_unlocks() {
        let mut c = setup_active();
        let treasury_before = c.treasury;
        // R1 yükünü, canı, desteyi ve ilk sırayı senaryoya göre sabitle (deterministik).
        let mut m = c.match_or_panic(7);
        m.game.hp = [2, 2];
        m.game.load = Load::new(2, 2);
        m.game.turn = 0;
        m.game.deck_counts = [4; 9];
        c.save_match(&m);
        let storage_before = env::storage_usage();

        // Fişek sırası:
        // R1: Live (A->B), Blank (B->B), Blank (B->A), Live (A->B, R1 biter)
        // R2 yük1 (8 gözlü, roll=1 -> 3 live / 5 blank):
        //   Blank (B->A), Live (A Loupe + Hacksaw + A->B 2dmg), Blank (B Pipe + B->A),
        //   Live (A->B 1dmg), Blank (B->A), Live (A Hacksaw + A->B 2dmg -> R2 biter!)
        let shells = vec![
            Shell::Live, Shell::Blank, Shell::Blank, Shell::Live,
            Shell::Blank, Shell::Live, Shell::Blank, Shell::Live, Shell::Blank, Shell::Live,
        ];
        // Rolls (ortak [4; 9] deste iadesiz çekim sırası):
        // R2 yük1: new_load(roll=1 -> 3 live, 5 blank) + deal_items(
        //   A: [Hacksaw(16), Loupe(0), Hacksaw(15), Pipe(3)],
        //   B: [Pipe(3), Flask(5), Loupe(0), Shackle(7)])
        let rolls = vec![
            1, 16, 0, 15, 3, 3, 5, 0, 7,
        ];
        let mut src = ScriptedSource::with_rolls(shells, rolls);

        // R1
        switch_at("alice.testnet", NearToken::ZERO, 2_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        switch_at("bob.testnet", NearToken::ZERO, 3_000);
        c.fire_with(U64(7), Target::SelfTarget, &mut src);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        switch_at("alice.testnet", NearToken::ZERO, 4_000);
        let r1_end = c.fire_with(U64(7), Target::Opponent, &mut src);
        assert!(r1_end.iter().any(|a| matches!(a, Action::RoundEnded { winner: 0, score: [1, 0] })));

        // R2 yük1: kaybeden (Bob) başlar, 4 HP ve 4'er eşyayla.
        switch_at("bob.testnet", NearToken::ZERO, 5_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        assert_eq!(c.match_or_panic(7).deadline_ms, 5_000 + 45_000);

        switch_at("alice.testnet", NearToken::ZERO, 6_000);
        let loupe_res = c.use_item_with(U64(7), 1, None, &mut src);
        assert_eq!(
            loupe_res,
            vec![Action::ItemUsed {
                player: 0,
                item: Item::Loupe,
                slot: 1,
                result: ItemResult::Private { pos: 0, shell: Shell::Live },
            }]
        );
        assert_eq!(c.match_or_panic(7).deadline_ms, 6_000 + 45_000);
        c.use_item_with(U64(7), 0, None, &mut src); // Hacksaw
        c.fire_with(U64(7), Target::Opponent, &mut src); // 2 hasar (Bob 2 HP)

        switch_at("bob.testnet", NearToken::ZERO, 7_000);
        c.use_item_with(U64(7), 0, None, &mut src); // Pipe (+1 -> 3 HP)
        c.fire_with(U64(7), Target::Opponent, &mut src); // Blank

        switch_at("alice.testnet", NearToken::ZERO, 8_000);
        c.fire_with(U64(7), Target::Opponent, &mut src); // Live (Bob 2 HP)

        switch_at("bob.testnet", NearToken::ZERO, 9_000);
        c.fire_with(U64(7), Target::Opponent, &mut src); // Blank

        switch_at("alice.testnet", NearToken::ZERO, 10_000);
        c.use_item_with(U64(7), 0, None, &mut src); // Hacksaw
        let end_actions = c.fire_with(U64(7), Target::Opponent, &mut src); // 2 hasar -> 0 HP!
        assert!(end_actions.iter().any(|a| matches!(a, Action::MatchEnded { winner: 0, .. })));

        // Maç sonu durumu, ödül, kilitler ve istatistikler.
        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Finished);
        assert_eq!(m.winner, Some(0));
        assert_eq!(m.deadline_ms, 0);
        let storage_after = env::storage_usage();
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let expected_treasury = if storage_after >= storage_before {
            treasury_before
                .saturating_sub(NearToken::from_yoctonear((storage_after - storage_before) as u128 * byte_cost))
                .saturating_sub(NearToken::from_millinear(100))
        } else {
            treasury_before
                .saturating_add(NearToken::from_yoctonear((storage_before - storage_after) as u128 * byte_cost))
                .saturating_sub(NearToken::from_millinear(100))
        };
        assert_eq!(c.treasury, expected_treasury);
        c.assert_solvent();

        let alice_st = c.player_state(&"alice.testnet".parse().unwrap());
        let bob_st = c.player_state(&"bob.testnet".parse().unwrap());
        assert_eq!(alice_st, PlayerState { active_match: None, wins: 1, losses: 0, played: 1, owed: NearToken::ZERO });
        assert_eq!(bob_st, PlayerState { active_match: None, wins: 0, losses: 1, played: 1, owed: NearToken::ZERO });

        let alice_ch = c.character_state(&"kuleci:1".to_string()).unwrap();
        let bob_ch = c.character_state(&"ayarci:2".to_string()).unwrap();
        assert_eq!(alice_ch.locked_in, None);
        assert_eq!(bob_ch.locked_in, None);
        assert_eq!(alice_ch.durability, 9);
        assert_eq!(bob_ch.durability, 9);

        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id, "alice.testnet".parse::<AccountId>().unwrap());
        assert!(receipts[0].actions.iter().any(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } =>
                *deposit == NearToken::from_millinear(100),
            _ => false,
        }));
        c.assert_solvent();
    }

    /// T-112: treasury yetersizse maç yine biter, ödül `owed` olarak yazılır
    /// ve transfer receipt'i oluşturulmaz.
    #[test]
    fn insufficient_treasury_credits_owed() {
        let mut c = setup_active();
        c.treasury = NearToken::from_millinear(50); // < 100 mNEAR ödül
        let mut m = c.match_or_panic(7);
        m.game.score = [1, 0];
        m.game.hp = [2, 1];
        m.game.load = Load::new(1, 1);
        m.game.turn = 0;
        c.save_match(&m);

        let storage_before = env::storage_usage();
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        switch_at("alice.testnet", NearToken::ZERO, 2_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        let freed = storage_before.saturating_sub(env::storage_usage()) as u128;
        let refund = NearToken::from_yoctonear(freed * env::storage_byte_cost().as_yoctonear());

        assert_eq!(c.match_or_panic(7).status, Status::Finished);
        assert_eq!(c.treasury, NearToken::from_millinear(50).saturating_add(refund));
        assert!(get_created_receipts().is_empty());
        let alice_st = c.player_state(&"alice.testnet".parse().unwrap());
        assert_eq!(alice_st.wins, 1);
        assert_eq!(alice_st.owed, NearToken::from_millinear(100));
        assert_eq!(alice_st.active_match, None);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, None);
        c.assert_solvent();
    }

    /// T-112: public `fire` ChainSource kullanır, `draw_nonce`, `seq`, `log`,
    /// NEP-297 olayları ve `deadline_ms` güncellenir.
    #[test]
    fn public_fire_uses_chain_source_and_updates_log() {
        let mut c = setup_active();
        let m_before = c.match_or_panic(7);
        let turn_acc = m_before.players[m_before.game.turn as usize].to_string();
        let nonce_before = m_before.draw_nonce;
        let seq_before = m_before.seq;

        switch_at(&turn_acc, NearToken::ZERO, 5_000);
        let actions = c.fire(U64(7), Target::Opponent);
        assert!(!actions.is_empty());

        let m_after = c.match_or_panic(7);
        assert_eq!(m_after.draw_nonce, nonce_before + 1);
        assert_eq!(m_after.seq, seq_before + actions.len() as u64);
        assert_eq!(m_after.deadline_ms, 5_000 + 45_000);
        assert_eq!(&m_after.log[m_after.log.len() - actions.len()..], actions.as_slice());

        let logs = get_logs();
        assert_eq!(logs.len(), actions.len());
        assert!(logs[0].starts_with("EVENT_JSON:"));
        c.assert_solvent();
    }

    /// T-112: log uzunluğu LOG_CAP (32) sınırında budanır; `seq` monotoon artar.
    #[test]
    fn action_log_caps_at_32_entries() {
        let c = setup_active();
        let mut m = c.match_or_panic(7);
        let initial_seq = m.seq;
        for _ in 0..40 {
            push_action(&mut m, Action::HealCut { player: 0 });
        }
        assert_eq!(m.seq, initial_seq + 40);
        assert_eq!(m.log.len(), LOG_CAP);
    }

    /// T-112: yanlış sıra, katılımcı olmayan ve Active dışı durumlar reddedilir.
    #[test]
    #[should_panic(expected = "not your turn")]
    fn public_fire_rejects_wrong_turn() {
        let mut c = setup_active();
        let turn = c.match_or_panic(7).game.turn as usize;
        let other = c.match_or_panic(7).players[1 - turn].to_string();
        switch_at(&other, NearToken::ZERO, 2_000);
        c.fire(U64(7), Target::Opponent);
    }

    #[test]
    #[should_panic(expected = "not a participant")]
    fn public_use_item_rejects_outsider() {
        let mut c = setup_active();
        switch_at("charlie.testnet", NearToken::ZERO, 2_000);
        c.use_item(U64(7), 0, None);
    }

    #[test]
    #[should_panic(expected = "match is not active")]
    fn public_fire_rejects_non_active_match() {
        let mut c = setup_revealing();
        c.fire(U64(7), Target::Opponent);
    }

    #[test]
    #[should_panic(expected = "contract call rejected")]
    fn public_fire_rejects_contract_mediated_call() {
        let mut c = setup_active();
        let turn_acc = c.match_or_panic(7).players[c.match_or_panic(7).game.turn as usize].clone();
        let ctx = VMContextBuilder::new()
            .signer_account_id(turn_acc)
            .predecessor_account_id("evil.testnet".parse().unwrap())
            .build();
        near_sdk::testing_env!(ctx);
        c.fire(U64(7), Target::Opponent);
    }

    // ------------------------------------------------------------------
    // T-113: claim_timeout + claim_reward
    // ------------------------------------------------------------------

    /// Revealing aşamasında t = 1_000'de kurulmuş maç (`reveal_deadline_ms = 61_000`).
    fn setup_revealing_at_1000() -> Contract {
        owner_ctx_at(1_000);
        let mut c = Contract::new("owner.testnet".parse().unwrap(), Config::default());
        c.treasury = NearToken::from_near(10);
        for (who, kind) in [("alice.testnet", Kind::Kuleci), ("bob.testnet", Kind::Ayarci)] {
            switch_at(who, NearToken::from_near(1), 1_000);
            c.buy_character(kind);
        }
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 7), alice_token(&c));
        switch_at("bob.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "alice.testnet".parse().unwrap(), real_commit(2, "bob.testnet", 7), bob_token(&c));
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c
    }

    /// T-113 bitti kuralı: süre dolmadan reveal timeout red.
    #[test]
    #[should_panic(expected = "reveal timeout not reached")]
    fn reveal_timeout_rejected_before_deadline() {
        let mut c = setup_revealing_at_1000();
        c.reveal(U64(7), secret_of(1));
        switch_at("alice.testnet", NearToken::ZERO, 60_999);
        c.claim_timeout(U64(7));
    }

    /// T-113 bitti kuralı + S-15: süre + grace dolmadan Active timeout red.
    #[test]
    #[should_panic(expected = "turn timeout not reached")]
    fn active_timeout_rejected_before_deadline() {
        let mut c = setup_active();
        let turn = c.match_or_panic(7).game.turn as usize;
        let waiting = c.match_or_panic(7).players[1 - turn].to_string();
        let deadline = c.match_or_panic(7).deadline_ms;
        switch_at(&waiting, NearToken::ZERO, deadline + TIMEOUT_GRACE_MS - 1);
        c.claim_timeout(U64(7));
    }

    /// FIX-15 (S-15): `deadline_ms..deadline_ms + TIMEOUT_GRACE_MS` ek süresi içinde
    /// sıradaki oyuncunun `fire` hamlesi yine kabul edilir.
    #[test]
    fn fire_succeeds_during_grace_window() {
        let mut c = setup_active();
        let m = c.match_or_panic(7);
        let turn_acc = m.players[m.game.turn as usize].to_string();
        switch_at(&turn_acc, NearToken::ZERO, m.deadline_ms + TIMEOUT_GRACE_MS - 1);
        let mut src = ScriptedSource::new(vec![Shell::Live]);
        let actions = c.fire_with(U64(7), Target::Opponent, &mut src);
        assert!(actions.iter().any(|a| matches!(a, Action::Shot { .. })));
        c.assert_solvent();
    }

    /// T-113 bitti kuralı: reveal aşaması timeout → açan taraf durability
    /// iadesi alır (10), açmayan ceza olarak kaybeder (9); ödül yok.
    #[test]
    fn reveal_timeout_refunds_revealer_only() {
        let mut c = setup_revealing_at_1000();
        c.reveal(U64(7), secret_of(1)); // yalnızca Alice açtı

        switch_at("alice.testnet", NearToken::ZERO, 61_000);
        let actions = c.claim_timeout(U64(7));
        assert_eq!(actions, vec![Action::TimeoutClaimed { by: 0 }]);

        assert!(c.get_match(U64(7), None).is_none());
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().durability, 10);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, None);
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().durability, 9);
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().locked_in, None);
        assert_eq!(c.player_state(&"alice.testnet".parse().unwrap()).active_match, None);
        assert_eq!(c.player_state(&"bob.testnet".parse().unwrap()).active_match, None);
        assert!(get_created_receipts().is_empty());
        c.assert_solvent();
    }

    /// T-113: açmayan taraf, açan tarafa karşı timeout açamaz.
    #[test]
    #[should_panic(expected = "caller did not reveal")]
    fn reveal_timeout_rejected_for_non_revealer_against_revealer() {
        let mut c = setup_revealing_at_1000();
        c.reveal(U64(7), secret_of(1)); // Alice açtı
        switch_at("bob.testnet", NearToken::ZERO, 61_000);
        c.claim_timeout(U64(7));
    }

    /// T-113: iki taraf da açmadıysa süre dolunca kilitler çözülür (iadesiz) ve maç silinir.
    #[test]
    fn reveal_timeout_when_neither_revealed_unsticks_both_without_refund() {
        let mut c = setup_revealing_at_1000();
        switch_at("bob.testnet", NearToken::ZERO, 61_000);
        c.claim_timeout(U64(7));
        assert!(c.get_match(U64(7), None).is_none());
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().durability, 9);
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().durability, 9);
        assert_eq!(c.player_state(&"alice.testnet".parse().unwrap()).active_match, None);
        assert_eq!(c.player_state(&"bob.testnet".parse().unwrap()).active_match, None);
        c.assert_solvent();
    }

    /// T-113 bitti kuralı: sırası olan oyuncu kendine timeout açamaz.
    #[test]
    #[should_panic(expected = "cannot claim timeout on your own turn")]
    fn active_timeout_rejected_for_turn_owner() {
        let mut c = setup_active();
        let m = c.match_or_panic(7);
        let turn_acc = m.players[m.game.turn as usize].to_string();
        switch_at(&turn_acc, NearToken::ZERO, m.deadline_ms);
        c.claim_timeout(U64(7));
    }

    /// T-113 bitti kuralı: Active timeout → diğer oyuncu kazanır ve ödül alır.
    #[test]
    fn active_timeout_awards_caller_and_pays_reward() {
        let mut c = setup_active();
        let treasury_before = c.treasury;
        let storage_before = env::storage_usage();
        let m = c.match_or_panic(7);
        let waiting_idx = 1 - m.game.turn as usize;
        let waiting_acc = m.players[waiting_idx].clone();

        switch_at(waiting_acc.as_str(), NearToken::ZERO, m.deadline_ms + TIMEOUT_GRACE_MS);
        let actions = c.claim_timeout(U64(7));
        assert_eq!(
            actions,
            vec![
                Action::TimeoutClaimed { by: waiting_idx as u8 },
                Action::MatchEnded {
                    winner: waiting_idx as u8,
                    reward: NearToken::from_millinear(100).as_yoctonear().into(),
                },
            ]
        );

        let freed = storage_before.saturating_sub(env::storage_usage()) as u128;
        let refund = NearToken::from_yoctonear(freed * env::storage_byte_cost().as_yoctonear());
        let m_after = c.match_or_panic(7);
        assert_eq!(m_after.status, Status::Finished);
        assert_eq!(m_after.winner, Some(waiting_idx as u8));
        assert_eq!(
            c.treasury,
            treasury_before
                .saturating_add(refund)
                .saturating_sub(NearToken::from_millinear(100))
        );
        assert_eq!(c.player_state(&waiting_acc).wins, 1);
        assert_eq!(c.player_state(&m.players[m.game.turn as usize]).losses, 1);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, None);
        assert_eq!(c.character_state(&"ayarci:2".to_string()).unwrap().locked_in, None);

        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id, waiting_acc);
        c.assert_solvent();
    }

    /// T-113: treasury yetersizken owed birikir, `fund_treasury` sonrası
    /// `claim_reward()` ile ödenir.
    #[test]
    fn claim_reward_pays_owed_after_treasury_funded() {
        let mut c = setup_active();
        c.treasury = NearToken::ZERO;
        let m = c.match_or_panic(7);
        let waiting_idx = 1 - m.game.turn as usize;
        let waiting_acc = m.players[waiting_idx].clone();

        switch_at(waiting_acc.as_str(), NearToken::ZERO, m.deadline_ms + TIMEOUT_GRACE_MS);
        c.claim_timeout(U64(7));
        let refund_after_prune = c.treasury;
        assert_eq!(c.player_state(&waiting_acc).owed, NearToken::from_millinear(100));
        assert!(get_created_receipts().is_empty());

        // Fonlama sonrası çekilebilir.
        switch_at("donor.testnet", NearToken::from_millinear(150), m.deadline_ms + TIMEOUT_GRACE_MS + 1);
        c.fund_treasury();
        switch_at(waiting_acc.as_str(), NearToken::ZERO, m.deadline_ms + TIMEOUT_GRACE_MS + 2);
        let claimed = c.claim_reward();
        assert_eq!(claimed, NearToken::from_millinear(100));
        assert_eq!(c.player_state(&waiting_acc).owed, NearToken::ZERO);
        assert_eq!(c.treasury, NearToken::from_millinear(50).saturating_add(refund_after_prune));

        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id, waiting_acc);
        assert!(receipts[0].actions.iter().any(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } =>
                *deposit == NearToken::from_millinear(100),
            _ => false,
        }));
        c.assert_solvent();
    }

    #[test]
    #[should_panic(expected = "no reward owed")]
    fn claim_reward_rejects_when_nothing_owed() {
        let mut c = setup_active();
        c.claim_reward();
    }

    #[test]
    #[should_panic(expected = "insufficient treasury")]
    fn claim_reward_rejects_when_treasury_empty() {
        let mut c = setup_active();
        c.treasury = NearToken::ZERO;
        let m = c.match_or_panic(7);
        let waiting_acc = m.players[1 - m.game.turn as usize].clone();
        switch_at(waiting_acc.as_str(), NearToken::ZERO, m.deadline_ms + TIMEOUT_GRACE_MS);
        c.claim_timeout(U64(7));
        // `finish_match` budama iadesini treasury'ye yazdığından tam boş durumu kur.
        c.treasury = NearToken::ZERO;
        c.claim_reward();
    }

    // ------------------------------------------------------------------
    // T-116: Depolama ve budama
    // ------------------------------------------------------------------

    /// T-116: `treasury < min_treasury` iken yeni maç kabul edilmez.
    #[test]
    #[should_panic(expected = "treasury below minimum")]
    fn join_rejected_below_min_treasury() {
        let mut c = setup();
        c.treasury = NearToken::from_millinear(99); // < 100 mNEAR varsayılan
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
    }

    /// T-116 bitti kuralı: bitmiş maçta `log` ve `fixed` temizlenir, özet
    /// kalır ve maç sonu `env::storage_usage()` maç ortasından küçüktür.
    #[test]
    fn finished_match_prunes_log_and_fixed_reducing_storage() {
        let mut c = setup_active();
        let before_mid = env::storage_usage();

        // Maç ortasında epey aksiyon biriktir (R2 yükü + log girişleri).
        let mut m = c.match_or_panic(7);
        m.game.round = 2;
        m.game.score = [1, 0];
        m.game.hp = [4, 1];
        m.game.max_hp = 4;
        m.game.load = Load::new(2, 2);
        m.game.turn = 0;
        c.save_match(&m);

        let mut src = ScriptedSource::new(vec![Shell::Blank, Shell::Blank, Shell::Live]);
        switch_at("alice.testnet", NearToken::ZERO, 2_000);
        c.fire_with(U64(7), Target::SelfTarget, &mut src); // Blank -> sıra kalır
        c.fire_with(U64(7), Target::SelfTarget, &mut src); // Blank -> sıra kalır
        let mid_storage = env::storage_usage();
        assert!(!c.match_or_panic(7).log.is_empty());
        assert!(!c.match_or_panic(7).game.load.fixed.is_empty());

        // Maçı bitiren atış → budama çalışır.
        c.fire_with(U64(7), Target::Opponent, &mut src); // Live -> R2 & maç biter
        let end_storage = env::storage_usage();

        let finished = c.match_or_panic(7);
        assert_eq!(finished.status, Status::Finished);
        assert_eq!(finished.winner, Some(0));
        assert_eq!(finished.game.score, [2, 0]);
        assert!(finished.seq > 0);
        assert!(finished.log.is_empty());
        assert!(finished.game.load.fixed.is_empty());
        assert!(
            end_storage < mid_storage,
            "end_storage ({end_storage}) < mid_storage ({mid_storage}) olmalı (before_mid={before_mid})"
        );
        c.assert_solvent();
    }

    // ------------------------------------------------------------------
    // FIX-03: Depolama muhasebesi
    // ------------------------------------------------------------------

    #[test]
    fn storage_accounting_deducts_growth_and_preserves_solvency() {
        let mut c = setup();
        c.assert_solvent();
        let t_after_buy = c.treasury;

        let s0 = env::storage_usage();
        c.join(U64(7), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 7), alice_token(&c));
        let s1 = env::storage_usage();
        assert!(s1 > s0);
        let expected_drop = NearToken::from_yoctonear(
            (s1 - s0) as u128 * env::storage_byte_cost().as_yoctonear(),
        );
        assert_eq!(c.treasury, t_after_buy.saturating_sub(expected_drop));
        c.assert_solvent();

        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), real_commit(2, "bob.testnet", 7), bob_token(&c));
        c.assert_solvent();

        c.reveal(U64(7), secret_of(2));
        switch("alice.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(1));
        c.assert_solvent();
    }

    /// FIX-03-R: `join -> cancel` ve `reveal-timeout` sonrası `treasury` ve
    /// `storage_usage` başlangıç değerine döner; tekrarlanan iptaller treasury'yi eritmez.
    #[test]
    fn fix03r_join_cancel_and_reveal_timeout_restore_treasury() {
        let mut c = setup();
        let s0 = env::storage_usage();
        let t0 = c.treasury;

        // 3 kez join -> cancel döngüsü treasury ve depolamayı net sıfırda tutar.
        for i in 1..=3u64 {
            c.join(U64(i), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", i), alice_token(&c));
            assert!(c.treasury < t0);
            c.cancel(U64(i));
            assert_eq!(env::storage_usage(), s0);
            assert_eq!(c.treasury, t0);
            c.assert_solvent();
        }

        // Revealing -> tek reveal -> reveal-timeout da depolama ve treasury'yi geri yükler.
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c.join(U64(77), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 77), alice_token(&c));
        switch_at("bob.testnet", NearToken::ZERO, 1_000);
        c.join(U64(77), "alice.testnet".parse().unwrap(), real_commit(2, "bob.testnet", 77), bob_token(&c));
        switch_at("alice.testnet", NearToken::ZERO, 1_000);
        c.reveal(U64(77), secret_of(1));
        assert!(c.treasury < t0);

        switch_at("alice.testnet", NearToken::ZERO, 61_000);
        c.claim_timeout(U64(77));
        assert_eq!(env::storage_usage(), s0);
        assert_eq!(c.treasury, t0);
        c.assert_solvent();
    }

    // ------------------------------------------------------------------
    // FIX-01: Minimum prepaid gas
    // ------------------------------------------------------------------

    #[test]
    #[should_panic(expected = "insufficient gas")]
    fn reveal_rejects_low_prepaid_gas() {
        let mut c = setup_revealing();
        let ctx = VMContextBuilder::new()
            .signer_account_id("alice.testnet".parse().unwrap())
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .prepaid_gas(Gas::from_tgas(5))
            .build();
        near_sdk::testing_env!(ctx);
        c.reveal(U64(7), secret_of(1));
    }

    #[test]
    #[should_panic(expected = "insufficient gas")]
    fn fire_rejects_low_prepaid_gas() {
        let mut c = setup_active();
        let turn_acc = c.match_or_panic(7).players[c.match_or_panic(7).game.turn as usize].clone();
        let ctx = VMContextBuilder::new()
            .signer_account_id(turn_acc.clone())
            .predecessor_account_id(turn_acc)
            .prepaid_gas(Gas::from_tgas(5))
            .build();
        near_sdk::testing_env!(ctx);
        c.fire(U64(7), Target::Opponent);
    }

    #[test]
    #[should_panic(expected = "insufficient gas")]
    fn use_item_rejects_low_prepaid_gas() {
        let mut c = setup_active();
        let turn_acc = c.match_or_panic(7).players[c.match_or_panic(7).game.turn as usize].clone();
        let ctx = VMContextBuilder::new()
            .signer_account_id(turn_acc.clone())
            .predecessor_account_id(turn_acc)
            .prepaid_gas(Gas::from_tgas(5))
            .build();
        near_sdk::testing_env!(ctx);
        c.use_item(U64(7), 0, None);
    }

    // ------------------------------------------------------------------
    // FIX-04: Ödeme güvenliği (serbest bakiye kontrolü)
    // ------------------------------------------------------------------

    #[test]
    fn finish_match_credits_owed_when_free_balance_is_insufficient() {
        let mut c = setup_active();
        let mut m = c.match_or_panic(7);
        m.game.score = [1, 0];
        m.game.hp = [2, 1];
        m.game.load = Load::new(1, 1);
        m.game.turn = 0;
        c.save_match(&m);

        // Treasury muhasebede yüksek görünse bile gerçek serbest bakiye ödülü
        // karşılamıyorsa LackBalanceForState riski yerine owed yazılır.
        let current_storage = env::storage_usage();
        let stake = NearToken::from_yoctonear(
            current_storage as u128 * env::storage_byte_cost().as_yoctonear(),
        );
        let ctx = VMContextBuilder::new()
            .signer_account_id("alice.testnet".parse().unwrap())
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .storage_usage(current_storage)
            .account_balance(stake.saturating_add(NearToken::from_millinear(20)))
            .block_timestamp(2_000 * 1_000_000)
            .build();
        near_sdk::testing_env!(ctx);

        let mut src = ScriptedSource::new(vec![Shell::Live]);
        c.fire_with(U64(7), Target::Opponent, &mut src);

        assert_eq!(c.match_or_panic(7).status, Status::Finished);
        assert!(get_created_receipts().is_empty());
        let alice_st = c.player_state(&"alice.testnet".parse().unwrap());
        assert_eq!(alice_st.owed, NearToken::from_millinear(100));
    }

    #[test]
    fn claim_reward_caps_at_available_free_balance() {
        let mut c = setup_active();
        c.ops_balance = NearToken::ZERO;
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let mut st = c.player_state(&alice);
        st.owed = NearToken::from_millinear(100);
        c.players.insert(&alice, &st);

        let current_storage = env::storage_usage();
        let stake = NearToken::from_yoctonear(
            current_storage as u128 * env::storage_byte_cost().as_yoctonear(),
        );
        let ctx = VMContextBuilder::new()
            .signer_account_id(alice.clone())
            .predecessor_account_id(alice.clone())
            .storage_usage(current_storage)
            .account_balance(stake.saturating_add(NearToken::from_millinear(30)))
            .build();
        near_sdk::testing_env!(ctx);

        let claimed = c.claim_reward();
        assert_eq!(claimed, NearToken::from_millinear(30));
        assert_eq!(c.player_state(&alice).owed, NearToken::from_millinear(70));
    }

    // ------------------------------------------------------------------
    // FIX-05: Kayıt silme & match_key (S-03, S-04)
    // ------------------------------------------------------------------

    #[test]
    fn stranger_cannot_hijack_or_close_pair_match() {
        let mut c = setup();
        // Yabancı hesap (charlie) aynı match_id=7'yi dave ile önceden açsa bile
        // (alice, bob, 7) maçını engelleyemez ya da kapatamaz.
        switch("charlie.testnet", NearToken::from_near(1));
        c.buy_character(Kind::Kacak);
        c.join(
            U64(7),
            "dave.testnet".parse().unwrap(),
            commitment_bytes(9),
            "kacak:3".to_string(),
        );

        // Alice ve Bob aynı match_id=7 ile maç açıp reveal aşamasına geçer.
        switch("alice.testnet", NearToken::ZERO);
        c.join(U64(7), "bob.testnet".parse().unwrap(), real_commit(1, "alice.testnet", 7), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), real_commit(2, "bob.testnet", 7), bob_token(&c));

        // Charlie kendi Pending maçını iptal etse bile (alice, bob, 7) açık ve sağlam kalır.
        switch("charlie.testnet", NearToken::ZERO);
        c.cancel(U64(7));
        let ab = c
            .get_match(
                U64(7),
                Some(["alice.testnet".parse().unwrap(), "bob.testnet".parse().unwrap()]),
            )
            .unwrap();
        assert_eq!(ab.status, Status::Revealing);

        // Alice ve Bob reveal edip oynayabilir; charlie dışarıdan cancel/reveal/claim edemez.
        switch("alice.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(1));
        switch("bob.testnet", NearToken::ZERO);
        c.reveal(U64(7), secret_of(2));
        let ab = c
            .get_match(
                U64(7),
                Some(["alice.testnet".parse().unwrap(), "bob.testnet".parse().unwrap()]),
            )
            .unwrap();
        assert_eq!(ab.status, Status::Active);
        c.assert_solvent();
    }

    // ------------------------------------------------------------------
    // FIX-06: Config snapshot (S-05)
    // ------------------------------------------------------------------

    #[test]
    fn set_config_after_join_does_not_affect_active_match() {
        let mut c = setup_active();
        let treasury_before = c.treasury;

        // Owner maç sırasında tüm oyun/ödül/süre ayarlarını değiştirir.
        owner_ctx();
        let mut new_cfg = Config::default();
        new_cfg.turn_ms = 120_000;
        new_cfg.reveal_ms = 120_000;
        new_cfg.rounds[1].start_hp = 8;
        new_cfg.reward = NearToken::from_millinear(10);
        c.set_config(new_cfg);

        // Mevcut maç R1'den R2'ye geçerken ve biterken kendi snapshot'ını kullanır.
        let mut m = c.match_or_panic(7);
        m.game.hp = [2, 2];
        m.game.load = Load::new(2, 2);
        m.game.turn = 0;
        c.save_match(&m);
        let storage_before = env::storage_usage();

        let mut src = ScriptedSource::new(vec![
            Shell::Live,
            Shell::Blank,
            Shell::Live, // R1 2 dmg -> R2 başlamalı (snapshot R2 HP = 4, 8 değil)
        ]);
        switch_at("alice.testnet", NearToken::ZERO, 2_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        switch_at("bob.testnet", NearToken::ZERO, 3_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);
        switch_at("alice.testnet", NearToken::ZERO, 4_000);
        c.fire_with(U64(7), Target::Opponent, &mut src);

        let after_r1 = c.match_or_panic(7);
        assert_eq!(after_r1.game.round, 2);
        assert_eq!(after_r1.game.max_hp, 4);
        assert_eq!(after_r1.deadline_ms, 4_000 + 45_000);

        // Maç timeout ile bitsin → ödül 100 mNEAR (snapshot), 10 mNEAR değil.
        let non_turn = after_r1.players[1 - after_r1.game.turn as usize].to_string();
        switch_at(&non_turn, NearToken::ZERO, after_r1.deadline_ms + TIMEOUT_GRACE_MS);
        let actions = c.claim_timeout(U64(7));
        assert!(actions.contains(&Action::MatchEnded {
            winner: 1 - after_r1.game.turn,
            reward: NearToken::from_millinear(100).as_yoctonear().into(),
        }));
        let storage_after = env::storage_usage();
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let expected_treasury = if storage_after >= storage_before {
            treasury_before
                .saturating_sub(NearToken::from_yoctonear((storage_after - storage_before) as u128 * byte_cost))
                .saturating_sub(NearToken::from_millinear(100))
        } else {
            treasury_before
                .saturating_add(NearToken::from_yoctonear((storage_before - storage_after) as u128 * byte_cost))
                .saturating_sub(NearToken::from_millinear(100))
        };
        assert_eq!(c.treasury, expected_treasury);
        c.assert_solvent();
    }
}
