# Sürümler (T-002) — 14 Kasım 2026

> DESIGN R13: bu dosya araç ve bağımlılık sürümlerini **sabitler**; `contracts/rolet-near` ve
> `apps/web` bu tabloya uymak zorundadır. Paket sürümleri crates.io / npm registry API'lerinden,
> araç sürümleri makinede 14 Kasım 2026'da ölçülerek alınmıştır.
>
> Not: `near --version` bu repoda uygulanan `Shell(near:*)` reddi kuralı nedeniyle ölçülemedi
> (kural bilinçli: near CLI ile hesap/işlem yapılmayacak). near CLI'ın kurulu olduğuna DESIGN §1
> tanımıyla inanılıyor; gerekirse elle ölçülüp bu satır güncellenir.

## Rust gereksinimi

Ölçülen rustc **1.96.0**, seçilen crate'lerin MSRV'sini (rustc ≥ 1.95, edition 2024) karşılıyor.
Sürüm çakışması yaşanırsa: `rustup update stable`.

## Araçlar (ölçülmüş, 2026-11-14)

| Araç | Sürüm | Resmi doküman |
|---|---|---|
| rustc | **1.96.0** (ac68faa20 2026-05-25) | https://doc.rust-lang.org/ · https://github.com/rust-lang/rust/releases |
| cargo | **1.96.0** (30a34c682 2026-05-25) | https://doc.rust-lang.org/cargo/ |
| cargo-near (`cargo near`) | **0.23.0** (`cargo-near-near 0.23.0`) | https://github.com/near/cargo-near · https://crates.io/crates/cargo-near |
| near CLI (near-cli-rs) | ölçülemedi (reddi kuralı; bkz. not) | https://near.cli.com/ · https://github.com/near/near-cli-rs |
| Godot | **4.7.2.stable** (`4.7.2.stable.arch_linux.ed1daf0bf`) | https://docs.godotengine.org/en/stable/ |
| Node.js | **v24.22.2** | https://nodejs.org/en/about/releases |
| pnpm | **10.33.2** (kök `package.json` → `packageManager` ile uyumlu) | https://pnpm.io/ |
| git | **2.56.0** | https://git-scm.com/docs |

## Kontrat crate'leri (`contracts/rolet-near/Cargo.toml`)

| Crate | Sürüm | Nerede kullanılır | Resmi doküman |
|---|---|---|---|
| near-sdk | **=5.30.2** (2026-11-13) | tüm kontrat | https://crates.io/crates/near-sdk · https://docs.rs/near-sdk · https://github.com/near/near-sdk-rs |
| near-contract-standards | **=5.30.2** (2026-11-13; near-sdk ile aynı yayın treni) | T-109 NFT (NEP-171/177/181) | https://crates.io/crates/near-contract-standards · https://docs.rs/near-contract-standards |
| near-workspaces | **=0.24.0** (2026-10-26) | T-117 sandbox entegrasyon testleri (dev-dependency) | https://crates.io/crates/near-workspaces · https://github.com/near/near-workspaces-rs |

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
| near-api-js (şemsiye paket) | **7.5.3** (`engines: node >= 22.22.2` — ölçülen node 24.22.2 uyumlu) | https://www.npmjs.com/package/near-api-js · https://docs.near.org/build/front-end/near-api-js/quick-reference |

## Notlar

- Cüzdan entegrasyon rehberi: https://docs.near.org/tools/wallet-selector (T-201 spike sonucu `docs/near/WALLETS.md`'ye yazılacak).
- Serde/borsh doğrudan bağımlılık DEĞİL: `near_sdk::serde`, `near_sdk::borsh`, `near_sdk::serde_json` yeniden dışa aktarımları kullanılır (derive'larda `#[serde(crate = "near_sdk::serde")]`).
- `apps/server/` (Solana programı) ve `packages/shared/` bu tablodan etkilenmez; dokunulmaz (TASKS genel kural).
- Godot web export boyutu ve soğuk yükleme ölçümleri T-505/T-560'ta bu dosyaya eklenecek.
