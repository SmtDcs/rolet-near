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
