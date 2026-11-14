# Rolet NEAR — F3 Bölüm C Raporu (F3-15..F3-24)

- **Tarih:** 2026-11-15 · **Dal:** `near` · **Başlangıç Bazı:** `94e809c` (`docs: F3B report`)
- **Doğrulama Ortamı:** Yalnız yerel `near-sandbox` ve çevrimdışı test/derleme araçları (testnet/mainnet isteği, deploy, `git push` yapılmadı).
- **Dokunulmazlık Kontrolü:** `contracts/rolet-near/src/` ve `godot/` klasörlerinde sıfır değişiklik (`git diff --stat 94e809c..HEAD -- contracts/rolet-near/src godot/` boş). `apps/web/lib/csp.ts` gevşetilmedi.

---

## 1. Madde Bazında Durum ve Commitler

| Madde | Açıklama | Durum | Commit | Doğrulama Özeti |
|---|---|---|---|---|
| **F3-15** | `app/api/rpc/route.ts` dinamik `NEAR_RPC_URL` proxy + rate-limit, simetrik `lib/matchQueue.ts`, `lib/queueSignature.ts` NEP-413 + FullAccess `view_access_key` kontrolü, `sandbox/rpc-proxy.test.ts` | ✅ Tamam | `4e18dbe` | `web test` 122/122, `test:sandbox` 2/2, `tsc` 0, `next build` 12/12 |
| **F3-16** | `components/NearProvider.tsx`, `app/layout.tsx` ve `components/Nav.tsx` NEAR cüzdan bağlama; geçici `/duel`, `/profile`, `/leaderboard` kabukları | ✅ Tamam | `3e2d064` | `web test` 122/122, `tsc` 0, `next build` 12/12 |
| **F3-17** | `lib/nearViews.ts` + `nearViews.test.ts`, `hooks/useRoletNear.ts`, `sandbox/near-views.test.ts` | ✅ Tamam | `29a6ad7` | `web test` 127/127, `test:sandbox` 3/3, `tsc` 0, `next build` 12/12 |
| **F3-18** | `lib/duelFlow.ts` reducer durum makinesi (`connect→key→character→queue→join→reveal→play→result`, `?match=`, `owed > 0`) + `duelFlow.test.ts` | ✅ Tamam | `f46b6cf` | `web test` 132/132, `tsc` 0, `next build` 12/12 |
| **F3-19** | `lib/game/actionPoller.ts` (600 ms / 3 s / backoff / gap resync) + `nearTransport.ts` (`GameTransport`) + `sandbox/near-transport.test.ts` (iki bot tam maç + gizlilik kontrolü) | ✅ Tamam | `cd06fce` | `web test` 135/135, `test:sandbox` 4/4, `tsc` 0, `next build` 12/12 |
| **F3-20** | `lib/game/clock.ts` (`remainingMs`, `claimable`, 10 s uyarısı), HUD `SÜRE DOLDU — KAZAN` (`claim_timeout`), `sandbox/timeout.test.ts` | ✅ Tamam | `ce9f2ea` | `web test` 138/138, `test:sandbox` 5/5, `tsc` 0, `next build` 12/12 |
| **F3-21** | `app/duel/page.tsx` tam NEAR yeniden yazımı (`duelFlow` + `PlayableStage` + `NearTransport` + `preloadStage` + NEP-413 sıra + oto-reveal + ödül çekme) | ✅ Tamam | `a66f8af` | `web test` 138/138, `tsc` 0, `eslint` 0, `next build` 12/12 |
| **F3-22** | `app/profile/page.tsx`, `app/leaderboard/page.tsx`, `app/api/stats/route.ts` ve `components/landing/*` NEAR/Testnet dönüşümü (`grep solana\|SOL\|devnet` temiz) | ✅ Tamam | `a27880b` | `web test` 138/138, `tsc` 0, `eslint` 0, `next build` 12/12 |
| **F3-23** | Solana paketleri/IDL/eski sahne dosyalarının (`SolanaProvider`, `DuelRoom3D`, `PixelDuelStage`, `BuckshotRoom`, `HandRack2D`, `WorkshopLobby`, `useRolet`, `umi`, `characterMint`, `lobbyCommit`, `seat`, `economy`, `chainPace`) kaldırılması; `rateLimit.ts` ayrımı; `ChamberDial.tsx` landing içine taşınması; `pnpm why @solana/web3.js` boş | ✅ Tamam | `c18bcc5` | `web test` 117/117, `test:sandbox` 5/5, `tsc` 0, `next build` 12/12 |
| **F3-24** | `docs/near/F3-REPORT.md`, `docs/near/E2E.md`, `docs/near/F3C-REPORT.md` kapanış dokümantasyonu | ✅ Tamam | *(bu commit)* | Final suite tam yeşil |

---

## 2. Final Test ve Derleme Özeti

- **Web birim testleri (`pnpm --filter web test`):** `117` test · `117` geçer · `0` başarısız · `0` atlanan (Solana'ya ait eski 23 `seat`/`chainPace` testi kaldırıldı, rate-limit kapsamı `lib/rateLimit.test.ts` ile korundu).
- **Yerel Sandbox E2E (`pnpm --filter web test:sandbox`):** `5` test · `5` geçer · `0` başarısız (`near-e2e.test.ts`, `near-transport.test.ts` iki botla tam maç + gizlilik, `near-views.test.ts`, `rpc-proxy.test.ts`, `timeout.test.ts`).
- **TypeScript (`pnpm --filter web exec tsc --noEmit`):** `0` hata.
- **Next.js Production Build (`pnpm --filter web build`):** Başarılı (`12/12` rota, `Next.js 16.2.4 Turbopack`).
- **Stage Asset Bütçesi (`node apps/web/scripts/check-stage-assets.mjs`):** `PASS` (`27` prosedürel girdi, `0 B / 8.00 MB` başlangıç, `19.52 MB / 20.00 MB` beyan edilen).
- **Kontrat Testleri (`cd contracts/rolet-near && cargo test`):** `136 passed` (birim) + `9 passed` (entegrasyon) + `1 ignored` (`vectors_export` üreteci).

---

## 3. Samet'e Kalan Adımlar (👤)

1. **Testnet Deploy & CLI Doğrulaması:** `docs/near/E2E.md` §2–§3 (`deploy-testnet.sh`, `cli-match.sh`).
2. **Tarayıcı E2E (`T-338`):** İki testnet hesabıyla masaüstü Chromium ve Firefox üzerinde `/profile` karakter satın alma, `/duel` sıra (NEP-413) → `join` → `reveal` → maç → `claim_timeout` → `claim_reward`, `/leaderboard` doğrulamaları ve tx hash kayıtları (`docs/near/E2E.md` §4).
3. **Görsel Varlık & Sahne Kalibrasyonu:** Üretilecek Meshy GLB revolver + 2D video/ses dosyalarının `apps/web/public/stage/` altına eklenmesi ve `/dev/stage` + `/practice` incelemesi.
4. **`TASKS.md` Güncellemesi:** Onayınla `docs/near/PLAN-F3.md §1` tablosunun `TASKS.md` F3 bölümüne işlenmesi.

F3C DONE
