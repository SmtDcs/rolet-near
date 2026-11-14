# Rolet NEAR — F3 Planı (UI + oyun bağlantısı, hibrit 2.5D)

- **Tarih:** 2026-11-14 · **Dal:** `near` · **Kaynak:** `TASKS.md` F3, `DESIGN.md` §3.7/§5/§6, `CLIENT-CONTRACT.md`, `F2-REPORT.md`, `FIX-F2C-REPORT.md`, **Samet görsel kararı** (`.git/rolet-f3-notes.txt`, bağlayıcı)
- **Başlangıç durumu:** kontrat F1 (136 birim + 9 sandbox yeşil). F2 istemci katmanı (`nearConfig`, `nearTypes`, `nearKey`, `nearCommit`, `nearOutcome`, `nearCall`, `nearKeyFlow`, `/dev/near-key`) ve FIX-F2C bitti. `apps/web` içinde `three 0.176.0`, `@react-three/fiber 9.6.1`, `@react-three/drei 10.7.7`, `gsap 3.15.0` zaten kurulu (`^` ile).
- **Kodlayıcı kısıtı:** testnet, gerçek cüzdan ve `near` CLI **yok**. npm ve yerel `near-sandbox` var. Testnet/cüzdan/görsel onay gerektiren adımlar 👤 **Samet**.

## 0. Bağlayıcı görsel karar (özet, `DESIGN` ile çelişirse bu geçerli)

1. **Godot yok.** Oyun Next.js içinde, aynı süreçte çalışır. iframe ve postMessage köprüsü yok.
2. **Hibrit 2.5D, sabit birinci şahıs kamera.** Masa, rakip ve ortam cilalı 2D'dir (Meshy'den gelen modellerin önceden render edilmiş görüntüleri, video veya sprite). Yalnızca **revolver** Three.js ile çizilen gerçek bir 3D Meshy GLB'sidir.
3. **El modeli yok.** Revolver masadan alınınca elde tutuluyormuş gibi kameraya doğru kalkar (hafif el salınımı kodla verilir).
4. **Nişan:** silah alındıktan sonra ekran üst ve alt olarak ikiye bölünür. Yukarı sürüklemek rakibe, aşağı sürüklemek kendine nişan aldırır. Bırakınca hedef onaylanır ve ateş edilir. Orta ölü bölgede bırakmak iptal sayılır, silah masaya döner.
5. **Canlı sahne:** rakip idle döngüsünde (nefes, göz kırpma), nişan alınınca tepki verir. Ortam döngüleri: sallanan lamba, duman, titreyen ışık. Hepsi web'de performanslı olmalı.
6. **Değerler Rolet** (4 can, **8 hazne**, elde 4 kart, 9 tür × 4 kopya ortak deste, her yüklemede rastgele 2–6 dolu ve ilan edilir). **Mekanik, animasyon ve çekimler Buckshot benzeri.**
7. Bu yüzden `DESIGN` §3.4'teki "pompalı tüfek" ve §3.5'teki "birinci şahıs eller" geçersizdir. Silah **8 hazneli revolver**: `rack_eject` → hazne döner ve horoz kurulur; `Flask` → hazne yana açılır, mevcut fişek atılır; `Hacksaw` → namlu ucu kesilir. `DESIGN` §5.2/§6 (Godot köprüsü ve proje yapısı) yerine bu plandaki §2 geçerlidir (bkz. F3-0).

---

## 1. TASKS.md F3 yeniden eşleme (öneri, TASKS.md bu planda değiştirilmez)

| Görev | Karar | Yeni karşılık / not | Plan maddesi |
|---|---|---|---|
| T-301 NearProvider | **Aynen** | — | F3-16 |
| T-302 useRoletNear | **Aynen** | View sarmalayıcıları saf `lib/nearViews.ts`'e ayrılır (testli) | F3-17 |
| T-303 RPC proxy | **Aynen** | — | F3-15 |
| T-304 Kuyruk simetrik | **Aynen** | — | F3-15 |
| T-305 NEP-413 | **Aynen** | — | F3-15 |
| T-306 `/profile` | **Aynen** | Karakter görseli placeholder; gerçek portre 2D varlık hattından (V-30) | F3-22 |
| T-307 `/duel` durum makinesi | **Değişir (küçük)** | Oyun alanı `GodotStage` değil `components/stage/Stage.tsx`. `play` durumunda Stage'e `GameTransport` (NEAR) verilir | F3-18, F3-21 |
| T-308 Rakip senkronu | **Değişir (küçük)** | Yeni aksiyonlar "köprüye" değil `GameTransport` aboneliğine gider; boşlukta snapshot (CLIENT-CONTRACT (c)) | F3-19 |
| T-309 Zaman aşımı UI | **Aynen** | HUD React DOM'da | F3-20 |
| T-310 `/leaderboard` | **Aynen** | — | F3-22 |
| T-311 Landing metinleri | **Aynen** | Revolver anlatımı geri gelir (8 hazne) | F3-22 |
| T-312 Solana temizliği | **Değişir (küçük)** | Ek: `DuelRoom3D.tsx`, `PixelDuelStage.tsx`, `BuckshotRoom.tsx`, `ChamberDial.tsx`, `HandRack2D.tsx` kullanılmıyorsa silinir. `godot/` klasörüne F3'te **dokunulmaz** (silme kararı F5'te, 👤 onaylı) | F3-23 |
| T-320 `lib/godotBridge.ts` | **Değişir** | `lib/stage/protocol.ts`: aynı mesaj anlamları (`init/snapshot/actions/tx/private/clock` ve `ready/intent/anim_idle`), ama süreç içi tipli olay; `origin` kontrolü gereksiz | F3-5 |
| T-321 `GodotStage.tsx` | **Değişir** | `components/stage/Stage.tsx` (katmanlar §2.1). "Godot yüklenemedi" yedeği yerine "WebGL yok → revolver 2D sprite'a düşer" | F3-10, F3-11 |
| T-322 `bridge.gd` | **İptal** | Süreç içi olduğu için köprü yok | — |
| T-330 Godot proje düzeni | **İptal** | Yerine `lib/game/`, `lib/stage/`, `components/stage/` yapısı (§2.6) | F3-10 |
| T-331 `rules.gd` | **Değişir** | `lib/game/rules.ts` (TS, `game.rs` ile aynı kural, sabit ve `Action` adları). Yalnız practice ve test için | F3-1, F3-2 |
| T-332 Parite vektörleri | **Değişir** | Rust ↔ **TS** (`docs/near/schema/vectors.json`) | F3-3 (P1) |
| T-333 `director.gd` | **Değişir** | `lib/game/director.ts` (saf planlayıcı + kuyruk, sahte saatle testli) + `components/stage/useDirector.ts` (yürütücü) | F3-6, F3-12 |
| T-334 Girdi → intent | **Değişir** | Sürükle-nişan (`lib/game/aimGesture.ts`), eşya tıklama, Lockpick hedef seçimi; klavye alternatifi | F3-8, F3-12 |
| T-335 Gecikme maskeleme | **Değişir (dil)** | `lib/game/intentFlow.ts` (saf). Anlam DESIGN §5.3 ile aynı | F3-7 |
| T-336 Practice modu | **Değişir + öne alınır, P0** | `lib/game/practiceEngine.ts` + `bot.ts`, sayfa `/practice` (cüzdansız, prod'da açık). Demo yedeği ve jüri için değerli | F3-9, F3-13 |
| T-337 Gizli bilgi | **Değişir (dil)** | `lib/game/privacy.ts`: redaksiyon director'a ve modele **girmeden önce** yapılır | F3-4 |
| T-338 Uçtan uca maç | **Aynen, 👤** | Testnet E2E Samet'te. Kodlayıcı aynı akışı **yerel sandbox**'ta otomatik test eder (F3-19) | F3-24 |

**F4 etkisi (yalnız not):** T-503 (el rig spike'ı) iptal edilir. T-504 yalnız revolver parçalarına iner. T-505 Godot importu yerine GLB optimizasyonu olur (§3.1). T-510/T-511 yerine 2D plaka/klip üretimi ve `cameraSpec` kalibrasyonu gelir. T-520..T-543 beat'leri bu plandaki beat kataloğuna (F3-6) bağlanır. T-551 `hooks/useSound.ts` (Web Audio) olur. T-560 video ve GLB bütçesine dönüşür (§3).

---

## 2. Mimari

### 2.1 Sahne katmanları (alttan üste, hepsi `Stage.tsx` içinde, 16:9 sabit sahne, letterbox)

| # | Katman | Teknik | İçerik |
|---|---|---|---|
| L0 | Ortam | `<video muted loop playsInline>` (WebM VP9 + MP4 H.264 yedek, poster WebP) | Oda: dişliler, sarkaç, kadran parıltısı, duman, toz, sallanan lamba gövdesi |
| L1 | Rakip | `ClipPlayer`: iki üst üste `<video>` (A/B), kare doğru çapraz geçiş (120 ms). Alfa: WebM VP9-alpha (Safari yedeği §5 Soru 1) | Rakip klipleri (V-10..V-27). Belden yukarı, masanın arkasında |
| L2 | Masa | WebP (alfa) plaka | Masa ön yüzü; rakibin bel altını örter |
| L3 | Masa üstü 2D | DOM/`<canvas>` sprite + GSAP tween | 8 fişek göstergesi, 4+4 eşya slotu, can tüpleri (iki pano), puan çentikleri |
| L4 | Revolver | R3F `<Canvas gl={{alpha:true}}>`, tam ekran, `pointer-events` yalnız nişan sırasında | Tek 3D nesne: revolver + kontak gölgesi düzlemi (`ShadowMaterial`) |
| L5 | Işık/FX | CSS/canvas overlay (`mix-blend-mode`) | Lamba ışık havuzu salınımı, titreme, namlu flaşı, beyaz flaş → siyah, vinyet, sarsıntı (tüm katmanlara CSS transform) |
| L6 | UI | React DOM | HUD (süre, sıra, tx durumu, hata), nişan bölgesi ipuçları, eşya kullanım menüsü, Lockpick hedef seçimi |

- **Kamera eşleşmesi:** 2D plakalar tek bir sabit kamera ile render edilir. Three.js kamerası aynı değerleri kullanır: `lib/stage/cameraSpec.ts` (FOV, konum, pitch, hedef çözünürlük 1920×1080). Revolverin masadaki pozu `/dev/stage` kalibrasyon kaydırıcılarıyla bulunur ve `gunPoses.ts`'e yazılır.
- **Rakip silahı tutarken:** 3D revolver rakibin el çapası noktasına (`layout.ts`, normalize koordinat) uçar ve küçülür. Rakip klibi `R-take` başladığı karede 3D silah gizlenir; kliplerdeki silah aynı Meshy modelinin 2D render'ıdır. Bırakırken bunun tersi olur.
- **Yerel nişan:** `aim ∈ [-1, 1]`. `gunPoseAt(aim)`: `AIM_SELF (-1)` ↔ `LIFTED (0)` ↔ `AIM_OPP (+1)` arasında yumuşatılmış ara değer (`THREE.MathUtils.damp`). `aim > 0.6` iken rakip `R-aimed_at` tepki döngüsüne geçer, `aim < -0.6` iken L5 vinyeti koyulaşır ve kalp atışı sesi çalar.

### 2.2 Katman sorumlulukları (birbirini bilmez)

```
duelFlow (lib/duelFlow.ts)        uygulama yaşam döngüsü: connect→key→character→queue→join→reveal→play→result
   │ play durumunda
   ▼
GameTransport (arayüz)            submitIntent(intent) → Promise<Action[]> ; onActions(cb) ; snapshot()
   ├─ practiceEngine (lib/game)   rules.ts + bot.ts + yapay gecikme
   └─ nearTransport  (lib/game)   sendGameCall + actionPoller + get_match
   │ (her aksiyon önce privacy.redact'ten geçer)
   ▼
model (lib/game/model.ts)         tek doğruluk kaynağı UI için: hp, eşyalar, fişek sayıları, sıra, bilinen fişekler
director (lib/game/director.ts)   SADECE sunum: Action → Beat[]; kuyruk; anim_idle. Kural hesaplamaz.
intentFlow (lib/game/intentFlow)  yerel hamle: hazırlık → gönderildi → tension_hold → sonuç / geri sarma
   ▼
Stage (components/stage)          beat'leri katmanlarda yürütür (useDirector), girdi toplar (aimGesture)
```

- **Kural:** director ve Stage hiçbir zaman fişek sonucu tahmin etmez veya hesaplamaz. Yalnızca transport'tan gelen `Action`'ları oynatır (DESIGN §5.2'deki ilke korunur). `rules.ts` yalnızca `practiceEngine` ve testler içindir.
- **Model ile görüntü ayrımı:** model aksiyon gelir gelmez güncellenir (girdi kapısı ve HUD için). Sahnedeki görsel durum (tüp sayısı, slotlar) ise beat yürütülünce güncellenir. Böylece animasyon sonucu önceden göstermez.
- **Snapshot:** yeniden bağlanmada veya log boşluğunda (`first_seq > since_seq + 1`) `get_match` alınır. Director kuyruğu boşalınca (`anim_idle`) animasyonsuz kurulum yapılır.

### 2.3 Gizli bilgi (`lib/game/privacy.ts`)

- `redactAction(a, you)`: `ItemUsed` + `result.kind === "Private"` + `player !== you` ise `result` → `{kind:"None"}` olur. Rakibin Loupe/Ticker beat'i sonuçsuz oynar (`DESIGN` A17/A23 R sürümü).
- `redactSnapshot(view, you, ownPrivate)`: `game.load.fixed[i]` için `i >= total - remaining` (henüz ateşlenmemiş konumlar) **null'lanır**. İstisna: yerel oyuncunun kendi `Private` sonucundan bildiği konumlar `ownPrivate` haritasından geri konur. Magnet çevirdiği için bilinen konum geçersiz olursa harita temizlenir.
- `log` içindeki rakip `Private` sonuçları da redakte edilir. Redakte edilmemiş veri hiçbir zaman `console.*`, model, director veya DOM'a ulaşmaz. Test, kaynak dosyalarda `console.` taraması yapar (F2-3 deseni).
- Bot (practice) yalnızca kendi açısından redakte edilmiş görünümü görür.

### 2.4 Gecikme maskeleme (`lib/game/intentFlow.ts`, DESIGN §5.3)

Durumlar: `idle → preparing (gun_pickup + aim, yerel ve anında) → sent (intent gönderildi) → holding (tension_hold: en az 700 ms; 4 s'yi geçerse "mekanizma takıldı" dolgu beat'i; 20 s'de zaman aşımı → failed) → resolved (sonuç beat'leri) | failed (geri sarma: silah masaya, eşya slota; HUD hatası; tekrar denenebilir)`.

- Eşyalarda "alma" yarısı hemen oynar, "sonuç" yarısı `Action` gelince oynar.
- Girdi kapısı `canAct(model, directorBusy, intentState)`: sıra bizde, director boşta ve intent `idle` olmalı.
- Rakip hamleleri yoklamayla ~0.6–1.5 s geç gelir ve tam süreyle oynatılır.

### 2.5 Practice modu

- `/practice` (cüzdan yok, prod'da açık). Tohum URL'den alınabilir (`?seed=`), böylece yeniden üretilebilir.
- `practiceEngine` aynı `GameTransport` arayüzünü uygular. `submitIntent` için yapay gecikme 300–1500 ms (env/URL ile 0 veya 3000 yapılabilir). Bot hamleleri `onActions` ile gelir. Stage practice ile NEAR arasındaki farkı bilmez.
- Bot (`lib/game/bot.ts`): `P(dolu) = live_left / remaining`, bilinen fişeği kullanır. `> 0.5` ise rakibe, değilse kendine ateş eder. Basit eşya kuralları: canı eksikse Pipe, dolu biliniyorsa Hacksaw, `remaining ≥ 3` ise Shackle, bilinmiyorsa Loupe.

### 2.6 Dosya yapısı (yeni)

```
apps/web/lib/game/      config.ts rules.ts shellSource.ts model.ts privacy.ts actionSync.ts
                        beats.ts director.ts intentFlow.ts aimGesture.ts bot.ts practiceEngine.ts
                        transport.ts nearTransport.ts actionPoller.ts clock.ts   (+ *.test.ts)
apps/web/lib/stage/     protocol.ts assets.ts cameraSpec.ts layout.ts gunPoses.ts clipSchedule.ts (+ *.test.ts)
apps/web/components/stage/  Stage.tsx useDirector.ts layers/{Background,Rival,Table,TableSprites,Revolver,Fx,Hud}Layer.tsx
                            RevolverPlaceholder.tsx RivalPlaceholder.tsx
apps/web/app/practice/page.tsx   apps/web/app/dev/stage/page.tsx (yalnız dev)
apps/web/public/stage/  (varlıklar; manifest: lib/stage/assets.ts)
```

- `lib/` içindeki saf modüller göreli import kullanır, `window`/`document`/`localStorage` erişimini enjekte eder (F2 kuralı). `components/stage/*` dosyaları `"use client"` olur. Three/R3F yalnız istemcide yüklenir: Next 16'da `next/dynamic` + `ssr:false` kullanımı `node_modules/next/dist/docs/` içinden doğrulanır (`apps/web/AGENTS.md`).

### 2.7 Paketler (yeni paket yok; mevcutlar tam sürüme sabitlenir)

| Paket | Sürüm (şu an kurulu) | Kullanım |
|---|---|---|
| `three` | **0.176.0** | Revolver render, `GLTFLoader` + `MeshoptDecoder` (`three/examples/jsm/libs/meshopt_decoder.module.js`, gömülü wasm; CSP'de `'wasm-unsafe-eval'` zaten var) |
| `@types/three` | **0.176.0** | — |
| `@react-three/fiber` | **9.6.1** | `<Canvas frameloop="demand">`, React 19 uyumlu |
| `@react-three/drei` | **10.7.7** | Yalnız `useGLTF` (meshopt ile, **Draco CDN yok**) ve `ContactShadows`. **`<Environment preset>` kullanılmaz** (CDN'den indirir, CSP engeller); ortam ışığı için yerel `public/stage/env.hdr` veya basit ışıklar |
| `gsap` | **3.15.0** | 2D katman tween'leri (sprite, overlay) |
| `@react-three/postprocessing` | 3.0.4 (dokunma) | Sahnede **kullanılmaz** (performans). T-312'de kullanılmıyorsa kaldırılır |

- `package.json`'da `^` kaldırılır, `docs/near/VERSIONS.md`'ye satır eklenir. `pnpm why three` çıktısı tek kopya göstermeli.
- Varlık hattı aracı (kodlayıcı bağımlılığı değil): `@gltf-transform/cli` (sürüm, kullanılırken `npm view` ile alınıp VERSIONS'a yazılır).

---

## 3. Varlık listesi ve bütçe (üretim kodlayıcıdan ayrı, 👤 sanat hattı)

**İlke:** her varlığın `lib/stage/assets.ts` manifestinde bir kimliği vardır. Kimlik `{type:"video"|"image"|"glb", src}` veya `{type:"procedural", id}` olabilir. Kodlayıcı tümünü **procedural placeholder** ile yazar. Gerçek dosya gelince kod değişmez, yalnız manifest satırı değişir. Tüm 2D varlıklar `cameraSpec`'teki tek kamera ile render edilir.

### 3.1 3D — Meshy revolver (tek 3D varlık)

| Kimlik | Varlık | Bütçe | Not |
|---|---|---|---|
| G-01 | `public/stage/revolver.glb` | ≤ **20k üçgen**; dokular **2048²** baseColor + ORM + normal, GLB içinde **WebP** (`EXT_texture_webp`); geometri meshopt (`EXT_meshopt_compression`); dosya **≤ 2 MB** | Yakın plan kahraman nesne (`aim_self`'te ekranı kaplar). Stil: pirinç kakmalı, saatçi gravürlü, 8 hazneli |
| | Zorunlu düğüm adları + pivotlar | `rolet_revolver_frame`, `_cylinder` (pivot hazne ekseni, 8 hazne 45° aralıklı), `_crane` (hazne yana açılma menteşesi), `_hammer` (pivot horoz pimi), `_trigger`, `_barrel_tip` (testereyle kopan uç), `_muzzle` (boş düğüm: flaş/duman konumu) | Meshy tek parça verir. ✂ Blender'da ayrılır (T-504) |
| G-02 | `public/stage/shell_live.glb`, `shell_blank.glb` (P1) | ≤ 300 üçgen, doku yok, vertex rengi | Hazneye dolum animasyonu. P0'da kodla silindir |
| — | Placeholder | `RevolverPlaceholder.tsx`: primitiflerle aynı düğüm adları | Kodlayıcı yazar |

### 3.2 2D / video (rakip ve ortam)

Genel: 30 fps, **kusursuz döngü** (ilk = son kare), sabit kamera. Video: WebM VP9 (CRF ~32–36) + MP4 H.264 yedek. Alfa gereken klipler WebM VP9-alpha (Safari: §5 Soru 1). Her klibe poster WebP eşlik eder.

| Kimlik | Varlık | Biçim / boyut | Süre | Bütçe | Öncelik |
|---|---|---|---|---|---|
| V-01 | Ortam döngüsü (oda, dişliler, sarkaç, kadran, duman, toz, lamba gövdesi salınımı) | 1920×1080, alfasız | 8–12 s döngü | ≤ 3 MB WebM | P0 |
| V-02 | Masa ön plakası | WebP alfa 1920×~520 | — | ≤ 400 KB | P0 |
| V-03 | Lamba ışık havuzu / titreme maskesi | WebP gri tonlu 1024² (L5 overlay) | — | ≤ 150 KB | P1 (P0: CSS radial gradient) |
| V-04 | Eşya sprite'ları (9 tür, masa üstü) | Tek atlas WebP 2048×1024 (her biri 256–384²) | — | ≤ 400 KB | P0: 5 orijinal, P1: 4 ek |
| V-05 | Fişek sprite'ları (dolu/kuru/boş kovan) + can tüpü (yanık/sönük/çatlak) + puan çentiği | Atlas WebP 1024² | — | ≤ 200 KB | P0 |
| V-06 | FX sprite: namlu flaşı (8 kare), duman (16 kare), kıvılcım (8 kare) | Atlas WebP 1024²/FX | — | ≤ 300 KB toplam | P1 (P0: CSS/canvas prosedürel) |
| V-10 | Rakip `idle` (nefes, 1–2 göz kırpma) | 1024×1024 alfa, sahnede sabit dikdörtgen | 6–8 s döngü | ≤ 1.5 MB | **P0** |
| V-11 | Rakip `idle_alt` (kafa eğme, parmak tıkırtısı) | " | 6–8 s | ≤ 1.5 MB | P2 |
| V-12 | Rakip `aimed_at` tepki (gerilme, geri çekilme, ter) giriş 0.4 s + döngü 3 s | " | 3.4 s | ≤ 1 MB | **P0** |
| V-13 | `hit_knockback` (geri savrulma, karanlığa düşüş) | " | 1.2 s | ≤ 600 KB | **P0** |
| V-14 | `recover` (yerine dönüş, nefes nefese) | " | 1.2 s | ≤ 600 KB | **P0** |
| V-15 | `relief` (kendisine kuru sıkı) | " | 0.8 s | ≤ 400 KB | P1 |
| V-16 | `take_gun` / `put_down` (silahlı 2D render) | " | 0.5 s + 0.5 s | ≤ 600 KB | **P0** |
| V-17 | `hold_gun` döngüsü | " | 2 s | ≤ 600 KB | **P0** |
| V-18 | `aim_self` (giriş + döngü) | " | 0.5 s + 2 s | ≤ 800 KB | **P0** |
| V-19 | `aim_you` (namlu kameraya; giriş + döngü) | " | 0.5 s + 2 s | ≤ 800 KB | **P0** |
| V-20 | `fire_recoil` (dolu ve kuru varyant) | " | 0.4 s ×2 | ≤ 500 KB | **P0** |
| V-21 | `use_mouth` (pipo/matara/tentür) | " | 1.6 s | ≤ 700 KB | **P0** |
| V-22 | `use_hands` (lup/testere/mıknatıs/telgraf) | " | 1.4 s | ≤ 700 KB | **P0** |
| V-23 | `shackled` döngüsü + `struggle` (atlanan sıra) | " | 2 s + 1.2 s | ≤ 800 KB | P1 |
| V-24 | `round_lost` / `match_win` / `match_lose` | " | 2–4 s | ≤ 1.5 MB | P1 |
| V-30 | Karakter portreleri (NFT `media`, `/profile`) | WebP 768² ×3 | — | ≤ 150 KB/adet | P1 |

- **Karakter başına** V-10..V-24 seti gerekir. P0'da yalnız **Kuleci** üretilir; diğer `kind`'lar Kuleci setine düşer (manifest yedeği).
- **Toplam aktarım bütçesi:** ilk yükleme (V-01, V-02, V-04, V-05, V-10, G-01) **≤ 8 MB**. Geri kalan klipler kuyrukta beklerken arka planda önden yüklenir. Tüm sahne **≤ 20 MB**. Bellek: aynı anda en fazla 3 `<video>` çözülür (V-01 + rakip A/B).
- **Performans hedefi:** orta seviye masaüstü GPU'da 60 fps, alt sınır 30 fps. R3F `dpr={[1, 1.5]}`, `frameloop="demand"` (silah hareket etmiyorken çizim yok). Sekme gizlenince videolar duraklatılır. Gölge haritası kullanılmaz (kontak gölgesi + baked).
- **Üretim yolu (👤, öneri):** Meshy (model + auto-rig + hazır idle/nefes) → Blender (sabit `cameraSpec` kamerası, ışık, poz anahtarları, alfa render) → ffmpeg (VP9-alpha/H.264) → `public/stage/`. Kodlayıcı bu hatta dahil değildir.

---

## 4. Kodlayıcı maddeleri (sıralı; madde başına bir commit, mesaj `F3-n: ...`)

**Genel kurallar:** `contracts/rolet-near/src/`, `apps/server/` ve `packages/shared/` değişmez. F2 dosyaları (`lib/near*.ts`) yalnız gerekiyorsa ve testleri yeşil kalarak değişir. Testler testnet'e **asla** bağlanmaz. API'ler hafızadan yazılmaz, `node_modules/**/*.d.ts` ve Next dokümanından doğrulanır. `secret`, özel anahtar ve redakte edilmemiş `Private` sonuçları hiçbir zaman `console.*`, URL veya hata mesajına yazılmaz. Oyun sabitleri tek yerdedir (`lib/game/config.ts`).

Ortak komutlar (repo kökünden):
- `T` = `pnpm --filter web test` (script `tsx --test lib/*.test.ts lib/**/*.test.ts` olarak genişletilir, F3-0)
- `S` = `pnpm --filter web test:sandbox`
- `B` = `pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && pnpm --filter web build`

### A — Saf mantık

**F3-0 · Hazırlık (doküman + sürüm)**
- Dosyalar: `apps/web/package.json` (§2.7 paketlerinde `^` kaldır; `test` glob'una `lib/**/*.test.ts` ekle), `pnpm-lock.yaml`, `docs/near/VERSIONS.md`, `docs/near/DECISIONS.md` (#13: §0 görsel kararının özeti; DESIGN §3.4/§3.5/§5.2/§6/§7'nin bu kararla geçersiz kılınan kısımları listelenir).
- Kabul: `pnpm install` temiz. `T` mevcut 63+ testle yeşil, `B` yeşil, `pnpm why three` tek kopya `0.176.0`.

**F3-1 · `lib/game/config.ts`, `shellSource.ts`, `rules.ts` (yükleme, dağıtım, ateş)**
- `game.rs` ile birebir: `newLoad` (8 hazne, dolu `min_live..=max_live`), `dealItems` (ortak deste, iadesiz, biterse yenilenir, 4 slot), `fire` (DESIGN §3.2 kural 1–7, R3 `heal_cut`, best-of-3). Çıktı `Action[]`, tipler `lib/nearTypes.ts`'ten. `ShellSource` arayüzü: `ScriptedSource` (test) ve `SeededSource` (deterministik, `@noble/hashes` sha256 tabanlı).
- Test `lib/game/rules.test.ts`: `config.ts` değerleri `contracts/rolet-near/init-config.json` ile eşit (dosya okunur). T-103 sınır testi (10 000 tohum). T-104'ün tüm senaryoları (kendine kuru → sıra kalır, testereli dolu → 2 hasar, kelepçe atlama/kırılma, son fişek → yeni yükleme, can 0 → round sonu ve kaybeden başlar, 2. round → maç sonu, sırası olmayan → hata).
- Kabul: `T` yeşil.

**F3-2 · `rules.ts` eşyalar (9 tür)**
- T-105/T-106 kuralları + DECISIONS #8 (Ticker ≤1 fişek → `None`), #9 (Pipe tam canda reddedilir), Tincture %50, Lockpick (çalınamaz, uygulanamazsa hiçbir şey tüketilmez). Reddedilen kullanım eşyayı tüketmez.
- Test: her eşya için başarılı + reddedilen yol.
- Kabul: `T` yeşil.

**F3-3 · Parite vektörleri (P1, §5 Soru 2'ye bağlı)**
- `contracts/rolet-near/tests/vectors_export.rs` (yalnız yeni test dosyası, `#[ignore]`, src değişmez) → `docs/near/schema/vectors.json` (başlangıç durumu + zorlanmış fişekler + hamleler → beklenen `Action[]` + son durum). `lib/game/vectors.test.ts` aynı dosyayı `rules.ts` ile koşar.
- Kabul: `cd contracts/rolet-near && cargo test --test vectors_export -- --ignored` dosyayı üretir. `cargo test` hâlâ 136 + 9 (değişmemiş) yeşil, `T` yeşil.

**F3-4 · `lib/game/model.ts`, `privacy.ts`, `actionSync.ts`**
- `fromSnapshot(view, you, ownPrivate)`, `applyAction(model, action, you)` → `GameModel` (round, score, hp, maxHp, healCut, items, announced/left/remaining, `knownShells: Map<pos, Shell>`, turn, saw, shackled, phase). §2.3 redaksiyonu. `mergeActionsPage(lastSeq, page)` → `{apply: Action[], resync: boolean}` (CLIENT-CONTRACT (c)).
- Test: rakip `Private` → `None`. `fixed`'in ateşlenmemiş konumları null, kendi bildiğimiz konum korunuyor. Magnet sonrası bilgi temizleniyor. Boşluk → `resync`, çift aksiyon atlanıyor. `privacy.ts`/`model.ts` içinde `console.` yok. Model, `rules.ts` ile oynanan 100 tohumlu maçta her adımda motor durumuyla (hp, items, sayılar) aynı.
- Kabul: `T` yeşil.

**F3-5 · `lib/stage/protocol.ts` + `lib/game/transport.ts`**
- `StageInput` (`init | snapshot | actions | tx | private | clock`), `StageOutput` (`ready | intent | anim_idle`), `Intent` (`{id, kind:"fire", target} | {id, kind:"item", slot, stealSlot?}`), `parseIntent(x)` doğrulayıcı. `GameTransport` arayüzü (§2.2).
- Test: geçerli/geçersiz mesaj tablosu (bilinmeyen tip, eksik alan, slot 0..3 dışı → null).
- Kabul: `T` yeşil.

**F3-6 · `lib/game/beats.ts` + `director.ts`**
- Beat kataloğu: kimlik, DESIGN §3.7 ID'si, hedef süre, katman bayrakları. Revolver uyarlaması: `rack_eject` → `cylinder_advance`, `item_flask` → hazne açılır ve fişek atılır. `planBeats(action, ctx)` (ctx: `you`, yerel hazırlık zaten oynadı mı, model). `Director` kuyruğu: enjekte saat + `execute(beat): Promise<void>`. Sırayla oynatır, boşalınca `anim_idle` yayar, snapshot'ı idle'a erteler.
- Test (sahte saat): `Shot` (yerel, hazırlık oynamış) → `[tension_release, fire_*, cylinder_advance, putdown?]`. `Shot` (rakip) → `[rival_take, rival_aim_*, fire_*, …]`. Süreler tablonun ±%20'si içinde. Rakip Loupe beat parametresinde `shell` yok. Snapshot kuyruk boşalana kadar uygulanmıyor. `anim_idle` tam bir kez.
- Kabul: `T` yeşil.

**F3-7 · `lib/game/intentFlow.ts`**
- §2.4 durum makinesi + `canAct`.
- Test (sahte saat): sonuç 200 ms'de gelse de hold ≥ 700 ms. 4 s'de dolgu beat'i. 20 s → `failed` + geri sarma beat'i. Hata → rollback ve tekrar deneme mümkün. Hold sırasında ikinci intent reddediliyor. Sıra bizde değilken `canAct = false`.
- Kabul: `T` yeşil.

**F3-8 · `lib/game/aimGesture.ts`**
- Girdi: pointer down/move/up (sahne yüksekliğine normalize). Çıktı: `aim ∈ [-1,1]`, `zone: "opp" | "self" | "dead"`. Bırakınca `{target}` veya `cancel` döner. Ölü bölge ±0.25, onay eşiği |aim| ≥ 0.6. Klavye: ↑/↓ ayarlar, Enter onaylar, Esc iptal eder.
- Test: eşik tablosu, ölü bölgede bırakma → cancel, hızlı fiske, klavye yolu.
- Kabul: `T` yeşil.

**F3-9 · `lib/game/bot.ts` + `practiceEngine.ts`**
- §2.5. `practiceEngine` `GameTransport` uygular. Geçersiz intent → `tx failed` (rules hatası). Yapay gecikme enjekte saatle çalışır.
- Test: 200 tohumlu bot-bot maçı ≤ 300 hamlede `MatchEnded` ile bitiyor. Bot, oyuncunun `Private` sonucuna erişemiyor (motor bot'a yalnız redakte görünüm veriyor). Aynı tohum → aynı aksiyon dizisi.
- Kabul: `T` yeşil.

### B — Sahne (placeholder varlıklarla)

**F3-10 · Stage iskeleti + `/dev/stage`**
- Dosyalar: `lib/stage/{assets,cameraSpec,layout,clipSchedule}.ts`, `components/stage/Stage.tsx`, `layers/{Background,Rival,Table,TableSprites,Fx,Hud}Layer.tsx`, `RivalPlaceholder.tsx` (SVG siluet; CSS ile nefes `scaleY` 1.00↔1.012 ve göz kırpma), `app/dev/stage/page.tsx` (yalnız dev; her beat ve klip için buton).
- `ClipPlayer`: A/B video çapraz geçişi, `procedural` tür desteği. `clipSchedule.ts` (saf): idle varyant seçimi, tohumlu göz kırpma aralığı (2.5–6 s), `aim > 0.6` → `aimed_at`, beat tetiklediği klipler, klip bitince idle'a dönüş.
- Test: `lib/stage/clipSchedule.test.ts`, `assets.test.ts` (her manifest kimliği ya `procedural` ya da `public/` altında var olan bir dosya).
- Kabul: `T`, `B` yeşil. `pnpm --filter web dev` çalışırken `/dev/stage` → 200, prod `next start` → 404 (F2-8 deseni).

**F3-11 · Revolver katmanı**
- `layers/RevolverLayer.tsx` (dinamik import, `ssr:false`), `RevolverPlaceholder.tsx`, GLB yolu (manifest G-01 dosya ise `useGLTF` + meshopt, CDN yok), `lib/stage/gunPoses.ts` (saf: `TABLE`, `LIFTED`, `AIM_OPP`, `AIM_SELF`, `RIVAL_HAND`, `gunPoseAt(aim)`, el salınımı gürültüsü), düğüm animasyonları (hazne 45° dönüşü, horoz, crane açılması, `barrel_tip` düşmesi/geri gelmesi). WebGL yoksa 2D sprite yedeği.
- `/dev/stage`'e kalibrasyon kaydırıcıları eklenir (poz değerlerini JSON olarak kopyalar).
- Test: `gunPoses.test.ts` (uçlar tam pozlar, ara değerler sürekli, açı sınırları).
- Kabul: `T`, `B` yeşil. Kaynakta `Environment preset` ve `draco` geçmiyor (test grep'i).

**F3-12 · Beat yürütücüleri + girdi**
- `components/stage/useDirector.ts`: her beat için katman işlemleri. P0 beat listesi: `round_intro`, `shells_reveal`, `shells_load`, `items_deal`, `gun_pickup`, `aim`, `tension_hold`, `fire_live_opp`, `fire_live_self` (beyaz flaş → 1.5 s siyah → bulanık dönüş), `fire_blank`, `cylinder_advance`, `gun_putdown`, `knockback_return`, `item_{loupe,pipe,flask,shackle,hacksaw}` (S ve R), `barrel_restore`, `turn_skipped`, `heal_cut`, `round_end`, `match_end`. P1 eşyalar ortak `item_generic` beat'iyle başlar.
- Girdi: silaha tıkla → `gun_pickup` → `aimGesture`. Eşya slotuna tıklayınca kullan. Lockpick'te rakip slotu seçilir. Kapı `canAct`. Ses kancaları `hooks/useSound.ts` cue adlarıyla bağlanır (dosya yoksa sessiz).
- Kabul: `B` yeşil. `/dev/stage` "tam yükleme senaryosu" butonu sabit bir `Action[]` dizisini hatasız oynatıyor (konsolda hata yok; Samet görsel kontrol yapar).

**F3-13 · `/practice` sayfası**
- `app/practice/page.tsx`: `Stage` + `practiceEngine` + HUD (sıra, canlar, ilan edilen dolu/kuru, yapay gecikme göstergesi). `?seed=`, `?latency=`.
- Test: `lib/game/practiceRun.test.ts`: practiceEngine + model + director (sahte saat, no-op yürütücü) ile tam maç. Her intent sonrası `anim_idle` geliyor, son durumda `MatchEnded` var, model ile motor sonucu eşit.
- Kabul: `T`, `B` yeşil. `/practice` prod derlemesinde 200. 👤 Samet: baştan sona elle oynanış + hissiyat notu.

**F3-14 · Performans ve bütçe kontrolü**
- Sekme gizliyken videolar duraklatılır ve R3F durur. Kuyrukta önden yükleme kancası (`preloadStage()`). `apps/web/scripts/check-stage-assets.mjs`: `public/stage/` dosya boyutlarını §3 bütçesiyle karşılaştırır, aşımda çıkış kodu 1 döner.
- Kabul: `node apps/web/scripts/check-stage-assets.mjs` yeşil (placeholder ile). `B` yeşil.

### C — NEAR bağlama

**F3-15 · T-303 / T-304 / T-305**
- `app/api/rpc/route.ts` upstream `NEAR_RPC_URL` (rate limit korunur). `lib/matchQueue.ts` NEAR hesap doğrulaması ve `QueueView` (`waiting | paired | expired`, host/guest ve `markOpened` kaldırılır). `lib/queueSignature.ts` NEP-413 (ed25519 + `view_access_key` enjekte).
- Test: `matchQueue.test.ts` güncel, `queueSignature.test.ts` (sabit vektörlü imza; vektör `@near-js/crypto` ile üretilip fixture'a yazılır).
- Kabul: `T` yeşil. Proxy için sandbox testi: `sandbox/rpc-proxy.test.ts` route handler'ını yerel sandbox upstream'iyle çağırır, `view_account` başarılı (`S` yeşil).

**F3-16 · T-301 NearProvider + Nav**
- `components/NearProvider.tsx` (MNW + Meteor, testnet). `layout.tsx`'te `SolanaProvider` yerine geçer. `Nav.tsx` NEAR hesabını gösterir. Solana kullanan sayfalar bu adımda kırılmasın diye eski `/duel` geçici olarak "yakında" kabuğuna alınır (F3-21'de yeniden yazılır).
- Kabul: `B` yeşil. 👤 tarayıcıda bağlan/çık.

**F3-17 · T-302 `hooks/useRoletNear.ts` + `lib/nearViews.ts`**
- Saf view sarmalayıcıları (enjekte RPC): `getMatch`, `getActions`, `getPlayer`, `getConfig`, `getTreasury`, `leaderboard`. Hook: cüzdan çağrıları (`buy_character`, `claim_reward`; CLIENT-CONTRACT (a)) ve oyun çağrıları (`sendGameCall`), commit/secret (`nearCommit`).
- Test: `nearViews.test.ts` (sahte RPC, base64 args/sonuç), sandbox'ta view'lar (`S`).
- Kabul: `T`, `S`, `B` yeşil.

**F3-18 · T-307 `lib/duelFlow.ts`**
- Saf reducer: `connect → key → character → queue → join → reveal (otomatik) → play → result`, hata dalları, `?match=` ile yeniden bağlanma, `owed > 0` → cüzdanla `claim_reward` önerisi.
- Test: `duelFlow.test.ts` tablo (her geçiş + hata + yeniden bağlanma).
- Kabul: `T` yeşil.

**F3-19 · T-308 `lib/game/actionPoller.ts` + `nearTransport.ts`**
- Poller (saf zamanlayıcı): 600 ms, hatada artan geri çekilme, sekme gizliyken 3 s, `mergeActionsPage` → resync. `nearTransport`: `submitIntent` → `sendGameCall("fire"|"use_item")` → outcome `Action[]` (kendi `Private` sonucumuz `ownPrivate`'a girer), poller → `onActions`, hata sınıfı → `tx failed`.
- Test: `actionPoller.test.ts` (sahte saat/RPC). `sandbox/near-transport.test.ts`: iki `nearTransport` örneği (alice/bob) ve iki bot, yerel sandbox'ta tam maç oynuyor. Her iki taraftaki model son durumda `get_match` ile eşit, bob'un modeli alice'in Loupe sonucunu içermiyor.
- Kabul: `T`, `S` yeşil.

**F3-20 · T-309 `lib/game/clock.ts` + HUD süresi**
- `remainingMs(deadline, now)`, `claimable(model, you, now)`, son 10 s uyarısı. HUD'da "Süre doldu — kazan" butonu (`claim_timeout`).
- Test: `clock.test.ts`. Sandbox: süre dolmadan red, süre dolunca kabul (sandbox'ta zaman ilerletme mümkün değilse `Config` kısa süreli ikinci bir deploy ile test edilir; mümkün değilse skip mesajıyla raporlanır).
- Kabul: `T`, `S` yeşil.

**F3-21 · `/duel` yeniden yazımı**
- `app/duel/page.tsx`: `duelFlow` + `Stage` + `nearTransport`. Eski Solana importları, `HostWaiting`, `GuestLobby`, `seat.ts` ve `lobbyCommit.ts` kullanımı kaldırılır (dosya silme F3-23'te). Kuyrukta beklerken `preloadStage()`.
- Kabul: `B` yeşil. `/duel` prod derlemesinde render oluyor. 👤 iki tarayıcıda join + reveal → Active.

**F3-22 · T-306 `/profile`, T-310 `/leaderboard`, T-311 landing**
- Kabul: `B` yeşil. `grep -riE "solana|\bSOL\b|devnet" apps/web/app apps/web/components` yalnız kasıtlı sonuç veriyor. 👤 testnet'te satın alma ve listeleme.

**F3-23 · T-312 Solana ve eski sahne temizliği**
- §1 tablosundaki dosyalar ve paketler. `godot/` dokunulmaz.
- Kabul: `T`, `S`, `B` yeşil. `pnpm why @solana/web3.js` boş.

**F3-24 · Doküman kapanışı**
- `docs/near/F3-REPORT.md` (madde, commit, test sayıları, Samet'e kalan adımlar; son satır `F3 DONE`). `docs/near/E2E.md`'ye 👤 testnet adımları şablonu. `TASKS.md` F3 bölümü §1 tablosuna göre **yalnız Samet onayından sonra** güncellenir.
- Kabul: `T`, `S`, `B` ve `cd contracts/rolet-near && cargo test` (136 + 9, değişmemiş) çıktıları rapora yapıştırılmış.

### 👤 Samet adımları (kodlayıcıdan bağımsız)
1. Varlık üretimi §3: önce G-01, V-01, V-02, V-04 (5 eşya), V-05, V-10, V-12..V-14, V-16..V-22 (Kuleci). Manifest satırı değiştirilir, `check-stage-assets.mjs` çalıştırılır.
2. F3-13 sonrası `/practice` hissiyat incelemesi ve `cameraSpec`/`gunPoses` kalibrasyonu onayı.
3. F3-16/F3-21/F3-22 cüzdan ve testnet kontrolleri. T-338: iki testnet hesabıyla kuyruk → join → reveal → 2–3 round → ödül; tx hash'leri `E2E.md`'ye.

---

## 5. Samet'e sorular

1. **Hedef tarayıcı:** demo yalnız masaüstü Chromium/Firefox için mi, yoksa Safari/iOS da şart mı? Rakip klipleri alfa video olduğundan Safari, ek bir HEVC-alpha (`.mov`) kopyası veya sprite-sheet yedeği gerektirir; bu da varlık işini ve bütçeyi yaklaşık ikiye katlar. *Varsayılan: yalnız masaüstü Chromium/Firefox; Safari'de rakip poster görseli + CSS nefes.*
2. **Parite vektörleri (F3-3):** `contracts/rolet-near/tests/` altına yalnız yeni bir test dosyası (`vectors_export.rs`, src değişmeden) eklenebilir mi? *Varsayılan: evet. Hayır denirse F3-3 atlanır, parite F3-1/F3-2'deki elle aktarılmış senaryolarla sınırlı kalır.*

PLAN-F3 DONE
