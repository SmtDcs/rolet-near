//! Sandbox entegrasyon testleri (T-117, DESIGN §4/§8).
//!
//! Gereksinim: `cargo near build non-reproducible-wasm --no-abi` ile üretilmiş
//! `target/near/rolet_near.wasm` dosyası. İlk çalıştırmada `near-workspaces`
//! `near-sandbox` ikilisini otomatik indirir/önbelleğe alır.

use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::json;
use near_workspaces::types::{Gas as WsGas, NearToken as WsNearToken};
use rolet_near::config::Config;
use rolet_near::game::{Action, Target};
use rolet_near::matches::{PlayerState, Status, MIN_ACTION_GAS};
use rolet_near::nft::{CharacterState, Kind};
use rolet_near::views::{LeaderboardEntry, MatchView};
use sha2::{Digest, Sha256};
use std::path::Path;

fn load_wasm() -> Vec<u8> {
    let wasm_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/near/rolet_near.wasm");
    std::fs::read(&wasm_path).unwrap_or_else(|e| {
        panic!(
            "WASM bulunamadı ({}): {e}. Önce `cargo near build non-reproducible-wasm --no-abi` çalıştırın.",
            wasm_path.display()
        )
    })
}

fn compute_commitment(secret: [u8; 32], account: &str, match_id: u64) -> Base64VecU8 {
    let mut hasher = Sha256::new();
    hasher.update(secret);
    hasher.update(account.as_bytes());
    hasher.update(match_id.to_le_bytes());
    Base64VecU8(hasher.finalize().to_vec())
}

#[tokio::test]
async fn full_match_sandbox_integration() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;

    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    // Kontratı başlat ve treasury'yi fonla.
    contract
        .call("new")
        .args_json(json!({
            "owner": owner.id(),
            "config": Config::default(),
        }))
        .transact()
        .await?
        .into_result()?;

    owner
        .call(contract.id(), "fund_treasury")
        .deposit(WsNearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;

    // İki oyuncu karakter satın alır (her biri 1 NEAR → %5 ops, %95 treasury).
    let alice_token: String = alice
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?
        .json()?;

    let bob_token: String = bob
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Ayarci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?
        .json()?;

    let match_id = 7u64;
    let secret_a = [0x11u8; 32];
    let secret_b = [0x22u8; 32];
    let commit_a = compute_commitment(secret_a, alice.id().as_str(), match_id);
    let commit_b = compute_commitment(secret_b, bob.id().as_str(), match_id);

    // join ×2
    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": bob.id(),
            "commit": commit_a,
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;

    bob.call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": alice.id(),
            "commit": commit_b,
            "token_id": bob_token,
        }))
        .transact()
        .await?
        .into_result()?;

    // reveal ×2
    alice
        .call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(match_id),
            "secret": Base64VecU8(secret_a.to_vec()),
        }))
        .transact()
        .await?
        .into_result()?;

    bob.call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(match_id),
            "secret": Base64VecU8(secret_b.to_vec()),
        }))
        .transact()
        .await?
        .into_result()?;

    let m_active: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .expect("maç mevcut olmalı");
    assert_eq!(m_active.status, Status::Active);

    // Hamle döngüsünden önce bakiyeleri ve treasury'yi kaydet.
    let alice_bal_before = alice.view_account().await?.balance;
    let bob_bal_before = bob.view_account().await?.balance;
    let treasury_before: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;

    // Döngü: sıra kimdeyse `fire(Opponent)` ile maçı bitir.
    let mut turns = 0u32;
    let mut last_match = m_active;
    while last_match.status == Status::Active {
        turns += 1;
        assert!(turns <= 100, "maç 100 hamlede bitmeli");
        let actor = if last_match.game.turn == 0 { &alice } else { &bob };
        let res = actor
            .call(contract.id(), "fire")
            .args_json(json!({
                "match_id": U64(match_id),
                "target": Target::Opponent,
            }))
            .transact()
            .await?
            .into_result()?;
        let actions: Vec<Action> = res.json()?;
        assert!(!actions.is_empty());

        last_match = contract
            .view("get_match")
            .args_json(json!({ "match_id": U64(match_id) }))
            .await?
            .json::<Option<MatchView>>()?
            .expect("maç mevcut olmalı");
    }

    assert_eq!(last_match.status, Status::Finished);
    let winner_idx = last_match.winner.expect("kazanan atanmalı");
    assert!(last_match.log.is_empty(), "T-116: bitmiş maç logu budanmış olmalı");

    let alice_bal_after = alice.view_account().await?.balance;
    let bob_bal_after = bob.view_account().await?.balance;
    let treasury_after: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;

    // Ödül (0.1 NEAR = 100 mNEAR) + maç içi depolama artışı treasury'den düşer;
    // kazanan bakiyesi ödülle artar (gaz düşüldükten sonra net +80 mNEAR üzeri).
    let expected_reward = near_sdk::NearToken::from_millinear(100);
    assert!(
        treasury_after <= treasury_before.saturating_sub(expected_reward),
        "treasury_after ({treasury_after}) <= treasury_before - reward ({}) olmalı",
        treasury_before.saturating_sub(expected_reward)
    );
    assert!(
        treasury_after >= treasury_before.saturating_sub(expected_reward.saturating_add(near_sdk::NearToken::from_millinear(50))),
        "depolama kesintisi makul aralıkta olmalı: before={treasury_before}, after={treasury_after}"
    );

    let (winner_before, winner_after, winner_account) = if winner_idx == 0 {
        (alice_bal_before, alice_bal_after, alice.id())
    } else {
        (bob_bal_before, bob_bal_after, bob.id())
    };
    assert!(
        winner_after > winner_before.saturating_add(WsNearToken::from_millinear(80)),
        "kazanan ({winner_account}) bakiyesi ödülle artmalı: before={winner_before}, after={winner_after}"
    );

    // Her iki karakterin durability = 9 ve kilitler açık.
    for tok in [&alice_token, &bob_token] {
        let ch: CharacterState = contract
            .view("get_character")
            .args_json(json!({ "token_id": tok }))
            .await?
            .json::<Option<CharacterState>>()?
            .expect("karakter kayıtlı");
        assert_eq!(ch.durability, 9);
        assert_eq!(ch.locked_in, None);
    }

    // Oyuncu durumları ve leaderboard güncellendi.
    let winner_st: PlayerState = contract
        .view("get_player")
        .args_json(json!({ "account_id": winner_account }))
        .await?
        .json()?;
    assert_eq!(winner_st.wins, 1);
    assert_eq!(winner_st.played, 1);
    assert_eq!(winner_st.active_match, None);

    let lb: Vec<LeaderboardEntry> = contract
        .view("leaderboard")
        .args_json(json!({ "from": 0, "limit": 10 }))
        .await?
        .json()?;
    assert_eq!(lb.len(), 2);
    assert_eq!(&lb[0].account_id, winner_account);
    assert_eq!(lb[0].wins, 1);

    Ok(())
}

#[tokio::test]
async fn fix01_gas_floor_rejects_low_gas_and_passes_min_action_gas() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;

    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({
            "owner": owner.id(),
            "config": Config::default(),
        }))
        .transact()
        .await?
        .into_result()?;

    owner
        .call(contract.id(), "fund_treasury")
        .deposit(WsNearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;

    let alice_token: String = alice
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?
        .json()?;

    let bob_token: String = bob
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Ayarci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?
        .json()?;

    let match_id = 17u64;
    let secret_a = [0x31u8; 32];
    let secret_b = [0x42u8; 32];
    let commit_a = compute_commitment(secret_a, alice.id().as_str(), match_id);
    let commit_b = compute_commitment(secret_b, bob.id().as_str(), match_id);

    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": bob.id(),
            "commit": commit_a,
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;

    bob.call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": alice.id(),
            "commit": commit_b,
            "token_id": bob_token,
        }))
        .transact()
        .await?
        .into_result()?;

    let low_gas = WsGas::from_tgas(MIN_ACTION_GAS.as_tgas() - 1);
    let min_gas = WsGas::from_tgas(MIN_ACTION_GAS.as_tgas());

    // Düşük gazla reveal çekilişten/durum değişiminden önce reddedilir.
    let low_reveal = alice
        .call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(match_id),
            "secret": Base64VecU8(secret_a.to_vec()),
        }))
        .gas(low_gas)
        .transact()
        .await?;
    assert!(low_reveal.is_failure(), "low-gas reveal must fail");
    let err_str = format!("{:?}", low_reveal.failures());
    assert!(err_str.contains("insufficient gas"), "unexpected failure: {err_str}");

    let mv_before: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    assert_eq!(mv_before.revealed, [false, false]);

    // MIN_ACTION_GAS ile iki reveal geçer.
    alice
        .call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(match_id),
            "secret": Base64VecU8(secret_a.to_vec()),
        }))
        .gas(min_gas)
        .transact()
        .await?
        .into_result()?;
    bob.call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(match_id),
            "secret": Base64VecU8(secret_b.to_vec()),
        }))
        .gas(min_gas)
        .transact()
        .await?
        .into_result()?;

    // Düşük gazla use_item ve fire çekilişten önce reddedilir.
    let mut mv: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    let first_actor = if mv.game.turn == 0 { &alice } else { &bob };

    let low_item = first_actor
        .call(contract.id(), "use_item")
        .args_json(json!({
            "match_id": U64(match_id),
            "slot": 0,
            "steal_slot": null,
        }))
        .gas(low_gas)
        .transact()
        .await?;
    assert!(low_item.is_failure());
    assert!(format!("{:?}", low_item.failures()).contains("insufficient gas"));

    let low_fire = first_actor
        .call(contract.id(), "fire")
        .args_json(json!({
            "match_id": U64(match_id),
            "target": Target::Opponent,
        }))
        .gas(low_gas)
        .transact()
        .await?;
    assert!(low_fire.is_failure());
    assert!(format!("{:?}", low_fire.failures()).contains("insufficient gas"));

    let mv_after_low: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    assert_eq!(mv_after_low.seq, mv.seq);
    assert_eq!(mv_after_low.game.load.remaining, mv.game.load.remaining);

    // Tüm maç (en pahalı maç sonu + transfer dalı dahil) tam MIN_ACTION_GAS ile geçer.
    let mut turns = 0u32;
    while mv.status == Status::Active {
        turns += 1;
        assert!(turns <= 120);
        let actor = if mv.game.turn == 0 { &alice } else { &bob };
        let res = actor
            .call(contract.id(), "fire")
            .args_json(json!({
                "match_id": U64(match_id),
                "target": Target::Opponent,
            }))
            .gas(min_gas)
            .transact()
            .await?
            .into_result()?;
        let actions: Vec<Action> = res.json()?;
        assert!(!actions.is_empty());
        mv = contract
            .view("get_match")
            .args_json(json!({ "match_id": U64(match_id) }))
            .await?
            .json::<Option<MatchView>>()?
            .unwrap();
    }
    assert_eq!(mv.status, Status::Finished);
    Ok(())
}
