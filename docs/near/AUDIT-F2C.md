# Rolet NEAR — AUDIT-F2C (F2 kısa denetim)

- **Kapsam:** `e3636c9..20ac6cb`, `docs/near/PLAN-F2.md` F2-0..F2-9. Salt okunur denetim. Kod yazılmadı, commit atılmadı, ağ/testnet/cüzdan kullanılmadı.
- **Kendi çalıştırdıklarım:** `pnpm why @near-js/crypto -r`, `classifyError` ile 429 denemesi (ağsız, `ProviderError` nesnesiyle), `.next` çıktısı incelemesi. Test paketlerini yeniden koşmadım, F2-REPORT sayılarına güveniyorum.

## 1. Kabul kriteri durumu

| Madde | Durum | Not |
|---|---|---|
| F2-0 | **Tamam** | Yeni paketler `package.json`'da tam sürüm (`apps/web/package.json:23-33`, `tsx 4.23.15`). `pnpm why` tek kopya `@near-js/crypto` gösteriyor. Notlar için bkz. §5. |
| F2-1 | **Tamam** | `GAME_METHODS` 6 metod ve sıralı (`lib/nearConfig.ts:27-34`). `FC_ALLOWANCE_YOCTO` `init-config.json` ile eşit, test dosyayı okuyor (`nearConfig.test.ts:31-37`). |
| F2-2 | **Tamam** | Kayıt, yükleme ve silme turu ile bozuk JSON testi var. |
| F2-3 | **Tamam** | Bkz. §3. |
| F2-4 | **Kısmi** | Gerçek RPC 429 hatası `rateLimit` olarak sınıflanmıyor (§4, B1). |
| F2-5 | **Kısmi** | Kuyruk, nonce retry ve tipli hatalar doğru. 429 dalı gerçek hata biçiminde çalışmıyor (B1). |
| F2-6 | **Tamam** | Sandbox akışı gerçek outcome üretiyor. `claim_reward` → `methodDenied` (`near-e2e.test.ts:362-384`), 1 yocto → `allowance` (`:387-408`), silinen key → `missingKey` + `addkey` (`:413-423`) var. |
| F2-7 | **Tamam** | Karar tablosu ve `checkKeyOnChain` (receiver, metod, allowance>0) doğru. Sandbox'ta key eklenince `use` (`:271`), silinince `addkey` (`:423`). |
| F2-8 | **Tamam** | `NODE_ENV==="production"` → `notFound()`. `.next/server/app/dev/near-key.meta` `status: 404`. Dev'de 200 sonucuna güveniyorum, kendim çalıştırmadım. |
| F2-9 | **Tamam** | `TASKS.md` ve `F2-REPORT.md` PLAN'a uygun. |

## 2. Güvenlik

- **FC özel anahtarı:** `rolet:fck:<hesap>:<kontrat>` altında `localStorage`'da düz JSON olarak duruyor (`lib/nearKey.ts:265-279`). Tasarım gereği bu böyle. Bir XSS key'i çalabilir. Etki kontrata ve 6 metoda, 0.5 NEAR allowance'a sınırlı ve fon çekemez. F3'te CSP gerekir, bkz. **FIX-F2C-3**.
- **Sızıntı yok:**
  - `lib/near*.ts` içinde `console.*` yok.
  - Dev UI yalnızca `publicKey` gösteriyor (`NearKeyLab.tsx:595`).
  - `listWalletKeystoreNames` yalnızca anahtar adlarını listeliyor, değerleri değil (`:61-77`).
  - Hata günlükleri `err.message` yazıyor, tipli hataların mesajları sabit (`nearCall.ts:37-89`).
  - Fixture'larda özel anahtar yok, yalnızca public key ve imza var.
- **`reveal` sırrı:** argv'ye hiç girmiyor, sandbox testi `execFileSync` yalnızca sandbox init/run için kullanıyor. `sessionStorage`'a yazılıyor (`NearKeyLab.tsx:401`), `reveal` sonrası siliniyor (`:437`). Küçük bir eksik: `reveal` başarısız olursa sır kalıyor, bu kabul edilebilir çünkü yeniden denemek için gerekli.
- **Metod listesi kontratla aynı:** `join, reveal, cancel, fire, use_item, claim_timeout`. `integration.rs:1404-1411` ile birebir eşleşiyor. Kontrat imzaları da TS argümanlarıyla uyumlu (`match_id` U64 string, `commit`/`secret` base64 32 bayt, `target`).
- **`claim_reward` FC key ile çağrılmıyor:** `sendGameCall` önce `isGameMethod` kontrolü yapıp `WalletRequiredError` ile reddediyor (`nearCall.ts:284-286`). Deposit her zaman `0` (`:225`). `buy_character` yalnızca cüzdan yolunda.

## 3. nearCommit

`commitment()` = `sha256(secret ‖ utf8(account) ‖ u64_le(matchId))` (`nearCommit.ts:144-166`), `rng.rs:17-24` ile aynı. Test sabit vektörü kontrattakiyle birebir kullanıyor: `bfd4433f…479b` (`nearCommit.test.ts`, `rng.rs:178+`). Doğru.
Küçük not: `matchId` tipi `number` da kabul ediyor, 2^53 üstü sessizce bozulur. Çağıranlar `bigint` kullanmalı (dev UI kullanıyor).

## 4. sendGameCall

**Doğru olanlar:**
- Kuyruk (`nearCall.ts:197, 288-290`): `queue.then(run, run)` ve `queue = next.catch(...)`, tek key için sıralı çalışıyor.
- Nonce: her denemede `view_access_key` ile taze nonce alınıyor, en fazla 3 yeniden deneme (`:243-246`, `:263-268`), sonra `NonceRetryExhaustedError`.
- `allowance`, `missingKey`, `methodDenied` ve `contractPanic` yeniden denenmiyor.
- Sonsuz döngü yok. Her `continue` yolunda sınırlı bir sayaç artıyor.
- Çift gönderim: 429 sonrası yeniden gönderimde taze nonce alınır. İlk istek işlenmediyse aynı nonce/hash gider (idempotent). `network` ve `other` hataları yeniden gönderilmiyor, bu güvenli taraf.

**Hatalar:**
- **B1 — 429 gerçek biçimde yakalanmıyor.** `@near-js/providers` 429'u `ProviderError(await res.text(), { cause: 429 })` olarak fırlatıyor (`fetch_json.js:27-47`) ve 429'u kendi retry listesine koymuyor. `classifyError` `cause` sayısını okumuyor, yalnızca `status`/`statusCode` anahtarına bakıyor (`nearOutcome.ts:195, 214`). Denedim: gövde `""` → `other`, `"Slow down"` → `other`, `"{\"error\":\"limit\"}"` → `other`. Yalnızca gövdede `Too Many Requests` varsa `rateLimit`. Sonuç: gerçek testnet RPC'sinde 429 gövdesi farklıysa geri çekilme hiç çalışmaz, hata ham fırlar. `http-429.json` fixture'ı elle yazılmış (`{"status":429,"message":"..."}`), gerçek biçim değil, test bu yüzden yeşil.
- **B2 (küçük) — nonce yeniden denemesinde bekleme yok.** 3 deneme anında peş peşe gider. `optimistic` view geride kalırsa 3 hak boşa harcanır.
- **B3 (küçük) — `gas` doğrulanmıyor.** `options.gas` 15 Tgas altına inerse kontrat panikler (`MIN_ACTION_GAS`), 300 Tgas üstüne çıkarsa RPC reddeder.

## 5. Dev sayfası ve sürümler

- **Production:** `next start` altında 404 (prerender `404`). Ancak `NearKeyLab` ve cüzdan modülleri production derlemesinde statik chunk olarak üretiliyor (`.next/static/chunks/06.~hzkezhn5j.js` içinde `rolet:fck`/`NearKeyLab`). Sayfa kapalı ama dev arayüz kodu public. Gizli veri içermiyor, **FIX-F2C-4**.
- **Sürümler:** yeni paketler tam sabit. Kalan notlar:
  - `@noble/hashes` hâlâ `^2.2.0` (`package.json:34`). PLAN "zaten var" dediği için kabul, ama commit hesabı bu pakete bağlı.
  - `VERSIONS.md` `@near-js/keystores 2.5.1` satırı içeriyor, `package.json`'da yok (yalnızca override ile geçişli).
  - `pnpm why` çıktısında `near-api-js@6.5.1` geçişli olarak var (wallet-selector bağımlılığı). `pnpm-workspace.yaml` overrides bunun `@near-js/*`'ini 2.5.1'e zorluyor. Derleme ve sandbox geçiyor ama gerçek cüzdan modülleriyle çalışma zamanı uyumluluğu doğrulanmadı, Samet'in spike adımında dikkat edilmeli.

## 6. F3 öncesi engeller

Ciddi bir engel yok. F3'e geçmeden küçük düzeltmeler:

1. **FIX-F2C-1 (gerekli):** `classifyError`'da `err.cause === 429` (ve `ProviderError` kullanan `status` benzeri sayısal `cause`) → `rateLimit`. `nearOutcome.ts:195-218`. `http-429.json`'a gerçek `ProviderError` biçimli (`cause: 429`, gövde boş / `Slow down`) en az iki fixture ve test ekle.
2. **FIX-F2C-2 (küçük):** `sendGameCall`'da `gas` aralığını doğrula (`MIN_ACTION_GAS ≤ gas ≤ 300 Tgas`) ve nonce yeniden denemesine kısa bekleme ekle.
3. **FIX-F2C-3 (F3 başında):** FC key `localStorage`'da kalacaksa Next için CSP başlığı ekle, üçüncü taraf script yükleme. `DESIGN` §4.3'e "XSS ⇒ 0.5 NEAR allowance + oyun metodları" riskini yaz.
4. **FIX-F2C-4 (küçük):** Dev bileşenini prod paketinden çıkar (örn. `next/dynamic` ile yalnızca `NODE_ENV !== "production"` dalında import) ya da en azından kabul edilen risk olarak not düş.
5. **FIX-F2C-5 (doküman):** `VERSIONS.md`'den `@near-js/keystores` satırını sil veya "geçişli" diye işaretle, `@noble/hashes` için tam sürüm sabitle.

AUDIT-F2C DONE
