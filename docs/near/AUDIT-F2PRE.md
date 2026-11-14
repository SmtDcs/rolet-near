# Rolet NEAR — F2 Öncesi Denetim (AUDIT-F2PRE)

> Tarih: 2026-11-14 · Kapsam: `d29f882..9a287c3` (FIX-03-R, VALUES-FIX-01..05, FIX-13..17, EK2 ortak deste) · Dal: `near`
> Yöntem: diff'i ve ilgili dosyaları okudum. **`cargo test` çalıştırmadım** (denetçi kod/commit yazmaz, test sonuçları rapora dayanıyor). Statik sayım raporla uyuşuyor: `src/` 131 `#[test]`, `tests/integration.rs` 6 test. Scriptleri çalıştırmadım.
> Wasm tazeliği: `target/near/rolet_near.wasm` (20:57:57) `game.rs`'ten (20:58:41) eski. Release wasm (20:58:50) ise yeni, ve `assert_wasm_fresh` test başında ikisinin en yenisine bakıyor, yani kontrol geçer. Büyük olasılıkla `game.rs`'teki son değişiklik yalnızca test kodudur. Bayt eşitliğini doğrulayamadım.
> Kısaltma: **Tamam** = kabul kriteri karşılanıyor · **Kısmi** = ana hedef tamam, açık boşluk var · **Hatalı** = karşılanmıyor.

## 0. Özet

| Başlık | Sonuç |
|---|---|
| Maddeler | 9 Tamam, **2 Kısmi** (VALUES-FIX-04 dokümanları, FIX-17), Hatalı yok |
| Ortak deste | Yeni rastgelelik/güvenlik riski yok. Deste bitince panik yok, otomatik yenileniyor. Gaz yeterli (2,26× pay). Tek tasarım sorunu: `item_bag` ölü config oldu |
| Scriptler | Anahtar sızıntısı yok (`sign-with-keychain`). Hard-code'lu gerçek hesap yok. **Mainnet'e gitmeyi engelleyen hiçbir şey yok**, `eval` ve vakum `:?` kontrolü var |
| F2 | Kod tarafında bloklayıcı yok. **Gerçek function-call key ile hiçbir test yapılmamış** ve T-119 koşulmamış. 8 küçük FIX önerdim (§4) |

---

## 1. Madde bazlı sonuç

| Madde | Sonuç | Kanıt (dosya:satır) |
|---|---|---|
| FIX-03-R simetrik `settle_storage` | **Tamam** | `lib.rs:136-148` artış düşülüyor, azalış `saturating_add` ile iade. `matches.rs` `fix03r_join_cancel_and_reveal_timeout_restore_treasury`: `join→cancel` ×3 ve reveal-timeout sonrası `storage_usage` ve `treasury` başlangıca dönüyor. Ayrıntı için §1.1 |
| VALUES-FIX-01 `max_items=4`, R1 dahil 4 eşya | **Tamam** | `config.rs:73,120`, `deal_items` `game.rs:421-423` (boş slot kadar tamamlıyor, el 4'e doluyor). R1 dağıtımı `matches.rs:519-534` (`reveal`). Test `r1_reload_deals_items` |
| VALUES-FIX-02 Tincture %50 | **Tamam** | `config.rs:119`. Sınır testleri roll 49 → +2, roll 50 → −1. Kodda eşik `Config`'ten okunuyor |
| VALUES-FIX-03 "en az 2 kuru" | **Tamam** | `config.rs:183-185` `load_size - max_live >= 2`, red testleri `config.rs` test modülünde |
| VALUES-FIX-04 doküman eşitleme | **Kısmi** | DECISIONS #10, `DESIGN.md:94` ("Round 1: eşya yok"), `:59` ("8 slotluk ızgara", "2/4 eşya"), `TASKS.md:60,101` ("8 slot", "eşyasız") ve DECISIONS #7 (R2 torbası "hikâye beşlisi") hâlâ eski. #7 ile #10 artık birbiriyle çelişiyor. Bkz. FIX-F2-3 |
| FIX-13 NFT resolver + `base_uri` | **Tamam** | `nft.rs:224-243` (`nft_resolve_transfer` `:226`): kilitliyse `true` (alıcıda kalır), değilse SDK iadesi. `nft_transfer_call` kilit kontrolü `:169`. Sandbox: `integration.rs:733` (iade). Kilitli yarış yalnızca birim testte (`nft.rs` `resolve_transfer_keeps_locked_token_with_receiver`), sandbox'ta yok. Not: `base_uri: "https://rolet.app"` (`nft.rs:213`) sahip olunmayabilecek bir alan adı, Samet teyit etsin |
| FIX-14 `get_actions` + top-100 | **Tamam** | `views.rs:149-168` (`first_seq` boş logda da doğru), `:102-134` artımlı güncelleme, 1000 oyunculu test. Notlar için §1.2 |
| FIX-15 `assert_owner` + grace | **Tamam** | `lib.rs:121-124` ABI dışı (`pub(crate)`, `#[near]` bloğu dışında). `matches.rs:27,603-606` grace yalnızca `Active` aşamasında (S-15 tarifi de bu). `Revealing` aşamasında yok (`:577`), bkz. FIX-F2-8 |
| FIX-16 sandbox kapsamı + VALUES-FIX-05 | **Tamam** | 6 sandbox testi: cancel, claim_timeout (2 aşama), 9 eşyanın tamamı, gaz tablosu (`VERSIONS.md:54-72`), `assert_sandbox_solvent`, `assert_wasm_fresh`. Zayıf yönler için §1.3 |
| FIX-17 doküman + F1 kapanışı | **Kısmi** | DESIGN §4.3/§4.6/§4.7 güncel (`DESIGN.md:284, 379, 413`). Scriptler ve `E2E.md` var. **Kabul kriteri "tx hash'leri `E2E.md`'de" karşılanmıyor** (T-119 koşulmadı, `E2E.md:3`). Rapor bunu zaten "kısmi" yazmış, dürüst |
| EK2 ortak deste | **Tamam** (notlarla) | §2 |

### 1.1 FIX-03-R notları

- Önceki "ikincil" bulgular duruyor, ama Orta değil: `saturating_sub` (`lib.rs:141`) treasury yetmezse borcu sessizce sıfırlıyor. `assert_solvent` (`lib.rs:151`) hâlâ yalnızca test kodunda.
- **Yeni, sınırlı (Düşük):** `top_leaderboard` `Contract` kökünde (`lib.rs:56`). Kök, metot dönünce yazılıyor, bu yüzden `env::storage_usage()` farkına (`settle_storage`) girmiyor. Büyüme en fazla 100 × ~80 B ≈ 8 KB ≈ 0,08 NEAR ve treasury'den düşülmüyor. Tek seferlik ve sınırlı, ama muhasebe değişmezi bunu görmüyor.
- Birkaç test beklenen değeri uygulamayla aynı formülden hesaplıyor (`matches.rs` `expected_treasury`). Bu tautoloji, yalnızca `fix03r_…` testi gerçek denetim yapıyor. Yeter, ama bilinsin.

### 1.2 FIX-14 notları

- `leaderboard` artık `Contract` kökündeki `Vec`'ten okuyor. Kök **her çağrıda** (`fire` dahil) deserialize ve serialize ediliyor. Tahminen ≤0,3 Tgas ek (8 KB yazma, ölçmedim). `VERSIONS.md` ölçümlerinde liste ≤2 girişli, yani bu maliyet ölçülmedi. 10 Tgas eşiğine yine sığar, ama sayı yazılmalı (FIX-F2-6).
- `lock_in` (`matches.rs:232`) sıfır maçlı oyuncuyu da listeye alıyor. Zararsız (liste dolunca gerçek oyuncu onu eler), ama liste sybil ile şişirilebilir.
- Önceki bir üyenin kayıpla geri düşmesi, elenmiş birinin yeniden girmesini geciktirebilir. Yalnızca eşit galibiyet beraberliklerinde. İhmal edilebilir.

### 1.3 FIX-16 notları

- `assert_wasm_fresh` mtime tabanlı ve release wasm'ı fallback sayıyor. `git checkout` mtime'ı sıfırlar, yani `cargo near build` unutulsa bile geçebilir. Hash (ör. `build.rs` ile kaynak özeti) daha sağlam. Düşük.
- Gaz ölçümü: en pahalı dal 4,423 Tgas, eşik 10 Tgas (2,26×). Ölçüm dallarında dolu leaderboard yok (bkz. §1.2).

---

## 2. Ortak deste (EK2)

**Kod:** `game.rs:410-450` (`deal_items`), `:53,66` (`ALL_ITEMS`, `new_deck`), `matches.rs:517,522` (R1 kurulumu).

### 2.1 Güvenlik ve rastgelelik: yeni risk yok

- **Çekiliş zamanı doğru.** Her kart `src.roll(total)` ile, onu tetikleyen `fire`/`reveal` işleminde çekiliyor. `ChainSource` `sha256(seed ‖ nonce ‖ random_seed)` kullanıyor (`rng.rs:38-46`). Çekiliş sonucuna göre geri alma, FIX-01 gaz tabanıyla (`reveal`/`fire`/`use_item` en başta, `matches.rs:325,479,545,554`) kapalı.
- **R1 dağıtımı** ikinci `reveal` işleminde, `random_seed`'e bağlı. İkinci revealer ilk sırrı görüyor, ama kendi sırrı `join` anında taahhütlü, blok tohumunu bilemez. Önceki denetimle aynı güvenlik düzeyi.
- **Bilgi sızıntısı yok.** `deck_counts` (`GameState`, MatchView'da) = 4 − dağıtılan kartlar, ve dağıtım zaten herkese açık (`ItemsDealt`). Kart sayımı mümkün ama gizli bilgi değil. (`deck_counts`, `deck_remaining` ve `get_deck_remaining` üçü de var, gereksiz tekrar. Düşük.)
- **Modulo sapması** `r % 36`: 2³² mod 36 = 4, ihmal edilebilir.
- Maç `m.config` snapshot'ı kullanıyor, `set_config` yürüyen maçın destesini değiştirmiyor.

### 2.2 Deste tükenince ne oluyor, panik var mı: yok

- `total == 0` ise `deck_counts = [copies; 9]` ve devam (`game.rs:426-430`). Dağıtımın ortasında da çalışıyor (test `shared_deck_deals_without_replacement_and_refills`, `…respects_custom_copies_per_item`).
- Panik yolu yok: `*count_slot -= 1` yalnızca `pick < c` iken yapılıyor (`c ≥ 1`), `ALL_ITEMS[0]` yedeği erişilemez. `copies_per_item ≥ 1` `check()`'te (`config.rs:189-191`), üst sınır yok ama `u8 × 9 = 2295` taşmıyor (`u32`/`u16`).
- Yenileme yalnızca destedeki kart sayısı sıfırken oluyor, bu yüzden az sayıda kart kalmışken başka türden "çifte" kopya çıkabilir. Tasarım gereği ("biterse yeniden doldur").
- Dolu elle dağıtımda kart çekilmiyor (`game.rs:422-423`), yani düşürülen kart desteden tüketilmiyor. Kural net, ama DESIGN "fazla kart düşer" diyor: kart destede kalıyor, düşmüyor. Metin düzeltilsin (Düşük).

### 2.3 Gaz: yeterli

- Yükleme başına 8 `roll` (4+4), önceki torba sistemiyle aynı sayıda `sha256`. Döngü 9 elemanlı, ihmal edilebilir.
- Ölçüm (`VERSIONS.md:64,67,68`): `reveal` (R1 4+4) 2,82 Tgas, `fire` R2 reload 3,25 Tgas, maç sonu + transfer 4,42 Tgas. `MIN_ACTION_GAS` = 10 Tgas, pay 2,26×.
- Log penceresi: yükleme başına 3 giriş (`LoadStarted` + 2 `ItemsDealt`) ve artık R1'de de. `LOG_CAP = 32` (`matches.rs`), 10 yüklemeden sonra eski aksiyonlar kayıyor. `get_actions` artık `first_seq` ile boşluğu bildiriyor, bu yüzden güvenli.

### 2.4 Tasarım sorunu: `item_bag` ölü config (Orta)

- `deal_items` (`game.rs:410-450`) `item_bag`'e bakmıyor, her round'da `ALL_ITEMS` (9 tür) kullanıyor. `item_bag()` (`game.rs:399`) çağrılmıyor. `RoundConfig.item_bag` (`config.rs:24`) yalnızca `check()`'te "boş olmasın" diye doğrulanıyor (`:151`), yani yönetici config'i dolduruyor ama hiçbir etkisi yok.
- FIX-12'nin "item_bag Config'te" kabul kriteri fiilen geçersiz. R1'in beşli torbası (`config.rs:75-81`) artık yanıltıcı: R1'de Tincture/Ticker/Magnet/Lockpick de çıkıyor.
- DESIGN `:390` "yapı uyumluluğu için korunur" diyor, kasıtlı, ama bir `set_config` çağrısı sessizce yanlış anlaşılabilir. Ya alan kaldırılsın (state henüz deploy edilmedi, bedava) ya da deste filtrelensin. Öneri: kaldır, `check()`'teki kuralı da sil (FIX-F2-3).

---

## 3. Scriptler (`scripts/deploy-testnet.sh`, `scripts/cli-match.sh`)

### 3.1 Güvenli olanlar

- **Anahtar sızıntısı yok.** Tüm imzalar `sign-with-keychain`, scriptte özel anahtar, seed ya da `.env` okuma yok. `echo "+ $*"` yalnızca komut metnini yazıyor.
- **Gerçek hesap hard-code'u yok.** Varsayılanlar `*.example.testnet` (`deploy-testnet.sh:40-41`, `cli-match.sh:29-31`).
- `--dry-run` ağa dokunmuyor (`run_or_print`), `set -euo pipefail` var.
- `INIT_CONFIG_JSON` değerleri `Config::default()` ile uyumlu (price 1 NEAR, reward 0,1 NEAR = 1e23, allowance 0,5 NEAR, `copies_per_item: 4`, `max_items: 4`, tincture 50).
- `cli-match.sh` taahhüt formülü `sha256(secret ‖ account ‖ match_id_le)` kontrattaki `rng.rs:17-24` ile aynı.

### 3.2 Sorunlar

| # | Önem | Sorun | Yer |
|---|---|---|---|
| S1 | **Orta** | **Mainnet koruması yok.** `NEAR_NETWORK` serbest, doğrulama yok. `NEAR_NETWORK=mainnet ROLET_CONTRACT_ID=x.near ./deploy-testnet.sh` doğrudan mainnet'e deploy edip `fund_treasury` ile **gerçek NEAR** gönderir. Hesap adı soneki de kontrol edilmiyor | `deploy-testnet.sh:38,43-46`, `cli-match.sh:28` |
| S2 | **Orta** | **`eval "$@"` ile ortam değişkeni enjeksiyonu.** `ROLET_OWNER_ID`, `PLAYER_A/B`, `ROLET_CONTRACT_ID`, `FUND_AMOUNT` komut satırına tırnaksız/tek tırnaklı gömülüp `eval`'lanıyor. İçinde `'` ya da `;` olan bir değer rastgele komut çalıştırır. Kendi ortamınız olduğundan sömürü zor, ama hata yapmak kolay ve `INIT_ARGS` içindeki tek tırnak yüzünden OWNER_ID bozulursa komut kırılır | `deploy-testnet.sh:76-83,88-90`, `cli-match.sh:60-67,72-73,84-94` |
| S3 | Düşük | **Vakum `:?` kontrolü.** `PLAYER_A`/`PLAYER_B` önce varsayılana atanıp sonra `:?` ile test ediliyor, bu yüzden gerçek çalıştırmada eksik değişken hata vermez, `alice.example.testnet` ile gider. `ROLET_CONTRACT_ID` ise doğru kontrol ediliyor | `cli-match.sh:30-31,35-37` |
| S4 | Düşük | **Sabit sırlar** `0x11…` ve `0x22…` her maçta aynı (`:55-56`). Testnet duman testi için zararsız (tohum `random_seed`'e de bağlı), ama script F2 istemcisine şablon olursa tehlikeli. `openssl rand`/`/dev/urandom` ile üretilsin. `reveal` komutu sırrı `echo` ile terminale ve `ps`'e yazıyor | `cli-match.sh:55-58,88-89` |
| S5 | Düşük | **Takipli dosyayı yazıyor.** Deploy `apps/web/.env.example` dosyasını `sed -i` ile değiştiriyor (git'te kirli diff). `.env.local`'a yazılmalı. Ayrıca `CONTRACT_ID` içinde `|` olursa `sed` kırılır | `deploy-testnet.sh:97-101` |
| S6 | Düşük | `USE_DEFAULT_CONFIG=1` başlıkta belgelenmiş (`:13`), scriptte **uygulanmamış**. Config JSON elle kopyalanmış, `Config::default` değişince sessizce sapar (EK2'de zaten bir alan eklendi) | `deploy-testnet.sh:13,49-72` |
| S7 | Düşük | `buy_character` her çalıştırmada iki kez 1 NEAR harcıyor, "mevcut token yoksa" yorumu koda yansımamış. Birden çok token sahibinde `limit:1` kilitli token seçebilir | `cli-match.sh:71-73,79-80` |
| S8 | Bilgi | near-cli-rs sözdizimi **doğrulanmadı**: `VERSIONS.md:23` CLI sürümü "ölçülemedi". `bash -n` yalnızca bash sözdizimine bakar. `--dry-run` çıktısı `near` ile hiç denenmemiş. Ayrıca `non-reproducible-wasm` yalnızca testnet için uygun (mainnet'te reproducible build gerekir) | genel |

Dry-run'ın kendisi güvenli: yalnızca `date`, `python3 -` ve yazdırma çalışıyor.

---

## 4. F2'ye (function-call access key) geçiş

### 4.1 Bloklayıcı var mı?

Kod tarafında **zorunlu bloklayıcı yok**. FC key uyumu doğrulandı:

- Oyun metodlarının hiçbiri `#[payable]` değil. Payable olanlar `fund_treasury` (`treasury.rs:13`), `buy_character` (`nft.rs:81`), `nft_transfer`/`nft_transfer_call` (`nft.rs:147,160`). FC key bunları çağıramaz, yani çalınan key NFT'yi taşıyamaz, satın alamaz. DESIGN §4.3 ile uyumlu.
- `require_direct_call` (`predecessor == signer`, `matches.rs:123-128`) FC key ile sağlanıyor.
- Maç sonu ödül `Promise::transfer` kontrat tarafında, key izni gerekmiyor. `claim_reward` listede yok (cüzdanla çağrılır), UI'da belirtilmeli.
- `assert_owner` ABI'den çıktı, owner metodları FC key allowance'ından erişilemez.

Ama **kanıtlanmamış iki şey** F2'nin ilk haftasında patlar:

1. **Gerçek FC key ile hiçbir test yok.** `tests/integration.rs` içinde `add_key`/`FunctionCall`/ayrı imzalayıcı sıfır hit. Birim testler yalnızca `signer == predecessor` taklidi yapıyor (`matches.rs:646-652`). İzin listesi (`method_names`), allowance ve `NotEnoughAllowance` hiç sınanmadı.
2. **Allowance bütçesi tahmin.** NEAR'da allowance tx başında **ön ödemeli gazın tamamı** üzerinden düşer, kullanılmayan gaz hesap bakiyesine döner, allowance'a dönmez. Bu yüzden her çağrı ≈ 10 Tgas × 1e-4 NEAR/Tgas ≈ **0,001 NEAR**, 0,5 NEAR ≈ ~500 çağrı. DESIGN `:284` (§4.3 madde 3) hem "gerçek yanma 0,00044" diyor hem "iade doğrulanacak" diyor: bu iki ifade çelişiyor. Testnet'te ölçülmeden hint (`allowance_hint`) güvenilir değil. (Benim bilgim, doğrulanmadı: T-201/testnet'te kontrol edin.)

### 4.2 Numaralı küçük FIX listesi

1. **FIX-F2-1 · Gerçek FC key sandbox testi (zorunlu).** `near-workspaces` ile oyuncu hesabına `FunctionCall{receiver=kontrat, method_names=[join, reveal, cancel, fire, use_item, claim_timeout], allowance}` key ekleyip tam bir maçı bu key ile oynayın. Kabul: (a) `nft_transfer`, `buy_character`, `fund_treasury`, `claim_reward` ve owner metodları bu key ile reddediliyor, (b) allowance düşüşü ölçülüyor ve DESIGN §4.3'e gerçek sayı yazılıyor, (c) allowance bitince `NotEnoughAllowance`.
2. **FIX-F2-2 · Script sertleştirme + T-119.** `NEAR_NETWORK`'ün `testnet` olduğunu ve hesap adlarının `.testnet` ile bittiğini zorunlu kılın (S1), `eval`'i kaldırıp dizi kullanın (S2), `:?` kontrolünü varsayılandan önce yapın (S3), rastgele sır üretin (S4), `.env.local`'a yazın (S5), `USE_DEFAULT_CONFIG`'i uygulayın ya da başlıktan silin (S6). Sonra **Samet onayıyla** T-119'u çalıştırıp tx hash'lerini `E2E.md`'ye yazın. Kabul: `near --version` ve near-cli-rs sözdizimi `VERSIONS.md`'de doğrulanmış.
3. **FIX-F2-3 · `item_bag` ve eski doküman temizliği.** `RoundConfig.item_bag`'i ve `check()` kuralını kaldırın (ya da desteyi filtreleyin). DECISIONS #7'ye "EK2 ile geçersiz" notu, `DESIGN.md:59,94,390`, `TASKS.md:60,101` güncellensin ("R1 eşyasız", "8 slot", "fazla kart düşer" ifadeleri). Kabul: `grep -n "eşyasız\|8 slot"` eski anlamla hit vermiyor.
4. **FIX-F2-4 · Durum düzeni dondurma.** Testnet'e ilk deploy'dan önce `Contract`/`Config`/`GameState` borsh düzeni dondurulsun. Bu aralıkta üç kez değişti (`Config`, `GameState.deck_counts`, `Contract.top_leaderboard`). Sürüm alanı ve `#[private] migrate` iskeleti ekleyin ya da "her değişiklikte yeniden deploy" kuralını DECISIONS'a yazın. Kabul: DECISIONS'ta kural var.
5. **FIX-F2-5 · `ActionsPage` ve `deck_*` şeması.** `docs/near/schema/` yalnızca `match-view.json` içeriyor. `get_actions`'ın yeni zarfı için `actions-page.json` ve `match-view.json` testi gibi bir birebir deserialize testi ekleyin. `deck_counts` + `deck_remaining` + `get_deck_remaining` üçlüsünden birini bırakın. Kabul: web/Godot istemcisi şemadan tür üretebiliyor.
6. **FIX-F2-6 · Dolu leaderboard ile gaz ölçümü.** `top_leaderboard`'u kökten çıkarın (ayrı `LazyOption`/`Vector` anahtarı) ya da 100 girişli (64 karakterlik hesap adlı) listeyle `fire`/`join` gazını ölçüp `VERSIONS.md`'ye yazın. Kabul: ölçülen gaz tablosunda dolu liste satırı var, `MIN_ACTION_GAS` payı hâlâ ≥2×.
7. **FIX-F2-7 · `settle_storage` kökü de saysın (isteğe bağlı).** Kök büyümesi (≈0,08 NEAR sınırı) için sabit rezerv `min_treasury`'ye eklensin ya da liste ayrı anahtara taşınınca sorun kendiliğinden kapanır (FIX-F2-6 ile birleşir).
8. **FIX-F2-8 · `Revealing` aşamasına grace (Düşük).** `claim_timeout` Revealing dalına (`matches.rs:577`) `TIMEOUT_GRACE_MS` ekleyin. Son saniyede dürüst reveal ile rakibin `claim_timeout`'u yarışıyor ve geç kalan durability kaybediyor. Kabul: `now >= reveal_deadline_ms + grace` testi.

### 4.3 F2 UI için bilinen sınırlar (FIX değil)

- `ItemResult::Private{shell}` (Loupe/Ticker/Magnet) kalıcı `log`'a, NEP-297 olayına ve işlem dönüş değerine yazılıyor (`game.rs:712,746`, `matches.rs:137-145`). Rakip UI'ı `get_actions` ile okuyabilir. DESIGN R1 bunu "v1'de UI gizliliği" diye kabul ediyor. F2 istemcisi rakibin `Private` aksiyonlarını göstermemeli ve README'de açık yazılmalı.
- `claim_reward` FC key ile çağrılamaz: UI cüzdana yönlendirmeli.

AUDIT-F2PRE DONE
