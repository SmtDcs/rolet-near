# Rolet NEAR — F1 Düzeltme Raporu (FIX-01..FIX-12)

> Dal: `near` · Tarih: 2026-11-14 · Kapsam: `docs/near/AUDIT-F1.md` §4 `FIX-01..FIX-12` (`FIX-13..FIX-17` kapsam dışı bırakıldı).

## Özet Tablo

| Madde | Durum | Commit | Test / Derleme Sonucu | Açık Kalanlar |
|---|---|---|---|---|
| **FIX-01** · Minimum prepaid gas (`MIN_ACTION_GAS`) | tamam | `d9a17e4` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (112 lib + 2 integration) ✓ | Yok (F3 öncesi `FIX-16`'da tam gaz tablosu `VERSIONS.md`'ye işlenecek) |
| **FIX-02** · Sonuca bağlı panik yok (`use_item` / `deal_items`) | tamam | `ebed798` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (114 lib + 2 integration) ✓ | Yok |
| **FIX-03** · Depolama muhasebesi (`settle_storage` / `assert_solvent`) | tamam | `0297a16` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (115 lib + 2 integration) ✓ | Yok |
| **FIX-04** · Ödeme güvenliği (serbest bakiye + `owed`) | tamam | `b2e6f72` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (117 lib + 3 integration) ✓ | Yok |
| **FIX-05** · Kayıt silme ve `match_key` | tamam | `95a93ba` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (118 lib + 3 integration) ✓ | Finished kayıtların yaşlandırılarak silinmesi v2/F3 kapsamı |
| **FIX-06** · `Config::validate` ve maç snapshot'ı | tamam | `f577589` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (122 lib + 3 integration) ✓ | Yok |
| **FIX-07** · Oyuncu başına kablo (`heal_cut: [bool; 2]`, `HealCut { player }`) | tamam | `ed99cac` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (123 lib + 3 integration) ✓ | Yok |
| **FIX-08** · Varsayılanlar (`rounds[2].start_hp = 6`, `tincture_good_pct = 50`) | tamam *(VALUES ile değişti)* | `adb067d` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (123 lib + 3 integration) ✓ | VALUES-FIX-01..03 ile güncellendi (`rounds[2].start_hp = 4`, `max_items = 4`, `tincture_good_pct = 50`) |
| **FIX-09** · Yük formülü (DoN `live = max(1, total/2)`, `r1_loads`, `r2_first_load`) | tamam *(VALUES ile değişti)* | `a1f227c` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (123 lib + 3 integration) ✓ | VALUES ile 8 gözlü + `min_live..=max_live` (`2..=6`) şemasına geçildi |
| **FIX-10** · Son fişekte Flask (`end_turn()` + testere sıfırlama) | tamam | `134664d` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (123 lib + 3 integration) ✓ | Yok |
| **FIX-11** · Yeni yükte kelepçe kalkar (`reload`) | tamam | `1ae4c7a` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (124 lib + 3 integration) ✓ | Yok |
| **FIX-12** · Kural kararları (`DECISIONS.md` #7–#9, `RoundConfig::item_bag`, `Ticker` ≤1) | tamam | `8e9abe1` | `cargo near build non-reproducible-wasm` ✓ · `cargo test` (124 lib + 3 integration) ✓ | Yok |

## Son Doğrulama (FIX-12 sonrası)

- `cd contracts/rolet-near && cargo near build non-reproducible-wasm`: başarılı (`target/near/rolet_near.wasm`, 333.9 KB / 333876 bytes).
- `cd contracts/rolet-near && cargo test`:
  - `unittests src/lib.rs`: **124 passed; 0 failed**
  - `tests/integration.rs` (yerel `near-workspaces` sandbox): **3 passed; 0 failed** (`full_match_sandbox_integration`, `fix01_gas_floor_rejects_low_gas_and_passes_min_action_gas`, `fix04_low_balance_match_finishes_and_credits_owed`)
- Güncellenen doküman ve şemalar: `docs/near/DESIGN.md`, `docs/near/DECISIONS.md`, `docs/near/schema/match-view.json`.
- Dokunulmayan maddeler: `FIX-13..FIX-17` (kapsam dışı, F3 öncesi ele alınacak).

FIX-F1 DONE
