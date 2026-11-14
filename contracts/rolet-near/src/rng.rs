//! Zincir rastgeleliği (T-107, DESIGN §4.4/§4.6).
//!
//! Oyun içi tüm rastgelelik tek bir tohum zincirinden gelir: her çekişte
//! `sha256(match_seed ‖ draw_nonce ‖ env::random_seed())`. `match_seed`
//! commit-reveal sayesinde tek bir tarafın (blok üreticisi dahil)
//! seçemediği bir değerdir; `draw_nonce` her çekişte artar ve maç state'ine
//! yazılır (aynı konum için ikinci çekiliş asla yapılmaz);
//! `env::random_seed()` işlemin çalıştığı bloğa aittir — gönderen oyuncu
//! işlemi gönderirken bilemez (DESIGN §4.6).

use crate::game::{Shell, ShellSource};
use near_sdk::env;
use near_sdk::AccountId;

/// Commit-reveal taahhüdü (DESIGN §4.4):
/// `sha256(secret ‖ account_id ‖ match_id_le)`.
pub fn commitment(secret: [u8; 32], account: &AccountId, match_id: u64) -> [u8; 32] {
    let account_str: &str = account.as_ref();
    let mut buf = Vec::with_capacity(32 + account_str.len() + 8);
    buf.extend_from_slice(&secret);
    buf.extend_from_slice(account_str.as_bytes());
    buf.extend_from_slice(&match_id.to_le_bytes());
    env::sha256_array(&buf)
}

/// Lazy-draw zincir kaynağı. `seed` maç tohumu; `nonce` maçın
/// `draw_nonce` sayacına canlı referanstır (her çekişte +1).
pub struct ChainSource<'a> {
    seed: [u8; 32],
    nonce: &'a mut u64,
}

impl<'a> ChainSource<'a> {
    pub fn new(seed: [u8; 32], nonce: &'a mut u64) -> Self {
        Self { seed, nonce }
    }

    /// Zincirin bir sonraki elemanı: `sha256(seed ‖ nonce_le ‖ random_seed)`.
    fn next_hash(&mut self) -> [u8; 32] {
        let mut buf = Vec::with_capacity(32 + 8 + 32);
        buf.extend_from_slice(&self.seed);
        buf.extend_from_slice(&self.nonce.to_le_bytes());
        buf.extend_from_slice(&env::random_seed_array());
        *self.nonce += 1;
        env::sha256_array(&buf)
    }
}

impl ShellSource for ChainSource<'_> {
    fn draw(&mut self, live_unfixed: u8, blank_unfixed: u8) -> Shell {
        let total = live_unfixed as u32 + blank_unfixed as u32;
        if total == 0 {
            // `Load::fix` yalnız çekilmemiş konum varken çeker; savunma.
            // Nonce tüketilmez.
            return Shell::Blank;
        }
        let h = self.next_hash();
        let r = u32::from_be_bytes([h[0], h[1], h[2], h[3]]);
        // P(dolu) = live_unfixed / total (DESIGN §4.6). 2^32'ye tam
        // bölünmeyen total'lerde ihmal edilebilir modulo sapması vardır.
        if r % total < live_unfixed as u32 {
            Shell::Live
        } else {
            Shell::Blank
        }
    }

    fn roll(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        let h = self.next_hash();
        let r = u32::from_be_bytes([h[0], h[1], h[2], h[3]]);
        r % n
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;

    fn set_block_seed(seed: [u8; 32]) {
        let ctx = VMContextBuilder::new().random_seed(seed).build();
        near_sdk::testing_env!(ctx);
    }

    fn hex32(s: &str) -> [u8; 32] {
        (0..32)
            .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap())
            .collect::<Vec<u8>>()
            .try_into()
            .unwrap()
    }

    /// T-107: aynı tohum + aynı nonce + aynı blok → birebir aynı sonuç.
    #[test]
    fn same_seed_nonce_and_block_are_deterministic() {
        set_block_seed([7u8; 32]);
        let mut n1 = 0u64;
        let mut n2 = 0u64;
        let mut a = ChainSource::new([1u8; 32], &mut n1);
        let mut b = ChainSource::new([1u8; 32], &mut n2);
        for (live, blank) in [(1u8, 1u8), (0, 3), (2, 2), (1, 6)] {
            assert_eq!(a.draw(live, blank), b.draw(live, blank));
        }
        for _ in 0..4 {
            assert_eq!(a.roll(1_000_000_007), b.roll(1_000_000_007));
        }
        assert_eq!(n1, n2);
        assert_eq!(n1, 8);
    }

    /// T-107: blok tohumu değişince (yeni blok) sonuçlar değişir.
    #[test]
    fn different_block_seed_changes_results() {
        let mut n1 = 0u64;
        let mut n2 = 0u64;
        set_block_seed([7u8; 32]);
        let mut a = ChainSource::new([1u8; 32], &mut n1);
        let a_rolls: Vec<u32> = (0..4).map(|_| a.roll(1_000_000_007)).collect();
        set_block_seed([8u8; 32]);
        let mut b = ChainSource::new([1u8; 32], &mut n2);
        let b_rolls: Vec<u32> = (0..4).map(|_| b.roll(1_000_000_007)).collect();
        assert_ne!(a_rolls, b_rolls);
    }

    /// T-107: maç tohumu değişince (farklı maç) sonuçlar değişir.
    #[test]
    fn different_match_seed_changes_results() {
        set_block_seed([7u8; 32]);
        let mut n1 = 0u64;
        let mut n2 = 0u64;
        let mut a = ChainSource::new([1u8; 32], &mut n1);
        let mut b = ChainSource::new([9u8; 32], &mut n2);
        let a_rolls: Vec<u32> = (0..4).map(|_| a.roll(1_000_000_007)).collect();
        let b_rolls: Vec<u32> = (0..4).map(|_| b.roll(1_000_000_007)).collect();
        assert_ne!(a_rolls, b_rolls);
        // Nonce ilerleyişi tohumdan bağımsız.
        assert_eq!(n1, n2);
    }

    /// T-107: draw, dokümandaki formülü birebir izler (nonce 0'dan başlar).
    #[test]
    fn draw_follows_documented_formula() {
        set_block_seed([9u8; 32]);
        let seed = [2u8; 32];
        let mut n = 0u64;
        let mut src = ChainSource::new(seed, &mut n);
        let shell = src.draw(3, 5);
        let mut buf = Vec::new();
        buf.extend_from_slice(&seed);
        buf.extend_from_slice(&0u64.to_le_bytes());
        buf.extend_from_slice(&env::random_seed_array());
        let h = env::sha256_array(&buf);
        let r = u32::from_be_bytes([h[0], h[1], h[2], h[3]]);
        let expected = if r % 8 < 3 { Shell::Live } else { Shell::Blank };
        assert_eq!(shell, expected);
        assert_eq!(n, 1);
    }

    /// T-107: `roll` her zaman [0, n) içinde; n=0 tanımlı (0).
    #[test]
    fn roll_stays_in_range() {
        set_block_seed([1u8; 32]);
        let mut n = 0u64;
        let mut src = ChainSource::new([3u8; 32], &mut n);
        assert_eq!(src.roll(0), 0);
        for _ in 0..64 {
            assert!(src.roll(7) < 7);
            assert!(src.roll(1_000_000_003) < 1_000_000_003);
        }
    }

    /// T-107: commitment sabit vektörü (T-302 web istemcisi aynı baytları
    /// üretmeli) ve girdi duyarlılığı.
    #[test]
    fn commitment_fixed_vector_and_sensitivity() {
        set_block_seed([0u8; 32]);
        let secret = [0x11u8; 32];
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let bob: AccountId = "bob.testnet".parse().unwrap();
        assert_eq!(
            commitment(secret, &alice, 7),
            hex32("bfd4433fc4571479b34eca63f5a7883a2e7b71f97f22afa32e217a01753a479b")
        );
        assert_ne!(commitment(secret, &alice, 7), commitment([0x12u8; 32], &alice, 7));
        assert_ne!(commitment(secret, &alice, 7), commitment(secret, &bob, 7));
        assert_ne!(commitment(secret, &alice, 7), commitment(secret, &alice, 8));
    }

    /// EK KARAR: ChainSource ile 10 000 tohumda 8 gözlü tabanca sınırları (`2..=6` dolu,
    /// `2..=6` boş), yükleme anında sıranın gizli kalması ve atış anında lazy draw ile
    /// çekilen fişeklerin duyurulan `(live, blank)` sayılarıyla birebir eşleşmesi.
    #[test]
    fn chain_source_new_load_and_lazy_draw_match_across_10000_seeds() {
        use crate::config::Config;
        use crate::game::new_load;

        let cfg = Config::default();
        let mut seen_live = [false; 9];

        for seed_num in 0..10_000u64 {
            if seed_num % 250 == 0 {
                // Her blok penceresinde mock VM gaz sayacını yenile ve blok tohumunu değiştir.
                let mut block_seed = [0xA5u8; 32];
                block_seed[..8].copy_from_slice(&seed_num.to_le_bytes());
                set_block_seed(block_seed);
            }
            let mut match_seed = [0u8; 32];
            match_seed[..8].copy_from_slice(&seed_num.to_le_bytes());
            match_seed[8..16].copy_from_slice(&seed_num.wrapping_mul(0x9E37_79B9_7F4A_7C15).to_le_bytes());

            let mut nonce = 0u64;
            let mut load = {
                let mut src = ChainSource::new(match_seed, &mut nonce);
                new_load(&cfg, &mut src)
            };

            assert_eq!(nonce, 1, "yalnızca live sayısı çekilmiş olmalı");
            assert_eq!(load.remaining, 8);
            assert!(
                load.announced_live >= cfg.min_live && load.announced_live <= cfg.max_live,
                "live={} aralık dışı (seed {seed_num})",
                load.announced_live
            );
            assert_eq!(load.announced_blank, 8 - load.announced_live);
            assert!(load.announced_blank >= 2 && load.announced_blank <= 6);
            assert!(load.fixed.iter().all(|s| s.is_none()), "sıra yüklemede gizli kalmalı");
            seen_live[load.announced_live as usize] = true;

            let expected_live = load.announced_live;
            let expected_blank = load.announced_blank;
            let mut drawn_live = 0u8;
            let mut drawn_blank = 0u8;

            {
                let mut src = ChainSource::new(match_seed, &mut nonce);
                while !load.is_empty() {
                    let shell = load.current(&mut src).unwrap();
                    load.advance(shell);
                    match shell {
                        Shell::Live => drawn_live += 1,
                        Shell::Blank => drawn_blank += 1,
                    }
                }
            }

            assert_eq!(drawn_live, expected_live, "seed {seed_num}");
            assert_eq!(drawn_blank, expected_blank, "seed {seed_num}");
            assert_eq!(nonce, 9, "1 load + 8 lazy draw = 9 nonce");
        }

        for live in cfg.min_live..=cfg.max_live {
            assert!(seen_live[live as usize], "live={live} 10000 tohumda görülmedi");
        }
    }
}
