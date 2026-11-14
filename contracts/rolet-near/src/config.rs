//! Kontrat yapılandırması (T-101). Tüm ayarlanabilir oyun değerleri tek yerde
//! (TASKS genel kural: "Belirsiz oyun değerleri tek bir Config/sabit yerinde durur").

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::NearToken;

/// Round başına parametreler (DESIGN §3.1 tablosu; index = round - 1).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq,
)]
#[serde(crate = "near_sdk::serde")]
pub struct RoundConfig {
    /// Round başlangıç canı.
    pub start_hp: u8,
    /// Her yüklemede dağıtılan eşya sayısı.
    pub items_per_load: u8,
    /// `hp <= heal_cut_at` olunca iyileşme kapanır (R3 eşiği); `None` = kesme yok.
    pub heal_cut_at: Option<u8>,
}

/// Kontrat sabitleri (DESIGN §3.1, §4.9 testnet varsayılanları).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq,
)]
#[serde(crate = "near_sdk::serde")]
pub struct Config {
    /// 3 round tablosu.
    pub rounds: Vec<RoundConfig>,
    /// Hamle süresi (ms) — DESIGN §3.1: 45 s; aşınca `claim_timeout`.
    pub turn_ms: u64,
    /// Reveal aşaması zaman aşımı (ms) — DESIGN §4.4: 60 s.
    pub reveal_ms: u64,
    /// Kazanana sabit ödül — DESIGN §4.9: 0.1 NEAR.
    pub reward: NearToken,
    /// Karakter satış fiyatı — DESIGN §4.9: 1 NEAR.
    pub price: NearToken,
    /// Ops payı (temel puanın 1/10 000'i) — DESIGN §4.9: 500 = %5.
    pub ops_bps: u16,
    /// Karakter başlangıç dayanıklılığı; her `join` -1 — DESIGN §4.9: 10.
    pub durability: u8,
    /// Önerilen function-call allowance — DESIGN §4.9: 0.5 NEAR.
    pub allowance_hint: NearToken,
    /// Tincture iyi yolu olasılığı (yüzde) — DESIGN §2.4: %40 [T-001'de teyit edilecek].
    pub tincture_good_pct: u32,
    /// Oyuncu başına eşya slotu — DESIGN §3.1: 8.
    pub max_items: u8,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            rounds: vec![
                RoundConfig { start_hp: 2, items_per_load: 0, heal_cut_at: None },
                RoundConfig { start_hp: 4, items_per_load: 2, heal_cut_at: None },
                RoundConfig { start_hp: 5, items_per_load: 4, heal_cut_at: Some(2) },
            ],
            turn_ms: 45_000,
            reveal_ms: 60_000,
            reward: NearToken::from_millinear(100),
            price: NearToken::from_near(1),
            ops_bps: 500,
            durability: 10,
            allowance_hint: NearToken::from_millinear(500),
            tincture_good_pct: 40,
            max_items: 8,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::borsh;

    /// T-101 bitti kuralı: `Config::default()` DESIGN §3.1/§4.9 tablosuyla birebir.
    #[test]
    fn default_matches_design() {
        let c = Config::default();
        assert_eq!(c.rounds.len(), 3);
        assert_eq!(
            c.rounds[0],
            RoundConfig { start_hp: 2, items_per_load: 0, heal_cut_at: None }
        );
        assert_eq!(
            c.rounds[1],
            RoundConfig { start_hp: 4, items_per_load: 2, heal_cut_at: None }
        );
        assert_eq!(
            c.rounds[2],
            RoundConfig { start_hp: 5, items_per_load: 4, heal_cut_at: Some(2) }
        );
        assert_eq!(c.turn_ms, 45_000);
        assert_eq!(c.reveal_ms, 60_000);
        assert_eq!(c.reward, NearToken::from_millinear(100));
        assert_eq!(c.price, NearToken::from_near(1));
        assert_eq!(c.ops_bps, 500);
        assert_eq!(c.durability, 10);
        assert_eq!(c.allowance_hint, NearToken::from_millinear(500));
        assert_eq!(c.tincture_good_pct, 40);
        assert_eq!(c.max_items, 8);
    }

    #[test]
    fn config_roundtrip() {
        let c = Config::default();
        let bytes = borsh::to_vec(&c).unwrap();
        let back: Config = borsh::from_slice(&bytes).unwrap();
        assert_eq!(back, c);
        let json = near_sdk::serde_json::to_string(&c).unwrap();
        let back: Config = near_sdk::serde_json::from_str(&json).unwrap();
        assert_eq!(back, c);
    }
}
