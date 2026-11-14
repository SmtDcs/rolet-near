# Rolet NEAR — F2 Planı (Function-call access key, T-201..T-205)

- **Tarih:** 2026-11-14 · **Dal:** `near` · **Kaynak:** `TASKS.md` F2, `DESIGN.md` §4.2/§4.3, `CLIENT-CONTRACT.md`, `AUDIT-F2.md` §5
- **Başlangıç durumu:** kontrat F1 + FIX-F2 + FIX-F2B bitti; `cargo test` → 136 birim + 9 sandbox yeşil; `MIN_ACTION_GAS = 15 Tgas`. T-119 (testnet deploy) Samet'in ayrı worktree'sinde sürüyor.
- **Kodlayıcı kısıtı:** testnet, gerçek cüzdan ve `near` CLI **yok**. npm registry ve yerel `near-sandbox` var. Testnet ya da cüzdan gerektiren her adım 👤 **Samet** olarak işaretli.

---

## 1. Görev bazında ayrım

| Görev | Yerelde yapılabilir (kodlayıcı: saf TS, `node:test`, sandbox) | 👤 Samet / testnet gerektirir |
|---|---|---|
| **T-201** Cüzdan spike | Dev sayfası `app/dev/near-key/page.tsx` (Wallet Selector + MNW + Meteor modülleri, `signIn({contractId, methodNames})` butonu, yedek `AddKey` butonu, key durum paneli, `join→cancel` butonu). `WALLETS.md` şablonu. Derleme ve prod'da 404 kontrolü. | Her cüzdanla gerçekten giriş yapmak, dApp key'i alıyor mu bakmak, yedek `AddKey` denemesi, `join` tx hash'i. Tabloyu doldurmak ve demo cüzdanını seçmek. |
| **T-202** `lib/nearKey.ts` | **Tamamı.** Saf modül, depolama enjekte edilir (testte sahte `Storage`). | — |
| **T-203** Key ekleme akışı | Karar fonksiyonu (`use / signin / addkey / rotate`) ve tablo testleri. `view_access_key` ile key var/yok kontrolü ve yedek `AddKey` yolu (full-access key cüzdanı taklit eder) **sandbox'ta** test edilir. | Dev sayfasında: ilk ziyarette 1 onay, sayfa yenilenince 0 onay, `join` çalışıyor (gerçek cüzdan + testnet). |
| **T-204** İmzalı çağrı katmanı | **Neredeyse tamamı.** `sendGameCall`: imzala, gönder, outcome ayrıştır, nonce'ta yeniden dene, 429'da geri çekil. Sahte transport ile birim testi, gerçek outcome için yerel sandbox'ta tam maç (`fire` → `Action[]`). | Testnet'te iki hesapla `fire` sonucunun dev sayfada `Action[]` olarak görünmesi (tx hash). Gerçek gaz fiyatıyla allowance düşüşünü ölçmek (AUDIT-F2 §5 madde 2'deki ~10× fark). |
| **T-205** FC key güvenlik testi | ✅ **FIX-F2-1 ile karşılandı** (`1610c5a`, sıkılaştırma `cbc5d23`): `fix_f2_1_function_call_access_key_flow` testi şunları doğruluyor: `buy_character` → `MethodNameMismatch`, deposit'li çağrı → `DepositWithFunctionCall`, `set_config`, owner metodları ve `claim_reward` → ret, `join` → başarılı, allowance bitince → `NotEnoughAllowance`. Yalnızca `TASKS.md`'de "tamam" diye işaretlenecek (F2-9). | — |

---

## 2. `apps/web` mevcut durumu

- **Next `16.2.4`**, `eslint-config-next 16.2.4`, **React/React-DOM `19.2.4`**: zaten tam sürümle sabit. `apps/web/AGENTS.md` kuralı geçerli: Next API'si `node_modules/next/dist/docs/` içinden okunacak.
- **NEAR paketi yok:** `@near-wallet-selector/*` ve `@near-js/*` kurulu değil. `node_modules` de kurulu değil, ilk iş `pnpm install`.
- **Solana bağımlılıkları duruyor:** `@solana/web3.js`, `@solana/wallet-adapter-*` (4 paket), `@coral-xyz/anchor`, `@metaplex-foundation/*` (5 paket), `@magicblock-labs/ephemeral-rollups-sdk`, `@bonfida/spl-name-service`. Kullanan dosyalar: `layout.tsx`, `Nav.tsx`, `SolanaProvider.tsx`, `useRolet.ts`, `lib/umi.ts`, `lib/characterMint.ts`, `api/rpc`, `api/stats` ve diğerleri. **F2'de bunlara dokunulmaz.** Kaldırma işi F3'te (T-301, DESIGN §5.1). F2 kodu bunlardan bağımsız, ayrı dosyalarda yaşar.
- **Test altyapısı:** `lib/*.test.ts` dosyaları (`node:test`) var ama `test` script'i ve `tsx` yok. İmportlar uzantısız olduğu için çıplak `node --test` çalışmaz. `tsx` eklenecek.
- **`/api/rpc`** hâlâ Solana devnet'e gidiyor. F2'de dokunulmaz. F2 istemcisi doğrudan `NEXT_PUBLIC_NEAR_RPC_URL` adresine gider (proxy işi F3).
- **Env adları** `deploy-testnet.sh` (S5) çıktısıyla aynı olmalı: `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_ROLET_CONTRACT`, `NEXT_PUBLIC_NEAR_RPC_URL`.

### `VERSIONS.md`'ye sabitlenecekler (`package.json`'da `^` olmadan, tam sürüm)

| Paket | Sürüm | Not |
|---|---|---|
| `@near-wallet-selector/core`, `modal-ui`, `my-near-wallet`, `meteor-wallet` | **10.1.4** | Zaten VERSIONS'ta, npm'de hâlâ en güncel (14 Kas'ta kontrol edildi) |
| `@near-wallet-selector/hot-wallet`, `intear-wallet` | **10.1.4** | Yalnızca Soru 1 "evet" olursa eklenir |
| `@near-js/accounts`, `crypto`, `signers`, `transactions`, `providers` | **2.5.1** | Zaten VERSIONS'ta |
| `@near-js/types`, `@near-js/utils` | **2.5.1** (`npm view` ile doğrula) | Yeni satır |
| `tsx` (devDependency) | **4.23.15** | Yeni satır (test koşucusu) |
| `near-sandbox` ikilisi | **2.14.1** (`contracts/rolet-near/target/debug/build/near-sandbox-*/out/.near/near-sandbox-2.14.1/near-sandbox`) | Yeni satır (F2-6 TS sandbox testi) |

- `near-api-js` şemsiye paketi **eklenmez**. Wallet Selector 10.1.4 `@near-js/* ^2.3.0` ister. Tek kopya olmalı: `pnpm why @near-js/crypto` çıktısında yalnızca 2.5.1 görünmeli. Gerekirse kök `package.json`'a `pnpm.overrides` eklenir.
- `@noble/hashes` (`^2.2.0`) zaten var, sha256 için kullanılır. Yeni hash paketi eklenmez.

---

## 3. Kodlayıcı maddeleri (sırayla, görev başına bir commit, mesaj `F2-n: ...`)

**Genel kurallar:** `apps/server/`, `packages/shared/` ve `contracts/` değişmez. `layout.tsx`, `Nav.tsx`, `SolanaProvider.tsx`, `useRolet.ts`, `api/rpc` de F2'de değişmez. Testler testnet'e **asla** bağlanmaz (yalnızca `127.0.0.1` sandbox). Kütüphane API'leri hafızadan yazılmaz, `node_modules/**/*.d.ts` içinden doğrulanır. `lib/` içindeki saf modüller göreli import kullanır (`@/` kullanmaz), `window`/`localStorage` gibi globallere doğrudan erişmez, bunlar enjekte edilir. `secret` ve özel anahtar hiçbir zaman `console.*` çıktısına, URL'ye ya da hata mesajına yazılmaz (CLIENT-CONTRACT (d)).

Ortak test komutları (repo kökünden):
- `pnpm --filter web test` → `tsx --test lib/*.test.ts`
- `pnpm --filter web test:sandbox` → `tsx --test sandbox/*.test.ts`
- `pnpm --filter web lint` ve `pnpm --filter web build`

### F2-0 · Bağımlılıklar ve test altyapısı
- **Dosyalar:** `apps/web/package.json`, `pnpm-lock.yaml`, `docs/near/VERSIONS.md`.
- §2 tablosundaki paketler tam sürümle eklenir. Script'ler: `"test": "tsx --test lib/*.test.ts"`, `"test:sandbox": "tsx --test sandbox/*.test.ts"`. VERSIONS'a yeni satırlar ve "tek kopya" notu yazılır.
- **Kabul:** `pnpm install` temiz bitiyor. Mevcut `chainPace`, `matchQueue` ve `seat` testleri `pnpm --filter web test` ile yeşil. `pnpm --filter web build` hâlâ yeşil (Solana tarafı bozulmamış). `pnpm why @near-js/crypto` yalnızca 2.5.1 gösteriyor.

### F2-1 · `lib/nearConfig.ts` + `lib/nearTypes.ts`
- **nearConfig:** env okuma (yukarıdaki üç ad; değerler argümanla da verilebilmeli, böylece testlenebilir), `GAME_METHODS = ["join","reveal","cancel","fire","use_item","claim_timeout"] as const`, `ACTION_GAS = 20 Tgas` (15–20 aralığında, CLIENT-CONTRACT (a)), `FC_ALLOWANCE_YOCTO = "500000000000000000000000"`, `WALLET_ONLY_METHODS = ["buy_character","claim_reward","nft_transfer"]`.
- **nearTypes:** `Action`, `ItemResult`, `ActionsPage`, `MatchView` TS tipleri (serde `kind` etiketli biçim) ve `isAction(x)` çalışma zamanı denetimi.
- **Test (`lib/nearConfig.test.ts`, `lib/nearTypes.test.ts`):** `GAME_METHODS` listesi tam olarak bu 6 metod ve sıralı. `FC_ALLOWANCE_YOCTO` değeri `contracts/rolet-near/init-config.json` içindeki `allowance_hint` ile eşit (test dosyayı okur). `15e12 <= ACTION_GAS <= 20e12`. `docs/near/schema/actions-page.json` ve `match-view.json` örneklerindeki her aksiyon `isAction` kontrolünden geçiyor.
- **Kabul:** `pnpm --filter web test` yeşil.

### F2-2 · `lib/nearKey.ts` (T-202)
- `generateKeyPair()` (`@near-js/crypto`, ed25519). `storageKey(account, contract)` → `rolet:fck:<account>:<contract>`. `saveKey`, `loadKey`, `deleteKey`: kayıt `{secretKey, publicKey, createdAt, allowanceYocto}`, `Storage` arayüzü enjekte edilir. `isAllowanceError(err)` (`NotEnoughAllowance`). `isAccessKeyMissing(err)` (`AccessKeyDoesNotExist` / `InvalidAccessKeyError` + key yok). `isMethodDenied(err)` (`MethodNameMismatch`, `DepositWithFunctionCall`).
- Hata tanıyıcılar hem RPC JSON hata biçimini hem `@near-js` hata nesnelerini kabul eder. Fixture'lar `lib/__fixtures__/near-errors/*.json` altında durur (ilk sürüm elle yazılır, F2-6 gerçek sandbox çıktısıyla değiştirir).
- **Test (`lib/nearKey.test.ts`):** kaydet → yükle → sil turu. Farklı hesap ya da kontrat anahtarları çakışmıyor. Bozuk JSON kayıtta `loadKey` null dönüyor. Her tanıyıcı kendi fixture'ında true, diğerlerinde false.
- **Kabul:** `pnpm --filter web test` yeşil (TASKS T-202 "Bitti").

### F2-3 · `lib/nearCommit.ts`
- `generateSecret()` (`crypto.getRandomValues`, 32 bayt). `commitment(secret, accountId, matchId: bigint)` = `sha256(secret ‖ utf8(account) ‖ u64_le(matchId))` (`contracts/rolet-near/src/rng.rs:17` ile birebir). base64 yardımcıları. `saveSecret`, `loadSecret`, `clearSecret`: `sessionStorage` enjekte edilir, anahtar `rolet:secret:<account>:<contract>:<matchId>`.
- T-302 bu modülü yeniden kullanır. Burada yazılmasının nedeni T-201/T-203 için gereken `join` çağrısı.
- **Test (`lib/nearCommit.test.ts`):** `rng.rs:178` (`commitment_fixed_vector_and_sensitivity`) içindeki sabit vektör TS'te aynı hash'i veriyor. Bir bayt değişince hash değişiyor. `generateSecret` 32 bayt ve iki çağrı farklı sonuç veriyor. Kaynak dosyada `console.` geçmiyor (test dosyayı okuyup assert eder).
- **Kabul:** `pnpm --filter web test` yeşil.

### F2-4 · `lib/nearOutcome.ts`: outcome ayrıştırma ve hata sınıflandırma
- `parseOutcome(finalOutcome)` → `{ ok, returnValue (SuccessValue base64 → JSON), events (tüm receipt loglarında EVENT_JSON:{standard:"rolet"} satırları), failure? }`.
- `classifyError(err)` → `"allowance" | "missingKey" | "methodDenied" | "nonce" | "rateLimit" | "contractPanic" | "network" | "other"`.
- **Test (`lib/nearOutcome.test.ts`):** fixture'lar `lib/__fixtures__/outcomes/*.json` altında: başarılı `fire`, panik (`"insufficient gas"`), allowance hatası, InvalidNonce, HTTP 429. `fire` fixture'ı `Action[]` döndürüyor ve hepsi `isAction` kontrolünden geçiyor. Başka standarttan gelen loglar atlanıyor.
- **Kabul:** `pnpm --filter web test` yeşil.

### F2-5 · `lib/nearCall.ts`: `sendGameCall` (T-204'ün çekirdeği)
- `createGameCaller({ accountId, contractId, keyPair, rpcUrl, transport? })` → `sendGameCall(method, args, { gas = ACTION_GAS })`. `method` için `GAME_METHODS` dışı bir değer (`claim_reward` gibi) TS'te derleme hatası, çalışma zamanında `WalletRequiredError` olmalı. Deposit her zaman 0.
- İmzalama ve gönderme `@near-js/accounts` / `signers` / `providers` ile yapılır. `transport` enjekte edilebilir.
- Nonce: `view_access_key`'den alınır. `nonce` hatasında taze nonce ile **en fazla 3** yeniden deneme. `rateLimit` için mevcut `lib/chainPace.ts` `rateLimitPlan` kullanılır (uymuyorsa aynı dosyada küçük bir `backoffMs(attempt)`). `allowance`, `missingKey`, `methodDenied` ve `contractPanic` hataları **yeniden denenmez**, tipli hata olarak fırlatılır (`AllowanceExhaustedError`, `AccessKeyMissingError` ...).
- Aynı key ile eşzamanlı çağrılar tek kuyrukta sıraya alınır (nonce çakışmasını baştan önlemek için).
- **Test (`lib/nearCall.test.ts`, sahte transport):** başarılı yol `parseOutcome` sonucunu döndürüyor. 2 nonce hatasından sonra 3. denemede başarı. 4. nonce hatası fırlatılıyor. 429'da bekleme süresi artıyor (sahte saat). Allowance hatasında tek deneme yapılıp `AllowanceExhaustedError` fırlatılıyor. `claim_reward` reddediliyor. Eşzamanlı iki çağrı sıralı nonce kullanıyor.
- **Kabul:** `pnpm --filter web test` yeşil.

### F2-6 · Yerel sandbox E2E (`apps/web/sandbox/near-e2e.test.ts`)
- **Ön koşul:** `cd contracts/rolet-near && cargo near build non-reproducible-wasm` (wasm: `target/near/rolet_near.wasm`). Sandbox ikilisinin yolu `NEAR_SANDBOX_BIN` env'inden okunur, yoksa §2'deki varsayılan yol kullanılır. Başlatma argümanları için `~/.cargo/registry/src/*/near-sandbox-0.4.1/src/` kaynağına bakılır (`--home <tmp> init`, ardından `run`, RPC portu config'den). İkili bulunamazsa test **açık bir mesajla skip** edilir, sessizce geçmez.
- **Akış:** genesis/validator key ile `rolet`, `alice` ve `bob` hesapları açılır. Wasm deploy edilir, `new(owner, init-config.json)` çağrılır, `fund_treasury` yapılır. Her oyuncu `buy_character` çağırır (full-access key, cüzdanı taklit eder). `nearKey.generateKeyPair` ile üretilen key, açık `AddKey` ile eklenir (T-203 yedek yolu). Ardından **yalnızca `sendGameCall` ile**: iki `join` (commit `nearCommit`'ten), iki `reveal`, `MatchEnded` gelene ya da 60 hamleye kadar `fire(Opponent)`.
- **Assert:** her `fire` sonucu boş olmayan bir `Action[]` ve hepsi `isAction` kontrolünden geçiyor. Son durumda `MatchEnded` var. FC key ile `claim_reward` denemesi `methodDenied` olarak sınıflanıyor (ham tx gönderilerek, `sendGameCall` atlanır). Allowance'ı `1 yocto` olan ikinci bir key `allowance` olarak sınıflanıyor. Key silindikten sonra `missingKey` alınıyor.
- **Yan çıktı:** gerçek outcome ve hata JSON'ları `lib/__fixtures__/` altına yazılır (`UPDATE_FIXTURES=1` ile). F2-2 ve F2-4 testleri bu gerçek fixture'larla da yeşil kalmalı.
- **Kabul:** `pnpm --filter web test:sandbox` yeşil, `pnpm --filter web test` yeşil.

### F2-7 · `lib/nearKeyFlow.ts`: key edinme kararı (T-203 saf kısmı)
- `decideKeyAction({ stored, onChain: "present"|"missing"|"unknown", lastError?, walletSupportsFcKey })` → `"use" | "signin-with-methods" | "addkey" | "rotate"`. Kurallar: key saklıysa ve zincirde varsa `use` (0 onay). Saklı değilse ya da zincirde yoksa cüzdan destekliyorsa `signin-with-methods`, desteklemiyorsa `addkey`. Allowance hatası alındıysa `rotate` (yeni key, tek onay, DESIGN §4.3 madde 5). `signOut` saklı key'i siler.
- `checkKeyOnChain(rpc, account, publicKey)`: `view_access_key` çağırır, izin (`receiver_id`, metodlar) doğru değilse `"missing"` sayar.
- **Test:** `lib/nearKeyFlow.test.ts` tablo testi (her dal). `sandbox/near-e2e.test.ts`'ye ek: key eklendikten sonra karar `use`, silindikten sonra `addkey`.
- **Kabul:** her iki test komutu yeşil.

### F2-8 · Dev sayfası (T-201 + T-203 + T-204 arayüzü)
- **Dosyalar:** `apps/web/app/dev/near-key/page.tsx`, `apps/web/components/dev/NearKeyLab.tsx` (`"use client"`), `docs/near/WALLETS.md` (şablon).
- Sayfa yalnızca dev ortamında açılır: `process.env.NODE_ENV === "production"` ise `notFound()`. Wallet Selector modülleri: MNW ve Meteor (Soru 1 "evet" ise HOT ve Intear de). `setupWalletSelector` / `signIn` / `createAccessKeyFor` biçimi `@near-wallet-selector/core` `.d.ts` dosyalarından doğrulanır. Modal CSS yalnızca bu bileşende import edilir.
- **Paneller:**
  1. Bağlan / çık.
  2. "Key durumu": `nearKey` + `checkKeyOnChain` + `decideKeyAction` sonucu. Cüzdanın kendi keystore'unda FC key var mı (MNW için localStorage anahtarlarını listeler, değerleri **göstermez**).
  3. "signIn(methodNames)" ve "Yedek AddKey" butonları.
  4. "buy_character (cüzdan, 1 NEAR)".
  5. "join → cancel" (FC key ile, tx hash gösterir).
  6. `match_id` + rakip alanı ile join, reveal ve `fire` butonları. Ayrıştırılmış `Action[]` JSON olarak gösterilir.
  7. "Ölç": bir çağrı öncesi ve sonrası `view_access_key` allowance farkı.
- **`WALLETS.md` şablonu:** sütunlar `Cüzdan | sürüm | signIn key dApp'e geliyor mu | key nerede saklanıyor | yedek AddKey çalışıyor mu | join tx | fire tx | allowance düşüşü | not`. Altında "Demo cüzdanı önerisi: ___" satırı.
- **Kabul:** `pnpm --filter web lint` (yeni dosyalarda hata yok). `pnpm --filter web build` yeşil. `pnpm --filter web dev` çalışırken `curl -s -o /dev/null -w '%{http_code}' localhost:3000/dev/near-key` → `200`. Prod derlemesinde (`next start`) aynı istek → `404`. Cüzdan etkileşimi kodlayıcı tarafından **test edilmez**, Samet'e kalır.

### F2-9 · Doküman kapanışı
- `docs/near/TASKS.md`: T-205 "✅ FIX-F2-1 (`1610c5a`, `cbc5d23`) ile karşılandı" olarak işaretlenir. T-202 tamam. T-201, T-203 ve T-204 "yerel kısım tamam, 👤 testnet doğrulaması bekliyor" diye not alır.
- `docs/near/F2-REPORT.md`: madde, commit, test çıktısı (sayılarla) ve Samet'e kalan adımlar. Son satırı `F2 DONE`.
- **Kabul:** `pnpm --filter web test`, `pnpm --filter web test:sandbox` ve `cd contracts/rolet-near && cargo test` (136 + 9, değişmemiş) çıktıları rapora yapıştırılmış.

---

## 4. 👤 Samet adımları (T-119 deploy edip `apps/web/.env.local` yazıldıktan sonra)

1. `pnpm --filter web dev`, ardından `/dev/near-key`. Her cüzdanda (MNW, Meteor, varsa HOT/Intear): giriş yap, dApp key aldı mı bak, yedek AddKey dene, `buy_character`, `join → cancel`. `WALLETS.md` tablosunu doldur (**T-201 Bitti**).
2. Seçilen cüzdanda: ilk ziyarette 1 onay, sayfayı yenile, 0 onayla `join` çalışıyor mu (**T-203 Bitti**).
3. İki hesapla (ikinci tarayıcı profili ya da ikinci cüzdan hesabı) aynı `match_id` ile maç: `fire` sonucu dev sayfada `Action[]` olarak görünüyor, tx hash `WALLETS.md`'ye (**T-204 Bitti**). "Ölç" paneliyle allowance düşüşünü kaydet. DESIGN §4.3'teki "~125 maç" tahmini ve AUDIT-F2 §5.2'deki ~10× fark bu ölçümle kapanır.
4. `TASKS.md`'de T-201, T-203 ve T-204'ü kapat, demo cüzdanını `DECISIONS.md`'ye yaz.

---

## 5. Samet'e sorular

1. **Spike kapsamı:** Karar #5 gereği yalnızca MyNearWallet + Meteor mu denensin, yoksa HOT ve Intear de eklensin mi (2 paket daha, HOT için Telegram/mobil gerekir)? *Varsayılan: yalnızca MNW + Meteor.*
2. **Testnet RPC:** `deploy-testnet.sh`, `NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.near.org` yazıyor. Bu uç nokta kısıtlı ve 429'a açık. FastNEAR testnet RPC'si mi yoksa başka bir sağlayıcı mı kullanılsın? *Varsayılan: env'den okunur, Samet değeri `.env.local`'de değiştirir. Kodda sabit URL olmaz.*

PLAN-F2 DONE
