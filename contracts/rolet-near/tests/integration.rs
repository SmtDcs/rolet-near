//! Sandbox entegrasyon testleri (T-117, DESIGN §4/§8).
//!
//! Gereksinim: `cargo near build non-reproducible-wasm --no-abi` ile üretilmiş
//! `target/near/rolet_near.wasm` dosyası. İlk çalıştırmada `near-workspaces`
//! `near-sandbox` ikilisini otomatik indirir/önbelleğe alır.

use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::json;
use near_workspaces::types::{Gas as WsGas, NearToken as WsNearToken};
use rolet_near::config::Config;
use rolet_near::game::{Action, GameState, Item, Target};
use rolet_near::matches::{PlayerState, Status, MIN_ACTION_GAS, TIMEOUT_GRACE_MS};
use rolet_near::nft::{CharacterState, Kind};
use rolet_near::views::{LeaderboardEntry, MatchView};
use sha2::{Digest, Sha256};
use std::path::Path;

fn assert_wasm_fresh(wasm_path: &Path) {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let wasm_mtime = std::fs::metadata(wasm_path)
        .and_then(|m| m.modified())
        .expect("rolet_near.wasm mtime okunabilmeli");
    // `cargo near build` ikili baytlar aynı kaldığında `target/near/rolet_near.wasm`
    // mtime'ını korumuş olabilir; bu nedenle release wasm mtime'ı da dikkate alınır.
    let release_wasm = manifest_dir.join("target/wasm32-unknown-unknown/release/rolet_near.wasm");
    let effective_mtime = std::fs::metadata(&release_wasm)
        .and_then(|m| m.modified())
        .map(|rm| wasm_mtime.max(rm))
        .unwrap_or(wasm_mtime);

    let mut paths = vec![manifest_dir.join("Cargo.toml")];
    if let Ok(entries) = std::fs::read_dir(manifest_dir.join("src")) {
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|s| s.to_str()) == Some("rs") {
                paths.push(entry.path());
            }
        }
    }
    for src in paths {
        if let Ok(meta) = std::fs::metadata(&src) {
            if let Ok(src_mtime) = meta.modified() {
                assert!(
                    effective_mtime >= src_mtime,
                    "WASM bayatladı: {} ({:?}) > derlenmiş wasm ({:?}). Önce `cargo near build non-reproducible-wasm` çalıştırın.",
                    src.display(),
                    src_mtime,
                    effective_mtime
                );
            }
        }
    }
}

fn load_wasm() -> Vec<u8> {
    let wasm_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/near/rolet_near.wasm");
    assert_wasm_fresh(&wasm_path);
    std::fs::read(&wasm_path).unwrap_or_else(|e| {
        panic!(
            "WASM bulunamadı ({}): {e}. Önce `cargo near build non-reproducible-wasm` çalıştırın.",
            wasm_path.display()
        )
    })
}

async fn assert_sandbox_solvent(
    contract: &near_workspaces::Contract,
    expected_ops_yocto: u128,
    extra_owed_yocto: u128,
) -> Result<(), Box<dyn std::error::Error>> {
    let acc = contract.view_account().await?;
    let treasury: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;
    let stake_yocto = (acc.storage_usage as u128) * 10_000_000_000_000_000_000u128;
    let free_yocto = acc.balance.as_yoctonear().saturating_sub(stake_yocto);
    let liability_yocto = treasury.as_yoctonear() + expected_ops_yocto + extra_owed_yocto;
    assert!(
        free_yocto >= liability_yocto,
        "sandbox solventlik ihlali: free={free_yocto}, treasury+ops+owed={liability_yocto}"
    );
    Ok(())
}

async fn fast_forward_until_ms(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    target_ms: u64,
) -> Result<(), Box<dyn std::error::Error>> {
    for _ in 0..40 {
        let now_ms = worker.view_block().await?.timestamp() / 1_000_000;
        if now_ms >= target_ms {
            return Ok(());
        }
        worker.fast_forward(25).await?;
    }
    panic!("sandbox bloğu hedef zamana ({target_ms} ms) ilerletilemedi");
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
    // EK2: 36 kartlık ortak desteden R1 başında 4+4 = 8 kart dağıtıldı → 28 kaldı.
    assert_eq!(m_active.deck_remaining, 28);
    let deck_rem: Option<u16> = contract
        .view("get_deck_remaining")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json()?;
    assert_eq!(deck_rem, Some(28));

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

fn can_use_item_without_steal(game: &GameState, actor: usize, item: Item) -> bool {
    match item {
        Item::Loupe | Item::Flask | Item::Magnet => !game.load.is_empty(),
        Item::Ticker => true,
        Item::Pipe => !game.heal_cut[actor] && game.hp[actor] < game.max_hp,
        Item::Tincture => !game.heal_cut[actor],
        Item::Shackle => game.shackled != Some((1 - actor) as u8) && !game.shackle_broke_this_turn,
        Item::Hacksaw => !game.saw_active,
        Item::Lockpick => false,
    }
}

fn find_steal_slot(game: &GameState, actor: usize) -> Option<u8> {
    let opp = 1 - actor;
    for (idx, &opp_item) in game.items[opp].iter().enumerate() {
        if opp_item != Item::Lockpick && can_use_item_without_steal(game, actor, opp_item) {
            return Some(idx as u8);
        }
    }
    None
}

/// FIX-16: sandbox'ta `cancel` ve iki aşamalı `claim_timeout` (`Revealing` ve
/// `Active + TIMEOUT_GRACE_MS`) akışları + bakiye değişmezi doğrulaması.
#[tokio::test]
async fn fix16_cancel_and_claim_timeout_both_stages() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({ "owner": owner.id(), "config": Config::default() }))
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
    let expected_ops = near_sdk::NearToken::from_millinear(100).as_yoctonear();
    assert_sandbox_solvent(&contract, expected_ops, 0).await?;

    // 1. join -> cancel: maç silinir, durability + treasury geri döner.
    let treasury_before_cancel: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;
    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(101),
            "opponent": bob.id(),
            "commit": compute_commitment([0x10u8; 32], alice.id().as_str(), 101),
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;
    let cancel_res = alice
        .call(contract.id(), "cancel")
        .args_json(json!({ "match_id": U64(101) }))
        .transact()
        .await?
        .into_result()?;
    println!("GAS cancel = {} gas", cancel_res.total_gas_burnt);
    let cancelled_mv: Option<MatchView> = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(101) }))
        .await?
        .json()?;
    assert!(cancelled_mv.is_none());
    let alice_ch: CharacterState = contract
        .view("get_character")
        .args_json(json!({ "token_id": alice_token }))
        .await?
        .json::<Option<CharacterState>>()?
        .unwrap();
    assert_eq!(alice_ch.durability, 10);
    assert_eq!(alice_ch.locked_in, None);
    let treasury_after_cancel: near_sdk::NearToken = contract.view("get_treasury").await?.json()?;
    assert_eq!(treasury_after_cancel, treasury_before_cancel);
    assert_sandbox_solvent(&contract, expected_ops, 0).await?;

    // 2. Revealing timeout: yalnız Alice açar → reveal_deadline_ms sonrası Alice iade alır, Bob kaybeder.
    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(102),
            "opponent": bob.id(),
            "commit": compute_commitment([0x11u8; 32], alice.id().as_str(), 102),
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;
    bob.call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(102),
            "opponent": alice.id(),
            "commit": compute_commitment([0x22u8; 32], bob.id().as_str(), 102),
            "token_id": bob_token,
        }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(102),
            "secret": Base64VecU8([0x11u8; 32].to_vec()),
        }))
        .transact()
        .await?
        .into_result()?;

    let mv_rev: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(102) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    fast_forward_until_ms(&worker, mv_rev.reveal_deadline_ms + 500).await?;

    let rev_to_res = alice
        .call(contract.id(), "claim_timeout")
        .args_json(json!({ "match_id": U64(102) }))
        .transact()
        .await?
        .into_result()?;
    println!("GAS claim_timeout(Revealing) = {} gas", rev_to_res.total_gas_burnt);
    let mv_rev_after: Option<MatchView> = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(102) }))
        .await?
        .json()?;
    assert!(mv_rev_after.is_none());
    let alice_ch2: CharacterState = contract
        .view("get_character")
        .args_json(json!({ "token_id": alice_token }))
        .await?
        .json::<Option<CharacterState>>()?
        .unwrap();
    let bob_ch2: CharacterState = contract
        .view("get_character")
        .args_json(json!({ "token_id": bob_token }))
        .await?
        .json::<Option<CharacterState>>()?
        .unwrap();
    assert_eq!(alice_ch2.durability, 10);
    assert_eq!(bob_ch2.durability, 9);
    assert_sandbox_solvent(&contract, expected_ops, 0).await?;

    // 3. Active timeout (+ TIMEOUT_GRACE_MS): süre+grace sonrası bekleyen taraf kazanır ve ödül alır.
    alice
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(103),
            "opponent": bob.id(),
            "commit": compute_commitment([0x33u8; 32], alice.id().as_str(), 103),
            "token_id": alice_token,
        }))
        .transact()
        .await?
        .into_result()?;
    bob.call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(103),
            "opponent": alice.id(),
            "commit": compute_commitment([0x44u8; 32], bob.id().as_str(), 103),
            "token_id": bob_token,
        }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(103),
            "secret": Base64VecU8([0x33u8; 32].to_vec()),
        }))
        .transact()
        .await?
        .into_result()?;
    bob.call(contract.id(), "reveal")
        .args_json(json!({
            "match_id": U64(103),
            "secret": Base64VecU8([0x44u8; 32].to_vec()),
        }))
        .transact()
        .await?
        .into_result()?;

    let mv_act: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(103) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    let waiter = if mv_act.game.turn == 0 { &bob } else { &alice };
    let waiter_idx = 1 - mv_act.game.turn;

    // Deadline öncesinde reddedilmeli.
    let early = waiter
        .call(contract.id(), "claim_timeout")
        .args_json(json!({ "match_id": U64(103) }))
        .transact()
        .await?;
    assert!(early.is_failure(), "erken claim_timeout başarısız olmalı");

    fast_forward_until_ms(&worker, mv_act.deadline_ms + TIMEOUT_GRACE_MS + 500).await?;
    let act_to_res = waiter
        .call(contract.id(), "claim_timeout")
        .args_json(json!({ "match_id": U64(103) }))
        .transact()
        .await?
        .into_result()?;
    println!("GAS claim_timeout(Active) = {} gas", act_to_res.total_gas_burnt);
    let mv_done: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(103) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    assert_eq!(mv_done.status, Status::Finished);
    assert_eq!(mv_done.winner, Some(waiter_idx));
    assert_sandbox_solvent(&contract, expected_ops, 0).await?;

    Ok(())
}

/// FIX-16 + VALUES-FIX-05: 9 eşyanın tamamını sandbox'ta `use_item` ile doğrular,
/// VALUES (R1 4+4, R2 reload 4+4, maç sonu + transfer) gaz tüketimlerini ölçer ve
/// `MIN_ACTION_GAS` güvenlik payını teyit eder.
#[tokio::test]
async fn fix16_use_all_items_and_measure_values_gas() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({ "owner": owner.id(), "config": Config::default() }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(contract.id(), "fund_treasury")
        .deposit(WsNearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let buy_a = alice
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    let buy_gas = buy_a.total_gas_burnt.as_gas();
    let mut alice_token: String = buy_a.json()?;
    let mut bob_token: String = bob
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Ayarci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await?
        .into_result()?
        .json()?;
    let mut expected_ops = near_sdk::NearToken::from_millinear(100).as_yoctonear();

    let mut used_items: Vec<Item> = Vec::new();
    let mut max_join_gas = 0u64;
    let mut max_reveal1_gas = 0u64;
    let mut max_reveal2_gas = 0u64;
    let mut max_fire_gas = 0u64;
    let mut max_r2_reload_gas = 0u64;
    let mut max_match_end_gas = 0u64;
    let mut max_use_item_gas = 0u64;

    for m_idx in 0..12u64 {
        if used_items.len() == 9 && max_r2_reload_gas > 0 && max_match_end_gas > 0 {
            break;
        }
        // Dayanıklılık bittiyse yeniden karakter al.
        let ch_a: CharacterState = contract
            .view("get_character")
            .args_json(json!({ "token_id": alice_token }))
            .await?
            .json::<Option<CharacterState>>()?
            .unwrap();
        if ch_a.durability == 0 {
            alice_token = alice
                .call(contract.id(), "buy_character")
                .args_json(json!({ "kind": Kind::Kuleci }))
                .deposit(WsNearToken::from_near(1))
                .transact()
                .await?
                .into_result()?
                .json()?;
            bob_token = bob
                .call(contract.id(), "buy_character")
                .args_json(json!({ "kind": Kind::Ayarci }))
                .deposit(WsNearToken::from_near(1))
                .transact()
                .await?
                .into_result()?
                .json()?;
            expected_ops += near_sdk::NearToken::from_millinear(100).as_yoctonear();
        }

        let match_id = 200 + m_idx;
        let sa = [(0x50 + m_idx as u8); 32];
        let sb = [(0x80 + m_idx as u8); 32];
        let j1 = alice
            .call(contract.id(), "join")
            .args_json(json!({
                "match_id": U64(match_id),
                "opponent": bob.id(),
                "commit": compute_commitment(sa, alice.id().as_str(), match_id),
                "token_id": alice_token,
            }))
            .transact()
            .await?
            .into_result()?;
        max_join_gas = max_join_gas.max(j1.total_gas_burnt.as_gas());
        let j2 = bob
            .call(contract.id(), "join")
            .args_json(json!({
                "match_id": U64(match_id),
                "opponent": alice.id(),
                "commit": compute_commitment(sb, bob.id().as_str(), match_id),
                "token_id": bob_token,
            }))
            .transact()
            .await?
            .into_result()?;
        max_join_gas = max_join_gas.max(j2.total_gas_burnt.as_gas());

        let r1 = alice
            .call(contract.id(), "reveal")
            .args_json(json!({ "match_id": U64(match_id), "secret": Base64VecU8(sa.to_vec()) }))
            .transact()
            .await?
            .into_result()?;
        max_reveal1_gas = max_reveal1_gas.max(r1.total_gas_burnt.as_gas());
        let r2 = bob
            .call(contract.id(), "reveal")
            .args_json(json!({ "match_id": U64(match_id), "secret": Base64VecU8(sb.to_vec()) }))
            .transact()
            .await?
            .into_result()?;
        max_reveal2_gas = max_reveal2_gas.max(r2.total_gas_burnt.as_gas());

        let mut mv: MatchView = contract
            .view("get_match")
            .args_json(json!({ "match_id": U64(match_id) }))
            .await?
            .json::<Option<MatchView>>()?
            .unwrap();
        assert_eq!(mv.game.items[0].len(), 4);
        assert_eq!(mv.game.items[1].len(), 4);

        let mut steps = 0u32;
        while mv.status == Status::Active {
            steps += 1;
            assert!(steps <= 160);
            let turn = mv.game.turn as usize;
            let actor = if turn == 0 { &alice } else { &bob };

            // Henüz test edilmemiş kullanılabilir eşya varsa onu kullan.
            let mut chosen: Option<(u8, Option<u8>, Item)> = None;
            for (idx, &it) in mv.game.items[turn].iter().enumerate() {
                if used_items.contains(&it) {
                    continue;
                }
                if it == Item::Lockpick {
                    if let Some(steal) = find_steal_slot(&mv.game, turn) {
                        chosen = Some((idx as u8, Some(steal), it));
                        break;
                    }
                } else if can_use_item_without_steal(&mv.game, turn, it) {
                    chosen = Some((idx as u8, None, it));
                    break;
                }
            }

            if let Some((slot, steal_slot, item)) = chosen {
                let res = actor
                    .call(contract.id(), "use_item")
                    .args_json(json!({
                        "match_id": U64(match_id),
                        "slot": slot,
                        "steal_slot": steal_slot,
                    }))
                    .transact()
                    .await?
                    .into_result()?;
                let g = res.total_gas_burnt.as_gas();
                assert!(g < MIN_ACTION_GAS.as_gas(), "use_item({item:?}) gazı MIN_ACTION_GAS'ı aştı: {g}");
                max_use_item_gas = max_use_item_gas.max(g);
                if !used_items.contains(&item) {
                    used_items.push(item);
                }
            } else {
                let res = actor
                    .call(contract.id(), "fire")
                    .args_json(json!({
                        "match_id": U64(match_id),
                        "target": Target::Opponent,
                    }))
                    .transact()
                    .await?
                    .into_result()?;
                let g = res.total_gas_burnt.as_gas();
                assert!(g < MIN_ACTION_GAS.as_gas(), "fire gazı MIN_ACTION_GAS'ı aştı: {g}");
                let actions: Vec<Action> = res.json()?;
                if actions.iter().any(|a| matches!(a, Action::MatchEnded { .. })) {
                    max_match_end_gas = max_match_end_gas.max(g);
                } else if actions.iter().any(|a| matches!(a, Action::RoundEnded { .. }))
                    && actions.iter().any(|a| matches!(a, Action::LoadStarted { .. }))
                {
                    max_r2_reload_gas = max_r2_reload_gas.max(g);
                } else {
                    max_fire_gas = max_fire_gas.max(g);
                }
            }

            mv = contract
                .view("get_match")
                .args_json(json!({ "match_id": U64(match_id) }))
                .await?
                .json::<Option<MatchView>>()?
                .unwrap();
        }
        assert_sandbox_solvent(&contract, expected_ops, 0).await?;
    }

    assert_eq!(used_items.len(), 9, "tüm 9 eşya kullanılmalı, görülenler: {used_items:?}");
    assert!(max_r2_reload_gas > 0, "R2 reload (4+4 eşya) gözlenmeli");
    assert!(max_match_end_gas > 0, "maç sonu + transfer gözlenmeli");

    let tgas = |g: u64| g as f64 / 1e12;
    println!("=== VALUES-FIX-05 / FIX-16 GAS SUMMARY (MIN_ACTION_GAS = {} Tgas) ===", MIN_ACTION_GAS.as_tgas());
    println!("buy_character        : {:.3} Tgas ({buy_gas})", tgas(buy_gas));
    println!("join                 : {:.3} Tgas ({max_join_gas})", tgas(max_join_gas));
    println!("reveal (1st)         : {:.3} Tgas ({max_reveal1_gas})", tgas(max_reveal1_gas));
    println!("reveal (2nd, R1 4+4) : {:.3} Tgas ({max_reveal2_gas})", tgas(max_reveal2_gas));
    println!("use_item (max)       : {:.3} Tgas ({max_use_item_gas})", tgas(max_use_item_gas));
    println!("fire (normal max)    : {:.3} Tgas ({max_fire_gas})", tgas(max_fire_gas));
    println!("fire (R2 reload 4+4) : {:.3} Tgas ({max_r2_reload_gas})", tgas(max_r2_reload_gas));
    println!("fire (match_end+xfer): {:.3} Tgas ({max_match_end_gas})", tgas(max_match_end_gas));

    let worst = max_reveal2_gas
        .max(max_use_item_gas)
        .max(max_fire_gas)
        .max(max_r2_reload_gas)
        .max(max_match_end_gas);
    assert!(
        worst * 2 <= MIN_ACTION_GAS.as_gas(),
        "VALUES en kötü dal ({worst}) >= MIN_ACTION_GAS / 2 ({})",
        MIN_ACTION_GAS.as_gas() / 2
    );

    Ok(())
}

fn read_fc_allowance(
    ak: &near_workspaces::types::AccessKey,
) -> u128 {
    match &ak.permission {
        near_workspaces::types::AccessKeyPermission::FunctionCall(fc) => {
            fc.allowance.expect("FC key allowance atanmış olmalı").as_yoctonear()
        }
        _ => panic!("FunctionCall permission bekleniyordu"),
    }
}

/// FIX-F2-1: Gerçek `FunctionCall` access key ile tam maç, yasaklı metod reddi,
/// allowance düşüş ölçümü ve `NotEnoughAllowance` doğrulaması.
#[tokio::test]
async fn fix_f2_1_function_call_access_key_flow() -> Result<(), Box<dyn std::error::Error>> {
    let wasm = load_wasm();
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({ "owner": owner.id(), "config": Config::default() }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(contract.id(), "fund_treasury")
        .deposit(WsNearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;

    // Karakterler cüzdan (full-access) anahtarıyla satın alınır (payable).
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

    // Alice, Bob ve Owner hesaplarına yalnızca oyun metodlarına izin veren FC key ekle.
    let fc_methods = [
        "join",
        "reveal",
        "cancel",
        "fire",
        "use_item",
        "claim_timeout",
    ];
    let initial_allowance = WsNearToken::from_millinear(500);
    let alice_sk = near_workspaces::types::SecretKey::from_random(
        near_workspaces::types::KeyType::ED25519,
    );
    let bob_sk = near_workspaces::types::SecretKey::from_random(
        near_workspaces::types::KeyType::ED25519,
    );
    let owner_sk = near_workspaces::types::SecretKey::from_random(
        near_workspaces::types::KeyType::ED25519,
    );

    alice
        .batch(alice.id())
        .add_key(
            alice_sk.public_key(),
            near_workspaces::types::AccessKey::function_call_access(
                contract.id(),
                &fc_methods,
                Some(initial_allowance),
            ),
        )
        .transact()
        .await?
        .into_result()?;
    bob.batch(bob.id())
        .add_key(
            bob_sk.public_key(),
            near_workspaces::types::AccessKey::function_call_access(
                contract.id(),
                &fc_methods,
                Some(initial_allowance),
            ),
        )
        .transact()
        .await?
        .into_result()?;
    owner
        .batch(owner.id())
        .add_key(
            owner_sk.public_key(),
            near_workspaces::types::AccessKey::function_call_access(
                contract.id(),
                &fc_methods,
                Some(initial_allowance),
            ),
        )
        .transact()
        .await?
        .into_result()?;

    let alice_fc =
        near_workspaces::Account::from_secret_key(alice.id().clone(), alice_sk.clone(), &worker);
    let bob_fc =
        near_workspaces::Account::from_secret_key(bob.id().clone(), bob_sk.clone(), &worker);
    let owner_fc =
        near_workspaces::Account::from_secret_key(owner.id().clone(), owner_sk.clone(), &worker);

    // (a) Yasaklı metodlar FC key ile reddedilmeli (depositli ve depositsiz).
    let r_nft = alice_fc
        .call(contract.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": bob.id(), "token_id": alice_token }))
        .deposit(WsNearToken::from_yoctonear(1))
        .transact()
        .await;
    assert!(
        r_nft.as_ref().map(|r| r.is_failure()).unwrap_or(true),
        "nft_transfer FC key ile reddedilmeli: {r_nft:?}"
    );

    let r_buy = alice_fc
        .call(contract.id(), "buy_character")
        .args_json(json!({ "kind": Kind::Kuleci }))
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await;
    assert!(
        r_buy.as_ref().map(|r| r.is_failure()).unwrap_or(true),
        "buy_character FC key ile reddedilmeli: {r_buy:?}"
    );

    let r_fund = alice_fc
        .call(contract.id(), "fund_treasury")
        .deposit(WsNearToken::from_near(1))
        .transact()
        .await;
    assert!(
        r_fund.as_ref().map(|r| r.is_failure()).unwrap_or(true),
        "fund_treasury FC key ile reddedilmeli: {r_fund:?}"
    );

    let r_claim = alice_fc
        .call(contract.id(), "claim_reward")
        .transact()
        .await;
    assert!(
        r_claim.as_ref().map(|r| r.is_failure()).unwrap_or(true),
        "claim_reward FC key ile reddedilmeli: {r_claim:?}"
    );

    for owner_method in ["set_config", "pause", "unpause", "withdraw_ops"] {
        let args = if owner_method == "set_config" {
            json!({ "config": Config::default() })
        } else {
            json!({})
        };
        let r_own = owner_fc
            .call(contract.id(), owner_method)
            .args_json(args)
            .transact()
            .await;
        assert!(
            r_own.as_ref().map(|r| r.is_failure()).unwrap_or(true),
            "owner metodu {owner_method} FC key ile reddedilmeli: {r_own:?}"
        );
    }

    // (b) FC key ile cancel + tam maç oynama ve gerçek allowance düşüş ölçümü.
    let initial_alice = read_fc_allowance(
        &worker.view_access_key(alice.id(), &alice_sk.public_key()).await?,
    );
    assert_eq!(initial_alice, initial_allowance.as_yoctonear());

    // Önce join -> cancel yolu FC key ile test edilir.
    let join_res = alice_fc
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(900),
            "opponent": bob.id(),
            "commit": compute_commitment([0x10u8; 32], alice.id().as_str(), 900),
            "token_id": alice_token,
        }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;
    let after_join_immediate = read_fc_allowance(
        &worker.view_access_key(alice.id(), &alice_sk.public_key()).await?,
    );
    worker.fast_forward(3).await?;
    let after_join_settled = read_fc_allowance(
        &worker.view_access_key(alice.id(), &alice_sk.public_key()).await?,
    );
    let join_drop_immediate = initial_alice.saturating_sub(after_join_immediate);
    let join_drop_settled = initial_alice.saturating_sub(after_join_settled);
    println!(
        "FC_JOIN_MEASURE gas_burnt={} immediate_drop={join_drop_immediate} settled_drop={join_drop_settled}",
        join_res.total_gas_burnt
    );

    let cancel_res = alice_fc
        .call(contract.id(), "cancel")
        .args_json(json!({ "match_id": U64(900) }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;
    worker.fast_forward(3).await?;
    let after_cancel_settled = read_fc_allowance(
        &worker.view_access_key(alice.id(), &alice_sk.public_key()).await?,
    );
    let cancel_drop_settled = after_join_settled.saturating_sub(after_cancel_settled);
    println!(
        "FC_CANCEL_MEASURE gas_burnt={} settled_drop={cancel_drop_settled}",
        cancel_res.total_gas_burnt
    );
    let before_match_alice = after_cancel_settled;

    // Tam maç (join x2, reveal x2, use_item/fire).
    let match_id = 901u64;
    let sa = [0xAAu8; 32];
    let sb = [0xBBu8; 32];
    alice_fc
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": bob.id(),
            "commit": compute_commitment(sa, alice.id().as_str(), match_id),
            "token_id": alice_token,
        }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;
    bob_fc
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(match_id),
            "opponent": alice.id(),
            "commit": compute_commitment(sb, bob.id().as_str(), match_id),
            "token_id": bob_token,
        }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;

    alice_fc
        .call(contract.id(), "reveal")
        .args_json(json!({ "match_id": U64(match_id), "secret": Base64VecU8(sa.to_vec()) }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;
    bob_fc
        .call(contract.id(), "reveal")
        .args_json(json!({ "match_id": U64(match_id), "secret": Base64VecU8(sb.to_vec()) }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await?
        .into_result()?;

    let mut mv: MatchView = contract
        .view("get_match")
        .args_json(json!({ "match_id": U64(match_id) }))
        .await?
        .json::<Option<MatchView>>()?
        .unwrap();
    let mut alice_calls = 2u64; // join + reveal
    let mut bob_calls = 2u64;
    let mut used_one_item = false;
    let mut steps = 0u32;
    while mv.status == Status::Active {
        steps += 1;
        assert!(steps <= 160, "maç 160 adımda bitmeli");
        let turn = mv.game.turn as usize;
        let actor = if turn == 0 {
            alice_calls += 1;
            &alice_fc
        } else {
            bob_calls += 1;
            &bob_fc
        };

        let mut item_slot: Option<(u8, Option<u8>)> = None;
        if !used_one_item {
            for (idx, &it) in mv.game.items[turn].iter().enumerate() {
                if it != Item::Lockpick && can_use_item_without_steal(&mv.game, turn, it) {
                    item_slot = Some((idx as u8, None));
                    break;
                }
            }
        }
        if let Some((slot, steal_slot)) = item_slot {
            actor
                .call(contract.id(), "use_item")
                .args_json(json!({
                    "match_id": U64(match_id),
                    "slot": slot,
                    "steal_slot": steal_slot,
                }))
                .gas(WsGas::from_tgas(30))
                .transact()
                .await?
                .into_result()?;
            used_one_item = true;
        } else {
            actor
                .call(contract.id(), "fire")
                .args_json(json!({
                    "match_id": U64(match_id),
                    "target": Target::Opponent,
                }))
                .gas(WsGas::from_tgas(30))
                .transact()
                .await?
                .into_result()?;
        }

        mv = contract
            .view("get_match")
            .args_json(json!({ "match_id": U64(match_id) }))
            .await?
            .json::<Option<MatchView>>()?
            .unwrap();
    }
    assert_eq!(mv.status, Status::Finished);
    assert!(mv.winner.is_some());
    assert!(used_one_item, "FC key ile en az bir use_item kullanılmalı");

    worker.fast_forward(3).await?;
    let final_alice = read_fc_allowance(
        &worker.view_access_key(alice.id(), &alice_sk.public_key()).await?,
    );
    let final_bob = read_fc_allowance(
        &worker.view_access_key(bob.id(), &bob_sk.public_key()).await?,
    );
    let alice_match_spent = before_match_alice.saturating_sub(final_alice);
    let bob_match_spent = initial_allowance.as_yoctonear().saturating_sub(final_bob);
    assert!(
        final_alice < before_match_alice,
        "Alice allowance düşmüş olmalı: before={before_match_alice}, final={final_alice}"
    );
    assert!(
        final_bob < initial_allowance.as_yoctonear(),
        "Bob allowance düşmüş olmalı: initial={}, final={final_bob}",
        initial_allowance.as_yoctonear()
    );

    println!(
        "FC_ALLOWANCE_MEASURE join_drop={join_drop_settled} cancel_drop={cancel_drop_settled} \
         alice_calls={alice_calls} alice_match_spent={alice_match_spent} \
         bob_calls={bob_calls} bob_match_spent={bob_match_spent}"
    );

    // (c) Allowance tükenince NotEnoughAllowance hatası alınmalı.
    let tiny_sk = near_workspaces::types::SecretKey::from_random(
        near_workspaces::types::KeyType::ED25519,
    );
    let tiny_allowance = WsNearToken::from_yoctonear(100_000_000_000_000_000_000); // 0.0001 NEAR
    alice
        .batch(alice.id())
        .add_key(
            tiny_sk.public_key(),
            near_workspaces::types::AccessKey::function_call_access(
                contract.id(),
                &fc_methods,
                Some(tiny_allowance),
            ),
        )
        .transact()
        .await?
        .into_result()?;
    let alice_tiny_fc =
        near_workspaces::Account::from_secret_key(alice.id().clone(), tiny_sk, &worker);
    let err = alice_tiny_fc
        .call(contract.id(), "join")
        .args_json(json!({
            "match_id": U64(902),
            "opponent": bob.id(),
            "commit": compute_commitment([0xCCu8; 32], alice.id().as_str(), 902),
            "token_id": alice_token,
        }))
        .gas(WsGas::from_tgas(30))
        .transact()
        .await
        .expect_err("yetersiz allowance RPC/tx seviyesinde NotEnoughAllowance ile reddedilmeli");
    let err_str = format!("{err:?}");
    assert!(
        err_str.contains("NotEnoughAllowance"),
        "hata NotEnoughAllowance içermeli, gelen: {err_str}"
    );

    Ok(())
}
