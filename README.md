# MCBot

VoidTraveler tarafından yapılmıştır.

Türkçe komutlarla çalışan bir Minecraft (Java Edition) botu. Sohbete `!gel`, `!topla odun 32`, `!gelis` gibi komutlar yazarsınız; bot yürür, kazar, eşya yapar, kendini korur. Kendi kontrol paneli vardır: can, açlık, envanter, kuş bakışı harita ve kayıtlar canlı görünür. Yeni sürüm çıkınca panel haber verir.

## Kurulum (kullanıcılar için)

1. **Releases** bölümünden `MCBot-Kurulum-x.y.z.exe` dosyasını indirip çalıştırın.
2. Windows "Bilgisayarınız korundu" uyarısı verebilir (uygulama imzalı olmadığı için). **Ek bilgi → Yine de çalıştır** deyin.
3. Uygulama açılınca kurulum ekranı gelir: sunucu adresini, sunucu türünü, bot adını ve **kendi oyundaki adınızı** yazın. Botu sadece siz (ve sonradan eklediğiniz sahipler) yönetebilir.

### Sunucu türü
- **Korsan / offline sunucu** (ör. Aternos'ta "Cracked" açık): Bota istediğiniz adı verirsiniz.
- **Normal (online) sunucu:** Bot için satın alınmış ayrı bir Minecraft hesabı gerekir. Panel bir kod gösterir; microsoft.com/link adresinde kodu girip o hesapla bir kere giriş yaparsınız.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `!yardim` | Komut listesini yazar |
| `!gel`, `!git x y z`, `!takip [isim]`, `!dur` | Yanına gelir, koordinata gider, takip eder, durur |
| `!vur [isim]`, `!yumruk [isim]` | Saldırır |
| `!gelis` | Kendi kendine gelişir: odun → taş → demir → full demir set |
| `!gelis2` | Demir setten sonra derine inip elmas set için çalışır |
| `!yardimet` | Bot yardım isteyince herkes yazabilir: malzemeyi verir, yaptığınız eşyayı geri alır |
| `!ver [isim] eşya [adet\|hepsi]` | Eşya atar. Örnek: `!ver demir 10` |
| `!sandik [hepsi\|eşya]` | En yakın sandığa eşya koyar |
| `!topla malzeme [adet]` | odun, tas, komur, demir, bakir, altin, toprak, kum, cakil |
| `!yap eşya [adet]` | Üretir. Örnek: `!yap mesale 8`, `!yap tas kazma` |
| `!uyu`, `!uyu oto` | Gece yatağa gidip uyur / her gece kendisi uyusun |
| `!ev`, `!ev koylu` | Kendine ev yapar: taş ev ya da köylü evi (aşağıdaki **Evler** bölümüne bakın) |
| `!spawn`, `!gom`, `!egil`, `!kalk`, `!konum`, `!durum`, `!envanter`, `!yaz mesaj` | Diğer komutlar |

Türkçe harfle de yazılabilir (`!göm`, `!kılıç`, `!ev köylü` gibi).

## Evler

Bot yakında düz ve boş bir yer bulup kendine ev yapar. Malzemeyi kendisi toplar ve üretir. Yarıda kalırsa (`!dur`, ölüm, bağlantı kopması) aynı komutu tekrar yazınca sadece eksikleri tamamlar. Evleri birbirinden en az 8 blok uzağa kurar ki kapıların önü kapanmasın.

| Komut | Ev | Malzeme (yaklaşık) |
|---|---|---|
| `!ev` | **Taş ev** — dışı 5×5, içi 3×3. Taş duvarlar, düz tahta çatı, kapı; içinde çalışma masası, meşale, (varsa) yatak | 46 taş, 10 kütük |
| `!ev koylu` | **Köylü evi** — eski köylerdeki klasik ev. Dışı 5×5, içi 3×3. Yerden bir blok yüksek taş taban, köşelerde taş sütunlar, tahta duvarlar, üstte yatay kütük kuşak, çit korkuluklu düz çatı, üç duvarda cam pencere, kapı ve önünde merdiven basamağı. İçinde çalışma masası, sandık, yatak ve meşale | 45 taş, 45–50 kütük, 6 kum, 3 yün |

Köylü evi için:
- **Yün:** Yatak için aynı renkten 3 yün gerekir. Bot koyun arar; **makası varsa kırkar, yoksa keser**. Kuzulara ve kırkılmış koyunlara dokunmaz. Yakında koyun yoksa evi yataksız yapar ve söyler.
- **Cam:** Kumu fırında eritip cam panel yapar. Kum bulamazsa pencereleri boş bırakır; kum bulununca `!ev koylu` tekrar yazılırsa tamamlar.
- **Meşale:** Kömürü yoksa fırında bir kütükten odun kömürü yapar.
- Yer: 5×5 düz zemin, üstünde 6 blok boşluk ve kapı önünde 2 blok gerekir. Malzeme sıfırdan toplanıyorsa iş uzun sürebilir.

## Kurallar — lütfen okuyun

- Botu **yalnızca bot kullanımına izin veren sunucularda** kullanın. Birçok ücretsiz sunucu sitesi (Aternos, FalixNodes vb.) sunucuyu açık tutmak için bot bağlamayı yasaklar; hesabınız kapatılabilir.
- Başkalarının sunucusunda kullanmadan önce sunucu sahibinden izin alın.
- Bu proje Mojang veya Microsoft ile ilişkili değildir. Minecraft, Mojang AB'nin ticari markasıdır.

## Telefondan (Bedrock) oyuncular ve farklı sürümler: Geyser ve ViaVersion

Bot, Java Edition sunucusuna bağlanır. Sunucuya iki eklenti kurarak hem telefondaki **Bedrock** oyuncularını hem de **farklı sürümdeki** oyuncuları (ve botu) aynı sunucuya alabilirsiniz:

| Eklenti | Ne işe yarar |
|---|---|
| **Geyser** (+ **Floodgate**) | Bedrock oyuncuları (telefon, tablet, Windows Bedrock, konsol) Java sunucusuna girebilir. Floodgate sayesinde Java hesabı satın almaları gerekmez. |
| **ViaVersion** | Sunucudan **daha yeni** sürümdeki oyuncular girebilir. Geyser yeni bir Java oyuncusu gibi bağlandığı için eski bir sunucuda (ör. 1.21.4) Geyser'le birlikte **gereklidir**. |
| **ViaBackwards** | Sunucudan **daha eski** sürümdeki oyuncular girebilir (ViaVersion da kurulu olmalı). Sunucunuzu yeni bir Minecraft sürümüne yükseltirseniz, 1.21.4'te çalışan **bot** bununla bağlanmaya devam eder. |

Bu eklentiler **Paper** (önerilir) ya da Spigot sunucularında çalışır; düz "Vanilla" sunucuda eklenti kurulamaz.

### Aternos'ta

1. Sunucu sayfasında **Yazılım (Software)** bölümünden **Paper**'ı seçin (sürüm aynı kalabilir).
2. **Eklentiler (Plugins)** bölümünde **Geyser**'i aratıp kurun. **Floodgate otomatik olarak** onunla birlikte kurulur. Aternos'ta Geyser ayarları hazır gelir; dosyalarına dokunmayın. (Ayarları sıfırladıysanız `clone-remote-port: true` olmalı.)
3. Aynı yerden **ViaVersion**'ı kurun. Sunucunuzu bot sürümünden (1.21.4) daha yeni bir sürüme yükselttiyseniz **ViaBackwards**'ı da kurun.
4. Sunucuyu yeniden başlatın.
5. **Bedrock oyuncuları nasıl girer:** Java oyuncularıyla **aynı adres ve aynı port** (sunucu sayfasında **Bağlan / Connect**'e tıklayınca görünür). Telefondan tek tıkla eklemek için şu link paylaşılabilir: `https://add.aternos.org/SUNUCUADINIZ`
6. Yeni bir Bedrock sürümü çıkınca Geyser'i aynı yerden yeniden kurun.

> Not: Aternos'ta Geyser ile sesli sohbet (voice chat) eklentisi birlikte çalışmaz; ikisi de aynı UDP portunu ister.

### Kendi bilgisayarınızdaki (ya da kiraladığınız) Paper sunucusunda

1. Eklentileri indirin (hepsi `.jar` dosyası):
   - Geyser ve Floodgate: **geysermc.org/download** → *Spigot/Paper* sürümleri
   - ViaVersion: **hangar.papermc.io/ViaVersion/ViaVersion**
   - ViaBackwards (gerekiyorsa): **hangar.papermc.io/ViaVersion/ViaBackwards**
2. Sunucuyu kapatın, `.jar` dosyalarını sunucu klasöründeki **`plugins`** klasörüne koyun ve sunucuyu başlatın.
3. `plugins/Geyser-Spigot/config.yml` dosyasında `bedrock:` bölümündeki **port**'u kontrol edin (varsayılan **19132**). Bu port Java sunucusunun portundan (25565) farklı olmalı ve başka hiçbir program kullanmamalı. Değiştirdiyseniz sunucuyu yeniden başlatın.
4. `server.properties` içinde `enforce-secure-profile=false` yapın; yoksa Bedrock oyuncuları sohbete yazamayabilir.
5. **Bedrock oyuncuları nasıl girer:**
   - Aynı evdeki internetten: bilgisayarın yerel IP'si (`192.168.…`) ve port **19132**.
   - Dışarıdan: modemde **19132** portunu hem **TCP hem UDP** için açın ve oyuncular genel IP'nizle bağlansın. Port açamıyorsanız **playit.gg** kullanın (ngrok UDP desteklemediği için çalışmaz).

### Bot sahibi olarak Bedrock oyuncusu

Floodgate, Bedrock oyuncularının adının başına nokta koyar (ör. `.Ahmet`). Bir Bedrock oyuncusunu bota sahip yapmak için panelde **sahipler** listesine adını **noktasıyla birlikte** yazın.

## Telefon uygulaması (Android)

MCBot'un Android sürümü de var: **Releases** bölümünden `MCBot-x.y.z.apk` dosyasını telefona indirip açın.

1. Android "bilinmeyen kaynaklardan uygulama yükleme" izni isteyebilir; dosyayı hangi uygulamayla (Chrome, Dosyalar…) açtıysanız ona izin verin.
2. Uygulamada **Başlat**'a basın. Bot arka planda çalışmaya başlar; bildirim çubuğunda **"MCBot çalışıyor"** bildirimi görünür. Android, arka planda çalışan uygulamaların bu bildirimi göstermesini zorunlu tutar.
3. Uygulama ilk açılışta **pil optimizasyonundan çıkarma** izni ister: **İzin ver** deyin. Yoksa bazı telefonlar (Xiaomi, Samsung, Huawei…) botu bir süre sonra kapatabilir.
4. **Durdur**'a basana kadar (ya da bildirimdeki **Durdur**'a dokunana kadar) bot çalışmaya devam eder; uygulamayı kapatsanız bile.
5. Panel bilgisayardakiyle aynıdır ve uygulamanın içinde açılır.

Telefon sürümü bilgisayar sürümüyle **aynı bot kodunu** kullanır; komutlar ve özellikler aynıdır. Sadece Android vardır (iPhone, arka planda sürekli çalışan uygulamalara izin vermez).

## Geliştiriciler için

Gerekenler: [Node.js](https://nodejs.org) (LTS sürümü).

```bash
npm install          # ilk seferde: kütüphaneleri ve Electron'u indirir
npm start            # uygulamayı pencereli çalıştırır
npm run bot          # pencere olmadan, eski usul (panel tarayıcıda açılır)
npm run dagit        # dist/ klasörüne Windows kurulum dosyası yapar
```

Dosyalar:
- `main.js` — uygulama penceresi (Electron)
- `bot.js` — bağlantı ve sohbet komutları
- `gelisim.js`, `gelisim2.js` — `!gelis` ve `!gelis2` beyni
- `komutlar.js` — `!ver`, `!sandik`, `!topla`, `!yap`, `!uyu`
- `ev.js` — `!ev` (taş ev) ve evlerin ortak blok koyma araçları
- `koylu.js` — `!ev koylu` (köylü evi: plan, yün/cam/meşale hazırlığı, inşaat)
- `evler.js` — yapılan evlerin listesi: bot bu evlerin bloklarını kırmaz, kapılarından açarak geçer
- `harita.js` — paneldeki kuş bakışı harita
- `guncelleme.js` — GitHub'da yeni sürüm var mı diye bakar (`package.json` içindeki `repository` alanına göre)
- `panel.js` — kontrol paneli (sadece bu bilgisayardan erişilir)
- `ayarlar.js` — ayarlar. Uygulamada ayarlar `%APPDATA%\MCBot\ayarlar.json` dosyasında durur.

### Telefon (Android) sürümü

Telefon sürümü **aynı bot dosyalarını** kullanır; sadece kabuğu farklıdır (`android/` klasörü):

- `android/hazirla.js` — derlemeden önce ortak bot dosyalarını (`package.json` → `build.files`) telefona kopyalar, telefon kütüphanelerini ekler, telefonda çalışan Node.js motorunu ([nodejs-mobile](https://github.com/nodejs-mobile/nodejs-mobile)) indirir.
- `android/nodejs-project/` — telefon kütüphaneleri. nodejs-mobile Node 18 tabanlı olduğu için burada Node 18 ile çalışan sürümler sabitlenmiştir (mineflayer 4.25, Minecraft 1.20–1.21.4).
- `android/app/` — Android uygulaması: Başlat/Durdur, arka plan servisi (bildirimli), panel.

Yani bir özelliği **bir kez** eklemek yeter; iki sürüm de alır. Yeni bir `.js` dosyası eklenirse `package.json` → `build.files` listesine yazılmalıdır.

### Otomatik derleme (GitHub Actions)

`.github/workflows/derle.yml`: GitHub'da yeni bir **Release** yayınlandığında Windows kurulum dosyası ve Android APK'sı otomatik derlenip o Release'e eklenir. Yayından önce `package.json`'daki `version` artırılmalı ve Release etiketi ona uymalı (ör. `1.2.0` → `v1.2.0`).

Android APK'nın hep aynı anahtarla imzalanması için depoya iki **secret** girilmelidir: `MCBOT_IMZA_DOSYASI` ve `MCBOT_IMZA_SIFRE` (*Settings → Secrets and variables → Actions*). İmza anahtarı (`imza/` klasörü) **asla** depoya yüklenmez.

Microsoft girişi `hesap/` klasöründe saklanır. **Bu klasörü ve `ayarlar.json` dosyasını kimseyle paylaşmayın, GitHub'a yüklemeyin** (`.gitignore` bunları zaten dışarıda tutar).

## Lisans

MIT © 2026 VoidTraveler. Ayrıntılar `LICENSE` dosyasında.
