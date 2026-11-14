# Rolet NEAR — Görev Listesi

> Kaynak: `docs/near/DESIGN.md` (her görevde ilgili bölüm `§` ile verilir). Bu dosya, kodlamayı yapacak ajana tek tek verilecek küçük görevlerdir.

## Ajan için genel kurallar
- Her görev **tek başına** verilebilir; başlamadan önce `DESIGN.md`'nin işaret edilen bölümünü oku.
- `apps/server/` (Solana programı) ve `packages/shared/` **değiştirilmez**.
- Sürümler: near-sdk-rs, near-contract-standards, near-workspaces, @near-wallet-selector/*, @near-js/* için güncel kararlı sürümü kullan; T-002'de sabitlenen `docs/near/VERSIONS.md`'ye uy. API'yi hafızadan değil resmi dokümandan doğrula. Next.js için `apps/web/AGENTS.md` uyarısına uy (`node_modules/next/dist/docs/`).
- Godot sahneleri **kodla kurulur**; `.tscn` dosyalarını elle büyük ölçüde düzenleme (DESIGN §6, R8).
- Her görevin "Bitti sayılır" maddeleri komut çıktısıyla doğrulanmadan görev bitmiş sayılmaz.
- Belirsiz oyun değerleri (can, eşya sayısı, oranlar) kodda **tek bir `Config`/sabit** yerinde durur.
- Görev başına bir commit, mesajda görev ID'si (`T-104: ...`).
- Etiketler: **P0** = demo için şart, **P1** = olmalı, **P2** = vakit kalırsa. `👤` = insan görevi (ajan yapamaz/yapmamalı).

Bağımlılık gösterimi: `← T-xxx` = önce o bitmeli.

---

## F0 — Hazırlık

### T-000 · `pre-near` etiketi ve `near` dalı · P0 · 👤 onay gerekli
- `main` üzerindeki son hackathon-öncesi commit'e `pre-near` etiketi koy, `near` dalını aç. Etiketi push etmek kullanıcı onayı ister.
- Bitti: `git tag --list pre-near` ve `git branch --show-current` = `near`.

### T-001 · Buckshot referans doğrulaması · P0 · 👤
- DESIGN §2'deki tüm **[EMİN DEĞİLİM]** maddelerini oynayarak/izleyerek doğrula: round canları, yükleme başına eşya, fişek dağılımı, kelepçe tekrar kuralı, testere+bira etkileşimi, telefonun mevcut fişeği hariç tutması, ilaç oranı, R3 iyileşme eşiği, adrenalin süresi.
- Sonuçları `docs/near/REFERENCE-CHECK.md`'ye tablo olarak yaz; DESIGN §3.1/§3.2 değerlerini gerekirse güncelle.
- Bitti: tablo dolu, her satırda "doğrulandı / farklı: X".

### T-002 · Sürüm sabitleme · P0
- `cargo near --version`, `near --version`, `godot --version`, `rustc --version` çıktısını ve seçilen crate/npm paket sürümlerini `docs/near/VERSIONS.md`'ye yaz.
- Bitti: dosya var, her satırda sürüm + resmi doküman linki.

### T-003 · Kontrat iskeleti · P0 · ← T-002
- `contracts/rolet-near/` altında `cargo near new` benzeri iskelet (Cargo.toml, `src/lib.rs`). Modül dosyaları boş olarak: `game.rs`, `rng.rs`, `matches.rs`, `nft.rs`, `treasury.rs`, `views.rs`, `events.rs`, `config.rs`.
- Kök `.gitignore`'a `contracts/rolet-near/target/`.
- Bitti: `cd contracts/rolet-near && cargo near build` başarılı; `cargo test` (boş) yeşil.

---

## F1 — Kontrat ve testler (DESIGN §3.1, §3.2, §4)

> F1 boyunca `game.rs` **saf** kalır: `near_sdk::env` kullanmaz. Fişek türü bir `ShellSource` trait'inden gelir; testlerde zorlanmış kaynak, kontratta lazy-draw kaynağı kullanılır.

### T-101 · Tipler ve Config · P0 · ← T-003
- `config.rs`: `Config` (round tablosu: can, yükleme başına eşya, iyileşme eşiği; hamle süresi ms; reveal süresi ms; ödül; fiyat; `ops_bps`; durability; allowance önerisi; `tincture_good_pct`; `max_items = 8`).
- `game.rs`: `Shell { Live, Blank }`, `Item` (9 varyant, DESIGN §3.4 kod adlarıyla), `Target { SelfTarget, Opponent }`, `Load`, `GameState` (Match'in oyun kısmı: round, score, hp, max_hp, heal_cut, items, load, turn, shackled, shackle_broke_this_turn, saw_active), `Action` enum (DESIGN §4.8), `GameError`.
- Tüm tipler `serde` + `borsh` türetir.
- Bitti: derleniyor; `Config::default()` DESIGN tablosuyla aynı değerleri içeriyor (birim test).

### T-102 · ShellSource ve lazy draw · P0 · ← T-101
- `trait ShellSource { fn draw(&mut self, live_unfixed: u8, blank_unfixed: u8) -> Shell; fn roll(&mut self, n: u32) -> u32; }`
- `Load` üzerinde: `current() / peek_at(pos) / fix(pos, src)` — konum çekilmemişse kaynaktan çekip `fixed`'e yazar ve `live_unfixed/blank_unfixed`'i günceller.
- `ScriptedSource` (testler için, sırayla verilen fişekleri döner).
- Testler: (a) tüm konumlar çekildiğinde dolu sayısı = başlangıç dolu sayısı; (b) önce ileri konum (`peek_at(3)`) sonra 0..2 çekilince sayılar tutarlı; (c) `remaining == 0` iken çekme hata.
- Bitti: `cargo test game::` yeşil.

### T-103 · Yükleme ve eşya dağıtımı · P0 · ← T-102
- `new_load(round, src)`: DESIGN §4.6 algoritması (total 2–8, R1'de ≤4, dolu ∈ [1, total−1]).
- `deal_items(state, src)`: EK2 ortak deste (R1 dahil tüm round'larda 9 tür × 4 = 36 kartlık ortak desteden iadesiz dağıtım, biterse yenilenir); 4 slot (`Config.max_items`) sınırı.
- Testler: 10 000 rastgele tohumla sınırlar asla aşılmıyor (deterministik test RNG'si); slot dolu iken fazlası düşüyor.
- Bitti: testler yeşil.

### T-104 · Ateş etme ve sıra mantığı · P0 · ← T-103
- `fire(state, actor, target, src) -> Result<Vec<Action>>`: DESIGN §3.2 kural 1–7: hasar, testere 2x ve sıfırlanma, boşla kendine sıranın kalması, kelepçeli sıranın atlanması ve kırılması, can 0 → round sonu, fişek bitti → yeni yükleme + dağıtım, R3 iyileşme eşiği (`heal_cut`), 2 round kazanan → maç sonu.
- Her durum geçişi `Action` üretir.
- Testler (`ScriptedSource` ile), en az: kendine boş → sıra kalır; kendine dolu → sıra geçer; rakibe boş → sıra geçer; testereli dolu → 2 hasar, sonra testere kapalı; testereli boş → testere kapalı; kelepçeli rakip → sıra atlanır, sonra kelepçe kırık; son fişek → yeni yükleme; can 0 → round sonu + kaybeden başlar; 2. round galibiyeti → maç sonu; sırası olmayan oyuncu → hata.
- Bitti: testler yeşil.

### T-105 · Eşyalar: orijinal beşli · P0 · ← T-104
- `use_item(state, actor, slot, steal_slot, src)` için `Loupe, Pipe, Flask, Shackle, Hacksaw`.
- Kurallar: Pipe max canı aşmaz ve `heal_cut` iken reddedilir; Flask fişeği atar, herkese açık `Action::Ejected`, son fişekse yeni yükleme; Shackle rakip kelepçeliyse veya `shackle_broke_this_turn` ise reddedilir; Hacksaw aktifken tekrar reddedilir. Reddedilen kullanımda eşya tüketilmez.
- `Loupe` sonucu `Action::ItemUsed{ result: Private(Shell) }` olarak işaretlenir.
- Bitti: her eşya için başarılı + reddedilen yol testleri yeşil.

### T-106 · Eşyalar: ek dörtlü · P1 · ← T-105
- `Ticker` (gelecekteki rastgele bir konum, mevcut hariç; tek fişek kaldıysa bilgi yok), `Magnet` (mevcut fişeği çek ve çevir; `live_left/blank_left` güncellenir, `announced_*` değişmez), `Lockpick` (rakibin `steal_slot`'undaki eşyayı al ve hemen uygula; Lockpick çalınamaz; uygulanamazsa hiçbir şey tüketilmez), `Tincture` (`roll(100) < tincture_good_pct` → +2, değilse −1; 0'a düşerse round sonu; `heal_cut` iken iyileşme yolu yok ama −1 yolu var mı → T-001 sonucuna göre, varsayılan: tamamen reddet).
- Bitti: testler yeşil.

### T-107 · Rastgelelik modülü · P0 · ← T-102
- `rng.rs`: `ChainSource { seed: [u8;32], nonce: &mut u64 }` → her çekişte `sha256(seed ‖ nonce ‖ env::random_seed())`, nonce++. `commitment(secret, account, match_id) = sha256(secret ‖ account_bytes ‖ match_id_le)`.
- near-sdk unit test (VMContextBuilder ile `random_seed` değiştirerek): farklı tohum → farklı sonuç; aynı tohum+nonce → aynı.
- Bitti: testler yeşil.

### T-108 · Kontrat state + init + admin · P0 · ← T-101
- `Contract` (DESIGN §4.5), `#[init] new(owner, config)`, `set_config`, `pause/unpause`, `fund_treasury` (payable), `withdraw_ops`. Owner kontrolü.
- Bitti: unit testler: owner olmayan reddedilir; fund_treasury treasury'yi artırır.

### T-109 · NFT: NEP-171/177/181 + satın alma · P0 · ← T-108
- `near-contract-standards` NonFungibleToken entegrasyonu; `buy_character(kind)` payable: tam fiyat, `ops_bps` bölüşümü, mint, `CharacterState { kind, durability: config.durability, locked_in: None }`. Fazla ödeme iade.
- Metadata: `media` = karakter görseli URL'si, `extra` = `{"kind":..., "durability":...}`.
- Kilitli token'ın `nft_transfer`'i reddedilir (transfer hook / override).
- Bitti: unit testler: eksik ödeme reddi, bölüşüm doğru, kilitli transfer reddi.

### T-110 · join / cancel · P0 · ← T-109, T-107
- `join(match_id, opponent, commit, token_id)` ve `cancel(match_id)` (DESIGN §4.4). `predecessor == signer` şartı. Durability −1, token kilidi, oyuncunun `active_match`'i.
- Testler: tek join → Pending; karşılıklı join → Revealing; üçüncü hesap join → red; opponent uyuşmazlığı → red; durability 0 → red; başkasının token'ı → red; aynı oyuncu iki maç → red; cancel → iade + kilit açılır; Revealing'de cancel → red.
- Bitti: testler yeşil.

### T-111 · reveal ve maç başlangıcı · P0 · ← T-110
- `reveal(match_id, secret)`: commit kontrolü; ikinci reveal → `match_seed`, ilk sıra, R1 yüklemesi + 4+4 eşya dağıtımı (EK2), `deadline_ms`, status Active, `Action::LoadStarted` + `Action::ItemsDealt`.
- Testler: yanlış secret reddi; tekrar reveal reddi; iki reveal → Active, hp = R1 canı.
- Bitti: testler yeşil.

### T-112 · fire / use_item kontrat metodları · P0 · ← T-111, T-104, T-105
- `game.rs` fonksiyonlarını `ChainSource` ile saran public metodlar; aksiyonları `log`'a (`seq`) ekle (son 32), NEP-297 olay logu yaz (T-114), `deadline_ms`'i yenile.
- Maç bitince: oyuncuların `active_match` temizlenir, token kilitleri açılır, istatistikler güncellenir, ödül `Promise::new(winner).transfer(reward)`; treasury yetersizse `owed`.
- Bitti: unit test: senaryolu (ScriptedSource enjekte edilebilen test-only yol) tam maç → kazanan bakiyesi arttı, kilitler açık.

### T-113 · claim_timeout + claim_reward · P0 · ← T-112
- DESIGN §4.4 iki aşamalı timeout; `claim_reward()` owed ödemesi.
- Testler: süre dolmadan red; reveal aşaması timeout → doğru taraf iade alır; Active timeout → çağıran kazanır ve ödül alır; sırası olan oyuncu kendine timeout açamaz.
- Bitti: testler yeşil.

### T-114 · Olaylar · P0 · ← T-101
- `events.rs`: `EVENT_JSON:` + `{"standard":"rolet","version":"1.0.0","event":..., "data":[...]}` üretici; her `Action` varyantı için.
- Bitti: unit test logları `get_logs()` ile doğruluyor.

### T-115 · View metodları · P0 · ← T-112
- `get_match`, `get_actions(match_id, since_seq)`, `get_player`, `get_character`, `get_config`, `get_treasury`, `leaderboard(from, limit)` (wins'e göre; basit: oyuncu listesi `UnorderedMap`/`IterableMap` + sıralama limitli).
- `MatchView` JSON şeması `docs/near/schema/match-view.json`'a örnek olarak yazılır (web ve Godot buna göre kodlanır).
- Bitti: unit testler + örnek JSON dosyası.

### T-116 · Depolama ve budama · P1 · ← T-112
- Bitmiş maçta `log` ve `fixed` temizlenir, özet kalır; `min_treasury` altında `join` reddi; storage kullanımı `env::storage_usage()` farkıyla ölçülüp DESIGN §4.7'ye not edilir.
- Bitti: test: maç sonu storage < maç ortası storage.

### T-117 · Sandbox entegrasyon testleri · P0 · ← T-113, T-115
- `contracts/rolet-near/tests/` altında `near-workspaces`: deploy, 2 oyuncu hesabı, `buy_character` ×2, join ×2, reveal ×2, rastgele ama geçerli hamlelerle maçı bitir (döngü: sıra kimdeyse `fire(Opponent)`), kazanan bakiyesi +ödül, durability 9.
- Bitti: `cargo test --test integration` yeşil (sandbox indirmesi gerekiyorsa çıktıda göster).

### T-118 · Testnet deploy betiği · P0 · ← T-117
- `contracts/rolet-near/scripts/deploy-testnet.sh`: build, hesap (varsa) kullan, deploy, `new`, `fund_treasury`. Hesap adı ve owner ortam değişkeninden. Kontrat adresini `apps/web/.env.example`'a `NEXT_PUBLIC_ROLET_CONTRACT` olarak ekle.
- 👤 Gerçek deploy ve fonlama kullanıcı onayıyla.
- Bitti: betik `--dry-run` ile komutları basıyor; 👤 deploy sonrası `near view <c> get_config` çıktısı.

### T-119 · CLI ile tam maç (duman testi) · P0 · ← T-118
- `scripts/cli-match.sh`: iki testnet hesabıyla `near call` zinciri, maçı bitirene kadar `get_match` okuyup sıradaki oyuncuyla `fire`.
- Bitti: betik çıktısında `MatchEnded` olayı ve ödül transferi.

---

## F2 — Function-call access key (DESIGN §4.2, §4.3)

### T-201 · Cüzdan spike · P0 · ← T-118 · `yerel kısım tamam, 👤 testnet doğrulaması bekliyor`
- Küçük bir test sayfası (`apps/web/app/dev/near-key/page.tsx`, yalnız dev): Wallet Selector ile MyNearWallet, Meteor ve (varsa) HOT'ta `signIn({contractId, methodNames})` dene; hangi cüzdan key'i dApp'e veriyor, hangisi vermiyor; açık `AddKey` işleminin çalıştığı cüzdanlar.
- Sonuçları `docs/near/WALLETS.md`'ye yaz; demo cüzdanını öner.
- Bitti: tablo dolu; en az bir cüzdanda key ile `join` çağrısı başarılı (tx hash).
- Durum (`F2-8`): `/dev/near-key`, `NearKeyLab.tsx` (MNW + Meteor) ve `docs/near/WALLETS.md` şablonu hazır (`dev` → 200, `prod` → 404). Gerçek cüzdan ve testnet tx doğrulaması 👤 Samet'e kaldı.

### T-202 · `lib/nearKey.ts` (saf) · P0 · ← T-201 · `✅ Bitti`
- Key çifti üretme, `localStorage` anahtarı `rolet:fck:<account>:<contract>`, yükle/sil, metod listesi sabiti (kontratla aynı), `isAllowanceError(err)`, `isAccessKeyMissing(err)`.
- `lib/nearKey.test.ts` (`node:test`).
- Bitti: `tsx --test lib/nearKey.test.ts` yeşil (`F2-2`, gerçek sandbox fixture'ları `F2-6`'da doğrulandı).

### T-203 · Key ekleme akışı · P0 · ← T-202 · `yerel kısım tamam, 👤 testnet doğrulaması bekliyor`
- T-201'de seçilen yol + yedek yol (açık `AddKey`). Key yoksa / allowance bittiyse tek onay iste; varsa sessizce kullan.
- Bitti: dev sayfasında: ilk ziyarette 1 onay, sayfa yenileyince 0 onay, `join` çalışıyor.
- Durum (`F2-6`, `F2-7`, `F2-8`): `lib/nearKeyFlow.ts` (`decideKeyAction`, `checkKeyOnChain`, `signOutKey`) birim testleri ve yerel sandbox `AddKey` / silme akışı yeşil; gerçek cüzdanla 1 onay → 0 onay doğrulaması 👤 Samet'e kaldı.

### T-204 · Key ile imzalı çağrı katmanı · P0 · ← T-203 · `yerel kısım tamam, 👤 testnet doğrulaması bekliyor`
- `sendGameCall(method, args)`: FC key ile imzala, RPC'ye gönder, outcome'tan dönüş değeri + logları (`EVENT_JSON`) ayrıştır, nonce çakışmasında yeniden dene, 429'da `chainPace` benzeri geri çekilme.
- Bitti: dev sayfasında `fire` sonucu ayrıştırılmış `Action[]` olarak görünüyor.
- Durum (`F2-4`, `F2-5`, `F2-6`, `F2-8`): `lib/nearOutcome.ts` ve `lib/nearCall.ts` birim testleri + yerel `near-sandbox` tam maç E2E testi (`fire` → `Action[]` + `MatchEnded`) yeşil; testnet'te iki hesapla canlı `fire` ve allowance ölçümü 👤 Samet'e kaldı.

### T-205 · Güvenlik testi: FC key sınırları · P0 · ← T-117 · `✅ FIX-F2-1 (1610c5a, cbc5d23) ile karşılandı`
- `near-workspaces` testi: FC key ile `buy_character` (deposit) → başarısız; `set_config` → izinli metod değil, başarısız; izinli `join` → başarılı.
- Bitti: test yeşil (`contracts/rolet-near/tests/integration.rs` `fix_f2_1_function_call_access_key_flow` + `apps/web/sandbox/near-e2e.test.ts` içinde `claim_reward` ve 1 yoctoNEAR allowance doğrulaması).

---

## F3 — UI ve oyun bağlantısı (DESIGN §5, §6)

### Web

### T-301 · NearProvider · P0 · ← T-201
- `components/NearProvider.tsx` (Wallet Selector + modal, testnet, T-201 cüzdanları); `app/layout.tsx`'te `SolanaProvider` yerine. `Nav.tsx` bağlan/çık butonu NEAR hesabını gösterir.
- Bitti: `pnpm build` başarılı; tarayıcıda bağlan/çık çalışıyor.

### T-302 · `hooks/useRoletNear.ts` · P0 · ← T-204, T-115
- View'lar (`getMatch`, `getActions`, `getPlayer`, `getConfig`, `getTreasury`, `leaderboard`), cüzdan çağrısı (`buyCharacter`), oyun çağrıları (`join`, `reveal`, `cancel`, `fire`, `useItem`, `claimTimeout`) T-204 üzerinden. Commit/secret üretimi + `sessionStorage`'da saklama (`lib/nearCommit.ts`, testli).
- Bitti: tip kontrolü geçiyor; `lib/nearCommit.test.ts` yeşil (commit, kontrattaki `commitment` ile aynı baytları üretiyor — kontrat testinden alınmış sabit vektörle).

### T-303 · RPC proxy NEAR'a · P0
- `app/api/rpc/route.ts` upstream'i `NEAR_RPC_URL` (varsayılan testnet) yap; rate limit korunur.
- Bitti: proxy üzerinden `view_account` başarılı.

### T-304 · Kuyruk: simetrik eşleşme · P0
- `lib/matchQueue.ts`: NEAR hesap doğrulaması (2–64 karakter, `[a-z0-9_-.]` kuralları ve implicit 64-hex); `QueueView` → `waiting | paired{matchId, opponent} | expired`; `markOpened` ve host/guest kaldırılır. `matchQueue.test.ts` güncellenir.
- Bitti: `tsx --test lib/matchQueue.test.ts` yeşil.

### T-305 · Kuyruk imzası: NEP-413 · P0 · ← T-304
- `lib/queueSignature.ts`: NEP-413 payload doğrulaması (ed25519), public key'in hesaba ait olduğunu RPC `view_access_key` ile kontrol (route içinde, test için enjekte edilebilir fonksiyon). İstemcide `wallet.signMessage`.
- Bitti: birim test (sabit vektörlü imza) yeşil; route manuel test.

### T-306 · `/profile`: karakter satın alma · P0 · ← T-302
- 3 kind kartı (görsel placeholder), fiyat (`get_config`), `buyCharacter`, sahip olunan token'lar ve durability.
- Bitti: testnet'te satın alma + listeleme çalışıyor.

### T-307 · `/duel` durum makinesi · P0 · ← T-302, T-305
- `lib/duelFlow.ts` (saf reducer, testli): `connect → key → character → queue → join → reveal → play → result`, hata ve yeniden bağlanma (URL `?match=`) dalları. Sayfa bileşeni bu reducer'ı kullanır; eski host/guest bileşenleri (`HostWaiting`, `GuestLobby`) kaldırılır.
- Reveal otomatik (kullanıcı hiçbir şeye basmaz).
- Bitti: `tsx --test lib/duelFlow.test.ts` yeşil; iki tarayıcıda join+reveal → Active.

### T-308 · Rakip senkronu (yoklama) · P0 · ← T-307
- `get_actions(since_seq)` ~600 ms; başarısızlıkta geri çekilme; sekme gizliyken yavaşlat; yeni aksiyonları köprüye ilet.
- Bitti: bir tarayıcıda `fire` → diğerinde ≤ 2 s içinde aksiyon görünüyor (konsol/HUD).

### T-309 · Zaman aşımı UI · P0 · ← T-308
- HUD'da kalan süre; rakip süresi dolunca "Süre doldu — kazan" butonu (`claim_timeout`).
- Bitti: manuel test (rakip sekmesini kapat, 45 s bekle).

### T-310 · `/leaderboard` · P1 · ← T-302
- Kontrat `leaderboard` view'ı ile tablo.
- Bitti: sayfa testnet verisini gösteriyor.

### T-311 · Landing ve metinler NEAR'a · P1
- `components/landing/*`, `app/page.tsx`: Solana/SOL/devnet → NEAR/testnet; revolver/kart anlatımı → yeni oyun (DESIGN §3); görsel kimlik değişmez.
- Bitti: `grep -ri "solana\|SOL\b\|devnet" apps/web/app apps/web/components` yalnızca kasıtlı (ör. "önceki sürüm") sonuç veriyor.

### T-312 · Solana bağımlılıklarını web'den çıkar · P1 · ← T-301..T-311
- `@solana/*`, `@coral-xyz/anchor`, `@metaplex-foundation/*`, `@magicblock-labs/*`, `@bonfida/*`, `idl/`, `lib/umi.ts`, `lib/characterMint.ts`, `hooks/useRolet.ts`, `components/SolanaProvider.tsx`; `next.config.ts`'teki Solana'ya özgü ayarlar.
- `BuckshotRoom.tsx` → kullanılmıyorsa sil, kullanılıyorsa yeniden adlandır (DESIGN §0).
- Bitti: `pnpm build` ve `pnpm lint` başarılı; tüm `node:test` dosyaları yeşil.

### Köprü

### T-320 · Mesaj şeması (web) · P0 · ← T-115
- `lib/godotBridge.ts`: DESIGN §5.2 tipleri, `parseFromGodot(msg)` doğrulayıcı (bilinmeyen tip/eksik alan → null), `origin` kontrolü. `lib/godotBridge.test.ts`.
- Bitti: test yeşil.

### T-321 · `GodotStage.tsx` · P0 · ← T-320
- iframe (`/godot/index.html`), `ready` bekle, `init`/`snapshot`/`actions`/`tx`/`private`/`clock` gönder, `intent` al → `useRoletNear` çağrısı → `tx` durumu geri. Godot yüklenemezse (WebGL yok, 20 s zaman aşımı) yedek mesaj.
- Bitti: practice olmayan modda Godot'tan gelen sahte intent web'de çağrıya dönüşüyor (dev log).

### T-322 · `bridge.gd` (Godot autoload) · P0
- `JavaScriptBridge` ile `message` dinleyicisi → sinyaller (`init_received`, `snapshot_received`, `actions_received`, `tx_update`, `private_info`, `clock`); `send_intent(...)`, `send_ready()`, `send_anim_idle()`. Web dışında (editor) çalışırken no-op + yerel test kancası.
- Bitti: export edilip `?preview=` sayfasında `ready` mesajı web konsolunda görünüyor.

### Godot oyun sahnesi (placeholder grafiklerle)

### T-330 · Godot proje yeniden düzeni · P0 · ← T-322
- DESIGN §6 klasör yapısı; `main.tscn` kök (kodla kurulum); eski `duel.gd` ve kart/revolver kodu `godot/legacy/`'ye taşınır (silinmez, referans). Export yolu aynı kalır.
- Bitti: `godot --headless --path godot --export-release Web` başarılı; sahne açılıyor.

### T-331 · `rules.gd` Buckshot kurallarına (practice/mock) · P0 · ← T-104, T-105
- Kontrattaki `game.rs` ile **aynı** kurallar, sabitler ve `Action` adları. Yalnızca practice modu ve geliştirme içindir.
- `test_rules.gd` yeniden yazılır: T-104/T-105 test senaryolarının aynısı (zorlanmış fişeklerle).
- Bitti: `godot --headless --path godot -s res://scripts/test_rules.gd` yeşil.

### T-332 · Parite test vektörleri · P1 · ← T-331, T-112
- Kontrat testlerinden `docs/near/schema/vectors.json` üret (başlangıç durumu + zorlanmış fişekler + hamleler → beklenen `Action[]` ve son durum); hem Rust hem GDScript testi bu dosyayı okur.
- Bitti: iki test de aynı vektörlerle yeşil.

### T-333 · `director.gd`: Action oynatıcı · P0 · ← T-330
- Action kuyruğu; her Action → bir "beat" fonksiyonu (şimdilik placeholder: küp/silindir hareketi + yazı + bip). Beat'ler sırayla, `await` ile; kuyruk boşalınca `send_anim_idle`. `snapshot` animasyonsuz kurulum.
- `test_director.gd`: sahte Action listesi ile kuyruk sırasının ve `anim_idle`'ın doğru çalıştığı headless test.
- Bitti: headless test yeşil.

### T-334 · Girdi → intent · P0 · ← T-333
- Silaha tıkla → hedef seç (yukarı rakip / aşağı kendin, mevcut `duel.gd` deseni) → `intent(fire)`; eşya slotuna tıkla → `intent(item)`; Lockpick için rakip slot seçimi. Sıra bizde değilken veya animasyon oynarken girdi kapalı.
- Bitti: practice modunda tam etkileşim; web modunda intent mesajları konsolda.

### T-335 · Gecikme maskeleme · P0 · ← T-334, T-321
- DESIGN §5.3: hazırlık animasyonu hemen; `tension_hold` sonucu bekler (min 0.7 s, 4 s üstü dolgu); `tx failed` → geri sarma.
- Bitti: web'de yapay 3 s gecikme ile manuel test; başarısız tx simülasyonunda tüfek masaya dönüyor.

### T-336 · Practice modu · P1 · ← T-331, T-334
- `?mode=practice`: zincirsiz, `rules.gd` + basit `bot.gd` (olasılık temelli: dolu oranı > %50 ise rakibe, değilse kendine; eşyaları basit kurallarla kullanır).
- Bitti: practice maçı baştan sona oynanabiliyor.

### T-337 · Gizli bilgi gösterimi · P0 · ← T-333
- `private` mesajı yalnızca bizim istemcide renk/konum gösterir; rakibin Loupe/Ticker kullanımı bizde sonuçsuz animasyon (DESIGN A17, A23).
- Bitti: iki tarayıcıda rakibin Loupe sonucunu görmüyoruz.

### T-338 · Uçtan uca maç · P0 · ← T-307..T-309, T-321, T-333..T-335, T-337
- İki tarayıcı, iki testnet hesabı: kuyruk → join → reveal → 2–3 round → ödül cüzdanda; cüzdan onayı yalnızca key eklemede.
- Bitti: ekran kaydı + `docs/near/E2E.md`'ye adımlar ve tx hash'leri.

---

## F4 — Asset, animasyon, ses (DESIGN §3.3–§3.7, §7)

### Asset hattı

### T-501 · Meshy promptları · P0
- `docs/near/meshy-prompts.md`: DESIGN §7.1'deki her asset için prompt (stil: "saat kulesi makine dairesi, pirinç, eskitilmiş, düşük poligon, el yapımı"), negatif prompt, hedef üçgen, ✂ parça listesi.
- Bitti: 25 asset satırı dolu.

### T-502 · Asset üretimi · P0/P1 · 👤 ← T-501
- Meshy'de üret, P0'lar önce (M01, M02, M04, M07, M08, M11–M15). Çıktıları `godot/assets/models/raw/`'a koy.
- Bitti: P0 GLB'ler repoda.

### T-503 · Rig spike · P0 · ← T-502 (M04, M07)
- M04 ve M07'yi Meshy auto-rig ile Godot'a al; kemik isimleri, el/parmak kalitesi, `aim_self` pozunun kurulabilirliği. Sonuç: devam / plan B (DESIGN R6).
- Bitti: `docs/near/RIG-SPIKE.md` + bir test sahnesinde `aim_self` pozu ekran görüntüsü.

### T-504 · ✂ parça ayırma · P0 · 👤/ajan (Blender CLI betiği mümkünse) ← T-502
- M01 (gövde/pompa/namlu/namlu ucu/tetik), M08, M09, M10, M14. Pivot noktaları hareket eksenine göre.
- Bitti: `godot/assets/models/` altında parçalı GLB'ler, isimlendirme `rolet_<asset>_<part>`.

### T-505 · Import ve materyal · P0 · ← T-504
- Godot import ayarları (ölçek, düşük çözünürlüklü doku, `flat.tres`/pixel shader ile uyum); placeholder'ları gerçek modellerle değiştir (`table.gd`, `gun.gd`, `items.gd`, `panel.gd`).
- Bitti: export boyutu ölçülüp `docs/near/VERSIONS.md`'ye not edildi; sahne 60 fps (masaüstü).

### T-506 · Karakter seçimi sahnede · P0 · ← T-505
- `init.players[i].kind` → rakip modeli (M04/M05/M06), yoksa M04.
- Bitti: farklı kind ile iki maçta farklı rakip modeli.

### T-507 · NFT görselleri · P1 · ← T-506
- Godot'ta her karakterin portresini render eden headless betik → `apps/web/public/character/<kind>.webp`; kontrat metadata `media`'sı bunları gösterir.
- Bitti: `/profile` gerçek portreleri gösteriyor.

### Sahne ve kamera

### T-510 · Oda kabuğu ve ışık · P0 · ← T-505
- Saat kulesi odası: duvar/zemin, kadran camı (emissive + akrep/yelkovan gölgesi), tepe lambası (sallanan), dişliler (dönen, M20), kadran soğuk dolgu ışığı. Mevcut pixel/dither shader korunur.
- Bitti: ekran görüntüsü `docs/near/shots/room.png`.

### T-511 · Kamera rig · P0 · ← T-510
- `camera_rig.gd`: FP oturma, fare bakışı (±12°/±8°, yumuşatılmış), nefes (A01), sarsıntı (adımlı 6 kare), masaya eğilme pozu, namlu-ağzı pozu.
- Bitti: practice modunda tüm pozlara geçiş.

### Animasyonlar (DESIGN §3.7 — her biri ayrı küçük görev)

Her animasyon görevi için ortak "Bitti": practice modunda ilgili durumda oynuyor, süresi DESIGN tablosunun ±%20'si içinde, director kuyruğunu bloklamıyor (sonunda devam ediyor), ses kancası çağrılıyor (ses dosyası yoksa placeholder).

| ID | Görev | Öncelik | Bağımlılık |
|---|---|---|---|
| T-520 | A02 `round_intro` + A28 `round_end` | P0 | T-511 |
| T-521 | A03 `shells_reveal` + A04 `shells_load` (prosedürel fişekler, raf) | P0 | T-511 |
| T-522 | A05 `items_deal` (alet çantası) | P0 | T-505 |
| T-523 | A06 `gun_pickup` + A14 `gun_putdown` (S ve R) | P0 | T-503 |
| T-524 | A07 `aim_opponent` + A08 `aim_self` (S ve R) | P0 | T-523 |
| T-525 | A09 `tension_hold` (gecikmeye bağlı) | P0 | T-524, T-335 |
| T-526 | A10 `fire_live_opp` + A15 `opponent_knockback_return` | P0 | T-524 |
| T-527 | A11 `fire_live_self` (flaş → siyah → geri dönüş) | P0 | T-524 |
| T-528 | A12 `fire_blank` | P0 | T-524 |
| T-529 | A13 `rack_eject` (kovan fiziği, renk) | P0 | T-523 |
| T-530 | A17 `item_loupe` (S/R farkı) | P0 | T-522 |
| T-531 | A18 `item_pipe` | P0 | T-522 |
| T-532 | A19 `item_flask` | P0 | T-529 |
| T-533 | A20 `item_shackle` + atlanan sıra animasyonu | P0 | T-522 |
| T-534 | A21 `item_hacksaw` + A22 `barrel_restore` | P0 | T-504 |
| T-535 | A23 `item_ticker` (S/R farkı) | P1 | T-522 |
| T-536 | A24 `item_magnet` | P1 | T-522 |
| T-537 | A25 `item_lockpick` (rakip ızgarasından alma + iç içe eşya animasyonu) | P1 | T-530..T-536 |
| T-538 | A26 `item_tincture` (iki sonuç) | P1 | T-522 |
| T-539 | A27 `heal_cut` (pano kablosu) | P1 | T-520 |
| T-540 | Can panosu tüpleri: çatlama/yanma (A10/A11/A18 ile ortak) | P0 | T-505 |
| T-541 | A29 `match_end` (ödül tutarı kadranda) | P0 | T-520 |
| T-542 | A30 `turn_timer` (tik-tak hızlanması, yelkovan) | P1 | T-511 |
| T-543 | A31 `opponent_waiting` idle varyantları | P2 | T-503 |

### Ses

### T-550 · Ses listesi ve kaynaklar · P0 · 👤/ajan
- DESIGN §3.6'daki her cue için dosya adı, kaynak (CC0 link veya "kendi kaydı"), lisans → `godot/assets/audio/CREDITS.md`. Buckshot'tan hiçbir dosya yok.
- Bitti: liste tam, dosyalar `godot/assets/audio/`'da.

### T-551 · `sfx.gd` yeniden yazımı · P0 · ← T-550
- Cue adıyla çalma, 3D konumlu efektler, ortam katmanı, "kendine dolu" için master ses kesme + çınlama zarfı, tik-tak tempo kontrolü.
- Bitti: practice modunda tüm cue'lar duyuluyor; headless'ta ses yokken hata vermiyor.

### Performans

### T-560 · Web yükleme optimizasyonu · P0 · ← T-505
- Godot export'u brotli/gzip ön sıkıştırma; Next.js/Railway'de doğru `Content-Encoding` ve cache başlıkları; kuyrukta beklerken iframe ön yükleme; yükleme ilerleme göstergesi.
- Bitti: soğuk yükleme süresi ve aktarılan bayt `docs/near/VERSIONS.md`'ye not; sıkıştırılmış aktarım < 15 MB.

---

## F5 — Teslim

### T-601 · README: NEAR bölümü ve Q-002 · P0 · ← T-338
- "Built for NEAR Hackathon 2026": önceki Solana sürümü, NEAR için yeni yazılanlar, yeniden kullanılanlar, `git diff pre-near..` yönlendirmesi, bilinen sınırlar (DESIGN R1, R2, R10), kontrat adresi, kurulum.
- Bitti: README'de bölüm var; linkler çalışıyor.

### T-602 · Pitch ve demo senaryosu · P0 · ← T-338
- `PITCH.md` / `DEMO-SCRIPT.md` NEAR'a: ana mesaj "bir onay, sıfır pencere: function-call access key ile her hamle zincirde"; FC key'in deposit ekleyememesi güvenlik vurgusu; lazy draw ile gizli sıra.
- Bitti: 3 dk'lık senaryo, her adımın ekranda ne gösterdiği.

### T-603 · Deploy · P0 · 👤 ← T-560, T-338
- Railway (tek replika) + testnet kontrat; ortam değişkenleri; canlı URL'de E2E tekrarı.
- Bitti: canlı URL'de iki hesapla maç.

### T-604 · Demo videosu · P0 · 👤 ← T-603

---

## Kritik yol özeti

```
T-002 → T-003 → T-101 → T-102 → T-103 → T-104 → T-105 → T-110 → T-111 → T-112 → T-113 → T-117 → T-118
   → T-201 → T-202 → T-203 → T-204 → T-302 → T-307 → T-308 → T-338 → T-601/T-602 → T-603
Paralel kollar:
   Köprü/Godot: T-322 → T-330 → T-333 → T-334 → T-335 (T-321 ile birleşir) → T-338
   Asset: T-501 → T-502 → T-503/T-504 → T-505 → animasyonlar (T-520…)
   Kurallar: T-331 (T-104/T-105 sonrası)
```

Kapsam daralırsa kesilecekler sırası: T-543 → T-542 → T-507 → T-537 → T-535/T-536/T-538 (ve kontrattan T-106) → T-336 → T-310.
