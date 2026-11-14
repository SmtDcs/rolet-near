# Rolet NEAR — FIX-F2 Raporu (AUDIT-F2PRE §4.2)

- **Tarih:** 2026-11-14
- **Dal:** `near`
- **Kapsam:** `docs/near/AUDIT-F2PRE.md` §4.2 (`FIX-F2-1..FIX-F2-8`).
- **Ön koşul commit (`AUDIT-F2PRE.md`):** `3906534` — `docs: AUDIT-F2PRE report`

---

## 1. Madde Bazlı Durum Özeti

| Madde | Durum | Commit | Özet ve Doğrulama |
|---|---|---|---|
| **FIX-F2-1** | **tamam** | `1610c5a` | `contracts/rolet-near/tests/integration.rs` içine `fix_f2_1_function_call_access_key_flow` eklendi: ED25519 `FunctionCall` erişim anahtarları (`[join, reveal, cancel, fire, use_item, claim_timeout]`, `0.5 NEAR` ödenek) ile izin verilmeyen metotların (`nft_transfer`, `buy_character`, `fund_treasury`, `claim_reward`, `set_config`, `pause`, `unpause`, `withdraw_ops`) reddi, `join->cancel` ve tam maç akışı ve ödenek tükenmesinde `NotEnoughAllowance` doğrulandı. Gerçek sandbox ödenek ölçümleri (`30 Tgas` ön yüklemede anlık ~`0.03092 NEAR` rezervasyon; kesinleşmiş net düşüş `join = 0.0002949 NEAR`, `cancel = 0.0002994 NEAR`, tam maç Alice 15 çağrı `0.003949 NEAR`, Bob 13 çağrı `0.003669 NEAR`) `docs/near/DESIGN.md` §4.3'e işlendi. Doğrulama: `cargo near build non-reproducible-wasm` + 131 birim + 7 sandbox entegrasyon testi geçti. |
| **FIX-F2-2** | **kısmi** | `9cb65aa` | `contracts/rolet-near/scripts/deploy-testnet.sh` ve `cli-match.sh` script'leri S1..S6 ile sertleştirildi: `NEAR_NETWORK=testnet` ve `.testnet` son eki zorunluluğu (S1), `eval` kaldırılıp dizi yürütme (S2), `:?` zorunlu env kontrolü (S3), `os.urandom(32)` rastgele commit sırrı (S4), `.env.example` yerine `apps/web/.env.local` çıktısı (S5), `USE_DEFAULT_CONFIG=1\|0` (S6). `bash -n` sözdizimi doğrulandı; kural gereği script'ler ve T-119 çalıştırılmadı. Yalnızca `near --version` (`near-cli-rs 0.31.1`) okundu; `docs/near/VERSIONS.md` ve `docs/near/E2E.md` güncellendi. Doğrulama: `cargo near build non-reproducible-wasm` + 131 birim + 7 sandbox entegrasyon testi geçti. |
| **FIX-F2-3** | **tamam** | `061c6fa` | Ölü `RoundConfig.item_bag` alanı, `Config::check()` içindeki ilgili doğrulama ve `game::item_bag` (`config.rs`, `game.rs`) kaldırıldı; `deploy-testnet.sh` `INIT_CONFIG_JSON` içinden `"item_bag"` çıkarıldı; `docs/near/DECISIONS.md` #7, `docs/near/DESIGN.md` (§2.2, §2.5, §3.1, §3.2, §4.6) ve `docs/near/TASKS.md` (T-103, T-111) güncel mekaniklerle hizalandı (`grep` ile eski "eşyasız"/"8 slot" ibaresi kalmadığı doğrulandı). Doğrulama: `cargo near build non-reproducible-wasm` + 131 birim + 7 sandbox entegrasyon testi geçti. |
| **FIX-F2-4** | **tamam** | `53858f3` | `contracts/rolet-near/src/lib.rs` içine `STATE_VERSION: u32 = 1`, `Contract.state_version: u32`, `#[init(ignore_state)] #[private] pub fn migrate() -> Self` ve `get_state_version` eklendi; `migrate_preserves_state_and_updates_version` birim testi ve `fix_f2_4_migrate_is_private_and_preserves_state` sandbox testi yazıldı. `docs/near/DECISIONS.md` #11 (borsh layout dondurma / redeploy-migrate kuralı) ve #12 (`nft.rs` içindeki `base_uri = "https://rolet.app"` değişmedi; `"base_uri Samet teyidi bekliyor"`) eklendi. Doğrulama: `cargo near build non-reproducible-wasm` + 132 birim + 8 sandbox entegrasyon testi geçti. |
| **FIX-F2-5** | **tamam** | `bb3ef82` | `docs/near/schema/actions-page.json` oluşturuldu ve `views::tests::actions_page_example_json_deserializes` eklendi. Çift kaynaklı `MatchView.deck_remaining` ve `Contract::get_deck_remaining` kaldırılarak `GameState.deck_counts` tek kaynak yapıldı; `docs/near/schema/match-view.json`, `docs/near/DESIGN.md`, `contracts/rolet-near/src/views.rs` ve `contracts/rolet-near/tests/integration.rs` güncellendi. Doğrulama: `cargo near build non-reproducible-wasm` + 133 birim + 8 sandbox entegrasyon testi geçti. |
| **FIX-F2-6** | **tamam** | `73dc1fb` | İlk-100 sıralama listesi kök durumdan çıkarılıp `top_scores: LazyOption<Vec<LeaderboardScore>>` (kayıt başına 9 bayt, <1 KB), `top_slots: LookupMap<u8, AccountId>` ve `top_slot_of: LookupMap<AccountId, u8>` (`StorageKey::TopScores`, `TopSlots`, `TopSlotOf`) yapısına taşındı; `finish_match` güncellemeleri `update_leaderboard_batch` ile toplulaştırıldı (`MIN_ACTION_GAS = 10 Tgas` korundu). `fix_f2_6_full_100_leaderboard_gas_measurement` (102 adet 64 karakterlik hesapla) sandbox ölçümü: `join_99 = 3.527 Tgas`, `join_100 = 3.686 Tgas`, `join_full = 3.271 Tgas`, `fire_normal_max = 3.227 Tgas`, `fire_match_end = 4.964 Tgas` (`10 Tgas` altında `2.01×` güvenlik payı). `docs/near/VERSIONS.md` güncellendi. Doğrulama: `cargo near build non-reproducible-wasm` + 133 birim + 9 sandbox entegrasyon testi geçti. |
| **FIX-F2-7** | **tamam** | `6fdeb9c` | `contracts/rolet-near/src/lib.rs` içine `fix_f2_7_root_size_constant_and_leaderboard_storage_settled` birim testi eklenerek 100 adet 64 karakterlik kayıt eklendikten sonra kök `Contract` borsh bayt boyutunun sabit kaldığı ve `settle_storage`'ın sıralama depolama büyümesini %100 muhasebeleştirdiği/iade ettiği doğrulandı; `docs/near/DESIGN.md` §4.7 güncellendi. Doğrulama: `cargo near build non-reproducible-wasm` + 134 birim + 9 sandbox entegrasyon testi geçti. |
| **FIX-F2-8** | **tamam** | `6f81266` | `contracts/rolet-near/src/matches.rs` içinde `claim_timeout` `Status::Revealing` dalına `TIMEOUT_GRACE_MS` (`2_000 ms`) eklendi (`now >= m.reveal_deadline_ms.saturating_add(TIMEOUT_GRACE_MS)`), `reveal_succeeds_during_grace_window` birim testi eklendi, mevcut reveal timeout testleri ve sandbox `fix16_cancel_and_claim_timeout_both_stages` (`fast_forward_until_ms` uyarlamalı adımla) grace penceresi davranışını doğrulayacak şekilde güncellendi; `docs/near/DESIGN.md` §4.4 güncellendi. Doğrulama: `cargo near build non-reproducible-wasm` + 135 birim + 9 sandbox entegrasyon testi geçti. |

---

## 2. Son Doğrulama ve Derleme Özeti

- **WASM Derleme:** `cd contracts/rolet-near && cargo near build non-reproducible-wasm` → Başarılı (`target/near/rolet_near.wasm`, `346.6 KB`, `346650 bytes`, SHA-256 `988a6d250834f672c7d8aff7b4b1ff703fb30ac6b4f7f2444e7d3991615acedc`).
- **Testler:** `cd contracts/rolet-near && cargo test` → **135 birim testi** (`src/lib.rs`) geçti, **9 sandbox entegrasyon testi** (`tests/integration.rs`) geçti, 0 hata, 0 atlanan test.

---

## 3. Açık Kalanlar

1. **T-119 (Gerçek Testnet Deploy ve İki Hesaplı CLI Maçı — `FIX-F2-2`):** `deploy-testnet.sh` ve `cli-match.sh` sertleştirildi (S1..S6), ancak kısıt gereği script'ler çalıştırılmadı ve testnet'e deploy yapılmadı. **T-119 Samet onayı bekliyor.**
2. **NFT `base_uri` doğrulaması (`FIX-F2-4`):** `contracts/rolet-near/src/nft.rs` içindeki `"https://rolet.app"` değerine kural gereği dokunulmadı (`docs/near/DECISIONS.md` #12'ye kaydedildi). **`base_uri` Samet teyidi bekliyor.**

FIX-F2 DONE
