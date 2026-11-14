# Rolet NEAR — FIX-F1 + VALUES Denetimi (AUDIT-FIX)

> Tarih: 2026-11-14 · Kapsam: `d9a17e4..8e9abe1` (FIX-01..12), `67798c2` (VALUES) · Dal: `near`
> Yöntem: kodu ve diff'leri okudum. **`cargo test` çalıştıramadım** (bu oturumda komut onayı yok); "125 birim + 3 entegrasyon yeşil" iddiası raporlara dayanıyor. Doğrulayabildiklerim: `#[test]` sayısı 125 (statik sayım), `target/near/rolet_near.wasm` (20:12) son kaynak değişikliğinden (20:08) yeni, yani sandbox testi güncel wasm'a karşı koşmuş olabilir.
> Kısaltma: **Tamam** = kabul kriteri karşılanıyor · **Kısmi** = ana hedef tamam, açık bir boşluk var · **Hatalı** = kriter karşılanmıyor.

## 0. Özet

| Başlık | Sonuç |
|---|---|
| FIX-01..12 | 11 Tamam (FIX-08 ve FIX-09 VALUES ile bilerek geçersiz kılındı), **1 Kısmi (FIX-03)**, Hatalı yok |
| VALUES | HP, 8 göz, 2..=6 rastgele dolu, duyuru ve lazy draw **kararla uyuşuyor**. **Eşya sayısı uyuşmuyor** (`max_items=8`, "elde 4" değil). `tincture_good_pct=40` kararda yok ve "Rolet değeri" değil |
| Güvenlik gerilemesi | VALUES hiçbir güvenlik fix'ini bozmadı |
| Yeni bulgu | FIX-03'ün asimetrisi: `join→cancel` döngüsü treasury muhasebesini ucuza eritiyor (§1, FIX-03) |

---

## 1. FIX-01..FIX-12

| FIX | Sonuç | Kanıt (dosya:satır) |
|---|---|---|
| 01 Min gas | **Tamam** | `matches.rs:27` (`MIN_ACTION_GAS` 10 Tgas), `:319` (`apply_game_action`), `:473` (`reveal`), `:538`/`:547`. Sandbox: `integration.rs:239-428` düşük gazı reddediyor, tüm maç tam `MIN_ACTION_GAS` ile geçiyor |
| 02 Sonuca bağlı panik | **Tamam** | `game.rs:565-572` eşya önce çıkıyor, hatada aynı slota geri konuyor. `deal_items` serbest slotu sonra hesaplıyor (`:393`). Testler `game.rs:1766`, `:1791` |
| 03 Depolama muhasebesi | **Kısmi** | `lib.rs:131-138` yalnızca artışı düşüyor, bkz. aşağıda |
| 04 Ödeme güvenliği | **Tamam** | `matches.rs:296-308` (`treasury` ve serbest bakiye yetmezse `owed`), `:615-628` (`claim_reward` kısmi öder). Sandbox `integration.rs:431-580`, `owed == 190 mNEAR` |
| 05 Kayıt silme, maç anahtarı | **Tamam** | `matches.rs:157-166` (`match_key`), `:451-464` (`cancel` siler), `:584-587` (reveal-timeout siler), `:247-250` (`release` boş `PlayerState`'i siler). Test `:833-845` depolamanın başlangıca döndüğünü doğruluyor |
| 06 `validate` + snapshot | **Tamam** | `config.rs:123-189`, `lib.rs:75,106`, `matches.rs:85-86,427`. Maç yolları `m.config` kullanıyor (`:328`, `:518`, `:600`, `:296`) |
| 07 Oyuncu başına kablo | **Tamam** | `game.rs:124`, `:437-448` (`HealCut{player}`), `:594`, `:605`. Test `:1809`. `schema/match-view.json:27` ve DESIGN `:347` güncel |
| 08 Varsayılanlar (R3=6, %50) | **Tamam → VALUES ile geçersiz** | `config.rs:88` artık 4, `:111` artık 40. Kabul testi (`default_matches_design`) yeni değerleri sınıyor. Bkz. §2 |
| 09 Yük formülü | **Tamam → VALUES ile yerine geçti** | `r1_loads`/`r2_first_load` kaldırıldı (`config.rs:57-62`), `game.rs:361-368`. "1 ≤ live ≤ blank" değişmezi bilerek bozuldu (live 5-6, blank 3-2 olabilir) |
| 10 Son fişekte Flask | **Tamam** | `end_turn` `game.rs:477-487`, `fire` `:530-531`, Flask `:680-684`. Testler `:1383-1403` (sıra geçiyor, testere sıfırlanıyor, kelepçeli rakip atlanıp kullanana dönüyor) |
| 11 Kelepçe temizliği | **Tamam** | `reload` `game.rs:412-413`, test `:1141` |
| 12 Kural kararları | **Tamam** | `RoundConfig.item_bag` (`config.rs:24`), DECISIONS #7-#9, Ticker ≤1 (`game.rs:695`), Pipe tam can reddi (`:598`) |

### FIX-03 · Kısmi — iade yok, treasury eriyor (Orta)

- **Sorun:** `settle_storage` (`lib.rs:131-138`) yalnızca `storage_after > storage_before` ise treasury'den düşüyor. Depolama azalınca (`cancel`, reveal-timeout, `finish_match` budaması) karşılığı treasury'ye **geri yazılmıyor**.
- **Senaryo:** `join` bir maç kaydı ve üç indeks yazar, bedeli treasury'den düşer (`matches.rs:446`). `cancel` bunları siler ve NEAR kilidi çözülür, ama treasury'ye iade olmaz (`matches.rs:463`).
- **Etki:** Saldırgan `join(rastgele_id, opponent)` → `cancel` döngüsüyle (durability iade ediliyor, FC key yeterli) yalnızca gaz ödeyerek her turda yüzlerce baytlık depolama bedelini muhasebeden eritiyor. Tahminim tur başına ≈0,005–0,01 NEAR (config snapshot dahil), gaz maliyeti birkaç kat düşük. Ölçmedim.
- **Sonuç:** `treasury < min_treasury` olunca `join` "treasury below minimum" ile **tüm yeni maçları** reddeder (`matches.rs:408-411`). Gerçek para kaybı yok, ama ucuz bir DoS. AUDIT S-03'ün muhasebeye taşınmış hali.
- **Düzeltme:** `settle_storage` simetrik olsun. `after < before` ise `freed * byte_cost` kadarını treasury'ye ekle. Birim test: `join→cancel` sonrası `treasury` ve `storage_usage` başlangıçta.
- **İkincil:**
  - `saturating_sub` (`lib.rs:136`) treasury yetmezse sessizce sıfırlıyor ve borç kapanmıyor.
  - `assert_solvent` yalnızca `#[cfg(test)]` ve `matches.rs` içinde 20 yerde çağrılıyor. Kabul kriteri "her test sonunda" idi.

### Küçük notlar (düzeltme zorunlu değil)

- **FIX-01:** `fire`/`use_item` içindeki gaz `require!`'ı `apply_game_action` içindekiyle çift (`matches.rs:319` ve `:538,:547`). Biri silinebilir. Ölçülen "~4,1 Tgas" değeri hiçbir dokümana yazılmamış (FIX-16).
- **FIX-05:** `match_id_index` (`lib.rs:51`) `match_id` başına tek giriş tutuyor. Yabancı biri aynı `match_id` ile kendi çiftine `join` olursa `get_match(id, None)` yanlış maçı döndürür. Oyuncu yolları `active_keys`'e baktığı için etkilenmiyor. Yalnızca UI'nin `players` parametresini kullanması gerekir. Düşük.
- **FIX-10 + 11:** Son fişekte `fire` önce `end_turn` (kelepçeli rakip atlanıyor, `TurnSkipped` yayılıyor), sonra `reload` kelepçeyi siliyor. Bu AUDIT kabul kriteriyle tutarlı, ama gerçek Buckshot'ta yük bitince kelepçenin atlatıp atlatmadığı REFERENCE'ta net değil. DECISIONS'a bir satır yazılsın. Düşük.
- **FIX-12:** REFERENCE-CHECK satır 7'ye göre çok oyunculuda Ticker ≤2 fişekte boşa gider. DECISIONS #8 "≤1" diyor (hikâye davranışı). Bilinçli ise yazılsın. Düşük.

---

## 2. VALUES (`67798c2`)

### 2.1 Karar ↔ kod

| Karar | Kod | Sonuç |
|---|---|---|
| Her oyuncu 4 can | `config.rs:70,76,88` üç round da 4 | Tamam |
| 8 gözlü tabanca | `load_size = 8` (`config.rs:114`), `new_load` `game.rs:361-368` | Tamam |
| Dolu sayısı yüklemede rastgele 2..=6 | `min_live=2`, `max_live=6`, `roll(5)` (`game.rs:365`). Reveal ve her `reload` aynı fonksiyonu kullanıyor (`matches.rs:514`, `game.rs:414`) | Tamam |
| Dolu/kuru sayıları iki oyuncuya duyurulur | `LoadStarted{live,blank,total}` (`game.rs:415`) ve `Load.announced_*` MatchView'da. Reveal'da da loglanıyor (`matches.rs:519-527`) | Tamam |
| Sıra gizli, lazy draw | `Load::new` `fixed = None×8` (`game.rs:286`), çekiliş `fix()` (`:338-353`). Test `rng.rs:~200`: 10 000 tohumda duyurulan sayılar tutuyor, `nonce == 9` | Tamam |
| Best-of-3, R3 eşiği Config'ten | `game.rs:455-458`, `:438-447` (`heal_cut_at: Some(2)`) | Tamam |
| **Elde 4 eşya** | R2/R3 `items_per_load=4`, R1 **0**, `max_items = 8` | **Çelişki (kısmen)** |
| (kararda yok) Tincture %40 | `config.rs:111` | **Kapsam dışı değişiklik** |

### 2.2 "Elde 4 eşya" ve R1 `items_per_load=0`

- **Rolet'teki karşılığı bir 4 slotluk el.** `apps/server/programs/rolet/src/lib.rs:28` `HAND_SIZE = 4`, `:1221-1230` `deal_hand` maç başında 4 kart veriyor, slot sayısı da 4. Samet'in "oyuncunun elinde 4 eşya olur" cümlesi bu değere denk geliyor.
- **`max_items = 8` bu okumayla uyuşmuyor.** Eşyalar yükler arasında korunuyor ve `deal_items` yalnızca boş slot kadar veriyor (`game.rs:393-394`). İki yükte bir oyuncunun eli 8'e çıkabilir, yani "elinde 4" değil.
- **`max_items=4` en az değişiklikle Rolet elini verir.** `deal_items` zaten boş slota tamamlıyor, bu yüzden her yükte el 4'e doldurulur. Kod değişikliği tek satır: `config.rs:112`.
  - Bağımlılıklar: DESIGN `:137` ("8 slot"), `deal_items_drops_extras_when_slots_full` (`game.rs:916`), `flask_at_full_slots_…` (`game.rs:1791`) ve UI'daki 8 slotluk ızgara (T-5xx, DESIGN §3.7).
- **R1 `items_per_load=0` kararla çelişiyor mu?** Cümle "best-of-3 round yapısı korunur" ile birlikte okunursa **belirsiz**. DESIGN §2.5/§3.1 R1'i "eşyasız şans" tanımlıyor ve DECISIONS #10 "[R1 eşyasız]" yorumunu ekledi, ama bu ajanın yorumu, Samet'in sözü değil. Rolet'te el maçın başında dağıtıldığı için aksi okuma da savunulabilir. **Samet'e tek soru:** "R1 de 4 eşyayla mı başlar?"
  - Evet ise: `rounds[0].items_per_load=4` ve boş olmayan `item_bag` gerekir (`config.rs:142-144` aksi halde reddeder).
  - Hayır ise: mevcut kod doğru ve DECISIONS #10'a "R1 bilerek eşyasız (Samet teyidi)" yazılsın.
  - Öneri: soru yanıtlanana kadar R1=0 kalsın (round yapısı karardan açıkça korunuyor).

### 2.3 `tincture_good_pct = 40`

- **Kararda yok.** Samet'in listesinde ilaç yok.
- **Rolet değeri de değil.** Solana programının 12 kartında (`lib.rs:1391-1404`) olasılıklı +2/−1 şişesi yok. %40, DESIGN'ın T-001 öncesi notundan ve Buckshot ≤1.2.0'dan geliyor. REFERENCE-CHECK madde 8: 1.2.1'den itibaren %50.
- **Sonuç:** VALUES, FIX-08'i (50) haber vermeden geri aldı ve DECISIONS #10 bunu "Rolet değeri" diye etiketledi. Ayrıca ilaç bir **Buckshot mekaniği** ve karar "mekanik Buckshot'tan".
- **Öneri:** 50'ye dön. Samet 40 isterse #10'dan "Rolet" ifadesini çıkarıp gerekçeyi yaz.
- **Test etkisi:** `game.rs:1713` `roll=40` ile kötü yolu bekliyor. 50'de bu iyi yol olur, roll 60'a çekilmeli. `:1683` (roll 30) ve `:1698` (roll 10) iki eşikte de geçer.

### 2.4 Rastgelelik ve duyuru sızıntısı

- **Yeni manipülasyon vektörü yok.**
  - `live` çekilişi `ChainSource.roll` ile `sha256(match_seed ‖ nonce ‖ random_seed)` (`rng.rs:39-46,68-75`), kimsenin önceden bilemediği blok tohumuna bağlı.
  - Çekiliş, kendisini tetikleyen `fire` ile aynı işlemde yapılıyor. Gaz tabanı (FIX-01) altında oyuncu "büyük yük çıktı" diye gazla geri alamaz.
  - `r % 5` sapması ihmal edilebilir (2³² mod 5 = 1).
  - Loupe/Ticker `nonce`'u kaydırabilir ama sonuç hâlâ gelecek blok tohumuna bağlı, tahmin edilemez.
  - Kalan risk S-10 (validator/chunk üreticisi), kabul edilmiş.
- **Duyuru sızıntısı yok.**
  - Sayılar herkese aynı anda (aynı işlem) açılıyor.
  - Sıra hiçbir yere yazılmıyor, `fixed` yalnızca açılmış konumları tutuyor.
  - `live_left`/`blank_left` MatchView'da (`game.rs:100-103`), Magnet çevirince `announced`'dan sapıyor. Bu S-08, VALUES'tan bağımsız.
- **Boşluk (Düşük):** DECISIONS #10 "en az 2 kuru sıkı" diyor ama `Config::check` yalnızca `max_live < load_size` istiyor (`config.rs:174`). Yani `max_live=7` kabul edilir ve 1 kuru çıkabilir. Ya doğrulama sıkılaşsın (`load_size - max_live >= 2`) ya da metin düzeltilsin.

### 2.5 VALUES güvenlik fix'lerini bozdu mu? — Hayır

| Fix | Durum |
|---|---|
| 01 | Yeni `roll` çağrıları (`reveal`, `reload`) gaz tabanlı yolların içinde |
| 02 | `reload`/`deal_items` sırası değişmedi |
| 03/04 | Depolama farkı `settle_storage`'a giriyor (8 elemanlı `fixed`, 4+4 eşya büyük), muhasebe yolu aynı |
| 06 | `check()` yeni alanları doğruluyor (`config.rs:168-179`), snapshot yeni alanları taşıyor |
| 07/10/11 | Dokunulmadı |

- **Doğrulanmayan:** `MIN_ACTION_GAS = 10 Tgas` payı VALUES sonrası yeniden ölçülmedi. Sandbox tam maçı 10 Tgas ile geçiriyor (`integration.rs:401-413`), ama en kötü dal (R2'de 4+4 eşya + maç sonu + transfer) garanti edilmiyor.
- **Not:** `Config` ve `Match` borsh düzeni değişti (`r1_loads`/`r2_first_load` gitti, üç alan geldi). Testnet deploy'u henüz yok (T-118), bu yüzden migrasyon gerekmiyor, ama eski bir state'e `deploy` edilirse okunamaz.

---

## 3. Kalan iş listesi

### 3.1 FIX-01..12 kalıntısı

- **FIX-03-R · `settle_storage` simetrik olsun (Orta, F2'den önce).** Silinen depolamanın bedeli treasury'ye geri yazılsın. `join→cancel` ve reveal-timeout için "treasury değişmez" testi eklensin (§1, FIX-03).

### 3.2 VALUES-FIX

- **VALUES-FIX-01 · "Elde 4 eşya" (Samet teyidi).** Öneri `max_items = 4`. R1 sorusu yanıtlanana kadar `items_per_load=0` kalır. DESIGN `:137`, ilgili testler ve UI ızgarası buna göre güncellenir (§2.2).
- **VALUES-FIX-02 · Tincture.** `tincture_good_pct`'yi 50'ye döndür (ya da Samet 40'ı onaylarsa DECISIONS #10'dan "Rolet" ifadesini çıkar). `game.rs:1713` testini düzelt, DESIGN `:91`'i eşitle (§2.3).
- **VALUES-FIX-03 · `check()` ile "en az 2 kuru" hizalansın.** Ya `load_size - max_live >= 2` ya da DECISIONS #10 / DESIGN metni düzeltilsin. Red testi eklensin (§2.4).
- **VALUES-FIX-04 · Doküman eşitleme.** FIX-F1-REPORT'taki FIX-08/09 satırlarına "VALUES ile değişti" notu. REFERENCE-CHECK ve AUDIT-F1'e "değerler artık Rolet" başlık notu (G-02/G-03 artık Samet kararıyla geçersiz). DESIGN §2.2 (`:58`, "2–8") Buckshot referansı olarak kalıyor, bu yüzden etiketlensin.
- **VALUES-FIX-05 · Gaz yeniden ölçümü.** En kötü dal VALUES değerleriyle ölçülsün (R2 reload 4+4 eşya, maç sonu, transfer). Sonuç `VERSIONS.md`'ye yazılsın, `MIN_ACTION_GAS` payı doğrulansın. Bu madde FIX-16'ya katılabilir.

### 3.3 AUDIT-F1 FIX-13..17 güncel geçerlilik

| FIX | Geçerli mi | Not |
|---|---|---|
| 13 NFT resolver, `base_uri` | **Geçerli** | `nft_transfer_call` duruyor (`nft.rs:155-166`), `nft_resolve_transfer`/`NonFungibleTokenResolver` yok, `base_uri: None` (`nft.rs:209`). VALUES etkilemiyor |
| 14 View'lar | **Geçerli** | `get_actions` boşluk bildirmiyor (`views.rs:86-101`), `leaderboard` hâlâ tam tarama (`:124-149`). VALUES sonrası yükleme başına 1 `LoadStarted` + 2 `ItemsDealt` (R2/R3) log penceresini (32) biraz daha hızlı kaydırıyor |
| 15 Hijyen | **Geçerli** | `assert_owner` hâlâ `#[near]` içinde `pub` (`lib.rs:100`). Timeout'ta `grace_ms` yok (`matches.rs:596`: `now >= m.deadline_ms`) |
| 16 Sandbox kapsamı | **Geçerli, genişledi** | Yalnızca 3 test. `use_item`, `claim_timeout`, `cancel`, gaz tablosu ve `assert_solvent` benzeri bakiye değişmezi sandbox'ta yok. Wasm tazeliği kontrolü hâlâ yok (şu an taze, garantisi yok). VALUES-FIX-05 buraya katılsın |
| 17 Doküman ve F1 kapanışı | **Geçerli** | DESIGN'da `MIN_ACTION_GAS`/S-01, depolama muhasebesi, allowance hesabı yok. `contracts/rolet-near/scripts/` ve `docs/near/E2E.md` yok: T-118/T-119 yapılmadı, F1 çıkış kriteri hâlâ karşılanmıyor. VALUES'ın DESIGN §3.1/§4.6 güncellemesi yapılmış, bu kısım kapandı |

AUDIT-FIX DONE
