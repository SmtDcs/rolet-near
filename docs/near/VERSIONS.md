# Sürümler (T-002) — 14 Kasım 2026

> DESIGN R13: bu dosya araç ve bağımlılık sürümlerini **sabitler**; `contracts/rolet-near` ve
> `apps/web` bu tabloya uymak zorundadır. Paket sürümleri crates.io / npm registry API'lerinden,
> araç sürümleri makinede 14 Kasım 2026'da ölçülerek alınmıştır.
>
> Not: `near --version` (`near-cli-rs 0.31.1`) yerelde ağ işlemi yapılmadan ölçülmüştür (FIX-F2-2).
> Testnet işlemleri (deploy / T-119) Samet onayı beklemektedir; canlı CLI çağrısı yapılmamıştır.

## Rust gereksinimi

Ölçülen rustc **1.96.0**, seçilen crate'lerin MSRV'sini (rustc ≥ 1.95, edition 2024) karşılıyor.
Sürüm çakışması yaşanırsa: `rustup update stable`.

## Araçlar (ölçülmüş, 2026-11-14)

| Araç | Sürüm | Resmi doküman |
|---|---|---|
| rustc | **1.96.0** (ac68faa20 2026-05-25) | https://doc.rust-lang.org/ · https://github.com/rust-lang/rust/releases |
| cargo | **1.96.0** (30a34c682 2026-05-25) | https://doc.rust-lang.org/cargo/ |
| cargo-near (`cargo near`) | **0.23.0** (`cargo-near-near 0.23.0`) | https://github.com/near/cargo-near · https://crates.io/crates/cargo-near |
| near CLI (near-cli-rs) | **0.31.1** (`near-cli-rs 0.31.1`, FIX-F2-2 `near --version`) | https://near.cli.com/ · https://github.com/near/near-cli-rs |
| Godot | **4.7.2.stable** (`4.7.2.stable.arch_linux.ed1daf0bf`) | https://docs.godotengine.org/en/stable/ |
| Node.js | **v24.22.2** | https://nodejs.org/en/about/releases |
| pnpm | **10.33.2** (kök `package.json` → `packageManager` ile uyumlu) | https://pnpm.io/ |
| tsx (devDependency) | **4.23.15** | https://www.npmjs.com/package/tsx |
| near-sandbox ikilisi | **2.14.1** (`contracts/rolet-near/target/debug/build/near-sandbox-*/out/.near/near-sandbox-2.14.1/near-sandbox`) | https://github.com/near/near-sandbox |
| git | **2.56.0** | https://git-scm.com/docs |

## Kontrat crate'leri (`contracts/rolet-near/Cargo.toml`)

| Crate | Sürüm | Nerede kullanılır | Resmi doküman |
|---|---|---|---|
| near-sdk | **=5.30.2** (2026-11-13) | tüm kontrat | https://crates.io/crates/near-sdk · https://docs.rs/near-sdk · https://github.com/near/near-sdk-rs |
| near-contract-standards | **=5.30.2** (2026-11-13; near-sdk ile aynı yayın treni) | T-109 NFT (NEP-171/177/181) | https://crates.io/crates/near-contract-standards · https://docs.rs/near-contract-standards |
| near-workspaces | **=0.24.0** (2026-10-26) | T-117 sandbox entegrasyon testleri (dev-dependency) | https://crates.io/crates/near-workspaces · https://github.com/near/near-workspaces-rs |
| borsh | **=1.8.1** (near-sdk 5.30.2'nin kilitlediği sürüm; derive'lar `borsh`'u doğrudan aradığı için manifest bağımlılığı) | tüm kontrat state tipleri | https://crates.io/crates/borsh · https://docs.rs/borsh |

## npm paketleri (`apps/web`, F2/F3 görevlerinde eklenecek)

| Paket | Sürüm | Resmi doküman |
|---|---|---|
| @near-wallet-selector/core | **10.1.4** | https://www.npmjs.com/package/@near-wallet-selector/core · https://github.com/near/wallet-selector |
| @near-wallet-selector/modal-ui | **10.1.4** | https://www.npmjs.com/package/@near-wallet-selector/modal-ui |
| @near-wallet-selector/my-near-wallet | **10.1.4** | https://www.npmjs.com/package/@near-wallet-selector/my-near-wallet |
| @near-wallet-selector/meteor-wallet | **10.1.4** | https://www.npmjs.com/package/@near-wallet-selector/meteor-wallet |
| @near-js/accounts | **2.5.1** | https://www.npmjs.com/package/@near-js/accounts · https://github.com/near/near-api-js |
| @near-js/crypto | **2.5.1** | https://www.npmjs.com/package/@near-js/crypto |
| @near-js/keystores | **2.5.1** | https://www.npmjs.com/package/@near-js/keystores |
| @near-js/signers | **2.5.1** | https://www.npmjs.com/package/@near-js/signers |
| @near-js/transactions | **2.5.1** | https://www.npmjs.com/package/@near-js/transactions |
| @near-js/providers | **2.5.1** | https://www.npmjs.com/package/@near-js/providers |
| @near-js/types | **2.5.1** | https://www.npmjs.com/package/@near-js/types |
| @near-js/utils | **2.5.1** | https://www.npmjs.com/package/@near-js/utils |
| tsx (devDependency) | **4.23.15** | https://www.npmjs.com/package/tsx |
| near-api-js (şemsiye paket) | **kullanılmaz** (`PLAN-F2` §2: doğrudan `@near-js/* 2.5.1` kullanılır; `@meteorwallet/sdk` alt bağımlılığı için `pnpm-workspace.yaml` `overrides` ile tüm `@near-js/*` paketleri tek kopya `2.5.1` olarak kilitlenmiştir) | https://www.npmjs.com/package/near-api-js · https://docs.near.org/build/front-end/near-api-js/quick-reference |

## Gaz ölçümleri (`VALUES-FIX-05` / `FIX-16`, sandbox 2026-11-14)

`tests/integration.rs` sandbox testlerinde (`near-workspaces 0.24.0`, VALUES varsayılanlarıyla: her round `start_hp = 4`, `items_per_load = 4`, `max_items = 4`, `load_size = 8`, `reward = 0.1 NEAR`) ölçülen `total_gas_burnt` değerleri:

| İşlem / Dal | Ölçülen gaz | Not |
|---|---|---|
| `buy_character` | **2.792 Tgas** (`2_791_741_322_790`) | Mint + %5/%95 bölüşüm + metadata |
| `join` | **3.094 Tgas** | Token kilitleme + maç kaydı + top-100 leaderboard |
| `cancel` | **3.0 Tgas** | Maç silme + durability/treasury iadesi |
| `reveal` (1. oyuncu) | **2.257 Tgas** | Commit doğrulama + sır kaydı |
| `reveal` (2. oyuncu, R1 4+4 eşya) | **2.822 Tgas** | Seed türetimi + R1 yükleme + 4+4 eşya |
| `use_item` (9 eşyanın en pahalısı) | **2.635 Tgas** | Loupe, Pipe, Flask, Shackle, Hacksaw, Ticker, Magnet, Tincture, Lockpick |
| `fire` (normal atış max) | **3.010 Tgas** | Lazy draw + sıra/durum güncellemesi |
| `fire` (R2 reload 4+4 eşya) | **3.253 Tgas** | Round geçişi + R2 yükleme + 4+4 eşya dağıtımı |
| `fire` (maç sonu + transfer) | **4.423 Tgas** | `RoundEnded` + `MatchEnded` + budama + ödül transferi (`Promise`) |
| `claim_timeout` (`Revealing`) | **4.1 Tgas** | Reveal timeout + silme + iade/ceza |
| `claim_timeout` (`Active`) | **4.2 Tgas** | Turn timeout + `finish_match` + ödül transferi |
| `join` (dolu top-100, 64B hesap adları) | **3.688 Tgas** (100. giriş) / **3.398 Tgas** (100+ dolu) | `top_scores` (`LazyOption`, <1 KB) + `top_slots`/`top_slot_of` (FIX-F2-6 / FIX-F2B-1) |
| `fire` (normal atış, dolu top-100) | **3.227 Tgas** | `top_scores` kökten ayrı olduğu için normal `fire` etkilenmez (FIX-F2-6) |
| `fire` (maç sonu + transfer, dolu 100×64B, yerinde güncelleme) | **4.959 Tgas** (`4_958_835_378_846`) | `finish_match` + `update_leaderboard_batch` mevcut üye güncellemesi (FIX-F2-6) |
| `fire` (maç sonu + transfer, dolu 100×64B, kovma dalı) | **5.296 Tgas** (`5_296_380_675_734`) | Tabloya girmemiş kazananın `(0, 1)` kuyruğunu kovduğu `update_leaderboard_batch` dalı (FIX-F2B-1) |

- **Güvenlik payı (`MIN_ACTION_GAS`):** Kontrat eşiği `15 Tgas` (FIX-F2B-1). Boş listede en pahalı dal `4.423 Tgas` (**3.39×** pay); 100 girişli (64 karakterlik hesap adlı) dolu leaderboard'da yerinde güncelleme `4.959 Tgas` (**3.02×** pay), kovma dalı dahil en pahalı dal (`5.296 Tgas`) ise **2.83×** güvenlik payına sahiptir (`5.296 × 2 = 10.593 Tgas <= 15 Tgas`).

## Notlar

- Cüzdan entegrasyon rehberi: https://docs.near.org/tools/wallet-selector (T-201 spike sonucu `docs/near/WALLETS.md`'ye yazılacak).
- Serde/borsh doğrudan bağımlılık DEĞİL: `near_sdk::serde`, `near_sdk::borsh`, `near_sdk::serde_json` yeniden dışa aktarımları kullanılır (derive'larda `#[serde(crate = "near_sdk::serde")]`).
- `apps/server/` (Solana programı) ve `packages/shared/` bu tablodan etkilenmez; dokunulmaz (TASKS genel kural).
- Godot web export boyutu ve soğuk yükleme ölçümleri T-505/T-560'ta bu dosyaya eklenecek.
