# Kararlar (DESIGN §10) — 14 Kasım 2026
1. Maç formatı: best-of-3.
2. Ortam: A, saat kulesi makine dairesi.
3. Eşya adları: özgün prop adları (DESIGN §3.4).
4. Ekonomi testnet: DESIGN §4.9 varsayılanları aynen (karakter 1 NEAR, %5 ops, durability 10, ödül 0.1 NEAR, allowance 0.5 NEAR).
5. Cüzdan: @near-wallet-selector ile MyNearWallet + Meteor (testnet).
Kurallar: push yok, deploy yok, mainnet yok. Commit'ler sadece yerel `near` dalında.
6. Kamera: birinci şahıs (oyuncunun gözünden), Buckshot gibi: masaya oturmuş oyuncunun bakışı, rakip karşıda, silah ve eşyalar masada. Tüm sahne ve animasyonlar buna göre (§3.7, §6).
7. R2 eşya torbası (FIX-12): hikâye beşlisi `[Loupe, Pipe, Flask, Shackle, Hacksaw]` (Config `rounds[1].item_bag`). DoN eşyaları (`Ticker`, `Magnet`, `Lockpick`, `Tincture`) PvP tırmanışı için yalnızca R3 torbasına (`rounds[2].item_bag`, 9 eşya) bilinçli olarak konmuştur.
8. `Ticker` ≤1 fişek kuralı (FIX-12): Buckshot birebir — tek veya sıfır fişek kaldığında `Ticker` tüketilir ve `ItemResult::None` üretir (bilgi yok).
9. `Pipe` tam can kuralı (FIX-12): maksimum candayken `Pipe` reddedilir ve eşya korunur (`GameError::ItemBlocked`, UX kararı — kazara boşa harcamayı önler).
10. **Değerler Rolet, mekanik Buckshot (14 Kas 2026):** Sayısal oyun değerleri orijinal Rolet (Solana) sürümünden alınır (`Config` varsayılanları: her round `start_hp = 4`, `load_size = 8`, `max_items = 4`, R1 dahil her round `items_per_load = 4` [Samet kararı: elde 4 eşya kuralı R1'de de geçerli], `tincture_good_pct = 40`, R3 `heal_cut_at = Some(2)`), oynanış mekanikleri ise (kendine/rakibe ateş, boşla kendine ateşte sıranın kalması, Buckshot eşya mekanikleri, best-of-3 round yapısı, R3 iyileşme kesilmesi, animasyonlar) Buckshot Roulette'ten gelir. Her yüklemede tabanca 8 gözlüdür ve dolu sayısı `ChainSource` rastgeleliğiyle `Config.min_live..=Config.max_live` (varsayılan `2..=6`, en az 2 kuru sıkı) aralığından seçilir; seçilen `(live, blank)` sayıları `MatchView` ve `LoadStarted` olayıyla iki oyuncuya açıkça duyurulur, sıra ise gizli kalır ve atış anında lazy draw ile çekilir. `REFERENCE-CHECK.md` yalnızca Buckshot mekanik referansı olarak kalır.
