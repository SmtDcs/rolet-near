# Rolet NEAR — Tasarım Brief'i (sıfırdan)

Hedef: NEAR Hackathon 2026 için Rolet'i NEAR'a taşımak. Eski tasarım notlarını (DEVAM.md, docs/GUN-HANDLING.md, README'deki 3D/2D kararları) YOK SAY. Sıfırdan yeni bir tasarım dokümanı yaz.

## Oynanış: Buckshot Roulette'in birebir kopyası
- Buckshot Roulette'in (Mike Klubnika, 2023) oynanışını referans al ve olduğu gibi kopyala: tur yapısı, karışık dolu/boş fişek yüklemesi ve sayıların gösterilmesi, kendine ya da rakibe ateş etme kararı, boşla kendine ateş edince sıranın sende kalması, can (şarj) sistemi, eşyalar (büyüteç, sigara, bira, kelepçe, testere vb.) ve etkileri, turlar arası eşya dağıtımı, kazanma/kaybetme.
- Animasyonlar ve hisler de dahil: silahı alma, namluyu kendine/rakibe çevirme, atış, boş tıklama, ekran flaşı/karartma, fişek çıkarma, eşya kullanma animasyonları, kamera açıları, ses tasarımı.
- Önce Buckshot Roulette'in oynanışını ve animasyonlarını adım adım ayrıntılı tarif et (bildiğin kadarıyla, emin olmadığın yeri işaretle), sonra Rolet'te bunun nasıl birebir yapılacağını yaz.
- FARKLI olacak tek şey çevre/ortam tasarımı (mekan, atmosfer, karakter görünüşleri). Buckshot'ın kirli gece kulübü tuvaleti yerine özgün bir ortam öner (2-3 seçenek, birini öner).
- 3D model/karakter üretimi Meshy AI ile yapılacak: hangi assetlerin Meshy'den geleceğini listele.

## NEAR tarafı (önceden kararlaştırıldı)
- near-sdk-rs kontrat.
- Simetrik katılım, host yok: iki oyuncu da join(commit, karakter) çağırır, ikinci join'de maç otomatik başlar.
- Karakter NFT (NEP-171), kontrat mint eder; giriş bileti, her girişte durability düşer.
- Treasury: satın almadan pay alır, kazanana sabit NEAR ödül.
- Function-call access key ile cüzdansız tur hamleleri (pitch'in ana noktası).
- Rastgelelik: commit-reveal + env::random_seed.
- Mevcut Next.js UI, kuyruk ve kurallar mümkün olduğunca kalır.
- Q-002: başka zincirdeki mevcut ürün sorun değil, sadece NEAR işi puanlanır ve açıklanmalı.

## Çıktı
- docs/near/DESIGN.md yaz: oynanış (Buckshot birebir), animasyon listesi, ortam önerisi, Meshy asset listesi, NEAR mimarisi, oyun motoru seçimi (repo'daki mevcut Godot/Next.js'e bakarak gerekçeli), yapım sırası (kontrat+testler → access key → UI/oyun bağlantısı → animasyonlar), riskler.
- KOD YAZMA. Sadece doküman. Kodlamayı sonra başka bir ajan yapacak; görevleri ona verilebilecek küçük parçalara böl (docs/near/TASKS.md).
