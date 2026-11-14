# Rolet NEAR — F3 Bölüm B Raporu (F3-10..F3-14)

- **Dal:** `near`
- **Önceki temel commit:** `e4ef660` (`docs: F3A report`)
- **Bölüm C (`F3-15+`):** Bu çalıştırmada başlatılmadı (talimata uygun).
- **Sözleşme dokunulmazlığı:** `git diff --stat e4ef660..HEAD -- contracts/rolet-near/src` boş — `contracts/rolet-near/src/` üzerinde hiçbir değişiklik yapılmadı.

---

## 1. Madde Durumu ve Commitler

| Madde | Açıklama | Durum | Commit | Öne Çıkan Dosyalar |
| --- | --- | --- | --- | --- |
| **F3-10** | Sahne iskeleti, prosedürel asset manifesti (`assets.ts`), `ClipPlayer` + `clipSchedule` ve dev-only `/dev/stage` | Tamamlandı | `291122f` | `apps/web/lib/stage/{assets,cameraSpec,layout,clipSchedule}.ts`, `apps/web/components/stage/{types.ts,RivalPlaceholder.tsx,ClipPlayer.tsx,Stage.tsx}`, `apps/web/components/stage/layers/{Background,Rival,Table,TableSprites,Fx,Hud}Layer.tsx`, `apps/web/app/dev/stage/page.tsx`, `apps/web/components/dev/StageLab.tsx`, `apps/web/app/globals.css` |
| **F3-11** | Sabit birinci şahıs 3D revolver katmanı (`RevolverLayer`, `RevolverCanvas`, `RevolverPlaceholder`, `RevolverGlbModel`), `gunPoses` interpolasyonu, WebGL 2D fallback ve CSP/offline uyum testi | Tamamlandı | `dc411cc` | `apps/web/lib/stage/gunPoses.ts`, `apps/web/components/stage/{RevolverPlaceholder,RevolverCanvas}.tsx`, `apps/web/components/stage/layers/RevolverLayer.tsx`, `apps/web/lib/stage/gunPoses.test.ts` |
| **F3-12** | `useDirector` tüm P0+P1 beat executor'ları, `PlayableStage` (drag-to-aim, klavye okları + Enter/Esc, Lockpick çalma slotu seçimi), `useSound` stage cue kancaları, `/dev/stage` "TAM YÜKLEME SENARYOSU" | Tamamlandı | `c7e52e1` | `apps/web/hooks/useSound.ts`, `apps/web/components/stage/{useDirector.ts,PlayableStage.tsx}`, `apps/web/components/dev/StageLab.tsx` |
| **F3-13** | `/practice` sayfası (`PracticeArena`), `?seed=` ve `?latency=` desteği, model/görsel ayrışımlı uçtan uca `practiceRun.test.ts` | Tamamlandı | `be16294` | `apps/web/app/practice/page.tsx`, `apps/web/components/stage/PracticeArena.tsx`, `apps/web/lib/game/practiceRun.test.ts` |
| **F3-14** | Sekme gizlenince WebGL duraklatma (`visibilitychange` / `frameloop`), `preloadStage`, bütçe denetim scripti (`check-stage-assets.mjs`) | Tamamlandı | `b7c3886` | `apps/web/lib/stage/{preload.ts,preload.test.ts}`, `apps/web/scripts/check-stage-assets.mjs`, `apps/web/components/stage/{RevolverCanvas,PracticeArena}.tsx`, `apps/web/components/dev/StageLab.tsx` |

---

## 2. Doğrulama Sonuçları (Son Commit `b7c3886` Sonrası)

| Kontrol | Komut | Sonuç |
| --- | --- | --- |
| Asset Bütçesi | `node apps/web/scripts/check-stage-assets.mjs` | Çıkış `0` — PASS |
| Web Unit + E2E Practice Testleri | `pnpm --filter web test` | Çıkış `0` — `124` test, `124` pass, `0` fail, `0` skipped (`4250.23ms`) |
| TypeScript | `pnpm --filter web exec tsc --noEmit` | Çıkış `0` — hata yok |
| Scoped ESLint | `pnpm --filter web exec eslint hooks/useSound.ts lib/game/*.ts lib/stage/*.ts components/stage/*.ts components/stage/*.tsx components/stage/layers/*.tsx components/dev/StageLab.tsx app/dev/stage/page.tsx app/practice/page.tsx scripts/check-stage-assets.mjs` | Çıkış `0` — 0 error, 0 warning |
| Production Build | `pnpm --filter web build` | Çıkış `0` — `Next.js 16.2.4 (Turbopack)`, `12/12` statik sayfa (`/`, `/_not-found`, `/api/matchmaking`, `/api/rpc`, `/api/stats`, `/dev/near-key`, `/dev/stage`, `/duel`, `/leaderboard`, `/practice`, `/profile`) |

Ek üretim modu HTTP doğrulaması (`next start` üzerinde):
- F3-10'da `/dev/stage` üretim modunda `404`, dev modunda `200` döndü.
- F3-13'te `/practice` üretim modunda `200`, `/dev/stage` üretim modunda `404` döndü.

---

## 3. F3-14 Asset Bütçe Ölçümleri

`node apps/web/scripts/check-stage-assets.mjs` çıktısı:

```text
Rolet Stage Asset Budget Check (apps/web)
  Manifest entries : 27 (procedural: 27, file-backed: 0)
  Initial load disk: 0 B / 8.00 MB
  Total stage disk : 0 B / 20.00 MB
  Declared budget  : 19.52 MB / 20.00 MB
PASS: All stage assets & placeholders are within PLAN-F3 §3 budgets.
```

- **İlk yükleme disk bütçesi:** `0 B / 8.00 MB` (sınır: `8.00 MB`)
- **Toplam sahne disk bütçesi:** `0 B / 20.00 MB` (sınır: `20.00 MB`)
- **Manifestte beyan edilen toplam hedef bütçe:** `19.52 MB / 20.00 MB`
- **Ağ/CDN bağımlılığı:** `useGLTF(src, false, true)` kullanılıyor; `Environment preset` ve CDN `draco` kullanımı yok (`gunPoses.test.ts` regex denetimi ile doğrulanmış). `apps/web/next.config.ts` ve `apps/web/lib/csp.ts` değiştirilmedi.

---

## 4. Açık Kalanlar

1. **Bölüm C (`F3-15+` — NEAR bağlantısı):** Henüz başlanmadı; bir sonraki aşamada ele alınacak.
2. **Gerçek varlıkların yerleştirilmesi:** Tüm 27 manifest girdisi (`G-01..G-09`, `A-01..A-16`, `V-30-*`, `BG-*`, `SFX-*`) şu an prosedürel yer tutucu olarak çalışıyor; Meshy GLB, 2D video/sprite ve `.ogg` ses dosyaları gelince yalnızca `apps/web/public/stage/...` altına dosya eklenip `apps/web/lib/stage/assets.ts` satırları güncellenecek ve `node apps/web/scripts/check-stage-assets.mjs` ile bütçe doğrulanacak.
3. **Manuel görsel/his incelemesi:** Masaüstü Chromium/Firefox üzerinde `/dev/stage` poz kalibrasyonu ("TAM YÜKLEME SENARYOSU" dahil) ve `/practice` oynanış hissinin Samet tarafından görsel olarak onaylanması.
4. **Repo geneli ESLint:** F3 öncesinden kalan legacy Solana bileşenleri ve `public/godot/index.js` üzerindeki önceden mevcut lint hataları kapsam dışı bırakıldı (`F3A-REPORT.md`'de belgelendiği gibi).

F3B DONE
