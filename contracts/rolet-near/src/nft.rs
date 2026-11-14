//! Karakter NFT'si (T-109, DESIGN §3.5/§4.7/§4.9): NEP-171/177/181.
//!
//! `near-contract-standards` `NonFungibleToken` koleksiyonu kullanılır; oyun
//! durumu (`CharacterState`) paralel bir haritada tutulur. Kilitli (maçtaki)
//! token'ın `nft_transfer`'i reddedilir — override'lı NEP-171 metodları
//! delegasyondan **önce** kilit kontrolü yapar.
//!
//! `buy_character` cüzdanla (deposit'li) çağrılır; function-call key deposit
//! ekleyemediğinden (DESIGN §4.3) oyun anahtarlarıyla satın alma imkânsızdır.

use crate::{Contract, ContractExt};
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, require, AccountId, NearToken, Promise, PromiseOrValue};

/// Başlangıç karakteri (DESIGN §3.5: Kuleci, Ayarcı, Kaçak).
/// Rust tanımlayıcıları ASCII'dir; JSON'da varyant adları görünür.
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub enum Kind {
    /// Yaşlı çan bekçisi.
    Kuleci,
    /// Maskeli genç saatçi.
    Ayarci,
    /// Palto ve gaz maskeli yabancı.
    Kacak,
}

impl Kind {
    /// Token ID ve görsel yolundaki ASCII kod adı.
    pub fn as_str(&self) -> &'static str {
        match self {
            Kind::Kuleci => "kuleci",
            Kind::Ayarci => "ayarci",
            Kind::Kacak => "kacak",
        }
    }
}

/// Token başına oyun durumu (DESIGN §4.5 `CharacterState`).
#[derive(
    BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct CharacterState {
    pub kind: Kind,
    /// Her `join` −1; 0 olunca maçlara girilemez (DESIGN §4.9).
    pub durability: u8,
    /// Bu token'ın kilitli olduğu maçın ID'si; `None` = serbest.
    pub locked_in: Option<u64>,
}

/// `self.character` için kontrat depolaması sarmalayıcısı; `matches.rs` (T-110)
/// ve `views.rs` (T-115) de kullanır.
impl Contract {
    pub fn character_state(&self, token_id: &TokenId) -> Option<CharacterState> {
        self.character.get(token_id)
    }
}

#[near]
impl Contract {
    /// Karakter satın alır: tam fiyat zorunlu, fazla ödeme iade; `ops_bps`
    /// payı ops'a, kalan treasury'ye (DESIGN §4.9). Mint NEP-171 olayı yayar.
    #[payable]
    pub fn buy_character(&mut self, kind: Kind) -> TokenId {
        require!(!self.paused, "contract is paused");
        let storage_before = env::storage_usage();
        let price = self.config.price;
        let deposit = env::attached_deposit();
        require!(deposit >= price, "insufficient payment");
        let buyer = env::predecessor_account_id();

        // Bölüşüm: %5 ops / %95 treasury (testnet varsayılanları, DESIGN §4.9).
        let ops_yocto = price.as_yoctonear() * self.config.ops_bps as u128 / 10_000;
        let ops = NearToken::from_yoctonear(ops_yocto);
        self.treasury = self.treasury.saturating_add(price.saturating_sub(ops));
        self.ops_balance = self.ops_balance.saturating_add(ops);

        // token_id = "<kind>:<n>"; nonce her mint'te artar.
        self.mint_nonce += 1;
        let token_id = format!("{}:{}", kind.as_str(), self.mint_nonce);
        let metadata = TokenMetadata {
            title: Some(format!("Rolet karakteri: {}", kind.as_str())),
            description: Some("Saat kulesi makine dairesi düellosu karakteri.".to_string()),
            // Karakter portresi (T-507'de üretilir; web uygulamasına göreceli yol).
            media: Some(format!("/character/{}.webp", kind.as_str())),
            extra: Some(
                near_sdk::serde_json::json!({
                    "kind": kind,
                    "durability": self.config.durability,
                })
                .to_string(),
            ),
            ..Default::default()
        };
        // `refund_id = None`: depozito fiyat olarak kontratta kalır, satın alan
        // tarafa depozito iadesi yapılmaz (standart `internal_mint` aksine —
        // o, eklene depozitonun depolama fazlasını geri gönderir). Mint olayını
        // biz yayarız (`internal_mint_with_refund` yaymaz).
        self.tokens.internal_mint_with_refund(token_id.clone(), buyer.clone(), Some(metadata), None);
        near_contract_standards::non_fungible_token::events::NftMint {
            owner_id: &buyer,
            token_ids: &[&token_id],
            memo: None,
        }
        .emit();
        self.character.insert(
            &token_id,
            &CharacterState { kind, durability: self.config.durability, locked_in: None },
        );
        self.settle_storage(storage_before);

        // Fazla ödemeyi iade et (görev: "fazla ödeme iade").
        let refund = deposit.saturating_sub(price);
        if refund > NearToken::ZERO {
            Promise::new(buyer).transfer(refund).detach();
        }
        token_id
    }

    /// Token maçta kilitliyse reddeder; silinmeyen token için kontrol atlanır.
    fn assert_token_unlocked(&self, token_id: &TokenId) {
        if let Some(state) = self.character.get(token_id) {
            require!(state.locked_in.is_none(), "token is locked in a match");
        }
    }

    /// NEP-171: kilitli token transfer edilemez (DESIGN §4.5).
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.assert_token_unlocked(&token_id);
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    /// NEP-171: `nft_transfer_call` de kilit kontrolünden geçer.
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.assert_token_unlocked(&token_id);
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    /// NEP-171: token görüntüleme.
    pub fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }

    /// NEP-181: toplam arz.
    pub fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    /// NEP-181: tüm token'lar (sayfalı).
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    /// NEP-181: bir hesabın token sayısı.
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    /// NEP-181: bir hesabın token'ları (sayfalı).
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

/// NEP-177: kontrat üstü metadata (durumda tutulmaz, sabit).
#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Rolet".to_string(),
            symbol: "ROLET".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

/// Yukarıdaki `#[near] impl Contract` bloğu NEP-171/181 arayüzlerini birebir
/// dışa aktarır; ayrıca trait implementasyonu gerekmez.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Config;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::NearToken;

    fn setup(attached: NearToken, predecessor: &str) -> Contract {
        let ctx = VMContextBuilder::new()
            .predecessor_account_id(predecessor.parse().unwrap())
            .attached_deposit(attached)
            .build();
        near_sdk::testing_env!(ctx);
        Contract::new("owner.testnet".parse().unwrap(), Config::default())
    }

    fn one_near() -> NearToken {
        NearToken::from_near(1)
    }

    /// T-109: eksik ödeme reddedilir, hiçbir şey yazılmaz.
    #[test]
    #[should_panic(expected = "insufficient payment")]
    fn buy_character_rejects_insufficient_payment() {
        let mut c = setup(NearToken::from_millinear(990), "alice.testnet");
        c.buy_character(Kind::Kuleci);
    }

    /// T-109 bitti kuralı: bölüşüm doğru (0.95 treasury / 0.05 ops, depolama
    /// maliyeti treasury'den düşer) ve mint çalışır.
    #[test]
    fn buy_character_splits_payment_and_mints() {
        let mut c = setup(one_near(), "alice.testnet");
        let storage_before = env::storage_usage();
        let token_id = c.buy_character(Kind::Kuleci);
        let storage_delta = env::storage_usage().saturating_sub(storage_before) as u128;
        let storage_cost =
            NearToken::from_yoctonear(storage_delta * env::storage_byte_cost().as_yoctonear());
        assert!(storage_cost > NearToken::ZERO);
        assert_eq!(token_id, "kuleci:1");
        assert_eq!(c.treasury, NearToken::from_millinear(950).saturating_sub(storage_cost));
        assert_eq!(c.ops_balance, NearToken::from_millinear(50));
        c.assert_solvent();
        assert_eq!(c.character_state(&token_id).unwrap().durability, 10);
        assert_eq!(c.character_state(&token_id).unwrap().locked_in, None);
        assert_eq!(c.character_state(&token_id).unwrap().kind, Kind::Kuleci);
        assert!(c.tokens.owner_by_id.get(&token_id) == Some("alice.testnet".parse().unwrap()));
        assert_eq!(c.nft_total_supply(), U128(1));
        // Farklı kind, artan nonce.
        let second = c.buy_character(Kind::Kacak);
        assert_eq!(second, "kacak:2");
        assert_eq!(c.nft_total_supply(), U128(2));
        // Satıştan hiçbir iade çıkmaz (tam fiyat).
        assert!(get_created_receipts().is_empty());
        c.assert_solvent();
    }

    /// T-109: fazla ödeme iade edilir; bölüşüm tam fiyat üzerinden yapılır.
    #[test]
    fn buy_character_refunds_excess_deposit() {
        let mut c = setup(NearToken::from_near(2), "alice.testnet");
        let storage_before = env::storage_usage();
        c.buy_character(Kind::Ayarci);
        let storage_delta = env::storage_usage().saturating_sub(storage_before) as u128;
        let storage_cost =
            NearToken::from_yoctonear(storage_delta * env::storage_byte_cost().as_yoctonear());
        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id, "alice.testnet".parse::<AccountId>().unwrap());
        assert!(receipts[0].actions.iter().any(|a| match a {
            near_sdk::mock::MockAction::Transfer { deposit, .. } =>
                *deposit == NearToken::from_near(1),
            _ => false,
        }));
        assert_eq!(c.treasury, NearToken::from_millinear(950).saturating_sub(storage_cost));
        assert_eq!(c.ops_balance, NearToken::from_millinear(50));
        c.assert_solvent();
    }

    /// T-109: token metadata'sı (media/extra) NEP-177 alanlarıyla uyumlu.
    #[test]
    fn buy_character_sets_token_metadata() {
        let mut c = setup(one_near(), "alice.testnet");
        let token_id = c.buy_character(Kind::Kuleci);
        let token = c.nft_token(token_id).expect("mintlenmiş token");
        assert_eq!(token.owner_id, "alice.testnet".parse::<AccountId>().unwrap());
        let meta = token.metadata.expect("metadata kaydedilmeli");
        assert_eq!(meta.media.as_deref(), Some("/character/kuleci.webp"));
        let extra: near_sdk::serde_json::Value =
            near_sdk::serde_json::from_str(meta.extra.as_deref().unwrap()).unwrap();
        assert_eq!(extra["kind"], "Kuleci");
        assert_eq!(extra["durability"], 10);
        assert_eq!(c.nft_metadata().spec, NFT_METADATA_SPEC);
        assert_eq!(c.nft_metadata().symbol, "ROLET");
    }

    /// T-109 bitti kuralı: kilitli token'ın transferi reddedilir.
    #[test]
    #[should_panic(expected = "token is locked in a match")]
    fn locked_token_transfer_rejected() {
        let mut c = setup(one_near(), "alice.testnet");
        let token_id = c.buy_character(Kind::Kuleci);
        // Maçta kilitli gibi işaretle (T-110'da join yapar).
        let mut state = c.character_state(&token_id).unwrap();
        state.locked_in = Some(7);
        c.character.insert(&token_id, &state);

        let ctx = VMContextBuilder::new()
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(1))
            .build();
        near_sdk::testing_env!(ctx);
        c.nft_transfer("bob.testnet".parse().unwrap(), token_id, None, None);
    }

    /// T-109: serbest token transfer edilebilir; sahiplik değişir.
    #[test]
    fn unlocked_token_transfer_succeeds() {
        let mut c = setup(one_near(), "alice.testnet");
        let token_id = c.buy_character(Kind::Kuleci);
        let ctx = VMContextBuilder::new()
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(1))
            .build();
        near_sdk::testing_env!(ctx);
        c.nft_transfer("bob.testnet".parse().unwrap(), token_id.clone(), None, None);
        assert_eq!(
            c.nft_token(token_id).unwrap().owner_id,
            "bob.testnet".parse::<AccountId>().unwrap()
        );
        // Enumeration: sahiplik listesi de taşındı.
        let bob_tokens = c.nft_tokens_for_owner("bob.testnet".parse().unwrap(), None, None);
        assert_eq!(bob_tokens.len(), 1);
        assert_eq!(
            c.nft_supply_for_owner("alice.testnet".parse().unwrap()),
            U128(0)
        );
        c.assert_solvent();
    }

    /// T-109: pause'dayken satış yok.
    #[test]
    #[should_panic(expected = "contract is paused")]
    fn paused_contract_rejects_purchase() {
        // pause'u owner çağırır, sonra alıcı bağlamına dönülür.
        let mut c = {
            let ctx = VMContextBuilder::new()
                .predecessor_account_id("owner.testnet".parse().unwrap())
                .build();
            near_sdk::testing_env!(ctx);
            let mut c = Contract::new("owner.testnet".parse().unwrap(), Config::default());
            c.pause();
            c
        };
        let ctx = VMContextBuilder::new()
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .attached_deposit(one_near())
            .build();
        near_sdk::testing_env!(ctx);
        c.buy_character(Kind::Kuleci);
    }
}
