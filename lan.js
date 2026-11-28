// lan.js — "LAN'a Aç" ile açılan Minecraft (Java) dünyalarını bulur.
// Açık bir LAN dünyası her 1,5 saniyede bir ağa "buradayım" duyurusu yapar:
//   224.0.2.60 adresine, 4445 portuna (UDP)  ->  "[MOTD]Dünya adı[/MOTD][AD]54321[/AD]"
// Biz bu duyuruları dinleyip dünyanın adını, bilgisayarın adresini ve portunu çıkarırız.
// Port her "LAN'a Aç"ta değişir; bot bağlanmadan hemen önce güncel portu buradan alır.

const dgram = require('dgram')
const os = require('os')

const GRUP = '224.0.2.60'
const PORT = 4445
const ESKIME_MS = 8000 // bu kadar süredir duyuru gelmeyen dünya kapanmış sayılır

const dunyalar = new Map() // "adres:port" -> { ad, host, port, yerel, son }
let soket = null
let sonHata = null

// Bu bilgisayarın kendi adresleri (dünya aynı bilgisayardaysa 127.0.0.1 ile bağlanırız)
function yerelAdresler() {
  const liste = ['127.0.0.1']
  for (const kartlar of Object.values(os.networkInterfaces())) {
    for (const a of kartlar || []) if (a.family === 'IPv4' || a.family === 4) liste.push(a.address)
  }
  return liste
}

// Dünya adındaki renk kodlarını (§a gibi) temizle
const temizle = (s) => String(s || '').replace(/§./g, '').trim()

function dinle() {
  if (soket) return
  try {
    soket = dgram.createSocket({ type: 'udp4', reuseAddr: true }) // oyun da aynı portu dinleyebilsin
    soket.on('error', (e) => {
      sonHata = e.message
      console.log('LAN dünyaları dinlenemiyor:', e.message)
      try { soket.close() } catch (x) { /* zaten kapalı */ }
      soket = null
    })
    soket.on('message', (veri, kimden) => {
      const metin = veri.toString('utf8')
      const ad = (metin.match(/\[MOTD\]([\s\S]*?)\[\/MOTD\]/) || [])[1]
      const adres = (metin.match(/\[AD\]([\s\S]*?)\[\/AD\]/) || [])[1]
      if (adres === undefined) return
      const port = Number(String(adres).split(':').pop())
      if (!Number.isInteger(port) || port < 1 || port > 65535) return
      const yerel = yerelAdresler().includes(kimden.address)
      const host = yerel ? '127.0.0.1' : kimden.address
      dunyalar.set(`${host}:${port}`, { ad: temizle(ad) || 'LAN dünyası', host, port, yerel, son: Date.now() })
    })
    soket.bind(PORT, () => {
      // Her ağ kartından (Wi-Fi, kablo) gelen duyuruları duyabilmek için hepsinde gruba katıl
      let katildi = false
      for (const a of yerelAdresler()) {
        try { soket.addMembership(GRUP, a); katildi = true } catch (e) { /* bu kartta olmadı */ }
      }
      if (!katildi) {
        try { soket.addMembership(GRUP) } catch (e) { sonHata = e.message }
      }
    })
  } catch (e) {
    sonHata = e.message
    soket = null
  }
}

// Şu an açık görünen LAN dünyaları (en son duyulan önce)
function liste() {
  const simdi = Date.now()
  for (const [k, d] of dunyalar) if (simdi - d.son > ESKIME_MS * 4) dunyalar.delete(k)
  return [...dunyalar.values()]
    .filter((d) => simdi - d.son < ESKIME_MS)
    .sort((x, y) => y.son - x.son)
    .map(({ ad, host, port, yerel }) => ({ ad, host, port, yerel }))
}

// Bağlanmak için dünya seç: önce kayıtlı adres + aynı ad, sonra aynı adres, sonra aynı ad,
// hiçbiri yoksa ve tek bir dünya açıksa o.
function sec(host, ad) {
  const l = liste()
  return l.find((d) => d.host === host && d.ad === ad) || l.find((d) => d.host === host) ||
    l.find((d) => ad && d.ad === ad) || (l.length === 1 ? l[0] : null)
}

function durum() {
  return { dinliyor: Boolean(soket), hata: sonHata }
}

module.exports = { dinle, liste, sec, durum }
