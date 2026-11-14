# Rolet NEAR — F2 Raporu (Function-call access key, T-201..T-205)

- **Tarih:** 2026-11-14 · **Dal:** `near` · **Plan:** `docs/near/PLAN-F2.md` (`e3636c9`)
- **Varsayılan tercihler (PLAN §5):**
  - Cüzdan spike kapsamı: yalnızca **MyNearWallet** (`10.1.4`) ve **Meteor** (`10.1.4`).
  - RPC adresi: `NEXT_PUBLIC_NEAR_RPC_URL` (ve geriye dönük `NEXT_PUBLIC_NEAR_RPC`) üzerinden env'den okunur, varsayılanı `https://rpc.testnet.near.org`.
  - Kontrat ve Solana dosyaları değişmedi (`contracts/rolet-near`, `apps/server/`, `packages/shared/`, `layout.tsx`, `Nav.tsx`, `SolanaProvider.tsx`, `useRolet.ts`, `api/rpc` dokunulmadı).

---

## 1. Madde bazında durum ve commit'ler

| Madde | Açıklama | Durum | Commit | Özet doğrulama |
|---|---|---|---|---|
| **docs** | `PLAN-F2.md` | ✅ Tamam | `e3636c9` | Plan dosyası commitlendi |
| **F2-0** | Bağımlılıklar + `tsx` + `VERSIONS.md` | ✅ Tamam | `99893d6` | `pnpm install` temiz, `pnpm why @near-js/crypto` tek kopya `2.5.1`, mevcut 36 test + `next build` yeşil |
| **F2-1** | `lib/nearConfig.ts` + `lib/nearTypes.ts` | ✅ Tamam | `f2fdcf0` | `GAME_METHODS` (6 metod), `allowance_hint` eşleşmesi, `ACTION_GAS = 20 Tgas`, `isAction` şema doğrulaması |
| **F2-2** | `lib/nearKey.ts` (T-202) | ✅ Tamam | `7a4857a` | Ed25519 key üretimi, `KeyStorage` CRUD, `isAllowanceError` / `isAccessKeyMissing` / `isMethodDenied` |
| **F2-3** | `lib/nearCommit.ts` | ✅ Tamam | `52f619f` | `rng.rs:178` sabit vektörü birebir, `console.` yok, `sessionStorage` yardımcıları |
| **F2-4** | `lib/nearOutcome.ts` | ✅ Tamam | `94bce5c` | `parseOutcome` (`SuccessValue` + `EVENT_JSON` `rolet`), `classifyError` (8 sınıf) |
| **F2-5** | `lib/nearCall.ts` (`sendGameCall`, T-204 çekirdek) | ✅ Tamam | `db62b46` | Nonce kuyruğu, 3 nonce retry + 4. hatada fırlatma, 429 backoff, tipli hatalar, `claim_reward` reddi |
| **F2-6** | Yerel sandbox E2E (`sandbox/near-e2e.test.ts`) | ✅ Tamam | `3574ecc` | Yerel `near-sandbox 2.14.1`: deploy → `buy_character` → `AddKey` → `join/reveal/fire` tam maç → `MatchEnded` + gerçek fixture yakalama |
| **F2-7** | `lib/nearKeyFlow.ts` (T-203 saf kısmı) | ✅ Tamam | `0cf64e0` | `decideKeyAction` tablosu, `checkKeyOnChain`, `signOutKey` + sandbox ek kontrolleri |
| **F2-8** | Dev sayfası (`/dev/near-key`, `NearKeyLab.tsx`, `WALLETS.md`) | ✅ Tamam | `037f040` | `dev` HTTP `200`, `prod` (`next start`) HTTP `404`, `eslint` yeni dosyalarda 0 hata, `next build` yeşil |
| **F2-9** | Doküman kapanışı (`TASKS.md`, `F2-REPORT.md`) | ✅ Tamam | *(bu commit)* | `TASKS.md` T-201..T-205 güncellendi, tam test çıktıları eklendi |

---

## 2. Doğrulama ve test çıktıları

### `pnpm --filter web exec tsc --noEmit`
- Çıkış kodu: `0` (hata yok).

### `pnpm --filter web test` (`tsx --test lib/*.test.ts`)
```text
> web@0.1.0 test /home/samet/AI/rolet/apps/web
> tsx --test lib/*.test.ts

ℹ tests 63
ℹ suites 0
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 898.714178
```

### `pnpm --filter web test:sandbox` (`tsx --test sandbox/*.test.ts`)
```text
> web@0.1.0 test:sandbox /home/samet/AI/rolet/apps/web
> tsx --test sandbox/*.test.ts

✔ local near-sandbox E2E match with FC access keys and error classifications (17061.519709ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17385.189107
```

### `cd contracts/rolet-near && cargo test`
```text
running 136 tests
...
test result: ok. 136 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 6.56s

     Running tests/integration.rs (target/debug/deps/integration-d61bcb08ca9724b2)

running 9 tests
...
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 71.86s

   Doc-tests rolet_near

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

### F2-8 HTTP & Build & Lint kontrolleri
- `pnpm --filter web exec eslint app/dev/near-key/page.tsx components/dev/NearKeyLab.tsx lib/near*.ts sandbox/near-e2e.test.ts` → çıkış kodu `0` (yeni dosyalarda 0 hata/uyarı). *(Not: `pnpm --filter web lint` proje genelinde önceden var olan Solana/`public/godot/index.js` dosyalarından 235 bulgu döndürür; yeni F2 dosyalarında 0 bulgu vardır.)*
- `pnpm --filter web build` → yeşil (`/dev/near-key` dahil 10/10 sayfa derlendi).
- `pnpm --filter web exec next dev -p 3102` üzerinde `/dev/near-key` → `DEV_STATUS=200`.
- `pnpm --filter web exec next start -p 3101` üzerinde `/dev/near-key` → `PROD_STATUS=404`.
- `pnpm --filter web exec pnpm why @near-js/crypto` → `Found 1 version of @near-js/crypto` (`@near-js/crypto@2.5.1`).

---

## 3. 👤 Samet'e kalan adımlar (`PLAN-F2.md` §4)

1. T-119 testnet deploy tamamlandıktan ve `apps/web/.env.local` (`NEXT_PUBLIC_NEAR_NETWORK=testnet`, `NEXT_PUBLIC_ROLET_CONTRACT=...`, `NEXT_PUBLIC_NEAR_RPC_URL=...`) yazıldıktan sonra `pnpm --filter web dev` başlatıp `http://localhost:3000/dev/near-key` sayfasını açın.
2. **MyNearWallet** ve **Meteor** ile sırayla bağlanıp:
   - `signIn(methodNames)` dApp'e key veriyor mu kontrol edin,
   - gerekirse **Yedek AddKey** deneyin,
   - `buy_character (1 NEAR)` ve **join → cancel** çalıştırın,
   - sonuçları `docs/near/WALLETS.md` tablosuna işleyin (**T-201 Bitti**).
3. Seçilen demo cüzdanında ilk ziyarette 1 onay, sayfa yenileyince 0 onay ile `join` çalıştığını doğrulayın (**T-203 Bitti**).
4. İki hesapla aynı `match_id` üzerinden maç açıp `fire` sonucunun dev sayfasında `Action[]` olarak göründüğünü doğrulayın; **7. Ölç** paneliyle gerçek testnet `allowance` düşüşünü kaydedip `WALLETS.md`'ye ekleyin (**T-204 Bitti**).
5. `docs/near/TASKS.md`'de T-201, T-203 ve T-204'ü kapatıp demo cüzdanı kararını `docs/near/DECISIONS.md`'ye yazın.

F2 DONE
