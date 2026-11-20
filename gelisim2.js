// gelisim2.js — "!gelis2" komutunun beyni: demir setten sonra ELMAS SET.
// Önce !gelis ile demir set tamamlanmış olmalı.
// Sırayla: derine in (y≈-54) -> elmas ara -> 3 elmas olunca oyuncuya elmas kazma yaptır
//          -> 32 elmas olunca oyuncuya elmas zırh + kılıç + balta yaptır -> giyin
// Bot hiçbir şeyi kendisi üretmez: her üretimde !yardimet ile oyuncudan yardım ister.
// Yarıda kesilirse tekrar !gelis2 yazınca kaldığı yerden devam eder.

const { goals } = require('mineflayer-pathfinder')
const { Iptal, AletYok } = require('./gelisim')

// ---------------------------------------------------------------- ayarlar
const ELMAS_Y = -54 // elmas arama seviyesi (daha aşağısı lav gölleriyle dolu)
const ELMAS_ESYALAR = [
  // öncelik sırasına göre
  ['diamond_pickaxe', 3],
  ['diamond_sword', 2],
  ['diamond_chestplate', 8],
  ['diamond_leggings', 7],
  ['diamond_helmet', 5],
  ['diamond_boots', 4],
  ['diamond_axe', 3],
]
const CUBUKLU = { diamond_pickaxe: 2, diamond_axe: 2, diamond_sword: 1, iron_pickaxe: 2 }
const ELMAS_CEVHER = ['diamond_ore', 'deepslate_diamond_ore']
const DEMIR_CEVHER = ['iron_ore', 'deepslate_iron_ore']
const TAS_TURLERI = ['cobblestone', 'cobbled_deepslate']

function gelisim2Kur(bot, a) {
  const eksikElmas = () => ELMAS_ESYALAR.filter(([isim]) => !a.varMi(isim))
  const elmasIhtiyac = () => eksikElmas().reduce((t, [, n]) => t + n, 0)
  const demirKazmaVar = () => a.varMi('iron_pickaxe') || a.varMi('diamond_pickaxe')
  const yedekDemir = () => a.say('iron_ingot') + a.say('raw_iron')
  const cubukSay = (liste) => liste.reduce((t, i) => t + (CUBUKLU[i] || 0), 0)

  // Tünel kazarken değerli kazmaları harcamasın: taş kazması varsa sıradan bloklarda onu kullansın
  function aletTercihiKur() {
    const orijinal = bot.pathfinder.bestHarvestTool
    bot.pathfinder.bestHarvestTool = (blok) => {
      const en = orijinal(blok)
      if (!en || !en.name.endsWith('_pickaxe')) return en
      if (ELMAS_CEVHER.includes(blok.name)) return en
      if (!String(blok.material || '').includes('pickaxe')) return en
      const tas = bot.inventory.items().find((it) => it.name === 'stone_pickaxe')
      if (tas && (!blok.harvestTools || blok.harvestTools[tas.type])) return tas
      return en
    }
    return () => { bot.pathfinder.bestHarvestTool = orijinal }
  }

  // Oyuncudan istek: istenen eşyalar + (taş kazma yoksa ve kırıktaş varsa) bir taş kazma
  async function yardimla(istenen, ver, cevap) {
    istenen = istenen.slice()
    ver = ver.slice()
    if (!a.varMi('stone_pickaxe') && a.say(TAS_TURLERI) >= 3) {
      istenen.push('stone_pickaxe')
      ver.push([a.say('cobblestone') >= 3 ? 'cobblestone' : 'cobbled_deepslate', 3])
    }
    const cubuk = cubukSay(istenen) + (istenen.includes('stone_pickaxe') ? 2 : 0)
    if (cubuk) ver.push(['stick', cubuk])
    await a.yardimIste(istenen, ver, cevap)
  }

  // Elmas kazabilmek için demir (ya da elmas) kazma lazım
  async function kazmaKontrol(cevap) {
    if (demirKazmaVar()) return
    cevap('Demir kazmam yok, elmas kazamam. Yenisini ayarlıyorum.')
    if (a.say('iron_ingot') < 3 && yedekDemir() >= 3) await a.eritmeAsamasi(cevap, { yardimla: true })
    if (a.say('iron_ingot') >= 3) {
      await yardimla(['iron_pickaxe'], [['iron_ingot', 3]], cevap)
      return
    }
    // demir de yok: taş kazmayla demir ara
    if (!a.varMi('stone_pickaxe')) {
      if (a.say(TAS_TURLERI) < 3) throw new Error('ne kazmam ne de kazma yapacak taşım kaldı')
      await yardimla([], [], cevap) // sadece taş kazma ister
    }
    cevap('Demir kazma için demir arıyorum.')
    let bos = 0
    while (yedekDemir() < 3) {
      await a.yemekYe()
      if (!(await a.bulVeKaz(DEMIR_CEVHER, 32, { aletYokFirlat: true }))) {
        if (++bos > 30) throw new Error('demir kazma için demir bulamadım')
        await a.kesfet(true)
      }
    }
    await a.eritmeAsamasi(cevap, { yardimla: true })
    await yardimla(['iron_pickaxe'], [['iron_ingot', 3]], cevap)
  }

  async function derineIn(cevap) {
    let y = Math.floor(bot.entity.position.y)
    if (y <= ELMAS_Y + 4) return
    cevap(`Elmas için derine iniyorum (şu an y=${y}, hedef y=${ELMAS_Y}).`)
    let deneme = 0
    while (y > ELMAS_Y + 4) {
      if (++deneme > 30) throw new Error('derine inemedim')
      await a.yemekYe()
      await a.copAt()
      try {
        await a.git(new goals.GoalY(Math.max(ELMAS_Y, y - 12)), 120000)
      } catch (e) {
        if (e instanceof Iptal || e instanceof AletYok) throw e
        await a.kesfet(true) // bu noktadan inemiyorsa biraz kenara kay
      }
      y = Math.floor(bot.entity.position.y)
    }
  }

  async function elmasAra(cevap) {
    if (a.say('diamond') >= elmasIhtiyac()) return
    await derineIn(cevap)
    cevap(`Elmas arıyorum: ${a.say('diamond')}/${elmasIhtiyac()}`)
    let sonRapor = Date.now()
    let sonElmas = a.say('diamond')
    let bos = 0
    while (a.say('diamond') < elmasIhtiyac()) {
      await a.yemekYe()
      await a.copAt()
      await kazmaKontrol(cevap)

      // 3 elmas olunca hemen elmas kazma yaptır: hem hızlı kazar hem kolay kırılmaz
      if (!a.varMi('diamond_pickaxe') && a.say('diamond') >= 3) {
        cevap('3 elmasım oldu, önce elmas kazma yaptıralım.')
        await yardimla(['diamond_pickaxe'], [['diamond', 3]], cevap)
        continue
      }

      // demir kazma kırılırsa diye yanımızda biraz demir olsun
      const aranan = ELMAS_CEVHER.slice()
      if (!a.varMi('diamond_pickaxe') && yedekDemir() < 3) aranan.push(...DEMIR_CEVHER)
      let kazdi = false
      try {
        kazdi = await a.bulVeKaz(aranan, 32, { aletYokFirlat: true })
      } catch (e) {
        if (e instanceof AletYok) continue // kazma kırıldı: döngü başında yenisi ayarlanır
        throw e
      }
      if (kazdi) {
        bos = 0
      } else {
        if (++bos > 80) throw new Error(`yeterli elmas bulamadım (${a.say('diamond')}/${elmasIhtiyac()})`)
        // aynı seviyede yeni bir yöne tünel kaz; yukarı çıktıysak tekrar in
        if (bot.entity.position.y > ELMAS_Y + 8) await derineIn(cevap)
        else await a.kesfet(true)
      }

      if (a.say('diamond') > sonElmas) {
        sonElmas = a.say('diamond')
        cevap(`Elmas buldum! ${sonElmas}/${elmasIhtiyac()}`)
        sonRapor = Date.now()
      } else if (Date.now() - sonRapor > 180000) {
        cevap(`Hâlâ elmas arıyorum: ${a.say('diamond')}/${elmasIhtiyac()}`)
        sonRapor = Date.now()
      }
    }
  }

  async function elmasSetYaptir(cevap) {
    const eksik = eksikElmas()
    if (!eksik.length) return
    let elmas = a.say('diamond')
    const yapilacak = []
    for (const [isim, n] of eksik) {
      if (elmas >= n) {
        yapilacak.push(isim)
        elmas -= n
      }
    }
    if (!yapilacak.length) return
    const verilecek = yapilacak.reduce((t, i) => t + ELMAS_ESYALAR.find(([n]) => n === i)[1], 0)
    cevap(`${a.say('diamond')} elmasım hazır!`)
    await yardimla(yapilacak, [['diamond', verilecek]], cevap)
  }

  // ---------------------------------------------------------- ana akış
  async function gelis2(cevap) {
    a.baslat(cevap)
    bot.setControlState('sneak', false)
    // "Gelişim 1 tamam mı?": demir (ya da daha iyi) zırhın 4 parçası ve kılıç üstünde mi
    const demirSetTamam = ['helmet', 'chestplate', 'leggings', 'boots', 'sword']
      .every((p) => a.varMi('iron_' + p) || a.varMi('diamond_' + p))
    if (!demirSetTamam) {
      throw new Error('önce demir seti tamamlamam lazım. !gelis yaz, bitince !gelis2 yazarsın.')
    }
    const geriAl = aletTercihiKur()
    try {
      for (let tur = 1; tur <= 5; tur++) {
        const onceki = eksikElmas().length
        await kazmaKontrol(cevap)
        await elmasAra(cevap)
        await elmasSetYaptir(cevap)
        await a.giyin()
        if (!eksikElmas().length) return
        if (eksikElmas().length === onceki && tur > 1) {
          throw new Error('ilerleyemedim, eksik: ' + eksikElmas().map(([i]) => i).join(', '))
        }
      }
    } finally {
      geriAl()
    }
  }

  return { gelis2 }
}

module.exports = { gelisim2Kur }
