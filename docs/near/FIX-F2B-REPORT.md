# Rolet NEAR — FIX-F2B Raporu (AUDIT-F2 §5)

- **Tarih:** 2026-11-14
- **Dal:** `near`
- **Kapsam:** `docs/near/AUDIT-F2.md` §5 (`FIX-F2B-1`, `FIX-F2B-3`, `FIX-F2B-4` [yalnızca `migrate` doc yorumu], `FIX-F2B-5` [yalnızca dokümantasyon]). `FIX-F2B-2` ayrı worktree'de yürütüldüğü için kapsam dışı bırakıldı.
- **Ön koşul commit (`AUDIT-F2.md`):** `cbfadc6` — `docs: AUDIT-F2 report`

---

## 1. Madde Bazlı Durum Özeti

| Madde | Durum | Commit | Özet ve Doğrulama |
|---|---|---|---|
| **FIX-F2B-1** | **tamam** | `a303e12` | `contracts/rolet-near/src/matches.rs` içinde `MIN_ACTION_GAS` `15 Tgas`'a çıkarıldı. `contracts/rolet-near/tests/integration.rs` içinde `fix_f2_6_full_100_leaderboard_gas_measurement` testine `play_full_match_gas` yardımcısıyla tabloya girmemiş iki oyuncunun (`p100` vs `p101`, `match_id = 1050`) maçı ve dolu 100×64B tablodan `(0, 1)` kuyruğunu kovma dalı eklendi; `worst` yalnızca `MIN_ACTION_GAS` aranan aksiyonlardan (`reveal`, `fire`) hesaplandı (`join` çıkarıldı) ve gaz belirtmeyen tüm aksiyon çağrılarına `.gas(min_action_gas())` eklendi. Ölçülen değerler (`FULL_LB_GAS`): `join_99 = 3.532 Tgas`, `join_100 = 3.688 Tgas`, `join_full = 3.271 Tgas`, `join_full_b = 3.398 Tgas`, `reveal_max = 2.800 Tgas`, `fire_normal_max = 3.227 Tgas`, `fire_match_end_in_table = 4.959 Tgas`, `fire_match_end_evict = 5.296 Tgas` (`5_296_380_675_734`, `15 Tgas` altında **2.83×** güvenlik payı). `docs/near/DESIGN.md` (`:284`, `:382`, `:586`) ve `docs/near/VERSIONS.md` (`:70-74`) tek ve tutarlı değerlere çekildi. Doğrulama: `cargo near build non-reproducible-wasm` + 135 birim + 9 sandbox entegrasyon testi geçti. |
| **FIX-F2B-2** | **kapsam dışı (açık)** | — | T-119 testnet deploy/CLI maçı ve `near-cli-rs` sözdizimi doğrulaması ayrı bir worktree'de yürütüldüğü için bu oturumda yapılmadı; script'ler çalıştırılmadı. |
| **FIX-F2B-3** | **tamam** | `cbc5d23` | `contracts/rolet-near/scripts/deploy-testnet.sh` içindeki `INIT_CONFIG_JSON` bloğu `contracts/rolet-near/init-config.json` dosyasına çıkarıldı; script dosyadan okuyacak şekilde güncellendi (`bash -n` sözdizimi temiz; script çalıştırılmadı). `contracts/rolet-near/src/config.rs` içine `init_config_json_matches_default` birim testi eklenerek `init-config.json` ile `Config::default()` yapı ve JSON değer eşitliği sabitlendi. `contracts/rolet-near/tests/integration.rs` içinde `fix_f2_1_function_call_access_key_flow` ret assertion'ları `assert_fc_tx_rejected` yardımcısıyla `InvalidAccessKeyError` hata türlerini (`MethodNameMismatch`, `DepositWithFunctionCall`, `NotEnoughAllowance`) denetleyecek şekilde sıkılaştırıldı (`join(deposit=1)`, `buy_character(0)`, `fund_treasury(0)`, `claim_reward`, owner metodları). Doğrulama: `cargo near build non-reproducible-wasm` + 136 birim + 9 sandbox entegrasyon testi geçti. |
| **FIX-F2B-4** | **tamam (doc yorumu)** | `f75646c` | `contracts/rolet-near/src/lib.rs` içindeki `Contract::migrate` doc yorumuna eski borsh düzeninin `env::state_read::<Contract>()` sırasında çökeceği ve gerçek göç için ayrı `ContractV1` gerektiği notu eklendi. Kural gereği `contracts/rolet-near/src/nft.rs` içindeki `base_uri = "https://rolet.app"` değerine dokunulmadı. Doğrulama: `cargo near build non-reproducible-wasm` + 136 birim + 9 sandbox entegrasyon testi geçti. |
| **FIX-F2B-5** | **tamam** | `9ba2ebe` | `docs/near/CLIENT-CONTRACT.md` oluşturularak F2 istemci sözleşmesi notları (a–d) belgelendi: (a) `claim_reward` FC key ile çağrılamaz (`MethodNameMismatch`), UI cüzdana yönlendirmeli ve ön ödemeyi `MIN_ACTION_GAS`'a yakın tutmalı; (b) `ItemResult::Private` log ve olay çıktısına yazıldığı için UI rakibin `Private` aksiyonlarını göstermemeli; (c) `get_actions` pencere boşluğunda (`first_seq > since_seq + 1`) `get_match` snapshot'ı alınmalı; (d) `reveal` sırları argv/log'a girmemeli. Doğrulama: `cargo near build non-reproducible-wasm` + 136 birim + 9 sandbox entegrasyon testi geçti. |

---

## 2. Son Doğrulama ve Derleme Özeti

- **WASM Derleme:** `cd contracts/rolet-near && cargo near build non-reproducible-wasm` → Başarılı (`target/near/rolet_near.wasm`, `346.8 KB`, `346786 bytes`, SHA-256 `b10c8634937bf8d795a491e93dfdebbbb82ab0da01a8836b52ee1994d5251e51`).
- **Testler:** `cd contracts/rolet-near && cargo test` → **136 birim testi** (`src/lib.rs`) geçti, **9 sandbox entegrasyon testi** (`tests/integration.rs`) geçti, 0 hata, 0 atlanan test.

---

## 3. Açık Kalanlar

1. **FIX-F2B-2 (T-119 + `near-cli-rs` sözdizimi):** Ayrı worktree'de yürütülüyor; script çalıştırma ve testnet işlemleri bu oturumda yasak olduğu için yapılmadı.
2. **NFT `base_uri` (`contracts/rolet-near/src/nft.rs:213`, `"https://rolet.app"`):** Kural gereği dokunulmadı; deploy öncesi Samet teyidi bekliyor (`docs/near/DECISIONS.md` #12).

FIX-F2B DONE
