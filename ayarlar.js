// ayarlar.js — botun ayarlarını ayarlar.json dosyasında saklar.
// Panelden değiştirilen her şey buraya yazılır; dosyayı elle de düzenleyebilirsiniz.
// Uygulama (Electron) olarak çalışınca dosya kullanıcının kendi klasöründe tutulur
// (MCBOT_VERI ortam değişkeni); "node bot.js" ile çalışınca bu klasörde.

const fs = require('fs')
const path = require('path')

const KLASOR = process.env.MCBOT_VERI || __dirname
const DOSYA = path.join(KLASOR, 'ayarlar.json')
const HESAP_KLASORU = path.join(KLASOR, 'hesap') // Microsoft girişinin hatırlandığı yer (paylaşmayın!)

const VARSAYILAN = {
  tur: 'sunucu', // nereye girsin: 'sunucu' (adresi yazılan sunucu) ya da 'lan' ("LAN'a Aç" ile açılan dünya)
  lanAd: '', // LAN'da seçilen dünyanın adı (port değişse de aynı dünyayı bulmak için)
  host: '', // sunucu adresi (LAN'da dünyayı açan bilgisayarın adresi)
  port: null, // boş (null) ise otomatik bulunur
  username: 'MCBot', // botun oyundaki adı (Microsoft girişinde ad hesaptan gelir)
  version: '1.21.4', // sunucunun Minecraft sürümü; boş ise otomatik
  giris: 'offline', // 'offline' (korsan/offline-mode sunucu) ya da 'microsoft' (gerçek hesap)
  sahipler: [], // botu yönetebilenler (boşsa kimse komut veremez)
  paneliAc: true, // "node bot.js" ile başlayınca paneli tarayıcıda otomatik aç
  kurulumTamam: false, // ilk açılış sihirbazı tamamlandı mı
}

// Harf, rakam, _ ve nokta (.). Nokta, Bedrock oyuncularının (.Ahmet gibi) adlarında da kullanılır.
const ISIM_KURALI = /^[A-Za-z0-9_.]{3,16}$/

function oku() {
  try {
    const veri = JSON.parse(fs.readFileSync(DOSYA, 'utf8'))
    // Eski sürümden kalan dosya: sunucu adresi yazılıysa kurulum yapılmış sayılır
    if (veri.kurulumTamam === undefined) veri.kurulumTamam = Boolean(veri.host)
    return { ...VARSAYILAN, ...veri }
  } catch (e) {
    if (e.code !== 'ENOENT') console.log('ayarlar.json okunamadı, varsayılanlar kullanılıyor:', e.message)
    if (e.code === 'ENOENT') yaz(VARSAYILAN) // ilk çalıştırmada dosyayı oluştur
    return { ...VARSAYILAN }
  }
}

function yaz(ayar) {
  fs.mkdirSync(KLASOR, { recursive: true })
  fs.writeFileSync(DOSYA, JSON.stringify(ayar, null, 2) + '\n', 'utf8')
}

// Gelen ayarları kontrol eder. Hata varsa { hata: '...' }, yoksa { ayar } döner.
function dogrula(gelen) {
  const ayar = { ...oku() }

  if (gelen.host !== undefined) {
    let host = String(gelen.host).trim()
    let port = gelen.port
    // "adres:port" şeklinde yazıldıysa ayır
    const m = host.match(/^(.+):(\d+)$/)
    if (m) {
      host = m[1]
      port = m[2]
    }
    if (!host || /\s/.test(host)) return { hata: 'Sunucu adresi boş olamaz ve boşluk içeremez.' }
    ayar.host = host
    gelen = { ...gelen, port }
  }

  if (gelen.port !== undefined) {
    const p = String(gelen.port ?? '').trim()
    if (p === '') {
      ayar.port = null
    } else {
      const n = Number(p)
      if (!Number.isInteger(n) || n < 1 || n > 65535) return { hata: 'Port 1 ile 65535 arasında bir sayı olmalı (ya da boş bırakın).' }
      ayar.port = n
    }
  }

  if (gelen.username !== undefined) {
    const isim = String(gelen.username).trim()
    if (!ISIM_KURALI.test(isim)) {
      return { hata: 'Bot adı 3-16 karakter olmalı; sadece İngilizce harf, rakam, _ ve . (nokta) kullanılabilir.' }
    }
    ayar.username = isim
  }

  if (gelen.version !== undefined) {
    const v = String(gelen.version).trim().toLowerCase()
    if (v === '' || v === 'otomatik') {
      ayar.version = ''
    } else if (!/^\d+\.\d+(\.\d+)?$/.test(v)) {
      return { hata: 'Sürüm 1.21.4 gibi yazılmalı (ya da otomatik için boş bırakın).' }
    } else {
      ayar.version = v
    }
  }

  if (gelen.giris !== undefined) {
    if (!['offline', 'microsoft'].includes(gelen.giris)) return { hata: 'Giriş türü geçersiz.' }
    ayar.giris = gelen.giris
  }

  if (gelen.sahipler !== undefined) {
    if (!Array.isArray(gelen.sahipler)) return { hata: 'Sahipler listesi bozuk.' }
    const liste = []
    for (const s of gelen.sahipler) {
      const isim = String(s).trim()
      if (!isim) continue
      if (!ISIM_KURALI.test(isim)) return { hata: `"${isim}" geçerli bir Minecraft adı değil.` }
      if (!liste.some((x) => x.toLowerCase() === isim.toLowerCase())) liste.push(isim)
    }
    ayar.sahipler = liste
  }

  if (gelen.tur !== undefined) {
    if (!['sunucu', 'lan'].includes(gelen.tur)) return { hata: 'Bağlantı türü geçersiz.' }
    ayar.tur = gelen.tur
  }
  if (gelen.lanAd !== undefined) ayar.lanAd = String(gelen.lanAd).slice(0, 100)

  if (gelen.paneliAc !== undefined) ayar.paneliAc = Boolean(gelen.paneliAc)
  if (gelen.kurulumTamam !== undefined) ayar.kurulumTamam = Boolean(gelen.kurulumTamam)

  if (ayar.kurulumTamam && !ayar.host) {
    return { hata: ayar.tur === 'lan' ? 'Listeden bir LAN dünyası seçin.' : 'Sunucu adresi yazılmalı.' }
  }
  return { ayar }
}

module.exports = { oku, yaz, dogrula, DOSYA, KLASOR, HESAP_KLASORU }
