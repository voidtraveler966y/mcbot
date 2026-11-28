// kopya.js — !kopya: komut almayan AFK kopya botlar.
// Kopyalar oyunda sadece durur; tek tepki verdikleri komut sahiplerin yazdığı !gom.
//   !kopya [adet]   -> 1-5 kopya bot açar (varsayılan 1). Adları: BotAdı_K1, BotAdı_K2 ...
//   !kopya kapat    -> bütün kopyaları oyundan çıkarır
//   !gom            -> ana bot ve bütün kopyalar gömülür
//   !gom MCBot_K2   -> sadece o bot gömülür (!gom k2 ya da !gom 2 de olur); /msg ile yazılırsa sadece o bot
// Aternos kuralı: sunucuda hiç sahip kalmayınca kopyalar kendiliğinden çıkar (ana bot çıkmaz).
// Kopyalar sadece offline (korsan) sunucularda açılabilir: her biri ayrı bir oyuncu sayılır.

const mineflayer = require('mineflayer')
const { Vec3 } = require('vec3')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const ayarlar = require('./ayarlar')

const EN_FAZLA = 5
const GIRIS_ARASI_MS = 5000 // sunucular art arda girişleri engelleyebiliyor
const SAHIP_KONTROL_MS = 5000
const ARAMA_YARICAPI = 16

// Elle (aletsiz) çabuk kazılan ve düşmeyen bloklar. Kum/çakıl yok: üstü kapatılınca başa düşer.
const YUMUSAK = new Set([
  'dirt', 'grass_block', 'coarse_dirt', 'rooted_dirt', 'podzol', 'mycelium', 'farmland',
  'dirt_path', 'clay', 'mud', 'moss_block', 'snow_block', 'soul_soil',
])
const DUSEN = (isim) => ['sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel'].includes(isim) ||
  isim.endsWith('concrete_powder')

const kopyalar = new Map() // numara -> bot
const bekleyenler = new Map() // numara -> zamanlayıcı (sırası gelince bağlanacak kopyalar)
let baglanti = null // { host, port, version } ana botun bağlandığı sunucu

function sadelestir(metin) {
  return metin.toLocaleLowerCase('tr')
    .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
}

function yetkiliMi(kim) {
  return ayarlar.oku().sahipler.some((s) => s.toLowerCase() === kim.toLowerCase())
}

// "!gom X" yazılınca X bu bota mı söyleniyor? (tam ad; kopyada ayrıca "k2" ya da "2")
function adEslesir(botAdi, yazilan, numara = null) {
  const y = sadelestir(yazilan)
  if (y === sadelestir(botAdi)) return true
  return numara !== null && (y === 'k' + numara || y === String(numara))
}

function kopyaAdi(numara) {
  return ayarlar.oku().username.slice(0, 13) + '_K' + numara
}

// ------------------------------------------------------------------ gömülme
const katiMi = (b) => Boolean(b && b.boundingBox === 'block')
const sivi = (b) => b && ['water', 'lava'].includes(b.name)

// Zaten kapalı bir çukurda mı? (başının üstü ve dört yanı dolu)
function gomuluMu(bot) {
  const p = bot.entity.position.floored()
  if (!katiMi(bot.blockAt(p.offset(0, 2, 0)))) return false
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([x, z]) => katiMi(bot.blockAt(p.offset(x, 0, z))))
}

// Ayak hücresi ayak olarak bu konumda durulursa gömülebilir mi?
function uygunMu(bot, ayak) {
  const bas = bot.blockAt(ayak.offset(0, 1, 0))
  const ayakB = bot.blockAt(ayak)
  if (!ayakB || katiMi(ayakB) || sivi(ayakB) || !bas || katiMi(bas) || sivi(bas)) return false
  for (let i = 1; i <= 3; i++) {
    const b = bot.blockAt(ayak.offset(0, -i, 0))
    if (!b || !YUMUSAK.has(b.name)) return false
  }
  // Çukurun dibi sağlam olsun (mağaraya ya da suya düşmesin)
  const dip = bot.blockAt(ayak.offset(0, -4, 0))
  if (!katiMi(dip)) return false
  // Kapatırken yaslanacağı duvar: çukurun ağzının (ayak-1) yanlarından en az biri katı olmalı
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([x, z]) => katiMi(bot.blockAt(ayak.offset(x, -1, z))))
}

function adaylar(bot) {
  const idler = [...YUMUSAK].map((a) => bot.registry.blocksByName[a]).filter(Boolean).map((b) => b.id)
  const ben = bot.entity.position
  return bot.findBlocks({ matching: idler, maxDistance: ARAMA_YARICAPI, count: 400 })
    .map((p) => p.offset(0, 1, 0))
    .filter((ayak) => Math.abs(ayak.y - ben.y) <= 6 && uygunMu(bot, ayak))
    .sort((a, b) => a.distanceTo(ben) - b.distanceTo(ben))
}

async function gom(bot) {
  if (gomuluMu(bot)) return 'Zaten gömülüyüm.'
  let yer = bot.entity.position.floored()
  if (!uygunMu(bot, yer)) {
    const liste = adaylar(bot)
    if (!liste.length) throw new Error(`${ARAMA_YARICAPI} blok içinde kazabileceğim toprak yok (aletim yok, taşı kazamam)`)
    let vardi = false
    for (const aday of liste.slice(0, 4)) {
      try {
        await bot.pathfinder.goto(new goals.GoalBlock(aday.x, aday.y, aday.z))
        yer = aday
        vardi = true
        break
      } catch (e) { /* oraya yol yok, sıradakini dene */ }
    }
    if (!vardi) throw new Error('topraklı yere yürüyemedim')
  }

  for (let i = 0; i < 3; i++) {
    const alt = bot.blockAt(bot.entity.position.floored().offset(0, -1, 0))
    if (!alt || !YUMUSAK.has(alt.name)) throw new Error('altım değişti (' + (alt ? alt.name : '?') + ')')
    await bot.dig(alt)
    await bot.waitForTicks(15) // düşmesini ve bloğu toplamasını bekle
  }

  const blok = bot.inventory.items().find((it) => bot.registry.blocksByName[it.name] && !DUSEN(it.name))
  if (!blok) throw new Error('üstümü kapatacak blok yok')
  await bot.equip(blok, 'hand')
  const p = bot.entity.position.floored()
  const hedef = p.offset(0, 2, 0)
  for (const y of [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]) {
    const ref = bot.blockAt(hedef.plus(y))
    if (katiMi(ref)) {
      await bot.lookAt(hedef.offset(0.5, 0.5, 0.5))
      await bot.placeBlock(ref, y.scaled(-1))
      return 'Tamam, içerdeyim.'
    }
  }
  throw new Error('yaslanacak duvar bulunamadı')
}

// ------------------------------------------------------------------ kopya bot
function kopyaAc(numara, haber) {
  const ad = kopyaAdi(numara)
  const log = (...m) => console.log(`[Kopya ${ad}]`, ...m)
  const bot = mineflayer.createBot({
    host: baglanti.host,
    port: baglanti.port,
    username: ad,
    version: baglanti.version || false,
    auth: 'offline',
  })
  kopyalar.set(numara, bot)
  bot.loadPlugin(pathfinder)
  let mesgul = false
  let sahipZamanlayici = null

  bot.once('spawn', () => {
    log('oyuna girdi')
    const hareket = new Movements(bot)
    hareket.canDig = false // yürürken hiçbir şey kırmasın
    hareket.scafoldingBlocks = []
    bot.pathfinder.setMovements(hareket)
    // Sunucuda hiç sahip kalmadıysa çık (oyuncu listesi gelsin diye ilk kontrol biraz gecikmeli)
    sahipZamanlayici = setInterval(() => {
      const sahipVar = Object.keys(bot.players).some((a) => a !== bot.username && yetkiliMi(a))
      if (!sahipVar) {
        log('sunucuda sahip kalmadı, çıkıyorum')
        bot.quit('Sahip çıktı')
      }
    }, SAHIP_KONTROL_MS)
  })

  async function komut(kim, mesaj, ozel) {
    if (kim === bot.username || !yetkiliMi(kim)) return
    const parcalar = sadelestir(mesaj.trim()).split(/\s+/)
    if (parcalar[0] !== '!gom') return
    const yazilan = mesaj.trim().split(/\s+/)[1]
    if (!ozel && yazilan && sadelestir(yazilan) !== 'hepsi' && !adEslesir(bot.username, yazilan, numara)) return
    const cevap = (m) => bot.whisper(kim, m) // sohbet kalabalık olmasın: kopyalar fısıldar
    if (mesgul) return cevap('Zaten gömülmeye çalışıyorum.')
    mesgul = true
    try {
      cevap(await gom(bot))
    } catch (e) {
      cevap('Gömülemedim: ' + e.message)
    } finally {
      mesgul = false
    }
  }
  bot.on('chat', (kim, mesaj) => komut(kim, mesaj, false))
  bot.on('whisper', (kim, mesaj) => komut(kim, mesaj, true))

  bot.on('kicked', (sebep) => {
    const metin = typeof sebep === 'string' ? sebep : JSON.stringify(sebep)
    log('atıldı:', metin)
    haber(`${ad} oyuna giremedi ya da atıldı: ${metin.slice(0, 120)}`)
  })
  bot.on('error', (e) => log('hata:', e.code || e.message))
  bot.on('end', () => {
    clearInterval(sahipZamanlayici)
    if (kopyalar.get(numara) === bot) kopyalar.delete(numara)
    log('çıktı')
  })
}

// ------------------------------------------------------------------ dışarıya açılanlar
function baglantiAyarla(b) { baglanti = b }

// !kopya [adet | kapat]
function komut(kelimeler, cevap) {
  const ilk = kelimeler[0] || ''
  if (['kapat', 'sil', 'cik', 'dur'].includes(ilk)) {
    const sayi = kopyalar.size + bekleyenler.size
    if (!sayi) return cevap('Açık kopya yok.')
    hepsiniKapat('Sahip kapattı')
    return cevap(`${sayi} kopya oyundan çıkıyor.`)
  }
  if (ayarlar.oku().giris === 'microsoft') {
    return cevap('Kopyalar sadece offline (korsan) sunucularda açılabilir; Microsoft girişinde her kopyaya ayrı hesap gerekir.')
  }
  if (!baglanti) return cevap('Daha dünyaya doğmadım, biraz bekle.')
  const adet = ilk ? Number(ilk) : 1
  if (!Number.isInteger(adet) || adet < 1) return cevap('Kullanım: !kopya 3  veya  !kopya kapat')
  const bos = []
  for (let n = 1; n <= EN_FAZLA && bos.length < adet; n++) {
    if (!kopyalar.has(n) && !bekleyenler.has(n)) bos.push(n)
  }
  if (!bos.length) return cevap(`En fazla ${EN_FAZLA} kopya açılabilir. Kapatmak için: !kopya kapat`)
  const haber = (m) => { try { cevap(m) } catch (e) { console.log(m) } }
  bos.forEach((n, i) => bekleyenler.set(n, setTimeout(() => {
    bekleyenler.delete(n)
    kopyaAc(n, haber)
  }, i * GIRIS_ARASI_MS)))
  cevap(`${bos.length} kopya geliyor (${bos.map(kopyaAdi).join(', ')})` +
    (bos.length > 1 ? `, ${GIRIS_ARASI_MS / 1000} sn arayla.` : '.') +
    (bos.length < adet ? ` En fazla ${EN_FAZLA} olabildiği için ${bos.length} tane.` : ''))
}

function hepsiniKapat(sebep = 'Kapatıldı') {
  for (const z of bekleyenler.values()) clearTimeout(z)
  bekleyenler.clear()
  for (const bot of kopyalar.values()) bot.quit(sebep)
  kopyalar.clear()
}

const liste = () => [...kopyalar.values()].map((b) => b.username)

module.exports = { komut, hepsiniKapat, baglantiAyarla, adEslesir, liste, EN_FAZLA }
