# Rolet NEAR — F3 Fazı Kapanış Raporu (F3-0..F3-24)

- **Tarih:** 2026-11-15 · **Dal:** `near` · **Plan:** `docs/near/PLAN-F3.md` (`3f12b6e`)
- **Görsel / Mimari Karar (`.git/rolet-f3-notes.txt`, `PLAN-F3 §0`):** Godot yok, 2.5D katmanlı sahne + yalnızca 8 hazneli revolver 3D (`three` / `@react-three/fiber` / `@react-three/drei` / `gsap`), hedef tarayıcı masaüstü Chromium/Firefox.
- **Kontrat ve Godot Dokunulmazlığı:** `git diff --stat 3f12b6e..HEAD -- contracts/rolet-near/src godot/` çıktısı **boş** (sıfır değişiklik; yalnız F3-3'te `contracts/rolet-near/tests/vectors_export.rs` `#[ignore]` parite ihracatçısı eklendi).
- **CSP & Paket Politikası:** Yeni npm paketi eklenmedi (sadece F3-23'te Solana/legacy paketleri kaldırıldı); `apps/web/lib/csp.ts` gevşetilmedi.

---

## 1. F3-0..F3-24 Madde ve Commit Özeti

### Bölüm A — Saf Mantık ve Practice (F3-0..F3-9, ara rapor `docs/near/F3A-REPORT.md`)
| Madde | Açıklama | Commit | Durum |
|---|---|---|---|
| **F3-0** | 3D/GSAP sürüm sabitleme (`VERSIONS.md`, `DECISIONS.md #13`), test glob | `a4664b5` | ✅ Tamam |
| **F3-1** | `lib/game/config.ts`, `shellSource.ts`, `rules.ts` (4 can, 8 hazne, 4 kart) | `14becb9` | ✅ Tamam |
| **F3-2** | 9 eşya kuralı (`Loupe..Tincture`) + ret testleri | `a0dc962` | ✅ Tamam |
| **F3-3** | Rust ↔ TS parite vektörleri (`vectors_export.rs`, `vectors.json`, `vectors.test.ts`) | `9e98baa` | ✅ Tamam |
| **F3-4** | `privacy.ts`, `model.ts`, `actionSync.ts` + 100-seed parite testi | `4d1c150` | ✅ Tamam |
| **F3-5** | `lib/stage/protocol.ts`, `parseIntent`, `lib/game/transport.ts` | `525aa62` | ✅ Tamam |
| **F3-6** | `beats.ts`, `director.ts` (sıralı beat kuyruğu, gizlilik testi) | `1a368d8` | ✅ Tamam |
| **F3-7** | `intentFlow.ts` (700ms hold, 4s dolgu, 20s timeout + rollback, `canAct`) | `5d78164` | ✅ Tamam |
| **F3-8** | `aimGesture.ts` (normalize sürükleme + klavye ok/Enter/Esc) | `ab87cb6` | ✅ Tamam |
| **F3-9** | `bot.ts`, `practiceEngine.ts`, 200-seed bot-vs-bot ve sızıntısızlık testleri | `903bd25` | ✅ Tamam |

### Bölüm B — Sahne ve Pratik Arena (F3-10..F3-14, ara rapor `docs/near/F3B-REPORT.md`)
| Madde | Açıklama | Commit | Durum |
|---|---|---|---|
| **F3-10** | `Stage` iskeleti, L0..L6 katmanlar, `assets.ts`, `ClipPlayer`, `/dev/stage` | `291122f` | ✅ Tamam |
| **F3-11** | `RevolverLayer` (R3F + `gunPoses.ts` + WebGL fallback) | `dc411cc` | ✅ Tamam |
| **F3-12** | `useDirector.ts` beat yürütücüleri, `PlayableStage.tsx`, `useSound.ts` | `c7e52e1` | ✅ Tamam |
| **F3-13** | `/practice` sayfası (`PracticeArena.tsx`) + `practiceRun.test.ts` | `be16294` | ✅ Tamam |
| **F3-14** | Sekme gizleme duraklatması, `preloadStage.ts`, `check-stage-assets.mjs` | `b7c3886` | ✅ Tamam |

### Bölüm C — NEAR Bağlama ve Temizlik (F3-15..F3-24, ayrıca `docs/near/F3C-REPORT.md`)
| Madde | Açıklama | Commit | Durum |
|---|---|---|---|
| **F3-15** | `/api/rpc` dinamik `NEAR_RPC_URL`, simetrik `matchQueue.ts`, NEP-413 `queueSignature.ts`, `sandbox/rpc-proxy.test.ts` | `4e18dbe` | ✅ Tamam |
| **F3-16** | `NearProvider.tsx`, `layout.tsx`, `Nav.tsx` NEAR cüzdan bağlama | `3e2d064` | ✅ Tamam |
| **F3-17** | `lib/nearViews.ts`, `nearViews.test.ts`, `hooks/useRoletNear.ts`, `sandbox/near-views.test.ts` | `29a6ad7` | ✅ Tamam |
| **F3-18** | `lib/duelFlow.ts` saf reducer durum makinesi + tablo testi `duelFlow.test.ts` | `f46b6cf` | ✅ Tamam |
| **F3-19** | `lib/game/actionPoller.ts`, `nearTransport.ts`, sandbox iki bot maç testi | `cd06fce` | ✅ Tamam |
| **F3-20** | `lib/game/clock.ts`, HUD `SÜRE DOLDU — KAZAN` (`claim_timeout`), `sandbox/timeout.test.ts` | `ce9f2ea` | ✅ Tamam |
| **F3-21** | `/duel` tam NEAR yeniden yazımı (`duelFlow` + `NearTransport` + `PlayableStage`) | `a66f8af` | ✅ Tamam |
| **F3-22** | `/profile`, `/leaderboard`, `/api/stats` ve landing NEAR/test-ağ metin dönüşümü | `a27880b` | ✅ Tamam |
| **F3-23** | Solana bağımlılıkları/IDL/eski sahne bileşenlerinin kaldırılması (`godot/` korunarak) | `c18bcc5` | ✅ Tamam |
| **F3-24** | `docs/near/F3-REPORT.md`, `docs/near/E2E.md`, `docs/near/F3C-REPORT.md` kapanışı | *(bu commit)* | ✅ Tamam |

---

## 2. Final Doğrulama Çıktıları (Son Kod Değişiklikleri Sonrası)

### `pnpm --filter web test`
```text
ℹ tests 117
ℹ suites 0
ℹ pass 117
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
*(Not: F3-23'te Solana'ya özel 23 eski `seat.test.ts` ve `chainPace.test.ts` testi silinip `/api/rpc` rate-limit testleri `lib/rateLimit.test.ts` altında korunduğundan birim test sayısı 138'den 117'ye inmiştir.)*

### `pnpm --filter web test:sandbox`
```text
✔ local near-sandbox E2E match with FC access keys and error classifications (23279.896828ms)
✔ F3-19 nearTransport: two bots finish a full match on local near-sandbox without Loupe leaks (23548.595764ms)
✔ nearViews queries contract state on local near-sandbox (9234.436696ms)
✔ F3-15: /api/rpc forwards view_account to NEAR_RPC_URL sandbox (2607.669671ms)
✔ F3-20 timeout: claim_timeout rejects before deadline and succeeds after deadline + grace (29679.838072ms)
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
```

### `pnpm --filter web exec tsc --noEmit` & `pnpm --filter web build`
- `tsc --noEmit`: çıkış kodu `0` (0 hata).
- `next build`: `Next.js 16.2.4 (Turbopack)`, `12/12` rota (`/`, `/_not-found`, `/api/matchmaking`, `/api/rpc`, `/api/stats`, `/dev/near-key`, `/dev/stage`, `/duel`, `/leaderboard`, `/practice`, `/profile`).
- `pnpm --filter web why @solana/web3.js`: çıktı boş.

### `node apps/web/scripts/check-stage-assets.mjs`
```text
Rolet Stage Asset Budget Check (apps/web)
  Manifest entries : 27 (procedural: 27, file-backed: 0)
  Initial load disk: 0 B / 8.00 MB
  Total stage disk : 0 B / 20.00 MB
  Declared budget  : 19.52 MB / 20.00 MB
PASS: All stage assets & placeholders are within PLAN-F3 §3 budgets.
```

### `cd contracts/rolet-near && cargo test`
```text
test result: ok. 136 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 10.24s   (src/lib.rs)
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 70.93s     (tests/integration.rs)
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s    (tests/vectors_export.rs #[ignore])
```

---

## 3. Samet'e Kalan Adımlar (👤)

1. **`docs/near/E2E.md` kontrol listesi (`T-118`, `T-119`, `T-338`):** Kontratı testnet'e deploy et, iki hesapla tarayıcıda (Chromium & Firefox) `buy_character` → kuyruk (NEP-413) → `join` → `reveal` → 2–3 round → `claim_timeout` → `claim_reward` akışını doğrula ve tx hash'lerini `docs/near/E2E.md` tablosuna kaydet.
2. **Görsel varlıklar (`PLAN-F3 §3` / F4):** Meshy GLB revolver (`G-01..G-09`), rakip klipleri ve masa 2D sprite/ses dosyaları hazırlandıkça `apps/web/public/stage/` altına koyup `apps/web/lib/stage/assets.ts` girdilerini güncelle ve `node apps/web/scripts/check-stage-assets.mjs` çalıştır.
3. **`/dev/stage` ve `/practice` incelemesi:** Poz kalibrasyonu (`cameraSpec`, `gunPoses`) ve pratik arena oynanış hissini masaüstü Chromium/Firefox'ta onayla.
4. **`docs/near/TASKS.md` güncellemesi:** Plan §1 yeniden eşleme tablosunu kendi onayınla `TASKS.md` F3 bölümüne işle.

F3 DONE
