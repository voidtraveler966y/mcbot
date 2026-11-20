// gelisim.js — "!gelis" komutunun beyni.
// Sırayla: odun -> tahta kazma -> taş -> taş aletler + fırın -> kömür ve demir
//          -> demir eritme -> full demir zırh + demir kazma/balta/kılıç -> giyinme
// Her adım önce envantere bakar; zaten olan şeyi tekrar yapmaz. Bu yüzden
// yarıda kesilirse (!dur, ölüm, bağlantı kopması) tekrar !gelis yazınca kaldığı yerden devam eder.

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')

// ---------------------------------------------------------------- ayarlar
const ARAMA_YARICAP = 48 // blok arama mesafesi
const ODUN_HEDEF = 28 // tahta cinsinden (1 kütük = 4 tahta) toplanacak odun
const KOMUR_HEDEF = 16 // toplanacak kömür (eritme + yedek)
const DEMIR_ESYALAR = [
  // öncelik sırasına göre: demir yetmezse ilk baştakiler yapılır
  ['iron_pickaxe', 3],
  ['iron_sword', 2],
  ['iron_chestplate', 8],
  ['iron_leggings', 7],
  ['iron_helmet', 5],
  ['iron_boots', 4],
  ['iron_axe', 3],
]
const TAS_ESYALAR = ['stone_pickaxe', 'stone_axe', 'stone_sword']
const TAS_TURLERI = ['cobblestone', 'cobbled_deepslate', 'blackstone'] // taş alet + fırın malzemesi
const TAS_BLOKLARI = ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate']
const DEMIR_CEVHER = ['iron_ore', 'deepslate_iron_ore']
const KOMUR_CEVHER = ['coal_ore', 'deepslate_coal_ore']
const COP = ['granite', 'diorite', 'andesite', 'tuff', 'gravel', 'flint', 'calcite',
  'dripstone_block', 'pointed_dripstone', 'rotten_flesh', 'netherrack']
const YENMEZ = ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish',
  'suspicious_stew', 'chorus_fruit']

// Sohbette kullanılan Türkçe eşya adları
const TR = {
  iron_pickaxe: 'demir kazma', iron_sword: 'demir kılıç', iron_axe: 'demir balta',
  iron_helmet: 'demir kask', iron_chestplate: 'demir göğüslük',
  iron_leggings: 'demir pantolon', iron_boots: 'demir bot',
  diamond_pickaxe: 'elmas kazma', diamond_sword: 'elmas kılıç', diamond_axe: 'elmas balta',
  diamond_helmet: 'elmas kask', diamond_chestplate: 'elmas göğüslük',
  diamond_leggings: 'elmas pantolon', diamond_boots: 'elmas bot',
  stone_pickaxe: 'taş kazma', furnace: 'fırın',
  iron_ingot: 'demir külçe', diamond: 'elmas', stick: 'çubuk', cobblestone: 'kırıktaş',
}

class Iptal extends Error {}
class AletYok extends Error {} // kazmak için uygun alet yok (kazma kırıldı vb.)

function gelisimKur(bot, hareket) {
  const durum = { iptal: false }
  let soyle = () => {} // sohbete yazma fonksiyonu, !gelis başlayınca ayarlanır
  const kara = new Set() // ulaşılamayan bloklar, bir daha denenmesin
  const anahtar = (p) => `${p.x},${p.y},${p.z}`

  // ---------------------------------------------------------- yardımcılar
  function kontrol() {
    if (durum.iptal) throw new Iptal('durduruldu')
  }

  const reg = () => bot.registry
  const tumEsyalar = () => {
    // envanter + giyili zırh + sol el
    const zirh = [5, 6, 7, 8, 45].map((i) => bot.inventory.slots[i]).filter(Boolean)
    return bot.inventory.items().concat(zirh)
  }
  const say = (isimler) => {
    const liste = Array.isArray(isimler) ? isimler : [isimler]
    return bot.inventory.items()
      .filter((it) => liste.includes(it.name))
      .reduce((t, it) => t + it.count, 0)
  }
  const varMi = (isim) => tumEsyalar().some((it) => it.name === isim)
  const kutukSay = () => bot.inventory.items()
    .filter((it) => it.name.endsWith('_log')).reduce((t, it) => t + it.count, 0)
  const tahtaSay = () => bot.inventory.items()
    .filter((it) => it.name.endsWith('_planks')).reduce((t, it) => t + it.count, 0)
  const tasKazmaVar = () => ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
    .some(varMi)
  const kazmaVar = () => ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']
    .some(varMi)

  // pathfinder.goto bazen hedefe varmadan "bitti" diyebiliyor ve hiç bitmeyebiliyor;
  // bu yüzden süre sınırı koyuyoruz.
  async function git(hedef, ms = 60000) {
    kontrol()
    let zamanlayici
    try {
      await Promise.race([
        bot.pathfinder.goto(hedef),
        new Promise((_, reddet) => {
          zamanlayici = setTimeout(() => {
            bot.pathfinder.setGoal(null)
            reddet(new Error('zaman aşımı'))
          }, ms)
        }),
      ])
    } finally {
      clearTimeout(zamanlayici)
    }
    kontrol()
  }

  async function bekle(tik) {
    await bot.waitForTicks(tik)
    kontrol()
  }

  async function yemekYe() {
    if (bot.food > 14) return
    const yemek = bot.inventory.items().find(
      (it) => reg().foodsByName[it.name] && !YENMEZ.includes(it.name))
    if (!yemek) return
    try {
      await bot.equip(yemek, 'hand')
      await bot.consume()
    } catch (e) { /* yiyemezse önemli değil */ }
  }

  async function copAt() {
    await yerAc(4)
  }

  // Envanterde en az `gereken` boş yuva olana kadar gereksiz eşyaları at.
  // Önce tamamen işe yaramazlar, sonra fazlalıklar, en son yedek eski aletler.
  async function yerAc(gereken) {
    const bos = () => bot.inventory.emptySlotCount()
    if (bos() >= gereken) return
    const at = async (filtre) => {
      for (const it of bot.inventory.items()) {
        if (bos() >= gereken) return
        if (filtre(it)) {
          try { await bot.tossStack(it) } catch (e) { /* atamazsa geç */ }
        }
      }
    }
    const fazlaDeste = (isim) => {
      // aynı eşyadan birden çok deste varsa ilki hariç hepsi
      let ilk = true
      return (it) => {
        if (it.name !== isim) return false
        if (ilk) { ilk = false; return false }
        return true
      }
    }
    await at((it) => COP.includes(it.name))
    for (const isim of ['dirt', 'cobbled_deepslate', 'cobblestone']) await at(fazlaDeste(isim))
    await at((it) => it.name === 'dirt')
    if (say('cobblestone') >= 8) await at((it) => it.name === 'cobbled_deepslate')
    // daha iyisi varsa eski aletler
    if (varMi('iron_sword')) await at((it) => ['wooden_sword', 'stone_sword'].includes(it.name))
    if (varMi('iron_axe')) await at((it) => ['wooden_axe', 'stone_axe'].includes(it.name))
    if (varMi('stone_pickaxe') || varMi('iron_pickaxe')) await at((it) => it.name === 'wooden_pickaxe')
    if (bos() < gereken) console.log(`Envanterde yer açamadım (boş: ${bos()}) | ${envanterOzeti()}`)
  }

  // Yere düşen eşyaları topla
  async function topla() {
    for (let i = 0; i < 4; i++) {
      await bekle(6)
      const ben = bot.entity.position
      const esya = Object.values(bot.entities)
        .filter((e) => e.name === 'item' && e.position.distanceTo(ben) < 8)
        .sort((a, b) => a.position.distanceTo(ben) - b.position.distanceTo(ben))[0]
      if (!esya) return
      const p = esya.position.floored()
      try {
        await git(new goals.GoalBlock(p.x, p.y, p.z), 6000)
      } catch (e) {
        if (e instanceof Iptal) throw e
        return
      }
    }
  }

  // Bir bloğun yanına git, en iyi aletle kaz, düşeni topla
  async function blokKaz(blok, sure = 45000) {
    // Ya bloğu görebileceği bir yere (ağaç tepesindeki kütük gibi), ya da hemen yanına git
    // (taşın içine gömülü maden gibi; oraya tünel kazarak gider)
    const p = blok.position
    await git(new goals.GoalCompositeAny([
      new goals.GoalLookAtBlock(p, bot.world),
      new goals.GoalGetToBlock(p.x, p.y, p.z),
    ]), sure)
    const guncel = bot.blockAt(blok.position)
    if (!guncel || guncel.name !== blok.name) return // bu arada başka biri kırmış
    if (!hareket.safeToBreak(guncel)) throw new Error('yanında su/lav var')
    const alet = bot.pathfinder.bestHarvestTool(guncel)
    if (alet) await bot.equip(alet, 'hand')
    if (guncel.harvestTools && !(alet && guncel.harvestTools[alet.type])) {
      throw new AletYok(guncel.name + ' için uygun alet yok')
    }
    await bot.dig(guncel)
    kontrol()
    await topla()
  }

  // En yakın uygun bloğu bul (kara listedekiler hariç)
  function blokBul(isimler, yaricap = ARAMA_YARICAP) {
    const idler = isimler.map((i) => reg().blocksByName[i]).filter(Boolean).map((b) => b.id)
    const konumlar = bot.findBlocks({ matching: idler, maxDistance: yaricap, count: 40 })
    const ben = bot.entity.position
    const uygun = konumlar
      .filter((p) => !kara.has(anahtar(p)))
      // ayaklarımızdan çok yukarıdakiler (ağaç tepesi) sonra gelsin
      .sort((a, b) => {
        const ca = a.distanceTo(ben) + Math.max(0, a.y - ben.y - 2) * 4
        const cb = b.distanceTo(ben) + Math.max(0, b.y - ben.y - 2) * 4
        return ca - cb
      })
    return uygun.length ? bot.blockAt(uygun[0]) : null
  }

  // Bulduğun bloğu kaz; ulaşamazsan kara listeye al
  // secenek.aletYokFirlat: kazma yetmezse kendi yapmaya çalışma, hatayı yukarı ilet (gelisim2 için)
  async function bulVeKaz(isimler, yaricap, secenek = {}) {
    const blok = blokBul(isimler, yaricap)
    if (!blok) return false
    try {
      await blokKaz(blok)
    } catch (e) {
      if (e instanceof Iptal) throw e
      if (e instanceof AletYok && secenek.aletYokFirlat) throw e
      if (e instanceof AletYok) {
        // blok kazılabilir, sadece kazmamız yok: yenisini yap, bloğu kara listeye alma
        await kazmaYenile(DEMIR_CEVHER.includes(blok.name) || KOMUR_CEVHER.includes(blok.name) ? 'tas' : 'tahta')
        return true
      }
      console.log('Kazılamadı', blok.name, anahtar(blok.position), e.message)
      kara.add(anahtar(blok.position))
    }
    return true
  }

  // Rastgele bir yöne biraz git (yeraltındaysak aynı seviyede tünel kazarak)
  async function kesfet(yeralti) {
    const aci = Math.random() * Math.PI * 2
    const mesafe = yeralti ? 16 : 40
    const p = bot.entity.position
    const x = Math.floor(p.x + Math.cos(aci) * mesafe)
    const z = Math.floor(p.z + Math.sin(aci) * mesafe)
    const hedef = yeralti ? new goals.GoalBlock(x, Math.floor(p.y), z) : new goals.GoalXZ(x, z)
    try {
      await git(hedef, 45000)
    } catch (e) {
      if (e instanceof Iptal) throw e
    }
  }

  // ---------------------------------------------------------- üretim
  function tarifBul(isim, adet, masa) {
    const esya = reg().itemsByName[isim]
    if (!esya) throw new Error('bilinmeyen eşya: ' + isim)
    return bot.recipesFor(esya.id, null, adet, masa || null)[0] || null
  }

  async function uret(isim, adet = 1, masa = null) {
    kontrol()
    let tarif = tarifBul(isim, adet, masa)
    // Elde karışık tahta varsa (meşe + huş gibi) tarif tutmayabilir: tek cinsten tahta yapıp tekrar dene
    for (let deneme = 0; !tarif && deneme < 3 && !isim.endsWith('_planks'); deneme++) {
      const kutuk = bot.inventory.items().find((it) => it.name.endsWith('_log'))
      if (!kutuk) break
      await uret(kutuk.name.replace('stripped_', '').replace('_log', '_planks'), 4)
      tarif = tarifBul(isim, adet, masa)
    }
    if (!tarif) throw new Error(isim + ' için malzeme yetmiyor')

    // Bot, ürettiği eşyayı sunucu onaylamadan "var" sanabiliyor. Bu yüzden üretimden sonra
    // envanteri sunucudan tekrar isteyip gerçekten oluştu mu diye bakıyoruz; olmadıysa tekrar deniyoruz.
    const once = say(isim)
    const kez = Math.ceil(adet / tarif.result.count)
    // Sunucu üretimi kabul edene kadar tekrar dener (!dur ile durdurulabilir)
    for (let deneme = 1; ; deneme++) {
      await yerAc(kez + 1) // üretilen eşyanın konacak yeri olsun (dolu envanter üretimi engelliyordu)
      if (masa) {
        const m = bot.blockAt(masa.position)
        if (!m || m.name !== 'crafting_table') throw new Error('çalışma masası yerinde yok')
        // Masada üretimi adım adım kendimiz yapıyoruz ve sonucu sunucudan bekliyoruz
        try {
          await masadaUret(tarif, masa, kez)
        } catch (e) {
          if (e instanceof Iptal) throw e
          console.log(`Masada üretim hatası (${isim}):`, e.message)
          if (e.message === 'envanter dolu') soyle('Envanterim dolu, yer açıp tekrar deniyorum.')
        }
      } else {
        try {
          await bot.craft(tarif, kez, null)
        } catch (e) {
          console.log(`Üretim hatası (${isim}):`, e.message)
        }
      }
      await envanterEsitle()
      if (say(isim) > once) return
      console.log(`Üretim tutmadı (${deneme}. deneme): ${isim} | envanter: ${envanterOzeti()}`)
      if (deneme % 5 === 0) soyle(`${isim} yapamadım (${deneme} deneme), denemeye devam ediyorum.`)
      await bekle(20 * Math.min(deneme, 10)) // her seferinde biraz daha uzun bekle (en çok 10 sn)
      await envanterEsitle()
      if (say(isim) > once) return
      tarif = tarifBul(isim, adet, masa)
      if (!tarif) throw new Error(isim + ' için malzeme kalmadı')
    }
  }

  // Kazma kırıldıysa ya da yetersizse yenisini yap.
  // seviye 'tas': taş kazma gerekli (demir/kömür için); 'tahta': herhangi bir kazma yeter.
  async function kazmaYenile(seviye) {
    if (tasKazmaVar()) return
    if (seviye === 'tahta' && kazmaVar()) return
    if (seviye === 'tas' && kazmaVar() && say(TAS_TURLERI) < 3) {
      // elimizde tahta kazma var ama taş yok: önce 3 taş kaz
      soyle('Taş kazma için taş topluyorum.')
      for (let i = 0; say(TAS_TURLERI) < 3; i++) {
        if (i > 30) throw new Error('kazma için taş bulamadım')
        if (!(await bulVeKaz(TAS_BLOKLARI, 24))) await kesfet(true)
      }
    }
    const tasla = say(TAS_TURLERI) >= 3
    const isim = tasla ? 'stone_pickaxe' : 'wooden_pickaxe'
    soyle(`Kazmam yok, yeni ${tasla ? 'taş' : 'tahta'} kazma yapıyorum.`)
    await cubukYap(2)
    if (!tasla) await tahtaYap(3)
    const masa = await masaHazirla()
    await uret(isim, 1, masa.blok)
    await geriTopla(masa)
  }

  // Çalışma masasında elle üretim: malzemeleri tek tek ızgaraya koy, sunucu sonucu
  // gösterene kadar bekle, sonra sonucu al. Sunucu sonucu göstermezse neyin yanlış olduğunu yazar.
  async function masadaUret(tarif, masa, kez) {
    const goz = bot.entity.position.offset(0, bot.entity.height, 0)
    const mesafe = goz.distanceTo(masa.position.offset(0.5, 0.5, 0.5))
    if (mesafe > 4.5) {
      await git(new goals.GoalNear(masa.position.x, masa.position.y, masa.position.z, 2), 20000)
    }
    const pencere = await pencereAc(masa)
    try {
      if (!pencere.type || !String(pencere.type).includes('crafting')) {
        throw new Error('açılan pencere masa değil: ' + pencere.type)
      }
      const hucreler = []
      if (tarif.inShape) {
        tarif.inShape.forEach((satir, y) => satir.forEach((h, x) => {
          if (h.id !== -1) hucreler.push({ slot: 1 + x + 3 * y, id: h.id })
        }))
      } else {
        tarif.ingredients.forEach((h, i) => hucreler.push({ slot: 1 + i, id: h.id }))
      }
      const isim = (id) => (reg().items[id] ? reg().items[id].name : id)

      for (let k = 0; k < kez; k++) {
        for (const h of hucreler) {
          const kaynak = pencere.findInventoryItem(h.id, null)
          if (!kaynak) throw new Error('malzeme eksik: ' + isim(h.id))
          await bot.clickWindow(kaynak.slot, 0, 0) // desteyi al
          await bot.clickWindow(h.slot, 1, 0) // ızgaraya 1 tane bırak
          await bot.clickWindow(kaynak.slot, 0, 0) // desteyi yerine koy
          await bekle(1)
        }
        // sunucunun sonucu göstermesini bekle
        let sonuc = null
        for (let i = 0; i < 20 && !sonuc; i++) {
          await bekle(2)
          const s = pencere.slots[0]
          if (s && s.type === tarif.result.id) sonuc = s
        }
        if (!sonuc) {
          const izgara = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (pencere.slots[i] ? pencere.slots[i].name : '-'))
          console.log('Sunucu sonuç vermedi. Pencere:', pencere.type, 'id:', pencere.id,
            '| ızgara:', izgara.join(','), '| sonuç yuvası:', pencere.slots[0] ? pencere.slots[0].name : 'boş',
            '| masaya uzaklık:', mesafe.toFixed(1))
          for (let i = 1; i <= 9; i++) {
            if (pencere.slots[i]) {
              try { await bot.putAway(i) } catch (e) { /* olmazsa kapatınca geri gelir */ }
            }
          }
          throw new Error('sunucu tarifi tanımadı')
        }
        await bot.clickWindow(0, 0, 0) // sonucu imlece al
        const bos = pencere.firstEmptyInventorySlot()
        if (bos === null || bos === undefined) throw new Error('envanter dolu')
        await bot.clickWindow(bos, 0, 0) // envantere koy
        await bekle(2)
      }
    } finally {
      bot.closeWindow(pencere)
    }
  }

  async function pencereAc(blok) {
    let zamanlayici
    const acildi = new Promise((resolve, reject) => {
      const dinle = (p) => {
        clearTimeout(zamanlayici)
        resolve(p)
      }
      bot.once('windowOpen', dinle)
      zamanlayici = setTimeout(() => {
        bot.removeListener('windowOpen', dinle)
        reject(new Error(blok.name + ' açılmadı (uzakta ya da görünmüyor olabilir)'))
      }, 5000)
    })
    await bot.activateBlock(blok)
    return acildi
  }

  // Envanterin gerçek halini sunucudan iste
  async function envanterEsitle() {
    try {
      await Promise.race([
        bot._syncWindow(bot.inventory),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    } catch (e) { /* olmazsa da devam */ }
    await bekle(4)
    kontrol()
  }

  async function tahtaYap(gereken) {
    while (tahtaSay() < gereken) {
      const kutuk = bot.inventory.items().find((it) => it.name.endsWith('_log'))
      if (!kutuk) throw new Error('kütük kalmadı')
      const tahta = kutuk.name.replace('stripped_', '').replace('_log', '_planks')
      await uret(tahta, 4)
    }
  }

  async function cubukYap(gereken) {
    while (say('stick') < gereken) {
      await tahtaYap(2)
      await uret('stick', 4)
    }
  }

  // Yanına bir blok koy (çalışma masası / fırın)
  async function yakinaKoy(isim) {
    await envanterEsitle()
    const esya = bot.inventory.items().find((it) => it.name === isim)
    if (!esya) throw new Error(isim + ' envanterde yok')
    await bot.equip(esya, 'hand')
    const merkez = bot.entity.position.floored()
    for (const r of [1, 2]) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const yer = merkez.offset(dx, 0, dz)
          const hedef = bot.blockAt(yer)
          const alt = bot.blockAt(yer.offset(0, -1, 0))
          if (!hedef || !['air', 'cave_air', 'short_grass', 'grass'].includes(hedef.name)) continue
          if (!alt || alt.boundingBox !== 'block') continue
          try {
            await bot.placeBlock(alt, new Vec3(0, 1, 0))
            const konan = bot.blockAt(yer)
            if (konan && konan.name === isim) return konan
          } catch (e) { /* başka yer dene */ }
        }
      }
    }
    throw new Error(isim + ' koyacak yer bulamadım')
  }

  // Kendi masamız/fırınımız varsa onu koy; yoksa yakındakini kullan; o da yoksa yapıp koy.
  // Bizim koyduğumuzu iş bitince geri toplarız ({ kaldir: true }).
  async function blokHazirla(isim, uretFn) {
    const yakin = varMi(isim) ? null : blokBul([isim], 16)
    if (yakin) {
      await git(new goals.GoalNear(yakin.position.x, yakin.position.y, yakin.position.z, 2), 30000)
      return { blok: bot.blockAt(yakin.position), kaldir: false }
    }
    if (!varMi(isim)) await uretFn()
    return { blok: await yakinaKoy(isim), kaldir: true }
  }

  async function geriTopla(hazir) {
    if (!hazir.kaldir) return
    const blok = bot.blockAt(hazir.blok.position)
    if (!blok || blok.name !== hazir.blok.name) return
    try {
      await blokKaz(blok, 15000)
    } catch (e) {
      if (e instanceof Iptal) throw e
    }
  }

  const masaHazirla = () => blokHazirla('crafting_table', async () => {
    await tahtaYap(4)
    await uret('crafting_table', 1)
  })

  // ---------------------------------------------------------- aşamalar
  function eksikDemirEsyalar() {
    return DEMIR_ESYALAR.filter(([isim]) => !varMi(isim))
  }

  async function odunAsamasi(cevap) {
    if (varMi('iron_pickaxe')) return
    const odun = () => kutukSay() * 4 + tahtaSay() + say('stick') / 2 + (varMi('crafting_table') ? 4 : 0)
    if (odun() >= ODUN_HEDEF) return
    cevap('1/6 Odun topluyorum.')
    let bos = 0
    while (odun() < ODUN_HEDEF) {
      await yemekYe()
      const kazdi = await bulVeKaz(
        Object.keys(reg().blocksByName).filter((n) => n.endsWith('_log') && !n.startsWith('stripped_')))
      if (!kazdi) {
        if (++bos > 8) throw new Error('etrafta ağaç bulamadım')
        await kesfet(false)
      }
    }
  }

  async function tahtaKazmaAsamasi(cevap) {
    if (kazmaVar()) return
    cevap('2/6 Çalışma masası ve tahta kazma yapıyorum.')
    await cubukYap(2)
    await tahtaYap(3)
    const masa = await masaHazirla()
    await uret('wooden_pickaxe', 1, masa.blok)
    await geriTopla(masa)
  }

  async function tasAsamasi(cevap) {
    const gereken =
      TAS_ESYALAR.filter((i) => !varMi(i) && !varMi(i.replace('stone_', 'iron_'))).length * 3 +
      (varMi('furnace') ? 0 : 8)
    if (say(TAS_TURLERI) < gereken) {
      cevap('3/6 Taş kazıyorum.')
      await kazmaYenile('tahta')
      let bos = 0
      while (say(TAS_TURLERI) < gereken) {
        await yemekYe()
        await kazmaYenile('tahta') // kazma kırıldıysa yenisi
        const kazdi = await bulVeKaz(TAS_BLOKLARI, 24)
        if (!kazdi) {
          if (++bos > 6) throw new Error('taş bulamadım')
          // yüzeyde taş yoksa biraz aşağı in
          try {
            await git(new goals.GoalY(Math.floor(bot.entity.position.y) - 8), 60000)
          } catch (e) {
            if (e instanceof Iptal) throw e
          }
        }
      }
    }

    const yapilacak = TAS_ESYALAR.filter((i) => !varMi(i) && !varMi(i.replace('stone_', 'iron_')))
    if (!yapilacak.length && varMi('furnace')) return
    cevap('4/6 Taş aletler ve fırın yapıyorum.')
    await cubukYap(yapilacak.length * 2 + 4) // +4: kazma kırılırsa yenisi için yedek
    const masa = await masaHazirla()
    for (const isim of yapilacak) await uret(isim, 1, masa.blok)
    if (!varMi('furnace')) await uret('furnace', 1, masa.blok)
    await geriTopla(masa)
  }

  async function madenAsamasi(cevap) {
    const demirIhtiyac = () => {
      const kulce = eksikDemirEsyalar().reduce((t, [, n]) => t + n, 0)
      return Math.max(0, kulce - say('iron_ingot') - say('raw_iron'))
    }
    const komurIhtiyac = () => {
      if (!eksikDemirEsyalar().length) return 0 // demir set tamamsa kömür aramaya gerek yok
      const eritilecek = Math.max(0,
        eksikDemirEsyalar().reduce((t, [, n]) => t + n, 0) - say('iron_ingot'))
      // eritmeye yetecek kadar, ama en az KOMUR_HEDEF kadar (yedek)
      const hedef = Math.max(Math.ceil(eritilecek / 8) + 1, KOMUR_HEDEF)
      return Math.max(0, hedef - say(['coal', 'charcoal']))
    }
    if (demirIhtiyac() === 0 && komurIhtiyac() === 0) return

    cevap(`5/6 Maden arıyorum: ${demirIhtiyac()} demir, ${komurIhtiyac()} kömür lazım.`)
    await kazmaYenile('tas')
    let sonRapor = Date.now()
    let bos = 0
    while (demirIhtiyac() > 0 || komurIhtiyac() > 0) {
      await yemekYe()
      await copAt()
      await kazmaYenile('tas') // kazma kırıldıysa yenisi
      const aranan = []
      if (demirIhtiyac() > 0) aranan.push(...DEMIR_CEVHER)
      if (komurIhtiyac() > 0) aranan.push(...KOMUR_CEVHER)
      const kazdi = await bulVeKaz(aranan, 32)
      if (kazdi) {
        bos = 0
      } else {
        if (++bos > 40) throw new Error('çok aradım ama yeterli maden bulamadım')
        const y = Math.floor(bot.entity.position.y)
        if (demirIhtiyac() > 0 && y > 24) {
          // demir en çok y=16 civarında: kademe kademe aşağı in
          try {
            await git(new goals.GoalY(Math.max(16, y - 12)), 90000)
          } catch (e) {
            if (e instanceof Iptal) throw e
            await kesfet(false)
          }
        } else {
          await kesfet(y < 50)
        }
      }
      if (Date.now() - sonRapor > 120000) {
        cevap(`Hâlâ arıyorum: ${demirIhtiyac()} demir, ${komurIhtiyac()} kömür eksik.`)
        sonRapor = Date.now()
      }
    }
  }

  // secenek.yardimla: hiçbir şeyi kendin üretme; fırın yoksa oyuncudan iste (gelisim2 için)
  async function eritmeAsamasi(cevap, secenek = {}) {
    const ham = say('raw_iron')
    if (ham === 0) return
    cevap(`6/6 ${ham} demir eritiyorum, biraz sürer (~${Math.ceil(ham * 10 / 60)} dk).`)

    // Demir aletlerin çubuklarını şimdiden ayır ki odunu yakıt diye yakmayalım
    const cubukLazim = ['iron_pickaxe', 'iron_axe'].filter((i) => !varMi(i)).length * 2 +
      (varMi('iron_sword') ? 0 : 1)
    if (!secenek.yardimla) {
      try {
        await cubukYap(cubukLazim)
      } catch (e) {
        if (e instanceof Iptal) throw e
      }
    }

    const firin = await blokHazirla('furnace', async () => {
      if (secenek.yardimla) {
        const tas = say('cobblestone') >= 8 ? 'cobblestone' : 'cobbled_deepslate'
        await yardimIste(['furnace'], [[tas, 8]], cevap)
        return
      }
      const masa = await masaHazirla()
      await uret('furnace', 1, masa.blok)
      await geriTopla(masa)
    })
    const pencere = await bot.openFurnace(firin.blok)
    try {
      const id = (isim) => reg().itemsByName[isim].id
      await pencere.putInput(id('raw_iron'), null, ham)

      // Yakıt yuvası tek çeşit alır. Önce kömür koyarız; biterse tahta/kütük ekleriz.
      // Çalışma masası yoksa yenisi için 4 tahtalık odun yakmadan ayrılır.
      let kalanYakit = ham // daha kaç eşyalık yakıt lazım
      const yakitEkle = async () => {
        if (kalanYakit <= 0) return false
        for (const yakit of ['coal', 'charcoal']) {
          const n = Math.min(say(yakit), Math.ceil(kalanYakit / 8) + 1) // +1 pay
          if (n > 0) {
            await pencere.putFuel(id(yakit), null, n)
            kalanYakit -= n * 8
            return true
          }
        }
        let ayir = varMi('crafting_table') ? 0 : 4
        for (const odun of bot.inventory.items()) {
          const kutuk = odun.name.endsWith('_log')
          if (!kutuk && !odun.name.endsWith('_planks')) continue
          const birim = kutuk ? 4 : 1 // tahta cinsinden değeri
          const ayrilan = Math.min(odun.count, Math.max(0, Math.ceil(ayir / birim)))
          ayir -= ayrilan * birim
          const n = Math.min(odun.count - ayrilan, Math.ceil(kalanYakit / 1.5))
          if (n <= 0) continue
          await pencere.putFuel(odun.type, null, n)
          kalanYakit -= n * 1.5
          return true
        }
        return false
      }
      if (!(await yakitEkle())) throw new Error('yakacak kömür ya da odun yok')

      // pişenleri al, yakıt biterse yenisini ekle
      let sonDegisim = Date.now()
      let uyardim = false
      while (true) {
        await bekle(40)
        if (pencere.outputItem()) {
          await pencere.takeOutput()
          sonDegisim = Date.now()
        }
        if (!pencere.inputItem() && !pencere.outputItem()) break
        if (!pencere.fuelItem() && pencere.inputItem()) {
          if (await yakitEkle()) {
            sonDegisim = Date.now()
          } else if (!uyardim) {
            cevap('Yakıt bitti, eriyebildiği kadarını alacağım.')
            uyardim = true
          }
        }
        if (Date.now() - sonDegisim > 30000) break // ilerleme yok
      }
      if (pencere.inputItem()) await pencere.takeInput()
      if (pencere.fuelItem()) await pencere.takeFuel()
    } finally {
      bot.closeWindow(pencere)
    }
    await geriTopla(firin)
  }

  // Demir eşyaları bot kendisi yapmıyor: bir oyuncudan yardım istiyor.
  // Oyuncu !yardimet yazınca yanına gidip külçe ve çubukları atar,
  // oyuncu yaptığı eşyaları geri atınca toplar.
  let yardimci = null // !yardimet yazan oyuncunun adı

  function yardimEt(kim, cevap) {
    if (!durum.yardimBekliyor) {
      cevap('Şu an yardıma ihtiyacım yok, sağ ol.')
      return
    }
    if (yardimci && yardimci !== kim) {
      cevap(`${yardimci} bana zaten yardım ediyor, sağ ol.`)
      return
    }
    yardimci = kim
    cevap(`Tamam ${kim}, yanına geliyorum.`)
  }

  // Genel yardım isteme: `ver` listesindeki malzemeleri yardımcıya atar,
  // `istenen` listesindeki eşyalar (her birinden 1) geri gelene kadar bekler.
  // ver: [['iron_ingot', 24], ['stick', 5], ...]  istenen: ['iron_pickaxe', ...]
  async function yardimIste(istenen, ver, cevap) {
    const ad = (i) => TR[i] || i
    const liste = istenen.map(ad).join(', ')
    const elde = () => istenen.filter((i) => varMi(i)) // zaten olanlar
    const bekleniyor = () => istenen.filter((i) => !varMi(i))
    if (!bekleniyor().length) return
    const oncedenVar = new Set(elde())

    durum.yardimBekliyor = true
    yardimci = null
    try {
      // 1) Yardımcı bekle
      cevap(`Bana ${liste} yapacak biri !yardimet yazsın, malzemeleri ben veririm.`)
      let sonHatirlatma = Date.now()
      let oyuncu = null
      while (!oyuncu) {
        await bekle(20)
        if (yardimci) {
          const p = bot.players[yardimci]
          if (!p) {
            cevap(`${yardimci} oyundan çıktı, başka biri !yardimet yazsın.`)
            yardimci = null
          } else if (p.entity) {
            oyuncu = p.entity
          } else if (Date.now() - sonHatirlatma > 30000) {
            cevap(`${yardimci}, seni göremiyorum, yanıma gel. Buradayım: ${konumYazi()}`)
            sonHatirlatma = Date.now()
          }
        } else if (Date.now() - sonHatirlatma > 90000) {
          cevap(`Hâlâ yardım bekliyorum: ${liste} yapacak biri !yardimet yazsın.`)
          sonHatirlatma = Date.now()
        }
      }

      // 2) Yanına git ve malzemeleri at
      try {
        await git(new goals.GoalFollow(oyuncu, 3), 90000) // çok dibine girme, attıklarımı geri toplamayayım
      } catch (e) {
        if (e instanceof Iptal) throw e
      }
      bot.pathfinder.setGoal(null)
      await bot.lookAt(oyuncu.position.offset(0, 1.6, 0))
      const atilan = []
      const eksikler = []
      for (const [isim, adet] of ver) {
        let n = Math.min(say(isim), adet)
        if (n > 0) {
          await bot.toss(reg().itemsByName[isim].id, null, n)
          atilan.push(`${n} ${ad(isim)}`)
        }
        if (n < adet && isim === 'stick') {
          // çubuk yoksa kütük ver (1 kütük = 8 çubuk)
          const kutuk = bot.inventory.items().find((it) => it.name.endsWith('_log'))
          if (kutuk) {
            const k = Math.min(kutuk.count, Math.ceil((adet - n) / 8))
            await bot.toss(kutuk.type, null, k)
            atilan.push(`${k} kütük (çubuk için)`)
            n = adet
          }
        }
        if (n < adet) eksikler.push(`${adet - n} ${ad(isim)}`)
      }
      cevap(`${yardimci}, sana ${atilan.join(', ') || 'hiçbir şey'} attım.` +
        (eksikler.length ? ` Eksik: ${eksikler.join(', ')}, onları sen ekle.` : ''))
      cevap(`Lütfen şunları yapıp bana geri at (Q tuşu): ${bekleniyor().map(ad).join(', ')}`)
      // Attığımız eşyaları hemen geri toplamamak için biraz bekle
      await bekle(60)

      // 3) Yapılanları bekle: oyuncuyu takip et, yakına atılan eşyaları topla
      let kalan = bekleniyor().length
      sonHatirlatma = Date.now()
      while (bekleniyor().length) {
        const p = bot.players[yardimci]
        if (p && p.entity) bot.pathfinder.setGoal(new goals.GoalFollow(p.entity, 2), true)
        await bekle(20)
        // yere atılmış istenen eşya varsa git al (bizim attığımız malzemeler hariç)
        const ben = bot.entity.position
        const esya = Object.values(bot.entities).find((e) => {
          if (e.name !== 'item' || e.position.distanceTo(ben) > 8) return false
          const it = e.getDroppedItem && e.getDroppedItem()
          return it && istenen.includes(it.name) && !oncedenVar.has(it.name)
        })
        if (esya) {
          const q = esya.position.floored()
          try {
            await git(new goals.GoalBlock(q.x, q.y, q.z), 8000)
          } catch (e) {
            if (e instanceof Iptal) throw e
          }
        }
        if (bekleniyor().length < kalan) {
          kalan = bekleniyor().length
          cevap(kalan ? `Teşekkürler! Kalan: ${bekleniyor().map(ad).join(', ')}` : 'Hepsi geldi, çok teşekkürler!')
          await giyin()
          sonHatirlatma = Date.now()
        } else if (Date.now() - sonHatirlatma > 120000) {
          cevap(`Hâlâ bekliyorum: ${bekleniyor().map(ad).join(', ')}`)
          sonHatirlatma = Date.now()
        }
      }
    } finally {
      durum.yardimBekliyor = false
      yardimci = null
      bot.pathfinder.setGoal(null)
    }
  }

  function konumYazi() {
    const p = bot.entity.position
    return `${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`
  }

  async function yardimAsamasi(cevap) {
    const eksik = eksikDemirEsyalar()
    if (!eksik.length) return
    let kulce = say('iron_ingot')
    const yapilacak = []
    for (const [isim, n] of eksik) {
      if (kulce >= n) {
        yapilacak.push(isim)
        kulce -= n
      }
    }
    if (!yapilacak.length) return
    const verilecekKulce = yapilacak.reduce((t, i) => t + DEMIR_ESYALAR.find(([n]) => n === i)[1], 0)
    const gerekenCubuk = yapilacak.filter((i) => ['iron_pickaxe', 'iron_axe'].includes(i)).length * 2 +
      (yapilacak.includes('iron_sword') ? 1 : 0)
    cevap(`${say('iron_ingot')} demir külçem hazır.`)
    const ver = [['iron_ingot', verilecekKulce]]
    if (gerekenCubuk) ver.push(['stick', gerekenCubuk])
    await yardimIste(yapilacak, ver, cevap)
  }

  // Elindeki en iyi zırhı giy, en iyi kılıcı eline al (elmas > demir > ...)
  async function giyin() {
    const SIRA = ['netherite', 'diamond', 'iron', 'chainmail', 'golden', 'stone', 'leather', 'wooden']
    const deger = (isim) => {
      const i = SIRA.findIndex((m) => isim.startsWith(m + '_'))
      return i === -1 ? 99 : i
    }
    const enIyi = (son) => bot.inventory.items()
      .filter((it) => it.name.endsWith(son))
      .sort((a, b) => deger(a.name) - deger(b.name))[0]
    for (const [parca, yer] of [['_helmet', 'head'], ['_chestplate', 'torso'], ['_leggings', 'legs'], ['_boots', 'feet']]) {
      const esya = enIyi(parca)
      if (!esya) continue
      const giyili = bot.inventory.slots[bot.getEquipmentDestSlot(yer)]
      if (giyili && deger(giyili.name) <= deger(esya.name)) continue
      try { await bot.equip(esya, yer) } catch (e) { /* olmazsa geç */ }
    }
    const kilic = enIyi('_sword')
    if (kilic) {
      try { await bot.equip(kilic, 'hand') } catch (e) { /* olmazsa geç */ }
    }
  }

  // ---------------------------------------------------------- ana akış
  async function gelis(cevap) {
    durum.iptal = false
    soyle = cevap
    bot.setControlState('sneak', false)
    // Demir yetmediği için bazı parçalar eksik kalırsa kendiliğinden tekrar madene iner.
    // Bir turda hiç yeni parça yapamazsa (ilerleme yoksa) durur ve eksikleri söyler.
    for (let tur = 1; tur <= 4; tur++) {
      const onceki = eksikDemirEsyalar().length
      await odunAsamasi(cevap)
      await tahtaKazmaAsamasi(cevap)
      await tasAsamasi(cevap)
      await madenAsamasi(cevap)
      await eritmeAsamasi(cevap)
      await yardimAsamasi(cevap)
      await giyin()
      const eksik = eksikDemirEsyalar().map(([isim]) => isim)
      if (!eksik.length) return
      console.log(`Tur ${tur} bitti. Eksik: ${eksik.join(', ')} | envanter: ${envanterOzeti()}`)
      if (eksik.length === onceki) {
        throw new Error('ilerleyemedim, eksik kalanlar: ' + eksik.join(', ') +
          ` (külçe: ${say('iron_ingot')}, ham demir: ${say('raw_iron')}, kömür: ${say(['coal', 'charcoal'])})`)
      }
      cevap('Eksik kalanlar: ' + eksik.join(', ') + '. Tekrar madene iniyorum.')
    }
  }

  function envanterOzeti() {
    const toplam = {}
    for (const it of tumEsyalar()) toplam[it.name] = (toplam[it.name] || 0) + it.count
    return Object.entries(toplam).map(([i, n]) => `${i} x${n}`).join(', ') || 'boş'
  }

  // gelisim2.js ve komutlar.js'in kullandığı ortak araçlar
  const araclar = {
    durum,
    baslat: (cevap) => { durum.iptal = false; soyle = cevap },
    git, bekle, kontrol, say, varMi, giyin, yemekYe, copAt, yerAc, topla,
    blokBul, bulVeKaz, kesfet, yardimIste, eritmeAsamasi, envanterOzeti, konumYazi,
    blokKaz, uret, tahtaYap, cubukYap, masaHazirla, geriTopla, kazmaYenile, tahtaSay, kutukSay,
    demirSetTamam: () => !eksikDemirEsyalar().length,
  }

  return {
    gelis,
    yardimEt,
    iptal: () => { durum.iptal = true },
    envanterOzeti,
    araclar,
    Iptal,
  }
}

module.exports = { gelisimKur, Iptal, AletYok, TR }
