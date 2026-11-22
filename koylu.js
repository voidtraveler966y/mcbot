// koylu.js — !koylu komutu: bot kendine eski (klasik) köylü evini yapar. Dışı 5x5, içi 3x3.
//   Taban ve köşe sütunları kırık taş, duvarlar tahta, üstte yatay kütük kuşak,
//   düz tahta çatı ve çevresinde çit korkuluk. Üç duvarda cam pencere, ön duvarda kapı,
//   kapının önünde tahta merdiven basamağı.
//   İçeride: çalışma masası, sandık, yatak ve meşale.
// Malzemeyi kendisi toplar: ~45 taş, ~45 kütük, 6 kum (cam için), 3 yün (yatak için).
// Yün için koyun arar: makası varsa kırkar, yoksa keser.
// Yarıda kalırsa (!dur, ölüm, bağlantı kopması) tekrar !koylu yazınca kaldığı yerden tamamlar.
//
// Yan kesit (güneyden bakış; m = içerideki zemin hizasında evin ortası, y=0):
//   y=4   ç ç ç ç ç       ç = çit korkuluk
//   y=3   K K K K K       K = kütük (yatay), çatının ortası 3x3 tahta
//   y=2   T t t t T       T = kırık taş sütun, t = tahta duvar
//   y=1   T t k t T       k = kapı (y=0-1), yan ve arka duvarlarda y=1'de cam pencere
//   y=0   T t k t T
//   y=-1  T T T T T  m    taş taban (yerden 1 blok yüksek), önünde merdiven basamağı
//
// İçerisi (yukarıdan bakış, kuzey yukarıda):
//   M . Y        M = çalışma masası   Y = yatak (başı kuzeyde)
//   S . Y        S = sandık           meşale: arka (kuzey) duvarda, pencerenin üstünde
//   . g .        g = giriş (kapı bunun güneyinde)

const { Vec3 } = require('vec3')
const { goals, Movements } = require('mineflayer-pathfinder')
const { Iptal } = require('./gelisim')
const evler = require('./evler')

const RENKLER = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const RENK_TR = {
  white: 'beyaz', orange: 'turuncu', magenta: 'eflatun', light_blue: 'açık mavi', yellow: 'sarı', lime: 'açık yeşil',
  pink: 'pembe', gray: 'gri', light_gray: 'açık gri', cyan: 'camgöbeği', purple: 'mor', blue: 'mavi',
  brown: 'kahverengi', green: 'yeşil', red: 'kırmızı', black: 'siyah',
}
const KOYUN_YUN_INDEKS = 17 // 1.20-1.21 sürümlerinde koyunun renk/kırkılmış bilgisi bu metadata'da
const YUN_GEREK = 3

// Sol-sağ, ön-arka yönleri
const D = (x, y, z) => new Vec3(x, y, z)

// koy, katiMi...: ev.js'teki ortak blok koyma araçları
function koyluKur(bot, a, komutlar, anaHareket, ev) {
  const { koy, katiMi, bosMu, havaMi, DUVAR_TASI } = ev
  const reg = () => bot.registry
  const adlar = (filtre) => reg().itemsArray.map((i) => i.name).filter(filtre)
  const tahtaAdlari = () => adlar((n) => n.endsWith('_planks'))
  const kutukAdlari = () => adlar((n) => n.endsWith('_log') && !n.startsWith('stripped_'))
  const citAdlari = () => adlar((n) => n.endsWith('_fence') && n !== 'nether_brick_fence')
  const merdivenAdlari = () => adlar((n) => n.endsWith('_stairs'))
  const kapiAdlari = () => adlar((n) => n.endsWith('_door') && n !== 'iron_door')
  const yatakAdlari = () => adlar((n) => n.endsWith('_bed'))
  const sayFiltre = (filtre) => bot.inventory.items().filter((i) => filtre(i.name)).reduce((t, i) => t + i.count, 0)
  const yunSay = () => sayFiltre((n) => n.endsWith('_wool'))
  const kutukVar = (n) => n.endsWith('_log') && !n.startsWith('stripped_')

  // ------------------------------------------------------------------ plan
  // Her parça: { p: konum, adlar: konacak eşyalar, yonler?: dayanılacak tek yön (yatay kütük için) }
  function planYap(m) {
    const tas = DUVAR_TASI
    const tahta = tahtaAdlari()
    const kutuk = kutukAdlari()
    const kose = (dx, dz) => Math.abs(dx) === 2 && Math.abs(dz) === 2
    const kenar = (dx, dz) => Math.max(Math.abs(dx), Math.abs(dz)) === 2
    const PENCERE = [[-2, 0], [2, 0], [0, -2]] // y=1'de

    const taban = []
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) taban.push({ p: m.offset(dx, -1, dz), adlar: tas })

    const duvarKatlari = [[], [], []] // y=0, 1, 2
    const pencereler = []
    for (let y = 0; y < 3; y++) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (!kenar(dx, dz)) continue
          if (dx === 0 && dz === 2 && y < 2) continue // kapı boşluğu
          if (y === 1 && PENCERE.some(([px, pz]) => px === dx && pz === dz)) {
            pencereler.push({ p: m.offset(dx, y, dz), adlar: ['glass_pane'] })
            continue
          }
          duvarKatlari[y].push({ p: m.offset(dx, y, dz), adlar: kose(dx, dz) ? tas : tahta })
        }
      }
    }

    // Kütük kuşak: köşeler dik, aradakiler bir önceki kütüğe dayanarak yatay
    const kusak = []
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) kusak.push({ p: m.offset(dx, 3, dz), adlar: kutuk })
    for (const dz of [-2, 2]) for (const dx of [-1, 0, 1]) kusak.push({ p: m.offset(dx, 3, dz), adlar: kutuk, yonler: [D(1, 0, 0)] })
    for (const dx of [-2, 2]) for (const dz of [-1, 0, 1]) kusak.push({ p: m.offset(dx, 3, dz), adlar: kutuk, yonler: [D(0, 0, 1)] })

    const citler = []
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (kenar(dx, dz)) citler.push({ p: m.offset(dx, 4, dz), adlar: citAdlari() })

    const cati = []
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cati.push({ p: m.offset(dx, 3, dz), adlar: tahta.concat(tas) })
    cati.sort((p, q) => (q.p.x !== m.x || q.p.z !== m.z ? 1 : 0) - (p.p.x !== m.x || p.p.z !== m.z ? 1 : 0)) // orta en son

    return {
      taban, duvarKatlari, pencereler, kusak, citler, cati,
      masa: m.offset(-1, 0, -1),
      sandik: m.offset(-1, 0, 0),
      yatak: m.offset(1, 0, 0), // ayak ucu; başı kuzeye (1, 0, -1)
      mesale: m.offset(0, 2, -1), // arka duvara asılı
      kapi: m.offset(0, 0, 2),
      basamak: m.offset(0, -1, 3),
    }
  }

  const eksikMi = (p) => {
    const b = bot.blockAt(p)
    return !b || havaMi(b) || bosMu(b)
  }
  const blokAdi = (p) => (bot.blockAt(p) || {}).name || ''

  // Eksik olan her şeyi say (yeni ev için hepsi eksik)
  function eksikler(m) {
    const p = planYap(m)
    const say = (liste) => liste.filter((x) => eksikMi(x.p)).length
    return {
      tas: say(p.taban) + p.duvarKatlari.flat().filter((x) => x.adlar === DUVAR_TASI && eksikMi(x.p)).length,
      duvarTahta: p.duvarKatlari.flat().filter((x) => x.adlar !== DUVAR_TASI && eksikMi(x.p)).length + say(p.cati),
      pencere: say(p.pencereler),
      kutuk: say(p.kusak),
      cit: say(p.citler),
      kapi: !blokAdi(p.kapi).endsWith('_door'),
      basamak: !blokAdi(p.basamak).endsWith('_stairs'),
      masa: blokAdi(p.masa) !== 'crafting_table',
      sandik: blokAdi(p.sandik) !== 'chest',
      yatak: !blokAdi(p.yatak).endsWith('_bed'),
      mesale: !blokAdi(p.mesale).endsWith('torch'),
    }
  }
  const tamamMi = (e) => !e.tas && !e.duvarTahta && !e.pencere && !e.kutuk && !e.cit &&
    !e.kapi && !e.basamak && !e.masa && !e.sandik && !e.yatak && !e.mesale

  // ------------------------------------------------------------------ yer seçimi
  // m: içerideki zemin hizası. Toprak y-2'de, taş taban y-1'de (yerden 1 blok yüksek).
  function yerUygunMu(m) {
    if (evler.yakindaEvVar(m)) return false // başka evimizin dibine (kapısının önüne) kurma
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (!katiMi(bot.blockAt(m.offset(dx, -2, dz)))) return false
        for (let y = -1; y <= 4; y++) if (!bosMu(bot.blockAt(m.offset(dx, y, dz)))) return false
      }
    }
    // basamak yeri ve basamağı koyarken durulacak yer
    for (const dz of [3, 4]) {
      if (!katiMi(bot.blockAt(m.offset(0, -2, dz)))) return false
      if (!bosMu(bot.blockAt(m.offset(0, -1, dz))) || !bosMu(bot.blockAt(m.offset(0, 0, dz)))) return false
    }
    return true
  }

  function yerBul() {
    const p = bot.entity.position.floored().offset(0, 1, 0)
    for (let r = 0; r <= 12; r++) {
      const halka = []
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) === r) halka.push([dx, dz])
        }
      }
      halka.sort((x, y) => (x[0] ** 2 + x[1] ** 2) - (y[0] ** 2 + y[1] ** 2))
      for (const [dx, dz] of halka) {
        for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
          const m = p.offset(dx, dy, dz)
          if (yerUygunMu(m)) return m
        }
      }
    }
    return null
  }

  function kayitliEvBul() {
    const p = bot.entity.position.floored()
    const liste = evler.hepsi()
      .filter((e) => e.tur === 'koylu')
      .map((e) => new Vec3(e.x, e.y, e.z))
      .filter((m) => m.distanceTo(p) <= 32)
      .sort((x, y) => x.distanceTo(p) - y.distanceTo(p))
    return liste[0] || null
  }

  // ------------------------------------------------------------------ yün
  function koyunBilgisi(koyun) {
    const v = koyun.metadata && koyun.metadata[KOYUN_YUN_INDEKS]
    const yavru = koyun.metadata && koyun.metadata[16] === true
    if (typeof v !== 'number') return { yavru, kirkik: false, renk: null }
    return { yavru, kirkik: (v & 0x10) !== 0, renk: RENKLER[v & 0x0f] || null }
  }

  // En çok hangi renk yün var? (yatak için aynı renkten 3 tane lazım)
  function enCokYun() {
    const sayi = {}
    for (const it of bot.inventory.items()) {
      if (it.name.endsWith('_wool')) sayi[it.name] = (sayi[it.name] || 0) + it.count
    }
    const [ad, adet] = Object.entries(sayi).sort((x, y) => y[1] - x[1])[0] || [null, 0]
    return { renk: ad ? ad.replace('_wool', '') : null, adet }
  }

  async function koyunKes(koyun) {
    const kilic = bot.inventory.items()
      .filter((i) => i.name.endsWith('_sword') || i.name.endsWith('_axe'))
      .sort((x, y) => (reg().items[y.type].maxDurability || 0) - (reg().items[x.type].maxDurability || 0))[0]
    if (kilic) await bot.equip(kilic, 'hand')
    const bitis = Date.now() + 40000
    while (bot.entities[koyun.id] && koyun.isValid !== false && Date.now() < bitis) {
      a.kontrol()
      if (bot.entity.position.distanceTo(koyun.position) > 3) {
        const k = koyun.position.floored()
        try {
          await a.git(new goals.GoalNear(k.x, k.y, k.z, 2), 8000)
        } catch (e) {
          if (e instanceof Iptal) throw e
        }
        continue
      }
      await bot.lookAt(koyun.position.offset(0, koyun.height / 2, 0), true)
      bot.attack(koyun)
      await a.bekle(12) // vuruş arası bekleme
    }
  }

  async function koyunKirk(koyun) {
    const makas = bot.inventory.items().find((i) => i.name === 'shears')
    const k = koyun.position.floored()
    await a.git(new goals.GoalNear(k.x, k.y, k.z, 2), 20000)
    await bot.equip(makas, 'hand')
    await bot.lookAt(koyun.position.offset(0, koyun.height / 2, 0), true)
    await bot.activateEntity(koyun)
    await a.bekle(10)
  }

  async function yunTopla(cevap) {
    if (enCokYun().adet >= YUN_GEREK) return
    const makasVar = () => bot.inventory.items().some((i) => i.name === 'shears')
    cevap(`Yatak için yün lazım, koyun arıyorum (${makasVar() ? 'makasım var, kırkacağım' : 'makasım yok, keseceğim'}).`)
    const denenen = new Set()
    let bos = 0
    while (enCokYun().adet < YUN_GEREK) {
      a.kontrol()
      await a.yemekYe()
      const istenen = enCokYun().renk // elimizdeki renkten olanlar önce
      const makas = makasVar()
      const ben = bot.entity.position
      const koyunlar = Object.values(bot.entities)
        .filter((e) => e.name === 'sheep' && !denenen.has(e.id) && e.position.distanceTo(ben) < 64)
        .filter((e) => {
          const b = koyunBilgisi(e)
          return !b.yavru && !b.kirkik // yavrudan ve kırkılmış koyundan yün çıkmaz
        })
        .sort((x, y) => {
          const fx = istenen && koyunBilgisi(x).renk !== istenen ? 20 : 0
          const fy = istenen && koyunBilgisi(y).renk !== istenen ? 20 : 0
          return x.position.distanceTo(ben) + fx - (y.position.distanceTo(ben) + fy)
        })
      const koyun = koyunlar[0]
      if (!koyun) {
        if (++bos > 10) throw new Error('yakında koyun bulamadım. Beni koyunların olduğu yere götürüp tekrar dene')
        await a.kesfet(false)
        continue
      }
      bos = 0
      denenen.add(koyun.id)
      try {
        if (makas) await koyunKirk(koyun)
        else await koyunKes(koyun)
      } catch (e) {
        if (e instanceof Iptal) throw e
        console.log('[Köylü evi] koyun işi olmadı:', e.message)
      }
      await a.topla() // düşen yünü (ve eti) al
    }
    const { renk, adet } = enCokYun()
    cevap(`Yün tamam (${adet} ${RENK_TR[renk] || renk} yün).`)
  }

  // ------------------------------------------------------------------ üretim
  // Ağaç türüne bağlı eşyalar (çit, kapı, merdiven) aynı ağacın tahtasından olmalı.
  // Elde en çok hangi ağaç varsa onu dener; tahtası yetmezse o ağacın kütüğünü tahtaya çevirir.
  function agacTurleri() {
    const deger = {}
    for (const it of bot.inventory.items()) {
      let tur = null
      let kat = 1
      if (it.name.endsWith('_planks')) tur = it.name.replace('_planks', '')
      else if (kutukVar(it.name)) { tur = it.name.replace('_log', ''); kat = 4 }
      if (tur) deger[tur] = (deger[tur] || 0) + it.count * kat
    }
    return Object.entries(deger).sort((x, y) => y[1] - x[1]).map(([t]) => t)
  }

  // tahtaGerek: bu iş için toplam kaç tahta lazım (aynı ağaçtan)
  async function agactanUret(ek, adet, tahtaGerek, masa, ad) {
    for (const tur of agacTurleri()) {
      const esya = tur + ek
      if (!reg().itemsByName[esya]) continue
      const tahta = tur + '_planks'
      while (a.say(tahta) < tahtaGerek && a.varMi(tur + '_log')) await a.uret(tahta, 4)
      if (a.say(tahta) < tahtaGerek) continue
      try {
        await a.uret(esya, adet, masa.blok)
        return
      } catch (err) {
        if (err instanceof Iptal) throw err
        console.log(`[Köylü evi] ${esya} yapılamadı:`, err.message)
      }
    }
    throw new Error(`${ad} için aynı ağaçtan ${tahtaGerek} tahta yok`)
  }

  // Tahta yakıtla fırında pişir (kömür varsa onu kullanır)
  async function pisir(firin, girdi, adet, cikti) {
    const pencere = await bot.openFurnace(firin.blok)
    try {
      const id = (isim) => reg().itemsByName[isim].id
      await pencere.putInput(id(girdi), null, adet)
      const yakitKoy = async () => {
        for (const y of ['coal', 'charcoal']) {
          if (a.say(y) > 0) { await pencere.putFuel(id(y), null, Math.min(a.say(y), Math.ceil(adet / 8))); return true }
        }
        const tahta = bot.inventory.items().find((i) => i.name.endsWith('_planks'))
        if (!tahta) return false
        await pencere.putFuel(tahta.type, null, Math.min(tahta.count, Math.ceil(adet / 1.5)))
        return true
      }
      if (!(await yakitKoy())) throw new Error('fırına koyacak yakıt (kömür ya da tahta) yok')
      let son = Date.now()
      while (true) {
        await a.bekle(40)
        if (pencere.outputItem()) { await pencere.takeOutput(); son = Date.now() }
        if (!pencere.inputItem() && !pencere.outputItem()) break
        if (!pencere.fuelItem() && pencere.inputItem() && !(await yakitKoy())) break
        if (Date.now() - son > 30000) break
      }
      if (pencere.inputItem()) await pencere.takeInput()
      if (pencere.fuelItem()) await pencere.takeFuel()
    } finally {
      bot.closeWindow(pencere)
    }
    if (a.say(cikti) <= 0) throw new Error(`${cikti} pişiremedim`)
  }

  // ------------------------------------------------------------------ malzeme
  async function malzemeHazirla(cevap, e) {
    const kapiLazim = e.kapi && !sayFiltre((n) => kapiAdlari().includes(n))
    const merdivenLazim = e.basamak && !sayFiltre((n) => n.endsWith('_stairs'))
    const sandikLazim = e.sandik && !a.varMi('chest')
    const yatakLazim = e.yatak && !sayFiltre((n) => n.endsWith('_bed'))
    const komurVar = () => a.varMi('coal') || a.varMi('charcoal')
    const mesaleLazim = e.mesale && !a.varMi('torch')
    const citVar = sayFiltre((n) => citAdlari().includes(n))
    const citTur = Math.max(0, Math.ceil((e.cit - citVar) / 3)) // 1 üretim = 3 çit
    let camLazim = e.pencere > a.say('glass_pane')
    const kumGerek = camLazim ? Math.max(0, 6 - a.say('glass') - a.say('sand')) : 0
    const firinLazim = camLazim || (mesaleLazim && !komurVar())

    // 1) taş: taban + köşe sütunları (+ fırın yoksa 8)
    const tasGerek = e.tas + (firinLazim && !a.varMi('furnace') ? 8 : 0)
    if (a.say(DUVAR_TASI) < tasGerek) {
      cevap(`Taban ve köşeler için ${tasGerek - a.say(DUVAR_TASI)} taş eksik, topluyorum.`)
      await komutlar.topla(['tas', String(tasGerek - a.say(DUVAR_TASI) + 2)], cevap)
      a.baslat(cevap)
    }

    // 2) yün (yatak için)
    if (yatakLazim) {
      await yunTopla(cevap)
      a.baslat(cevap)
    }

    // 3) kum (cam için)
    if (kumGerek > 0) {
      try {
        cevap(`Pencere camı için ${kumGerek} kum lazım, topluyorum.`)
        await komutlar.topla(['kum', String(kumGerek)], cevap)
      } catch (err) {
        if (err instanceof Iptal) throw err
        cevap(`Kum bulamadım (${err.message}). Pencereler boş kalacak; kum getirirsen !koylu yaz, tamamlarım.`)
        camLazim = false
      }
      a.baslat(cevap)
    }

    // 4) odun: kuşak kütükleri + tahta işleri
    const cubukGerek = citTur * 2 + (mesaleLazim ? 1 : 0)
    const tahtaGerek = e.duvarTahta + (kapiLazim ? 6 : 0) + (sandikLazim ? 8 : 0) + (yatakLazim ? 3 : 0) +
      (merdivenLazim ? 6 : 0) + citTur * 4 + Math.ceil(cubukGerek / 4) * 2 +
      (a.varMi('crafting_table') ? 0 : (e.masa ? 8 : 4)) + // çalışırken kullanılan + eve konan masa
      (camLazim && !komurVar() ? 4 : 0) + (mesaleLazim && !komurVar() ? 2 : 0) +
      (citTur || kapiLazim || merdivenLazim ? 4 : 0) // pay: karışık ağaçta aynı türden tahta için
    const kutukGerek = e.kutuk + (mesaleLazim && !komurVar() ? 1 : 0)
    const eksikKutuk = kutukGerek + Math.ceil(Math.max(0, tahtaGerek - a.tahtaSay()) / 4) - a.kutukSay()
    if (eksikKutuk > 0) {
      cevap(`Duvar, çatı, çit ve kütük kuşak için ${eksikKutuk} kütük lazım, topluyorum.`)
      await komutlar.topla(['odun', String(eksikKutuk + 1)], cevap)
      a.baslat(cevap)
    }
    while (a.tahtaSay() < tahtaGerek && a.kutukSay() > kutukGerek) {
      const kutuk = bot.inventory.items().find((i) => kutukVar(i.name))
      await a.uret(kutuk.name.replace('_log', '_planks'), 4)
    }

    // 5) fırın işleri: kum -> cam, kömür yoksa 1 kütük -> odun kömürü (meşale için)
    if (camLazim && a.say('glass') < 6 && !(a.say('glass_pane') >= e.pencere)) {
      cevap('Fırında cam yapıyorum.')
      const firin = await a.firinHazirla()
      try {
        if (a.say('sand') > 0) await pisir(firin, 'sand', Math.min(a.say('sand'), 6 - a.say('glass')), 'glass')
        if (mesaleLazim && !komurVar()) {
          const kutuk = bot.inventory.items().find((i) => kutukVar(i.name))
          if (kutuk) await pisir(firin, kutuk.name, 1, 'charcoal')
        }
      } finally {
        await a.geriTopla(firin)
      }
    } else if (mesaleLazim && !komurVar()) {
      const kutuk = bot.inventory.items().find((i) => kutukVar(i.name))
      if (kutuk) {
        cevap('Meşale için odun kömürü yapıyorum.')
        const firin = await a.firinHazirla()
        try {
          await pisir(firin, kutuk.name, 1, 'charcoal')
        } finally {
          await a.geriTopla(firin)
        }
      }
    }

    // 6) çalışma masasında: çubuk, çit, kapı, merdiven, sandık, yatak, cam panel, meşale, masa
    const yatakYapilacak = yatakLazim && enCokYun().adet >= YUN_GEREK
    const panelYapilacak = camLazim && a.say('glass_pane') < e.pencere && a.say('glass') >= 6
    const mesaleYapilacak = mesaleLazim && komurVar()
    const masaIsi = citTur > 0 || kapiLazim || merdivenLazim || sandikLazim || yatakYapilacak || panelYapilacak || mesaleYapilacak
    if (cubukGerek > a.say('stick')) await a.cubukYap(cubukGerek)
    if (masaIsi) {
      cevap('Eşyaları yapıyorum: çit, kapı, merdiven, sandık, yatak, pencere, meşale.')
      const masa = await a.masaHazirla()
      try {
        if (citTur > 0) await agactanUret('_fence', citTur * 3, citTur * 4, masa, 'çit')
        if (kapiLazim) await agactanUret('_door', 1, 6, masa, 'kapı')
        if (merdivenLazim) await agactanUret('_stairs', 1, 6, masa, 'merdiven')
        if (sandikLazim) await a.uret('chest', 1, masa.blok)
        if (yatakYapilacak) await a.uret(`${enCokYun().renk}_bed`, 1, masa.blok)
        if (panelYapilacak) await a.uret('glass_pane', 16, masa.blok)
        if (mesaleYapilacak) {
          if (!a.varMi('stick')) await a.cubukYap(1)
          await a.uret('torch', 4, masa.blok)
        }
      } finally {
        await a.geriTopla(masa)
      }
    }
    // eve konacak masa (yakındaki masa kullanıldıysa elimizde olmayabilir)
    if (e.masa && !a.varMi('crafting_table')) await a.uret('crafting_table', 1)

    // 7) son kontrol: duvar tahtası ve kuşak kütükleri
    if (a.kutukSay() < e.kutuk) {
      cevap(`Kütük kuşağı için ${e.kutuk - a.kutukSay()} kütük daha lazım, topluyorum.`)
      await komutlar.topla(['odun', String(e.kutuk - a.kutukSay())], cevap)
      a.baslat(cevap)
    }
    while (a.tahtaSay() < e.duvarTahta && a.kutukSay() > e.kutuk) {
      const kutuk = bot.inventory.items().find((i) => kutukVar(i.name))
      await a.uret(kutuk.name.replace('_log', '_planks'), 4)
    }
    if (a.say(DUVAR_TASI) < e.tas) throw new Error('taban için yeterli taş toplayamadım')
    if (a.tahtaSay() < e.duvarTahta) throw new Error('duvar ve çatı için yeterli tahta yok')
    if (a.kutukSay() < e.kutuk) throw new Error('kütük kuşağı için yeterli kütük yok')
    if (sayFiltre((n) => citAdlari().includes(n)) < e.cit) throw new Error('korkuluk için yeterli çit yapamadım')
    if (yatakLazim && !sayFiltre((n) => n.endsWith('_bed'))) cevap('Yatak yapamadım, evi yataksız yapıyorum.')
  }

  // ------------------------------------------------------------------ inşaat
  // Listeyi bitene kadar dolaş: dayanağı olmayanlar bir sonraki tura kalır
  async function sirayla(liste, durus, secenek = {}) {
    let kalan = liste.filter((x) => eksikMi(x.p))
    while (kalan.length) {
      const yeni = []
      for (const x of kalan) {
        const ok = await koy(x.p, x.adlar, durus, { ...secenek, yonler: x.yonler || undefined })
        if (!ok) yeni.push(x)
      }
      if (yeni.length === kalan.length) throw new Error('bazı blokları koyacak dayanak bulamadım')
      kalan = yeni
    }
  }

  async function koylu(cevap) {
    a.baslat(cevap)
    let m = kayitliEvBul()
    if (m) {
      const e = eksikler(m)
      if (tamamMi(e)) {
        cevap(`Burada zaten köylü evim var: ${m.x} ${m.y - 1} ${m.z}. Yeni ev için beni 20 blok kadar uzağa götür.`)
        return m
      }
      cevap(`Yarım kalan köylü evimi buldum (${m.x} ${m.y - 1} ${m.z}), tamamlıyorum.`)
      await malzemeHazirla(cevap, e)
    } else {
      cevap('Kendime köylü evi yapacağım. Önce malzemeye bakıyorum (biraz sürer).')
      // yer, malzeme toplamadan önce de bakılır: hiç yer yoksa boşuna toplamasın
      if (!yerBul()) throw new Error('yakında düz ve boş bir yer bulamadım (5x5 alan, 6 blok yükseklik). Beni düz bir yere götürüp tekrar dene')
      const bos = { tas: 37, duvarTahta: 40, pencere: 3, kutuk: 16, cit: 16, kapi: true, basamak: true, masa: true, sandik: true, yatak: true, mesale: true }
      await malzemeHazirla(cevap, bos)
      m = yerBul() // toplarken uzaklaşmış olabilir
      if (!m) throw new Error('yakında düz ve boş bir yer bulamadım (5x5 alan, 6 blok yükseklik). Beni düz bir yere götürüp tekrar dene')
      cevap(`Yer buldum: ${m.x} ${m.y - 1} ${m.z}. İnşaata başlıyorum.`)
      evler.ekle(m, 'koylu') // bundan sonra bu alan korunur
    }

    const plan = planYap(m)
    // Dışarıda durulacak yerler: duvarlardan 1 blok dışarıda, yer hizasında
    const disari = [[0, 3], [0, -3], [3, 0], [-3, 0], [3, 3], [3, -3], [-3, 3], [-3, -3], [1, 3], [-1, 3], [1, -3], [-1, -3], [3, 1], [3, -1], [-3, 1], [-3, -1]]
      .map(([dx, dz]) => m.offset(dx, -1, dz))
    const iceri = [m.offset(0, 0, 0), m.offset(0, 0, 1), m.offset(0, 0, -1), m.offset(-1, 0, 1), m.offset(1, 0, 1)]

    const hareket = new Movements(bot)
    hareket.canDig = false
    hareket.allow1by1towers = false
    hareket.scafoldingBlocks = []
    hareket.canOpenDoors = true
    evler.kapilardanGec(hareket)
    bot.pathfinder.setMovements(hareket)
    try {
      await sirayla(plan.taban, disari)
      cevap('Taban tamam, duvarları örüyorum.')
      for (let y = 0; y < 3; y++) {
        await sirayla(plan.duvarKatlari[y], disari)
        if (y === 0 && a.say('glass_pane') > 0) await sirayla(plan.pencereler, disari)
      }
      await sirayla(plan.kusak, disari.concat(iceri))
      cevap('Kütük kuşak tamam, korkuluğu ve çatıyı yapıyorum.')
      // Çitler çatıdan önce, içeriden (çatı yokken kütüklerin üstü rahat görülür)
      await sirayla(plan.citler, iceri.concat(disari))
      await sirayla(plan.cati, iceri, { sirala: false })

      // içerisi
      if (eksikMi(plan.masa) && a.varMi('crafting_table')) await koy(plan.masa, ['crafting_table'], iceri)
      if (eksikMi(plan.sandik) && a.varMi('chest')) await koy(plan.sandik, ['chest'], iceri)
      if (eksikMi(plan.mesale) && a.varMi('torch')) await koy(plan.mesale, ['torch'], iceri, { yonler: [D(0, 0, 1)] })
      if (eksikMi(plan.yatak) && sayFiltre((n) => n.endsWith('_bed'))) {
        // ayak ucunun güneyinde durup kuzeye bakarak koy: yatak kuzeye doğru uzanır
        await koy(plan.yatak, yatakAdlari(), [m.offset(1, 0, 1)], { zorla: true })
      }

      // dışarı çık, kapıyı tak, önüne basamak koy
      if (eksikMi(plan.kapi) && sayFiltre((n) => kapiAdlari().includes(n))) {
        await koy(plan.kapi, kapiAdlari(), [m.offset(0, -1, 3)], { zorla: true })
      }
      if (eksikMi(plan.basamak) && sayFiltre((n) => n.endsWith('_stairs'))) {
        // güneyinde durup kuzeye bakarak koy: basamağın yüksek tarafı kapıya bakar
        await koy(plan.basamak, merdivenAdlari(), [m.offset(0, -1, 4)], { zorla: true })
      }
      if (evler.icindekiEv(bot.entity.position)) {
        try {
          await a.git(new goals.GoalBlock(m.x, m.y - 1, m.z + 4), 30000)
        } catch (err) {
          if (err instanceof Iptal) throw err
        }
      }
    } finally {
      bot.pathfinder.setMovements(anaHareket)
    }

    const son = eksikler(m)
    const eksikYazi = []
    if (son.pencere) eksikYazi.push('pencere camı')
    if (son.yatak) eksikYazi.push('yatak')
    if (son.mesale) eksikYazi.push('meşale')
    if (son.sandik) eksikYazi.push('sandık')
    cevap(`Köylü evim hazır! Konum: ${m.x} ${m.y - 1} ${m.z}. Gelmek için: !git ${m.x} ${m.y - 1} ${m.z + 4}` +
      (eksikYazi.length ? ` (Eksik: ${eksikYazi.join(', ')}. Malzeme bulunca !koylu yaz, tamamlarım.)` : ''))
    return m
  }

  return { koylu, planYap, yerUygunMu }
}

module.exports = { koyluKur }
