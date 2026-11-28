// komutlar.js — kolay komutlar: !ver, !sandik, !topla, !yap, !uyu, !eve git, !esyalarim, !balik
// gelisim.js'deki ortak araçları (git, bulVeKaz, uret ...) kullanır; bu yüzden !dur hepsini durdurur.
// Gelen kelimeler bot.js'de sadeleştirilmiş olur: küçük harf, Türkçe harfsiz ("kılıç" -> "kilic").

const { goals } = require('mineflayer-pathfinder')
const { TR, Iptal } = require('./gelisim')
const evler = require('./evler')

// ------------------------------------------------------------ Türkçe eşya adları
// "demir kazma" gibi iki kelimelik alet/zırh adları: malzeme + parça
const MALZEME = {
  tahta: 'wooden', tas: 'stone', demir: 'iron', altin: 'golden', elmas: 'diamond',
  netherite: 'netherite', deri: 'leather', zincir: 'chainmail',
}
const PARCA = {
  kazma: 'pickaxe', balta: 'axe', kilic: 'sword', kurek: 'shovel', capa: 'hoe',
  kask: 'helmet', gogusluk: 'chestplate', pantolon: 'leggings', bot: 'boots', cizme: 'boots',
}
const TEK = {
  demir: 'iron_ingot', 'demir kulce': 'iron_ingot', kulce: 'iron_ingot', 'ham demir': 'raw_iron',
  altin: 'gold_ingot', 'altin kulce': 'gold_ingot', 'ham altin': 'raw_gold',
  bakir: 'copper_ingot', 'ham bakir': 'raw_copper',
  elmas: 'diamond', komur: 'coal', 'odun komuru': 'charcoal', zumrut: 'emerald',
  lapis: 'lapis_lazuli', kiziltas: 'redstone', obsidyen: 'obsidian',
  cubuk: 'stick', tas: 'cobblestone', kiriktas: 'cobblestone', 'kirik tas': 'cobblestone',
  'duz tas': 'stone', toprak: 'dirt', kum: 'sand', cakil: 'gravel', cakmaktasi: 'flint',
  cam: 'glass', kil: 'clay_ball',
  ekmek: 'bread', elma: 'apple', havuc: 'carrot', patates: 'potato', 'pismis patates': 'baked_potato',
  bugday: 'wheat', tohum: 'wheat_seeds', et: 'beef', biftek: 'cooked_beef', 'pismis et': 'cooked_beef',
  tavuk: 'chicken', 'pismis tavuk': 'cooked_chicken', domuz: 'porkchop', 'pismis domuz': 'cooked_porkchop',
  mesale: 'torch', firin: 'furnace', masa: 'crafting_table', 'calisma masasi': 'crafting_table',
  sandik: 'chest', varil: 'barrel', kova: 'bucket', 'su kovasi': 'water_bucket', kalkan: 'shield',
  yay: 'bow', ok: 'arrow', merdiven: 'ladder', kemik: 'bone', ip: 'string', tuy: 'feather',
  barut: 'gunpowder', kagit: 'paper', kitap: 'book', 'seker kamisi': 'sugar_cane',
  cakmak: 'flint_and_steel', makas: 'shears', olta: 'fishing_rod', pusula: 'compass',
  saat: 'clock', kayik: 'oak_boat', tekne: 'oak_boat', kapi: 'oak_door', cit: 'oak_fence', tabela: 'oak_sign',
}
// Birden çok çeşidi olan eşyalar (meşe/huş/ladin kütüğü gibi)
const GRUP = {
  odun: (n) => n.endsWith('_log') && !n.startsWith('stripped_'),
  kutuk: (n) => n.endsWith('_log') && !n.startsWith('stripped_'),
  tahta: (n) => n.endsWith('_planks'),
  yatak: (n) => n.endsWith('_bed'),
  yun: (n) => n.endsWith('_wool'),
}

// Sandığa koyarken üstünde tutulacaklar
const ALET = (n) => /_(pickaxe|axe|sword|shovel|hoe|helmet|chestplate|leggings|boots)$/.test(n) ||
  ['shield', 'bow', 'crossbow', 'trident', 'flint_and_steel', 'shears', 'fishing_rod'].includes(n)
const YENMEZ = ['rotten_flesh', 'spider_eye', 'poisonous_potato', 'pufferfish', 'suspicious_stew', 'chorus_fruit']

// !topla ile toplanabilenler: hangi bloklar kazılır, sonunda hangi eşyalar sayılır, hangi kazma lazım
const TAS_BLOKLARI = ['stone', 'cobblestone', 'deepslate', 'cobbled_deepslate']
const TOPLA = {
  odun: { ad: 'kütük', bloklar: 'log', adlar: 'log', alet: null },
  tas: { ad: 'taş', bloklar: TAS_BLOKLARI, adlar: ['cobblestone', 'cobbled_deepslate'], alet: 'tahta', asagi: true },
  komur: { ad: 'kömür', bloklar: ['coal_ore', 'deepslate_coal_ore'], adlar: ['coal'], alet: 'tahta', maden: true },
  demir: { ad: 'ham demir', bloklar: ['iron_ore', 'deepslate_iron_ore'], adlar: ['raw_iron'], alet: 'tas', maden: true },
  bakir: { ad: 'ham bakır', bloklar: ['copper_ore', 'deepslate_copper_ore'], adlar: ['raw_copper'], alet: 'tas', maden: true },
  altin: { ad: 'ham altın', bloklar: ['gold_ore', 'deepslate_gold_ore'], adlar: ['raw_gold'], alet: 'demir', maden: true },
  toprak: { ad: 'toprak', bloklar: ['dirt', 'grass_block'], adlar: ['dirt'], alet: null },
  kum: { ad: 'kum', bloklar: ['sand'], adlar: ['sand'], alet: null },
  cakil: { ad: 'çakıl', bloklar: ['gravel'], adlar: ['gravel', 'flint'], alet: null },
}
TOPLA.kutuk = TOPLA.odun
TOPLA.kiriktas = TOPLA.tas

const HEPSI = ['hepsi', 'hepsini', 'tum', 'tumu', 'tumunu']

function komutlarKur(bot, a) {
  const reg = () => bot.registry

  // Kelimelerden eşya bul. Dönen: { adlar: [minecraft adları], ad: 'sohbette görünen ad' }
  function esyaCoz(kelimeler) {
    const metin = kelimeler.join(' ')
    if (!metin) return null
    let adlar = null
    if (kelimeler.length === 2 && MALZEME[kelimeler[0]] && PARCA[kelimeler[1]]) {
      adlar = [`${MALZEME[kelimeler[0]]}_${PARCA[kelimeler[1]]}`]
    } else if (TEK[metin]) {
      adlar = [TEK[metin]]
    } else if (GRUP[metin]) {
      adlar = reg().itemsArray.map((i) => i.name).filter(GRUP[metin])
    } else {
      adlar = [metin.replace(/ /g, '_')] // İngilizce ad da olur: iron_ingot
    }
    adlar = adlar.filter((n) => reg().itemsByName[n])
    if (!adlar.length) return null
    return { adlar, ad: adlar.length === 1 && TR[adlar[0]] ? TR[adlar[0]] : metin }
  }

  // Sondaki sayıyı ya da "hepsi" kelimesini ayır
  function adetAyir(kelimeler, varsayilan) {
    const son = kelimeler[kelimeler.length - 1]
    if (/^\d+$/.test(son || '')) return { adet: Math.max(1, parseInt(son, 10)), kelimeler: kelimeler.slice(0, -1) }
    if (HEPSI.includes(son)) return { adet: 'hepsi', kelimeler: kelimeler.slice(0, -1) }
    return { adet: varsayilan, kelimeler }
  }

  const kutukler = () => reg().blocksArray.map((b) => b.name).filter(GRUP.odun)

  // ---------------------------------------------------------- !ver [oyuncu] eşya [adet|hepsi]
  async function ver(kim, kelimeler, hamKelimeler, cevap) {
    a.baslat(cevap)
    let hedefAd = kim
    // ilk kelime oyundaki bir oyuncunun tam adıysa eşya ona verilir
    const ilk = (hamKelimeler[0] || '').toLowerCase()
    const oyuncuAdi = Object.keys(bot.players).find((n) => n !== bot.username && n.toLowerCase() === ilk)
    if (oyuncuAdi && kelimeler.length > 1) {
      hedefAd = oyuncuAdi
      kelimeler = kelimeler.slice(1)
    }
    const ayrik = adetAyir(kelimeler, 1)
    const esya = esyaCoz(ayrik.kelimeler)
    if (!esya) throw new Error(`"${ayrik.kelimeler.join(' ')}" diye bir eşya bilmiyorum`)
    const elde = a.say(esya.adlar)
    if (!elde) throw new Error(`üstümde ${esya.ad} yok`)
    const istenen = ayrik.adet === 'hepsi' ? elde : ayrik.adet
    const n = Math.min(istenen, elde)

    const oyuncu = bot.players[hedefAd] && bot.players[hedefAd].entity
    if (!oyuncu) throw new Error(`${hedefAd} çok uzakta, göremiyorum`)
    const p = oyuncu.position
    if (p.distanceTo(bot.entity.position) > 3) {
      try {
        await a.git(new goals.GoalNear(p.x, p.y, p.z, 2), 60000)
      } catch (e) {
        if (e instanceof Iptal) throw e
        throw new Error(`${hedefAd} yanına gidemedim`)
      }
    }
    bot.pathfinder.setGoal(null)
    await bot.lookAt(oyuncu.position.offset(0, 1.6, 0))
    let kalan = n
    for (const isim of esya.adlar) {
      const k = Math.min(a.say(isim), kalan)
      if (k <= 0) continue
      await bot.toss(reg().itemsByName[isim].id, null, k)
      kalan -= k
      if (!kalan) break
    }
    cevap(`${hedefAd}, sana ${n} ${esya.ad} attım.` + (istenen > n ? ' (Üstümde bu kadar vardı.)' : ''))
  }

  // ---------------------------------------------------------- !sandik [hepsi | eşya]
  async function sandik(kelimeler, cevap) {
    a.baslat(cevap)
    let filtre
    let neyi
    if (!kelimeler.length) {
      // gereksizler: alet, zırh, silah, yemek ve meşale dışındaki her şey
      filtre = (it) => !ALET(it.name) && it.name !== 'torch' &&
        !(reg().foodsByName[it.name] && !YENMEZ.includes(it.name))
      neyi = 'gereksiz eşyalarımı'
    } else if (HEPSI.includes(kelimeler[0])) {
      filtre = (it) => !ALET(it.name) // aletler ve yedek zırh hariç her şey
      neyi = 'aletlerim dışında her şeyi'
    } else {
      const esya = esyaCoz(kelimeler)
      if (!esya) throw new Error(`"${kelimeler.join(' ')}" diye bir eşya bilmiyorum`)
      filtre = (it) => esya.adlar.includes(it.name)
      neyi = 'tüm ' + esya.ad
    }

    const toplam = {}
    for (const it of bot.inventory.items()) {
      if (filtre(it)) toplam[it.name] = (toplam[it.name] || 0) + it.count
    }
    if (!Object.keys(toplam).length) {
      cevap('Sandığa koyacak eşyam yok.')
      return
    }

    const blok = a.blokBul(['chest', 'trapped_chest', 'barrel'], 24)
    if (!blok) throw new Error('24 blok içinde sandık yok')
    cevap(`Sandığa ${neyi} koyuyorum.`)
    const p = blok.position
    await a.git(new goals.GoalCompositeAny([
      new goals.GoalLookAtBlock(p, bot.world),
      new goals.GoalGetToBlock(p.x, p.y, p.z),
    ]), 45000)
    const kutu = await bot.openContainer(bot.blockAt(p))
    let konan = 0
    let doldu = false
    try {
      for (const [isim, adet] of Object.entries(toplam)) {
        try {
          await kutu.deposit(reg().itemsByName[isim].id, null, adet)
          konan += adet
        } catch (e) {
          console.log('Sandığa konamadı:', isim, e.message)
          doldu = true
          break
        }
      }
    } finally {
      kutu.close()
    }
    if (!konan) throw new Error('sandık dolu')
    cevap(`${konan} eşyayı sandığa koydum.` + (doldu ? ' Sandık doldu, kalanlar bende.' : ''))
  }

  // ---------------------------------------------------------- !topla malzeme [adet]
  async function topla(kelimeler, cevap) {
    a.baslat(cevap)
    const ayrik = adetAyir(kelimeler, 16)
    const anahtar = ayrik.kelimeler.join(' ')
    if (anahtar === 'elmas') throw new Error('elmas için !gelis2 yaz, o derine inip arıyor')
    const t = TOPLA[anahtar]
    if (!t) throw new Error('bunu toplayamam. Toplayabildiklerim: odun, tas, komur, demir, bakir, altin, toprak, kum, cakil')
    if (ayrik.adet === 'hepsi') throw new Error('kaç tane? Örnek: !topla odun 32')
    const adet = Math.min(ayrik.adet, 640)
    const bloklar = t.bloklar === 'log' ? kutukler() : t.bloklar
    const say = () => (t.adlar === 'log' ? a.kutukSay() : a.say(t.adlar))
    const hedef = say() + adet
    const ilk = say()
    cevap(`${adet} ${t.ad} topluyorum.`)

    let bos = 0
    let sonRapor = Date.now()
    const ilerleme = () => bot.mcbotIlerleme && bot.mcbotIlerleme(Math.max(0, say() - ilk), adet)
    while (say() < hedef) {
      ilerleme()
      await a.yemekYe()
      if (bot.inventory.emptySlotCount() === 0) {
        throw new Error(`envanterim doldu (${say() - ilk}/${adet}). !sandik yazıp tekrar dene`)
      }
      if (t.alet === 'tahta' || t.alet === 'tas') await a.kazmaYenile(t.alet)
      if (t.alet === 'demir' && !['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'].some(a.varMi)) {
        throw new Error('altın kazmak için demir kazma lazım')
      }
      const kazdi = await a.bulVeKaz(bloklar, 32)
      if (kazdi) {
        bos = 0
      } else {
        if (++bos > 30) throw new Error(`etrafta yeterli ${t.ad} bulamadım (${say() - ilk}/${adet})`)
        const y = Math.floor(bot.entity.position.y)
        if (t.maden && y > 24) {
          // madenler derinde daha çok: kademe kademe in
          try {
            await a.git(new goals.GoalY(Math.max(16, y - 12)), 90000)
          } catch (e) {
            if (e instanceof Iptal) throw e
            await a.kesfet(false)
          }
        } else if (t.asagi && bos % 3 === 0) {
          try {
            await a.git(new goals.GoalY(y - 8), 60000)
          } catch (e) {
            if (e instanceof Iptal) throw e
          }
        } else {
          await a.kesfet(t.maden && y < 50)
        }
      }
      if (Date.now() - sonRapor > 120000) {
        cevap(`Topluyorum: ${say() - ilk}/${adet} ${t.ad}`)
        sonRapor = Date.now()
      }
    }
    cevap(`Tamam, ${say() - ilk} ${t.ad} topladım.`)
  }

  // ---------------------------------------------------------- !yap eşya [adet]
  async function yap(kelimeler, cevap) {
    a.baslat(cevap)
    const ayrik = adetAyir(kelimeler, 1)
    if (ayrik.adet === 'hepsi') throw new Error('kaç tane? Örnek: !yap mesale 8')
    const adet = Math.min(ayrik.adet, 64)
    const metin = ayrik.kelimeler.join(' ')

    // tahta ve çubuk özel: hangi ağaç olursa olsun
    if (metin === 'tahta') {
      await a.tahtaYap(a.tahtaSay() + adet)
      cevap(`${adet} tahta yaptım.`)
      return
    }
    if (metin === 'cubuk') {
      await a.cubukYap(a.say('stick') + adet)
      cevap(`${adet} çubuk yaptım.`)
      return
    }

    const esya = esyaCoz(ayrik.kelimeler)
    if (!esya) throw new Error(`"${metin}" diye bir eşya bilmiyorum`)
    const isim = esya.adlar.find((n) => bot.recipesAll(reg().itemsByName[n].id, null, true).length)
    if (!isim) throw new Error(`${esya.ad} üretilmiyor (bulunan ya da fırında pişen bir şey olabilir)`)
    const id = reg().itemsByName[isim].id

    const masasiz = bot.recipesAll(id, null, null).length > 0
    cevap(`${adet} ${esya.ad} yapıyorum.`)
    if (masasiz) {
      await a.uret(isim, adet)
    } else {
      const odunVar = bot.inventory.items().some((it) => it.name.endsWith('_log') || it.name.endsWith('_planks'))
      if (!bot.recipesFor(id, null, 1, true).length && !odunVar) throw new Error(`${esya.ad} için malzeme yetmiyor`)
      const masa = await a.masaHazirla()
      await a.uret(isim, adet, masa.blok)
      await a.geriTopla(masa)
    }
    cevap(`${esya.ad} hazır.`)
  }

  // ---------------------------------------------------------- !uyu
  function geceMi() {
    const t = bot.time.timeOfDay
    return (t >= 12542 && t <= 23459) || bot.thunderState > 0
  }

  async function uyu(cevap) {
    a.baslat(cevap)
    if (bot.isSleeping) {
      cevap('Zaten uyuyorum.')
      return
    }
    if (!geceMi()) throw new Error('gece değil, uyuyamam')
    const idler = reg().blocksArray.filter((b) => b.name.endsWith('_bed')).map((b) => b.id)
    const yatak = bot.findBlock({ matching: idler, maxDistance: 48 })
    if (!yatak) throw new Error('48 blok içinde yatak yok')
    const p = yatak.position
    bot.setControlState('sneak', false)
    await a.git(new goals.GoalNear(p.x, p.y, p.z, 2), 60000)
    try {
      await bot.sleep(bot.blockAt(p))
    } catch (e) {
      const m = e.message || ''
      if (m.includes('monster')) throw new Error('yakında canavar var, uyuyamıyorum')
      if (m.includes('night')) throw new Error('gece değil, uyuyamam')
      if (m.includes('far')) throw new Error('yatağa yetişemedim')
      if (m.includes('occupied')) throw new Error('yatakta başkası var')
      throw e
    }
    cevap('İyi geceler, uyuyorum. Sabah kalkarım.')
  }

  // ---------------------------------------------------------- !eve git [koylu|tas]
  // En yakın kayıtlı evine yürür, kapıdan girip ortasında durur. Gece ise evdeki yatakta uyur.
  async function eveGit(kelimeler, cevap) {
    a.baslat(cevap)
    const tur = kelimeler.find((k) => ['koylu', 'koyluevi', 'tas'].includes(k))
    const ben = bot.entity.position
    const liste = evler.hepsi()
      .filter((e) => !tur || (tur === 'tas' ? e.tur !== 'koylu' : e.tur === 'koylu'))
      .sort((x, y) => ben.distanceTo(x) - ben.distanceTo(y))
    if (!liste.length) {
      throw new Error(tur ? 'bu sunucuda o türde evim yok' : 'bu sunucuda hiç evim yok. Önce !ev ya da !ev koylu yaz')
    }
    const e = liste[0]
    const koylu = e.tur === 'koylu'
    const uzaklik = Math.round(ben.distanceTo(e))
    // kapının önü: taş evde (x, y, z+3), köylü evinde basamağın önü (x, y-1, z+4)
    const on = koylu ? { x: e.x, y: e.y - 1, z: e.z + 4 } : { x: e.x, y: e.y, z: e.z + 3 }
    cevap(`${koylu ? 'Köylü evime' : 'Evime'} gidiyorum (${on.x} ${on.y} ${on.z}, ${uzaklik} blok).` +
      (uzaklik > 300 ? ' Çok uzak, yol uzun sürebilir.' : ''))
    bot.setControlState('sneak', false)
    try {
      await a.git(new goals.GoalNear(on.x, on.y, on.z, 1), Math.max(60000, uzaklik * 1500))
    } catch (err) {
      if (err instanceof Iptal) throw err
      throw new Error(`evime ulaşamadım (${err.message}). Kapının önü: !git ${on.x} ${on.y} ${on.z}`)
    }
    // içeri gir (kapıyı bot.js yürürken açar)
    try {
      await a.git(new goals.GoalBlock(e.x, e.y, e.z), 20000)
    } catch (err) {
      if (err instanceof Iptal) throw err
      cevap('Evimin önündeyim ama içeri giremedim (kapı kapalı ya da önü dolu olabilir).')
      return
    }
    if (geceMi()) {
      try {
        await uyu(cevap)
        return
      } catch (err) {
        if (err instanceof Iptal) throw err
        cevap(`Evdeyim ama uyuyamadım: ${err.message}.`)
        return
      }
    }
    cevap('Evdeyim.')
  }

  // ---------------------------------------------------------- !esyalarim
  // Öldüğü yere gidip yere düşen eşyalarını toplar, zırhını yeniden giyer.
  // olum: bot.js'in ölünce kaydettiği { konum, zaman, boyut }
  async function esyalarim(olum, cevap) {
    a.baslat(cevap)
    if (!olum) throw new Error('bu bağlantıda hiç ölmedim')
    if (olum.boyut && bot.game && bot.game.dimension !== olum.boyut) throw new Error('öldüğüm yer başka bir boyutta (Nether/End)')
    const p = olum.konum
    const dakika = (Date.now() - olum.zaman) / 60000
    if (dakika > 5) cevap('Öleli 5 dakikadan fazla oldu; eşyalar kaybolmuş olabilir, yine de bakıyorum.')
    const uzaklik = Math.round(bot.entity.position.distanceTo(p))
    cevap(`Öldüğüm yere gidiyorum (${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}, ${uzaklik} blok).`)
    bot.setControlState('sneak', false)
    try {
      await a.git(new goals.GoalNear(p.x, p.y, p.z, 2), Math.max(60000, uzaklik * 1500))
    } catch (err) {
      if (err instanceof Iptal) throw err
      throw new Error(`öldüğüm yere ulaşamadım (${err.message}). Lav, su ya da çok derin bir yer olabilir`)
    }
    const toplam = () => bot.inventory.items().reduce((t, i) => t + i.count, 0)
    const once = toplam()
    const yerdeki = () => Object.values(bot.entities)
      .filter((x) => x.name === 'item' && x.position.distanceTo(p) < 12)
      .sort((x, y) => x.position.distanceTo(bot.entity.position) - y.position.distanceTo(bot.entity.position))
    let bos = 0
    for (let i = 0; i < 60 && bos < 4; i++) {
      a.kontrol()
      const esya = yerdeki()[0]
      if (!esya) {
        bos++
        await a.bekle(10)
        continue
      }
      bos = 0
      const q = esya.position.floored()
      try {
        await a.git(new goals.GoalBlock(q.x, q.y, q.z), 8000)
      } catch (err) {
        if (err instanceof Iptal) throw err
      }
      await a.bekle(4)
    }
    await a.giyin()
    const alinan = toplam() - once
    const kalan = yerdeki().length
    if (!alinan) throw new Error('yerde eşyamı bulamadım (kaybolmuş ya da biri almış olabilir)')
    cevap(`${alinan} eşya topladım, zırhımı giydim.` + (kalan ? ` ${kalan} yığına yetişemedim.` : ''))
  }

  // ---------------------------------------------------------- !balik [adet]
  // Yakındaki açık suyun kıyısına gider, oltayla balık tutar. Olta yoksa kendisi yapmaz, birinin vermesi gerekir.
  // Balık gelmezse (olta karaya düştüyse) 40 sn sonra oltayı çekip yeniden atar.
  async function balik(kelimeler, cevap) {
    a.baslat(cevap)
    const sayi = kelimeler.map(Number).find((n) => Number.isInteger(n) && n > 0)
    const adet = Math.min(64, sayi || 10)
    const olta = () => bot.inventory.items().find((i) => i.name === 'fishing_rod')
    if (!olta()) throw new Error('oltam yok. Bana bir olta at (Q ile), sonra tekrar !balik yaz')

    // Su: üstü açık, etrafında da su olan (gölet/deniz) en yakın su bloğu
    const suMu = (p) => { const b = bot.blockAt(p); return b && b.name === 'water' }
    const havaMi = (p) => { const b = bot.blockAt(p); return b && b.boundingBox === 'empty' && b.name !== 'water' }
    const kuruMu = (p) => { const b = bot.blockAt(p); return b && b.boundingBox === 'block' }
    const idler = [bot.registry.blocksByName.water.id]
    const adaylar = bot.findBlocks({ matching: idler, maxDistance: 32, count: 300 })
      .filter((p) => havaMi(p.offset(0, 1, 0)) && suMu(p.offset(1, 0, 0)) && suMu(p.offset(-1, 0, 0)) &&
        suMu(p.offset(0, 0, 1)) && suMu(p.offset(0, 0, -1)))
    if (!adaylar.length) throw new Error('32 blok içinde balık tutacak açık su yok')

    // Kıyıda durulacak yer: suya 2-5 blok uzakta, kuru zeminli, başının üstü boş
    let su = null
    let durak = null
    for (const w of adaylar.slice(0, 40)) {
      for (let dx = -5; dx <= 5 && !durak; dx++) {
        for (let dz = -5; dz <= 5 && !durak; dz++) {
          for (const dy of [0, 1, -1, 2]) {
            const zemin = w.offset(dx, dy, dz)
            const ayak = zemin.offset(0, 1, 0)
            const d = Math.hypot(dx, dz)
            if (d < 2 || d > 5) continue
            if (kuruMu(zemin) && havaMi(ayak) && havaMi(ayak.offset(0, 1, 0))) { durak = ayak; break }
          }
        }
      }
      if (durak) { su = w; break }
    }
    if (!su) su = adaylar[0]
    cevap(`${adet} balık tutmaya gidiyorum.`)
    bot.setControlState('sneak', false)
    try {
      await a.git(durak ? new goals.GoalBlock(durak.x, durak.y, durak.z) : new goals.GoalNear(su.x, su.y + 1, su.z, 3), 60000)
    } catch (err) {
      if (err instanceof Iptal) throw err
      throw new Error(`suyun kıyısına gidemedim (${err.message})`)
    }

    // Balık gelene, süre dolana ya da !dur yazılana kadar bekle
    const yaris = (soz, ms) => new Promise((coz) => {
      let bitti = false
      const t0 = Date.now()
      const bitir = (sonuc) => { if (!bitti) { bitti = true; clearInterval(id); coz(sonuc) } }
      const id = setInterval(() => {
        let iptal = false
        try { a.kontrol() } catch (e) { iptal = true }
        if (iptal) bitir('iptal')
        else if (Date.now() - t0 > ms) bitir('sure')
      }, 250)
      soz.then(() => bitir('tuttu'), () => bitir('kesildi'))
    })

    const sayim = () => {
      const m = {}
      for (const it of bot.inventory.items()) m[it.name] = (m[it.name] || 0) + it.count
      return m
    }
    const ilk = sayim()
    let tutma = 0
    let bosAtis = 0
    const ilerleme = () => bot.mcbotIlerleme && bot.mcbotIlerleme(tutma, adet)
    while (tutma < adet) {
      ilerleme()
      a.kontrol()
      if (!olta()) throw new Error(`oltam kırıldı (${tutma} balık tuttum). Yeni olta atarsan devam ederim`)
      if (!bot.heldItem || bot.heldItem.name !== 'fishing_rod') await bot.equip(olta(), 'hand')
      await bot.lookAt(su.offset(0.5, 0.2, 0.5), true)
      const soz = bot.fish()
      soz.catch(() => {}) // oltayı biz çekersek "Fishing cancelled" hatası verir; önemli değil
      const sonuc = await yaris(soz, 40000)
      if (sonuc === 'tuttu') {
        tutma++
        bosAtis = 0
        await a.bekle(25) // yakalanan eşya uçup gelsin
        continue
      }
      if (sonuc !== 'kesildi') bot.activateItem() // olta hâlâ dışarıda: geri çek
      if (sonuc === 'iptal') a.kontrol() // Iptal fırlatır
      if (++bosAtis >= 4) throw new Error(`olta suya düşmüyor ya da balık gelmiyor (${tutma}/${adet}). Beni başka bir suya götür`)
      await a.bekle(10)
    }
    ilerleme()
    await a.bekle(20)
    // Ne tuttuğunu say (balık, ara sıra ayakkabı, kitap, eyer gibi şeyler de çıkar)
    const son = sayim()
    const kazanc = Object.keys(son).filter((n) => n !== 'fishing_rod' && son[n] > (ilk[n] || 0))
      .map((n) => `${son[n] - (ilk[n] || 0)} ${TR[n] || n}`)
    cevap(`Tamam, ${tutma} kez tuttum${kazanc.length ? ': ' + kazanc.join(', ') : ''}.`)
  }

  return { ver, sandik, topla, yap, uyu, geceMi, eveGit, esyalarim, balik }
}

module.exports = { komutlarKur }
