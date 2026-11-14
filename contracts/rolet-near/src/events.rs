//! NEP-297 olay logları (T-114, DESIGN §4.8).
//!
//! Her aksiyon tek satırda
//! `EVENT_JSON:{"standard":"rolet","version":"1.0.0","event":<ad>,"data":[<payload>]}`
//! biçiminde loglanır. `data[0]`, `Action`'ın iç etiketli (`kind`) JSON'udur.
//! İstemci kendi hamlesinin sonucunu işlem receipt loglarından, rakibin
//! hamlelerini `get_actions` view'ından alır (T-115).

use crate::game::Action;
use near_sdk::{env, serde_json};

/// Olay standardı adı (DESIGN §4.8).
pub const EVENT_STANDARD: &str = "rolet";
/// Olay şeması sürümü.
pub const EVENT_VERSION: &str = "1.0.0";

/// Aksiyon varyantının NEP-297 olay adı (snake_case).
pub fn event_name(action: &Action) -> &'static str {
    match action {
        Action::LoadStarted { .. } => "load_started",
        Action::ItemsDealt { .. } => "items_dealt",
        Action::ItemUsed { .. } => "item_used",
        Action::Shot { .. } => "shot",
        Action::Ejected { .. } => "ejected",
        Action::TurnSkipped { .. } => "turn_skipped",
        Action::HealCut { .. } => "heal_cut",
        Action::RoundEnded { .. } => "round_ended",
        Action::MatchEnded { .. } => "match_ended",
        Action::TimeoutClaimed { .. } => "timeout_claimed",
    }
}

/// Tek aksiyonu NEP-297 formatında loglar.
pub fn log_action(action: &Action) {
    let payload = serde_json::to_value(action).expect("Action serileşmesi garantili");
    let line = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event_name(action),
        "data": [payload],
    });
    env::log_str(&format!("EVENT_JSON:{line}"));
}

/// Aksiyon listesini sırayla loglar (`fire`/`use_item` birden çok aksiyon
/// üretir; T-112 buradan çağırır).
pub fn log_actions(actions: &[Action]) {
    for action in actions {
        log_action(action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{Item, ItemResult, Shell, Target};
    use near_sdk::test_utils::{get_logs, VMContextBuilder};

    /// Her varyanttan bir örnek; ad sırası `EXPECTED` ile eşleşir.
    fn sample_actions() -> Vec<Action> {
        vec![
            Action::LoadStarted { live: 2, blank: 3, total: 5 },
            Action::ItemsDealt { player: 0, items: vec![Item::Pipe, Item::Loupe] },
            Action::ItemUsed {
                player: 0,
                item: Item::Loupe,
                slot: 1,
                result: ItemResult::Private { pos: 0, shell: Shell::Live },
            },
            Action::Shot { player: 0, target: Target::Opponent, shell: Shell::Live, damage: 1 },
            Action::Ejected { shell: Shell::Live },
            Action::TurnSkipped { player: 1 },
            Action::HealCut { player: 1 },
            Action::RoundEnded { winner: 0, score: [1, 0] },
            Action::MatchEnded { winner: 0, reward: 100_000_000_000_000_000_000_000u128.into() },
            Action::TimeoutClaimed { by: 1 },
        ]
    }

    /// NEP-297 adı ve payload'daki `kind` etiketi (varyant adı).
    const EXPECTED: [(&str, &str); 10] = [
        ("load_started", "LoadStarted"),
        ("items_dealt", "ItemsDealt"),
        ("item_used", "ItemUsed"),
        ("shot", "Shot"),
        ("ejected", "Ejected"),
        ("turn_skipped", "TurnSkipped"),
        ("heal_cut", "HealCut"),
        ("round_ended", "RoundEnded"),
        ("match_ended", "MatchEnded"),
        ("timeout_claimed", "TimeoutClaimed"),
    ];

    /// T-114 bitti kuralı: her Action varyantı geçerli EVENT_JSON loglar;
    /// `get_logs()` ile doğrulanır.
    #[test]
    fn every_action_variant_logs_valid_nep297_event() {
        let ctx = VMContextBuilder::new().build();
        near_sdk::testing_env!(ctx);
        let actions = sample_actions();
        log_actions(&actions);
        let logs = get_logs();
        assert_eq!(logs.len(), EXPECTED.len());
        for (log, (event, kind)) in logs.iter().zip(EXPECTED) {
            assert!(log.starts_with("EVENT_JSON:"), "önek yok: {log}");
            let json: serde_json::Value =
                serde_json::from_str(&log["EVENT_JSON:".len()..]).unwrap();
            assert_eq!(json["standard"], "rolet");
            assert_eq!(json["version"], "1.0.0");
            assert_eq!(json["event"], event);
            let data = json["data"].as_array().unwrap();
            assert_eq!(data.len(), 1);
            assert_eq!(data[0]["kind"], kind);
        }
    }

    /// T-114: payload alanları ve iç içe `ItemResult` etiketi doğru gider.
    #[test]
    fn payload_fields_and_nested_result_serialize() {
        let ctx = VMContextBuilder::new().build();
        near_sdk::testing_env!(ctx);
        let shot = Action::Shot { player: 1, target: Target::SelfTarget, shell: Shell::Blank, damage: 0 };
        log_action(&shot);
        let json: serde_json::Value =
            serde_json::from_str(&get_logs()[0]["EVENT_JSON:".len()..]).unwrap();
        assert_eq!(json["event"], "shot");
        assert_eq!(json["data"][0]["kind"], "Shot");
        assert_eq!(json["data"][0]["player"], 1);
        assert_eq!(json["data"][0]["target"], "SelfTarget");
        assert_eq!(json["data"][0]["shell"], "Blank");
        assert_eq!(json["data"][0]["damage"], 0);

        let loupe = Action::ItemUsed {
            player: 0,
            item: Item::Loupe,
            slot: 0,
            result: ItemResult::Private { pos: 0, shell: Shell::Live },
        };
        log_action(&loupe);
        let json: serde_json::Value =
            serde_json::from_str(&get_logs()[1]["EVENT_JSON:".len()..]).unwrap();
        assert_eq!(json["event"], "item_used");
        assert_eq!(json["data"][0]["result"]["kind"], "Private");
        assert_eq!(json["data"][0]["result"]["pos"], 0);
        assert_eq!(json["data"][0]["result"]["shell"], "Live");
    }
}
