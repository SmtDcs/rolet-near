# Rolet NEAR — F2 İstemci Sözleşmesi Notları (`FIX-F2B-5`)

Bu belge, `docs/near/AUDIT-F2.md` §5 (`FIX-F2B-5`) uyarınca F2 web/oyun istemcisinin (`apps/web`, Godot köprüsü) Rolet NEAR akıllı kontratıyla (`contracts/rolet-near`) konuşurken uyması gereken zorunlu sözleşme kurallarını özetler.

---

## (a) `claim_reward` ve FunctionCall Erişim Anahtarı Sınırı

- Tarayıcıdaki `FunctionCall` access key (`Config.allowance_hint = 0.5 NEAR`) yalnızca oyun yaşam döngüsü metodlarına izin verir:
  `[join, reveal, cancel, fire, use_item, claim_timeout]` (`docs/near/DESIGN.md` §4.3).
- **`claim_reward`** (ve **`buy_character`**, **`nft_transfer`**) bu izin listesinde **değildir**. FC key ile çağrıldığında işlem kontrata hiç ulaşmadan NEAR erişim anahtarı doğrulamasında `InvalidAccessKeyError(MethodNameMismatch)` ile reddedilir (`contracts/rolet-near/tests/integration.rs`, `fix_f2_1_function_call_access_key_flow`).
- FC key ile yapılan herhangi bir çağrıya deposit eklenmesi de `InvalidAccessKeyError(DepositWithFunctionCall)` ile reddedilir.
- **İstemci kuralı:** `get_player(account_id).owed > 0` görüldüğünde UI `claim_reward` işlemini (tıpkı `buy_character` ve `nft_transfer` gibi) **cüzdan onayı** (Wallet Selector / full-access key) akışına yönlendirmelidir.
- **Gaz ön ödemesi notu:** `reveal`, `fire` ve `use_item` metodları en başta `env::prepaid_gas() >= MIN_ACTION_GAS` (`15 Tgas`, `contracts/rolet-near/src/matches.rs`) şartını arar. İşlem anında ön ödemeli gazın tamamı allowance'tan anlık rezerve edilip kullanılmayan kısım kesinleşmede iade edildiğinden (`docs/near/DESIGN.md` §4.3), istemci gereksiz `30 Tgas` yerine `MIN_ACTION_GAS`'a yakın bir ön ödeme (`15–20 Tgas`) eklemelidir.

---

## (b) `ItemResult::Private` Gizliliği (Rakip Aksiyonları)

- `Loupe` ve `Ticker` eşyaları kullanıldığında üretilen `Action::ItemUsed { player, item, slot, result: ItemResult::Private { pos, shell } }`, hem maç içi aksiyon günlüğüne (`Match.log`, `get_actions` çıktısı) hem de NEP-297 `EVENT_JSON` olay loglarına (`contracts/rolet-near/src/events.rs`) yazılır (`docs/near/DESIGN.md` §4.6 v1 bilinen sınır).
- **İstemci kuralı:** İstemci `get_actions` veya işlem sonucundan `Action::ItemUsed` aldığında `result` alanı `Private` ise ve `player != local_player_idx` (aksiyon rakibe ait) ise `pos` ve `shell` değerlerini **UI'da göstermemeli, loglamamalı ve oyun durumuna sızdırmamalıdır**; yalnızca rakibin eşyayı kullandığı genel animasyonu göstermelidir.

---

## (c) `get_actions` Pencere Boşluğunda `get_match` Snapshot'ı

- `Match.log` en fazla son `LOG_CAP = 32` aksiyonu tutar (`contracts/rolet-near/src/matches.rs`, `views.rs`).
- `get_actions(match_id, since_seq, players)` çağrısı `ActionsPage { first_seq, actions }` döner (`docs/near/schema/actions-page.json`).
- **İstemci kuralı:** İstemcinin son işlediği aksiyon sıra numarası `since_seq` iken dönen yanıtta **`first_seq > since_seq + 1`** ise aradaki aksiyonlar 32'lik log penceresi dışına taşarak silinmiştir. İstemci eksik aksiyonları tahmin etmeye çalışmamalı, hemen `get_match(match_id, players)` çağırarak tam `MatchView` snapshot'ı ile yerel durumu sıfırdan senkronize etmelidir (S-11, `docs/near/schema/match-view.json`).

---

## (d) `reveal` Sırlarının Gizli Tutulması (argv / log Yasağı)

- Commit-reveal akışında `join` sırasında gönderilen `commit = sha256(secret || account_id || match_id_le)` için üretilen 32 baytlık CSPRNG `secret` değeri, `reveal(match_id, secret)` işlemi zincire gönderilene kadar gizli tutulmalıdır.
- **İstemci kuralı:** `secret` değeri hiçbir zaman **komut satırı argümanlarına (`argv`), tarayıcı/sunucu konsol loglarına, analitik olaylarına veya URL parametrelerine** yazılmamalıdır (`AUDIT-F2.md` §4.2). Sır yalnızca istemci belleğinde (veya sayfa yenilemeye karşı korumalı yerel oturum deposunda) tutulmalı, doğrudan imzalanan RPC işlem gövdesinde gönderilmeli ve `reveal` onaylandıktan sonra temizlenmelidir.
- *(Not: `contracts/rolet-near/scripts/cli-match.sh` yalnızca CLI duman testi aracıdır ve sırrı komut argümanı olarak geçirir; F2 istemci implementasyonu için şablon olarak kullanılmamalıdır.)*
