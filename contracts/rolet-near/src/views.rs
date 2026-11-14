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
use near_sdk::json_types::U64;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{near, AccountId, NearToken};

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
    pub reveal_deadline_ms: u64,
    pub deadline_ms: u64,
    pub winner: Option<u8>,
    pub seq: u64,
    pub log: Vec<Action>,
}

impl From<Match> for MatchView {
    fn from(m: Match) -> Self {
        Self {
            id: U64(m.id),
            status: m.status,
            players: m.players,
            tokens: m.tokens,
            revealed: [m.secrets[0].is_some(), m.secrets[1].is_some()],
            game: m.game,
            reveal_deadline_ms: m.reveal_deadline_ms,
            deadline_ms: m.deadline_ms,
            winner: m.winner,
            seq: m.seq,
            log: m.log,
        }
    }
}

/// Sıralama tablosu satırı (`leaderboard`).
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug, near_sdk::NearSchema)]
#[abi(json)]
#[serde(crate = "near_sdk::serde")]
pub struct LeaderboardEntry {
    pub account_id: AccountId,
    pub wins: u32,
    pub losses: u32,
    pub played: u32,
}

#[near]
impl Contract {
    /// Maç durumunu gizli alanlar olmadan döner (`None` = maç yok).
    pub fn get_match(&self, match_id: U64) -> Option<MatchView> {
        self.matches.get(&match_id.0).map(MatchView::from)
    }

    /// `since_seq`'ten büyük sıra numaralı aksiyonları sırayla döner
    /// (`log` en fazla son `LOG_CAP` = 32 aksiyonu tutar).
    pub fn get_actions(&self, match_id: U64, since_seq: u64) -> Vec<Action> {
        let Some(m) = self.matches.get(&match_id.0) else {
            return Vec::new();
        };
        if m.log.is_empty() || since_seq >= m.seq {
            return Vec::new();
        }
        let first_seq = m.seq - m.log.len() as u64 + 1;
        let skip = (since_seq + 1).saturating_sub(first_seq) as usize;
        m.log.into_iter().skip(skip).collect()
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

    /// Galibiyete göre azalan sıralı oyuncu listesi (sayfalı; max 100).
    pub fn leaderboard(&self, from: Option<u64>, limit: Option<u64>) -> Vec<LeaderboardEntry> {
        let mut entries: Vec<LeaderboardEntry> = self
            .player_index
            .iter()
            .map(|account_id| {
                let st = self.player_state(&account_id);
                LeaderboardEntry {
                    account_id,
                    wins: st.wins,
                    losses: st.losses,
                    played: st.played,
                }
            })
            .collect();

        entries.sort_by(|a, b| {
            b.wins
                .cmp(&a.wins)
                .then_with(|| a.losses.cmp(&b.losses))
                .then_with(|| a.account_id.cmp(&b.account_id))
        });

        let skip = from.unwrap_or(0) as usize;
        let take = limit.unwrap_or(50).min(100) as usize;
        entries.into_iter().skip(skip).take(take).collect()
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
        assert_eq!(c.get_match(U64(999)), None);
        assert!(c.get_actions(U64(999), 0).is_empty());
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

        let view1 = c.get_match(U64(7)).unwrap();
        assert_eq!(view1.status, Status::Revealing);
        assert_eq!(view1.revealed, [false, false]);

        switch("alice.testnet", NearToken::ZERO, 1_000);
        c.reveal(U64(7), Base64VecU8([1u8; 32].to_vec()));
        let view2 = c.get_match(U64(7)).unwrap();
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

        // seq = 1 (LoadStarted).
        assert_eq!(c.get_actions(U64(7), 0).len(), 1);
        assert!(c.get_actions(U64(7), 1).is_empty());

        // 39 ek aksiyon → seq = 40, log = son 32 (seq 9..=40).
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
        c.matches.insert(&7, &m);

        // since_seq = 0 → tam 32 tamponlanmış aksiyon.
        let all_buffered = c.get_actions(U64(7), 0);
        assert_eq!(all_buffered.len(), 32);
        // since_seq = 38 → seq 39 ve 40 (slot 39, 40).
        let tail = c.get_actions(U64(7), 38);
        assert_eq!(tail.len(), 2);
        assert!(matches!(tail[0], Action::ItemUsed { slot: 39, .. }));
        assert!(matches!(tail[1], Action::ItemUsed { slot: 40, .. }));
        assert!(c.get_actions(U64(7), 40).is_empty());
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
            c.matches.insert(&match_id, &m);
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
