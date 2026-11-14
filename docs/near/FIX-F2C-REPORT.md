# Rolet NEAR — FIX-F2C Raporu

- **Tarih:** 2026-11-14 · **Dal:** `near` · **Kaynak:** `docs/near/AUDIT-F2C.md` §6 (`0ee564d`)

---

## 1. Madde bazında durum ve commit'ler

| Madde | Açıklama | Durum | Commit | Özet değişiklik ve doğrulama |
|---|---|---|---|---|
| **docs** | `AUDIT-F2C.md` commit | ✅ Tamam | `0ee564d` | `docs: AUDIT-F2C report` |
| **FIX-F2C-1** | `classifyError` sayısal `err.cause` (`429` / HTTP status) + `ProviderError` 429 fixture'ları | ✅ Tamam | `4e2e3cc` | `apps/web/lib/nearOutcome.ts` içinde `status`/`statusCode`/`cause` sayısal HTTP durum kodlarını (100–599, non-enumerable `Error.cause` dahil) okuyacak şekilde güncellendi. `provider-429-empty.json` (`""`) ve `provider-429-slow-down.json` (`"Slow down"`) fixture'ları ile `nearOutcome.test.ts` testleri eklendi; mevcut `http-429.json` testi korundu. |
| **FIX-F2C-2** | `sendGameCall` gas aralığı doğrulaması + nonce retry kısa artan bekleme | ✅ Tamam | `7cfc51c` | `apps/web/lib/nearConfig.ts`'e `MIN_ACTION_GAS` (15 Tgas) ve `MAX_ACTION_GAS` (300 Tgas) eklendi. `apps/web/lib/nearCall.ts`'de aralık dışı gas değerleri RPC çağrısı yapılmadan `InvalidGasError` ile reddediliyor; hem fırlatılan hem outcome `InvalidNonce` yeniden denemelerine enjekte edilebilir `sleep` üzerinden `nonceBackoffMs` (50, 100, 200 ms…) eklendi. `nearCall.test.ts` ve `nearConfig.test.ts` testleri eklendi. |
| **FIX-F2C-3** | `next.config.ts` CSP başlığı + `DESIGN.md` §4.3 XSS riski | ✅ Tamam | `f8d2572` | `apps/web/lib/csp.ts` (`buildCspHeader`) ve `apps/web/lib/csp.test.ts` eklendi; `apps/web/next.config.ts` `headers()` ile `Content-Security-Policy` uygulandı (üçüncü taraf script yok; NEAR RPC ve wallet-selector `connect-src` izinleri açık; `'unsafe-eval'` ve `127.0.0.1`/`localhost` gevşetmeleri yalnızca `NODE_ENV !== "production"` dev modunda). `docs/near/DESIGN.md` §4.3'e `XSS ⇒ 0.5 NEAR allowance + 6 oyun metodu, fon çekemez` riski ve CSP azaltması eklendi. |
| **FIX-F2C-4** | `NearKeyLab` dev bileşeninin production paketinden çıkarılması | ✅ Tamam | `9ce52e0` | `apps/web/app/dev/near-key/page.tsx` içinde `process.env.NODE_ENV !== "production"` dalında `next/dynamic` import'a geçildi. `next build` sonrası `grep -rnE "rolet:fck|NearKeyLab" apps/web/.next/static` sıfır eşleşme döndürdü ve `.next/server/app/dev/near-key.meta` `status: 404` olarak doğrulandı. |
| **FIX-F2C-5** | `VERSIONS.md` `@near-js/keystores` işaretlemesi + `@noble/hashes` sürüm sabitleme | ✅ Tamam | `4c95de0` | `docs/near/VERSIONS.md`'de `@near-js/keystores` satırı `*(geçişli (override))*` olarak işaretlendi. `apps/web/package.json` ve `pnpm-lock.yaml`'daki `@noble/hashes` belirteci kurulu tam sürüm `2.2.0`'a sabitlendi (`pnpm install --frozen-lockfile --offline` doğrulandı). |

---

## 2. Doğrulama ve test çıktıları

### Web birim testleri (`pnpm --filter web test`)
- Komut: `tsx --test lib/*.test.ts`
- Sonuç: **67 test geçti, 0 hata, 0 atlanan** (`pass 67`, `fail 0`, `skipped 0`).

### Web sandbox E2E (`pnpm --filter web test:sandbox`)
- Komut: `tsx --test sandbox/*.test.ts`
- Sonuç: **1 test geçti, 0 hata** (`local near-sandbox E2E match with FC access keys and error classifications`).

### TypeScript, ESLint ve Next.js derleme
- `pnpm --filter web exec tsc --noEmit`: çıkış kodu `0`.
- `pnpm --filter web exec eslint next.config.ts lib/csp.ts lib/csp.test.ts lib/nearConfig.ts lib/nearConfig.test.ts lib/nearCall.ts lib/nearCall.test.ts lib/nearOutcome.ts lib/nearOutcome.test.ts app/dev/near-key/page.tsx`: çıkış kodu `0`.
- `pnpm --filter web build`: çıkış kodu `0` (`10/10` rota derlendi; `.next/static` içinde `rolet:fck` ve `NearKeyLab` geçmiyor).

### Kontrat derleme ve testler (`cd contracts/rolet-near`)
- `cargo near build non-reproducible-wasm`: başarılı (`target/near/rolet_near.wasm`, `346786` bayt, gömülü ABI).
- `cargo test`:
  - Birim testler (`src/lib.rs`): **136 passed; 0 failed; 0 ignored**.
  - Entegrasyon testleri (`tests/integration.rs`): **9 passed; 0 failed; 0 ignored**.
  - Doc-tests (`rolet_near`): **0 passed; 0 failed**.

---

## 3. Açık kalanlar

- **Canlı testnet / cüzdan doğrulaması (`T-201`, `T-203`, `T-204`):** `near-api-js@6.5.1` geçişli bağımlılığı ile gerçek MyNearWallet / Meteor çalışma zamanı uyumluluğu ve testnet deploy sonrası cüzdan spike adımları (`docs/near/F2-REPORT.md` §3 ve `docs/near/AUDIT-F2C.md` §5) ağ/cüzdan kapsamı dışında olduğu için açık kalmaktadır.
- **CSP `script-src` satır içi scriptler:** Next.js App Router hidrasyon scriptleri statik `next.config.ts` başlıklarında per-request nonce kullanılmadığı için `'unsafe-inline'` içerir; üçüncü taraf script kaynakları ve production `'unsafe-eval'` kapalıdır.

FIX-F2C DONE
