# Rolet NEAR — Tasarım Dokümanı

> Durum: taslak v1 · 2026-11-14 · Kaynak: `docs/near/BRIEF.md`
> Bu doküman eski tasarım notlarını (DEVAM.md, docs/GUN-HANDLING.md, README'deki 3D/2D kararları) bilerek yok sayar. Repo yalnızca **ne var, ne yeniden kullanılabilir** sorusu için incelendi.
> Uygulama görevleri: `docs/near/TASKS.md`.

İşaretler: **[EMİN DEĞİLİM]** = Buckshot Roulette hakkında hafızadan yazılan ama doğrulanması gereken ayrıntı. **[KARAR]** = Rolet için verilen tasarım kararı (Buckshot'ta karşılığı olmayabilir veya bilerek farklı).

---

## 0. Kapsam ve özgünlük sınırı (önce okunmalı)

Brief "Buckshot Roulette'in birebir kopyası" diyor. Bunu iki katmana ayırıyoruz:

| Katman | Ne yapıyoruz |
|---|---|
| **Oyun kuralları / mekanik** (tur yapısı, dolu/boş fişek sayısının açıklanması, kendine/rakibe ateş, boşla kendine ateşte sıranın kalması, can sistemi, eşya etkileri, eşya dağıtımı, kazanma) | **Birebir aynı.** Mekanikler bir türün kurallarıdır; bunları kopyalamak hem meşru hem brief'in özü. |
| **Animasyon ritmi ve "his"** (silahı alma → nişan → gerilim beklemesi → sonuç; flaş, karartma, fişek fırlaması, kamera yakınlaşması) | **Aynı vuruşlar (beat'ler), aynı tempo, aynı okunabilirlik.** Bunlar türün sinema dili. |
| **Sunum varlıkları** (isim, karakterler, eşya modelleri ve adları, ses dosyaları, müzik, arayüz, mekan, "Dealer", feragatname/defibrilatör çerçevesi) | **Tamamen özgün.** Brief yalnızca mekanı farklı istiyor; biz karakter görünüşü, eşya prop'ları, ses ve UI'ı da özgün yapıyoruz. Gerekçe: hem telif/ticari takdim riski (hackathon başvurusu kamuya açık), hem de jüri gözünde "klon" değil "türü zincire taşıyan oyun" algısı. |

Pratik kurallar:
- Ürün, kod, asset ve pitch'te "Buckshot Roulette" adı ürün adı olarak geçmez. Pitch'te dürüstçe "Buckshot Roulette tarzı bir masa düellosu" denebilir.
- Repo'da `BuckshotRoom.tsx` gibi isimler yeniden adlandırılmalı (TASKS'ta var).
- Hiçbir Buckshot ses/müzik/doku/model dosyası, ekran görüntüsünden türetilmiş asset ya da birebir UI metni kullanılmaz.
- Eşyaların **etkisi** birebir; **görünüşü ve adı** mekana göre özgün (bkz. §3.4). Kullanıcı isterse eşyalar jenerik adlarıyla (büyüteç, sigara, bira, kelepçe, testere) kalabilir — bunlar sıradan nesneler; ama modelleri yine Meshy ile sıfırdan üretilir.

---

## 1. Repo'nun bugünkü durumu (yeniden kullanım analizi)

| Parça | Yer | Durum | NEAR'da ne olur |
|---|---|---|---|
| Anchor programı (Solana) | `apps/server/programs/rolet/src/lib.rs` (~2000 satır) | Çalışıyor, devnet'te. 8 hazne revolver, 12 kart, commit-reveal, MagicBlock rollup, Metaplex Core karakter, treasury PDA. | **Dokunulmaz.** Q-002 gereği "başka zincirdeki mevcut ürün" olarak kalır ve README'de açıklanır. NEAR kontratı sıfırdan, ayrı klasörde yazılır. Mantık (commit bağlama, durability, sabit ödül) fikir olarak taşınır, kod taşınmaz. |
| Eski Node oyun sunucusu | `apps/server/src/game/*`, `packages/shared` | Ölü kod (socket.io tabanlı eski sürüm). | Kullanılmaz. Silinmez (kapsam dışı). |
| Next.js 16 web | `apps/web` | Landing, `/profile`, `/duel`, `/leaderboard`; Solana wallet adapter, `useRolet.ts` (Anchor istemcisi, session key), kuyruk. | **Kalır**, zincir katmanı değişir: Solana adapter → NEAR Wallet Selector, `useRolet.ts` → `useRoletNear.ts`. Landing/tema/sayfa iskeleti korunur. |
| Kuyruk | `apps/web/lib/matchQueue.ts` + `app/api/matchmaking/route.ts` | Tek süreç, bellek içi, imzalı mesajla giriş, host/guest atar. | **Kalır**, iki değişiklik: (1) host/guest yerine simetrik "eşleşti" (her iki tarafa rakip hesabı + match_id), (2) imza doğrulama NEP-413'e geçer. |
| Saf kurallar / test altyapısı | `apps/web/lib/chainPace.ts`, `seat.ts` + `node:test` | Solana'ya özgü (slot, blockhash, rollup). | Desen kalır (saf fonksiyon + `node:test`), içerik NEAR'a göre yeniden yazılır. `seat.ts` host-merkezli olduğu için büyük ölçüde emekliye ayrılır. |
| React duel sahnesi | `components/duel/PixelDuelStage.tsx` (aktif), `DuelRoom3D.tsx`, `BuckshotRoom.tsx` | On-chain maçta bugün `PixelDuelStage` kullanılıyor. | Godot sahnesi devreye girince yedek/geri dönüş olarak kalır; yeni kural setine uyarlanmaz. |
| Godot 4.7 projesi | `godot/` | 3D oda, silah alma/nişan, kart tepsisi, yerel kural kopyası `rules.gd` (+ `test_rules.gd` headless test), web export → `apps/web/public/godot/` (iframe, `?preview=pixel`). Zincir köprüsü **yok**. | **Oyun motoru olarak seçildi** (§6). Sahne mimarisi ve web export hattı yeniden kullanılır; `rules.gd` Buckshot kurallarına yeniden yazılır (yalnızca çevrimdışı pratik/mock için); zincir köprüsü eklenir. |
| Sesler, fontlar | `apps/web/public/sounds`, `app/fonts` | CC0 cue'lar, 8 dosya. | Web UI sesleri kalabilir; oyun içi ses yeniden tasarlanır (§3.6). |
| Toolchain | makine | `godot`, `cargo`, `cargo-near`, `near` CLI, `pnpm`, `node` kurulu. Godot web export `thread_support=false` → COOP/COEP başlığı gerektirmez. | İyi haber: ek kurulum az. `index.wasm` ~39.5 MB (sıkıştırılmamış) — yükleme riski §9'da. |

---

## 2. Referans: Buckshot Roulette nasıl oynanıyor (adım adım)

Mike Klubnika'nın 2023'te itch.io'da yayınladığı, 2024'te Steam'e (Critical Reflex) gelen oyun. Aşağısı oynanış hafızasından yapılmış bir tariftir; **[EMİN DEĞİLİM]** işaretli yerler TASKS'taki "referans doğrulama" görevinde (T-001) oynanarak/izlenerek teyit edilmeli.

### 2.1 Çerçeve
1. Oyuncu bir kulüp tuvaletinden geçip arka odaya iner; bir feragatname imzalar (isim girer). Masanın karşısında "Dealer" adlı insan-dışı bir figür oturur.
2. Kamera birinci şahıs, oyuncu masada oturur. Fare/ok tuşlarıyla bakış hafifçe kayar; masa, silah, eşya ızgarası ve can göstergesi görünür.
3. Hikâye modu üç "round"dan oluşur. Her round ayrı can sayısıyla başlar. **[EMİN DEĞİLİM: round canları 2 / 4 / 5–6]**
4. Can, masadaki defibrilatör benzeri cihazda "şarj" (yıldırım simgesi) olarak gösterilir. Canı biten taraf round'u kaybeder.

### 2.2 Bir yükleme ("load") döngüsü
1. Dealer fişekleri masaya dizer: **dolu (kırmızı)** ve **boş/kuru sıkı (mavi-gri)** fişekler karışık sırada, sayıları açıkça görülecek şekilde. Ekranda örn. "2 LIVE, 3 BLANK" bilgisi okunur.
2. Fişekler toplanır ve pompalı tüfeğe **gizli sırayla** yüklenir. Oyuncu sıralamayı bilmez, sadece toplam sayıları bilir.
3. Toplam fişek sayısı 2–8 arası, en az 1 dolu ve 1 boş. **[Buckshot referansı — Rolet'te 8 gözlü, `min_live..=max_live` (varsayılan `2..=6`), bkz. §3.1 ve `DECISIONS.md` #10]**
4. Round 2 ve 3'te (Buckshot referansı; Rolet'te R1 dahil her yüklemede, bkz. §3.1) iki tarafa da eşya dağıtılır: masada bir kutu açılır, oyuncu eşyaları teker teker alıp kendi tarafındaki ızgaraya yerleştirir (Buckshot'ta 2/4 eşya ve daha geniş ızgara; Rolet'te her round 4 eşya ve 4 slot, bkz. §3.1). Izgara doluysa boş slot kadar alınır.
5. Tüfekteki fişekler bitince yeni yükleme yapılır (1. adıma dön). Round, bir tarafın canı bitene kadar sürer.

### 2.3 Bir hamle
Sırası gelen taraf:
1. **İstediği kadar eşya kullanabilir** (her biri ızgaradan alınır, animasyonla uygulanır, tükenir).
2. Sonra **tüfeği alır** ve namluyu **kendine** ya da **rakibe** çevirip tetiği çeker.
3. Sonuç:
   - Rakibe ateş, **dolu** → rakip 1 can kaybeder (testereyle 2). Sıra rakibe geçer.
   - Rakibe ateş, **boş** → hasar yok. Sıra rakibe geçer.
   - Kendine ateş, **dolu** → kendisi 1 can kaybeder (testereyle 2). Sıra rakibe geçer.
   - Kendine ateş, **boş** → hasar yok, **sıra sende kalır** (temel risk/ödül kararı).
4. Her atıştan sonra pompa çekilir, boş kovan dışarı fırlar.

### 2.4 Eşyalar ve etkileri
Orijinal beşli (hikâye modu):

| Eşya | Etki |
|---|---|
| Büyüteç | Hazneye bakılır, **mevcut fişeğin** dolu/boş olduğu yalnızca kullanana gösterilir. |
| Sigara | +1 can (maksimumu aşamaz). |
| Bira | Pompa çekilerek **mevcut fişek atılır**, rengi herkese görünür. Atış sayılmaz, sıra geçmez. |
| Kelepçe | Rakip **bir sonraki sırasını kaçırır**. Rakip zaten kelepçeliyken kullanılamaz; kelepçe kırıldığı turda tekrar takılamaz. **[EMİN DEĞİLİM: tekrar takma kısıtının tam kapsamı]** |
| El testeresi | Namlu kesilir: **bir sonraki atış 2 hasar** verir. Atıştan sonra (dolu ya da boş) namlu eski haline gelir. Üst üste iki kez kullanılamaz. |

Sonradan eklenenler ("Double or Nothing" güncellemesi):

| Eşya | Etki |
|---|---|
| Kullan-at telefon | Gelecekteki rastgele bir fişeğin sırasını ve türünü kullanana söyler ("3. fişek… dolu"). Tek fişek kaldıysa bilgi vermez. **[EMİN DEĞİLİM: mevcut fişeği hariç tutuyor mu — muhtemelen evet]** |
| İnverter | **Mevcut fişeğin** kutbunu çevirir (dolu↔boş). Açıklanan sayılar güncellenmez. |
| Adrenalin | Rakibin bir eşyasını çalar ve **hemen kullanır**. Adrenalin çalınamaz. Seçim için süre sınırı var. **[EMİN DEĞİLİM: süre]** |
| Son kullanma tarihi geçmiş ilaç | Şans: %50 ihtimalle +2 can, aksi halde −1 can (öldürebilir) (`Config.tincture_good_pct`, varsayılan 50). |

### 2.5 Round'a özel kurallar
- **Round 1 (Buckshot hikâye referansı):** Buckshot hikâye modunda başlangıçta eşya dağıtılmaz, düşük can ve saf şans + boşla-kendine-ateş kararı vardır (Rolet'te R1 dahil tüm round'lar 4 can ve 4 eşya ile oynanır; bkz. §3.1 ve `DECISIONS.md` #10).
- **Round 2:** eşyalar devreye girer.
- **Round 3:** can belirli eşiğin altına düşünce (≈2) "teller kesilir"; o noktadan sonra sigara/ilaç ile iyileşme yapılamaz, ölüm kalıcıdır. **[EMİN DEĞİLİM: eşik ve hangi eşyaları etkilediği]**
- Kazanma: üç round'u sağ bitirmek. Kaybetme: canın biter. **[EMİN DEĞİLİM: R1/R2'de ölünce yeniden canlandırılma var mı]**
- Çok oyunculu mod (2024 güncellemesi) 2–4 kişiyle oynanır; bu dokümanda referans hikâye/Double or Nothing kurallarıdır.

### 2.6 Animasyon ve his (tarif)
Sırasıyla bir hamlenin hissi:
1. **Boşta:** Loş, tek tepe lambası. Kamera hafifçe nefes alır gibi salınır. Rakip hafifçe kıpırdar. Düşük frekanslı drone müzik.
2. **Fişek gösterimi:** Fişekler masada bir sıra halinde belirir, kamera hafifçe masaya eğilir, sayıların okunması için kısa bekleme; sonra toplanıp tüfeğe sokulur (yükleme sesi tek tek "çıt").
3. **Eşya dağıtımı:** Kutunun kapağı açılır, eşya kutudan "çıkar", oyuncu tıklayınca ızgaraya yerleşir (her biri kısa bir tok ses).
4. **Eşya kullanımı:** Her eşyanın kendi kısa animasyonu: büyüteç namluya yaklaşır ve kırmızı/mavi fişek görünür; sigara yakılır ve duman, can göstergesi +1 bip; bira içilir, pompa çekilir, fişek havada döner ve masaya düşer; kelepçe rakibin bileklerine takılır; testere namluyu keser, uç parça masaya düşer.
5. **Silahı alma:** Tıklayınca tüfek masadan kaldırılır, eller görünür. Kamera hafif yaklaşır.
6. **Hedef seçimi:** İki seçenek vurgulanır (rakip / kendin). Rakip seçilince namlu karşıya döner, rakip görüş alanında. Kendin seçilince kamera **namlunun ağzına bakar**; ekranın ortasını siyah namlu deliği doldurur.
7. **Gerilim beklemesi:** Tetiğe basmadan önce kısa sessizlik / nefes (≈0.5–1 s).
8. **Sonuç:**
   - *Dolu, kendine:* Patlama sesi, beyaz flaş → ekran anında siyaha döner, kulak çınlaması, birkaç saniye karanlık; sonra görüntü geri gelir, can göstergesi düşer.
   - *Dolu, rakibe:* Patlama, namlu ağzı ateşi, rakip geriye/karanlığa savrulur, kamera sarsılır; rakip kısa süre sonra yerine döner.
   - *Boş:* Kuru "klik", kısa sessizlik. Kendine boşsa rahatlama nefesi; sıra sende kalır.
9. **Fişek çıkarma:** Pompa çekilir, kovan yana fırlayıp masada seker/yuvarlanır (dolu ise yanık, boş ise temiz).
10. **Ölüm/round sonu:** Işıklar söner, sahne geçişi.

Ses tasarımının ana fikri: neredeyse sessiz ortam + çok yakın, kuru, yüksek dinamikli efektler (tetik, klik, pompa) + patlamada sessizliğin bozulması.

---

## 3. Rolet: aynı oyun, özgün sahne

### 3.1 Maç formatı (PvP)
Buckshot'ın hikâye modu insan-vs-bot. Rolet iki insan oyuncu, dolayısıyla:

- **[KARAR — Değerler Rolet, mekanik Buckshot]** Oyun değerleri orijinal Rolet (Solana) sürümünden alınır, oynanış mekanikleri ve best-of-3 round yapısı Buckshot Roulette'ten gelir (`REFERENCE-CHECK.md` yalnızca Buckshot mekanik referansı olarak kalır).
- **[KARAR] Maç = 3 round.** Round'u kazanan 1 puan alır; **2 puana ulaşan maçı kazanır** (3. round her zaman oynanmaz). Böylece R1 (4 eşya, 4 can), R2 (4 eşya, 4 can), R3 (tüm eşyalar + iyileşme kesilmesi) tırmanışı korunur ve maç süresi ~4–8 dk kalır.
- Alternatif (demo için): `quick` modu — tek round, R3 kuralları. Kontrat `Config` ile ayarlanabilir; varsayılan best-of-3.

Parametreler (`Config` varsayılanları, Rolet değerleri):

| Round | Başlangıç canı | Yükleme başına eşya | İyileşme kesme eşiği |
|---|---|---|---|
| 1 | 4 | 4 | yok |
| 2 | 4 | 4 | yok |
| 3 | 4 | 4 | can ≤ 2 olunca iyileşme kapalı (`heal_cut_at: Some(2)`) |

- Eşya slotu: oyuncu başına 4 (`Config.max_items = 4`, UI ızgarası 4 slot). Dolu slota gelindiğinde yalnızca boş slot kadar çekilir; çekilmeyen kartlar ortak destede kalır.
- Fişek yüklemesi: tabanca her zaman 8 gözlü (`Config.load_size = 8`); her yüklemede dolu sayısı `ChainSource` rastgeleliğiyle `Config.min_live..=Config.max_live` (varsayılan `2..=6`, en az 2 kuru sıkı) aralığından seçilir, kalanlar kuru sıkıdır. Seçilen `(live, blank)` sayıları yükleme anında açıkça duyurulur (`MatchView` + `LoadStarted`), sıra ise gizli kalır ve lazy draw ile çekilir (§4.6).
- **[KARAR] Sıra kuralları:** R1'in ilk sırası rastgele. Yeni yüklemede sıra, kimde kaldıysa onda devam eder. Yeni round'u bir önceki round'u **kaybeden** başlatır.
- **[KARAR] Hamle süresi:** 45 s. Süre biten oyuncuya karşı `claim_timeout` çağrılabilir → **maçı** kaybeder. (Buckshot'ta yok; zincirde terk eden oyuncuya karşı zorunlu.)
- Kazanma ödülü: kontrattaki treasury'den sabit NEAR.

### 3.2 Kurallar (Rolet = Buckshot, kontratın uygulayacağı kesin metin)

1. Hamle sahibi sıfır veya daha fazla eşya kullanır, sonra ateş eder. Ateş etmeden sıra bitmez (eşya kullanıp beklemek yok; süre aşımı = kayıp).
2. Ateş sonuçları §2.3'teki tablo ile birebir.
3. Testere aktifken yapılan ilk atış 2 hasar verir (dolu ise), atıştan sonra testere sıfırlanır. Testere aktifken tekrar testere kullanılamaz. Bira ile ara fişek atılırsa sıra ve testere korunur; son fişek atılırsa tur biter (sıra geçer, rakip kelepçeliyse atlanır), testere sıfırlanır ve ardından yeni yükleme yapılır.
4. Kelepçe: rakip kelepçeliyse veya bu sıra zincirinde kelepçesi yeni kırıldıysa kullanılamaz. Sıra kelepçeli oyuncuya geçecekken o sıra atlanır ve kelepçe kırılır; sıra tekrar kullanana döner.
5. Boşla kendine ateş edince sıra kalır; kelepçe/testere durumları değişmez (testere hariç: atış yapıldığı için sıfırlanır).
6. Can 0 → round biter. Round bitince tüm eşyalar, testere, kelepçe sıfırlanır; yeni round yeni canlarla ve yeni yüklemeyle başlar.
7. Fişek bitince yeni yükleme + eşya dağıtımı (R1 dahil); yeni yükte kelepçe kalkar.
8. Eşya etkileri §2.4 tablosuyla birebir. Belirsiz oranlar (`ilaç`) kontrat sabiti olarak tanımlanır.
9. Rakibin eşyasını çalma (adrenalin karşılığı): hedef slot seçilir, eşya rakipten silinir ve **hemen** çalan adına uygulanır. Çalınan eşya bu sırada uygulanamazsa (ör. rakip zaten kelepçeli) işlem reddedilir ve hiçbir şey tüketilmez.

### 3.3 Ortam önerileri (özgün)

| # | Mekan | Atmosfer | Artı | Eksi |
|---|---|---|---|---|
| **A** | **Saat kulesinin makine dairesi** — dev pirinç dişliler, sallanan sarkaç, arkada içten aydınlanan saydam kadran camı, gece | Sıcak pirinç/kehribar ışık + soğuk ay ışığı kadran camından; sürekli tik-tak; her round başında çan | Mevcut landing'in "atölye / pirinç / parşömen" kimliğiyle (WorkshopScene3D, GildedButton, ParchmentSeal) birebir uyumlu → UI değişmeden kalabilir. Saat = hamle süresi anlatısı (süre azalınca tik-tak hızlanır). Dişliler can göstergesi için doğal. Meshy sert yüzeyli pirinç prop'larda iyi. | Çok sayıda prop gerekir (dişliler modüler yapılmalı). |
| B | **Terk edilmiş hamam** — göbek taşı masa, kubbedeki fil gözlerinden düşen ışık sütunları, buhar | Mermer, nem, buhar perdesi; ışık sütunları arasında karanlık | Kültürel olarak çok özgün, Türk ekibi için hikâye. Buhar flaş/karartma efektlerini zenginleştirir. | Mevcut landing temasıyla bağ zayıf; buhar/volumetrik efekt GL Compatibility renderer'da pahalı/sınırlı. |
| C | **Fırtınadaki deniz fenerinin lamba odası** — dönen dev mercek | Dönen ışık her birkaç saniyede odayı tarar; geri kalan zifiri karanlık | Çok güçlü görsel ritim; "flaş" doğal. | Dönen ışık okunabilirliği bozar (masa her an görünmeli); oda küçük → kamera açıları kısıtlı. |

**Öneri: A — Saat kulesi makine dairesi.** Gerekçe: (1) mevcut Next.js UI ve markayla tutarlı, UI yeniden tasarımı gerekmez; (2) "zamanla yarış" anlatısı zincir üzerindeki hamle süresini oyun içi bir mekaniğe dönüştürür; (3) prop'lar sert yüzeyli, Meshy'nin güçlü olduğu türde; (4) GL Compatibility renderer'da ucuz (tek noktasal ışık + emissive kadran + Godot'un mevcut dither/pixel shader'ı).

Sahnenin dili (A):
- Masa: dişli kutusunun üstüne oturtulmuş, pirinç kenarlı ağır meşe tabla. Ortasında silahın durduğu oyuk.
- Arka plan: karşı oyuncunun arkasında dev kadran camı (içten aydınlanan, akrep/yelkovan gölgesi); yanlarda dönen dişliler, tavanda sarkaç.
- Işık: masanın üstünde tek sarı lamba (sallanır), kadrandan soğuk mavi dolgu ışığı. Patlamada lamba titrer.
- **Can göstergesi:** her oyuncunun yanında pirinç bir pano; her can bir **cam lamba (tüp)**. Can kaybında tüp çatlar ve söner; iyileşmede yanar. R3 eşiğinde panonun kablosu kopar (kıvılcım) → "iyileşme kapalı".
- **Fişek gösterimi:** fişekler masadaki pirinç bir **dizgi rafına** (cartridge rack) dizilir; dolu = koyu kırmızı gövde + pirinç taban, boş = kemik beyazı gövde + çelik taban (Buckshot'ın kırmızı/mavisinden bilinçli farklı, renk körü dostu: renk + doku + tabanın metali farklı).
- **Eşya kutusu:** saatçi alet çantası; kapak açılır, eşyalar kadife yuvalardan çıkar.
- **Karakterler:** oyuncuların NFT karakterleri; masanın karşısında oturan rakip, kendi karakter modeliyle görünür (bkz. §3.5).

### 3.4 Eşya eşlemesi (etki birebir, görünüş özgün)

| Kod adı | Buckshot karşılığı | Rolet prop'u (Saat kulesi) | Etki |
|---|---|---|---|
| `Loupe` | Büyüteç | Saatçi lupu | Mevcut fişeği yalnız kullanana gösterir |
| `Pipe` | Sigara | Pipo | +1 can |
| `Flask` | Bira | Matara | Mevcut fişeği at, herkese göster |
| `Shackle` | Kelepçe | Zincir + asma kilit | Rakip bir sırayı kaçırır |
| `Hacksaw` | El testeresi | Demir testeresi | Sonraki atış 2 hasar |
| `Ticker` | Kullan-at telefon | Telgraf şerit makinesi (şeride "4: DOLU" basar) | Gelecekteki rastgele bir fişeği yalnız kullanana gösterir |
| `Magnet` | İnverter | Atnalı mıknatıs | Mevcut fişeğin kutbunu çevirir |
| `Lockpick` | Adrenalin | Maymuncuk | Rakibin bir eşyasını çal ve hemen kullan |
| `Tincture` | Bozuk ilaç | Etiketi solmuş tentür şişesi | Şans: +2 can ya da −1 can |

Silah: **pompalı tüfek** (pompa = fişek atma animasyonunun kaynağı). Model özgün: kısa, pirinç kakmalı, saatçi gravürlü. Mevcut repodaki revolver/8 hazne düzeni bu tasarımda kullanılmaz.

### 3.5 Karakterler (NFT)
- Başlangıç kadrosu: **3 karakter** (ör. *Kuleci* — yaşlı çan bekçisi; *Ayarcı* — maskeli genç saatçi; *Kaçak* — palto ve gaz maskeli yabancı). Her biri NEP-171 token türü (`kind`).
- Rakip, masanın karşısında **belden yukarı** görünür; kendi oyuncumuzun bedeni görünmez, yalnızca **birinci şahıs elleri** (ortak, eldivenli el seti; karakterden bağımsız → tek asset).
- Karakter modeli + basit rig (Meshy auto-rig). Oyuna özgü pozlar (tüfeği kendine çevirmek gibi) Meshy'nin hazır animasyon kütüphanesinde olmayacağı için **Godot AnimationPlayer'da kemik pozlarıyla elle anahtarlanır** (az sayıda: §3.7).

### 3.6 Ses tasarımı (özgün)
- **Ortam katmanı:** saat mekanizması tik-takı (60 bpm; hamle süresinin son 10 s'sinde 120 bpm'e çıkar), dişli gıcırtısı, rüzgâr, uzak şehir. Çok düşük seviyede drone.
- **Yakın efektler (kuru, yüksek dinamik):** tüfeği kaldırma (kumaş+metal), pompa ileri/geri, tetik, kuru klik, patlama (düşük uç + oda yankısı), kovan sekmesi (pirinç tını), fişek rafa dizilme (tek tek), kutu kapağı, her eşyanın kendi foley'i (lup takırtısı, kibrit+pipo nefesi, matara yudumu, zincir+kilit, testere, telgraf tıkırtısı, mıknatıs "tunk", maymuncuk, şişe kapağı).
- **Can:** tüp çatlaması + sönme vızıltısı; iyileşmede tüp ısınma vızıltısı.
- **Round başı:** kule çanı (R1 bir, R2 iki, R3 üç vuruş).
- **Kendine dolu:** patlama → anında kesilen tüm ses → 2 s yüksek frekanslı çınlama → yavaşça ortam geri gelir.
- Kaynaklar: kendi foley kaydı veya **CC0** kütüphaneler (freesound CC0 filtresi), gerekirse Godot'ta prosedürel ton. Lisansları `godot/assets/audio/CREDITS.md`'de listelenir. Buckshot'tan hiçbir ses kullanılmaz.

### 3.7 Animasyon listesi (Rolet)

Kamera: **birinci şahıs, oturur pozisyonda**. Fareyle ±12° yatay, ±8° dikey bakış (yumuşatılmış). Tüm animasyonlar **zincir gecikmesini maskeleyecek** şekilde tasarlanır (§5.6): sonucu bilinmeyen hamlelerde "gerilim beklemesi" sonuç gelene kadar uzayabilir.

Tablo: `S` = sahibi biz (birinci şahıs), `R` = rakip yapıyor (karşıdan görüyoruz). Süreler hedef değerdir.

| ID | Tetikleyici | Kamera | Ne olur | Ses | Süre |
|---|---|---|---|---|---|
| A01 `idle_breathe` | sürekli | FP | Kamera ±0.3° nefes salınımı; lamba hafif sallanır; rakip idle | tik-tak | döngü |
| A02 `round_intro` | round başı | FP → masaya hafif eğim | Işıklar söner/açılır, panoda canlar teker teker yanar, çan | çan ×N, tüp vızıltısı | 2.5 s |
| A03 `shells_reveal` | yükleme | masaya eğim (pitch −20°) | Fişekler rafa tek tek dizilir (karışık sırada), sayılar HUD'da ve rafta okunur, 1.5 s bekleme | her fişek bir "çıt" | 2–3.5 s |
| A04 `shells_load` | A03 sonrası | FP | Rafın kapağı kapanır, fişekler tüfeğe sokulur (sayı kadar "çıt"), tüfek masaya yatırılır. Sıra gizli. | yükleme çıtları, pompa | 1.5–2.5 s |
| A05 `items_deal` | R1/R2/R3 yükleme | masaya eğim | Alet çantası açılır, eşyalar teker teker kendi ızgarana uçar (S) / rakibin ızgarasına (R) | kapak, her eşya bir tok ses | N × 0.35 s |
| A06 `gun_pickup` | S: silaha tıklama · R: rakip hamlesi | FP | Eller tüfeği kaldırır, kamera 5% yaklaşır | kumaş + metal | 0.5 s |
| A07 `aim_opponent` | hedef seçimi | namlu üstünden rakibe | Namlu karşıya döner; rakip kadrajın ortasında; hafif el titremesi | nefes | 0.4 s |
| A08 `aim_self` | hedef seçimi | **namlu ağzı kameraya** | Tüfek döner, namlu deliği ekranın ortasını kaplar; vinyet koyulaşır | metal sürtünme, kalp atışı | 0.5 s |
| A09 `tension_hold` | tetik isteği gönderildi, sonuç bekleniyor | aynı | Minimum 0.7 s, sonuç gelene kadar sürer; tik-tak yavaşlar ve durur; 4 s'yi geçerse "mekanizma takıldı" dişli sesi ile süre dolgusu | sessizlik | 0.7 s – sonuç |
| A10 `fire_live_opp` | sonuç: dolu → rakip | namlu üstü | Namlu ateşi, ekran sarsıntısı (6 kare, adımlı), rakip geriye savrulup karanlığa düşer; rakibin panosunda tüp(ler) çatlar | patlama + yankı + tüp | 1.6 s |
| A11 `fire_live_self` | sonuç: dolu → kendin | namlu ağzı | Beyaz flaş (2 kare) → **tam siyah** 1.5 s → görüntü bulanık geri gelir, kamera 10° yana yatık başlar ve düzelir; panonda tüp çatlar | patlama → kesik sessizlik → çınlama | 3 s |
| A12 `fire_blank` | sonuç: boş | aynı | Kuru klik, 0.4 s donma; kendine ise rahatlama nefesi ve kamera hafif geri | klik | 0.8 s |
| A13 `rack_eject` | her atış ve `Flask` sonrası | FP / masa | Pompa çekilir, kovan döne döne masaya düşer ve seker; atılan fişek görünür (dolu: kırmızı, boş: kemik) | pompa, pirinç sekme | 0.8 s |
| A14 `gun_putdown` | sıra biter | FP | Tüfek masaya bırakılır; sıra rakibe geçerken lamba hafif rakibe döner | metal tok | 0.5 s |
| A15 `opponent_knockback_return` | A10 sonrası, round sürüyorsa | FP | Rakip karanlıktan yerine döner, nefes nefese | sandalye gıcırtısı | 1.2 s |
| A16 `self_down_return` | A11 sonrası, round sürüyorsa | FP | (A11 içinde) | — | — |
| A17 `item_loupe` | Loupe | yakın plan namlu | Lup namlu yanına gelir, hazne yuvasında fişek parlar (S: renk görünür; R: rakibin yüzü/kafası eğilir, renk görünmez) | lup takırtısı | 1.4 s |
| A18 `item_pipe` | Pipe | FP | Kibrit çakılır, pipo tüttürülür, duman; panoda bir tüp yanar | kibrit, nefes, vızıltı | 1.6 s |
| A19 `item_flask` | Flask | FP | Matara içilir → A13 ile fişek atılır, herkes görür | yudum, pompa | 1.8 s |
| A20 `item_shackle` | Shackle | rakibe | Zincir rakibin bileklerine dolanır, kilit kapanır; kelepçeli taraf sırası gelince bileklerini çekiştirir (atlanan sıra animasyonu) | zincir, kilit | 1.4 s |
| A21 `item_hacksaw` | Hacksaw | tüfeğe yakın | Testere namluyu keser, uç masaya düşer; atış sonrası A22 | testere, düşme | 1.6 s |
| A22 `barrel_restore` | testereli atış sonrası | FP | Namlu ucu "yerine döner" (sahte kesik kapanır, kısa kıvılcım) | mekanik tık | 0.4 s |
| A23 `item_ticker` | Ticker | şeride yakın | Telgraf makinesi tıkırdar, şerit çıkar: "4 · DOLU" (S) / R: şerit rakibe döner, okunmaz | telgraf | 1.6 s |
| A24 `item_magnet` | Magnet | tüfeğe | Mıknatıs hazneye dokunur, kısa mavi ark | tunk + vızıltı | 1.2 s |
| A25 `item_lockpick` | Lockpick | rakibin ızgarasına | El rakibin ızgarasından eşyayı alır → o eşyanın animasyonu hemen oynar | maymuncuk, çalma | 1.0 s + eşya |
| A26 `item_tincture` | Tincture | FP | Şişe içilir; iyi: tüpler yanar, kötü: öksürük + tüp çatlar | şişe, yudum | 1.6 s |
| A27 `heal_cut` | R3 eşiği | panoya yakın | Panonun kablosu kopar, kıvılcım; ölçekler kırmızıya döner | kıvılcım | 1.2 s |
| A28 `round_end` | can 0 | FP | Işıklar teker teker söner; kazanan taraf panosunda puan çentiği yanar | çan, sönme | 2.5 s |
| A29 `match_end` | maç biter | yavaş geri çekiliş | Kazanan: kadran camı aydınlanır, ödül tutarı (NEAR) kadranın üstünde; kaybeden: karanlık | çan, uzun kuyruk | 4 s |
| A30 `turn_timer` | son 10 s | FP | Tik-tak hızlanır, kadran yelkovanı görünür şekilde atlar | tik-tak | — |
| A31 `opponent_waiting` | rakip düşünüyor | FP | Rakip ellerini masada gezdirir, kafasını eğer (idle varyantları) | — | döngü |

Toplam: 31 animasyon girdisi; çoğu kamera + prop tween'i (kod), karakter kemik animasyonu gerektirenler: A06–A08 (R versiyonları), A10 (savrulma), A15, A17–A26 (R versiyonları), A31. Bunlar küçük bir **ortak poz setine** indirgenir: `idle`, `reach`, `hold_gun`, `aim_self`, `aim_opp`, `recoil`, `knockback`, `recover`, `use_item_mouth` (pipo/matara/tentür), `use_item_hands` (lup/testere/mıknatıs/telgraf), `shackled`.

---

## 4. NEAR mimarisi

### 4.1 Genel resim

```
┌──────────────── Tarayıcı ────────────────┐
│  Next.js 16 (apps/web)                    │
│   ├─ Wallet Selector  (tek seferlik onay) │
│   ├─ useRoletNear  ── function-call key ──┼──► NEAR RPC (proxy: /api/rpc)
│   ├─ /api/matchmaking (bellek içi kuyruk) │          │
│   └─ <iframe> Godot oyun sahnesi          │          ▼
│        ▲  postMessage köprüsü  ▼          │   rolet.<hesap>.testnet
└───────────────────────────────────────────┘   (near-sdk-rs kontrat)
                                                 ├─ Oyun kuralları
                                                 ├─ NEP-171 karakter NFT
                                                 └─ Treasury + ödül
```

- **Tek kontrat** (`rolet`): oyun + NFT + treasury aynı hesapta. Gerekçe: bilet kontrolü (sahiplik + durability) ve ödeme senkron olur; NEAR'da çapraz kontrat çağrıları asenkron ve callback/geri alma mantığı gerektirir — hackathon süresinde gereksiz risk.
- Sunucu yalnızca kuyruktur (iki hesabı tanıştırır), oyun durumuna dokunmaz.
- Kontrat **otoriterdir**; Godot ve web istemcisi asla sonuç hesaplamaz, sadece gösterir.

### 4.2 Hesaplar ve anahtarlar

| Kim | Anahtar | Ne imzalar |
|---|---|---|
| Oyuncu cüzdanı | full-access (cüzdanda) | `buy_character` (deposit), function-call key ekleme (bir kez), NFT transferi |
| Oyuncunun **function-call access key**'i | tarayıcıda üretilir, `localStorage`'da saklanır | `join`, `reveal`, `cancel`, `fire`, `use_item`, `claim_timeout` — **cüzdan penceresi yok** |
| Kontrat sahibi | full-access | `new`, `set_config`, `pause`, `withdraw_ops` |
| Treasury | kontrat hesabının kendi bakiyesi içinde muhasebeleşen alan | — |

### 4.3 Function-call access key akışı (pitch'in ana noktası)

1. Oyuncu `/duel`'e ilk girdiğinde istemci yeni bir ed25519 anahtar çifti üretir.
2. Wallet Selector üzerinden **tek bir onay**: oyuncunun kendi hesabına `AddKey` aksiyonu — izin: `FunctionCall { receiver_id: rolet, method_names: [join, reveal, cancel, fire, use_item, claim_timeout], allowance: 0.5 NEAR }` (`Config.allowance_hint = 0.5 NEAR`; yoğun/çoklu maç oturumları için T-201 cüzdan testine göre 1–2 NEAR önerilir).
   - Tercih edilen yol: `signIn({ contractId, methodNames })` destekleyen cüzdanlarda (MyNearWallet, Meteor vb.) cüzdan bu anahtarı zaten ekler ve istemciye verir. **[EMİN DEĞİLİM: hangi cüzdanların key'i dApp'e açtığı — T-201'de doğrulanacak]**
   - Yedek yol: istemci kendi ürettiği public key için `signAndSendTransaction({ receiverId: <oyuncu>, actions: [AddKey(...)] })`.
3. Sonraki tüm oyun çağrıları bu anahtarla imzalanır, istemci doğrudan RPC'ye gönderir. Gaz ücreti allowance'tan düşer: S-01 koruması gereği `reveal`, `fire` ve `use_item` çağrıları en başta `prepaid_gas >= MIN_ACTION_GAS (15 Tgas)` bekler. `near-workspaces` sandbox'ta gerçek `FunctionCall` key ile ölçülen değerler (`tests/integration.rs`, `fix_f2_1_function_call_access_key_flow`, çağrı başı `30 Tgas` ön ödemeli):
   - **Anlık düşüş vs kesinleşmiş (settled) düşüş:** İşlem gönderildiğinde sandbox allowance'tan anlık olarak `~0.03092 NEAR` (`30_919_965_125_963_500_000_000 yoctoNEAR`) rezerve eder; kullanılmayan gaz kesinleşme (birkaç blok) sonrasında allowance'a geri iade edilir ve net düşüş `join` için `0.0002949 NEAR` (`294_943_842_190_000_000_000 yoctoNEAR`), `cancel` için `0.0002994 NEAR` (`299_351_071_011_600_000_000 yoctoNEAR`) olur.
   - **Tam maç allowance maliyeti:** Oyuncu başına tam bir maçta (Alice `15` çağrı → `0.003949 NEAR` [`3_949_326_072_200_700_000_000 yoctoNEAR`], Bob `13` çağrı → `0.003669 NEAR` [`3_669_065_628_562_800_000_000 yoctoNEAR`], çağrı başı ortalama `~0.00026–0.00028 NEAR`) toplam `~3.7–4.0 mNEAR` harcanır. Bu ölçüme göre `Config.allowance_hint = 0.5 NEAR` kesinleşmiş kullanımda **~125 tam maç** taşır (testnet gerçek gaz fiyatıyla T-201'de teyit edilecek).
   - **Yasak ve sınır doğrulaması (FIX-F2-1):** Aynı FC key ile `nft_transfer`, `buy_character`, `fund_treasury`, `claim_reward` ve owner metodları (`set_config`, `pause`, `unpause`, `withdraw_ops`) reddedilir; allowance tükendiğinde `NotEnoughAllowance` döner.
4. Function-call key **deposit ekleyemez** → oyun metodlarının hiçbiri `#[payable]` değildir. NFT satın alma payable'dır ve bu yüzden yalnızca cüzdandan yapılabilir. Güvenlik özelliği olarak pitch'te anlatılır: "anahtar çalınsa bile en kötü ihtimalle senin adına hamle yapılır, para çekilemez."
5. Allowance biterse istemci bunu `NotEnoughAllowance` hatasından anlar ve yeni key için tek onay ister.
6. Çıkışta (`signOut`) istemci key'i siler; isteğe bağlı `DeleteKey` cüzdanla.

Opsiyonel (stretch): NEP-366 meta-transaction + relayer ile oyuncunun gaz ödemesini de kaldırmak. Varsayılan planda yok.

### 4.4 Maç yaşam döngüsü (simetrik, host yok)

```
Kuyruk: A ve B eşleşir → ikisine de {match_id, opponent} döner
A: join(match_id, opponent=B, commit_A, token_A)   ┐ sıra önemsiz
B: join(match_id, opponent=A, commit_B, token_B)   ┘ ikinci join → maç Active
A,B: reveal(match_id, secret)   (istemci otomatik, arka planda)
      └─ ikinci reveal → match_seed sabitlenir, R1 ilk yüklemesi yapılır
Hamleler: use_item(...)* + fire(target)  … round … round …
Bitiş: son fire → winner yazılır → ödül otomatik transfer → oyuncular serbest
```

`join(match_id: U64, opponent: AccountId, commit: Base64VecU8 /*32*/, token_id: TokenId)`:
- `predecessor` = oyuncu (access key de olsa predecessor oyuncu hesabıdır).
- Kontroller: `token_id` sahibi predecessor; durability > 0; token başka maçta kilitli değil; oyuncu başka aktif maçta değil; `opponent != predecessor`.
- Maç yoksa `Pending { a: predecessor, expects: opponent }` oluşturulur. Maç varsa ve `expects == predecessor` ve `a == opponent` ise maç **Active** olur. Karşılıklı isimlendirme sayesinde yabancı biri match_id'yi kapamaz.
- Her iki join'de de durability −1 ve token kilitlenir.

`reveal(match_id, secret)`: `sha256(secret ‖ account_id ‖ match_id_le) == commit` kontrolü. İkinci reveal'de:
`match_seed = sha256(secret_A ‖ secret_B ‖ env::random_seed() ‖ match_id)`; ilk sıra `match_seed[0] & 1`; R1 yüklemesi yapılır.

`cancel(match_id)`: yalnızca `Pending` iken ilk katılan; durability iade, kilit açılır.

`claim_timeout(match_id)`:
- Reveal aşamasında: reveal etmeyen tarafa karşı `reveal_deadline_ms + TIMEOUT_GRACE_MS` (`60 s + 2 s`, FIX-F2-8 yarış koruması) sonra → maç iptal, **zamanında davranan** tarafın durability'si iade, karşı taraf ceza olarak durability kaybeder (iade yok). Ödül yok.
- Active'de: sıra sahibinin `deadline_ms + TIMEOUT_GRACE_MS` (`2_000 ms`, S-15 yarış koruması) geçtiyse diğer oyuncu çağırır → çağıran maçı kazanır, ödül ödenir.
- Süre ölçümü `env::block_timestamp_ms()`.

### 4.5 Durum modeli (taslak)

```rust
pub struct Contract {
    owner: AccountId,
    config: Config,                       // fiyatlar, ödül, süreler, round tablosu
    treasury: NearToken,                  // muhasebe; gerçek bakiye kontrat hesabında
    ops_balance: NearToken,
    tokens: NonFungibleToken,             // near-contract-standards (NEP-171/177/181)
    character: LookupMap<TokenId, CharacterState>,   // kind, durability, locked_in: Option<u64>
    players: LookupMap<AccountId, PlayerState>,      // active_match, stats (wins, losses, played)
    matches: LookupMap<u64, Match>,
    paused: bool,
}

pub struct Match {
    id: u64,
    status: Status,                       // Pending | Revealing | Active | Finished | Cancelled
    players: [AccountId; 2],
    tokens: [TokenId; 2],
    commits: [[u8; 32]; 2],
    secrets: [Option<[u8; 32]>; 2],
    seed: [u8; 32],
    draw_nonce: u64,
    round: u8,                            // 1..=3
    score: [u8; 2],
    hp: [u8; 2],
    max_hp: u8,
    heal_cut: [bool; 2],
    items: [Vec<Item>; 2],                // her biri ≤ 4
    load: Load,                           // aşağıda
    turn: u8,                             // 0 | 1
    shackled: Option<u8>,
    shackle_broke_this_turn: bool,
    saw_active: bool,
    deadline_ms: u64,
    winner: Option<u8>,
    seq: u64,                             // her aksiyonda +1
    log: Vec<Action>,                     // son 32 aksiyon (istemci animasyonu için)
}

pub struct Load {
    announced_live: u8, announced_blank: u8, // gösterilen sayılar (değişmez)
    remaining: u8,                           // tüfekte kalan fişek
    live_left: u8, blank_left: u8,           // GERÇEK kalanlar (Magnet sonrası announced'dan sapar)
    fixed: Vec<Option<Shell>>,               // remaining uzunluğunda; çekilmiş/açılmış konumlar
}
```

### 4.6 Rastgelelik ve gizli bilgi — **en önemli tasarım kararı**

Sorun: NEAR'da kontrat durumu herkese açıktır. Fişek sırası yükleme anında karıştırılıp state'e yazılırsa, herkes RPC'den okuyup hangi fişeğin dolu olduğunu bilir → oyun ölür.

**Çözüm: sıra hiç saklanmaz, fişek "çekildiği anda" belirlenir (lazy draw).**
- Yüklemede yalnızca sayılar yazılır (`live_left`, `blank_left`, `remaining`).
- Bir fişeğin türüne ihtiyaç duyulduğunda (atış, `Flask`, `Loupe`, `Ticker`, `Magnet`) o konum çekilir:
  `r = sha256(match_seed ‖ draw_nonce ‖ env::random_seed())`, `P(dolu) = live_unfixed / (live_unfixed + blank_unfixed)`; sonuç `fixed[pos]`'a yazılır, `draw_nonce += 1`.
- Bu, önceden karıştırılmış gizli bir dizi ile **istatistiksel olarak özdeştir** (her konumun marjinal ve koşullu dağılımı aynı), ama zincirde okunacak bir sıra yoktur.
- `env::random_seed()` işlemin **çalıştığı** bloğa aittir; oyuncu işlemi gönderirken bilemez. View çağrısıyla simülasyon işe yaramaz (farklı blok, farklı tohum).
- NEAR çağrıları asenkron ve atomik değildir: bir oyuncu kendi kontratından `fire` çağırıp sonuç kötüyse geri alamaz. Yine de kontrat `predecessor_account_id == signer_account_id` şartı koşar (kontrat-üzerinden-çağrıyı tamamen kapatır).
- **Gaz-limitli reroll koruması (`MIN_ACTION_GAS`, S-01):** Saldırgan çok düşük ön ödemeli gazla `fire`/`use_item`/`reveal` gönderip yalnızca pahalı (kötü) dalların `ExceededGas` ile revert etmesini sağlayabilir. Bunu kapatmak için bu üç metod en başta, hiçbir RNG veya oyun durumu okunmadan `env::prepaid_gas() >= MIN_ACTION_GAS` (`15 Tgas`) şartını arar. Sandbox'ta dolu 100×64B leaderboard kovma dalı dahil ölçülen en pahalı dal (`fire` maç sonu + ödül transferi + kovma = `5.296 Tgas`) için **2.83×** güvenlik payı sağlar (`docs/near/VERSIONS.md`).
- Commit-reveal'in rolü: `match_seed`'i tek bir tarafın (blok üreticisi dahil) seçememesi. Oyun içi her çekilişin öngörülemezliğini `env::random_seed()` sağlar. Kalan teorik risk: blok üreten validator'ın kendisinin oyuncu olması — hackathon ölçeğinde kabul edilebilir, README'de açıkça yazılır.

**Gizli bilgi eşyaları (`Loupe`, `Ticker`):** Kontrat çekilen fişeği `fixed`'e yazmak zorunda (sonraki atış aynı sonucu vermeli) ve kontratın şifreleyebileceği bir sırrı yoktur. Dolayısıyla:
- **[KARAR] v1 (hackathon):** açılan fişek zincirde okunabilir; rakibin istemcisi bunu **göstermez** (UI gizliliği). Kural ihlali yapan istemci teorik olarak okuyabilir. README ve pitch'te "bilinen sınır" olarak dürüstçe yazılır.
- v2 fikri (uygulanmaz, sadece belgelenir): iki taraflı parça-sır protokolü veya TEE tabanlı bir "krupiye" ajanı ile gerçek özel bilgi.
- Not: `Flask` ile atılan fişek zaten herkese açık; `Magnet` kimseye bilgi vermez ama `fixed`'i değiştirir (çekip çevirir) — rakip zinciri okuyorsa öğrenebilir, aynı v1 sınırı.

Yükleme sayısı üretimi (`Config`'ten ayarlanabilir, Rolet varsayılanları):
Tabanca her zaman `load_size` gözlüdür (varsayılan `8`); her yüklemede dolu sayısı `ChainSource` ile `min_live..=max_live` (varsayılan `2..=6`, en az 2 kuru sıkı) aralığından seçilir, kalanlar kuru sıkıdır (`blank = load_size - live`). Seçilen sayılar `MatchView` ve `Action::LoadStarted` üzerinden iki oyuncuya açıkça duyurulur; sıra ise gizli kalır ve atış/eşya anında lazy draw ile çekilir.

Eşya dağıtımı (EK2 — ortak deste): Maç başında 9 eşya türünün her birinden `Config.copies_per_item` (varsayılan `4`, toplam `36` kart) kopya içeren ortak bir deste (`GameState.deck_counts: [u8; 9]`) oluşturulur. R1 dahil her round ve yüklemede ellere bu ortak desteden `items_per_load` (varsayılan `4`) kart **iadesiz** dağıtılır; çekilecek tür dağıtım anında `ChainSource` ile kalan kart sayıları oranında seçilir, deste biterse `[copies_per_item; 9]` olarak yeniden doldurulur. El doluysa (4 eşya, `Config.max_items`) yalnızca boş slot kadar kart çekilir; çekilmeyen kartlar ortak destede kalır. Kalan deste sayıları `MatchView.game.deck_counts` içinden tek yerden okunur (`RoundConfig.item_bag` FIX-F2-3 ile, mükerrer `deck_remaining`/`get_deck_remaining` ise FIX-F2-5 ile kaldırılmıştır).

### 4.7 Kontrat metodları

| Metod | Tür | Çağıran | Not |
|---|---|---|---|
| `new(owner, config)` | init | deploy | |
| `buy_character(kind)` | payable | cüzdan | `price` tam ödenmeli; `ops_bps` (vars. 500 = %5) ops'a, kalan treasury'ye; token mint, durability 10 |
| `nft_transfer`, `nft_token`, `nft_tokens_for_owner`, `nft_metadata`, ... | NEP-171/177/181 | | Kilitli (maçtaki) token transfer edilemez |
| `join(match_id, opponent, commit, token_id)` | call | access key | §4.4 |
| `reveal(match_id, secret)` | call | access key | |
| `cancel(match_id)` | call | access key | yalnız Pending |
| `use_item(match_id, slot, steal_slot: Option<u8>)` | call | access key | `steal_slot` yalnız `Lockpick` için |
| `fire(match_id, target: Target)` | call | access key | `Target::Self_ | Opponent` |
| `claim_timeout(match_id)` | call | access key | |
| `fund_treasury()` | payable | herkes | |
| `set_config`, `pause`, `withdraw_ops` | call | owner | |
| `get_match(match_id)` → `MatchView` | view | | gizli alan yok; `fixed` dahil (v1 sınırı) |
| `get_actions(match_id, since_seq)` → `ActionsPage { first_seq, actions }` | view | | istemci animasyon kuyruğu (boşlukta snapshot) |
| `get_player(account)`, `get_character(token_id)`, `get_config()`, `get_treasury()`, `leaderboard(from, limit)` | view | | |

Maç bitince ödül **aynı `fire`/`claim_timeout` çağrısı içinde** `Promise::new(winner).transfer(reward)` ile gönderilir (ayrı `settle` yok). Treasury yetersizse maç yine biter, ödül `owed` olarak kaydedilir ve `claim_reward()` ile sonradan çekilir.

Depolama ve muhasebe (S-02 / FIX-03-R):
- Kontrat state mutasyonları (`buy_character`, `join`, `cancel`, `reveal`, `fire`, `use_item`, `claim_timeout`, `finish_match`) `env::storage_usage()` farkını simetrik olarak `treasury` üzerinden muhasebeleştirir (`settle_storage`): büyüyen baytın depolama kilidi `treasury`'den düşülür, `cancel`, `Revealing` timeout silmeleri ve `finish_match` budaması ile açılan baytların kilidi `treasury`'ye geri iade edilir. Top-100 sıralama verileri (`top_scores`, `top_slots`, `top_slot_of`) kökten ayrı anahtarlarda saklandığı için `Contract` kökü sabit boyutlu kalır ve `settle_storage` leaderboard büyümesini de eksiksiz muhasebeleştirir (FIX-F2-6 / FIX-F2-7).
- Değişmez (solvency): her işlem sonunda `free_balance >= treasury + ops_balance + Σowed` korunur (`free_balance = account_balance - storage_usage * storage_byte_cost`); sandbox (`near-workspaces`) ve birim testlerle doğrulanır.
- Bitmiş maçlarda `log` ve `game.load.fixed` budanır, özet kalır; `cancel` ve `Revealing` timeout'ta maç kaydı tamamen silinir. `Config.min_treasury` (varsayılan 0.1 NEAR) altına inince yeni maç kabul edilmez.
- Ölçülen `env::storage_usage()` (T-116 birim testi, R2 yük + log girişleri): maç ortası budama öncesi > maç sonu budama sonrası (ör. −51 B minimumdan `LOG_CAP = 32` dolduğunda birkaç KB'a kadar iade). Gaz ölçümleri için bkz. `docs/near/VERSIONS.md`.

### 4.8 Olaylar ve istemci senkronu
- Her aksiyon hem `log`'a (`seq` ile) yazılır hem NEP-297 formatında `EVENT_JSON:{"standard":"rolet","version":"1.0.0","event":"shot","data":[...]}` olarak loglanır.
- İstemci kendi hamlesinin sonucunu **işlem sonucundan** (receipt outcome'daki dönüş değeri + log) hemen alır → kendi animasyonu en hızlı yoldan çözülür.
- Rakibin hamlelerini `get_actions(match_id, since_seq)` view çağrısını ~600 ms aralıkla yoklayarak alır (view ücretsiz). Websocket/indexer gerekmez. **[EMİN DEĞİLİM: güncel NEAR blok süresi ~0.6 s, kesinlik ~1.2 s — ölçülecek]**
- `Action` örnekleri: `LoadStarted{live,blank,total}`, `ItemsDealt{player,items}`, `ItemUsed{player,item,slot,result}`, `Shot{player,target,shell,damage}`, `Ejected{shell}`, `TurnSkipped{player}`, `HealCut{player}`, `RoundEnded{winner,score}`, `MatchEnded{winner,reward}`, `TimeoutClaimed{by}`.
- `ItemUsed.result` gizli bilgi eşyalarında yalnızca kullanan tarafın istemcisinde gösterilir (§4.6 v1).

### 4.9 Ekonomi (testnet varsayılanları)

| Parametre | Değer |
|---|---|
| Karakter fiyatı | 1 NEAR (testnet'te düşük tutulabilir) |
| Bölüşüm | %5 ops / %95 treasury (`ops_bps = 500`) |
| Durability | 10, her `join` −1 |
| Kazanana ödül | 0.1 NEAR sabit |
| Function-call allowance | 0.5 NEAR |

### 4.10 Q-002 açıklaması (README + başvuru)
README'ye "Built for NEAR Hackathon 2026" bölümü: önceki Solana sürümünün varlığı, **NEAR için yeni yazılanlar** (kontrat, access key akışı, NEAR istemcisi, Buckshot tarzı yeni kural seti, Godot köprüsü, yeni sahne/asset'ler) ve **yeniden kullanılanlar** (Next.js iskeleti, landing, kuyruk). Hackathon öncesi son commit'e `pre-near` etiketi konur; jüri `git diff pre-near..` ile NEAR işini görebilir.

---

## 5. Web ve oyun bağlantısı

### 5.1 Next.js değişiklikleri
- `SolanaProvider.tsx` → `NearProvider.tsx` (`@near-wallet-selector/core` + modal + 2–3 cüzdan modülü; testnet).
- `hooks/useRolet.ts` → `hooks/useRoletNear.ts`: view çağrıları (RPC), cüzdan çağrıları (`buy_character`), access-key çağrıları (`@near-js/*` ile `KeyPairSigner` / InMemoryKeyStore).
- `lib/nearKey.ts` (saf): key saklama/yükleme, allowance hatası tespiti, metod listesi. `node:test` ile test.
- `lib/matchQueue.ts`: hesap doğrulama regex'i NEAR hesap kurallarına; `QueueView` → `{status:"waiting"} | {status:"paired", matchId, opponent} | {status:"expired"}`; `markOpened` kaldırılır.
- `lib/queueSignature.ts`: NEP-413 `signMessage` doğrulama (ed25519 + public key'in hesaba ait olduğunu RPC `view_access_key` ile kontrol).
- `app/api/rpc/route.ts`: upstream NEAR testnet RPC; mevcut rate limit mantığı korunur.
- `/profile`: karakter satın alma/gösterme (3 kind), durability.
- `/duel`: durum makinesi: `connect → key → queue → join → reveal → play → result`. Oyun alanı Godot iframe'i; web katmanı üstte ince bir HUD (bağlantı, süre, işlem durumu) gösterir.
- `/leaderboard`: kontrat `leaderboard` view'ı.
- Landing: Solana metinleri NEAR'a; görsel kimlik aynı.
- Solana bağımlılıkları web paketinden kaldırılır (`@solana/*`, `@coral-xyz/anchor`, `@metaplex-foundation/*`, `@magicblock-labs/*`, `@bonfida/*`).

### 5.2 Godot ↔ Next.js köprüsü
- Godot iframe içinde; iletişim `window.postMessage`. Godot tarafında `JavaScriptBridge` ile `message` dinleyicisi (`bridge.gd`, autoload).
- Protokol (JSON, `v:1`):

Web → Godot

| `type` | İçerik |
|---|---|
| `init` | `{you: 0|1, players:[{account, kind}], config}` |
| `snapshot` | `MatchView` (yeniden bağlanma/ilk yükleme; Godot animasyonsuz kurar) |
| `actions` | `Action[]` (seq sıralı; Godot kuyruğa alır ve sırayla oynatır) |
| `tx` | `{intent_id, state: "sent"|"failed", error?}` |
| `private` | `{seq, kind: "loupe"|"ticker", pos, shell}` (yalnız bizim istemci) |
| `clock` | `{deadline_ms, now_ms}` |

Godot → Web

| `type` | İçerik |
|---|---|
| `ready` | sahne yüklendi |
| `intent` | `{intent_id, kind:"fire", target}` veya `{intent_id, kind:"item", slot, steal_slot?}` |
| `anim_idle` | animasyon kuyruğu boşaldı (web, bir sonraki snapshot'ı güvenle gönderebilir) |

- Godot **hiçbir zaman** kural sonucu hesaplamaz; yalnızca `actions` oynatır. `rules.gd` sadece `?mode=practice` (zincirsiz, bot'a karşı) ve geliştirme/mock için kalır.
- Web tarafında `lib/godotBridge.ts` (saf mesaj şeması + doğrulayıcı, testli) ve `components/duel/GodotStage.tsx` (iframe + dinleyici).

### 5.3 Gecikme maskeleme (oynanış hissi için kritik)
- Oyuncu hedefi seçer → Godot hemen A06→A07/A08 oynar ve `intent` yollar → web işlemi gönderir → Godot **A09 `tension_hold`**'da bekler (Buckshot'taki "tetiğe basmadan önceki nefes"in aynısı; doğal olarak 0.7–2 s) → sonuç gelince A10/A11/A12.
- Eşyalar: eşya animasyonunun "hazırlık" yarısı (eşyayı alma) hemen oynar; "sonuç" yarısı (renk görünmesi, tüp yanması) sonuç gelince.
- İşlem başarısızsa: Godot sahneyi geri sarar (tüfeği bırakır / eşyayı yerine koyar), web küçük bir hata gösterir, intent tekrar denenebilir.
- Rakip hamleleri yoklamadan geldiği için ~0.6–1.5 s geç gelir; Godot rakip animasyonlarını tam süreyle oynar, gecikme fark edilmez.

---

## 6. Oyun motoru seçimi

| Seçenek | Artı | Eksi |
|---|---|---|
| **Godot 4.7 (web export, iframe)** | Repoda çalışan 3D sahne, silah pozları, piksel/dither shader, headless test, web export hattı zaten var. AnimationPlayer + Tween + AudioStreamPlayer3D ile Buckshot tarzı koreografi (kamera, flaş, karartma, ses senkronu) çok daha hızlı yazılır. GLB (Meshy) importu doğrudan. Thread'siz export → özel HTTP başlığı gerekmez. | ~39.5 MB wasm (sıkıştırınca ~9–10 MB) → ilk yükleme. iframe köprüsü ek bir katman. Ajanların Godot sahne dosyalarını (`.tscn`) elle düzenlemesi hataya açık → mümkün olduğunca sahneler kodla kurulur (mevcut proje zaten böyle). |
| React Three Fiber (Next.js içinde) | Tek dil/tek bundle, zincir koduyla aynı süreç. Repoda `DuelRoom3D.tsx` var. | Animasyon zaman çizelgesi, ses senkronu, kemik animasyonu, kamera koreografisi için altyapı elle kurulmalı; mevcut R3F sahnesi farklı bir tasarıma (revolver, kart) göre yazılmış, büyük kısmı atılır. |
| 2D (PixelDuelStage) | En hafif, şu an zincire bağlı. | Brief'in istediği birinci şahıs 3D his, namluya bakma, savrulma vb. için yetersiz. |

**Karar: Godot 4.7.** Zincir, cüzdan, kuyruk ve HUD Next.js'te; oyun sahnesi Godot'ta; ikisi §5.2 köprüsüyle konuşur. `PixelDuelStage` Godot yüklenemezse (WebGL yok, düşük cihaz) yedek olarak kalır ama yeni kurallara uyarlanması kapsam dışı (yalnızca "oyun yüklenemedi" mesajı + metin tabanlı minimal kontrol önerilir).

Godot proje yapısı (hedef):
```
godot/
  scenes/  main.tscn (kök, kodla kurulum)  
  scripts/
    bridge.gd        # postMessage <-> sinyaller (autoload)
    director.gd      # Action kuyruğu → animasyon dizileri
    table.gd, gun.gd, rival.gd, panel.gd (can tüpleri), items.gd, shells.gd, camera_rig.gd, sfx.gd
    rules.gd         # Buckshot kuralları, YALNIZ practice/mock
    bot.gd           # practice rakibi
    test_rules.gd, test_director.gd   # headless testler
  assets/models/ (Meshy GLB), assets/audio/, assets/textures/
```

---

## 7. Meshy AI asset listesi

Genel kurallar: GLB çıktı, ≤ 20k üçgen (prop'lar ≤ 8k), PBR dokusu 1024² (piksel/dither shader zaten detayı ezecek, 512² de olur). Her asset için Meshy promptu `docs/near/meshy-prompts.md`'de tutulur (TASKS T-501). Hareketli parçası olan asset'ler Meshy'den tek parça gelir → **Blender'da parçalara ayrılması gerekir** (işaretli: ✂).

### 7.1 Meshy'den gelecekler

| # | Asset | Not | Öncelik |
|---|---|---|---|
| M01 | Pompalı tüfek ✂ | Parçalar: gövde, pompa (kayan), namlu, **namlu ucu** (testere ile kopan), tetik. Pirinç kakma, gravür. | P0 |
| M02 | Masa | Pirinç kenarlı meşe tabla + altındaki dişli kutusu; ortada silah oyuğu | P0 |
| M03 | Sandalye ×1 (iki kez kullanılır) | Yüksek arkalıklı, pirinç perçinli | P1 |
| M04 | Karakter: Kuleci | Belden yukarı yeterli ama tam beden üret (rig için); Meshy auto-rig | P0 |
| M05 | Karakter: Ayarcı | " | P1 |
| M06 | Karakter: Kaçak | " | P1 |
| M07 | Birinci şahıs eller ✂ | Eldivenli iki el + ön kol; rig'li | P0 |
| M08 | Can panosu ✂ | Pirinç pano + 6 tüp yuvası; tüpler ayrı (tüpler prosedürel de olabilir) | P0 |
| M09 | Fişek rafı ✂ | 8 yuvalı pirinç dizgi rafı + kapak | P1 |
| M10 | Alet çantası ✂ | Gövde + kapak (menteşe), kadife iç | P1 |
| M11 | Lup (Loupe) | | P0 |
| M12 | Pipo (Pipe) | + kibrit kutusu (opsiyonel) | P0 |
| M13 | Matara (Flask) | | P0 |
| M14 | Zincir + asma kilit (Shackle) ✂ | Kilit ayrı (kapanma animasyonu) | P0 |
| M15 | Demir testeresi (Hacksaw) | | P0 |
| M16 | Telgraf şerit makinesi (Ticker) | Şerit Godot'ta prosedürel | P1 |
| M17 | Atnalı mıknatıs (Magnet) | | P1 |
| M18 | Maymuncuk seti (Lockpick) | | P1 |
| M19 | Tentür şişesi (Tincture) | | P1 |
| M20 | Dev dişli ×3 varyant | Duvar ve tavan için modüler, dönen | P1 |
| M21 | Sarkaç | Gövde + ağırlık | P2 |
| M22 | Kadran camı çerçevesi | Cam = Godot'ta emissive düzlem, akrep/yelkovan ayrı basit mesh | P1 |
| M23 | Tepe lambası | Sallanan, zincirli | P1 |
| M24 | Çan | Arka planda/tavanda | P2 |
| M25 | Dekor: alet tezgâhı, boru demetleri, kasnaklar | Sahne doldurma | P2 |

### 7.2 Meshy'den **gelmeyecekler** (kodla/prosedürel/elle)
- Fişekler (dolu/boş): basit silindir + taban, Godot'ta prosedürel (çok sayıda kopya, ucuz).
- Kovan, namlu ateşi, duman, kıvılcım, flaş, karartma, vinyet: Godot partikül/shader.
- Telgraf şeridi, can tüplerinin ışığı, kadran ışığı: prosedürel mesh + emissive.
- Oda kabuğu (duvar, zemin, tavan): Godot'ta basit geometri + doku.
- Karakter oyun pozları/animasyonları: Godot'ta kemik anahtarlarıyla (Meshy'nin hazır animasyonları yalnızca `idle` için denenebilir). **[EMİN DEĞİLİM: Meshy rig kalitesi el/parmak için yeterli mi — T-503 spike]**
- Arayüz ikonları, NFT kapak görselleri: karakter modellerinden Godot'ta render alınır (aynı stil).
- Sesler: §3.6.

---

## 8. Yapım sırası

Brief'teki sıra korunur; asset üretimi (insan işi, Meshy) baştan paralel yürür.

| Faz | İçerik | Çıkış kriteri |
|---|---|---|
| **F0 Hazırlık** | `pre-near` etiketi, `near` dalı, Buckshot referans doğrulaması (§2'deki [EMİN DEĞİLİM]'ler), kontrat iskeleti | `cargo near build` boş kontratı derliyor |
| **F1 Kontrat + testler** | Saf kural modülü (env'siz, `ShellSource` trait'i ile testte fişek zorlanabilir), rastgelelik, maç yaşam döngüsü, NFT + durability, treasury/ödül, view'lar, olaylar, sandbox entegrasyon testleri, testnet deploy | `cargo test` + `near-workspaces` testleri yeşil; testnet'te iki hesapla CLI'dan tam maç oynanabiliyor |
| **F2 Access key** | Tarayıcıda key üretimi, AddKey akışı, key ile imzalı çağrılar, allowance hatası; sandbox testi: FC key `buy_character`/admin çağıramaz, deposit ekleyemez | İki tarayıcıda cüzdan onayı **bir kez**, sonra CLI-benzeri test sayfasından join/reveal/fire |
| **F3 UI + oyun bağlantısı** | NearProvider, `useRoletNear`, kuyruk/NEP-413, `/profile`, `/duel` durum makinesi, Godot köprüsü, Godot'ta Action oynatıcı (placeholder grafiklerle), practice modu | İki tarayıcıda baştan sona maç: kuyruk → join → 3 round → ödül cüzdanda |
| **F4 Animasyon + asset + ses** | Meshy asset importu, §3.7 animasyonları, ses, sahne ışığı, yükleme optimizasyonu | Demo videosu çekilebilir kalite |
| **F5 Teslim** | README NEAR bölümü + Q-002 açıklaması, pitch güncellemesi, demo senaryosu, deploy | Başvuru formu dolu |

Kritik yol: F1 → F2 → F3. F4'ün asset kısmı F0'dan itibaren paralel; F3 boyunca Godot placeholder (küp/silindir) asset'lerle çalışır, böylece asset gecikmesi zincir işini bloklamaz.

---

## 9. Riskler

| # | Risk | Etki | Azaltma |
|---|---|---|---|
| R1 | **Gizli bilgi zincirde okunabilir** (Loupe/Ticker sonucu, `fixed`) | Hile yapan istemci avantaj sağlar | Lazy draw ile fişek sırası hiç saklanmaz (asıl gizlilik korunur); eşya sonuçları v1'de UI gizliliği; README'de açık sınır; v2 yolu belgelenir |
| R2 | `env::random_seed()` validator tarafından bilinir; düşük gazla seçici revert (S-01) | Validator-oyuncu veya seçici gaz reroll'u teorik avantaj sağlar | Commit-reveal ile seed karışımı; `predecessor == signer` şartı; `reveal`/`fire`/`use_item` başında `MIN_ACTION_GAS (15 Tgas)` zorunluluğu (dolu 100×64B leaderboard kovma dahil en pahalı dal `5.296 Tgas`, `2.83×` pay; `docs/near/VERSIONS.md`); hackathon ölçeğinde kabul + açıklama |
| R3 | Cüzdanların function-call key davranışı farklı | "Tek onay" demosu bazı cüzdanlarda kırılır | T-201 spike: 2–3 cüzdanda dene; yedek yol olarak açık `AddKey` işlemi; demo'da test edilmiş cüzdan |
| R4 | Zincir gecikmesi his'i bozar | Buckshot'ın temposu kaybolur | §5.3 gerilim beklemesi; kendi hamlende işlem sonucu doğrudan; rakip için 600 ms yoklama |
| R5 | Godot wasm ~39.5 MB | Yavaş ilk yükleme, mobilde çökme | Brotli ön sıkıştırma + `Content-Encoding`; kuyrukta beklerken iframe'i önden yükle; gereksiz modülleri kapatan özel export şablonu (stretch); masaüstü hedefli demo |
| R6 | Meshy çıktısı tek parça / rig zayıf | Animasyon yapılamaz | ✂ işaretli asset'ler Blender'da ayrılır; karakter pozları az sayıda, kemikle elle; en kötü durumda rakip "belden yukarı sabit gövde + ayrı eller" ile canlandırılır |
| R7 | Buckshot kurallarında hafıza hatası | "Birebir" iddiası zayıflar | T-001 referans doğrulama görevi; tüm belirsiz değerler `Config` sabiti, tek yerden değişir |
| R8 | Ajanın `.tscn` elle düzenlemesi | Kırık sahneler | Sahneler kodla kurulur (mevcut desen); her Godot görevi headless test + `--export` ile doğrulanır |
| R9 | Treasury tükenmesi / depolama maliyeti | Ödül ödenemez | `owed` + `claim_reward`; `min_treasury` kapısı; bitmiş maçları budama |
| R10 | Tek süreçli kuyruk | Ölçeklenmez | Hackathon için kabul (mevcut bilinen sınır); Railway tek replika |
| R11 | Özgünlük/telif algısı | Başvuru veya yayın sorunu | §0 kuralları: isim, sanat, ses, UI özgün; yalnızca mekanik ortak |
| R12 | Kapsam şişmesi (9 eşya × animasyon × 3 karakter) | Teslim tarihi kaçar | Öncelik etiketleri: P0 = orijinal 5 eşya + 1 karakter + çekirdek animasyonlar; P1/P2 sonradan. `quick` modu demo yedeği |
| R13 | near-sdk / near-api-js sürüm değişiklikleri | Derleme/istemci hataları | İlk görevde güncel sürümler sabitlenir ve `docs/near/VERSIONS.md`'ye yazılır; ajan resmi dokümana bakar |

---

## 10. Açık sorular (kullanıcı kararı)
1. Maç formatı: best-of-3 (öneri) mi, tek round mu?
2. Ortam: A (saat kulesi, öneri) onayı.
3. Eşya adları: özgün prop adları (öneri) mi, jenerik adlar (büyüteç, sigara, bira…) mı?
4. Ödül ve fiyat testnet değerleri (§4.9).
5. Hangi cüzdan(lar) demo'da kullanılacak?
