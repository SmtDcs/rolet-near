# Rolet NEAR: AUDIT-F2 (kısa kontrol)

- **Kapsam:** `git diff 9a287c3..84fac87` (FIX-F2-1..8, `FIX-F2-REPORT.md`).
- **Yöntem:** Yalnızca okuma. Kod yazılmadı, script ya da test çalıştırılmadı, `near` CLI kullanılmadı. Testlerin yeşil olduğu ve wasm boyutu (346650 bayt) rapordan alındı, ben yeniden doğrulamadım.
- **Sonuç özeti:** Ağır hata yok. 8 maddenin 7'si Tamam, FIX-F2-2 Kısmi. `MIN_ACTION_GAS` payı sınırda (§2). F2 istemcisine geçmeden önce 5 küçük madde öneriyorum (§5).

---

## 1. FIX-F2-N kabul kriterleri

| Madde | Karar | Gerekçe |
|---|---|---|
| F2-1 FC key testi | **Tamam** (not var) | `tests/integration.rs:1331` gerçek ED25519 `FunctionCall` key ekliyor (`:1380-1430`) ve `Account::from_secret_key` ile imzalıyor. (a) `nft_transfer`, `buy_character`, `fund_treasury`, `claim_reward` ve owner metodları reddediliyor (`:1436-1486`). (b) Allowance düşüşü ölçülüp DESIGN §4.3'e yazılmış (`DESIGN.md:284-288`). (c) `NotEnoughAllowance` string olarak doğrulanıyor (`:1697-1701`). **Not:** Ret assertion'ları `r.map(is_failure).unwrap_or(true)` biçiminde ve hata türünü (`MethodNameMismatch`/`DepositWithFunctionCall`) denetlemiyor. Özellikle `claim_reward` çağrısı, key izni yüzünden değil kontratın "borç yok" panik'iyle de başarısız olabilir ve test yine geçer. |
| F2-2 Script + T-119 | **Kısmi** | S1..S6 uygulanmış (§4). T-119 çalıştırılmadı, Samet onayı bekliyor, rapor bunu dürüstçe yazıyor. Kabul kriterindeki "`near --version` **ve near-cli-rs sözdizimi** VERSIONS.md'de doğrulanmış" yalnızca yarı karşılanmış: `VERSIONS.md:7-8,22` sadece sürümü (0.31.1) yazıyor. Komut sözdizimi ve `near ... as-read-only` çıktısının `python3 json.load` ile ayrıştırılabilir olup olmadığı (`cli-match.sh:111,156`) hâlâ denenmemiş. |
| F2-3 `item_bag` + doküman | **Tamam** | `RoundConfig.item_bag`, `check()` kuralı ve `game::item_bag` silinmiş (`config.rs`, `game.rs:398`). `grep "eşyasız\|8 slot\|item_bag"` kod ve güncel dokümanda hit vermiyor. Yalnızca eski denetim raporları ve tarihçe notları kalıyor. DECISIONS #7 "geçersiz" olarak işaretlenmiş. `game.rs` testindeki "fazla düşer" yorumu da düzeltilmiş. |
| F2-4 Durum düzeni | **Tamam** (not var, §3) | DECISIONS #11 "yeni alt hesaba temiz yeniden deploy" kuralını yazıyor. `STATE_VERSION`, `migrate`, `get_state_version` eklenmiş. Kabul kriteri yalnızca DECISIONS'ta kural olmasıydı. |
| F2-5 `ActionsPage` + `deck_*` | **Tamam** | `schema/actions-page.json` eklenmiş, `views.rs` içindeki `actions_page_example_json_deserializes` testi `include_str!` ile dosyayı gerçek tipe çözüyor. `deck_remaining` ve `get_deck_remaining` kaldırılmış, `GameState.deck_counts` tek kaynak. `GameState::deck_remaining()` yalnızca testlerde kalıyor, sorun değil. |
| F2-6 Dolu leaderboard gazı | **Tamam** (not var, §2) | Liste kökten çıkarılmış (`lib.rs:58-67`, `views.rs:130-197`), 100×64B ölçümü yapılmış (`integration.rs:1778`). Ölçüm kapsamı ve payın inceliği için §2'ye bakın. |
| F2-7 `settle_storage` | **Tamam** | `lib.rs` içindeki `fix_f2_7_…` testi 100×64B kayıtta kök borsh boyutunun sabit kaldığını ve ekle/sil sonrası `storage_usage` ile `treasury`'nin birebir geri döndüğünü doğruluyor. Kök sabit olduğu için `settle_storage` (`lib.rs:172`) tüm büyümeyi sayıyor. |
| F2-8 Revealing grace | **Tamam** | `matches.rs:582-585` `saturating_add(TIMEOUT_GRACE_MS)` kullanıyor. Testler sınırı iki yönde sınıyor (`:1374`, `:1384`, `:1424`). `reveal`'da süre kontrolü yok, yani grace içinde ve sonrasında maç `claim_timeout` gelene kadar açılabiliyor. Bu bilinçli bir davranış, F2-8'in amacına uyuyor. |

---

## 2. `MIN_ACTION_GAS` tutarlılığı ve marj

**Tutarlılık.** Depoda "15 Tgas" izi yok: `grep`, `git log -S` ve dokümanlarda hiç hit yok. 15 → 10 hikâyesi yalnızca oturum logunda, repoda belge yok. Güncel değer 10 Tgas ve şu yerlerde aynı:
- `matches.rs:27`
- `DESIGN.md:284`
- `VERSIONS.md:74`
- `FIX-F2-REPORT.md`

**Eski rakam kalmış (düşük).** `DESIGN.md:382` ve `:586` hâlâ "en pahalı dal 4.423 Tgas, >2×" diyor. `VERSIONS.md:74` ise 4.964 Tgas ve 2.01× diyor. DESIGN'daki iki yer güncellenmeli.

**Marj yetersiz, kanıtı zayıf (Orta).** Ölçülen pay yalnızca 2.01× (`4.964 × 2 = 9.927 ≤ 10`). Pay, ≥2× kriterinin 73 Mgas üstünde. Nedenleri:

1. **En kötü yol ölçülmedi.** `integration.rs:1778` içinde maçı bitiren p098/p099 zaten liderlik tablosunda (join'de eklenmişlerdi, `matches.rs:232`). Yani `update_leaderboard_batch` yalnızca "mevcut üyeyi yerinde güncelle" dalını koşuyor. Tablo doluyken tabloya girmemiş bir kazananın kuyruğu **kovma** dalı (`views.rs:158-182`: `top_slot_of.remove`, iki ekleme, 64B anahtarlar, ek okumalar) hiç ölçülmedi. Hesap adları sıralamada hep `last`'ten büyük olduğu için `join_full` ölçümünde bile kovma tetiklenmedi. Bu dal kabaca birkaç yüz Mgas ekler. Tahminim ~5.3-5.6 Tgas, yani pay ~1.8-1.9×, ama bu ölçülmedi.
2. **Maç şekli rastgele.** Ölçülen maç sandbox `random_seed` ile oynanıyor. Log doluluğu ve eşya sayısı her koşuda değişir. AUDIT-F1'in tarif ettiği "dolu log + 8 eşya + transfer" en kötü durumu, dolu leaderboard ile birleşik olarak ölçülmedi.
3. **Test kırılgan.** `assert!(worst * 2 <= MIN_ACTION_GAS)` (`integration.rs:~1985`) eşiği 5.0 Tgas ve ölçüm 4.964. Rastgele bir koşuda ya da gaz parametresi değişiminde (protokol güncellemesi) test başarısız olabilir.
4. **Test yanlış kümeyi de kapsıyor.** `join` gazı `MIN_ACTION_GAS` ile kapılı değil (`join` bu eşiği aramıyor), ama `worst` hesabına dahil. Bu, testi gereksiz sıkılaştırıyor.

**Öneri:** `MIN_ACTION_GAS`'ı 15 Tgas yapın (en kötü ölçülen ~5-5.6 için ≥2.7×). Kötü yan etki yok: ölçümlere göre kullanılmayan gaz allowance'a geri dönüyor, istemci zaten gerekeni kadar ön ödeme yapabilir. Alt sınır yükselirse reroll koruması yalnızca güçlenir. Alternatif: kovma dalını ölçüp 10 Tgas'ı kanıtlamak. Ben ilkini öneririm (FIX-F2B-1).

**Leaderboard yan notları (Düşük):**
- Eşit skorlu kuyruk için karşılaştırma `cmp_score` içinde slot'a bakıyor, görünüm (`cmp_leaderboard`) ise hesap adına bakıyor (`views.rs:98-102` ve `:158-168`). Erken dönemde çok sayıda 0-0 oyuncu varken kovulan kayıt "görünümdeki son" olmayabilir, yani üyelik rastgele hesap adı sırasına uymaz. Tablo geçerli kalır, yalnızca eşitlikte davranış eskisinden farklı.
- `leaderboard()` (`views.rs:263-284`) `limit=1` için bile 100 `top_slots` okuması yapıyor. DESIGN'daki "O(1) okuma" ifadesi artık doğru değil. Görünüm olduğu için gaz sorunu yok.

---

## 3. `migrate` iskeleti

**Güvenlik:** `#[init(ignore_state)] #[private]` doğru ve güvenli. `#[private]` `predecessor == current_account_id` şartını arıyor. Sandbox testi (`integration.rs:1727`) yabancı hesabın reddedildiğini, kontratın kendi hesabının çağırabildiğini ve treasury'nin korunduğunu doğruluyor. Aynı sürümde `migrate` kendi state'ini aynen döndürüyor, zararsız. `new` ve `migrate` ayrı, `PanicOnDefault` korunuyor.

**`state_version` doğru mu: kısmen.**
- `STATE_VERSION = 1`, `new` bunu yazıyor, `get_state_version` view var (`lib.rs:22,113,134`). Alan değeri olarak doğru.
- **Tasarım sınırı (Orta, F2 için engel değil):** Sürüm alanı `Contract`'ın **sonunda** ve aynı borsh yapısının içinde. Gelecekte düzen değişirse `env::state_read::<Contract>()` eski baytlarda sürüm alanına ulaşamadan **borsh hatasıyla çöker**; `if state.state_version == STATE_VERSION` dalı eski düzende hiç çalışmaz. Yani iskelet yalnızca "aynı düzen, sürüm sayısı güncelleme" durumunu taşıyabilir. Gerçek göç için ya eski yapıyı (`ContractV1`) tutup `state_read::<ContractV1>()` ile okumak ya da sürümü ayrı bir depolama anahtarına yazmak gerekir.
- DECISIONS #11 zaten "göç yazılmadıkça üzerine deploy yok, yeni alt hesaba temiz deploy" diyor, yani riskin farkında ve dürüst. Bunu `migrate` doc yorumuna da yazmak yeterli (FIX-F2B-4).
- Birim test `migrate_preserves_state…` yalnızca sürümü 0'a çekip aynı düzeni okuyor. Gerçek eski düzen testi yok, bu da yukarıdaki sınırı gizliyor.

**Diğer:** DECISIONS #12 `base_uri` (`nft.rs:213`, `"https://rolet.app"`) Samet teyidi bekliyor. Teyit gelmeden NFT metadata'sı deploy edilirse kalıcı olabilir. Düzenlenebilir mi, kontrol edilmeli.

---

## 4. Scriptler

### 4.1 Mainnet engeli: **gerçekten engelliyor**
- Her iki scriptte `NEAR_NETWORK != testnet` ise çıkış (`deploy-testnet.sh:46-49`, `cli-match.sh:42-45`).
- Tüm hesap girdileri `^[a-z0-9._-]+\.testnet$` ile doğrulanıyor: `ROLET_CONTRACT_ID`, `ROLET_OWNER_ID` (deploy), `PLAYER_A/B` (cli-match). `.testnet` soneki mainnet'te kayıtlanamayacağı için `.near` hesabıyla işlem yapılamıyor.
- `eval` kalkmış, komutlar `"$@"` ile çalışıyor ve `%q` ile yazdırılıyor (S2 kapalı). `FUND_AMOUNT` ve `MATCH_ID` sayısal doğrulanıyor.
- `:?` kontrolleri varsayılan atamadan önce ve gerçek çalıştırmada (S3 kapalı).
- `.env.local` `.gitignore` içinde (`.gitignore:5-6`), takipli `.env.example` değişmiyor (S5 kapalı).
- Kalan teorik açıklar (düşük): (a) `near` CLI `network-config testnet` adını kullanıcının kendi `config.toml` dosyasından çözer. Orada "testnet" başka bir RPC'ye çevrilmişse script bunu göremez. (b) Regex `-` ile başlayan değere izin veriyor, CLI'ya seçenek gibi gidebilir. İkisi de kendi ortamınızda yanlış yapılandırma gerektiriyor.

### 4.2 Anahtar sızıntısı: **özel anahtar riski yok**, sır notu var
- Tüm imzalar `sign-with-keychain`. Scriptte özel anahtar, seed, `.env` okuma ya da yazma yok. `.env.local` yalnızca kontrat adresini alıyor.
- `cli-match.sh` taahhüt sırrı artık `os.urandom(32)` (S4 kapalı). Ama `run_or_print` `reveal` komutunu **sırrı içeren JSON ile** terminale yazıyor ve sır komut satırında olduğu için `ps`'te görünüyor (`cli-match.sh:81-92,133-141`). Sır `reveal` ile zaten zincire açıldığı için bu testnet duman testinde zararsız. Script F2 istemcisine şablon olursa, sırrın argv'ye ve log'a girmediği bir akış (stdin veya dosya) gerekir. Dry-run çıktısı da gerçek rastgele sırlar basıyor, o çıktıyı paylaşmayın.
- Sır yalnızca bellekte. Script `join` ile `reveal` arasında kesilirse sır kaybolur, maç `claim_timeout`/`cancel` ile çözülmek zorunda kalır. Düşük.

### 4.3 Doğrulanmamış kalanlar
- near-cli-rs sözdizimi ve view çıktısının ayrıştırılması gerçek ağda denenmedi (T-119 bekliyor). Yazılı sözdizimi benim bildiğim 0.31 sırasıyla uyumlu görünüyor, ama doğrulanmış değil.
- `INIT_CONFIG_JSON` (`deploy-testnet.sh:74-97`) hâlâ elle kopya. `Config::default()` ile bire bir eşit olduğunu kontrol eden bir test yok. Şu an alanlar `config.rs`'teki `Config` ile eşleşiyor (`item_bag` çıkarılmış), ama bir sonraki `Config` değişikliğinde sessizce sapar. (S6'nın yarım kalan kısmı, FIX-F2B-3.)

---

## 5. F2 istemci/web tarafından önce kalan engeller

Kontrat tarafında **bloklayıcı engel yok**: FC key gerçek sandbox'ta denendi, kapalı metodlar reddediliyor, allowance düşüşü ölçüldü. Aşağıdakiler kod değil, F2'ye girmeden kapatılması ucuz olan küçük işler. Zorunluluk sırasıyla:

1. **FIX-F2B-1 · `MIN_ACTION_GAS` payı (Orta).** Değeri 15 Tgas yapın (ya da kovma dalını ölçüp 10'u kanıtlayın). Testte (`integration.rs:1778`) tabloya girmemiş iki oyuncunun oynadığı maçı ve kovma dalını ekleyin. `worst*2 <= MIN` assert'inden `join` gazını çıkarın. `DESIGN.md:382,586` ve `VERSIONS.md:74` rakamlarını aynı yere çekin. Kabul: kovma dalı dahil en kötü ölçüm ≥2× paylı, tek yerde tutarlı.
2. **FIX-F2B-2 · T-119 + near-cli-rs sözdizimi.** Samet onayıyla testnet'te çalıştırın. Sonuçlar: tx hash'leri `E2E.md`'ye, doğrulanmış komut sözdizimi ve `as-read-only` çıktı biçimi `VERSIONS.md`'ye. Bu aynı zamanda gerçek testnet gaz fiyatında allowance sayısını (DESIGN `:287` "~125 maç") ve sandbox ile tutarlılığı doğrular: sandbox'ta 30 Tgas ön ödeme için anlık rezervasyon ~0.0309 NEAR, kesinleşmiş net düşüş ise ~3 Tgas'lık çağrı için 0.0003 NEAR, birim fiyat olarak yaklaşık 10× fark var ve açıklanmamış. İstemci ön ödemeyi `MIN_ACTION_GAS`'a yakın tutmalı (30 değil), yoksa 0.5 NEAR allowance ile eşzamanlı çağrı sayısı gereksiz kısıtlanır.
3. **FIX-F2B-3 · Script yapılandırma kayması + FC testinde ret türü.** Deploy script'indeki JSON'un `Config::default()` ile eşitliğini bir testle sabitleyin (JSON'u dosyaya çıkarıp hem script hem test okusun). `fix_f2_1…` ret assertion'larında hata türünü denetleyin (`MethodNameMismatch`, `DepositWithFunctionCall`), böylece `claim_reward` ve owner metodlarının reddi "key izni" yüzünden olduğu kanıtlansın, kontrat panik'iyle yanlış geçmesin.
4. **FIX-F2B-4 · `migrate` yorumu ve `base_uri`.** `migrate` doc yorumuna "eski borsh düzeni `state_read`'de çöker, gerçek göç için `ContractV1` gerekir" yazın. `base_uri` için Samet teyidini alın ya da deploy öncesi değişebilir olduğunu doğrulayın.
5. **FIX-F2B-5 · İstemci sözleşmesi notları (kod değil, dokümantasyon).** (a) `claim_reward` FC key ile çağrılamaz, UI cüzdana yönlendirmeli. (b) `ItemResult::Private` log'a ve olay çıktısına yazılıyor (AUDIT-F2PRE §4.3), istemci rakibin `Private` aksiyonlarını göstermemeli. (c) `get_actions` boşluğunda (`first_seq`) `get_match` ile snapshot alınmalı. (d) Reveal sırları argv/log'a girmemeli (§4.2).

AUDIT-F2 DONE
