# Rolet NEAR — Testnet Deploy ve E2E Akışı (T-118 / T-119)

> **Durum:** `T-119 Samet onayı bekliyor`
> Betikler ve doküman hazırlandı; gerçek testnet işlemleri (deploy, fonlama, CLI maçı) **Samet onayı** olmadan çalıştırılmamıştır.

---

## 1. Önkoşullar

- `cargo-near` (`0.23.0`) ve `near-cli-rs` kurulu
- Testnet'te açılmış sahip hesabı (`ROLET_OWNER_ID`), kontrat alt hesabı (`ROLET_CONTRACT_ID`) ve iki test oyuncu hesabı (`PLAYER_A`, `PLAYER_B`) keychain'de kayıtlı
- Lokal kontrat testlerinin yeşil olması:
  ```bash
  cd contracts/rolet-near
  cargo near build non-reproducible-wasm
  cargo test
  ```

---

## 2. T-118 — Testnet Deploy Betiği (`contracts/rolet-near/scripts/deploy-testnet.sh`)

### Önizleme (`--dry-run`, ağa dokunmaz)

```bash
cd contracts/rolet-near
ROLET_CONTRACT_ID=rolet.<hesap>.testnet \
ROLET_OWNER_ID=<hesap>.testnet \
  ./scripts/deploy-testnet.sh --dry-run
```

### Gerçek çalıştırma (Samet onayı sonrası)

Betik sırasıyla:
1. `cargo near build non-reproducible-wasm` ile WASM derler,
2. `rolet_near.wasm` dosyasını `new(owner, config)` (`Config::default()`, VALUES değerleri) ile deploy eder,
3. `fund_treasury` ile başlangıç ödül havuzunu (varsayılan `2 NEAR`) yükler,
4. `get_config` view çıktısını doğrular ve `apps/web/.env.local` içine `NEXT_PUBLIC_ROLET_CONTRACT` adresini yazar (takipli `.env.example` değiştirilmez). Betikler yalnızca `NEAR_NETWORK=testnet` ve `.testnet` sonekli hesapları kabul eder (`eval` kullanılmaz).

Beklenen kabul çıktısı: `near contract call-function as-read-only <ROLET_CONTRACT_ID> get_config ...` yanıtında `tincture_good_pct: 50`, `max_items: 4`, `load_size: 8`, `min_live: 2`, `max_live: 6`.

---

## 3. T-119 — İki Hesapla CLI Tam Maç Duman Testi (`contracts/rolet-near/scripts/cli-match.sh`)

> **T-119 Samet onayı bekliyor.**

### Önizleme (`--dry-run`)

```bash
cd contracts/rolet-near
ROLET_CONTRACT_ID=rolet.<hesap>.testnet \
PLAYER_A=alice.<hesap>.testnet \
PLAYER_B=bob.<hesap>.testnet \
  ./scripts/cli-match.sh --dry-run
```

### Gerçek çalıştırma adımları

1. İki hesap `buy_character` (`1 NEAR`) ile karakter NFT'si basar (`Kuleci` / `Ayarci`).
2. Her iki hesap `sha256(secret || account_id || match_id_le)` taahhüdüyle `join` çağırır.
3. İki taraf `reveal` yapar → maç `Active` durumuna geçer.
4. Betik `get_match` ile sıradaki oyuncuyu okuyup `Status == "Finished"` olana dek `fire(Opponent)` döngüsünü yürütür.
5. Çıktıda `MatchEnded` NEP-297 olayı (`EVENT_JSON:`) ve kazanan hesaba `0.1 NEAR` ödül transferi doğrulanır.

---

## 4. T-338 — Tarayıcı Testnet E2E Kontrol Listesi (F3 Sonrası 👤 Samet Adımları)

> Masaüstü **Chromium** ve **Firefox** hedeflidir. `apps/web/.env.local` dosyasında `NEXT_PUBLIC_ROLET_CONTRACT` ve `NEXT_PUBLIC_NEAR_NETWORK=testnet` tanımlı olmalıdır.

### 4.1 Sahne ve Pratik Kalibrasyonu
- [ ] `pnpm --filter web dev` ile `/dev/stage` sayfasını açıp **TAM YÜKLEME SENARYOSU** ile tüm P0/P1 beat'lerini izlemek ve revolver pozlarını (`cameraSpec.ts`, `gunPoses.ts`) onaylamak.
- [ ] `pnpm --filter web build && pnpm --filter web start` ile `/practice` (200) ve `/dev/stage` (404) durumlarını doğrulamak; baştan sona bir pratik maç oynayıp hissiyatı not etmek.

### 4.2 Cüzdan, Karakter & Sıralama (`/profile`, `/leaderboard`, `Nav`)
- [ ] İki ayrı testnet hesabıyla (`PLAYER_A`, `PLAYER_B` — MyNearWallet / Meteor) bağlan → `Nav`'da hesap ID ve çık butonunun düzgün çalıştığını doğrula.
- [ ] `/profile` üzerinden her iki hesapla en az birer karakter NFT satın al (`buy_character`, `1.00 NEAR`) ve sahip olunan kartlarda dayanıklılığın `10/10` göründüğünü doğrula.
- [ ] `/leaderboard` ve `/` (Ledger istatistikleri) üzerinde sözleşme verilerinin göründüğünü doğrula.

### 4.3 Canlı Düello, Reveal, Oynanış, Timeout & Ödül (`/duel`)
- [ ] İki tarayıcı penceresinde `/duel` aç → FC oyun anahtarı oluştur (`ensureGameKey`).
- [ ] Her iki tarafta `Eşleşme Sırasına Gir` (NEP-413 imza) → eşleşme sonrası `Maça Katıl (Join)` ve otomatik `Reveal` → maç `Active` durumuna geçiyor mu?
- [ ] 2–3 round oyna; Loupe kullanıldığında rakip tarayıcısında özel sonucun sızmadığını (konsol/UI) doğrula.
- [ ] Ayrı bir test maçında rakip tur süresinin (`45s + 2s` grace) dolmasını bekleyip HUD'daki `SÜRE DOLDU — KAZAN` (`claim_timeout`) butonunun çalıştığını doğrula.
- [ ] Kazanan hesapta `owed > 0` banner'ı / `/profile` üzerinden cüzdanla `claim_reward` çağırıp bakiyenin cüzdana geçtiğini doğrula.

### Kayıt Şablonu (Samet tarafından doldurulacak)

| Adım | Hesap | Tx Hash / Not |
|---|---|---|
| Contract Deploy (`new`) | `ROLET_CONTRACT_ID` | `<tx_hash>` |
| `buy_character` (Oyuncu A) | `PLAYER_A` | `<tx_hash>` |
| `buy_character` (Oyuncu B) | `PLAYER_B` | `<tx_hash>` |
| `addKey` + `join` (Oyuncu A) | `PLAYER_A` | `<tx_hash>` |
| `addKey` + `join` (Oyuncu B) | `PLAYER_B` | `<tx_hash>` |
| `reveal` + `MatchEnded` | `PLAYER_A` / `PLAYER_B` | `<tx_hash>` |
| `claim_timeout` | `<kazanan>` | `<tx_hash>` |
| `claim_reward` | `<kazanan>` | `<tx_hash>` |

