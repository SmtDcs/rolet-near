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
    let treasury_before_match: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;

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

    // Hamle döngüsünden önce bakiyeleri kaydet.
    let alice_bal_before = alice.view_account().await?.balance;
    let bob_bal_before = bob.view_account().await?.balance;

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

    // Ödül (0.1 NEAR = 100 mNEAR) + kalıcı maç özeti depolaması treasury'den düşer;
    // geçici active_keys/log/fixed budaması iade edilir (FIX-03-R);
    // kazanan bakiyesi ödülle artar (gaz düşüldükten sonra net +80 mNEAR üzeri).
    let expected_reward = near_sdk::NearToken::from_millinear(100);
    assert!(
        treasury_after <= treasury_before_match.saturating_sub(expected_reward),
        "treasury_after ({treasury_after}) <= treasury_before_match - reward ({}) olmalı",
        treasury_before_match.saturating_sub(expected_reward)
    );
    assert!(
        treasury_after >= treasury_before_match.saturating_sub(expected_reward.saturating_add(near_sdk::NearToken::from_millinear(50))),
        "depolama kesintisi makul aralıkta olmalı: before={treasury_before_match}, after={treasury_after}"
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

#[tokio::test]
async fn fix04_low_balance_match_finishes_and_credits_owed() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;

    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let root = worker.root_account()?;
    // WASM depolama kilidi (~10^-5 NEAR/B) üstünde çok az serbest bakiye bırak.
    let wasm_stake = WsNearToken::from_yoctonear(
        (wasm.len() as u128) * 10_000_000_000_000_000_000,
    );
    let sub = root
        .create_subaccount("lowbal")
        .initial_balance(wasm_stake.saturating_add(WsNearToken::from_millinear(60)))
        .transact()
        .await?
        .into_result()?;
    let contract = sub.deploy(&wasm).await?.into_result()?;

    let mut cfg = Config::default();
    cfg.price = near_sdk::NearToken::from_millinear(200);
    cfg.ops_bps = 5_000;
    cfg.durability = 1;
    cfg.reward = near_sdk::NearToken::from_millinear(190);
    cfg.min_treasury = near_sdk::NearToken::from_millinear(100);

    contract
        .call("new")
        .args_json(json!({
            "owner": owner.id(),
            "config": cfg,
        }))
        .transact()
        .await?
        .into_result()?;

    let alice_token: String = alice
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(WsNearToken::from_millinear(200))
        .transact()
        .await?
        .into_result()?
        .json()?;

    let bob_token: String = bob
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Ayarci }))
        .deposit(WsNearToken::from_millinear(200))
        .transact()
        .await?
        .into_result()?
        .json()?;

    owner
        .call(contract.id(), "withdraw_ops")
        .transact()
        .await?
        .into_result()?;

    let match_id = 27u64;
    let secret_a = [0x51u8; 32];
    let secret_b = [0x62u8; 32];

    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": bob.id(),
            "commit": compute_commitment(secret_a, alice.id().as_str(), match_id),
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;

    bob.call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": alice.id(),
            "commit": compute_commitment(secret_b, bob.id().as_str(), match_id),
            "token_id": bob_token,
        }))
        .transact()
        .await?
        .into_result()?;

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

    let mut mv: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();

    let mut turns = 0u32;
    while mv.status == Status::Active {
        turns += 1;
        assert!(turns <= 120);
        let actor = if mv.game.turn == 0 { &alice } else { &bob };
        actor
            .call(contract.id(), "fire")
            .args_json(json!({
                "match_id": U64(match_id),
                "target": Target::Opponent,
            }))
            .transact()
            .await?
            .into_result()?;
        mv = contract
            .view("get_match")
            .args_json(json!({ "match_id": U64(match_id) }))
            .await?
            .json::<Option<MatchView>>()?
            .unwrap();
    }

    assert_eq!(mv.status, Status::Finished);
    let winner_idx = mv.winner.expect("kazanan atanmalı");
    let winner_acc = &mv.players[winner_idx as usize];
    let winner_st: PlayerState = contract
        .view("get_player")
        .args_json(json!({ "account_id": winner_acc }))
        .await?
        .json()?;
    assert!(
        winner_st.owed > near_sdk::NearToken::ZERO,
        "düşük bakiyede ödül owed'a yazılmalı, owed={}",
        winner_st.owed
    );
    assert_eq!(winner_st.owed, near_sdk::NearToken::from_millinear(190));

    Ok(())
}

fn compile_mock_nft_receiver() -> Vec<u8> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let src_path = manifest_dir.join("target/mock_nft_receiver.rs");
    let wasm_path = manifest_dir.join("target/mock_nft_receiver.wasm");
    let src = r#"#![no_std]
#[link(wasm_import_module = "env")]
extern "C" {
    fn input(register_id: u64);
    fn register_len(register_id: u64) -> u64;
    fn read_register(register_id: u64, ptr: u64);
    fn value_return(value_len: u64, value_ptr: u64);
}

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[no_mangle]
pub extern "C" fn nft_on_transfer() {
    unsafe {
        input(0);
        let len = register_len(0) as usize;
        let mut buf = [0u8; 1024];
        let copy_len = if len < buf.len() { len } else { buf.len() };
        read_register(0, buf.as_mut_ptr() as u64);
        let needle = b"refund";
        let mut found = false;
        let mut i = 0usize;
        while i + needle.len() <= copy_len {
            let mut j = 0usize;
            while j < needle.len() && buf[i + j] == needle[j] {
                j += 1;
            }
            if j == needle.len() {
                found = true;
                break;
            }
            i += 1;
        }
        if found {
            value_return(4, b"true".as_ptr() as u64);
        } else {
            value_return(5, b"false".as_ptr() as u64);
        }
    }
}
"#;
    std::fs::write(&src_path, src).expect("mock_nft_receiver.rs yazılabilmeli");
    let status = std::process::Command::new("rustc")
        .args([
            "--target",
            "wasm32-unknown-unknown",
            "--crate-type",
            "cdylib",
            "-C",
            "opt-level=z",
            "-o",
        ])
        .arg(&wasm_path)
        .arg(&src_path)
        .status()
        .expect("rustc çağrılabilmeli");
    assert!(status.success(), "mock_nft_receiver wasm derlenebilmeli");
    std::fs::read(&wasm_path).expect("mock_nft_receiver.wasm okunabilmeli")
}

/// FIX-13: `nft_transfer_call` sonrası alıcı kontrat `true` (iade) döndürdüğünde
/// `nft_resolve_transfer` token'ı eski sahibine geri taşır; `false` durumunda
/// token alıcıda kalır; `nft_metadata().base_uri` set edilmiştir.
#[tokio::test]
async fn fix13_nft_transfer_call_refunds_on_receiver_request() -> Result<(), Box<dyn std::error::Error>>
{
    let worker = near_workspaces::sandbox().await?;
    let wasm = load_wasm();
    let contract = worker.dev_deploy(&wasm).await?;
    let receiver = worker.dev_deploy(&compile_mock_nft_receiver()).await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({ "owner": owner.id(), "config": Config::default() }))
        .transact()
        .await?
        .into_result()?;

    // S-14: base_uri artık set.
    let meta: near_sdk::serde_json::Value = contract.view("nft_metadata").await?.json()?;
    assert_eq!(meta["base_uri"], "https://rolet.app");

    let token_id: String = alice
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(near_sdk::NearToken::from_near(1))
        .transact()
        .await?
        .json()?;

    // 1. Alıcı iade ister (`msg = "refund"` -> `nft_on_transfer` returns `true`).
    let kept: bool = alice
        .call(contract.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": receiver.id(),
            "token_id": token_id,
            "approval_id": null,
            "memo": null,
            "msg": "refund",
        }))
        .deposit(near_sdk::NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .json()?;
    assert!(!kept, "iade istendiğinde token alıcıda kalmamalı");

    let tok_after_refund: near_sdk::serde_json::Value = contract
        .view("nft_token")
        .args_json(json!({ "token_id": token_id }))
        .await?
        .json()?;
    assert_eq!(tok_after_refund["owner_id"], alice.id().as_str());

    // 2. Alıcı kabul eder (`msg = "accept"` -> `nft_on_transfer` returns `false`).
    let kept2: bool = alice
        .call(contract.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": receiver.id(),
            "token_id": token_id,
            "approval_id": null,
            "memo": null,
            "msg": "accept",
        }))
        .deposit(near_sdk::NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .json()?;
    assert!(kept2, "kabul edildiğinde token alıcıda kalmalı");

    let tok_after_accept: near_sdk::serde_json::Value = contract
        .view("nft_token")
        .args_json(json!({ "token_id": token_id }))
        .await?
        .json()?;
    assert_eq!(tok_after_accept["owner_id"], receiver.id().as_str());

    Ok(())
}
