// evler.js — botun yaptığı evlerin listesi (ayarlar.json içinde "evler" olarak saklanır).
// Bu evlerin blokları korunur: yol bulucu kırmaz, !topla tas gibi işler kazmaz.
// Her ev sunucu adresiyle birlikte kaydedilir; başka sunucuya geçince o sunucunun evleri geçerli olur.
// Ev kutusu: ortanın (x,y,z) ±2 yanı, zemin (y-1) dahil çatıya (y+3) kadar.
// Köylü evi (tur: 'koylu'): y = içerideki zemin hizası; taş taban y-1, çit korkuluk y+4'e kadar,
// kapının önündeki merdiven basamağı da (x, y-1, z+3) korunur.

const ayarlar = require('./ayarlar')

let onbellek = null
let zaman = 0

function hepsi() {
  if (!onbellek || Date.now() - zaman > 5000) {
    const a = ayarlar.oku()
    onbellek = (a.evler || []).filter((e) => e.sunucu === a.host)
    zaman = Date.now()
  }
  return onbellek
}

function ekle(m, tur = 'tas') {
  const a = ayarlar.oku()
  const evler = Array.isArray(a.evler) ? a.evler : []
  if (evler.some((e) => e.sunucu === a.host && e.x === m.x && e.y === m.y && e.z === m.z)) return
  evler.push({ sunucu: a.host, x: m.x, y: m.y, z: m.z, tur })
  ayarlar.yaz({ ...a, evler })
  onbellek = null
  console.log(`[Ev] Kaydedildi, artık korunuyor: ${m.x} ${m.y} ${m.z}`)
}

function evinde(p, e, pay = 0) {
  const x = Math.floor(p.x)
  const y = Math.floor(p.y)
  const z = Math.floor(p.z)
  const koylu = e.tur === 'koylu'
  if (koylu && x === e.x && z === e.z + 3 && y === e.y - 1) return true // kapı önündeki basamak
  return Math.abs(x - e.x) <= 2 + pay && Math.abs(z - e.z) <= 2 + pay &&
    y >= e.y - 1 && y <= e.y + (koylu ? 4 : 3)
}

// Bu konumdaki blok bir evimizin parçası mı? (kırılmasın)
function korunuyorMu(p) {
  for (const e of hepsi()) if (evinde(p, e)) return true
  return false
}

// Yeni ev için seçilen yer (orta noktası m) başka bir evimize çok yakın mı?
// 8 blok: iki ev arasında yürüme payı ve kapı önü boş kalsın
function yakindaEvVar(m, mesafe = 8) {
  return hepsi().some((e) => Math.max(Math.abs(e.x - m.x), Math.abs(e.z - m.z)) < mesafe && Math.abs(e.y - m.y) <= 6)
}

// Bot şu an bir evimizin içinde mi? (duvarların içi: ortanın ±1 yanı)
function icindekiEv(p) {
  for (const e of hepsi()) {
    if (Math.abs(Math.floor(p.x) - e.x) <= 1 && Math.abs(Math.floor(p.z) - e.z) <= 1 &&
      Math.floor(p.y) >= e.y - 1 && Math.floor(p.y) <= e.y + 2) return e
  }
  return null
}

// bot.js bunu "evin içindeysen kapıyı aç" fonksiyonuyla değiştirir; gelisim.js yürümeden önce çağırır
const kanca = { kapiyiAc: async () => {} }

// Yol bulucu ahşap kapıları (açık olsalar bile) duvar sanır ve kırıp geçmeye çalışır.
// Bu ayar kapıları "içinden geçilebilir" sayar; yürürken kapıyı bot.js açar.
const GECILIR_KAPI = (ad) => ad.endsWith('_door') && ad !== 'iron_door'
function kapilardanGec(hareket) {
  const asil = hareket.getBlock.bind(hareket)
  hareket.getBlock = (pos, dx, dy, dz) => {
    const b = asil(pos, dx, dy, dz)
    if (b && b.name && GECILIR_KAPI(b.name)) {
      b.safe = true
      b.physical = false
      b.replaceable = false
    }
    return b
  }
  return hareket
}

module.exports = { hepsi, ekle, yakindaEvVar, korunuyorMu, icindekiEv, kanca, kapilardanGec, GECILIR_KAPI }
