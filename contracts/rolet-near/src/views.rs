//! Salt okunur view metodları (T-115, DESIGN §4.7/§4.8).
//!
//! Maç/aksiyon/oyuncu/karakter/yapılandırma/treasury ve sıralama sorguları
//! RPC'den ücretsiz çağrılır. `MatchView` gizli alanları (`commits`, `secrets`,
//! `seed`, `draw_nonce`) dışarı vermez; `game.load.fixed` v1 sınırı gereği
//! dahildir (DESIGN §4.6/§4.7).

use crate::config::Config;
use crate::game::{Action, GameState};
use crate::matches::{Match, PlayerState, Status};
use crate::nft::CharacterState;
use crate::{Contract, ContractExt};
use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U64;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{near, AccountId, NearToken};
use std::cmp::Ordering;

pub(crate) const TOP_LEADERBOARD_CAP: usize = 100;

/// İstemciye (web/Godot) dönen maç görünümü (`docs/near/schema/match-view.json`).
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug, near_sdk::NearSchema)]
#[abi(json)]
#[serde(crate = "near_sdk::serde")]
pub struct MatchView {
    pub id: U64,
    pub status: Status,
    pub players: [AccountId; 2],
    pub tokens: [TokenId; 2],
    /// Her oyuncunun `reveal` yapıp yapmadığı (sırrın kendisi gizlidir).
    pub revealed: [bool; 2],
    pub game: GameState,
    /// Ortak eşya destesinde kalan kart sayısı (EK2).
    pub deck_remaining: u16,
    pub reveal_deadline_ms: u64,
    pub deadline_ms: u64,
    pub winner: Option<u8>,
    pub seq: u64,
    pub log: Vec<Action>,
}

impl From<Match> for MatchView {
    fn from(m: Match) -> Self {
        let deck_remaining = m.game.deck_remaining();
        Self {
            id: U64(m.id),
            status: m.status,
            players: m.players,
            tokens: m.tokens,
            revealed: [m.secrets[0].is_some(), m.secrets[1].is_some()],
            game: m.game,
            deck_remaining,
            reveal_deadline_ms: m.reveal_deadline_ms,
            deadline_ms: m.deadline_ms,
            winner: m.winner,
            seq: m.seq,
            log: m.log,
        }
    }
}

/// Sıralama tablosu satırı (`leaderboard`).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct LeaderboardEntry {
    pub account_id: AccountId,
    pub wins: u32,
    pub losses: u32,
    pub played: u32,
}

/// `get_actions` dönüş zarfı (S-11): `first_seq > since_seq + 1` olduğunda
/// log penceresi (32) kaymış demektir; istemci `get_match` snapshot'ı ister.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug, near_sdk::NearSchema)]
#[abi(json)]
#[serde(crate = "near_sdk::serde")]
pub struct ActionsPage {
    pub first_seq: u64,
    pub actions: Vec<Action>,
}

fn cmp_leaderboard(a: &LeaderboardEntry, b: &LeaderboardEntry) -> Ordering {
    b.wins
        .cmp(&a.wins)
        .then_with(|| a.losses.cmp(&b.losses))
        .then_with(|| a.account_id.cmp(&b.account_id))
}

impl Contract {
    fn lookup_match(&self, match_id: u64, players: Option<[AccountId; 2]>) -> Option<Match> {
        let key = match players {
            Some([a, b]) => Some(crate::matches::match_key(&a, &b, match_id)),
            None => self.match_id_index.get(&match_id),
        }?;
        self.matches.get(&key)
    }

    /// Artımlı top-100 sıralama güncellemesi (S-09 / FIX-14).
    pub(crate) fn update_leaderboard(&mut self, account_id: &AccountId, st: &PlayerState) {
        let entry = LeaderboardEntry {
            account_id: account_id.clone(),
            wins: st.wins,
            losses: st.losses,
            played: st.played,
        };
        if let Some(pos) = self.top_leaderboard.iter().position(|e| &e.account_id == account_id) {
            self.top_leaderboard[pos] = entry;
            self.top_leaderboard.sort_by(cmp_leaderboard);
            return;
        }
        if self.top_leaderboard.len() < TOP_LEADERBOARD_CAP {
            self.top_leaderboard.push(entry);
            self.top_leaderboard.sort_by(cmp_leaderboard);
            return;
        }
        if let Some(last) = self.top_leaderboard.last_mut() {
            if cmp_leaderboard(&entry, last) == Ordering::Less {
                *last = entry;
                self.top_leaderboard.sort_by(cmp_leaderboard);
            }
        }
    }

    /// Hiç tamamlanmış maçı olmayan oyuncu iptalde temizlenirken top-100'den düşürür.
    pub(crate) fn remove_from_leaderboard(&mut self, account_id: &AccountId) {
        if let Some(pos) = self.top_leaderboard.iter().position(|e| &e.account_id == account_id) {
            self.top_leaderboard.remove(pos);
        }
    }
}

#[near]
impl Contract {
    /// Maç durumunu gizli alanlar olmadan döner (`None` = maç yok).
    /// `players` verilirse doğrudan `match_key` ile, verilmezse son `match_id` diziniyle bakar.
    pub fn get_match(&self, match_id: U64, players: Option<[AccountId; 2]>) -> Option<MatchView> {
        self.lookup_match(match_id.0, players).map(MatchView::from)
    }

    /// `since_seq`'ten büyük sıra numaralı aksiyonları `{ first_seq, actions }`
    /// zarfında döner (`log` en fazla son `LOG_CAP` = 32 aksiyonu tutar).
    /// İstemci `first_seq > since_seq + 1` görürse aradaki aksiyonlar silinmiştir
    /// ve `get_match` ile tam snapshot çekmelidir (S-11).
    pub fn get_actions(
        &self,
        match_id: U64,
        since_seq: u64,
        players: Option<[AccountId; 2]>,
    ) -> ActionsPage {
        let Some(m) = self.lookup_match(match_id.0, players) else {
            return ActionsPage { first_seq: 0, actions: Vec::new() };
        };
        let first_seq = if m.log.is_empty() {
            if m.seq == 0 { 0 } else { m.seq + 1 }
        } else {
            m.seq - m.log.len() as u64 + 1
        };
        if m.log.is_empty() || since_seq >= m.seq {
            return ActionsPage { first_seq, actions: Vec::new() };
        }
        let skip = (since_seq + 1).saturating_sub(first_seq) as usize;
        ActionsPage { first_seq, actions: m.log.into_iter().skip(skip).collect() }
    }

    /// Oyuncunun aktif maç, istatistik ve `owed` bakiyesi.
    pub fn get_player(&self, account_id: AccountId) -> PlayerState {
        self.player_state(&account_id)
    }

    /// Karakter NFT'sinin oyun durumu (`kind`, `durability`, `locked_in`).
    pub fn get_character(&self, token_id: TokenId) -> Option<CharacterState> {
        self.character_state(&token_id)
    }

    /// Güncel kontrat yapılandırması.
    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    /// Ödül havuzu bakiyesi.
    pub fn get_treasury(&self) -> NearToken {
        self.treasury
    }

    /// Ortak eşya destesinde kalan toplam kart sayısı (EK2).
    pub fn get_deck_remaining(&self, match_id: U64, players: Option<[AccountId; 2]>) -> Option<u16> {
        self.lookup_match(match_id.0, players).map(|m| m.game.deck_remaining())
    }

    /// Galibiyete göre azalan sıralı top-100 oyuncu listesi (sayfalı; O(1) okuma, S-09).
    pub fn leaderboard(&self, from: Option<u64>, limit: Option<u64>) -> Vec<LeaderboardEntry> {
        let skip = from.unwrap_or(0) as usize;
        let take = limit.unwrap_or(50).min(TOP_LEADERBOARD_CAP as u64) as usize;
        self.top_leaderboard.iter().skip(skip).take(take).cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{Item, ItemResult, Load, ScriptedSource, Shell, Target};
    use crate::matches::push_action;
    use crate::nft::Kind;
    use crate::rng;
    use near_sdk::json_types::Base64VecU8;
    use near_sdk::serde_json;
    use near_sdk::test_utils::VMContextBuilder;

    fn switch(account: &str, attached: NearToken, ts_ms: u64) {
        let ctx = VMContextBuilder::new()
            .signer_account_id(account.parse().unwrap())
            .predecessor_account_id(account.parse().unwrap())
            .attached_deposit(attached)
            .block_timestamp(ts_ms * 1_000_000)
            .build();
        near_sdk::testing_env!(ctx);
    }

    fn commit(tag: u8, account: &str, match_id: u64) -> Base64VecU8 {
        Base64VecU8(rng::commitment([tag; 32], &account.parse().unwrap(), match_id).to_vec())
    }

    fn setup_contract() -> Contract {
        switch("owner.testnet", NearToken::ZERO, 1_000);
        let mut c = Contract::new("owner.testnet".parse().unwrap(), Config::default());
        c.fund_treasury(); // 0
        switch("donor.testnet", NearToken::from_near(5), 1_000);
        c.fund_treasury();
        c
    }

    /// T-115: get_config, get_treasury, get_character, get_player.
    #[test]
    fn basic_views_return_expected_state() {
        let mut c = setup_contract();
        assert_eq!(c.get_config(), Config::default());
        assert_eq!(c.get_treasury(), NearToken::from_near(5));
        assert_eq!(c.get_match(U64(999), None), None);
        let missing = c.get_actions(U64(999), 0, None);
        assert_eq!(missing.first_seq, 0);
        assert!(missing.actions.is_empty());
        assert_eq!(c.get_character("none:1".to_string()), None);

        switch("alice.testnet", NearToken::from_near(1), 1_000);
        let tok = c.buy_character(Kind::Kuleci);
        let ch = c.get_character(tok).unwrap();
        assert_eq!(ch.kind, Kind::Kuleci);
        assert_eq!(ch.durability, 10);
        assert_eq!(ch.locked_in, None);

        let st = c.get_player("alice.testnet".parse().unwrap());
        assert_eq!(st, PlayerState::default());
        c.assert_solvent();
    }

    /// T-115: get_match gizli alanları sızdırmaz ve revealed bayrağını doğru döner.
    #[test]
    fn get_match_hides_secrets_and_reflects_state() {
        let mut c = setup_contract();
        switch("alice.testnet", NearToken::from_near(1), 1_000);
        let ta = c.buy_character(Kind::Kuleci);
        switch("bob.testnet", NearToken::from_near(1), 1_000);
        let tb = c.buy_character(Kind::Ayarci);

        switch("alice.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commit(1, "alice.testnet", 7), ta);
        switch("bob.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commit(2, "bob.testnet", 7), tb);

        let view1 = c.get_match(U64(7), None).unwrap();
        assert_eq!(view1.status, Status::Revealing);
        assert_eq!(view1.revealed, [false, false]);

        switch("alice.testnet", NearToken::ZERO, 1_000);
        c.reveal(U64(7), Base64VecU8([1u8; 32].to_vec()));
        let view2 = c.get_match(U64(7), None).unwrap();
        assert_eq!(view2.revealed, [true, false]);

        // JSON serileştirmesinde `secrets`, `commits`, `seed`, `draw_nonce` yok.
        let json = serde_json::to_string(&view2).unwrap();
        assert!(!json.contains("secrets"));
        assert!(!json.contains("commits"));
        assert!(!json.contains("seed"));
        assert!(!json.contains("draw_nonce"));
        c.assert_solvent();
    }

    /// T-115: get_actions since_seq dilimleme ve LOG_CAP (32) sınırı.
    #[test]
    fn get_actions_slices_by_since_seq_even_after_cap() {
        let mut c = setup_contract();
        switch("alice.testnet", NearToken::from_near(1), 1_000);
        let ta = c.buy_character(Kind::Kuleci);
        switch("bob.testnet", NearToken::from_near(1), 1_000);
        let tb = c.buy_character(Kind::Ayarci);

        switch("alice.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "bob.testnet".parse().unwrap(), commit(1, "alice.testnet", 7), ta);
        switch("bob.testnet", NearToken::ZERO, 1_000);
        c.join(U64(7), "alice.testnet".parse().unwrap(), commit(2, "bob.testnet", 7), tb);
        c.reveal(U64(7), Base64VecU8([2u8; 32].to_vec()));
        switch("alice.testnet", NearToken::ZERO, 1_000);
        c.reveal(U64(7), Base64VecU8([1u8; 32].to_vec()));

        // R1 başlangıcı: seq = 3 (LoadStarted + 2× ItemsDealt), boşluk yok (first_seq = 1).
        // Ortak 36 kartlık desteden R1'de 4+4 = 8 kart çekildi → 28 kart kaldı (EK2).
        assert_eq!(c.get_deck_remaining(U64(7), None), Some(28));
        assert_eq!(c.get_match(U64(7), None).unwrap().deck_remaining, 28);
        let init_page = c.get_actions(U64(7), 0, None);
        assert_eq!(init_page.first_seq, 1);
        assert_eq!(init_page.actions.len(), 3);
        let empty_page = c.get_actions(U64(7), 3, None);
        assert_eq!(empty_page.first_seq, 1);
        assert!(empty_page.actions.is_empty());

        // 39 ek aksiyon → seq = 42, log = son 32 (seq 11..=42).
        let mut m = c.match_or_panic(7);
        for i in 2..=40u8 {
            push_action(
                &mut m,
                Action::ItemUsed {
                    player: 0,
                    item: Item::Loupe,
                    slot: i,
                    result: ItemResult::Private { pos: 0, shell: Shell::Live },
                },
            );
        }
        c.save_match(&m);

        // since_seq = 0 → first_seq = 11 (> 0 + 1, yani boşluk var) ve 32 tamponlanmış aksiyon.
        let all_buffered = c.get_actions(U64(7), 0, None);
        assert_eq!(all_buffered.first_seq, 11);
        assert_eq!(all_buffered.actions.len(), 32);
        // since_seq = 40 → boşluk yok (11 <= 40 + 1), seq 41 ve 42 (slot 39, 40).
        let tail = c.get_actions(U64(7), 40, None);
        assert_eq!(tail.first_seq, 11);
        assert_eq!(tail.actions.len(), 2);
        assert!(matches!(tail.actions[0], Action::ItemUsed { slot: 39, .. }));
        assert!(matches!(tail.actions[1], Action::ItemUsed { slot: 40, .. }));
        let caught_up = c.get_actions(U64(7), 42, None);
        assert_eq!(caught_up.first_seq, 11);
        assert!(caught_up.actions.is_empty());
        c.assert_solvent();
    }

    /// T-115: leaderboard wins'e göre azalan sıralar ve from/limit sayfalama yapar.
    #[test]
    fn leaderboard_sorts_by_wins_and_paginates() {
        let mut c = setup_contract();
        for (who, kind) in [
            ("alice.testnet", Kind::Kuleci),
            ("bob.testnet", Kind::Ayarci),
            ("carol.testnet", Kind::Kacak),
        ] {
            switch(who, NearToken::from_near(1), 1_000);
            c.buy_character(kind);
        }

        // Alice: 2 galibiyet, Bob: 1 galibiyet, Carol: 0 galibiyet (sadece aktif maçta).
        let play_win = |c: &mut Contract, match_id: u64, w: &str, wt: &str, l: &str, lt: &str| {
            switch(w, NearToken::ZERO, 1_000);
            c.join(U64(match_id), l.parse().unwrap(), commit(1, w, match_id), wt.to_string());
            switch(l, NearToken::ZERO, 1_000);
            c.join(U64(match_id), w.parse().unwrap(), commit(2, l, match_id), lt.to_string());
            c.reveal(U64(match_id), Base64VecU8([2u8; 32].to_vec()));
            switch(w, NearToken::ZERO, 1_000);
            c.reveal(U64(match_id), Base64VecU8([1u8; 32].to_vec()));

            let mut m = c.match_or_panic(match_id);
            m.game.score = [1, 0];
            m.game.hp = [2, 1];
            m.game.load = Load::new(1, 1);
            m.game.turn = 0;
            c.save_match(&m);
            let mut src = ScriptedSource::new(vec![Shell::Live]);
            c.fire_with(U64(match_id), Target::Opponent, &mut src);
        };

        play_win(&mut c, 1, "alice.testnet", "kuleci:1", "bob.testnet", "ayarci:2");
        play_win(&mut c, 2, "alice.testnet", "kuleci:1", "carol.testnet", "kacak:3");
        play_win(&mut c, 3, "bob.testnet", "ayarci:2", "carol.testnet", "kacak:3");

        let full = c.leaderboard(None, None);
        assert_eq!(full.len(), 3);
        assert_eq!(full[0].account_id.as_str(), "alice.testnet");
        assert_eq!(full[0].wins, 2);
        assert_eq!(full[1].account_id.as_str(), "bob.testnet");
        assert_eq!(full[1].wins, 1);
        assert_eq!(full[2].account_id.as_str(), "carol.testnet");
        assert_eq!(full[2].wins, 0);
        assert_eq!(full[2].losses, 2);

        let page = c.leaderboard(Some(1), Some(1));
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].account_id.as_str(), "bob.testnet");
        assert!(c.leaderboard(Some(10), Some(5)).is_empty());
        c.assert_solvent();
    }

    /// FIX-14 (S-09): 1000 oyuncuda top-100 listesi artımlı güncellenir ve
    /// `leaderboard()` `player_index`'e dokunmadan sabit O(1) okuma yapar.
    #[test]
    fn leaderboard_incremental_top_100_stays_constant_with_1000_players() {
        let mut c = setup_contract();
        for i in 0..1000u32 {
            let acc: AccountId = format!("p{i:04}.testnet").parse().unwrap();
            let st = PlayerState {
                active_match: None,
                wins: i,
                losses: 1000 - i,
                played: 1000,
                owed: NearToken::ZERO,
            };
            c.players.insert(&acc, &st);
            c.player_index.insert(&acc);
            c.update_leaderboard(&acc, &st);
        }
        assert_eq!(c.player_index.len(), 1000);
        assert_eq!(c.top_leaderboard.len(), TOP_LEADERBOARD_CAP);

        let top = c.leaderboard(None, Some(100));
        assert_eq!(top.len(), 100);
        assert_eq!(top[0].account_id.as_str(), "p0999.testnet");
        assert_eq!(top[0].wins, 999);
        assert_eq!(top[99].account_id.as_str(), "p0900.testnet");
        assert_eq!(top[99].wins, 900);
        assert!(c.leaderboard(Some(100), Some(10)).is_empty());

        // Düşük galibiyetli bir oyuncunun (p0010) 950'ye çıkması top-100'ü günceller ve
        // eski 100.'yü (p0900) düşürür.
        let promoted: AccountId = "p0010.testnet".parse().unwrap();
        let st_promoted = PlayerState {
            active_match: None,
            wins: 950,
            losses: 0,
            played: 950,
            owed: NearToken::ZERO,
        };
        c.players.insert(&promoted, &st_promoted);
        c.update_leaderboard(&promoted, &st_promoted);
        assert_eq!(c.top_leaderboard.len(), 100);
        let top2 = c.leaderboard(None, Some(100));
        assert!(top2.iter().any(|e| e.account_id == promoted && e.wins == 950));
        assert!(!top2.iter().any(|e| e.account_id.as_str() == "p0900.testnet"));

        // `player_index` boşaltılsa bile `leaderboard` sonuçları değişmez: O(1) okuma.
        c.player_index.clear();
        assert_eq!(c.leaderboard(None, Some(100)), top2);
    }

    /// T-115 bitti kuralı: `docs/near/schema/match-view.json` gerçek `MatchView`
    /// şemasıyla birebir deserialize olmalı.
    #[test]
    fn match_view_example_json_deserializes() {
        let raw = include_str!("../../../docs/near/schema/match-view.json");
        let parsed: MatchView = serde_json::from_str(raw).expect("örnek JSON geçerli MatchView");
        assert_eq!(parsed.id, U64(7));
        assert_eq!(parsed.status, Status::Active);
        assert_eq!(parsed.revealed, [true, true]);
    }
}
