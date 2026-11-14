# Rolet NEAR — FIX-F2PRE Raporu (AUDIT-FIX §3, AUDIT-F1 §4 ve EK2)

- **Tarih:** 2026-11-14
- **Dal:** `near`
- **Kapsam:** `docs/near/AUDIT-FIX.md` §3 (`FIX-03-R`, `VALUES-FIX-01..04`), `docs/near/AUDIT-F1.md` §4 (`FIX-13..FIX-17`, `VALUES-FIX-05` gaz ölçümü dahil) ve `EK2` ortak eşya destesi.
- **Ön koşul commit (`AUDIT-FIX.md`):** `d29f882` — `docs: AUDIT-FIX report`

---

## 1. Madde Bazlı Durum Özeti

| Madde | Durum | Commit | Özet ve Doğrulama |
|---|---|---|---|
| **FIX-03-R** | **tamam** | `5812385` | `settle_storage` simetrik hale getirildi (serbest kalan depolama baytı `treasury`'ye iade edilir); `switch`/`switch_at` depolama kullanımını koruyacak şekilde güncellendi. Doğrulama: 126 birim + 3 sandbox entegrasyon testi geçti. |
| **VALUES-FIX-01** | **tamam** | `7fc6ee4` | `Config::default().max_items = 4` yapıldı; R1 dahil tüm round'larda `items_per_load = 4` olarak ayarlandı; `DECISIONS.md` #10 ve `DESIGN.md` güncellendi. Doğrulama: 126 birim + 3 sandbox entegrasyon testi geçti. |
| **VALUES-FIX-02** | **tamam** | `25e9cc4` | `tincture_good_pct = 50` varsayılanı `Config`'ten alınacak şekilde bağlandı; `roll = 49` (+2 can) / `roll = 50` (-1 can) sınır testleri eklendi; `DECISIONS.md` #10 ve `DESIGN.md` içindeki "Rolet" etiketi düzeltildi. Doğrulama: 126 birim + 3 sandbox entegrasyon testi geçti. |
| **VALUES-FIX-03** | **tamam** | `86f07ee` | `Config::check()` içinde `load_size - max_live >= 2` kuralı zorunlu kılındı (`"load_size - max_live must be at least 2"`) ve red testleri yazıldı. Doğrulama: 126 birim + 3 sandbox entegrasyon testi geçti. |
| **VALUES-FIX-04** | **tamam** | `c24d005` | `FIX-F1-REPORT.md`, `REFERENCE-CHECK.md`, `AUDIT-F1.md` ve `DESIGN.md` dokümanları "değerler Rolet, mekanik Buckshot" kararına hizalandı. Doğrulama: 126 birim + 3 sandbox entegrasyon testi geçti. |
| **FIX-13** | **tamam** | `6083e90` | `NonFungibleTokenResolver` (`nft_resolve_transfer`, `locked_in.is_some()` yarış koşulu korumalı) implemente edildi; `base_uri` (`https://rolet.app`) ve `durability_note` eklendi; birim + sandbox geri ödeme testi eklendi. Doğrulama: 127 birim + 4 sandbox entegrasyon testi geçti. |
| **FIX-14** | **tamam** | `bdb2e94` | `get_actions` artık `ActionsPage { first_seq, actions }` döner; `top_leaderboard` (en fazla 100 kayıt) artımlı güncellemeye geçirildi; 1000 oyunculu birim testi eklendi; `DESIGN.md` güncellendi. Doğrulama: 128 birim + 4 sandbox entegrasyon testi geçti. |
| **FIX-15** | **tamam** | `0d54f57` | `assert_owner` ABI dışına (`pub(crate)` iç metoda) alındı; `claim_timeout` `Active` aşamasına `TIMEOUT_GRACE_MS = 2_000` eklendi; `fire_succeeds_during_grace_window` birim testi eklendi. Doğrulama: 129 birim + 4 sandbox entegrasyon testi geçti. |
| **FIX-16** (+ **VALUES-FIX-05**) | **tamam** | `17e294d` | Sandbox paketi `fix16_cancel_and_claim_timeout_both_stages`, `fix16_use_all_items_and_measure_values_gas`, `assert_wasm_fresh` ve `assert_sandbox_solvent` ile genişletildi; `VALUES` gaz ölçümleri `docs/near/VERSIONS.md`'ye işlendi (`MIN_ACTION_GAS = 10 Tgas`, en pahalı dal `fire` maç sonu + ödül transferi `4.423 Tgas`). Doğrulama: 129 birim + 6 sandbox entegrasyon testi geçti. |
| **FIX-17** | **kısmi** | `cccd874` | `DESIGN.md` güvenlik maddeleri güncellendi; `contracts/rolet-near/scripts/deploy-testnet.sh`, `contracts/rolet-near/scripts/cli-match.sh`, `apps/web/.env.example` ve `docs/near/E2E.md` yazıldı (`bash -n` ile sözdizimi doğrulandı). Kural gereği script'ler çalıştırılmadı ve testnet'e dokunulmadı. Doğrulama: 129 birim + 6 sandbox entegrasyon testi geçti. |
| **EK2** (`VALUES: shared deck`) | **tamam** | `3c44fcb` | `Config.copies_per_item = 4`, `GameState.deck_counts: [u8; 9]` (9 tür × 4 = 36 kartlık ortak deste), R1 dahil tüm round'larda `ChainSource` ile iadesiz 4'er kart dağıtımı, deste bitince yeniden doldurma, `get_deck_remaining` view ve `MatchView.deck_remaining` + şema/doküman/test güncellemeleri (`deploy-testnet.sh` `copies_per_item: 4` dahil) eklendi. Doğrulama: `cargo near build non-reproducible-wasm` (342.8 KB) + 131 birim + 6 sandbox entegrasyon testi geçti. |

---

## 2. Son Doğrulama ve Derleme Özeti

- **WASM Derleme:** `cd contracts/rolet-near && cargo near build non-reproducible-wasm` → Başarılı (`target/near/rolet_near.wasm`, `342.8 KB`).
- **Testler:** `cd contracts/rolet-near && cargo test` → **131 birim test** (`src/lib.rs`) geçti, **6 sandbox entegrasyon testi** (`tests/integration.rs`) geçti, 0 hata.
- **Testnet Script Sözdizimi:** `bash -n contracts/rolet-near/scripts/deploy-testnet.sh` ve `cli-match.sh` hatasız (script'ler çalıştırılmadı).

---

## 3. Açık Kalanlar

1. **T-119 (Gerçek Testnet Deploy ve İki Hesaplı CLI Maçı):** `docs/near/E2E.md` ve `contracts/rolet-near/scripts/{deploy-testnet.sh,cli-match.sh}` hazır; kural gereği çalıştırılmadı. **T-119 Samet onayı bekliyor.**
2. **F2 ve sonrası görevler:** Frontend access-key akışı, Godot/UI entegrasyonu (`TASKS.md` T-201 ve sonrası) bu görevin kapsamı dışındadır.

FIX-F2PRE DONE
