# MCBot

VoidTraveler tarafından yapılmıştır.

Türkçe komutlarla çalışan bir Minecraft (Java Edition) botu. Sohbete `!gel`, `!topla odun 32`, `!gelis` gibi komutlar yazarsınız; bot yürür, kazar, eşya yapar, kendini korur. Kendi kontrol paneli vardır: can, açlık, envanter ve kayıtlar canlı görünür.

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
| `!spawn`, `!gom`, `!egil`, `!kalk`, `!konum`, `!durum`, `!envanter`, `!yaz mesaj` | Diğer komutlar |

Türkçe harfle de yazılabilir (`!göm`, `!kılıç` gibi).

## Kurallar — lütfen okuyun

- Botu **yalnızca bot kullanımına izin veren sunucularda** kullanın. Birçok ücretsiz sunucu sitesi (Aternos, FalixNodes vb.) sunucuyu açık tutmak için bot bağlamayı yasaklar; hesabınız kapatılabilir.
- Başkalarının sunucusunda kullanmadan önce sunucu sahibinden izin alın.
- Bu proje Mojang veya Microsoft ile ilişkili değildir. Minecraft, Mojang AB'nin ticari markasıdır.

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
- `panel.js` — kontrol paneli (sadece bu bilgisayardan erişilir)
- `ayarlar.js` — ayarlar. Uygulamada ayarlar `%APPDATA%\MCBot\ayarlar.json` dosyasında durur.

Microsoft girişi `hesap/` klasöründe saklanır. **Bu klasörü ve `ayarlar.json` dosyasını kimseyle paylaşmayın, GitHub'a yüklemeyin** (`.gitignore` bunları zaten dışarıda tutar).

## Lisans

MIT © 2026 VoidTraveler. Ayrıntılar `LICENSE` dosyasında.
