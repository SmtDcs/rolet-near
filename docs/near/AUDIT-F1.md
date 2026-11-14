# Rolet NEAR — F1 Denetim Raporu

> Tarih: 2026-11-14 · Kapsam: `contracts/rolet-near` (T-101..T-117, `ed84f0b`), `docs/near/{DESIGN,TASKS,DECISIONS,REFERENCE-CHECK}.md`
> **Not:** Bu denetimden sonra Samet kararıyla **değerler artık Rolet** (G-02 ve G-03 karar #10 ile aşılmıştır; bkz. `DECISIONS.md` #10 ve `AUDIT-FIX.md`).
> Yöntem: kodu elle okudum, test çalıştırmadım. 110 test fonksiyonu sayıldı (lib 109 + sandbox 1); bu oturumda `cargo test` çalıştırma izni yoktu.
> Önem: **Kritik** = oyunu ya da parayı doğrudan bozar · **Yüksek** = maçları kilitler ya da fon kaybettirir · **Orta** = koşula bağlı istismar ya da standart ihlali · **Düşük** = kod hijyeni ya da bilinen sınır.

---

## 0. Özet

| # | Önem | Bulgu | Yer |
|---|---|---|---|
| S-01 | **Kritik** | Gaz limitiyle sonuç geri alınabiliyor: oyuncu kötü fişeği/ilaç sonucunu revert edip sonraki blokta yeniden deniyor | `matches.rs:245-264`, `game.rs:507-539` |
| S-02 | **Yüksek** | Treasury muhasebesi gerçek serbest bakiyeyi izlemiyor; ödül transferi `LackBalanceForState` ile kazanan hamleyi revert ettirip maçı kilitleyebilir | `matches.rs:228-235`, `nft.rs:87-113` |
| S-03 | **Yüksek** | Ücretsiz depolama şişirme: `join`→`cancel` döngüsü kalıcı `Cancelled` kayıtları bırakıyor, maliyeti kontrat ödüyor | `matches.rs:333-383` |
| S-04 | Orta | `match_id` gaspı ve yeniden kullanılamaması (kuyruk ID'si tahmin edilirse DoS) | `matches.rs:333-361` |
| S-05 | Orta | `set_config` doğrulamasız: indeks paniği aktif maçları kilitliyor, `ops_bps>10000` treasury'yi ops'a aktarıyor, yüksek `reward` sybil çiftliği açıyor | `lib.rs:95-98`, `nft.rs:87` |
| S-06 | Orta | `nft_resolve_transfer` dışa açılmamış (NEP-171 ihlali); `nft_transfer_call` geri dönüşü kırık | `nft.rs:153-165` |
| S-07 | Orta | Sonuca bağlı panik (gizli reroll yolu): round'u bitiren Tincture'dan sonra yanlış slot siliniyor ya da panik oluşuyor | `game.rs:568-571`, `733-741` |
| S-08 | Orta (bilinen) | Loupe/Ticker/Magnet sonuçları ve `fixed` zincirde herkese açık | `game.rs:673,702,710`, `views.rs:29` |
| S-09 | Orta | `leaderboard` tüm oyuncuları okuyup sıralıyor; oyuncu sayısı arttıkça view gaz sınırını aşar | `views.rs:108-133` |
| S-10..S-15 | Düşük | validator rastgeleliği, `get_actions` boşluğu, silinmiş hesaba ödül, `assert_owner` dışa açık, NFT metadata, son saniye timeout yarışı | aşağıda |
| G-01 | **Yüksek (sadakat)** | `heal_cut` tek bool: bir oyuncunun kablosu kesilince **iki oyuncunun da** iyileşmesi kapanıyor | `game.rs:123-124,446-457,599,610` |
| G-02 | Yüksek (sadakat) | R3 canı 5, referansa göre 6 (4+2) | `config.rs:62` |
| G-03 | Orta (sadakat) | Yükleme formülü dolu > boş üretebiliyor; R1 dağılımı çarpık | `game.rs:359-365` |
| G-04 | Orta (sadakat) | Son fişekte Flask turu bitirmiyor, testereyi sıfırlamıyor | `game.rs:679-688` |
| G-05 | Düşük-Orta | Yeni yüklemede kelepçe kalkmıyor; Tincture %40 (referans %50) | `game.rs:422-430`, `config.rs:71` |

Sağlam olan kısımlar: dış kontrat çağrısı ve callback yok, bütün Promise'ler durum yazıldıktan sonra oluşturuluyor (`finish_match`, `withdraw_ops`, `claim_reward`), oyuncu metodlarının hepsinde `predecessor == signer` şartı var, oyun metodları payable değil, `overflow-checks = true`, `get_match` sırları göstermiyor, kilitli token transfer edilemiyor, `pause` devam eden maçları kilitlemiyor.

---

## 1. Güvenlik

### S-01 · Kritik · Gaz limitiyle sonuç geri alma ("gas-cap reroll")
**Yer:** `matches.rs:245-264` (`apply_game_action`), `game.rs:507-539` (`fire`), `game.rs:733-741` (Tincture), `matches.rs:406-441` (ikinci reveal)
**Sorun:** Fişek, hamle işlemi içinde lazy draw ile çekiliyor (`rng.rs:39-46`). Çekilişten sonra dallar farklı miktarda gaz harcıyor. Örneğin 1 canla kendine ateşte: boş fişek sırayı korur ve ucuzdur; dolu fişek `apply_damage` → round sonu → `reload` → `deal_items` → (maç sonuysa) `finish_match` + Promise ile çok pahalıdır. Function-call key ile oyuncu prepaid gazı istediği gibi ayarlar. Gazı ucuz dalın maliyetine eşitlerse pahalı sonuç `GasExceeded` ile **tüm durum değişiklikleriyle birlikte geri alınır**: fişek tüketilmez, hasar uygulanmaz. Oyuncu bir sonraki blokta yeni `random_seed` ile tekrar dener. Bedeli her denemede birkaç mNEAR gaz. Etkileri:
- Kendine ateş her zaman boş çıkar, sıra oyuncuda kalır.
- Tincture'ın kötü sonucu (hasar veya HealCut) revert edilir, eşya her zaman iyileştirir.
- `reload` içinde büyük yükleme daha fazla depolama yazar; oyuncu küçük yükleri zorlayabilir. İkinci reveal da R1 yükleme boyutunu seçebilir.
- Log baytları da sonuca bağlı (`"Live"` ile `"Blank"` farklı uzunlukta). Hangi dal pahalıysa o dal bastırılabilir; yani rakibe ateşte de yön istismarı mümkün olabilir.

DESIGN §4.6'daki "sonuç kötüyse geri alamaz" varsayımı yalnızca kontrat-üzerinden-çağrı için doğru. Aynı işlem içinde gazla revert bu varsayımın dışında kalıyor.
**Düzeltme:** Rastgele çekiliş yapan her metodun (`fire`, `use_item`, `reveal`) en başına `require!(env::prepaid_gas() >= MIN_ACTION_GAS)` koyun. `MIN_ACTION_GAS` değerini sandbox'ta ölçülen en pahalı dalın (maç sonu + transfer, dolu log, 8 eşya) iki katı alın. Sonuca bağlı başka panik bırakmayın (bkz. S-07). Not: alt sınır, FC key allowance tüketimini artırır (bkz. §4 FIX-01 ve F2 notu).

### S-02 · Yüksek · Treasury ile gerçek bakiye arasında değişmez yok
**Yer:** `matches.rs:228-235`, `matches.rs:528-533`, `nft.rs:87-90`, `nft.rs:113`
**Sorun:** `treasury` yalnızca muhasebe değeri. Mint depolaması (`internal_mint_with_refund(.., None)`, token başına yaklaşık 0,5–1 KB) ve maç ile oyuncu kayıtlarının depolaması kontrat bakiyesinden kilitleniyor, ama ne treasury'den ne ops'tan düşülüyor. DESIGN §4.7 "Depolama maliyeti treasury'den karşılanır" diyor; bu uygulanmamış. Serbest bakiye `treasury + ops_balance`'ın altına inince `finish_match` içindeki transfer işlem sonunda `LackBalanceForState` hatasına yol açar ve **kazanan `fire` ya da `claim_timeout` tamamen revert olur**. Maç bitirilemez, iki token da kilitli kalır.
**Düzeltme:** (1) Depolama yazan her metodda `env::storage_usage()` farkını ölçün, `delta * env::storage_byte_cost()` tutarını treasury'den düşün (ya da satın almada depolama payını ayırın). (2) Transferden önce `env::account_balance() - storage_stake >= reward` kontrolü yapın; yetmiyorsa ödülü `owed`'a yazın, maçı yine bitirin. (3) Bir test yardımcısı `free_balance() >= treasury + ops + Σowed` değişmezini doğrulasın.

### S-03 · Yüksek · Ücretsiz depolama şişirme
**Yer:** `matches.rs:339-356` (yeni maç kaydı), `matches.rs:374-383` (`cancel` kaydı silmiyor), `matches.rs:202-208` (Finished yalnızca budanıyor)
**Sorun:** Tek bir karakter yeter: `join(rastgele_id, opponent=<64 karakterlik implicit hesap>)` ardından `cancel` çağrılır, durability geri gelir. Her tur yaklaşık 300 B'lık kalıcı bir `Cancelled` kaydı bırakır (≈0,003 NEAR kilit). Saldırganın ödediği yalnızca gaz (≈0,0005–0,001 NEAR). Kontrat depolaması kaldıraçla tükenir ve sonunda S-02 tetiklenir. FC key deposit ekleyemediği için oyuncudan depolama ücreti de alınmıyor.
**Düzeltme:** `cancel` ve reveal-timeout'ta maç kaydını tamamen silin (`matches.remove`). Finished kayıtları için özet tutup N maç ya da N gün sonra silin. Alternatif olarak satın almada oyuncu başına depolama kredisi ayırın (ör. 0,05 NEAR) ve her maçta bu krediden düşün.

### S-04 · Orta · `match_id` gaspı ve yeniden kullanım
**Yer:** `matches.rs:333-361`
**Sorun:** Bir `match_id` maç bittikten ya da iptal edildikten sonra da sonsuza kadar dolu kalıyor (`"match already taken"`). Kuyruğun ürettiği ID tahmin edilebiliyorsa (sıralı sayaç, sunucu yeniden başlatılınca sıfırlanan sayaç) üçüncü bir kişi ID'yi önceden `Pending` olarak açar ve eşleşmeyi bozar. `cancel` ile durability'sini geri aldığı için bunun ona maliyeti olmaz.
**Düzeltme:** Maçları kontratta `key = sha256(min(a,b) ‖ max(a,b) ‖ match_id)` ile saklayın (yabancı kişi bu anahtarı üretemez) ya da kuyrukta `match_id`'yi kriptografik rastgele 64 bit yapın (T-304'e yazın). S-03 düzeltmesiyle iptal edilen ID'ler de serbest kalır.

### S-05 · Orta · `set_config` doğrulamasız (owner hatası ya da kötü niyeti treasury'yi boşaltır)
**Yer:** `lib.rs:68`, `lib.rs:95-98`, `nft.rs:87`, `game.rs:471`, `matches.rs:415`
**Sorun:**
- `rounds.len() < 3` olursa aktif maçlar round geçişinde `cfg.rounds[...]` indeksinde panik verir ve kalıcı olarak kilitlenir.
- `ops_bps` `u16` tipinde. 10 000'in üstündeki bir değer, satıştan ödenenden fazlasını `ops_balance`'a yazar; `withdraw_ops` bu fazlayı oyuncuların treasury'sinden çeker.
- `reward > 2 × price × (1 − ops) / durability` (varsayılanlarla ≈0,19 NEAR) olursa iki sybil hesap birbirine karşı oynayarak ya da `claim_timeout` ile treasury'yi kârla boşaltır. Varsayılan 0,1 NEAR güvenli, ama bu sınır kodla korunmuyor.
- `tincture_good_pct > 100`, `max_items > 8`, `start_hp = 0`, `turn_ms = 0` gibi değerler de engellenmiyor.

**Düzeltme:** `new` ve `set_config` içinde `validate()` çağırın. Sınırlar: `rounds.len()==3`, `1<=start_hp<=8`, `heal_cut_at < start_hp`, `items_per_load <= max_items <= 8`, `tincture_good_pct<=100`, `ops_bps<=10_000`, yukarıdaki ödül eşitsizliği, `turn_ms>=15_000`, `reveal_ms>=turn_ms`. Ayrıca aktif maçlar config değişikliğinden etkilenmemeli: `Match` içine maç başında config'in bir kopyasını (snapshot) koyun.

### S-06 · Orta · NEP-171 resolver eksik
**Yer:** `nft.rs:153-165`
**Sorun:** `self.tokens.nft_transfer_call` geri dönüş için `env::current_account_id().nft_resolve_transfer` callback'i zincirliyor. Kontrat bu metodu dışa açmıyor (`NonFungibleTokenResolver` impl'i yok), bu yüzden callback `MethodNotFound` ile düşüyor. Alıcı iade isterse ya da alıcı kontratı hata verirse token alıcıda kalıyor. Bir de küçük yarış durumu var: transfer ile resolve arasındaki birkaç blokta alıcı token'la `join` yapabilir, resolve kilit durumuna bakmadan token'ı geri taşır, sonuçta "kilitli token'ın sahibi oyuncu değil" durumu oluşur.
**Düzeltme:** `#[near] impl NonFungibleTokenResolver` ekleyin ve token kilitliyse iadeyi reddedin. Pazar yeri hedefi yoksa daha basit yol: `nft_transfer_call`'ı tamamen kaldırın.

### S-07 · Orta · Sonuca bağlı panik ve yanlış slot silme (gizli reroll yolu)
**Yer:** `game.rs:568-571`, `game.rs:733-741`
**Sorun:** `use_item` önce eşyayı uygular, sonra `items[actor].remove(slot)` çağırır. Tincture'ın kötü sonucu round'u bitirirse `apply_damage` eşyaları sıfırlayıp yeni dağıtım yapar. Ardından `remove(slot)` ya yeni dağıtılan eşyayı siler ya da `slot >= len` olduğunda **panik verir**. Panik, kötü sonucu otomatik olarak revert eder; bu da S-01 ile aynı sınıfta bir reroll demektir. Bugün Tincture yalnızca R3 torbasında ve R3'te round sonu her zaman maç sonu olduğu için tetiklenmiyor. Torba ya da format değişirse açılır. `tincture_bad_roll_can_kill` testi (`game.rs:1677`) R1'de bu yolu çalıştırıyor ama eşya listesini kontrol etmediği için hatayı yakalamıyor. Aynı sırasızlık Flask/Lockpick sonrası dağıtımda da bir slot kaybettiriyor (`game.rs:405`): tüketilecek eşya hâlâ envanterde sayılıyor.
**Düzeltme:** Eşyayı önce envanterden çıkarın, sonra uygulayın; hata olursa geri koyun. Kural olarak "çekilişten sonra hiçbir dal panik vermez" ilkesini koyun ve bunu test edin.

### S-08 · Orta (bilinen v1 sınırı) · Gizli bilgi zincirde açık
**Yer:** `game.rs:673` (Loupe), `game.rs:702` (Ticker), `game.rs:710-720` (Magnet → `fixed`, `live_left`), `matches.rs:127-135` (log + EVENT_JSON), `views.rs:29`
**Durum:** DESIGN §4.6'da kabul edilmiş. Fişek **sırası** gerçekten saklanmıyor (lazy draw doğru uygulanmış, `fixed` yalnızca açılmış konumları tutuyor). Ancak `ItemResult::Private{shell}` hem `log`'a hem NEP-297 olayına hem de işlem dönüş değerine yazılıyor. Hile yapan bir istemci rakibin Loupe ve Ticker sonucunu ve Magnet'in çevirdiği fişeği hemen öğrenir.
**Öneri:** README ve pitch'te açıkça yazın (T-601). Hiç değilse `shell` alanını kalıcı `log`'a yazmayın, yalnızca işlem dönüş değerinde bırakın. Bu da bir hilekârı durdurmaz, ama `get_actions` ile yoklayan sıradan istemcide sızıntı kalmaz. Gerçek çözüm v2.

### S-09 · Orta · `leaderboard` sınırsız
**Yer:** `views.rs:108-133`
**Sorun:** Her çağrı `player_index`'in tamamını okuyup sıralıyor. Birkaç bin oyuncuda view gaz limitini aşar (DoS yalnızca view için).
**Düzeltme:** `join`/`finish_match` sırasında güncellenen sabit uzunlukta bir top-N listesi tutun (ör. 100 kayıt) ya da indexer kullanın.

### S-10 · Düşük (hackathon) · Validator ve `random_seed`
**Yer:** `rng.rs:39-46`, `matches.rs:406-413`
Her çekiliş `random_seed` ile karıştırıldığı ve `seed` reveal'den sonra herkese açık olduğu için güvenlik pratikte yalnızca `env::random_seed()`'e dayanıyor. Commit-reveal yalnızca ek savunma katmanı. Bir sonraki bloğu üretecek validator VRF çıktısını önceden bilir ve işlemini o bloğa denk getirebilir. Chunk üreticisi de işlemleri geciktirebilir ya da sansürleyebilir. Aynı bloktaki iki işlem farklı `draw_nonce` kullandığı için çakışmaz. Bu risk DESIGN R2'de yazılı; kabul edilebilir. Ancak R2 metnine S-01 eklenmeli.

### S-11 · Düşük · `get_actions` boşluğu bildirmiyor
**Yer:** `views.rs:75-85`. `since_seq` değeri log penceresinin (32) dışında kalırsa eksik aksiyonlar sessizce atlanıyor. **Düzeltme:** `{first_seq, actions}` döndürün; istemci boşluk görünce `snapshot` istesin.

### S-12 · Düşük · Silinmiş hesaba ödül
**Yer:** `matches.rs:231`, `matches.rs:533`. Transfer başarısız olursa NEAR kontrata geri döner, ama treasury'den zaten düşülmüş olur ve muhasebe kayar. **Düzeltme:** Callback'siz kabul edilebilir. Değişmez kontrolü (S-02) bu kaymayı "fazla bakiye" olarak tolere etmeli.

### S-13 · Düşük · `assert_owner` dışa açık view
**Yer:** `lib.rs:91`. `#[near] impl` içinde `pub` olduğu için ABI'ye giriyor. **Düzeltme:** `#[near]` bloğunun dışındaki `impl Contract` bloğuna taşıyın.

### S-14 · Düşük · NFT metadata
**Yer:** `nft.rs:99-106`, `nft.rs:205-206`. `media` göreli bir yol ve `base_uri` `None`, bu yüzden cüzdanlar görseli çözemez. `extra.durability` mint anındaki değerde kalıyor. **Düzeltme:** `base_uri` olarak web origin'ini verin; `extra` içinden durability'yi çıkarın ya da "canlı değer için `get_character` kullanın" diye belgeleyin.

### S-15 · Düşük · Timeout yarışı
**Yer:** `matches.rs:500-503`. Süre biterken gönderilmiş `fire` işlemi ile rakibin `claim_timeout` işlemi yarışır; blok gecikmesi yüzünden dürüst oyuncu kaybedebilir. **Düzeltme:** 2–3 s ek süre (`deadline_ms + grace`).

### Access key kapsamı (F2 öncesi notlar)
- DESIGN §4.3'teki metod listesi (`join, reveal, cancel, fire, use_item, claim_timeout`) payable değil. `nft_transfer` 1 yocto istediği, `buy_character` ve `fund_treasury` payable olduğu için FC key bunları çağıramaz. Owner metodları `assert_owner` ile korunuyor. ✓
- `claim_reward` listede yok, cüzdanla çağrılması gerekir. Bu kabul edilebilir, ama UI'da belirtilmeli.
- S-01 düzeltmesi (en az ~30–50 Tgas) çağrı başına allowance tüketimini yaklaşık 0,003–0,005 NEAR'a çıkarır. DESIGN'daki "~0,0005 NEAR/çağrı" tahmini geçersiz kalır, 0,5 NEAR allowance ancak birkaç maça yeter. `allowance_hint` değerini T-201'de ölçüme göre (1–2 NEAR) güncelleyin. Kullanılmayan gazın allowance'a geri dönüp dönmediği de T-201'de ölçülmeli.
- `predecessor == signer` şartı NEP-366 meta-transaction (stretch) ile uyumlu mu, doğrulanmalı.

---

## 2. Buckshot sadakati (1v1 PvP, REFERENCE-CHECK'e göre)

### Bulgular
- **G-01 · Yüksek:** `heal_cut` tek bir `bool`. Referansta kablo **oyuncu başına** (`wireIsCut_player/dealer`). Bugünkü kodda A ≤2 cana düşerse B 6 candayken bile Pipe ve Tincture kullanamıyor. A ilk kesimi tetikledikten sonra B ≤2'ye düştüğünde `HealCut` aksiyonu da yayılmıyor (`game.rs:446`'daki `!state.heal_cut` koşulu). DESIGN §4.5 de aynı hatayı içeriyor.
- **G-02 · Yüksek:** R3 `start_hp = 5`, referansa göre 6 (4 normal + 2 soluk). 5 canla 3→1 testere atışı kablo sahnesini atlamaz, ama tampon bir can eksik kalıyor ve R3 kısalıyor. T-001 "DESIGN §3.1'i güncelle" diyordu; DESIGN de config de güncellenmemiş.
- **G-03 · Orta:** `live = clamp(total/2 + δ, 1, total−1)` formülünde δ=+1 olunca 3L1B, 4L2B, 5L3B gibi **dolunun boşu aştığı** yükler çıkıyor. Referans (DoN) `live = max(1, total/2)` ve dolu ≤ boş. R1'deki `total.min(4)` ise 4–8 aralığını 4'e katladığı için P(4)=5/7. Hikâyede R1 sabit: önce 1L+2B, sonra 3L+2B. 2 canla R1 en geç ikinci yükte biter, dolayısıyla bu iki preset R1'i tamamen tanımlar. R2'nin ilk yükü 1L+1B.
- **G-04 · Orta:** Bira son fişeği atarsa referansta **tur ve yük biter**. Kodda yeni yük geliyor, sıra aynı oyuncuda kalıyor, testere de aktif kalıyor (DESIGN §3.2 kural 3 bu davranışı [KARAR] olarak yazmış, ama referans doğrulaması bununla çelişiyor).
- **G-05 · Düşük-Orta:** Yük bitince kelepçe kalkmalı. Kodda `reload` `shackled` alanını temizlemiyor (boşla kendine ateş edilen son fişekte ya da Flask'ın son fişeğinde kelepçe yeni yüke taşınıyor). Tincture %40, referans (1.2.1+) %50.
- **Sapma (karar gerekli):** Ticker tek fişekte reddediliyor ve eşya korunuyor; Buckshot'ta eşya boşa gider. Pipe tam canda reddediliyor; Buckshot'ta kullanılır ve boşa gider. R2 torbasında Ticker var; hikâye havuzu yalnızca beşli, DoN eşyaları ancak bilinçli olarak eklenirse girer (REFERENCE notu). Bunlar DECISIONS'a yazılmamış.
- **Doğru olanlar:** HP 2/4, eşya 0/2/4, 8 slot (dolunca kalan dağıtım düşüyor, bu eşdeğer), round bitince eşyalar sıfırlanıyor ve yükler arasında korunuyor, testere yığılmıyor ve atışla sıfırlanıyor, kelepçe tek tur atlatıyor ve kırılana kadar yeniden takılamıyor, boşla kendine ateşte ekstra tur var, Lockpick Lockpick'i çalamıyor ve kelepçeli rakipte Shackle'ı çalamıyor, Magnet açıklanan sayıları değiştirmiyor, Ticker mevcut fişeği hariç tutuyor, ≤2 eşiği doğru ve 2 canda 1 hasar öldürmüyor.

### Önerilen değerler

| Parametre | Şu an | Referans | **Öneri** |
|---|---|---|---|
| R1 / R2 / R3 başlangıç canı | 2 / 4 / **5** | 2 / 4 / 6 (4+2) | **2 / 4 / 6** |
| R3 kablo eşiği | ≤2, **tek bayrak** | ≤2, oyuncu başına | ≤2, `heal_cut: [bool; 2]`, `HealCut{player}` |
| Kablo kesikken Pipe / Tincture | red | etkisiz | red (oyuncu başına) ✓ |
| Yük başına eşya R1/R2/R3 | 0/2/4 | 0/2/4 | ✓ |
| Slot | 8 | 8 | ✓ |
| Yük R2/R3 | `2+r%7`, `clamp(t/2+δ,1,t−1)` | t∈[2,8], `live=max(1,t/2)` | **DoN formülü, δ kaldırılsın** |
| Yük R1 | `min(t,4)` | 1L+2B, sonra 3L+2B | **`r1_loads=[(1,2),(3,2)]`** (sonrası DoN formülü, t≤4) |
| R2 ilk yük | rastgele | 1L+1B | `r2_first_load=Some((1,1))` (opsiyonel) |
| Testere | 2 hasar, yığılmaz, atışla sıfır | + tur sonunda sıfır | ✓ + Flask turu bitirirse sıfırla |
| Flask (son fişek) | yeni yük, sıra kalır, testere kalır | tur ve yük biter | **sıra geçer (kelepçe atlatma ortak), testere sıfır** |
| Kelepçe yeni yükte | kalır | kalkar | `reload`'da `shackled=None`, `shackle_broke=false` |
| Tincture iyi yol | %40 | %50 (+2 / −1) | **50** |
| Lockpick (Adrenalin) | süre yok, Lockpick çalınamaz | 7 sn (1.2) / 10 sn (wiki) | ✓ (zincirde 45 s hamle süresi geçerli) |
| Ticker, ≤1 fişek | red, eşya kalır | eşya boşa gider | KARAR: tüket + `ItemResult::None` (birebir) |
| Pipe, tam can | red | boşa gider | KARAR: red kalabilir (UX), DECISIONS'a yazılsın |
| Eşya havuzu R2 / R3 | 5+Ticker / 9 | hikâye: 5 / 5 | **R2: 5**, R3: 5 + DoN dörtlüsü (bilinçli [KARAR]) |
| Round başlatan | kaybeden | (PvP karşılığı yok) | ✓ KARAR |
| Yeni yükte sıra | sırası olan devam eder | — | ✓ (Flask istisnası hariç) |
| Hamle süresi | 45 s | yok | ✓ KARAR (+2–3 s ek süre, S-15) |

---

## 3. DESIGN/TASKS uyumu

| Konu | Durum |
|---|---|
| F1 çıkış kriteri: "testnet'te iki hesapla CLI'dan tam maç" | **Karşılanmadı.** T-118 (deploy betiği) ve T-119 (CLI maçı) yapılmamış, `contracts/rolet-near/scripts/` yok. T-201 T-118'e bağlı. |
| T-001 → DESIGN güncellemesi | Yapılmamış: §3.1 R3=5, §2.4 ilaç %40–50, §3.2 kural 3 (Flask/testere), §4.6 yük formülü REFERENCE ile çelişiyor. |
| DESIGN §4.7 "depolama maliyeti treasury'den" | Uygulanmamış (S-02). `Cancelled` budanmıyor, "N gün sonra silinir" de yok (S-03). |
| DESIGN §4.5 `heal_cut: bool` | Tasarım hatası, koda da geçmiş (G-01). |
| DESIGN §4.6 / R2 güvenlik varsayımı | Gaz-limitli revert (S-01) yazılmamış. "~0,0005 NEAR/çağrı" allowance hesabı S-01 düzeltmesinden sonra geçersiz. |
| T-109 NEP-171 | `nft_resolve_transfer` eksik (S-06). Approval (NEP-178) yok; kapsamda değildi, sorun değil. |
| T-115 leaderboard | TASKS "limitli sıralama" diyor, uygulama tüm listeyi sıralıyor (S-09). |
| T-116 | Finished maçta `log` ve `fixed` budanıyor ✓. `items` ve diğer alanlar kalıyor; ölçülen tasarruf yalnızca −51 B. |
| T-106 Ticker / Tincture varsayılanları | TASKS'a uygun, ama REFERENCE sonuçlarıyla karar yeniden verilmeli (§2). |
| T-117 sandbox | Yalnızca `fire(Opponent)` döngüsü var. Sandbox'ta `use_item`, `claim_timeout`, `cancel`, gaz ölçümü ve bakiye değişmezi testi yok. Test önceden derlenmiş wasm'a bağlı; eski wasm ile yeşil geçebilir. |
| `game.rs` saflık kuralı | ✓ `env` kullanılmıyor. `ShellSource` enjeksiyonu doğru. |
| `MatchView` / şema | ✓ sırlar gizli, `fixed` v1 gereği açık. G-01 düzeltmesinden sonra `match-view.json` güncellenmeli. |
| Config "tek yerde" kuralı | Kısmen. Eşya torbaları (`game.rs:369-388`) ve yük formülü sabit kodlanmış, Config'te değil. |

---

## 4. F2'den önce yapılacaklar

Öncelik: FIX-01..FIX-12 F2'den önce **zorunlu**; FIX-13..FIX-17 F3'ten önce.

1. **FIX-01 · Minimum prepaid gas (S-01)**: `fire`, `use_item` ve `reveal` en başta `env::prepaid_gas() >= MIN_ACTION_GAS` şartı arasın. Değeri sandbox'ta en pahalı dalı ölçerek belirleyin (×2 pay). Kabul: sandbox testinde düşük gazla çağrı **çekilişten önce** "insufficient gas" ile reddediliyor; en pahalı dal (maç sonu + transfer) `MIN_ACTION_GAS` ile geçiyor.
2. **FIX-02 · Sonuca bağlı panik yok (S-07)**: `use_item` eşyayı önce çıkarsın, sonra uygulasın, hatada geri koysun; `deal_items` serbest slotu tüketimden sonra hesaplasın. Kabul: R1'de ölümcül Tincture testi yüksek slotla panik vermiyor ve yeni dağıtılan eşyalar bozulmuyor.
3. **FIX-03 · Depolama muhasebesi (S-02)**: `buy_character`, `join`, `cancel`, `reveal` ve `finish_match` içinde `storage_usage` farkını treasury'den düşün. `fn assert_solvent()` yardımcısını yazın. Kabul: her birim test sonunda `free_balance >= treasury + ops + Σowed`.
4. **FIX-04 · Ödeme güvenliği (S-02)**: `finish_match` ve `claim_reward` gerçek serbest bakiyeyi kontrol etsin; yetmiyorsa `owed`'a yazsın. Kabul: düşük bakiyeli sandbox testinde kazanan `fire` başarılı oluyor ve `owed > 0`.
5. **FIX-05 · Kayıt silme ve maç anahtarı (S-03, S-04)**: `cancel` ve reveal-timeout maçı silsin. Maç anahtarı `sha256(min ‖ max ‖ match_id)` olsun ya da kuyrukta rastgele u64 kullanılsın. Kabul: `join`→`cancel` sonrası `storage_usage` başlangıca dönüyor; yabancı hesap çiftin maçını kapatamıyor.
6. **FIX-06 · `Config::validate` ve maç snapshot'ı (S-05)**: §1 S-05'teki sınırları uygulayın; `Match` maç başındaki config'i saklasın. Kabul: her ihlal için red testi var; config değişikliği aktif maçı etkilemiyor.
7. **FIX-07 · Oyuncu başına kablo (G-01)**: `heal_cut: [bool; 2]` ve `Action::HealCut { player }`. Şemayı, olayları ve testleri güncelleyin. Kabul: A kesikken B Pipe kullanabiliyor; B de ≤2'ye düşünce ayrı bir `HealCut` aksiyonu çıkıyor.
8. **FIX-08 · Varsayılanlar (G-02, G-05)**: `rounds[2].start_hp = 6`, `tincture_good_pct = 50`. DESIGN §3.1 ve §2.4 tablolarını güncelleyin. Kabul: `default_matches_design` yeni değerlerle yeşil.
9. **FIX-09 · Yük formülü (G-03)**: `live = max(1, total/2)`; Config'e `r1_loads` ve `r2_first_load` ekleyin. Kabul: 10 000 tohumda `1 <= live <= blank`; R1 yükleri sırasıyla (1,2), (3,2).
10. **FIX-10 · Son fişekte Flask (G-04)**: Tur biter (kelepçe atlatma mantığı `fire` ile ortak bir `end_turn()` fonksiyonunda), testere sıfırlanır, sonra yeni yük gelir. Kabul: sıra rakibe geçiyor; rakip kelepçeliyse atlanıp kullanana dönüyor.
11. **FIX-11 · Yeni yükte kelepçe kalkar (G-05)**: `reload` içinde `shackled = None; shackle_broke_this_turn = false`. Kabul: son fişekte boşla kendine ateşten sonra kelepçe yok.
12. **FIX-12 · Kural kararlarını kaydet**: DECISIONS'a R2 torbası (öneri: hikâye beşlisi), Ticker ≤1 ve Pipe tam can davranışı, DoN eşyalarının R3'te bilinçli eklendiği yazılsın; `item_bag` Config'e taşınsın. Kabul: DECISIONS maddeleri yazıldı; testler karara göre güncellendi.
13. **FIX-13 · NFT resolver (S-06, S-14)**: `NonFungibleTokenResolver`'ı dışa açın (kilitliyse iade yok) ya da `nft_transfer_call`'ı kaldırın; `base_uri` ekleyin. Kabul: sandbox'ta `nft_transfer_call` → alıcı iade istiyor → token geri dönüyor.
14. **FIX-14 · View'lar (S-09, S-11)**: `get_actions` `{first_seq, actions}` döndürsün; leaderboard top-100 listesini artımlı güncellesin. Kabul: 1000 oyunculu birim testte leaderboard gazı sabit kalıyor.
15. **FIX-15 · Hijyen (S-13, S-15)**: `assert_owner`'ı ABI'den çıkarın; timeout'a `grace_ms` (2 s) ekleyin.
16. **FIX-16 · Sandbox kapsamı**: `use_item` (her eşya için bir tane), `claim_timeout` (iki aşama), `cancel`, gaz ölçümü (FIX-01'in sayısını üretir), bakiye değişmezi. `build.rs` ya da test başında wasm tazeliği kontrolü. Kabul: `cargo test --test integration` yeşil ve ölçülen gazlar `VERSIONS.md`'ye yazıldı.
17. **FIX-17 · Dokümanlar ve F1 kapanışı**: DESIGN §4.6/R2'ye S-01 ve düzeltmesini, §4.7'ye depolama muhasebesini, §4.3'e min-gaz ile allowance hesabını ekleyin. T-118 ve T-119'u tamamlayın (F1 çıkış kriteri). Kabul: testnet CLI maçının tx hash'leri `docs/near/E2E.md`'de.
