//! Maç yaşam döngüsü (T-110..T-123, DESIGN §4.4/§4.5): join/cancel (T-110),
//! reveal (T-111), fire/use_item sarmalayıcıları (T-112), claim_timeout +
//! claim_reward (T-113).
//!
//! Kontrat-üzerinden-çağrı yasağı: tüm oyuncu aksiyonları
//! `predecessor_account_id == signer_account_id` şartı taşır (DESIGN §4.6) —
//! function-call key ile çağrıda predecessor yine oyuncu hesabıdır, kural
//! erişimi engellemez.

use crate::game::{Action, GameState};
use crate::{Contract, ContractExt};
use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, NearToken};

/// `Match.log` kapasitesi (DESIGN §4.5: son 32 aksiyon).
pub const LOG_CAP: usize = 32;

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

impl Contract {
    /// Oyuncunun durumu; yoksa sıfırlardan kurar (kayıt oluşturmaz).
    pub fn player_state(&self, account: &AccountId) -> PlayerState {
        self.players.get(account).unwrap_or_default()
    }

    /// Maç kaydı ya da panik.
    pub fn match_or_panic(&self, match_id: u64) -> Match {
        match self.matches.get(&match_id) {
            Some(m) => m,
            None => panic!("no such match"),
        }
    }

    /// Join maliyetini uygular: durability −1, token kilidi, `active_match`.
    /// İptal/timeout yolları bunun tamamını geri alır.
    fn lock_in(&mut self, player: &AccountId, match_id: u64, token_id: &TokenId) {
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
        // Leaderboard listesi (T-115).
        if !self.player_index.contains(player) {
            self.player_index.insert(player);
        }
    }

    /// Bir tarafın join maliyetini geri alır (cancel / reveal-timeout).
    /// `refund_durability = false`: ceza yolu (reveal timeout'ta geciken taraf).
    fn release(&mut self, player: &AccountId, match_id: u64, token_id: &TokenId, refund_durability: bool) {
        let mut character = self.character.get(token_id).expect("karakter durumu kayıtlı");
        if refund_durability {
            character.durability = character.durability.saturating_add(1);
        }
        character.locked_in = None;
        self.character.insert(token_id, &character);
        let mut state = self.player_state(player);
        if state.active_match == Some(match_id) {
            state.active_match = None;
        }
        self.players.insert(player, &state);
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

        match self.matches.get(&match_id) {
            None => {
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
                };
                self.lock_in(&player, match_id, &token_id);
                self.matches.insert(&match_id, &m);
            }
            Some(mut m) => {
                require!(m.status == Status::Pending, "match already taken");
                require!(m.players[1] == player, "opponent mismatch");
                require!(m.players[0] == opponent, "opponent mismatch");
                m.tokens[1] = token_id.clone();
                m.commits[1] = commit;
                m.status = Status::Revealing;
                m.reveal_deadline_ms = now_ms() + self.config.reveal_ms;
                self.lock_in(&player, match_id, &token_id);
                self.matches.insert(&match_id, &m);
            }
        }
    }

    /// Yalnızca `Pending` maçta ilk katılan iptal edebilir (DESIGN §4.4):
    /// durability iade, kilit açılır, maç `Cancelled`.
    pub fn cancel(&mut self, match_id: U64) {
        require_direct_call();
        let player = env::predecessor_account_id();
        let mut m = self.match_or_panic(match_id.0);
        require!(m.status == Status::Pending, "match is not pending");
        require!(m.players[0] == player, "only the first participant can cancel");
        self.release(&m.players[0].clone(), m.id, &m.tokens[0].clone(), true);
        m.status = Status::Cancelled;
        self.matches.insert(&m.id, &m);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nft::Kind;
    use crate::Config;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{AccountId, NearToken};

    /// signer == predecessor: function-call key akışını taklit eder.
    fn switch(account: &str, attached: NearToken) {
        let ctx = VMContextBuilder::new()
            .signer_account_id(account.parse().unwrap())
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(attached)
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
    }

    /// T-110: üçüncü hesap mevcut maça giremez.
    #[test]
    #[should_panic(expected = "match already taken")]
    fn third_account_cannot_join_taken_match() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(2), bob_token(&c));
        // Charlie'nin kendi karakteri olsa da maç artık dolu.
        switch("charlie.testnet", NearToken::from_near(1));
        c.buy_character(Kind::Kacak);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commitment_bytes(3), "kacak:3".to_string());
    }

    /// T-110: beklenen rakip uyuşmazsa (karşılıklı adlandırma) red.
    #[test]
    #[should_panic(expected = "opponent mismatch")]
    fn opponent_mismatch_rejected() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("bob.testnet", NearToken::ZERO);
        // bekleyen maç Alice'i bekliyor; Bob Carol adını veriyor.
        c.join(
            U64(7),
            "carol.testnet".parse().unwrap(),
            commitment_bytes(2),
            bob_token(&c),
        );
    }

    /// T-110: beklenen olmayan hesap (üçüncü) Pending maça giremez.
    #[test]
    #[should_panic(expected = "opponent mismatch")]
    fn uninvited_account_cannot_join_pending() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        switch("charlie.testnet", NearToken::from_near(1));
        c.buy_character(Kind::Kacak);
        c.join(
            U64(7),
            "alice.testnet".parse().unwrap(),
            commitment_bytes(3),
            "kacak:3".to_string(),
        );
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

    /// T-110: cancel iade eder (durability + kilit + active_match).
    #[test]
    fn cancel_refunds_and_unlocks() {
        let mut c = setup();
        c.join(U64(7), "bob.testnet".parse().unwrap(), commitment_bytes(1), alice_token(&c));
        c.cancel(U64(7));
        let m = c.match_or_panic(7);
        assert_eq!(m.status, Status::Cancelled);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().durability, 10);
        assert_eq!(c.character_state(&"kuleci:1".to_string()).unwrap().locked_in, None);
        assert_eq!(c.player_state(&"alice.testnet".parse::<AccountId>().unwrap()).active_match, None);
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
}
