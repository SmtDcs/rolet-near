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
