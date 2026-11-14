//! Kontrat yapılandırması (T-101). Tüm ayarlanabilir oyun değerleri tek yerde
//! (TASKS genel kural: "Belirsiz oyun değerleri tek bir Config/sabit yerinde durur").

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::NearToken;

/// Round başına parametreler (DESIGN §3.1 tablosu; index = round - 1).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
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
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
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
    /// Tincture iyi yolu olasılığı (yüzde) — Buckshot 1.2.1+ mekaniği: %50.
    pub tincture_good_pct: u32,
    /// Oyuncu başına eşya slotu — Rolet eli: 4.
    pub max_items: u8,
    /// Yeni maç kabulü için gereken minimum treasury bakiyesi (DESIGN §4.7).
    pub min_treasury: NearToken,
    /// Her yüklemedeki toplam fişek/göz sayısı — Rolet: 8.
    pub load_size: u8,
    /// Her yüklemedeki minimum dolu fişek sayısı (`ChainSource` aralığı alt sınırı, vars. 2).
    pub min_live: u8,
    /// Her yüklemedeki maksimum dolu fişek sayısı (`ChainSource` aralığı üst sınırı, vars. 6).
    pub max_live: u8,
    /// Maç başındaki ortak eşya destesinde her türden kaç kopya bulunduğu (9 × 4 = 36).
    pub copies_per_item: u8,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            rounds: vec![
                RoundConfig {
                    start_hp: 4,
                    items_per_load: 4,
                    heal_cut_at: None,
                },
                RoundConfig {
                    start_hp: 4,
                    items_per_load: 4,
                    heal_cut_at: None,
                },
                RoundConfig {
                    start_hp: 4,
                    items_per_load: 4,
                    heal_cut_at: Some(2),
                },
            ],
            turn_ms: 45_000,
            reveal_ms: 60_000,
            reward: NearToken::from_millinear(100),
            price: NearToken::from_near(1),
            ops_bps: 500,
            durability: 10,
            allowance_hint: NearToken::from_millinear(500),
            tincture_good_pct: 50,
            max_items: 4,
            min_treasury: NearToken::from_millinear(100),
            load_size: 8,
            min_live: 2,
            max_live: 6,
            copies_per_item: 4,
        }
    }
}

impl Config {
    /// Yapılandırma sınırlarını doğrular (S-05); ihlal varsa hata mesajı döner.
    pub fn check(&self) -> Result<(), &'static str> {
        if self.rounds.len() != 3 {
            return Err("rounds must have length 3");
        }
        if self.max_items > 8 {
            return Err("max_items cannot exceed 8");
        }
        for r in &self.rounds {
            if r.start_hp == 0 || r.start_hp > 8 {
                return Err("start_hp must be between 1 and 8");
            }
            if let Some(cut) = r.heal_cut_at {
                if cut >= r.start_hp {
                    return Err("heal_cut_at must be below start_hp");
                }
            }
            if r.items_per_load > self.max_items {
                return Err("items_per_load cannot exceed max_items");
            }
        }
        if self.tincture_good_pct > 100 {
            return Err("tincture_good_pct cannot exceed 100");
        }
        if self.ops_bps > 10_000 {
            return Err("ops_bps cannot exceed 10_000");
        }
        if self.durability < 1 {
            return Err("durability must be at least 1");
        }
        let max_sustainable = 2u128
            .saturating_mul(self.price.as_yoctonear())
            .saturating_mul((10_000 - self.ops_bps) as u128)
            / (10_000u128 * self.durability as u128);
        if self.reward.as_yoctonear() > max_sustainable {
            return Err("reward exceeds sustainable payout bound");
        }
        if self.turn_ms < 15_000 {
            return Err("turn_ms must be at least 15_000");
        }
        if self.reveal_ms < self.turn_ms {
            return Err("reveal_ms must be at least turn_ms");
        }
        if self.load_size < 2 || self.load_size > 8 {
            return Err("load_size must be between 2 and 8");
        }
        if self.min_live < 1 {
            return Err("min_live must be at least 1");
        }
        if self.load_size.saturating_sub(self.max_live) < 2 {
            return Err("load_size - max_live must be at least 2");
        }
        if self.min_live > self.max_live {
            return Err("min_live cannot exceed max_live");
        }
        if self.copies_per_item < 1 {
            return Err("copies_per_item must be at least 1");
        }
        Ok(())
    }

    /// `new` ve `set_config` içinde panikle doğrulama yapar (S-05).
    pub fn validate(&self) {
        if let Err(msg) = self.check() {
            near_sdk::env::panic_str(msg);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::borsh;

    /// T-101 bitti kuralı: `Config::default()` Rolet değerleri + Buckshot round yapısı.
    #[test]
    fn default_matches_design() {
        let c = Config::default();
        assert_eq!(c.rounds.len(), 3);
        assert_eq!(
            c.rounds[0],
            RoundConfig {
                start_hp: 4,
                items_per_load: 4,
                heal_cut_at: None,
            }
        );
        assert_eq!(
            c.rounds[1],
            RoundConfig {
                start_hp: 4,
                items_per_load: 4,
                heal_cut_at: None,
            }
        );
        assert_eq!(
            c.rounds[2],
            RoundConfig {
                start_hp: 4,
                items_per_load: 4,
                heal_cut_at: Some(2),
            }
        );
        assert_eq!(c.turn_ms, 45_000);
        assert_eq!(c.reveal_ms, 60_000);
        assert_eq!(c.reward, NearToken::from_millinear(100));
        assert_eq!(c.price, NearToken::from_near(1));
        assert_eq!(c.ops_bps, 500);
        assert_eq!(c.durability, 10);
        assert_eq!(c.allowance_hint, NearToken::from_millinear(500));
        assert_eq!(c.tincture_good_pct, 50);
        assert_eq!(c.max_items, 4);
        assert_eq!(c.min_treasury, NearToken::from_millinear(100));
        assert_eq!(c.load_size, 8);
        assert_eq!(c.min_live, 2);
        assert_eq!(c.max_live, 6);
        assert_eq!(c.copies_per_item, 4);
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

    #[test]
    fn init_config_json_matches_default() {
        let raw = include_str!("../init-config.json");
        let parsed: Config = near_sdk::serde_json::from_str(raw)
            .expect("init-config.json Config olarak ayrıştırılmalı");
        assert_eq!(parsed, Config::default());
        let raw_val: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(raw).unwrap();
        let def_val = near_sdk::serde_json::to_value(Config::default()).unwrap();
        assert_eq!(raw_val, def_val, "init-config.json alanları Config::default() ile bire bir eşleşmeli");
    }

    #[test]
    fn validate_accepts_default_and_rejects_all_s05_violations() {
        assert!(Config::default().check().is_ok());

        let mut bad = Config::default();
        bad.rounds.pop();
        assert_eq!(bad.check(), Err("rounds must have length 3"));

        let mut bad = Config::default();
        bad.rounds[0].start_hp = 0;
        assert_eq!(bad.check(), Err("start_hp must be between 1 and 8"));

        let mut bad = Config::default();
        bad.rounds[0].start_hp = 9;
        assert_eq!(bad.check(), Err("start_hp must be between 1 and 8"));

        let mut bad = Config::default();
        bad.rounds[2].heal_cut_at = Some(bad.rounds[2].start_hp);
        assert_eq!(bad.check(), Err("heal_cut_at must be below start_hp"));

        let mut bad = Config::default();
        bad.max_items = 9;
        assert_eq!(bad.check(), Err("max_items cannot exceed 8"));

        let mut bad = Config::default();
        bad.rounds[1].items_per_load = bad.max_items + 1;
        assert_eq!(bad.check(), Err("items_per_load cannot exceed max_items"));

        let mut bad = Config::default();
        bad.tincture_good_pct = 101;
        assert_eq!(bad.check(), Err("tincture_good_pct cannot exceed 100"));

        let mut bad = Config::default();
        bad.ops_bps = 10_001;
        assert_eq!(bad.check(), Err("ops_bps cannot exceed 10_000"));

        let mut bad = Config::default();
        bad.durability = 0;
        assert_eq!(bad.check(), Err("durability must be at least 1"));

        // Varsayılanlarla maks sürdürülebilir ödül: 2 * 1 * 0.95 / 10 = 0.19 NEAR.
        let mut bad = Config::default();
        bad.reward = NearToken::from_millinear(191);
        assert_eq!(bad.check(), Err("reward exceeds sustainable payout bound"));

        let mut ok = Config::default();
        ok.reward = NearToken::from_millinear(190);
        assert!(ok.check().is_ok());

        let mut bad = Config::default();
        bad.turn_ms = 14_999;
        assert_eq!(bad.check(), Err("turn_ms must be at least 15_000"));

        let mut bad = Config::default();
        bad.reveal_ms = bad.turn_ms - 1;
        assert_eq!(bad.check(), Err("reveal_ms must be at least turn_ms"));

        let mut bad = Config::default();
        bad.load_size = 1;
        assert_eq!(bad.check(), Err("load_size must be between 2 and 8"));

        let mut bad = Config::default();
        bad.load_size = 9;
        assert_eq!(bad.check(), Err("load_size must be between 2 and 8"));

        let mut bad = Config::default();
        bad.min_live = 0;
        assert_eq!(bad.check(), Err("min_live must be at least 1"));

        let mut bad = Config::default();
        bad.max_live = bad.load_size;
        assert_eq!(bad.check(), Err("load_size - max_live must be at least 2"));
        bad.max_live = bad.load_size - 1;
        assert_eq!(bad.check(), Err("load_size - max_live must be at least 2"));
        bad.max_live = bad.load_size - 2;
        assert!(bad.check().is_ok());

        let mut bad = Config::default();
        bad.min_live = 5;
        bad.max_live = 4;
        assert_eq!(bad.check(), Err("min_live cannot exceed max_live"));

        let mut ok_fixed = Config::default();
        ok_fixed.min_live = 5;
        ok_fixed.max_live = 5;
        assert!(ok_fixed.check().is_ok());

        let mut bad = Config::default();
        bad.copies_per_item = 0;
        assert_eq!(bad.check(), Err("copies_per_item must be at least 1"));
    }
}
